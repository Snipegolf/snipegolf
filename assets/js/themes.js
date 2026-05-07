/**
 * SnipeGolf — themes.js
 * 10 tournament-inspired colourways. Each theme defines CSS custom properties
 * that drive the entire visual system. Activated via <body data-theme="…">.
 *
 * Required vars per theme:
 *   --bg        page background
 *   --surface   card / panel background
 *   --surface-2 elevated surface (hover, modals)
 *   --text      primary text
 *   --muted     secondary text
 *   --accent    primary brand accent (CTAs, headlines)
 *   --accent-2  secondary accent (highlights, links)
 *   --border    hairline divider
 *   --good      positive / movement up
 *   --bad       negative / movement down
 *
 * Each theme also declares whether it's `dark` or `light` so app.js can
 * pick a sensible status-bar / scrollbar treatment.
 */

(function (global) {
  'use strict';

  var THEMES = [
    {
      id: 'augusta',
      name: 'Augusta',
      mode: 'dark',
      desc: 'Deep emerald, cream, gold',
      tokens: {
        '--bg': '#081d14',
        '--surface': '#0e3e2a',
        '--surface-2': '#13513a',
        '--text': '#f5efe0',
        '--muted': '#a6b9ac',
        '--accent': '#c9a961',
        '--accent-2': '#e8d49a',
        '--border': 'rgba(245,239,224,0.10)',
        '--good': '#7fc99a',
        '--bad': '#e08374'
      }
    },
    {
      id: 'quail-hollow',
      name: 'Quail Hollow',
      mode: 'dark',
      desc: 'Navy, sky, white',
      tokens: {
        '--bg': '#06192f',
        '--surface': '#0a2a4e',
        '--surface-2': '#103966',
        '--text': '#ffffff',
        '--muted': '#9bb6cf',
        '--accent': '#5ba3d0',
        '--accent-2': '#cfe4f3',
        '--border': 'rgba(255,255,255,0.10)',
        '--good': '#7dd0a2',
        '--bad': '#e08374'
      }
    },
    {
      id: 'pebble-beach',
      name: 'Pebble Beach',
      mode: 'dark',
      desc: 'Slate blue, sand, coral',
      tokens: {
        '--bg': '#1f2d3a',
        '--surface': '#3a5266',
        '--surface-2': '#48627a',
        '--text': '#e8dcc0',
        '--muted': '#b9b5a5',
        '--accent': '#e07856',
        '--accent-2': '#f0a385',
        '--border': 'rgba(232,220,192,0.12)',
        '--good': '#9bc995',
        '--bad': '#d65a4f'
      }
    },
    {
      id: 'st-andrews',
      name: 'St Andrews',
      mode: 'dark',
      desc: 'Heather, grey stone',
      tokens: {
        '--bg': '#211a2a',
        '--surface': '#4a3b5c',
        '--surface-2': '#5a4a6e',
        '--text': '#ddd6cc',
        '--muted': '#a8a39d',
        '--accent': '#c9b8d8',
        '--accent-2': '#e6dff0',
        '--border': 'rgba(221,214,204,0.10)',
        '--good': '#9ec99a',
        '--bad': '#d68a82'
      }
    },
    {
      id: 'pinehurst',
      name: 'Pinehurst',
      mode: 'dark',
      desc: 'Terracotta, pine, sand',
      tokens: {
        '--bg': '#162614',
        '--surface': '#2d4a2a',
        '--surface-2': '#395d36',
        '--text': '#e8d9b0',
        '--muted': '#b6b099',
        '--accent': '#a85a3e',
        '--accent-2': '#cf7f5e',
        '--border': 'rgba(232,217,176,0.12)',
        '--good': '#a8c987',
        '--bad': '#d8775e'
      }
    },
    {
      id: 'bethpage-black',
      name: 'Bethpage Black',
      mode: 'dark',
      desc: 'Black, signal yellow',
      tokens: {
        '--bg': '#0a0a0a',
        '--surface': '#161616',
        '--surface-2': '#222222',
        '--text': '#f4f4f4',
        '--muted': '#9a9a9a',
        '--accent': '#ffd60a',
        '--accent-2': '#fff385',
        '--border': 'rgba(255,255,255,0.08)',
        '--good': '#7ad99c',
        '--bad': '#ff6b5a'
      }
    },
    {
      id: 'royal-birkdale',
      name: 'Royal Birkdale',
      mode: 'dark',
      desc: 'Claret, cream, navy',
      tokens: {
        '--bg': '#11192a',
        '--surface': '#1a2740',
        '--surface-2': '#243353',
        '--text': '#f4efe3',
        '--muted': '#b3afa5',
        '--accent': '#a3392f',
        '--accent-2': '#d35a4d',
        '--border': 'rgba(244,239,227,0.10)',
        '--good': '#8fc99a',
        '--bad': '#e08374'
      }
    },
    {
      id: 'riviera',
      name: 'Riviera',
      mode: 'dark',
      desc: 'Terracotta, olive, ivory',
      tokens: {
        '--bg': '#22241a',
        '--surface': '#33371f',
        '--surface-2': '#414427',
        '--text': '#f8f2e4',
        '--muted': '#b9b09c',
        '--accent': '#d96e3f',
        '--accent-2': '#a4ad60',
        '--border': 'rgba(248,242,228,0.10)',
        '--good': '#a4ad60',
        '--bad': '#d96e3f'
      }
    },
    {
      id: 'whistling-straits',
      name: 'Whistling Straits',
      mode: 'dark',
      desc: 'Slate, lake blue, bone',
      tokens: {
        '--bg': '#222a30',
        '--surface': '#3d4a52',
        '--surface-2': '#4d5d67',
        '--text': '#e0ddd3',
        '--muted': '#a9aea7',
        '--accent': '#4a7ca0',
        '--accent-2': '#7eaecb',
        '--border': 'rgba(224,221,211,0.10)',
        '--good': '#8ec99a',
        '--bad': '#d68272'
      }
    },
    {
      id: 'snipe-default',
      name: 'Snipe Default',
      mode: 'dark',
      desc: 'Black, emerald, electric',
      tokens: {
        '--bg': '#0a0a0a',
        '--surface': '#121414',
        '--surface-2': '#1c1f1e',
        '--text': '#f4f4f4',
        '--muted': '#8a8f8c',
        '--accent': '#00a86b',
        '--accent-2': '#00ff87',
        '--border': 'rgba(0,255,135,0.12)',
        '--good': '#00ff87',
        '--bad': '#ff5a6b'
      }
    }
  ];

  var STORAGE_KEY = 'snipegolf:theme';

  function dayOfYear(d) {
    var date = d || new Date();
    var start = new Date(date.getFullYear(), 0, 0);
    var diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000;
    return Math.floor(diff / 86400000);
  }

  function getById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  function defaultTheme() {
    return THEMES[dayOfYear() % THEMES.length];
  }

  function apply(themeOrId) {
    var t = typeof themeOrId === 'string' ? getById(themeOrId) : themeOrId;
    if (!t) t = defaultTheme();
    var root = document.documentElement;
    var keys = Object.keys(t.tokens);
    for (var i = 0; i < keys.length; i++) {
      root.style.setProperty(keys[i], t.tokens[keys[i]]);
    }
    document.body.setAttribute('data-theme', t.id);
    document.body.setAttribute('data-theme-mode', t.mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.tokens['--bg']);
    return t;
  }

  function save(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
  }

  function load() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function init() {
    var stored = load();
    var theme = stored ? getById(stored) : null;
    if (!theme) {
      // Per-league default: <meta name="default-theme" content="augusta">
      var meta = document.querySelector('meta[name="default-theme"]');
      if (meta) {
        var leagueDefault = (meta.getAttribute('content') || '').trim();
        if (leagueDefault) theme = getById(leagueDefault);
      }
    }
    if (!theme) theme = defaultTheme();
    apply(theme);
    return theme;
  }

  global.SnipeThemes = {
    list: THEMES,
    apply: apply,
    save: save,
    load: load,
    init: init,
    getById: getById,
    defaultTheme: defaultTheme,
    STORAGE_KEY: STORAGE_KEY
  };
}(typeof window !== 'undefined' ? window : this));
