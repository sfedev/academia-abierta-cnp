---
name: auditar-pregunta
description: Verifica una o varias preguntas tipo test del banco (ids q_NN_XX) contra su fuente primaria —artículo citado en `ref`, respuesta correcta, distractores y explicación— y registra la revisión en la auditoría. Úsala cuando `auditar_preguntas.py` deje preguntas en `revisar`, `referencia` o `no_verificable`, cuando las pruebas f7 fallen por auditoría desfasada, cuando alguien reporte una pregunta errónea o cuando se edite una pregunta y haya que volver a comprobarla.
---

# Auditar una pregunta

La auditoría automática (`herramientas/auditar_preguntas.py`) comprueba que el artículo citado existe, está vigente
y contiene las cifras de la respuesta; **no juzga el sentido**. Esta skill es la revisión de sentido. Referencia
completa: `herramientas/GUIA_REVISION.md`; estados de la auditoría en `LEEME.md`; esquema en `llms/data_schema.md`.

## 1. Localizar la pregunta y su estado

```bash
grep -rn '"q_14_03"' datos/temas/                                        # ficha y línea
python -I herramientas/auditar_preguntas.py --temas 14 --sin-guardar --listar revisar   # estado sin escribir nada
```

En `datos/auditoria.json` → `preguntas.q_14_03` tienes `estado`, `articulos` (norma y artículo que ha entendido,
`encontrado`), `motivos` (por qué no cuadra) y `avisos` (p. ej. una opción incorrecta con una cifra que también está
en el artículo).

## 2. Tener el texto de la fuente

- Normas del BOE: caché en `trabajo/normas/<ID BOE>.txt` (carpeta local, no versionada). Si falta:
  `python -I herramientas/auditar_preguntas.py --descargar --temas 14` (baja con `boe.py` las normas de esos temas
  que no estén). Si la norma ha cambiado, borra antes su fichero de la caché.
- Cada bloque empieza por `[a36]`; una reforma publicada que aún no rige aparece como
  `[a36 · desde AAAA-MM-DD · BOE-…]`. Algunas normas rotulan con letra («Artículo cuarenta y nueve.»).
- Fuentes que no son del BOE (temas 27-45 sobre todo): la fuente primaria oficial (RAE: DLE, DPD, Ortografía;
  ONU/OHCHR; Consejo de Europa; INE; IETF/RFC; INCIBE; CCN-CERT; ENISA; Europol; DGT; EUDA/PNSD; EUR-Lex). Un
  resumen de WebFetch sirve para localizar, no como prueba: confirma el dato en el texto de la fuente.

## 3. Comprobar

Para cada pregunta, con el texto vigente delante:

1. **La opción marcada (`opciones[correcta]`) es la única correcta.** En las preguntas en negativo («señale la
   INCORRECTA») la marcada debe ser la única falsa. Si la `ref` dice «(redacción de la Ley X)», según esa redacción.
2. **Los distractores son claramente falsos**: ni parcialmente ciertos ni discutibles. Si dos opciones se pueden
   defender, reescribe la pregunta.
3. **La explicación** coincide con el texto, justifica la correcta y descarta las demás **por su contenido**, nunca
   por la letra (la web baraja las opciones).
4. **La `ref` es exacta y nombra la norma**: «art. 36.2 LO 4/2015», «art. 44.2 LOTC». Si cita una norma que no está
   en `normas[]` de la ficha, añádela (`nombre`, `boe`, `url`, `verificado`). Nombrar la norma tras el artículo
   también ayuda al vigilante (`citas.py`) a no avisar de más.
5. **Vigencia**: la pregunta no depende de redacción derogada ni de una reforma que aún no rige (salvo que el
   enunciado lo diga).
6. **Originalidad**: no reproduce un examen oficial ni la redacción de una academia.

## 4. Corregir (si hace falta)

- Edita la pregunta en `datos/temas/tema-NN.json` y valida:
  `python -I herramientas/validar_tema.py datos/temas/tema-NN.json` (0 errores; atiende los avisos de explicación
  corta o que cita letras).
- Si la pregunta mantiene su sentido, conserva el `id`. Si cambia la respuesta correcta de fondo, borra el `id` y
  ejecuta `python -I herramientas/migrar_ids.py`.
- La huella de la auditoría cubre `enunciado`, `opciones`, `correcta` y `ref`: cambiar cualquiera de ellos invalida la
  revisión anterior; cambiar solo la `explicacion`, no.

## 5. Registrar la revisión

Solo lo que hayas comprobado de verdad con una fuente primaria, y **después** de la versión final del texto (la
revisión queda ligada a la huella):

```bash
python -I herramientas/auditar_preguntas.py revisar q_14_03 q_14_07 --por ia --nota "Art. 36.6 LO 4/2015 (texto vigente)"
python -I herramientas/auditar_preguntas.py --temas 14          # vuelve a auditar para actualizar los estados
python -I herramientas/build.py                                 # lleva las insignias a la web
python -I herramientas/ejecutar_tests.py f7
```

- `--por ia` si la revisión la haces tú (la web lo indica); `--por persona` solo si la ha hecho una persona.
- La nota dice qué fuente y qué dato confirmaste, en pocas palabras.
- Revisiones en paralelo: `revisar … --archivo trabajo/revisiones/gNN.json` y consulta con
  `--sin-guardar --revisiones-extra trabajo/revisiones/gNN.json`; al final, una sola persona junta con
  `auditar_preguntas.py fusionar trabajo/revisiones/*.json`.
- Antes de una auditoría completa (sin `--temas`), mira que `normasEnCache` de la salida no baje respecto al
  `datos/auditoria.json` versionado: con la caché incompleta, muchas preguntas perderían su estado.
- Lo que no puedas comprobar **no se registra**: queda como está y lo cuentas en tu informe.

## 6. Notas `dudas` de la ficha

Si al revisar encuentras una nota de `dudas` del mismo tema: o se **resuelve** (confirmas el dato, lo incorporas a la
ficha y borras la nota) o se **justifica** (una o dos frases para el opositor, máximo 300 caracteres, sobre qué no es
seguro y cómo tratarlo en el examen). Nunca hablan del proceso de trabajo (errores HTTP, herramientas, rutas,
«el redactor»); las pruebas lo comprueban.

## 7. Informe

Para cada pregunta: id, veredicto (correcta / corregida / id nuevo / sin fuente primaria), fuente consultada y
cambios hechos. No hagas commit sin que la persona lo pida; si lo pide, sigue `validar-despliegue`.
