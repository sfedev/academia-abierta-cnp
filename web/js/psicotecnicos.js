/* Psicotécnicos: qué son según las bases, estrategia con la penalización, trucos y práctica con ejercicios
   generados (originales e ilimitados). Las bases solo dicen «aptitudes (inteligencia general y específica),
   máximo 60 minutos»: los tipos de ejercicio son los habituales de estas pruebas, no un modelo oficial.
   Cada generador construye el ejercicio y su solución a la vez, con una sola opción que cumple la regla; las pruebas
   (herramientas/tests/js/f10_psicotecnicos.test.js) recalculan la respuesta desde el enunciado y los datos. */
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
  // Tipos de práctica: [clave, nombre, qué entrena]
  var TIPOS = [
    ["mixto", "Mixto", "Un poco de cada tipo, repartido por igual"],
    ["series", "Series", "Numéricas: sumas, productos y diferencias"],
    ["letras", "Letras", "Series de letras, con la Ñ"],
    ["calculo", "Cálculo", "Porcentajes, regla de tres y mental"],
    ["atencion", "Atención", "Comparar códigos y contar"],
    ["abstracto", "Abstracto", "Símbolos: giros, cambios de sitio y matrices"],
    ["verbal", "Verbal", "Palabras cifradas y orden alfabético"],
  ];
  var NOMBRE = {};
  TIPOS.forEach(function (t) { NOMBRE[t[0]] = t[1]; });

  function ent(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function uno(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
  function fmt(n) { return String(n).replace(".", ","); }
  function enumera(xs) { return xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : String(xs[0]); }

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

  /* «n» valores distintos entre sí y de «correcta», pedidos a fabrica(i) hasta tenerlos (null se descarta). */
  function distintos(correcta, n, fabrica) {
    var out = [];
    var visto = {};
    visto[correcta] = 1;
    for (var i = 0; out.length < n && i < 500; i++) {
      var v = fabrica(i);
      if (v != null && !visto[v]) { visto[v] = 1; out.push(v); }
    }
    return out;
  }

  function serieTxt(terms) { return terms.join(", ") + ", ?"; }

  /* ---------- Atención: códigos sin I, O, Q, 0 ni 1, que se confunden entre sí aunque se lea bien ---------- */
  var COD = "ABCDEFGHJKLMNPRSTUVWXYZ23456789".split("");
  // Un carácter parecido a cada uno: es el cambio más difícil de ver
  var PARECIDO = { A: "4", B: "8", C: "G", D: "B", E: "F", F: "E", G: "6", H: "N", J: "T", K: "X", L: "E", M: "N", N: "M",
                   P: "R", R: "P", S: "5", T: "Y", U: "V", V: "U", W: "V", X: "K", Y: "T", Z: "2",
                   2: "Z", 3: "8", 4: "A", 5: "S", 6: "G", 7: "T", 8: "B", 9: "6" };
  // Grupos de caracteres parecidos para los ejercicios de contar
  var PARA_CONTAR = [["b", "d", "p", "q"], ["E", "F", "P", "R"], ["M", "N", "V", "W"], ["3", "5", "6", "8"], ["C", "G", "O", "Q"], ["m", "n", "u", "v"]];

  function codigo(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += uno(COD);
    return s;
  }
  /* Copia de «s» con un solo cambio: un carácter parecido, uno cualquiera o dos vecinos intercambiados. */
  function alterar(s, modo) {
    var c = s.split("");
    if (modo === "trueque") {
      var pos = [];
      for (var i = 0; i < c.length - 1; i++) if (c[i] !== c[i + 1]) pos.push(i);
      if (pos.length) {
        var j = uno(pos);
        var t = c[j];
        c[j] = c[j + 1];
        c[j + 1] = t;
        return c.join("");
      }
      modo = "cambio";
    }
    var k = ent(0, c.length - 1);
    var antes = c[k];
    c[k] = modo === "parecido" ? PARECIDO[antes] : uno(COD.filter(function (x) { return x !== antes; }));
    return c.join("");
  }
  /* En qué se diferencia «otra» de «modelo» (mismo largo: un carácter cambiado o dos vecinos intercambiados). */
  function diferencia(modelo, otra) {
    var pos = [];
    for (var i = 0; i < modelo.length; i++) if (modelo.charAt(i) !== otra.charAt(i)) pos.push(i);
    if (pos.length === 2) return "el " + (pos[0] + 1) + ".º y el " + (pos[1] + 1) + ".º carácter, intercambiados";
    return "el " + (pos[0] + 1) + ".º carácter (" + otra.charAt(pos[0]) + " en vez de " + modelo.charAt(pos[0]) + ")";
  }

  /* ---------- Abstracto: secuencias de símbolos en texto ---------- */
  // Figuras de texto (no emoji). Los círculos grandes porque ● y ○ salen diminutos en las fuentes del sistema
  var SIMB = ["⬤", "◯", "■", "□", "▲", "△", "◆", "◇", "★", "☆"];
  /* Desplaza «a» k posiciones a la izquierda (k negativo: a la derecha); lo que sale por un lado entra por el otro. */
  function rotar(a, k) {
    var n = a.length;
    k = ((k % n) + n) % n;
    return a.slice(k).concat(a.slice(0, k));
  }
  function trocar(a) {
    var b = a.slice();
    var i = ent(0, b.length - 2);
    var t = b[i];
    b[i] = b[i + 1];
    b[i + 1] = t;
    return b;
  }
  function simb(a) { return a.join(" "); }
  /* Reordena «a»: en el lugar j queda a[p[j]]. */
  function mover(a, p) { return p.map(function (i) { return a[i]; }); }

  /* ---------- Verbal: palabras corrientes sin tilde (al ordenar la tilde no cuenta; así no hay dudas) ---------- */
  var PALABRAS = ("ACTA AGUA ALARMA ARCO ARMA AULA AÑO BANCO BANDA BARCO BARRIO BAÑO BOLSA BOTA CALLE CAMA CAMINO CAMPO " +
    "CARTA CASA CASCO CENTRO CIUDAD COCHE CRUCE CUARTEL DATO DEDO DUDA DUEÑO LENTE LEÑA LIBRO LLAVE LUNA MANO MAPA MARZO " +
    "MESA MONTAÑA MONTE MOTO MULTA MUNDO NADA NAVE NIDO NINGUNO NIÑO NOCHE NORMA NUBE PAPEL PATRULLA PERRO PISTA PLACA " +
    "PLAZA PORTAL PRUEBA PUENTE PUERTA PUERTO RADIO RAMA RELOJ RUEDA RUTA SALA SELLO SENDA SERIE SEÑAL SILLA SOBRE SUELO " +
    "TARDE TECLA TORRE TREN TURNO VALLA VENTANA VIAJE VIDA").split(" ");
  // Iniciales con tres palabras o más: para que haya que mirar más allá de la primera letra
  var INICIALES = (function () {
    var n = {};
    PALABRAS.forEach(function (w) { n[w.charAt(0)] = (n[w.charAt(0)] || 0) + 1; });
    return Object.keys(n).filter(function (l) { return n[l] >= 3; });
  })();
  var ALF26 = ALFABETO.filter(function (l) { return l !== "Ñ"; });
  /* Orden alfabético español: letra a letra con el alfabeto de 27 (CH y LL no son letras aparte). */
  function compararEs(a, b) {
    for (var i = 0; i < a.length && i < b.length; i++) {
      var d = ALFABETO.indexOf(a.charAt(i)) - ALFABETO.indexOf(b.charAt(i));
      if (d) return d;
    }
    return a.length - b.length;
  }
  /* Desplaza cada letra k posiciones en el alfabeto «alf» (por defecto, el de 27), volviendo al principio tras la Z. */
  function cifrar(w, k, alf) {
    alf = alf || ALFABETO;
    var n = alf.length;
    var out = "";
    for (var i = 0; i < w.length; i++) {
      var p = alf.indexOf(w.charAt(i));
      if (p < 0) return null;
      out += alf[(((p + k) % n) + n) % n];
    }
    return out;
  }

  /* ---------- Generadores: cada uno devuelve {tipo, enunciado, opciones, correcta, explicacion} y, si hace falta,
     datos (filas de celdas que se muestran bajo el enunciado), mono (opciones en letra de ancho fijo), simbolos (datos
     y opciones con figuras, en letra más grande) y vista ---------- */
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

    /* Atención: solo una opción es copia exacta del modelo; las demás tienen un cambio. */
    copia: function () {
      var modelo = codigo(ent(7, 9));
      var modos = ["parecido", "trueque", "parecido", "cambio"];
      var o = conOpciones(modelo, distintos(modelo, 3, function (i) { return alterar(modelo, modos[i % 4]); }));
      var otras = [];
      o.opciones.forEach(function (x, k) { if (k !== o.correcta) otras.push(LETRAS_OPC[k] + ", " + diferencia(modelo, x)); });
      return { tipo: "atencion", enunciado: "¿Qué opción es exactamente igual al modelo?", datos: [["Modelo:", modelo]], mono: true,
               opciones: o.opciones, correcta: o.correcta,
               explicacion: "Compara en bloques de tres o cuatro caracteres. En las demás cambia: " + otras.join("; ") + "." };
    },
    /* Atención: cinco pares de códigos; se cuentan los idénticos. */
    pares: function () {
      var largo = ent(5, 7);
      var filas = [], iguales = [], cambios = [];
      for (var i = 1; i <= 5; i++) {
        var a = codigo(largo);
        var b = a;
        if (Math.random() < 0.6) {
          b = alterar(a, uno(["parecido", "parecido", "trueque", "cambio"]));
          cambios.push("par " + i + ", " + diferencia(a, b));
        } else iguales.push(i);
        filas.push([i + ".", a, b]);
      }
      var n = iguales.length;
      var o = conOpciones(n, [n + 1, n - 1, n + 2, n - 2, n + 3, n - 3].filter(function (x) { return x >= 0 && x <= 5; }));
      var exp = n === 0 ? "Ningún par es igual: " + cambios.join("; ") + "."
        : n === 5 ? "Los cinco pares son iguales."
        : (n === 1 ? "Solo es igual el par " : "Son iguales los pares ") + enumera(iguales) + ". En los demás cambia: " + cambios.join("; ") + ".";
      return { tipo: "atencion", vista: "pares", enunciado: "¿Cuántos pares de códigos son exactamente iguales?", datos: filas,
               opciones: o.opciones, correcta: o.correcta, explicacion: exp };
    },
    /* Atención: contar un carácter entre otros parecidos. */
    contar: function () {
      var grupo = uno(PARA_CONTAR), obj = uno(grupo), veces = ent(4, 10);
      var resto = grupo.filter(function (x) { return x !== obj; });
      var c = [];
      for (var i = 0; i < 30; i++) c.push(i < veces ? obj : uno(resto));
      c = AA.shuffle(c);
      var trozos = [];
      for (var g = 0; g < 30; g += 6) trozos.push(c.slice(g, g + 6).join(""));
      var parciales = trozos.map(function (s) { return s.split(obj).length - 1; });
      var o = conOpciones(veces, [veces + 1, veces - 1, veces + 2, veces - 2]);
      return { tipo: "atencion", enunciado: "¿Cuántas veces aparece «" + obj + "» en esta línea?", datos: [trozos],
               opciones: o.opciones, correcta: o.correcta,
               explicacion: "Grupo a grupo: " + parciales.join(" + ") + " = " + veces + ". Apunta el parcial de cada grupo en vez de contar la línea de una vez." };
    },

    /* Abstracto: la fila se desplaza siempre igual (giro circular). */
    giro: function () {
      var base = AA.shuffle(SIMB).slice(0, 5), k = uno([1, 2, -1, -2]);
      var t = [0, 1, 2].map(function (i) { return rotar(base, i * k); });
      var sig = rotar(base, 3 * k);
      var o = conOpciones(simb(sig), distintos(simb(sig), 3, function (i) {
        return simb([t[1], rotar(sig, 1), rotar(sig, -1), sig.slice().reverse(), trocar(sig)][i % 5]);
      }));
      var n = Math.abs(k);
      var lugar = [0, 1, 2, 3].map(function (i) { return (((-i * k) % 5 + 5) % 5 + 1) + ".º"; }); // dónde está base[0] en cada fila
      return { tipo: "abstracto", enunciado: "¿Qué fila continúa la secuencia?", datos: t.map(function (x) { return [simb(x)]; }).concat([["?"]]), simbolos: true,
               opciones: o.opciones, correcta: o.correcta,
               explicacion: "En cada fila los símbolos se desplazan " + n + " posici" + (n > 1 ? "ones" : "ón") + " hacia la " + (k > 0 ? "izquierda" : "derecha") +
                 " y el que sale por un extremo entra por el otro. Sigue uno solo: " + base[0] + " ocupa los lugares " + enumera(lugar.slice(0, 3)) +
                 "; en la siguiente fila le toca el " + lugar[3] + ": " + simb(sig) + "." };
    },
    /* Abstracto: el mismo cambio de posiciones aplicado a otros símbolos (la regla queda fijada por el ejemplo). */
    analogia: function () {
      var s = AA.shuffle(SIMB), a = s.slice(0, 4), b = s.slice(4, 8);
      var p;
      do { p = AA.shuffle([0, 1, 2, 3]); } while (p.join("") === "0123");
      var inv = [0, 1, 2, 3].map(function (i) { return p.indexOf(i); });
      var sig = mover(b, p);
      var o = conOpciones(simb(sig), distintos(simb(sig), 3, function (i) {
        return simb([mover(b, inv), b, b.slice().reverse(), rotar(b, 1), rotar(b, -1), trocar(sig)][i % 6]);
      }));
      var pasos = inv.map(function (d, i) { return d === i ? "el " + (i + 1) + ".º se queda" : "el " + (i + 1) + ".º pasa al " + (d + 1) + ".º lugar"; });
      return { tipo: "abstracto", enunciado: "La primera fila se transforma en la de su derecha cambiando los símbolos de sitio. Con el mismo cambio, ¿en qué se transforma la segunda?",
               datos: [[simb(a), "→", simb(mover(a, p))], [simb(b), "→", "?"]], simbolos: true,
               opciones: o.opciones, correcta: o.correcta,
               explicacion: "Mira adónde va cada posición: " + pasos.join("; ") + ". Aplicado a " + simb(b) + " queda " + simb(sig) + "." };
    },
    /* Abstracto: cuadrado latino 4 × 4 con dos casillas ocultas en la misma fila; la columna decide cuál es cuál. */
    matriz: function () {
      var s = AA.shuffle(SIMB).slice(0, 4), fil = AA.shuffle([0, 1, 2, 3]), col = AA.shuffle([0, 1, 2, 3]);
      var m = fil.map(function (f) { return col.map(function (c) { return s[(f + c) % 4]; }); });
      var r = ent(0, 3), c = ent(0, 3);
      var c2 = uno([0, 1, 2, 3].filter(function (x) { return x !== c; }));
      var sol = m[r][c], otro = m[r][c2];
      var datos = m.map(function (fila, i) {
        return fila.map(function (x, j) { return i !== r ? x : j === c ? "?" : j === c2 ? "·" : x; });
      });
      var o = conOpciones(sol, s.filter(function (x) { return x !== sol; }));
      return { tipo: "abstracto", vista: "matriz", enunciado: "Cada símbolo aparece una sola vez en cada fila y en cada columna. ¿Cuál va en el lugar de «?»? («·» es otra casilla oculta)",
               datos: datos, simbolos: true, opciones: o.opciones, correcta: o.correcta,
               explicacion: "En la fila " + (r + 1) + " faltan " + sol + " y " + otro + ". " + otro + " ya está en la columna " + (c + 1) + ", así que en «?» va " + sol + "." };
    },

    /* Verbal: desplazamiento fijo en el alfabeto de 27 letras; el ejemplo fija cuántas posiciones y hacia dónde. */
    cifrado: function () {
      var cortas = AA.shuffle(PALABRAS.filter(function (w) { return w.length >= 4 && w.length <= 6; }));
      var ej = cortas[0], obj = cortas[1], k = uno([1, 2, 3, -1, -2, -3]), sg = k > 0 ? 1 : -1;
      var sol = cifrar(obj, k);
      var o = conOpciones(sol, distintos(sol, 3, function (i) {
        if (i % 5 === 0) return cifrar(obj, -k); // sentido contrario
        if (i % 5 === 1) return cifrar(obj, k + sg); // una posición de más
        if (i % 5 === 2) return cifrar(obj, k - sg || k + 2 * sg); // una de menos
        if (i % 5 === 3) return cifrar(obj, k, ALF26); // sin contar la Ñ
        var j = ent(0, obj.length - 1); // una sola letra mal
        return sol.slice(0, j) + cifrar(obj.charAt(j), k + sg) + sol.slice(j + 1);
      }));
      var n = Math.abs(k);
      return { tipo: "verbal", enunciado: "En un código, todas las letras se desplazan el mismo número de posiciones en el alfabeto de 27 letras (con Ñ; después de la Z vuelve la A). Si " +
                 ej + " se escribe " + cifrar(ej, k) + ", ¿cómo se escribe " + obj + "?", mono: true,
               opciones: o.opciones, correcta: o.correcta,
               explicacion: ej.charAt(0) + " → " + cifrar(ej.charAt(0), k) + ": cada letra " + (k > 0 ? "avanza " : "retrocede ") + n + " posici" + (n > 1 ? "ones" : "ón") +
                 " (compruébalo con la segunda: " + ej.charAt(1) + " → " + cifrar(ej.charAt(1), k) + "). Así, " + obj + " → " + sol + "." };
    },
    /* Verbal: orden alfabético con tres palabras de la misma inicial. */
    orden: function () {
      var ini = uno(INICIALES);
      var mismas = AA.shuffle(PALABRAS.filter(function (w) { return w.charAt(0) === ini; })).slice(0, 3);
      var otras = AA.shuffle(PALABRAS.filter(function (w) { return w.charAt(0) !== ini; })).slice(0, 2);
      var dadas = AA.shuffle(mismas.concat(otras));
      var ord = dadas.slice().sort(compararEs);
      var p = ent(1, 3);
      var sol = ord[p];
      var vecinas = AA.shuffle([ord[p - 1], ord[p + 1]]);
      var o = conOpciones(sol, vecinas.concat(AA.shuffle(ord.filter(function (w, i) { return i < p - 1 || i > p + 1; }))));
      var todas = dadas.join(" ");
      var notas = [];
      if (/Ñ/.test(todas)) notas.push("la Ñ va entre la N y la O");
      if (/LL|CH/.test(todas)) notas.push("CH y LL no son letras aparte: se ordenan letra a letra");
      return { tipo: "verbal", vista: "palabras", enunciado: "Si ordenas alfabéticamente estas palabras, ¿cuál queda en " + ["", "segundo", "tercer", "cuarto"][p] + " lugar?",
               datos: [dadas], opciones: o.opciones, correcta: o.correcta,
               explicacion: "Orden: " + ord.join(", ") + ". Las que empiezan igual se ordenan por la primera letra distinta" + (notas.length ? "; " + notas.join("; ") : "") + "." };
    },
  };
  var POR_TIPO = {
    series: ["aritmetica", "geometrica", "diferencias", "alterna", "suma_anteriores"],
    letras: ["letras", "letras_alternas"],
    calculo: ["porcentaje", "regla_tres", "mental"],
    atencion: ["copia", "pares", "contar"],
    abstracto: ["giro", "analogia", "matriz"],
    verbal: ["cifrado", "orden"],
  };
  var CATEGORIAS = ["series", "letras", "calculo", "atencion", "abstracto", "verbal"];

  /* n ejercicios del tipo pedido. El mixto reparte por igual entre categorías; dentro de cada una, los generadores
     se turnan en orden aleatorio para que no se repita el mismo mientras queden otros. */
  function generar(tipo, n) {
    var cats = POR_TIPO[tipo] ? [tipo] : AA.shuffle(CATEGORIAS);
    var colas = {};
    var out = [];
    for (var i = 0; i < n; i++) {
      var c = cats[i % cats.length];
      if (!colas[c] || !colas[c].length) colas[c] = AA.shuffle(POR_TIPO[c]);
      out.push(GEN[colas[c].pop()]());
    }
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

  AA.psico = { interno: { GEN: GEN, POR_TIPO: POR_TIPO, CATEGORIAS: CATEGORIAS, TIPOS: TIPOS, generar: generar, nota: nota,
                          esperanza: esperanza, ALFABETO: ALFABETO, PALABRAS: PALABRAS, SIMB: SIMB } };

  /* ---------- Vista ---------- */
  var P = null; // sesión de práctica
  var reloj = null;
  var elegido = { tipo: "mixto", n: 20 }; // última configuración, para «Volver»

  V.psicotecnicos = function () {
    var cont = h("div");
    pintar(cont);
    return cont;
  };

  /* Cambia de pantalla (ejercicio, resultado, inicio) y vuelve arriba, como el test. */
  function ir(cont) {
    pintar(cont);
    window.scrollTo({ top: 0 });
  }

  function pintar(cont) {
    cont.textContent = "";
    clearInterval(reloj);
    if (P && !P.fin) {
      // El cronómetro se para solo si se sale de la página (la vista deja de estar en el documento)
      reloj = setInterval(function () {
        if (!P || P.fin || !document.body.contains(cont)) { clearInterval(reloj); return; }
        var resta = P.limite - Math.round((Date.now() - P.inicio) / 1000);
        if (resta <= 0) { terminar(); ir(cont); return; }
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
      h("p", { class: "muted" }, "Las bases no publican el tipo de ejercicios. Aquí practicas los más habituales en estas pruebas, con ejercicios originales generados al momento: series numéricas y de letras, cálculo rápido, atención (comparar códigos y contar), razonamiento abstracto con símbolos y razonamiento verbal (palabras cifradas y orden alfabético).")));

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
      h("h2", { class: "sec-title" }, "Trucos por tipo de ejercicio"),
      h("ul", { class: "lista-simple" },
        ["Por 5: multiplica por 10 y divide entre 2. Por 25: por 100 y entre 4. Por 11: el número por 10 más el número.",
         "Porcentajes: el 10 % es correr la coma; el 5 % es la mitad del 10 %; el 1 % es correr la coma dos veces.",
         "Regla de tres: decide primero si es directa (más → más) o inversa (más agentes → menos horas).",
         "Series: mira las diferencias entre términos; si no son constantes, mira las diferencias de las diferencias, los cocientes y las posiciones pares e impares por separado.",
         "Letras: escribe el alfabeto con números (A=1 … N=14, Ñ=15 … Z=27) y trabaja con números.",
         "Fracciones útiles: 1/8 = 0,125; 1/4 = 0,25; 3/8 = 0,375; 1/3 ≈ 0,333; 2/3 ≈ 0,667.",
         "Comparar códigos: ve en bloques de tres o cuatro caracteres. Los cambios típicos son caracteres parecidos (S y 5, B y 8, Z y 2, M y N) y dos vecinos intercambiados.",
         "Contar: recorre la línea grupo a grupo y apunta cada parcial; contar de una vez es donde más se falla.",
         "Símbolos: sigue uno solo de fila en fila. Si todos se mueven igual, es un desplazamiento; si no, apunta adónde va cada posición.",
         "Matrices: mira qué falta en la fila y descarta con la columna.",
         "Palabras cifradas: saca la distancia con la primera letra (C → E es +2), compruébala con la segunda y cuenta la Ñ."].map(function (t) { return h("li", {}, t); }))));

    // Práctica
    var cfg = elegido;
    var tipos = h("div", { class: "psico-tipos", role: "group", "aria-label": "Tipo de ejercicio" });
    TIPOS.forEach(function (t) {
      var b = h("button", { type: "button", class: t[0] === "mixto" ? "psico-tipo psico-tipo--todos" : "psico-tipo", "aria-pressed": cfg.tipo === t[0] ? "true" : "false", onclick: function () {
        cfg.tipo = t[0];
        tipos.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      } }, h("strong", {}, t[1]), h("span", {}, t[2]));
      tipos.appendChild(b);
    });
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
      tipos,
      h("div", { class: "row" }, seg("Número", [[10, "10"], [20, "20"], [40, "40"]], "n"), h("span", { class: "muted" }, "30 segundos por ejercicio · 4 opciones · cada error resta 1/3")),
      h("div", {}, h("button", { class: "btn btn--primary", onclick: function () { empezar(cfg.tipo, cfg.n); ir(cont); } }, "Empezar")),
      hist.length ? h("div", { class: "muted", style: "font-size:.9rem" }, "Últimas notas: " + hist.map(function (s) { return (NOMBRE[s.tipo] || s.tipo) + " " + AA.fmt1(s.nota); }).join(" · ")) : null));
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

  /* Los datos del ejercicio (códigos, filas de símbolos, matriz, palabras), en letra de ancho fijo. */
  function pintarDatos(x) {
    return h("div", { class: "psico-datos" + (x.simbolos ? " psico-datos--simb" : "") + (x.vista ? " psico-datos--" + x.vista : "") },
      x.datos.map(function (fila) {
        return h("div", { class: "psico-fila" }, fila.map(function (c) {
          return h("span", { class: "psico-celda" + (c === "?" ? " psico-hueco" : c === "·" ? " psico-oculta" : "") }, c);
        }));
      }));
  }

  function pintarEjercicio(cont) {
    var x = P.ej[P.i];
    var restante = P.limite - Math.round((Date.now() - P.inicio) / 1000);
    if (restante <= 0) { terminar(); return pintar(cont); }
    cont.appendChild(h("div", { class: "qhead" },
      h("div", {}, h("div", { class: "eyebrow" }, "Psicotécnicos · " + (NOMBRE[P.tipo] || P.tipo) + (P.tipo === "mixto" ? " · " + NOMBRE[x.tipo] : "")),
        h("div", { class: "num", style: "font-weight:600" }, "Ejercicio " + (P.i + 1) + " de " + P.ej.length)),
      h("span", { class: "timer num" }, AA.clock(restante))));
    cont.appendChild(h("p", { class: "qtext" }, x.enunciado));
    if (x.datos) cont.appendChild(pintarDatos(x));
    var opts = h("div", { class: "opts" });
    x.opciones.forEach(function (o, k) {
      opts.appendChild(h("button", { type: "button", class: "opt", "aria-pressed": P.resp[P.i] === k ? "true" : "false", onclick: function () {
        P.resp[P.i] = P.resp[P.i] === k ? null : k;
        if (P.i < P.ej.length - 1) { P.i++; ir(cont); }
        else pintar(cont); // en el último no se avanza: se queda a la vista de «Terminar»
      } }, h("span", { class: "l" }, LETRAS_OPC[k]), h("span", { class: x.simbolos ? "psico-op psico-op--simb" : x.mono ? "psico-op" : null }, o)));
    });
    cont.appendChild(opts);
    cont.appendChild(h("div", { class: "qnav" },
      h("button", { class: "btn", disabled: P.i === 0 ? true : null, onclick: function () { P.i--; ir(cont); } }, "← Anterior"),
      P.i < P.ej.length - 1 ? h("button", { class: "btn", onclick: function () { P.i++; ir(cont); } }, "Saltar →") : null,
      h("button", { class: "btn btn--primary", onclick: function () { terminar(); ir(cont); } }, "Terminar")));
  }

  function pintarResultado(cont) {
    var r = P.res;
    cont.appendChild(h("div", { class: "eyebrow" }, "Psicotécnicos · " + (NOMBRE[P.tipo] || P.tipo)));
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
        h("div", { class: "body" },
          x.datos ? pintarDatos(x) : null,
          h("div", { class: "explica" }, h("strong", {}, "Respuesta: " + x.opciones[x.correcta] + ". "), x.explicacion))));
    });
    cont.appendChild(lista);
    cont.appendChild(h("div", { class: "section row" },
      h("button", { class: "btn btn--primary", onclick: function () { empezar(P.tipo, P.ej.length); ir(cont); } }, "Otra tanda"),
      h("button", { class: "btn", onclick: function () { P = null; ir(cont); } }, "Volver")));
  }
})();
