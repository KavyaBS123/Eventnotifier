/**
 * Generates simple colored PNG placeholder icons for the Chrome Extension.
 * Run: node generate-icons.js
 * Requires: npm install canvas (one-time, dev only)
 *
 * Alternatively, just use any 16x16, 48x48, 128x128 PNG images.
 */
const fs = require('fs');
const path = require('path');

// Try to use canvas if available, otherwise create minimal valid PNGs
try {
  const { createCanvas } = require('canvas');

  const sizes = [16, 48, 128];
  const outDir = path.join(__dirname, 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, '#4f46e5');
    ctx.fillStyle = grad;
    ctx.roundRect(0, 0, size, size, size * 0.2);
    ctx.fill();

    // Lightning bolt ⚡
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${size * 0.55}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', size / 2, size / 2);

    const buffer = canvas.toBuffer('image/png');
    const outPath = path.join(outDir, `icon${size}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`Created ${outPath}`);
  }
} catch (e) {
  console.warn('`canvas` not installed. Creating minimal 1x1 placeholder PNGs.');
  console.warn('Install canvas with: npm install canvas');
  console.warn('Or replace icons manually with proper PNG files.\n');

  // Minimal valid 1x1 white PNG (base64 encoded)
  const minimalPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
    'base64'
  );

  const outDir = path.join(__dirname, 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  for (const size of [16, 48, 128]) {
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), minimalPng);
    console.log(`Created placeholder icon${size}.png`);
  }
}
