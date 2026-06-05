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
    for (var i = parts.length - 1; i >= 0; i--) {
      if (/^[a-z0-9][a-z0-9-]+$/.test(parts[i]) && !/\.html?$/.test(parts[i]) && parts[i] !== 'snipegolf') return parts[i];
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
      { id: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' },
      { id: 'field',       label: 'Field',       href: 'field.html' },
      { id: 'picks',       label: 'Enter picks', href: 'picks.html' },
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
            (clubLogo ? '<img src="' + esc(clubLogo) + '" alt="' + esc(leagueName) + '" onerror="this.style.display=\'none\'">' : '') +
            (clubLogo && tournamentLogo ? '<span class="league-logos__divider" aria-hidden="true"></span>' : '') +
            (tournamentLogo ? '<img src="' + esc(tournamentLogo) + '" alt="' + esc(compName) + '" onerror="this.style.display=\'none\'">' : '') +
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

      // apply theme via comp.theme or league.theme later
      document.documentElement.setAttribute('data-league', slug);
      if (typeof window.applyTheme === 'function' && (d.comp && d.comp.theme)) {
        window.applyTheme(d.comp.theme);
      }
      return d;
    });
  }

  window.SGNav = { init: init };
})();
