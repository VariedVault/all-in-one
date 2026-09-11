/* ---------------------------------------------------------------------------
   Reusable "Share this result" component (window.AIOShare).

   A calculator supplies getUrl() (which encodes its own inputs into a
   shareable URL) plus a little share copy; this module renders the button row
   (Copy link + WhatsApp / Reddit / Facebook / Instagram / X), handles the
   clipboard copy with a "Link copied!" confirmation, and opens each platform's
   native share flow with the generated URL. Purely client-side.

   Also exposes url-safe base64 JSON helpers (b64encode / b64decode) so dynamic
   lists (e.g. FIRE's investment categories) can round-trip through the URL.

   Built generically so other calculators can adopt it later.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  /* ---- url-safe base64 JSON ---- */
  function b64encode(obj) {
    try {
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return ''; }
  }
  function b64decode(str) {
    try {
      var b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  /* ---- inline platform icons (24x24, currentColor) ---- */
  var ICONS = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.27-.1-.47-.15-.67.15-.2.3-.77.95-.94 1.15-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.47 0 1.45 1.07 2.86 1.22 3.06.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.62.71.22 1.36.19 1.87.12.57-.09 1.7-.7 1.95-1.36.24-.67.24-1.24.17-1.36-.07-.12-.27-.2-.57-.34zM12 21.5a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.56.93.95-3.47-.22-.36A9.5 9.5 0 1 1 12 21.5z"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.3c0-1.1-.9-2-2-2-.5 0-1 .2-1.35.55C17.3 9.9 15.5 9.3 13.5 9.2l.86-4.06 2.82.6a1.5 1.5 0 1 0 .16-.9l-3.2-.68a.45.45 0 0 0-.53.35l-.96 4.5C10.5 9.3 8.66 9.9 7.3 10.86A1.95 1.95 0 0 0 4 12.3c0 .78.46 1.45 1.12 1.76-.03.2-.05.4-.05.62 0 2.9 3.5 5.26 7.83 5.26s7.83-2.36 7.83-5.26c0-.2-.02-.4-.05-.6.67-.3 1.14-.98 1.14-1.78zM8.4 13.7a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 0 1-2.4 0zm6.9 3.2c-.8.8-2.3.86-2.74.86-.44 0-1.95-.06-2.74-.86a.3.3 0 0 1 .42-.42c.5.5 1.57.68 2.32.68.75 0 1.82-.18 2.32-.68a.3.3 0 0 1 .42.42zm-.2-2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2l7.6-8.7L1.5 2h6.8l4.7 6.2L18.9 2z"/></svg>'
  };

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject();
      } catch (e) { reject(e); }
    });
  }

  function openWin(url) { window.open(url, '_blank', 'noopener,noreferrer'); }
  function enc(s) { return encodeURIComponent(s); }

  /* opts:
       container      element to render into (required)
       getUrl         function returning the full shareable URL (required)
       shareText      short message prefix for WhatsApp / X (default generic)
       redditTitle    pre-filled Reddit title
       instagramNote  note copied alongside the link for Instagram        */
  function mount(opts) {
    opts = opts || {};
    var container = opts.container;
    var getUrl = opts.getUrl;
    if (!container || typeof getUrl !== 'function') return;
    var shareText = opts.shareText || 'Check out my result';
    var redditTitle = opts.redditTitle || 'Calculated with KnowMyMoney';
    var instagramNote = opts.instagramNote || 'Paste this wherever you like';

    container.classList.add('share-row');
    container.innerHTML = '';

    var label = document.createElement('span');
    label.className = 'share-label';
    label.textContent = 'Share this result';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'share-btn share-copy';
    copyBtn.innerHTML = ICONS.copy + '<span>Copy link</span>';

    var msg = document.createElement('span');
    msg.className = 'share-msg';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');

    var msgTimer = null;
    function flash(text) {
      msg.textContent = text;
      msg.classList.add('show');
      if (msgTimer) clearTimeout(msgTimer);
      msgTimer = setTimeout(function () { msg.classList.remove('show'); }, 2200);
    }

    copyBtn.addEventListener('click', function () {
      copyText(getUrl()).then(function () { flash('Link copied!'); })
        .catch(function () { flash('Copy failed, select and copy manually.'); });
    });

    var icons = document.createElement('div');
    icons.className = 'share-icons';

    function iconBtn(key, title, handler) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-icon-btn share-' + key;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.innerHTML = ICONS[key];
      b.addEventListener('click', handler);
      icons.appendChild(b);
    }

    iconBtn('whatsapp', 'Share on WhatsApp', function () {
      openWin('https://wa.me/?text=' + enc(shareText + ': ' + getUrl()));
    });
    iconBtn('reddit', 'Share on Reddit', function () {
      var u = getUrl();
      openWin('https://www.reddit.com/submit?url=' + enc(u) + '&title=' + enc(redditTitle));
    });
    iconBtn('facebook', 'Share on Facebook', function () {
      openWin('https://www.facebook.com/sharer/sharer.php?u=' + enc(getUrl()));
    });
    iconBtn('x', 'Share on X', function () {
      var u = getUrl();
      openWin('https://twitter.com/intent/tweet?url=' + enc(u) + '&text=' + enc(shareText));
    });
    // Instagram has no public link-share intent: copy the link + a note instead.
    iconBtn('instagram', 'Copy link for Instagram', function () {
      copyText(getUrl()).then(function () { flash('Link copied. ' + instagramNote + '.'); })
        .catch(function () { flash('Copy failed, select and copy manually.'); });
    });

    container.appendChild(label);
    container.appendChild(copyBtn);
    container.appendChild(icons);
    container.appendChild(msg);
  }

  window.AIOShare = { mount: mount, b64encode: b64encode, b64decode: b64decode };
})();
