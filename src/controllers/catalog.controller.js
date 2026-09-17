import { Op, fn, col } from 'sequelize';
import {
  Product,
  ProductImage,
  Category,
  Banner,
  Review,
  User,
  WishlistItem,
  Order,
  OrderItem,
} from '../models/index.js';
import { serializeProduct, serializeBanner } from '../helpers/serializers.js';
import { getPagination, buildMeta } from '../utils/pagination.js';
import { getStoreSettings } from '../services/settings.service.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getShopSettings = asyncHandler(async (req, res) => {
  const settings = await getStoreSettings();

  res.json({
    success: true,
    data: {
      returnDays: settings.returnDays,
    },
  });
});

const SORT_MAP = {
  newest: [['createdAt', 'DESC']],
  oldest: [['createdAt', 'ASC']],
  price_asc: [['price', 'ASC']],
  price_desc: [['price', 'DESC']],
  name_asc: [['name', 'ASC']],
  name_desc: [['name', 'DESC']],
  rating: [
    ['ratingAverage', 'DESC'],
    ['ratingCount', 'DESC'],
  ],
  popular: [['soldCount', 'DESC']],
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

const categoryInclude = {
  model: Category,
  as: 'category',
  attributes: ['id', 'name', 'slug'],
};

/** Collect a category plus every descendant id so parent pages include children. */
const collectCategoryIds = async (rootId) => {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length) {
    const children = await Category.findAll({
      where: { parentId: { [Op.in]: frontier } },
      attributes: ['id'],
    });
    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }

  return ids;
};

const buildProductWhere = async (query) => {
  const where = { isActive: true };

  if (query.search) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { sku: { [Op.like]: term } },
      { brand: { [Op.like]: term } },
      { platform: { [Op.like]: term } },
      { shortDescription: { [Op.like]: term } },
    ];
  }

  if (query.category) {
    const category = await Category.findOne({
      where: { slug: query.category, isActive: true },
    });
    if (!category) throw new AppError('Category not found', 404);
    where.categoryId = { [Op.in]: await collectCategoryIds(category.id) };
  }

  if (query.ids) {
    const ids = String(query.ids)
      .split(',')
      .map(Number)
      .filter((id) => id > 0);
    if (ids.length) where.id = { [Op.in]: ids };
  }

  if (query.platform) {
    const platforms = String(query.platform).split(',').filter(Boolean);
    if (platforms.length) where.platform = { [Op.in]: platforms };
  }

  if (query.condition) {
    const conditions = String(query.condition).split(',').filter(Boolean);
    if (conditions.length) where.condition = { [Op.in]: conditions };
  }

  if (query.brand) {
    const brands = String(query.brand).split(',').filter(Boolean);
    if (brands.length) where.brand = { [Op.in]: brands };
  }

  const minPrice = Number(query.minPrice);
  const maxPrice = Number(query.maxPrice);
  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    where.price = {};
    if (!Number.isNaN(minPrice)) where.price[Op.gte] = minPrice;
    if (!Number.isNaN(maxPrice)) where.price[Op.lte] = maxPrice;
  }

  if (query.inStock === 'true') where.stock = { [Op.gt]: 0 };
  if (query.onSale === 'true') where.salePrice = { [Op.gt]: 0 };
  if (query.featured === 'true') where.isFeatured = true;
  if (query.minRating) where.ratingAverage = { [Op.gte]: Number(query.minRating) };

  return where;
};

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 12);
  const where = await buildProductWhere(req.query);
  const order = SORT_MAP[req.query.sort] || SORT_MAP.newest;

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: [imageInclude, categoryInclude],
    order,
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

