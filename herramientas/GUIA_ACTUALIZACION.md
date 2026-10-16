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

`temas` son las fichas que **citan** algún artículo modificado (o de las que no se puede descartar: la
reforma toca una disposición o un anexo, o la ficha no cita artículos concretos). `otrosTemas` son fichas que
citan la norma pero no esos artículos; no hace falta tocarlas, aunque conviene echar un vistazo si el cambio
es de fondo. Si ninguna ficha cita los artículos modificados, la novedad se registra sola como
`incorporada` y `sinImpacto`, sin issue ni banner. La detección lee los números de artículo del texto de la
ficha sin distinguir de qué norma son: si una ficha cita «art. 49» de otra norma, puede avisar de más.

## 2. Actualizar cada ficha afectada

Para cada tema de la novedad (`datos/temas/tema-NN.json`):

1. Descarga el texto vigente: `python -I herramientas/boe.py <ID de la norma> trabajo/actualizacion/<norma>.txt`
   y lee los artículos indicados. El fichero trae el texto **vigente hoy** de cada artículo y, si el BOE ya ha
   publicado reformas que aún no rigen, justo después la versión futura marcada `[a49 · desde 2026-10-23 · BOE-…]`
   (`NUEVO` si el artículo aún no existe); la cabecera dice cuántos bloques tienen versión futura. Con
   `--fecha AAAAMMDD` se obtiene el texto vigente a otra fecha y con `--sin-futuras` se omiten las futuras.
   Para saber qué dice la reforma, lee también la norma modificadora (`modificadora.id`, p. ej. `BOE-A-2026-20528`).
2. Revisa en la ficha: `resumen`, `clave`, `trampas`, `mnemotecnias`, `tarjetas` y, sobre todo, las
   `preguntas` cuya respuesta, explicación o `ref` dependan de esos artículos. Cambia la respuesta
   correcta o reescribe la pregunta si el dato ha cambiado. No dejes ninguna pregunta con redacción antigua.
   El `id` de cada pregunta y tarjeta (`q_NN_01`, `t_NN_01`; ver `migrar_ids.py`) conserva el historial de los usuarios
   aunque corrijas el texto. Si cambia el **sentido** de una pregunta (otra respuesta correcta), borra su `id` y
   ejecuta `migrar_ids.py`: recibirá un número nuevo y quien la acertó con la redacción antigua no la tendrá por dominada.
3. Añade una línea en `novedades` de la ficha (qué cambió, desde cuándo) y, si hubo una reforma que cayó en
   exámenes, en `caido`/`trampas`.
4. Actualiza `normas[].verificado` (fecha de consolidación leída) y `actualizado` (fecha de hoy).
5. Si añades preguntas o tarjetas nuevas: `python -I herramientas/migrar_ids.py` (les da el siguiente número libre).
6. Valida: `python -I herramientas/validar_tema.py datos/temas/tema-NN.json` (0 errores). El workflow repite esta
   validación antes de publicar: con errores, la web no se actualiza.

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
