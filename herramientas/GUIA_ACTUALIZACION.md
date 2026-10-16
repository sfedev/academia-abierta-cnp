# Cómo actualizar las fichas cuando cambia una ley

El vigilante (`herramientas/vigilar_leyes.py`, que ejecuta cada día GitHub Actions) detecta cambios en
las normas del BOE y los deja en `datos/novedades.json` con estado `pendiente`. La web los muestra en la
pestaña **Novedades** y como banner en las fichas afectadas. Esta guía explica cómo resolverlos.

## 1. Ver qué hay pendiente

```bash
python -I herramientas/vigilar_leyes.py listar
```

Cada novedad indica la norma, los temas afectados (`temas`), los artículos, la norma que la modifica
(`modificadora`), la fecha de publicación y la de entrada en vigor (`vigencia`). Si `tipo` es `proxima`, el
cambio todavía no rige: la ficha debe recoger lo vigente hoy y avisar del cambio (`novedades` de la ficha);
cuando entre en vigor hay que reescribir el contenido con la redacción nueva.

## 2. Actualizar cada ficha afectada

Para cada tema de la novedad (`datos/temas/tema-NN.json`):

1. Descarga el texto vigente: `python -I herramientas/boe.py <ID de la norma> trabajo/actualizacion/<norma>.txt`
   y lee los artículos indicados. Para saber qué dice la reforma, lee también la norma modificadora
   (`modificadora.id`, p. ej. `BOE-A-2026-20528`).
2. Revisa en la ficha: `resumen`, `clave`, `trampas`, `mnemotecnias`, `tarjetas` y, sobre todo, las
   `preguntas` cuya respuesta, explicación o `ref` dependan de esos artículos. Cambia la respuesta
   correcta o reescribe la pregunta si el dato ha cambiado. No dejes ninguna pregunta con redacción antigua.
3. Añade una línea en `novedades` de la ficha (qué cambió, desde cuándo) y, si hubo una reforma que cayó en
   exámenes, en `caido`/`trampas`.
4. Actualiza `normas[].verificado` (fecha de consolidación leída) y `actualizado` (fecha de hoy).
5. Valida: `python -I herramientas/validar_tema.py datos/temas/tema-NN.json` (0 errores).

## 3. Cerrar la novedad

```bash
python -I herramientas/vigilar_leyes.py revisar ID1 ID2      # o --todo
python -I herramientas/build.py                              # regenera web/data/datos.js
git add -A && git commit -m "Actualiza fichas por cambios legales" && git push
```

Al subir los cambios, GitHub Actions vuelve a publicar la web: la novedad pasa a «Reflejada en las fichas» y el
banner desaparece de las fichas.

## 4. Con Claude

Puedes pedírselo directamente en una sesión abierta en esta carpeta: «Revisa las novedades legislativas
pendientes, actualiza las fichas afectadas siguiendo `herramientas/GUIA_ACTUALIZACION.md` y márcalas como
revisadas». Revisa el resultado antes de subirlo: un dato legal mal reescrito se estudiaría como verdadero.

## Qué no vigila el sistema

- Normas sin texto consolidado en el BOE (tratados, convenios, normas antiguas).
- Referencias que no son del BOE: Derecho de la UE, RAE, INE, DGT y otras guías técnicas. Revísalas a mano de
  vez en cuando.
- El BOE actualiza el texto consolidado días o semanas después de publicar una reforma: un aviso puede llegar
  con retraso respecto al día de publicación.