/** Facet values and price bounds so the listing page can build its filter rail. */
export const getFilterOptions = asyncHandler(async (req, res) => {
  const where = { isActive: true };

  if (req.query.category) {
    const category = await Category.findOne({ where: { slug: req.query.category } });
    if (category) where.categoryId = { [Op.in]: await collectCategoryIds(category.id) };
  }

  const [platforms, brands, bounds] = await Promise.all([
    Product.findAll({
      where: { ...where, platform: { [Op.ne]: null } },
      attributes: ['platform', [fn('COUNT', col('id')), 'count']],
      group: ['platform'],
      order: [['platform', 'ASC']],
      raw: true,
    }),
    Product.findAll({
      where: { ...where, brand: { [Op.ne]: null } },
      attributes: ['brand', [fn('COUNT', col('id')), 'count']],
      group: ['brand'],
      order: [['brand', 'ASC']],
      raw: true,
    }),
    Product.findOne({
      where,
      attributes: [
        [fn('MIN', col('price')), 'minPrice'],
        [fn('MAX', col('price')), 'maxPrice'],
      ],
      raw: true,
    }),
  ]);

  res.json({
    success: true,
    data: {
      platforms: platforms.map((row) => ({
        value: row.platform,
        count: Number(row.count),
      })),
      brands: brands.map((row) => ({ value: row.brand, count: Number(row.count) })),
      conditions: [
        { value: 'new', label: 'New' },
        { value: 'like_new', label: 'Like new' },
        { value: 'very_good', label: 'Very good' },
        { value: 'good', label: 'Good' },
        { value: 'fair', label: 'Fair' },
      ],
      priceRange: {
        min: Math.floor(Number(bounds?.minPrice) || 0),
        max: Math.ceil(Number(bounds?.maxPrice) || 0),
      },
    },
  });
});

export const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    where: { slug: req.params.slug, isActive: true },
    include: [
      imageInclude,
      categoryInclude,
      {
        model: Review,
        as: 'reviews',
        where: { isApproved: true },
        required: false,
        attributes: ['id', 'rating', 'title', 'body', 'createdAt'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'avatar'] }],
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 10,
      },
    ],
  });

  if (!product) throw new AppError('Product not found', 404);

  await product.increment('viewCount');

  const related = await Product.findAll({
    where: {
      categoryId: product.categoryId,
      id: { [Op.ne]: product.id },
      isActive: true,
    },
    include: [imageInclude],
    order: [['soldCount', 'DESC']],
    limit: 8,
  });

  let inWishlist = false;
  let canReview = false;
  let hasReviewed = false;
  if (req.user) {
    inWishlist = Boolean(
      await WishlistItem.findOne({ where: { userId: req.user.id, productId: product.id } })
    );
    hasReviewed = Boolean(
      await Review.findOne({ where: { userId: req.user.id, productId: product.id } })
    );
    canReview = Boolean(
      await OrderItem.findOne({
        where: { productId: product.id },
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
      })
    );
  }

  res.json({
    success: true,
    data: {
      product: {
        ...serializeProduct(product),
        inWishlist,
        canReview: canReview && !hasReviewed,
        hasReviewed,
      },
      related: related.map(serializeProduct),
    },
  });
});

export const listCategories = asyncHandler(async (req, res) => {
  const roots = await Category.findAll({
    where: { isActive: true, parentId: null },
    include: [
      {
        model: Category,
        as: 'children',
        where: { isActive: true },
        required: false,
        attributes: ['id', 'name', 'slug', 'image', 'sortOrder'],
      },
    ],
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
  });

  const counts = await Product.findAll({
    where: { isActive: true },
    attributes: ['categoryId', [fn('COUNT', col('id')), 'count']],
    group: ['categoryId'],
    raw: true,
  });
  const countMap = new Map(counts.map((row) => [row.categoryId, Number(row.count)]));

  const data = roots.map((category) => ({
    ...category.toJSON(),
    productCount: countMap.get(category.id) || 0,
    children: (category.children || [])
      .map((child) => ({ ...child.toJSON(), productCount: countMap.get(child.id) || 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  res.json({ success: true, data });
});

export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    where: { slug: req.params.slug, isActive: true },
    include: [
      {
        model: Category,
        as: 'children',
        where: { isActive: true },
        required: false,
        attributes: ['id', 'name', 'slug', 'image'],
      },
      { model: Category, as: 'parent', attributes: ['id', 'name', 'slug'] },
    ],
  });

  if (!category) throw new AppError('Category not found', 404);

  res.json({ success: true, data: category });
});

export const listBanners = asyncHandler(async (req, res) => {
  const now = new Date();
  const where = {
    isActive: true,
    [Op.and]: [
      { [Op.or]: [{ startsAt: null }, { startsAt: { [Op.lte]: now } }] },
      { [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gte]: now } }] },
    ],
  };

  if (req.query.placement) where.placement = req.query.placement;

  const banners = await Banner.findAll({
    where,
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'DESC'],
    ],
  });

  res.json({ success: true, data: banners });
});

