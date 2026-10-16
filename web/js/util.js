/* Utilidades comunes. Todo cuelga de window.AA. */
(function () {
  var AA = (window.AA = window.AA || {});

  AA.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  /* Texto con **negrita** → HTML seguro. */
  AA.rich = function (s) {
    return AA.esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  };
  AA.plain = function (s) {
    return String(s == null ? "" : s).replace(/\*\*/g, "");
  };
  AA.norm = function (s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };
  /* Hash corto y estable (FNV-1a) para identificar preguntas y tarjetas. */
  AA.hash = function (str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  };
  AA.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  };
  AA.pad = function (n) {
    return n < 10 ? "0" + n : "" + n;
  };
  AA.clock = function (secs) {
    secs = Math.max(0, Math.round(secs));
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return AA.pad(m) + ":" + AA.pad(s);
  };
  AA.fecha = function (iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : iso;
  };
  AA.fmt1 = function (n) {
    return (Math.round(n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  AA.plural = function (n, uno, varios) {
    return n + " " + (n === 1 ? uno : varios);
  };
  AA.pct = function (a, b) {
    return b ? Math.round((100 * a) / b) : 0;
  };

  /* Constructor de nodos: h("div", {class:"x", onclick:fn}, hijos…) */
  AA.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, "");
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) AA.append(el, arguments[i]);
    return el;
  };
  AA.append = function (el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(function (k) { AA.append(el, k); });
    else if (kid instanceof Node) el.appendChild(kid);
    else el.appendChild(document.createTextNode(String(kid)));
  };
  AA.html = function (tag, attrs, html) {
    var a = Object.assign({}, attrs || {}, { html: html });
    return AA.h(tag, a);
  };

  var toastTimer;
  AA.toast = function (msg) {
    var t = document.getElementById("toast");
    if (!t) {
      t = AA.h("div", { id: "toast", class: "toast", role: "status", hidden: true });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  };
  AA.copy = function (text, okMsg) {
    function fallback() {
      var ta = AA.h("textarea", { class: "sr" });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      AA.toast(ok ? okMsg || "Copiado" : "No se pudo copiar: selecciona el texto a mano");
    }
    try {
      navigator.clipboard.writeText(text).then(function () { AA.toast(okMsg || "Copiado"); }, fallback);
    } catch (e) {
      fallback();
    }
  };
})();
