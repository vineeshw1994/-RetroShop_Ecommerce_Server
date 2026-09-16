import { Op } from 'sequelize';
import { Banner, Category, Product } from '../../models/index.js';
import { serializeBanner } from '../../helpers/serializers.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { toPublicUrl, removeUpload } from '../../middleware/upload.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === true || value === 'true';
};

const bannerInclude = [
  { model: Category, as: 'linkCategory', attributes: ['id', 'name', 'slug'] },
  { model: Product, as: 'linkProduct', attributes: ['id', 'name', 'slug'] },
];

const dateOrNull = (value) => (value ? new Date(value) : null);

const parseProductIds = (body) => {
  if (body.linkProductIds !== undefined && body.linkProductIds !== null && body.linkProductIds !== '') {
    try {
      const raw =
        typeof body.linkProductIds === 'string'
          ? JSON.parse(body.linkProductIds)
          : body.linkProductIds;
      if (Array.isArray(raw)) {
        return [...new Set(raw.map(Number).filter((id) => id > 0))];
      }
    } catch {
      return [];
    }
  }

  if (body.linkProductId) return [Number(body.linkProductId)];

  return [];
};

const productLinkFields = (body) => {
  if (body.linkType !== 'product') {
    return { linkProductIds: null, linkProductId: null };
  }

  const ids = parseProductIds(body);

  return {
    linkProductIds: ids.length ? ids : null,
    linkProductId: ids[0] || null,
  };
};

const pickFile = (files, field) => {
  const list = files?.[field];
  return Array.isArray(list) && list.length ? toPublicUrl(list[0]) : null;
};

export const listBanners = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 20);
  const where = {};

  if (req.query.search) where.title = { [Op.like]: `%${req.query.search.trim()}%` };
  if (req.query.placement) where.placement = req.query.placement;
  if (req.query.status === 'active') where.isActive = true;
  if (req.query.status === 'inactive') where.isActive = false;

  const { rows, count } = await Banner.findAndCountAll({
    where,
    include: bannerInclude,
    order: [
      ['placement', 'ASC'],
      ['sortOrder', 'ASC'],
    ],
    limit,
    offset,
  });

  const now = new Date();
  const data = rows.map((banner) => {
    const plain = banner.toJSON();
    const scheduled = plain.startsAt && plain.startsAt > now;
    const expired = plain.endsAt && plain.endsAt < now;
    return {
      ...serializeBanner(plain),
      isLive: plain.isActive && !scheduled && !expired,
      scheduleState: scheduled ? 'scheduled' : expired ? 'expired' : 'live',
    };
  });

  res.json({ success: true, data, meta: buildMeta({ count, page, limit }) });
});

export const getBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByPk(req.params.id, { include: bannerInclude });
  if (!banner) throw new AppError('Banner not found', 404);
  res.json({ success: true, data: serializeBanner(banner) });
});

export const createBanner = asyncHandler(async (req, res) => {
  const productLinks = productLinkFields(req.body);

  const banner = await Banner.create({
    title: req.body.title,
    subtitle: req.body.subtitle || null,
    image: pickFile(req.files, 'image'),
    mobileImage: pickFile(req.files, 'mobileImage'),
    linkUrl: null,
    linkType: req.body.linkType || 'none',
    linkCategoryId: req.body.linkCategoryId ? Number(req.body.linkCategoryId) : null,
    ...productLinks,
    ctaLabel: req.body.ctaLabel || null,
    placement: req.body.placement || 'home_hero',
    theme: req.body.theme || null,
    sortOrder: Number(req.body.sortOrder) || 0,
    isActive: bool(req.body.isActive, true),
    startsAt: dateOrNull(req.body.startsAt),
    endsAt: dateOrNull(req.body.endsAt),
  });

  res.status(201).json({ success: true, message: 'Banner created', data: banner });
});

export const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByPk(req.params.id);
  if (!banner) throw new AppError('Banner not found', 404);

  const updates = {};
  const assign = (field, transform = (value) => value) => {
    if (req.body[field] !== undefined) updates[field] = transform(req.body[field]);
  };

  assign('title');
  assign('subtitle');
  assign('linkType');
  assign('linkCategoryId', (value) => (value ? Number(value) : null));

  if (req.body.linkType !== undefined) {
    const productLinks = productLinkFields(req.body);
    updates.linkProductIds = productLinks.linkProductIds;
    updates.linkProductId = productLinks.linkProductId;
  } else if (req.body.linkProductIds !== undefined || req.body.linkProductId !== undefined) {
    const productLinks = productLinkFields({ ...banner.toJSON(), ...req.body });
    updates.linkProductIds = productLinks.linkProductIds;
    updates.linkProductId = productLinks.linkProductId;
  }

  assign('ctaLabel');
  assign('placement');
  assign('theme');
  assign('sortOrder', Number);
  assign('isActive', (value) => bool(value, true));
  assign('startsAt', dateOrNull);
  assign('endsAt', dateOrNull);

  const newImage = pickFile(req.files, 'image');
  const newMobileImage = pickFile(req.files, 'mobileImage');
  const previous = { image: banner.image, mobileImage: banner.mobileImage };

  if (newImage) updates.image = newImage;
  if (newMobileImage) updates.mobileImage = newMobileImage;

  await banner.update(updates);

  if (newImage) removeUpload(previous.image);
  if (newMobileImage) removeUpload(previous.mobileImage);

  res.json({ success: true, message: 'Banner updated', data: banner });
});

export const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByPk(req.params.id);
  if (!banner) throw new AppError('Banner not found', 404);

  const { image, mobileImage } = banner;
  await banner.destroy();
  removeUpload(image);
  removeUpload(mobileImage);

  res.json({ success: true, message: 'Banner deleted' });
});

export const reorderBanners = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  for (const item of items) {
    if (!item?.id) continue;
    await Banner.update({ sortOrder: Number(item.sortOrder) || 0 }, { where: { id: item.id } });
  }

  res.json({ success: true, message: 'Order saved' });
});
