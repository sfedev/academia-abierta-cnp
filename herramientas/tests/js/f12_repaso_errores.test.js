// Fase 12: cuaderno de errores (motivo de cada fallo), entrenamiento de velocidad (30 s por pregunta) y Modo Repaso
// Intensivo del Panel (fallos priorizados, temas más flojos y tarjetas de las cajas 1 y 2).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarWeb, datosMini } = require("./_sandbox.js");

const KEY = "academia-abierta-policia-v1";
const MIN = 60 * 1000;
const guardado = (almacen) => JSON.parse(almacen[KEY]);

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

/* 4 temas con 6 preguntas y 3 tarjetas cada uno (24 preguntas). El tema 4 no tiene «Lo imprescindible». */
function datosRepaso() {
  const meta = { bloques: [{ id: "A", nombre: "A", temas: [1, 4] }], temas: [] };
  const temas = {};
  const medias = [3, 3, 1, 2];
  for (let t = 1; t <= 4; t++) {
    const nn = String(t).padStart(2, "0");
    meta.temas.push({ tema: t, titulo: "Tema " + t, bloque: "A", oficial: "o", peso: "medio", media: medias[t - 1] });
    temas[t] = {
      tema: t,
      clave: t === 4 ? [] : ["**Clave** del tema " + t],
      preguntas: Array.from({ length: 6 }, (_, k) => ({
        id: `q_${nn}_0${k + 1}`, enunciado: `P ${t}.${k + 1}`, opciones: ["a", "b", "c"], correcta: k % 3, explicacion: "e", ref: "r",
      })),
      tarjetas: [1, 2, 3].map((k) => ({ id: `t_${nn}_0${k}`, p: `p ${t}.${k}`, r: "r" })),
    };
  }
  return { meta, temas };
}

/* Web con test.js y sin navegador: AA.go, AA.toast y scrollTo no hacen nada (el toast se anota). */
function web(extra, datos) {
  const w = cargarWeb(Object.assign(datos || datosRepaso(), { test: true, random: semilla(42) }, extra || {}));
  w.toasts = [];
  w.AA.go = () => {};
  w.AA.toast = (m) => w.toasts.push(m);
  w.ctx.scrollTo = () => {};
  return w;
}
const fallar = (AA, id) => AA.store.responder(id, false);
const acertar = (AA, id) => AA.store.responder(id, true);

// ------------------------------------------------------------------ cuaderno de errores
test("el motivo de un fallo se guarda con el último intento y se recupera en otra visita", () => {
  const a = web();
  fallar(a.AA, "q_01_01");
  assert.equal(a.AA.store.etiquetarFallo("q_01_01", "plazo"), true);
  assert.equal(a.AA.store.motivoFallo("q_01_01"), "plazo");
  const r = guardado(a.almacen).preg.q_01_01;
  assert.equal(r.tipo, "plazo");
  assert.equal(r.tipoTs, r.ts);
  assert.deepEqual(r.motivos, { plazo: 1 });
  const b = web({ storage: a.almacen });
  assert.equal(b.AA.store.motivoFallo("q_01_01"), "plazo");
  assert.equal(b.AA.store.diagnosticoFallos().porTipo.plazo, 1);
});

test("cambiar el motivo del mismo fallo lo corrige sin sumar otro, y pulsarlo de nuevo lo quita", () => {
  const { AA, almacen } = web();
  fallar(AA, "q_01_01");
  AA.store.etiquetarFallo("q_01_01", "plazo");
  AA.store.etiquetarFallo("q_01_01", "despiste");
  assert.equal(AA.store.motivoFallo("q_01_01"), "despiste");
  assert.deepEqual(guardado(almacen).preg.q_01_01.motivos, { despiste: 1 });
  assert.equal(AA.store.diagnosticoFallos().total, 1);
  AA.store.etiquetarFallo("q_01_01", null);
  assert.equal(AA.store.motivoFallo("q_01_01"), null);
  assert.equal(AA.store.diagnosticoFallos().total, 0);
  assert.equal(guardado(almacen).preg.q_01_01.motivos, undefined);
  assert.equal(AA.store.diagnosticoFallos().sinDiagnosticar, 1);
});

