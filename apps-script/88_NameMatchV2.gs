/**
 * SnipeGolf v3 — 88 NameMatchV2
 *
 * Purpose: Stop legit picks being tagged "invalid" because of name variants.
 *
 * Real-world triggers hit this weekend (The Open 2026):
 *   Dan Brown              vs  Daniel Brown         (nickname)
 *   Tom Sloman             vs  Thomas Sloman        (nickname)
 *   Baard Skogen           vs  Bard Skogen          (aa→a, oe→o transliteration)
 *   Ludvig Aberg           vs  Ludvig Åberg         (already handled, cosmetic only)
 *   Frederic Lacroix       vs  Frederic LaCroix     (case — already handled)
 *
 * Design (safe, minimal blast radius):
 *
 *   1. EXTEND normalizer with two-letter digraph rules ONLY (aa→a, oe→o).
 *      No nickname aliasing — too risky (Matt Fitzpatrick / Nick Taylor /
 *      Billy Horschel / Rickie Fowler etc. are ESPN-canonical short forms,
 *      so a Dan→Daniel style table backfires in the other direction).
 *
 *   2. LAST-NAME + FIRST-INITIAL fallback matcher, called by the
 *      leaderboard reconciler AFTER a direct-normalize miss. If exactly
 *      one field player shares (first-initial, last-name) with the pick,
 *      use that match. Otherwise fall through to "invalid" as before.
 *
 *      This is the killer feature — catches Dan/Daniel, Tom/Thomas, and
 *      any future short-name we haven't listed, without a maintained
 *      alias table.
 *
 * Deploy: paste into Apps Script. Save. No trigger changes.
 * V8 strict — var only, no arrow fns, no template literals.
 */

