// Fase 5: lógica de negocio de la web: Leitner, nota del test, muestreo ponderado y simulacro.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarWeb, datosMini } = require("./_sandbox.js");

const DIA = 24 * 3600 * 1000;

/* Generador pseudoaleatorio con semilla (mulberry32): las pruebas estadísticas son repetibles. */
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

/* n temas con `bancos[i]` preguntas y `medias[i]` preguntas por examen. */
function datosSinteticos(medias, bancos) {
  const meta = { bloques: [{ id: "A", nombre: "A", temas: [1, medias.length] }], temas: [] };
  const temas = {};
  medias.forEach((media, i) => {
    const t = i + 1, nn = String(t).padStart(2, "0");
    meta.temas.push({ tema: t, titulo: "T" + t, bloque: "A", oficial: "o", peso: "medio", media });
    temas[t] = {
      tema: t,
      preguntas: Array.from({ length: bancos[i] }, (_, k) => ({ id: `q_${nn}_${String(k + 1).padStart(2, "0")}`, enunciado: `P ${t}.${k}`, opciones: ["a", "b", "c"], correcta: 0, explicacion: "e", ref: "r" })),
      tarjetas: [],
    };
  });
  return { meta, temas };
}

// ------------------------------------------------------------------ nota del test
test("nota oficial: [A − E/(n−1)] × 10 / P con n = 3", () => {
  const { AA } = cargarWeb(datosMini());
  assert.equal(AA.notaTest(70, 20, 100), 6); // ejemplo de la página «Proceso»: (70 − 10) × 10 / 100
  assert.equal(AA.notaTest(100, 0, 100), 10);
  assert.equal(AA.notaTest(0, 0, 100), 0); // en blanco no resta
  assert.equal(AA.notaTest(50, 0, 100), 5);
  assert.equal(AA.notaTest(40, 20, 60), 5); // cada error resta medio acierto: (40 − 10) × 10 / 60
  assert.equal(AA.notaTest(0, 100, 100), -5); // sin recortar a 0 (el test lo recorta al mostrar)
  assert.equal(AA.notaTest(0, 0, 0), 0); // sin preguntas no divide por cero
});

test("dos errores compensan exactamente un acierto", () => {
  const { AA } = cargarWeb(datosMini());
  assert.equal(AA.notaTest(10, 2, 20), AA.notaTest(9, 0, 20));
});

// ------------------------------------------------------------------ Leitner
test("Leitner: una tarjeta nueva está pendiente y al acertarla sube de caja con intervalos 3, 7, 16 y 35 días", () => {
  const { AA, reloj } = cargarWeb(datosMini());
  const s = AA.store;
  assert.equal(s.pendientesTarjetas().length, 3);
  const esperado = [[2, 3], [3, 7], [4, 16], [5, 35], [5, 35]];
  for (const [caja, dias] of esperado) {
    const t0 = reloj.ahora;
    s.calificarTarjeta("t_01_01", 2);
    const r = s.tarjeta("t_01_01");
    assert.equal(r.caja, caja);
    assert.equal(r.due, t0 + dias * DIA);
    reloj.ahora = r.due; // llega el día del repaso
  }
  assert.equal(s.tarjeta("t_01_01").n, 5);
});

test("Leitner: fallar devuelve a la caja 1 y repite al día siguiente", () => {
  const { AA, reloj } = cargarWeb(datosMini());
  const s = AA.store;
  s.calificarTarjeta("t_01_01", 2);
  s.calificarTarjeta("t_01_01", 2);
  assert.equal(s.tarjeta("t_01_01").caja, 3);
  s.calificarTarjeta("t_01_01", 0);
  const r = s.tarjeta("t_01_01");
  assert.equal(r.caja, 1);
  assert.equal(r.due, reloj.ahora + DIA);
});

test("Leitner: «dudosa» mantiene la caja y acorta el intervalo a la mitad (mínimo un día)", () => {
  const { AA, reloj } = cargarWeb(datosMini());
  const s = AA.store;
  s.calificarTarjeta("t_01_01", 1); // caja 1: 0,5 días → 1 día
  assert.equal(s.tarjeta("t_01_01").caja, 1);
  assert.equal(s.tarjeta("t_01_01").due, reloj.ahora + DIA);
  s.calificarTarjeta("t_01_02", 2);
  s.calificarTarjeta("t_01_02", 2); // caja 3 (7 días)
  s.calificarTarjeta("t_01_02", 1); // dudosa en caja 3: 7/2 = 3,5 días
  assert.equal(s.tarjeta("t_01_02").caja, 3);
  assert.equal(s.tarjeta("t_01_02").due, reloj.ahora + 3.5 * DIA);
});

