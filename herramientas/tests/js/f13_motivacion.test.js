// Fase 13: motivación. Registro diario, racha con días de descanso, arranque retroactivo, caducidad de lo consolidado
// (60 días), dominio ponderado por examen y niveles por tema, logros, desafío diario con semilla, muerte súbita y
// rentabilidad de contestar las dudas.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarWeb } = require("./_sandbox.js");

const KEY = "academia-abierta-policia-v1";
const DIA = 24 * 3600 * 1000;
const AHORA = Date.UTC(2026, 9, 16, 12, 0, 0); // viernes 16/10/2026, la fecha del sandbox
const guardado = (almacen) => JSON.parse(almacen[KEY]);
const pad = (n) => String(n).padStart(2, "0");

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

/* 4 temas de 10 preguntas (dificultad 1, 2, 3, 1, 2…) y 5 tarjetas, salvo el 4, que no tiene. Pesos alto (media 6),
   alto (4), medio (2) y bajo (1). En el tema 1, la pregunta 9 no es verificable y la 10 está pendiente de revisar. */
function datos() {
  const conf = [
    { peso: "alto", media: 6, bloque: "A", tarj: 5 }, { peso: "alto", media: 4, bloque: "A", tarj: 5 },
    { peso: "medio", media: 2, bloque: "B", tarj: 5 }, { peso: "bajo", media: 1, bloque: "B", tarj: 0 },
  ];
  const meta = { bloques: [{ id: "A", nombre: "A", temas: [1, 2] }, { id: "B", nombre: "B", temas: [3, 4] }], temas: [] };
  const temas = {};
  conf.forEach((c, i) => {
    const t = i + 1, nn = pad(t);
    meta.temas.push({ tema: t, titulo: "Tema " + t, bloque: c.bloque, oficial: "o", peso: c.peso, media: c.media });
    temas[t] = {
      tema: t,
      clave: ["clave " + t],
      preguntas: Array.from({ length: 10 }, (_, k) => ({
        id: `q_${nn}_${pad(k + 1)}`, enunciado: `P ${t}.${k + 1}`, opciones: ["a", "b", "c"], correcta: k % 3, explicacion: "e", ref: "r",
        dificultad: (k % 3) + 1, verif: { e: "verificada" },
      })),
      tarjetas: Array.from({ length: c.tarj }, (_, k) => ({ id: `t_${nn}_${pad(k + 1)}`, p: `p ${t}.${k}`, r: "r" })),
    };
  });
  temas[1].preguntas[8].verif = { e: "no_verificable" };
  temas[1].preguntas[9].verif = { e: "revisar" };
  return { meta, temas };
}

/* Web con test.js y sin navegador: AA.go, AA.toast y scrollTo no hacen nada. */
function web(extra) {
  const w = cargarWeb(Object.assign(datos(), { test: true, random: semilla(7) }, extra || {}));
  w.AA.go = () => {};
  w.AA.toast = () => {};
  w.ctx.scrollTo = () => {};
  return w;
}
const ok = (AA, id) => AA.preguntaPorId[id].ok;
const acertar = (AA, id) => AA.store.responder(id, true);
const fallar = (AA, id) => AA.store.responder(id, false);
const idsTema = (t) => Array.from({ length: 10 }, (_, k) => `q_${pad(t)}_${pad(k + 1)}`);
const iso = (AA, ms) => AA.isoDia(ms);
/* Estado guardado mínimo (v1) con los campos que se indiquen. */
const estado = (o) => ({ [KEY]: JSON.stringify(Object.assign({ v: 1, ids: 2, leidos: {}, preg: {}, tarj: {}, sims: [], aj: {} }, o)) });

// ------------------------------------------------------------------ utilidades de fecha y azar
test("AA.azar es reproducible con la misma semilla y distinto con otra", () => {
  const { AA } = web();
  const a = AA.azar("desafio-2026-10-16"), b = AA.azar("desafio-2026-10-16"), c = AA.azar("desafio-2026-10-17");
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  sa.concat(sc).forEach((x) => assert.ok(x >= 0 && x < 1));
  const x = Array.from(AA.shuffle([1, 2, 3, 4, 5, 6], AA.azar(9))), y = Array.from(AA.shuffle([1, 2, 3, 4, 5, 6], AA.azar(9)));
  assert.deepEqual(x, y);
  assert.deepEqual(x.slice().sort(), [1, 2, 3, 4, 5, 6]);
});

