import StoreSetting from '../models/StoreSetting.js';
import AppError from '../utils/AppError.js';

const DEFAULTS = {
  returnDays: 14,
};

export const getStoreSettings = async () => {
  const rows = await StoreSetting.findAll();
  const settings = { ...DEFAULTS };

  rows.forEach((row) => {
    settings[row.key] = row.value;
  });

  settings.returnDays = Number(settings.returnDays) || DEFAULTS.returnDays;

  return settings;
};

export const getReturnDays = async () => {
  const settings = await getStoreSettings();
  return settings.returnDays;
};

export const updateStoreSettings = async (updates = {}) => {
  if (updates.returnDays !== undefined) {
    const days = Number(updates.returnDays);

    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw new AppError('Return days must be a whole number between 0 and 365', 400);
    }

    await StoreSetting.upsert({ key: 'returnDays', value: days });
  }

  return getStoreSettings();
};

/** Whether a delivered order is still inside the configured return window. */
export const getReturnEligibility = async (order) => {
  const returnDays = await getReturnDays();

  if (returnDays <= 0) {
    return { eligible: false, returnDays, daysRemaining: 0, deadline: null };
  }

  if (order.status !== 'delivered' || !order.deliveredAt) {
    return { eligible: false, returnDays, daysRemaining: 0, deadline: null };
  }

  const deliveredAt = new Date(order.deliveredAt);
  const deadline = new Date(deliveredAt);
  deadline.setDate(deadline.getDate() + returnDays);

  const now = Date.now();
  const eligible = now <= deadline.getTime();
  const daysRemaining = eligible
    ? Math.max(0, Math.ceil((deadline.getTime() - now) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    eligible,
    returnDays,
    daysRemaining,
    deadline: deadline.toISOString(),
  };
};
