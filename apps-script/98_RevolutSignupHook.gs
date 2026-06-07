/**
 * SnipeGolf v3 - 98_RevolutSignupHook.gs
 *
 * Adds revolut_signup_url to apiMe_ response (used by holding.html).
 * Reads from Config row key='revolut_signup_url'.
 *
 * Default (until config row exists) is hardcoded Baden's referral link.
 * To swap to Conor (after ~40 referrals) just edit the Config row in the sheet.
 */

(function () {
  var DEFAULT_SIGNUP = 'https://revolut.com/referral/?referral-code=badenimdn!JUN1-26-AR-L3&geo-redirect';

  var _prevApiMe = globalThis.apiMe_;
  if (typeof _prevApiMe !== 'function') return;

  function apiMe_(params) {
    var resp = _prevApiMe(params);
    try {
      var content = resp && resp.getContent ? resp.getContent() : null;
      if (!content) return resp;
      var obj = JSON.parse(content);
      var url = cfg_('revolut_signup_url');
      obj.revolut_signup_url = url ? String(url) : DEFAULT_SIGNUP;
      return jsonOut_(obj);
    } catch (e) {
      return resp;
    }
  }

  globalThis.apiMe_ = apiMe_;
})();