test("solo se etiquetan fallos y con uno de los cuatro motivos", () => {
  const { AA, almacen } = web();
  assert.deepEqual(Array.from(AA.MOTIVOS, (m) => m.id), ["despiste", "plazo", "concepto", "dudosa"]);
  assert.equal(AA.store.etiquetarFallo("q_01_01", "plazo"), false); // sin responder
  acertar(AA, "q_01_02");
  assert.equal(AA.store.etiquetarFallo("q_01_02", "plazo"), false); // acertada
  fallar(AA, "q_01_03");
  assert.equal(AA.store.etiquetarFallo("q_01_03", "pereza"), false); // motivo desconocido
  AA.store.commit();
  assert.equal(guardado(almacen).preg.q_01_03.tipo, undefined);
  assert.equal(AA.store.diagnosticoFallos().total, 0);
});

test("un fallo nuevo pide un diagnóstico nuevo y los motivos de todos los fallos se acumulan", () => {
  const w = web();
  const { AA } = w;
  fallar(AA, "q_02_01");
  AA.store.etiquetarFallo("q_02_01", "concepto");
  w.reloj.ahora += MIN;
  fallar(AA, "q_02_01"); // vuelve a fallarla: el motivo anterior no vale para este intento
  assert.equal(AA.store.motivoFallo("q_02_01"), null);
  assert.equal(AA.store.diagnosticoFallos().sinDiagnosticar, 1);
  AA.store.etiquetarFallo("q_02_01", "despiste");
  assert.deepEqual(Object.assign({}, AA.store.regPregunta("q_02_01").motivos), { concepto: 1, despiste: 1 });
  w.reloj.ahora += MIN;
  acertar(AA, "q_02_01"); // dominada: deja de estar pendiente, pero su historial de motivos se conserva
  assert.equal(AA.store.etiquetarFallo("q_02_01", "plazo"), false);
  const d = AA.store.diagnosticoFallos();
  assert.equal(d.total, 2);
  assert.equal(d.pendientes, 0);
  assert.equal(d.sinDiagnosticar, 0);
});

test("el desglose da el porcentaje de cada motivo y el error más repetido", () => {
  const w = web();
  const { AA } = w;
  [["q_01_01", "plazo"], ["q_01_02", "plazo"], ["q_01_03", "despiste"], ["q_02_01", "dudosa"], ["q_02_02", null]].forEach(([id, tipo]) => {
    w.reloj.ahora += 1000;
    fallar(AA, id);
    if (tipo) AA.store.etiquetarFallo(id, tipo);
  });
  const d = AA.store.diagnosticoFallos();
  assert.equal(d.total, 4);
  assert.deepEqual(Object.assign({}, d.porTipo), { despiste: 1, plazo: 2, concepto: 0, dudosa: 1 });
  assert.deepEqual(Object.assign({}, d.pct), { despiste: 25, plazo: 50, concepto: 0, dudosa: 25 });
  assert.equal(d.dominante, "plazo");
  assert.equal(d.pendientes, 5);
  assert.equal(d.sinDiagnosticar, 1);
  assert.deepEqual(Array.from(AA.store.fallosSinDiagnosticar(), (q) => q.id), ["q_02_02"]);
  // sin ningún diagnóstico no hay error dominante
  assert.equal(web().AA.store.diagnosticoFallos().dominante, null);
});

test("los fallos sin diagnosticar salen del más reciente al más antiguo", () => {
  const w = web();
  ["q_03_01", "q_01_04", "q_02_05"].forEach((id) => { w.reloj.ahora += 1000; fallar(w.AA, id); });
  assert.deepEqual(Array.from(w.AA.store.fallosSinDiagnosticar(), (q) => q.id), ["q_02_05", "q_01_04", "q_03_01"]);
});

test("los motivos de los exámenes oficiales también cuentan en el desglose", () => {
  const { AA } = web();
  fallar(AA, "of_P43_7");
  assert.equal(AA.store.etiquetarFallo("of_P43_7", "concepto"), true);
  const d = AA.store.diagnosticoFallos();
  assert.equal(d.porTipo.concepto, 1);
  assert.equal(d.pendientes, 0); // los pendientes son los del banco, que se pueden repasar
});

