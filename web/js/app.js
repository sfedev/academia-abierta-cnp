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
    ["oficiales", "Exámenes oficiales"],
    ["psicotecnicos", "Psicotécnicos"],
    ["fisicas", "Pruebas físicas"],
    ["proceso", "Proceso"],
    ["progreso", "Progreso"],
  ];
  var VALIDAS = NAV.map(function (n) { return n[0]; });
  /* Movil: barra inferior con las cuatro secciones de estudio y un panel «Mas» con el resto. */
  var TABS = [
    ["panel", "Panel", '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'],
    ["temario", "Temario", '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M9 7h6"/>'],
    ["test", "Tests", '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'],
    ["tarjetas", "Tarjetas", '<rect x="3" y="8" width="14" height="12" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>'],
  ];
  var MAS = ["novedades", "oficiales", "psicotecnicos", "fisicas", "proceso", "progreso"];

  var host, nav, tabbar, hoja, fondoHoja, btnMas, lastRendered = null;

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
      else if (r === "oficiales") vista = V.oficiales();
      else if (r === "psicotecnicos") vista = V.psicotecnicos();
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
    [nav, tabbar, hoja].forEach(function (cont) {
      if (!cont) return;
      cont.querySelectorAll("a").forEach(function (a) {
        if (a.getAttribute("href") === "#" + activa) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    });
    if (btnMas) {
      if (MAS.indexOf(activa) >= 0) btnMas.setAttribute("aria-current", "page");
      else btnMas.removeAttribute("aria-current");
    }
    cerrarMas();
    window.scrollTo(0, 0);
  }

  /* ---------- Panel «Mas» (movil) e indice flotante de las fichas (tablet y movil) ---------- */
  function abrirMas() {
    hoja.classList.add("abierto");
    fondoHoja.classList.add("abierto");
    btnMas.setAttribute("aria-expanded", "true");
  }
  function cerrarMas() {
    if (!hoja) return;
    hoja.classList.remove("abierto");
    fondoHoja.classList.remove("abierto");
    btnMas.setAttribute("aria-expanded", "false");
  }
  function alternarMas() {
    if (hoja.classList.contains("abierto")) cerrarMas();
    else abrirMas();
  }
  AA.cerrarToc = function () {
    var t = document.querySelector(".toc.abierto");
    if (t) t.classList.remove("abierto");
    var f = document.querySelector(".toc-fab");
    if (f) f.setAttribute("aria-expanded", "false");
  };

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
    var dentro = e.target.closest ? e.target : null;
    if (dentro && hoja && hoja.classList.contains("abierto") && !dentro.closest(".sheet") && !dentro.closest("#btn-mas")) cerrarMas();
    if (dentro && document.querySelector(".toc.abierto") && !dentro.closest(".toc") && !dentro.closest(".toc-fab")) AA.cerrarToc();
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
    var fin = Math.min(texto.length, ini + 170);
    // Las coincidencias se buscan en el texto sin tildes y se marcan en el original: AA.norm conserva la
    // longitud en español (cada letra con tilde sigue siendo una letra), así que las posiciones valen para ambos.
    var rangos = [];
    if (plano.length === texto.length) {
      tokens.forEach(function (t) {
        var i = plano.indexOf(t, ini);
        while (i >= 0 && i < fin) {
          rangos.push([i, Math.min(fin, i + t.length)]);
          i = plano.indexOf(t, i + t.length);
        }
      });
    }
    rangos.sort(function (a, b) { return a[0] - b[0]; });
    var html = "";
    var cursor = ini;
    rangos.forEach(function (r) {
      if (r[1] <= cursor) return; // solapada con una anterior
      var desde = Math.max(r[0], cursor);
      html += AA.esc(texto.slice(cursor, desde)) + "<mark>" + AA.esc(texto.slice(desde, r[1])) + "</mark>";
      cursor = r[1];
    });
    html += AA.esc(texto.slice(cursor, fin));
    return (ini > 0 ? "…" : "") + html + (fin < texto.length ? "…" : "");
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
      if (n[0] === "novedades") kids.push(h("span", { class: "badge badge-nov", hidden: true }));
      return h.apply(null, ["a", { href: "#" + n[0] }].concat(kids));
    }));
    // Barra inferior (solo se ve en movil, ver app.css)
    btnMas = h("button", { type: "button", id: "btn-mas", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": "hoja-mas", onclick: alternarMas,
      html: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>') + "<span>Más</span>" });
    btnMas.appendChild(h("span", { class: "badge badge-nov", hidden: true }));
    tabbar = h("nav", { class: "tabbar", "aria-label": "Navegación principal" },
      TABS.map(function (t) { return h("a", { href: "#" + t[0], html: svg(t[2]) + "<span>" + t[1] + "</span>" }); }).concat([btnMas]));
    hoja = h("div", { class: "sheet", id: "hoja-mas", role: "dialog", "aria-label": "Más secciones" },
      h("div", { class: "eyebrow" }, "Más secciones"),
      MAS.map(function (r) {
        var nombre = NAV.filter(function (n) { return n[0] === r; })[0][1];
        var kids = [h("span", {}, nombre)];
        if (r === "novedades") kids.push(h("span", { class: "badge badge-nov", hidden: true }));
        return h.apply(null, ["a", { href: "#" + r }].concat(kids));
      }));
    fondoHoja = h("div", { class: "sheet-fondo", onclick: cerrarMas });
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
    app.appendChild(fondoHoja);
    app.appendChild(hoja);
    app.appendChild(tabbar);
    app.appendChild(overlay);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { cerrarBuscador(); cerrarMas(); AA.cerrarToc(); }
      var tag = (e.target && e.target.tagName) || "";
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && overlay.hidden) { e.preventDefault(); abrirBuscador(); }
    });
  }

  // Punto de aviso en la pestaña Novedades: cambios legales pendientes que este navegador aún no ha visto.
  AA.actualizarAviso = function () {
    var n = AA.novedadesSinVer().length;
    document.querySelectorAll(".badge-nov").forEach(function (b) {
      b.textContent = n;
      b.hidden = !n;
      b.setAttribute("title", n + (n === 1 ? " novedad legal sin ver" : " novedades legales sin ver"));
    });
  };

  montar();
  route();
  AA.actualizarAviso();
})();
