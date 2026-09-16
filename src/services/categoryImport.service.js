import fs from 'fs';
import path from 'path';
import slugify from 'slugify';
import ExcelJS from 'exceljs';
import { Category } from '../models/index.js';
import { uniqueSlug } from '../helpers/slug.js';
import { uploadsRoot } from '../middleware/upload.js';
import AppError from '../utils/AppError.js';
import { CATEGORY_IMPORT_HEADERS } from './categoryImport.template.js';

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .toLowerCase();

const HEADER_ALIASES = new Map(
  CATEGORY_IMPORT_HEADERS.flatMap((header) => [
    [normalizeKey(header), header],
    [normalizeKey(header.replace(/([A-Z])/g, ' $1')), header],
    [normalizeKey(header.replace(/Slug/g, ' Slug')), header],
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

const parseInteger = (value) => {
  const raw = cellText(value).replace(/[£$,]/g, '');
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const resolveImagePath = (value) => {
  const raw = cellText(value);
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw;
  return `/uploads/categories/${raw.replace(/^\/+/, '')}`;
};

const imageExists = (publicUrl) => {
  if (!publicUrl?.startsWith('/uploads/')) return false;
  const absolute = path.join(uploadsRoot, publicUrl.replace('/uploads/', ''));
  return fs.existsSync(absolute);
};

export const parseCategorySpreadsheet = async (buffer, filename = '') => {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.csv') {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new AppError('The spreadsheet has no category rows', 422);

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
    workbook.getWorksheet('Categories') ||
    workbook.worksheets.find((entry) => normalizeKey(entry.name) === 'categories') ||
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

const createCategory = async ({
  row,
  rowNumber,
  parentId,
  summary,
}) => {
  const name = cellText(row.name);
  const slugInput = cellText(row.slug);
  const image = resolveImagePath(row.image);

  const isParent = !parentId;

  if (!name) throw new Error('Category name is required');

  let slug;

  if (slugInput) {
    slug =
      slugify(slugInput, { lower: true, strict: true, trim: true }) ||
      slugify(name, { lower: true, strict: true, trim: true }) ||
      'category';

    const existingSlug = await Category.findOne({ where: { slug } });
    if (existingSlug) {
      summary.skipped += 1;
      summary.errors.push({
        row: rowNumber,
        name,
        message: `Slug "${slug}" already exists — row skipped`,
      });
      return null;
    }
  } else {
    slug = await uniqueSlug(Category, name);
  }

  if (image && !imageExists(image)) {
    summary.warnings.push({
      row: rowNumber,
      name,
      message: `Image not found on disk: ${image}`,
    });
  }

  const isFeatured = isParent ? parseBoolean(row.isFeatured, false) : false;
  if (!isParent && cellText(row.isFeatured)) {
    summary.warnings.push({
      row: rowNumber,
      name,
      message: 'isFeatured only applies to parent categories — ignored for sub-category',
    });
  }

  const category = await Category.create({
    name,
    slug,
    description: cellText(row.description) || null,
    parentId,
    sortOrder: parseInteger(row.sortOrder) ?? 0,
    isActive: parseBoolean(row.isActive, true),
    isFeatured,
    image,
  });

  summary.created += 1;
  return category;
};

export const importCategoriesFromSpreadsheet = async (buffer, filename) => {
  const { headers, rows } = await parseCategorySpreadsheet(buffer, filename);

  if (!headers.length) throw new AppError('Missing column headers in row 1', 422);
  if (!rows.length) throw new AppError('No category rows found below the header row', 422);

  const mappedRows = rows.map((cells, index) => ({
    rowNumber: index + 2,
    data: mapRow(headers, cells),
  }));

  const summary = {
    totalRows: rows.length,
    created: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  };

  const slugToCategory = new Map(
    (await Category.findAll({ attributes: ['id', 'slug', 'parentId'] })).map((entry) => [
      entry.slug.toLowerCase(),
      entry,
    ])
  );

  const parentRows = mappedRows.filter(({ data }) => !cellText(data.parentSlug));
  const subRows = mappedRows.filter(({ data }) => cellText(data.parentSlug));

  for (const { rowNumber, data } of parentRows) {
    try {
      const category = await createCategory({
        row: data,
        rowNumber,
        parentId: null,
        summary,
      });

      if (category) slugToCategory.set(category.slug.toLowerCase(), category);
    } catch (caught) {
      summary.skipped += 1;
      summary.errors.push({
        row: rowNumber,
        name: cellText(data.name) || '—',
        message: caught.message || 'Could not import row',
      });
    }
  }

  for (const { rowNumber, data } of subRows) {
    try {
      const parentSlug = cellText(data.parentSlug).toLowerCase();
      const parent = slugToCategory.get(parentSlug);

      if (!parent) {
        throw new Error(
          `Unknown parentSlug "${data.parentSlug}". Create the parent category first or check the slug.`
        );
      }

      if (parent.parentId) {
        throw new Error(`"${data.parentSlug}" is a sub-category — categories can only nest one level deep`);
      }

      const category = await createCategory({
        row: data,
        rowNumber,
        parentId: parent.id,
        summary,
      });

      if (category) slugToCategory.set(category.slug.toLowerCase(), category);
    } catch (caught) {
      summary.skipped += 1;
      summary.errors.push({
        row: rowNumber,
        name: cellText(data.name) || '—',
        message: caught.message || 'Could not import row',
      });
    }
  }

  return summary;
};
