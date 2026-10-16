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

  /* ---------- Progreso ---------- */
  var IDS_V = 2; // 1 = progreso guardado con «tema.hash(texto)»; 2 = con el id fijo de la ficha
  function fresh() {
    return { v: 1, ids: IDS_V, leidos: {}, preg: {}, tarj: {}, sims: [], ult: null, tema: 0, nov: [], aj: {}, psico: [], guia: {} };
  }
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
  var S = load();
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.v === 1) {
          var s = Object.assign(fresh(), o);
          if (o.ids !== IDS_V) s.ids = 1;
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
      if (v) S.leidos[t] = Date.now();
      else delete S.leidos[t];
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
      if (v) g[dia] = Date.now();
      else delete g[dia];
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
    },
    commit: save,
    regPregunta: function (qid) { return S.preg[qid] || null; },
    fallosPendientes: function () {
      return AA.preguntas.filter(function (q) { var r = S.preg[q.id]; return r && r.last === 0; });
    },
    sinVer: function () {
      return AA.preguntas.filter(function (q) { return !S.preg[q.id]; });
    },
    statsTema: function (t) {
      var vistas = 0, aciertos = 0, intentos = 0, total = 0, dominadas = 0;
      AA.preguntas.forEach(function (q) {
        if (q.tema !== t) return;
        total++;
        var r = S.preg[q.id];
        if (r) {
          vistas++;
          intentos += r.n;
          aciertos += r.ok;
          if (r.last === 1) dominadas++;
        }
      });
      return { total: total, vistas: vistas, intentos: intentos, aciertos: aciertos, dominadas: dominadas, pct: AA.pct(aciertos, intentos) };
    },
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
      save();
    },
    tarjetasDominadas: function () {
      return AA.tarjetas.filter(function (c) { var r = S.tarj[c.id]; return r && r.caja >= 4; }).length;
    },
    tarjetasVistas: function () {
      return AA.tarjetas.filter(function (c) { return S.tarj[c.id]; }).length;
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
      save();
    },
    reiniciar: function () {
      S = fresh();
      save();
    },
  };
})();
