import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

const config = {
  port: Number(process.env.PORT) || 5000,

  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'retro_shop',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  resend: {
    apiKey: (process.env.RESEND_API_KEY || '').trim(),
    /** Use onboarding@resend.dev until your own domain is verified in Resend. */
    fromEmail: (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim(),
    fromName: (process.env.RESEND_FROM_NAME || 'Retro Shop').trim(),
  },

  /** Inbox for contact-form notifications (defaults to super admin email). */
  contactInboxEmail:
    (process.env.CONTACT_INBOX_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'admin@retroshop.dev').trim(),

  turnstile: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
    verifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  },

  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@retroshop.dev',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345',
  },

  uploadMaxSize: Number(process.env.UPLOAD_MAX_SIZE) || 8 * 1024 * 1024,

  otpExpiryMinutes: 10,

  shipping: {
    flatRate: Number(process.env.SHIPPING_FLAT_RATE) || 3.95,
    freeThreshold: Number(process.env.SHIPPING_FREE_THRESHOLD) || 50,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
};

export default config;
