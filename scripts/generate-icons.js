const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const svgPath = path.join(rootDir, 'public/icon.svg');
const icon192Path = path.join(rootDir, 'public/icon-192.png');
const icon512Path = path.join(rootDir, 'public/icon-512.png');

if (!fs.existsSync(svgPath)) {
  console.error(`Error: Source SVG not found at ${svgPath}`);
  process.exit(1);
}

console.log('Generating PNG icons from SVG...');

sharp(svgPath)
  .resize(192, 192)
  .png()
  .toFile(icon192Path)
  .then(() => {
    console.log(`Generated: ${icon192Path}`);
  })
  .catch((err) => {
    console.error(`Error generating 192x192 icon:`, err);
  });

sharp(svgPath)
  .resize(512, 512)
  .png()
  .toFile(icon512Path)
  .then(() => {
    console.log(`Generated: ${icon512Path}`);
  })
  .catch((err) => {
    console.error(`Error generating 512x512 icon:`, err);
  });
