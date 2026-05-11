// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────
importScripts('config.js');
const ALARM_NAME = 'poll-new-events';
const POLL_INTERVAL_MINUTES = 5;
const STORAGE_KEY_LAST_SEEN = 'lastSeenTimestamp';

// ─────────────────────────────────────────────────────────────
// On extension install / update — set up the alarm & initial timestamp
// ─────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[EventNotifier] Extension installed.');

  // Store the current time as the initial "last seen" timestamp
  const now = new Date().toISOString();
  await chrome.storage.local.set({ [STORAGE_KEY_LAST_SEEN]: now });

  // Clear any existing alarms and create a fresh one
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: POLL_INTERVAL_MINUTES,
  });

  console.log(`[EventNotifier] Polling alarm set (every ${POLL_INTERVAL_MINUTES} min).`);
});

// ─────────────────────────────────────────────────────────────
// Alarm handler — poll the backend for new events
// ─────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await checkForNewEvents();
});

// ─────────────────────────────────────────────────────────────
// Core polling function
// ─────────────────────────────────────────────────────────────
async function checkForNewEvents() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_LAST_SEEN);
    const since = stored[STORAGE_KEY_LAST_SEEN] || new Date(0).toISOString();

    const response = await fetch(`${API_BASE}/api/events/new?since=${encodeURIComponent(since)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const { data: events, count } = await response.json();

    if (count > 0) {
      console.log(`[EventNotifier] ${count} new event(s) found.`);

      // Update the last-seen timestamp to now
      await chrome.storage.local.set({ [STORAGE_KEY_LAST_SEEN]: new Date().toISOString() });

      // Cache the events for the popup
      const cached = await chrome.storage.local.get('cachedEvents');
      const existing = cached.cachedEvents || [];
      const merged = [...events, ...existing].slice(0, 50); // keep latest 50
      await chrome.storage.local.set({ cachedEvents: merged });

      // Show notifications (Chrome allows one per event, batch to 3 max)
      const toNotify = events.slice(0, 3);
      for (const event of toNotify) {
        showNotification(event);
      }

      // Show a summary notification if more than 3
      if (events.length > 3) {
        chrome.notifications.create(`summary-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `+${events.length - 3} more new events`,
          message: 'Open Event Notifier to see all new Bangalore tech events.',
          priority: 1,
        });
      }

      // Update badge
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
    }
  } catch (err) {
    console.error('[EventNotifier] Poll error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Show a Chrome notification for a single event
// ─────────────────────────────────────────────────────────────
function showNotification(event) {
  const dateStr = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const notifId = `event-${event.id}`;
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: event.title,
    message: `📅 ${dateStr} · 📍 ${event.location}`,
    contextMessage: `via ${event.source}`,
    buttons: [{ title: '🔗 View Event' }],
    priority: 2,
  });

  // Store the link so we can open it when the button is clicked
  chrome.storage.local.set({ [`notif_${notifId}`]: event.link });
}

// ─────────────────────────────────────────────────────────────
// Handle notification button clicks
// ─────────────────────────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener(async (notifId) => {
  const stored = await chrome.storage.local.get(`notif_${notifId}`);
  const link = stored[`notif_${notifId}`];
  if (link) {
    chrome.tabs.create({ url: link });
  }
  chrome.notifications.clear(notifId);
});

// ─────────────────────────────────────────────────────────────
// Clear badge when popup is opened
// ─────────────────────────────────────────────────────────────
chrome.action.onClicked.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

// ─────────────────────────────────────────────────────────────
// Message handler (from popup)
// ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'poll') {
    checkForNewEvents().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
  if (message.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
  }
});