(function () {

  // ── Digraph collapse (aa/oe) ──────────────────────────────────
  function applyDigraphs_(s) {
    s = s.replace(/aa/g, 'a');
    s = s.replace(/oe/g, 'o');
    return s;
  }

  // ── New primary normalizer (replaces normNameV3_) ─────────────
  function normNameV4_(raw) {
    if (!raw) return '';
    var s = String(raw).toLowerCase().replace(/[\u00C0-\u017F]/g, function (ch) {
      var map = {
        '\u00e1': 'a', '\u00e0': 'a', '\u00e4': 'a', '\u00e2': 'a',
        '\u00e9': 'e', '\u00e8': 'e', '\u00eb': 'e', '\u00ea': 'e',
        '\u00ed': 'i', '\u00ef': 'i', '\u00ee': 'i',
        '\u00f3': 'o', '\u00f6': 'o', '\u00f4': 'o',
        '\u00fa': 'u', '\u00fc': 'u', '\u00fb': 'u',
        '\u00f1': 'n', '\u00e5': 'a', '\u00f8': 'o', '\u00e6': 'ae'
      };
      return map[ch] || ch;
    });
    s = applyDigraphs_(s);
    return s.replace(/[^a-z0-9]/g, '');
  }

  // ── Whitespace-form normalizer (accents stripped, punctuation → space) ─
  function toTokens_(raw) {
    if (!raw) return [];
    var s = String(raw).toLowerCase().replace(/[\u00C0-\u017F]/g, function (ch) {
      var map = {
        '\u00e1': 'a', '\u00e0': 'a', '\u00e4': 'a', '\u00e2': 'a',
        '\u00e9': 'e', '\u00e8': 'e', '\u00eb': 'e', '\u00ea': 'e',
        '\u00ed': 'i', '\u00ef': 'i', '\u00ee': 'i',
        '\u00f3': 'o', '\u00f6': 'o', '\u00f4': 'o',
        '\u00fa': 'u', '\u00fc': 'u', '\u00fb': 'u',
        '\u00f1': 'n', '\u00e5': 'a', '\u00f8': 'o', '\u00e6': 'ae'
      };
      return map[ch] || ch;
    });
    s = applyDigraphs_(s);
    return s.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  }

  // ── Fuzzy fallback: (first-initial, last-name) → single field player ─
  //
  // Called by the reconciler wrapper below whenever a direct normalized
  // lookup misses. Uses a cache attached to the scPlayers object so we
  // only build the index once per leaderboard render.
  function fuzzyLastNameMatch_(pickRaw, scPlayers) {
    if (!pickRaw || !scPlayers) return null;

    if (!scPlayers.__initLastIdx) {
      var idx = {};
      var keys = Object.keys(scPlayers);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.charAt(0) === '_') continue;
        var pl = scPlayers[k];
        var disp = (pl && pl.name) ? pl.name : '';
        if (!disp) continue;
        var tokens = toTokens_(disp);
        if (tokens.length < 2) continue;
        var initial = tokens[0].charAt(0);
        var last = tokens[tokens.length - 1];
        var idxKey = initial + '|' + last;
        if (!idx[idxKey]) idx[idxKey] = [];
        idx[idxKey].push(pl);
      }
      // Non-enumerable-ish sentinels; also avoid polluting Object.keys iterations later
      scPlayers.__initLastIdx = idx;
    }

    var pTokens = toTokens_(pickRaw);
    if (pTokens.length < 2) return null;
    var pKey = pTokens[0].charAt(0) + '|' + pTokens[pTokens.length - 1];
    var candidates = scPlayers.__initLastIdx[pKey] || [];
    if (candidates.length === 1) return candidates[0];
    return null;
  }

  // ── Wrap fetchScores*_ to add extra alias keys and cache the fuzzy idx ─
  //
  // For each field player we ALSO register the display-name normalized under
  // normNameV4_ — usually a no-op (same key), but harmless. The point of the
  // wrap is really to guarantee normNameV4_ was applied at the moment the
  // players map was built (in case a future refactor bypasses it).
  function wrapFetch_(orig) {
    if (typeof orig !== 'function') return orig;
    return function () {
      var out = orig.apply(this, arguments);
      if (out && out.players && typeof out.players === 'object') {
        var players = out.players;
        var keys = Object.keys(players);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (k.charAt(0) === '_') continue;
          var pl = players[k];
          if (!pl || !pl.name) continue;
          var alias = normNameV4_(pl.name);
          if (alias && alias !== k && !players[alias]) {
            players[alias] = pl;
          }
        }
      }
      return out;
    };
  }

  // ── Wrap scorePick_ so a miss falls through to fuzzyLastNameMatch_ ─
  //
  // We wrap globalThis.scorePick_ if present. If the file that defines
  // scorePick_ loads AFTER this one, the wrap won't apply — so we also
  // install fuzzyLastNameMatch_ as a globalThis helper that a future
  // patch of scorePick_ can call directly.
  function wrapScorePick_(orig) {
    if (typeof orig !== 'function') return orig;
    return function (name, scPlayers, winnerScore, penalty, rosterSet, started) {
      var res = orig.call(this, name, scPlayers, winnerScore, penalty, rosterSet, started);
      // Only intervene on the "invalid" (never-in-field) branch.
      if (res && (res.status === 'invalid' || res.status === 'not_in_field')) {
        var m = fuzzyLastNameMatch_(name, scPlayers);
        if (m) {
          var s = m.score;
          var isCut = !!m.cut;
          if (isCut) s = s + penalty;
          return {
            name: m.name,
            score: s,
            status: m.status || '',
            position_int: m.position_int,
            cut: isCut
          };
        }
      }
      return res;
    };
  }

  // ── Install ───────────────────────────────────────────────────
  globalThis.normNameV3_ = normNameV4_;
  globalThis.normNameV4_ = normNameV4_;
  globalThis.fuzzyLastNameMatch_ = fuzzyLastNameMatch_;

  if (typeof globalThis.fetchScoresV3_ === 'function') {
    globalThis.fetchScoresV3_ = wrapFetch_(globalThis.fetchScoresV3_);
  }
  if (typeof globalThis.fetchScores2_ === 'function') {
    globalThis.fetchScores2_ = wrapFetch_(globalThis.fetchScores2_);
  }
  if (typeof globalThis.scorePick_ === 'function') {
    globalThis.scorePick_ = wrapScorePick_(globalThis.scorePick_);
  }
})();
