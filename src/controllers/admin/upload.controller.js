import fs from 'fs';
import path from 'path';
import { uploadsRoot, toPublicUrl } from '../../middleware/upload.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const BROWSE_FOLDERS = ['products', 'categories', 'banners', 'avatars', 'misc'];

const listFolderFiles = async (folder) => {
  const dir = path.join(uploadsRoot, folder);
  if (!fs.existsSync(dir)) return [];

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;

    const absolute = path.join(dir, entry.name);
    const stat = await fs.promises.stat(absolute);

    files.push({
      url: `/uploads/${folder}/${entry.name}`,
      name: entry.name,
      folder,
      size: stat.size,
      updatedAt: stat.mtime,
    });
  }

  return files;
};

/** Browse files already stored under /uploads for reuse in admin forms. */
export const listUploads = asyncHandler(async (req, res) => {
  const folder = req.query.folder;
  const search = req.query.search?.trim().toLowerCase();
  const folders = folder && BROWSE_FOLDERS.includes(folder) ? [folder] : BROWSE_FOLDERS;

  let files = [];
  for (const name of folders) {
    files.push(...(await listFolderFiles(name)));
  }

  if (search) {
    files = files.filter(
      (file) =>
        file.name.toLowerCase().includes(search) ||
        file.folder.toLowerCase().includes(search)
    );
  }

  files.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 48));
  const offset = (page - 1) * limit;
  const total = files.length;

  res.json({
    success: true,
    data: files.slice(offset, offset + limit),
    meta: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

/** Upload one or more images straight into uploads/products for bulk imports and forms. */
export const uploadProductImages = asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];

  if (!files.length) {
    throw new AppError('Choose at least one image to upload', 400);
  }

  const uploaded = files.map((file) => ({
    url: toPublicUrl(file),
    name: file.filename,
    folder: 'products',
    size: file.size,
    updatedAt: new Date().toISOString(),
  }));

  res.status(201).json({
    success: true,
    message: `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded to products`,
    data: uploaded,
  });
});
