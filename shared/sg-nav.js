/**
 * SnipeGolf v3 — shared nav script
 * Renders site-header + league-header + tab-nav based on URL path /<league_slug>/<page>.html
 * Pulls league + comp meta from /api/league/<slug>
 * Applies theme via themes.js (loaded separately).
 *
 * Pages call window.SGNav.init({ active: 'leaderboard' | 'home' | 'field' | 'picks' | 'qr' | 'admin' })
 */
(function () {
  var WORKER = 'https://twilight-recipe-e213.badenmaher.workers.dev';

  function getLeagueSlug() {
    var qs = new URLSearchParams(location.search);
    if (qs.get('league')) return qs.get('league');
    var parts = location.pathname.replace(/\/$/, '').split('/');
    var RESERVED = { 'snipegolf': 1, 'picks': 1, 'leaderboard': 1, 'field': 1, 'qr': 1, 'index': 1, 'admin': 1, 'holding': 1, 'shared': 1, 'assets': 1, 'rules': 1, 'brackets': 1 };
    // Prefer the longest slug-with-hyphen (leagues look like 'us-open-2026-cobh-gc')
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (!p) continue;
      if (RESERVED[p]) continue;
      if (/\.html?$/.test(p)) continue;
      if (!/^[a-z0-9][a-z0-9-]+$/.test(p)) continue;
      if (p.indexOf('-') === -1) continue;
      return p;
    }
    // Fallback: any non-reserved slug
    for (var j = parts.length - 1; j >= 0; j--) {
      var q = parts[j];
      if (!q || RESERVED[q]) continue;
      if (/\.html?$/.test(q)) continue;
      if (/^[a-z0-9][a-z0-9-]+$/.test(q)) return q;
    }
    return '';
  }

  function fetchLeague(slug) {
    return fetch(WORKER + '/api/league?slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.json(); });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function renderHeader(d, opts) {
    var league = d.league || {};
    var comp = d.comp || {};
    var compName = comp.name || 'Tournament';
    var leagueName = league.league_name || '';
    var clubLogo = league.logo_url || '';
    var tournamentLogo = comp.logo_url || '';
    var slug = league.league_slug || '';
    var picksLink = opts.picksUrlOverride || (slug + '/picks.html');
    var nav = [
      { id: 'home',        label: 'Home',        href: 'index.html' },
      { id: 'brackets',    label: 'Brackets',    href: 'brackets.html' },
      { id: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' },
      { id: 'field',       label: 'Field',       href: 'field.html' },
      { id: 'rules',       label: 'Rules',       href: 'rules.html' },
      { id: 'qr',          label: 'QR poster',   href: 'qr.html' }
    ];

    var html = '' +
      '<header class="site-header" role="banner">' +
        '<div class="site-header__inner">' +
          '<a class="brand" href="../index.html" aria-label="SnipeGolf home">' +
            '<span class="brand__mark" aria-hidden="true">S</span>' +
            '<span class="serif">SNIPEGOLF</span>' +
          '</a>' +
          '<nav class="site-nav" aria-label="Primary">' +
            '<a href="field.html" title="Tournament live scores">PGA live scores</a>' +
          '</nav>' +
        '</div>' +
      '</header>' +
      '<div class="league-header">' +
        '<div class="league-header__row">' +
          '<div class="league-logos">' +
            // Show ONE logo: prefer tournament logo (Masters, US Open, PGA), else club logo
            ((tournamentLogo || clubLogo) ? '<img class="league-logos__main" src="' + esc(tournamentLogo || clubLogo) + '" alt="' + esc(compName || leagueName) + '" onerror="this.style.display=\'none\'">' : '') +
          '</div>' +
          '<div class="league-title">' +
            '<span>' + esc(compName) + '</span>' +
            '<small>' + esc(leagueName) + (comp.year ? ' · ' + esc(comp.year) : '') + '</small>' +
          '</div>' +
        '</div>' +
      '</div>';

    // tab-nav placed inside main container by page (page calls renderTabs)
    var tabs = '<nav class="tab-nav" aria-label="League sections">';
    for (var i = 0; i < nav.length; i++) {
      tabs += '<a href="' + esc(nav[i].href) + '"' + (nav[i].id === opts.active ? ' class="active"' : '') + '>' + esc(nav[i].label) + '</a>';
    }
    tabs += '</nav>';

    return { headerHtml: html, tabsHtml: tabs, league: league, comp: comp };
  }

  function init(opts) {
    opts = opts || {};
    var slug = opts.league || getLeagueSlug();
    if (!slug) {
      console.error('SGNav: no league slug detected');
      return Promise.resolve({});
    }
    return fetchLeague(slug).then(function (d) {
      if (!d || !d.ok) {
        console.error('SGNav: league not found', slug, d);
        return d;
      }
      var rendered = renderHeader(d, opts);
      // inject header above body content
      var headerHolder = document.getElementById('sg-header');
      if (headerHolder) headerHolder.innerHTML = rendered.headerHtml;
      else document.body.insertAdjacentHTML('afterbegin', rendered.headerHtml);

      var tabsHolder = document.getElementById('sg-tabs');
      if (tabsHolder) tabsHolder.innerHTML = rendered.tabsHtml;

      document.documentElement.setAttribute('data-league', slug);
      // Apply theme: comp.theme > league.theme > stored > day-of-year rotation
      if (window.SnipeThemes) {
        var compTheme = (d.comp && d.comp.theme) || (d.league && d.league.theme) || '';
        if (compTheme && typeof window.SnipeThemes.getById === 'function' && window.SnipeThemes.getById(compTheme)) {
          window.SnipeThemes.apply(compTheme);
        } else {
          window.SnipeThemes.init();
        }
      }
      return d;
    });
  }

  window.SGNav = { init: init };
})();
