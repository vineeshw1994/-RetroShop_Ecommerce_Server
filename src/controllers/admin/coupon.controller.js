import { Op } from 'sequelize';
import { Coupon } from '../../models/index.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const ids = (value) => {
  if (!value) return [];
  const source = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(source.map(Number).filter((entry) => Number.isInteger(entry) && entry > 0))];
};

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === true || value === 'true';
};

const payloadFrom = (body) => {
  const scope = body.scope || 'all';
  return {
    code: String(body.code || '').trim().toUpperCase(),
    description: body.description || null,
    type: body.type || 'percent',
    value: Number(body.value) || 0,
    minOrder: Number(body.minOrder) || 0,
    maxUses: body.maxUses === '' || body.maxUses == null ? null : Number(body.maxUses),
    scope,
    categoryIds: scope === 'categories' ? ids(body.categoryIds) : [],
    productIds: scope === 'products' ? ids(body.productIds) : [],
    isActive: bool(body.isActive, true),
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
  };
};

export const listCoupons = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 20);
  const where = {};

  if (req.query.search) where.code = { [Op.like]: `%${req.query.search.trim()}%` };
  if (req.query.status === 'active') where.isActive = true;
  if (req.query.status === 'inactive') where.isActive = false;
  if (req.query.scope) where.scope = req.query.scope;

  const { rows, count } = await Coupon.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  res.json({ success: true, data: rows, meta: buildMeta({ count, page, limit }) });
});

export const getCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  res.json({ success: true, data: coupon });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const payload = payloadFrom(req.body);
  if (!payload.code) throw new AppError('A coupon code is required', 422);

  const existing = await Coupon.findOne({ where: { code: payload.code } });
  if (existing) throw new AppError('That coupon code is already in use', 409);

  const coupon = await Coupon.create(payload);
  res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.id);
  if (!coupon) throw new AppError('Coupon not found', 404);

  const payload = payloadFrom({ ...coupon.toJSON(), ...req.body });
  if (payload.code && payload.code !== coupon.code) {
    const clash = await Coupon.findOne({ where: { code: payload.code } });
    if (clash) throw new AppError('That coupon code is already in use', 409);
  }

  await coupon.update(payload);
  res.json({ success: true, message: 'Coupon updated', data: coupon });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  await coupon.destroy();
  res.json({ success: true, message: 'Coupon deleted' });
});
