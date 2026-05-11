
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

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
    const sheetPath = sheetIdToPath[sheet['@_id']];
    const sheetEntry = zip.getEntry(sheetPath);
    if (!sheetEntry) continue;
    
    const sheetParsed = parser.parse(sheetEntry.getData().toString('utf8'));
    let rows = sheetParsed?.worksheet?.sheetData?.row;
    if (!rows) continue;
    if (!Array.isArray(rows)) rows = [rows];
    
    for (const row of rows) {
        let cells = row.c;
        if (!cells) continue;
        if (!Array.isArray(cells)) cells = [cells];
        for (const cell of cells) {
            if (cell['@_t'] === 's' && cell.v == 2529) {
                console.log('Found in sheet:', sheet['@_name'], 'row:', row['@_r']);
                
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
                                const drawingParsed = parser.parse(drawingEntry.getData().toString('utf8'));
                                let anchors = drawingParsed?.['xdr:wsDr']?.['xdr:twoCellAnchor'] || [];
                                let oneCellAnchors = drawingParsed?.['xdr:wsDr']?.['xdr:oneCellAnchor'] || [];
                                if (!Array.isArray(anchors)) anchors = [anchors];
                                if (!Array.isArray(oneCellAnchors)) oneCellAnchors = [oneCellAnchors];
                                
                                const targetRowIndex = parseInt(row['@_r']) - 1; // 0-based
                                
                                console.log('Checking anchors near row', targetRowIndex, 'in drawing', drawingPath);
                                [...anchors, ...oneCellAnchors].forEach((anchor, i) => {
                                    const fromRow = parseInt(anchor['xdr:from']?.['xdr:row'], 10);
                                    let toRow = parseInt(anchor['xdr:to']?.['xdr:row'], 10);
                                    if (isNaN(toRow)) toRow = fromRow;
                                    
                                    if (targetRowIndex >= fromRow && targetRowIndex <= toRow) {
                                        console.log('  -> EXACT MATCH: Anchor fromRow:', fromRow, 'toRow:', toRow, 'toRowOff:', anchor['xdr:to']?.['xdr:rowOff']);
                                    } else if (Math.abs(fromRow - targetRowIndex) <= 2) {
                                        console.log('  -> NEARBY Anchor fromRow:', fromRow, 'toRow:', toRow, 'toRowOff:', anchor['xdr:to']?.['xdr:rowOff']);
                                    }
                                });
                            }
                        }
                    });
                }
            }
        }
    }
}

