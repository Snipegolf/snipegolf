/**
 * SnipeGolf v3 - 95_EntryEmailV2.gs
 * Final entry email logic. Loads AFTER 04_Emails.gs and 77_EmailPaymentLines.gs.
 *
 * Rules:
 *  - paid_method=cash or shop  -> auto-mark paid_status=paid, "thanks" wording
 *  - paid_method=revolut       -> unpaid, include Revolut link
 *  - paid_method=iou           -> unpaid, ask them to pay cash at the shop
 *  - paid_method=other/blank   -> generic "arrange with admin"
 *
 *  Link in email depends on comp.status:
 *  - pre_picks  -> holding page: <base>/holding.html?pid=X&t=Y
 *  - picks_open -> picks page:   <base>/<league>/picks?pid=X&t=Y
 *  - locked/live/closed -> public leaderboard: <base>/<league>/leaderboard.html
 */

function sendEntryEmail_(pid) {
  var part = findRow_(TAB.PARTICIPANTS, 'pid', pid);
  if (!part) throw new Error('participant not found: ' + pid);
  if (!part.email) return;
  var league = findRow_(TAB.LEAGUES, 'league_slug', part.league_slug);
  if (!league) throw new Error('league not found');
  var comp = findRow_(TAB.COMPS, 'comp_slug', part.comp_slug);
  if (!comp) throw new Error('comp not found');

  var base = cfg_('github_pages_base');
  var status = String(comp.status || '');
  var method = String(part.paid_method || '').toLowerCase();
  var paidStatus = String(part.paid_status || '').toLowerCase();
  var fee = league.entry_fee_eur ? ('\u20AC' + league.entry_fee_eur) : 'the entry fee';
  var adminName = league.admin_name ? String(league.admin_name) : 'the admin';

  // Determine link by comp status
  var linkLabel, linkUrl;
  if (status === 'picks_open') {
    linkLabel = 'Make your picks here';
    linkUrl = base + '/' + part.league_slug + '/picks?pid=' + part.pid + '&t=' + part.edit_token;
  } else if (status === 'locked' || status === 'live' || status === 'closed') {
    linkLabel = 'Live leaderboard';
    linkUrl = base + '/' + part.league_slug + '/leaderboard.html';
  } else {
    // pre_picks (default)
    linkLabel = 'Tournament page (countdown to picks)';
    linkUrl = base + '/holding.html?pid=' + part.pid + '&t=' + part.edit_token;
  }

  // Payment wording
  var payLine;
  if (paidStatus === 'paid' || method === 'cash' || method === 'shop') {
    if (method === 'shop') payLine = 'Entry paid at the shop. Thanks.';
    else if (method === 'cash') payLine = 'Entry paid in cash. Thanks.';
    else payLine = 'Entry paid. Thanks.';
  } else if (method === 'revolut') {
    var rlink = league.revolut_link ? String(league.revolut_link) : '';
    if (rlink) {
      payLine = 'Please pay ' + fee + ' via Revolut:\n' + rlink;
    } else {
      payLine = 'Please pay ' + fee + ' via Revolut (link to follow from ' + adminName + ').';
    }
  } else if (method === 'iou') {
    payLine = 'Please pay ' + fee + ' cash at the shop or to ' + adminName + '.';
  } else {
    payLine = 'Please arrange payment of ' + fee + ' with ' + adminName + '.';
  }

  var subject = 'You\'re in: ' + comp.name + ' \u2014 ' + league.league_name;
  var body = '' +
    'Hi ' + part.display_name + ',\n\n' +
    'You\'re entered into ' + league.league_name + ' for ' + comp.name + '.\n\n' +
    payLine + '\n\n' +
    linkLabel + ':\n' + linkUrl + '\n\n' +
    'Good luck.\n\u2014 SnipeGolf';

  MailApp.sendEmail({ to: part.email, subject: subject, body: body });
}

/**
 * Called from admin_entry route. Auto-marks paid_status for cash/shop methods
 * before the entry email is sent. Safe to call after row insert.
 */
function autoMarkPaidIfCashShop_(pid) {
  var part = findRow_(TAB.PARTICIPANTS, 'pid', pid);
  if (!part) return;
  var method = String(part.paid_method || '').toLowerCase();
  if (method !== 'cash' && method !== 'shop') return;
  if (String(part.paid_status || '').toLowerCase() === 'paid') return;
  // Update sheet row
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.PARTICIPANTS);
  if (!sh) return;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0];
  var pidCol = -1, statusCol = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]) === 'pid') pidCol = i;
    if (String(headers[i]) === 'paid_status') statusCol = i;
  }
  if (pidCol < 0 || statusCol < 0) return;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][pidCol]) === String(pid)) {
      sh.getRange(r + 1, statusCol + 1).setValue('paid');
      return;
    }
  }
}

