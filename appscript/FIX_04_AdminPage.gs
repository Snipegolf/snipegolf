// =============================================
// SnipeGolf — FIX_04_AdminPage.gs
// Secure pub admin web page.
//
// WHAT IT DOES:
//   1. Validates GroupCode + AdminPIN (from 02_Groups.gs)
//   2. Shows: Add Participant / Amend Participant / View All
//   3. Enforces AdminLockDateTime from Config
//   4. Calls FIX_01 (dup check) + FIX_03 (tiebreaker) on submit
//   5. Writes every action to AdminActions sheet
//   6. Reads bracket players from Scores sheet for dropdowns
//
// HOW TO WIRE IN:
//   In your existing doGet(e) function, add at the top:
//     if ((e.parameter||{}).mode === 'admin') return doGetAdmin(e);
//
// ADMIN LINK FORMAT:
//   [WebAppUrl]?mode=admin&gc=[GROUPCODE]&pin=[PIN]
// =============================================


function doGetAdmin(e) {
  var params = e ? (e.parameter || {}) : {};
  var groupCode   = (params.gc  || '').trim().toUpperCase();
  var enteredPIN  = (params.pin || '').trim();

  if (!groupCode || !enteredPIN) {
    return HtmlService.createHtmlOutput(adminErrorPage_('Admin link is incomplete. Please use the link sent to your email.'));
  }

  if (!validateAdminPIN(groupCode, enteredPIN)) {
    return HtmlService.createHtmlOutput(adminErrorPage_('Invalid group code or PIN. Contact the sweep organiser.'));
  }

  var group    = getGroupByCode(groupCode);
  var cfg      = getConfig();
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var isLocked = !isAdminEntryOpen();
  var members  = getGroupMembersDetail_(ss, groupCode);

  return HtmlService
    .createHtmlOutput(buildAdminHtml_({
      group: group, cfg: cfg,
      isLocked: isLocked, members: members,
      groupCode: groupCode, pin: enteredPIN
    }))
    .setTitle('SnipeGolf Admin — ' + (group ? group.pubName : groupCode));
}


// Called via google.script.run from the admin page
function handleAdminAction(payload) {
  var groupCode  = (payload.gc  || '').trim().toUpperCase();
  var enteredPIN = (payload.pin || '').trim();

  if (!validateAdminPIN(groupCode, enteredPIN)) {
    return { ok: false, error: 'Authentication failed. Action rejected.' };
  }

  if (!isAdminEntryOpen()) {
    return { ok: false, error: 'Admin entries are now locked. No changes permitted.' };
  }

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var action = (payload.action || '').trim();
  var cfg    = getConfig();

  var picks = { p1: payload.p1, p2: payload.p2, p3: payload.p3, p4: payload.p4 };

  // Validate picks
  var dupCheck = validateNoDuplicatePicks(picks);
  if (!dupCheck.ok) return { ok: false, error: dupCheck.error };

  var tbCheck = validateTiebreakerPresent(payload.tieBreaker, picks);
  if (!tbCheck.ok) return { ok: false, error: tbCheck.error };

  var firstName = (payload.firstName || '').trim();
  var lastName  = (payload.lastName  || '').trim();
  if (!firstName || !lastName) return { ok: false, error: 'First and last name are required.' };

  if (action === 'add') {
    // Check not already in this group
    var existing = findParticipantInGroup_(ss, firstName, lastName, groupCode);
    if (existing) return { ok: false, error: firstName + ' ' + lastName + ' is already registered in this group.' };

    // Check max entrants
    var group = getGroupByCode(groupCode);
    var count = getGroupEntryCount(groupCode);
    if (group && group.maxEntrants && count >= group.maxEntrants) {
      return { ok: false, error: 'This group has reached its maximum of ' + group.maxEntrants + ' entries.' };
    }

    var entryId = generateEntryId_();
    var partSheet = ss.getSheetByName('Participants');
    partSheet.appendRow([
      entryId,
      new Date().toISOString(),
      firstName, lastName,
      payload.email || '', payload.phone || '',
      groupCode,
      picks.p1, picks.p2, picks.p3, picks.p4,
      payload.tieBreaker,
      'YES', // ConsentGiven — admin accepts on behalf
      payload.paymentStatus || 'CASH_PENDING',
      'ADMIN:' + groupCode
    ]);

    var gmSheet = ss.getSheetByName('GroupMembers');
    if (gmSheet) gmSheet.appendRow([groupCode, entryId, new Date().toISOString()]);

    logAdminActionFix04_(ss, {
      adminEmail: (group ? group.adminEmail : ''),
      groupCode: groupCode, action: 'ADD',
      targetId: entryId,
      detail: firstName + ' ' + lastName + ' added via admin page'
    });

    return { ok: true, message: firstName + ' ' + lastName + ' has been added successfully. Entry ID: ' + entryId };
  }

  if (action === 'amend') {
    var entryId = (payload.entryId || '').trim();
    var updated = updateParticipantRow_(ss, entryId, picks, payload.tieBreaker);
    if (!updated) return { ok: false, error: 'Could not find entry ID: ' + entryId };

    var group = getGroupByCode(groupCode);
    logAdminActionFix04_(ss, {
      adminEmail: (group ? group.adminEmail : ''),
      groupCode: groupCode, action: 'AMEND',
      targetId: entryId,
      detail: 'Picks updated via admin page'
    });

    return { ok: true, message: firstName + ' ' + lastName + '\'s picks have been updated.' };
  }

  return { ok: false, error: 'Unknown action.' };
}


