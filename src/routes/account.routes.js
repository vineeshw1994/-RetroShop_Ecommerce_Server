import { Router } from 'express';
import * as account from '../controllers/account.controller.js';
import { protectCustomer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import upload, { intoFolder } from '../middleware/upload.js';
import {
  updateProfileValidator,
  changePasswordValidator,
} from '../validators/auth.validator.js';
import {
  addressValidator,
  gameRequestValidator,
  reviewValidator,
  idParam,
  paginationQuery,
} from '../validators/shop.validator.js';

const router = Router();

router.use(protectCustomer);

router.get('/overview', account.getOverview);
router.patch('/profile', updateProfileValidator, validate, account.updateProfile);
router.patch(
  '/avatar',
  intoFolder('avatars'),
  upload.single('avatar'),
  account.updateAvatar
);
router.patch('/password', changePasswordValidator, validate, account.changePassword);

router.get('/addresses', account.listAddresses);
router.post('/addresses', addressValidator, validate, account.createAddress);
router.patch('/addresses/:id', idParam, addressValidator, validate, account.updateAddress);
router.delete('/addresses/:id', idParam, validate, account.deleteAddress);

router.get('/wishlist', paginationQuery, validate, account.listWishlist);
router.post('/wishlist/toggle', account.toggleWishlist);

router.get('/game-requests', paginationQuery, validate, account.listGameRequests);
router.post('/game-requests', gameRequestValidator, validate, account.createGameRequest);
router.delete('/game-requests/:id', idParam, validate, account.deleteGameRequest);

router.post('/reviews', reviewValidator, validate, account.createReview);

export default router;
