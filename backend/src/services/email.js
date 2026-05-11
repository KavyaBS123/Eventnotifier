require('dotenv').config();
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// Transporter setup
// ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────────────────────────────────────
// Build beautiful HTML email for new events
// ─────────────────────────────────────────────────────────────
function buildEmailHtml(events, city) {
  const eventCards = events
    .map(
      (e) => `
    <div style="background:#1e1e2e;border-radius:12px;padding:20px;margin-bottom:16px;border-left:4px solid #7c3aed;">
      <div style="margin-bottom:8px;">
        ${e.tags.map((t) => `<span style="background:#7c3aed22;color:#a78bfa;font-size:11px;padding:2px 8px;border-radius:20px;margin-right:4px;">${t}</span>`).join('')}
        <span style="background:#1d4ed822;color:#60a5fa;font-size:11px;padding:2px 8px;border-radius:20px;">${e.source}</span>
      </div>
      <h3 style="color:#e2e8f0;margin:0 0 8px;font-size:18px;">${e.title}</h3>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;">
        📅 ${new Date(e.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        &nbsp;&nbsp;📍 ${e.location}
      </p>
      ${e.description ? `<p style="color:#cbd5e1;font-size:14px;margin:0 0 12px;">${e.description.slice(0, 150)}${e.description.length > 150 ? '...' : ''}</p>` : ''}
      <a href="${e.link}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;">
        View Event →
      </a>
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:32px;margin-bottom:8px;">⚡</div>
      <h1 style="color:#e2e8f0;font-size:24px;margin:0 0 8px;">Tech Events${city ? ` in ${city}` : ''}</h1>
      <p style="color:#64748b;font-size:14px;margin:0;">${events.length} new event${events.length > 1 ? 's' : ''} found for you</p>
    </div>
    ${eventCards}
    <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid #1e293b;">
      <p style="color:#475569;font-size:12px;">You're receiving daily digests at 9 AM, 12 PM, 6 PM & 10 PM from Event Notifier.</p>
    </div>
  </div>
</body>
</html>
  `;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Email] Credentials not set');
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"Event Notifier" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

// ─────────────────────────────────────────────────────────────
// Send notification emails to all subscribed users
// ─────────────────────────────────────────────────────────────
async function notifyNewEvents(newEvents) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  try {
    const users = await prisma.user.findMany({
      where: {
        preferences: {
          path: ['notifyEmail'],
          equals: true,
        },
      },
    });

    if (!users.length) return;

    let sent = 0;
    for (const user of users) {
      try {
        const prefs = user.preferences || {};
        const userTags = prefs.tags || [];
        let relevantEvents = newEvents;

        if (userTags.length > 0) {
          relevantEvents = relevantEvents.filter((e) => e.tags.some((t) => userTags.includes(t)));
        }

        if (user.city) {
          const userCity = user.city.toLowerCase();
          relevantEvents = relevantEvents.filter(
            (e) => e.city?.toLowerCase() === userCity || e.location?.toLowerCase().includes(userCity)
          );
        }

        if (!relevantEvents.length) continue;

        await sendEmail({
          to: user.email,
          subject: `⚡ ${relevantEvents.length} Tech Event${relevantEvents.length > 1 ? 's' : ''} — Event Notifier`,
          html: buildEmailHtml(relevantEvents, user.city),
        });

        sent++;
      } catch (err) {
        console.error(`[Email] Failed to send to ${user.email}: ${err.message}`);
      }
    }

    console.log(`[Email] Sent to ${sent}/${users.length} user(s).`);
  } catch (err) {
    console.error('[Email] Notification error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

// ─────────────────────────────────────────────────────────────
// Send a test email (dev utility)
// ─────────────────────────────────────────────────────────────
async function sendTestEmail(toEmail) {
  const mockEvents = [
    {
      title: 'AI Builders Meetup Bangalore',
      description: 'Monthly meetup for AI builders and ML practitioners in Bangalore.',
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      location: 'HSR Layout, Bangalore',
      source: 'Luma',
      link: 'https://lu.ma/bangalore-ai',
      tags: ['ai', 'meetup'],
    },
  ];

  await sendEmail({
    to: toEmail,
    subject: '✅ Test Email — Event Notifier',
    html: buildEmailHtml(mockEvents),
  });

  console.log(`[Email] Test email sent to ${toEmail}`);
}

async function sendWelcomeEmail(toEmail, city) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  try {
    await sendEmail({
      to: toEmail,
      subject: '✅ You\'re subscribed — Event Notifier',
      html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">⚡</div>
    <h1 style="color:#e2e8f0;font-size:24px;margin:0 0 8px;">You're subscribed!</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">
      You'll now receive email alerts for tech events ${city ? `in <strong>${city}</strong>` : 'near you'}.
    </p>
    <div style="background:#1e1e2e;border-radius:12px;padding:20px;text-align:left;border-left:4px solid #7c3aed;">
      <p style="color:#cbd5e1;font-size:14px;margin:0 0 12px;">
        ✅ Chrome notifications when new events are found<br>
        ✅ Email alerts for events matching your city<br>
        ✅ Browse all events in the extension popup
      </p>
    </div>
    <p style="color:#475569;font-size:12px;margin-top:24px;">
      The scraper checks for new events every 30 minutes.
    </p>
  </div>
</body></html>`,
    });
    console.log(`[Email] Welcome email sent to ${toEmail}`);
  } catch (err) {
    console.error(`[Email] Welcome email failed: ${err.message}`);
  }
}

module.exports = { notifyNewEvents, sendTestEmail, sendWelcomeEmail, buildEmailHtml, sendEmail };
