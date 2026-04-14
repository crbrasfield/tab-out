/* ================================================================
   Tab Out — Dashboard App

   This file is the brain of the dashboard. It:
   1. Talks to the Chrome extension when needed for deferred-tab actions
   2. Renders the saved-for-later checklist and archive
   3. Handles checklist actions and archive interactions
   ================================================================ */

'use strict';


/* ----------------------------------------------------------------
   EXTENSION BRIDGE

   The dashboard runs in an iframe inside the Chrome extension's
   new-tab page. To communicate with the extension's background
   script, we use window.postMessage — the extension's content
   script listens and relays messages.

   When running in a regular browser tab (dev mode), we gracefully
   fall back without crashing.
   ---------------------------------------------------------------- */

// Track whether the extension is actually available (set after first successful call)
let extensionAvailable = false;

/**
 * sendToExtension(action, data)
 *
 * Sends a message to the parent frame (the Chrome extension) and
 * waits up to 3 seconds for a response.
 *
 * Think of it like sending a text message and waiting for a reply —
 * if no reply comes in 3 seconds, we give up gracefully.
 */
function sendToExtension(action, data = {}) {
  return new Promise((resolve) => {
    // If we're not inside an iframe, there's no extension to talk to
    if (window.parent === window) {
      resolve({ success: false, reason: 'not-in-extension' });
      return;
    }

    // Generate a random ID so we can match the response to this specific request
    const messageId = 'tmc-' + Math.random().toString(36).slice(2);

    // Set a 3-second timeout in case the extension doesn't respond
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, reason: 'timeout' });
    }, 3000);

    // Listen for the matching response from the extension
    function handler(event) {
      if (event.data && event.data.messageId === messageId) {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data);
      }
    }

    window.addEventListener('message', handler);

    // Send the message to the parent frame (extension)
    window.parent.postMessage({ action, messageId, ...data }, '*');
  });
}

/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */

/**
 * showToast(message)
 *
 * Shows a brief pop-up notification at the bottom of the screen.
 * Like the little notification that pops up when you send a message.
 */
/**
 * playCloseSound()
 *
 * Plays a clean "swoosh" sound when tabs are closed.
 * Built entirely with the Web Audio API — no sound files needed.
 * A filtered noise sweep that descends in pitch, like air moving.
 */
function playCloseSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Swoosh: shaped white noise through a sweeping bandpass filter
    const duration = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with a natural envelope (quick attack, smooth decay)
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Envelope: ramps up fast in first 10%, then fades out smoothly
      const env = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter sweeps from high to low — this creates the "swoosh" character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    // Volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — fail silently
  }
}

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 *
 * Each particle:
 * - Is either a circle or a square (randomly chosen)
 * - Uses the dashboard's color palette: amber, sage, slate, with some light variants
 * - Flies outward in a random direction with a gravity arc
 * - Fades out over ~800ms, then is removed from the DOM
 *
 * Pure CSS + JS, no libraries.
 */
