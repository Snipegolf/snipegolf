// =============================================
// SnipeGolf — 03_Participants.gs
// Entry submission, token generation, form handler.
// =============================================

// Generate a unique EntryID (e.g. SG-20260611-A3F2)
function generateEntryId_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var suffix = '';
  for (var i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  return 'SG-' + dateStr + '-' + suffix;
}

// Check if an email has already entered (to prevent duplicate entries)
function emailAlreadyEntered_(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName('Participants').getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][4].toString().toLowerCase() === email.toLowerCase()) return true;
  }
  return false;
}

// Check if an email is already in a specific group
function emailInGroup_(email, groupCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parts = ss.getSheetByName('Participants').getDataRange().getValues();
  for (var i = 1; i < parts.length; i++) {
    if (
      parts[i][4].toString().toLowerCase() === email.toLowerCase() &&
      parts[i][6].toString() === groupCode
    ) return true;
  }
  return false;
}

// Core function: add a new participant entry
// enteredBy = 'USER' | 'ADMIN'
function addParticipant(firstName, lastName, email, phone, groupCode, pick1, pick2, pick3, pick4, tiebreaker, consent, paymentStatus, enteredBy) {

  // Gate: check entry window
  if (enteredBy === 'USER' && !isUserEntryOpen()) {
    return { success: false, message: 'Entry window has closed. No changes made.' };
  }
  if (enteredBy === 'ADMIN' && !isAdminEntryOpen()) {
    return { success: false, message: 'Admin entry window has also closed. Contact tournament admin.' };
  }

  // Gate: duplicate email in this group
  if (emailInGroup_(email, groupCode)) {
    return { success: false, message: 'This email address already has an entry in this group.' };
  }

  // Gate: group capacity
  var group = getGroupByCode(groupCode);
  if (!group) {
    return { success: false, message: 'Group code not found: ' + groupCode };
  }
  var currentCount = getGroupEntryCount(groupCode);
  if (currentCount >= group.maxEntrants) {
    return { success: false, message: 'This group is full (' + group.maxEntrants + ' max entries).' };
  }

  // Gate: duplicate picks within same entry
  var picks = [pick1, pick2, pick3, pick4].filter(function(p){ return p && p !== ''; });
  var uniquePicks = picks.filter(function(v, i, a){ return a.indexOf(v) === i; });
  if (uniquePicks.length !== picks.length) {
    return { success: false, message: 'You cannot pick the same golfer more than once.' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Participants');
  var entryId = generateEntryId_();
  var ts = new Date();

  sheet.appendRow([
    entryId,
    ts,
    firstName,
    lastName,
    email,
    phone || '',
    groupCode,
    pick1 || '',
    pick2 || '',
    pick3 || '',
    pick4 || '',
    tiebreaker || '',
    consent ? 'YES' : 'NO',
    paymentStatus || 'PENDING',
    enteredBy || 'USER'
  ]);

  // Also register in GroupMembers
  ss.getSheetByName('GroupMembers').appendRow([groupCode, entryId, ts]);

  // Send confirmation email if we have an address
  if (email) {
    sendConfirmationEmail_(firstName, lastName, email, entryId, group.pubName, [pick1, pick2, pick3, pick4]);
  }

  Logger.log('Entry added: ' + entryId + ' (' + firstName + ' ' + lastName + ') Group: ' + groupCode);
  return { success: true, entryId: entryId, message: 'Entry submitted successfully! Your ID is ' + entryId };
}

// Amend an existing participant's picks (before lock)
function amendParticipantPicks(entryId, pick1, pick2, pick3, pick4, tiebreaker, amendedBy) {

  if (amendedBy === 'USER' && !isUserEntryOpen()) {
    return { success: false, message: 'The entry deadline has passed. You can no longer make changes.' };
  }
  if (amendedBy === 'ADMIN' && !isAdminEntryOpen()) {
    return { success: false, message: 'Admin lock has also passed. No changes allowed.' };
  }

  // Duplicate pick guard
  var picks = [pick1, pick2, pick3, pick4].filter(function(p){ return p && p !== ''; });
  var uniquePicks = picks.filter(function(v, i, a){ return a.indexOf(v) === i; });
  if (uniquePicks.length !== picks.length) {
    return { success: false, message: 'You cannot pick the same golfer more than once.' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Participants');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === entryId.toString()) {
      var row = i + 1; // 1-indexed for Sheets
      sheet.getRange(row, 8).setValue(pick1 || '');
      sheet.getRange(row, 9).setValue(pick2 || '');
      sheet.getRange(row, 10).setValue(pick3 || '');
      sheet.getRange(row, 11).setValue(pick4 || '');
      sheet.getRange(row, 12).setValue(tiebreaker || '');
      Logger.log('Picks amended: ' + entryId + ' by ' + amendedBy);
      return { success: true, message: 'Picks updated successfully for entry ' + entryId };
    }
  }
  return { success: false, message: 'Entry ID not found: ' + entryId };
}

// Update payment status for an entry (admin only)
function updatePaymentStatus(entryId, status, adminEmail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Participants');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === entryId.toString()) {
      sheet.getRange(i + 1, 14).setValue(status);
      logAdminAction_(adminEmail, data[i][6], 'PAYMENT_UPDATE', entryId, status);
      return { success: true };
    }
  }
  return { success: false, message: 'Entry not found.' };
}

// Look up an entry by ID — returns row object or null
function getEntryById(entryId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName('Participants').getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === entryId.toString()) {
      var obj = {};
      headers.forEach(function(h, j){ obj[h] = data[i][j]; });
      return obj;
    }
  }
  return null;
}

// Get all entries for a group (for admin page display)
function getEntriesForGroup(groupCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName('Participants').getDataRange().getValues();
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][6].toString() === groupCode.toString()) {
      var obj = {};
      headers.forEach(function(h, j){ obj[h] = data[i][j]; });
      results.push(obj);
    }
  }
  return results;
}

// Send confirmation email to participant
function sendConfirmationEmail_(firstName, lastName, email, entryId, pubName, picks) {
  var cfg = getConfig();
  var tourneyName = cfg['TournamentName'] || 'Golf Sweep';
  var lockStr = cfg['UserLockDateTime'] || '';
  var pickList = picks.filter(function(p){ return p; }).join(', ');
  var subject = '✅ ' + tourneyName + ' — Entry Confirmed (' + entryId + ')';
  var body =
    'Hi ' + firstName + ',\n\n' +
    'Your entry for the ' + tourneyName + ' sweep at ' + pubName + ' has been confirmed.\n\n' +
    'Entry ID: ' + entryId + '\n' +
    'Your picks: ' + pickList + '\n\n' +
    'The entry deadline is ' + lockStr + '.\n' +
    'You can update your picks before the deadline by contacting your pub admin.\n\n' +
    'Good luck!\n' +
    'The SnipeGolf Team';
  try {
    MailApp.sendEmail(email, subject, body);
  } catch(e) {
    Logger.log('Email failed to ' + email + ': ' + e.message);
  }
}

// Internal audit logger
function logAdminAction_(adminEmail, groupCode, action, targetEntryId, detail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName('AdminActions').appendRow([
    new Date(),
    adminEmail || '',
    groupCode || '',
    action || '',
    targetEntryId || '',
    detail || ''
  ]);
}
