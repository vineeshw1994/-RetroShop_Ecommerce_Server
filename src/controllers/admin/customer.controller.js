import { Op, fn, col, literal } from 'sequelize';
import {
  User,
  Order,
  OrderItem,
  Address,
  WishlistItem,
  GameRequest,
  Product,
} from '../../models/index.js';
import { serializeUser } from '../../helpers/serializers.js';
import { revokeAllForActor } from '../../helpers/token.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendTable } from '../../utils/spreadsheet.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 15);
  const where = {};

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [
      { firstName: { [Op.like]: term } },
      { lastName: { [Op.like]: term } },
      { email: { [Op.like]: term } },
      { phone: { [Op.like]: term } },
    ];
  }

  if (req.query.status === 'active') where.isActive = true;
  if (req.query.status === 'suspended') where.isActive = false;
  if (req.query.verified === 'true') where.isVerified = true;
  if (req.query.verified === 'false') where.isVerified = false;
  if (req.query.marketing === 'true') where.marketingOptIn = true;

  if (req.query.dateFrom || req.query.dateTo) {
    where.createdAt = {};
    if (req.query.dateFrom) where.createdAt[Op.gte] = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }

  const SORT_MAP = {
    newest: [['createdAt', 'DESC']],
    oldest: [['createdAt', 'ASC']],
    name_asc: [
      ['firstName', 'ASC'],
      ['lastName', 'ASC'],
    ],
    last_login: [['lastLoginAt', 'DESC']],
  };

  const { rows, count } = await User.findAndCountAll({
    where,
    order: SORT_MAP[req.query.sort] || SORT_MAP.newest,
    limit,
    offset,
  });

  // One grouped query for spend, rather than N per-row lookups.
  const ids = rows.map((row) => row.id);
  const spendRows = ids.length
    ? await Order.findAll({
        where: { userId: ids, status: { [Op.notIn]: ['cancelled', 'refunded'] } },
        attributes: [
          'userId',
          [fn('COUNT', col('id')), 'orderCount'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'totalSpend'],
          [fn('MAX', col('createdAt')), 'lastOrderAt'],
        ],
        group: ['userId'],
        raw: true,
      })
    : [];

  const spendMap = new Map(spendRows.map((row) => [row.userId, row]));

  const summary = await User.findOne({
    attributes: [
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', literal('CASE WHEN isActive = 1 THEN 1 ELSE 0 END')), 'active'],
      [fn('SUM', literal('CASE WHEN isVerified = 1 THEN 1 ELSE 0 END')), 'verified'],
      [fn('SUM', literal('CASE WHEN marketingOptIn = 1 THEN 1 ELSE 0 END')), 'subscribed'],
    ],
    raw: true,
  });

  res.json({
    success: true,
    data: rows.map((row) => {
      const spend = spendMap.get(row.id);
      return {
        ...serializeUser(row),
        orderCount: Number(spend?.orderCount) || 0,
        totalSpend: Number(spend?.totalSpend) || 0,
        lastOrderAt: spend?.lastOrderAt || null,
      };
    }),
    meta: buildMeta({ count, page, limit }),
    summary: {
      total: Number(summary.total) || 0,
      active: Number(summary.active) || 0,
      verified: Number(summary.verified) || 0,
      subscribed: Number(summary.subscribed) || 0,
    },
  });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await User.findByPk(req.params.id, {
    include: [{ model: Address, as: 'addresses' }],
  });

  if (!customer) throw new AppError('Customer not found', 404);

  const [orders, stats, wishlist, requests] = await Promise.all([
    Order.findAll({
      where: { userId: customer.id },
      include: [{ model: OrderItem, as: 'items', attributes: ['name', 'quantity', 'image'] }],
      order: [['createdAt', 'DESC']],
      limit: 20,
    }),
    Order.findOne({
      where: { userId: customer.id, status: { [Op.notIn]: ['cancelled', 'refunded'] } },
      attributes: [
        [fn('COUNT', col('id')), 'orderCount'],
        [fn('COALESCE', fn('SUM', col('total')), 0), 'totalSpend'],
        [fn('COALESCE', fn('AVG', col('total')), 0), 'averageOrderValue'],
      ],
      raw: true,
    }),
    WishlistItem.findAll({
      where: { userId: customer.id },
      include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'slug', 'price'] }],
      limit: 20,
    }),
    GameRequest.findAll({
      where: { userId: customer.id },
      order: [['createdAt', 'DESC']],
      limit: 20,
    }),
  ]);

  res.json({
    success: true,
    data: {
      customer: { ...serializeUser(customer), addresses: customer.addresses },
      stats: {
        orderCount: Number(stats?.orderCount) || 0,
        totalSpend: Number(stats?.totalSpend) || 0,
        averageOrderValue: Math.round((Number(stats?.averageOrderValue) || 0) * 100) / 100,
      },
      orders,
      wishlist,
      gameRequests: requests,
    },
  });
});

/** Suspend or restore a customer. Suspending also kills their sessions. */
export const setCustomerStatus = asyncHandler(async (req, res) => {
  const customer = await User.findByPk(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);

  const isActive = req.body.isActive === true || req.body.isActive === 'true';

  await customer.update({ isActive });

  if (!isActive) await revokeAllForActor('customer', customer.id);

  res.json({
    success: true,
    message: isActive
      ? `${customer.firstName}'s account has been restored`
      : `${customer.firstName}'s account has been suspended`,
    data: serializeUser(customer),
  });
});

export const exportCustomers = asyncHandler(async (req, res) => {
  const customers = await User.findAll({
    order: [['createdAt', 'DESC']],
    limit: 5000,
  });

  await sendTable(res, {
    filename: 'customers',
    sheetName: 'Customers',
    format: req.query.format === 'xlsx' ? 'xlsx' : 'csv',
    headers: ['First name', 'Last name', 'Email', 'Phone', 'Verified', 'Active', 'Joined'],
    rows: customers.map((customer) => [
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.phone,
      customer.isVerified ? 'yes' : 'no',
      customer.isActive ? 'yes' : 'no',
      customer.createdAt.toISOString(),
    ]),
  });
});
