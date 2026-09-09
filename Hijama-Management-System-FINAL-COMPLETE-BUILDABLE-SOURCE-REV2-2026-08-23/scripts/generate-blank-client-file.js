#!/usr/bin/env node
/**
 * Generates a standalone blank A4 client file preview (open in browser / print).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const global = {
  DB: {
    get(key, fallback) {
      if (key === 'settings') {
        return {
          centerName: 'مركز الحجامة',
          centerNameEn: 'Cupping Center',
          address: 'عنوان المركز — يُعبَّأ من الإعدادات',
          phone: '05xxxxxxxx',
          waNumber: '9665xxxxxxxx',
          siteUrl: 'https://example.com'
        };
      }
      return fallback;
    }
  },
  renderImageMap: () => '<div class="cup-img-map" style="aspect-ratio:1;background:#f4f7f6;border-radius:3pt"></div>',
  getCuppingPrintMaps: (which) =>
    (which === 'mini' ? ['head', 'limbs', 'front', 'back'] : ['front', 'back', 'head', 'limbs']).map((id) => ({ id })),
  CUPPING_MAPS: {}
};

const clientFileJs = fs.readFileSync(path.join(root, 'cupping-client-file.js'), 'utf8');
vm.runInNewContext(clientFileJs, global);

const data = global.getClientFileData(null, { blank: true });
const body = global.buildClientFileSheetHtml(data);

const cssMatch = clientFileJs.match(/const CLIENT_FILE_CSS = `([\s\S]*?)`;/);
if (!cssMatch) {
  console.error('Could not extract CLIENT_FILE_CSS');
  process.exit(1);
}
const css = cssMatch[1].replace(/\$\{TEAR_HEIGHT\}/g, '88mm');

const out = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ملف عميل فارغ — مركز الحجامة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;

const outPath = path.join(root, 'templates', 'cupping-client-file-blank.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Written:', outPath);
