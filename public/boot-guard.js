/* Loaded before the app. 1) old links (/sdm-sales-leads/...) go to the new address, 2) a blank screen or a crash
   before the app starts shows a readable message with a code to screenshot, 3) errors are sent to the admin log. */
(function () {
  var OLD = '/sdm-sales-leads/';
  if (location.pathname.indexOf(OLD) === 0) { location.replace('/' + location.pathname.slice(OLD.length) + location.search + location.hash); return; }
  var last = [];
  var code = function () { return 'E' + Date.now().toString(36).toUpperCase().slice(-6); };
  function empty() { var r = document.getElementById('root'); return !r || !r.firstElementChild; }
  function show(title, detail, id) {
    if (document.getElementById('sdm-fatal')) return;
    var d = document.createElement('div'); d.id = 'sdm-fatal';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;font:15px/1.5 system-ui,sans-serif;color:#222;display:flex;align-items:center;justify-content:center;padding:24px';
    var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
    d.innerHTML = '<div style="max-width:520px;text-align:center"><h2 style="margin:0 0 8px;color:#b4232a">' + esc(title) + '</h2>' +
      '<p style="margin:0 0 12px">Please press Reload. If it happens again, send a screenshot of this screen to the administrator.</p>' +
      '<p style="margin:0 0 16px;font:13px/1.4 monospace;background:#f4f4f4;padding:8px;border-radius:8px;word-break:break-word">Code ' + esc(id) + ' · ' + esc(new Date().toLocaleString()) + '<br>' + esc(detail) + '<br>' + esc(location.href) + '</p>' +
      '<button onclick="location.reload()" style="background:#b4232a;color:#fff;border:0;border-radius:10px;padding:10px 22px;font-size:15px;cursor:pointer">Reload</button></div>';
    document.body.appendChild(d);
  }
  function report(kind, msg, stack) {
    var id = code();
    last.push(id + ' ' + msg); if (last.length > 5) last.shift();
    try {
      fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ id: id, kind: kind, message: String(msg).slice(0, 500), stack: String(stack || '').slice(0, 1500), url: location.href.slice(0, 300), ua: navigator.userAgent.slice(0, 200) }) }).catch(function () {});
    } catch (e) { /* ignore */ }
    return id;
  }
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) { var id0 = report('asset', 'Could not load ' + (e.target.src || e.target.href), ''); if (empty()) show('The page files could not be loaded', String(e.target.src || e.target.href).split('/').pop(), id0); return; }
    var id = report('error', e.message, e.error && e.error.stack); if (empty()) show('Something went wrong while starting', e.message, id);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var m = e.reason && (e.reason.message || String(e.reason)); report('promise', m || 'rejected', e.reason && e.reason.stack);
  });
  // nothing on the screen after 10 s: say so instead of staying white
  setTimeout(function () { if (empty()) show('The page did not start', 'Blank after 10 seconds' + (last.length ? ' · ' + last[last.length - 1] : ''), code()); }, 10000);
})();
