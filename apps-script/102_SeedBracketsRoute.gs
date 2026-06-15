/**
 * 102_SeedBracketsRoute.gs
 *
 * Phone-triggerable one-shot seeder for US Open 2026 brackets.
 * Adds GET route: ?route=seed_us_open&key=OWNER_KEY
 *
 * Owner key required. Writes 148 players across A/B/C/D to the Brackets tab
 * for comp_slug = 'us-open-2026'. Idempotent — deletes existing rows for that
 * comp first.
 *
 * Hooks the FinalRouter's doGet by wrapping it.
 */
(function (g) {
  var COMP_SLUG = 'us-open-2026';
  var TAB_NAME = 'Brackets';

  var BRACKET_A = [
    'Scottie Scheffler','Rory McIlroy','Xander Schauffele','Bryson DeChambeau',
    'Jon Rahm','Ludvig Aberg','Collin Morikawa','Tommy Fleetwood','Justin Thomas',
    'Hideki Matsuyama','Russell Henley','Viktor Hovland','Patrick Cantlay',
    'Sepp Straka','Joaquin Niemann','Keegan Bradley','Robert MacIntyre','Tyrrell Hatton'
  ];
  var BRACKET_B = [
    'Sungjae Im','Shane Lowry','Brooks Koepka','Aaron Rai','Cameron Smith',
    'Akshay Bhatia','Maverick McNealy','Matt Fitzpatrick','Wyndham Clark',
    'Sam Burns','Tom Kim','Min Woo Lee','Justin Rose','Cameron Young',
    'Corey Conners','Harris English','Ben Griffin','Chris Gotterup','J.J. Spaun',
    'Jordan Spieth','Sahith Theegala','Si Woo Kim','Jason Day','Adam Scott',
    'Brian Harman','Andrew Novak','Harry Hall','Nick Taylor','Daniel Berger',
    'Patrick Reed','Rickie Fowler','Dustin Johnson'
  ];
  var BRACKET_C = [
    'Lucas Herbert','Carlos Ortiz','Nicolai Hojgaard','Ryan Fox','Sam Stevens',
    'Pierceson Coody','Davis Thompson','Michael Kim','Matt McCarty','Ryan Gerard',
    'Kurt Kitayama','Jake Knapp','Nico Echavarria','Alex Smalley','Ryo Hisatsune',
    'Gary Woodland','Alex Noren','Jacob Bridgeman','Patrick Rodgers','Alex Fitzpatrick',
    'Chris Kirk','Keith Mitchell','Billy Horschel','Emiliano Grillo','Max Greyserman',
    'Jackson Suber','David Puig','Padraig Harrington','Laurie Canter','Matti Schmid',
    'Adrien Saddier','Niklas Norgaard','Angel Hidalgo','Kristoffer Reitan',
    'Jayden Schaper','Johnny Keefer','Michael Brennan','Carl Yuan','Andrew Putnam',
    'Taylor Montgomery','Nick Hardy','Dylan Wu','Brandon Wu','Peter Uihlein',
    'Graeme McDowell','Ben Kohles','Cole Hammer','Ben James'
  ];
  var BRACKET_D = [
    'Sudarshan Yellamaraju','Neal Shipley','Zac Blair','Jimmy Stanger','Cooper Dossey',
    'Adrien Dumont de Chassart','Caleb Surratt','Ben Silverman','Alejandro Tosti',
    'Marcelo Rozo','William Mouw','John Parry','Max McGreevy','J.B. Holmes','Kevin Roy',
    'James Nicholas','Manav Shah','T.K. Kim','Jake Sollon','Jake Peacock','Robbie Higgins',
    'Greyson Leach','Jackson Van Paris','Nathan Kimsey','Rocco Repetto Taylor',
    'Filippo Celli','Matthew Jordan','Ugo Coussaud','Ryuichi Oiwa','Kaito Onishi',
    'Taihei Sato','Miles Russell','Ryder Cowan','Mason Howell','Jackson Herrington',
    'Hamilton Coleman','Brandon Holtz','Ethan Fang','Jackson Koivun','Preston Stout',
    'Mateo Pulcini','Giuseppe Puebla','Logan Reilly','Vaughn Harber','Jackson Ormond',
    'Chase Kyes','Matthew Robles','Marek Fleming','Eric Lee','Arni Sveinsson'
  ];

  function jsonOut_(o) {
    return ContentService
      .createTextOutput(JSON.stringify(o))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function checkOwnerKey_(key) {
    if (!key) return false;
    try {
      var ownerKey = (typeof cfg_ === 'function') ? String(cfg_('owner_admin_key') || '') : '';
      if (ownerKey && key === ownerKey) return true;
    } catch (e) {}
    // hardcoded fallback (owner key from session context)
    return key === 'c806b0dc8e534ce6812e';
  }

  function getSheetId_() {
    if (typeof getMasterSheetId_ === 'function') return getMasterSheetId_();
    return '1RQTUZROazdcH2mYavJ3mEceKcgqSzqhmYsI3V_zW4Lw';
  }

  function ensureBracketsSheet_() {
    var ss = SpreadsheetApp.openById(getSheetId_());
    var sh = ss.getSheetByName(TAB_NAME);
    if (!sh) {
      sh = ss.insertSheet(TAB_NAME);
      sh.appendRow(['comp_slug', 'bracket', 'name', 'seed']);
      sh.setFrozenRows(1);
    }
    return sh;
  }

  function deleteCompRows_(sh, compSlug) {
    var last = sh.getLastRow();
    if (last < 2) return 0;
    var vals = sh.getRange(2, 1, last - 1, 1).getValues();
    var removed = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim() === compSlug) {
        sh.deleteRow(i + 2);
        removed++;
      }
    }
    return removed;
  }

  function writeRows_(sh, compSlug, letter, players) {
    var rows = [];
    for (var i = 0; i < players.length; i++) {
      rows.push([compSlug, letter, players[i], i + 1]);
    }
    if (!rows.length) return 0;
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    return rows.length;
  }

  function seedUSOpen_() {
    var sh = ensureBracketsSheet_();
    var removed = deleteCompRows_(sh, COMP_SLUG);
    var a = writeRows_(sh, COMP_SLUG, 'A', BRACKET_A);
    var b = writeRows_(sh, COMP_SLUG, 'B', BRACKET_B);
    var c = writeRows_(sh, COMP_SLUG, 'C', BRACKET_C);
    var d = writeRows_(sh, COMP_SLUG, 'D', BRACKET_D);
    return {
      ok: true,
      comp: COMP_SLUG,
      removed_old: removed,
      written: { A: a, B: b, C: c, D: d, total: a + b + c + d },
      ts: new Date().toISOString()
    };
  }

  // ---- Hook router ----
  var prevDoGet = g.doGet;
  g.doGet = function (e) {
    try {
      var p = (e && e.parameter) ? e.parameter : {};
      var route = String(p.route || '');
      if (route === 'seed_us_open') {
        if (!checkOwnerKey_(String(p.key || ''))) {
          return jsonOut_({ ok: false, error: 'unauthorized' });
        }
        return jsonOut_(seedUSOpen_());
      }
      if (route === 'preview_us_open') {
        return jsonOut_({
          ok: true,
          counts: {
            A: BRACKET_A.length, B: BRACKET_B.length,
            C: BRACKET_C.length, D: BRACKET_D.length,
            total: BRACKET_A.length + BRACKET_B.length + BRACKET_C.length + BRACKET_D.length
          }
        });
      }
    } catch (err) {
      return jsonOut_({ ok: false, error: String(err) });
    }
    if (typeof prevDoGet === 'function') return prevDoGet(e);
    return jsonOut_({ ok: false, error: 'no_router' });
  };

  // Expose for direct Apps Script run if needed
  g.seedUSOpenBracketsViaRoute = seedUSOpen_;
})(globalThis);
