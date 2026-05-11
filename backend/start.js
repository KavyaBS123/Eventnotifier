require('dotenv').config();
const { execSync } = require('child_process');
const { fork } = require('child_process');

// Run DB migrations (safe to run on every start — no-op if no new migrations)
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[Start] Database migrations applied.');
} catch (err) {
  console.warn('[Start] Migration warning:', err.message);
}

// Start the API server
require('./src/server');

// Fork the worker in a separate process so it doesn't crash the server
const worker = fork('./src/queue/worker.js', { stdio: 'inherit' });
worker.on('exit', (code) => {
  console.warn(`[Start] Worker exited with code ${code}. Restarting in 10s...`);
  setTimeout(() => {
    const w = fork('./src/queue/worker.js', { stdio: 'inherit' });
    w.on('exit', () => process.exit(1)); // don't loop forever
  }, 10000);
});

console.log('[Start] Server + Worker running.');
