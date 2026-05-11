
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const stylesEntry = zip.getEntry('xl/styles.xml');
if (stylesEntry) {
    const xml = stylesEntry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const fills = parsed.styleSheet.fills.fill;
    if (Array.isArray(fills)) {
        fills.forEach((fill, idx) => {
            if (fill.patternFill && fill.patternFill.fgColor) {
                const fg = fill.patternFill.fgColor['@_rgb'] || fill.patternFill.fgColor['@_theme'];
                if (fg && typeof fg === 'string' && fg.toUpperCase().includes('FF0000')) {
                    console.log('Red Fill found at index', idx, fg);
                }
            }
        });
    }
}

