import {
  sequelize,
  Order,
  OrderItem,
  OrderEvent,
  Product,
  InventoryLog,
} from '../models/index.js';
import { createRefund } from './stripe.service.js';
import AppError from '../utils/AppError.js';

const RESTOCK_STATUSES = new Set(['cancelled', 'refunded']);

/**
 * Restock items and mark an order refunded.
 * Optionally issues a Stripe refund first when the order was paid by card.
 */
export const applyOrderRefund = async ({
  orderId,
  adminId = null,
  note = 'Order refunded',
  stripeReason = 'requested_by_customer',
  skipStripe = false,
}) => {
  return sequelize.transaction(async (transaction) => {
    const found = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: 'items' }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!found) throw new AppError('Order not found', 404);

    if (found.status === 'refunded') {
      throw new AppError('This order has already been refunded', 409);
    }

    if (!['shipped', 'delivered'].includes(found.status)) {
      throw new AppError('Only shipped or delivered orders can be refunded', 409);
    }

    let stripeRefundId = found.stripeRefundId || null;

    if (
      !skipStripe &&
      found.paymentMethod === 'card' &&
      found.paymentStatus === 'paid' &&
      found.paymentIntentId
    ) {
      const refund = await createRefund({
        paymentIntentId: found.paymentIntentId,
        reason: stripeReason,
      });
      stripeRefundId = refund.id;
    }

    if (RESTOCK_STATUSES.has('refunded')) {
      for (const item of found.items) {
        if (!item.productId) continue;
        const product = await Product.findByPk(item.productId, { transaction });
        if (!product) continue;

        const stockAfter = product.stock + item.quantity;
        await product.update(
          { stock: stockAfter, soldCount: Math.max(0, product.soldCount - item.quantity) },
          { transaction }
        );

        await InventoryLog.create(
          {
            productId: product.id,
            type: 'return',
            quantityChange: item.quantity,
            stockAfter,
            reference: found.orderNumber,
            note: note || 'Order refunded',
            adminId,
          },
          { transaction }
        );
      }
    }

    await found.update(
      {
        status: 'refunded',
        paymentStatus: 'refunded',
        stripeRefundId,
        refundedAt: new Date(),
      },
      { transaction }
    );

    await OrderEvent.create(
      {
        orderId: found.id,
        status: 'refunded',
        note,
        createdById: adminId,
      },
      { transaction }
    );

    return found;
  });
};
