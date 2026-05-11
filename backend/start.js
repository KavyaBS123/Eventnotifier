require('dotenv').config();
const { execSync } = require('child_process');

// Run DB migrations
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[Start] Database migrations applied.');
} catch (err) {
  console.warn('[Start] Migration warning:', err.message);
}

// Start the API server
require('./src/server');

// Start the scheduler (scraping + digest) in the same process
const { startScheduler } = require('./src/scheduler');
startScheduler();

console.log('[Start] Server + Scheduler running.');
