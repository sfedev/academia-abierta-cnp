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
  /* Mezcla de dificultad del simulacro (fracción de preguntas fáciles, medias y difíciles).
     «real»: la de los exámenes analizados por las academias (P40: 27/37/36 %, P41: 74/23/3 %; media aproximada
     50/30/20). «exigente»: más difícil, para entrenar por encima de las notas de corte recientes. */
  var MEZCLAS = { real: { 1: 0.5, 2: 0.3, 3: 0.2 }, exigente: { 1: 0.3, 2: 0.4, 3: 0.3 } };
  var OBJETIVO = 7.5; // por encima de las notas de corte recientes (7,05-7,72, orientativas)
  function composicion(qs) {
    var c = { 1: 0, 2: 0, 3: 0 };
    qs.forEach(function (q) { c[q.dif || 2] = (c[q.dif || 2] || 0) + 1; });
    var n = qs.length || 1;
    return { 1: c[1] / n, 2: c[2] / n, 3: c[3] / n };
  }
  /* Como `muestra`, pero corrige el peso de cada pregunta para acercar la mezcla de dificultad a `mezcla`. */
  function muestraMezcla(qs, n, factor) {
    return qs
      .map(function (q) { return { q: q, k: Math.pow(Math.random(), 1 / (pesoP(q) * (factor[q.dif || 2] || 1))) }; })
      .sort(function (a, b) { return b.k - a.k; })
      .slice(0, n)
      .map(function (x) { return x.q; });
  }
  /* Reparto del simulacro: preguntas por tema ∝ media de los últimos exámenes y, si se indica, mezcla de dificultad. */
  function simulacro(n, mezcla) {
    var factor = null;
    if (mezcla) {
      var banco = composicion(AA.preguntas);
      factor = {};
      [1, 2, 3].forEach(function (d) { factor[d] = mezcla[d] / Math.max(banco[d], 0.01); });
    }
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
      out = out.concat(factor ? muestraMezcla(pool, cuota[t.tema], factor) : muestra(pool, cuota[t.tema]));
    });
    return AA.shuffle(out);
  }

  /* ================= Sesión de test ================= */
  var S = null; // sesión activa o terminada
  var C = null; // contenedor de la vista
  var tickEl = null;
  var barEl = null; // barra del reloj por pregunta (velocidad)
  var timer = null;
  /* Entrenamiento de velocidad: 30 segundos por pregunta, el ritmo del examen real (100 preguntas en 50 minutos). */
  var SEG_PREGUNTA = 30;
  var TAMANOS_VELOCIDAD = [10, 15];
  var GRACIA_MS = 300; // al mostrar una pregunta, margen en el que no se aceptan respuestas

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
    if (cfg.velocidad) {
      S.agotada = preguntas.map(function () { return false; }); // en blanco porque se acabó su tiempo
      S.tiempos = preguntas.map(function () { return null; }); // segundos dedicados a cada pregunta
      S.qInicio = S.inicio;
      timer = setInterval(tick, 250);
    } else if (cfg.minutos) {
      timer = setInterval(tick, 1000);
    }
  }
  function restante() {
    return S.cfg.minutos ? S.cfg.minutos * 60 - (Date.now() - S.inicio) / 1000 : null;
  }
  function restantePregunta() {
    return S.cfg.segPregunta - (Date.now() - S.qInicio) / 1000;
  }
  /* Velocidad: cierra la pregunta actual (en blanco por tiempo si se agotó sin respuesta) y pasa a la siguiente con
     su reloj a cero; tras la última, termina. No se puede volver atrás. */
  function avanzarVelocidad(porTiempo) {
    if (!S || S.estado !== "run" || !S.cfg.velocidad) return;
    var ahora = Date.now();
    S.tiempos[S.i] = Math.min(S.cfg.segPregunta, (ahora - S.qInicio) / 1000);
    if (porTiempo && S.resp[S.i] == null) S.agotada[S.i] = true;
    if (S.i >= S.qs.length - 1) { terminar(false); return; }
    S.i++;
    S.qInicio = ahora;
    pintar();
    window.scrollTo({ top: 0 });
  }
  function pintarReloj(r) {
    var seg = Math.max(0, r);
    tickEl.textContent = AA.clock(Math.ceil(seg));
    barEl.style.width = (100 * seg) / S.cfg.segPregunta + "%";
    tickEl.parentNode.classList.toggle("low", seg <= 10);
    tickEl.parentNode.classList.toggle("critico", seg <= 5);
  }
  /* Velocidad: si se sale de Tests a mitad, el reloj se para con el tiempo que le quedaba a la pregunta (no avanza
     solo ni mueve la página que se esté leyendo) y sigue al volver. */
  function pausarVelocidad() {
    S.pausa = Math.max(0, restantePregunta());
    clearInterval(timer);
  }
  function reanudarVelocidad() {
    if (S.pausa == null) return;
    S.qInicio = Date.now() - (S.cfg.segPregunta - S.pausa) * 1000;
    S.pausa = null;
    clearInterval(timer);
    timer = setInterval(tick, 250);
  }
  function tick() {
    if (!S || S.estado !== "run") { clearInterval(timer); return; }
    if (S.cfg.velocidad) {
      if (S.pausa != null) return;
      if (C && !document.body.contains(C)) { pausarVelocidad(); return; }
      var rp = restantePregunta();
      if (rp <= 0) avanzarVelocidad(true);
      else if (tickEl && barEl && document.body.contains(tickEl)) pintarReloj(rp);
      return;
    }
    var r = restante();
    if (tickEl && document.body.contains(tickEl)) {
      tickEl.textContent = AA.clock(r);
      tickEl.classList.toggle("low", r <= 300);
    }
    if (r <= 0) { terminar(true); }
  }

  var T = (AA.test = {});
  // Selección de preguntas: se expone para poder probarla (herramientas/tests/js).
  T.interno = { poolBase: poolBase, pesoP: pesoP, muestra: muestra, simulacro: simulacro, composicion: composicion, MEZCLAS: MEZCLAS, OBJETIVO: OBJETIVO,
                sesion: function () { return S; }, tick: tick, elegir: function (pos, original) { elegir(pos, original); },
                saltar: function () { avanzarVelocidad(false); }, pausar: pausarVelocidad, reanudar: reanudarVelocidad,
                SEG_PREGUNTA: SEG_PREGUNTA, TAMANOS_VELOCIDAD: TAMANOS_VELOCIDAD, GRACIA_MS: GRACIA_MS };

  /* Portada de Tests (presets y cuaderno de errores): descarta la corrección de un test ya terminado, no uno en curso. */
  T.inicio = function () {
    if (S && S.estado === "fin") S = null;
    AA.go("test");
  };

  T.preparar = function (o) {
    var preguntas = [];
    var cfg = { modo: "estudio", minutos: 0, titulo: "", preset: o.preset || "" };
    if (!AA.preguntas.length) { AA.toast("Todavía no hay preguntas publicadas"); return; }
    if (o.preset === "simulacro" || o.preset === "exigente") {
      var exigente = o.preset === "exigente";
      cfg = { modo: "examen", minutos: 50, titulo: exigente ? "Simulacro exigente" : "Simulacro oficial", preset: o.preset,
              mezcla: exigente ? "exigente" : "real", objetivo: OBJETIVO };
      preguntas = simulacro(Math.min(100, AA.preguntas.length), MEZCLAS[cfg.mezcla]);
    } else if (o.preset === "rapido") {
      cfg.titulo = "Test rápido";
      preguntas = muestra(AA.preguntas, 20);
    } else if (o.preset === "fallos") {
      cfg.titulo = "Repaso de fallos";
      preguntas = AA.shuffle(poolBase({ origen: "fallos" })).slice(0, 30);
      if (!preguntas.length) { AA.toast("No tienes preguntas falladas pendientes"); return; }
    } else if (o.preset === "repaso") {
      // Modo Repaso Intensivo: los 20 fallos de más prioridad (con motivo despiste, plazo o concepto primero)
      cfg.titulo = "Repaso intensivo: fallos prioritarios";
      preguntas = AA.shuffle(AA.repaso.fallos().slice(0, 20).map(function (x) { return x.q; }));
      if (!preguntas.length) { AA.toast("No tienes preguntas falladas pendientes"); return; }
    } else if (o.preset === "velocidad") {
      var nv = TAMANOS_VELOCIDAD.indexOf(o.n) >= 0 ? o.n : TAMANOS_VELOCIDAD[0];
      preguntas = AA.shuffle(AA.preguntas).slice(0, nv);
      cfg = { modo: "examen", minutos: 0, velocidad: true, segPregunta: SEG_PREGUNTA, preset: "velocidad",
              titulo: "Velocidad · " + preguntas.length + " preguntas" };
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

  /* Examen oficial importado (web/js/oficiales.js): mismas reglas que el real, sin las preguntas anuladas. */
  T.prepararOficial = function (examen, modo, preguntas) {
    if (!preguntas || !preguntas.length) { AA.toast("Ese examen no tiene preguntas válidas"); return; }
    var cfg = { modo: modo || "examen", minutos: modo === "estudio" ? 0 : Math.max(1, Math.round(preguntas.length / 2)),
                titulo: "Examen oficial · " + (examen.titulo || examen.codigo), preset: "oficial", oficial: examen.codigo,
                objetivo: (AA.oficiales && AA.oficiales.corteDe(examen.codigo)) || OBJETIVO };
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
    } else if (cfg.velocidad) {
      if (pos !== S.i || S.pausa != null) return;
      if (restantePregunta() <= 0) { avanzarVelocidad(true); return; } // fuera de tiempo (p. ej. pestaña en segundo plano)
      if (Date.now() - S.qInicio < GRACIA_MS) return; // el segundo clic de un doble clic no responde la siguiente
      S.resp[pos] = original; // responder pasa a la siguiente: no hay vuelta atrás
      avanzarVelocidad(false);
      return;
    } else {
      S.resp[pos] = S.resp[pos] === original ? null : original; // pulsar de nuevo = dejar en blanco
    }
    pintar();
  }

  function irA(pos) {
    if (S.cfg.velocidad) return;
    S.i = Math.max(0, Math.min(S.qs.length - 1, pos));
    S.confirmar = false;
    pintar();
    window.scrollTo({ top: 0 });
  }

  function resultados() {
    var A = 0, E = 0, B = 0;
    var porBloque = { A: { n: 0, a: 0, e: 0 }, B: { n: 0, a: 0, e: 0 }, C: { n: 0, a: 0, e: 0 } };
    var porTema = {};
    var porDif = { 1: { n: 0, a: 0, e: 0 }, 2: { n: 0, a: 0, e: 0 }, 3: { n: 0, a: 0, e: 0 } };
    S.qs.forEach(function (x, i) {
      var q = x.q;
      var r = S.resp[i];
      // las preguntas de examen oficial pueden no tener tema/bloque estimado
      var pb = porBloque[q.bloque] || (porBloque[q.bloque || "sin"] = porBloque[q.bloque || "sin"] || { n: 0, a: 0, e: 0 });
      var pt = porTema[q.tema || 0] || (porTema[q.tema || 0] = { n: 0, a: 0, e: 0 });
      var pd = q.oficial ? null : porDif[q.dif || 2];
      pb.n++; pt.n++; if (pd) pd.n++;
      if (r == null) B++;
      else if (r === q.ok) { A++; pb.a++; pt.a++; if (pd) pd.a++; }
      else { E++; pb.e++; pt.e++; if (pd) pd.e++; }
    });
    var N = S.qs.length;
    var bruta = AA.notaTest(A, E, N);
    var res = { A: A, E: E, B: B, N: N, nota: Math.max(0, bruta), bruta: bruta, netos: A - E / 2, porBloque: porBloque, porTema: porTema, porDif: porDif };
    if (S.cfg.velocidad) {
      var agotadas = S.agotada.filter(Boolean).length;
      var usados = S.tiempos.filter(function (t, i) { return t != null && S.resp[i] != null; });
      res.vel = {
        respondidas: A + E,
        agotadas: agotadas,
        saltadas: B - agotadas,
        medio: usados.length ? usados.reduce(function (s, t) { return s + t; }, 0) / usados.length : 0,
      };
    }
    return res;
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
    if (r.vel) {
      store.guardarVelocidad({ ts: S.fin, n: r.N, a: r.A, e: r.E, b: r.B, agot: r.vel.agotadas, nota: Math.round(r.nota * 100) / 100,
                               medio: Math.round(r.vel.medio * 10) / 10 });
    } else if (r.N >= 20) {
      store.guardarSimulacro({
        ts: S.fin, n: r.N, a: r.A, e: r.E, b: r.B, nota: Math.round(r.nota * 100) / 100,
        seg: Math.round((S.fin - S.inicio) / 1000), modo: S.cfg.modo, titulo: S.cfg.titulo,
        bloques: r.porBloque, preset: S.cfg.preset || "", oficial: S.cfg.oficial || null, mezcla: S.cfg.mezcla || null,
      });
    } else {
      store.commit();
    }
    pintar();
    window.scrollTo({ top: 0 });
  }

  /* ---------- Pantallas ---------- */
  var cfgForm = { modo: "estudio", origen: "todo", bloque: "", n: 20, cronometro: false, temas: [], velN: TAMANOS_VELOCIDAD[0] };

  T.vista = function () {
    C = h("div", { class: "testbox" });
    pintar();
    return C;
  };

  function pintar() {
    if (!C) return;
    C.textContent = "";
    tickEl = null;
    barEl = null;
    if (!S) return pantallaInicio();
    if (S.estado === "fin") return pantallaResultados();
    if (S.cfg.velocidad) return pantallaVelocidad();
    pantallaPregunta();
  }

  function pantallaInicio() {
    var banco = AA.preguntas.length;
    C.appendChild(h("div", { class: "eyebrow" }, AA.plural(banco, "pregunta original", "preguntas originales") + " en el banco"));
    C.appendChild(h("h1", { class: "page-title" }, "Tests"));
    C.appendChild(h("p", { class: "lead" }, "Tres respuestas posibles, una correcta, y cada error resta la mitad de un acierto, como en el examen. Las opciones se barajan cada vez."));

    var fallos = store.fallosPendientes().length;
    var presets = h("div", { class: "preset section" },
      cardPreset("Simulacro oficial", "100 preguntas, 50 minutos, corrección por fórmula oficial. Reparto por temas y mezcla de dificultad como en los últimos exámenes.", "Empezar simulacro", function () { T.preparar({ preset: "simulacro" }); }, true),
      cardPreset("Simulacro exigente", "Igual que el oficial pero con más preguntas difíciles (30 % frente a 20 %), para entrenar por encima del objetivo de 7,5.", "Empezar", function () { T.preparar({ preset: "exigente" }); }),
      cardPreset("Test rápido", "20 preguntas con feedback inmediato, priorizando lo nuevo y lo fallado.", "Empezar", function () { T.preparar({ preset: "rapido" }); }),
      cardPreset("Mis fallos", fallos ? AA.plural(fallos, "pregunta pendiente", "preguntas pendientes") + "." : "Cuando falles preguntas, podrás repasarlas aquí.", "Repasar fallos", function () { T.preparar({ preset: "fallos" }); }, false, !fallos),
      cardVelocidad()
    );
    C.appendChild(presets);
    C.appendChild(cuadernoErrores());

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

  /* Entrenamiento de presión: mini-test de 10 o 15 preguntas al azar con 30 segundos por pregunta. */
  function cardVelocidad() {
    var tam = h("div", { class: "seg", role: "group", "aria-label": "Número de preguntas del mini-test" });
    TAMANOS_VELOCIDAD.forEach(function (n) {
      var b = h("button", { type: "button", "aria-pressed": cfgForm.velN === n ? "true" : "false", "aria-label": n + " preguntas", onclick: function () {
        cfgForm.velN = n;
        tam.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      } }, String(n));
      tam.appendChild(b);
    });
    var hist = store.velocidad().slice(-5).reverse();
    return h("div", { class: "card vel-card" },
      h("h3", {}, "Entrenamiento de velocidad"),
      h("p", {}, "Mini-test de " + TAMANOS_VELOCIDAD.join(" o ") + " preguntas al azar con " + SEG_PREGUNTA + " segundos cada una, el ritmo del examen real. Si se acaba el tiempo, pasa sola y queda en blanco."),
      tam,
      h("div", {}, h("button", { class: "btn btn--sm btn--primary", onclick: function () { T.preparar({ preset: "velocidad", n: cfgForm.velN }); } }, "Empezar a contrarreloj")),
      hist.length ? h("div", { class: "muted vel-hist" }, "Últimas notas: " + hist.map(function (s) { return AA.fmt1(s.nota) + (s.agot ? " (" + s.agot + " sin tiempo)" : ""); }).join(" · ")) : null);
  }

  /* ---------- Cuaderno de errores: por qué fallas ---------- */
  var CONSEJO = {
    despiste: "Lee el enunciado entero antes de mirar las opciones y busca negaciones y excepciones («no», «salvo», «excepto»). Si vas con prisa, marca la duda y vuelve al final.",
    plazo: "Son datos de memoria: repasa las tablas de plazos, cifras y órganos de las fichas y las tarjetas del tema hasta que salgan solas.",
    concepto: "Vuelve a la ficha antes de seguir haciendo tests: «Lo imprescindible» y el resumen del tema, con la guía de 4 días.",
    dudosa: "Si dudas entre dos, contestar compensa (+0,25 aciertos de media con la fórmula oficial). Repasa las trampas habituales del tema para desempatar.",
  };

  /* Botones para diagnosticar el último fallo de una pregunta (opcional). Pulsar el marcado lo quita. */
  function selectorMotivo(qid, alCambiar) {
    var cont = h("div", { class: "motivos", role: "group", "aria-label": "Motivo del fallo" });
    function dibujar(foco) {
      cont.textContent = "";
      var actual = store.motivoFallo(qid);
      cont.appendChild(h("span", { class: "motivos-tit" }, "¿Por qué has fallado? ", h("span", { class: "muted" }, "(opcional)")));
      AA.MOTIVOS.forEach(function (m) {
        var b = h("button", {
          type: "button", class: "chip chipbtn", title: m.txt, "aria-pressed": actual === m.id ? "true" : "false",
          onclick: function () {
            store.etiquetarFallo(qid, actual === m.id ? null : m.id);
            dibujar(m.id);
            if (alCambiar) alCambiar();
          },
        }, m.corto);
        cont.appendChild(b);
        if (foco === m.id) b.focus(); // el botón pulsado se ha redibujado: el foco no se pierde
      });
    }
    dibujar();
    return cont;
  }
  AA.selectorMotivo = selectorMotivo;

  function cuadernoErrores() {
    var sec = h("section", { class: "card section cuaderno", "aria-labelledby": "cuaderno-tit" });
    var resumen = h("div", { "aria-live": "polite" });
    function pintarResumen() {
      var d = store.diagnosticoFallos();
      resumen.textContent = "";
      if (!d.total) {
        resumen.appendChild(h("p", { class: "muted" }, d.pendientes ?
          "Aún no has diagnosticado ningún fallo. Al fallar una pregunta, marca por qué ha sido (o hazlo abajo con los pendientes) y aquí verás qué tipo de error repites." :
          "Cuando falles preguntas podrás marcar por qué ha sido, y aquí verás qué tipo de error repites."));
      } else {
        var barras = h("div", { class: "diag", role: "list" });
        AA.MOTIVOS.forEach(function (m) {
          barras.appendChild(h("div", { class: "diag-fila", role: "listitem" },
            h("span", { class: "diag-nom" }, m.nombre, h("small", {}, m.txt)),
            h("div", { class: "bar diag-bar diag-bar--" + m.id, "aria-hidden": "true" }, h("i", { style: "width:" + d.pct[m.id] + "%" })),
            h("span", { class: "diag-val num" }, h("strong", {}, d.pct[m.id] + " %"), h("small", {}, AA.plural(d.porTipo[m.id], "fallo", "fallos")))));
        });
        resumen.appendChild(barras);
        var dom = AA.MOTIVOS.filter(function (m) { return m.id === d.dominante; })[0];
        resumen.appendChild(h("div", { class: "objetivo objetivo--no diag-sesgo" },
          h("strong", {}, "Tu error más repetido: " + dom.nombre.toLowerCase() + " (" + d.pct[dom.id] + " %). "), CONSEJO[dom.id]));
        resumen.appendChild(h("p", { class: "muted diag-pie" }, AA.plural(d.total, "fallo diagnosticado", "fallos diagnosticados") +
          (d.sinDiagnosticar ? " · " + AA.plural(d.sinDiagnosticar, "fallo pendiente sin diagnosticar", "fallos pendientes sin diagnosticar") : "") + "."));
      }
    }
    pintarResumen();
    sec.appendChild(h("h2", { class: "sec-title", id: "cuaderno-tit" }, "Mis fallos: cuaderno de errores"));
    sec.appendChild(resumen);

    var sin = store.fallosSinDiagnosticar();
    if (sin.length) {
      var lista = h("div", { class: "fallos-lista" });
      sin.slice(0, 15).forEach(function (q) {
        lista.appendChild(h("div", { class: "fallo-item" },
          h("div", { class: "fallo-cab" }, h("span", { class: "chip" }, "Tema " + q.tema)),
          h("p", { class: "fallo-q", html: rich(q.q) }),
          h("p", { class: "fallo-ok" }, h("strong", {}, "Correcta: "), h("span", { html: rich(q.ops[q.ok]) })),
          selectorMotivo(q.id, pintarResumen)));
      });
      sec.appendChild(h("details", { class: "cuaderno-lista" },
        h("summary", {}, "Diagnosticar fallos pendientes (" + sin.length + ")"),
        sin.length > 15 ? h("p", { class: "muted fallo-mas" }, "Los 15 más recientes. El resto, al repasarlos.") : null,
        lista));
    }
    if (store.fallosPendientes().length) {
      sec.appendChild(h("div", { class: "row cuaderno-acc" }, h("button", { class: "btn btn--sm", onclick: function () { T.preparar({ preset: "fallos" }); } }, "Repasar fallos")));
    }
    return sec;
  }

  /* Insignia del estado de verificación de la pregunta (herramientas/auditar_preguntas.py). */
  var VERIF = {
    verificada: ["ok", "Verificada con el BOE", "Las cifras de la respuesta están en el artículo vigente citado."],
    revisada: ["ok", "Revisada con la fuente", "Comprobada a mano contra el texto citado."],
    referencia: ["neutra", "Artículo comprobado", "El artículo citado existe y está vigente; el sentido de la respuesta no se puede comprobar automáticamente."],
    no_verificable: ["neutra", "Fuente no del BOE", "La fuente no es una norma del BOE (RAE, organismos, autores…): no se comprueba automáticamente."],
    revisar: ["aviso", "Pendiente de revisión", "La auditoría encontró algo que no cuadra con el BOE: contrasta esta pregunta con la norma."],
  };
  AA.VERIF = VERIF;
  function insigniaVerificacion(q) {
    if (!q.verif || !VERIF[q.verif.e]) return null;
    var v = VERIF[q.verif.e];
    var texto = v[1] + (q.verif.e === "revisada" && q.verif.por === "ia" ? " (asistida por IA)" : "");
    return h("span", { class: "verif verif--" + v[0], title: v[2] }, texto);
  }
  AA.insigniaVerificacion = insigniaVerificacion;

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
        h("span", { class: "chip" }, q.oficial ? (q.tema ? "Oficial · tema " + q.tema + " (estimado)" : "Examen oficial") : "Tema " + q.tema)
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
        q.ref ? h("span", { class: "ref" }, q.ref) : null,
        insigniaVerificacion(q)
      ));
      if (!acierto) C.appendChild(selectorMotivo(q.id));
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

  /* Velocidad: una pregunta cada vez, con su reloj de 30 segundos; responder o dejarla en blanco pasa a la siguiente. */
  function pantallaVelocidad() {
    reanudarVelocidad(); // si se salió de Tests a mitad, el reloj sigue donde se quedó
    var x = S.qs[S.i];
    var q = x.q;
    var N = S.qs.length;
    C.appendChild(h("div", { class: "qhead" },
      h("div", {}, h("div", { class: "eyebrow" }, S.cfg.titulo), h("div", { class: "num", style: "font-weight:600" }, "Pregunta " + (S.i + 1) + " de " + N)),
      h("span", { class: "chip" }, "Tema " + q.tema)));
    tickEl = h("span", { class: "timer num" });
    barEl = h("i");
    C.appendChild(h("div", { class: "vel-reloj", role: "timer", "aria-label": "Tiempo para esta pregunta" }, tickEl, h("div", { class: "bar vel-bar" }, barEl)));
    pintarReloj(restantePregunta());

    // El enunciado recibe el foco: con 30 segundos, el lector de pantalla debe leer la pregunta nueva sin buscarla
    var enunciado = h("p", { class: "qtext vel-q", tabindex: "-1", html: rich(q.q) });
    C.appendChild(enunciado);
    var opts = h("div", { class: "opts", role: "group", "aria-label": "Opciones" });
    x.orden.forEach(function (orig, k) {
      opts.appendChild(h("button", { type: "button", class: "opt", onclick: function () { elegir(S.i, orig); } },
        h("span", { class: "l" }, LETRAS[k]), h("span", { html: rich(q.ops[orig]) })));
    });
    C.appendChild(opts);
    setTimeout(function () { if (document.body.contains(enunciado)) enunciado.focus({ preventScroll: true }); }, 0); // tras montar la vista
    C.appendChild(h("div", { class: "qnav" },
      h("span", { class: "muted vel-pista" }, "Responder pasa a la siguiente; no se puede volver atrás."),
      h("button", { class: "btn", onclick: function () { avanzarVelocidad(false); } }, S.i < N - 1 ? "Dejar en blanco →" : "Dejar en blanco y terminar")));
    C.appendChild(h("div", { class: "row", style: "margin-top:18px" },
      h("button", { class: "btn btn--sm btn--ghost", onclick: function () { clearInterval(timer); S = null; pintar(); } }, "Abandonar")));
  }

  function resultadosVelocidad(r) {
    var v = r.vel;
    C.appendChild(h("div", { class: "kv section" },
      h("div", {}, h("b", {}, v.respondidas + "/" + r.N), h("span", {}, "respondidas")),
      h("div", {}, h("b", {}, v.agotadas), h("span", {}, "en blanco por falta de tiempo")),
      h("div", {}, h("b", {}, v.saltadas), h("span", {}, "dejadas en blanco a propósito")),
      h("div", {}, h("b", {}, v.respondidas ? AA.fmt1(Math.round(v.medio * 10) / 10) + " s" : "–"), h("span", {}, "por pregunta respondida"))));
    C.appendChild(h("p", { class: "section vel-formula" }, "Puntos netos con la fórmula oficial: ",
      h("span", { class: "mono" }, "A − E/2 = " + r.A + " − " + AA.fmt1(r.E / 2) + " = " + AA.fmt1(r.netos)),
      h("span", { class: "muted" }, " → nota (A − E/2) × 10 / " + r.N + " = " + AA.fmt1(r.bruta) + (r.bruta < 0 ? " (cuenta como 0)" : ""))));
    var msg = v.agotadas ?
      "Se te acabó el tiempo en " + AA.plural(v.agotadas, "pregunta", "preguntas") + ". En el examen tienes 30 segundos de media: si no la ves clara a la primera lectura, déjala marcada y sigue." :
      v.medio > 20 ? "Sin preguntas perdidas por tiempo, pero apurando: con " + AA.fmt1(Math.round(v.medio)) + " s de media no te quedaría margen para revisar las dudosas." :
      "Buen ritmo: te queda margen para releer las dudosas, como en el examen real.";
    C.appendChild(h("div", { class: "notice section" }, msg));
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
    if (r.vel) resultadosVelocidad(r);
    else C.appendChild(h("div", { class: "notice section" }, msg));
    if (S.cfg.objetivo) {
      var supera = r.nota >= S.cfg.objetivo;
      C.appendChild(h("div", { class: "objetivo section " + (supera ? "objetivo--ok" : "objetivo--no") },
        h("strong", {}, (supera ? "Objetivo alcanzado: " : "Objetivo no alcanzado: ") + AA.fmt1(r.nota) + " frente a " + AA.fmt1(S.cfg.objetivo)),
        h("span", {}, S.cfg.oficial ? " Es la nota de corte orientativa de ese examen." :
          " El objetivo de 7,5 queda por encima de las notas de corte recientes (7,05-7,72, orientativas)." + (S.cfg.mezcla === "exigente" ? " Este simulacro es más difícil que el real." : ""))));
    }
    var difs = r.porDif && [1, 2, 3].filter(function (d) { return r.porDif[d].n; });
    if (difs && difs.length > 1) {
      var nombres = { 1: "Fáciles", 2: "Medias", 3: "Difíciles" };
      C.appendChild(h("div", { class: "section card" }, h("h2", { class: "sec-title" }, "Por dificultad"),
        h("table", { class: "mini" }, h("thead", {}, h("tr", {}, h("th", {}, "Preguntas"), h("th", { class: "r" }, "Aciertos"), h("th", { class: "r" }, "Errores"), h("th", { class: "r" }, "% acierto"))),
          h("tbody", {}, difs.map(function (d) {
            var p = r.porDif[d];
            return h("tr", {}, h("td", {}, nombres[d]), h("td", { class: "r" }, p.a + "/" + p.n), h("td", { class: "r" }, p.e), h("td", { class: "r" }, AA.pct(p.a, p.n) + " %"));
          })))));
    }

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
      .filter(function (x) { return AA.temas[x.t] && (x.d.e > 0 || x.d.a < x.d.n); })
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
      S.cfg.velocidad ? h("button", { class: "btn", onclick: function () { T.preparar({ preset: "velocidad", n: S.qs.length }); } }, "Otra tanda a contrarreloj") : null,
      h("button", { class: "btn", onclick: function () { S = null; pintar(); } }, "Nuevo test"),
      AA.ui.enlace("panel", "btn btn--ghost", "Volver al panel")
    ));

    // Corrección
    var rev = h("div", { class: "rev section" }, h("h2", { class: "sec-title" }, "Corrección pregunta a pregunta"));
    if (falladas.length) rev.appendChild(h("p", { class: "muted rev-pista" }, "Abre cada error y marca por qué lo has fallado: lo verás resumido en el cuaderno de errores, en la portada de Tests («Nuevo test»)."));
    S.qs.forEach(function (x, i) {
      var q = x.q;
      var rsp = S.resp[i];
      var estado = rsp == null ? (S.agotada && S.agotada[i] ? ["⏱", "bl-t", "Sin tiempo"] : ["–", "bl-t", "En blanco"]) : rsp === q.ok ? ["✓", "ok-t", "Acierto"] : ["✗", "ko-t", "Error"];
      var d = h("details", {},
        h("summary", {}, h("span", { class: "s " + estado[1], title: estado[2] }, estado[0]), h("span", { html: rich(q.q) }), h("span", { class: "muted num", style: "font-size:.8rem" }, "T" + q.tema)),
        h("div", { class: "body" },
          h("div", { class: "opts" }, x.orden.map(function (orig, k) {
            var cls = "opt" + (orig === q.ok ? " ok" : orig === rsp ? " ko" : "");
            return h("div", { class: cls }, h("span", { class: "l" }, LETRAS[k]), h("span", { html: rich(q.ops[orig]) }));
          })),
          h("div", { class: "explica" }, h("span", { html: rich(q.exp) }), q.ref ? h("span", { class: "ref" }, q.ref) : null, insigniaVerificacion(q)),
          rsp != null && rsp !== q.ok ? selectorMotivo(q.id) : null
        )
      );
      rev.appendChild(d);
    });
    C.appendChild(rev);
  }

  document.addEventListener("keydown", function (e) {
    if (!S || S.estado !== "run" || location.hash !== "#test") return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; // tecla mantenida o atajo (Ctrl+C no es responder C)
    var tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.target.closest && e.target.closest(".motivos")) return; // Intro en un motivo lo marca, no avanza
    var k = e.key.toLowerCase();
    var pos = k === "a" || k === "1" ? 0 : k === "b" || k === "2" ? 1 : k === "c" || k === "3" ? 2 : -1;
    if (S.cfg.velocidad) {
      if (pos >= 0) { elegir(S.i, S.qs[S.i].orden[pos]); e.preventDefault(); }
      else if (k === "arrowright" || (k === "enter" && tag !== "BUTTON")) { avanzarVelocidad(false); e.preventDefault(); }
      return;
    }
    if (pos >= 0) { elegir(S.i, S.qs[S.i].orden[pos]); e.preventDefault(); }
    else if (k === "arrowright" || k === "enter") { if (S.i < S.qs.length - 1) irA(S.i + 1); }
    else if (k === "arrowleft") { if (S.i > 0) irA(S.i - 1); }
  });

  /* ================= Tarjetas ================= */
  var F = null; // {cola, i, mostrar, vistas, bien, total, titulo}
  var CT = null;
  var U = (AA.tarjetasUI = {});
  U.interno = { construirCola: construirCola };

  function construirCola(o) {
    if (o.cajas) {
      // Modo Repaso Intensivo: las tarjetas que siguen en las cajas bajas, aunque no les toque repaso hoy
      return { cola: AA.shuffle(store.tarjetasEnCajas(o.cajas)).slice(0, o.max || 20), titulo: "Cajas " + o.cajas.join(" y ") };
    }
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
