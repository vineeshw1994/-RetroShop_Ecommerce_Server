import { Op, fn, col } from 'sequelize';
import { Category, Product } from '../../models/index.js';
import { uniqueSlug } from '../../helpers/slug.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { toPublicUrl, removeUpload } from '../../middleware/upload.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const isUploadUrl = (url) =>
  typeof url === 'string' && /^\/uploads\/[a-z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(url);

const withCounts = async (categories) => {
  const counts = await Product.findAll({
    attributes: ['categoryId', [fn('COUNT', col('id')), 'count']],
    group: ['categoryId'],
    raw: true,
  });
  const map = new Map(counts.map((row) => [row.categoryId, Number(row.count)]));

  return categories.map((category) => ({
    ...category.toJSON(),
    productCount: map.get(category.id) || 0,
  }));
};

export const listCategories = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 20);
  const where = {};

  if (req.query.search) {
    where.name = { [Op.like]: `%${req.query.search.trim()}%` };
  }
  if (req.query.status === 'active') where.isActive = true;
  if (req.query.status === 'inactive') where.isActive = false;
  if (req.query.parentId === 'root') where.parentId = null;
  else if (req.query.parentId) where.parentId = Number(req.query.parentId);

  const { rows, count } = await Category.findAndCountAll({
    where,
    include: [{ model: Category, as: 'parent', attributes: ['id', 'name', 'slug'] }],
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    data: await withCounts(rows),
    meta: buildMeta({ count, page, limit }),
  });
});

/** Flat parent/child tree for selects and the storefront mega menu preview. */
export const getCategoryTree = asyncHandler(async (req, res) => {
  const categories = await Category.findAll({
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
  });

  const withProductCounts = await withCounts(categories);
  const byId = new Map(withProductCounts.map((category) => [category.id, { ...category, children: [] }]));

  const roots = [];
  byId.forEach((category) => {
    if (category.parentId && byId.has(category.parentId)) {
      byId.get(category.parentId).children.push(category);
    } else {
      roots.push(category);
    }
  });

  res.json({ success: true, data: roots });
});

export const createCategory = asyncHandler(async (req, res) => {
  if (req.body.parentId) {
    const parent = await Category.findByPk(req.body.parentId);
    if (!parent) throw new AppError('Parent category not found', 422);
    if (parent.parentId) {
      throw new AppError('Categories can only be nested one level deep', 422);
    }
  }

  const category = await Category.create({
    name: req.body.name,
    slug: await uniqueSlug(Category, req.body.slug || req.body.name),
    description: req.body.description || null,
    parentId: req.body.parentId ? Number(req.body.parentId) : null,
    sortOrder: Number(req.body.sortOrder) || 0,
    isActive: req.body.isActive === undefined ? true : req.body.isActive === 'true' || req.body.isActive === true,
    isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
    image: req.file ? toPublicUrl(req.file) : isUploadUrl(req.body.imageUrl) ? req.body.imageUrl : null,
  });

  res.status(201).json({
    success: true,
    message: `${category.name} created`,
    data: category,
  });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  if (!category) throw new AppError('Category not found', 404);

  const parentId = req.body.parentId ? Number(req.body.parentId) : null;

  if (parentId) {
    if (parentId === category.id) {
      throw new AppError('A category cannot be its own parent', 422);
    }
    const parent = await Category.findByPk(parentId);
    if (!parent) throw new AppError('Parent category not found', 422);
    if (parent.parentId) {
      throw new AppError('Categories can only be nested one level deep', 422);
    }
    const hasChildren = await Category.count({ where: { parentId: category.id } });
    if (hasChildren) {
      throw new AppError('Move the sub-categories out before nesting this one', 422);
    }
  }

  const updates = {
    parentId,
    sortOrder: Number(req.body.sortOrder) || 0,
  };

  if (req.body.name !== undefined) {
    updates.name = req.body.name;
    if (req.body.name !== category.name) {
      updates.slug = await uniqueSlug(Category, req.body.slug || req.body.name, category.id);
    }
  }
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.isActive !== undefined) {
    updates.isActive = req.body.isActive === 'true' || req.body.isActive === true;
  }
  if (req.body.isFeatured !== undefined) {
    updates.isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;
  }

  const previousImage = category.image;

  if (req.body.clearImage === 'true' || req.body.clearImage === true) {
    updates.image = null;
  } else if (req.file) {
    updates.image = toPublicUrl(req.file);
  } else if (isUploadUrl(req.body.imageUrl)) {
    updates.image = req.body.imageUrl;
  }

  await category.update(updates);
  if (req.file && previousImage && previousImage !== updates.image) {
    removeUpload(previousImage);
  }

  res.json({ success: true, message: `${category.name} updated`, data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  if (!category) throw new AppError('Category not found', 404);

  const [productCount, childCount] = await Promise.all([
    Product.count({ where: { categoryId: category.id } }),
    Category.count({ where: { parentId: category.id } }),
  ]);

  if (productCount) {
    throw new AppError(
      `${productCount} product(s) still use this category. Move them first.`,
      409
    );
  }

  if (childCount) {
    throw new AppError(
      `${childCount} sub-categories still sit under this one. Remove them first.`,
      409
    );
  }

  const image = category.image;
  await category.destroy();
  removeUpload(image);

  res.json({ success: true, message: `${category.name} deleted` });
});

export const reorderCategories = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  for (const item of items) {
    if (!item?.id) continue;
    await Category.update({ sortOrder: Number(item.sortOrder) || 0 }, { where: { id: item.id } });
  }

  res.json({ success: true, message: 'Order saved' });
});
