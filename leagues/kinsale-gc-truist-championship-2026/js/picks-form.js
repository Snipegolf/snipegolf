/**
 * SnipeGolf — picks-form.js (v1)
 * Standalone native picks form.
 * Loads bracket data from API, renders mutual-exclusion selects,
 * validates, and POSTs to Apps Script backend.
 *
 * Requires: API_BASE and SLUG already defined by app.js OR
 * reads them from meta tags on the page.
 *
 * Template substitution happens in app.js; this file
 * reads window.SG_API_BASE and window.SG_SLUG set by app.js init.
 */
(function () {
  'use strict';

  /* ── Constants injected by app.js at runtime ── */
  /* app.js sets window.SG_API_BASE and window.SG_SLUG before this runs */

  var BRACKET_EMOJIS  = ['🏆', '🥈', '🌿', '🎯'];
  var BRACKET_NAMES   = [
    'Bracket 1 — Top Ranked',
    'Bracket 2',
    'Bracket 3',
    'Bracket 4 — Longshots'
  ];

  /* ── DOM refs ── */
  var form      = document.getElementById('picks-form');
  var wrap      = document.getElementById('brackets-wrap');
  var msgErr    = document.getElementById('msg-err');
  var msgOk     = document.getElementById('msg-ok');
  var submitBtn = document.getElementById('submit-btn');
  var submitLbl = document.getElementById('submit-label');

  if (!form || !wrap) return; // not on picks page

  /* ── Helpers ── */
  function showErr(txt) {
    msgErr.textContent = txt;
    msgErr.classList.add('show');
    msgOk.classList.remove('show');
    msgErr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function showOk(txt) {
    msgOk.textContent = txt;
    msgOk.classList.add('show');
    msgErr.classList.remove('show');
  }
  function clearMsg() {
    msgErr.classList.remove('show');
    msgOk.classList.remove('show');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Wait for app.js to expose API details, then load brackets ── */
  function waitForApi(cb, attempts) {
    attempts = attempts || 0;
    var base = window.SG_API_BASE;
    var slug = window.SG_SLUG;
    if (base && slug && !/\{\{/.test(base)) {
      cb(base, slug);
    } else if (attempts < 30) {
      setTimeout(function () { waitForApi(cb, attempts + 1); }, 100);
    } else {
      // Fallback: try reading from meta tags
      var metaBase = (document.querySelector('meta[name="api-base"]') || {}).content;
      var metaSlug = (document.querySelector('meta[name="slug"]') || {}).content;
      if (metaBase && metaSlug) {
        cb(metaBase, metaSlug);
      } else {
        showErr('Could not load bracket data. Please use the direct form link your admin sent.');
      }
    }
  }

  /* ── Build a bracket card with two mutual-exclusion selects ── */
  function buildBracketCard(bIndex, bracketData) {
    var bNum   = bIndex + 1;
    var golfers = bracketData.golfers || [];
    var label  = bracketData.name  || BRACKET_NAMES[bIndex]  || ('Bracket ' + bNum);
    var emoji  = BRACKET_EMOJIS[bIndex] || '⛳';

    var card   = document.createElement('div');
    card.className = 'bracket-card';
    card.setAttribute('data-bracket', bNum);

    /* Header */
    card.innerHTML =
      '<div class="bracket-card__head">' +
        '<div class="bracket-card__label">' +
          '<span class="bracket-card__emoji" aria-hidden="true">' + emoji + '</span>' +
          esc(label) +
        '</div>' +
        '<div class="bracket-card__hint">Pick 2</div>' +
      '</div>' +
      '<div class="bracket-picks" id="bp-' + bNum + '"></div>';

    var picksRow = card.querySelector('#bp-' + bNum);

    /* Create two selects */
    var selA = buildSelect(bNum, 1, golfers);
    var selB = buildSelect(bNum, 2, golfers);

    /* Mutual exclusion: when one changes, remove that option from the other */
    selA.addEventListener('change', function () { syncSelects(selA, selB, golfers); checkReady(); });
    selB.addEventListener('change', function () { syncSelects(selB, selA, golfers); checkReady(); });

    var wrapA = document.createElement('div');
    var wrapB = document.createElement('div');
    wrapA.className = 'field';
    wrapB.className = 'field';

    var lblA = document.createElement('label');
    lblA.setAttribute('for', 'b' + bNum + '-pick1');
    lblA.textContent = 'Pick 1';
    var lblB = document.createElement('label');
    lblB.setAttribute('for', 'b' + bNum + '-pick2');
    lblB.textContent = 'Pick 2';

    wrapA.appendChild(lblA);
    wrapA.appendChild(selA);
    wrapB.appendChild(lblB);
    wrapB.appendChild(selB);

    picksRow.appendChild(wrapA);
    picksRow.appendChild(wrapB);

    return card;
  }

  function buildSelect(bNum, pickNum, golfers) {
    var sel = document.createElement('select');
    sel.id   = 'b' + bNum + '-pick' + pickNum;
    sel.name = 'b' + bNum + 'pick' + pickNum;
    sel.required = true;
    sel.setAttribute('data-bracket', bNum);
    sel.setAttribute('data-pick', pickNum);

    var defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '— Select golfer —';
    sel.appendChild(defaultOpt);

    golfers.forEach(function (g) {
      var opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      sel.appendChild(opt);
    });

    return sel;
  }

  /**
   * When changedSel picks a golfer, remove that golfer from otherSel
   * (but keep all others). If otherSel had that golfer selected, reset it.
   */
  function syncSelects(changedSel, otherSel, allGolfers) {
    var chosen = changedSel.value;
    var prevOther = otherSel.value;

    /* Rebuild otherSel options excluding chosen */
    while (otherSel.firstChild) otherSel.removeChild(otherSel.firstChild);

    var defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '— Select golfer —';
    otherSel.appendChild(defOpt);

    allGolfers.forEach(function (g) {
      if (g === chosen) return; // hide the selected one
      var opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      if (g === prevOther) opt.selected = true; // keep previous selection if still valid
      otherSel.appendChild(opt);
    });

    /* If previous selection was the one just chosen, reset */
    if (prevOther === chosen) otherSel.value = '';
  }

  /* ── Enable submit when all required fields filled ── */
  function checkReady() {
    var allSelects = form.querySelectorAll('select[required]');
    var allFilled = true;
    allSelects.forEach(function (s) { if (!s.value) allFilled = false; });
    var tb = document.getElementById('pf-tb');
    var gdpr = document.getElementById('pf-gdpr');
    var first = document.getElementById('pf-first');
    var last  = document.getElementById('pf-last');
    var email = document.getElementById('pf-email');
    var code  = document.getElementById('pf-code');
    var ready = allFilled &&
      tb && tb.value !== '' &&
      gdpr && gdpr.checked &&
      first && first.value.trim() !== '' &&
      last  && last.value.trim()  !== '' &&
      email && email.value.trim() !== '' &&
      code  && code.value.trim()  !== '';
    submitBtn.disabled = !ready;
  }

  /* Wire up live checks on all detail fields */
  ['pf-first','pf-last','pf-email','pf-phone','pf-code','pf-tb','pf-gdpr'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', checkReady);
    if (el && el.type === 'checkbox') el.addEventListener('change', checkReady);
  });

  /* ── Load bracket data from API ── */
  function loadBrackets(apiBase, slug) {
    var url = apiBase + '?mode=brackets&gc=' + encodeURIComponent(slug) + '&format=json';

    fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        renderBrackets(data.brackets || [], apiBase, slug);
      })
      .catch(function () {
        /* Fallback: render empty brackets so user can still see form */
        renderBrackets([], apiBase, slug);
      });
  }

  function renderBrackets(brackets, apiBase, slug) {
    /* Remove skeletons */
    wrap.innerHTML = '';

    /* If API returned no bracket data, show 4 empty brackets */
    if (!brackets || brackets.length === 0) {
      for (var i = 0; i < 4; i++) {
        brackets.push({ name: BRACKET_NAMES[i], golfers: [] });
      }
    }

    brackets.forEach(function (b, idx) {
      var card = buildBracketCard(idx, b);
      wrap.appendChild(card);
    });

    /* Store for form submission */
    window._SG_BRACKETS = brackets;
    window._SG_API_BASE = apiBase;
    window._SG_SLUG     = slug;
  }

  /* ── Form submission ── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearMsg();

    /* Gather picks */
    var allSelects = form.querySelectorAll('select[required]');
    var picks = [];
    var allFilled = true;
    allSelects.forEach(function (s) {
      if (!s.value) allFilled = false;
      else picks.push(s.value);
    });

    if (!allFilled) { showErr('Please select a golfer for every pick slot.'); return; }

    /* Duplicate check (across brackets) */
    var seen = {};
    for (var i = 0; i < picks.length; i++) {
      if (seen[picks[i]]) { showErr('You cannot pick the same golfer twice: ' + picks[i]); return; }
      seen[picks[i]] = true;
    }

    /* Tiebreaker */
    var tbEl = document.getElementById('pf-tb');
    var tbVal = tbEl ? Number(tbEl.value) : NaN;
    if (!tbEl || tbEl.value === '' || isNaN(tbVal) || tbVal < -40 || tbVal > 40) {
      showErr("Enter the winner's score to par, e.g. -22. Must be between -40 and +40.");
      return;
    }

    /* Consent */
    var gdpr = document.getElementById('pf-gdpr');
    if (!gdpr || !gdpr.checked) { showErr('You must accept the data consent to submit your picks.'); return; }

    /* Build payload */
    var first = (document.getElementById('pf-first') || {}).value || '';
    var last  = (document.getElementById('pf-last')  || {}).value || '';
    var email = (document.getElementById('pf-email') || {}).value || '';
    var phone = (document.getElementById('pf-phone') || {}).value || '';
    var code  = (document.getElementById('pf-code')  || {}).value || '';

    var payload = {
      mode:       'submit',
      gc:         window._SG_SLUG || '',
      first:      first.trim(),
      last:       last.trim(),
      email:      email.trim(),
      phone:      phone.trim(),
      code:       code.trim(),
      b1pick1:    picks[0] || '',
      b1pick2:    picks[1] || '',
      b2pick1:    picks[2] || '',
      b2pick2:    picks[3] || '',
      b3pick1:    picks[4] || '',
      b3pick2:    picks[5] || '',
      b4pick1:    picks[6] || '',
      b4pick2:    picks[7] || '',
      tiebreaker: tbVal,
      gdpr:       '1'
    };

    /* Disable submit, show spinner */
    submitBtn.disabled = true;
    submitLbl.innerHTML = '<div class="spinner"></div> Submitting…';

    var apiBase = window._SG_API_BASE || window.SG_API_BASE || '';
    if (!apiBase || /\{\{/.test(apiBase)) {
      showErr('Form not configured yet. Please use the direct link from your admin.');
      submitBtn.disabled = false;
      submitLbl.textContent = '✅ Submit My Picks →';
      return;
    }

    /* POST via fetch (Apps Script needs GET params, use URL-encoded body or query string) */
    var qs = Object.keys(payload).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]);
    }).join('&');

    var url = apiBase + '?' + qs;

    fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success) {
          form.style.display = 'none';
          showOk('🎉 ' + (data.message || 'Your picks have been submitted! Check your email for confirmation.'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          showErr(data && data.message ? data.message : 'Submission failed. Please try again.');
          submitBtn.disabled = false;
          submitLbl.textContent = '✅ Submit My Picks →';
        }
      })
      .catch(function (err) {
        showErr('Network error — please check your connection and try again.');
        submitBtn.disabled = false;
        submitLbl.textContent = '✅ Submit My Picks →';
        console.error(err);
      });
  });

  /* ── Boot ── */
  waitForApi(function (base, slug) {
    window.SG_API_BASE = base;
    window.SG_SLUG     = slug;
    loadBrackets(base, slug);
  });

}());
