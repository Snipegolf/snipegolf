// ============================================================
// 10_GitHubProvisioner.gs  (v3 — Registry + Email + 7 files)
// Reads from Master Registry, generates entry code, pushes
// 7 files to GitHub Pages, writes code back to registry,
// and emails the club admin — all in one click.
// ============================================================

var GITHUB_OWNER  = 'Snipegolf';
var GITHUB_REPO   = 'snipegolf';
var GITHUB_BRANCH = 'main';

function getGitHubToken_() {
  return PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

function provisionLeagueOnGitHub_() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var reg = ss.getSheetByName('Master Registry');
  if (!reg) { ui.alert('❌ No "Master Registry" sheet found.'); return; }

  var regData    = reg.getDataRange().getValues();
  var regHeaders = regData[0];

  // Column indices
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
    ui.alert('❌ Master Registry missing Slug or ClubName column.'); return;
  }

  // Build numbered list for the prompt
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

  var row = regData[picked];

  var cfg = {
    slug:           (row[colSlug]            || '').toString().trim(),
    clubName:       (row[colClub]            || '').toString().trim(),
    adminName:      colAdmin >= 0  ? (row[colAdmin]      || '').toString().trim() : '',
    adminEmail:     colEmail >= 0  ? (row[colEmail]      || '').toString().trim() : '',
    adminPhone:     colPhone >= 0  ? (row[colPhone]      || '').toString().trim() : '',
    tournamentName: colTournament >= 0 ? (row[colTournament] || '').toString().trim() : '',
    espnId:         colEspn >= 0   ? (row[colEspn]       || '').toString().trim() : '',
    year:           colYear >= 0   ? (row[colYear]       || '').toString().trim() : new Date().getFullYear().toString(),
    prizeText:      '',
    numPicks:       8
  };

  if (!cfg.tournamentName)
    cfg.tournamentName = cfg.slug.replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  if (!cfg.slug) { ui.alert('Slug is empty in that registry row.'); return; }

  // Generate entry code if not already set
  var entryCode = (colCode >= 0 && row[colCode]) ? row[colCode].toString().trim() : '';
  if (!entryCode) {
    entryCode = generateEntryCode_();
    if (colCode >= 0) {
      reg.getRange(picked + 1, colCode + 1).setValue(entryCode);
    }
  }
  cfg.entryCode = entryCode;
  cfg.apiBase   = getApiBase_();

  // Confirm dialog
  var liveUrl = 'https://' + GITHUB_OWNER.toLowerCase() + '.github.io/' + GITHUB_REPO + '/leagues/' + cfg.slug + '/';
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

  // Push all 7 files
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

  // Email admin
  if (cfg.adminEmail) {
    try {
      sendAdminEmail_(cfg, entryCode, liveUrl);
      Logger.log('📧 Email sent to ' + cfg.adminEmail);
    } catch(e) {
      Logger.log('Email failed: ' + e.message);
    }
  }

  ui.alert(
    '✅ Done!\n\n' +
    '7 files pushed to GitHub.\n' +
    '🌐 ' + liveUrl + '\n' +
    '🔑 Entry code: ' + entryCode + '\n' +
    (cfg.adminEmail ? '📧 Email sent to ' + cfg.adminEmail : '⚠️ No admin email on file.')
  );
}

// ─── BUILD FILE LIST (7 files) ────────────────────────────────────────────────

function buildLeagueFiles_(cfg) {
  var base = 'leagues/' + cfg.slug;
  return [
    { path: base + '/index.html',      label: 'leaderboard page',  content: buildIndexHtml_(cfg) },
    { path: base + '/picks.html',      label: 'picks form',        content: buildPicksHtml_(cfg) },
    { path: base + '/scoreboard.html', label: 'tour leaderboard',  content: buildScoreboardHtml_(cfg) },
    { path: base + '/qr.html',         label: 'QR page',           content: buildQrHtml_(cfg) },
    { path: base + '/js/app.js',       label: 'app bundle',        content: buildAppJs_(cfg) },
    { path: base + '/js/themes.js',    label: 'themes bundle',     content: getTemplateFile_('leagues/_template/js/themes.js') },
    { path: base + '/css/style.css',   label: 'stylesheet',        content: getTemplateFile_('leagues/_template/css/style.css') }
  ];
}

// ─── GENERATE ENTRY CODE ──────────────────────────────────────────────────────

function generateEntryCode_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1
  var code  = '';
  for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// ─── API BASE URL ──────────────────────────────────────────────────────────────

function getApiBase_() {
  return PropertiesService.getScriptProperties().getProperty('API_BASE') ||
         'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
}