/**
 * Override apiAdminEntry_ from 84_ — same logic but auto-sets paid_status='paid'
 * when paid_method is cash or shop, regardless of what client sent.
 */
function apiAdminEntry_(body) {
  var key = String(body.key || '');
  if (!key) return jsonOut_({ error: 'no key' });

  var leagueSlug = String(body.league_slug || '');
  var league = findRow_(TAB.LEAGUES, 'league_slug', leagueSlug);
  if (!league) return jsonOut_({ error: 'league not found' });

  var ownerKey = cfg_('owner_admin_key');
  var validKey = (String(league.admin_key) === key) || (ownerKey && key === ownerKey);
  if (!validKey) return jsonOut_({ error: 'unauthorized for this league' });

  var name = String(body.display_name || '').trim();
  var email = String(body.email || '').trim().toLowerCase();
  if (!name || !email) return jsonOut_({ error: 'name and email required' });

  var paidMethod = String(body.paid_method || '').toLowerCase();
  var paidStatus = String(body.paid_status || 'unpaid').toLowerCase();
  // Server-side auto-paid for cash/shop
  if (paidMethod === 'cash' || paidMethod === 'shop') {
    paidStatus = 'paid';
  }

  // Dedupe
  if (!body.force_create) {
    var dupe = findDuplicate_(league.comp_slug, leagueSlug, email, name);
    if (dupe) {
      return jsonOut_({
        duplicate: true,
        existing: {
          pid: dupe.pid,
          display_name: dupe.display_name,
          email: dupe.email,
          league_name: league.league_name,
          paid_status: dupe.paid_status
        }
      });
    }
  } else {
    var existing = findExact_(league.comp_slug, email);
    if (existing) {
      var rowNumU = existing._row;
      updateRow_(TAB.PARTICIPANTS, rowNumU, {
        display_name: name,
        phone: String(body.phone || ''),
        league_slug: leagueSlug,
        paid_method: paidMethod,
        paid_status: paidStatus,
        paid_ts: (paidStatus === 'paid') ? new Date().toISOString() : '',
        notes: String(body.notes || ''),
        email_status: 'queued'
      });
      var sentNowU = false;
      try {
        if (MailApp.getRemainingDailyQuota() > 5) {
          sendEntryEmail_(existing.pid);
          updateRow_(TAB.PARTICIPANTS, rowNumU, { email_status: 'sent', email_sent_at: new Date().toISOString() });
          sentNowU = true;
        }
      } catch (e) {
        updateRow_(TAB.PARTICIPANTS, rowNumU, { email_status: 'failed', email_error: String(e).substring(0, 200) });
      }
      return jsonOut_({ ok: true, updated: true, pid: existing.pid, email_queued: !sentNowU });
    }
  }

  // Create
  var pid = newId_();
  var token = newToken_();
  var nowIso = new Date().toISOString();

  appendRow_(TAB.PARTICIPANTS, {
    pid: pid,
    edit_token: token,
    comp_slug: league.comp_slug,
    league_slug: leagueSlug,
    display_name: name,
    email: email,
    phone: String(body.phone || ''),
    paid_method: paidMethod,
    paid_status: paidStatus,
    paid_ts: (paidStatus === 'paid') ? nowIso : '',
    entry_ts: nowIso,
    notes: String(body.notes || ''),
    entered_by: 'admin',
    entered_at: nowIso,
    email_status: 'queued'
  });

  var newRowNum = findRowNum_(TAB.PARTICIPANTS, 'pid', pid);
  var sentNow = false;
  try {
    if (MailApp.getRemainingDailyQuota() > 5) {
      sendEntryEmail_(pid);
      if (newRowNum) updateRow_(TAB.PARTICIPANTS, newRowNum, { email_status: 'sent', email_sent_at: new Date().toISOString() });
      sentNow = true;
    }
  } catch (e) {
    if (newRowNum) updateRow_(TAB.PARTICIPANTS, newRowNum, { email_status: 'failed', email_error: String(e).substring(0, 200) });
  }

  return jsonOut_({ ok: true, pid: pid, paid_status: paidStatus, email_queued: !sentNow });
}

globalThis.sendEntryEmail_ = sendEntryEmail_;
globalThis.autoMarkPaidIfCashShop_ = autoMarkPaidIfCashShop_;
globalThis.apiAdminEntry_ = apiAdminEntry_;
