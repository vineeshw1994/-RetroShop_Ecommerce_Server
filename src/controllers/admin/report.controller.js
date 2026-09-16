import { Op, fn, col, literal } from 'sequelize';
import {
  sequelize,
  Order,
  OrderItem,
  Product,
  ProductImage,
  Category,
  User,
  GameRequest,
  ContactMessage,
  ReturnRequest,
} from '../../models/index.js';
import { sendTable } from '../../utils/spreadsheet.js';
import asyncHandler from '../../utils/asyncHandler.js';

/** Orders that count towards revenue. */
const REVENUE_STATUSES = ['confirmed', 'processing', 'packed', 'shipped', 'delivered'];

const parseRange = (query) => {
  const to = query.dateTo ? new Date(query.dateTo) : new Date();
  to.setHours(23, 59, 59, 999);

  const from = query.dateFrom
    ? new Date(query.dateFrom)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);

  return { from, to };
};

const percentChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const fetchAlertCounts = () =>
  Promise.all([
    Product.count({
      where: { isActive: true, stock: { [Op.lte]: literal('`Product`.`lowStockThreshold`') } },
    }),
    GameRequest.count({ where: { status: ['pending', 'sourcing'] } }),
    ContactMessage.count({ where: { status: 'new' } }),
    ReturnRequest.count({ where: { status: 'pending' } }),
  ]).then(([lowStockCount, pendingRequests, unreadContacts, pendingReturns]) => ({
    lowStockCount,
    pendingRequests,
    unreadContacts,
    pendingReturns,
  }));

/** Lightweight counts for sidebar badges and notification dots. */
export const getAlerts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await fetchAlertCounts() });
});

