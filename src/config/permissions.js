/**
 * Single source of truth for staff permissions.
 * The admin UI renders its checkbox matrix from `PERMISSION_MODULES`, and the
 * `can()` middleware validates against `ALL_PERMISSIONS`.
 */
export const PERMISSION_MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Sales summary, KPIs and activity feed',
    actions: ['view'],
  },
  {
    key: 'products',
    label: 'Products',
    description: 'Catalogue listings and product details',
    actions: ['view', 'create', 'update', 'delete'],
  },
  {
    key: 'categories',
    label: 'Categories',
    description: 'Platform and product categories',
    actions: ['view', 'create', 'update', 'delete'],
  },
  {
    key: 'banners',
    label: 'Banners',
    description: 'Homepage hero and promo slots',
    actions: ['view', 'create', 'update', 'delete'],
  },
  {
    key: 'orders',
    label: 'Orders',
    description: 'Order queue, fulfilment and refunds',
    actions: ['view', 'update', 'delete'],
  },
  {
    key: 'settings',
    label: 'Shop settings',
    description: 'Return window and other storefront policies',
    actions: ['view', 'update'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock levels, restocks and adjustments',
    actions: ['view', 'update'],
  },
  {
    key: 'customers',
    label: 'Customers',
    description: 'Customer records and account status',
    actions: ['view', 'update'],
  },
  {
    key: 'requests',
    label: 'Game requests',
    description: 'Customer sourcing requests and wishlist asks',
    actions: ['view', 'update'],
  },
  {
    key: 'coupons',
    label: 'Coupons',
    description: 'Discount codes for categories, products or the whole shop',
    actions: ['view', 'create', 'update', 'delete'],
  },
  {
    key: 'contacts',
    label: 'Contact messages',
    description: 'Customer contact form submissions and replies',
    actions: ['view', 'update'],
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Sales, product and customer reports with Excel and CSV export',
    actions: ['view'],
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'Staff accounts and permission assignment',
    actions: ['view', 'create', 'update', 'delete'],
  },
];

export const ALL_PERMISSIONS = PERMISSION_MODULES.flatMap((module) =>
  module.actions.map((action) => `${module.key}:${action}`)
);

/** Sensible starting point when creating a new staff member. */
export const DEFAULT_STAFF_PERMISSIONS = [
  'dashboard:view',
  'products:view',
  'orders:view',
  'orders:update',
  'inventory:view',
];

export const isValidPermission = (permission) => ALL_PERMISSIONS.includes(permission);

/** Drop anything not in the catalogue so a crafted payload cannot invent rights. */
export const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions.filter(isValidPermission))];
};
