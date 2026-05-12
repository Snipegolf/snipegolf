/* SnipeGolf - Duplicate Name Prompt
 * Usage:
 *   sgDupeCheckAndPrompt(name, slug, function(res){
 *     if (!res) return; // cancelled
 *     // res.finalName, res.tag
 *   });
 */
(function(){
  var EXEC = 'https://script.google.com/macros/s/AKfycbzf26drG5RAVZTBIOVzOJbK7yyNOHZvvi6iaTOq0lre50coQR5sCztY3xBDj4CQDJl9mw/exec';

  function check(slug, full, cb){
    var u = EXEC + '?api=dupe_check&league=' + encodeURIComponent(slug) + '&name=' + encodeURIComponent(full);
    fetch(u).then(function(r){return r.json();}).then(cb).catch(function(){cb({ok:false});});
  }

  function modal(message, defaultVal, onOk, onCancel){
    var bg = document.createElement('div');
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#1a1a1a;color:#fff;padding:24px;border-radius:12px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.5);font-family:system-ui,sans-serif;';
    box.innerHTML = '<div style="font-size:16px;line-height:1.5;margin-bottom:16px">' + message + '</div>' +
      '<input id="sgdp_tag" maxlength="10" value="' + (defaultVal||'') + '" placeholder="e.g. M  or  Jr  or  Cork" style="width:100%;padding:12px;font-size:16px;border-radius:8px;border:1px solid #444;background:#0f0f0f;color:#fff;margin-bottom:12px;box-sizing:border-box" />' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button id="sgdp_cancel" style="padding:10px 16px;border-radius:8px;border:1px solid #444;background:transparent;color:#fff;cursor:pointer">Cancel</button>' +
      '<button id="sgdp_ok" style="padding:10px 16px;border-radius:8px;border:none;background:#16a34a;color:#fff;cursor:pointer;font-weight:600">Use this</button>' +
      '</div>';
    bg.appendChild(box);
    document.body.appendChild(bg);
    var inp = box.querySelector('#sgdp_tag');
    inp.focus();
    box.querySelector('#sgdp_ok').onclick = function(){
      var v = inp.value.trim();
      if (!/^[A-Za-z. \-]{1,10}$/.test(v)){ inp.style.borderColor='#dc2626'; inp.placeholder='Letters, dots, dashes only'; return; }
      document.body.removeChild(bg);
      onOk(v);
    };
    box.querySelector('#sgdp_cancel').onclick = function(){
      document.body.removeChild(bg);
      if (onCancel) onCancel();
    };
  }

  window.sgDupeCheckAndPrompt = function(name, slug, doneCb){
    name = String(name||'').trim();
    if (!name || !slug){ doneCb({finalName:name, tag:''}); return; }
    check(slug, name, function(res){
      if (!res || !res.ok){ doneCb({finalName:name, tag:''}); return; }
      if (!res.isDupe){ doneCb({finalName:name, tag:''}); return; }
      askTag('', res.existing||[]);

      function askTag(prev, matches){
        var msg = '<b>Name already taken</b><br><span style="color:#aaa;font-size:14px">"' + name + '" matches: ' + matches.join(', ') + '</span><br><br>Add a middle initial or short tag to make it unique:';
        modal(msg, prev, function(tag){
          var parts = name.split(/\s+/);
          var finalName;
          if (parts.length <= 1) finalName = name + ' ' + tag;
          else finalName = parts.slice(0,parts.length-1).join(' ') + ' ' + tag + ' ' + parts[parts.length-1];
          check(slug, finalName, function(r2){
            if (r2 && r2.ok && !r2.isDupe){
              doneCb({finalName:finalName, tag:tag});
            } else {
              askTag(tag, (r2 && r2.existing) ? r2.existing : matches);
            }
          });
        }, function(){ doneCb(null); });
      }
    });
  };
})();
