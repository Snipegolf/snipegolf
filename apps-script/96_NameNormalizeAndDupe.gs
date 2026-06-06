/**
 * SnipeGolf v3 - 96_NameNormalizeAndDupe.gs
 *
 * Adds two things:
 *  1. titleCaseName_(name) - normalizes "paul o'brien" -> "Paul O'Brien", "sean mccarthy" -> "Sean McCarthy"
 *  2. Overrides apiAdminEntry_ to:
 *     - TitleCase display_name before save
 *     - Block create if a different person with same TitleCased name already exists in this league
 *       (admin must change the name e.g. "Brendan Daly Snr")
 *
 * Loads after 95_EntryEmailV2.gs.
 */

(function () {
  var PARTICLES = { van: 1, von: 1, de: 1, der: 1, du: 1, del: 1, della: 1, di: 1, da: 1, le: 1, la: 1 };

  function capFirst_(w) {
    if (!w) return w;
    return w.charAt(0).toUpperCase() + w.substring(1).toLowerCase();
  }

  function titleCaseToken_(token, isFirst) {
    if (!token) return token;
    // Preserve 1-2 char all-caps tokens (initials like JT, AJ, JJ)
    if (token.length <= 2 && token === token.toUpperCase() && /^[A-Z]+$/.test(token)) return token;

    var low = token.toLowerCase();

    // particle - keep lowercase unless it's the very first token
    if (!isFirst && PARTICLES[low]) return low;

    // O'Something
    if (/^o['\u2019]/.test(low)) {
      var rest = low.substring(2);
      return 'O' + low.charAt(1) + capFirst_(rest);
    }

    // Mc + letters (Mc + at least 1 char): McCarthy
    if (low.length > 2 && low.substring(0, 2) === 'mc') {
      var afterMc = low.substring(2);
      return 'Mc' + capFirst_(afterMc);
    }

    // Mac + letters - only cap next if 4+ chars total AND next char is consonant-ish
    // Keep "Mack" as Mack (4 chars but ends in single letter after Mac)
    // Convention: MacDonald, MacIntyre, MacLeod but Mack, Mace stay normal
    if (low.length >= 5 && low.substring(0, 3) === 'mac') {
      var afterMac = low.substring(3);
      // If afterMac starts with vowel + ending pattern that looks like normal word, still cap (MacIntyre)
      return 'Mac' + capFirst_(afterMac);
    }

    // Hyphenated: Smith-Jones
    if (low.indexOf('-') >= 0) {
      var parts = low.split('-');
      var out = [];
      for (var i = 0; i < parts.length; i++) out.push(capFirst_(parts[i]));
      return out.join('-');
    }

    // Apostrophe without O' prefix - e.g. D'Arcy
    if (low.indexOf("'") >= 0 || low.indexOf('\u2019') >= 0) {
      var apo = low.indexOf("'") >= 0 ? "'" : '\u2019';
      var aParts = low.split(apo);
      if (aParts.length === 2 && aParts[0].length === 1) {
        return aParts[0].toUpperCase() + apo + capFirst_(aParts[1]);
      }
    }

    return capFirst_(token);
  }

  function titleCaseName_(name) {
    if (!name) return '';
    var s = String(name).trim().replace(/\s+/g, ' ');
    if (!s) return '';
    var tokens = s.split(' ');
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      out.push(titleCaseToken_(tokens[i], i === 0));
    }
    return out.join(' ');
  }

  globalThis.titleCaseName_ = titleCaseName_;

  // Helper: find any participant in this league with same display_name (case-insensitive)
  // but different pid. Returns the row or null.
  function findNameClashInLeague_(leagueSlug, normalizedName, excludePid) {
    var r = rows_(TAB.PARTICIPANTS);
    var nLow = String(normalizedName).toLowerCase();
    for (var i = 0; i < r.rows.length; i++) {
      var row = r.rows[i];
      if (String(row.league_slug) !== String(leagueSlug)) continue;
      if (String(row.paid_status || '') === 'deleted') continue;
      if (excludePid && String(row.pid) === String(excludePid)) continue;
      if (String(row.display_name || '').toLowerCase() === nLow) return row;
    }
    return null;
  }
  globalThis.findNameClashInLeague_ = findNameClashInLeague_;

  // Override apiAdminEntry_ (defined in 95). Wraps with TitleCase + name-clash check.
  var _prevApi = globalThis.apiAdminEntry_;
  function apiAdminEntry_(body) {
    // Normalize name BEFORE anything else
    if (body && body.display_name) {
      body.display_name = titleCaseName_(body.display_name);
    }

    // Check for name clash in this league (different person, same name)
    var leagueSlug = String((body && body.league_slug) || '');
    var name = String((body && body.display_name) || '');
    if (leagueSlug && name && !body.force_create) {
      // Find existing entry with same email - that's the "update existing" path, not a clash
      var league = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
      var emailLow = String((body && body.email) || '').trim().toLowerCase();
      var existingByEmail = null;
      if (league && emailLow) existingByEmail = findExact_(league.comp_slug, emailLow);
      var existingPid = existingByEmail ? existingByEmail.pid : null;

      var clash = findNameClashInLeague_(leagueSlug, name, existingPid);
      if (clash) {
        return jsonOut_({
          error: 'name_clash',
          message: 'There\'s already a "' + name + '" entered (' + (clash.email || 'no email') + '). Please use a different name to tell them apart (e.g. ' + name + ' Snr, ' + name + ' Jr, or add a nickname).',
          existing: {
            pid: clash.pid,
            display_name: clash.display_name,
            email: clash.email,
            paid_status: clash.paid_status
          }
        });
      }
    }

    // Delegate to previous implementation (95_EntryEmailV2)
    return _prevApi(body);
  }
  globalThis.apiAdminEntry_ = apiAdminEntry_;

  // Also normalize names on admin_update
  var _prevUpdate = globalThis.apiAdminUpdate_;
  if (typeof _prevUpdate === 'function') {
    function apiAdminUpdate_(body) {
      if (body && body.fields && body.fields.display_name) {
        body.fields.display_name = titleCaseName_(body.fields.display_name);
        // Check clash on rename
        var pid = String(body.pid || '');
        var part = pid ? findRow_(TAB.PARTICIPANTS, 'pid', pid) : null;
        if (part) {
          var clash = findNameClashInLeague_(part.league_slug, body.fields.display_name, pid);
          if (clash) {
            return jsonOut_({
              error: 'name_clash',
              message: 'Cannot rename to "' + body.fields.display_name + '" - already used by ' + (clash.email || 'another entry') + '.'
            });
          }
        }
      }
      return _prevUpdate(body);
    }
    globalThis.apiAdminUpdate_ = apiAdminUpdate_;
  }
})();