function shootConfetti(x, y) {
  // Color palette drawn from the dashboard's CSS variables
  const colors = [
    '#c8713a', // amber
    '#e8a070', // amber light
    '#5a7a62', // sage
    '#8aaa92', // sage light
    '#5a6b7a', // slate
    '#8a9baa', // slate light
    '#d4b896', // warm paper
    '#b35a5a', // rose
  ];

  const particleCount = 17;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');

    // Randomly decide: circle or square
    const isCircle = Math.random() > 0.5;
    const size = 5 + Math.random() * 6; // 5–11px

    // Pick a random color from the palette
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Style the particle
    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 1;
    `;
    document.body.appendChild(el);

    // Physics: random angle and speed for the outward burst
    const angle  = Math.random() * Math.PI * 2;           // random direction (radians)
    const speed  = 60 + Math.random() * 120;              // px/second
    const vx     = Math.cos(angle) * speed;               // horizontal velocity
    const vy     = Math.sin(angle) * speed - 80;          // vertical: bias upward a bit
    const gravity = 200;                                   // downward pull (px/s²)

    const startTime = performance.now();
    const duration  = 700 + Math.random() * 200;          // 700–900ms

    // Animate with requestAnimationFrame for buttery-smooth motion
    function frame(now) {
      const elapsed = (now - startTime) / 1000; // seconds
      const progress = elapsed / (duration / 1000);

      if (progress >= 1) {
        el.remove();
        return;
      }

      // Position: initial velocity + gravity arc
      const px = vx * elapsed;
      const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;

      // Fade out during the second half of the animation
      const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;

      // Slight rotation for realism
      const rotate = elapsed * 200 * (isCircle ? 0 : 1); // squares spin, circles don't

      el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
      el.style.opacity = opacity;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
}

/**
 * animateCardOut(card)
 *
 * Smoothly removes a mission card in two phases:
 * 1. Fade out + scale down (GPU-accelerated, smooth)
 * 2. After fade completes, remove from DOM
 *
 * Also fires confetti from the card's center for a satisfying "done!" moment.
 */
function animateCardOut(card) {
  if (!card) return;

  // Get the card's center position on screen for the confetti origin
  const rect = card.getBoundingClientRect();
  const cx = rect.left + rect.width  / 2;
  const cy = rect.top  + rect.height / 2;

  // Shoot confetti from the card's center
  shootConfetti(cx, cy);

  // Phase 1: fade + scale down
  card.classList.add('closing');
  // Phase 2: remove from DOM after animation
  setTimeout(() => {
    card.remove();
    // After card is gone, check if the missions grid is now empty
    // and show the empty state if so
    checkAndShowEmptyState();
  }, 300);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

// Sections + shortcuts state
let sections = [];

function faviconForUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchSections() {
  try {
    const res = await fetch('/api/sections');
    if (!res.ok) throw new Error('Failed to fetch sections');
    const data = await res.json();
    sections = data.sections || [];
  } catch (err) {
    console.warn('[tab-out] Could not load sections:', err);
    sections = [];
  }
}

function renderShortcut(shortcut) {
  const url = shortcut.url || '';
  const name = (shortcut.name || '').trim();
  const favicon = shortcut.favicon_url || faviconForUrl(url);
  const title = url || name || '';
  const label = name ? `<span class="shortcut-label">${escapeHtml(name)}</span>` : '';
  const nameOnlyClass = name ? '' : ' shortcut-name-only';

  return `
    <div class="shortcut-item" data-shortcut-id="${shortcut.id}">
      <a class="shortcut-link${nameOnlyClass}" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(title)}">
        ${favicon ? `<img class="shortcut-favicon" src="${favicon}" alt="" onerror="this.style.display='none'">` : ''}
        ${label}
      </a>
      <button class="shortcut-delete-btn" data-action="delete-shortcut" data-shortcut-id="${shortcut.id}" title="Delete shortcut">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}

function renderSectionCard(section) {
  const shortcuts = section.shortcuts || [];
  return `
    <div class="section-card" data-section-id="${section.id}">
      <div class="section-card-header">
        <input class="section-name-input" data-action="rename-section" data-section-id="${section.id}" value="${escapeHtml(section.name || '')}" aria-label="Section name">
        <button class="section-delete-btn" data-action="delete-section" data-section-id="${section.id}" title="Delete section">
          Delete
        </button>
      </div>

      <div class="section-shortcuts">
        ${shortcuts.length > 0
          ? shortcuts.map(renderShortcut).join('')
          : `<div class="sections-empty" style="padding:4px 0 0;">No shortcuts yet.</div>`}
      </div>

      <form class="shortcut-create-form" data-action="create-shortcut" data-section-id="${section.id}">
        <input type="text" name="name" placeholder="Shortcut name (optional)" maxlength="120">
        <input type="text" name="url" placeholder="https://example.com" required>
        <button type="submit" class="shortcut-add-btn">Add shortcut</button>
      </form>
    </div>`;
}