test("Leitner: una tarjeta vuelve a estar pendiente cuando vence y se cuentan las dominadas (caja ≥ 4)", () => {
  const { AA, reloj } = cargarWeb(datosMini());
  const s = AA.store;
  s.calificarTarjeta("t_01_01", 2); // vence en 3 días
  assert.equal(s.pendientesTarjetas().map((c) => c.id).includes("t_01_01"), false);
  reloj.ahora += 3 * DIA - 1;
  assert.equal(s.pendientesTarjetas().map((c) => c.id).includes("t_01_01"), false);
  reloj.ahora += 1;
  assert.equal(s.pendientesTarjetas().map((c) => c.id).includes("t_01_01"), true);
  for (let i = 0; i < 3; i++) s.calificarTarjeta("t_01_01", 2); // cajas 3, 4, 5
  assert.equal(s.tarjetasDominadas(), 1);
  assert.equal(s.tarjetasVistas(), 1);
  assert.deepEqual(Array.from(s.pendientesTarjetas([2]), (c) => c.id), ["t_02_01"]); // filtro por temas
});

// ------------------------------------------------------------------ muestreo ponderado
test("peso de cada pregunta: sin ver = 2, fallada = 3, acertada = 1", () => {
  const w = cargarWeb(Object.assign(datosMini(), { test: true }));
  const { AA } = w;
  AA.store.responder("q_01_01", false);
  AA.store.responder("q_01_02", true);
  const pesos = Array.from(AA.preguntas, (q) => w.ctx.AA.test.interno.pesoP(q));
  assert.deepEqual(pesos, [3, 1, 2, 2]);
});

test("el muestreo no repite preguntas ni devuelve más de las que hay", () => {
  const w = cargarWeb(Object.assign(datosMini(), { test: true, random: semilla(7) }));
  const { muestra } = w.AA.test.interno;
  const dos = muestra(w.AA.preguntas, 2);
  assert.equal(dos.length, 2);
  assert.equal(new Set(Array.from(dos, (q) => q.id)).size, 2);
  assert.equal(muestra(w.AA.preguntas, 50).length, w.AA.preguntas.length);
  assert.equal(muestra([], 5).length, 0);
});

test("el muestreo favorece lo fallado y lo no visto frente a lo ya dominado (proporciones 3 : 2 : 1)", () => {
  const w = cargarWeb(Object.assign(datosMini(), { test: true, random: semilla(12345) }));
  const { AA } = w;
  AA.store.responder("q_01_01", false); // fallada: peso 3
  AA.store.responder("q_01_02", true); // dominada: peso 1
  // q_01_03 sin ver: peso 2; se excluye q_02_01 de la bolsa
  const bolsa = AA.preguntas.slice(0, 3);
  const veces = { q_01_01: 0, q_01_02: 0, q_01_03: 0 };
  const N = 30000;
  for (let i = 0; i < N; i++) veces[w.AA.test.interno.muestra(bolsa, 1)[0].id]++;
  const frac = (id) => veces[id] / N;
  assert.ok(Math.abs(frac("q_01_01") - 3 / 6) < 0.02, "fallada " + frac("q_01_01"));
  assert.ok(Math.abs(frac("q_01_03") - 2 / 6) < 0.02, "sin ver " + frac("q_01_03"));
  assert.ok(Math.abs(frac("q_01_02") - 1 / 6) < 0.02, "dominada " + frac("q_01_02"));
});

test("el filtro de origen: «fallos» y «nuevas»", () => {
  const w = cargarWeb(Object.assign(datosMini(), { test: true }));
  const { AA } = w;
  AA.store.responder("q_01_01", false);
  AA.store.responder("q_01_02", true);
  const { poolBase } = AA.test.interno;
  assert.deepEqual(Array.from(poolBase({ origen: "fallos" }), (q) => q.id), ["q_01_01"]);
  assert.deepEqual(Array.from(poolBase({ origen: "nuevas" }), (q) => q.id), ["q_01_03", "q_02_01"]);
  assert.deepEqual(Array.from(poolBase({ temas: [2] }), (q) => q.id), ["q_02_01"]);
  assert.equal(poolBase({ bloque: "A" }).length, 3);
});