test("la copia de seguridad conserva motivos e historial de velocidad, y una copia antigua sin ellos se carga", () => {
  const a = web();
  fallar(a.AA, "q_01_01");
  a.AA.store.etiquetarFallo("q_01_01", "dudosa");
  a.AA.store.guardarVelocidad({ ts: 1, n: 10, a: 5, e: 2, b: 3, agot: 1, nota: 4, medio: 12 });
  const copia = a.AA.store.exportar();
  const b = web();
  b.AA.store.importar(copia);
  assert.equal(b.AA.store.motivoFallo("q_01_01"), "dudosa");
  assert.equal(b.AA.store.velocidad().length, 1);
  const antiguo = { v: 1, ids: 2, leidos: {}, preg: { q_01_01: { n: 1, ok: 0, last: 0, ts: 5 } }, tarj: {}, sims: [], tema: 0, nov: [], aj: {}, psico: [], guia: {} };
  const c = web({ storage: { [KEY]: JSON.stringify(antiguo) } });
  assert.equal(c.AA.store.velocidad().length, 0);
  assert.equal(c.AA.store.motivoFallo("q_01_01"), null);
  assert.equal(c.AA.store.diagnosticoFallos().sinDiagnosticar, 1);
  assert.equal(c.AA.repaso.activo(), false);
  assert.equal(c.AA.store.etiquetarFallo("q_01_01", "plazo"), true);
});

// ------------------------------------------------------------------ entrenamiento de velocidad
test("el mini-test de velocidad tiene 10 o 15 preguntas distintas al azar, 30 s cada una y corrección al final", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  assert.deepEqual(Array.from(T.TAMANOS_VELOCIDAD), [10, 15]);
  assert.equal(T.SEG_PREGUNTA, 30);
  AA.test.preparar({ preset: "velocidad", n: 15 });
  let S = T.sesion();
  assert.equal(S.qs.length, 15);
  assert.equal(new Set(S.qs.map((x) => x.q.id)).size, 15);
  assert.equal(S.cfg.velocidad, true);
  assert.equal(S.cfg.segPregunta, 30);
  assert.equal(S.cfg.modo, "examen");
  assert.equal(S.cfg.minutos, 0); // sin reloj global: cada pregunta tiene el suyo
  AA.test.preparar({ preset: "velocidad", n: 10 });
  assert.equal(T.sesion().qs.length, 10);
  AA.test.preparar({ preset: "velocidad", n: 7 }); // un tamaño no ofrecido usa el de 10
  assert.equal(T.sesion().qs.length, 10);
  // con un banco más pequeño entran todas las que hay
  const p = web(null, datosMini());
  p.AA.test.preparar({ preset: "velocidad", n: 15 });
  assert.equal(p.AA.test.interno.sesion().qs.length, 4);
});

test("al agotarse los 30 segundos pasa sola a la siguiente y la deja en blanco por falta de tiempo", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  AA.test.preparar({ preset: "velocidad", n: 10 });
  const S = T.sesion();
  w.reloj.ahora += 29999;
  T.tick();
  assert.equal(S.i, 0);
  w.reloj.ahora += 1;
  T.tick();
  assert.equal(S.i, 1);
  assert.equal(S.agotada[0], true);
  assert.equal(S.resp[0], null);
  assert.equal(S.tiempos[0], 30);
  w.reloj.ahora += 29000; // el reloj de la segunda pregunta empieza de cero
  T.tick();
  assert.equal(S.i, 1);
  w.reloj.ahora += 1000;
  T.tick();
  assert.equal(S.i, 2);
});

test("responder pasa a la siguiente sin esperar al reloj y no se puede volver atrás", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  AA.test.preparar({ preset: "velocidad", n: 10 });
  const S = T.sesion();
  w.reloj.ahora += 5000;
  const q0 = S.qs[0].q;
  T.elegir(0, q0.ok);
  assert.equal(S.i, 1);
  assert.equal(S.resp[0], q0.ok);
  assert.equal(S.tiempos[0], 5);
  assert.equal(S.agotada[0], false);
  T.elegir(0, (q0.ok + 1) % 3); // la anterior ya no se puede cambiar
  assert.equal(S.resp[0], q0.ok);
  assert.equal(S.i, 1);
  w.reloj.ahora += 2000;
  T.saltar(); // dejarla en blanco a propósito no es «sin tiempo»
  assert.equal(S.i, 2);
  assert.equal(S.resp[1], null);
  assert.equal(S.agotada[1], false);
  assert.equal(AA.store.regPregunta(q0.id), null); // modo examen: se corrige al final
});

