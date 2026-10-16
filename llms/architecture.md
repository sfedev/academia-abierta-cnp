# Arquitectura

Contexto técnico para agentes. Resumen de reglas en [`CLAUDE.md`](../CLAUDE.md); diagramas para personas en
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## 1. Flujo estático

No hay servidor de aplicación ni base de datos. Todo el contenido se convierte en ficheros `.js` que definen
variables globales, y la web los carga con `<script>`.

```
datos/meta.json ─────────────┐
datos/temas/tema-NN.json ────┤
fuentes/pesos-por-tema.json ─┼─ build.py ──► web/data/datos.js   (window.AA_META, window.AA_TEMAS)
datos/auditoria.json ────────┤
datos/proceso.json ──────────┘
datos/novedades.json ── vigilar_leyes.py ──► web/data/novedades.js   (window.AA_NOVEDADES)
(a mano) ───────────────────────────────────► web/data/fisicas.js    (window.AA_FISICAS, baremos del Anexo II)

web/ (UTF-8) ── empaquetar.py ──► dist/  (ASCII puro, index.html como fragmento)
                              └─► sitio/ (igual + index.html completo + .nojekyll) ──► GitHub Pages
```

- `build.py` lee `datos/meta.json`, cada ficha y `fuentes/pesos-por-tema.json`. **El peso de la ficha lo manda
  `pesos-por-tema.json`**: sobrescribe `peso.nivel` y añade `peso.media` y `peso.confianza`. Copia a cada pregunta
  su estado de auditoría (`verif`) si la huella coincide, publica `datos/proceso.json` en `AA_META.proceso` y el
  recuento en `AA_META.resumen`. Falla si algún `id` falta, tiene otro formato o se repite.
- `datos.js` se escribe con `ensure_ascii=True`: ya sale en ASCII.
- La CI (`.github/workflows/vigilar-y-publicar.yml`) ejecuta `validar_tema.py`, `build.py` y `empaquetar.py` y
  publica `sitio/`. `dist/` y `sitio/` no se versionan.

## 2. Carga de la página

`web/index.html` es un **fragmento**: sin `<!doctype>`, `<head>` ni `<body>`, porque el publicador de artefactos de
Claude añade el esqueleto. `serve.py` lo envuelve al servirlo y `empaquetar.py` genera en `sitio/` la versión
completa para GitHub Pages (con `<meta charset>` en los primeros 1024 bytes).

Orden de los scripts (cada uno depende de los anteriores):

| Fichero | Qué define |
|---|---|
| `data/datos.js`, `data/fisicas.js`, `data/novedades.js` | Globales de datos: `AA_META`, `AA_TEMAS`, `AA_FISICAS`, `AA_NOVEDADES`. |
| `js/util.js` | `AA.h`, `AA.append`, `AA.html`, `AA.esc`, `AA.rich`, `AA.plain`, `AA.norm`, `AA.hash`, `AA.shuffle`, fechas, `AA.notaTest`, `AA.toast`, `AA.copy`. |
| `js/store.js` | `AA.meta`, `AA.temas`, `AA.listaTemas`, `AA.preguntas`, `AA.tarjetas`, novedades, `AA.guia`, `AA.repaso` y `AA.store` (todo el progreso). |
| `js/vistas.js` | `AA.vistas` (alias `V`): `panel`, `temario`, `tema`, `novedades`, `noEncontrado`. |
| `js/test.js` | `AA.test` (tests, simulacros, velocidad, cuaderno de errores) y `AA.tarjetasUI` (Leitner). |
| `js/oficiales.js` | `AA.oficiales` y `V.oficiales`: exámenes oficiales importados y calibración. |
| `js/psicotecnicos.js` | `AA.psico` y `V.psicotecnicos`: ejercicios generados al momento. |
| `js/paginas.js` | `V.proceso`, `V.fisicas`, `V.progreso` (copia de seguridad). |
| `js/app.js` | Arranque: cabecera, navegación, router por hash, buscador global, tema claro/oscuro, insignia de novedades. |

Todos los ficheros de `js/` son IIFE con sintaxis ES5 que cuelgan de `window.AA`; no hay módulos ni bundler.

## 3. Router y vistas

- Rutas por hash: `#panel`, `#temario`, `#tema-NN`, `#novedades`, `#test`, `#tarjetas`, `#oficiales`,
  `#psicotecnicos`, `#fisicas`, `#proceso`, `#progreso`. Una ruta desconocida lleva al Panel.
- `route()` en `app.js` llama a la función de la vista, que **devuelve un nodo nuevo**, vacía el contenedor
  `#vista` y lo inserta. Cada cambio de ruta repinta la vista entera; no hay DOM virtual ni diff.
- Un `try/catch` alrededor de la vista muestra un aviso si algo falla, en lugar de dejar la página en blanco.
- `AA.go(ruta)` navega desde código. Hay un respaldo por clic para visores que no emiten `hashchange`.
- Dentro de una vista, las partes interactivas se redibujan en su sitio (sustituyendo su nodo) sin pasar por el
  router.

## 4. Montaje del DOM con `AA.h()`

```js
var h = AA.h;
var tarjeta = h("div", { class: "card", "data-tema": 14 },
  h("h3", {}, "Seguridad Ciudadana"),
  h("p", { html: AA.rich("Plazo máximo de **6 horas** (art. 16.2)") }),
  h("button", { class: "btn", type: "button", onclick: function () { AA.go("tema-14"); } }, "Abrir"),
  condicion ? h("span", { class: "tag" }, "Nuevo") : null
);
```

