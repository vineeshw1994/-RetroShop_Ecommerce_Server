import { ALL_PERMISSIONS, sanitizePermissions } from '../config/permissions.js';

export const serializeUser = (user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`.trim(),
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  isVerified: user.isVerified,
  isActive: user.isActive,
  marketingOptIn: user.marketingOptIn,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
});

export const serializeAdmin = (admin) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  phone: admin.phone,
  avatar: admin.avatar,
  role: admin.role,
  jobTitle: admin.jobTitle,
  // Super admins implicitly hold everything, so hand the UI the full list.
  permissions:
    admin.role === 'super_admin' ? ALL_PERMISSIONS : sanitizePermissions(admin.permissions),
  isActive: admin.isActive,
  mustChangePassword: admin.mustChangePassword,
  lastLoginAt: admin.lastLoginAt,
  createdAt: admin.createdAt,
});

export const serializeProduct = (product) => {
  const plain = typeof product.toJSON === 'function' ? product.toJSON() : product;
  const images = plain.images || [];
  const primary = images.find((image) => image.isPrimary) || images[0] || null;
  const effectivePrice =
    plain.salePrice && plain.salePrice > 0 ? plain.salePrice : plain.price;

  return {
    ...plain,
    effectivePrice,
    discountPercent:
      plain.salePrice && plain.salePrice > 0 && plain.price > 0
        ? Math.round(((plain.price - plain.salePrice) / plain.price) * 100)
        : 0,
    primaryImage: primary?.url || plain.cardImage || null,
    cardImage: plain.cardImage || primary?.url || null,
    inStock: plain.stock > 0,
    isLowStock: plain.stock > 0 && plain.stock <= plain.lowStockThreshold,
  };
};

export const serializeBanner = (banner) => {
  const plain = typeof banner.toJSON === 'function' ? banner.toJSON() : banner;
  const category = plain.linkCategory;
  const product = plain.linkProduct;
  const productIds = Array.isArray(plain.linkProductIds)
    ? plain.linkProductIds.map(Number).filter((id) => id > 0)
    : plain.linkProductId
      ? [Number(plain.linkProductId)]
      : [];

  let resolvedUrl = null;
  if (plain.linkType === 'category' && category?.slug) {
    resolvedUrl = `/category/${category.slug}`;
  } else if (plain.linkType === 'product') {
    if (productIds.length > 1) {
      resolvedUrl = `/search?ids=${productIds.join(',')}`;
    } else if (product?.slug) {
      resolvedUrl = `/product/${product.slug}`;
    }
  }

  return {
    ...plain,
    linkProductIds: productIds.length ? productIds : null,
    linkUrl: resolvedUrl,
  };
};