test("fechas: días naturales, cambio de hora y lunes de la semana", () => {
  const { AA } = web();
  assert.equal(AA.sumarDias("2026-10-24", 2), "2026-10-26"); // pasa por el cambio de hora del 25/10
  assert.equal(AA.sumarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(AA.diasEntre("2026-03-28", "2026-03-30"), 2);
  assert.equal(AA.diasEntre("2026-10-16", "2026-10-10"), -6);
  assert.equal(AA.lunes("2026-10-18"), "2026-10-12"); // domingo → lunes anterior
  assert.equal(AA.lunes("2026-10-12"), "2026-10-12");
  assert.equal(AA.lunes("2026-10-16"), "2026-10-12");
});

// ------------------------------------------------------------------ registro diario
test("el registro diario cuenta preguntas, aciertos, tarjetas, guía, lectura y psicotécnicos", () => {
  const { AA, almacen } = web();
  acertar(AA, "q_01_01");
  acertar(AA, "q_01_02");
  fallar(AA, "q_01_03");
  AA.store.commit();
  AA.store.calificarTarjeta("t_01_01", 2);
  AA.store.pasoGuia(2, 1, true);
  AA.store.marcarLeido(3, true);
  AA.store.guardarPsico({ ts: AHORA, tipo: "series", n: 10, a: 5, e: 1, nota: 4.5 });
  const hoy = guardado(almacen).dias["2026-10-16"];
  assert.deepEqual(hoy, { p: 3, a: 2, t: 1, g: 1, l: 1, s: 1 });
});

test("marcar y desmarcar el mismo día un paso de guía o una lectura no cuenta", () => {
  const { AA } = web();
  AA.store.pasoGuia(1, 1, true);
  AA.store.pasoGuia(1, 1, false);
  AA.store.marcarLeido(1, true);
  AA.store.marcarLeido(1, false);
  assert.deepEqual(Object.assign({}, AA.store.dia()), {});
  assert.equal(AA.motiv.hoyActivo(), false);
});

test("un día cuenta con 10 preguntas, 10 tarjetas, un día de guía, una lectura, psicotécnicos o el desafío", () => {
  const { AA } = web();
  const activo = AA.motiv.interno.diaActivo;
  assert.equal(activo(null), false);
  assert.equal(activo({ p: 9, t: 9 }), false);
  assert.equal(activo({ p: 10 }), true);
  assert.equal(activo({ t: 10 }), true);
  assert.equal(activo({ g: 1 }), true);
  assert.equal(activo({ l: 1 }), true);
  assert.equal(activo({ s: 1 }), true);
  assert.equal(activo({ r: 1 }), true);
  assert.equal(activo({ des: { ids: [] } }), false); // abierto pero sin terminar
  assert.equal(activo({ des: { ids: [], hecho: 1 } }), true);
});

// ------------------------------------------------------------------ racha con días de descanso
function rango(AA, desde, hasta, quitar) {
  const dias = {};
  for (let d = desde; d <= hasta; d = AA.sumarDias(d, 1)) if (!(quitar || []).includes(d)) dias[d] = { p: 10 };
  return dias;
}

test("racha: días seguidos hasta hoy, y hoy sin estudiar todavía no la rompe", () => {
  const { AA } = web();
  const racha = AA.motiv.interno.calcularRacha;
  let r = racha(rango(AA, "2026-10-12", "2026-10-16"), "2026-10-16", 1);
  assert.equal(r.actual, 5);
  assert.equal(r.hoy, true);
  assert.equal(r.inicio, "2026-10-12");
  r = racha(rango(AA, "2026-10-12", "2026-10-15"), "2026-10-16", 0);
  assert.equal(r.actual, 4); // hasta ayer, sin descansos: hoy aún está a tiempo
  assert.equal(r.hoy, false);
});

test("racha: un día de descanso por semana no la rompe ni suma; el segundo de la misma semana sí la rompe", () => {
  const { AA } = web();
  const racha = AA.motiv.interno.calcularRacha;
  const conHueco = rango(AA, "2026-10-12", "2026-10-16", ["2026-10-14"]);
  assert.equal(racha(conHueco, "2026-10-16", 1).actual, 4);
  assert.equal(racha(conHueco, "2026-10-16", 1).descansosSemana, 1);
  assert.equal(racha(conHueco, "2026-10-16", 0).actual, 2); // sin descansos: vuelve a empezar el 15
  const dosHuecos = rango(AA, "2026-10-12", "2026-10-16", ["2026-10-13", "2026-10-15"]);
  assert.equal(racha(dosHuecos, "2026-10-16", 1).actual, 1);
  assert.equal(racha(dosHuecos, "2026-10-16", 2).actual, 3);
  // un hueco en cada semana: con un descanso semanal sigue viva
  const semanas = rango(AA, "2026-10-01", "2026-10-16", ["2026-10-03", "2026-10-07", "2026-10-14"]);
  assert.equal(racha(semanas, "2026-10-16", 1).actual, 13);
});

test("racha: la mejor se calcula en todo el registro y se guarda como récord", () => {
  const { AA, almacen } = web({ storage: estado({ dias: Object.assign(
    { "2026-09-01": { p: 10 }, "2026-09-02": { p: 10 }, "2026-09-03": { p: 10 }, "2026-09-04": { p: 10 } },
    { "2026-10-15": { p: 10 } }) }) });
  const r = AA.motiv.racha();
  assert.equal(r.actual, 1);
  assert.equal(r.mejor, 4);
  AA.motiv.revisar();
  assert.equal(guardado(almacen).rec.racha, 4);
});

test("los días de descanso se configuran (0, 1 o 2; 1 por defecto)", () => {
  const { AA } = web();
  assert.equal(AA.motiv.descansos(), 1);
  AA.store.ajuste("descansos", 2);
  assert.equal(AA.motiv.descansos(), 2);
  AA.store.ajuste("descansos", 7);
  assert.equal(AA.motiv.descansos(), 1);
});

// ------------------------------------------------------------------ arranque retroactivo y poda
function estadoAntiguo() {
  const ayer = AHORA - DIA, hace3 = AHORA - 3 * DIA, hace5 = AHORA - 5 * DIA, hace7 = AHORA - 7 * DIA;
  const preg = {};
  idsTema(1).slice(0, 5).forEach((id, k) => { preg[id] = { n: 1, ok: 1, last: 1, ts: hace5 + k * 60000 }; });
  idsTema(2).slice(0, 2).forEach((id) => { preg[id] = { n: 1, ok: 0, last: 0, ts: hace7 }; });
  return { leidos: { 3: hace3 }, preg, sims: [{ ts: ayer, n: 20, a: 10, e: 2, b: 8, nota: 4.5 }], guia: { 2: { 1: hace3 } }, vel: [], psico: [] };
}

test("arranque retroactivo: una copia sin registro diario lo reconstruye desde sus fechas y lo guarda", () => {
  const { AA, almacen } = web({ storage: estado(estadoAntiguo()) });
  const dias = guardado(almacen).dias;
  assert.deepEqual(dias["2026-10-11"], { p: 5, r: 1 }); // 5 preguntas con su último intento ese día
  assert.deepEqual(dias["2026-10-13"], { r: 1 }); // lectura y día de guía
  assert.deepEqual(dias["2026-10-15"], { r: 1 }); // test de 20
  assert.deepEqual(dias["2026-10-09"], { p: 2 }); // solo 2 preguntas: actividad, no día de estudio
  assert.equal(AA.motiv.interno.diaActivo(dias["2026-10-09"]), false);
  assert.equal(AA.motiv.racha().actual, 1); // el 14 la rompe: el 12 ya gastó el descanso de esa semana
});

test("arranque retroactivo también al importar una copia antigua; una copia con registro no se reconstruye", () => {
  const a = web();
  a.AA.store.importar(JSON.stringify(Object.assign({ v: 1, ids: 2, tarj: {}, aj: {} }, estadoAntiguo())));
  assert.deepEqual(Object.assign({}, a.AA.store.dias()["2026-10-15"]), { r: 1 });
  const b = web({ storage: estado(Object.assign(estadoAntiguo(), { dias: { "2026-10-16": { p: 3 } } })) });
  assert.deepEqual(Object.keys(b.AA.store.dias()), ["2026-10-16"]);
});

test("el registro guarda los últimos 400 días", () => {
  const { AA } = web({ storage: estado({ dias: { "2025-01-01": { p: 10 }, "2025-09-12": { p: 10 }, "2026-10-16": { p: 1 } } }) });
  assert.deepEqual(Object.keys(AA.store.dias()).sort(), ["2025-09-12", "2026-10-16"]); // 2025-09-12 está a 399 días
});

// ------------------------------------------------------------------ consolidación y caducidad a 60 días
test("una pregunta se consolida con 2 aciertos y el último acertado, y caduca a los 60 días sin verla", () => {
  const w = web();
  const { AA } = w;
  assert.equal(AA.store.estadoPregunta("q_01_01"), "nueva");
  acertar(AA, "q_01_01");
  assert.equal(AA.store.estadoPregunta("q_01_01"), "vista");
  acertar(AA, "q_01_01");
  assert.equal(AA.store.estadoPregunta("q_01_01"), "consolidada");
  w.reloj.ahora += 60 * DIA;
  assert.equal(AA.store.estadoPregunta("q_01_01"), "consolidada");
  w.reloj.ahora += DIA;
  assert.equal(AA.store.estadoPregunta("q_01_01"), "refrescar");
  const st = AA.store.statsTema(1);
  assert.equal(st.consolidadas, 0);
  assert.equal(st.refrescar, 1);
  acertar(AA, "q_01_01"); // se refresca al acertarla otra vez
  assert.equal(AA.store.estadoPregunta("q_01_01"), "consolidada");
  fallar(AA, "q_01_01");
  assert.equal(AA.store.estadoPregunta("q_01_01"), "fallada");
});

test("una tarjeta se consolida en la caja 3 y caduca a los 60 días de vencer", () => {
  const w = web();
  const { AA } = w;
  AA.store.calificarTarjeta("t_01_01", 2); // caja 2
  assert.equal(AA.store.estadoTarjeta("t_01_01"), "vista");
  AA.store.calificarTarjeta("t_01_01", 2); // caja 3, vence en 7 días
  assert.equal(AA.store.estadoTarjeta("t_01_01"), "consolidada");
  w.reloj.ahora += 67 * DIA;
  assert.equal(AA.store.estadoTarjeta("t_01_01"), "consolidada");
  w.reloj.ahora += 2 * DIA;
  assert.equal(AA.store.estadoTarjeta("t_01_01"), "refrescar");
  assert.deepEqual(Object.assign({}, AA.store.statsTarjetasTema(1)), { total: 5, vistas: 1, consolidadas: 0, refrescar: 1 });
});

test("statsTema usa el índice por tema y conserva sus campos", () => {
  const { AA } = web();
  assert.equal(AA.preguntasPorTema[2].length, 10);
  assert.equal(AA.tarjetasPorTema[4], undefined);
  acertar(AA, "q_02_01");
  fallar(AA, "q_02_02");
  const st = AA.store.statsTema(2);
  assert.deepEqual([st.total, st.vistas, st.intentos, st.aciertos, st.dominadas, st.pct], [10, 2, 2, 1, 1, 50]);
});

// ------------------------------------------------------------------ dominio, temario bajo control y niveles
test("dominio: 0,7 preguntas + 0,3 tarjetas, ponderado por la media del tema en «temario bajo control»", () => {
  const { AA } = web();
  idsTema(1).forEach((id) => { acertar(AA, id); acertar(AA, id); });
  assert.equal(AA.motiv.dominioTema(1).dominio, 0.7);
  for (let k = 1; k <= 5; k++) { AA.store.calificarTarjeta(`t_01_${pad(k)}`, 2); AA.store.calificarTarjeta(`t_01_${pad(k)}`, 2); }
  assert.equal(AA.motiv.dominioTema(1).dominio, 1);
  let c = AA.motiv.bajoControl();
  assert.equal(c.total, 13);
  assert.equal(c.pct, Math.floor((100 * 6) / 13)); // 46 %
  // el tema 4 no tiene tarjetas: su dominio son solo las preguntas
  idsTema(4).slice(0, 5).forEach((id) => { acertar(AA, id); acertar(AA, id); });
  assert.equal(AA.motiv.dominioTema(4).dominio, 0.5);
  c = AA.motiv.bajoControl();
  assert.equal(c.pct, Math.floor((100 * 6.5) / 13)); // 50 %
});

test("niveles: Sin empezar → En estudio → Practicado (60 % vistas) → Dominado (80 % preguntas y 60 % tarjetas)", () => {
  const { AA } = web();
  assert.equal(AA.motiv.nivelTema(3).id, "nuevo");
  AA.store.marcarLeido(3, true);
  assert.equal(AA.motiv.nivelTema(3).id, "estudio");
  idsTema(3).slice(0, 6).forEach((id) => acertar(AA, id));
  assert.equal(AA.motiv.nivelTema(3).id, "practicado");
  idsTema(3).slice(0, 8).forEach((id) => { acertar(AA, id); acertar(AA, id); });
  assert.equal(AA.motiv.nivelTema(3).id, "practicado"); // falta el 60 % de las tarjetas
  for (let k = 1; k <= 3; k++) { AA.store.calificarTarjeta(`t_03_${pad(k)}`, 2); AA.store.calificarTarjeta(`t_03_${pad(k)}`, 2); }
  assert.equal(AA.motiv.nivelTema(3).id, "dominado");
  assert.equal(AA.motiv.nivelTema(99), null);
});

test("un tema dominado vuelve a Practicado cuando sus preguntas caducan", () => {
  const w = web();
  idsTema(4).forEach((id) => { acertar(w.AA, id); acertar(w.AA, id); });
  assert.equal(w.AA.motiv.nivelTema(4).id, "dominado");
  w.reloj.ahora += 61 * DIA;
  const nv = w.AA.motiv.nivelTema(4);
  assert.equal(nv.id, "practicado");
  assert.equal(nv.refrescar, 10);
});

// ------------------------------------------------------------------ logros
test("los logros se desbloquean una vez, con su fecha, y quedan guardados", () => {
  const w = web();
  const { AA, almacen } = w;
  assert.deepEqual(Array.from(AA.motiv.revisar()), []);
  idsTema(4).forEach((id) => { acertar(AA, id); acertar(AA, id); });
  const nuevos = Array.from(AA.motiv.revisar(), (l) => l.id);
  assert.ok(nuevos.includes("tema-dominado"));
  assert.ok(!nuevos.includes("bloque-B")); // el tema 3 del bloque B sigue sin dominar
  const ts = guardado(almacen).logros["tema-dominado"];
  assert.equal(ts, AHORA);
  w.reloj.ahora += DIA;
  assert.deepEqual(Array.from(AA.motiv.revisar()), []);
  assert.equal(AA.motiv.logros().find((l) => l.id === "tema-dominado").ts, AHORA);
  // aunque el tema deje de estar dominado, el logro se conserva
  w.reloj.ahora += 61 * DIA;
  AA.motiv.revisar();
  assert.equal(AA.store.logros()["tema-dominado"], AHORA);
});

test("logro de racha de 7 días desde el registro", () => {
  const dias = {};
  for (let k = 1; k <= 7; k++) dias[new Date(AHORA - k * DIA).toISOString().slice(0, 10)] = { p: 12 };
  const { AA } = web({ storage: estado({ dias }) });
  assert.equal(AA.motiv.racha().actual, 7);
  assert.ok(Array.from(AA.motiv.revisar(), (l) => l.id).includes("racha-7"));
});

test("el catálogo de logros tiene ids únicos y se puede ocultar sin perder nada", () => {
  const { AA, almacen } = web();
  const ids = AA.motiv.LOGROS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 12 && ids.length <= 16);
  assert.equal(AA.motiv.visible(), true);
  AA.motiv.mostrar(false);
  assert.equal(AA.motiv.visible(), false);
  assert.equal(guardado(almacen).aj.motiv, false);
});