async function renderSectionsBoard() {
  const list = document.getElementById('sectionsList');
  const empty = document.getElementById('sectionsEmpty');
  if (!list || !empty) return;

  await fetchSections();
  if (sections.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = sections.map(renderSectionCard).join('');
}

/**
 * timeAgo(dateStr)
 *
 * Converts an ISO date string into a human-friendly relative time.
 * e.g. "2026-04-04T10:00:00Z" → "2 hrs ago" or "yesterday"
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';

  const then = new Date(dateStr);
  const now = new Date();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1)   return 'just now';
  if (diffMins < 60)  return diffMins + ' min ago';
  if (diffHours < 24) return diffHours + ' hr' + (diffHours !== 1 ? 's' : '') + ' ago';
  if (diffDays === 1) return 'yesterday';
  return diffDays + ' days ago';
}

/**
 * getGreeting()
 *
 * Returns an appropriate greeting based on the current hour.
 * Morning = before noon, Afternoon = noon–5pm, Evening = after 5pm.
 * No name — Tab Out is for everyone now.
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * getDateDisplay()
 *
 * Returns a formatted date string like "Friday, April 4, 2026".
 */
function getDateDisplay() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/* ----------------------------------------------------------------
   SVG ICON STRINGS

   We store these as a constant so we can reuse them in buttons
   without writing raw SVG every time. Each value is an HTML string
   ready to be injected with innerHTML.
   ---------------------------------------------------------------- */
/* ----------------------------------------------------------------
   DOMAIN & TITLE CLEANUP HELPERS

   Make domain names and tab titles more readable.
   - friendlyDomain() turns "github.com" into "GitHub"
   - cleanTitle() strips redundant site names from the end of titles
   ---------------------------------------------------------------- */

// Map of known domains → friendly display names.
// Covers the most common sites; everything else gets a smart fallback.
const FRIENDLY_DOMAINS = {
  'github.com':           'GitHub',
  'www.github.com':       'GitHub',
  'gist.github.com':      'GitHub Gist',
  'youtube.com':          'YouTube',
  'www.youtube.com':      'YouTube',
  'music.youtube.com':    'YouTube Music',
  'x.com':                'X',
  'www.x.com':            'X',
  'twitter.com':          'X',
  'www.twitter.com':      'X',
  'reddit.com':           'Reddit',
  'www.reddit.com':       'Reddit',
  'old.reddit.com':       'Reddit',
  'substack.com':         'Substack',
  'www.substack.com':     'Substack',
  'medium.com':           'Medium',
  'www.medium.com':       'Medium',
  'linkedin.com':         'LinkedIn',
  'www.linkedin.com':     'LinkedIn',
  'stackoverflow.com':    'Stack Overflow',
  'www.stackoverflow.com':'Stack Overflow',
  'news.ycombinator.com': 'Hacker News',
  'google.com':           'Google',
  'www.google.com':       'Google',
  'mail.google.com':      'Gmail',
  'docs.google.com':      'Google Docs',
  'drive.google.com':     'Google Drive',
  'calendar.google.com':  'Google Calendar',
  'meet.google.com':      'Google Meet',
  'gemini.google.com':    'Gemini',
  'chatgpt.com':          'ChatGPT',
  'www.chatgpt.com':      'ChatGPT',
  'chat.openai.com':      'ChatGPT',
  'claude.ai':            'Claude',
  'www.claude.ai':        'Claude',
  'code.claude.com':      'Claude Code',
  'notion.so':            'Notion',
  'www.notion.so':        'Notion',
  'figma.com':            'Figma',
  'www.figma.com':        'Figma',
  'slack.com':            'Slack',
  'app.slack.com':        'Slack',
  'discord.com':          'Discord',
  'www.discord.com':      'Discord',
  'wikipedia.org':        'Wikipedia',
  'en.wikipedia.org':     'Wikipedia',
  'amazon.com':           'Amazon',
  'www.amazon.com':       'Amazon',
  'netflix.com':          'Netflix',
  'www.netflix.com':      'Netflix',
  'spotify.com':          'Spotify',
  'open.spotify.com':     'Spotify',
  'vercel.com':           'Vercel',
  'www.vercel.com':       'Vercel',
  'npmjs.com':            'npm',
  'www.npmjs.com':        'npm',
  'developer.mozilla.org':'MDN',
  'arxiv.org':            'arXiv',
  'www.arxiv.org':        'arXiv',
  'huggingface.co':       'Hugging Face',
  'www.huggingface.co':   'Hugging Face',
  'producthunt.com':      'Product Hunt',
  'www.producthunt.com':  'Product Hunt',
  'xiaohongshu.com':      'RedNote',
  'www.xiaohongshu.com':  'RedNote',
  'local-files':          'Local Files',
};

/**
 * friendlyDomain(hostname)
 *
 * Turns a raw hostname into a human-readable name.
 * 1. Check the lookup map for known domains
 * 2. For subdomains of known domains, check if the parent matches
 *    (e.g. "docs.github.com" → "GitHub Docs")
 * 3. Fallback: strip "www.", strip TLD, capitalize
 *    (e.g. "minttr.com" → "Minttr", "blog.example.co.uk" → "Blog Example")
 */
function friendlyDomain(hostname) {
  if (!hostname) return '';

  // Direct lookup
  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  // Check for *.substack.com pattern (e.g. "lenny.substack.com" → "Lenny's Substack")
  if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    const sub = hostname.replace('.substack.com', '');
    return capitalize(sub) + "'s Substack";
  }

  // Check for *.github.io pattern
  if (hostname.endsWith('.github.io')) {
    const sub = hostname.replace('.github.io', '');
    return capitalize(sub) + ' (GitHub Pages)';
  }

  // Fallback: strip www, strip common TLDs, capitalize each word
  let clean = hostname
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk|co\.uk|co\.jp)$/, '');

  // If it's a subdomain like "blog.example", keep it readable
  return clean
    .split('.')
    .map(part => capitalize(part))
    .join(' ');
}

