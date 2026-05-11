
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function getStringValue(t) {
    if (t === undefined || t === null) return '';
    if (typeof t === 'string') return t;
    if (typeof t === 'object' && t['#text']) return t['#text'];
    return String(t);
}

const sharedStringsEntry = zip.getEntry('xl/sharedStrings.xml');
let sharedStrings = [];
if (sharedStringsEntry) {
    const xml = sharedStringsEntry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const si = parsed?.sst?.si;
    if (Array.isArray(si)) {
        sharedStrings = si.map(s => {
            if (s.t !== undefined) return getStringValue(s.t);
            if (s.r) {
                if (Array.isArray(s.r)) return s.r.map(r => getStringValue(r.t)).join('');
                return getStringValue(s.r.t);
            }
            return '';
        });
    }
}

const workbookEntry = zip.getEntry('xl/workbook.xml');
const wbParsed = parser.parse(workbookEntry.getData().toString('utf8'));
let sheets = wbParsed?.workbook?.sheets?.sheet;
if (!Array.isArray(sheets)) sheets = [sheets];

const relsEntry = zip.getEntry('xl/_rels/workbook.xml.rels');
const relsParsed = parser.parse(relsEntry.getData().toString('utf8'));
let relationships = relsParsed?.Relationships?.Relationship;
if (!Array.isArray(relationships)) relationships = [relationships];

const sheetIdToPath = {};
relationships.forEach(rel => {
    sheetIdToPath[rel['@_Id']] = 'xl/' + rel['@_Target'];
});

for (const sheet of sheets) {
    if (sheet['@_name'] !== '심지난로_자동급유기') continue;
    
    const sheetPath = sheetIdToPath[sheet['@_id']];
    const sheetEntry = zip.getEntry(sheetPath);
    if (!sheetEntry) continue;
    
    const sheetParsed = parser.parse(sheetEntry.getData().toString('utf8'));
    let rows = sheetParsed?.worksheet?.sheetData?.row;
    if (!Array.isArray(rows)) rows = [rows];
    
    let targetRowIndex = -1;
    for (const row of rows) {
        let cells = row.c;
        if (!cells) continue;
        if (!Array.isArray(cells)) cells = [cells];
        for (const cell of cells) {
            let val = cell.v;
            if (val === undefined) continue;
            if (cell['@_t'] === 's') val = sharedStrings[parseInt(val)];
            if (typeof val === 'string' && val.includes('구형')) {
                console.log('Found ', val, ' at row index:', parseInt(row['@_r']) - 1);
            }
        }
    }
}

