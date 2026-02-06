const fs = require('fs');
const path = require('path');

const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.warn('No dist/index.html found to patch.');
  process.exit(0);
}

let html = fs.readFileSync(distIndex, 'utf8');

html = html.replace(/href="\/favicon\.ico"/g, 'href="./favicon.ico"');
html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
html = html.replace(
  /<script\s+([^>]*?)src="(\.\/_expo\/static\/js\/web\/[^"]+)"([^>]*)>/g,
  (match, pre, src, post) => {
    if (match.includes('type="module"')) {
      return match;
    }
    const before = pre.trim() ? `${pre.trim()} ` : '';
    return `<script type="module" ${before}src="${src}"${post}>`;
  }
);

fs.writeFileSync(distIndex, html);
console.log('Patched dist/index.html for GitHub Pages base path.');
