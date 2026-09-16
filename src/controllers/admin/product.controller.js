import { Op } from 'sequelize';
import {
  sequelize,
  Product,
  ProductImage,
  Category,
  InventoryLog,
  OrderItem,
} from '../../models/index.js';
import { serializeProduct } from '../../helpers/serializers.js';
import { uniqueSlug } from '../../helpers/slug.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { toPublicUrl, removeUpload } from '../../middleware/upload.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const SORT_MAP = {
  newest: [['createdAt', 'DESC']],
  oldest: [['createdAt', 'ASC']],
  name_asc: [['name', 'ASC']],
  name_desc: [['name', 'DESC']],
  price_asc: [['price', 'ASC']],
  price_desc: [['price', 'DESC']],
  stock_asc: [['stock', 'ASC']],
  stock_desc: [['stock', 'DESC']],
  best_selling: [['soldCount', 'DESC']],
};

const imageInclude = {
  model: ProductImage,
  as: 'images',
  attributes: ['id', 'url', 'alt', 'isPrimary', 'sortOrder'],
  separate: true,
  order: [
    ['isPrimary', 'DESC'],
    ['sortOrder', 'ASC'],
  ],
};

const numberOrNull = (value) =>
  value === '' || value === null || value === undefined ? null : Number(value);

const galleryFiles = (req) => {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return req.files.images || [];
};

const cardImageFile = (req) => {
  if (!req.files || Array.isArray(req.files)) return null;
  return req.files.cardImage?.[0] || null;
};

const bodyArray = (body, field) => {
  const value = body[field];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const isUploadUrl = (url) =>
  typeof url === 'string' && /^\/uploads\/[a-z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(url);

const galleryUrls = (req) => {
  const uploaded = galleryFiles(req).map((file) => toPublicUrl(file));
  const existing = bodyArray(req.body, 'existingImageUrls').filter(isUploadUrl);
  return [...uploaded, ...existing].slice(0, 8);
};

const resolveCardImage = (req) => {
  const uploaded = cardImageFile(req);
  if (uploaded) return toPublicUrl(uploaded);
  if (isUploadUrl(req.body.cardImageUrl)) return req.body.cardImageUrl;
  return null;
};

const uniqueSku = async (base, transaction) => {
  let sku = `${base}-COPY`;
  let counter = 1;

  while (await Product.findOne({ where: { sku }, transaction })) {
    sku = `${base}-COPY${counter}`;
    counter += 1;
  }

  return sku;
};

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 15);
  const where = {};

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { sku: { [Op.like]: term } },
      { brand: { [Op.like]: term } },
      { platform: { [Op.like]: term } },
    ];
  }

  if (req.query.categoryId) where.categoryId = Number(req.query.categoryId);
  if (req.query.platform) where.platform = req.query.platform;
  if (req.query.condition) where.condition = req.query.condition;
  if (req.query.status === 'active') where.isActive = true;
  if (req.query.status === 'inactive') where.isActive = false;
  if (req.query.featured === 'true') where.isFeatured = true;

  if (req.query.stock === 'out') where.stock = 0;
  if (req.query.stock === 'low') {
    where.stock = { [Op.gt]: 0, [Op.lte]: sequelize.col('lowStockThreshold') };
  }
  if (req.query.stock === 'in') where.stock = { [Op.gt]: 0 };

  const minPrice = numberOrNull(req.query.minPrice);
  const maxPrice = numberOrNull(req.query.maxPrice);
  if (minPrice !== null || maxPrice !== null) {
    where.price = {};
    if (minPrice !== null) where.price[Op.gte] = minPrice;
    if (maxPrice !== null) where.price[Op.lte] = maxPrice;
  }

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: [imageInclude, { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }],
    order: SORT_MAP[req.query.sort] || SORT_MAP.newest,
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    data: rows.map(serializeProduct),
    meta: buildMeta({ count, page, limit }),
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id, {
    include: [imageInclude, { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }],
  });

  if (!product) throw new AppError('Product not found', 404);

  const [unitsSold, logs] = await Promise.all([
    OrderItem.sum('quantity', { where: { productId: product.id } }),
    InventoryLog.findAll({
      where: { productId: product.id },
      order: [['createdAt', 'DESC']],
      limit: 20,
    }),
  ]);

  res.json({
    success: true,
    data: {
      product: serializeProduct(product),
      stats: { unitsSold: Number(unitsSold) || 0 },
      inventoryLogs: logs,
    },
  });
});

