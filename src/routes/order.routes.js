import { Router } from 'express';
import * as orders from '../controllers/order.controller.js';
import { protectCustomer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { checkoutValidator, paginationQuery } from '../validators/shop.validator.js';

const router = Router();

router.use(protectCustomer);

router.post('/checkout', checkoutValidator, validate, orders.checkout);
router.get('/', paginationQuery, validate, orders.listMyOrders);
router.get('/:orderNumber', orders.getMyOrder);
router.post('/:orderNumber/pay', orders.confirmCardPayment);
router.post('/:orderNumber/cancel', orders.cancelMyOrder);
router.post('/:orderNumber/return-request', orders.requestReturn);

export default router;
