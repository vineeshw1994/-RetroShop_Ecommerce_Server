import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { uploadsRoot } from './middleware/upload.js';

/** Strip keys that could be used for operator injection before they reach Sequelize. */
const sanitizeKeys = (value) => {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.') || key === '__proto__') {
        delete value[key];
        continue;
      }
      sanitizeKeys(value[key]);
    }
  }
  return value;
};

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.body) sanitizeKeys(req.body);
  if (req.params) sanitizeKeys(req.params);
  next();
});

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please slow down' },
  })
);

app.use(
  '/uploads',
  express.static(uploadsRoot, {
    maxAge: '7d',
    fallthrough: true,
  })
);

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