// Called by google.script.run from client — returns golfer names from Scores
function getGolferListForAdmin() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scoresSheet = ss.getSheetByName('Scores');
  if (!scoresSheet) return [];
  var data = scoresSheet.getDataRange().getValues();
  var names = [];
  for (var i = 1; i < data.length; i++) {
    var n = (data[i][1] || '').toString().trim(); // GolferName col1
    if (n) names.push(n);
  }
  return names.sort();
}


// HELPERS

function generateEntryId_() {
  return 'E' + new Date().getTime().toString(36).toUpperCase() + Math.random().toString(36).substr(2,3).toUpperCase();
}

function findParticipantInGroup_(ss, firstName, lastName, groupCode) {
  var gmSheet   = ss.getSheetByName('GroupMembers');
  var partSheet = ss.getSheetByName('Participants');
  if (!gmSheet || !partSheet) return null;

  var gmData = gmSheet.getDataRange().getValues();
  var groupEntryIds = {};
  for (var i = 1; i < gmData.length; i++) {
    if ((gmData[i][0]||'').toString().trim() === groupCode) {
      groupEntryIds[(gmData[i][1]||'').toString().trim()] = true;
    }
  }

  var partData = partSheet.getDataRange().getValues();
  for (var r = 1; r < partData.length; r++) {
    var eid = (partData[r][0]||'').toString().trim();
    if (!groupEntryIds[eid]) continue;
    var fn = (partData[r][2]||'').toString().trim().toLowerCase();
    var ln = (partData[r][3]||'').toString().trim().toLowerCase();
    if (fn === firstName.toLowerCase() && ln === lastName.toLowerCase()) return partData[r];
  }
  return null;
}

function getGroupMembersDetail_(ss, groupCode) {
  var gmSheet   = ss.getSheetByName('GroupMembers');
  var partSheet = ss.getSheetByName('Participants');
  if (!gmSheet || !partSheet) return [];

  var gmData = gmSheet.getDataRange().getValues();
  var groupEntryIds = {};
  for (var i = 1; i < gmData.length; i++) {
    if ((gmData[i][0]||'').toString().trim() === groupCode) {
      groupEntryIds[(gmData[i][1]||'').toString().trim()] = true;
    }
  }

  var partData = partSheet.getDataRange().getValues();
  var result = [];
  for (var r = 1; r < partData.length; r++) {
    var eid = (partData[r][0]||'').toString().trim();
    if (!groupEntryIds[eid]) continue;
    result.push({
      entryId:   eid,
      firstName: (partData[r][2]||'').toString().trim(),
      lastName:  (partData[r][3]||'').toString().trim(),
      hasPicks:  !!(partData[r][7]||partData[r][8]||partData[r][9]||partData[r][10]),
      payment:   (partData[r][13]||'').toString().trim()
    });
  }
  return result;
}