// ------------------------------------------------------------------ desafío diario
test("desafío: la misma fecha y el mismo progreso dan las mismas 5 preguntas; otra fecha, otras", () => {
  const { AA } = web();
  const sel = (f) => Array.from(AA.motiv.interno.seleccionarDesafio(f), (q) => q.id);
  const a = sel("2026-10-16");
  assert.equal(a.length, 5);
  assert.equal(new Set(a).size, 5);
  assert.deepEqual(sel("2026-10-16"), a);
  const otras = ["2026-10-17", "2026-10-18", "2026-10-19"].map(sel);
  assert.ok(otras.some((x) => x.join() !== a.join()));
});

test("desafío: solo preguntas verificadas o revisadas", () => {
  const { AA } = web();
  for (let k = 0; k < 40; k++) {
    const f = AA.sumarDias("2026-01-01", k);
    const ids = Array.from(AA.motiv.interno.seleccionarDesafio(f), (q) => q.id);
    assert.ok(!ids.includes("q_01_09") && !ids.includes("q_01_10"), f + ": " + ids.join(","));
  }
});

test("desafío: lleva el fallo más prioritario, las 2 consolidadas que piden refresco y una sin ver", () => {
  const w = web();
  const { AA } = w;
  // todas vistas salvo q_04_05; tres del tema 2 consolidadas y una acertada una vez
  ["q_02_01", "q_02_02", "q_02_03"].forEach((id) => { acertar(AA, id); acertar(AA, id); w.reloj.ahora += 60000; });
  w.reloj.ahora += 70 * DIA; // las tres piden refresco
  [1, 2, 3, 4].forEach((t) => idsTema(t).forEach((id) => {
    if (id !== "q_04_05" && !AA.store.regPregunta(id)) acertar(AA, id);
  }));
  fallar(AA, "q_03_02");
  AA.store.etiquetarFallo("q_03_02", "plazo");
  ["2026-12-25", "2026-12-26", "2026-12-27"].forEach((f) => {
    const ids = Array.from(AA.motiv.interno.seleccionarDesafio(f), (q) => q.id);
    assert.ok(ids.includes("q_02_01") && ids.includes("q_02_02"), "retención: " + ids.join(","));
    assert.ok(ids.includes("q_03_02"), "fallo: " + ids.join(","));
    assert.ok(ids.includes("q_04_05"), "sin ver: " + ids.join(","));
  });
});

