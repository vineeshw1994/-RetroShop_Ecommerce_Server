import ExcelJS from 'exceljs';
import asyncHandler from '../../utils/asyncHandler.js';
import AppError from '../../utils/AppError.js';
import {
  CATEGORY_REFERENCE_ROWS,
  PRODUCT_IMPORT_HEADERS,
  SAMPLE_PRODUCT_ROWS,
} from '../../services/productImport.template.js';
import {
  CATEGORY_IMPORT_HEADERS,
  SAMPLE_CATEGORY_ROWS,
} from '../../services/categoryImport.template.js';
import { importProductsFromSpreadsheet } from '../../services/productImport.service.js';
import { importCategoriesFromSpreadsheet } from '../../services/categoryImport.service.js';

const buildTemplateWorkbook = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Retro Shop Admin';

  const products = workbook.addWorksheet('Products');
  products.addRow(PRODUCT_IMPORT_HEADERS);
  SAMPLE_PRODUCT_ROWS.forEach((row) => products.addRow(row));
  products.getRow(1).font = { bold: true };
  products.views = [{ state: 'frozen', ySplit: 1 }];
  products.columns = PRODUCT_IMPORT_HEADERS.map((header, index) => ({
    header,
    key: header,
    width: index === 0 ? 34 : index === 14 ? 42 : 16,
  }));

  const categories = workbook.addWorksheet('Categories');
  categories.addRow(['parentCategory', 'subCategory', 'categorySlug']);
  CATEGORY_REFERENCE_ROWS.forEach((row) => categories.addRow(row));
  categories.getRow(1).font = { bold: true };
  categories.columns = [{ width: 18 }, { width: 18 }, { width: 18 }];

  const guide = workbook.addWorksheet('Instructions');
  guide.addRow(['Bulk product import guide']);
  guide.addRow([]);
  guide.addRow(['1. Fill product rows on the Products sheet. Do not rename the header row.']);
  guide.addRow(['2. Use categorySlug values from the Categories sheet (sub-category slugs).']);
  guide.addRow([
    '3. Put your 15 image files in ecommerce_server/uploads/products/ using the cardImage filenames.',
  ]);
  guide.addRow(['4. cardImage can be a filename (product-01.jpg) or full path (/uploads/products/file.jpg).']);
  guide.addRow(['5. galleryImages accepts multiple files separated by semicolons.']);
  guide.addRow(['6. isActive / isFeatured accept yes or no.']);
  guide.addRow(['7. Upload the saved workbook from Admin → Import products.']);
  guide.getColumn(1).width = 92;
  guide.getRow(1).font = { bold: true };

  return workbook;
};

export const downloadProductTemplate = asyncHandler(async (req, res) => {
  const workbook = await buildTemplateWorkbook();

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="product-import-template-15-items.xlsx"'
  );

  await workbook.xlsx.write(res);
  res.end();
});

export const importProducts = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw new AppError('Upload an Excel (.xlsx) or CSV file', 400);

  const summary = await importProductsFromSpreadsheet(
    req.file.buffer,
    req.file.originalname,
    req.admin.id
  );

  res.json({
    success: true,
    message: `${summary.created} product(s) imported, ${summary.skipped} row(s) skipped`,
    data: summary,
  });
});

const buildCategoryTemplateWorkbook = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Retro Shop Admin';

  const categories = workbook.addWorksheet('Categories');
  categories.addRow(CATEGORY_IMPORT_HEADERS);
  SAMPLE_CATEGORY_ROWS.forEach((row) => categories.addRow(row));
  categories.getRow(1).font = { bold: true };
  categories.views = [{ state: 'frozen', ySplit: 1 }];
  categories.columns = CATEGORY_IMPORT_HEADERS.map((header, index) => ({
    header,
    key: header,
    width: index === 3 ? 42 : index === 0 ? 22 : 16,
  }));

  const guide = workbook.addWorksheet('Instructions');
  guide.addRow(['Bulk category import guide']);
  guide.addRow([]);
  guide.addRow(['1. Fill category rows on the Categories sheet. Do not rename the header row.']);
  guide.addRow(['2. Leave parentSlug empty for top-level categories (Accessories, Games, Tech, etc.).']);
  guide.addRow(['3. Set parentSlug to the parent category slug for sub-categories (e.g. cables → accessories).']);
  guide.addRow(['4. Slug is optional — it is auto-generated from name when left blank.']);
  guide.addRow(['5. isFeatured only applies to parent categories shown on the homepage.']);
  guide.addRow(['6. Image can be a filename (category-01.jpg) or full path (/uploads/categories/file.jpg).']);
  guide.addRow(['7. Import parent rows before sub-categories, or use the sample order in the template.']);
  guide.addRow(['8. Upload the saved workbook from Admin → Categories → Import.']);
  guide.getColumn(1).width = 92;
  guide.getRow(1).font = { bold: true };

  return workbook;
};

export const downloadCategoryTemplate = asyncHandler(async (req, res) => {
  const workbook = await buildCategoryTemplateWorkbook();

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="category-import-template.xlsx"'
  );

  await workbook.xlsx.write(res);
  res.end();
});

export const importCategories = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw new AppError('Upload an Excel (.xlsx) or CSV file', 400);

  const summary = await importCategoriesFromSpreadsheet(
    req.file.buffer,
    req.file.originalname
  );

  res.json({
    success: true,
    message: `${summary.created} category(s) imported, ${summary.skipped} row(s) skipped`,
    data: summary,
  });
});
