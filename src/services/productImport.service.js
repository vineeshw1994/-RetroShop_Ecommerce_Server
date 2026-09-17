import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { sequelize, Product, ProductImage, Category, InventoryLog } from '../models/index.js';
import { uniqueSlug } from '../helpers/slug.js';
import { uploadsRoot } from '../middleware/upload.js';
import AppError from '../utils/AppError.js';
import { PRODUCT_IMPORT_HEADERS } from './productImport.template.js';

const VALID_CONDITIONS = new Set(['new', 'like_new', 'very_good', 'good', 'fair']);

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .toLowerCase();

const HEADER_ALIASES = new Map(
  PRODUCT_IMPORT_HEADERS.flatMap((header) => [
    [normalizeKey(header), header],
    [normalizeKey(header.replace(/([A-Z])/g, ' $1')), header],
  ])
);

const cellText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.text) return String(value.text).trim();
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
};

const parseBoolean = (value, fallback = true) => {
  const raw = cellText(value).toLowerCase();
  if (!raw) return fallback;
  if (['yes', 'true', '1', 'y', 'active'].includes(raw)) return true;
  if (['no', 'false', '0', 'n', 'inactive'].includes(raw)) return false;
  return fallback;
};

const parseNumber = (value) => {
  const raw = cellText(value).replace(/[£$₹,]/g, '');
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseInteger = (value) => {
  const numeric = parseNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
};

const resolveImagePath = (value) => {
  const raw = cellText(value);
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw;
  return `/uploads/products/${raw.replace(/^\/+/, '')}`;
};

const splitGallery = (value) => {
  const raw = cellText(value);
  if (!raw) return [];
  return raw
    .split(/[;,|]/)
    .map((entry) => resolveImagePath(entry))
    .filter(Boolean);
};

const imageExists = (publicUrl) => {
  if (!publicUrl?.startsWith('/uploads/')) return false;
  const absolute = path.join(uploadsRoot, publicUrl.replace('/uploads/', ''));
  return fs.existsSync(absolute);
};

export const parseProductSpreadsheet = async (buffer, filename = '') => {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.csv') {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new AppError('The spreadsheet has no product rows', 422);

    const headers = lines[0].split(',').map((entry) => entry.replace(/^"|"$/g, '').trim());
    const rows = lines.slice(1).map((line) => {
      const cells = [];
      let current = '';
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
          continue;
        }
        if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
          continue;
        }
        current += char;
      }
      cells.push(current.trim());
      return cells;
    });

    return { headers, rows };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet =
    workbook.getWorksheet('Products') ||
    workbook.worksheets.find((entry) => normalizeKey(entry.name) === 'products') ||
    workbook.worksheets[0];

  if (!sheet) throw new AppError('No worksheet found in the uploaded file', 422);

  const headerRow = sheet.getRow(1);
  const headers = headerRow.values
    .slice(1)
    .map((value) => cellText(value))
    .filter(Boolean);

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1).map((value) => cellText(value));
    if (values.every((value) => !value)) return;
    rows.push(values);
  });

  return { headers, rows };
};

const mapRow = (headers, cells) => {
  const record = {};

  headers.forEach((header, index) => {
    const key = HEADER_ALIASES.get(normalizeKey(header)) || header;
    record[key] = cells[index] ?? '';
  });

  return record;
};

export const importProductsFromSpreadsheet = async (buffer, filename, adminId) => {
  const { headers, rows } = await parseProductSpreadsheet(buffer, filename);

  if (!headers.length) throw new AppError('Missing column headers in row 1', 422);
  if (!rows.length) throw new AppError('No product rows found below the header row', 422);

  const categories = await Category.findAll({ attributes: ['id', 'slug', 'name'] });
  const categoryBySlug = new Map(categories.map((entry) => [entry.slug.toLowerCase(), entry]));

  const summary = {
    totalRows: rows.length,
    created: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  };

  for (const [index, cells] of rows.entries()) {
    const rowNumber = index + 2;
    const row = mapRow(headers, cells);

    try {
      const name = cellText(row.name);
      const sku = cellText(row.sku);
      const categorySlug = cellText(row.categorySlug).toLowerCase();

      if (!name) throw new Error('Product name is required');
      if (!sku) throw new Error('SKU is required');
      if (!categorySlug) throw new Error('categorySlug is required');

      const category = categoryBySlug.get(categorySlug);
      if (!category) {
        throw new Error(`Unknown categorySlug "${row.categorySlug}". Use a slug from the Categories sheet.`);
      }

      const existingSku = await Product.findOne({ where: { sku } });
      if (existingSku) {
        summary.skipped += 1;
        summary.errors.push({ row: rowNumber, sku, message: `SKU "${sku}" already exists — row skipped` });
        continue;
      }

      const price = parseNumber(row.price);
      if (price === null || price < 0) throw new Error('Enter a valid price');

      const salePrice = parseNumber(row.salePrice);
      if (salePrice !== null && salePrice >= price) {
        throw new Error('salePrice must be lower than price');
      }

      const condition = cellText(row.condition).toLowerCase() || 'very_good';
      if (!VALID_CONDITIONS.has(condition)) {
        throw new Error(`Invalid condition "${row.condition}"`);
      }

      const cardImage = resolveImagePath(row.cardImage);
      const galleryUrls = splitGallery(row.galleryImages);
      if (cardImage && !galleryUrls.includes(cardImage)) galleryUrls.unshift(cardImage);
      const uniqueGallery = [...new Set(galleryUrls)].slice(0, 8);

      uniqueGallery.forEach((url) => {
        if (!imageExists(url)) {
          summary.warnings.push({
            row: rowNumber,
            sku,
            message: `Image not found on disk: ${url}`,
          });
        }
      });

      const stock = Math.max(0, parseInteger(row.stock) ?? 0);

      await sequelize.transaction(async (transaction) => {
        const product = await Product.create(
          {
            name,
            slug: await uniqueSlug(Product, name),
            sku,
            categoryId: category.id,
            brand: cellText(row.brand) || null,
            platform: cellText(row.platform) || null,
            condition,
            shortDescription: cellText(row.shortDescription) || null,
            description: cellText(row.description) || null,
            price,
            salePrice,
            costPrice: parseNumber(row.costPrice),
            tradeInPrice: parseNumber(row.tradeInPrice),
            stock,
            lowStockThreshold: parseInteger(row.lowStockThreshold) ?? 3,
            warrantyMonths: parseInteger(row.warrantyMonths) ?? 12,
            isActive: parseBoolean(row.isActive, true),
            isFeatured: parseBoolean(row.isFeatured, false),
            cardImage,
            metaTitle: null,
            metaDescription: null,
          },
          { transaction }
        );

        for (const [imageIndex, url] of uniqueGallery.entries()) {
          await ProductImage.create(
            {
              productId: product.id,
              url,
              alt: name,
              sortOrder: imageIndex,
              isPrimary: imageIndex === 0,
            },
            { transaction }
          );
        }

        if (stock > 0) {
          await InventoryLog.create(
            {
              productId: product.id,
              type: 'restock',
              quantityChange: stock,
              stockAfter: stock,
              note: 'Initial stock from spreadsheet import',
              adminId,
            },
            { transaction }
          );
        }
      });

      summary.created += 1;
    } catch (caught) {
      summary.skipped += 1;
      summary.errors.push({
        row: rowNumber,
        sku: cellText(row.sku) || '—',
        message: caught.message || 'Could not import row',
      });
    }
  }

  return summary;
};
