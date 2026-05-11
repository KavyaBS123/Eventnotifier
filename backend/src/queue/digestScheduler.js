require('dotenv').config();
const cron = require('node-cron');
const { sendDigest } = require('../services/digest');

function startDigestScheduler() {
  console.log('[DigestScheduler] Starting — sends at 9AM, 12PM, 6PM, 10PM IST');

  // Convert IST times to UTC for cron
  // 9AM IST = 3:30 UTC
  // 12PM IST = 6:30 UTC
  // 6PM IST = 12:30 UTC
  // 10PM IST = 16:30 UTC
  const schedules = [
    { time: '30 3 * * *', label: '9:00 AM IST' },   // 9 AM
    { time: '30 6 * * *', label: '12:00 PM IST' },   // 12 PM
    { time: '30 12 * * *', label: '6:00 PM IST' },    // 6 PM
    { time: '30 16 * * *', label: '10:00 PM IST' },   // 10 PM
  ];

  for (const { time, label } of schedules) {
    cron.schedule(time, async () => {
      console.log(`[DigestScheduler] ⏰ ${label} — sending digest...`);
      try {
        const sent = await sendDigest();
        console.log(`[DigestScheduler] ${label} digest complete — ${sent} user(s) notified`);
      } catch (err) {
        console.error(`[DigestScheduler] ${label} failed:`, err.message);
      }
    });
    console.log(`[DigestScheduler] Scheduled: ${label} (cron: "${time}")`);
  }

  console.log('[DigestScheduler] Ready.');
}

module.exports = { startDigestScheduler };