test("desafío: las preguntas se fijan al abrirlo y solo cuenta el primer intento terminado", () => {
  const { AA, almacen } = web();
  const T = AA.test.interno;
  AA.test.preparar({ preset: "diario" });
  let S = T.sesion();
  const ids = Array.from(S.qs, (x) => x.q.id);
  assert.equal(S.cfg.diario, "2026-10-16");
  assert.deepEqual(Array.from(guardado(almacen).dias["2026-10-16"].des.ids), ids);
  acertar(AA, "q_03_01"); // el progreso cambia, pero el desafío de hoy ya está fijado
  assert.deepEqual(Array.from(AA.motiv.prepararDesafio(), (q) => q.id), ids);
  S.qs.forEach((x, i) => T.elegir(i, i < 4 ? x.q.ok : (x.q.ok + 1) % 3));
  T.terminar();
  const des = guardado(almacen).dias["2026-10-16"].des;
  assert.deepEqual([des.a, des.e, des.b, typeof des.hecho], [4, 1, 0, "number"]);
  assert.equal(AA.store.rec("desafios"), 1);
  assert.equal(S.extras.desafio, true);
  assert.equal(AA.motiv.hoyActivo(), true);
  assert.deepEqual(Object.assign({}, AA.motiv.estadoDesafio()), { fecha: "2026-10-16", abierto: true, hecho: true, a: 4, e: 1, b: 0, n: 5 });
  // repetirlo es práctica: no cambia el resultado ni suma otro desafío
  AA.test.preparar({ preset: "diario" });
  S = T.sesion();
  assert.equal(S.cfg.repetido, true);
  S.qs.forEach((x, i) => T.elegir(i, x.q.ok));
  T.terminar();
  assert.equal(S.extras.desafio, false);
  assert.equal(guardado(almacen).dias["2026-10-16"].des.a, 4);
  assert.equal(AA.store.rec("desafios"), 1);
});

