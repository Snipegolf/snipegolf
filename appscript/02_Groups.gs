// =============================================
// SnipeGolf — 02_Groups.gs
// Group (pub league) management.
// =============================================

// Generate a unique 6-char alphanumeric group code
function generateGroupCode_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,1,I to avoid confusion
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Check uniqueness
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var groups = ss.getSheetByName('Groups');
  var existing = groups.getDataRange().getValues().map(function(r){ return r[0]; });
  if (existing.indexOf(code) !== -1) return generateGroupCode_(); // retry if clash
  return code;
}

// Generate a 4-digit admin PIN
function generateAdminPIN_() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Add a new pub group — called from Admin UI or manually
function addGroup(pubName, pubShortName, adminEmail, maxEntrants, prizeName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var groups = ss.getSheetByName('Groups');
  var code = generateGroupCode_();
  var pin  = generateAdminPIN_();
  groups.appendRow([
    code,
    pubName,
    pubShortName,
    adminEmail,
    pin,
    '', // AdminLinkSent — populated when email is sent
    maxEntrants || 100,
    prizeName || '',
    'YES'
  ]);
  Logger.log('Group created: ' + code + ' PIN: ' + pin);
  return { code: code, pin: pin };
}

// Look up a group by its code — returns row data or null
function getGroupByCode(code) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName('Groups').getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      return {
        code:        data[i][0],
        pubName:     data[i][1],
        shortName:   data[i][2],
        adminEmail:  data[i][3],
        adminPIN:    data[i][4],
        linkSent:    data[i][5],
        maxEntrants: data[i][6],
        prize:       data[i][7],
        active:      data[i][8]
      };
    }
  }
  return null;
}

// Count current entries for a group
function getGroupEntryCount(groupCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName('GroupMembers').getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === groupCode) count++;
  }
  return count;
}

// Validate admin PIN — returns true/false
function validateAdminPIN(groupCode, enteredPIN) {
  var group = getGroupByCode(groupCode);
  if (!group) return false;
  return group.adminPIN.toString() === enteredPIN.toString();
}
