let allEvents = [];
let activeTag = 'all';

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadEvents();
  setupTabs();
  setupRefresh();
  setupSubscribe();

  // Clear badge
  chrome.runtime.sendMessage({ action: 'clearBadge' });
});

// ─────────────────────────────────────────────────────────────
// Load events — first from cache, then from API
// ─────────────────────────────────────────────────────────────
async function loadEvents(forceRefresh = false) {
  const list = document.getElementById('eventsList');
  const statusText = document.getElementById('statusText');
  const countBadge = document.getElementById('eventCount');

  if (!forceRefresh) {
    // Show cached events immediately
    const cached = await chrome.storage.local.get('cachedEvents');
    if (cached.cachedEvents?.length) {
      allEvents = cached.cachedEvents;
      renderEvents();
      statusText.textContent = 'Cached — refreshing…';
    }
  }

  try {
    const res = await fetch(`${API_BASE}/api/events?upcoming=true&limit=30`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data, meta } = await res.json();

    allEvents = data;
    await chrome.storage.local.set({ cachedEvents: data });

    statusText.textContent = `Last synced ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    countBadge.textContent = `${meta.total} events`;
    renderEvents();
  } catch (err) {
    if (!allEvents.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>Cannot connect to backend.<br>Make sure the server is running on port 3001.</p>
        </div>`;
    }
    statusText.textContent = 'Connection error';
    console.error('[Popup] API error:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// Render event cards
// ─────────────────────────────────────────────────────────────
function renderEvents() {
  const list = document.getElementById('eventsList');

  const filtered = activeTag === 'all'
    ? allEvents
    : allEvents.filter((e) => e.tags?.includes(activeTag));

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No ${activeTag === 'all' ? '' : activeTag + ' '}events found.</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(eventCard).join('');
}

function eventCard(event) {
  const date = new Date(event.date);
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  const tags = (event.tags || ['tech'])
    .map((t) => `<span class="tag tag-${t}">${t}</span>`)
    .join('');

  const cityBadge = event.city ? `<span class="city-badge">${escapeHtml(event.city)}</span>` : '';

  return `
    <a class="event-card" href="${event.link}" target="_blank" rel="noopener">
      <div class="card-meta">
        ${tags}
        <span class="source-badge">${event.source}</span>
      </div>
      <div class="card-title">${escapeHtml(event.title)}</div>
      <div class="card-details">
        <span>📅 ${dateStr}</span>
        <span>📍 ${escapeHtml(event.location)}</span>
        ${cityBadge ? `<span>🏙️ ${cityBadge}</span>` : ''}
      </div>
    </a>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────
// Tab filtering
// ─────────────────────────────────────────────────────────────
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeTag = tab.dataset.tag;
      renderEvents();
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Refresh button
// ─────────────────────────────────────────────────────────────
function setupRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.addEventListener('click', () => {
    btn.classList.add('spinning');
    // Ask background to poll immediately
    chrome.runtime.sendMessage({ action: 'poll' }, () => {
      loadEvents(true).finally(() => {
        setTimeout(() => btn.classList.remove('spinning'), 800);
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Subscribe form
// ─────────────────────────────────────────────────────────────
function setupSubscribe() {
  const form = document.getElementById('subscribeForm');
  const msg = document.getElementById('subscribeMsg');
  const btn = document.getElementById('subscribeBtn');
  const emailInput = document.getElementById('emailInput');
  const cityInput = document.getElementById('cityInput');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const city = cityInput.value.trim();
    if (!email) return;

    btn.disabled = true;
    msg.textContent = 'Subscribing…';
    msg.className = 'subscribe-msg';

    try {
      const res = await fetch(`${API_BASE}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          city: city || undefined,
          preferences: { notifyEmail: true, tags: [] },
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      msg.textContent = city
        ? `✅ Subscribed for ${city}! Check your inbox for welcome email.`
        : '✅ Subscribed! Check your inbox for welcome email.';
      msg.className = 'subscribe-msg success';
      emailInput.value = '';
      cityInput.value = '';
    } catch (err) {
      msg.textContent = '❌ Failed. Is the server running?';
      msg.className = 'subscribe-msg error';
    } finally {
      btn.disabled = false;
    }

    setTimeout(() => { msg.textContent = ''; }, 4000);
  });
}