/** Everything the homepage needs in one round trip. */
export const getHomeFeed = asyncHandler(async (req, res) => {
  const now = new Date();
  const activeWindow = {
    isActive: true,
    [Op.and]: [
      { [Op.or]: [{ startsAt: null }, { startsAt: { [Op.lte]: now } }] },
      { [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gte]: now } }] },
    ],
  };

  const [heroBanners, sideBanners, promoStrip, featured, newArrivals, bestSellers, onSale] =
    await Promise.all([
      Banner.findAll({
        where: { ...activeWindow, placement: 'home_hero' },
        include: [
          { model: Category, as: 'linkCategory', attributes: ['id', 'name', 'slug'] },
          { model: Product, as: 'linkProduct', attributes: ['id', 'name', 'slug'] },
        ],
        order: [['sortOrder', 'ASC']],
      }),
      Banner.findAll({
        where: { ...activeWindow, placement: 'home_side' },
        include: [
          { model: Category, as: 'linkCategory', attributes: ['id', 'name', 'slug'] },
          { model: Product, as: 'linkProduct', attributes: ['id', 'name', 'slug'] },
        ],
        order: [['sortOrder', 'ASC']],
        limit: 2,
      }),
      Banner.findAll({
        where: { ...activeWindow, placement: 'promo_strip' },
        include: [
          { model: Category, as: 'linkCategory', attributes: ['id', 'name', 'slug'] },
          { model: Product, as: 'linkProduct', attributes: ['id', 'name', 'slug'] },
        ],
        order: [['sortOrder', 'ASC']],
        limit: 4,
      }),
      Product.findAll({
        where: { isActive: true, isFeatured: true },
        include: [imageInclude, categoryInclude],
        order: [['updatedAt', 'DESC']],
        limit: 12,
      }),
      Product.findAll({
        where: { isActive: true },
        include: [imageInclude, categoryInclude],
        order: [['createdAt', 'DESC']],
        limit: 12,
      }),
      Product.findAll({
        where: { isActive: true },
        include: [imageInclude, categoryInclude],
        order: [['soldCount', 'DESC']],
        limit: 12,
      }),
      Product.findAll({
        where: { isActive: true, salePrice: { [Op.gt]: 0 } },
        include: [imageInclude, categoryInclude],
        order: [['updatedAt', 'DESC']],
        limit: 12,
      }),
    ]);

  const categories = await Category.findAll({
    where: { isActive: true, isFeatured: true, parentId: null },
    order: [['sortOrder', 'ASC']],
    limit: 12,
  });

  res.json({
    success: true,
    data: {
      heroBanners: heroBanners.map(serializeBanner),
      sideBanners: sideBanners.map(serializeBanner),
      promoStrip: promoStrip.map(serializeBanner),
      categories,
      featured: featured.map(serializeProduct),
      newArrivals: newArrivals.map(serializeProduct),
      bestSellers: bestSellers.map(serializeProduct),
      onSale: onSale.map(serializeProduct),
    },
  });
});

/** Lightweight typeahead for the header search box. */
export const searchSuggestions = asyncHandler(async (req, res) => {
  const term = (req.query.q || '').trim();

  if (term.length < 2) {
    return res.json({ success: true, data: { products: [], categories: [] } });
  }

  const like = `%${term}%`;

  const [products, categories] = await Promise.all([
    Product.findAll({
      where: {
        isActive: true,
        [Op.or]: [{ name: { [Op.like]: like } }, { platform: { [Op.like]: like } }],
      },
      include: [imageInclude],
      order: [['soldCount', 'DESC']],
      limit: 6,
    }),
    Category.findAll({
      where: { isActive: true, name: { [Op.like]: like } },
      attributes: ['id', 'name', 'slug'],
      limit: 4,
    }),
  ]);

  res.json({
    success: true,
    data: {
      products: products.map((product) => {
        const serialized = serializeProduct(product);
        return {
          id: serialized.id,
          name: serialized.name,
          slug: serialized.slug,
          price: serialized.effectivePrice,
          primaryImage: serialized.primaryImage,
        };
      }),
      categories,
    },
  });
});
