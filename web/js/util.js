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
  /* Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da siempre la misma secuencia. Devuelve una
     función que se usa como Math.random. La semilla puede ser un número o un texto (p. ej. «desafio-2026-10-17»). */
  AA.azar = function (semilla) {
    var a = typeof semilla === "number" ? semilla >>> 0 : parseInt(AA.hash(String(semilla)), 36) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* Baraja una copia. Con `rnd` (p. ej. AA.azar(semilla)), el orden es reproducible. */
  AA.shuffle = function (arr, rnd) {
    var azar = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(azar() * (i + 1));
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
  /* Fecha local AAAA-MM-DD de un Date o de una marca de tiempo (ms). */
  AA.isoDia = function (d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + "-" + AA.pad(d.getMonth() + 1) + "-" + AA.pad(d.getDate());
  };
  /* Fecha AAAA-MM-DD desplazada `n` días naturales (a mediodía: los cambios de hora no la mueven). */
  AA.sumarDias = function (iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return AA.isoDia(d);
  };
  /* Días naturales de la fecha `a` a la `b` (AAAA-MM-DD); negativo si `b` es anterior. */
  AA.diasEntre = function (a, b) {
    return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  };
  /* Lunes (AAAA-MM-DD) de la semana de esa fecha: identifica la semana natural, de lunes a domingo. */
  AA.lunes = function (iso) {
    var dia = new Date(iso + "T12:00:00").getDay(); // 0 = domingo
    return AA.sumarDias(iso, -((dia + 6) % 7));
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
  /* Nota del test sobre 10 con la fórmula oficial [A − E/(n−1)] × 10 / P: n = 3 alternativas (cada error resta
     0,5 aciertos), P = nº de preguntas; las respuestas en blanco no restan. Puede salir negativa (no se recorta aquí). */
  AA.notaTest = function (aciertos, errores, preguntas) {
    return preguntas ? ((aciertos - errores / 2) * 10) / preguntas : 0;
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