// ------------------------------------------------------------------ rentabilidad de las dudas
test("dudas: nota con ellas contestadas frente a dejarlas en blanco y umbral de 1/3", () => {
  const { AA } = web();
  const dudas = AA.motiv.analizarDudas;
  // 10 preguntas (correcta: 0): 6 aciertos (2 dudosas), 3 errores (2 dudosas), 1 blanco (dudosa)
  const correctas = Array(10).fill(0);
  const resp = [0, 0, 0, 0, 0, 0, 1, 1, 1, null];
  const marc = [true, true, false, false, false, false, true, true, false, true];
  const d = dudas(correctas, resp, marc);
  assert.deepEqual([d.marcadas, d.a, d.e, d.b, d.pct, d.compensa], [5, 2, 2, 1, 50, true]);
  assert.equal(d.nota, 4.5); // (6 − 3/2) × 10 / 10
  assert.equal(d.notaSin, 3.5); // (4 − 1/2) × 10 / 10
  assert.equal(d.aporte, 1);
  // exactamente 1 de cada 3 no compensa (esperanza 0); más de 1/3, sí
  assert.equal(dudas([0, 0, 0], [0, 1, 1], [true, true, true]).compensa, false);
  assert.equal(dudas([0, 0, 0, 0, 0], [0, 0, 1, 1, 1], [true, true, true, true, true]).compensa, true);
  assert.equal(dudas([0, 0], [0, 1], [false, false]), null);
  // todas en blanco: no se sabe si compensa
  assert.equal(dudas([0, 0], [null, 0], [true, false]).compensa, null);
  // las notas no bajan de 0, como en la corrección: aquí dejar en blanco las dos dudas falladas habría dado 1,25
  const neg = dudas([0, 0, 0, 0], [1, 1, 1, 0], [true, true, false, false]);
  assert.equal(neg.nota, 0); // (1 − 3/2) × 10 / 4 < 0
  assert.equal(neg.notaSin, 1.25); // (1 − 1/2) × 10 / 4
  assert.equal(neg.aporte, -1.25);
});

