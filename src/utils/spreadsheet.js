import ExcelJS from 'exceljs';

const stamp = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

export const sendCsv = (res, filename, headers, rows) => {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const body = [headers, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp()}.csv"`);
  res.send(body);
};

export const sendXlsx = async (res, filename, sheetName, headers, rows) => {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp()}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
};

export const sendTable = async (res, { filename, sheetName, headers, rows, format }) => {
  if (format === 'xlsx') {
    await sendXlsx(res, filename, sheetName, headers, rows);
    return;
  }
  sendCsv(res, filename, headers, rows);
};