// ------------------------------------------------------------------ simulacro
test("simulacro: reparte las preguntas por tema en proporción a la media de los últimos exámenes", () => {
  const medias = [8, 5, 3, 3, 2, 2, 1, 1, 0.5, 0.5];
  const w = cargarWeb(Object.assign(datosSinteticos(medias, medias.map(() => 40)), { test: true, random: semilla(99) }));
  const sim = w.AA.test.interno.simulacro(100);
  assert.equal(sim.length, 100);
  assert.equal(new Set(Array.from(sim, (q) => q.id)).size, 100);
  const total = medias.reduce((a, b) => a + b, 0);
  medias.forEach((m, i) => {
    const n = Array.from(sim).filter((q) => q.tema === i + 1).length;
    const ideal = (100 * m) / total;
    assert.ok(Math.abs(n - ideal) < 1, `tema ${i + 1}: ${n} preguntas, ideal ${ideal.toFixed(2)}`);
  });
});

test("simulacro: un tema con pocas preguntas no se pasa de su banco y el resto se reparte entre los demás", () => {
  const medias = [10, 10, 10];
  const w = cargarWeb(Object.assign(datosSinteticos(medias, [3, 40, 40]), { test: true, random: semilla(5) }));
  const sim = Array.from(w.AA.test.interno.simulacro(60));
  assert.equal(sim.length, 60);
  assert.equal(sim.filter((q) => q.tema === 1).length, 3);
  assert.equal(sim.filter((q) => q.tema === 2).length + sim.filter((q) => q.tema === 3).length, 57);
});

test("simulacro: si el banco total es menor que lo pedido, devuelve todo el banco", () => {
  const w = cargarWeb(Object.assign(datosSinteticos([5, 5], [4, 6]), { test: true, random: semilla(3) }));
  assert.equal(w.AA.test.interno.simulacro(100).length, 10);
});

test("simulacro: los temas sin media se dejan fuera y, si ninguno la tiene, se muestrea todo el banco", () => {
  const w = cargarWeb(Object.assign(datosSinteticos([4, 0], [10, 10]), { test: true, random: semilla(1) }));
  const sim = Array.from(w.AA.test.interno.simulacro(8));
  assert.ok(sim.every((q) => q.tema === 1));
  const w2 = cargarWeb(Object.assign(datosSinteticos([0, 0], [10, 10]), { test: true, random: semilla(1) }));
  assert.equal(w2.AA.test.interno.simulacro(8).length, 8);
});

test("simulacro con los datos reales: 100 preguntas distintas con el reparto de los cinco últimos exámenes", () => {
  const w = cargarWeb({ datosReales: true, test: true, random: semilla(2026) });
  const { AA } = w;
  const sim = Array.from(AA.test.interno.simulacro(100));
  assert.equal(sim.length, 100);
  assert.equal(new Set(sim.map((q) => q.id)).size, 100);
  const total = AA.listaTemas.reduce((s, t) => s + (t.media || 0), 0);
  for (const t of AA.listaTemas) {
    const n = sim.filter((q) => q.tema === t.tema).length;
    const banco = AA.preguntas.filter((q) => q.tema === t.tema).length;
    assert.ok(n <= banco, `tema ${t.tema}`);
    assert.ok(Math.abs(n - (100 * t.media) / total) < 1.01, `tema ${t.tema}: ${n} frente a ${(100 * t.media / total).toFixed(2)}`);
  }
  // El bloque A (jurídicas) pesa entre 70 y 76 de cada 100, como en los exámenes reales.
  const a = sim.filter((q) => q.bloque === "A").length;
  assert.ok(a >= 68 && a <= 78, "bloque A: " + a);
});

// ------------------------------------------------------------------ utilidades
test("util: hash FNV-1a estándar (vectores de prueba) y escape de HTML", () => {
  const { AA } = cargarWeb(datosMini());
  assert.equal(AA.hash("a"), (0xe40c292c).toString(36));
  assert.equal(AA.hash("foobar"), (0xbf9cf968).toString(36));
  assert.equal(AA.hash(""), (0x811c9dc5).toString(36));
  assert.equal(AA.rich("**ok** <b>x</b> & \"y\""), "<strong>ok</strong> &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;");
  assert.equal(AA.plain("a **b** c"), "a b c");
  assert.equal(AA.norm("Policía Nacional"), "policia nacional");
  assert.equal(AA.clock(125), "02:05");
  assert.equal(AA.fecha("2026-10-16"), "16/10/2026");
  assert.equal(AA.pct(1, 3), 33);
  assert.equal(AA.pct(5, 0), 0);
});