function updateParticipantRow_(ss, entryId, picks, tieBreaker) {
  var partSheet = ss.getSheetByName('Participants');
  if (!partSheet) return false;
  var data = partSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0]||'').toString().trim() === entryId) {
      // cols 7-11 = Pick1,Pick2,Pick3,Pick4,Tiebreaker (1-indexed: 8-12)
      partSheet.getRange(i+1, 8, 1, 5).setValues([[picks.p1, picks.p2, picks.p3, picks.p4, tieBreaker]]);
      return true;
    }
  }
  return false;
}

function logAdminActionFix04_(ss, entry) {
  var sheet = ss.getSheetByName('AdminActions');
  if (!sheet) return;
  sheet.appendRow([
    new Date().toISOString(),
    entry.adminEmail || '',
    entry.groupCode  || '',
    entry.action     || '',
    entry.targetId   || '',
    entry.detail     || ''
  ]);
}

function adminErrorPage_(msg) {
  return '<html><body style="font-family:sans-serif;padding:40px;max-width:500px;margin:auto">'
    + '<h2 style="color:#900">Access Denied</h2><p>' + msg + '</p>'
    + '<p style="color:#888;font-size:.85em">SnipeGolf Admin</p></body></html>';
}

function buildAdminHtml_(d) {
  var group    = d.group || {};
  var cfg      = d.cfg   || {};
  var members  = d.members || [];
  var isLocked = d.isLocked;
  var gc       = d.groupCode;
  var pin      = d.pin;
  var lockBanner = isLocked
    ? '<div class="banner-lock">🔒 LOCKED — Entries closed. View only.</div>'
    : '<div class="banner-open">✅ Entries OPEN until Admin Lock</div>';

  var memberRows = members.map(function(m) {
    var editBtn = isLocked ? '' : '<button class="btn-sm" onclick="loadAmend(\'' + m.entryId + '\',\'' + m.firstName.replace(/\'/g,'') + '\',\'' + m.lastName.replace(/\'/g,'') + \')">Edit</button>';
    return '<tr><td>' + m.firstName + ' ' + m.lastName + '</td>'
      + '<td>' + (m.hasPicks ? '✅ Picks in' : '⬜ No picks') + '</td>'
      + '<td><span class="pill pill-' + (m.payment === 'PAID' ? 'paid' : 'pending') + '">' + (m.payment || 'PENDING') + '</span></td>'
      + '<td>' + editBtn + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Admin — ' + (group.pubName||gc) + '</title>'
    + '<style>'
    + '*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f5f0e8;margin:0;color:#222}'
    + '.hdr{background:#163d28;color:#fff;padding:16px 20px}.hdr h1{margin:0;font-size:1.2rem}.hdr p{margin:3px 0 0;opacity:.7;font-size:.85rem}'
    + '.main{max-width:680px;margin:0 auto;padding:16px}'
    + '.banner-lock{background:#f4cccc;border:1px solid #c00;padding:10px 14px;border-radius:7px;margin-bottom:14px;font-weight:bold;color:#900}'
    + '.banner-open{background:#d9ead3;border:1px solid #3c8a0d;padding:10px 14px;border-radius:7px;margin-bottom:14px;font-weight:bold;color:#2a5a0d}'
    + '.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;margin-bottom:14px}'
    + 'h2{color:#1f5a3a;margin:0 0 11px;font-size:.97rem;text-transform:uppercase;letter-spacing:.04em}'
    + 'label{display:block;font-weight:bold;font-size:.8rem;margin-bottom:2px;color:#555}'
    + 'input,select{width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:.9rem;margin-bottom:8px}'
    + '.btn{padding:9px 18px;border:none;border-radius:7px;font-weight:bold;font-size:.9rem;cursor:pointer}'
    + '.btn-primary{background:#163d28;color:#fff;width:100%;margin-top:4px}'
    + '.btn-secondary{background:#eee;color:#333;margin-top:6px;width:100%}'
    + '.btn-sm{padding:4px 10px;background:#163d28;color:#fff;border:none;border-radius:5px;font-size:.78rem;cursor:pointer}'
    + '.act-row{display:flex;gap:10px;flex-wrap:wrap}'
    + '.act-btn{flex:1;min-width:140px;background:#fff;border:2px solid #163d28;color:#163d28;padding:12px;border-radius:9px;font-weight:bold;text-align:center;cursor:pointer;font-size:.9rem}'
    + '.act-btn:hover{background:#163d28;color:#fff}'
    + '.msg-ok{background:#d9ead3;color:#2a5a0d;padding:9px 13px;border-radius:6px;margin-bottom:10px;font-weight:bold}'
    + '.msg-err{background:#f4cccc;color:#900;padding:9px 13px;border-radius:6px;margin-bottom:10px;font-weight:bold}'
    + 'table{width:100%;border-collapse:collapse;font-size:.85rem}th{text-align:left;padding:6px 8px;background:#f0ece0;font-size:.75rem;text-transform:uppercase}td{padding:7px 8px;border-bottom:1px solid #eee}'
    + '.pill{padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:bold}'
    + '.pill-paid{background:#d9ead3;color:#2a5a0d}.pill-pending{background:#fff0cc;color:#a05000}'
    + '.row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}'
    + '#form-section,#list-section{display:none}'
    + '</style></head><body>'
    + '<div class="hdr"><h1>⛳ ' + (group.pubName||gc) + ' — Sweep Admin</h1>'
    + '<p>' + (cfg['TournamentName']||'Tournament') + ' | Admin: ' + (group.adminEmail||'') + '</p></div>'
    + '<div class="main">' + lockBanner
    + '<div class="card"><h2>What would you like to do?</h2><div class="act-row">'
    + (isLocked ? '' : '<button class="act-btn" onclick="showForm(\'add\')">➕ Add Participant</button>')
    + (isLocked ? '' : '<button class="act-btn" onclick="showSection(\'list\')">✏️ Edit a Participant</button>')
    + '<button class="act-btn" onclick="showSection(\'list\')">' + (isLocked?'👁️ View':'👁️ View') + ' All Entries (' + members.length + ')</button>'
    + '</div></div>'
    + '<div id="msg-area"></div>'
    + '<div id="list-section" class="card"><h2>All Entries — ' + (group.pubShortName||gc) + '</h2>'
    + (memberRows ? '<table><thead><tr><th>Name</th><th>Picks</th><th>Payment</th><th></th></tr></thead><tbody>' + memberRows + '</tbody></table>'
                  : '<p style="color:#888">No entries yet. Add the first participant!</p>')
    + '</div>'
    + '<div id="form-section" class="card">'
    + '<h2 id="form-title">Participant</h2>'
    + '<div id="msg-form"></div>'
    + '<input type="hidden" id="f-entryid" />'
    + '<div class="row2"><div><label>First Name</label><input type="text" id="f-fn" placeholder="e.g. John"></div>'
    + '<div><label>Last Name</label><input type="text" id="f-ln" placeholder="e.g. Murphy"></div></div>'
    + '<div class="row2"><div><label>Email (optional)</label><input type="text" id="f-email" placeholder="john@example.com"></div>'
    + '<div><label>Payment Status</label><select id="f-pay"><option value="CASH_PENDING">Cash — Not yet collected</option><option value="PAID">Paid ✅</option><option value="FREE">Comp / Free</option></select></div></div>'
    + '<label>Pick 1</label><select id="f-p1"><option value="">-- Select golfer --</option></select>'
    + '<label>Pick 2</label><select id="f-p2"><option value="">-- Select golfer --</option></select>'
    + '<label>Pick 3</label><select id="f-p3"><option value="">-- Select golfer --</option></select>'
    + '<label>Pick 4</label><select id="f-p4"><option value="">-- Select golfer --</option></select>'
    + '<label>Tiebreaker (must be one of your 4 picks)</label>'
    + '<select id="f-tb"><option value="">-- Select tiebreaker --</option></select>'
    + '<button class="btn btn-primary" id="submit-btn" onclick="submitForm()">Submit</button>'
    + '<button class="btn btn-secondary" onclick="resetView()">← Back</button>'
    + '</div></div>'
    + '<script>'
    + 'var _gc="' + gc + '",_pin="' + pin + '",_action="";'
    + 'function showSection(s){["list-section","form-section"].forEach(function(id){document.getElementById(id).style.display=(id===s+"-section")?"block":"none";});}'
    + 'function showForm(a){_action=a;document.getElementById("form-title").textContent=a==="add"?"Add New Participant":"Amend Participant Picks";'
    + 'document.getElementById("f-fn").readOnly=(a==="amend");document.getElementById("f-ln").readOnly=(a==="amend");'
    + 'showSection("form");loadGolfers();}'
    + 'function loadAmend(eid,fn,ln){document.getElementById("f-entryid").value=eid;document.getElementById("f-fn").value=fn;document.getElementById("f-ln").value=ln;showForm("amend");}'
    + 'function resetView(){showSection("none");document.getElementById("msg-area").innerHTML="";}'
    + 'function loadGolfers(){google.script.run.withSuccessHandler(function(names){["f-p1","f-p2","f-p3","f-p4"].forEach(function(id){var s=document.getElementById(id);var cur=s.value;s.innerHTML="<option value=\'\'>-- Select golfer --</option>";names.forEach(function(n){var o=document.createElement("option");o.value=n;o.textContent=n;s.appendChild(o);});if(cur)s.value=cur;s.addEventListener("change",updateTB);});}).getGolferListForAdmin();}'
    + 'function updateTB(){var picks=["f-p1","f-p2","f-p3","f-p4"].map(function(id){return document.getElementById(id).value;}).filter(Boolean);var tb=document.getElementById("f-tb"),cur=tb.value;tb.innerHTML="<option value=\'\'>-- Select tiebreaker --</option>";picks.forEach(function(p){var o=document.createElement("option");o.value=p;o.textContent=p;tb.appendChild(o);});if(cur&&picks.indexOf(cur)>-1)tb.value=cur;}'
    + 'function submitForm(){'
    + 'var fn=document.getElementById("f-fn").value.trim(),ln=document.getElementById("f-ln").value.trim();'
    + 'if(!fn||!ln){showMsg("form","err","Please enter first and last name.");return;}'
    + 'var payload={action:_action,gc:_gc,pin:_pin,firstName:fn,lastName:ln,'
    + 'entryId:document.getElementById("f-entryid").value,'
    + 'email:document.getElementById("f-email").value,'
    + 'paymentStatus:document.getElementById("f-pay").value,'
    + 'p1:document.getElementById("f-p1").value,p2:document.getElementById("f-p2").value,'
    + 'p3:document.getElementById("f-p3").value,p4:document.getElementById("f-p4").value,'
    + 'tieBreaker:document.getElementById("f-tb").value};'
    + 'var btn=document.getElementById("submit-btn");btn.disabled=true;btn.textContent="Saving...";'
    + 'google.script.run.withSuccessHandler(function(r){btn.disabled=false;btn.textContent="Submit";'
    + 'if(r.ok){showMsg("area","ok",r.message);resetView();}else{showMsg("form","err",r.error);}})'
    + '.withFailureHandler(function(e){btn.disabled=false;btn.textContent="Submit";showMsg("form","err","Server error: "+e.message);})'
    + '.handleAdminAction(payload);}'
    + 'function showMsg(where,type,text){var el=document.getElementById("msg-"+where);if(el)el.innerHTML="<div class=\'msg-"+type+"\'>"+(type==="ok"?"✅ ":"❌ ")+text+"</div>";}'
    + '<\/script></body></html>';
}