test("al terminar: respondidas, en blanco por tiempo, saltadas, puntos A − E/2, nota y ritmo medio", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  AA.test.preparar({ preset: "velocidad", n: 10 });
  const S = T.sesion();
  const responder = (seg, bien) => { w.reloj.ahora += seg * 1000; const q = S.qs[S.i].q; T.elegir(S.i, bien ? q.ok : (q.ok + 1) % 3); };
  for (let k = 0; k < 6; k++) responder(10, true);
  responder(20, false);
  responder(20, false);
  w.reloj.ahora += 3000;
  T.saltar();
  assert.equal(S.estado, "run");
  w.reloj.ahora += 30000; // la última se queda sin tiempo y cierra el mini-test
  T.tick();
  assert.equal(S.estado, "fin");
  const r = S.res;
  assert.equal(r.A, 6);
  assert.equal(r.E, 2);
  assert.equal(r.B, 2);
  assert.equal(r.netos, 5); // 6 − 2/2
  assert.equal(r.nota, 5); // (6 − 1) × 10 / 10
  assert.deepEqual(Object.assign({}, r.vel), { respondidas: 8, agotadas: 1, saltadas: 1, medio: 12.5 }); // (6×10 + 2×20) / 8
  const v = guardado(w.almacen).vel;
  assert.equal(v.length, 1);
  assert.deepEqual(Object.assign({}, v[0], { ts: 0 }), { ts: 0, n: 10, a: 6, e: 2, b: 2, agot: 1, nota: 5, medio: 12.5 });
  // las respondidas cuentan en el progreso y sus errores se pueden diagnosticar
  const falladas = S.qs.filter((x, i) => S.resp[i] != null && S.resp[i] !== x.q.ok);
  assert.equal(Object.keys(guardado(w.almacen).preg).length, 8);
  assert.equal(AA.store.etiquetarFallo(falladas[0].q.id, "despiste"), true);
  T.tick(); // con el mini-test terminado el reloj no hace nada
  assert.equal(S.estado, "fin");
});

test("con más errores que aciertos la nota cuenta como 0 pero se conservan los puntos netos", () => {
  const w = web();
  const T = w.AA.test.interno;
  w.AA.test.preparar({ preset: "velocidad", n: 10 });
  const S = T.sesion();
  for (let k = 0; k < 10; k++) { w.reloj.ahora += 1000; const q = S.qs[S.i].q; T.elegir(S.i, (q.ok + 1) % 3); }
  assert.equal(S.estado, "fin");
  assert.equal(S.res.netos, -5);
  assert.equal(S.res.bruta, -5);
  assert.equal(S.res.nota, 0);
  assert.equal(S.res.vel.agotadas, 0);
});

test("un doble clic no responde también la pregunta siguiente y una respuesta fuera de tiempo no cuenta", () => {
  const w = web();
  const T = w.AA.test.interno;
  w.AA.test.preparar({ preset: "velocidad", n: 10 });
  const S = T.sesion();
  w.reloj.ahora += 4000;
  T.elegir(0, S.qs[0].q.ok);
  assert.equal(S.i, 1);
  w.reloj.ahora += T.GRACIA_MS - 1; // segundo clic del doble clic, ya sobre la pregunta 2
  T.elegir(1, S.qs[1].q.ok);
  assert.equal(S.i, 1);
  assert.equal(S.resp[1], null);
  w.reloj.ahora += 1;
  T.elegir(1, S.qs[1].q.ok);
  assert.equal(S.i, 2);
  // pestaña en segundo plano: el reloj no ha avanzado la pregunta, pero ya han pasado sus 30 segundos
  w.reloj.ahora += 45000;
  T.elegir(2, S.qs[2].q.ok);
  assert.equal(S.resp[2], null);
  assert.equal(S.agotada[2], true);
  assert.equal(S.i, 3);
});

test("si se sale de Tests a mitad, el reloj de la pregunta se para y sigue donde estaba al volver", () => {
  const w = web();
  const T = w.AA.test.interno;
  w.AA.test.preparar({ preset: "velocidad", n: 10 });
  const S = T.sesion();
  w.reloj.ahora += 10000;
  T.pausar(); // le quedan 20 s
  w.reloj.ahora += 5 * MIN;
  T.tick();
  T.elegir(0, S.qs[0].q.ok); // en pausa no se responde
  assert.equal(S.i, 0);
  assert.equal(S.agotada[0], false);
  assert.equal(S.resp[0], null);
  T.reanudar();
  w.reloj.ahora += 19000;
  T.tick();
  assert.equal(S.i, 0);
  w.reloj.ahora += 1000;
  T.tick();
  assert.equal(S.i, 1);
  assert.equal(S.agotada[0], true);
  assert.equal(S.tiempos[0], 30); // cuenta el tiempo de pregunta, no el de la pausa
});