/**
 * capitalize(str)
 * "github" → "GitHub" (okay, just "Github" — but close enough for fallback)
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * stripTitleNoise(title)
 *
 * Removes common noise from browser tab titles:
 * - Leading notification counts: "(2) Vibe coding ideas" → "Vibe coding ideas"
 * - Trailing email addresses: "Subject - user@gmail.com" → "Subject"
 * - X/Twitter cruft: "Name on X: \"quote\" / X" → "Name: \"quote\""
 * - Trailing "/ X" or "| LinkedIn" etc (handled by cleanTitle, but the
 *   "on X:" pattern needs special handling here)
 */
function stripTitleNoise(title) {
  if (!title) return '';

  // 1. Strip leading notification count: "(2) Title" or "(99+) Title"
  title = title.replace(/^\(\d+\+?\)\s*/, '');

  // 1b. Strip inline counts like "Inbox (16,359)" or "Messages (42)"
  title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');

  // 2. Strip email addresses anywhere in the title (privacy + cleaner display)
  //    Catches patterns like "Subject - user@example.com - Gmail"
  //    First remove "- email@domain.com" segments (with separator)
  title = title.replace(/\s*[\-\u2010\u2011\u2012\u2013\u2014\u2015]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  //    Then catch any remaining bare email addresses
  title = title.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');

  // 3. Clean up X/Twitter title format: "Name on X: \"quote text\"" → "Name: \"quote text\""
  title = title.replace(/\s+on X:\s*/, ': ');

  // 4. Strip trailing "/ X" (X/Twitter appends this)
  title = title.replace(/\s*\/\s*X\s*$/, '');

  return title.trim();
}

/**
 * cleanTitle(title, hostname)
 *
 * Strips redundant site name suffixes from tab titles.
 * Many sites append their name: "Article Title - Medium" or "Post | Reddit"
 * If the suffix matches the domain, we remove it for a cleaner look.
 */
function cleanTitle(title, hostname) {
  if (!title || !hostname) return title || '';

  const friendly = friendlyDomain(hostname);
  const domain = hostname.replace(/^www\./, '');

  // Common separator patterns at the end of titles
  // "Article Title - Site Name", "Article Title | Site Name", "Article Title — Site Name"
  const separators = [' - ', ' | ', ' — ', ' · ', ' – '];

  for (const sep of separators) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;

    const suffix = title.slice(idx + sep.length).trim();
    const suffixLower = suffix.toLowerCase();

    // Check if the suffix matches the domain name, friendly name, or common variations
    if (
      suffixLower === domain.toLowerCase() ||
      suffixLower === friendly.toLowerCase() ||
      suffixLower === domain.replace(/\.\w+$/, '').toLowerCase() || // "github" from "github.com"
      domain.toLowerCase().includes(suffixLower) ||
      friendly.toLowerCase().includes(suffixLower)
    ) {
      const cleaned = title.slice(0, idx).trim();
      // Only strip if we're left with something meaningful (at least 5 chars)
      if (cleaned.length >= 5) return cleaned;
    }
  }

  return title;
}

/**
 * smartTitle(title, url)
 *
 * When the tab title is useless (just the URL, or a generic site name),
 * try to extract something meaningful from the URL itself.
 * Works for X/Twitter posts, GitHub repos, YouTube videos, Reddit threads, etc.
 */
