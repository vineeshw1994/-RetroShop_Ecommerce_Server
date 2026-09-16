import { Op } from 'sequelize';
import { Order, User } from '../../models/index.js';
import { listBalanceTransactions } from '../../services/stripe.service.js';
import { applyOrderRefund } from '../../services/orderRefund.service.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const customerInclude = {
  model: User,
  as: 'customer',
  attributes: ['id', 'firstName', 'lastName', 'email'],
};

const extractPaymentIntentId = (source) => {
  if (!source || typeof source !== 'object') return null;
  if (source.object === 'payment_intent') return source.id;
  if (source.payment_intent) {
    return typeof source.payment_intent === 'string'
      ? source.payment_intent
      : source.payment_intent.id;
  }
  return null;
};

const serializeTransaction = (tx, orderByPaymentIntent) => {
  const source = tx.source;
  const paymentIntentId = extractPaymentIntentId(source);
  const order = paymentIntentId ? orderByPaymentIntent.get(paymentIntentId) || null : null;

  return {
    id: tx.id,
    amount: tx.amount / 100,
    fee: tx.fee / 100,
    net: tx.net / 100,
    currency: (tx.currency || 'gbp').toUpperCase(),
    type: tx.type,
    status: tx.status,
    description: tx.description,
    chargeId: source?.object === 'charge' ? source.id : null,
    paymentIntentId,
    refundId: source?.object === 'refund' ? source.id : null,
    createdAt: new Date(tx.created * 1000).toISOString(),
    availableOn: tx.available_on ? new Date(tx.available_on * 1000).toISOString() : null,
    order: order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          customer: order.customer
            ? {
                id: order.customer.id,
                firstName: order.customer.firstName,
                lastName: order.customer.lastName,
                email: order.customer.email,
              }
            : null,
        }
      : null,
    refundable:
      Boolean(order) &&
      order.paymentMethod === 'card' &&
      order.paymentStatus === 'paid' &&
      !['refunded', 'cancelled'].includes(order.status) &&
      tx.type === 'charge',
  };
};

export const listTransactions = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 25;

  const stripeResult = await listBalanceTransactions({
    limit,
    startingAfter: req.query.startingAfter || undefined,
    endingBefore: req.query.endingBefore || undefined,
    dateFrom: req.query.dateFrom || undefined,
    dateTo: req.query.dateTo || undefined,
  });

  const paymentIntentIds = stripeResult.data
    .map((tx) => extractPaymentIntentId(tx.source))
    .filter(Boolean);

  const orders = paymentIntentIds.length
    ? await Order.findAll({
        where: { paymentIntentId: { [Op.in]: paymentIntentIds } },
        include: [customerInclude],
      })
    : [];

  const orderByPaymentIntent = new Map(
    orders.map((order) => [order.paymentIntentId, order.toJSON()])
  );

  res.json({
    success: true,
    data: stripeResult.data.map((tx) => serializeTransaction(tx, orderByPaymentIntent)),
    meta: {
      hasMore: stripeResult.has_more,
      nextCursor: stripeResult.has_more ? stripeResult.data.at(-1)?.id : null,
      previousCursor: stripeResult.data[0]?.id || null,
    },
  });
});

export const refundOrderPayment = asyncHandler(async (req, res) => {
  const order = await Order.findByPk(req.params.id, { include: [customerInclude] });
  if (!order) throw new AppError('Order not found', 404);

  if (order.paymentMethod !== 'card') {
    throw new AppError('Only card payments can be refunded through Stripe', 409);
  }

  if (order.paymentStatus !== 'paid') {
    throw new AppError('This order is not in a refundable payment state', 409);
  }

  const updated = await applyOrderRefund({
    orderId: order.id,
    adminId: req.admin.id,
    note: req.body.note || 'Refunded via Stripe from the admin dashboard',
    stripeReason: req.body.reason || 'requested_by_customer',
  });

  const full = await Order.findByPk(updated.id, { include: [customerInclude] });

  res.json({
    success: true,
    message: `Stripe refund issued for ${full.orderNumber}`,
    data: full,
  });
});

export const refundByPaymentIntent = asyncHandler(async (req, res) => {
  const paymentIntentId = String(req.body.paymentIntentId || '').trim();
  if (!paymentIntentId) throw new AppError('paymentIntentId is required', 400);

  const order = await Order.findOne({
    where: { paymentIntentId },
    include: [customerInclude],
  });

  if (!order) {
    throw new AppError('No matching shop order found for this Stripe payment', 404);
  }

  const updated = await applyOrderRefund({
    orderId: order.id,
    adminId: req.admin.id,
    note: req.body.note || 'Refunded via Stripe transactions list',
    stripeReason: req.body.reason || 'requested_by_customer',
  });

  const full = await Order.findByPk(updated.id, { include: [customerInclude] });

  res.json({
    success: true,
    message: `Stripe refund issued for ${full.orderNumber}`,
    data: full,
  });
});
