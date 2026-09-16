import { Router } from 'express';
import * as products from '../controllers/admin/product.controller.js';
import * as categories from '../controllers/admin/category.controller.js';
import * as banners from '../controllers/admin/banner.controller.js';
import * as orders from '../controllers/admin/order.controller.js';
import * as inventory from '../controllers/admin/inventory.controller.js';
import * as customers from '../controllers/admin/customer.controller.js';
import * as staff from '../controllers/admin/staff.controller.js';
import * as requests from '../controllers/admin/request.controller.js';
import * as reports from '../controllers/admin/report.controller.js';
import * as profile from '../controllers/admin/profile.controller.js';
import * as coupons from '../controllers/admin/coupon.controller.js';
import * as contacts from '../controllers/admin/contact.controller.js';
import * as transactions from '../controllers/admin/transaction.controller.js';
import * as settings from '../controllers/admin/settings.controller.js';
import * as returns from '../controllers/admin/return.controller.js';
import * as uploads from '../controllers/admin/upload.controller.js';
import * as imports from '../controllers/admin/import.controller.js';
import { protectAdmin, requireSuperAdmin, can } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import upload, { intoFolder, importSpreadsheet } from '../middleware/upload.js';
import { changePasswordValidator } from '../validators/auth.validator.js';
import { idParam, paginationQuery } from '../validators/shop.validator.js';
import {
  productValidator,
  productUpdateValidator,
  categoryValidator,
  bannerValidator,
  orderStatusValidator,
  staffValidator,
  staffUpdateValidator,
  stockAdjustValidator,
  gameRequestResponseValidator,
} from '../validators/admin.validator.js';

const router = Router();

router.use(protectAdmin);

/* Uploaded media library */
router.get('/uploads', uploads.listUploads);
router.post(
  '/uploads/products',
  can('products:update'),
  intoFolder('products'),
  upload.array('images', 32),
  uploads.uploadProductImages
);

/* Product import */
router.get('/products/import/template', can('products:create'), imports.downloadProductTemplate);
router.post(
  '/products/import',
  can('products:create'),
  importSpreadsheet.single('file'),
  imports.importProducts
);

/* Own profile - every signed-in admin can manage this. */
router.patch('/profile', profile.updateProfile);
router.patch('/profile/avatar', intoFolder('avatars'), upload.single('avatar'), profile.updateAvatar);
router.patch('/profile/password', changePasswordValidator, validate, profile.changePassword);

/* Dashboard and reports */
router.get('/dashboard', can('dashboard:view'), reports.getDashboard);
router.get('/alerts', can('dashboard:view'), reports.getAlerts);
router.get('/reports/sales', can('reports:view'), reports.getSalesReport);
router.get('/reports/products', can('reports:view'), reports.getProductReport);
router.get('/reports/customers', can('reports:view'), reports.getCustomerReport);
router.get('/reports/sales/export', can('reports:view'), reports.exportSalesReport);
router.get('/reports/products/export', can('reports:view'), reports.exportProductReport);
router.get('/reports/customers/export', can('reports:view'), reports.exportCustomerReport);

/* Products */
router.get('/products', can('products:view'), paginationQuery, validate, products.listProducts);
router.get('/products/:id', can('products:view'), idParam, validate, products.getProduct);
const productUpload = upload.fields([
  { name: 'images', maxCount: 8 },
  { name: 'cardImage', maxCount: 1 },
]);

router.post(
  '/products',
  can('products:create'),
  intoFolder('products'),
  productUpload,
  productValidator,
  validate,
  products.createProduct
);
router.patch(
  '/products/:id',
  can('products:update'),
  intoFolder('products'),
  productUpload,
  idParam,
  productUpdateValidator,
  validate,
  products.updateProduct
);
router.post(
  '/products/:id/clone',
  can('products:create'),
  idParam,
  validate,
  products.cloneProduct
);
router.post('/products/bulk', can('products:update'), products.bulkUpdate);
router.delete('/products/:id', can('products:delete'), idParam, validate, products.deleteProduct);
router.delete(
  '/products/:id/images/:imageId',
  can('products:update'),
  products.deleteProductImage
);
router.patch(
  '/products/:id/images/:imageId/primary',
  can('products:update'),
  products.setPrimaryImage
);

/* Categories */
router.get('/categories/import/template', can('categories:create'), imports.downloadCategoryTemplate);
router.post(
  '/categories/import',
  can('categories:create'),
  importSpreadsheet.single('file'),
  imports.importCategories
);

router.get('/categories', can('categories:view'), paginationQuery, validate, categories.listCategories);
router.get('/categories/tree', can('categories:view'), categories.getCategoryTree);
router.post(
  '/categories',
  can('categories:create'),
  intoFolder('categories'),
  upload.single('image'),
  categoryValidator,
  validate,
  categories.createCategory
);
router.patch(
  '/categories/:id',
  can('categories:update'),
  intoFolder('categories'),
  upload.single('image'),
  idParam,
  validate,
  categories.updateCategory
);
router.post('/categories/reorder', can('categories:update'), categories.reorderCategories);
router.delete('/categories/:id', can('categories:delete'), idParam, validate, categories.deleteCategory);

/* Banners */
const bannerUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
]);