test("dudas en un test en modo examen: se analizan, se acumulan y se guardan con el test", () => {
  const { AA, almacen } = web();
  const T = AA.test.interno;
  AA.test.preparar({ modo: "examen", n: 20, titulo: "Examen de prueba" });
  const S = T.sesion();
  S.qs.forEach((x, i) => {
    if (i < 6) S.marc[i] = true;
    T.elegir(i, i % 2 ? (x.q.ok + 1) % 3 : x.q.ok); // impares falladas
  });
  T.terminar();
  const du = S.res.dudas;
  assert.deepEqual([du.marcadas, du.a, du.e], [6, 3, 3]);
  assert.equal(AA.store.rec("dudasA"), 3);
  assert.equal(AA.store.rec("dudasE"), 3);
  assert.deepEqual(Object.assign({}, AA.motiv.dudasGlobal()), { a: 3, e: 3, n: 6, pct: 50, compensa: true });
  const sims = guardado(almacen).sims;
  assert.deepEqual(sims[sims.length - 1].du, { a: 3, e: 3, b: 0 });
});

test("dudas: el modo estudio y la velocidad no las analizan", () => {
  const { AA } = web();
  const T = AA.test.interno;
  AA.test.preparar({ preset: "rapido" });
  T.terminar();
  assert.equal(T.sesion().res.dudas, undefined);
  AA.test.preparar({ preset: "velocidad", n: 10 });
  T.terminar();
  assert.equal(T.sesion().res.dudas, undefined);
});

