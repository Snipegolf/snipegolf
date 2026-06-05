/**
 * SnipeGolf v3 — 94_FinalRouter.gs
 * LAST alphabetically — its doGet/doPost win.
 * Adds: field, brackets (live), prizes, prizes_save.
 */
function doGet(e) {
  try {
    var p = e && e.parameter ? e.parameter : {};
    var route = String(p.route || 'ping');
    if (route === 'field') return apiField_(p);
    if (route === 'brackets') return apiBrackets_(p);
    if (route === 'prizes') return apiPrizes_(p);
    if (route === 'leaderboard') return (globalThis.apiLeaderboardV2_ || globalThis.apiLeaderboard_)(p);
    if (route === 'me') return apiMe_(p);
    if (route === 'admin_leagues') return apiAdminLeagues_(p);
    if (route === 'admin_list') return apiAdminList_(p);
    if (route === 'ping') return json_({ ok: true, ts: nowIso_() });
    if (route === 'comp') return json_(getComp_(p.slug));
    if (route === 'league') return json_(getLeague_(p.slug));
    if (route === 'participants') return json_(getParticipantsPublic_(p.league));
    if (route === 'picks') return json_(getPicksPublic_(p.league));
    if (route === 'mypick') return json_(getMyPick_(p.pid, p.t));
    return json_({ ok: false, error: 'unknown_route', route: route });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents || '{}'); } catch (er) { body = {}; }
    var route = String((body && body.route) || (e && e.parameter && e.parameter.route) || '');
    if (route === 'admin_update') return apiAdminUpdate_(body);
    if (route === 'admin_resend') return apiAdminResend_(body);
    if (route === 'admin_delete') return apiAdminDelete_(body);
    if (route === 'admin_entry') return apiAdminEntry_(body);
    if (route === 'prizes_save') return apiPrizesSave_(body);
    if (route === 'submitPick') return submitPick_(body);
    return json_({ ok: false, error: 'unknown_post_route', route: route });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
