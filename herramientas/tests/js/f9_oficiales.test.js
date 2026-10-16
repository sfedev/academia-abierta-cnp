// Fase 9 (plan F3): exámenes oficiales importados, calibración de nivel y mezcla de dificultad del simulacro.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarWeb, datosMini } = require("./_sandbox.js");

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

function examen(over) {
  const preguntas = [
    { n: 1, enunciado: "¿Plazo máximo de la detención preventiva?", opciones: ["72 horas", "48 horas", "24 horas"], correcta: 0, anulada: false, tema: 1 },
    { n: 2, enunciado: "¿Pregunta anulada?", opciones: ["a", "b", "c"], correcta: null, anulada: true, tema: 2 },
    { n: 3, enunciado: "¿Sin tema estimado?", opciones: ["a", "b", "c"], correcta: 2, anulada: false, tema: null },
  ];
  return Object.assign({ formato: "academia-abierta-examen-v1", codigo: "P41", titulo: "Examen de prueba", fecha: "2025-03-01", preguntas }, over || {});
}

// ------------------------------------------------------------------ importación
test("validar: acepta un examen correcto y rechaza los mal formados", () => {
  const { AA } = cargarWeb(Object.assign(datosMini(), { oficiales: true }));
  assert.deepEqual(Array.from(AA.oficiales.validar(examen())), []);
  assert.match(AA.oficiales.validar({ formato: "otro" })[0], /formato/);
  assert.match(AA.oficiales.validar(examen({ codigo: "con espacios" })).join(" "), /código/);
  const malo = examen();
  malo.preguntas[0].opciones = ["solo", "dos"];
  malo.preguntas[2].correcta = 7;
  const errores = AA.oficiales.validar(malo).join(" ");
  assert.match(errores, /Pregunta 1: debe tener 3 opciones/);
  assert.match(errores, /Pregunta 3: sin respuesta correcta/);
});

test("importar, listar y eliminar se guardan solo en el navegador", () => {
  const w = cargarWeb(Object.assign(datosMini(), { oficiales: true }));
  assert.deepEqual(Array.from(w.AA.oficiales.importar(examen())), []);
  assert.deepEqual(Array.from(w.AA.oficiales.listar().map((e) => e.codigo)), ["P41"]);
  assert.ok(w.almacen["academia-abierta-oficiales-v1"].includes("P41"));
  // otra carga con el mismo almacenamiento lo recupera
  const w2 = cargarWeb(Object.assign(datosMini(), { oficiales: true, storage: w.almacen }));
  assert.equal(w2.AA.oficiales.listar().length, 1);
  w2.AA.oficiales.eliminar("P41");
  assert.equal(w2.AA.oficiales.listar().length, 0);
  assert.ok(w2.AA.oficiales.importar({ formato: "otro" }).length > 0); // lo inválido no se guarda
});

test("preguntasDe: excluye las anuladas y da ids propios y tema/bloque estimados", () => {
  const { AA } = cargarWeb(Object.assign(datosMini(), { oficiales: true }));
  const qs = AA.oficiales.preguntasDe(examen());
  assert.deepEqual(Array.from(qs.map((q) => q.id)), ["of_P41_1", "of_P41_3"]);
  assert.equal(qs[0].tema, 1);
  assert.equal(qs[0].bloque, "A");
  assert.equal(qs[1].tema, 0); // sin tema estimado
  assert.equal(qs[1].bloque, null);
  assert.ok(qs.every((q) => q.oficial));
});

test("el examen oficial usa la nota de corte de su convocatoria como objetivo", () => {
  const w = cargarWeb(Object.assign(datosMini(), { oficiales: true }));
  w.AA.go = () => {};
  const ex = examen();
  w.AA.test.prepararOficial(ex, "examen", w.AA.oficiales.preguntasDe(ex));
  const S = w.AA.test.interno.sesion();
  assert.equal(S.cfg.oficial, "P41");
  assert.equal(S.cfg.objetivo, 7.72);
  assert.equal(S.cfg.minutos, 1); // media pregunta por minuto, como el examen real (2 preguntas válidas)
  assert.equal(S.qs.length, 2);
  // sin nota de corte conocida, el objetivo general de 7,5
  const otro = examen({ codigo: "P99" });
  w.AA.test.prepararOficial(otro, "estudio", w.AA.oficiales.preguntasDe(otro));
  assert.equal(w.AA.test.interno.sesion().cfg.objetivo, 7.5);
  assert.equal(w.AA.test.interno.sesion().cfg.minutos, 0);
});

