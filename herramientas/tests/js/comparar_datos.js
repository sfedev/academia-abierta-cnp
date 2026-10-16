// Auxiliar de las pruebas de empaquetado: carga dos datos.js (el original y el escapado a ASCII de dist/) y comprueba
// que definen exactamente los mismos datos. Uso: node comparar_datos.js original.js empaquetado.js
"use strict";
const vm = require("node:vm");
const fs = require("node:fs");

function cargar(ruta) {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ruta, "utf8"), ctx, { filename: ruta });
  return ctx;
}

const [a, b] = process.argv.slice(2).map(cargar);
const claves = ["AA_META", "AA_TEMAS", "AA_NOVEDADES", "AA_FISICAS"].filter((k) => a[k] !== undefined || b[k] !== undefined);
let iguales = true;
for (const k of claves) {
  const ok = JSON.stringify(a[k]) === JSON.stringify(b[k]);
  if (!ok) iguales = false;
  console.log(k + ": " + (ok ? "iguales" : "DISTINTOS"));
}
process.exit(iguales && claves.length ? 0 : 1);
