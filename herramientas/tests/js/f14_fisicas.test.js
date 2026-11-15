// Fase 14: pruebas físicas y entrevista. Puntos con los baremos del Anexo II, marca que falta para el siguiente punto,
// registro de marcas por fecha en AA.store (también con copias antiguas sin el campo), evolución, nota con las últimas
// marcas y lista de preparación de la entrevista.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cargarWeb, datosMini, WEB } = require("./_sandbox.js");

const KEY = "academia-abierta-policia-v1";
const HOY = "2026-10-16"; // fecha del sandbox
const guardado = (almacen) => JSON.parse(almacen[KEY]);
const web = (extra) => cargarWeb(Object.assign(datosMini(), extra || {}));
const estadoV1 = (o) => ({ [KEY]: JSON.stringify(Object.assign({ v: 1, ids: 2, leidos: {}, preg: {}, tarj: {}, sims: [], aj: {} }, o)) });

// ------------------------------------------------------------------ baremos y puntos
test("los puntos respetan los límites del Anexo II en ambos baremos", () => {
  const { AA } = web();
  const p = AA.fisicas.puntos;
  const casos = [
    // [ejercicio, baremo, marca, puntos]
    ["agilidad", "H", 8.2, 10], ["agilidad", "H", 8.3, 9], ["agilidad", "H", 10.5, 5], ["agilidad", "H", 10.6, 4],
    ["agilidad", "H", 11.6, 1], ["agilidad", "H", 11.7, 0], ["agilidad", "H", 7.5, 10],
    ["agilidad", "M", 9.3, 10], ["agilidad", "M", 11.6, 5], ["agilidad", "M", 12.7, 1], ["agilidad", "M", 12.8, 0],
    ["fuerza", "H", 4, 0], ["fuerza", "H", 5, 1], ["fuerza", "H", 9, 4], ["fuerza", "H", 10, 5], ["fuerza", "H", 13, 6],
    ["fuerza", "H", 14, 7], ["fuerza", "H", 17, 10], ["fuerza", "H", 25, 10],
    ["fuerza", "M", 35, 0], ["fuerza", "M", 36, 1], ["fuerza", "M", 56, 4], ["fuerza", "M", 57, 5], ["fuerza", "M", 94, 9], ["fuerza", "M", 95, 10],
    ["resistencia", "H", 174, 10], ["resistencia", "H", 175, 9], ["resistencia", "H", 204, 5], ["resistencia", "H", 205, 4],
    ["resistencia", "H", 228, 1], ["resistencia", "H", 229, 0],
    ["resistencia", "M", 204, 10], ["resistencia", "M", 249, 5], ["resistencia", "M", 250, 4], ["resistencia", "M", 285, 1], ["resistencia", "M", 286, 0],
  ];
  casos.forEach(([ej, b, v, esperado]) => assert.equal(p(ej, b, v), esperado, `${ej} ${b} ${v}`));
});

// ------------------------------------------------------------------ marca para el siguiente punto
test("siguiente punto: marca límite y lo que falta en cada ejercicio", () => {
  const { AA } = web();
  const s = AA.fisicas.siguiente;
  assert.deepEqual(Object.assign({}, s("agilidad", "H", 9.8)), { puntos: 6, objetivo: 9.7, puntosObjetivo: 7, falta: 0.1 });
  assert.deepEqual(Object.assign({}, s("agilidad", "M", 12.0)), { puntos: 4, objetivo: 11.6, puntosObjetivo: 5, falta: 0.4 });
  assert.deepEqual(Object.assign({}, s("fuerza", "H", 12)), { puntos: 6, objetivo: 14, puntosObjetivo: 7, falta: 2 });
  assert.deepEqual(Object.assign({}, s("fuerza", "M", 57)), { puntos: 5, objetivo: 63, puntosObjetivo: 6, falta: 6 });
  assert.deepEqual(Object.assign({}, s("resistencia", "H", 204)), { puntos: 5, objetivo: 198, puntosObjetivo: 6, falta: 6 });
  assert.deepEqual(Object.assign({}, s("resistencia", "M", 300)), { puntos: 0, objetivo: 285, puntosObjetivo: 1, falta: 15 });
  assert.deepEqual(Object.assign({}, s("agilidad", "H", 8.2)), { puntos: 10, max: true });
  assert.deepEqual(Object.assign({}, s("fuerza", "H", 30)), { puntos: 10, max: true });
});

