// Fase 11: guía de estudio en 4 días por tema: estimación de minutos, días hechos guardados y fecha de la vuelta completa.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarWeb, datosMini } = require("./_sandbox.js");

const KEY = "academia-abierta-policia-v1";
const DIA = 24 * 3600 * 1000;
const guardado = (almacen) => JSON.parse(almacen[KEY]);
const pal = (n) => Array.from({ length: n }, (_, i) => "p" + i).join(" ");

/* Tema con extensión conocida (en palabras): día 1 = 660 (1 del Anexo + 659 de «clave»), día 2 = 1104 en el resumen
   visible con una tabla (más una ampliación plegada que no cuenta), día 3 = 550 entre trampas y caído + 4 tarjetas,
   día 4 = 3 preguntas. Con peso medio: 15, 20, 10 y 10 minutos. */
function ficha(n) {
  const nn = String(n).padStart(2, "0");
  return {
    tema: n,
    clave: [pal(300), pal(359)],
    resumen: [
      { titulo: "Uno", puntos: [pal(600), pal(499)], tabla: { cabecera: ["a", "b"], filas: [["c", "d"]] } },
      { titulo: "Ampliación", ampliado: true, puntos: [pal(5000)] },
    ],
    trampas: [pal(330)],
    caido: [{ examen: "P43", concepto: pal(220) }],
    tarjetas: [1, 2, 3, 4].map((k) => ({ id: `t_${nn}_0${k}`, p: "p" + k, r: "r" })),
    preguntas: [1, 2, 3].map((k) => ({ id: `q_${nn}_0${k}`, enunciado: "e" + k, opciones: ["a", "b", "c"], correcta: 0, explicacion: "x", ref: "r" })),
  };
}
function datosGuia(pesos) {
  const meta = { bloques: [{ id: "A", nombre: "A", temas: [1, pesos.length + 1] }], temas: [] };
  const temas = {};
  pesos.forEach((peso, i) => {
    meta.temas.push({ tema: i + 1, titulo: "T" + (i + 1), bloque: "A", oficial: "o", peso, media: 1 });
    temas[i + 1] = ficha(i + 1);
  });
  // un tema más sin ficha publicada: no tiene guía ni cuenta para la vuelta
  meta.temas.push({ tema: pesos.length + 1, titulo: "Sin ficha", bloque: "A", oficial: "o", peso: "medio", media: 0 });
  return { meta, temas };
}
const cargar = (pesos, extra) => cargarWeb(Object.assign({}, datosGuia(pesos || ["medio", "medio"]), extra));

// ------------------------------------------------------------------ estimación de minutos
test("los minutos de cada día salen de la extensión de la ficha", () => {
  const { AA } = cargar(["medio"]);
  assert.deepEqual(Array.from(AA.guia.minutos(1)), [15, 20, 10, 10]);
});

test("las ampliaciones plegadas no cuentan y un tema sin ficha no tiene guía", () => {
  const d = datosGuia(["medio"]);
  d.temas[1].resumen[1].puntos = [pal(20000)];
  const { AA } = cargarWeb(d);
  assert.equal(AA.guia.minutos(1)[1], 20);
  assert.equal(AA.guia.minutos(2), null);
});

test("el peso alarga o acorta los días de estudio, no el test", () => {
  const { AA } = cargar(["alto", "medio", "bajo"]);
  const [alto, medio, bajo] = [1, 2, 3].map((n) => Array.from(AA.guia.minutos(n)));
  for (let i = 0; i < 3; i++) {
    assert.ok(alto[i] >= medio[i] && medio[i] >= bajo[i], `día ${i + 1}: ${alto[i]} ${medio[i]} ${bajo[i]}`);
  }
  assert.equal(alto[3], medio[3]);
  assert.equal(medio[3], bajo[3]);
  const suma = (m) => m.reduce((a, b) => a + b, 0);
  assert.ok(suma(alto) > suma(medio) && suma(medio) > suma(bajo));
});

