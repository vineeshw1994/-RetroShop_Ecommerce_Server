import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadsRoot = path.resolve(__dirname, '../../uploads');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

ensureDir(uploadsRoot);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.uploadFolder || 'misc';
    cb(null, ensureDir(path.join(uploadsRoot, folder)));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxSize },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new AppError('Only JPG, PNG, WEBP, AVIF or GIF images are allowed', 400));
    }
    cb(null, true);
  },
});

/** Pick the subfolder that a route's uploads land in. */
export const intoFolder = (folder) => (req, res, next) => {
  req.uploadFolder = folder;
  next();
};

/** Public URL for a stored file, as saved on the model. */
export const toPublicUrl = (file) =>
  file ? `/uploads/${(file.destination.split(/[\\/]/).pop())}/${file.filename}` : null;

/** Best-effort cleanup of a previously stored upload. */
export const removeUpload = (publicUrl) => {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const absolute = path.join(uploadsRoot, publicUrl.replace('/uploads/', ''));
  fs.promises.unlink(absolute).catch(() => {});
};

export default upload;

const SPREADSHEET_EXT = new Set(['.xlsx', '.xls', '.csv']);

/** Accept Excel/CSV uploads for bulk product import. */
export const importSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SPREADSHEET_EXT.has(ext)) {
      return cb(new AppError('Upload an Excel (.xlsx) or CSV file', 400));
    }
    cb(null, true);
  },
});
