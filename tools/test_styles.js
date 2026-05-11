
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('./pasco.xlsx');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const stylesEntry = zip.getEntry('xl/styles.xml');
if (stylesEntry) {
    const xml = stylesEntry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const fonts = parsed.styleSheet.fonts.font;
    const fills = parsed.styleSheet.fills.fill;
    const cellXfs = parsed.styleSheet.cellXfs.xf;
    
    console.log('Fonts 0-5:', Array.isArray(fonts) ? fonts.slice(0, 5) : fonts);
    console.log('Fills 0-5:', Array.isArray(fills) ? fills.slice(0, 5) : fills);
    console.log('CellXfs 0-5:', Array.isArray(cellXfs) ? cellXfs.slice(0, 5) : cellXfs);
    
    // Check for red colors in fonts
    if (Array.isArray(fonts)) {
        fonts.forEach((f, i) => {
            if (f.color && f.color['@_rgb'] && f.color['@_rgb'].toUpperCase().includes('FF0000')) {
                console.log('Found Red Font at index', i, f);
            }
        });
    }
} else {
    console.log('No styles.xml found');
}