test("un tema más largo pide más tiempo, siempre en múltiplos de 5 y nunca menos de 5", () => {
  const d = datosGuia(["medio", "medio"]);
  d.temas[2].resumen[0].puntos = [pal(3000)];
  d.temas[2].preguntas = Array.from({ length: 13 }, (_, k) => Object.assign({}, d.temas[2].preguntas[0], { id: "q_02_" + String(k + 1).padStart(2, "0") }));
  const corto = { tema: 3, clave: ["**uno**"], resumen: [{ titulo: "x", puntos: ["y"] }], tarjetas: [], preguntas: [] };
  d.meta.temas.splice(2, 0, { tema: 3, titulo: "Corto", bloque: "A", oficial: "o", peso: "medio", media: 1 });
  d.meta.temas[3].tema = 4;
  d.temas[3] = corto;
  const { AA } = cargarWeb(d);
  assert.ok(AA.guia.minutos(2)[1] > AA.guia.minutos(1)[1]);
  assert.ok(AA.guia.minutos(2)[3] > AA.guia.minutos(1)[3]);
  assert.deepEqual(Array.from(AA.guia.minutos(3)), [5, 5, 5, 5]);
  [1, 2, 3].forEach((n) => AA.guia.minutos(n).forEach((m) => assert.equal(m % 5, 0)));
});

// ------------------------------------------------------------------ días hechos
test("marcar y desmarcar un día se guarda y se recupera en otra visita", () => {
  const a = cargar();
  const ahora = a.reloj.ahora;
  a.AA.store.pasoGuia(1, 1, true);
  a.AA.store.pasoGuia(1, 3, true);
  assert.deepEqual(Object.keys(guardado(a.almacen).guia[1]).sort(), ["1", "3"]);
  assert.equal(guardado(a.almacen).guia[1][1], ahora);
  const b = cargar(null, { storage: a.almacen });
  assert.equal(b.AA.store.guiaTema(1)[1], ahora);
  assert.ok(b.AA.store.guiaTema(1)[3]);
  assert.equal(b.AA.store.guiaTema(1)[2], undefined);
  b.AA.store.pasoGuia(1, 1, false);
  b.AA.store.pasoGuia(1, 3, false);
  assert.equal(Object.keys(b.AA.store.guiaTema(1)).length, 0);
  assert.equal(guardado(b.almacen).guia[1], undefined); // sin días hechos el tema no ocupa sitio
});

test("hacer el día 2 marca el tema como leído; deshacerlo no quita la marca", () => {
  const { AA } = cargar();
  AA.store.pasoGuia(1, 1, true);
  assert.equal(AA.store.leido(1), false);
  AA.store.pasoGuia(1, 2, true);
  assert.equal(AA.store.leido(1), true);
  AA.store.pasoGuia(1, 2, false);
  assert.equal(AA.store.leido(1), true);
});

test("el siguiente día es el primero sin hacer y los temas a medias salen por orden de último avance", () => {
  const c = cargar();
  const { AA } = c;
  assert.equal(AA.guia.siguiente(1), 1);
  AA.store.pasoGuia(1, 1, true);
  AA.store.pasoGuia(1, 3, true); // fuera de orden: sigue tocando el 2
  assert.equal(AA.guia.siguiente(1), 2);
  c.reloj.ahora += DIA;
  AA.store.pasoGuia(2, 1, true);
  assert.deepEqual(Array.from(AA.guia.enCurso(), (x) => [x.tema, x.dia]), [[2, 2], [1, 2]]);
  c.reloj.ahora += DIA;
  AA.store.pasoGuia(1, 2, true);
  AA.store.pasoGuia(1, 4, true);
  assert.equal(AA.guia.siguiente(1), 0);
  assert.deepEqual(Array.from(AA.guia.enCurso(), (x) => x.tema), [2]); // el completo ya no está a medias
});

