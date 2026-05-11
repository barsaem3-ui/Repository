
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const sharedStringsEntry = zip.getEntry('xl/sharedStrings.xml');
let sharedStrings = [];
if (sharedStringsEntry) {
    const xml = sharedStringsEntry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const si = parsed?.sst?.si;
    if (Array.isArray(si)) {
        sharedStrings = si.map(s => {
            if (s.t !== undefined) return typeof s.t === 'object' ? s.t['#text'] || '' : s.t;
            if (s.r) {
                if (Array.isArray(s.r)) return s.r.map(r => typeof r.t === 'object' ? r.t['#text'] || '' : r.t).join('');
                return typeof s.r.t === 'object' ? s.r.t['#text'] || '' : s.r.t;
            }
            return '';
        });
    }
}

console.log('Searching for 구형...');

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
    const sheetName = sheet['@_name'];
    const rId = sheet['@_id'];
    const sheetPath = sheetIdToPath[rId];
    
    const sheetEntry = zip.getEntry(sheetPath);
    if (!sheetEntry) continue;
    
    const sheetXml = sheetEntry.getData().toString('utf8');
    const sheetParsed = parser.parse(sheetXml);
    let rows = sheetParsed?.worksheet?.sheetData?.row;
    if (!rows) continue;
    if (!Array.isArray(rows)) rows = [rows];
    
    for (const row of rows) {
        let cells = row.c;
        if (!cells) continue;
        if (!Array.isArray(cells)) cells = [cells];
        
        let found = false;
        for (const cell of cells) {
            let val = cell.v;
            if (val === undefined) continue;
            if (cell['@_t'] === 's') val = sharedStrings[parseInt(val)];
            
            if (typeof val === 'string' && val.includes('구형')) {
                found = true;
                break;
            }
        }
        
        if (found) {
            console.log('Found in sheet:', sheetName, 'row:', row['@_r']);
            
            const sheetRelsPath = sheetPath.replace('worksheets/sheet', 'worksheets/_rels/sheet') + '.rels';
            const sheetRelsEntry = zip.getEntry(sheetRelsPath);
            if (sheetRelsEntry) {
                const sheetRelsXml = sheetRelsEntry.getData().toString('utf8');
                const sheetRelsParsed = parser.parse(sheetRelsXml);
                let sr = sheetRelsParsed?.Relationships?.Relationship;
                if (!Array.isArray(sr)) sr = [sr];
                
                sr.forEach(rel => {
                    if (rel['@_Type'].includes('drawing')) {
                        const drawingPath = 'xl/drawings/' + rel['@_Target'].split('/').pop();
                        const drawingEntry = zip.getEntry(drawingPath);
                        if (drawingEntry) {
                            const drawingXml = drawingEntry.getData().toString('utf8');
                            const drawingParsed = parser.parse(drawingXml);
                            
                            let anchors = drawingParsed?.['xdr:wsDr']?.['xdr:twoCellAnchor'] || [];
                            let oneCellAnchors = drawingParsed?.['xdr:wsDr']?.['xdr:oneCellAnchor'] || [];
                            if (!Array.isArray(anchors)) anchors = [anchors];
                            if (!Array.isArray(oneCellAnchors)) oneCellAnchors = [oneCellAnchors];
                            
                            const targetRowIndex = parseInt(row['@_r']) - 1; // 0-based
                            
                            [...anchors, ...oneCellAnchors].forEach((anchor, i) => {
                                const fromRow = parseInt(anchor['xdr:from']?.['xdr:row'], 10);
                                let toRow = parseInt(anchor['xdr:to']?.['xdr:row'], 10);
                                
                                if (Math.abs(fromRow - targetRowIndex) <= 2 || (targetRowIndex >= fromRow && targetRowIndex <= toRow)) {
                                    console.log('Anchor around', targetRowIndex, '- fromRow:', fromRow, 'toRow:', toRow, 'toRowOff:', anchor['xdr:to']?.['xdr:rowOff']);
                                }
                            });
                        }
                    }
                });
            }
        }
    }
}

