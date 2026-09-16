import { Op, fn, col, literal } from 'sequelize';
import {
  sequelize,
  Product,
  ProductImage,
  Category,
  InventoryLog,
  AdminUser,
} from '../../models/index.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const listInventory = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 20);
  const where = {};

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [{ name: { [Op.like]: term } }, { sku: { [Op.like]: term } }];
  }

  if (req.query.categoryId) where.categoryId = Number(req.query.categoryId);

  if (req.query.state === 'out') where.stock = 0;
  if (req.query.state === 'low') {
    where.stock = { [Op.gt]: 0, [Op.lte]: literal('`Product`.`lowStockThreshold`') };
  }
  if (req.query.state === 'healthy') {
    where.stock = { [Op.gt]: literal('`Product`.`lowStockThreshold`') };
  }

  const SORT_MAP = {
    stock_asc: [['stock', 'ASC']],
    stock_desc: [['stock', 'DESC']],
    name_asc: [['name', 'ASC']],
    value_desc: [[literal('`Product`.`stock` * `Product`.`price`'), 'DESC']],
  };

  const { rows, count } = await Product.findAndCountAll({
    where,
    attributes: [
      'id',
      'name',
      'sku',
      'slug',
      'stock',
      'lowStockThreshold',
      'price',
      'costPrice',
      'soldCount',
      'isActive',
      'platform',
      'condition',
    ],
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name'] },
      {
        model: ProductImage,
        as: 'images',
        attributes: ['url', 'isPrimary'],
        separate: true,
        order: [['isPrimary', 'DESC']],
        limit: 1,
      },
    ],
    order: SORT_MAP[req.query.sort] || SORT_MAP.stock_asc,
    limit,
    offset,
    distinct: true,
  });

  const totals = await Product.findOne({
    attributes: [
      [fn('COUNT', col('id')), 'skuCount'],
      [fn('COALESCE', fn('SUM', col('stock')), 0), 'unitsOnHand'],
      [fn('COALESCE', fn('SUM', literal('stock * price')), 0), 'retailValue'],
      [fn('COALESCE', fn('SUM', literal('stock * COALESCE(costPrice, 0)')), 0), 'costValue'],
      [
        fn('SUM', literal('CASE WHEN stock = 0 THEN 1 ELSE 0 END')),
        'outOfStockCount',
      ],
      [
        fn('SUM', literal('CASE WHEN stock > 0 AND stock <= lowStockThreshold THEN 1 ELSE 0 END')),
        'lowStockCount',
      ],
    ],
    raw: true,
  });

  res.json({
    success: true,
    data: rows.map((row) => {
      const plain = row.toJSON();
      return {
        ...plain,
        primaryImage: plain.images?.[0]?.url || null,
        state: plain.stock === 0 ? 'out' : plain.stock <= plain.lowStockThreshold ? 'low' : 'healthy',
        retailValue: Math.round(plain.stock * plain.price * 100) / 100,
      };
    }),
    meta: buildMeta({ count, page, limit }),
    summary: {
      skuCount: Number(totals.skuCount) || 0,
      unitsOnHand: Number(totals.unitsOnHand) || 0,
      retailValue: Number(totals.retailValue) || 0,
      costValue: Number(totals.costValue) || 0,
      outOfStockCount: Number(totals.outOfStockCount) || 0,
      lowStockCount: Number(totals.lowStockCount) || 0,
    },
  });
});

/** Apply a relative delta (restock/adjustment) and record it in the log. */
export const adjustStock = asyncHandler(async (req, res) => {
  const quantityChange = Number(req.body.quantityChange);
  const type = req.body.type || 'adjustment';

  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new AppError('Enter a non-zero whole number', 422);
  }

  const result = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) throw new AppError('Product not found', 404);

    const stockAfter = product.stock + quantityChange;
    if (stockAfter < 0) {
      throw new AppError(
        `That would take stock below zero (currently ${product.stock})`,
        422
      );
    }

    await product.update({ stock: stockAfter }, { transaction });

    const log = await InventoryLog.create(
      {
        productId: product.id,
        type,
        quantityChange,
        stockAfter,
        reference: req.body.reference || null,
        note: req.body.note || null,
        adminId: req.admin.id,
      },
      { transaction }
    );

    return { product, log };
  });

  res.json({
    success: true,
    message: `${result.product.name} stock is now ${result.product.stock}`,
    data: { product: result.product, log: result.log },
  });
});

/** Set an absolute stock count, e.g. after a physical stock take. */
export const setStock = asyncHandler(async (req, res) => {
  const stock = Number(req.body.stock);

  if (!Number.isInteger(stock) || stock < 0) {
    throw new AppError('Enter a whole number of 0 or more', 422);
  }

  const result = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) throw new AppError('Product not found', 404);

    const quantityChange = stock - product.stock;
    await product.update({ stock }, { transaction });

    if (quantityChange !== 0) {
      await InventoryLog.create(
        {
          productId: product.id,
          type: 'adjustment',
          quantityChange,
          stockAfter: stock,
          note: req.body.note || 'Stock take',
          adminId: req.admin.id,
        },
        { transaction }
      );
    }

    return product;
  });

  res.json({
    success: true,
    message: `${result.name} stock set to ${result.stock}`,
    data: result,
  });
});

export const listInventoryLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 20);
  const where = {};

  if (req.query.productId) where.productId = Number(req.query.productId);
  if (req.query.type) where.type = req.query.type;

  if (req.query.dateFrom || req.query.dateTo) {
    where.createdAt = {};
    if (req.query.dateFrom) where.createdAt[Op.gte] = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }

  const { rows, count } = await InventoryLog.findAndCountAll({
    where,
    include: [
      { model: Product, as: 'product', attributes: ['id', 'name', 'sku'] },
      { model: AdminUser, as: 'admin', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  res.json({ success: true, data: rows, meta: buildMeta({ count, page, limit }) });
});

export const getLowStockAlerts = asyncHandler(async (req, res) => {
  const products = await Product.findAll({
    where: {
      isActive: true,
      stock: { [Op.lte]: literal('`Product`.`lowStockThreshold`') },
    },
    attributes: ['id', 'name', 'sku', 'stock', 'lowStockThreshold', 'price'],
    order: [['stock', 'ASC']],
    limit: 25,
  });

  res.json({ success: true, data: products });
});
