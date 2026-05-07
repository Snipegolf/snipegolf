// ============================================================
// 10_GitHubProvisioner.gs  (v4.0)
// TWO entry points:
//   1. createLeagueInRegistry_()  — called from Admin doPost
//      Writes ALL Master Registry columns, generates codes,
//      pushes 7 GitHub files, emails admin. One atomic flow.
//   2. provisionLeagueOnGitHub_() — manual menu trigger
//      Pick an existing registry row and re-provision/update.
// ============================================================

var GITHUB_OWNER  = 'Snipegolf';
var GITHUB_REPO   = 'snipegolf';
var GITHUB_BRANCH = 'main';

// Master Registry column order — MUST match sheet exactly
var REG_COLS = [
  'LeagueId','Slug','ClubName','EntryCode','AdminName','AdminEmail',
  'AdminPhone','Tournament','TournamentSlug','EspnId','Year','SheetId',
  'GitHubFolder','Status','CreatedAt','EntriesLocked','AdminToken'
];

function getGitHubToken_() {
  return PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
}

// ─── API BASE URL ─────────────────────────────────────────────────────────────
function getApiBase_() {
  var props = PropertiesService.getScriptProperties();
  var fromProps = props.getProperty('WEB_APP_URL') || props.getProperty('API_BASE');
  if (fromProps && fromProps.indexOf('YOUR_DEPLOYMENT_ID') < 0) return fromProps;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName('Config') || ss.getSheetByName('config');
  if (configSheet) {
    var data = configSheet.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      var k = String(data[i][0]).trim().toLowerCase();
      var v = String(data[i][1]).trim();
      if ((k === 'webappurl' || k === 'web app url' || k === 'api url' ||
           k === 'apibase'   || k === 'api base') && v &&
           v.indexOf('YOUR_DEPLOYMENT_ID') < 0) return v;
    }
  }
  return 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
}

