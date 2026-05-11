// Usage: node scripts/package-extension.js [api_url]
//   api_url defaults to http://localhost:3001
//   Example: node scripts/package-extension.js https://myname.up.railway.app

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiUrl = process.argv[2] || 'http://localhost:3001';
const extDir = path.resolve(__dirname, '../../extension');
const distDir = path.resolve(__dirname, '../../extension-dist');

console.log(`Packaging extension with API_BASE = ${apiUrl}`);

// Remove old dist
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy all extension files
const entries = fs.readdirSync(extDir);
for (const entry of entries) {
  if (entry === 'config.js') continue; // handle separately
  const src = path.join(extDir, entry);
  const dst = path.join(distDir, entry);
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dst, { recursive: true });
  } else {
    fs.copyFileSync(src, dst);
  }
}

// Write config.js with the deployed URL
fs.writeFileSync(
  path.join(distDir, 'config.js'),
  `// Event Notifier — Configuration (auto-generated)\nconst API_BASE = '${apiUrl}';\n`
);

console.log(`Config written: API_BASE = ${apiUrl}`);

// Create ZIP
const zipPath = path.resolve(__dirname, `../../event-notifier-extension.zip`);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
  console.log(`\n✅ Extension packaged: ${zipPath}`);
  console.log(`   API endpoint: ${apiUrl}`);
  console.log(`\nTo install in Chrome:`);
  console.log(`   1. Go to chrome://extensions`);
  console.log(`   2. Enable "Developer mode"`);
  console.log(`   3. Drag the ZIP file onto the page or click "Load unpacked" and select extension-dist/`);
} catch (err) {
  console.error('Failed to create ZIP:', err.message);
  console.log(`\nExtension files are at: ${distDir}`);
  console.log(`Load extension-dist/ directly in Chrome via "Load unpacked"`);
}
