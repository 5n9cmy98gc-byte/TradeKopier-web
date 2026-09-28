/* TradeKopier — aviso de cookies + Modo de consentimiento v2 de Google.
   Los valores por defecto se fijan en el <head> de cada página, antes de gtag('config').
   Este archivo muestra el aviso, guarda la elección (tk_consent) y la aplica. */
(function () {
  var KEY = 'tk_consent';
  var T = {
    es: { txt: 'Usamos cookies propias y de terceros (Google Analytics, Google Ads e impact.com) para analizar el uso de la web y medir nuestros anuncios. Puedes aceptarlas o rechazarlas.', more: 'Política de cookies', ok: 'Aceptar', no: 'Rechazar', settings: 'Configurar cookies' },
    en: { txt: 'We use our own and third-party cookies (Google Analytics, Google Ads and impact.com) to analyse how the site is used and to measure our ads. You can accept or reject them.', more: 'Cookie policy', ok: 'Accept', no: 'Reject', settings: 'Cookie settings' },
    de: { txt: 'Wir verwenden eigene Cookies und Cookies von Drittanbietern (Google Analytics, Google Ads und impact.com), um die Nutzung der Website zu analysieren und unsere Anzeigen zu messen. Du kannst sie akzeptieren oder ablehnen.', more: 'Cookie-Richtlinie', ok: 'Akzeptieren', no: 'Ablehnen', settings: 'Cookie-Einstellungen' },
    pt: { txt: 'Usamos cookies próprios e de terceiros (Google Analytics, Google Ads e impact.com) para analisar o uso do site e medir os nossos anúncios. Você pode aceitá-los ou recusá-los.', more: 'Política de cookies', ok: 'Aceitar', no: 'Recusar', settings: 'Configurar cookies' },
    it: { txt: 'Utilizziamo cookie propri e di terze parti (Google Analytics, Google Ads e impact.com) per analizzare l’uso del sito e misurare i nostri annunci. Puoi accettarli o rifiutarli.', more: 'Informativa sui cookie', ok: 'Accetta', no: 'Rifiuta', settings: 'Impostazioni cookie' },
    fr: { txt: 'Nous utilisons des cookies propres et tiers (Google Analytics, Google Ads et impact.com) pour analyser l’utilisation du site et mesurer nos publicités. Vous pouvez les accepter ou les refuser.', more: 'Politique de cookies', ok: 'Accepter', no: 'Refuser', settings: 'Paramètres des cookies' }
  };

  function read() { try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.v ? c.v : null; } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify({ v: v, t: new Date().toISOString(), ver: 1 })); } catch (e) {} }
  function lang() {
    var l = (document.documentElement.lang || '').slice(0, 2);
    if (!T[l]) { try { l = (localStorage.getItem('tk_lang') || '').slice(0, 2); } catch (e) {} }
    return T[l] ? l : 'en';
  }

  function applyConsent(v) {
    var s = v === 'granted' ? 'granted' : 'denied';
    if (typeof window.gtag === 'function') {
      // ad_personalization siempre denegado: no hacemos remarketing.
      window.gtag('consent', 'update', { ad_storage: s, ad_user_data: s, analytics_storage: s, ad_personalization: 'denied' });
    }
    if (s === 'granted') loadImpact();
  }

  function loadImpact() {
    if (!window.TK_IMPACT || window.__tkImpactLoaded) return;
    window.__tkImpactLoaded = true;
    (function (i, m, p, a, c, t) { c.ire_o = p; c[p] = c[p] || function () { (c[p].a = c[p].a || []).push(arguments); }; t = a.createElement(m); var z = a.getElementsByTagName(m)[0]; t.async = 1; t.src = i; z.parentNode.insertBefore(t, z); })('https://utt.impactcdn.com/P-A7833160-3694-47da-bda6-dbb3c62e04721.js', 'script', 'impactStat', document, window);
    window.impactStat('transformLinks');
    window.impactStat('trackImpression');
  }

  var bar = null;
  function css() {
    if (document.getElementById('tk-consent-css')) return;
    var st = document.createElement('style');
    st.id = 'tk-consent-css';
    st.textContent =
      '#tk-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:760px;margin:0 auto;' +
      'background:#0f1720;color:#eaf0f7;border:1px solid #2a3544;border-radius:14px;padding:16px 18px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.25);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'display:flex;gap:14px;align-items:center;flex-wrap:wrap}' +
      '#tk-consent p{margin:0;flex:1 1 320px}' +
      '#tk-consent a{color:#3ea6ff;text-decoration:underline}' +
      '#tk-consent .b{display:flex;gap:10px;flex:0 0 auto}' +
      '#tk-consent button{cursor:pointer;border-radius:10px;padding:9px 18px;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'border:1px solid #3ea6ff;background:transparent;color:#eaf0f7;min-width:110px}' +
      '#tk-consent button.ok{background:linear-gradient(135deg,#2f8ce6,#7c5cff);border-color:transparent;color:#fff}' +
      '@media(max-width:520px){#tk-consent .b{width:100%}#tk-consent button{flex:1}}';
    document.head.appendChild(st);
  }

  function render() {
    if (!bar) return;
    var t = T[lang()];
    bar.innerHTML = '<p>' + t.txt + ' <a href="cookies.html">' + t.more + '</a></p>' +
      '<div class="b"><button type="button" class="no">' + t.no + '</button><button type="button" class="ok">' + t.ok + '</button></div>';
    bar.querySelector('.ok').onclick = function () { choose('granted'); };
    bar.querySelector('.no').onclick = function () { choose('denied'); };
  }

  function show() {
    css();
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tk-consent';
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-label', 'Cookies');
      document.body.appendChild(bar);
    }
    render();
  }

  function hide() { if (bar) { bar.remove(); bar = null; } }

  function choose(v) { save(v); applyConsent(v); hide(); }

  function addSettingsLink() {
    var footer = document.querySelector('footer');
    if (!footer || document.getElementById('tk-cookie-settings')) return;
    var host = footer.querySelector('.links') || footer;
    var a = document.createElement('a');
    a.href = '#';
    a.id = 'tk-cookie-settings';
    a.onclick = function (e) { e.preventDefault(); show(); };
    host.appendChild(a);
    updateLink();
  }
  function updateLink() { var a = document.getElementById('tk-cookie-settings'); if (a) a.textContent = T[lang()].settings; }

  function init() {
    var v = read();
    if (v === 'granted') loadImpact();
    if (!v) show();
    addSettingsLink();
    // Si el usuario cambia de idioma en la web, el aviso y el enlace cambian con él.
    new MutationObserver(function () { render(); updateLink(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  window.tkConsent = { open: show };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