// ------------------------------------------------------------------ vuelta completa según el ritmo
test("la fecha de la vuelta completa depende del ritmo y de los días ya hechos", () => {
  const c = cargar(); // 2 temas con ficha (15 + 20 + 10 + 10 = 55 min cada uno) y uno sin ficha
  const { AA } = c;
  let v = AA.guia.vuelta(1);
  assert.equal(v.temas, 2);
  assert.equal(v.pasos, 8);
  assert.equal(v.minutos, 110);
  assert.equal(v.semanas, 2);
  assert.equal(v.fecha, "2026-10-30"); // 16/10/2026 + 14 días
  assert.equal(v.minSemana, 55);
  assert.equal(AA.guia.vuelta(2).fecha, "2026-10-23");
  [1, 2, 3, 4].forEach((d) => AA.store.pasoGuia(1, d, true));
  AA.store.pasoGuia(2, 1, true);
  v = AA.guia.vuelta(2);
  assert.equal(v.completos, 1);
  assert.equal(v.pasos, 3);
  assert.equal(v.minutos, 40);
  assert.equal(v.semanas, 3 / 8);
  assert.equal(v.fecha, "2026-10-19"); // 3 días de guía a 8 por semana: 2,6 días → 3
  assert.equal(AA.guia.vuelta(3, Date.UTC(2027, 0, 30, 12)).fecha, "2027-02-01"); // cuenta desde la fecha indicada
});

test("con todo hecho la vuelta termina hoy y no pide horas", () => {
  const { AA } = cargar();
  [1, 2].forEach((n) => [1, 2, 3, 4].forEach((d) => AA.store.pasoGuia(n, d, true)));
  const v = AA.guia.vuelta(2);
  assert.equal(v.pasos, 0);
  assert.equal(v.completos, 2);
  assert.equal(v.minSemana, 0);
  assert.equal(v.fecha, "2026-10-16");
});

test("los ritmos ofrecidos son 1, 2 y 3 temas por semana", () => {
  const { AA } = cargar();
  assert.deepEqual(Array.from(AA.guia.RITMOS, (r) => r.porSemana), [1, 2, 3]);
  assert.equal(AA.guia.DIAS, 4);
});

// ------------------------------------------------------------------ compatibilidad con el progreso guardado
test("una copia guardada antes de la guía se carga y se puede seguir usando", () => {
  const antiguo = { v: 1, ids: 2, leidos: { 1: 5 }, preg: {}, tarj: {}, sims: [], ult: null, tema: 1, nov: [], aj: {}, psico: [] };
  const a = cargar(null, { storage: { [KEY]: JSON.stringify(antiguo) } });
  assert.equal(Object.keys(a.AA.store.guiaTema(1)).length, 0);
  assert.equal(a.AA.guia.vuelta(1).pasos, 8);
  a.AA.store.pasoGuia(2, 1, true);
  assert.ok(guardado(a.almacen).guia[2][1]);
  // importar una copia de seguridad sin `guia` tampoco falla
  a.AA.store.importar(JSON.stringify(antiguo));
  assert.equal(Object.keys(a.AA.store.guiaTema(2)).length, 0);
  a.AA.store.pasoGuia(1, 4, true);
  assert.ok(JSON.parse(a.AA.store.exportar()).guia[1][4]);
});

test("el ritmo elegido se guarda como un ajuste más", () => {
  const a = cargar();
  a.AA.store.ajuste("ritmo", "3");
  const b = cargar(null, { storage: a.almacen });
  assert.equal(b.AA.store.ajuste("ritmo"), "3");
});

// ------------------------------------------------------------------ datos reales
test("con las fichas publicadas cada tema tiene sus cuatro tiempos y la vuelta cuadra", () => {
  const { AA } = cargarWeb({ datosReales: true });
  const conFicha = AA.listaTemas.filter((t) => t.datos);
  assert.ok(conFicha.length > 0);
  let total = 0;
  conFicha.forEach((t) => {
    const m = AA.guia.minutos(t.tema);
    assert.equal(m.length, 4, "tema " + t.tema);
    m.forEach((x) => assert.ok(x >= 5 && x % 5 === 0, `tema ${t.tema}: ${m}`));
    assert.ok(m[1] >= m[0], `tema ${t.tema}: el resumen no puede llevar menos que «lo imprescindible» (${m})`);
    total += m.reduce((a, b) => a + b, 0);
  });
  const media = total / conFicha.length;
  assert.ok(media >= 45 && media <= 180, "media por tema fuera de lo razonable: " + media + " min");
  const v = AA.guia.vuelta(1);
  assert.equal(v.pasos, 4 * conFicha.length);
  assert.equal(v.semanas, conFicha.length);
  assert.equal(v.minutos, total);
});
