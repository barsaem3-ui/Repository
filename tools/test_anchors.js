
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const drawingEntry = zip.getEntry('xl/drawings/drawing1.xml');
if (drawingEntry) {
    const drawingParsed = parser.parse(drawingEntry.getData().toString('utf8'));
    const wsDr = drawingParsed['xdr:wsDr'];
    
    let abs = wsDr['xdr:absoluteAnchor'];
    if (abs) {
        if (!Array.isArray(abs)) abs = [abs];
        console.log('Found', abs.length, 'absoluteAnchors');
    }
    
    let oneCell = wsDr['xdr:oneCellAnchor'];
    if (oneCell) {
        if (!Array.isArray(oneCell)) oneCell = [oneCell];
        console.log('Found', oneCell.length, 'oneCellAnchors');
    }
}

