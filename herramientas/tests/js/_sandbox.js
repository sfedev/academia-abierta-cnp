// Carga util.js, store.js y test.js de la web en un contexto aislado (sin navegador), con reloj, azar y
// almacenamiento controlados, para poder probar su lógica.
"use strict";
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.resolve(__dirname, "..", "..", "..", "web");

function crearContexto(opts) {
  opts = opts || {};
  const almacen = opts.storage || {}; // clave -> texto, como localStorage
  const reloj = { ahora: opts.now || Date.UTC(2026, 9, 16, 12, 0, 0) };
  const DateFalsa = class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj.ahora); }
    static now() { return reloj.ahora; }
  };
  const mate = Object.create(Math);
  mate.random = opts.random || Math.random;
  const ctx = {
    console, Object, JSON, Array, String, Number, Date: DateFalsa, Math: mate, parseInt, parseFloat, isNaN, RegExp, Error,
    setInterval() { return 0; }, clearInterval() {}, setTimeout() { return 0; },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
      setItem(k, v) { almacen[k] = String(v); },
    },
    document: { body: { contains() { return false; } }, addEventListener() {}, removeEventListener() {}, createElement() { throw new Error("sin DOM"); } },
    addEventListener() {}, removeEventListener() {},
  };
  ctx.window = ctx;
  if (opts.meta) ctx.AA_META = opts.meta;
  if (opts.temas) ctx.AA_TEMAS = opts.temas;
  vm.createContext(ctx);
  return { ctx, almacen, reloj };
}

function cargarScript(ctx, ruta, nombre) {
  vm.runInContext(fs.readFileSync(ruta, "utf8"), ctx, { filename: nombre || ruta });
}

/* opts: { meta, temas, storage, now, random, datosReales, test } */
function cargarWeb(opts) {
  opts = opts || {};
  const c = crearContexto(opts);
  if (opts.datosReales) cargarScript(c.ctx, path.join(WEB, "data", "datos.js"), "datos.js");
  cargarScript(c.ctx, path.join(WEB, "js", "util.js"), "util.js");
  cargarScript(c.ctx, path.join(WEB, "js", "store.js"), "store.js");
  if (opts.test || opts.oficiales) cargarScript(c.ctx, path.join(WEB, "js", "test.js"), "test.js");
  if (opts.oficiales) cargarScript(c.ctx, path.join(WEB, "js", "oficiales.js"), "oficiales.js");
  if (opts.psico) cargarScript(c.ctx, path.join(WEB, "js", "psicotecnicos.js"), "psicotecnicos.js");
  c.AA = c.ctx.AA;
  return c;
}

/* Datos mínimos de prueba: 2 temas con preguntas y tarjetas con id fijo. */
function datosMini() {
  const preg = (tema, n, texto, ok) => ({ id: `q_${String(tema).padStart(2, "0")}_${String(n).padStart(2, "0")}`, enunciado: texto, opciones: ["A", "B", "C"], correcta: ok, explicacion: "x", ref: "r", dificultad: 2 });
  const tarj = (tema, n, p) => ({ id: `t_${String(tema).padStart(2, "0")}_${String(n).padStart(2, "0")}`, p, r: "resp " + p });
  const meta = {
    bloques: [{ id: "A", nombre: "A", temas: [1, 1] }, { id: "B", nombre: "B", temas: [2, 2] }],
    temas: [
      { tema: 1, titulo: "Uno", bloque: "A", oficial: "o", peso: "alto", media: 3 },
      { tema: 2, titulo: "Dos", bloque: "B", oficial: "o", peso: "bajo", media: 1 },
    ],
  };
  const temas = {
    1: { tema: 1, preguntas: [preg(1, 1, "Pregunta uno", 0), preg(1, 2, "Pregunta dos", 1), preg(1, 3, "Pregunta tres", 2)], tarjetas: [tarj(1, 1, "Tarjeta uno"), tarj(1, 2, "Tarjeta dos")] },
    2: { tema: 2, preguntas: [preg(2, 1, "Pregunta cuatro", 0)], tarjetas: [tarj(2, 1, "Tarjeta tres")] },
  };
  return { meta, temas };
}

module.exports = { cargarWeb, datosMini, WEB };