router.get('/banners', can('banners:view'), paginationQuery, validate, banners.listBanners);
router.get('/banners/:id', can('banners:view'), idParam, validate, banners.getBanner);
router.post(
  '/banners',
  can('banners:create'),
  intoFolder('banners'),
  bannerUpload,
  bannerValidator,
  validate,
  banners.createBanner
);
router.patch(
  '/banners/:id',
  can('banners:update'),
  intoFolder('banners'),
  bannerUpload,
  idParam,
  validate,
  banners.updateBanner
);
router.post('/banners/reorder', can('banners:update'), banners.reorderBanners);
router.delete('/banners/:id', can('banners:delete'), idParam, validate, banners.deleteBanner);

/* Orders */
router.get('/orders', can('orders:view'), paginationQuery, validate, orders.listOrders);
router.get('/orders/export', can('orders:view'), orders.exportOrders);
router.get('/orders/:id', can('orders:view'), idParam, validate, orders.getOrder);
router.patch(
  '/orders/:id/status',
  can('orders:update'),
  idParam,
  orderStatusValidator,
  validate,
  orders.updateOrderStatus
);
router.patch('/orders/:id', can('orders:update'), idParam, validate, orders.updateOrderDetails);
router.delete('/orders/:id', can('orders:delete'), idParam, validate, orders.deleteOrder);
router.post('/orders/:id/refund', can('orders:update'), idParam, validate, transactions.refundOrderPayment);

/* Stripe card transactions */
router.get('/transactions', can('orders:view'), transactions.listTransactions);
router.post('/transactions/refund', can('orders:update'), transactions.refundByPaymentIntent);

/* Shop settings */
router.get('/settings', can('settings:view'), settings.getSettings);
router.patch('/settings', can('settings:update'), settings.patchSettings);

/* Return requests */
router.get('/returns', can('orders:view'), paginationQuery, validate, returns.listReturnRequests);
router.patch('/returns/:id', can('orders:update'), idParam, validate, returns.respondToReturnRequest);

/* Inventory */
router.get('/inventory', can('inventory:view'), paginationQuery, validate, inventory.listInventory);
router.get('/inventory/logs', can('inventory:view'), paginationQuery, validate, inventory.listInventoryLogs);
router.get('/inventory/alerts', can('inventory:view'), inventory.getLowStockAlerts);
router.post(
  '/inventory/:id/adjust',
  can('inventory:update'),
  idParam,
  stockAdjustValidator,
  validate,
  inventory.adjustStock
);
router.patch('/inventory/:id', can('inventory:update'), idParam, validate, inventory.setStock);

/* Customers */
router.get('/customers', can('customers:view'), paginationQuery, validate, customers.listCustomers);
router.get('/customers/export', can('customers:view'), customers.exportCustomers);
router.get('/customers/:id', can('customers:view'), idParam, validate, customers.getCustomer);
router.patch(
  '/customers/:id/status',
  can('customers:update'),
  idParam,
  validate,
  customers.setCustomerStatus
);

/* Game requests */
router.get('/requests', can('requests:view'), paginationQuery, validate, requests.listRequests);
router.patch(
  '/requests/:id',
  can('requests:update'),
  idParam,
  gameRequestResponseValidator,
  validate,
  requests.respondToRequest
);
router.delete('/requests/:id', can('requests:update'), idParam, validate, requests.deleteRequest);

/* Staff - creating and deleting accounts is super-admin only. */
router.get('/staff/permissions', can('staff:view'), staff.getPermissionCatalogue);
router.get('/staff', can('staff:view'), paginationQuery, validate, staff.listStaff);
router.get('/staff/:id', can('staff:view'), idParam, validate, staff.getStaff);
router.post(
  '/staff',
  requireSuperAdmin,
  intoFolder('avatars'),
  upload.single('avatar'),
  staffValidator,
  validate,
  staff.createStaff
);
router.patch(
  '/staff/:id',
  requireSuperAdmin,
  intoFolder('avatars'),
  upload.single('avatar'),
  idParam,
  staffUpdateValidator,
  validate,
  staff.updateStaff
);
router.patch(
  '/staff/:id/permissions',
  requireSuperAdmin,
  idParam,
  validate,
  staff.updateStaffPermissions
);
router.post('/staff/:id/reset-password', requireSuperAdmin, idParam, validate, staff.resetStaffPassword);
router.delete('/staff/:id', requireSuperAdmin, idParam, validate, staff.deleteStaff);

/* Coupons */
router.get('/coupons', can('coupons:view'), paginationQuery, validate, coupons.listCoupons);
router.get('/coupons/:id', can('coupons:view'), idParam, validate, coupons.getCoupon);
router.post('/coupons', can('coupons:create'), coupons.createCoupon);
router.patch('/coupons/:id', can('coupons:update'), idParam, validate, coupons.updateCoupon);
router.delete('/coupons/:id', can('coupons:delete'), idParam, validate, coupons.deleteCoupon);

/* Contact messages */
router.get('/contacts', can('contacts:view'), paginationQuery, validate, contacts.listContacts);
router.get('/contacts/:id', can('contacts:view'), idParam, validate, contacts.getContact);
router.post('/contacts/:id/reply', can('contacts:update'), idParam, validate, contacts.replyToContact);

export default router;