// ------------------------------------------------------------------ muerte súbita
test("muerte súbita: escalera de dificultad creciente solo con preguntas verificadas o revisadas", () => {
  const { AA } = web();
  const qs = Array.from(AA.test.interno.escaleraSubita());
  assert.equal(qs.length, 38); // 40 − la no verificable y la pendiente de revisar
  assert.ok(!qs.some((q) => q.id === "q_01_09" || q.id === "q_01_10"));
  for (let i = 1; i < qs.length; i++) assert.ok(qs[i].dif >= qs[i - 1].dif, "dificultad decreciente en " + i);
});

test("muerte súbita: 3 blancos como máximo, el primer fallo termina y la racha se guarda como récord", () => {
  const { AA, almacen } = web();
  const T = AA.test.interno;
  AA.test.preparar({ preset: "subita" });
  const S = T.sesion();
  assert.equal(S.cfg.subita, true);
  T.elegir(0, S.qs[0].q.ok);
  T.siguiente();
  T.elegir(1, S.qs[1].q.ok);
  T.siguiente();
  T.blanco();
  T.blanco();
  T.blanco();
  assert.equal(S.i, 5);
  T.blanco(); // ya no quedan blancos
  assert.equal(S.i, 5);
  T.siguiente(); // sin responder no avanza
  assert.equal(S.i, 5);
  T.elegir(5, (S.qs[5].q.ok + 1) % 3);
  assert.equal(S.eliminado, true);
  T.siguiente();
  T.blanco();
  assert.equal(S.i, 5);
  T.terminar();
  assert.equal(S.estado, "fin");
  assert.deepEqual([S.res.subita.racha, S.res.subita.blancos, S.res.N, S.res.E, S.res.subita.completa], [2, 3, 6, 1, false]);
  assert.equal(guardado(almacen).rec.subita, 2);
  assert.equal(S.extras.record, true);
  assert.equal(guardado(almacen).sims.length, 0); // no es un test de 20: no entra en el historial
});