/** KPI cards, revenue trend, and the activity lists on the dashboard home. */
export const getDashboard = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const spanMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - spanMs);
  const prevTo = new Date(from.getTime() - 1);

  const revenueWhere = (start, end) => ({
    status: { [Op.in]: REVENUE_STATUSES },
    createdAt: { [Op.between]: [start, end] },
  });

  const [current, previous, dailyRows, statusRows, topProducts, topCategories, newCustomers, prevCustomers, alertCounts, recentOrders] =
    await Promise.all([
      Order.findOne({
        where: revenueWhere(from, to),
        attributes: [
          [fn('COUNT', col('id')), 'orderCount'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
          [fn('COALESCE', fn('SUM', col('itemCount')), 0), 'unitsSold'],
          [fn('COALESCE', fn('AVG', col('total')), 0), 'averageOrderValue'],
        ],
        raw: true,
      }),
      Order.findOne({
        where: revenueWhere(prevFrom, prevTo),
        attributes: [
          [fn('COUNT', col('id')), 'orderCount'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
          [fn('COALESCE', fn('AVG', col('total')), 0), 'averageOrderValue'],
        ],
        raw: true,
      }),
      Order.findAll({
        where: revenueWhere(from, to),
        attributes: [
          [fn('DATE', col('createdAt')), 'day'],
          [fn('COUNT', col('id')), 'orders'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
        ],
        group: [fn('DATE', col('createdAt'))],
        order: [[fn('DATE', col('createdAt')), 'ASC']],
        raw: true,
      }),
      Order.findAll({
        where: { createdAt: { [Op.between]: [from, to] } },
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        group: ['status'],
        raw: true,
      }),
      OrderItem.findAll({
        attributes: [
          'productId',
          'name',
          [fn('SUM', col('quantity')), 'units'],
          [fn('SUM', col('lineTotal')), 'revenue'],
        ],
        include: [
          {
            model: Order,
            as: 'order',
            attributes: [],
            where: revenueWhere(from, to),
          },
        ],
        group: ['productId', 'name'],
        order: [[literal('units'), 'DESC']],
        limit: 8,
        raw: true,
      }),
      OrderItem.findAll({
        attributes: [
          [col('product.category.name'), 'category'],
          [fn('SUM', col('OrderItem.quantity')), 'units'],
          [fn('SUM', col('OrderItem.lineTotal')), 'revenue'],
        ],
        include: [
          { model: Order, as: 'order', attributes: [], where: revenueWhere(from, to) },
          {
            model: Product,
            as: 'product',
            attributes: [],
            include: [{ model: Category, as: 'category', attributes: [] }],
          },
        ],
        group: [col('product.category.name')],
        order: [[literal('revenue'), 'DESC']],
        limit: 8,
        raw: true,
      }),
      User.count({ where: { createdAt: { [Op.between]: [from, to] } } }),
      User.count({ where: { createdAt: { [Op.between]: [prevFrom, prevTo] } } }),
      fetchAlertCounts(),
      Order.findAll({
        include: [
          { model: User, as: 'customer', attributes: ['firstName', 'lastName', 'email'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 8,
      }),
    ]);

  // Fill gaps so the chart has a point for every day in the range.
  const byDay = new Map(
    dailyRows.map((row) => [
      String(row.day),
      { orders: Number(row.orders), revenue: round(row.revenue) },
    ])
  );
  const trend = [];
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    trend.push({ date: key, orders: entry?.orders || 0, revenue: entry?.revenue || 0 });
  }

  const revenue = round(current?.revenue);
  const prevRevenue = round(previous?.revenue);
  const orderCount = Number(current?.orderCount) || 0;
  const prevOrderCount = Number(previous?.orderCount) || 0;

  res.json({
    success: true,
    data: {
      range: { from, to },
      kpis: {
        revenue: { value: revenue, change: percentChange(revenue, prevRevenue) },
        orders: { value: orderCount, change: percentChange(orderCount, prevOrderCount) },
        averageOrderValue: {
          value: round(current?.averageOrderValue),
          change: percentChange(
            round(current?.averageOrderValue),
            round(previous?.averageOrderValue)
          ),
        },
        newCustomers: {
          value: newCustomers,
          change: percentChange(newCustomers, prevCustomers),
        },
        unitsSold: { value: Number(current?.unitsSold) || 0, change: 0 },
      },
      trend,
      ordersByStatus: statusRows.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      topProducts: topProducts.map((row) => ({
        productId: row.productId,
        name: row.name,
        units: Number(row.units),
        revenue: round(row.revenue),
      })),
      topCategories: topCategories
        .filter((row) => row.category)
        .map((row) => ({
          category: row.category,
          units: Number(row.units),
          revenue: round(row.revenue),
        })),
      alerts: alertCounts,
      recentOrders,
    },
  });
});

/** Revenue grouped by day, week or month for the reports page. */
export const getSalesReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy)
    ? req.query.groupBy
    : 'day';

  const formats = {
    day: '%Y-%m-%d',
    week: '%x-W%v',
    month: '%Y-%m',
  };

  const bucket = fn('DATE_FORMAT', col('createdAt'), formats[groupBy]);

  const rows = await Order.findAll({
    where: {
      status: { [Op.in]: REVENUE_STATUSES },
      createdAt: { [Op.between]: [from, to] },
    },
    attributes: [
      [bucket, 'period'],
      [fn('COUNT', col('id')), 'orders'],
      [fn('COALESCE', fn('SUM', col('subtotal')), 0), 'subtotal'],
      [fn('COALESCE', fn('SUM', col('shippingFee')), 0), 'shipping'],
      [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
      [fn('COALESCE', fn('SUM', col('itemCount')), 0), 'units'],
    ],
    group: [bucket],
    order: [[bucket, 'ASC']],
    raw: true,
  });

  const paymentRows = await Order.findAll({
    where: {
      status: { [Op.in]: REVENUE_STATUSES },
      createdAt: { [Op.between]: [from, to] },
    },
    attributes: [
      'paymentMethod',
      [fn('COUNT', col('id')), 'orders'],
      [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
    ],
    group: ['paymentMethod'],
    raw: true,
  });

  const series = rows.map((row) => ({
    period: row.period,
    orders: Number(row.orders),
    units: Number(row.units),
    subtotal: round(row.subtotal),
    shipping: round(row.shipping),
    revenue: round(row.revenue),
  }));

  res.json({
    success: true,
    data: {
      range: { from, to },
      groupBy,
      series,
      totals: {
        orders: series.reduce((sum, row) => sum + row.orders, 0),
        units: series.reduce((sum, row) => sum + row.units, 0),
        revenue: round(series.reduce((sum, row) => sum + row.revenue, 0)),
        shipping: round(series.reduce((sum, row) => sum + row.shipping, 0)),
      },
      byPaymentMethod: paymentRows.map((row) => ({
        paymentMethod: row.paymentMethod,
        orders: Number(row.orders),
        revenue: round(row.revenue),
      })),
    },
  });
});

/** Best and worst performing products over the range. */
export const getProductReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);

  const sold = await OrderItem.findAll({
    attributes: [
      'productId',
      'name',
      'sku',
      [fn('SUM', col('OrderItem.quantity')), 'units'],
      [fn('SUM', col('OrderItem.lineTotal')), 'revenue'],
      [fn('COUNT', fn('DISTINCT', col('OrderItem.orderId'))), 'orderCount'],
    ],
    include: [
      {
        model: Order,
        as: 'order',
        attributes: [],
        where: {
          status: { [Op.in]: REVENUE_STATUSES },
          createdAt: { [Op.between]: [from, to] },
        },
      },
    ],
    group: ['productId', 'name', 'sku'],
    order: [[literal('revenue'), 'DESC']],
    limit: 50,
    raw: true,
  });

  const soldIds = sold.map((row) => row.productId).filter(Boolean);

  const neverSold = await Product.findAll({
    where: {
      isActive: true,
      ...(soldIds.length ? { id: { [Op.notIn]: soldIds } } : {}),
    },
    attributes: ['id', 'name', 'sku', 'stock', 'price', 'createdAt'],
    include: [
      {
        model: ProductImage,
        as: 'images',
        attributes: ['url'],
        separate: true,
        limit: 1,
        order: [['isPrimary', 'DESC']],
      },
    ],
    order: [['createdAt', 'ASC']],
    limit: 20,
  });

  res.json({
    success: true,
    data: {
      range: { from, to },
      topSellers: sold.map((row) => ({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        units: Number(row.units),
        orderCount: Number(row.orderCount),
        revenue: round(row.revenue),
      })),
      noSales: neverSold.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        price: product.price,
        primaryImage: product.images?.[0]?.url || null,
        listedAt: product.createdAt,
      })),
    },
  });
});