test("la portada de Tests descarta la corrección de un test terminado, pero no un test en curso", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  AA.test.preparar({ preset: "velocidad", n: 10 });
  AA.test.inicio();
  assert.notEqual(T.sesion(), null); // en curso: se conserva
  for (let k = 0; k < 10; k++) { w.reloj.ahora += 1000; T.saltar(); }
  assert.equal(T.sesion().estado, "fin");
  AA.test.inicio();
  assert.equal(T.sesion(), null);
});

test("el historial de velocidad guarda los 30 últimos mini-tests", () => {
  const { AA } = web();
  for (let k = 1; k <= 35; k++) AA.store.guardarVelocidad({ ts: k, n: 10, a: 0, e: 0, b: 10, agot: 10, nota: 0, medio: 0 });
  const h = AA.store.velocidad();
  assert.equal(h.length, 30);
  assert.equal(h[0].ts, 6);
  assert.equal(h[29].ts, 35);
});

// ------------------------------------------------------------------ Modo Repaso Intensivo
test("el Modo Repaso Intensivo se activa, se recuerda en otra visita y se desactiva", () => {
  const a = web();
  assert.equal(a.AA.repaso.activo(), false);
  a.AA.repaso.activar(true);
  const b = web({ storage: a.almacen });
  assert.equal(b.AA.repaso.activo(), true);
  b.AA.repaso.activar(false);
  assert.equal(web({ storage: b.almacen }).AA.repaso.activo(), false);
});

test("el recomendador pone primero los fallos de despiste, plazo o concepto, luego «dudosa» y luego los sin diagnosticar", () => {
  const w = web();
  const { AA } = w;
  const paso = (id, ok) => { w.reloj.ahora += 1000; AA.store.responder(id, ok); };
  paso("q_01_01", false); // sin diagnosticar
  paso("q_01_02", false); AA.store.etiquetarFallo("q_01_02", "dudosa");
  paso("q_01_03", false); AA.store.etiquetarFallo("q_01_03", "concepto");
  paso("q_02_01", false); AA.store.etiquetarFallo("q_02_01", "plazo");
  paso("q_02_01", false); AA.store.etiquetarFallo("q_02_01", "plazo"); // dos fallos: más arriba
  paso("q_02_02", false); AA.store.etiquetarFallo("q_02_02", "despiste");
  paso("q_02_03", true); // acertada: fuera
  const f = Array.from(AA.repaso.fallos());
  assert.deepEqual(f.map((x) => x.q.id), ["q_02_01", "q_02_02", "q_01_03", "q_01_02", "q_01_01"]);
  assert.deepEqual(f.map((x) => x.prio), [3, 3, 3, 2, 1]);
  assert.deepEqual(f.map((x) => x.tipo), ["plazo", "despiste", "concepto", "dudosa", null]);
  // el repaso que lanza el Panel usa esas preguntas en modo estudio
  AA.test.preparar({ preset: "repaso" });
  const S = AA.test.interno.sesion();
  assert.equal(S.cfg.modo, "estudio");
  assert.deepEqual(Array.from(S.qs, (x) => x.q.id).sort(), f.map((x) => x.q.id).sort());
});

test("el recomendador usa el motivo del último fallo, como el cuaderno: uno de un fallo anterior no cuenta", () => {
  const w = web();
  const { AA } = w;
  fallar(AA, "q_03_01");
  AA.store.etiquetarFallo("q_03_01", "concepto");
  w.reloj.ahora += MIN;
  acertar(AA, "q_03_01");
  w.reloj.ahora += MIN;
  fallar(AA, "q_03_01"); // vuelve a fallarla y aún no ha dicho por qué
  const f = AA.repaso.fallos()[0];
  assert.equal(f.tipo, null);
  assert.equal(f.prio, 1);
  assert.equal(AA.store.diagnosticoFallos().sinDiagnosticar, 1);
  AA.store.etiquetarFallo("q_03_01", "plazo");
  assert.equal(AA.repaso.fallos()[0].tipo, "plazo");
  assert.equal(AA.repaso.fallos()[0].prio, 3);
});

