import bcrypt from 'bcryptjs';
import { fn, col, Op } from 'sequelize';
import {
  User,
  Address,
  WishlistItem,
  GameRequest,
  Product,
  ProductImage,
  Order,
  Review,
  OrderItem,
} from '../models/index.js';
import { serializeUser, serializeProduct } from '../helpers/serializers.js';
import { revokeAllForActor } from '../helpers/token.js';
import { getPagination, buildMeta } from '../utils/pagination.js';
import { toPublicUrl, removeUpload } from '../middleware/upload.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const SALT_ROUNDS = 12;

export const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, marketingOptIn } = req.body;
  const user = await User.findByPk(req.user.id);

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (phone !== undefined) user.phone = phone;
  if (marketingOptIn !== undefined) user.marketingOptIn = Boolean(marketingOptIn);

  await user.save();

  res.json({
    success: true,
    message: 'Profile updated',
    data: { user: serializeUser(user) },
  });
});

export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Please choose an image', 400);

  const user = await User.findByPk(req.user.id);
  const previous = user.avatar;

  user.avatar = toPublicUrl(req.file);
  await user.save();

  removeUpload(previous);

  res.json({
    success: true,
    message: 'Photo updated',
    data: { user: serializeUser(user) },
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.scope('withPassword').findByPk(req.user.id);

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError('Your current password is incorrect', 400, [
      { field: 'currentPassword', message: 'Incorrect password' },
    ]);
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  await revokeAllForActor('customer', user.id);

  res.json({
    success: true,
    message: 'Password changed. Other devices have been signed out.',
  });
});

/** Counters for the account overview cards. */
export const getOverview = asyncHandler(async (req, res) => {
  const [orderStats, wishlistCount, requestCount, recentOrders] = await Promise.all([
    Order.findOne({
      where: { userId: req.user.id },
      attributes: [
        [fn('COUNT', col('id')), 'orderCount'],
        [fn('COALESCE', fn('SUM', col('total')), 0), 'lifetimeSpend'],
      ],
      raw: true,
    }),
    WishlistItem.count({ where: { userId: req.user.id } }),
    GameRequest.count({ where: { userId: req.user.id } }),
    Order.findAll({
      where: { userId: req.user.id },
      include: [{ model: OrderItem, as: 'items', attributes: ['name', 'image', 'quantity'] }],
      order: [['createdAt', 'DESC']],
      limit: 4,
    }),
  ]);

  res.json({
    success: true,
    data: {
      orderCount: Number(orderStats?.orderCount) || 0,
      lifetimeSpend: Number(orderStats?.lifetimeSpend) || 0,
      wishlistCount,
      requestCount,
      recentOrders,
    },
  });
});