/** New vs returning customers, plus the biggest spenders. */
export const getCustomerReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);

  const [signupRows, topSpenders, repeatStats] = await Promise.all([
    User.findAll({
      where: { createdAt: { [Op.between]: [from, to] } },
      attributes: [
        [fn('DATE', col('createdAt')), 'day'],
        [fn('COUNT', col('id')), 'signups'],
      ],
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']],
      raw: true,
    }),
    Order.findAll({
      where: {
        status: { [Op.in]: REVENUE_STATUSES },
        createdAt: { [Op.between]: [from, to] },
      },
      attributes: [
        'userId',
        [fn('COUNT', col('Order.id')), 'orders'],
        [fn('SUM', col('Order.total')), 'spend'],
      ],
      include: [
        {
          model: User,
          as: 'customer',
          attributes: ['firstName', 'lastName', 'email'],
        },
      ],
      group: ['userId', 'customer.id'],
      order: [[literal('spend'), 'DESC']],
      limit: 10,
      raw: true,
      nest: true,
    }),
    sequelize.query(
      `SELECT
         SUM(CASE WHEN orderCount = 1 THEN 1 ELSE 0 END) AS oneTime,
         SUM(CASE WHEN orderCount > 1 THEN 1 ELSE 0 END) AS repeatBuyers
       FROM (
         SELECT userId, COUNT(*) AS orderCount
         FROM orders
         WHERE status IN (:statuses)
         GROUP BY userId
       ) grouped`,
      {
        replacements: { statuses: REVENUE_STATUSES },
        type: sequelize.QueryTypes.SELECT,
        plain: true,
      }
    ),
  ]);

  res.json({
    success: true,
    data: {
      range: { from, to },
      signupTrend: signupRows.map((row) => ({
        date: String(row.day),
        signups: Number(row.signups),
      })),
      topSpenders: topSpenders.map((row) => ({
        userId: row.userId,
        name: `${row.customer?.firstName || ''} ${row.customer?.lastName || ''}`.trim(),
        email: row.customer?.email,
        orders: Number(row.orders),
        spend: round(row.spend),
      })),
      loyalty: {
        oneTime: Number(repeatStats?.oneTime) || 0,
        repeatBuyers: Number(repeatStats?.repeatBuyers) || 0,
      },
    },
  });
});

