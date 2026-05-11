/**
 * setup-db.js — One-time local database setup helper
 *
 * Run this script if you have PostgreSQL installed locally (without Docker):
 *   node setup-db.js
 *
 * It will:
 * 1. Create the "eventnotifier" database if it doesn't exist
 * 2. Run Prisma migrations
 *
 * Prerequisites:
 *   - PostgreSQL running locally on port 5432
 *   - psql in your PATH, OR update the PG_* vars below
 *
 * Alternatively, just run: npx prisma migrate dev --name init
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function main() {
  console.log('\n🗄️  Event Notifier — Database Setup\n');
  console.log('This will run: npx prisma migrate dev --name init');
  console.log('Make sure DATABASE_URL in backend/.env points to a running PostgreSQL instance.\n');

  const proceed = await ask('Proceed? (y/n): ');
  rl.close();

  if (proceed.toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  try {
    console.log('\n[1/2] Running Prisma migration...');
    execSync('npx prisma migrate dev --name init', {
      cwd: __dirname,
      stdio: 'inherit',
    });

    console.log('\n[2/2] Generating Prisma client...');
    execSync('npx prisma generate', {
      cwd: __dirname,
      stdio: 'inherit',
    });

    console.log('\n✅ Database setup complete!');
    console.log('\nNext steps:');
    console.log('  npm run dev         — Start the API server');
    console.log('  npm run worker      — Start the background scraper');
    console.log('  npm run scrape:now  — Trigger an immediate scrape\n');
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    console.error('\nMake sure PostgreSQL is running and DATABASE_URL in .env is correct.');
    process.exit(1);
  }
}

main();