Reglas de `AA.h(tag, attrs, …hijos)` (`web/js/util.js`):

- `attrs.class` → `className`; `attrs.html` → `innerHTML`; `on…` con función → `addEventListener`;
  `true` → atributo vacío; `null`/`false` → se omite; el resto → `setAttribute`.
- Hijos: los arrays se aplanan, los `Node` se insertan, `null`/`false` se ignoran y cualquier otro valor se convierte
  en **nodo de texto** (seguro frente a inyección).
- `attrs.html` es la única vía a `innerHTML`: úsala solo con `AA.rich(texto)` (escapa con `AA.esc` y después
  convierte `**negrita**` en `<strong>`) o con SVG fijo del propio código. Nunca con datos sin escapar.

## 5. Persistencia en `localStorage`

No hay cookies ni `sessionStorage`. Tres claves:

| Clave | Fichero | Contenido |
|---|---|---|
| `academia-abierta-policia-v1` | `store.js` | Todo el progreso (objeto de abajo). |
| `academia-abierta-theme` | `app.js` | `"light"` o `"dark"` si se fuerza el tema; sin clave, se sigue al sistema. |
| `academia-abierta-oficiales-v1` | `oficiales.js` | Exámenes oficiales importados por el usuario desde un `.json`. |

Forma del progreso (`fresh()` en `store.js`):

```js
{ v: 1,            // versión del formato; load() descarta lo que no sea v === 1
  ids: 2,          // 1 = progreso con ids antiguos (hash del texto); 2 = con el id fijo de la ficha
  leidos: {},      // {tema: marca de tiempo}
  preg: {},        // {q_NN_XX: {n, ok, last: 1|0, ts, tipo?, tipoTs?, motivos?}}  (tipo/motivos: cuaderno de errores)
  tarj: {},        // {t_NN_XX: {caja: 1..5, due: ms, n}}  (Leitner, intervalos [0,1,3,7,16,35] días)
  sims: [],        // historial de tests de 20 o más preguntas (máx. 60)
  ult: null, tema: 0,
  nov: [],         // ids de novedades legales ya vistas en este navegador
  aj: {},          // ajustes (p. ej. aj.repaso = Modo Repaso Intensivo)
  psico: [],       // resultados de psicotécnicos (máx. 40)
  guia: {},        // días hechos de la guía de estudio por tema
  vel: [] }        // entrenamiento de velocidad (máx. 30)
```

- Lectura con `Object.assign(fresh(), guardado)`: **un campo nuevo se añade a `fresh()`** y las copias antiguas lo
  reciben con su valor inicial. No subas `v` salvo que el formato deje de ser compatible.
- Toda escritura pasa por `save()` dentro de `try/catch`; si falla (modo privado, cuota), la app sigue y avisa de
  que no guarda (`AA.store.guardadoActivo()`).
- Migración de ids: si `ids !== 2`, `migrarIds()` recalcula el id antiguo (`tema + "." + AA.hash(texto)`) de cada
  pregunta y tarjeta y traslada su progreso al id fijo. Ocurre al cargar y al importar una copia antigua.
- Copia de seguridad: `AA.store.exportar()` devuelve el JSON del estado; `importar(texto)` valida `v === 1` y
  `preg`; `reiniciar()` vuelve a `fresh()`. La pestaña Progreso las ofrece.
- El progreso se indexa por el `id` de la ficha (`q_NN_XX`, `t_NN_XX`): corregir un enunciado no borra el historial.

## 6. Compilación a ASCII

Algunos visores sirven los `.js` sin `charset` y el navegador los decodifica como Windows-1252: «Policía» se vería
«PolicÃ­a». Por eso `web/` se escribe en UTF-8 legible y lo publicado es ASCII puro (`herramientas/empaquetar.py`):

- `.js` → cada carácter no ASCII como `\uXXXX` (pares sustitutos para los que pasan de U+FFFF).
- `.html` → entidades `&#NNN;`.
- `.css` → en los comentarios se quitan los acentos; **fuera de comentarios no se admite nada que no sea ASCII**
  (el script se detiene).
- Al final comprueba que ningún `.js`, `.html` o `.css` de `dist/` tiene bytes ≥ 0x80, que todo lo que cargan el
  HTML y el CSS existe y que no se pide nada a servidores externos (ni Google Fonts). `dist/` y `sitio/` deben
  llevar las mismas fuentes `.woff2`.
- Prueba local de la decodificación errónea: `python herramientas/serve.py 8765 dist --latin1`.

## 7. Pruebas

- `herramientas/ejecutar_tests.py` carga cada `herramientas/tests/test_*.py` (`unittest`) y, con Node.js, las pruebas
  `herramientas/tests/js/*.test.js`.
- Las de JavaScript cargan `util.js`, `store.js`, `test.js`, `vistas.js` y otros ficheros de la web en un contexto `vm` de Node
  (`herramientas/tests/js/_sandbox.js`) con reloj, azar y `localStorage` simulados y **sin DOM**
  (`document.createElement` lanza un error). Por eso la lógica va separada de las vistas y expuesta en
  `AA.test.interno`, `AA.psico.interno`, `AA.store`, `AA.guia`…
- Ninguna prueba usa la red ni toca los datos del repositorio: el BOE se simula y se trabaja en carpetas temporales.
- Otras pruebas comprueban el repositorio real: `datos.js` al día, auditoría al día y sin `revisar`, contraste WCAG
  del CSS, coherencia de `LEEME.md` y de las guías con los scripts existentes.