export const createProduct = asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.body.categoryId);
  if (!category) throw new AppError('Choose a valid category', 422);

  const product = await sequelize.transaction(async (transaction) => {
    const created = await Product.create(
      {
        name: req.body.name,
        slug: await uniqueSlug(Product, req.body.slug || req.body.name),
        sku: req.body.sku,
        categoryId: category.id,
        brand: req.body.brand || null,
        platform: req.body.platform || null,
        condition: req.body.condition || 'very_good',
        shortDescription: req.body.shortDescription || null,
        description: req.body.description || null,
        price: Number(req.body.price),
        salePrice: numberOrNull(req.body.salePrice),
        costPrice: numberOrNull(req.body.costPrice),
        tradeInPrice: numberOrNull(req.body.tradeInPrice),
        stock: Number(req.body.stock) || 0,
        lowStockThreshold: Number(req.body.lowStockThreshold) || 3,
        warrantyMonths: Number(req.body.warrantyMonths) || 60,
        isActive: req.body.isActive === undefined ? true : req.body.isActive === 'false' ? false : Boolean(req.body.isActive),
        isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
        cardImage: resolveCardImage(req),
        metaTitle: req.body.metaTitle || null,
        metaDescription: req.body.metaDescription || null,
      },
      { transaction }
    );

    const urls = galleryUrls(req);
    for (const [index, url] of urls.entries()) {
      await ProductImage.create(
        {
          productId: created.id,
          url,
          alt: created.name,
          sortOrder: index,
          isPrimary: index === 0,
        },
        { transaction }
      );
    }

    if (created.stock > 0) {
      await InventoryLog.create(
        {
          productId: created.id,
          type: 'restock',
          quantityChange: created.stock,
          stockAfter: created.stock,
          note: 'Initial stock on product creation',
          adminId: req.admin.id,
        },
        { transaction }
      );
    }

    return created;
  });

  const full = await Product.findByPk(product.id, { include: [imageInclude] });

  res.status(201).json({
    success: true,
    message: `${full.name} created`,
    data: serializeProduct(full),
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) throw new AppError('Product not found', 404);

  if (req.body.categoryId) {
    const category = await Category.findByPk(req.body.categoryId);
    if (!category) throw new AppError('Choose a valid category', 422);
  }

  await sequelize.transaction(async (transaction) => {
    const updates = {};
    const assign = (field, transform = (value) => value) => {
      if (req.body[field] !== undefined) updates[field] = transform(req.body[field]);
    };

    assign('name');
    assign('sku');
    assign('categoryId', Number);
    assign('brand');
    assign('platform');
    assign('condition');
    assign('shortDescription');
    assign('description');
    assign('price', Number);
    assign('salePrice', numberOrNull);
    assign('costPrice', numberOrNull);
    assign('tradeInPrice', numberOrNull);
    assign('lowStockThreshold', Number);
    assign('warrantyMonths', Number);
    assign('metaTitle');
    assign('metaDescription');
    assign('isActive', (value) => value === true || value === 'true');
    assign('isFeatured', (value) => value === true || value === 'true');

    const newCard = cardImageFile(req);
    const nextCardImage = resolveCardImage(req);

    if (req.body.clearCardImage === 'true' || req.body.clearCardImage === true) {
      updates.cardImage = null;
    } else if (nextCardImage) {
      updates.cardImage = nextCardImage;
    }

    if (req.body.name && req.body.name !== product.name) {
      updates.slug = await uniqueSlug(Product, req.body.slug || req.body.name, product.id);
    }

    // Stock edits go through the inventory log so the history stays complete.
    if (req.body.stock !== undefined && Number(req.body.stock) !== product.stock) {
      const newStock = Math.max(0, Number(req.body.stock));
      const delta = newStock - product.stock;
      updates.stock = newStock;

      await InventoryLog.create(
        {
          productId: product.id,
          type: 'adjustment',
          quantityChange: delta,
          stockAfter: newStock,
          note: req.body.stockNote || 'Manual edit from product form',
          adminId: req.admin.id,
        },
        { transaction }
      );
    }

    const previousCard = product.cardImage;
    await product.update(updates, { transaction });
    if (newCard && previousCard && previousCard !== updates.cardImage) {
      removeUpload(previousCard);
    }

    const urls = galleryUrls(req);
    if (urls.length) {
      const existingCount = await ProductImage.count({
        where: { productId: product.id },
        transaction,
      });
      const remainingSlots = Math.max(0, 8 - existingCount);
      const toAdd = urls.slice(0, remainingSlots);

      for (const [index, url] of toAdd.entries()) {
        await ProductImage.create(
          {
            productId: product.id,
            url,
            alt: product.name,
            sortOrder: existingCount + index,
            isPrimary: existingCount === 0 && index === 0,
          },
          { transaction }
        );
      }
    }
  });

  const full = await Product.findByPk(product.id, { include: [imageInclude] });

  res.json({
    success: true,
    message: `${full.name} updated`,
    data: serializeProduct(full),
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id, { include: [imageInclude] });
  if (!product) throw new AppError('Product not found', 404);

  const soldCount = await OrderItem.count({ where: { productId: product.id } });

  // Products attached to orders are archived instead of deleted so order
  // history keeps its product link.
  if (soldCount > 0) {
    await product.update({ isActive: false, isFeatured: false });
    return res.json({
      success: true,
      message: `${product.name} appears in ${soldCount} order(s), so it was archived instead of deleted`,
      data: { archived: true },
    });
  }

  const images = product.images || [];
  await product.destroy();
  images.forEach((image) => removeUpload(image.url));

  res.json({ success: true, message: `${product.name} deleted`, data: { archived: false } });
});

