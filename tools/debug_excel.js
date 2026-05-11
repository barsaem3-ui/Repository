const ExcelJS = require('exceljs');
const path = require('path');

async function debug() {
    const EXCEL_FILE = path.resolve(__dirname, 'pasco.xlsx');
    const workbook = new ExcelJS.Workbook();
    console.log('Reading file...');
    await workbook.xlsx.readFile(EXCEL_FILE);
    console.log('Sheets found:', workbook.worksheets.map(s => s.name));
    
    workbook.worksheets.forEach(sheet => {
        console.log(`--- Sheet: ${sheet.name} (Rows: ${sheet.rowCount}) ---`);
        for (let i = 1; i <= 5; i++) {
            const row = sheet.getRow(i);
            const values = [];
            row.eachCell({ includeEmpty: true }, cell => values.push(cell.text));
            console.log(`Row ${i}:`, values.join(' | '));
        }
    });
}

debug().catch(console.error);
