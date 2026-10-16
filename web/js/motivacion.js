/* Motivación: racha de estudio, dominio del temario, niveles por tema, logros, desafío diario y rentabilidad de las
   dudas. Solo lee el progreso a través de AA.store (los cambios pasan por store.js) y no toca el DOM: se prueba en
   Node (herramientas/tests/js/f13_motivacion.test.js). */
(function () {
  var AA = window.AA;
  var store = AA.store;
  var DIA = 24 * 3600 * 1000;

  function hoy() { return AA.isoDia(Date.now()); }

  /* ---------- Racha de estudio ----------
     Un día cuenta como día de estudio con el desafío diario terminado o con un mínimo de actividad: 10 preguntas,
     10 tarjetas, un día de la guía, un tema marcado como leído o una sesión de psicotécnicos. Los días sin estudio no
     rompen la racha mientras no pasen de los días de descanso de esa semana (de lunes a domingo; 1 por defecto, se
     cambia en Progreso), pero tampoco suman. Hoy no la rompe hasta que se acaba. */
  var UMBRAL = { p: 10, t: 10, g: 1, l: 1, s: 1 };
  var DESCANSOS = [0, 1, 2];
  function diaActivo(d) {
    if (!d) return false;
    if (d.r || (d.des && d.des.hecho)) return true;
    return Object.keys(UMBRAL).some(function (k) { return (d[k] || 0) >= UMBRAL[k]; });
  }
  function hayActividad(d) {
    return !!d && !!(d.p || d.t || d.g || d.l || d.s || d.r || (d.des && d.des.hecho));
  }
  function descansos() {
    var n = store.ajuste("descansos");
    return DESCANSOS.indexOf(n) >= 0 ? n : 1;
  }
  /* Recorre el registro desde su día más antiguo hasta `hasta`, con `n` días de descanso por semana.
     → {actual, mejor, inicio, hoy (el día `hasta` ya cuenta), descansosSemana (usados en la semana de `hasta`)} */
  function calcularRacha(dias, hasta, n) {
    var claves = Object.keys(dias).filter(function (k) { return k <= hasta; }).sort();
    var actual = 0, mejor = 0, inicio = null, usados = {};
    for (var iso = claves.length ? claves[0] : hasta, guarda = 0; iso <= hasta && guarda < 1000; iso = AA.sumarDias(iso, 1), guarda++) {
      if (diaActivo(dias[iso])) {
        if (!actual) { inicio = iso; usados = {}; }
        actual++;
        if (actual > mejor) mejor = actual;
      } else if (actual && iso !== hasta) {
        var semana = AA.lunes(iso);
        if ((usados[semana] || 0) < n) usados[semana] = (usados[semana] || 0) + 1;
        else { actual = 0; inicio = null; }
      }
    }
    return { actual: actual, mejor: mejor, inicio: inicio, hoy: diaActivo(dias[hasta]), descansosSemana: actual ? usados[AA.lunes(hasta)] || 0 : 0 };
  }
  function racha() {
    var r = calcularRacha(store.dias(), hoy(), descansos());
    r.mejor = Math.max(r.mejor, store.rec("racha"));
    r.descansos = descansos();
    return r;
  }

  /* Mapa de constancia: las `semanas` últimas (columnas de lunes a domingo, la actual a la derecha). Nivel de cada
     día: 0 sin actividad, 1 algo de actividad sin llegar al mínimo, 2 día de estudio, 3 día intenso (50 preguntas y
     tarjetas o más). → {semanas: [[{iso, nivel, futuro, d}]], activos} */
  function constancia(semanas) {
    var dias = store.dias();
    var h = hoy();
    var desde = AA.sumarDias(AA.lunes(h), -7 * ((semanas || 12) - 1));
    var out = [], activos = 0;
    for (var s = 0; s < (semanas || 12); s++) {
      var col = [];
      for (var k = 0; k < 7; k++) {
        var iso = AA.sumarDias(desde, s * 7 + k);
        var d = dias[iso] || null;
        var nivel = diaActivo(d) ? ((d.p || 0) + (d.t || 0) >= 50 ? 3 : 2) : hayActividad(d) ? 1 : 0;
        if (nivel >= 2 && iso <= h) activos++;
        col.push({ iso: iso, nivel: iso > h ? 0 : nivel, futuro: iso > h, d: d });
      }
      out.push(col);
    }
    return { semanas: out, activos: activos };
  }

  /* ---------- Dominio y niveles por tema ----------
     Dominio de un tema (0 a 1) = 0,7 × fracción de preguntas consolidadas + 0,3 × fracción de tarjetas consolidadas
     (solo las preguntas si el tema no tiene tarjetas). «Temario bajo control» = suma de media × dominio de cada tema
     entre la suma de las medias: como las medias suman unas 100 preguntas por examen, el porcentaje equivale a las
     preguntas de un examen típico que corresponden a lo que ya tienes consolidado. */
  var PESO_PREGUNTAS = 0.7;
  function dominioTema(n) {
    var t = AA.temas[n];
    if (!t || !t.datos) return null;
    var p = store.statsTema(n);
    var c = store.statsTarjetasTema(n);
    if (!p.total && !c.total) return null;
    var fp = p.total ? p.consolidadas / p.total : 0;
    var fc = c.total ? c.consolidadas / c.total : 0;
    var dominio = p.total && c.total ? PESO_PREGUNTAS * fp + (1 - PESO_PREGUNTAS) * fc : p.total ? fp : fc;
    return { tema: n, dominio: dominio, preguntas: p, tarjetas: c, refrescar: p.refrescar + c.refrescar };
  }
  function bajoControl() {
    var total = 0, suma = 0;
    AA.listaTemas.forEach(function (t) {
      total += t.media || 0;
      var d = dominioTema(t.tema);
      if (d) suma += (t.media || 0) * d.dominio;
    });
    return { preguntas: suma, total: total, pct: total ? Math.floor((100 * suma) / total) : 0 };
  }

  var NIVELES = [
    { id: "nuevo", nombre: "Sin empezar", txt: "Aún no has leído el tema ni practicado con él." },
    { id: "estudio", nombre: "En estudio", txt: "Empezado: lectura, guía, tarjetas o alguna pregunta." },
    { id: "practicado", nombre: "Practicado", txt: "Has respondido al menos el 60 % de sus preguntas." },
    { id: "dominado", nombre: "Dominado", txt: "El 80 % de sus preguntas consolidadas (2 aciertos, el último reciente) y el 60 % de sus tarjetas en la caja 3 o más." },
  ];
  var NIVEL = {};
  NIVELES.forEach(function (x) { NIVEL[x.id] = x; });
  var UMBRAL_NIVEL = { vistas: 0.6, preguntas: 0.8, tarjetas: 0.6 };
  /* {id, nombre, txt, dominio, refrescar, preguntas, tarjetas} o null si el tema no tiene ficha. */
  function nivelTema(n) {
    var d = dominioTema(n);
    if (!d) return null;
    var p = d.preguntas, c = d.tarjetas;
    var id = "nuevo";
    if (p.vistas || c.vistas || store.leido(n) || Object.keys(store.guiaTema(n)).length) id = "estudio";
    if (p.total && p.vistas / p.total >= UMBRAL_NIVEL.vistas) id = "practicado";
    var okP = !p.total || p.consolidadas / p.total >= UMBRAL_NIVEL.preguntas;
    var okC = !c.total || c.consolidadas / c.total >= UMBRAL_NIVEL.tarjetas;
    if (okP && okC) id = "dominado";
    return Object.assign({}, NIVEL[id], { dominio: d.dominio, refrescar: d.refrescar, preguntas: p, tarjetas: c });
  }

  /* ---------- Logros ----------
     Pocos y por calidad (constancia, dominio, notas y diagnóstico de errores), no por número de clics. Se calculan
     desde el progreso y se guardan con su fecha la primera vez que se cumplen (no se pierden aunque el dominio baje). */
  function bloqueDominado(c, b) {
    var x = c.bloques[b];
    return !!x && x.temas > 0 && x.dominados === x.temas;
  }
  var LOGROS = [
    { id: "racha-7", nombre: "Una semana seguida", txt: "Racha de 7 días de estudio.", cumple: function (c) { return c.racha >= 7; } },
    { id: "racha-30", nombre: "Un mes de constancia", txt: "Racha de 30 días de estudio.", cumple: function (c) { return c.racha >= 30; } },
    { id: "racha-100", nombre: "Cien días", txt: "Racha de 100 días de estudio.", cumple: function (c) { return c.racha >= 100; } },
    { id: "desafio-10", nombre: "Diez desafíos", txt: "10 desafíos diarios terminados.", cumple: function (c) { return c.desafios >= 10; } },
    { id: "tema-dominado", nombre: "Primer tema dominado", txt: "Un tema con el nivel «Dominado».", cumple: function (c) { return c.dominados >= 1; } },
    { id: "bloque-A", nombre: "Bloque A dominado", txt: "Todos los temas con ficha de Ciencias Jurídicas en «Dominado».", cumple: function (c) { return bloqueDominado(c, "A"); } },
    { id: "bloque-B", nombre: "Bloque B dominado", txt: "Todos los temas con ficha de Ciencias Sociales en «Dominado».", cumple: function (c) { return bloqueDominado(c, "B"); } },
    { id: "bloque-C", nombre: "Bloque C dominado", txt: "Todos los temas con ficha de Materias Técnico-Científicas en «Dominado».", cumple: function (c) { return bloqueDominado(c, "C"); } },
    { id: "control-50", nombre: "Medio examen bajo control", txt: "50 % del temario bajo control, ponderado por lo que cae en examen.", cumple: function (c) { return c.control >= 50; } },
    { id: "simulacro-corte", nombre: "Por encima del corte", txt: "Simulacro de 100 preguntas con 7,5 o más (las notas de corte recientes rondan 7,05-7,72, orientativas).",
      cumple: function (c) { return c.sims.some(function (s) { return s.n >= 100 && (s.preset === "simulacro" || s.preset === "exigente") && s.nota >= 7.5; }); } },
    { id: "tema-perfecto", nombre: "Tema sin fallos", txt: "Test completo de un tema (10 preguntas o más) sin fallos ni blancos.", cumple: function (c) { return c.temasPerfectos >= 1; } },
    { id: "subita-25", nombre: "Pulso firme", txt: "25 aciertos seguidos en Muerte súbita.", cumple: function (c) { return c.subita >= 25; } },
    { id: "velocidad-limpia", nombre: "Contrarreloj limpio", txt: "Velocidad de 15 preguntas sin ninguna agotada y con 7 o más.",
      cumple: function (c) { return c.vel.some(function (v) { return v.n >= 15 && !v.agot && v.nota >= 7; }); } },
    { id: "cuaderno-50", nombre: "Conoce tus errores", txt: "50 fallos diagnosticados en el cuaderno de errores.", cumple: function (c) { return c.cuaderno >= 50; } },
    { id: "tarjetas-100", nombre: "Cien tarjetas fijadas", txt: "100 tarjetas en la caja 3 o más de Leitner.", cumple: function (c) { return c.tarjetas >= 100; } },
    { id: "primera-vuelta", nombre: "Primera vuelta", txt: "Guía de 4 días completada en todos los temas con ficha.", cumple: function (c) { return c.vuelta; } },
  ];
  var LOGRO = {};
  LOGROS.forEach(function (l) { LOGRO[l.id] = l; });

  function contexto(mejorRacha) {
    var bloques = {}, dominados = 0, tarjetas = 0;
    AA.listaTemas.forEach(function (t) {
      var nv = nivelTema(t.tema);
      if (!nv) return;
      var b = bloques[t.bloque] || (bloques[t.bloque] = { temas: 0, dominados: 0 });
      b.temas++;
      if (nv.id === "dominado") { b.dominados++; dominados++; }
      tarjetas += nv.tarjetas.consolidadas;
    });
    var v = AA.guia.vuelta(1);
    return {
      racha: mejorRacha, desafios: store.rec("desafios"), dominados: dominados, bloques: bloques, control: bajoControl().pct,
      sims: store.simulacros(), vel: store.velocidad(), subita: store.rec("subita"), temasPerfectos: store.rec("temasPerfectos"),
      cuaderno: store.diagnosticoFallos().total, tarjetas: tarjetas, vuelta: v.temas > 0 && !v.pasos,
    };
  }
  /* Guarda la mejor racha y desbloquea los logros cumplidos. Devuelve los nuevos: [{id, nombre, txt}]. */
  function revisar() {
    var r = racha();
    store.mejorarRecord("racha", r.mejor);
    var c = contexto(Math.max(r.mejor, store.rec("racha")));
    var cumplidos = LOGROS.filter(function (l) { return l.cumple(c); }).map(function (l) { return l.id; });
    return store.desbloquear(cumplidos).map(function (id) { return LOGRO[id]; });
  }
  /* Catálogo con su fecha de desbloqueo (ts) o null. */
  function listaLogros() {
    var hechos = store.logros();
    return LOGROS.map(function (l) { return { id: l.id, nombre: l.nombre, txt: l.txt, ts: hechos[l.id] || null }; });
  }

  /* ---------- Desafío diario ----------
     5 preguntas fijas para todo el día: 2 de retención (primero las consolidadas que piden refresco por llevar 60
     días sin verse, después las acertadas hace 14 días o más, las más antiguas antes), 1 fallo pendiente (el primero
     del cuaderno de errores por prioridad), 1 de un tema de peso alto aún sin dominar y 1 sin ver. Lo que falte se
     completa al azar dando más peso a lo fallado y a lo nuevo. Solo entran preguntas verificadas con el BOE o
     revisadas con su fuente. El azar toma la fecha como semilla y las preguntas se fijan al abrir el desafío. */
  var DESAFIO = { n: 5, retencion: 2, diasRetencion: 14 };
  var VERIF_OK = { verificada: 1, revisada: 1 };
  function elegibles() {
    var ok = AA.preguntas.filter(function (q) { return q.verif && VERIF_OK[q.verif.e]; });
    if (ok.length >= DESAFIO.n) return ok;
    // auditoría desfasada (sin estado en las preguntas): todas salvo las marcadas para revisar
    return AA.preguntas.filter(function (q) { return !(q.verif && q.verif.e === "revisar"); });
  }
  function pesoAzar(q) {
    var r = store.regPregunta(q.id);
    return !r ? 2 : r.last === 0 ? 3 : 1;
  }
  function elegirPonderado(lista, peso, rnd) {
    var total = lista.reduce(function (s, x) { return s + peso(x); }, 0);
    var x = rnd() * total;
    for (var i = 0; i < lista.length; i++) {
      x -= peso(lista[i]);
      if (x < 0) return lista[i];
    }
    return lista[lista.length - 1] || null;
  }
  function seleccionarDesafio(iso) {
    var rnd = AA.azar("desafio-" + iso);
    var pool = elegibles();
    var enPool = {}, usadas = {}, elegidas = [];
    pool.forEach(function (q) { enPool[q.id] = true; });
    function tomar(q) {
      if (!q || usadas[q.id] || elegidas.length >= DESAFIO.n) return false;
      usadas[q.id] = true;
      elegidas.push(q);
      return true;
    }
    // retención
    var limite = Date.now() - DESAFIO.diasRetencion * DIA;
    pool
      .map(function (q) { return { q: q, r: store.regPregunta(q.id), e: store.estadoPregunta(q.id) }; })
      .filter(function (x) { return x.e === "refrescar" || ((x.e === "consolidada" || x.e === "vista") && x.r.ts <= limite); })
      .sort(function (a, b) { return (a.e === "refrescar" ? 0 : 1) - (b.e === "refrescar" ? 0 : 1) || a.r.ts - b.r.ts; })
      .slice(0, DESAFIO.retencion)
      .forEach(function (x) { tomar(x.q); });
    // fallo pendiente con más prioridad
    AA.repaso.fallos().some(function (x) { return enPool[x.q.id] && tomar(x.q); });
    // tema de peso alto sin dominar (si no queda ninguno, los diez que más caen sin dominar)
    var sinDominar = AA.listaTemas.filter(function (t) { var nv = nivelTema(t.tema); return nv && nv.id !== "dominado"; });
    var altos = sinDominar.filter(function (t) { return t.peso === "alto"; });
    if (!altos.length) altos = sinDominar.slice().sort(function (a, b) { return (b.media || 0) - (a.media || 0); }).slice(0, 10);
    var tema = altos.length ? elegirPonderado(altos, function (t) { return t.media || 1; }, rnd) : null;
    if (tema) {
      var delTema = pool.filter(function (q) { return q.tema === tema.tema && !usadas[q.id] && store.estadoPregunta(q.id) !== "consolidada"; });
      tomar(delTema[Math.floor(rnd() * delTema.length)]);
    }
    // sin ver
    var nuevas = pool.filter(function (q) { return !usadas[q.id] && !store.regPregunta(q.id); });
    tomar(nuevas[Math.floor(rnd() * nuevas.length)]);
    // relleno ponderado (Efraimidis–Spirakis con la semilla del día)
    pool
      .filter(function (q) { return !usadas[q.id]; })
      .map(function (q) { return { q: q, k: Math.pow(rnd(), 1 / pesoAzar(q)) }; })
      .sort(function (a, b) { return b.k - a.k; })
      .forEach(function (x) { tomar(x.q); });
    return AA.shuffle(elegidas, rnd);
  }
  /* Preguntas del desafío de `iso` (hoy por defecto): las ya fijadas o, la primera vez, las elegidas, que se fijan. */
  function prepararDesafio(iso) {
    iso = iso || hoy();
    var des = store.desafio(iso);
    var qs = des ? des.ids.map(function (id) { return AA.preguntaPorId[id]; }).filter(Boolean) : [];
    if (qs.length) return qs;
    qs = seleccionarDesafio(iso);
    if (!des && qs.length) store.fijarDesafio(iso, qs.map(function (q) { return q.id; }));
    return qs;
  }
  /* {fecha, abierto, hecho, a, e, b, n} */
  function estadoDesafio(iso) {
    iso = iso || hoy();
    var des = store.desafio(iso);
    return { fecha: iso, abierto: !!des, hecho: !!(des && des.hecho), a: des ? des.a || 0 : 0, e: des ? des.e || 0 : 0,
             b: des ? des.b || 0 : 0, n: des ? des.ids.length : DESAFIO.n };
  }

  /* ---------- ¿Compensa contestar las dudas? ----------
     Con tres opciones y cada error restando medio acierto, contestar suma de media si se acierta más de 1 de cada 3:
     p − (1 − p)/2 > 0 ⇔ p > 1/3. `correctas`, `resp` y `marc` son paralelos (una posición por pregunta del test).
     → {marcadas, a, e, b, pct (acierto en las dudas contestadas), compensa, nota, notaSin (con las dudas contestadas en
     blanco), aporte (nota − notaSin)} o null si no se marcó ninguna. Las notas, como en la corrección, no bajan de 0. */
  var UMBRAL_DUDAS = 1 / 3;
  function analizarDudas(correctas, resp, marc) {
    var A = 0, E = 0, a = 0, e = 0, b = 0, marcadas = 0;
    var N = correctas.length;
    for (var i = 0; i < N; i++) {
      var r = resp[i];
      var acierto = r != null && r === correctas[i];
      var fallo = r != null && r !== correctas[i];
      if (acierto) A++;
      if (fallo) E++;
      if (!marc[i]) continue;
      marcadas++;
      if (acierto) a++;
      else if (fallo) e++;
      else b++;
    }
    if (!marcadas) return null;
    var nota = Math.max(0, AA.notaTest(A, E, N));
    var notaSin = Math.max(0, AA.notaTest(A - a, E - e, N));
    return { marcadas: marcadas, a: a, e: e, b: b, pct: AA.pct(a, a + e), compensa: a + e ? a / (a + e) > UMBRAL_DUDAS : null,
             nota: nota, notaSin: notaSin, aporte: nota - notaSin };
  }
  /* Todas las dudas contestadas en modo examen desde que existe el registro: {a, e, n, pct, compensa} */
  function dudasGlobal() {
    var a = store.rec("dudasA"), e = store.rec("dudasE");
    return { a: a, e: e, n: a + e, pct: AA.pct(a, a + e), compensa: a + e ? a / (a + e) > UMBRAL_DUDAS : null };
  }

  AA.motiv = {
    UMBRAL: UMBRAL,
    DESCANSOS: DESCANSOS,
    NIVELES: NIVELES,
    LOGROS: LOGROS,
    DESAFIO: DESAFIO,
    UMBRAL_DUDAS: UMBRAL_DUDAS,
    /* Rachas y logros a la vista (se pueden ocultar en Progreso; el resto de la web no cambia). */
    visible: function () { return store.ajuste("motiv") !== false; },
    mostrar: function (v) { store.ajuste("motiv", !!v); },
    descansos: descansos,
    racha: racha,
    hoyActivo: function () { return diaActivo(store.dia()); },
    constancia: constancia,
    dominioTema: dominioTema,
    bajoControl: bajoControl,
    nivelTema: nivelTema,
    revisar: revisar,
    logros: listaLogros,
    elegibles: elegibles,
    prepararDesafio: prepararDesafio,
    estadoDesafio: estadoDesafio,
    analizarDudas: analizarDudas,
    dudasGlobal: dudasGlobal,
    interno: { diaActivo: diaActivo, calcularRacha: calcularRacha, seleccionarDesafio: seleccionarDesafio, elegibles: elegibles },
  };
})();
