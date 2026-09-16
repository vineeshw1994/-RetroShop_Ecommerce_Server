import { Router } from 'express';
import * as catalog from '../controllers/catalog.controller.js';
import { optionalCustomer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../validators/shop.validator.js';

const router = Router();

router.get('/home', catalog.getHomeFeed);
router.get('/settings', catalog.getShopSettings);
router.get('/banners', catalog.listBanners);
router.get('/categories', catalog.listCategories);
router.get('/categories/:slug', catalog.getCategoryBySlug);
router.get('/products', paginationQuery, validate, catalog.listProducts);
router.get('/products/filters', catalog.getFilterOptions);
router.get('/products/suggestions', catalog.searchSuggestions);
router.get('/products/:slug', optionalCustomer, catalog.getProductBySlug);

export default router;
