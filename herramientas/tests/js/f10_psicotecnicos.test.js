// Fase 10 (plan F4): psicotécnicos (generadores, nota, estrategia con la penalización) y ajustes del opositor.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { cargarWeb, datosMini, WEB } = require("./_sandbox.js");

function semilla(n) {
  let a = n >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function web(seed, extra) {
  return cargarWeb(Object.assign(datosMini(), { psico: true, random: semilla(seed) }, extra || {}));
}

const ALF = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
// Términos de la serie: lo que va antes del «, ?» final
const serie = (x) => {
  const m = /((?:-?\d+|[A-ZÑ])(?:, (?:-?\d+|[A-ZÑ]))+), \?$/.exec(x.enunciado);
  assert.ok(m, `serie ilegible: ${x.enunciado}`);
  return m[1].split(", ");
};
const respuesta = (x) => x.opciones[x.correcta];
const filas = (x) => Array.from(x.datos, (f) => Array.from(f));
const desplazar = (a, k) => a.slice(k).concat(a.slice(0, k)); // k posiciones a la izquierda
// Un solo cambio: un carácter distinto o dos vecinos intercambiados (lo que hacen los ejercicios de atención)
function unCambio(a, b) {
  assert.equal(a.length, b.length, `${a} / ${b}: distinto largo`);
  const pos = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
  if (pos.length === 1) return true;
  return pos.length === 2 && pos[1] === pos[0] + 1 && a[pos[0]] === b[pos[1]] && a[pos[1]] === b[pos[0]];
}
// Orden alfabético español escrito aparte del de la web: índices en el alfabeto de 27 y comparación lexicográfica
const indices = (w) => [...w].map((l) => { const i = ALF.indexOf(l); assert.ok(i >= 0, `${w}: «${l}» no es del alfabeto`); return i; });
function compararEs(a, b) {
  const x = indices(a), y = indices(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
const desplazarLetras = (w, k) => indices(w).map((i) => ALF[(i + k + 270) % 27]).join("");

// Recalcula la respuesta de cada generador a partir del enunciado y los datos, sin mirar la explicación
const COMPROBAR = {
  aritmetica(x) { const t = serie(x).map(Number); const d = t[1] - t[0]; t.forEach((v, i) => i && assert.equal(v - t[i - 1], d)); return t[t.length - 1] + d; },
  geometrica(x) { const t = serie(x).map(Number); const r = t[1] / t[0]; t.forEach((v, i) => i && assert.equal(v / t[i - 1], r)); return t[t.length - 1] * r; },
  diferencias(x) {
    const t = serie(x).map(Number);
    const d = t.slice(1).map((v, i) => v - t[i]);
    const dd = d[1] - d[0];
    d.forEach((v, i) => i && assert.equal(v - d[i - 1], dd));
    return t[t.length - 1] + d[d.length - 1] + dd;
  },
  alterna(x) { const t = serie(x).map(Number); assert.equal(t.length, 6); assert.equal(t[4] - t[2], t[2] - t[0]); assert.equal(t[5] - t[3], t[3] - t[1]); return t[4] + (t[4] - t[2]); },
  suma_anteriores(x) { const t = serie(x).map(Number); for (let i = 2; i < t.length; i++) assert.equal(t[i], t[i - 1] + t[i - 2]); return t[t.length - 1] + t[t.length - 2]; },
  letras(x) {
    const t = serie(x).map((l) => ALF.indexOf(l));
    t.forEach((i) => assert.ok(i >= 0, "letra fuera del alfabeto"));
    const k = (t[1] - t[0] + 27) % 27;
    t.forEach((v, i) => i && assert.equal((v - t[i - 1] + 27) % 27, k));
    return ALF[(t[t.length - 1] + k) % 27];
  },
  letras_alternas(x) {
    const t = serie(x).map((l) => ALF.indexOf(l));
    assert.equal(t.length, 6);
    return ALF[(t[4] + (t[4] - t[2]) + 54) % 27];
  },
  porcentaje(x) { const m = /el (\d+) % de (\d+)/.exec(x.enunciado); return String((Number(m[1]) * Number(m[2])) / 100).replace(".", ","); },
  regla_tres(x) {
    const n = x.enunciado.match(/\d+/g).map(Number);
    if (/agentes/.test(x.enunciado)) return (n[0] * n[1]) / n[2]; // inversa
    return (n[1] / n[0]) * n[2]; // directa
  },
  mental(x) {
    const m = /(\d+) ([×−]) (\d+)/.exec(x.enunciado);
    return m[2] === "×" ? Number(m[1]) * Number(m[3]) : Number(m[1]) - Number(m[3]);
  },
  // Atención
  copia(x) {
    const [[etiqueta, modelo]] = filas(x);
    assert.equal(etiqueta, "Modelo:");
    assert.match(modelo, /^[A-HJ-NPR-Z2-9]{7,9}$/); // sin I, O, Q, 0 ni 1
    x.opciones.forEach((o) => assert.ok(o === modelo || unCambio(modelo, o), `${o} no es una copia con un solo cambio de ${modelo}`));
    return modelo;
  },
  pares(x) {
    const f = filas(x);
    assert.equal(f.length, 5);
    f.forEach(([n, a, b], i) => { assert.equal(n, `${i + 1}.`); assert.ok(a === b || unCambio(a, b), `par ${n}: ${a} / ${b}`); });
    return f.filter(([, a, b]) => a === b).length;
  },
  contar(x) {
    const obj = /«(.)»/.exec(x.enunciado)[1];
    const linea = filas(x)[0].join("");
    assert.equal(linea.length, 30);
    assert.ok(new Set(linea).size <= 4, "contar: solo caracteres parecidos");
    return [...linea].filter((c) => c === obj).length;
  },
  // Abstracto
  giro(x) {
    const f = filas(x);
    assert.deepEqual(f[f.length - 1], ["?"]);
    const t = f.slice(0, -1).map(([r]) => r.split(" "));
    assert.equal(t.length, 3);
    t.forEach((r) => assert.equal(new Set(r).size, 5, "cinco símbolos distintos"));
    const ks = [1, 2, 3, 4].filter((k) => desplazar(t[0], k).join() === t[1].join());
    assert.equal(ks.length, 1, "un único desplazamiento lleva de la 1.ª fila a la 2.ª");
    assert.equal(desplazar(t[1], ks[0]).join(), t[2].join(), "y el mismo lleva a la 3.ª");
    return desplazar(t[2], ks[0]).join(" ");
  },
  analogia(x) {
    const [[a, f1, a2], [b, f2, q]] = filas(x);
    assert.deepEqual([f1, f2, q], ["→", "→", "?"]);
    const [A, A2, B] = [a, a2, b].map((s) => s.split(" "));
    assert.equal(new Set(A.concat(B)).size, 8, "ejemplo y pregunta con cuatro símbolos distintos cada uno y sin compartirlos");
    assert.deepEqual([...A2].sort(), [...A].sort());
    assert.notEqual(a2, a, "el ejemplo cambia algo");
    const p = A2.map((s) => A.indexOf(s)); // en el lugar j acaba el símbolo que estaba en p[j]
    return p.map((i) => B[i]).join(" ");
  },
  matriz(x) {
    const g = filas(x);
    assert.equal(g.length, 4);
    g.forEach((fila) => assert.equal(fila.length, 4));
    const celdas = (v) => g.flatMap((fila, r) => fila.map((s, c) => (s === v ? [r, c] : null))).filter(Boolean);
    assert.equal(celdas("?").length, 1);
    assert.equal(celdas("·").length, 1);
    const [[r, c]] = celdas("?");
    const [[r2, c2]] = celdas("·");
    assert.equal(r2, r, "las dos casillas ocultas están en la misma fila");
    const columna = g.map((fila) => fila[c]);
    const validas = x.opciones.filter((o) => !g[r].includes(o) && !columna.includes(o));
    assert.equal(validas.length, 1, `matriz con ${validas.length} respuestas válidas`);
    // Rellena las dos casillas y comprueba que queda un cuadrado latino
    const lleno = g.map((fila) => fila.slice());
    lleno[r][c] = validas[0];
    const simbolos = [...new Set(g.flat().filter((s) => s !== "?" && s !== "·"))];
    assert.equal(simbolos.length, 4);
    lleno[r][c2] = simbolos.find((s) => !lleno[r].includes(s));
    for (let i = 0; i < 4; i++) {
      assert.equal(new Set(lleno[i]).size, 4, `fila ${i + 1}`);
      assert.equal(new Set(lleno.map((fila) => fila[i])).size, 4, `columna ${i + 1}`);
    }
    return validas[0];
  },
  // Verbal
  cifrado(x) {
    const m = /Si ([A-ZÑ]+) se escribe ([A-ZÑ]+), ¿cómo se escribe ([A-ZÑ]+)\?$/.exec(x.enunciado);
    assert.ok(m, `cifrado ilegible: ${x.enunciado}`);
    assert.notEqual(m[1], m[3]);
    const k = (indices(m[2])[0] - indices(m[1])[0] + 27) % 27;
    assert.ok(k !== 0, "el código cambia las letras");
    assert.equal(desplazarLetras(m[1], k), m[2], "el ejemplo usa el mismo desplazamiento en todas las letras");
    return desplazarLetras(m[3], k);
  },
  orden(x) {
    const palabras = filas(x)[0];
    assert.equal(new Set(palabras).size, 5);
    const lugar = { segundo: 2, tercer: 3, cuarto: 4 }[/en (\w+) lugar\?$/.exec(x.enunciado)[1]];
    assert.ok(lugar, x.enunciado);
    x.opciones.forEach((o) => assert.ok(palabras.includes(o), `${o} no está en la lista`));
    return palabras.slice().sort(compararEs)[lugar - 1];
  },
};
const TIPOS = ["series", "letras", "calculo", "atencion", "abstracto", "verbal"];

// Comprobaciones comunes de un ejercicio: forma, opciones distintas y una sola opción que cumple la regla
function comprobarEjercicio(nombre, x) {
  assert.equal(x.opciones.length, 4, nombre);
  assert.equal(new Set(x.opciones).size, 4, `${nombre}: opciones repetidas ${x.opciones}`);
  x.opciones.forEach((o) => assert.ok(typeof o === "string" && o !== "" && !/NaN|undefined|null|Infinity|'|\?/.test(o), `${nombre}: opción rara ${o}`));
  assert.ok(Number.isInteger(x.correcta) && x.correcta >= 0 && x.correcta < 4, nombre);
  assert.ok(TIPOS.includes(x.tipo), nombre);
  assert.ok(x.enunciado.length > 10 && x.explicacion.length > 10, nombre);
  assert.doesNotMatch(x.explicacion, /undefined|NaN|null/, nombre);
  if (x.datos) filas(x).forEach((f) => { assert.ok(f.length > 0); f.forEach((c) => assert.ok(typeof c === "string" && c !== "", `${nombre}: celda vacía`)); });
  const esperada = String(COMPROBAR[nombre](x));
  const validas = Array.from(x.opciones, (o, i) => (o === esperada ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(validas, [x.correcta], `${nombre}: ${x.enunciado} -> ${respuesta(x)} (esperada ${esperada})`);
}

test("cada generador: 4 opciones distintas, una sola cumple la regla, es la marcada y hay explicación", () => {
  const { AA } = web(7);
  const G = AA.psico.interno.GEN;
  assert.deepEqual(Object.keys(G).sort(), Object.keys(COMPROBAR).sort());
  for (const nombre of Object.keys(G)) {
    for (let i = 0; i < 300; i++) comprobarEjercicio(nombre, G[nombre]());
  }
});

test("con semillas fijas cada generador repite el mismo ejercicio y sigue dando una sola respuesta correcta", () => {
  for (const seed of [1, 2, 3, 42, 2026, 123456789]) {
    const A = web(seed).AA.psico.interno.GEN;
    const B = web(seed).AA.psico.interno.GEN;
    for (const nombre of Object.keys(COMPROBAR)) {
      for (let i = 0; i < 40; i++) {
        const x = A[nombre]();
        assert.equal(JSON.stringify(x), JSON.stringify(B[nombre]()), `${nombre} con semilla ${seed}`);
        comprobarEjercicio(nombre, x);
      }
    }
  }
});

test("atención y abstracto: salen todas las variantes previstas", () => {
  const { AA } = web(5);
  const G = AA.psico.interno.GEN;
  // pares: salen todos los recuentos de 1 a 4 (0 y 5 son raros, pero posibles)
  const recuentos = new Set();
  for (let i = 0; i < 400; i++) recuentos.add(Number(respuesta(G.pares())));
  [1, 2, 3, 4].forEach((n) => assert.ok(recuentos.has(n), `pares: nunca salen ${n} iguales`));
  // copia: entre los distractores hay caracteres cambiados y vecinos intercambiados
  let cambios = 0, trueques = 0;
  for (let i = 0; i < 200; i++) {
    const x = G.copia();
    const modelo = filas(x)[0][1];
    x.opciones.forEach((o) => {
      if (o === modelo) return;
      const pos = [...o].map((c, j) => (c === modelo[j] ? -1 : j)).filter((j) => j >= 0);
      if (pos.length === 2) trueques++; else cambios++;
    });
  }
  assert.ok(trueques > 50 && cambios > 200, `copia: ${trueques} trueques, ${cambios} cambios de carácter`);
  // giro: salen desplazamientos de 1 y 2 posiciones hacia los dos lados (1, 2, 3 y 4 hacia la izquierda)
  const giros = new Set();
  for (let i = 0; i < 200; i++) {
    const t = filas(G.giro()).slice(0, 2).map(([r]) => r.split(" "));
    giros.add([1, 2, 3, 4].find((k) => desplazar(t[0], k).join() === t[1].join()));
  }
  assert.deepEqual([...giros].sort(), [1, 2, 3, 4]);
});

test("palabras del razonamiento verbal: del alfabeto de 27, sin tildes ni repetidas, y el orden pone la Ñ tras la N", () => {
  const { AA } = web(1);
  const P = Array.from(AA.psico.interno.PALABRAS);
  assert.ok(P.length >= 60);
  assert.equal(new Set(P).size, P.length);
  P.forEach((w) => assert.match(w, /^[A-ZÑ]{3,8}$/, w));
  assert.ok(compararEs("SENDA", "SEÑAL") < 0 && compararEs("SEÑAL", "SERIE") < 0);
  assert.ok(compararEs("NINGUNO", "NIÑO") < 0 && compararEs("MONTAÑA", "MONTE") < 0);
  assert.ok(compararEs("LIBRO", "LLAVE") < 0 && compararEs("LLAVE", "LUNA") < 0); // la LL no es una letra aparte
  // Los ejercicios de orden mezclan tres palabras con la misma inicial
  for (let i = 0; i < 100; i++) {
    const p = filas(AA.psico.interno.GEN.orden())[0];
    const inic = {};
    p.forEach((w) => (inic[w[0]] = (inic[w[0]] || 0) + 1));
    assert.ok(Object.values(inic).some((n) => n >= 3), p.join(" "));
  }
});

test("símbolos de texto, no emoji: figuras geométricas y estrellas", () => {
  const { AA } = web(1);
  const S = Array.from(AA.psico.interno.SIMB);
  assert.equal(new Set(S).size, S.length);
  S.forEach((s) => {
    const cp = s.codePointAt(0);
    assert.equal([...s].length, 1);
    assert.ok((cp >= 0x25a0 && cp <= 0x25ff) || [0x2605, 0x2606, 0x2b24].includes(cp), s); // ⬤ no es emoji (⭕ sí)
  });
});

test("la respuesta correcta cae en todas las posiciones (no siempre la A)", () => {
  const { AA } = web(11);
  const pos = [0, 0, 0, 0];
  AA.psico.interno.generar("mixto", 400).forEach((x) => pos[x.correcta]++);
  pos.forEach((n) => assert.ok(n > 60, `posiciones ${pos}`));
});

test("alfabeto de 27 letras con la Ñ entre la N y la O", () => {
  const { AA } = web(1);
  const A = Array.from(AA.psico.interno.ALFABETO);
  assert.equal(A.length, 27);
  assert.equal(A.join(""), ALF);
  assert.equal(A[A.indexOf("N") + 1], "Ñ");
});

test("generar: respeta el tipo y el número; el mixto reparte por igual entre las seis categorías", () => {
  const { AA } = web(3);
  const I = AA.psico.interno;
  assert.deepEqual(Array.from(I.CATEGORIAS), TIPOS);
  assert.deepEqual(Array.from(I.TIPOS, (t) => t[0]), ["mixto"].concat(TIPOS));
  // cada generador está en una sola categoría y produce ejercicios de esa categoría
  const todos = TIPOS.flatMap((t) => Array.from(I.POR_TIPO[t]));
  assert.deepEqual(todos.slice().sort(), Object.keys(I.GEN).sort());
  for (const tipo of TIPOS) {
    I.POR_TIPO[tipo].forEach((g) => assert.equal(I.GEN[g]().tipo, tipo, g));
    const l = I.generar(tipo, 12);
    assert.equal(l.length, 12);
    l.forEach((x) => assert.equal(x.tipo, tipo));
  }
  for (const n of [10, 20, 40]) {
    const l = I.generar("mixto", n);
    assert.equal(l.length, n);
    const cuenta = {};
    l.forEach((x) => (cuenta[x.tipo] = (cuenta[x.tipo] || 0) + 1));
    assert.deepEqual(Object.keys(cuenta).sort(), TIPOS.slice().sort(), `mixto de ${n}`);
    const v = Object.values(cuenta);
    assert.ok(Math.max(...v) - Math.min(...v) <= 1, `mixto de ${n} desequilibrado: ${JSON.stringify(cuenta)}`);
  }
  assert.equal(I.generar("desconocido", 6).length, 6); // un tipo desconocido se trata como mixto
});

test("nota con la fórmula de las bases [A − E/(n−1)] × 10 / P", () => {
  const { AA } = web(1);
  const nota = AA.psico.interno.nota;
  assert.equal(nota(10, 3, 20, 4), 4.5); // cada error resta 1/3 con 4 opciones
  assert.equal(nota(20, 0, 20, 4), 10);
  assert.equal(nota(0, 0, 0, 4), 0);
  // con 3 opciones coincide con la nota del test de conocimientos
  assert.equal(nota(70, 20, 100, 3), AA.notaTest(70, 20, 100));
});

test("valor esperado: contestar al azar es neutro; descartar una opción ya compensa", () => {
  const { AA } = web(1);
  const ev = AA.psico.interno.esperanza;
  for (const n of [3, 4, 5]) {
    assert.ok(Math.abs(ev(n, n)) < 1e-12, `azar con ${n} opciones`);
    for (let k = 2; k < n; k++) assert.ok(ev(n, k) > 0, `n=${n} quedan=${k}`);
  }
  assert.ok(Math.abs(ev(4, 2) - 1 / 3) < 1e-12);
  assert.ok(Math.abs(ev(3, 2) - 0.25) < 1e-12);
});

test("store: ajustes y sesiones de psicotécnicos persisten; se guardan las 40 últimas", () => {
  const almacen = {};
  let c = web(1, { storage: almacen });
  assert.equal(c.AA.store.ajuste("a2"), undefined);
  c.AA.store.ajuste("a2", true);
  for (let i = 0; i < 45; i++) c.AA.store.guardarPsico({ ts: i, tipo: "mixto", n: 10, a: 5, e: 1, nota: 4.67 });
  c = web(1, { storage: almacen }); // recarga con el mismo almacenamiento
  assert.equal(c.AA.store.ajuste("a2"), true);
  const s = c.AA.store.psico();
  assert.equal(s.length, 40);
  assert.equal(s[0].ts, 5);
  assert.equal(s[39].ts, 44);
});

test("progreso antiguo sin ajustes ni psicotécnicos se carga sin errores", () => {
  const viejo = { v: 1, ids: 2, leidos: { 1: 1 }, preg: {}, tarj: {}, sims: [], ult: null, tema: 1, nov: [] };
  const { AA } = web(1, { storage: { "academia-abierta-policia-v1": JSON.stringify(viejo) } });
  assert.deepEqual(Array.from(AA.store.psico()), []);
  assert.equal(AA.store.ajuste("a2"), undefined);
  assert.ok(AA.store.leido(1));
});

test("plazo de solicitud estimado: 15 días hábiles sin sábados ni domingos", () => {
  const c = web(1);
  vm.runInContext(fs.readFileSync(path.join(WEB, "js", "vistas.js"), "utf8"), c.ctx, { filename: "vistas.js" });
  const proceso = JSON.parse(fs.readFileSync(path.join(WEB, "..", "datos", "proceso.json"), "utf8"));
  const cal = proceso.calendario2026;
  assert.equal(c.AA.plazoEstimado(cal.publicacion), cal.plazoFin); // convocatoria de 2026: 10/07 -> 31/07
  assert.equal(c.AA.plazoEstimado("2026-10-16", 1), "2026-10-19"); // viernes -> lunes
});

test("la web registra la página: ruta, menú «Más», script y estilos", () => {
  const app = fs.readFileSync(path.join(WEB, "js", "app.js"), "utf8");
  assert.match(app, /\["psicotecnicos", "Psicotécnicos"\]/);
  assert.match(app, /var MAS = \[[^\]]*"psicotecnicos"/);
  assert.match(app, /r === "psicotecnicos"\) vista = V\.psicotecnicos\(\)/);
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
  const i = (s) => html.indexOf(s);
  assert.ok(i("js/psicotecnicos.js") > i("js/store.js") && i("js/psicotecnicos.js") < i("js/app.js"));
  const css = fs.readFileSync(path.join(WEB, "css", "app.css"), "utf8");
  assert.match(css, /\.lista-simple/);
  const paginas = fs.readFileSync(path.join(WEB, "js", "paginas.js"), "utf8");
  assert.match(paginas, /enlace\("psicotecnicos"/);
});

test("psicotecnicos.js es ES5 (como el resto de la web)", () => {
  const src = fs.readFileSync(path.join(WEB, "js", "psicotecnicos.js"), "utf8");
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`/);
});
