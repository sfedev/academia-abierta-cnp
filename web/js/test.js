/* Tests (estudio / examen / simulacro) y tarjetas de repaso. */
(function () {
  var AA = window.AA;
  var h = AA.h;
  var rich = AA.rich;
  var store = AA.store;
  var LETRAS = ["A", "B", "C"];

  /* ================= Selección de preguntas ================= */
  function poolBase(o) {
    var qs = AA.preguntas;
    if (o.temas && o.temas.length) qs = qs.filter(function (q) { return o.temas.indexOf(q.tema) >= 0; });
    if (o.bloque) qs = qs.filter(function (q) { return q.bloque === o.bloque; });
    if (o.origen === "fallos") qs = qs.filter(function (q) { var r = store.regPregunta(q.id); return r && r.last === 0; });
    if (o.origen === "nuevas") qs = qs.filter(function (q) { return !store.regPregunta(q.id); });
    return qs;
  }
  function pesoP(q) {
    var r = store.regPregunta(q.id);
    if (!r) return 2; // sin ver
    return r.last === 0 ? 3 : 1; // fallada > dominada
  }
  /* Muestreo ponderado sin reemplazo (Efraimidis–Spirakis). */
  function muestra(qs, n) {
    return qs
      .map(function (q) { return { q: q, k: Math.pow(Math.random(), 1 / pesoP(q)) }; })
      .sort(function (a, b) { return b.k - a.k; })
      .slice(0, n)
      .map(function (x) { return x.q; });
  }
  /* Reparto del simulacro: preguntas por tema ∝ media de los últimos exámenes. */
  function simulacro(n) {
    var temas = AA.listaTemas.filter(function (t) {
      return t.datos && (t.datos.preguntas || []).length && t.media;
    });
    if (!temas.length) return muestra(AA.preguntas, n);
    var cap = {};
    temas.forEach(function (t) { cap[t.tema] = AA.preguntas.filter(function (q) { return q.tema === t.tema; }).length; });
    var total = temas.reduce(function (s, t) { return s + t.media; }, 0);
    var cuota = {};
    var asignadas = 0;
    var resto = [];
    temas.forEach(function (t) {
      var ideal = (n * t.media) / total;
      var base = Math.min(Math.floor(ideal), cap[t.tema]);
      cuota[t.tema] = base;
      asignadas += base;
      resto.push({ t: t.tema, frac: ideal - Math.floor(ideal) });
    });
    resto.sort(function (a, b) { return b.frac - a.frac; });
    var guard = 0;
    while (asignadas < n && guard++ < 5000) {
      var avanzo = false;
      for (var i = 0; i < resto.length && asignadas < n; i++) {
        if (cuota[resto[i].t] < cap[resto[i].t]) { cuota[resto[i].t]++; asignadas++; avanzo = true; }
      }
      if (!avanzo) break;
    }
    var out = [];
    temas.forEach(function (t) {
      var pool = AA.preguntas.filter(function (q) { return q.tema === t.tema; });
      out = out.concat(muestra(pool, cuota[t.tema]));
    });
    return AA.shuffle(out);
  }

  /* ================= Sesión de test ================= */
  var S = null; // sesión activa o terminada
  var C = null; // contenedor de la vista
  var tickEl = null;
  var timer = null;

  function nuevaSesion(cfg, preguntas) {
    clearInterval(timer);
    S = {
      cfg: cfg,
      qs: preguntas.map(function (q) { return { q: q, orden: AA.shuffle([0, 1, 2]) }; }),
      i: 0,
      resp: preguntas.map(function () { return null; }),
      marc: preguntas.map(function () { return false; }),
      rev: preguntas.map(function () { return false; }),
      inicio: Date.now(),
      fin: null,
      estado: "run",
      confirmar: false,
    };
    if (cfg.minutos) {
      timer = setInterval(tick, 1000);
    }
  }
  function restante() {
    return S.cfg.minutos ? S.cfg.minutos * 60 - (Date.now() - S.inicio) / 1000 : null;
  }
  function tick() {
    if (!S || S.estado !== "run") { clearInterval(timer); return; }
    var r = restante();
    if (tickEl && document.body.contains(tickEl)) {
      tickEl.textContent = AA.clock(r);
      tickEl.classList.toggle("low", r <= 300);
    }
    if (r <= 0) { terminar(true); }
  }

  var T = (AA.test = {});
  // Selección de preguntas: se expone para poder probarla (herramientas/tests/js).
  T.interno = { poolBase: poolBase, pesoP: pesoP, muestra: muestra, simulacro: simulacro };

  T.preparar = function (o) {
    var preguntas = [];
    var cfg = { modo: "estudio", minutos: 0, titulo: "", preset: o.preset || "" };
    if (!AA.preguntas.length) { AA.toast("Todavía no hay preguntas publicadas"); return; }
    if (o.preset === "simulacro") {
      cfg = { modo: "examen", minutos: 50, titulo: "Simulacro oficial", preset: "simulacro" };
      preguntas = simulacro(Math.min(100, AA.preguntas.length));
    } else if (o.preset === "rapido") {
      cfg.titulo = "Test rápido";
      preguntas = muestra(AA.preguntas, 20);
    } else if (o.preset === "fallos") {
      cfg.titulo = "Repaso de fallos";
      preguntas = AA.shuffle(poolBase({ origen: "fallos" })).slice(0, 30);
      if (!preguntas.length) { AA.toast("No tienes preguntas falladas pendientes"); return; }
    } else if (o.preset === "tema") {
      var t0 = AA.temas[o.temas[0]];
      cfg.titulo = "Tema " + t0.tema + ": " + t0.titulo;
      preguntas = AA.shuffle(poolBase({ temas: o.temas }));
    } else {
      cfg.modo = o.modo || "estudio";
      cfg.titulo = o.titulo || "Test personalizado";
      var base = poolBase(o);
      var n = Math.min(o.n || 20, base.length);
      preguntas = muestra(base, n);
      if (cfg.modo === "examen" && o.cronometro) cfg.minutos = Math.max(1, Math.round(n / 2));
    }
    if (!preguntas.length) { AA.toast("No hay preguntas para esa selección"); return; }
    nuevaSesion(cfg, preguntas);
    AA.go("test");
  };

  function elegir(pos, original) {
    if (!S || S.estado !== "run") return;
    var cfg = S.cfg;
    if (cfg.modo === "estudio") {
      if (S.rev[pos]) return;
      S.resp[pos] = original;
      S.rev[pos] = true;
      var q = S.qs[pos].q;
      store.responder(q.id, original === q.ok);
      store.commit();
    } else {
      S.resp[pos] = S.resp[pos] === original ? null : original; // pulsar de nuevo = dejar en blanco
    }
    pintar();
  }

  function irA(pos) {
    S.i = Math.max(0, Math.min(S.qs.length - 1, pos));
    S.confirmar = false;
    pintar();
    window.scrollTo({ top: 0 });
  }

  function resultados() {
    var A = 0, E = 0, B = 0;
    var porBloque = { A: { n: 0, a: 0, e: 0 }, B: { n: 0, a: 0, e: 0 }, C: { n: 0, a: 0, e: 0 } };
    var porTema = {};
    S.qs.forEach(function (x, i) {
      var q = x.q;
      var r = S.resp[i];
      var pb = porBloque[q.bloque];
      var pt = porTema[q.tema] || (porTema[q.tema] = { n: 0, a: 0, e: 0 });
      pb.n++; pt.n++;
      if (r == null) B++;
      else if (r === q.ok) { A++; pb.a++; pt.a++; }
      else { E++; pb.e++; pt.e++; }
    });
    var N = S.qs.length;
    var bruta = AA.notaTest(A, E, N);
    return { A: A, E: E, B: B, N: N, nota: Math.max(0, bruta), bruta: bruta, porBloque: porBloque, porTema: porTema };
  }

  function terminar(porTiempo) {
    if (!S || S.estado !== "run") return;
    S.estado = "fin";
    S.fin = Date.now();
    S.porTiempo = !!porTiempo;
    clearInterval(timer);
    if (S.cfg.modo === "examen") {
      S.qs.forEach(function (x, i) {
        if (S.resp[i] != null) store.responder(x.q.id, S.resp[i] === x.q.ok);
      });
    }
    var r = resultados();
    S.res = r;
    if (r.N >= 20) {
      store.guardarSimulacro({
        ts: S.fin, n: r.N, a: r.A, e: r.E, b: r.B, nota: Math.round(r.nota * 100) / 100,
        seg: Math.round((S.fin - S.inicio) / 1000), modo: S.cfg.modo, titulo: S.cfg.titulo,
        bloques: r.porBloque,
      });
    } else {
      store.commit();
    }
    pintar();
    window.scrollTo({ top: 0 });
  }

  /* ---------- Pantallas ---------- */
  var cfgForm = { modo: "estudio", origen: "todo", bloque: "", n: 20, cronometro: false, temas: [] };

  T.vista = function () {
    C = h("div", { class: "testbox" });
    pintar();
    return C;
  };

  function pintar() {
    if (!C) return;
    C.textContent = "";
    tickEl = null;
    if (!S) return pantallaInicio();
    if (S.estado === "fin") return pantallaResultados();
    pantallaPregunta();
  }

  function pantallaInicio() {
    var banco = AA.preguntas.length;
    C.appendChild(h("div", { class: "eyebrow" }, AA.plural(banco, "pregunta original", "preguntas originales") + " en el banco"));
    C.appendChild(h("h1", { class: "page-title" }, "Tests"));
    C.appendChild(h("p", { class: "lead" }, "Tres respuestas posibles, una correcta, y cada error resta la mitad de un acierto, como en el examen. Las opciones se barajan cada vez."));

    var fallos = store.fallosPendientes().length;
    var presets = h("div", { class: "preset section" },
      cardPreset("Simulacro oficial", "100 preguntas, 50 minutos, corrección por fórmula oficial. Reparto por temas según los últimos exámenes.", "Empezar simulacro", function () { T.preparar({ preset: "simulacro" }); }, true),
      cardPreset("Test rápido", "20 preguntas con feedback inmediato, priorizando lo nuevo y lo fallado.", "Empezar", function () { T.preparar({ preset: "rapido" }); }),
      cardPreset("Mis fallos", fallos ? AA.plural(fallos, "pregunta pendiente", "preguntas pendientes") + "." : "Cuando falles preguntas, podrás repasarlas aquí.", "Repasar fallos", function () { T.preparar({ preset: "fallos" }); }, false, !fallos)
    );
    C.appendChild(presets);

    // Test a medida
    var f = cfgForm;
    var form = h("form", { class: "card setup section", onsubmit: function (e) { e.preventDefault(); lanzar(); } });
    form.appendChild(h("h2", { class: "sec-title" }, "Test a medida"));

    function radios(nombre, opciones, valor, onchange) {
      var fs = h("div", { class: "row", style: "gap:6px" });
      opciones.forEach(function (o, i) {
        var id = "r-" + nombre + "-" + i;
        var inp = h("input", { type: "radio", name: nombre, id: id, value: o[0], class: "sr" });
        if (String(valor) === String(o[0])) inp.checked = true;
        inp.addEventListener("change", function () { onchange(o[0]); pintar(); });
        var lab = h("label", { for: id, class: "chip chipbtn", style: "cursor:pointer;padding:6px 12px;font-size:.88rem" }, o[1]);
        if (String(valor) === String(o[0])) { lab.style.background = "var(--accent)"; lab.style.color = "var(--accent-ink)"; lab.style.borderColor = "var(--accent)"; }
        fs.appendChild(inp);
        fs.appendChild(lab);
      });
      return fs;
    }
    form.appendChild(h("fieldset", {}, h("legend", {}, "Modo"), radios("modo", [["estudio", "Estudio (corrige al momento)"], ["examen", "Examen (corrige al final)"]], f.modo, function (v) { f.modo = v; })));
    form.appendChild(h("fieldset", {}, h("legend", {}, "Qué preguntas"), radios("origen", [["todo", "Todo el temario"], ["bloque", "Un bloque"], ["temas", "Temas concretos"], ["fallos", "Mis fallos"], ["nuevas", "Sin ver"]], f.origen, function (v) { f.origen = v; })));
    if (f.origen === "bloque") {
      form.appendChild(h("fieldset", {}, h("legend", {}, "Bloque"), radios("bloque", [["A", "A · Jurídicas"], ["B", "B · Sociales"], ["C", "C · Técnico-científicas"]], f.bloque || "A", function (v) { f.bloque = v; })));
      if (!f.bloque) f.bloque = "A";
    }
    if (f.origen === "temas") {
      var pick = h("div", { class: "temapick", role: "group", "aria-label": "Temas" });
      AA.listaTemas.forEach(function (t) {
        if (!t.datos) return;
        var id = "tp-" + t.tema;
        var cb = h("input", { type: "checkbox", id: id });
        cb.checked = f.temas.indexOf(t.tema) >= 0;
        cb.addEventListener("change", function () {
          var i = f.temas.indexOf(t.tema);
          if (cb.checked && i < 0) f.temas.push(t.tema);
          if (!cb.checked && i >= 0) f.temas.splice(i, 1);
        });
        pick.appendChild(h("label", { for: id }, cb, h("span", {}, h("b", { class: "mono" }, t.tema + ". "), t.titulo)));
      });
      form.appendChild(h("fieldset", {}, h("legend", {}, "Temas"), pick));
    }
    form.appendChild(h("fieldset", {}, h("legend", {}, "Número de preguntas"), radios("n", [[10, "10"], [20, "20"], [40, "40"], [60, "60"], [100, "100"]], f.n, function (v) { f.n = Number(v); })));
    if (f.modo === "examen") {
      var cb2 = h("input", { type: "checkbox", id: "crono" });
      cb2.checked = f.cronometro;
      cb2.addEventListener("change", function () { f.cronometro = cb2.checked; });
      form.appendChild(h("label", { class: "opt-line", for: "crono" }, cb2, "Con cronómetro (30 segundos por pregunta, como en el examen real)"));
    }
    form.appendChild(h("button", { class: "btn btn--primary", type: "submit" }, "Empezar test"));
    C.appendChild(form);

    function lanzar() {
      var o = { modo: f.modo, n: f.n, cronometro: f.cronometro, titulo: "Test personalizado" };
      if (f.origen === "bloque") { o.bloque = f.bloque || "A"; o.titulo = "Bloque " + o.bloque; }
      if (f.origen === "temas") {
        if (!f.temas.length) { AA.toast("Elige al menos un tema"); return; }
        o.temas = f.temas.slice();
        o.titulo = "Temas " + f.temas.slice().sort(function (a, b) { return a - b; }).join(", ");
      }
      if (f.origen === "fallos") { o.origen = "fallos"; o.titulo = "Mis fallos"; }
      if (f.origen === "nuevas") { o.origen = "nuevas"; o.titulo = "Preguntas sin ver"; }
      T.preparar(o);
    }
  }

  function cardPreset(titulo, texto, boton, fn, primario, off) {
    return h("div", { class: "card" }, h("h3", {}, titulo), h("p", {}, texto), h("div", {}, h("button", { class: "btn btn--sm" + (primario ? " btn--primary" : ""), onclick: fn, disabled: off ? true : null }, boton)));
  }

  function pantallaPregunta() {
    var x = S.qs[S.i];
    var q = x.q;
    var estudio = S.cfg.modo === "estudio";
    var revelada = estudio && S.rev[S.i];
    var N = S.qs.length;

    var cab = h("div", { class: "qhead" },
      h("div", {}, h("div", { class: "eyebrow" }, S.cfg.titulo), h("div", { class: "num", style: "font-weight:600" }, "Pregunta " + (S.i + 1) + " de " + N)),
      h("div", { class: "row" },
        S.cfg.minutos ? (tickEl = h("span", { class: "timer num" }, AA.clock(restante()))) : null,
        h("span", { class: "chip" }, "Tema " + q.tema)
      )
    );
    C.appendChild(cab);
    if (tickEl) tickEl.classList.toggle("low", restante() <= 300);

    C.appendChild(h("p", { class: "qtext", html: rich(q.q) }));
    var opts = h("div", { class: "opts", role: "group", "aria-label": "Opciones" });
    x.orden.forEach(function (orig, k) {
      var cls = "opt";
      var seleccionada = S.resp[S.i] === orig;
      if (revelada) {
        if (orig === q.ok) cls += " ok";
        else if (seleccionada) cls += " ko";
      }
      var b = h("button", { type: "button", class: cls, "aria-pressed": seleccionada ? "true" : "false", disabled: revelada ? true : null, onclick: function () { elegir(S.i, orig); } },
        h("span", { class: "l" }, LETRAS[k]),
        h("span", { html: rich(q.ops[orig]) })
      );
      opts.appendChild(b);
    });
    C.appendChild(opts);

    if (revelada) {
      var acierto = S.resp[S.i] === q.ok;
      C.appendChild(h("div", { class: "explica" },
        h("strong", { class: acierto ? "ok-t" : "ko-t", style: "color:" + (acierto ? "var(--ok)" : "var(--ko)") }, acierto ? "Correcto. " : "Incorrecto. "),
        h("span", { html: rich(q.exp) }),
        q.ref ? h("span", { class: "ref" }, q.ref) : null
      ));
    }

    var nav = h("div", { class: "qnav" });
    nav.appendChild(h("button", { class: "btn", disabled: S.i === 0 ? true : null, onclick: function () { irA(S.i - 1); } }, "← Anterior"));
    var centro = h("div", { class: "row" });
    if (!estudio) {
      centro.appendChild(h("button", { class: "btn btn--ghost", "aria-pressed": S.marc[S.i] ? "true" : "false", onclick: function () { S.marc[S.i] = !S.marc[S.i]; pintar(); } }, S.marc[S.i] ? "⚑ Marcada" : "⚐ Marcar duda"));
    }
    nav.appendChild(centro);
    if (S.i < N - 1) {
      nav.appendChild(h("button", { class: "btn" + (revelada ? " btn--primary" : ""), onclick: function () { irA(S.i + 1); } }, estudio && !revelada ? "Saltar →" : "Siguiente →"));
    } else {
      nav.appendChild(h("button", { class: "btn btn--primary", onclick: function () { S.confirmar = true; pintar(); } }, "Terminar"));
    }
    C.appendChild(nav);

    // Hoja de respuestas
    var pal = h("div", { class: "palette", role: "group", "aria-label": "Hoja de respuestas" });
    S.qs.forEach(function (_, i) {
      var cls = "";
      if (S.resp[i] != null) cls += estudio ? (S.resp[i] === S.qs[i].q.ok ? " ok" : " ko") : " done";
      if (S.marc[i]) cls += " flag";
      if (i === S.i) cls += " cur";
      pal.appendChild(h("button", { type: "button", class: cls.trim(), "aria-label": "Ir a la pregunta " + (i + 1), onclick: function () { irA(i); } }, i + 1));
    });
    C.appendChild(pal);

    if (S.confirmar) {
      var sin = S.resp.filter(function (r) { return r == null; }).length;
      C.appendChild(h("div", { class: "card section", style: "border-color:var(--accent)" },
        h("strong", {}, sin ? "Tienes " + sin + " preguntas sin responder." : "Has respondido todas las preguntas."),
        h("p", { class: "muted", style: "margin:6px 0 12px" }, "Las que dejes en blanco no restan. ¿Terminar y ver la corrección?"),
        h("div", { class: "row" },
          h("button", { class: "btn btn--primary", onclick: function () { terminar(false); } }, "Terminar test"),
          h("button", { class: "btn", onclick: function () { S.confirmar = false; pintar(); } }, "Seguir revisando"))
      ));
    } else if (estudio || N > 1) {
      C.appendChild(h("div", { class: "row", style: "margin-top:18px" },
        h("button", { class: "btn btn--sm btn--ghost", onclick: function () { S.confirmar = true; pintar(); } }, "Terminar ahora"),
        h("button", { class: "btn btn--sm btn--ghost", onclick: function () { clearInterval(timer); S = null; pintar(); } }, "Abandonar")
      ));
    }
  }

  function pantallaResultados() {
    var r = S.res;
    var seg = Math.round((S.fin - S.inicio) / 1000);
    var pasa = r.nota >= 5;
    C.appendChild(h("div", { class: "eyebrow" }, S.cfg.titulo + (S.porTiempo ? " · tiempo agotado" : "")));
    C.appendChild(h("h1", { class: "page-title" }, "Resultado"));
    C.appendChild(h("div", { class: "section row", style: "gap:28px;align-items:flex-end" },
      h("div", { class: "score" }, AA.fmt1(r.nota), h("small", {}, " / 10")),
      h("div", {},
        h("div", { class: "num" }, h("strong", { style: "color:var(--ok)" }, r.A), " aciertos · ", h("strong", { style: "color:var(--ko)" }, r.E), " errores · ", h("strong", {}, r.B), " en blanco"),
        h("div", { class: "muted", style: "font-size:.9rem" }, "Tiempo: " + AA.clock(seg) + " · Fórmula: (aciertos − errores/2) × 10 / " + r.N)
      )
    ));
    var msg = r.bruta < 0 ? "El resultado bruto es negativo: se contabiliza como 0. Responde solo cuando puedas descartar al menos una opción." :
      r.nota < 3 ? "Por debajo de 3 puntos no se pasa a la siguiente prueba. Sigue con los temas de más peso." :
      "Con 3 puntos se supera el mínimo, pero para entrar entre los primeros hace falta mucho más: las notas de corte recientes rondan el 6-7,7 (orientativas).";
    C.appendChild(h("div", { class: "notice section" }, msg));

    // Por bloque
    var tb = h("table", { class: "mini" }, h("thead", {}, h("tr", {}, h("th", {}, "Bloque"), h("th", { class: "r" }, "Aciertos"), h("th", { class: "r" }, "Errores"), h("th", { class: "r" }, "% acierto"))));
    var tbody = h("tbody");
    ["A", "B", "C"].forEach(function (b) {
      var p = r.porBloque[b];
      if (!p.n) return;
      tbody.appendChild(h("tr", {}, h("td", {}, AA.BLOQUE_NOMBRE[b]), h("td", { class: "r" }, p.a + "/" + p.n), h("td", { class: "r" }, p.e), h("td", { class: "r" }, AA.pct(p.a, p.n) + " %")));
    });
    tb.appendChild(tbody);

    // Temas a reforzar
    var temas = Object.keys(r.porTema).map(function (k) { return { t: Number(k), d: r.porTema[k] }; })
      .filter(function (x) { return x.d.e > 0 || x.d.a < x.d.n; })
      .sort(function (a, b) { return (b.d.e - a.d.e) || (a.d.a / a.d.n - b.d.a / b.d.n); }).slice(0, 8);
    var refuerzo = h("div", { class: "stack" });
    if (!temas.length) refuerzo.appendChild(h("p", { class: "muted" }, "Sin errores que reforzar. Buen trabajo."));
    temas.forEach(function (x) {
      refuerzo.appendChild(h("a", { href: "#tema-" + x.t, style: "display:flex;justify-content:space-between;gap:10px;text-decoration:none;color:inherit" },
        h("span", {}, h("b", { class: "mono" }, x.t + ". "), AA.temas[x.t].titulo),
        h("span", { class: "num muted" }, x.d.e + " fallo" + (x.d.e === 1 ? "" : "s"))));
    });
    C.appendChild(h("div", { class: "section grid" },
      h("div", { class: "card" }, h("h2", { class: "sec-title" }, "Por bloque"), tb),
      h("div", { class: "card" }, h("h2", { class: "sec-title" }, "Temas para reforzar"), refuerzo)
    ));

    // Acciones
    var falladas = S.qs.filter(function (x, i) { return S.resp[i] != null && S.resp[i] !== x.q.ok; }).map(function (x) { return x.q; });
    C.appendChild(h("div", { class: "section row" },
      falladas.length ? h("button", { class: "btn btn--primary", onclick: function () {
        nuevaSesion({ modo: "estudio", minutos: 0, titulo: "Repaso de los fallos del test", preset: "" }, AA.shuffle(falladas));
        pintar();
      } }, "Repasar los " + falladas.length + " fallos") : null,
      h("button", { class: "btn", onclick: function () { S = null; pintar(); } }, "Nuevo test"),
      AA.ui.enlace("panel", "btn btn--ghost", "Volver al panel")
    ));

    // Corrección
    var rev = h("div", { class: "rev section" }, h("h2", { class: "sec-title" }, "Corrección pregunta a pregunta"));
    S.qs.forEach(function (x, i) {
      var q = x.q;
      var rsp = S.resp[i];
      var estado = rsp == null ? ["–", "bl-t", "En blanco"] : rsp === q.ok ? ["✓", "ok-t", "Acierto"] : ["✗", "ko-t", "Error"];
      var d = h("details", {},
        h("summary", {}, h("span", { class: "s " + estado[1] }, estado[0]), h("span", { html: rich(q.q) }), h("span", { class: "muted num", style: "font-size:.8rem" }, "T" + q.tema)),
        h("div", { class: "body" },
          h("div", { class: "opts" }, x.orden.map(function (orig, k) {
            var cls = "opt" + (orig === q.ok ? " ok" : orig === rsp ? " ko" : "");
            return h("div", { class: cls }, h("span", { class: "l" }, LETRAS[k]), h("span", { html: rich(q.ops[orig]) }));
          })),
          h("div", { class: "explica" }, h("span", { html: rich(q.exp) }), q.ref ? h("span", { class: "ref" }, q.ref) : null)
        )
      );
      rev.appendChild(d);
    });
    C.appendChild(rev);
  }

  document.addEventListener("keydown", function (e) {
    if (!S || S.estado !== "run" || location.hash !== "#test") return;
    var tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    var k = e.key.toLowerCase();
    var pos = k === "a" || k === "1" ? 0 : k === "b" || k === "2" ? 1 : k === "c" || k === "3" ? 2 : -1;
    if (pos >= 0) { elegir(S.i, S.qs[S.i].orden[pos]); e.preventDefault(); }
    else if (k === "arrowright" || k === "enter") { if (S.i < S.qs.length - 1) irA(S.i + 1); }
    else if (k === "arrowleft") { if (S.i > 0) irA(S.i - 1); }
  });

  /* ================= Tarjetas ================= */
  var F = null; // {cola, i, mostrar, vistas, bien, total, titulo}
  var CT = null;
  var U = (AA.tarjetasUI = {});

  function construirCola(o) {
    var pend = store.pendientesTarjetas(o.temas && o.temas.length ? o.temas : null);
    var titulo = "Pendientes de hoy";
    if (!pend.length) {
      pend = AA.tarjetas.filter(function (c) { return !o.temas || !o.temas.length || o.temas.indexOf(c.tema) >= 0; });
      titulo = "Repaso libre";
    }
    if (o.temas && o.temas.length === 1) titulo += " · tema " + o.temas[0];
    if (o.bloque) {
      pend = pend.filter(function (c) { return c.bloque === o.bloque; });
      titulo += " · bloque " + o.bloque;
    }
    return { cola: AA.shuffle(pend).slice(0, o.max || 20), titulo: titulo };
  }

  U.preparar = function (o) {
    if (!AA.tarjetas.length) { AA.toast("Todavía no hay tarjetas publicadas"); return; }
    var c = construirCola(o || {});
    if (!c.cola.length) { AA.toast("No hay tarjetas para esa selección"); return; }
    F = { cola: c.cola, i: 0, mostrar: false, vistas: 0, bien: 0, total: c.cola.length, titulo: c.titulo, reintentadas: {} };
    AA.go("tarjetas");
  };

  U.vista = function () {
    CT = h("div", { class: "flash" });
    pintarT();
    return CT;
  };

  function pintarT() {
    if (!CT) return;
    CT.textContent = "";
    if (!F) return inicioT();
    if (F.i >= F.cola.length) return finT();
    var c = F.cola[F.i];
    CT.appendChild(h("div", { class: "qhead" },
      h("div", {}, h("div", { class: "eyebrow" }, F.titulo), h("div", { class: "num", style: "font-weight:600" }, "Tarjeta " + (F.i + 1) + " de " + F.cola.length)),
      h("span", { class: "chip" }, "Tema " + c.tema)
    ));
    var carta = h("button", { class: "flash-card", type: "button", "aria-label": F.mostrar ? "Respuesta visible" : "Mostrar respuesta", onclick: function () { F.mostrar = true; pintarT(); } },
      h("span", { class: "side" }, "Pregunta"),
      h("span", { html: rich(c.p) }),
      F.mostrar ? h("span", { class: "ans" }, h("span", { class: "side", style: "display:block;margin-bottom:6px" }, "Respuesta"), h("span", { html: rich(c.r) })) : h("span", { class: "muted", style: "font-family:var(--font-ui);font-size:.9rem;margin-top:10px" }, "Toca la tarjeta o pulsa espacio para ver la respuesta")
    );
    CT.appendChild(carta);
    if (F.mostrar) {
      CT.appendChild(h("div", { class: "rate" },
        h("button", { class: "btn", onclick: function () { calificar(0); } }, "Otra vez"),
        h("button", { class: "btn", onclick: function () { calificar(1); } }, "Dudosa"),
        h("button", { class: "btn btn--primary", onclick: function () { calificar(2); } }, "La sabía")
      ));
    }
    CT.appendChild(h("div", { class: "row", style: "margin-top:16px" }, h("button", { class: "btn btn--sm btn--ghost", onclick: function () { F = null; pintarT(); } }, "Salir de la sesión")));
  }

  function calificar(nivel) {
    var c = F.cola[F.i];
    store.calificarTarjeta(c.id, nivel);
    F.vistas++;
    if (nivel === 2) F.bien++;
    if (nivel === 0 && !F.reintentadas[c.id]) { F.reintentadas[c.id] = true; F.cola.push(c); }
    F.i++;
    F.mostrar = false;
    pintarT();
    window.scrollTo({ top: 0 });
  }

  function inicioT() {
    var pend = store.pendientesTarjetas().length;
    CT.appendChild(h("div", { class: "eyebrow" }, AA.tarjetas.length + " tarjetas · " + store.tarjetasVistas() + " vistas · " + store.tarjetasDominadas() + " dominadas"));
    CT.appendChild(h("h1", { class: "page-title" }, "Tarjetas de repaso"));
    CT.appendChild(h("p", { class: "lead" }, "Cada tarjeta pregunta un dato que se pregunta de verdad. Si la sabes, vuelve más tarde (1, 3, 7, 16, 35 días); si no, vuelve antes."));
    var card = h("div", { class: "card section stack" },
      h("div", {}, h("strong", {}, AA.plural(pend, "pendiente", "pendientes") + " hoy"), h("div", { class: "muted", style: "font-size:.9rem" }, "Incluye las nuevas y las que toca repasar.")),
      h("div", { class: "row" },
        h("button", { class: "btn btn--primary", onclick: function () { U.preparar({}); } }, "Empezar sesión (20)"),
        ["A", "B", "C"].map(function (b) { return h("button", { class: "btn", onclick: function () { U.preparar({ bloque: b }); } }, "Solo bloque " + b); })
      ),
      h("div", { class: "muted", style: "font-size:.88rem" }, "También puedes abrir las tarjetas de un tema concreto desde su ficha.")
    );
    CT.appendChild(card);
  }

  function finT() {
    CT.appendChild(h("div", { class: "eyebrow" }, F.titulo));
    CT.appendChild(h("h1", { class: "page-title" }, "Sesión terminada"));
    CT.appendChild(h("p", { class: "lead" }, "Has repasado " + F.vistas + " tarjetas y marcado " + F.bien + " como sabidas."));
    CT.appendChild(h("div", { class: "section row" },
      h("button", { class: "btn btn--primary", onclick: function () { F = null; U.preparar({}); } }, "Otra sesión"),
      AA.ui.enlace("panel", "btn", "Volver al panel")
    ));
  }

  document.addEventListener("keydown", function (e) {
    if (!F || location.hash !== "#tarjetas" || F.i >= F.cola.length) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === " " && !F.mostrar) { F.mostrar = true; pintarT(); e.preventDefault(); }
    else if (F.mostrar && (e.key === "1" || e.key === "2" || e.key === "3")) { calificar(Number(e.key) - 1); }
  });
})();
