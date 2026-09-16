import { Op, fn, col, literal } from 'sequelize';
import {
  sequelize,
  Order,
  OrderItem,
  OrderEvent,
  User,
  Product,
  ProductImage,
  InventoryLog,
  AdminUser,
} from '../../models/index.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { sendOrderStatusEmail } from '../../services/email.service.js';
import { applyOrderRefund } from '../../services/orderRefund.service.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendTable } from '../../utils/spreadsheet.js';

/** Only forward moves plus cancel/refund are allowed from any given state. */
const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

const RESTOCK_STATUSES = new Set(['cancelled', 'refunded']);

const customerInclude = {
  model: User,
  as: 'customer',
  attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
};

export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 15);
  const where = {};

  if (req.query.status) {
    where.status = String(req.query.status).split(',').filter(Boolean);
  }
  if (req.query.paymentStatus) where.paymentStatus = req.query.paymentStatus;
  if (req.query.paymentMethod) where.paymentMethod = req.query.paymentMethod;
  if (req.query.userId) where.userId = Number(req.query.userId);

  if (req.query.dateFrom || req.query.dateTo) {
    where.createdAt = {};
    if (req.query.dateFrom) where.createdAt[Op.gte] = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }

  const minTotal = Number(req.query.minTotal);
  const maxTotal = Number(req.query.maxTotal);
  if (!Number.isNaN(minTotal) || !Number.isNaN(maxTotal)) {
    where.total = {};
    if (!Number.isNaN(minTotal)) where.total[Op.gte] = minTotal;
    if (!Number.isNaN(maxTotal)) where.total[Op.lte] = maxTotal;
  }

  const include = [customerInclude, { model: OrderItem, as: 'items', attributes: ['id', 'name', 'quantity', 'image'] }];

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [
      { orderNumber: { [Op.like]: term } },
      { '$customer.email$': { [Op.like]: term } },
      { '$customer.firstName$': { [Op.like]: term } },
      { '$customer.lastName$': { [Op.like]: term } },
    ];
  }

  const SORT_MAP = {
    newest: [['createdAt', 'DESC']],
    oldest: [['createdAt', 'ASC']],
    total_desc: [['total', 'DESC']],
    total_asc: [['total', 'ASC']],
  };

  const { rows, count } = await Order.findAndCountAll({
    where,
    include,
    order: SORT_MAP[req.query.sort] || SORT_MAP.newest,
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  const statusCounts = await Order.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    raw: true,
  });

  res.json({
    success: true,
    data: rows,
    meta: buildMeta({ count, page, limit }),
    summary: {
      statusCounts: statusCounts.reduce(
        (acc, row) => ({ ...acc, [row.status]: Number(row.count) }),
        {}
      ),
    },
  });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByPk(req.params.id, {
    include: [
      customerInclude,
      { model: OrderItem, as: 'items' },
      {
        model: OrderEvent,
        as: 'events',
        include: [{ model: AdminUser, as: 'createdBy', attributes: ['id', 'name'] }],
      },
    ],
    order: [[{ model: OrderEvent, as: 'events' }, 'createdAt', 'ASC']],
  });

  if (!order) throw new AppError('Order not found', 404);

  const plain = order.toJSON();
  const missingIds = [
    ...new Set(
      (plain.items || []).filter((item) => !item.image && item.productId).map((item) => item.productId)
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

  res.json({
    success: true,
    data: plain,
    meta: { allowedTransitions: ALLOWED_TRANSITIONS[order.status] || [] },
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note, notifyCustomer = true } = req.body;

  if (status === 'refunded') {
    await applyOrderRefund({
      orderId: Number(req.params.id),
      adminId: req.admin.id,
      note: note || 'Order refunded by staff',
    });

    const full = await Order.findByPk(req.params.id, {
      include: [customerInclude, { model: OrderItem, as: 'items' }, { model: OrderEvent, as: 'events' }],
    });

    if (notifyCustomer !== false && full.customer?.email) {
      await sendOrderStatusEmail(full.customer.email, full, note);
    }

    return res.json({
      success: true,
      message: `Order ${full.orderNumber} is now refunded`,
      data: full,
    });
  }

  const order = await sequelize.transaction(async (transaction) => {
    const found = await Order.findByPk(req.params.id, {
      include: [{ model: OrderItem, as: 'items' }, customerInclude],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!found) throw new AppError('Order not found', 404);

    if (found.status === status) {
      throw new AppError(`This order is already ${status}`, 409);
    }

    const allowed = ALLOWED_TRANSITIONS[found.status] || [];
    if (!allowed.includes(status)) {
      throw new AppError(
        `Cannot move an order from ${found.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
        409
      );
    }

    // Cancelling or refunding puts the stock back and reverses the sold count.
    if (RESTOCK_STATUSES.has(status)) {
      for (const item of found.items) {
        if (!item.productId) continue;
        const product = await Product.findByPk(item.productId, { transaction });
        if (!product) continue;

        const stockAfter = product.stock + item.quantity;
        await product.update(
          { stock: stockAfter, soldCount: Math.max(0, product.soldCount - item.quantity) },
          { transaction }
        );

        await InventoryLog.create(
          {
            productId: product.id,
            type: status === 'refunded' ? 'return' : 'cancellation',
            quantityChange: item.quantity,
            stockAfter,
            reference: found.orderNumber,
            note: `Order ${status} by staff`,
            adminId: req.admin.id,
          },
          { transaction }
        );
      }
    }

    const updates = { status };
    if (status === 'shipped') updates.shippedAt = new Date();
    if (status === 'delivered') updates.deliveredAt = new Date();
    if (status === 'cancelled') {
      updates.cancelledAt = new Date();
      if (found.paymentStatus === 'paid') updates.paymentStatus = 'refunded';
    }
    if (req.body.trackingNumber !== undefined) updates.trackingNumber = req.body.trackingNumber;
    if (req.body.courier !== undefined) updates.courier = req.body.courier;

    await found.update(updates, { transaction });

    await OrderEvent.create(
      {
        orderId: found.id,
        status,
        note: note || `Status changed to ${status}`,
        createdById: req.admin.id,
      },
      { transaction }
    );

    return found;
  });

  const full = await Order.findByPk(order.id, {
    include: [customerInclude, { model: OrderItem, as: 'items' }, { model: OrderEvent, as: 'events' }],
  });

  if (notifyCustomer !== false && full.customer?.email) {
    await sendOrderStatusEmail(full.customer.email, full, note);
  }

  res.json({
    success: true,
    message: `Order ${full.orderNumber} is now ${full.status}`,
    data: full,
  });
});

export const updateOrderDetails = asyncHandler(async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order) throw new AppError('Order not found', 404);

  const updates = {};
  if (req.body.adminNote !== undefined) updates.adminNote = req.body.adminNote;
  if (req.body.trackingNumber !== undefined) updates.trackingNumber = req.body.trackingNumber;
  if (req.body.courier !== undefined) updates.courier = req.body.courier;
  if (req.body.paymentStatus !== undefined) {
    updates.paymentStatus = req.body.paymentStatus;
    if (req.body.paymentStatus === 'paid' && !order.paidAt) updates.paidAt = new Date();
  }
  if (req.body.shippingAddress !== undefined) updates.shippingAddress = req.body.shippingAddress;

  await order.update(updates);

  res.json({ success: true, message: 'Order updated', data: order });
});

export const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order) throw new AppError('Order not found', 404);

  if (!['cancelled', 'refunded'].includes(order.status)) {
    throw new AppError('Only cancelled or refunded orders can be deleted', 409);
  }

  await order.destroy();

  res.json({ success: true, message: `Order ${order.orderNumber} deleted` });
});

/** CSV of the current filter selection, for spreadsheets and accounting. */
export const exportOrders = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = String(req.query.status).split(',').filter(Boolean);
  if (req.query.dateFrom || req.query.dateTo) {
    where.createdAt = {};
    if (req.query.dateFrom) where.createdAt[Op.gte] = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }

  const orders = await Order.findAll({
    where,
    include: [customerInclude],
    order: [['createdAt', 'DESC']],
    limit: 5000,
  });

  await sendTable(res, {
    filename: 'orders',
    sheetName: 'Orders',
    format: req.query.format === 'xlsx' ? 'xlsx' : 'csv',
    headers: [
      'Order number',
      'Date',
      'Customer',
      'Email',
      'Status',
      'Payment',
      'Items',
      'Subtotal',
      'Shipping',
      'Total',
    ],
    rows: orders.map((order) => [
      order.orderNumber,
      order.createdAt.toISOString(),
      `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim(),
      order.customer?.email,
      order.status,
      order.paymentStatus,
      order.itemCount,
      order.subtotal,
      order.shippingFee,
      order.total,
    ]),
  });
});
