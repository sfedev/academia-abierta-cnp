/* Vistas: panel, temario y ficha de tema. */
(function () {
  var AA = window.AA;
  var h = AA.h;
  var rich = AA.rich;
  var store = AA.store;
  var V = (AA.vistas = AA.vistas || {});

  var BLOQUE_NOMBRE = { A: "Ciencias Jurídicas", B: "Ciencias Sociales", C: "Materias Técnico-Científicas" };
  AA.BLOQUE_NOMBRE = BLOQUE_NOMBRE;

  function enlace(ruta, cls) {
    var kids = Array.prototype.slice.call(arguments, 2);
    return h.apply(null, ["a", { href: "#" + ruta, class: cls }].concat(kids));
  }
  function pillPeso(nivel) {
    return h("span", { class: "pill pill--" + nivel }, "Peso " + nivel);
  }
  function tagBloque(b) {
    return h("span", { class: "tagb tagb--" + b }, "Bloque " + b);
  }
  AA.ui = { enlace: enlace, pillPeso: pillPeso, tagBloque: tagBloque };

  /* ---------- Fila de tema (panel y temario) ---------- */
  function filaTema(t) {
    var st = store.statsTema(t.tema);
    var leido = store.leido(t.tema);
    var meta = [pillPeso(t.peso), t.media != null ? h("span", { class: "num" }, "≈ " + AA.fmt1(t.media) + " preg./examen") : null];
    if (!t.datos) meta.push(h("span", {}, "Contenido en preparación"));
    var conv = AA.convocatoriaPendiente && AA.convocatoriaPendiente();
    var cambio = conv && AA.cambioDeTema(conv, t.tema);
    if (cambio) meta.push(h("span", { class: "insignia-conv", title: "Ver la ficha para el detalle" },
      cambio.tipo === "eliminado" ? "Sale del temario" : cambio.tipo === "renumerado" ? "Pasa a ser el tema " + cambio.ahora : "Cambia en la convocatoria"));
    var estado = h(
      "div",
      { class: "state" },
      h("span", { class: "check" + (leido ? " on" : ""), title: leido ? "Leído" : "Sin leer", "aria-label": leido ? "Leído" : "Sin leer" }, "✓"),
      st.intentos ? h("div", { class: "bar bar--" + t.bloque, title: st.pct + " % de aciertos" }, h("i", { style: "width:" + st.pct + "%" })) : h("div", { class: "bar" }, h("i", { style: "width:0" }))
    );
    return h(
      "a",
      { href: "#tema-" + t.tema, class: "tema-row" + (t.datos ? "" : " nodata") },
      h("div", { class: "n" }, t.tema),
      h("div", {}, h("div", { class: "t" }, t.titulo), h("div", { class: "meta" }, meta)),
      estado
    );
  }

  /* ---------- Panel ---------- */
  V.panel = function () {
    var g = store.statsGlobal();
    var leidos = store.totalLeidos();
    var conContenido = AA.listaTemas.filter(function (t) { return t.datos; }).length;
    var fallos = store.fallosPendientes().length;
    var due = store.pendientesTarjetas().length;
    var sims = store.simulacros();

    var root = h("div");
    root.appendChild(
      h(
        "section",
        {},
        h("div", { class: "eyebrow" }, "Policía Nacional · Escala Básica · Convocatoria 2026"),
        h("h1", { class: "page-title" }, "Estudia el temario del BOE con lo que ya ha caído en examen"),
        h(
          "p",
          { class: "lead" },
          "Resúmenes de los 45 temas escritos desde el texto vigente del BOE, ordenados por lo que más se pregunta, con tests y tarjetas de repaso. Gratis y sin registro; tu progreso se guarda en este navegador."
        )
      )
    );

    root.appendChild(
      h(
        "section",
        { class: "section" },
        h(
          "div",
          { class: "kv" },
          h("div", {}, h("b", {}, leidos + "/" + conContenido), h("span", {}, "temas leídos")),
          h("div", {}, h("b", {}, g.intentos ? g.pct + " %" : "–"), h("span", {}, "aciertos en tests")),
          h("div", {}, h("b", {}, g.vistas + "/" + g.total), h("span", {}, "preguntas vistas")),
          h("div", {}, h("b", {}, sims.length), h("span", {}, "simulacros hechos"))
        )
      )
    );

    // Siguiente paso
    var pasos = [];
    var conv = AA.convocatoriaPendiente();
    if (conv) {
      var tc = (conv.convocatoria || {}).temario || {};
      var nCambios = (tc.modificados || []).length + (tc.nuevos || []).length + (tc.eliminados || []).length;
      pasos.push({ txt: "Ha salido la convocatoria nueva: ", fuerte: nCambios ? AA.plural(nCambios, "cambio en el temario", "cambios en el temario") : "el temario no cambia", btn: "Ver la convocatoria", ir: "novedades" });
    }
    // Recordatorio del idioma (A2) hasta que se marque «ya lo tengo» en Proceso
    if (!store.ajuste("a2")) {
      var fin = conv ? AA.plazoEstimado(conv.publicacion) : null;
      pasos.push(fin ?
        { txt: "Plazo de solicitud hasta el " + AA.fecha(fin) + " (aprox.): ", fuerte: "acredita ya el nivel A2 de inglés o francés", btn: "Ver requisitos", ir: "proceso" } :
        { txt: "Requisito: ", fuerte: "certificado A2 de inglés o francés antes de que acabe el plazo de solicitud", btn: "Ver requisitos", ir: "proceso" });
    }
    var cambiosLey = AA.novedadesPendientes().filter(function (e) { return e.tipo !== "convocatoria"; });
    if (cambiosLey.length) {
      pasos.push({ txt: "Hay ", fuerte: AA.plural(cambiosLey.length, "cambio legal pendiente de revisar", "cambios legales pendientes de revisar"), btn: "Ver novedades", ir: "novedades" });
    }
    var pendientes = AA.listaTemas
      .filter(function (t) { return t.datos && !store.leido(t.tema); })
      .sort(function (a, b) { return (b.media || 0) - (a.media || 0); });
    if (pendientes.length) {
      var p = pendientes[0];
      pasos.push({
        txt: leidos ? "Siguiente tema por rentabilidad: " : "Empieza por el tema que más puntúa: ",
        fuerte: "Tema " + p.tema + ", " + p.titulo,
        btn: "Leer",
        ir: "tema-" + p.tema,
      });
    }
    if (fallos) pasos.push({ txt: "Tienes ", fuerte: AA.plural(fallos, "pregunta fallada", "preguntas falladas") + " por repasar", btn: "Repasar", fn: function () { AA.test.preparar({ preset: "fallos" }); } });
    if (due) pasos.push({ txt: "Tienes ", fuerte: AA.plural(due, "tarjeta pendiente", "tarjetas pendientes"), btn: "Repasar", fn: function () { AA.tarjetasUI.preparar({}); } });
    if (!sims.length) pasos.push({ txt: "Mide tu nivel con un ", fuerte: "simulacro completo", btn: "Hacer simulacro", fn: function () { AA.test.preparar({ preset: "simulacro" }); } });
    if (pasos.length) {
      var lista = h("div", { class: "stack" });
      pasos.slice(0, 3).forEach(function (s) {
        var boton = s.ir ? enlace(s.ir, "btn btn--sm btn--primary", s.btn) : h("button", { class: "btn btn--sm btn--primary", onclick: s.fn }, s.btn);
        lista.appendChild(h("div", { class: "row-between" }, h("span", {}, s.txt, h("strong", {}, s.fuerte)), boton));
      });
      root.appendChild(h("section", { class: "section" }, h("h2", { class: "sec-title" }, "Qué hacer ahora"), h("div", { class: "card" }, lista)));
    }

    // Presets
    var presets = h(
      "div",
      { class: "preset" },
      tarjetaPreset("Simulacro oficial", "100 preguntas, 50 minutos y la misma fórmula del examen (cada error resta 0,5). El reparto por temas sigue los cinco últimos exámenes.", "Empezar", function () { AA.test.preparar({ preset: "simulacro" }); }, true),
      tarjetaPreset("Test rápido", "20 preguntas con corrección inmediata y explicación del artículo. Prioriza lo que no has visto o has fallado.", "Empezar", function () { AA.test.preparar({ preset: "rapido" }); }),
      tarjetaPreset("Mis fallos", fallos ? AA.plural(fallos, "pregunta que fallaste", "preguntas que fallaste") + " la última vez." : "Aquí aparecerán las preguntas que falles.", "Repasar", function () { AA.test.preparar({ preset: "fallos" }); }, false, !fallos),
      tarjetaPreset("Tarjetas de repaso", due ? AA.plural(due, "tarjeta pendiente", "tarjetas pendientes") + " hoy (repetición espaciada)." : "Conceptos clave en tarjetas, con repetición espaciada.", "Abrir", function () { AA.tarjetasUI.preparar({}); })
    );
    root.appendChild(h("section", { class: "section" }, h("h2", { class: "sec-title" }, "Practicar"), presets));

    // Reparto del examen
    var suma = { A: 0, B: 0, C: 0 };
    AA.listaTemas.forEach(function (t) { suma[t.bloque] += t.media || 0; });
    var tot = suma.A + suma.B + suma.C || 1;
    var rep = h("div", { class: "stackbar", role: "img", "aria-label": "Reparto medio de preguntas por bloque" });
    ["A", "B", "C"].forEach(function (b) {
      rep.appendChild(h("div", { class: "s" + b, style: "flex:" + suma[b] / tot }, b + " · " + Math.round((100 * suma[b]) / tot)));
    });
    var top = AA.listaTemas
      .filter(function (t) { return t.media; })
      .sort(function (a, b) { return b.media - a.media; })
      .slice(0, 8);
    var maxM = top.length ? top[0].media : 1;
    var topList = h("div", { class: "stack" });
    top.forEach(function (t) {
      topList.appendChild(
        h(
          "a",
          { href: "#tema-" + t.tema, style: "text-decoration:none;color:inherit;display:grid;grid-template-columns:34px minmax(0,1fr) 54px;gap:10px;align-items:center" },
          h("span", { class: "mono muted", style: "text-align:right" }, t.tema),
          h("span", {}, h("span", { style: "font-weight:600;font-size:.92rem" }, t.titulo), h("div", { class: "bar bar--" + t.bloque, style: "margin-top:5px" }, h("i", { style: "width:" + (100 * t.media) / maxM + "%" }))),
          h("span", { class: "num muted", style: "font-size:.85rem" }, AA.fmt1(t.media))
        )
      );
    });
    root.appendChild(
      h(
        "section",
        { class: "section cols-2" },
        h(
          "div",
          { class: "card" },
          h("h2", { class: "sec-title" }, "Cómo se reparte el examen"),
          rep,
          h("p", { class: "muted", style: "margin-top:12px;font-size:.9rem" }, "Media de preguntas por bloque en los cinco últimos exámenes de conocimientos (abril 2023 a septiembre 2026). Jurídicas (A), sociales (B) y técnico-científicas (C). El tribunal no fija el reparto en las bases."),
          h("div", { class: "row", style: "margin-top:10px" }, enlace("proceso", "btn btn--sm", "Ver cómo es el proceso"))
        ),
        h("div", { class: "card" }, h("h2", { class: "sec-title" }, "Los temas que más caen"), topList, h("p", { class: "muted", style: "margin-top:12px;font-size:.82rem" }, "Preguntas por examen, media de P39 a P43."))
      )
    );
    return root;
  };

  function tarjetaPreset(titulo, texto, boton, fn, primario, desactivado) {
    return h(
      "div",
      { class: "card" },
      h("h3", {}, titulo),
      h("p", {}, texto),
      h("div", {}, h("button", { class: "btn btn--sm" + (primario ? " btn--primary" : ""), onclick: fn, disabled: desactivado ? true : null }, boton))
    );
  }

  /* ---------- Temario ---------- */
  var filtros = { bloque: "", peso: "", estado: "", q: "" };
  V.temario = function () {
    var root = h("div");
    root.appendChild(h("div", { class: "eyebrow" }, "45 temas · Anexo I de la convocatoria"));
    root.appendChild(h("h1", { class: "page-title" }, "Temario"));
    root.appendChild(h("p", { class: "lead" }, "Ordenado como el BOE. El peso indica cuánto ha caído el tema en los cinco últimos exámenes."));

    var cont = h("div");
    var barra = h("div", { class: "filters" });
    var buscador = h("input", {
      class: "field search",
      type: "search",
      id: "filtro-q",
      placeholder: "Filtrar por título o contenido…",
      "aria-label": "Filtrar temas",
      value: filtros.q,
      oninput: function (e) { filtros.q = e.target.value; dibujar(); },
    });
    barra.appendChild(buscador);
    function grupo(clave, opciones) {
      var cuerpo = h("div", { class: "row", style: "gap:6px" });
      opciones.forEach(function (o) {
        var b = h("button", {
          class: "chip chipbtn",
          "aria-pressed": filtros[clave] === o[0] ? "true" : "false",
          onclick: function () { filtros[clave] = o[0]; refrescarChips(); dibujar(); },
        }, o[1]);
        b.dataset.clave = clave;
        b.dataset.val = o[0];
        cuerpo.appendChild(b);
      });
      return cuerpo;
    }
    barra.appendChild(grupo("bloque", [["", "Todos"], ["A", "A"], ["B", "B"], ["C", "C"]]));
    barra.appendChild(grupo("peso", [["", "Cualquier peso"], ["alto", "Alto"], ["medio", "Medio"], ["bajo", "Bajo"]]));
    barra.appendChild(grupo("estado", [["", "Todos"], ["pend", "Sin leer"], ["leido", "Leídos"]]));
    function refrescarChips() {
      barra.querySelectorAll(".chipbtn").forEach(function (b) {
        b.setAttribute("aria-pressed", filtros[b.dataset.clave] === b.dataset.val ? "true" : "false");
      });
    }
    root.appendChild(barra);
    root.appendChild(cont);

    function dibujar() {
      cont.textContent = "";
      var q = AA.norm(filtros.q);
      var total = 0;
      AA.meta.bloques.forEach(function (b) {
        if (filtros.bloque && filtros.bloque !== b.id) return;
        var filas = AA.listaTemas.filter(function (t) {
          if (t.bloque !== b.id) return false;
          if (filtros.peso && t.peso !== filtros.peso) return false;
          if (filtros.estado === "pend" && store.leido(t.tema)) return false;
          if (filtros.estado === "leido" && !store.leido(t.tema)) return false;
          if (q && AA.norm(t.titulo + " " + t.oficial).indexOf(q) < 0) return false;
          return true;
        });
        if (!filas.length) return;
        total += filas.length;
        var sec = h("section", { class: "blk" });
        var leidos = filas.filter(function (t) { return store.leido(t.tema); }).length;
        sec.appendChild(h("div", { class: "blk-head" }, tagBloque(b.id), h("h2", {}, b.nombre), h("span", { class: "muted num", style: "font-size:.85rem" }, leidos + "/" + filas.length + " leídos")));
        var lista = h("div", { class: "temas" });
        filas.forEach(function (t) { lista.appendChild(filaTema(t)); });
        sec.appendChild(lista);
        cont.appendChild(sec);
      });
      if (!total) cont.appendChild(h("p", { class: "muted", style: "margin-top:24px" }, "Ningún tema coincide con el filtro."));
    }
    dibujar();
    return root;
  };

  /* ---------- Ficha de tema ---------- */
  function tabla(tb) {
    return h(
      "div",
      { class: "tbl" },
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, tb.cabecera.map(function (c) { return h("th", { html: rich(c) }); }))),
        h("tbody", {}, tb.filas.map(function (f) { return h("tr", {}, f.map(function (c) { return h("td", { html: rich(c) }); })); }))
      )
    );
  }
  function lista(items) {
    return h("ul", {}, items.map(function (x) { return h("li", { html: rich(x) }); }));
  }

  V.tema = function (n) {
    var t = AA.temas[n];
    if (!t) return V.noEncontrado();
    var d = t.datos;
    store.ultimoTema(n);
    var root = h("div");

    var badges = h("div", { class: "badges" }, tagBloque(t.bloque), pillPeso(t.peso));
    if (t.media != null) badges.appendChild(h("span", { class: "chip num" }, "≈ " + AA.fmt1(t.media) + " preguntas por examen"));
    if (d) badges.appendChild(h("span", { class: "chip" }, "Actualizado " + AA.fecha(d.actualizado)));

    var head = h(
      "header",
      { class: "ficha-head" },
      h("div", { class: "eyebrow" }, "Tema " + n + " · " + BLOQUE_NOMBRE[t.bloque]),
      h("h1", { class: "page-title" }, t.titulo),
      badges,
      h("details", { class: "oficial" }, h("summary", {}, "Texto oficial del Anexo I"), h("p", {}, t.oficial))
    );

    if (!d) {
      root.appendChild(head);
      root.appendChild(h("div", { class: "notice section" }, h("strong", {}, "Contenido en preparación. "), "Este tema todavía no tiene ficha publicada. Mientras tanto, estúdialo con el texto oficial de arriba y las normas del BOE."));
      root.appendChild(navegacion(n));
      return root;
    }

    if (d.normas && d.normas.length) {
      var ns = h("div", { class: "normas" });
      d.normas.forEach(function (x) {
        ns.appendChild(h("div", {}, h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer" }, x.nombre), x.verificado ? h("span", { class: "ver" }, x.verificado) : null));
      });
      head.appendChild(h("div", { class: "section", style: "margin-top:14px" }, h("div", { class: "eyebrow", style: "margin-bottom:6px" }, "Normas de referencia"), ns));
    }

    var nPreg = (d.preguntas || []).length;
    var nTarj = (d.tarjetas || []).length;
    var leido = store.leido(n);
    var btnLeido = h("button", {
      class: "btn" + (leido ? "" : " btn--primary"),
      onclick: function () {
        var nuevo = !store.leido(n);
        store.marcarLeido(n, nuevo);
        btnLeido.textContent = nuevo ? "✓ Leído (deshacer)" : "Marcar como leído";
        btnLeido.classList.toggle("btn--primary", !nuevo);
        AA.toast(nuevo ? "Tema marcado como leído" : "Marca de lectura quitada");
      },
    }, leido ? "✓ Leído (deshacer)" : "Marcar como leído");
    head.appendChild(
      h(
        "div",
        { class: "actions" },
        btnLeido,
        h("button", { class: "btn", onclick: function () { AA.test.preparar({ preset: "tema", temas: [n] }); } }, "Test del tema (" + nPreg + ")"),
        h("button", { class: "btn", onclick: function () { AA.tarjetasUI.preparar({ temas: [n] }); } }, "Tarjetas (" + nTarj + ")")
      )
    );

    // Cuerpo
    var cuerpo = h("div", { class: "read" });
    var toc = [];
    function seccion(id, titulo, nodo) {
      toc.push([id, titulo]);
      var s = h("section", { class: "sec", id: id }, nodo);
      return s;
    }

    var bloques = [];
    if (d.novedades && d.novedades.length) {
      bloques.push(h("div", { class: "callout callout--nov section", style: "margin-top:24px" }, h("h2", {}, "Novedades a tener en cuenta"), lista(d.novedades)));
    }
    if (d.clave && d.clave.length) {
      toc.push(["s-clave", "Lo imprescindible"]);
      bloques.push(h("section", { class: "sec", id: "s-clave", style: "margin-top:24px" }, h("div", { class: "callout callout--clave" }, h("h2", {}, "Lo imprescindible"), lista(d.clave))));
    }
    (d.resumen || []).forEach(function (s, i) {
      if (s.ampliado) {
        // Detalle de apoyo: plegado por defecto para que la ficha se lea de un tirón.
        var cuerpoAmp = h("div", { class: "amp-body" }, lista(s.puntos));
        if (s.tabla) cuerpoAmp.appendChild(tabla(s.tabla));
        var det = h("details", { class: "ampliado" }, h("summary", {}, h("span", { class: "eyebrow" }, "Ampliación"), h("span", {}, s.titulo)), cuerpoAmp);
        toc.push(["s-" + i, "+ " + s.titulo]);
        bloques.push(h("section", { class: "sec", id: "s-" + i }, det));
        return;
      }
      var nodo = h("div", {}, h("h3", {}, s.titulo), lista(s.puntos));
      if (s.tabla) nodo.appendChild(tabla(s.tabla));
      bloques.push(seccion("s-" + i, s.titulo, nodo));
    });
    if (d.trampas && d.trampas.length) {
      toc.push(["s-trampas", "Trampas habituales"]);
      bloques.push(h("section", { class: "sec", id: "s-trampas" }, h("div", { class: "callout callout--trampa" }, h("h2", {}, "Trampas habituales en el test"), lista(d.trampas))));
    }
    if (d.caido && d.caido.length) {
      toc.push(["s-caido", "Lo que ya ha caído"]);
      var ul = h("ul", { class: "caido" });
      d.caido.forEach(function (c) {
        ul.appendChild(h("li", {}, h("time", {}, c.examen), h("span", { html: rich(c.concepto) })));
      });
      bloques.push(h("section", { class: "sec", id: "s-caido" }, h("h3", {}, "Lo que ya ha caído en examen"), ul));
    }
    if (d.mnemotecnias && d.mnemotecnias.length) {
      toc.push(["s-mnemo", "Para recordar"]);
      bloques.push(h("section", { class: "sec", id: "s-mnemo" }, h("h3", {}, "Para recordar"), lista(d.mnemotecnias)));
    }
    bloques.forEach(function (b) { cuerpo.appendChild(b); });

    var indice = h("nav", { class: "toc", id: "toc-tema", "aria-label": "Contenido del tema" }, h("div", { class: "eyebrow" }, "En este tema"));
    toc.forEach(function (x) {
      indice.appendChild(h("a", {
        href: "#tema-" + n,
        onclick: function (e) {
          e.preventDefault();
          var el = document.getElementById(x[0]);
          var plegable = el && el.querySelector("details.ampliado");
          if (plegable) plegable.open = true;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          if (AA.cerrarToc) AA.cerrarToc();
        },
      }, x[1]));
    });
    // En tablet y movil el indice no ocupa ancho de lectura: es un panel flotante que abre este boton (ver app.css).
    var fabIndice = h("button", {
      class: "toc-fab", type: "button", "aria-expanded": "false", "aria-controls": "toc-tema",
      onclick: function () {
        var abrir = !indice.classList.contains("abierto");
        indice.classList.toggle("abierto", abrir);
        fabIndice.setAttribute("aria-expanded", abrir ? "true" : "false");
      },
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16"/></svg>Índice',
    });

    var fin = h(
      "div",
      { class: "section card" },
      h("div", { class: "row-between" },
        h("div", {}, h("strong", {}, "¿Lo has asimilado?"), h("div", { class: "muted", style: "font-size:.9rem" }, nPreg + " preguntas originales con explicación del artículo.")),
        h("div", { class: "row" },
          h("button", { class: "btn btn--primary", onclick: function () { AA.test.preparar({ preset: "tema", temas: [n] }); } }, "Hacer el test"),
          h("button", { class: "btn", onclick: function () { AA.tarjetasUI.preparar({ temas: [n] }); } }, "Repasar tarjetas")))
    );

    root.appendChild(h("div", { class: "ficha" }, h("div", { style: "min-width:0" }, head, avisoConvocatoria(n), avisoLeyes(n), cuerpo, fin, navegacion(n), nota(d)), indice));
    root.appendChild(fabIndice);
    return root;
  };

  function nota(d) {
    if (!d.dudas || !d.dudas.length) return null;
    // Notas del redactor sobre fuentes y límites de la verificación: plegadas para no interrumpir el estudio.
    return h(
      "details",
      { class: "notas-fuentes" },
      h("summary", {}, "Notas sobre las fuentes y puntos sin verificar (" + d.dudas.length + ")"),
      h("ul", {}, d.dudas.map(function (x) { return h("li", { html: rich(x) }); }))
    );
  }

  function navegacion(n) {
    var prev = AA.temas[n - 1];
    var next = AA.temas[n + 1];
    return h(
      "div",
      { class: "nextprev" },
      prev ? enlace("tema-" + prev.tema, "btn btn--ghost", "← Tema " + prev.tema) : h("span"),
      enlace("temario", "btn btn--ghost", "Índice del temario"),
      next ? enlace("tema-" + next.tema, "btn btn--ghost", "Tema " + next.tema + " →") : h("span")
    );
  }

  /* ---------- Novedades legislativas ---------- */
  function diasHasta(iso) {
    var d = new Date(iso + "T00:00:00");
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((d - hoy) / 86400000);
  }
  function cuandoRige(e) {
    if (e.tipo === "derogada") return "Derogada";
    var dias = diasHasta(e.vigencia);
    if (dias > 1) return "Entra en vigor el " + AA.fecha(e.vigencia) + " (en " + dias + " días)";
    if (dias === 1) return "Entra en vigor mañana, " + AA.fecha(e.vigencia);
    return "En vigor desde el " + AA.fecha(e.vigencia);
  }
  function recorta(t, n) {
    t = t || "";
    return t.length > n ? t.slice(0, n - 1).replace(/[\s,.;]+\S*$/, "") + "…" : t;
  }
  /* Artículos de la novedad; con `tema`, solo los que cita esa ficha (articulosPorTema, si el vigilante los registró). */
  function listaArticulos(e, tema) {
    var propios = tema != null && e.articulosPorTema && e.articulosPorTema[tema];
    var arts = propios || e.articulos;
    if (!arts || !arts.length) return "";
    var total = propios ? arts.length : e.nArticulos;
    var resto = total - arts.length;
    var soloArt = arts.every(function (a) { return /^Art\. /.test(a); });
    var lista = arts.map(function (a) { return soloArt ? a.replace(/^Art\. /, "") : a; }).join(", ");
    return (soloArt ? (total === 1 ? "Art. " : "Arts. ") : "") + lista + (resto > 0 ? " y " + resto + " más" : "");
  }

  /* Último día del plazo de solicitud: 15 días hábiles desde el día siguiente a la publicación (base 3.1).
     Sábados y domingos no cuentan (Ley 39/2015, art. 30.2); los festivos no se conocen, por eso es aproximado. */
  AA.plazoEstimado = function (pubIso, dias) {
    var d = new Date(pubIso + "T12:00:00");
    var habiles = 0;
    while (habiles < (dias || 15)) {
      d.setDate(d.getDate() + 1);
      var s = d.getDay();
      if (s !== 0 && s !== 6) habiles++;
    }
    return d.getFullYear() + "-" + AA.pad(d.getMonth() + 1) + "-" + AA.pad(d.getDate());
  };

  /* ---------- Convocatoria nueva (herramientas/vigilar_convocatoria.py) ---------- */
  function convocatoriaPendiente() {
    return AA.novedades.items.filter(function (e) { return e.tipo === "convocatoria" && e.estado === "pendiente"; })[0] || null;
  }
  AA.convocatoriaPendiente = convocatoriaPendiente;
  /* Qué le pasa a un tema actual en la convocatoria nueva: {tipo: modificado|eliminado|renumerado, …} o null. */
  function cambioDeTema(c, n) {
    var t = (c.convocatoria || {}).temario || {};
    var m = (t.modificados || []).filter(function (x) { return x.tema === n; })[0];
    if (m) return { tipo: "modificado", ahora: m.nuevoNumero, antes: m.antes, despues: m.despues };
    if ((t.eliminados || []).some(function (x) { return x.tema === n; })) return { tipo: "eliminado" };
    var r = (t.renumerados || []).filter(function (x) { return x.de === n; })[0];
    if (r) return { tipo: "renumerado", ahora: r.a };
    return null;
  }
  AA.cambioDeTema = cambioDeTema;

  function tarjetaConvocatoria(e) {
    var c = e.convocatoria || {};
    var t = c.temario || {};
    var pend = e.estado === "pendiente";
    var lista = h("ul", { class: "conv-cambios" });
    (t.nuevos || []).forEach(function (x) { lista.appendChild(h("li", {}, h("span", { class: "pill pill--alto" }, "Tema nuevo " + x.tema), " ", recorta(x.texto, 220))); });
    (t.eliminados || []).forEach(function (x) { lista.appendChild(h("li", {}, h("span", { class: "pill pill--pend" }, "Se elimina"), " ", h("a", { href: "#tema-" + x.tema }, "Tema " + x.tema), ": " + recorta(x.texto, 160))); });
    (t.modificados || []).forEach(function (x) {
      lista.appendChild(h("li", {},
        h("span", { class: "pill pill--pend" }, "Cambia"), " ", h("a", { href: "#tema-" + x.tema }, "Tema " + x.tema),
        x.nuevoNumero !== x.tema ? " (pasa a ser el " + x.nuevoNumero + ")" : "",
        h("details", { class: "conv-diff" }, h("summary", {}, "Ver epígrafe antes y después"),
          h("p", {}, h("strong", {}, "Antes: "), x.antes), h("p", {}, h("strong", {}, "Ahora: "), x.despues))));
    });
    var soloRenum = (t.renumerados || []).filter(function (r) { return !(t.modificados || []).some(function (m) { return m.tema === r.de; }); });
    if (soloRenum.length) lista.appendChild(h("li", {}, h("span", { class: "pill" }, "Renumerados"), " " + soloRenum.map(function (r) { return r.de + "→" + r.a; }).join(", ") + " (mismo contenido)."));
    if (!lista.children.length) lista.appendChild(h("li", {}, t.sinAnexo ? "No se ha podido leer el Anexo I: compáralo a mano con el temario actual." : "El temario es el mismo: los 45 epígrafes no cambian."));
    var datos = [];
    if (c.plazas) datos.push(h("div", {}, h("strong", {}, c.plazas.toLocaleString("es-ES") + " plazas"), c.plazasLibres ? " (" + c.plazasLibres.toLocaleString("es-ES") + " de oposición libre)" : ""));
    if (c.plazo) datos.push(h("div", {}, h("span", { class: "muted" }, "Plazo de solicitud: "), c.plazo));
    if (c.primeraPrueba) datos.push(h("div", { class: "muted" }, recorta(c.primeraPrueba, 220)));
    datos.push(h("div", { class: "aviso-a2" }, h("strong", {}, "Idioma: "), "acredita el nivel A2 de inglés o francés antes de que acabe el plazo de solicitud. ", enlace("proceso", "", "Ver requisitos")));
    return h("article", { class: "nov-card nov-card--conv" + (pend ? " nov-card--pend" : "") },
      h("div", { class: "nov-head" },
        h("strong", { class: "nov-norma" }, "Nueva convocatoria de Escala Básica"),
        h("span", { class: "pill " + (pend ? "pill--pend" : "pill--ok") }, pend ? "Temario por revisar" : "Fichas actualizadas")),
      h("div", { class: "nov-cuando" }, "Publicada en el BOE el " + AA.fecha(e.publicacion)),
      h("div", { class: "muted nov-titulo" }, recorta(e.norma.titulo, 180)),
      h("div", { class: "nov-detalle" }, datos),
      h("h3", { style: "margin-top:12px;font-size:1rem" }, "Cambios en el temario respecto al de 2026"),
      lista,
      h("div", { class: "row", style: "margin-top:10px" }, h("a", { class: "btn btn--sm", href: e.norma.url, target: "_blank", rel: "noopener noreferrer" }, "Ver la convocatoria en el BOE")));
  }

  /* Banner en la ficha de un tema que cambia en la convocatoria nueva. */
  function avisoConvocatoria(n) {
    var c = convocatoriaPendiente();
    var cambio = c && cambioDeTema(c, n);
    if (!cambio) return null;
    var texto = cambio.tipo === "eliminado" ? "La nueva convocatoria **elimina este tema** del temario." :
      cambio.tipo === "renumerado" ? "En la nueva convocatoria este tema pasa a ser el **tema " + cambio.ahora + "** (mismo contenido)." :
      "La nueva convocatoria **cambia el epígrafe** de este tema" + (cambio.ahora !== n ? " (y pasa a ser el tema " + cambio.ahora + ")" : "") + ": puede incluir contenidos que esta ficha no cubre.";
    return h("aside", { class: "aviso-conv", role: "note" },
      h("strong", {}, "Convocatoria nueva publicada el " + AA.fecha(c.publicacion)),
      h("p", { html: rich(texto) }),
      cambio.tipo === "modificado" ? h("details", { class: "conv-diff" }, h("summary", {}, "Ver el epígrafe nuevo"), h("p", {}, cambio.despues)) : null,
      h("div", { style: "margin-top:8px" }, h("a", { class: "btn btn--sm", href: "#novedades" }, "Ver todos los cambios del temario")));
  }

  function tarjetaNovedad(e) {
    if (e.tipo === "convocatoria") return tarjetaConvocatoria(e);
    var pend = e.estado === "pendiente";
    var sin = !!e.sinImpacto; // ninguna ficha cita los artículos modificados
    var otros = e.otrosTemas || [];
    var chips = sin ? otros : e.temas;
    var temas = h("div", { class: "row", style: "gap:6px" });
    if (sin && chips.length) temas.appendChild(h("span", { class: "muted", style: "font-size:.85rem" }, "Citan la norma:"));
    chips.slice(0, 12).forEach(function (n) {
      var t = AA.temas[n];
      temas.appendChild(h("a", { class: "chip", href: "#tema-" + n, title: t ? t.titulo : "" }, "Tema " + n));
    });
    if (chips.length > 12) temas.appendChild(h("span", { class: "chip" }, "+" + (chips.length - 12)));
    var detalle = [];
    if (e.modificadora && e.modificadora.id) {
      detalle.push(h("div", {}, "Modificada por ", h("a", { href: e.modificadora.url, target: "_blank", rel: "noopener noreferrer" }, e.modificadora.titulo ? recorta(e.modificadora.titulo, 110) : e.modificadora.id), e.publicacion ? " (publicada el " + AA.fecha(e.publicacion) + ")" : ""));
    }
    var arts = listaArticulos(e);
    if (arts) detalle.push(h("div", {}, h("span", { class: "muted" }, "Afecta a: "), arts));
    if (!sin && otros.length) detalle.push(h("div", { class: "muted" }, "También citan la norma, sin tocar esos artículos: " + otros.map(function (n) { return "tema " + n; }).join(", ") + "."));
    return h(
      "article",
      { class: "nov-card" + (pend ? " nov-card--pend" : "") },
      h("div", { class: "nov-head" },
        h("strong", { class: "nov-norma" }, e.norma.corto),
        h("span", { class: "pill " + (pend ? "pill--pend" : "pill--ok") }, pend ? "Pendiente de revisar" : sin ? "Sin impacto en las fichas" : "Reflejada en las fichas")),
      h("div", { class: "nov-cuando" }, cuandoRige(e)),
      h("div", { class: "muted nov-titulo" }, recorta(e.norma.titulo, 140)),
      detalle.length ? h("div", { class: "nov-detalle" }, detalle) : null,
      h("div", { class: "row-between", style: "margin-top:10px" },
        temas,
        h("a", { class: "btn btn--sm", href: e.norma.url, target: "_blank", rel: "noopener noreferrer" }, "Ver en el BOE"))
    );
  }

  V.novedades = function () {
    var N = AA.novedades;
    var pend = AA.novedadesPendientes();
    var vistas = store.novedadesVistas();
    var root = h("div");
    root.appendChild(h("div", { class: "eyebrow" }, "Vigilancia diaria del BOE"));
    root.appendChild(h("h1", { class: "page-title" }, "Novedades legislativas"));
    root.appendChild(h("p", { class: "lead" },
      "Cada día se comprueban, artículo por artículo, las " + (N.normasVigiladas || 0) + " normas del BOE en las que se basa el temario. Si alguna cambia o va a cambiar, aparece aquí y se avisa en las fichas afectadas."));
    root.appendChild(h("div", { class: "kv section" },
      h("div", {}, h("b", {}, pend.length), h("span", {}, "pendientes de revisar")),
      h("div", {}, h("b", {}, N.normasVigiladas || 0), h("span", {}, "normas vigiladas")),
      h("div", {}, h("b", {}, N.comprobacion ? AA.fecha(N.comprobacion) : "–"), h("span", {}, "última comprobación"))
    ));

    var lista = h("div", { class: "stack" });
    var filtro = { solo: pend.length > 0 };
    var barra = h("div", { class: "filters" });
    function chip(txt, valor) {
      var b = h("button", { class: "chip chipbtn", type: "button", "aria-pressed": filtro.solo === valor ? "true" : "false", onclick: function () { filtro.solo = valor; pintarLista(); barra.querySelectorAll(".chipbtn").forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.v === String(filtro.solo) ? "true" : "false"); }); } }, txt);
      b.dataset.v = String(valor);
      return b;
    }
    barra.appendChild(chip("Pendientes (" + pend.length + ")", true));
    barra.appendChild(chip("Todas (" + N.items.length + ")", false));
    root.appendChild(barra);
    root.appendChild(h("section", { class: "section" }, lista));

    function pintarLista() {
      lista.textContent = "";
      var items = N.items.filter(function (e) { return !filtro.solo || e.estado === "pendiente"; });
      items = items.slice().sort(function (a, b) {
        if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1;
        return (b.vigencia || "").localeCompare(a.vigencia || "");
      });
      if (!items.length) {
        lista.appendChild(h("div", { class: "card" },
          h("strong", {}, "Sin cambios pendientes."),
          h("p", { class: "muted", style: "margin-top:6px" }, "Las fichas coinciden con el texto vigente del BOE" + (N.comprobacion ? " a fecha de " + AA.fecha(N.comprobacion) : "") + ". Si una ley cambia, aparecerá aquí.")));
        return;
      }
      items.forEach(function (e) { lista.appendChild(tarjetaNovedad(e)); });
    }
    pintarLista();

    var sinCons = (N.sinConsolidar || []).length;
    root.appendChild(h("section", { class: "section" },
      h("details", { class: "notas-fuentes", style: "margin-top:0" },
        h("summary", {}, "Qué se vigila y qué no"),
        h("ul", {},
          h("li", {}, "Se comprueban " + (N.normasVigiladas || 0) + " normas con texto consolidado del BOE. Se detectan artículos modificados, reformas que entrarán en vigor más adelante y normas derogadas."),
          h("li", {}, sinCons + " normas citadas en las fichas no tienen texto consolidado en el BOE (tratados, convenios y normas antiguas) y no se pueden vigilar automáticamente."),
          h("li", {}, (N.otrasFuentes || 0) + " referencias de las fichas no son del BOE (Derecho de la UE, RAE, INE, DGT, guías técnicas…): no se vigilan aquí. Conviene revisarlas de vez en cuando."),
          h("li", {}, "El BOE actualiza el texto consolidado días o semanas después de publicar una reforma, así que un aviso puede llegar con retraso respecto al día de publicación."),
          h("li", {}, "Una reforma solo avisa en una ficha si cambia un artículo que esa ficha cita. Si ninguna ficha cita los artículos modificados, queda anotada como «Sin impacto en las fichas»."),
          h("li", {}, "«Pendiente de revisar» significa que la ficha todavía no se ha actualizado con el cambio. Hasta entonces, contrasta ese punto con el BOE.")))
    ));

    // Al abrir la página se consideran vistos los avisos actuales.
    store.marcarNovedadesVistas(pend.map(function (e) { return e.id; }));
    if (AA.actualizarAviso) AA.actualizarAviso();
    return root;
  };

  /* Banner en la ficha de un tema afectado por cambios legales pendientes. */
  function avisoLeyes(n) {
    var ps = AA.novedadesPendientes(n).filter(function (e) { return e.tipo !== "convocatoria"; });
    if (!ps.length) return null;
    var ul = h("ul", {}, ps.map(function (e) {
      var arts = listaArticulos(e, n);
      return h("li", { html: rich("**" + e.norma.corto + "**: " + cuandoRige(e).toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) + (arts ? ". " + arts : "") + ".") });
    }));
    return h("aside", { class: "aviso-ley", role: "note" },
      h("div", { class: "aviso-ley-t" }, h("strong", {}, "Cambios legales pendientes de revisar"), h("span", { class: "muted" }, " · esta ficha puede estar desactualizada en estos puntos")),
      ul,
      h("div", { style: "margin-top:10px" }, h("a", { class: "btn btn--sm", href: "#novedades" }, "Ver novedades legislativas"))
    );
  }

  V.noEncontrado = function () {
    return h("div", { class: "card" }, h("h1", { class: "page-title" }, "No encontrado"), h("p", { class: "lead" }, "Esa página no existe."), h("div", { style: "margin-top:14px" }, enlace("panel", "btn btn--primary", "Ir al panel")));
  };
})();
