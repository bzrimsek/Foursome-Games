/**
 * Shared Core Library — Pure Utilities & Reusable Functions
 * Used by: 4Some Games, Friday Game, Extras Manager
 * 
 * This module provides:
 * - Pure utility functions (no side effects)
 * - Async helpers for Firebase, GHIN, courses
 * - Configurable persistence & sync
 * 
 * Apps maintain their own:
 * - Global state (S, COURSES, globals)
 * - Firebase configuration (FB_BASE, LS_KEY)
 * - App-specific logic & rendering
 */

// ════════════════════════════════════════════════════════════
// PURE UTILITIES (no side effects, no globals)
// ════════════════════════════════════════════════════════════

/**
 * HTML escape — prevents XSS on all user-entered data
 * Strips dangerous HTML chars; does NOT trim or slice (keep raw length)
 */
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Convert Firebase object-with-numeric-keys back to JS array
 * Firebase strips true arrays and returns {"0":x,"1":y,...}
 */
function toArr(v) {
  return v ? (Array.isArray(v) ? v : Object.values(v)) : [];
}

/**
 * Generate a UUID or fallback ID
 */
function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Format handicap index: negative value → display as +2.0 for plus-handicaps
 */
function fmtHcp(h) {
  if (h === null || h === undefined || isNaN(h)) return '—';
  const n = +h;
  return n < 0 ? '+' + Math.abs(n).toFixed(1) : n.toFixed(1);
}

/**
 * Format date for display: "May 15, 2025"
 */
function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Extract last name from "First Last" format
 */
function lastNameOf(name) {
  const p = (name || '').trim().split(' ');
  return p[p.length - 1] || '';
}

// ════════════════════════════════════════════════════════════
// FETCH & NETWORK
// ════════════════════════════════════════════════════════════

/**
 * Fetch with configurable timeout — prevents hanging requests
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ════════════════════════════════════════════════════════════
// STATE NORMALIZATION
// ════════════════════════════════════════════════════════════

/**
 * Normalize raw state from localStorage or Firebase into a clean object
 * Ensures all array fields are real arrays, all config defaults present,
 * and the writeKey is never generated locally (must come from Firebase).
 * 
 * This is used by both fbLoad and loadLocal to guarantee consistent state shape.
 */
function normalizeState(raw) {
  try {
    raw = raw || {};
    raw.players = toArr(raw.players);
    raw.courses = []; // courses now live in shared Firebase path
    raw.games = toArr(raw.games);
    raw.config = raw.config || { ghinProxyUrl: '', writeKey: null };
    if (!('homeCourseId' in raw.config)) raw.config.homeCourseId = null;
    if (!('latestVersion' in raw.config)) raw.config.latestVersion = null;
    if (!Array.isArray(raw.config.log)) raw.config.log = [];
    if (!raw.config.writeKey) raw.config.writeKey = null;
    raw.settings = raw.settings || {};
    raw.settings.strokeOffBest = raw.settings.strokeOffBest || false;
    raw.settings.historyCap = raw.settings.historyCap || 100;
    raw.activeGame = raw.activeGame || null;

    // Ensure scores object exists and all player score entries are objects
    if (raw.activeGame) {
      raw.activeGame.scores = raw.activeGame.scores || {};
      if (raw.activeGame.playerIds) {
        raw.activeGame.playerIds.forEach(id => {
          if (!raw.activeGame.scores[id] || typeof raw.activeGame.scores[id] !== 'object') {
            raw.activeGame.scores[id] = {};
          }
        });
      }
    }

    // Strip null hole entries from bbb — Firebase stores null when all keys deleted
    if (raw.activeGame && raw.activeGame.bbb) {
      Object.keys(raw.activeGame.bbb).forEach(k => {
        if (!raw.activeGame.bbb[k]) delete raw.activeGame.bbb[k];
      });
    }

    return raw;
  } catch (e) {
    console.error('normalizeState failed:', e);
    return { players: [], courses: [], games: [], activeGame: null, config: { ghinProxyUrl: '', writeKey: null }, settings: {} };
  }
}

// ════════════════════════════════════════════════════════════
// GHIN FETCH — Reusable across all apps
// ════════════════════════════════════════════════════════════

/**
 * Fetch GHIN indexes from proxy — canonical function used by all apps
 * Posts ghin numbers to proxy, returns results array. Returns [] on any error.
 * Callers handle their own UI updates and state writes.
 */
async function ghinFetch(proxy, players) {
  const withGhin = players.filter(p => p.ghin);
  if (!withGhin.length || !proxy) return [];
  try {
    const r = await fetchWithTimeout(proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ghinNumbers: withGhin.map(p => p.ghin) })
    }, 15000);
    if (!r.ok) return [];
    const d = await r.json();
    return d.results || [];
  } catch (e) {
    return [];
  }
}

// ════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Toast duration constants — shared across all apps
 */
const DEBOUNCE_MS = 800;   // Firebase save debounce
const TOAST_MS = 2000;      // standard
const TOAST_LONG_MS = 4000; // success with detail
const TOAST_ERR_MS = 5000;  // errors

/**
 * Show a toast notification
 * Assumes a #toast element exists in the DOM with .show class handling
 */
function toast(msg, dur = TOAST_MS) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  // Timer managed by caller if needed (see pattern in apps)
}

/**
 * Set sync status indicator in header
 * Assumes a #sync-status element exists
 */
function setSyncStatus(msg, color) {
  const el = document.getElementById('sync-status');
  if (el) {
    el.textContent = '⬅ ' + msg;
    el.style.color = color || 'rgba(255,255,255,.4)';
  }
}

// ════════════════════════════════════════════════════════════
// EXPORTS for use in other modules
// ════════════════════════════════════════════════════════════
// In modern JS: export { esc, toArr, uid, ... }
// In browser globals: all above functions are automatically available