function smartTitle(title, url) {
  if (!url) return title || '';

  let pathname = '';
  let hostname = '';
  try {
    const u = new URL(url);
    pathname = u.pathname;
    hostname = u.hostname;
  } catch {
    return title || '';
  }

  // Check if the title is basically just the URL (useless)
  const titleIsUrl = !title || title === url || title.startsWith(hostname) || title.startsWith('http');

  // X / Twitter — extract @username from /username/status/123456 URLs
  if ((hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com') && pathname.includes('/status/')) {
    const username = pathname.split('/')[1];
    if (username) {
      // If the title has actual content (not just URL), clean it and keep it
      if (!titleIsUrl) return title;
      return `Post by @${username}`;
    }
  }

  // GitHub — extract owner/repo or owner/repo/path context
  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const owner = parts[0];
      const repo = parts[1];
      if (parts[2] === 'issues' && parts[3]) return `${owner}/${repo} Issue #${parts[3]}`;
      if (parts[2] === 'pull' && parts[3]) return `${owner}/${repo} PR #${parts[3]}`;
      if (parts[2] === 'blob' || parts[2] === 'tree') return `${owner}/${repo} — ${parts.slice(4).join('/')}`;
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  // YouTube — if title is just a URL, at least say "YouTube Video"
  if ((hostname === 'www.youtube.com' || hostname === 'youtube.com') && pathname === '/watch') {
    if (titleIsUrl) return 'YouTube Video';
  }

  // Reddit — extract subreddit and post hint from URL
  if ((hostname === 'www.reddit.com' || hostname === 'reddit.com' || hostname === 'old.reddit.com') && pathname.includes('/comments/')) {
    const parts = pathname.split('/').filter(Boolean);
    const subIdx = parts.indexOf('r');
    if (subIdx !== -1 && parts[subIdx + 1]) {
      const sub = parts[subIdx + 1];
      if (titleIsUrl) return `r/${sub} post`;
    }
  }

  return title || url;
}


const ICONS = {
  // Tab/browser icon — used in the "N tabs open" badge
  tabs: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" /></svg>`,

  // X / close icon — used in "Close N tabs" button
  close: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,

  // Archive / trash icon — used in "Close & archive" button
  archive: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>`,

  // Arrow up-right — used in "Focus on this" button
  focus: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" /></svg>`
};


/* ----------------------------------------------------------------
   ---------------------------------------------------------------- */

/* ----------------------------------------------------------------
   DEFERRED TABS — "Saved for Later" checklist column

   Fetches deferred tabs from the server and renders:
   1. Active items as a checklist (checkbox + title + dismiss)
   2. Archived items in a collapsible section with search
   ---------------------------------------------------------------- */

/**
 * renderDeferredColumn()
 *
 * Fetches all deferred tabs (active + archived) from the API and
 * renders them into the right-side column. Called on every dashboard
 * load.
 */
async function renderDeferredColumn() {
  const column    = document.getElementById('deferredColumn');
  const list      = document.getElementById('deferredList');
  const empty     = document.getElementById('deferredEmpty');
  const countEl   = document.getElementById('deferredCount');
  const archiveEl = document.getElementById('deferredArchive');
  const archiveCountEl = document.getElementById('archiveCount');
  const archiveList    = document.getElementById('archiveList');

  if (!column) return;

  try {
    const res = await fetch('/api/deferred');
    if (!res.ok) throw new Error('Failed to fetch deferred tabs');
    const data = await res.json();

    const active   = data.active || [];
    const archived = data.archived || [];

    // Show or hide the entire column based on whether there's anything to show
    if (active.length === 0 && archived.length === 0) {
      column.style.display = 'none';
      return;
    }

    column.style.display = 'block';

    // Render active checklist items
    if (active.length > 0) {
      countEl.textContent = `${active.length} item${active.length !== 1 ? 's' : ''}`;
      list.innerHTML = active.map(item => renderDeferredItem(item)).join('');
      list.style.display = 'block';
      empty.style.display = 'none';
    } else {
      list.style.display = 'none';
      countEl.textContent = '';
      empty.style.display = 'block';
    }

    // Render archive section
    if (archived.length > 0) {
      archiveCountEl.textContent = `(${archived.length})`;
      archiveList.innerHTML = archived.map(item => renderArchiveItem(item)).join('');
      archiveEl.style.display = 'block';
    } else {
      archiveEl.style.display = 'none';
    }

  } catch (err) {
    console.warn('[tab-out] Could not load deferred tabs:', err);
    column.style.display = 'none';
  }
}

/**
 * renderDeferredItem(item)
 *
 * Builds the HTML for a single checklist item in the Saved for Later column.
 * Each item has: checkbox, title (clickable link), domain, time ago, dismiss X.
 */
function renderDeferredItem(item) {
  let domain = '';
  try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  const ago = timeAgo(item.deferred_at);

  return `
    <div class="deferred-item" data-deferred-id="${item.id}">
      <input type="checkbox" class="deferred-checkbox" data-action="check-deferred" data-deferred-id="${item.id}">
      <div class="deferred-info">
        <a href="${item.url}" target="_blank" rel="noopener" class="deferred-title" title="${(item.title || '').replace(/"/g, '&quot;')}">
          <img src="${faviconUrl}" alt="" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px" onerror="this.style.display='none'">${item.title || item.url}
        </a>
        <div class="deferred-meta">
          <span>${domain}</span>
          <span>${ago}</span>
        </div>
      </div>
      <button class="deferred-dismiss" data-action="dismiss-deferred" data-deferred-id="${item.id}" title="Dismiss">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}

/**
 * renderArchiveItem(item)
 *
 * Builds the HTML for a single item in the collapsed archive list.
 * Simpler than active items — just title link + date.
 */
function renderArchiveItem(item) {
  let domain = '';
  try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
  const ago = item.archived_at ? timeAgo(item.archived_at) : '';

  return `
    <div class="archive-item">
      <a href="${item.url}" target="_blank" rel="noopener" class="archive-item-title" title="${(item.title || '').replace(/"/g, '&quot;')}">
        ${item.title || item.url}
      </a>
      <span class="archive-item-date">${ago}</span>
    </div>`;
}


/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER

   renderStaticDashboard() — renders the saved-for-later view.
   ---------------------------------------------------------------- */

/**
 * renderStaticDashboard()
 *
 * The main view. Loads instantly:
 * 1. Paint greeting + date
 * 2. Render sections
 * 3. Render the saved-for-later column
 */
async function renderStaticDashboard() {
  // --- Header: greeting + date ---
  const greetingEl = document.getElementById('greeting');
  const dateEl     = document.getElementById('dateDisplay');
  if (greetingEl) greetingEl.textContent = getGreeting();
  if (dateEl)     dateEl.textContent     = getDateDisplay();

  await renderSectionsBoard();
  await renderDeferredColumn();
}


/**
 * renderDashboard()
 *
 * Entry point — just calls renderStaticDashboard().
 */
async function renderDashboard() {
  await renderStaticDashboard();
}


/* ----------------------------------------------------------------
   EVENT HANDLERS (using event delegation)

   Instead of attaching a listener to every button, we attach ONE
   listener to the whole document and check what was clicked.
   This is more efficient and works even after we re-render cards.

   Think of it like one security guard watching the whole building
   instead of one guard per door.
   ---------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'delete-section') {
    const sectionId = actionEl.dataset.sectionId;
    if (!sectionId) return;
    if (!confirm('Delete this section and all of its shortcuts?')) return;

    try {
      const res = await fetch(`/api/sections/${sectionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete section');
      await renderSectionsBoard();
      showToast('Section deleted');
    } catch (err) {
      console.error('[tab-out] Failed to delete section:', err);
      showToast('Could not delete section');
    }
    return;
  }

  if (action === 'delete-shortcut') {
    const shortcutId = actionEl.dataset.shortcutId;
    if (!shortcutId) return;
    if (!confirm('Delete this shortcut?')) return;

    try {
      const res = await fetch(`/api/shortcuts/${shortcutId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete shortcut');
      await renderSectionsBoard();
      showToast('Shortcut deleted');
    } catch (err) {
      console.error('[tab-out] Failed to delete shortcut:', err);
      showToast('Could not delete shortcut');
    }
    return;
  }

  // ---- defer-single-tab: save one tab for later, then close it ----
  if (action === 'defer-single-tab') {
    const tabUrl   = actionEl.dataset.tabUrl;
    const tabTitle = actionEl.dataset.tabTitle || tabUrl;
    if (!tabUrl) return;

    // Save to the deferred list on the server
    try {
      await fetch('/api/defer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs: [{ url: tabUrl, title: tabTitle }] }),
      });
    } catch (err) {
      console.error('[tab-out] Failed to defer tab:', err);
      showToast('Failed to save tab');
      return;
    }

    showToast('Saved for later');
    // Refresh the deferred column to show the new item
    await renderDeferredColumn();
    return;
  }

  // ---- check-deferred: check off a deferred tab (mark as read) ----
  if (action === 'check-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    try {
      await fetch(`/api/deferred/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: true }),
      });
    } catch (err) {
      console.error('[tab-out] Failed to check deferred tab:', err);
      return;
    }

    // Animate the item: add strikethrough, then slide out
    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('checked');
      setTimeout(() => {
        item.classList.add('removing');
        setTimeout(() => {
          item.remove();
          renderDeferredColumn(); // refresh to update counts and archive
        }, 300);
      }, 800);
    }
    return;
  }

  // ---- dismiss-deferred: dismiss a deferred tab without reading ----
  if (action === 'dismiss-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    try {
      await fetch(`/api/deferred/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      });
    } catch (err) {
      console.error('[tab-out] Failed to dismiss deferred tab:', err);
      return;
    }

    // Animate the item out
    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
        renderDeferredColumn(); // refresh counts and archive
      }, 300);
    }
    return;
  }
});

document.addEventListener('submit', async (e) => {
  const sectionForm = e.target.closest('#sectionCreateForm');
  if (sectionForm) {
    e.preventDefault();
    const input = document.getElementById('sectionCreateName');
    const name = input ? input.value.trim() : '';

    try {
      const res = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to create section');
      if (input) input.value = '';
      await renderSectionsBoard();
      showToast('Section created');
    } catch (err) {
      console.error('[tab-out] Failed to create section:', err);
      showToast('Could not create section');
    }
    return;
  }

  const shortcutForm = e.target.closest('.shortcut-create-form');
  if (shortcutForm) {
    e.preventDefault();
    const sectionId = shortcutForm.dataset.sectionId;
    const formData = new FormData(shortcutForm);
    const name = (formData.get('name') || '').toString().trim();
    const url = (formData.get('url') || '').toString().trim();

    try {
      const res = await fetch(`/api/sections/${sectionId}/shortcuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      });
      if (!res.ok) throw new Error('Failed to add shortcut');
      shortcutForm.reset();
      await renderSectionsBoard();
      showToast('Shortcut added');
    } catch (err) {
      console.error('[tab-out] Failed to add shortcut:', err);
      showToast('Could not add shortcut');
    }
  }
});