export const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.findAll({
    where: { userId: req.user.id },
    order: [
      ['isDefault', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  res.json({ success: true, data: addresses });
});

export const createAddress = asyncHandler(async (req, res) => {
  const count = await Address.count({ where: { userId: req.user.id } });
  const isDefault = count === 0 || Boolean(req.body.isDefault);

  if (isDefault) {
    await Address.update({ isDefault: false }, { where: { userId: req.user.id } });
  }

  const address = await Address.create({
    ...req.body,
    isDefault,
    userId: req.user.id,
  });

  res.status(201).json({ success: true, message: 'Address saved', data: address });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOne({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!address) throw new AppError('Address not found', 404);

  if (req.body.isDefault) {
    await Address.update({ isDefault: false }, { where: { userId: req.user.id } });
  }

  await address.update(req.body);

  res.json({ success: true, message: 'Address updated', data: address });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOne({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!address) throw new AppError('Address not found', 404);

  const wasDefault = address.isDefault;
  await address.destroy();

  if (wasDefault) {
    const next = await Address.findOne({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    if (next) await next.update({ isDefault: true });
  }

  res.json({ success: true, message: 'Address removed' });
});

export const listWishlist = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 12);

  const { rows, count } = await WishlistItem.findAndCountAll({
    where: { userId: req.user.id },
    include: [
      {
        model: Product,
        as: 'product',
        include: [{ model: ProductImage, as: 'images', attributes: ['url', 'isPrimary'] }],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    data: rows
      .filter((row) => row.product)
      .map((row) => ({
        id: row.id,
        addedAt: row.createdAt,
        product: serializeProduct(row.product),
      })),
    meta: buildMeta({ count, page, limit }),
  });
});

export const toggleWishlist = asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId || req.params.productId);

  const product = await Product.findByPk(productId);
  if (!product) throw new AppError('Product not found', 404);

  const existing = await WishlistItem.findOne({
    where: { userId: req.user.id, productId },
  });

  if (existing) {
    await existing.destroy();
    return res.json({
      success: true,
      message: 'Removed from your wishlist',
      data: { productId, inWishlist: false },
    });
  }

  await WishlistItem.create({ userId: req.user.id, productId });

  res.status(201).json({
    success: true,
    message: 'Saved to your wishlist',
    data: { productId, inWishlist: true },
  });
});

export const listGameRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 10);

  const where = { userId: req.user.id };
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await GameRequest.findAndCountAll({
    where,
    include: [
      {
        model: Product,
        as: 'linkedProduct',
        attributes: ['id', 'name', 'slug', 'price', 'salePrice'],
      },
    ],
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

export const createGameRequest = asyncHandler(async (req, res) => {
  const open = await GameRequest.count({
    where: { userId: req.user.id, status: ['pending', 'sourcing'] },
  });

  if (open >= 20) {
    throw new AppError('You already have 20 open requests, please wait for an update', 429);
  }

  const request = await GameRequest.create({
    userId: req.user.id,
    title: req.body.title,
    platform: req.body.platform || null,
    conditionPreference: req.body.conditionPreference || 'any',
    maxBudget: req.body.maxBudget ?? null,
    notes: req.body.notes || null,
  });

  res.status(201).json({
    success: true,
    message: 'Request sent. We will let you know as soon as we can source it.',
    data: request,
  });
});

export const deleteGameRequest = asyncHandler(async (req, res) => {
  const request = await GameRequest.findOne({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!request) throw new AppError('Request not found', 404);

  if (!['pending', 'sourcing'].includes(request.status)) {
    throw new AppError('This request has already been handled', 409);
  }

  await request.destroy();

  res.json({ success: true, message: 'Request withdrawn' });
});

/** Only customers who actually bought the item may review it. */
export const createReview = asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId);
  const rating = Number(req.body.rating);

  const product = await Product.findByPk(productId);
  if (!product) throw new AppError('Product not found', 404);

  const purchased = await OrderItem.findOne({
    where: { productId },
    include: [
      {
        model: Order,
        as: 'order',
        where: {
          userId: req.user.id,
          status: { [Op.notIn]: ['cancelled', 'refunded', 'pending'] },
        },
        attributes: ['id'],
      },
    ],
  });

  if (!purchased) {
    throw new AppError('You can only review items you have bought', 403);
  }

  const existing = await Review.findOne({ where: { productId, userId: req.user.id } });
  if (existing) throw new AppError('You have already reviewed this item', 409);

  const review = await Review.create({
    productId,
    userId: req.user.id,
    rating,
    title: req.body.title || null,
    body: req.body.body || null,
  });

  const stats = await Review.findOne({
    where: { productId, isApproved: true },
    attributes: [
      [fn('AVG', col('rating')), 'average'],
      [fn('COUNT', col('id')), 'count'],
    ],
    raw: true,
  });

  await product.update({
    ratingAverage: Math.round((Number(stats.average) || 0) * 10) / 10,
    ratingCount: Number(stats.count) || 0,
  });

  res.status(201).json({ success: true, message: 'Thanks for your review', data: review });
});
