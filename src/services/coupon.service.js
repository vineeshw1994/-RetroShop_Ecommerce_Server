import { Op } from 'sequelize';
import { Coupon } from '../models/index.js';
import AppError from '../utils/AppError.js';

const round = (value) => Math.round(value * 100) / 100;

const isLive = (coupon, now = new Date()) => {
  if (!coupon.isActive) return false;
  if (coupon.startsAt && coupon.startsAt > now) return false;
  if (coupon.endsAt && coupon.endsAt < now) return false;
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return false;
  return true;
};

const eligibleLines = (coupon, lines) => {
  if (coupon.scope === 'all') return lines;

  if (coupon.scope === 'categories') {
    const ids = new Set((coupon.categoryIds || []).map(Number));
    return lines.filter((line) => ids.has(Number(line.categoryId)));
  }

  const ids = new Set((coupon.productIds || []).map(Number));
  return lines.filter((line) => ids.has(Number(line.productId)));
};

export const quoteCoupon = async (code, lines) => {
  const coupon = await Coupon.findOne({
    where: { code: String(code || '').trim().toUpperCase() },
  });

  if (!coupon || !isLive(coupon)) {
    throw new AppError('That coupon is not valid', 400);
  }

  const matching = eligibleLines(coupon, lines);
  const eligibleSubtotal = round(matching.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0));

  if (!matching.length) {
    throw new AppError('This coupon does not apply to the items in your basket', 400);
  }

  if (eligibleSubtotal < Number(coupon.minOrder || 0)) {
    throw new AppError(
      `Spend £${Number(coupon.minOrder).toFixed(2)} on eligible items to use this coupon`,
      400
    );
  }

  const discount =
    coupon.type === 'percent'
      ? round((eligibleSubtotal * Number(coupon.value)) / 100)
      : round(Math.min(Number(coupon.value), eligibleSubtotal));

  return {
    coupon,
    discount,
    eligibleSubtotal,
    code: coupon.code,
    type: coupon.type,
    value: Number(coupon.value),
  };
};

export const findLiveCoupon = (code) =>
  Coupon.findOne({
    where: {
      code: String(code || '').trim().toUpperCase(),
      isActive: true,
      [Op.or]: [{ startsAt: null }, { startsAt: { [Op.lte]: new Date() } }],
    },
  });
