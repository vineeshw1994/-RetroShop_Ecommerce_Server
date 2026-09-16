import { Router } from 'express';
import * as basket from '../controllers/basket.controller.js';
import { protectCustomer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  addToBasketValidator,
  updateBasketValidator,
  idParam,
} from '../validators/shop.validator.js';

const router = Router();

router.use(protectCustomer);

router.get('/', basket.getBasket);
router.post('/', addToBasketValidator, validate, basket.addToBasket);
router.post('/coupon', basket.applyCoupon);
router.post('/merge', basket.mergeBasket);
router.patch('/:id', updateBasketValidator, validate, basket.updateBasketItem);
router.delete('/:id', idParam, validate, basket.removeBasketItem);
router.delete('/', basket.clearBasket);

export default router;