// ------------------------------------------------------------------ recompensas del resultado
test("el resultado avisa de los temas que suben de nivel, del tema sin fallos y de que hoy ya cuenta", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  w.reloj.ahora -= 5 * DIA; // el domingo anterior: practicado (todas vistas, ninguna consolidada)
  idsTema(4).forEach((id) => acertar(AA, id));
  w.reloj.ahora = AHORA;
  AA.test.preparar({ preset: "tema", temas: [4] });
  const S = T.sesion();
  S.qs.forEach((x, i) => T.elegir(i, x.q.ok));
  T.terminar();
  assert.deepEqual(Array.from(S.extras.niveles, (n) => [n.tema, n.antes, n.ahora, n.sube]), [[4, "practicado", "dominado", true]]);
  assert.equal(AA.store.rec("temasPerfectos"), 1);
  assert.equal(S.extras.rachaHoy, 1); // 10 preguntas hoy; el domingo quedó atrás con 4 días sin estudio en medio
  assert.ok(Array.from(S.extras.logros, (l) => l.id).includes("tema-perfecto"));
});

test("empezar un tema (Sin empezar → En estudio) no se anuncia; perder el Dominado, sí", () => {
  const w = web();
  const { AA } = w;
  const T = AA.test.interno;
  AA.test.preparar({ preset: "tema", temas: [3] });
  let S = T.sesion();
  T.elegir(0, S.qs[0].q.ok);
  T.terminar();
  assert.deepEqual(Array.from(S.extras.niveles), []);
  idsTema(4).forEach((id) => { acertar(AA, id); acertar(AA, id); });
  AA.test.preparar({ preset: "tema", temas: [4] });
  S = T.sesion();
  S.qs.forEach((x, i) => T.elegir(i, i < 3 ? (x.q.ok + 1) % 3 : x.q.ok)); // 3 fallos: 70 % consolidadas
  T.terminar();
  assert.deepEqual(Array.from(S.extras.niveles, (n) => [n.tema, n.antes, n.ahora, n.sube]), [[4, "dominado", "practicado", false]]);
});

test("el resultado se compara con la media de los intentos anteriores del mismo test", () => {
  const { AA } = web();
  const T = AA.test.interno;
  const hacer = (bien) => {
    AA.test.preparar({ preset: "rapido" });
    const S = T.sesion();
    S.qs.forEach((x, i) => T.elegir(i, bien ? x.q.ok : (x.q.ok + 1) % 3));
    T.terminar();
    return S;
  };
  assert.equal(hacer(true).comparativa, null);
  const mal = hacer(false).comparativa;
  assert.deepEqual([mal.media, mal.n, mal.dif, mal.record], [10, 1, -10, false]);
  const bien = hacer(true).comparativa;
  assert.deepEqual([bien.media, bien.n, bien.record], [5, 2, false]); // iguala el récord, no lo supera
});
