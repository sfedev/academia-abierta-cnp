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

// Recalcula la respuesta de cada generador a partir del enunciado, sin mirar la explicación
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
};

test("cada generador: 4 opciones distintas, la correcta es la que sigue la regla y hay explicación", () => {
  const { AA } = web(7);
  const G = AA.psico.interno.GEN;
  assert.deepEqual(Object.keys(G).sort(), Object.keys(COMPROBAR).sort());
  for (const nombre of Object.keys(G)) {
    for (let i = 0; i < 300; i++) {
      const x = G[nombre]();
      assert.equal(x.opciones.length, 4, nombre);
      assert.equal(new Set(x.opciones).size, 4, `${nombre}: opciones repetidas ${x.opciones}`);
      x.opciones.forEach((o) => assert.ok(o !== "" && !/NaN|undefined|Infinity|'/.test(o), `${nombre}: opción rara ${o}`));
      assert.ok(Number.isInteger(x.correcta) && x.correcta >= 0 && x.correcta < 4, nombre);
      assert.ok(["series", "letras", "calculo"].includes(x.tipo), nombre);
      assert.ok(x.enunciado.length > 10 && x.explicacion.length > 10, nombre);
      assert.equal(String(respuesta(x)), String(COMPROBAR[nombre](x)), `${nombre}: ${x.enunciado} -> ${respuesta(x)}`);
    }
  }
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

test("generar: respeta el tipo y el número; el mixto incluye los tres tipos", () => {
  const { AA } = web(3);
  const gen = AA.psico.interno.generar;
  for (const tipo of ["series", "letras", "calculo"]) {
    const l = gen(tipo, 12);
    assert.equal(l.length, 12);
    l.forEach((x) => assert.equal(x.tipo, tipo));
  }
  const tipos = new Set(gen("mixto", 20).map((x) => x.tipo));
  assert.deepEqual([...tipos].sort(), ["calculo", "letras", "series"]);
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
