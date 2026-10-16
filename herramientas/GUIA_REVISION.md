# Guía de revisión de preguntas y de «dudas»

Complementa la auditoría automática (`herramientas/auditar_preguntas.py`, ver `LEEME.md`). La auditoría comprueba
que el artículo citado existe, está vigente y contiene las cifras de la respuesta; **no puede juzgar el sentido**
de una pregunta. Esta guía explica cómo revisarlo y cómo depurar las notas `dudas` de las fichas. Sirve para una
persona y para una revisión asistida por IA (que se registra como tal: la web lo indica).

## 1. Ver el estado de tus temas (sin escribir nada)

```bash
python -I herramientas/auditar_preguntas.py --temas 14,15 --sin-guardar --revisiones-extra trabajo/revisiones/gNN.json
```

El texto vigente de cada norma del BOE está en `trabajo/normas/<ID BOE>.txt` (si falta:
`python -I herramientas/auditar_preguntas.py --descargar`). Cada bloque empieza por `[a36]`; si el BOE ya ha
publicado una reforma que aún no rige, sigue un bloque `[a36 · desde AAAA-MM-DD · BOE-…]` con la redacción futura.
Algunas normas rotulan con letra («Artículo cuarenta y nueve.»).

## 2. Qué comprobar en cada pregunta

Revisa todas las preguntas de tus temas en estado `referencia` o `no_verificable` (y cualquier otra si ves algo raro):

1. **La opción marcada es la única correcta** según el texto vigente de la fuente. Si la `ref` dice
   «(redacción de la Ley X)», según la redacción que esa ley introduce. En preguntas en negativo («señale la
   INCORRECTA»), la marcada debe ser la única falsa.
2. **Los distractores son claramente falsos**: ni parcialmente ciertos ni discutibles. Si dos opciones pueden
   defenderse, reescribe la pregunta.
3. **La explicación** coincide con el texto, justifica la correcta y descarta las demás, sin citar letras (A/B/C).
4. **La `ref` es exacta y nombra la norma**: «art. 36.2 LO 4/2015», «art. 44.2 LOTC». Si cita una norma que no está
   en `normas` de la ficha, añádela (nombre, `boe`, `url`, `verificado` con la fecha de consolidación de la cabecera).
5. **Fuentes que no son del BOE**: compruébalas en la fuente primaria oficial (RAE: DLE, DPD, Ortografía; ONU/OHCHR;
   Consejo de Europa; INE; IETF/RFC; INCIBE; CCN-CERT; ENISA; Europol; DGT; EUDA/PNSD; EUR-Lex). Los resúmenes de
   WebFetch sirven para localizar, no como prueba: confirma el dato concreto en el texto de la fuente.

## 3. Corregir y registrar

- **Corregir**: edita la pregunta en `datos/temas/tema-NN.json` (enunciado, opciones, `correcta`, `explicacion`, `ref`)
  y valida con `python -I herramientas/validar_tema.py datos/temas/tema-NN.json` (0 errores). Conserva el `id` si la
  pregunta mantiene su sentido; si cambia la respuesta correcta de fondo, borra su `id` y ejecuta
  `python -I herramientas/migrar_ids.py` (ver `GUIA_ACTUALIZACION.md`).
- **Registrar** (solo lo que hayas comprobado de verdad, y **después** de la versión final de la pregunta, porque la
  revisión queda ligada al texto exacto):

  ```bash
  python -I herramientas/auditar_preguntas.py revisar q_14_03 q_14_07 --por ia \
         --nota "Art. 36.6 LO 4/2015 (texto vigente)" --archivo trabajo/revisiones/gNN.json
  ```

  La nota dice qué fuente y qué dato confirmaste, en pocas palabras. Lo que no puedas comprobar con una fuente
  primaria **no se registra**: queda como está y lo indicas en tu informe.

## 4. Las notas `dudas` de las fichas

Cada nota de `dudas` debe acabar en uno de estos dos estados:

- **Resuelta**: confirmas el dato con una fuente primaria. Incorpóralo a la ficha donde corresponda (resumen, clave,
  tarjetas, `normas`) y **borra la nota**.
- **Justificada**: no hay fuente primaria que lo zanje (doctrina, clasificaciones de manual, datos provisionales,
  reformas en trámite). Reescríbela para el opositor, en una o dos frases (máximo 300 caracteres): qué no es seguro y
  cómo tratarlo en el examen. Ejemplo: «La distinción entre seguridad individual y colectiva es doctrinal: no hay
  definición legal; se expone la clasificación habitual de los manuales».

Las notas no pueden hablar del proceso de trabajo: nada de errores HTTP, «no he podido abrir», «el buscador»,
«extractos», «el encargo», «el redactor», nombres de herramientas ni rutas de ficheros. Si una nota solo contaba eso,
o se resuelve o se borra.

## 5. Reglas

- Toca solo las fichas de tus temas y tu fichero `trabajo/revisiones/gNN.json`.
- No ejecutes `build.py` ni la auditoría sin `--sin-guardar`; no edites `web/` ni `herramientas/`; no hagas commit.
- No copies redacción de academias ni enunciados de exámenes oficiales.
