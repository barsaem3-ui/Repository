
const fs = require('fs');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const sharedStringsEntry = zip.getEntry('xl/sharedStrings.xml');
let sharedStrings = [];
if (sharedStringsEntry) {
    const xml = sharedStringsEntry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const si = parsed.sst.si;
    if (Array.isArray(si)) {
        sharedStrings = si.map(s => s.t || (s.r ? s.r.map(r => r.t).join('') : ''));
    } else if (si) {
        sharedStrings = [si.t || ''];
    }
}

const sheetEntry = zip.getEntry('xl/worksheets/sheet1.xml');
if (sheetEntry) {
    const xml = sheetEntry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const rows = parsed.worksheet.sheetData.row;
    const firstRow = Array.isArray(rows) ? rows[0] : rows;
    
    let headers = [];
    const cells = Array.isArray(firstRow.c) ? firstRow.c : [firstRow.c];
    for (let cell of cells) {
        if (!cell) continue;
        let val = cell.v;
        if (cell['@_t'] === 's' && val !== undefined) {
            val = sharedStrings[parseInt(val)];
        }
        headers.push(val);
    }
    console.log('Sheet 1 Headers:', headers);
}