test("la marca objetivo es siempre la peor que da un punto más (barrido de todo el baremo)", () => {
  const { AA } = web();
  const F = AA.fisicas;
  const rangos = {
    agilidad: { H: [7, 13, 0.1], M: [8, 14, 0.1] },
    fuerza: { H: [0, 20, 1], M: [0, 100, 1] },
    resistencia: { H: [160, 240, 1], M: [190, 300, 1] },
  };
  F.EJERCICIOS.forEach((ej) => F.BAREMOS.forEach((b) => {
    const [ini, fin, paso] = rangos[ej][b];
    for (let i = 0; ini + i * paso <= fin + 1e-9; i++) {
      const v = Math.round((ini + i * paso) * 10) / 10;
      const r = F.siguiente(ej, b, v);
      assert.equal(r.puntos, F.puntos(ej, b, v));
      if (r.max) { assert.equal(r.puntos, 10); continue; }
      assert.equal(r.puntosObjetivo, r.puntos + 1, `${ej} ${b} ${v}`); // los baremos tienen los diez escalones
      assert.equal(F.puntos(ej, b, r.objetivo), r.puntosObjetivo);
      const peor = F.menorEsMejor(ej) ? Math.round((r.objetivo + paso) * 10) / 10 : r.objetivo - paso;
      assert.ok(F.puntos(ej, b, peor) < r.puntosObjetivo, `${ej} ${b}: ${peor} no debería llegar a ${r.puntosObjetivo}`);
      assert.ok(r.falta > 0);
      const conFalta = F.menorEsMejor(ej) ? Math.round((v - r.falta) * 10) / 10 : v + r.falta;
      assert.equal(conFalta, r.objetivo, `${ej} ${b} ${v}`);
    }
  }));
});

test("textos de la marca objetivo, con unidades y en español", () => {
  const { AA } = web();
  const F = AA.fisicas;
  const t = (ej, b, v) => F.textoSiguiente(ej, b, F.siguiente(ej, b, v));
  assert.equal(t("agilidad", "H", 9.8), "Baja 0,1 s: 9,7 s o menos para 7 puntos.");
  assert.equal(t("fuerza", "H", 12), "Te faltan 2 dominadas más: 14 dominadas o más para 7 puntos.");
  assert.equal(t("fuerza", "H", 13), "Te falta 1 dominada más: 14 dominadas o más para 7 puntos.");
  assert.equal(t("fuerza", "M", 57), "Te faltan 6 s más: 63 s o más para 6 puntos.");
  assert.equal(t("resistencia", "H", 204), "Baja 6 s: 3 min 18 s o menos para 6 puntos.");
  assert.equal(t("resistencia", "H", 240), "Baja 12 s: 3 min 48 s o menos para sumar 1 punto y no quedar fuera.");
  assert.equal(t("agilidad", "M", 9.0), "Ya tienes la puntuación máxima (10).");
  assert.equal(F.formato("resistencia", "M", 180), "3 min");
  assert.equal(F.formato("resistencia", "M", 45), "45 s");
});

test("validación de las marcas según cómo las miden las bases", () => {
  const { AA } = web();
  const v = AA.fisicas.validar;
  assert.equal(v("agilidad", "H", 9.8), "");
  assert.match(v("agilidad", "H", 9.85), /décima/);
  assert.match(v("agilidad", "H", 0), /segundos/);
  assert.equal(v("fuerza", "H", 12), "");
  assert.match(v("fuerza", "H", 12.5), /entero/);
  assert.match(v("fuerza", "M", -3), /entero/);
  assert.equal(v("resistencia", "M", 245), "");
  assert.match(v("resistencia", "M", 245.5), /segundos/);
  assert.match(v("salto", "H", 2), /desconocido/);
  assert.match(v("fuerza", "X", 2), /baremo/);
  assert.match(v("fuerza", "H", NaN), /marca/);
});

// ------------------------------------------------------------------ registro en AA.store
test("guardarMarca anota por fecha, guarda en localStorage y rechaza marcas no válidas", () => {
  const { AA, almacen } = web();
  assert.deepEqual(Array.from(AA.store.marcas()), []);
  const m = AA.store.guardarMarca({ dia: "2026-10-10", ej: "agilidad", b: "H", v: 10.1 });
  assert.equal(m.dia, "2026-10-10");
  AA.store.guardarMarca({ dia: "2026-09-01", ej: "agilidad", b: "H", v: 10.6 });
  AA.store.guardarMarca({ dia: HOY, ej: "fuerza", b: "H", v: 9 });
  const g = guardado(almacen).fis;
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.dia), ["2026-09-01", "2026-10-10", HOY]); // ordenadas por fecha
  assert.equal(new Set(g.map((x) => x.ts)).size, 3); // id único aunque se anoten en el mismo milisegundo
  assert.throws(() => AA.store.guardarMarca({ dia: HOY, ej: "agilidad", b: "H", v: 9.85 }), /décima/);
  assert.throws(() => AA.store.guardarMarca({ dia: "2026-10-17", ej: "agilidad", b: "H", v: 9.8 }), /posterior a hoy/);
  assert.throws(() => AA.store.guardarMarca({ dia: "ayer", ej: "agilidad", b: "H", v: 9.8 }), /fecha/);
  assert.equal(guardado(almacen).fis.length, 3);
  assert.equal(AA.store.borrarMarca(m.ts), true);
  assert.equal(AA.store.borrarMarca(m.ts), false);
  assert.deepEqual(guardado(almacen).fis.map((x) => x.v), [10.6, 9]);
});

