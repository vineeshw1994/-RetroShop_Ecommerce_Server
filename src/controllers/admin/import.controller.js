import ExcelJS from 'exceljs';
import asyncHandler from '../../utils/asyncHandler.js';
import AppError from '../../utils/AppError.js';
import {
  CATEGORY_REFERENCE_ROWS,
  PRODUCT_IMPORT_HEADERS,
  SAMPLE_PRODUCT_ROWS,
} from '../../services/productImport.template.js';
import { importProductsFromSpreadsheet } from '../../services/productImport.service.js';

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