const exportFormat = (req) => (req.query.format === 'xlsx' ? 'xlsx' : 'csv');

export const exportSalesReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy) ? req.query.groupBy : 'day';
  const formats = { day: '%Y-%m-%d', week: '%x-W%v', month: '%Y-%m' };
  const bucket = fn('DATE_FORMAT', col('createdAt'), formats[groupBy]);

  const rows = await Order.findAll({
    where: { status: { [Op.in]: REVENUE_STATUSES }, createdAt: { [Op.between]: [from, to] } },
    attributes: [
      [bucket, 'period'],
      [fn('COUNT', col('id')), 'orders'],
      [fn('COALESCE', fn('SUM', col('itemCount')), 0), 'units'],
      [fn('COALESCE', fn('SUM', col('subtotal')), 0), 'subtotal'],
      [fn('COALESCE', fn('SUM', col('shippingFee')), 0), 'shipping'],
      [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
    ],
    group: [bucket],
    order: [[bucket, 'ASC']],
    raw: true,
  });

  await sendTable(res, {
    filename: 'sales-report',
    sheetName: 'Sales',
    format: exportFormat(req),
    headers: ['Period', 'Orders', 'Units', 'Subtotal', 'Shipping', 'Revenue'],
    rows: rows.map((row) => [
      row.period,
      Number(row.orders),
      Number(row.units),
      round(row.subtotal),
      round(row.shipping),
      round(row.revenue),
    ]),
  });
});

export const exportProductReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const topSellers = await OrderItem.findAll({
    attributes: [
      'productId',
      [fn('SUM', col('quantity')), 'units'],
      [fn('COUNT', fn('DISTINCT', col('orderId'))), 'orderCount'],
      [fn('SUM', col('lineTotal')), 'revenue'],
    ],
    include: [
      { model: Order, as: 'order', attributes: [], where: { status: { [Op.in]: REVENUE_STATUSES }, createdAt: { [Op.between]: [from, to] } } },
      { model: Product, as: 'product', attributes: ['name', 'sku'] },
    ],
    group: ['productId', 'product.id'],
    order: [[literal('revenue'), 'DESC']],
    limit: 200,
    raw: true,
    nest: true,
  });

  await sendTable(res, {
    filename: 'product-report',
    sheetName: 'Products',
    format: exportFormat(req),
    headers: ['Product', 'SKU', 'Units', 'Orders', 'Revenue'],
    rows: topSellers.map((row) => [
      row.product?.name || row.productId,
      row.product?.sku || '',
      Number(row.units),
      Number(row.orderCount),
      round(row.revenue),
    ]),
  });
});

export const exportCustomerReport = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const topSpenders = await Order.findAll({
    where: { status: { [Op.in]: REVENUE_STATUSES }, createdAt: { [Op.between]: [from, to] } },
    attributes: [
      'userId',
      [fn('COUNT', col('id')), 'orders'],
      [fn('COALESCE', fn('SUM', col('total')), 0), 'spend'],
    ],
    include: [{ model: User, as: 'customer', attributes: ['firstName', 'lastName', 'email'] }],
    group: ['userId', 'customer.id'],
    order: [[literal('spend'), 'DESC']],
    limit: 200,
    raw: true,
    nest: true,
  });

  await sendTable(res, {
    filename: 'customer-report',
    sheetName: 'Customers',
    format: exportFormat(req),
    headers: ['Name', 'Email', 'Orders', 'Spend'],
    rows: topSpenders.map((row) => [
      `${row.customer?.firstName || ''} ${row.customer?.lastName || ''}`.trim(),
      row.customer?.email || '',
      Number(row.orders),
      round(row.spend),
    ]),
  });
});
