import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import {
  CATEGORY_REFERENCE_ROWS,
  PRODUCT_IMPORT_HEADERS,
  SAMPLE_PRODUCT_ROWS,
} from '../src/services/productImport.template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workbook = new ExcelJS.Workbook();
workbook.created = new Date();

const products = workbook.addWorksheet('Products');
products.addRow(PRODUCT_IMPORT_HEADERS);
SAMPLE_PRODUCT_ROWS.forEach((row) => products.addRow(row));
products.getRow(1).font = { bold: true };
products.views = [{ state: 'frozen', ySplit: 1 }];

const categories = workbook.addWorksheet('Categories');
categories.addRow(['parentCategory', 'subCategory', 'categorySlug']);
CATEGORY_REFERENCE_ROWS.forEach((row) => categories.addRow(row));
categories.getRow(1).font = { bold: true };

const guide = workbook.addWorksheet('Instructions');
[
  'Bulk product import guide',
  '',
  '1. Fill product rows on the Products sheet.',
  '2. Use categorySlug values from the Categories sheet.',
  '3. Copy your 15 images into ecommerce_server/uploads/products/ using cardImage filenames.',
  '4. Import the file from Admin → Import products.',
].forEach((line) => guide.addRow([line]));
guide.getColumn(1).width = 88;
guide.getRow(1).font = { bold: true };

const output = path.resolve(__dirname, '../product-import-template-15-items.xlsx');
await workbook.xlsx.writeFile(output);
console.log(`Template written to ${output}`);
