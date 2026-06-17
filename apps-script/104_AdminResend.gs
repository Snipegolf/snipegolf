/**
 * SnipeGolf v3 - 104_AdminResend.gs
 * Implements apiAdminResend_({ key, pid }) -> { ok, sent_to }
 * Router (94_FinalRouter.gs) already routes 'admin_resend' here.
 */

function apiAdminResend_(body) {
  body = body || {};
  var key = String(body.key || '');
  var pid = String(body.pid || '');

  if (!key) return jsonOut_({ ok: false, error: 'missing_key' });
  if (!pid) return jsonOut_({ ok: false, error: 'missing_pid' });

  // Validate admin key (use whichever helper exists)
  try {
    if (typeof requireAdmin_ === 'function') {
      var auth = requireAdmin_(key);
      if (!auth || auth.ok === false) {
        return jsonOut_({ ok: false, error: auth && auth.error ? auth.error : 'bad_key' });
      }
    } else if (typeof isAdminKey_ === 'function') {
      if (!isAdminKey_(key)) return jsonOut_({ ok: false, error: 'bad_key' });
    }
  } catch (eAuth) {
    return jsonOut_({ ok: false, error: 'auth_error: ' + String(eAuth).substring(0, 120) });
  }

  // Look up the participant to confirm it exists and grab email
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.PARTICIPANTS);
  if (!sh) return jsonOut_({ ok: false, error: 'no_participants_tab' });
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return jsonOut_({ ok: false, error: 'empty_participants' });
  var headers = data[0];
  var col = {};
  for (var i = 0; i < headers.length; i++) col[String(headers[i])] = i;
  if (col.pid === undefined) return jsonOut_({ ok: false, error: 'no_pid_column' });

  var rowIdx = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][col.pid]) === pid) { rowIdx = r; break; }
  }
  if (rowIdx < 0) return jsonOut_({ ok: false, error: 'participant_not_found: ' + pid });

  var email = col.email !== undefined ? String(data[rowIdx][col.email] || '') : '';
  if (!email) return jsonOut_({ ok: false, error: 'no_email_on_row' });

  // Fire send
  try {
    sendEntryEmail_(pid);
  } catch (eSend) {
    return jsonOut_({ ok: false, error: 'send_failed: ' + String(eSend).substring(0, 200) });
  }

  // Update email_status + email_sent_at if columns exist
  try {
    if (col.email_status !== undefined) sh.getRange(rowIdx + 1, col.email_status + 1).setValue('sent');
    if (col.email_sent_at !== undefined) sh.getRange(rowIdx + 1, col.email_sent_at + 1).setValue(new Date().toISOString());
  } catch (eUpd) { /* non-fatal */ }

  return jsonOut_({ ok: true, sent_to: email, pid: pid });
}

globalThis.apiAdminResend_ = apiAdminResend_;