// ------------------------------------------------------------------ calibración
test("calibración: compara el acierto del banco propio con el de las preguntas oficiales", () => {
  const w = cargarWeb(Object.assign(datosMini(), { oficiales: true }));
  const S = w.AA.store.estado();
  // banco propio: 8 de 10 intentos acertados
  w.AA.preguntas.slice(0, 2).forEach((q, i) => { S.preg[q.id] = { n: 5, ok: i === 0 ? 5 : 3, last: 1, ts: 0 }; });
  let c = w.AA.oficiales.calibracion();
  assert.equal(c.propia.pct, 80);
  assert.equal(c.suficiente, false); // todavía no hay preguntas oficiales
  assert.equal(c.notaEstimada, null);
  // 40 respuestas oficiales con un 60 % de acierto
  for (let i = 0; i < 40; i++) S.preg["of_P41_" + i] = { n: 1, ok: i < 24 ? 1 : 0, last: i < 24 ? 1 : 0, ts: 0 };
  // simulacros propios con nota 8 y ningún examen oficial completo: se proyecta con el factor
  for (let i = 0; i < 2; i++) S.sims.push({ ts: i, n: 100, a: 85, e: 10, b: 5, nota: 8, oficial: null });
  c = w.AA.oficiales.calibracion();
  assert.equal(c.oficial.pct, 60);
  assert.equal(c.suficiente, true);
  assert.equal(c.factor, 0.75);
  assert.equal(c.notaEstimada, 6); // 8 × 0,75
  // con exámenes oficiales hechos, manda su nota
  S.sims.push({ ts: 9, n: 98, a: 70, e: 20, b: 8, nota: 6.12, oficial: "P41" });
  assert.equal(w.AA.oficiales.calibracion().notaEstimada, 6.12);
});

// ------------------------------------------------------------------ mezcla de dificultad
function bancoConDificultades() {
  // 3 temas de 60 preguntas: 70 % fáciles, 20 % medias, 10 % difíciles
  const meta = { bloques: [{ id: "A", nombre: "A", temas: [1, 3] }], temas: [] };
  const temas = {};
  for (let t = 1; t <= 3; t++) {
    const nn = String(t).padStart(2, "0");
    meta.temas.push({ tema: t, titulo: "T" + t, bloque: "A", oficial: "o", peso: "medio", media: 10 });
    temas[t] = { tema: t, tarjetas: [], preguntas: Array.from({ length: 60 }, (_, k) => ({
      id: `q_${nn}_${String(k + 1).padStart(2, "0")}`, enunciado: `P${t}.${k}`, opciones: ["a", "b", "c"], correcta: 0,
      explicacion: "e", ref: "r", dificultad: k < 42 ? 1 : k < 54 ? 2 : 3 })) };
  }
  return { meta, temas };
}

test("simulacro: la mezcla de dificultad se acerca a la de los exámenes reales y la exigente es más difícil", () => {
  const w = cargarWeb(Object.assign(bancoConDificultades(), { test: true, random: semilla(7) }));
  const { simulacro, composicion, MEZCLAS } = w.AA.test.interno;
  const banco = composicion(w.AA.preguntas);
  const media = (mezcla) => {
    const acc = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 40; i++) {
      const c = composicion(Array.from(simulacro(30, mezcla)));
      [1, 2, 3].forEach((d) => { acc[d] += c[d] / 40; });
    }
    return acc;
  };
  const real = media(MEZCLAS.real);
  const exigente = media(MEZCLAS.exigente);
  // el banco tiene un 10 % de difíciles; el simulacro «real» busca un 20 % y el exigente un 30 %
  assert.ok(Math.abs(real[3] - 0.2) < Math.abs(banco[3] - 0.2), "real: " + JSON.stringify(real));
  assert.ok(exigente[3] > real[3] + 0.04, "exigente " + exigente[3] + " frente a real " + real[3]);
  assert.ok(exigente[1] < real[1], "menos fáciles en el exigente");
  // sigue respetando el reparto por tema
  const sim = Array.from(simulacro(30, MEZCLAS.real));
  [1, 2, 3].forEach((t) => assert.equal(sim.filter((q) => q.tema === t).length, 10));
});

test("simulacro sin mezcla: mismo comportamiento que antes", () => {
  const w = cargarWeb(Object.assign(bancoConDificultades(), { test: true, random: semilla(3) }));
  assert.equal(w.AA.test.interno.simulacro(30).length, 30);
  assert.equal(w.AA.test.interno.OBJETIVO, 7.5);
});