export const deleteProductImage = asyncHandler(async (req, res) => {
  const image = await ProductImage.findOne({
    where: { id: req.params.imageId, productId: req.params.id },
  });

  if (!image) throw new AppError('Image not found', 404);

  const wasPrimary = image.isPrimary;
  await image.destroy();
  removeUpload(image.url);

  if (wasPrimary) {
    const next = await ProductImage.findOne({
      where: { productId: req.params.id },
      order: [['sortOrder', 'ASC']],
    });
    if (next) await next.update({ isPrimary: true });
  }

  res.json({ success: true, message: 'Image removed' });
});

export const setPrimaryImage = asyncHandler(async (req, res) => {
  const image = await ProductImage.findOne({
    where: { id: req.params.imageId, productId: req.params.id },
  });

  if (!image) throw new AppError('Image not found', 404);

  await ProductImage.update({ isPrimary: false }, { where: { productId: req.params.id } });
  await image.update({ isPrimary: true });

  res.json({ success: true, message: 'Cover image updated' });
});

/** Duplicate a product so the admin can tweak name, SKU and stock. */
export const cloneProduct = asyncHandler(async (req, res) => {
  const source = await Product.findByPk(req.params.id, { include: [imageInclude] });
  if (!source) throw new AppError('Product not found', 404);

  const clone = await sequelize.transaction(async (transaction) => {
    const sku = await uniqueSku(source.sku, transaction);
    const created = await Product.create(
      {
        name: `${source.name} (Copy)`,
        slug: await uniqueSlug(Product, `${source.name} copy`),
        sku,
        categoryId: source.categoryId,
        brand: source.brand,
        platform: source.platform,
        condition: source.condition,
        shortDescription: source.shortDescription,
        description: source.description,
        price: source.price,
        salePrice: source.salePrice,
        costPrice: source.costPrice,
        tradeInPrice: source.tradeInPrice,
        stock: 0,
        lowStockThreshold: source.lowStockThreshold,
        warrantyMonths: source.warrantyMonths,
        isActive: false,
        isFeatured: false,
        cardImage: source.cardImage,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
      },
      { transaction }
    );

    for (const [index, image] of (source.images || []).entries()) {
      await ProductImage.create(
        {
          productId: created.id,
          url: image.url,
          alt: image.alt || created.name,
          sortOrder: index,
          isPrimary: image.isPrimary,
        },
        { transaction }
      );
    }

    return created;
  });

  const full = await Product.findByPk(clone.id, {
    include: [imageInclude, { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }],
  });

  res.status(201).json({
    success: true,
    message: `${full.name} created from a copy`,
    data: serializeProduct(full),
  });
});

/** Toggle active / featured on many rows at once from the list view. */
export const bulkUpdate = asyncHandler(async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  const { action } = req.body;

  if (!ids.length) throw new AppError('Select at least one product', 422);

  const actions = {
    activate: { isActive: true },
    deactivate: { isActive: false },
    feature: { isFeatured: true },
    unfeature: { isFeatured: false },
  };

  if (!actions[action]) throw new AppError('Unknown bulk action', 422);

  const [affected] = await Product.update(actions[action], { where: { id: ids } });

  res.json({ success: true, message: `${affected} product(s) updated` });
});
