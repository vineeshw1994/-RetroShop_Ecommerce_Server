import crypto from 'crypto';
import { Op } from 'sequelize';
import {
  sequelize,
  Order,
  OrderItem,
  OrderEvent,
  CartItem,
  Product,
  ProductImage,
  InventoryLog,
  Address,
  Coupon,
  ReturnRequest,
} from '../models/index.js';
import config from '../config/index.js';
import { getPagination, buildMeta } from '../utils/pagination.js';
import { sendOrderConfirmationEmail } from '../services/email.service.js';
import { quoteCoupon } from '../services/coupon.service.js';
import { createPaymentIntent, retrievePaymentIntent } from '../services/stripe.service.js';
import { getReturnEligibility } from '../services/settings.service.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const round = (value) => Math.round(value * 100) / 100;

const generateOrderNumber = () =>
  `RS-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const orderInclude = [
  {
    model: OrderItem,
    as: 'items',
    include: [
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'slug', 'isActive', 'cardImage'],
        include: [{ model: ProductImage, as: 'images', attributes: ['url', 'isPrimary'] }],
      },
    ],
  },
  {
    model: OrderEvent,
    as: 'events',
    attributes: ['id', 'status', 'note', 'createdAt'],
  },
];

/**
 * Turn the signed-in user's basket into an order.
 * Runs in a transaction with row locks so two concurrent checkouts cannot
 * oversell the last copy of a game.
 */
export const checkout = asyncHandler(async (req, res) => {
  const { paymentMethod = 'card', customerNote, addressId, shippingAddress, couponCode } = req.body;

  const order = await sequelize.transaction(async (transaction) => {
    const cartItems = await CartItem.findAll({
      where: { userId: req.user.id },
      include: [{ model: Product, as: 'product' }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!cartItems.length) throw new AppError('Your basket is empty', 400);

    let address = shippingAddress;

    if (addressId) {
      const saved = await Address.findOne({
        where: { id: addressId, userId: req.user.id },
        transaction,
      });
      if (!saved) throw new AppError('Delivery address not found', 404);
      address = {
        fullName: saved.fullName,
        phone: saved.phone,
        line1: saved.line1,
        line2: saved.line2,
        city: saved.city,
        state: saved.state,
        postcode: saved.postcode,
        country: saved.country,
      };
    }

    if (!address?.line1 || !address?.city || !address?.postcode) {
      throw new AppError('A complete delivery address is required', 422);
    }

    const lines = [];
    let subtotal = 0;

    for (const item of cartItems) {
      const product = item.product;

      if (!product || !product.isActive) {
        throw new AppError(
          `"${product?.name || 'An item'}" is no longer available, please remove it from your basket`,
          409
        );
      }

      if (product.stock < item.quantity) {
        throw new AppError(
          `Only ${product.stock} left of "${product.name}", please update your basket`,
          409
        );
      }

      const unitPrice = product.salePrice && product.salePrice > 0 ? product.salePrice : product.price;
      const lineTotal = round(unitPrice * item.quantity);
      subtotal = round(subtotal + lineTotal);

      const primaryImage = await ProductImage.findOne({
        where: { productId: product.id },
        order: [
          ['isPrimary', 'DESC'],
          ['sortOrder', 'ASC'],
        ],
        transaction,
      });

      lines.push({
        product,
        payload: {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          image: primaryImage?.url || product.cardImage || null,
          condition: product.condition,
          unitPrice,
          quantity: item.quantity,
          lineTotal,
        },
      });
    }

    const shippingFee = 0;

    let discount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const quote = await quoteCoupon(
        couponCode,
        lines.map((line) => ({
          productId: line.product.id,
          categoryId: line.product.categoryId,
          lineTotal: line.payload.lineTotal,
        }))
      );
      discount = quote.discount;
      appliedCoupon = quote.coupon;
    }

    const total = round(Math.max(0, subtotal + shippingFee - discount));
    const itemCount = lines.reduce((sum, line) => sum + line.payload.quantity, 0);
    const isCard = paymentMethod === 'card';

    const created = await Order.create(
      {
        orderNumber: generateOrderNumber(),
        userId: req.user.id,
        status: isCard ? 'pending' : 'confirmed',
        paymentStatus: isCard || paymentMethod === 'cash_on_delivery' ? 'unpaid' : 'paid',
        paymentMethod,
        itemCount,
        subtotal,
        shippingFee: round(shippingFee),
        discount,
        total,
        couponCode: appliedCoupon?.code || null,
        shippingAddress: address,
        customerNote: customerNote || null,
        placedAt: new Date(),
        paidAt: isCard || paymentMethod === 'cash_on_delivery' ? null : new Date(),
      },
      { transaction }
    );

    for (const line of lines) {
      await OrderItem.create({ ...line.payload, orderId: created.id }, { transaction });

      const stockAfter = line.product.stock - line.payload.quantity;
      await line.product.update(
        {
          stock: stockAfter,
          soldCount: line.product.soldCount + line.payload.quantity,
        },
        { transaction }
      );

      await InventoryLog.create(
        {
          productId: line.product.id,
          type: 'sale',
          quantityChange: -line.payload.quantity,
          stockAfter,
          reference: created.orderNumber,
          note: 'Customer checkout',
        },
        { transaction }
      );
    }

    await OrderEvent.create(
      {
        orderId: created.id,
        status: isCard ? 'pending' : 'confirmed',
        note: isCard ? 'Order placed, waiting for card payment' : 'Order placed',
      },
      { transaction }
    );

    await CartItem.destroy({ where: { userId: req.user.id }, transaction });

    if (appliedCoupon && !isCard) {
      await appliedCoupon.increment('usedCount', { transaction });
    }

    return { created, appliedCoupon };
  });

  const full = await Order.findByPk(order.created.id, { include: orderInclude });

  let clientSecret = null;
  if (paymentMethod === 'card') {
    const intent = await createPaymentIntent(full);
    await full.update({ paymentIntentId: intent.id });
    clientSecret = intent.client_secret;
  } else {
    await sendOrderConfirmationEmail(req.user.email, full);
  }

  res.status(201).json({
    success: true,
    message: `Order ${full.orderNumber} placed`,
    data: full,
    meta: { clientSecret },
  });
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 10);

  const where = { userId: req.user.id };
  if (req.query.status) where.status = req.query.status;

  if (req.query.search) {
    where.orderNumber = { [Op.like]: `%${req.query.search.trim()}%` };
  }

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [{ model: OrderItem, as: 'items' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    data: rows,
    meta: buildMeta({ count, page, limit }),
  });
});

export const getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    where: { orderNumber: req.params.orderNumber, userId: req.user.id },
    include: orderInclude,
    order: [[{ model: OrderEvent, as: 'events' }, 'createdAt', 'ASC']],
  });

  if (!order) throw new AppError('Order not found', 404);

  const plain = order.toJSON();
  if (plain.items?.length) {
    const missingIds = [
      ...new Set(
        plain.items.filter((item) => !item.image && item.productId).map((item) => item.productId)
      ),
    ];

    if (missingIds.length) {
      const products = await Product.findAll({
        where: { id: missingIds },
        attributes: ['id', 'cardImage'],
        include: [
          {
            model: ProductImage,
            as: 'images',
            attributes: ['url', 'isPrimary', 'sortOrder'],
            separate: true,
            order: [
              ['isPrimary', 'DESC'],
              ['sortOrder', 'ASC'],
            ],
            limit: 1,
          },
        ],
      });

      const imageByProductId = new Map(
        products.map((product) => {
          const images = product.images || [];
          const primary = images.find((image) => image.isPrimary) || images[0];
          return [product.id, product.cardImage || primary?.url || null];
        })
      );

      plain.items = plain.items.map((item) => ({
        ...item,
        image: item.image || imageByProductId.get(item.productId) || null,
      }));
    }
  }

  res.json({ success: true, data: plain, meta: await buildOrderReturnMeta(order) });
});

const buildOrderReturnMeta = async (order) => {
  const eligibility = await getReturnEligibility(order);
  const returnRequest = await ReturnRequest.findOne({
    where: { orderId: order.id, userId: order.userId },
    order: [['createdAt', 'DESC']],
    attributes: ['id', 'status', 'reason', 'adminNote', 'createdAt', 'respondedAt'],
  });

  return {
    return: {
      ...eligibility,
      canRequest:
        eligibility.eligible &&
        (!returnRequest || returnRequest.status === 'rejected'),
      request: returnRequest,
    },
  };
};

export const requestReturn = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 10) {
    throw new AppError('Please tell us why you want to return this order (at least 10 characters)', 400);
  }

  const order = await Order.findOne({
    where: { orderNumber: req.params.orderNumber, userId: req.user.id },
  });

  if (!order) throw new AppError('Order not found', 404);

  const eligibility = await getReturnEligibility(order);
  if (!eligibility.eligible) {
    throw new AppError('This order is no longer eligible for a return', 409);
  }

  const existing = await ReturnRequest.findOne({
    where: {
      orderId: order.id,
      userId: req.user.id,
      status: { [Op.in]: ['pending', 'approved'] },
    },
  });

  if (existing) {
    throw new AppError('You already have an open return request for this order', 409);
  }

  const request = await ReturnRequest.create({
    orderId: order.id,
    userId: req.user.id,
    reason,
  });

  res.status(201).json({
    success: true,
    message: 'Return request submitted — we will email you with next steps',
    data: request,
    meta: await buildOrderReturnMeta(order),
  });
});

/** Customers may cancel only while the order has not been packed. */
export const cancelMyOrder = asyncHandler(async (req, res) => {
  const cancellable = ['pending', 'confirmed', 'processing'];

  const order = await sequelize.transaction(async (transaction) => {
    const found = await Order.findOne({
      where: { orderNumber: req.params.orderNumber, userId: req.user.id },
      include: [{ model: OrderItem, as: 'items' }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!found) throw new AppError('Order not found', 404);

    if (!cancellable.includes(found.status)) {
      throw new AppError(
        `This order is already ${found.status} and can no longer be cancelled`,
        409
      );
    }

    for (const item of found.items) {
      if (!item.productId) continue;
      const product = await Product.findByPk(item.productId, { transaction });
      if (!product) continue;

      const stockAfter = product.stock + item.quantity;
      await product.update(
        {
          stock: stockAfter,
          soldCount: Math.max(0, product.soldCount - item.quantity),
        },
        { transaction }
      );

      await InventoryLog.create(
        {
          productId: product.id,
          type: 'cancellation',
          quantityChange: item.quantity,
          stockAfter,
          reference: found.orderNumber,
          note: 'Cancelled by customer',
        },
        { transaction }
      );
    }

    await found.update(
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        paymentStatus: found.paymentStatus === 'paid' ? 'refunded' : found.paymentStatus,
      },
      { transaction }
    );

    await OrderEvent.create(
      {
        orderId: found.id,
        status: 'cancelled',
        note: req.body.reason
          ? `Cancelled by customer: ${req.body.reason}`
          : 'Cancelled by customer',
      },
      { transaction }
    );

    return found;
  });

  const full = await Order.findByPk(order.id, { include: orderInclude });

  res.json({ success: true, message: 'Order cancelled', data: full });
});

export const confirmCardPayment = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    where: { orderNumber: req.params.orderNumber, userId: req.user.id },
    include: orderInclude,
  });

  if (!order) throw new AppError('Order not found', 404);
  if (order.paymentMethod !== 'card') throw new AppError('This order is not a card payment', 400);

  if (order.paymentStatus === 'paid') {
    return res.json({ success: true, message: 'Already paid', data: order });
  }

  if (!order.paymentIntentId) throw new AppError('Missing payment session', 409);

  const intent = await retrievePaymentIntent(order.paymentIntentId);
  if (intent.status !== 'succeeded') {
    throw new AppError('Payment has not completed yet', 409);
  }

  await order.update({
    paymentStatus: 'paid',
    status: 'confirmed',
    paidAt: new Date(),
  });

  await OrderEvent.create({
    orderId: order.id,
    status: 'confirmed',
    note: 'Card payment received',
  });

  if (order.couponCode) {
    const coupon = await Coupon.findOne({ where: { code: order.couponCode } });
    if (coupon) await coupon.increment('usedCount');
  }

  const full = await Order.findByPk(order.id, { include: orderInclude });
  await sendOrderConfirmationEmail(req.user.email, full);

  res.json({ success: true, message: 'Payment confirmed', data: full });
});
