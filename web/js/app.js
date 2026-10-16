/* Arranque: cabecera, navegación por hash, tema claro/oscuro y buscador. */
(function () {
  var AA = window.AA;
  var h = AA.h;
  var V = AA.vistas;

  var NAV = [
    ["panel", "Panel"],
    ["temario", "Temario"],
    ["novedades", "Novedades"],
    ["test", "Tests"],
    ["tarjetas", "Tarjetas"],
    ["fisicas", "Pruebas físicas"],
    ["proceso", "Proceso"],
    ["progreso", "Progreso"],
  ];
  var VALIDAS = NAV.map(function (n) { return n[0]; });

  var host, nav, lastRendered = null;

  /* ---------- Tema claro / oscuro ---------- */
  var THEME_KEY = "academia-abierta-theme";
  function aplicarTema(t) {
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  try { aplicarTema(localStorage.getItem(THEME_KEY)); } catch (e) {}
  function alternarTema() {
    var actual = document.documentElement.getAttribute("data-theme");
    var oscuro = actual ? actual === "dark" : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var nuevo = oscuro ? "light" : "dark";
    aplicarTema(nuevo);
    try { localStorage.setItem(THEME_KEY, nuevo); } catch (e) {}
  }

  /* ---------- Rutas ---------- */
  function rutaActual() {
    var hs = (location.hash || "").replace(/^#/, "");
    if (!hs) return "panel";
    if (/^tema-\d+$/.test(hs) || VALIDAS.indexOf(hs) >= 0) return hs;
    return "panel";
  }

  function route() {
    var r = rutaActual();
    lastRendered = r;
    var vista;
    var activa = r;
    var m = /^tema-(\d+)$/.exec(r);
    try {
      if (m) { vista = V.tema(Number(m[1])); activa = "temario"; }
      else if (r === "panel") vista = V.panel();
      else if (r === "temario") vista = V.temario();
      else if (r === "novedades") vista = V.novedades();
      else if (r === "test") vista = AA.test.vista();
      else if (r === "tarjetas") vista = AA.tarjetasUI.vista();
      else if (r === "fisicas") vista = V.fisicas();
      else if (r === "proceso") vista = V.proceso();
      else if (r === "progreso") vista = V.progreso();
      else vista = V.noEncontrado();
    } catch (err) {
      console.error(err);
      vista = h("div", { class: "notice" }, h("strong", {}, "Algo ha fallado al cargar esta página. "), "Recarga e inténtalo de nuevo.");
    }
    host.textContent = "";
    host.appendChild(vista);
    nav.querySelectorAll("a").forEach(function (a) {
      if (a.getAttribute("href") === "#" + activa) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }

  AA.go = function (r) {
    if (location.hash !== "#" + r) {
      try { location.hash = r; } catch (e) {}
    }
    route();
  };

  window.addEventListener("hashchange", function () {
    if (rutaActual() !== lastRendered) route();
  });
  // Si el navegador del visor no emite hashchange, la navegación por enlaces sigue funcionando.
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[href^='#']") : null;
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var destino = a.getAttribute("href").slice(1);
    if (/^tema-\d+$/.test(destino) || VALIDAS.indexOf(destino) >= 0) {
      e.preventDefault();
      cerrarBuscador();
      AA.go(destino);
    }
  });

  /* ---------- Buscador ---------- */
  var indice = null;
  function construirIndice() {
    indice = [];
    AA.listaTemas.forEach(function (t) {
      indice.push({ tema: t.tema, tipo: "Tema", texto: t.titulo + ". " + t.oficial, n: AA.norm(t.titulo + " " + t.oficial) });
      var d = t.datos;
      if (!d) return;
      (d.clave || []).forEach(function (x) { indice.push({ tema: t.tema, tipo: "Clave", texto: AA.plain(x), n: AA.norm(AA.plain(x)) }); });
      (d.resumen || []).forEach(function (s) {
        (s.puntos || []).forEach(function (x) { indice.push({ tema: t.tema, tipo: s.titulo, texto: AA.plain(x), n: AA.norm(s.titulo + " " + AA.plain(x)) }); });
      });
      (d.trampas || []).forEach(function (x) { indice.push({ tema: t.tema, tipo: "Trampa", texto: AA.plain(x), n: AA.norm(AA.plain(x)) }); });
      (d.tarjetas || []).forEach(function (c) { indice.push({ tema: t.tema, tipo: "Tarjeta", texto: AA.plain(c.p) + " " + AA.plain(c.r), n: AA.norm(AA.plain(c.p + " " + c.r)) }); });
    });
  }
  function buscar(q) {
    if (!indice) construirIndice();
    var tokens = AA.norm(q).split(/\s+/).filter(function (x) { return x.length > 1; });
    if (!tokens.length) return [];
    var res = [];
    for (var i = 0; i < indice.length && res.length < 40; i++) {
      var it = indice[i];
      if (tokens.every(function (t) { return it.n.indexOf(t) >= 0; })) res.push(it);
    }
    return res;
  }
  function resaltar(texto, q) {
    var tokens = AA.norm(q).split(/\s+/).filter(function (x) { return x.length > 1; });
    var plano = AA.norm(texto);
    var pos = -1;
    for (var i = 0; i < tokens.length; i++) { var p = plano.indexOf(tokens[i]); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
    var ini = Math.max(0, pos - 50);
    var frag = texto.slice(ini, ini + 170);
    var html = AA.esc(frag);
    tokens.forEach(function (t) {
      var esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // La normalización conserva la longitud en español salvo casos raros; resaltamos sobre el texto original.
      html = html.replace(new RegExp("(" + esc + ")", "ig"), "<mark>$1</mark>");
    });
    return (ini > 0 ? "…" : "") + html + (ini + 170 < texto.length ? "…" : "");
  }

  var overlay, qInput, qRes;
  function abrirBuscador() {
    overlay.hidden = false;
    qInput.value = "";
    pintarResultados();
    setTimeout(function () { qInput.focus(); }, 0);
  }
  function cerrarBuscador() {
    if (overlay) overlay.hidden = true;
  }
  function pintarResultados() {
    qRes.textContent = "";
    var q = qInput.value.trim();
    if (q.length < 2) {
      qRes.appendChild(h("p", { class: "muted", style: "padding:10px 12px" }, "Escribe al menos dos letras: busca en resúmenes, trampas y tarjetas de los 45 temas."));
      return;
    }
    var res = buscar(q);
    if (!res.length) { qRes.appendChild(h("p", { class: "muted", style: "padding:10px 12px" }, "Sin resultados para «" + q + "»."));  return; }
    res.forEach(function (r) {
      var t = AA.temas[r.tema];
      qRes.appendChild(h("a", { href: "#tema-" + r.tema },
        h("span", { html: resaltar(r.texto, q) }),
        h("small", {}, "Tema " + r.tema + " · " + t.titulo + " · " + r.tipo)));
    });
  }

  /* ---------- Cabecera y pie ---------- */
  function svg(path) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
  }

  function montar() {
    var app = document.getElementById("app");
    nav = h("nav", { class: "nav", "aria-label": "Secciones" }, NAV.map(function (n) {
      var kids = [n[1]];
      if (n[0] === "novedades") kids.push(h("span", { class: "badge", id: "badge-nov", hidden: true }));
      return h.apply(null, ["a", { href: "#" + n[0] }].concat(kids));
    }));
    var top = h("header", { class: "top" },
      h("div", { class: "wrap" },
        h("div", { class: "top-row" },
          h("a", { class: "brand", href: "#panel" }, h("b", {}, "Academia Abierta"), h("small", {}, "Policía Nacional · Escala Básica · temario 2026")),
          h("button", { class: "iconbtn", type: "button", "aria-label": "Buscar en el temario", title: "Buscar (tecla /)", onclick: abrirBuscador, html: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>') }),
          h("button", { class: "iconbtn", type: "button", "aria-label": "Cambiar entre tema claro y oscuro", title: "Claro / oscuro", onclick: alternarTema, html: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>') })
        ),
        nav
      )
    );
    host = h("div", { class: "wrap", id: "vista", tabindex: "-1" });
    var res = (AA.meta.resumen || {});
    var pie = h("footer", { class: "foot" }, h("div", { class: "wrap" },
      h("p", {}, "Academia Abierta es un proyecto gratuito y ", h("strong", {}, "no oficial"), ". Temario: Anexo I de la ", h("a", { href: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-15055", target: "_blank", rel: "noopener noreferrer" }, "convocatoria BOE-A-2026-15055"), ". Los resúmenes se elaboran desde el texto consolidado del BOE; contrasta siempre los datos decisivos con la norma vigente."),
      h("p", {}, (res.temasConContenido || 0) + " de 45 temas con ficha · " + (res.preguntas || 0) + " preguntas originales · " + (res.tarjetas || 0) + " tarjetas · datos generados el " + AA.fecha(AA.meta.generado))
    ));
    overlay = h("div", { class: "overlay", id: "buscador", hidden: true, onclick: function (e) { if (e.target === overlay) cerrarBuscador(); } },
      h("div", { class: "sbox", role: "dialog", "aria-label": "Buscar en el temario" },
        (qInput = h("input", { type: "search", id: "q-global", placeholder: "Buscar: «detención», «72 horas», «OSINT»…", autocomplete: "off", "aria-label": "Buscar", oninput: pintarResultados })),
        (qRes = h("div", { class: "sres" }))
      )
    );
    app.appendChild(top);
    app.appendChild(h("main", {}, host));
    app.appendChild(pie);
    app.appendChild(overlay);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") cerrarBuscador();
      var tag = (e.target && e.target.tagName) || "";
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && overlay.hidden) { e.preventDefault(); abrirBuscador(); }
    });
  }

  // Punto de aviso en la pestaña Novedades: cambios legales pendientes que este navegador aún no ha visto.
  AA.actualizarAviso = function () {
    var b = document.getElementById("badge-nov");
    if (!b) return;
    var n = AA.novedadesSinVer().length;
    b.textContent = n;
    b.hidden = !n;
    b.setAttribute("title", n + (n === 1 ? " novedad legal sin ver" : " novedades legales sin ver"));
  };

  montar();
  route();
  AA.actualizarAviso();
})();
