import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import {
  CATEGORY_IMPORT_HEADERS,
  SAMPLE_CATEGORY_ROWS,
} from '../src/services/categoryImport.template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workbook = new ExcelJS.Workbook();
workbook.created = new Date();

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
[
  'Bulk category import guide',
  '',
  '1. Fill category rows on the Categories sheet.',
  '2. Leave parentSlug empty for top-level categories.',
  '3. Set parentSlug to the parent slug for sub-categories.',
  '4. Import from Admin → Categories → Import.',
].forEach((line) => guide.addRow([line]));
guide.getColumn(1).width = 88;
guide.getRow(1).font = { bold: true };

const output = path.resolve(__dirname, '../../category-import-template.xlsx');
await workbook.xlsx.writeFile(output);
console.log(`Template written to ${output}`);
