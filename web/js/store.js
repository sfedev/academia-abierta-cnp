/* Datos del temario y progreso del opositor (localStorage). */
(function () {
  var AA = window.AA;
  var KEY = "academia-abierta-policia-v1";
  var DIA = 24 * 3600 * 1000;
  var INTERVALOS = [0, 1, 3, 7, 16, 35]; // días por caja de Leitner (1..5)

  /* ---------- Datos del temario ---------- */
  var META = window.AA_META || { bloques: [], temas: [] };
  var TEMAS = window.AA_TEMAS || {};
  AA.meta = META;
  AA.temas = {};
  META.temas.forEach(function (m) {
    var d = TEMAS[m.tema] || null;
    AA.temas[m.tema] = Object.assign({}, m, { datos: d });
  });
  AA.listaTemas = META.temas.map(function (m) { return AA.temas[m.tema]; });
  AA.bloque = function (id) {
    return META.bloques.filter(function (b) { return b.id === id; })[0];
  };

  /* Bancos de preguntas y tarjetas. El progreso del usuario se guarda con el `id` fijo de cada una (q_NN_01,
     t_NN_01; lo asigna herramientas/migrar_ids.py y lo exige build.py), así que se puede corregir el texto sin
     perder el historial. */
  AA.preguntas = [];
  AA.tarjetas = [];
  AA.listaTemas.forEach(function (t) {
    if (!t.datos) return;
    (t.datos.preguntas || []).forEach(function (q) {
      AA.preguntas.push({
        id: q.id,
        tema: t.tema,
        bloque: t.bloque,
        q: q.enunciado,
        ops: q.opciones,
        ok: q.correcta,
        exp: q.explicacion,
        ref: q.ref,
        dif: q.dificultad || 2,
        verif: q.verif || null, // estado de la auditoría contra el BOE (herramientas/auditar_preguntas.py)
      });
    });
    (t.datos.tarjetas || []).forEach(function (c) {
      AA.tarjetas.push({ id: c.id, tema: t.tema, bloque: t.bloque, p: c.p, r: c.r });
    });
  });
  AA.preguntaPorId = {};
  AA.preguntas.forEach(function (q) { AA.preguntaPorId[q.id] = q; });
  /* Índices por tema: las estadísticas de un tema recorren solo sus preguntas y tarjetas, no el banco entero. */
  AA.preguntasPorTema = {};
  AA.tarjetasPorTema = {};
  AA.preguntas.forEach(function (q) { (AA.preguntasPorTema[q.tema] = AA.preguntasPorTema[q.tema] || []).push(q); });
  AA.tarjetas.forEach(function (c) { (AA.tarjetasPorTema[c.tema] = AA.tarjetasPorTema[c.tema] || []).push(c); });

  /* ---------- Progreso ---------- */
  var IDS_V = 2; // 1 = progreso guardado con «tema.hash(texto)»; 2 = con el id fijo de la ficha
  function fresh() {
    return { v: 1, ids: IDS_V, leidos: {}, preg: {}, tarj: {}, sims: [], ult: null, tema: 0, nov: [], aj: {}, psico: [], guia: {}, vel: [],
             dias: {}, logros: {}, rec: {} };
  }

  /* ---------- Registro diario (racha, mapa de constancia y desafío diario) ----------
     dias = {AAAA-MM-DD: {p: preguntas respondidas, a: aciertos, t: tarjetas calificadas, g: días de guía marcados,
     l: temas marcados como leídos, s: sesiones de psicotécnicos, r: 1 si el día se reconstruyó desde fechas
     anteriores al registro, des: desafío del día}}. Se guardan los últimos 400 días. */
  var DIAS_REGISTRO = 400;
  var SIEMBRA_PREGUNTAS = 5;
  /* Arranque del registro en una copia anterior a él: cuenta como día de estudio el que ya tiene algo fechado (tema
     leído, día de guía, test de 20 o más, velocidad, psicotécnicos) o en el que se respondió por última vez a 5
     preguntas o más. Es un mínimo: de cada pregunta solo queda la fecha de su último intento. */
  function sembrarDias(o) {
    var dias = {};
    var preg = o.preg || {};
    Object.keys(preg).forEach(function (k) {
      var ts = preg[k] && preg[k].ts;
      if (!ts) return;
      var d = dias[AA.isoDia(ts)] || (dias[AA.isoDia(ts)] = { p: 0 });
      d.p++;
    });
    Object.keys(dias).forEach(function (k) { if (dias[k].p >= SIEMBRA_PREGUNTAS) dias[k].r = 1; });
    var fechas = [];
    Object.keys(o.leidos || {}).forEach(function (t) { fechas.push(o.leidos[t]); });
    Object.keys(o.guia || {}).forEach(function (t) {
      var g = o.guia[t] || {};
      Object.keys(g).forEach(function (dia) { fechas.push(g[dia]); });
    });
    (o.sims || []).concat(o.vel || [], o.psico || []).forEach(function (x) { if (x) fechas.push(x.ts); });
    fechas.forEach(function (ts) {
      if (typeof ts !== "number" || !ts) return;
      var k = AA.isoDia(ts);
      (dias[k] = dias[k] || {}).r = 1;
    });
    o.dias = dias;
  }
  function podarDias(o) {
    var hoy = AA.isoDia(Date.now());
    Object.keys(o.dias || {}).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || AA.diasEntre(k, hoy) > DIAS_REGISTRO) delete o.dias[k];
    });
  }
  function diaDe(iso) {
    S.dias = S.dias || {};
    return S.dias[iso] || (S.dias[iso] = {});
  }
  /* Suma `n` (1 por defecto) a un contador del día de hoy; se guarda con el siguiente save(). */
  function apunte(campo, n) {
    var d = diaDe(AA.isoDia(Date.now()));
    d[campo] = Math.max(0, (d[campo] || 0) + (n == null ? 1 : n));
    if (!d[campo]) delete d[campo];
  }
  function esHoy(ts) { return !!ts && AA.isoDia(ts) === AA.isoDia(Date.now()); }
  /* Traslada el progreso guardado con los ids antiguos (hash del texto) a los ids fijos. Los ids antiguos se
     recalculan desde el texto actual: sirve para el contenido publicado cuando se introdujeron los ids fijos. */
  function migrarIds(o) {
    o.preg = o.preg || {};
    o.tarj = o.tarj || {};
    AA.preguntas.forEach(function (q) {
      var viejo = q.tema + "." + AA.hash(q.q);
      if (o.preg[viejo] && !o.preg[q.id]) o.preg[q.id] = o.preg[viejo];
      delete o.preg[viejo];
    });
    AA.tarjetas.forEach(function (c) {
      var viejo = c.tema + "." + AA.hash(c.p);
      if (o.tarj[viejo] && !o.tarj[c.id]) o.tarj[c.id] = o.tarj[viejo];
      delete o.tarj[viejo];
    });
    o.ids = IDS_V;
  }
  var sembrar = false; // copia guardada antes del registro diario: se reconstruye al cargar
  var S = load();
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.v === 1) {
          var s = Object.assign(fresh(), o);
          if (o.ids !== IDS_V) s.ids = 1;
          sembrar = !o.dias;
          return s;
        }
      }
    } catch (e) {}
    return fresh();
  }
  var persistOk = true;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      persistOk = true;
    } catch (e) {
      persistOk = false;
    }
  }
  if (S.ids !== IDS_V) {
    migrarIds(S);
    save();
  }
  if (sembrar) {
    sembrarDias(S);
    save();
  }
  podarDias(S);

  /* ---------- Dominio: preguntas y tarjetas consolidadas ----------
     Una pregunta está consolidada con 2 aciertos o más y el último intento acertado (acertar dos veces por azar con
     tres opciones es improbable: ~11 %). A los 60 días sin verla pasa a «por refrescar» y deja de contar hasta que
     se vuelva a acertar. Una tarjeta, en la caja 3 o más de Leitner (ha aguantado una semana) y sin llevar más de
     60 días vencida. */
  var CONSOLIDA = { aciertos: 2, caja: 3, caducaDias: 60 };
  AA.CONSOLIDA = CONSOLIDA;
  /* "nueva" | "fallada" | "vista" (acertada, sin consolidar) | "consolidada" | "refrescar" */
  function estadoPregunta(r, ahora) {
    if (!r) return "nueva";
    if (r.last === 0) return "fallada";
    if (r.ok >= CONSOLIDA.aciertos) return ahora - r.ts > CONSOLIDA.caducaDias * DIA ? "refrescar" : "consolidada";
    return "vista";
  }
  /* "nueva" | "vista" | "consolidada" | "refrescar" */
  function estadoTarjeta(r, ahora) {
    if (!r) return "nueva";
    if (r.caja >= CONSOLIDA.caja) return ahora - r.due > CONSOLIDA.caducaDias * DIA ? "refrescar" : "consolidada";
    return "vista";
  }
  /* ---------- Novedades legislativas (generadas por herramientas/vigilar_leyes.py) ---------- */
  var NOV = window.AA_NOVEDADES || { items: [], comprobacion: "", normasVigiladas: 0, sinConsolidar: [], otrasFuentes: 0, errores: [] };
  AA.novedades = NOV;
  AA.novedadesPendientes = function (tema) {
    return NOV.items.filter(function (e) {
      return e.estado === "pendiente" && (tema == null || e.temas.indexOf(tema) >= 0);
    });
  };
  AA.novedadesSinVer = function () {
    var vistas = S.nov || [];
    return AA.novedadesPendientes().filter(function (e) { return vistas.indexOf(e.id) < 0; });
  };

  /* ---------- Guía de estudio en 4 días por tema ---------- */
  /* Minutos de cada día, estimados desde la ficha: lectura de estudio de texto normativo a ~110 palabras por
     minuto. El peso del tema alarga o acorta los días de estudio (1 a 3), no el test (4), que depende del número
     de preguntas. Se redondea a 5 minutos. */
  var GUIA = {
    ppm: 110,
    claves: 2.5, // día 1: Anexo I y «Lo imprescindible», leídos dos veces para fijar la estructura
    repaso: 1.6, // días 2 y 3: subrayar y releer
    tabla: 3, // minutos por tabla del resumen
    tarjeta: 0.5, // minutos por tarjeta en la primera sesión
    pregunta: 1, // minutos por pregunta en modo estudio, leyendo la explicación
    fallos: 5, // repaso de las falladas
    peso: { alto: 1.25, medio: 1, bajo: 0.85 },
  };
  var DIAS_GUIA = 4;
  var RITMOS = [
    { id: "1", porSemana: 1, nombre: "1 por semana" },
    { id: "2", porSemana: 2, nombre: "2 por semana" },
    { id: "3", porSemana: 3, nombre: "Intensivo (3)" },
  ];
  function palabras(s) {
    var t = AA.plain(s).trim();
    return t ? t.split(/\s+/).length : 0;
  }
  function sumaPalabras(lista) {
    return (lista || []).reduce(function (n, x) { return n + palabras(x); }, 0);
  }
  function a5(m) { return Math.max(5, Math.round(m / 5) * 5); }
  var minutosCache = {};
  /* [día 1, día 2, día 3, día 4] en minutos, o null si el tema no tiene ficha. */
  function minutosGuia(n) {
    if (minutosCache[n]) return minutosCache[n];
    var t = AA.temas[n];
    var d = t && t.datos;
    if (!d) return null;
    var k = GUIA.peso[t.peso] || 1;
    var pResumen = 0, tablas = 0;
    (d.resumen || []).forEach(function (s) {
      if (s.ampliado) return; // las ampliaciones plegadas son opcionales
      pResumen += palabras(s.titulo) + sumaPalabras(s.puntos);
      if (s.tabla) {
        tablas++;
        pResumen += sumaPalabras(s.tabla.cabecera);
        s.tabla.filas.forEach(function (f) { pResumen += sumaPalabras(f); });
      }
    });
    var caido = (d.caido || []).map(function (c) { return c.concepto; });
    var r = [
      a5(((palabras(t.oficial) + sumaPalabras(d.clave)) / GUIA.ppm) * GUIA.claves * k),
      a5(((pResumen / GUIA.ppm) * GUIA.repaso + tablas * GUIA.tabla) * k),
      a5((((sumaPalabras(d.trampas) + sumaPalabras(caido)) / GUIA.ppm) * GUIA.repaso + (d.tarjetas || []).length * GUIA.tarjeta) * k),
      a5((d.preguntas || []).length * GUIA.pregunta + GUIA.fallos),
    ];
    minutosCache[n] = r;
    return r;
  }
  function hechosGuia(n) { return (S.guia || {})[n] || {}; }
  /* Primer día sin hacer (1..4), o 0 si el tema tiene la guía completa. */
  function siguienteDia(n) {
    var g = hechosGuia(n);
    for (var dia = 1; dia <= DIAS_GUIA; dia++) if (!g[dia]) return dia;
    return 0;
  }
  /* Cuánto falta para terminar la guía de todos los temas con ficha a `porSemana` temas por semana (4 días cada
     uno). Un tema a medias solo cuenta los días que le faltan. Devuelve días pendientes, minutos, semanas, fecha
     de fin (AAAA-MM-DD) y minutos de estudio por semana. */
  function vuelta(porSemana, hoy) {
    var temas = 0, completos = 0, pasos = 0, minutos = 0;
    AA.listaTemas.forEach(function (t) {
      var m = minutosGuia(t.tema);
      if (!m) return;
      temas++;
      var g = hechosGuia(t.tema);
      var falta = 0;
      for (var dia = 1; dia <= DIAS_GUIA; dia++) {
        if (!g[dia]) { falta++; minutos += m[dia - 1]; }
      }
      if (!falta) completos++;
      pasos += falta;
    });
    var semanas = pasos / (porSemana * DIAS_GUIA);
    var fin = new Date(hoy == null ? Date.now() : hoy);
    fin.setHours(12, 0, 0, 0);
    fin.setDate(fin.getDate() + Math.ceil(semanas * 7));
    return {
      temas: temas, completos: completos, pasos: pasos, minutos: minutos, semanas: semanas,
      fecha: AA.isoDia(fin), minSemana: semanas ? Math.round(minutos / semanas) : 0,
    };
  }
  AA.guia = {
    DIAS: DIAS_GUIA,
    RITMOS: RITMOS,
    minutos: minutosGuia,
    siguiente: siguienteDia,
    vuelta: vuelta,
    /* Temas con la guía empezada y sin terminar, el último en el que se avanzó primero. */
    enCurso: function () {
      var lista = [];
      Object.keys(S.guia || {}).forEach(function (k) {
        var n = Number(k);
        var g = hechosGuia(n);
        if (!AA.temas[n] || !AA.temas[n].datos || !Object.keys(g).length || !siguienteDia(n)) return;
        var ultimo = Math.max.apply(null, Object.keys(g).map(function (d) { return g[d]; }));
        lista.push({ tema: n, dia: siguienteDia(n), ultimo: ultimo });
      });
      return lista.sort(function (a, b) { return b.ultimo - a.ultimo; });
    },
  };

  /* ---------- Cuaderno de errores: por qué se ha fallado cada pregunta ---------- */
  var MOTIVOS = [
    { id: "despiste", nombre: "Despiste", corto: "Despiste", txt: "Lectura incorrecta o precipitación" },
    { id: "plazo", nombre: "Plazo, cifra u órgano", corto: "Plazo / cifra / órgano", txt: "Confusión de plazo, cifra u órgano" },
    { id: "concepto", nombre: "Concepto", corto: "No lo sabía", txt: "Desconocimiento del tema" },
    { id: "dudosa", nombre: "Dudosa", corto: "Dudé entre dos", txt: "Duda entre dos opciones" },
  ];
  var MOTIVO = {};
  MOTIVOS.forEach(function (m) { MOTIVO[m.id] = m; });
  AA.MOTIVOS = MOTIVOS;
  /* Motivo del último intento fallado, o null si ese intento no se ha diagnosticado. */
  function motivoActual(r) {
    return r && r.last === 0 && r.tipo && r.tipoTs === r.ts ? r.tipo : null;
  }

  /* ---------- Modo Repaso Intensivo («últimos 30 días») ----------
     Reordena el Panel hacia el repaso: primero los fallos con motivo, luego «Lo imprescindible» de los temas con
     menos aciertos y las tarjetas que siguen en las cajas 1 y 2 de Leitner. Se guarda como el ajuste «repaso». */
  var PRIORIDAD_MOTIVO = { despiste: 3, plazo: 3, concepto: 3, dudosa: 2 }; // sin diagnosticar: 1
  AA.repaso = {
    activo: function () { return !!(S.aj && S.aj.repaso); },
    activar: function (v) { AA.store.ajuste("repaso", !!v); },
    /* Fallos pendientes por prioridad según el motivo del último fallo (el mismo que muestra el cuaderno): despiste,
       plazo o concepto; después «dudosa»; después sin diagnosticar. A igualdad, primero los más fallados y luego los
       más recientes. [{q, tipo, prio}] */
    fallos: function () {
      return AA.preguntas
        .filter(function (q) { var r = S.preg[q.id]; return r && r.last === 0; })
        .map(function (q) {
          var r = S.preg[q.id];
          var tipo = motivoActual(r);
          return { q: q, tipo: tipo, prio: PRIORIDAD_MOTIVO[tipo] || 1, fallos: r.n - r.ok, ts: r.ts };
        })
        .sort(function (a, b) { return b.prio - a.prio || b.fallos - a.fallos || b.ts - a.ts; });
    },
    /* Temas con «Lo imprescindible» y algún intento en los tests, del menor al mayor % de aciertos (a igualdad, el
       que más cae en examen primero). [{tema, titulo, pct, intentos, clave}] */
    temasFlojos: function (n) {
      return AA.listaTemas
        .map(function (t) { return { t: t, st: AA.store.statsTema(t.tema) }; })
        .filter(function (x) { return x.t.datos && (x.t.datos.clave || []).length && x.st.intentos; })
        .sort(function (a, b) { return a.st.pct - b.st.pct || (b.t.media || 0) - (a.t.media || 0) || a.t.tema - b.t.tema; })
        .slice(0, n == null ? 3 : n)
        .map(function (x) { return { tema: x.t.tema, titulo: x.t.titulo, pct: x.st.pct, intentos: x.st.intentos, clave: x.t.datos.clave }; });
    },
  };

  AA.store = {
    /* Preferencias sueltas (p. ej. «a2»: ya tiene el certificado de idioma). Con un valor, lo guarda. */
    ajuste: function (k, v) {
      S.aj = S.aj || {};
      if (arguments.length > 1) { S.aj[k] = v; save(); }
      return S.aj[k];
    },
    /* Sesiones de psicotécnicos: {ts, tipo, n, a, e, nota}. Se guardan las 40 últimas. */
    guardarPsico: function (r) {
      S.psico = (S.psico || []).concat([r]).slice(-40);
      apunte("s");
      save();
    },
    psico: function () { return S.psico || []; },
    novedadesVistas: function () { return S.nov || []; },
    marcarNovedadesVistas: function (ids) {
      var vistas = S.nov || [];
      ids.forEach(function (i) { if (vistas.indexOf(i) < 0) vistas.push(i); });
      S.nov = vistas;
      save();
    },
    estado: function () { return S; },
    guardadoActivo: function () { return persistOk; },

    leido: function (t) { return !!S.leidos[t]; },
    marcarLeido: function (t, v) {
      if (v) {
        if (!S.leidos[t]) apunte("l");
        S.leidos[t] = Date.now();
      } else {
        if (esHoy(S.leidos[t])) apunte("l", -1); // marcado y desmarcado el mismo día: no cuenta
        delete S.leidos[t];
      }
      save();
    },
    ultimoTema: function (t) {
      if (t != null) { S.tema = t; save(); }
      return S.tema;
    },
    totalLeidos: function () { return Object.keys(S.leidos).length; },

    /* Guía de estudio: {día: ts} con los días hechos de cada tema. Hacer el día 2 (el resumen) marca el tema como
       leído; deshacerlo no quita la marca de lectura. */
    guiaTema: function (t) { return hechosGuia(t); },
    pasoGuia: function (t, dia, v) {
      S.guia = S.guia || {};
      var g = S.guia[t] || {};
      if (v) {
        if (!g[dia]) apunte("g");
        g[dia] = Date.now();
      } else {
        if (esHoy(g[dia])) apunte("g", -1);
        delete g[dia];
      }
      if (Object.keys(g).length) S.guia[t] = g;
      else delete S.guia[t];
      if (v && dia === 2 && !S.leidos[t]) S.leidos[t] = Date.now();
      save();
    },

    /* Preguntas: {n: intentos, ok: aciertos, last: 1|0, ts} */
    responder: function (qid, acierto) {
      var r = S.preg[qid] || { n: 0, ok: 0, last: 0, ts: 0 };
      r.n++;
      if (acierto) r.ok++;
      r.last = acierto ? 1 : 0;
      r.ts = Date.now();
      S.preg[qid] = r;
      apunte("p");
      if (acierto) apunte("a");
    },
    commit: save,
    regPregunta: function (qid) { return S.preg[qid] || null; },
    /* Cuaderno de errores. La etiqueta va con el último intento fallado (`tipo`, `tipoTs` = `ts` del intento) y
       `motivos` acumula las de todos los fallos de la pregunta: cambiarla en el mismo intento la corrige, no suma
       otra. Sin `tipo`, la quita. Solo se puede etiquetar una pregunta cuyo último intento sea un fallo. */
    etiquetarFallo: function (qid, tipo) {
      var r = S.preg[qid];
      if (!r || r.last !== 0 || (tipo && !MOTIVO[tipo])) return false;
      var m = r.motivos || {};
      var previo = motivoActual(r);
      if (previo) {
        m[previo] = (m[previo] || 0) - 1;
        if (m[previo] <= 0) delete m[previo];
      }
      if (tipo) {
        m[tipo] = (m[tipo] || 0) + 1;
        r.tipo = tipo;
        r.tipoTs = r.ts;
      } else if (previo) {
        delete r.tipo;
        delete r.tipoTs;
      }
      if (Object.keys(m).length) r.motivos = m;
      else delete r.motivos;
      save();
      return true;
    },
    motivoFallo: function (qid) { return motivoActual(S.preg[qid]); },
    /* Reparto de los motivos de todos los fallos diagnosticados (también los de exámenes oficiales) y estado de los
       fallos pendientes del banco: {total, porTipo, pct, dominante, pendientes, sinDiagnosticar} */
    diagnosticoFallos: function () {
      var porTipo = {}, pct = {}, total = 0, dominante = null, pendientes = 0, sin = 0;
      MOTIVOS.forEach(function (m) { porTipo[m.id] = 0; });
      Object.keys(S.preg).forEach(function (k) {
        var m = S.preg[k].motivos || {};
        Object.keys(m).forEach(function (t) {
          if (porTipo[t] == null) return;
          porTipo[t] += m[t];
          total += m[t];
        });
      });
      MOTIVOS.forEach(function (m) {
        pct[m.id] = AA.pct(porTipo[m.id], total);
        if (porTipo[m.id] && (!dominante || porTipo[m.id] > porTipo[dominante])) dominante = m.id;
      });
      AA.preguntas.forEach(function (q) {
        var r = S.preg[q.id];
        if (!r || r.last !== 0) return;
        pendientes++;
        if (!motivoActual(r)) sin++;
      });
      return { total: total, porTipo: porTipo, pct: pct, dominante: dominante, pendientes: pendientes, sinDiagnosticar: sin };
    },
    /* Fallos pendientes del banco cuyo último intento no tiene motivo, el más reciente primero. */
    fallosSinDiagnosticar: function () {
      return AA.preguntas
        .filter(function (q) { var r = S.preg[q.id]; return r && r.last === 0 && !motivoActual(r); })
        .sort(function (a, b) { return S.preg[b.id].ts - S.preg[a.id].ts; });
    },
    fallosPendientes: function () {
      return AA.preguntas.filter(function (q) { var r = S.preg[q.id]; return r && r.last === 0; });
    },
    sinVer: function () {
      return AA.preguntas.filter(function (q) { return !S.preg[q.id]; });
    },
    /* Preguntas de un tema: vistas, intentos, aciertos, `dominadas` (último intento acertado), `consolidadas` y
       `refrescar` (consolidadas que llevan más de 60 días sin verse). */
    statsTema: function (t) {
      var lista = AA.preguntasPorTema[t] || [];
      var vistas = 0, aciertos = 0, intentos = 0, dominadas = 0, consolidadas = 0, refrescar = 0;
      var ahora = Date.now();
      lista.forEach(function (q) {
        var r = S.preg[q.id];
        if (!r) return;
        vistas++;
        intentos += r.n;
        aciertos += r.ok;
        if (r.last === 1) dominadas++;
        var e = estadoPregunta(r, ahora);
        if (e === "consolidada") consolidadas++;
        else if (e === "refrescar") refrescar++;
      });
      return { total: lista.length, vistas: vistas, intentos: intentos, aciertos: aciertos, dominadas: dominadas,
               consolidadas: consolidadas, refrescar: refrescar, pct: AA.pct(aciertos, intentos) };
    },
    /* Tarjetas de un tema: {total, vistas, consolidadas, refrescar} */
    statsTarjetasTema: function (t) {
      var lista = AA.tarjetasPorTema[t] || [];
      var vistas = 0, consolidadas = 0, refrescar = 0;
      var ahora = Date.now();
      lista.forEach(function (c) {
        var r = S.tarj[c.id];
        if (!r) return;
        vistas++;
        var e = estadoTarjeta(r, ahora);
        if (e === "consolidada") consolidadas++;
        else if (e === "refrescar") refrescar++;
      });
      return { total: lista.length, vistas: vistas, consolidadas: consolidadas, refrescar: refrescar };
    },
    estadoPregunta: function (qid) { return estadoPregunta(S.preg[qid], Date.now()); },
    estadoTarjeta: function (id) { return estadoTarjeta(S.tarj[id], Date.now()); },
    statsGlobal: function () {
      var vistas = 0, aciertos = 0, intentos = 0, ultimasOk = 0;
      AA.preguntas.forEach(function (q) {
        var r = S.preg[q.id];
        if (r) { vistas++; intentos += r.n; aciertos += r.ok; if (r.last === 1) ultimasOk++; }
      });
      return { total: AA.preguntas.length, vistas: vistas, intentos: intentos, aciertos: aciertos, ultimasOk: ultimasOk, pct: AA.pct(aciertos, intentos) };
    },

    /* Simulacros / tests completos */
    guardarSimulacro: function (res) {
      S.sims.push(res);
      if (S.sims.length > 60) S.sims = S.sims.slice(-60);
      save();
    },
    simulacros: function () { return S.sims; },
    /* Mini-tests de velocidad: {ts, n, a, e, b, agot, nota, medio}. Se guardan los 30 últimos. */
    guardarVelocidad: function (r) {
      S.vel = (S.vel || []).concat([r]).slice(-30);
      save();
    },
    velocidad: function () { return S.vel || []; },

    /* Tarjetas (Leitner): {caja, due} */
    tarjeta: function (id) { return S.tarj[id] || null; },
    pendientesTarjetas: function (temas) {
      var ahora = Date.now();
      return AA.tarjetas.filter(function (c) {
        if (temas && temas.indexOf(c.tema) < 0) return false;
        var r = S.tarj[c.id];
        return !r || r.due <= ahora;
      });
    },
    calificarTarjeta: function (id, nivel) {
      // nivel: 0 no la sabía, 1 dudosa, 2 la sabía
      var r = S.tarj[id] || { caja: 1, due: 0 };
      if (nivel === 0) r.caja = 1;
      else if (nivel === 2) r.caja = Math.min(5, r.caja + 1);
      var dias = nivel === 0 ? 1 : nivel === 1 ? Math.max(1, INTERVALOS[r.caja] / 2) : INTERVALOS[r.caja];
      r.due = Date.now() + dias * DIA;
      r.n = (r.n || 0) + 1;
      S.tarj[id] = r;
      apunte("t");
      save();
    },
    tarjetasDominadas: function () {
      return AA.tarjetas.filter(function (c) { var r = S.tarj[c.id]; return r && r.caja >= 4; }).length;
    },
    tarjetasVistas: function () {
      return AA.tarjetas.filter(function (c) { return S.tarj[c.id]; }).length;
    },
    /* Tarjetas ya vistas que están en alguna de las cajas indicadas, vencidas o no (las nuevas no tienen caja). */
    tarjetasEnCajas: function (cajas) {
      return AA.tarjetas.filter(function (c) { var r = S.tarj[c.id]; return r && cajas.indexOf(r.caja) >= 0; });
    },

    /* ---------- Registro diario ---------- */
    dias: function () { return S.dias || {}; },
    dia: function (iso) { return (S.dias || {})[iso || AA.isoDia(Date.now())] || null; },
    /* Desafío diario de la fecha `iso`: {ids, hecho?, a?, e?, b?} o null. Las preguntas se fijan al abrirlo por primera
       vez ese día y solo cuenta el primer intento terminado. */
    desafio: function (iso) {
      var d = (S.dias || {})[iso || AA.isoDia(Date.now())];
      return (d && d.des) || null;
    },
    fijarDesafio: function (iso, ids) {
      var d = diaDe(iso);
      if (!d.des) {
        d.des = { ids: ids.slice() };
        save();
      }
      return d.des;
    },
    cerrarDesafio: function (iso, a, e, b) {
      var des = (S.dias || {})[iso] && S.dias[iso].des;
      if (!des || des.hecho) return false;
      des.hecho = Date.now();
      des.a = a;
      des.e = e;
      des.b = b;
      S.rec = S.rec || {};
      S.rec.desafios = (S.rec.desafios || 0) + 1;
      save();
      return true;
    },

    /* ---------- Logros {id: fecha de desbloqueo} y récords {clave: número} ---------- */
    logros: function () { return S.logros || {}; },
    /* Marca como desbloqueados los ids que aún no lo estaban y devuelve esos (los nuevos). */
    desbloquear: function (ids) {
      S.logros = S.logros || {};
      var nuevos = ids.filter(function (id) { return !S.logros[id]; });
      nuevos.forEach(function (id) { S.logros[id] = Date.now(); });
      if (nuevos.length) save();
      return nuevos;
    },
    rec: function (k) { return (S.rec || {})[k] || 0; },
    /* Guarda `v` si supera el récord de `k`; devuelve true si es un récord nuevo. */
    mejorarRecord: function (k, v) {
      S.rec = S.rec || {};
      if (!(v > (S.rec[k] || 0))) return false;
      S.rec[k] = v;
      save();
      return true;
    },
    sumarRecord: function (k, n) {
      S.rec = S.rec || {};
      S.rec[k] = (S.rec[k] || 0) + n;
      save();
    },

    exportar: function () {
      return JSON.stringify(S);
    },
    importar: function (texto) {
      var o = JSON.parse(texto);
      if (!o || o.v !== 1 || typeof o.preg !== "object") throw new Error("Formato no válido");
      S = Object.assign(fresh(), o);
      if (o.ids !== IDS_V) {
        S.ids = 1;
        migrarIds(S);
      }
      if (!o.dias) sembrarDias(S);
      podarDias(S);
      save();
    },
    reiniciar: function () {
      S = fresh();
      save();
    },
  };
})();