test("el repaso de fallos coge como mucho 20 y avisa si no hay ninguno", () => {
  const w = web();
  const { AA } = w;
  w.AA.test.preparar({ preset: "repaso" });
  assert.equal(AA.test.interno.sesion(), null);
  assert.equal(w.toasts.length, 1);
  AA.preguntas.forEach((q) => { w.reloj.ahora += 1000; fallar(AA, q.id); }); // 24 fallos, q_01_01 el más antiguo
  AA.store.etiquetarFallo("q_01_01", "concepto");
  AA.test.preparar({ preset: "repaso" });
  const ids = AA.test.interno.sesion().qs.map((x) => x.q.id);
  assert.equal(ids.length, 20);
  assert.ok(ids.includes("q_01_01")); // la diagnosticada entra aunque sea la más antigua...
  assert.ok(!ids.includes("q_01_02")); // ...y se quedan fuera las sin diagnosticar más antiguas
  assert.ok(ids.includes("q_04_06"));
});

test("temas flojos: del menor al mayor % de aciertos, solo los que tienen intentos y «Lo imprescindible»", () => {
  const { AA } = web();
  fallar(AA, "q_01_01"); fallar(AA, "q_01_02"); acertar(AA, "q_01_03"); // tema 1: 33 %
  acertar(AA, "q_02_01"); fallar(AA, "q_02_02"); // tema 2: 50 %
  fallar(AA, "q_04_01"); // tema 4: 0 %, pero sin «Lo imprescindible»
  assert.deepEqual(Array.from(AA.repaso.temasFlojos(), (t) => [t.tema, t.pct]), [[1, 33], [2, 50]]);
  acertar(AA, "q_03_01"); fallar(AA, "q_03_02"); // tema 3: 50 %, empata con el 2 pero cae menos en examen
  const f = Array.from(AA.repaso.temasFlojos());
  assert.deepEqual(f.map((t) => t.tema), [1, 2, 3]);
  assert.deepEqual(Array.from(f[0].clave), ["**Clave** del tema 1"]);
  assert.equal(f[0].intentos, 3);
  assert.deepEqual(Array.from(AA.repaso.temasFlojos(1), (t) => t.tema), [1]);
});

test("las tarjetas de las cajas 1 y 2 se cuentan y se repasan aunque hoy no les toque", () => {
  const { AA } = web({ test: true });
  AA.store.calificarTarjeta("t_01_01", 0); // otra vez: caja 1
  AA.store.calificarTarjeta("t_01_02", 1); // dudosa: sigue en la caja 1
  AA.store.calificarTarjeta("t_02_01", 2); // la sabía: caja 2
  AA.store.calificarTarjeta("t_03_01", 2);
  AA.store.calificarTarjeta("t_03_01", 2); // caja 3: ya no es del repaso intensivo
  assert.deepEqual(Array.from(AA.store.tarjetasEnCajas([1]), (c) => c.id), ["t_01_01", "t_01_02"]);
  assert.deepEqual(Array.from(AA.store.tarjetasEnCajas([1, 2]), (c) => c.id), ["t_01_01", "t_01_02", "t_02_01"]);
  // ninguna vence hoy, pero la cola de las cajas 1 y 2 las incluye
  const hoy = AA.store.pendientesTarjetas().map((c) => c.id);
  ["t_01_01", "t_01_02", "t_02_01"].forEach((id) => assert.ok(!hoy.includes(id), id));
  const c = AA.tarjetasUI.interno.construirCola({ cajas: [1, 2] });
  assert.deepEqual(Array.from(c.cola, (x) => x.id).sort(), ["t_01_01", "t_01_02", "t_02_01"]);
  assert.equal(c.titulo, "Cajas 1 y 2");
});

test("con los datos reales el modo intensivo prioriza bien y solo propone temas con «Lo imprescindible»", () => {
  const w = cargarWeb({ datosReales: true, test: true, random: semilla(7) });
  const { AA } = w;
  assert.equal(AA.repaso.fallos().length, 0);
  assert.equal(AA.repaso.temasFlojos().length, 0);
  const porTema = {};
  AA.preguntas.forEach((q) => { (porTema[q.tema] = porTema[q.tema] || []).push(q); });
  Object.keys(porTema).forEach((t, i) => {
    porTema[t].slice(0, 4).forEach((q, k) => AA.store.responder(q.id, k < i % 4));
  });
  const f = Array.from(AA.repaso.temasFlojos(5));
  assert.equal(f.length, 5);
  f.forEach((t, i) => {
    assert.ok(t.clave.length > 0, "tema " + t.tema);
    if (i) assert.ok(f[i - 1].pct <= t.pct, "orden por % de aciertos");
  });
  const fallos = Array.from(AA.repaso.fallos());
  AA.store.etiquetarFallo(fallos[fallos.length - 1].q.id, "plazo");
  assert.equal(AA.repaso.fallos()[0].q.id, fallos[fallos.length - 1].q.id);
});
