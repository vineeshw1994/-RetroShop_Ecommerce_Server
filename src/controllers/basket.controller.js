import { CartItem, Product } from '../models/index.js';
import { loadBasket } from '../services/basket.service.js';
import { quoteCoupon } from '../services/coupon.service.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const MAX_PER_LINE = 10;

export const getBasket = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await loadBasket(req.user.id) });
});

export const addToBasket = asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId);
  const requested = Math.max(1, Number(req.body.quantity) || 1);

  const product = await Product.findByPk(productId);
  if (!product || !product.isActive) throw new AppError('Product not found', 404);
  if (product.stock < 1) throw new AppError('This item is out of stock', 409);

  const existing = await CartItem.findOne({ where: { userId: req.user.id, productId } });
  const desired = (existing?.quantity || 0) + requested;
  const quantity = Math.min(desired, product.stock, MAX_PER_LINE);

  if (existing) {
    existing.quantity = quantity;
    await existing.save();
  } else {
    await CartItem.create({ userId: req.user.id, productId, quantity });
  }

  const basket = await loadBasket(req.user.id);

  res.status(201).json({
    success: true,
    message:
      quantity < desired
        ? `Only ${quantity} available, your basket has been updated`
        : `${product.name} added to your basket`,
    data: basket,
  });
});

export const updateBasketItem = asyncHandler(async (req, res) => {
  const quantity = Number(req.body.quantity);

  const item = await CartItem.findOne({
    where: { id: req.params.id, userId: req.user.id },
    include: [{ model: Product, as: 'product' }],
  });

  if (!item) throw new AppError('Basket item not found', 404);

  if (quantity < 1) {
    await item.destroy();
    return res.json({
      success: true,
      message: 'Item removed',
      data: await loadBasket(req.user.id),
    });
  }

  const capped = Math.min(quantity, item.product.stock, MAX_PER_LINE);
  item.quantity = capped;
  await item.save();

  res.json({
    success: true,
    message: capped < quantity ? `Only ${capped} available` : 'Basket updated',
    data: await loadBasket(req.user.id),
  });
});

export const removeBasketItem = asyncHandler(async (req, res) => {
  const deleted = await CartItem.destroy({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!deleted) throw new AppError('Basket item not found', 404);

  res.json({
    success: true,
    message: 'Item removed',
    data: await loadBasket(req.user.id),
  });
});

export const clearBasket = asyncHandler(async (req, res) => {
  await CartItem.destroy({ where: { userId: req.user.id } });
  res.json({
    success: true,
    message: 'Basket cleared',
    data: await loadBasket(req.user.id),
  });
});

/** Merge a guest basket held in localStorage after the user signs in. */
export const mergeBasket = asyncHandler(async (req, res) => {
  const entries = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];

  for (const entry of entries) {
    const productId = Number(entry.productId);
    const quantity = Math.max(1, Number(entry.quantity) || 1);
    if (!productId) continue;

    const product = await Product.findByPk(productId);
    if (!product || !product.isActive || product.stock < 1) continue;

    const existing = await CartItem.findOne({ where: { userId: req.user.id, productId } });
    const capped = Math.min(quantity + (existing?.quantity || 0), product.stock, MAX_PER_LINE);

    if (existing) {
      existing.quantity = capped;
      await existing.save();
    } else {
      await CartItem.create({ userId: req.user.id, productId, quantity: capped });
    }
  }

  res.json({ success: true, data: await loadBasket(req.user.id) });
});

export const applyCoupon = asyncHandler(async (req, res) => {
  const basket = await loadBasket(req.user.id);
  const quote = await quoteCoupon(req.body.code, basket.lines);

  res.json({
    success: true,
    message: `${quote.code} applied`,
    data: {
      ...basket,
      summary: {
        ...basket.summary,
        discount: quote.discount,
        total: Math.max(0, Math.round((basket.summary.subtotal - quote.discount) * 100) / 100),
        couponCode: quote.code,
      },
    },
  });
});
