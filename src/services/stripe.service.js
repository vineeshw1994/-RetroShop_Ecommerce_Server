import Stripe from 'stripe';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';

let client = null;

export const getStripe = () => {
  if (!config.stripe.secretKey) return null;
  if (!client) client = new Stripe(config.stripe.secretKey);
  return client;
};

export const createPaymentIntent = async (order) => {
  const stripe = getStripe();
  if (!stripe) {
    throw new AppError('Card payments are not configured yet', 503);
  }

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(Number(order.total) * 100),
    currency: (order.currency || 'gbp').toLowerCase(),
    metadata: {
      orderId: String(order.id),
      orderNumber: order.orderNumber,
    },
    automatic_payment_methods: { enabled: true },
  });

  return intent;
};

export const retrievePaymentIntent = async (id) => {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Card payments are not configured yet', 503);
  return stripe.paymentIntents.retrieve(id);
};

export const createRefund = async ({ paymentIntentId, amount, reason }) => {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Card payments are not configured yet', 503);

  const params = { payment_intent: paymentIntentId };
  if (amount) params.amount = Math.round(Number(amount) * 100);
  if (reason) params.reason = reason;

  return stripe.refunds.create(params);
};

/** List Stripe balance transactions (charges, refunds, fees) for the admin dashboard. */
export const listBalanceTransactions = async ({
  limit = 25,
  startingAfter,
  endingBefore,
  dateFrom,
  dateTo,
} = {}) => {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Stripe is not configured yet', 503);

  const params = {
    limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
    expand: ['data.source'],
  };

  if (startingAfter) params.starting_after = startingAfter;
  if (endingBefore) params.ending_before = endingBefore;

  if (dateFrom || dateTo) {
    params.created = {};
    if (dateFrom) params.created.gte = Math.floor(new Date(dateFrom).getTime() / 1000);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      params.created.lte = Math.floor(end.getTime() / 1000);
    }
  }

  return stripe.balanceTransactions.list(params);
};

export const retrieveRefund = async (refundId) => {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Stripe is not configured yet', 503);
  return stripe.refunds.retrieve(refundId);
};
