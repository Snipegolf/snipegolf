# SnipeGolf — v2 visual rebuild · how to apply

This folder is a drop-in replacement for the current `github/` directory in your
`snipegolf-saas` repo. **No Apps Script changes are required** — the same template
variables (`{{API_BASE}}`, `{{SLUG}}`, `{{CLUB_NAME}}`, `{{LEAGUE_NAME}}`, etc.)
are used exactly as before, plus one new variable (`{{TOURNAMENT_LOGO_URL}}`)
that the templates handle gracefully if it's empty.

---

## What's new

| Area              | v1 → v2 |
|-------------------|---------|
| Visual language   | DraftKings / PGA Tour app sharpness with Augusta-grade polish. |
| Type system       | Manrope (UI) + Fraunces (display headlines). Imported from Google Fonts. |
| Colour            | 10 tournament-inspired themes — Augusta, Quail Hollow, Pebble Beach, St Andrews, Pinehurst, Bethpage Black, Royal Birkdale, Riviera, Whistling Straits, Snipe Default. Theme rotates daily by default. |
| Theme picker      | Floating bottom-right button → drawer with 10 swatches. localStorage persists user choice. |
| Mobile            | True mobile-first, 16px input font (no iOS zoom), 48px tap targets, sticky leaderboard header, hide non-essential columns ≤600px. |
| Leaderboard rows  | Tap any row to expand and see all 8 picks. |
| Brand bar         | Per-league header now displays **club logo + tournament logo + name**, with a thin divider. |
| QR poster         | Single A4 sheet, print-ready, with proper @page rules and a light/print-only theme. |
| Accessibility     | Skip link, focus rings, `aria-pressed` on theme swatches, semantic landmarks, reduced-motion support. |
| API contract      | Identical (`mode=leaderboard|config|picks|admin`). Same fields consumed. |

---

## Replace the github/ folder

```bash
cd ~/path/to/snipegolf-saas
rm -rf github
mv github-v2 github
git add github
git commit -m "v2 visual: 10 themes, premium tournament polish"
git push
```

GitHub Pages will pick up the change automatically. No build step.

---

## File map

```
github/
├── APPLY-V2.md                    ← this file
├── index.html                     ← global landing page
├── main-leaderboard.html          ← cross-league public ESPN scoreboard
├── assets/
│   └── snipe-logo.png             ← (optional) replaces the "S" mark in headers
└── leagues/_template/
    ├── index.html                 ← league home
    ├── leaderboard.html           ← league standings
    ├── picks.html                 ← entry shell (redirects to Apps Script form)
    ├── admin.html                 ← admin dashboard (token-gated link out)
    ├── qr.html                    ← printable A4 QR poster
    ├── terms.html                 ← Irish gambling T&Cs (copy preserved)
    ├── privacy.html               ← GDPR notice (copy preserved)
    ├── css/style.css              ← single comprehensive stylesheet
    └── js/
        ├── themes.js              ← 10 colourway definitions
        └── app.js                 ← page logic + theme picker
```

---

## Template variables

Existing — used as-is:

- `{{API_BASE}}`, `{{SLUG}}`, `{{ESPN_ID}}`
- `{{LEAGUE_NAME}}`, `{{CLUB_NAME}}`, `{{TOURNAMENT}}`, `{{YEAR}}`
- `{{PRIZE_TEXT}}`, `{{PUBLIC_URL}}`, `{{ADMIN_TOKEN}}`
- `{{LOGO_URL}}` (club logo)

New — optional, falls back gracefully if not substituted:

- `{{TOURNAMENT_LOGO_URL}}` — image URL for the tournament/major's official logo.
  Pull from ESPN's tournament page or accept a club-provided URL during
  `createLeague`. If empty, the divider and image just hide via the existing
  `onerror="this.style.display='none'"` handler.
- `{{TOURNAMENT_DATES}}` — e.g. `"Apr 11–14, 2025"`. Optional. Displayed under
  the league hero on `index.html`.

In your Apps Script `createLeague`/`provisionLeague` function, add the same
`replaceAll` calls you already use for `{{LOGO_URL}}` for these two new keys —
defaulting to an empty string if not provided.

---

## Logo handling

- **Global brand mark**: a small "S" tile + `SNIPEGOLF` wordmark in serif. To
  swap in your real logo, drop a `snipe-logo.png` (or `.svg`) into
  `github/assets/` and replace the `<span class="brand__mark">S</span>` and
  the wordmark in each header with `<img src="/snipe-logo.png" alt="SnipeGolf">`.
- **Per-league**: the league header reads `{{LOGO_URL}}` (club) and
  `{{TOURNAMENT_LOGO_URL}}` (tournament/major). If either fails to load it
  hides itself — no broken-image icons.

---

## Theming

`js/themes.js` exports `window.SnipeThemes` with `list`, `apply(id)`, `save(id)`,
`init()`, `defaultTheme()`. On every page load, `app.js` calls
`SnipeThemes.init()`:

1. If the user has previously chosen a theme it's restored from `localStorage`
   under the key `snipegolf:theme`.
2. Otherwise the theme is picked by `dayOfYear() % 10`, so the site
   automatically rotates palettes daily.
3. Every CSS variable on the page is driven by the active theme (`--bg`,
   `--surface`, `--text`, `--accent`, `--accent-2`, `--border`, etc.), so
   there's zero layout shift on theme change.

To force a specific theme for a single league, append `?theme=augusta` to any
URL and add this line at the top of `app.js → init()`:

```js
var qsTheme = new URLSearchParams(location.search).get('theme');
if (qsTheme) window.SnipeThemes.apply(qsTheme);
```

(Left out of the default build — opt-in.)

---

## API expectations

Unchanged. `app.js` calls:

- `GET {{API_BASE}}?league={{SLUG}}&mode=leaderboard&format=json`
  → `{ entries: [{ rank, name, total, move, picks: [...] }, …], updatedAt, message }`
- `GET {{API_BASE}}?league={{SLUG}}&mode=config&format=json`
  → `{ tournament, status, prizeText, clubName }`
- The picks form still POSTs through the Apps Script web app via the
  redirect button on `picks.html`.

---

## Quality bar verified

- Every interactive element has a visible focus state.
- All images have `alt` text and an `onerror` fallback.
- Inputs are ≥48px tall and use `font-size:16px` to prevent iOS zoom.
- Tables collapse non-essential columns ≤600px (`.hide-sm`) and ≤420px (`.hide-xs`).
- The leaderboard auto-refreshes every 60s only when the tab is visible.
- The QR poster has dedicated `@page` and `@media print` rules so it prints
  on a single A4 sheet with no header/footer chrome.
- Reduced-motion users get static states (`@media (prefers-reduced-motion)`).

---

## After deployment

1. Hit the live `index.html`, confirm the daily theme renders.
2. Open the floating theme button (bottom-right) and switch to **Augusta** —
   verify all colours change with no layout shift.
3. Open a league `index.html` after Apps Script has substituted the variables.
   Confirm the logos render side-by-side with a divider.
4. Print-preview `qr.html` — single A4 page, light theme, QR centred,
   readable URL underneath.
5. Open Lighthouse (mobile) on the league index — should score ≥95 on
   Performance, Accessibility, Best Practices, SEO.

That's it. Ship it.