// ─── GENERATE CODES ───────────────────────────────────────────────────────────
function generateEntryCode_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code  = '';
  for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function generateAdminToken_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var token = '';
  for (var i = 0; i < 20; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

function generateLeagueId_() {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var s = function(n){ var r=''; for(var i=0;i<n;i++) r+=chars.charAt(Math.floor(Math.random()*chars.length)); return r; };
  return s(8)+'-'+s(4)+'-'+s(4)+'-'+s(4)+'-'+s(12);
}

function slugify_(str) {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── ENSURE REGISTRY HEADERS ──────────────────────────────────────────────────
function ensureRegistryHeaders_(reg) {
  var existing = reg.getRange(1, 1, 1, reg.getLastColumn()).getValues()[0];
  var needsWrite = false;
  REG_COLS.forEach(function(col, i) {
    if (existing[i] !== col) needsWrite = true;
  });
  if (needsWrite || reg.getLastColumn() < REG_COLS.length) {
    reg.getRange(1, 1, 1, REG_COLS.length).setValues([REG_COLS]);
  }
}

// ─── WRITE ONE ROW TO MASTER REGISTRY ────────────────────────────────────────
// Returns the row data object. Call this from doPost admin handler.
function writeRegistryRow_(data) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var reg = ss.getSheetByName('Master Registry');
  if (!reg) throw new Error('Master Registry sheet not found');

  ensureRegistryHeaders_(reg);

  var headers = reg.getRange(1, 1, 1, reg.getLastColumn()).getValues()[0];
  var colMap  = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  // Check for existing row with same slug (update rather than duplicate)
  var existing = reg.getDataRange().getValues();
  var slugCol  = colMap['Slug'];
  var existRow = -1;
  for (var r = 1; r < existing.length; r++) {
    if (String(existing[r][slugCol] || '').trim() === data.slug) { existRow = r + 1; break; }
  }

  var now       = new Date();
  var leagueId  = data.leagueId  || generateLeagueId_();
  var entryCode = data.entryCode || generateEntryCode_();
  var adminToken= data.adminToken|| generateAdminToken_();
  var year      = data.year      || now.getFullYear().toString();
  var sheetId   = ss.getId();
  var ghFolder  = 'leagues/' + data.slug;

  var rowValues = REG_COLS.map(function(col) {
    switch(col) {
      case 'LeagueId':      return leagueId;
      case 'Slug':          return data.slug;
      case 'ClubName':      return data.clubName      || '';
      case 'EntryCode':     return entryCode;
      case 'AdminName':     return data.adminName     || '';
      case 'AdminEmail':    return data.adminEmail    || '';
      case 'AdminPhone':    return data.adminPhone    || '';
      case 'Tournament':    return data.tournament    || '';
      case 'TournamentSlug':return slugify_(data.tournament || data.slug);
      case 'EspnId':        return data.espnId        || '';
      case 'Year':          return year;
      case 'SheetId':       return sheetId;
      case 'GitHubFolder':  return ghFolder;
      case 'Status':        return data.status        || 'setup';
      case 'CreatedAt':     return existRow > 0 ? existing[existRow-1][colMap['CreatedAt']] : now;
      case 'EntriesLocked': return data.entriesLocked || false;
      case 'AdminToken':    return adminToken;
      default:              return '';
    }
  });

  if (existRow > 0) {
    reg.getRange(existRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    reg.appendRow(rowValues);
  }

  return {
    leagueId: leagueId, slug: data.slug, entryCode: entryCode,
    adminToken: adminToken, year: year, sheetId: sheetId,
    ghFolder: ghFolder,
    clubName: data.clubName, adminName: data.adminName,
    adminEmail: data.adminEmail, adminPhone: data.adminPhone,
    tournament: data.tournament, espnId: data.espnId
  };
}

// ─── MAIN: CREATE LEAGUE + PROVISION (called from doPost) ─────────────────────
// Pass in a plain object with: clubName, adminName, adminEmail, adminPhone,
// tournament, espnId, year, [slug optional — auto-generated if missing]
function createLeagueInRegistry_(params) {
  // Build slug if not supplied
  if (!params.slug) {
    var year = params.year || new Date().getFullYear().toString();
    params.slug = slugify_((params.clubName || 'league') + '-' +
                           (params.tournament || 'tournament') + '-' + year);
  }

  // 1. Write every column to Master Registry
  var reg = writeRegistryRow_(params);

  // 2. Build cfg for GitHub provisioner
  var apiBase   = getApiBase_();
  var publicUrl = 'https://' + GITHUB_OWNER.toLowerCase() + '.github.io/' +
                  GITHUB_REPO + '/leagues/' + reg.slug;
  var cfg = {
    slug:           reg.slug,
    clubName:       reg.clubName,
    adminName:      reg.adminName,
    adminEmail:     reg.adminEmail,
    adminPhone:     reg.adminPhone,
    tournamentName: reg.tournament,
    espnId:         reg.espnId,
    year:           reg.year,
    entryCode:      reg.entryCode,
    apiBase:        apiBase,
    publicUrl:      publicUrl,
    numPicks:       8,
    prizeText:      '',
    theme:          'SnipeDefault'
  };

  // 3. Push 7 files to GitHub
  var files  = buildLeagueFiles_(cfg);
  var errors = [];
  files.forEach(function(f) {
    try {
      pushFileToGitHub_(f.path, f.content, 'provision: ' + cfg.slug + ' — ' + f.label);
    } catch(e) {
      errors.push(f.label + ': ' + e.message);
      Logger.log('❌ ' + f.path + ': ' + e.message);
    }
  });

  // 4. Update status to 'provisioned' if no errors
  if (!errors.length) {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var sh  = ss.getSheetByName('Master Registry');
    if (sh) {
      var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      var statusCol = hdr.indexOf('Status');
      var slugCol2  = hdr.indexOf('Slug');
      if (statusCol >= 0 && slugCol2 >= 0) {
        var allRows = sh.getDataRange().getValues();
        for (var r = 1; r < allRows.length; r++) {
          if (String(allRows[r][slugCol2]).trim() === reg.slug) {
            sh.getRange(r + 1, statusCol + 1).setValue('open');
            break;
          }
        }
      }
    }
  }

  // 5. Send admin email
  if (cfg.adminEmail && !errors.length) {
    try {
      sendAdminEmail_(cfg, reg.entryCode, publicUrl + '/');
    } catch(e) {
      Logger.log('Email failed: ' + e.message);
    }
  }

  return {
    success:    errors.length === 0,
    slug:       reg.slug,
    entryCode:  reg.entryCode,
    adminToken: reg.adminToken,
    publicUrl:  publicUrl,
    errors:     errors
  };
}

// ─── MANUAL MENU: PROVISION EXISTING REGISTRY ROW ────────────────────────────
function provisionLeagueOnGitHub_() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var apiBase = getApiBase_();
  if (!apiBase || apiBase.indexOf('YOUR_DEPLOYMENT_ID') >= 0) {
    var proceed = ui.alert(
      '⚠️ WebApp URL not configured',
      'Set Script Property WEB_APP_URL to your deployment URL.\n\nContinue anyway?',
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) return;
  }

  var reg = ss.getSheetByName('Master Registry');
  if (!reg) { ui.alert('❌ No "Master Registry" sheet found.'); return; }

  var regData    = reg.getDataRange().getValues();
  var regHeaders = regData[0];

  var colSlug       = regHeaders.indexOf('Slug');
  var colClub       = regHeaders.indexOf('ClubName');
  var colAdmin      = regHeaders.indexOf('AdminName');
  var colEmail      = regHeaders.indexOf('AdminEmail');
  var colPhone      = regHeaders.indexOf('AdminPhone');
  var colTournament = regHeaders.indexOf('Tournament');
  var colEspn       = regHeaders.indexOf('EspnId');
  var colCode       = regHeaders.indexOf('EntryCode');
  var colYear       = regHeaders.indexOf('Year');

  if (colSlug < 0 || colClub < 0) {
    ui.alert('❌ Master Registry missing required columns.'); return;
  }

  var choices = [];
  for (var i = 1; i < regData.length; i++) {
    var slug = (regData[i][colSlug] || '').toString().trim();
    var club = (regData[i][colClub] || '').toString().trim();
    if (slug) choices.push(i + '. ' + club + '  →  ' + slug);
  }
  if (!choices.length) { ui.alert('No leagues found in Master Registry.'); return; }

  var pickResp = ui.prompt(
    '🏌️ Provision League on GitHub',
    'Type the number of the league to provision:\n\n' + choices.join('\n'),
    ui.ButtonSet.OK_CANCEL
  );
  if (pickResp.getSelectedButton() !== ui.Button.OK) return;

  var picked = parseInt(pickResp.getResponseText().trim(), 10);
  if (isNaN(picked) || picked < 1 || picked > regData.length - 1) {
    ui.alert('Invalid selection.'); return;
  }

  var row  = regData[picked];
  var year = colYear >= 0 ? (row[colYear] || '').toString().trim() : '';
  if (!year) year = new Date().getFullYear().toString();

  var entryCode = (colCode >= 0 && row[colCode]) ? row[colCode].toString().trim() : generateEntryCode_();
  if (colCode >= 0 && !row[colCode]) reg.getRange(picked + 1, colCode + 1).setValue(entryCode);

  var cfg = {
    slug:           (row[colSlug]            || '').toString().trim(),
    clubName:       (row[colClub]            || '').toString().trim(),
    adminName:      colAdmin >= 0  ? (row[colAdmin]      || '').toString().trim() : '',
    adminEmail:     colEmail >= 0  ? (row[colEmail]      || '').toString().trim() : '',
    adminPhone:     colPhone >= 0  ? (row[colPhone]      || '').toString().trim() : '',
    tournamentName: colTournament >= 0 ? (row[colTournament] || '').toString().trim() : '',
    espnId:         colEspn >= 0   ? (row[colEspn]       || '').toString().trim() : '',
    year:           year,
    entryCode:      entryCode,
    apiBase:        apiBase,
    prizeText:      '',
    numPicks:       8,
    theme:          'SnipeDefault'
  };

  if (!cfg.tournamentName)
    cfg.tournamentName = cfg.slug.replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  if (!cfg.slug) { ui.alert('Slug is empty in that registry row.'); return; }

  cfg.publicUrl = 'https://' + GITHUB_OWNER.toLowerCase() + '.github.io/' + GITHUB_REPO + '/leagues/' + cfg.slug;

  var confirm = ui.alert(
    'Confirm Provisioning',
    '📁 leagues/' + cfg.slug + '/\n' +
    '🏌️ ' + cfg.tournamentName + '\n' +
    '🏠 ' + cfg.clubName + '\n' +
    '📧 ' + cfg.adminName + ' <' + cfg.adminEmail + '>\n' +
    '🔑 Entry Code: ' + entryCode + '\n\n' +
    'Push 7 files + email admin?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var files  = buildLeagueFiles_(cfg);
  var errors = [];
  files.forEach(function(f) {
    try {
      pushFileToGitHub_(f.path, f.content, 'provision: ' + cfg.slug + ' — ' + f.label);
      Logger.log('✅ ' + f.path);
    } catch(e) {
      errors.push(f.path + ': ' + e.message);
      Logger.log('❌ ' + f.path + ': ' + e.message);
    }
  });

  if (errors.length) {
    ui.alert('⚠️ Partial success. Errors:\n' + errors.join('\n'));
    return;
  }

  if (cfg.adminEmail) {
    try { sendAdminEmail_(cfg, entryCode, cfg.publicUrl + '/'); } catch(e) {}
  }

  ui.alert(
    '✅ Done!\n\n' +
    files.length + ' files pushed to GitHub.\n' +
    '🌐 ' + cfg.publicUrl + '/\n' +
    '🔑 Entry code: ' + entryCode + '\n' +
    (cfg.adminEmail ? '📧 Email sent to ' + cfg.adminEmail : '⚠️ No admin email on file.')
  );
}

// ─── BUILD FILE LIST (7 files) ────────────────────────────────────────────────
function buildLeagueFiles_(cfg) {
  var base = 'leagues/' + cfg.slug;
  return [
    { path: base + '/index.html',       label: 'home page',         content: buildIndexHtml_(cfg) },
    { path: base + '/picks.html',       label: 'picks form',        content: buildPicksHtml_(cfg) },
    { path: base + '/leaderboard.html', label: 'sweep leaderboard', content: buildLeaderboardHtml_(cfg) },
    { path: base + '/qr.html',          label: 'QR poster',         content: buildQrHtml_(cfg) },
    { path: base + '/js/app.js',        label: 'app bundle',        content: buildAppJs_(cfg) },
    { path: base + '/js/themes.js',     label: 'themes bundle',     content: getTemplateFile_('leagues/_template/js/themes.js') },
    { path: base + '/css/style.css',    label: 'stylesheet',        content: getTemplateFile_('leagues/_template/css/style.css') }
  ];
}

// ─── SEND ADMIN EMAIL ─────────────────────────────────────────────────────────
function sendAdminEmail_(cfg, entryCode, liveUrl) {
  var picksUrl = liveUrl + 'picks.html';
  var lbUrl    = liveUrl + 'leaderboard.html';
  var qrUrl    = liveUrl + 'qr.html';
  var subject  = '🏌️ SnipeGolf — ' + cfg.tournamentName + ' is live! Entry code: ' + entryCode;

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">' +
    '<h2 style="color:#00a86b;margin-bottom:4px">🏌️ ' + esc_(cfg.tournamentName) + '</h2>' +
    '<p style="color:#555;margin-top:0">' + esc_(cfg.clubName) + ' · ' + esc_(cfg.year) + '</p>' +
    '<p>Hi ' + esc_(cfg.adminName || 'Admin') + ',<br>Your SnipeGolf sweepstakes is live!</p>' +
    '<div style="background:#f0faf5;border:2px solid #00a86b;border-radius:12px;padding:24px;margin:24px 0;text-align:center">' +
    '<p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:3px;color:#555">Entry Code</p>' +
    '<p style="margin:8px 0 0;font-size:48px;font-weight:800;letter-spacing:10px;color:#00a86b">' + esc_(entryCode) + '</p>' +
    '<p style="margin:8px 0 0;font-size:13px;color:#666">Share this code with your members</p>' +
    '</div>' +
    '<h3>Your links</h3>' +
    '<table style="border-collapse:collapse;width:100%">' +
    '<tr><td style="padding:8px 12px;background:#f5f5f5;border-radius:6px">📋 <strong>Enter Picks:</strong> <a href="' + picksUrl + '" style="color:#00a86b">' + picksUrl + '</a></td></tr>' +
    '<tr><td style="padding:4px 0"></td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f5f5f5;border-radius:6px">🏆 <strong>Leaderboard:</strong> <a href="' + lbUrl + '" style="color:#00a86b">' + lbUrl + '</a></td></tr>' +
    '<tr><td style="padding:4px 0"></td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f5f5f5;border-radius:6px">📱 <strong>QR Poster:</strong> <a href="' + qrUrl + '" style="color:#00a86b">' + qrUrl + '</a></td></tr>' +
    '</table>' +
    '<p style="margin-top:32px;color:#888;font-size:12px;border-top:1px solid #eee;padding-top:16px">' +
    'SnipeGolf · Data Controller: ' + esc_(cfg.clubName) + ' · Retention: season + 30 days.' +
    '</p></div>';

  GmailApp.sendEmail(cfg.adminEmail, subject, '', { htmlBody: htmlBody, name: 'SnipeGolf' });
}

function esc_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── GITHUB PUSH ──────────────────────────────────────────────────────────────
function pushFileToGitHub_(filePath, content, message) {
  var token = getGitHubToken_();
  if (!token) throw new Error('GITHUB_PAT not set in Script Properties.');
  var apiUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + filePath;
  var sha = null;
  try {
    var check = UrlFetchApp.fetch(apiUrl + '?ref=' + GITHUB_BRANCH, {
      method: 'get',
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' },
      muteHttpExceptions: true
    });
    if (check.getResponseCode() === 200) sha = JSON.parse(check.getContentText()).sha;
  } catch(e) {}
  var payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch:  GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;
  var resp = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code !== 200 && code !== 201)
    throw new Error('GitHub ' + code + ': ' + resp.getContentText().substring(0, 200));
  return JSON.parse(resp.getContentText());
}

// ─── FETCH TEMPLATE FILE ──────────────────────────────────────────────────────
function getTemplateFile_(path) {
  var token = getGitHubToken_();
  var url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
            '/contents/' + path + '?ref=' + GITHUB_BRANCH;
  var resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Cannot fetch template: ' + path);
  var data = JSON.parse(resp.getContentText());
  return Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString();
}

// ─── TEMPLATE BUILDERS ────────────────────────────────────────────────────────
function buildAppJs_(cfg) {
  return getTemplateFile_('leagues/_template/js/app.js')
    .replace(/\{\{API_BASE\}\}/g,    cfg.apiBase)
    .replace(/\{\{SLUG\}\}/g,        cfg.slug)
    .replace(/\{\{ESPN_ID\}\}/g,     cfg.espnId)
    .replace(/\{\{LEAGUE_NAME\}\}/g, cfg.tournamentName);
}

function buildIndexHtml_(cfg)       { return substituteTokens_(getTemplateFile_('leagues/_template/index.html'),       cfg); }
function buildPicksHtml_(cfg)       { return substituteTokens_(getTemplateFile_('leagues/_template/picks.html'),       cfg); }
function buildLeaderboardHtml_(cfg) { return substituteTokens_(getTemplateFile_('leagues/_template/leaderboard.html'), cfg); }
function buildQrHtml_(cfg)          { return substituteTokens_(getTemplateFile_('leagues/_template/qr.html'),          cfg); }

function substituteTokens_(template, cfg) {
  return template
    .replace(/\{\{API_BASE\}\}/g,            cfg.apiBase        || '')
    .replace(/\{\{SLUG\}\}/g,                cfg.slug           || '')
    .replace(/\{\{ESPN_ID\}\}/g,             cfg.espnId         || '')
    .replace(/\{\{LEAGUE_NAME\}\}/g,         cfg.tournamentName || '')
    .replace(/\{\{TOURNAMENT\}\}/g,          cfg.tournamentName || '')
    .replace(/\{\{CLUB_NAME\}\}/g,           cfg.clubName       || cfg.tournamentName || '')
    .replace(/\{\{ENTRY_CODE\}\}/g,          cfg.entryCode      || '')
    .replace(/\{\{NUM_PICKS\}\}/g,           String(cfg.numPicks || 8))
    .replace(/\{\{PRIZE_TEXT\}\}/g,          cfg.prizeText      || '')
    .replace(/\{\{YEAR\}\}/g,                cfg.year           || new Date().getFullYear().toString())
    .replace(/\{\{PUBLIC_URL\}\}/g,          cfg.publicUrl      || '')
    .replace(/\{\{THEME\}\}/g,               cfg.theme          || 'SnipeDefault')
    .replace(/\{\{LOGO_URL\}\}/g,            '')
    .replace(/\{\{TOURNAMENT_LOGO_URL\}\}/g, '');
}