document.addEventListener('change', async (e) => {
  const input = e.target.closest('.section-name-input');
  if (!input) return;

  const sectionId = input.dataset.sectionId;
  const name = input.value.trim();
  if (!sectionId) return;

  try {
    const res = await fetch(`/api/sections/${sectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to rename section');
    await renderSectionsBoard();
  } catch (err) {
    console.error('[tab-out] Failed to rename section:', err);
    showToast('Could not rename section');
    await renderSectionsBoard();
  }
});

document.addEventListener('keydown', (e) => {
  const input = e.target.closest('.section-name-input');
  if (!input || e.key !== 'Enter') return;
  e.preventDefault();
  input.blur();
});

// ---- Archive toggle — expand/collapse the archive section ----
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#archiveToggle');
  if (!toggle) return;

  toggle.classList.toggle('open');
  const body = document.getElementById('archiveBody');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
});

// ---- Archive search — filter archived items as user types ----
document.addEventListener('input', async (e) => {
  if (e.target.id !== 'archiveSearch') return;

  const q = e.target.value.trim();
  const archiveList = document.getElementById('archiveList');
  if (!archiveList) return;

  if (q.length < 2) {
    // Reset archive list to show all archived items without re-rendering the whole column
    try {
      const res = await fetch('/api/deferred');
      if (res.ok) {
        const data = await res.json();
        archiveList.innerHTML = (data.archived || []).map(item => renderArchiveItem(item)).join('');
      }
    } catch {}
    return;
  }

  try {
    const res = await fetch(`/api/deferred/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    archiveList.innerHTML = (data.results || []).map(item => renderArchiveItem(item)).join('')
      || '<div style="font-size:12px;color:var(--muted);padding:8px 0">No results</div>';
  } catch (err) {
    console.warn('[tab-out] Archive search failed:', err);
  }
});


/* ----------------------------------------------------------------
   ACTION HELPERS
   ---------------------------------------------------------------- */

/**
 * fetchMissionById(missionId)
 *
 * Fetches a single mission object by ID from the server.
 * Returns null if the fetch fails.
 */
async function fetchMissionById(missionId) {
  try {
    const res = await fetch('/api/missions');
    if (!res.ok) return null;
    const missions = await res.json();
    return missions.find(m => String(m.id) === String(missionId)) || null;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
renderDashboard();
