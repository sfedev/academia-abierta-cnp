/* Pruebas físicas: puntos según los baremos del Anexo II (web/data/fisicas.js), marca que falta para el siguiente
   punto y evolución del registro de marcas (lo guarda AA.store). Sin DOM: lo prueban herramientas/tests/js/. */
(function () {
  var AA = window.AA;
  var EJERCICIOS = ["agilidad", "fuerza", "resistencia"];
  var BAREMOS = ["H", "M"];

  function FIS() { return window.AA_FISICAS; }
  /* Lista [límite, puntos] de la mejor marca a la peor. */
  function tabla(ej, b) {
    var F = FIS();
    return ej === "fuerza" ? F.fuerza[b].tabla : F[ej][b];
  }
  /* En agilidad y 1.000 m cuenta el menor tiempo; en dominadas y suspensión, la marca mayor. */
  function menorEsMejor(ej) { return ej !== "fuerza"; }
  function cumple(ej, v, limite) { return menorEsMejor(ej) ? v <= limite : v >= limite; }

  function puntos(ej, b, v) {
    var t = tabla(ej, b);
    for (var i = 0; i < t.length; i++) if (cumple(ej, v, t[i][0])) return t[i][1];
    return 0;
  }

  /* Siguiente punto del baremo desde la marca `v`: {puntos, max} con la puntuación máxima, o {puntos, objetivo,
     puntosObjetivo, falta}: `objetivo` es la marca límite que da `puntosObjetivo` y `falta`, cuánto hay que bajar
     (tiempos) o subir (repeticiones, segundos de suspensión) para llegar a ella. */
  function siguiente(ej, b, v) {
    var p = puntos(ej, b, v);
    var t = tabla(ej, b);
    var mejor = null;
    t.forEach(function (fila) {
      if (fila[1] > p && (!mejor || fila[1] < mejor[1])) mejor = fila;
    });
    if (!mejor) return { puntos: p, max: true };
    var falta = menorEsMejor(ej) ? v - mejor[0] : mejor[0] - v;
    return { puntos: p, objetivo: mejor[0], puntosObjetivo: mejor[1], falta: Math.round(falta * 10) / 10 };
  }

  function esEntero(v) { return Math.floor(v) === v; }
  /* Mensaje de error de una marca, o "" si es válida. Agilidad: segundos con una décima como mucho; dominadas y
     suspensión: número entero; 1.000 m: segundos enteros (las bases miden en minutos y segundos). */
  function validar(ej, b, v) {
    if (EJERCICIOS.indexOf(ej) < 0) return "Ejercicio desconocido.";
    if (BAREMOS.indexOf(b) < 0) return "Elige el baremo de hombres o de mujeres.";
    if (typeof v !== "number" || !isFinite(v)) return "Escribe la marca.";
    if (ej === "agilidad") {
      if (v <= 0 || v >= 60) return "El circuito se mide en segundos: escribe un tiempo entre 0 y 60.";
      if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) return "El circuito se mide en segundos y décimas: escribe una décima como mucho (p. ej. 9,8).";
    } else if (ej === "fuerza") {
      if (!esEntero(v) || v < 0) return b === "H" ? "Escribe las dominadas válidas como número entero." : "Escribe los segundos de suspensión como número entero.";
      if (v > (b === "H" ? 100 : 600)) return "Esa marca no parece correcta: revísala.";
    } else {
      if (!esEntero(v) || v <= 0) return "Escribe el tiempo en minutos y segundos enteros.";
      if (v >= 3600) return "Esa marca no parece correcta: revísala.";
    }
    return "";
  }

  /* ---------- Textos ---------- */
  function num(n) { return AA.fmt1(n); }
  function minSeg(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return m ? m + " min" + (r ? " " + r + " s" : "") : r + " s";
  }
  function nombre(ej, b) {
    var F = FIS();
    if (ej === "fuerza") return b === "H" ? "Dominadas" : "Suspensión en barra";
    return ej === "agilidad" ? F.agilidad.nombre : "1.000 metros";
  }
  /* Marca con su unidad: «9,8 s», «12 dominadas», «57 s», «3 min 24 s». */
  function formato(ej, b, v) {
    if (ej === "agilidad") return num(v) + " s";
    if (ej === "fuerza") return b === "H" ? AA.plural(v, "dominada", "dominadas") : v + " s";
    return minSeg(v);
  }
  /* Diferencia entre dos marcas, sin signo: «0,3 s», «2 dominadas», «6 s», «1 min 5 s». */
  function formatoDif(ej, b, d) {
    d = Math.abs(d);
    if (ej === "agilidad") return num(Math.round(d * 10) / 10) + " s";
    if (ej === "fuerza") return b === "H" ? AA.plural(d, "dominada", "dominadas") : d + " s";
    return minSeg(d);
  }
  /* Frase con lo que falta para el siguiente punto, a partir del resultado de siguiente(). */
  function textoSiguiente(ej, b, s) {
    if (s.max) return "Ya tienes la puntuación máxima (10).";
    var obj = formato(ej, b, s.objetivo);
    var pts = AA.plural(s.puntosObjetivo, "punto", "puntos");
    var verbo = s.puntos === 0 ? "para sumar " + pts + " y no quedar fuera" : "para " + pts;
    if (menorEsMejor(ej)) return "Baja " + formatoDif(ej, b, s.falta) + ": " + obj + " o menos " + verbo + ".";
    var mas = b === "H" ? AA.plural(s.falta, "dominada más", "dominadas más") : formatoDif(ej, b, s.falta) + " más";
    return "Te falta" + (s.falta === 1 ? "" : "n") + " " + mas + ": " + obj + " o más " + verbo + ".";
  }

  /* ---------- Registro ---------- */
  function ordenar(lista) {
    return lista.slice().sort(function (x, y) { return x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : x.ts - y.ts; });
  }
  /* Marcas de un ejercicio con un baremo, de la más antigua a la más reciente, con sus puntos. Devuelve
     {lista, ultima, primera, mejor, cambio}: `cambio` es la mejora de la primera a la última marca en la unidad del
     ejercicio (positiva si ha mejorado) y null con menos de dos marcas. */
  function evolucion(marcas, ej, b) {
    var lista = ordenar((marcas || []).filter(function (m) { return m.ej === ej && m.b === b; })).map(function (m) {
      return { ts: m.ts, dia: m.dia, v: m.v, puntos: puntos(ej, b, m.v) };
    });
    if (!lista.length) return { lista: lista, ultima: null, primera: null, mejor: null, cambio: null };
    var mejor = lista[0];
    lista.forEach(function (m) {
      if (menorEsMejor(ej) ? m.v < mejor.v : m.v > mejor.v) mejor = m;
    });
    var primera = lista[0], ultima = lista[lista.length - 1];
    var cambio = lista.length > 1 ? Math.round((menorEsMejor(ej) ? primera.v - ultima.v : ultima.v - primera.v) * 10) / 10 : null;
    return { lista: lista, ultima: ultima, primera: primera, mejor: mejor, cambio: cambio };
  }
  /* Nota de la prueba con la última marca de cada ejercicio: {completa, puntos: {ej: p|null}, media, cero, apto}.
     Media aritmética de los tres; aprueba con 5 o más y ningún 0 (base 6.1.2). */
  function resumen(marcas, b) {
    var p = {}, n = 0, suma = 0, cero = false;
    EJERCICIOS.forEach(function (ej) {
      var u = evolucion(marcas, ej, b).ultima;
      p[ej] = u ? u.puntos : null;
      if (u) { n++; suma += u.puntos; if (!u.puntos) cero = true; }
    });
    var completa = n === EJERCICIOS.length;
    var media = completa ? suma / n : null;
    return { completa: completa, puntos: p, media: media, cero: cero, apto: completa && !cero && media >= 5 };
  }

  AA.fisicas = {
    EJERCICIOS: EJERCICIOS,
    BAREMOS: BAREMOS,
    menorEsMejor: menorEsMejor,
    puntos: puntos,
    siguiente: siguiente,
    validar: validar,
    nombre: nombre,
    formato: formato,
    formatoDif: formatoDif,
    textoSiguiente: textoSiguiente,
    evolucion: evolucion,
    resumen: resumen,
  };
})();
