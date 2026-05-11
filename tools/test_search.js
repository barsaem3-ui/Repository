
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

sharedStrings.forEach((s, idx) => {
    if (s.includes('가방') || s.includes('보관')) {
        console.log('SharedString index', idx, ':', s);
    }
});

