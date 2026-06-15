/**
 * 101_SeedUSOpenBrackets.gs
 *
 * One-shot manual seeder for US Open 2026 (Cobh GC league).
 * Writes 4 brackets to the Brackets tab.
 *
 * USAGE: open Apps Script editor → select function → run seedUSOpenBrackets
 *
 * SAFETY:
 *  - Only writes rows for league_id = 'us-open-2026-cobh-gc'
 *  - Deletes existing rows for that league first (idempotent)
 *  - Leaves all other leagues' brackets untouched
 *  - Logs a summary to the console
 */

(function (g) {
  var LEAGUE_ID = 'us-open-2026-cobh-gc';
  var COMP_ID   = 'us-open-2026';

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
    'Graeme McDowell','Ben Kohles','Cole Hammer','Ben James','Sudarshan Yellamaraju'
  ];

  var BRACKET_D = [
    'Neal Shipley','Zac Blair','Jimmy Stanger','Cooper Dossey','Adrien Dumont de Chassart',
    'Caleb Surratt','Ben Silverman','Alejandro Tosti','Marcelo Rozo','William Mouw',
    'John Parry','Max McGreevy','J.B. Holmes','Kevin Roy','James Nicholas',
    'Manav Shah','T.K. Kim','Jake Sollon','Jake Peacock','Robbie Higgins',
    'Greyson Leach','Jackson Van Paris','Nathan Kimsey','Rocco Repetto Taylor',
    'Filippo Celli','Matthew Jordan','Ugo Coussaud','Ryuichi Oiwa','Kaito Onishi',
    'Taihei Sato','Miles Russell','Ryder Cowan','Mason Howell','Jackson Herrington',
    'Hamilton Coleman','Brandon Holtz','Ethan Fang','Jackson Koivun','Preston Stout',
    'Mateo Pulcini','Giuseppe Puebla','Logan Reilly','Vaughn Harber','Jackson Ormond',
    'Chase Kyes','Matthew Robles','Marek Fleming','Eric Lee','Arni Sveinsson'
  ];

  function getSheet_(name) {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(name);
    if (!sh) throw new Error('Tab not found: ' + name);
    return sh;
  }

  function headerMap_(sh) {
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var map = {};
    for (var i = 0; i < hdr.length; i++) map[String(hdr[i]).trim().toLowerCase()] = i;
    return { hdr: hdr, map: map };
  }

  function deleteLeagueRows_(sh, leagueCol, leagueId) {
    var last = sh.getLastRow();
    if (last < 2) return 0;
    var range = sh.getRange(2, leagueCol + 1, last - 1, 1);
    var vals = range.getValues();
    var removed = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim() === leagueId) {
        sh.deleteRow(i + 2);
        removed++;
      }
    }
    return removed;
  }

  function appendRows_(sh, hdr, map, rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = new Array(hdr.length).fill('');
      var rec = rows[i];
      for (var k in rec) {
        if (map.hasOwnProperty(k)) row[map[k]] = rec[k];
      }
      out.push(row);
    }
    if (out.length === 0) return;
    sh.getRange(sh.getLastRow() + 1, 1, out.length, hdr.length).setValues(out);
  }

  function buildRows_(bracketLetter, players) {
    var rows = [];
    for (var i = 0; i < players.length; i++) {
      rows.push({
        league_id: LEAGUE_ID,
        comp_id: COMP_ID,
        bracket: bracketLetter,
        seed: i + 1,
        player_name: players[i],
        espn_id: '',
        status: 'active'
      });
    }
    return rows;
  }

  g.seedUSOpenBrackets = function () {
    var sh = getSheet_('Brackets');
    var h = headerMap_(sh);

    if (!h.map.hasOwnProperty('league_id')) throw new Error('Brackets tab missing column: league_id');
    if (!h.map.hasOwnProperty('bracket'))   throw new Error('Brackets tab missing column: bracket');
    if (!h.map.hasOwnProperty('player_name')) throw new Error('Brackets tab missing column: player_name');

    var removed = deleteLeagueRows_(sh, h.map.league_id, LEAGUE_ID);

    var all = []
      .concat(buildRows_('A', BRACKET_A))
      .concat(buildRows_('B', BRACKET_B))
      .concat(buildRows_('C', BRACKET_C))
      .concat(buildRows_('D', BRACKET_D));

    appendRows_(sh, h.hdr, h.map, all);

    var msg = 'US Open brackets seeded. Removed ' + removed + ' old rows. ' +
              'Wrote: A=' + BRACKET_A.length + ', B=' + BRACKET_B.length +
              ', C=' + BRACKET_C.length + ', D=' + BRACKET_D.length +
              ', total=' + all.length;
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* headless ok */ }
    return msg;
  };

  g.previewUSOpenBrackets = function () {
    var msg = 'PREVIEW (no write): A=' + BRACKET_A.length +
              ', B=' + BRACKET_B.length +
              ', C=' + BRACKET_C.length +
              ', D=' + BRACKET_D.length +
              ', total=' + (BRACKET_A.length + BRACKET_B.length + BRACKET_C.length + BRACKET_D.length);
    Logger.log(msg);
    return msg;
  };
})(globalThis);