test("el registro se queda con las 400 marcas más recientes", () => {
  const { AA } = web();
  for (let i = 0; i < 405; i++) {
    const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    AA.store.guardarMarca({ dia: d, ej: "fuerza", b: "M", v: 40 + (i % 20) });
  }
  const lista = AA.store.marcas();
  assert.equal(lista.length, 400);
  assert.equal(lista[0].dia, "2025-01-06");
});

test("copias antiguas sin registro físico ni entrevista: se cargan y se importan con los campos nuevos", () => {
  const { AA, almacen } = web({ storage: estadoV1({ preg: { q_01_01: { n: 1, ok: 1, last: 1, ts: 1 } } }) });
  assert.deepEqual(Array.from(AA.store.marcas()), []);
  assert.deepEqual(Object.assign({}, AA.store.entrevista()), {});
  AA.store.guardarMarca({ dia: HOY, ej: "resistencia", b: "M", v: 250 });
  assert.equal(guardado(almacen).fis.length, 1);
  assert.equal(guardado(almacen).preg.q_01_01.ok, 1); // no se pierde el progreso anterior

  const copiaAntigua = JSON.stringify({ v: 1, ids: 2, leidos: {}, preg: {}, tarj: {}, sims: [] });
  AA.store.importar(copiaAntigua);
  const s = AA.store.estado();
  assert.ok(Array.isArray(s.fis) && s.fis.length === 0);
  assert.deepEqual(Object.assign({}, s.entrev), {});
  // la copia de seguridad lleva las marcas y vuelve a importarse igual
  AA.store.guardarMarca({ dia: HOY, ej: "agilidad", b: "M", v: 11.2 });
  const texto = AA.store.exportar();
  const otra = web();
  otra.AA.store.importar(texto);
  assert.deepEqual(otra.AA.store.marcas().map((m) => [m.ej, m.v]), [["agilidad", 11.2]]);
});

test("una copia con el registro dañado se sanea al cargar y al importar", () => {
  const malas = [
    { ts: 1, dia: "2026-10-01", ej: "agilidad", b: "H", v: 9.8 }, // válida
    { ts: 2, dia: "2026-10-01", ej: "salto", b: "H", v: 2 },
    { ts: 3, dia: "2026-10-01", ej: "fuerza", b: "H", v: "10" },
    { ts: 4, dia: "mal", ej: "fuerza", b: "H", v: 10 },
    null,
  ];
  const { AA } = web({ storage: estadoV1({ fis: malas, entrev: [] }) });
  assert.deepEqual(AA.store.marcas().map((m) => m.ts), [1]);
  assert.deepEqual(Object.assign({}, AA.store.entrevista()), {});
  AA.store.importar(JSON.stringify({ v: 1, preg: {}, fis: "no", entrev: "no" }));
  assert.deepEqual(Array.from(AA.store.marcas()), []);
  assert.deepEqual(Object.assign({}, AA.store.entrevista()), {});
});

test("fresh() declara los campos nuevos (las copias antiguas se completan con ellos)", () => {
  const src = fs.readFileSync(path.join(WEB, "js", "store.js"), "utf8");
  assert.match(src, /function fresh\(\) \{[\s\S]*?fis: \[\], entrev: \{\} \};/);
  const { AA } = web();
  AA.store.reiniciar();
  const s = AA.store.estado();
  assert.ok(Array.isArray(s.fis));
  assert.equal(typeof s.entrev, "object");
});

// ------------------------------------------------------------------ evolución y nota con las últimas marcas
test("evolución por ejercicio y baremo: orden por fecha, mejor marca y cambio desde la primera", () => {
  const { AA } = web();
  [["2026-10-01", 10.4], ["2026-09-15", 10.9], [HOY, 9.9], ["2026-10-08", 9.7]].forEach(([dia, v]) =>
    AA.store.guardarMarca({ dia, ej: "agilidad", b: "H", v }));
  AA.store.guardarMarca({ dia: HOY, ej: "agilidad", b: "M", v: 11 }); // otro baremo: no cuenta
  const ev = AA.fisicas.evolucion(AA.store.marcas(), "agilidad", "H");
  assert.deepEqual(Array.from(ev.lista.map((m) => m.v)), [10.9, 10.4, 9.7, 9.9]);
  assert.deepEqual(Array.from(ev.lista.map((m) => m.puntos)), [4, 5, 7, 6]);
  assert.equal(ev.ultima.v, 9.9);
  assert.equal(ev.mejor.v, 9.7);
  assert.equal(ev.cambio, 1); // de 10,9 a 9,9 s: un segundo mejor
  const fu = [["2026-10-01", 8], [HOY, 6]].map(([dia, v]) => ({ ts: v, dia, ej: "fuerza", b: "H", v }));
  assert.equal(AA.fisicas.evolucion(fu, "fuerza", "H").cambio, -2); // dos dominadas menos
  const vacia = AA.fisicas.evolucion([], "fuerza", "M");
  assert.equal(vacia.ultima, null);
  assert.equal(vacia.cambio, null);
});