// ─── SEND ADMIN EMAIL ──────────────────────────────────────────────────────────

function sendAdminEmail_(cfg, entryCode, liveUrl) {
  var picksUrl = liveUrl + 'picks.html';
  var lbUrl    = liveUrl + 'index.html';
  var qrUrl    = liveUrl + 'qr.html';
  var subject  = '🏌️ SnipeGolf — ' + cfg.tournamentName + ' is live! Entry code: ' + entryCode;

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">' +
    '<h2 style="color:#00a86b;margin-bottom:4px">🏌️ ' + esc_(cfg.tournamentName) + '</h2>' +
    '<p style="color:#555;margin-top:0">' + esc_(cfg.clubName) + ' · ' + esc_(cfg.year) + '</p>' +
    '<p>Hi ' + esc_(cfg.adminName || 'Admin') + ',<br>Your SnipeGolf sweepstakes is live and ready for entries!</p>' +
    '<div style="background:#f0faf5;border:2px solid #00a86b;border-radius:12px;padding:24px;margin:24px 0;text-align:center">' +
    '<p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:3px;color:#555">Entry Code</p>' +
    '<p style="margin:8px 0 0;font-size:48px;font-weight:800;letter-spacing:10px;color:#00a86b">' + esc_(entryCode) + '</p>' +
    '<p style="margin:8px 0 0;font-size:13px;color:#666">Share this code with your members</p>' +
    '</div>' +
    '<h3>Your links</h3>' +
    '<table style="border-collapse:collapse;width:100%">' +
    '<tr><td style="padding:8px 12px;background:#f5f5f5;border-radius:6px;margin:4px 0">📋 <strong>Enter Picks:</strong> <a href="' + picksUrl + '" style="color:#00a86b">' + picksUrl + '</a></td></tr>' +
    '<tr><td style="padding:4px 0"></td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f5f5f5;border-radius:6px">🏆 <strong>Leaderboard:</strong> <a href="' + lbUrl + '" style="color:#00a86b">' + lbUrl + '</a></td></tr>' +
    '<tr><td style="padding:4px 0"></td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f5f5f5;border-radius:6px">📱 <strong>QR Poster:</strong> <a href="' + qrUrl + '" style="color:#00a86b">' + qrUrl + '</a></td></tr>' +
    '</table>' +
    '<h3 style="margin-top:24px">How to get members entering</h3>' +
    '<ol style="color:#444;line-height:1.8">' +
    '<li>Send members to: <a href="' + picksUrl + '" style="color:#00a86b">' + picksUrl + '</a></li>' +
    '<li>Give them the entry code: <strong style="font-size:18px;letter-spacing:3px">' + esc_(entryCode) + '</strong></li>' +
    '<li>Or print and display the QR poster: <a href="' + qrUrl + '" style="color:#00a86b">Open QR poster</a></li>' +
    '</ol>' +
    '<p style="margin-top:32px;color:#888;font-size:12px;border-top:1px solid #eee;padding-top:16px">' +
    'SnipeGolf Golf Sweepstakes Platform · Data Controller: ' + esc_(cfg.clubName) + ' · Processor: SnipeGolf · Retention: season + 30 days.' +
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

// ─── FETCH TEMPLATE FILE FROM GITHUB ──────────────────────────────────────────

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

function buildIndexHtml_(cfg)      { return substituteTokens_(getTemplateFile_('leagues/_template/index.html'), cfg); }
function buildPicksHtml_(cfg)      { return substituteTokens_(getTemplateFile_('leagues/_template/picks.html'), cfg); }
function buildScoreboardHtml_(cfg) { return substituteTokens_(getTemplateFile_('leagues/_template/scoreboard.html'), cfg); }
function buildQrHtml_(cfg)         { return substituteTokens_(getTemplateFile_('leagues/_template/qr.html'), cfg); }

function substituteTokens_(template, cfg) {
  return template
    .replace(/\{\{API_BASE\}\}/g,    cfg.apiBase)
    .replace(/\{\{SLUG\}\}/g,        cfg.slug)
    .replace(/\{\{ESPN_ID\}\}/g,     cfg.espnId)
    .replace(/\{\{LEAGUE_NAME\}\}/g, cfg.tournamentName)
    .replace(/\{\{CLUB_NAME\}\}/g,   cfg.clubName || cfg.tournamentName)
    .replace(/\{\{PRIZE_TEXT\}\}/g,  cfg.prizeText || '')
    .replace(/\{\{NUM_PICKS\}\}/g,   String(cfg.numPicks || 8))
    .replace(/\{\{ENTRY_CODE\}\}/g,  cfg.entryCode || '');
}
