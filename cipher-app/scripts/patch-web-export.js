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

fs.writeFileSync(distIndex, html);
console.log('Patched dist/index.html for GitHub Pages base path.');