test("nota de la prueba con las últimas marcas: media, cero que elimina y aprobado", () => {
  const { AA } = web();
  const F = AA.fisicas;
  const m = (ej, v, dia) => ({ ts: v * 10, dia: dia || HOY, ej, b: "H", v });
  let r = F.resumen([m("agilidad", 9.8), m("fuerza", 10)], "H");
  assert.equal(r.completa, false);
  assert.equal(r.media, null);
  r = F.resumen([m("agilidad", 9.8), m("fuerza", 10), m("resistencia", 204)], "H"); // 6 + 5 + 5
  assert.equal(r.completa, true);
  assert.ok(Math.abs(r.media - 16 / 3) < 1e-9);
  assert.equal(r.apto, true);
  r = F.resumen([m("agilidad", 8.2), m("fuerza", 17), m("resistencia", 230)], "H"); // 10 + 10 + 0
  assert.equal(r.cero, true);
  assert.equal(r.apto, false);
  r = F.resumen([m("agilidad", 11.0), m("fuerza", 7), m("resistencia", 210), m("resistencia", 170, "2026-01-01")], "H"); // cuenta la última
  assert.deepEqual(Object.assign({}, r.puntos), { agilidad: 3, fuerza: 3, resistencia: 4 });
  assert.equal(r.apto, false);
});

// ------------------------------------------------------------------ entrevista
test("lista de la entrevista: marcar, anotar, borrar y límite de las notas", () => {
  const { AA, almacen, reloj } = web();
  assert.equal(AA.store.prepararEntrevista("cv", "hecho", true), true);
  const ts = guardado(almacen).entrev.cv.h;
  reloj.ahora += 1000;
  AA.store.prepararEntrevista("cv", "hecho", true); // volver a marcar no cambia la fecha
  assert.equal(guardado(almacen).entrev.cv.h, ts);
  AA.store.prepararEntrevista("cv", "nota", "Trabajé de 2022 a 2024 en logística.");
  assert.equal(AA.store.entrevista().cv.n, "Trabajé de 2022 a 2024 en logística.");
  AA.store.prepararEntrevista("cv", "hecho", false);
  assert.deepEqual(Object.keys(AA.store.entrevista().cv), ["n"]);
  AA.store.prepararEntrevista("cv", "nota", "   ");
  assert.equal(AA.store.entrevista().cv, undefined); // sin nada, se borra la entrada
  AA.store.prepararEntrevista("metas", "nota", "x".repeat(2500));
  assert.equal(AA.store.entrevista().metas.n.length, 2000);
  assert.equal(AA.store.prepararEntrevista("metas", "otro", 1), false);
});

test("los ids de la lista de la entrevista en proceso.json son únicos y estables", () => {
  const proceso = JSON.parse(fs.readFileSync(path.join(WEB, "..", "datos", "proceso.json"), "utf8"));
  const ids = proceso.entrevista.trayectoria.items.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[a-z][a-z-]*$/));
});

// ------------------------------------------------------------------ integración en la web
test("la web registra la entrevista y carga marcas.js antes de store.js", () => {
  const app = fs.readFileSync(path.join(WEB, "js", "app.js"), "utf8");
  assert.match(app, /\["entrevista", "Entrevista"\]/);
  assert.match(app, /var MAS = \[[^\]]*"entrevista"/);
  assert.match(app, /r === "entrevista"\) vista = V\.entrevista\(\)/);
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
  const i = (s) => html.indexOf(s);
  assert.ok(i("data/fisicas.js") >= 0 && i("js/util.js") < i("js/marcas.js") && i("js/marcas.js") < i("js/store.js"));
  const paginas = fs.readFileSync(path.join(WEB, "js", "paginas.js"), "utf8");
  assert.match(paginas, /store\.guardarMarca\(/);
  assert.match(paginas, /store\.prepararEntrevista\(/);
  assert.match(paginas, /consulta a un profesional/);
});

test("marcas.js es ES5 y no toca el DOM", () => {
  const src = fs.readFileSync(path.join(WEB, "js", "marcas.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`|\bclass\s/);
  assert.doesNotMatch(src, /document\.|AA\.h\(/);
});
