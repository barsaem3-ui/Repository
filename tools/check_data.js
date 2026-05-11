const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const EXCEL_FILE = path.resolve(__dirname, '..', 'pasco.xlsx');

async function check() {
    console.log('Checking file:', EXCEL_FILE);
    if (!fs.existsSync(EXCEL_FILE)) {
        console.error('File does not exist!');
        return;
    }
    
    try {
        const stats = fs.statSync(EXCEL_FILE);
        console.log('File size:', stats.size, 'bytes');
        
        const workbook = new ExcelJS.Workbook();
        console.log('Reading workbook...');
        await workbook.xlsx.readFile(EXCEL_FILE);
        console.log('Workbook loaded successfully.');
        console.log('Sheets:', workbook.worksheets.map(s => s.name));
        
        const firstSheet = workbook.worksheets[0];
        if (firstSheet) {
            console.log('First sheet row count:', firstSheet.rowCount);
            const row1 = firstSheet.getRow(1).values;
            console.log('Row 1 values:', row1);
        }
    } catch (e) {
        console.error('Error reading excel:', e);
    }
}

check();
