// Fase 1: el progreso del usuario se guarda con el id fijo de cada pregunta/tarjeta y se migra desde los ids antiguos.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarWeb, datosMini } = require("./_sandbox.js");

const KEY = "academia-abierta-policia-v1";
const cargar = (extra) => cargarWeb(Object.assign({}, datosMini(), extra));
const guardado = (almacen) => JSON.parse(almacen[KEY]);

test("los bancos usan el id de la ficha, sin tocarlo", () => {
  const { AA } = cargar();
  assert.deepEqual(Array.from(AA.preguntas, (q) => q.id), ["q_01_01", "q_01_02", "q_01_03", "q_02_01"]);
  assert.deepEqual(Array.from(AA.tarjetas, (c) => c.id), ["t_01_01", "t_01_02", "t_02_01"]);
  assert.equal(AA.preguntaPorId["q_01_02"].q, "Pregunta dos");
});

test("el progreso se guarda y se lee con el id fijo", () => {
  const a = cargar();
  a.AA.store.responder("q_01_01", true);
  a.AA.store.responder("q_01_01", false);
  a.AA.store.calificarTarjeta("t_01_02", 2);
  a.AA.store.commit();
  const s = guardado(a.almacen);
  assert.deepEqual(Object.keys(s.preg), ["q_01_01"]);
  assert.equal(s.preg["q_01_01"].n, 2);
  assert.equal(s.preg["q_01_01"].ok, 1);
  assert.equal(s.preg["q_01_01"].last, 0);
  assert.deepEqual(Object.keys(s.tarj), ["t_01_02"]);
  // Otra «visita»: mismo almacenamiento, el progreso se recupera.
  const b = cargar({ storage: a.almacen });
  assert.equal(b.AA.store.regPregunta("q_01_01").n, 2);
  assert.equal(b.AA.store.tarjeta("t_01_02").caja, 2);
  assert.equal(b.AA.store.regPregunta("q_01_02"), null);
});

test("corregir el texto de una pregunta o tarjeta no pierde el historial", () => {
  const a = cargar();
  a.AA.store.responder("q_01_01", true);
  a.AA.store.calificarTarjeta("t_01_01", 2);
  a.AA.store.commit();
  const d = datosMini();
  d.temas[1].preguntas[0].enunciado = "Pregunta uno, con la errata corregida";
  d.temas[1].tarjetas[0].p = "Tarjeta uno corregida";
  const b = cargarWeb(Object.assign({}, d, { storage: a.almacen }));
  assert.equal(b.AA.preguntas[0].q, "Pregunta uno, con la errata corregida");
  assert.equal(b.AA.preguntas[0].id, "q_01_01");
  assert.equal(b.AA.store.regPregunta("q_01_01").ok, 1);
  assert.equal(b.AA.store.tarjeta("t_01_01").caja, 2);
  assert.equal(b.AA.store.statsTema(1).vistas, 1);
});

test("migra el progreso guardado con los ids antiguos (hash del texto) a los ids fijos", () => {
  const base = cargar();
  const hp = (tema, txt) => `${tema}.${base.AA.hash(txt)}`;
  const antiguo = { v: 1, leidos: { 1: 5 }, preg: {}, tarj: {}, sims: [{ n: 20 }], ult: null, tema: 1, nov: ["x"] };
  antiguo.preg[hp(1, "Pregunta uno")] = { n: 3, ok: 2, last: 1, ts: 7 };
  antiguo.preg[hp(2, "Pregunta cuatro")] = { n: 1, ok: 0, last: 0, ts: 8 };
  antiguo.tarj[hp(1, "Tarjeta uno")] = { caja: 3, due: 123, n: 4 };
  const b = cargar({ storage: { [KEY]: JSON.stringify(antiguo) } });
  assert.deepEqual(b.AA.store.regPregunta("q_01_01"), { n: 3, ok: 2, last: 1, ts: 7 });
  assert.equal(b.AA.store.regPregunta("q_02_01").last, 0);
  assert.equal(b.AA.store.tarjeta("t_01_01").caja, 3);
  assert.equal(b.AA.store.fallosPendientes().length, 1);
  const s = guardado(b.almacen); // la migración se guarda y se limpian las claves antiguas
  assert.equal(s.ids, 2);
  assert.deepEqual(Object.keys(s.preg).sort(), ["q_01_01", "q_02_01"]);
  assert.deepEqual(Object.keys(s.tarj), ["t_01_01"]);
  assert.deepEqual(s.leidos, { 1: 5 });
  assert.equal(s.sims.length, 1);
  assert.deepEqual(s.nov, ["x"]);
  // Segunda visita: no vuelve a tocar nada.
  const c = cargar({ storage: b.almacen });
  assert.deepEqual(guardado(c.almacen), s);
});

test("si ya hay progreso con el id nuevo, la migración no lo pisa", () => {
  const base = cargar();
  const viejo = `1.${base.AA.hash("Pregunta uno")}`;
  const o = { v: 1, preg: { [viejo]: { n: 1, ok: 1, last: 1, ts: 1 }, q_01_01: { n: 9, ok: 9, last: 1, ts: 9 } }, tarj: {} };
  const b = cargar({ storage: { [KEY]: JSON.stringify(o) } });
  assert.equal(b.AA.store.regPregunta("q_01_01").n, 9);
});

test("el estado ya migrado (ids: 2) no se altera", () => {
  const o = { v: 1, ids: 2, preg: { "1.abc": { n: 1, ok: 0, last: 0, ts: 1 } }, tarj: {}, leidos: {}, sims: [], nov: [], tema: 0, ult: null };
  const b = cargar({ storage: { [KEY]: JSON.stringify(o) } });
  assert.ok(b.AA.store.regPregunta("1.abc"));
});

test("el estado nuevo ya nace con la versión de ids actual", () => {
  const a = cargar();
  assert.equal(a.AA.store.estado().ids, 2);
  a.AA.store.reiniciar();
  assert.equal(guardado(a.almacen).ids, 2);
});

test("importar una copia de seguridad antigua también migra los ids", () => {
  const a = cargar();
  const copia = { v: 1, preg: {}, tarj: {}, leidos: {}, sims: [], nov: [], tema: 0, ult: null };
  copia.preg[`1.${a.AA.hash("Pregunta tres")}`] = { n: 2, ok: 2, last: 1, ts: 3 };
  copia.tarj[`2.${a.AA.hash("Tarjeta tres")}`] = { caja: 2, due: 5, n: 1 };
  a.AA.store.importar(JSON.stringify(copia));
  assert.equal(a.AA.store.regPregunta("q_01_03").ok, 2);
  assert.equal(a.AA.store.tarjeta("t_02_01").caja, 2);
  assert.equal(guardado(a.almacen).ids, 2);
});
