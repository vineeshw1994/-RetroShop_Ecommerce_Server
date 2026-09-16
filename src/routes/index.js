import { Router } from 'express';
import authRoutes from './auth.routes.js';
import catalogRoutes from './catalog.routes.js';
import basketRoutes from './basket.routes.js';
import orderRoutes from './order.routes.js';
import accountRoutes from './account.routes.js';
import adminRoutes from './admin.routes.js';
import * as contact from '../controllers/contact.controller.js';
import config from '../config/index.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    data: {
      environment: config.nodeEnv,
      turnstileEnabled: Boolean(config.turnstile.secretKey),
    },
  });
});

router.use('/auth', authRoutes);
router.use('/shop', catalogRoutes);
router.use('/basket', basketRoutes);
router.use('/orders', orderRoutes);
router.use('/account', accountRoutes);
router.use('/admin', adminRoutes);
router.post('/contact', contact.submitContact);

export default router;
