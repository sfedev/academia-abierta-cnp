/* Psicotécnicos: qué son según las bases, estrategia con la penalización, trucos y práctica con ejercicios
   generados (originales e ilimitados). Las bases solo dicen «aptitudes (inteligencia general y específica),
   máximo 60 minutos»: los tipos de ejercicio son los habituales de estas pruebas, no un modelo oficial. */
(function () {
  var AA = window.AA;
  var h = AA.h;
  var rich = AA.rich;
  var store = AA.store;
  var V = (AA.vistas = AA.vistas || {});
  // Alfabeto de 27 letras (Ortografía de la RAE de 2010: «ch» y «ll» no son letras; la ñ sí)
  var ALFABETO = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
  var N_OPC = 4;
  var LETRAS_OPC = ["A", "B", "C", "D"];

  function ent(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function uno(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
  function fmt(n) { return String(n).replace(".", ","); }

  /* Coloca la respuesta correcta entre distractores únicos. Devuelve {opciones, correcta}. */
  function conOpciones(correcta, candidatos) {
    var vistas = {};
    var ops = [correcta];
    vistas[correcta] = 1;
    candidatos.forEach(function (c) {
      if (ops.length < N_OPC && c != null && c !== "" && !vistas[c]) { vistas[c] = 1; ops.push(c); }
    });
    var extra = 1;
    var pos = ALFABETO.indexOf(correcta);
    while (ops.length < N_OPC) { // por si los candidatos se repiten
      var c = typeof correcta === "number" ? correcta + extra * (extra % 2 ? 1 : -1) * 3
        : pos >= 0 ? ALFABETO[(pos + 2 * extra) % 27] : correcta + " " + extra;
      if (!vistas[c]) { vistas[c] = 1; ops.push(c); }
      extra++;
    }
    var orden = AA.shuffle([0, 1, 2, 3]);
    return { opciones: orden.map(function (i) { return String(ops[i]); }), correcta: orden.indexOf(0) };
  }

  function serieTxt(terms) { return terms.join(", ") + ", ?"; }

  /* ---------- Generadores: cada uno devuelve {tipo, enunciado, opciones, correcta, explicacion} ---------- */
  var GEN = {
    aritmetica: function () {
      var a = ent(1, 60), d = uno([-9, -7, -6, -5, -4, -3, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 15]);
      var t = [0, 1, 2, 3, 4].map(function (i) { return a + i * d; });
      var sig = a + 5 * d;
      var o = conOpciones(sig, [sig + 1, sig - 1, sig + d, t[4] + d + (d > 0 ? 2 : -2)]);
      return { tipo: "series", enunciado: "¿Qué número sigue? " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Cada término " + (d > 0 ? "suma " + d : "resta " + -d) + ": " + t[4] + (d > 0 ? " + " + d : " − " + -d) + " = " + sig + "." };
    },
    geometrica: function () {
      var a = ent(1, 6), r = uno([2, 3, 4]);
      var t = [0, 1, 2, 3].map(function (i) { return a * Math.pow(r, i); });
      var sig = a * Math.pow(r, 4);
      var o = conOpciones(sig, [sig + t[3], t[3] * (r + 1), sig - r, t[3] + t[2] * r]);
      return { tipo: "series", enunciado: "¿Qué número sigue? " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Cada término se multiplica por " + r + ": " + t[3] + " × " + r + " = " + sig + "." };
    },
    diferencias: function () {
      var a = ent(1, 20), d0 = ent(1, 5), dd = uno([1, 2, 3]);
      var t = [a];
      var d = d0;
      for (var i = 0; i < 5; i++) { t.push(t[t.length - 1] + d); d += dd; }
      var sig = t[5] + d;
      var o = conOpciones(sig, [sig - dd, sig + dd, t[5] + d - 2 * dd, sig + 1]);
      return { tipo: "series", enunciado: "¿Qué número sigue? " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Las diferencias entre términos crecen de " + dd + " en " + dd + " (" + d0 + ", " + (d0 + dd) + ", " + (d0 + 2 * dd) + "…): la siguiente es " + d + ", y " + t[5] + " + " + d + " = " + sig + "." };
    },
    alterna: function () {
      var a = ent(1, 30), da = uno([2, 3, 4, 5]), b = ent(30, 80), db = uno([-5, -4, -3, -2, 6]);
      var t = [];
      for (var i = 0; i < 3; i++) { t.push(a + i * da); t.push(b + i * db); }
      var sig = a + 3 * da;
      var o = conOpciones(sig, [b + 3 * db, sig + da, sig - 1, t[5] + db]);
      return { tipo: "series", enunciado: "¿Qué número sigue? " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Son dos series intercaladas. Posiciones impares: " + a + ", " + (a + da) + ", " + (a + 2 * da) + " (suma " + da + "); toca la impar: " + sig + "." };
    },
    suma_anteriores: function () {
      var t = [ent(1, 5), ent(1, 6)];
      for (var i = 0; i < 4; i++) t.push(t[t.length - 1] + t[t.length - 2]);
      var sig = t[5] + t[4];
      var o = conOpciones(sig, [sig + 1, t[5] * 2, sig - t[3], t[5] + t[3]]);
      return { tipo: "series", enunciado: "¿Qué número sigue? " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Cada término es la suma de los dos anteriores: " + t[4] + " + " + t[5] + " = " + sig + "." };
    },
    letras: function () {
      var ini = ent(0, 26), k = uno([1, 2, 3, 4]);
      var t = [0, 1, 2, 3, 4].map(function (i) { return ALFABETO[(ini + i * k) % 27]; });
      var sig = ALFABETO[(ini + 5 * k) % 27];
      var otras = [ALFABETO[(ini + 5 * k + 1) % 27], ALFABETO[(ini + 5 * k + 26) % 27], ALFABETO[(ini + 6 * k) % 27], ALFABETO[(ini + 4 * k + k + 2) % 27]];
      var o = conOpciones(sig, otras);
      return { tipo: "letras", enunciado: "¿Qué letra sigue? (alfabeto de 27 letras, con Ñ) " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Se avanza " + k + " letra" + (k > 1 ? "s" : "") + " cada vez (contando la Ñ y volviendo a la A después de la Z): " + t[4] + " → " + sig + "." };
    },
    letras_alternas: function () {
      var a = ent(0, 26), ka = uno([1, 2, 3]), b = ent(0, 26), kb = uno([-1, -2, 2]);
      var t = [];
      for (var i = 0; i < 3; i++) { t.push(ALFABETO[(a + i * ka) % 27]); t.push(ALFABETO[((b + i * kb) % 27 + 27) % 27]); }
      var sig = ALFABETO[(a + 3 * ka) % 27];
      var o = conOpciones(sig, [ALFABETO[((b + 3 * kb) % 27 + 27) % 27], ALFABETO[(a + 3 * ka + 1) % 27], ALFABETO[(a + 4 * ka) % 27], ALFABETO[(a + 2 * ka + 26) % 27]]);
      return { tipo: "letras", enunciado: "¿Qué letra sigue? (alfabeto de 27 letras, con Ñ) " + serieTxt(t), opciones: o.opciones, correcta: o.correcta,
               explicacion: "Dos series intercaladas. La de las posiciones impares avanza " + ka + ": " + t[0] + ", " + t[2] + ", " + t[4] + " → " + sig + "." };
    },
    porcentaje: function () {
      var p = uno([5, 10, 12, 15, 20, 25, 30, 40, 75]);
      var base = uno([20, 40, 60, 80, 120, 160, 200, 240, 320, 400, 480, 600, 800]);
      var res = (p * base) / 100;
      if (res !== Math.round(res)) { base = 200; res = (p * base) / 100; }
      var o = conOpciones(res, [res * 2, res / 2, res + p, (p + 5) * base / 100]);
      return { tipo: "calculo", enunciado: "¿Cuánto es el " + p + " % de " + base + "?", opciones: o.opciones.map(fmt), correcta: o.correcta,
               explicacion: "El " + p + " % es multiplicar por " + fmt(p / 100) + ": " + base + " × " + fmt(p / 100) + " = " + fmt(res) + ". Truco: el 10 % es " + fmt(base / 10) + "." };
    },
    regla_tres: function () {
      var inversa = Math.random() < 0.5;
      if (inversa) {
        var a = uno([2, 3, 4, 6]), t = uno([6, 8, 12, 24]), b = uno([2, 3, 4, 6, 8, 12].filter(function (x) { return x !== a && (a * t) % x === 0; }));
        var r = (a * t) / b;
        var o = conOpciones(r, [Math.round((t * b) / a), t + (b - a), r + 2, r * 2]);
        return { tipo: "calculo", enunciado: a + " agentes revisan unos expedientes en " + t + " horas. Trabajando al mismo ritmo, ¿cuántas horas tardarían " + b + " agentes?",
                 opciones: o.opciones, correcta: o.correcta,
                 explicacion: "Proporción inversa (más agentes, menos horas): " + a + " × " + t + " = " + (a * t) + " horas-agente; " + (a * t) + " / " + b + " = " + r + " horas." };
      }
      var n = uno([3, 4, 5, 6]), precio = uno([12, 15, 18, 24, 30]), m = uno([7, 8, 9, 10, 12]);
      var unidad = precio / n;
      if (unidad !== Math.round(unidad)) { precio = n * uno([3, 4, 5, 6]); unidad = precio / n; }
      var res = unidad * m;
      var o2 = conOpciones(res, [res + unidad, res - unidad, precio + m, unidad * (m + 2)]);
      return { tipo: "calculo", enunciado: n + " chalecos cuestan " + precio + " €. ¿Cuánto cuestan " + m + " chalecos?", opciones: o2.opciones, correcta: o2.correcta,
               explicacion: "Proporción directa: cada chaleco cuesta " + precio + " / " + n + " = " + unidad + " €; " + m + " × " + unidad + " = " + res + " €." };
    },
    mental: function () {
      var tipo = uno(["x5", "x11", "x25", "resta"]);
      var a, res, txt, exp;
      if (tipo === "x5") { a = ent(12, 98); res = a * 5; txt = a + " × 5"; exp = "Multiplicar por 5 es multiplicar por 10 y dividir entre 2: " + (a * 10) + " / 2 = " + res + "."; }
      else if (tipo === "x11") { a = ent(12, 81); res = a * 11; txt = a + " × 11"; exp = "Multiplicar por 11 es sumar el número por 10 y el número: " + (a * 10) + " + " + a + " = " + res + "."; }
      else if (tipo === "x25") { a = ent(4, 48); res = a * 25; txt = a + " × 25"; exp = "Multiplicar por 25 es multiplicar por 100 y dividir entre 4: " + (a * 100) + " / 4 = " + res + "."; }
      else { a = ent(300, 900); var b = ent(101, 299); res = a - b; txt = a + " − " + b; exp = "Resta por partes: " + a + " − " + (b - (b % 100)) + " − " + (b % 100) + " = " + res + "."; }
      var o = conOpciones(res, [res + 10, res - 10, res + 1, res - 5]);
      return { tipo: "calculo", enunciado: "Calcula sin papel: " + txt, opciones: o.opciones, correcta: o.correcta, explicacion: exp };
    },
  };
  var POR_TIPO = {
    series: ["aritmetica", "geometrica", "diferencias", "alterna", "suma_anteriores"],
    letras: ["letras", "letras_alternas"],
    calculo: ["porcentaje", "regla_tres", "mental"],
  };
  POR_TIPO.mixto = POR_TIPO.series.concat(POR_TIPO.letras, POR_TIPO.calculo);

  function generar(tipo, n) {
    var fuentes = POR_TIPO[tipo] || POR_TIPO.mixto;
    var out = [];
    for (var i = 0; i < n; i++) out.push(GEN[fuentes[i % fuentes.length]]());
    return AA.shuffle(out);
  }

  /* Nota con la fórmula de las bases: [A − E/(n−1)] × 10 / P */
  function nota(a, e, p, n) {
    if (!p) return 0;
    return ((a - e / ((n || N_OPC) - 1)) * 10) / p;
  }
  /* Valor esperado (en aciertos) de contestar al azar entre «quedan» opciones, con «n» alternativas en total. */
  function esperanza(n, quedan) {
    return 1 / quedan - (1 - 1 / quedan) / (n - 1);
  }

  AA.psico = { interno: { GEN: GEN, POR_TIPO: POR_TIPO, generar: generar, nota: nota, esperanza: esperanza, ALFABETO: ALFABETO } };

  /* ---------- Vista ---------- */
  var P = null; // sesión de práctica
  var reloj = null;

  V.psicotecnicos = function () {
    var cont = h("div");
    pintar(cont);
    return cont;
  };

  function pintar(cont) {
    cont.textContent = "";
    clearInterval(reloj);
    if (P && !P.fin) {
      // El cronómetro se para solo si se sale de la página (la vista deja de estar en el documento)
      reloj = setInterval(function () {
        if (!P || P.fin || !document.body.contains(cont)) { clearInterval(reloj); return; }
        var resta = P.limite - Math.round((Date.now() - P.inicio) / 1000);
        if (resta <= 0) { terminar(); pintar(cont); return; }
        var el = cont.querySelector(".timer");
        if (el) el.textContent = AA.clock(resta);
      }, 1000);
      return pintarEjercicio(cont);
    }
    if (P && P.fin) return pintarResultado(cont);
    pintarInicio(cont);
  }

  function pintarInicio(cont) {
    var ps = (AA.meta.proceso || {}).psicotecnicos || {};
    cont.appendChild(h("div", { class: "eyebrow" }, "Tercera prueba, parte c · el mismo día que el test de conocimientos"));
    cont.appendChild(h("h1", { class: "page-title" }, "Psicotécnicos"));
    cont.appendChild(h("p", { class: "lead" }, ps.descripcion || "Test de aptitudes para la función policial."));
    cont.appendChild(h("div", { class: "card section stack" },
      h("h2", { class: "sec-title" }, "Lo que dicen las bases"),
      h("ul", { class: "lista-simple" }, [ps.formula, ps.calificacion, ps.cuando, ps.impugnacion].filter(Boolean).map(function (x) { return h("li", {}, x); })),
      h("p", { class: "muted" }, "Las bases no publican el tipo de ejercicios. Aquí practicas los más habituales en estas pruebas: series numéricas y de letras y cálculo rápido.")));

    // Estrategia: cuándo conviene contestar
    var filas = [3, 4, 5].map(function (n) {
      return h("tr", {}, h("td", {}, n + " opciones"),
        [n, n - 1, 2].map(function (k) { return h("td", { class: "r num" }, fmtEsp(esperanza(n, k))); }));
    });
    cont.appendChild(h("div", { class: "card section stack" },
      h("h2", { class: "sec-title" }, "Estrategia: ¿contestar o dejar en blanco?"),
      h("p", {}, "Con la fórmula de las bases, contestar completamente al azar no gana ni pierde puntos de media. En cuanto puedes descartar una opción, contestar compensa. Valor medio de una respuesta, en aciertos:"),
      h("div", { class: "tbl tbl--estrecha" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Pregunta con"), h("th", { class: "r" }, "Al azar"), h("th", { class: "r" }, "Descartando 1"), h("th", { class: "r" }, "Dudando entre 2"))),
        h("tbody", {}, filas))),
      h("ul", { class: "lista-simple" },
        h("li", { html: rich("**Tiempo**: 60 minutos como máximo en total, sean uno o varios test. No te atasques: marca, salta y vuelve.") }),
        h("li", { html: rich("**Lee la instrucción** de cada bloque: si el alfabeto incluye la Ñ, si cuenta el orden inverso, cuántas opciones hay.") }),
        h("li", { html: rich("**Blancos estratégicos**: deja en blanco solo lo que no puedes acotar; si dudas entre dos, contesta.") }))));

    cont.appendChild(h("div", { class: "card section stack" },
      h("h2", { class: "sec-title" }, "Trucos de cálculo y de series"),
      h("ul", { class: "lista-simple" },
        ["Por 5: multiplica por 10 y divide entre 2. Por 25: por 100 y entre 4. Por 11: el número por 10 más el número.",
         "Porcentajes: el 10 % es correr la coma; el 5 % es la mitad del 10 %; el 1 % es correr la coma dos veces.",
         "Regla de tres: decide primero si es directa (más → más) o inversa (más agentes → menos horas).",
         "Series: mira las diferencias entre términos; si no son constantes, mira las diferencias de las diferencias, los cocientes y las posiciones pares e impares por separado.",
         "Letras: escribe el alfabeto con números (A=1 … N=14, Ñ=15 … Z=27) y trabaja con números.",
         "Fracciones útiles: 1/8 = 0,125; 1/4 = 0,25; 3/8 = 0,375; 1/3 ≈ 0,333; 2/3 ≈ 0,667."].map(function (t) { return h("li", {}, t); }))));

    // Práctica
    var cfg = { tipo: "mixto", n: 20 };
    var seg = function (nombre, opciones, clave) {
      var g = h("div", { class: "seg", role: "group", "aria-label": nombre });
      opciones.forEach(function (o) {
        var b = h("button", { type: "button", "aria-pressed": cfg[clave] === o[0] ? "true" : "false", onclick: function () {
          cfg[clave] = o[0];
          g.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
        } }, o[1]);
        g.appendChild(b);
      });
      return g;
    };
    var hist = store.psico().slice(-5).reverse();
    cont.appendChild(h("div", { class: "card section stack" },
      h("h2", { class: "sec-title" }, "Practicar"),
      h("div", { class: "row" }, seg("Tipo", [["mixto", "Mixto"], ["series", "Series"], ["letras", "Letras"], ["calculo", "Cálculo"]], "tipo")),
      h("div", { class: "row" }, seg("Número", [[10, "10"], [20, "20"], [40, "40"]], "n"), h("span", { class: "muted" }, "30 segundos por ejercicio · 4 opciones · cada error resta 1/3")),
      h("div", {}, h("button", { class: "btn btn--primary", onclick: function () { empezar(cfg.tipo, cfg.n); pintar(cont); } }, "Empezar")),
      hist.length ? h("div", { class: "muted", style: "font-size:.9rem" }, "Últimas notas: " + hist.map(function (s) { return AA.fmt1(s.nota); }).join(" · ")) : null));
  }

  function fmtEsp(x) {
    var r = Math.round(x * 100) / 100;
    if (Math.abs(r) < 0.005) return "0"; // evita «-0» por el redondeo
    return (r > 0 ? "+" : "") + AA.fmt1(r);
  }

  function empezar(tipo, n) {
    P = { tipo: tipo, ej: generar(tipo, n), i: 0, resp: [], inicio: Date.now(), limite: n * 30, fin: null };
  }

  function terminar() {
    var a = 0, e = 0;
    P.ej.forEach(function (x, i) { if (P.resp[i] != null) { if (P.resp[i] === x.correcta) a++; else e++; } });
    P.fin = Date.now();
    P.res = { a: a, e: e, b: P.ej.length - a - e, nota: Math.max(0, nota(a, e, P.ej.length, N_OPC)) };
    store.guardarPsico({ ts: P.fin, tipo: P.tipo, n: P.ej.length, a: a, e: e, nota: Math.round(P.res.nota * 100) / 100 });
  }

  function pintarEjercicio(cont) {
    var x = P.ej[P.i];
    var restante = P.limite - Math.round((Date.now() - P.inicio) / 1000);
    if (restante <= 0) { terminar(); return pintar(cont); }
    cont.appendChild(h("div", { class: "qhead" },
      h("div", {}, h("div", { class: "eyebrow" }, "Psicotécnicos · " + P.tipo), h("div", { class: "num", style: "font-weight:600" }, "Ejercicio " + (P.i + 1) + " de " + P.ej.length)),
      h("span", { class: "timer num" }, AA.clock(restante))));
    cont.appendChild(h("p", { class: "qtext" }, x.enunciado));
    var opts = h("div", { class: "opts" });
    x.opciones.forEach(function (o, k) {
      opts.appendChild(h("button", { type: "button", class: "opt", "aria-pressed": P.resp[P.i] === k ? "true" : "false", onclick: function () {
        P.resp[P.i] = P.resp[P.i] === k ? null : k;
        if (P.i < P.ej.length - 1) P.i++;
        pintar(cont);
      } }, h("span", { class: "l" }, LETRAS_OPC[k]), h("span", {}, o)));
    });
    cont.appendChild(opts);
    cont.appendChild(h("div", { class: "qnav" },
      h("button", { class: "btn", disabled: P.i === 0 ? true : null, onclick: function () { P.i--; pintar(cont); } }, "← Anterior"),
      P.i < P.ej.length - 1 ? h("button", { class: "btn", onclick: function () { P.i++; pintar(cont); } }, "Saltar →") : null,
      h("button", { class: "btn btn--primary", onclick: function () { terminar(); pintar(cont); } }, "Terminar")));
  }

  function pintarResultado(cont) {
    var r = P.res;
    cont.appendChild(h("div", { class: "eyebrow" }, "Psicotécnicos · " + P.tipo));
    cont.appendChild(h("h1", { class: "page-title" }, "Resultado"));
    cont.appendChild(h("div", { class: "section row", style: "gap:24px;align-items:flex-end" },
      h("div", { class: "score" }, AA.fmt1(r.nota), h("small", {}, " / 10")),
      h("div", { class: "num" }, r.a + " aciertos · " + r.e + " errores · " + r.b + " en blanco · fórmula [A − E/3] × 10 / " + P.ej.length)));
    var lista = h("div", { class: "rev section" });
    P.ej.forEach(function (x, i) {
      var rsp = P.resp[i];
      var estado = rsp == null ? ["–", "bl-t"] : rsp === x.correcta ? ["✓", "ok-t"] : ["✗", "ko-t"];
      lista.appendChild(h("details", {},
        h("summary", {}, h("span", { class: "s " + estado[1] }, estado[0]), h("span", {}, x.enunciado), h("span", { class: "muted" }, "")),
        h("div", { class: "body" }, h("div", { class: "explica" }, h("strong", {}, "Respuesta: " + x.opciones[x.correcta] + ". "), x.explicacion))));
    });
    cont.appendChild(lista);
    cont.appendChild(h("div", { class: "section row" },
      h("button", { class: "btn btn--primary", onclick: function () { empezar(P.tipo, P.ej.length); pintar(cont); } }, "Otra tanda"),
      h("button", { class: "btn", onclick: function () { P = null; pintar(cont); } }, "Volver")));
  }
})();
