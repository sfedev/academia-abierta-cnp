# Esquema de datos

Todos los ficheros son JSON estricto en UTF-8 (comillas dobles, sin comas finales ni comentarios). La forma de las
fichas la comprueba `herramientas/validar_tema.py`; los criterios de redacción están en
`herramientas/GUIA_REDACTORES.md`. Los ejemplos de abajo usan `jsonc` solo para poder comentar.

## 1. Ficha de tema: `datos/temas/tema-NN.json`

Una por tema, `NN` con dos dígitos (`tema-01.json` … `tema-45.json`). Ejemplo completo: `datos/temas/tema-14.json`.

```jsonc
{
  "tema": 14,                                   // entero 1-45, igual al número del nombre del fichero
  "titulo": "Seguridad Ciudadana (LO 4/2015)",   // 3-90 caracteres (corto: el título literal lo pone la web)
  "bloque": "A",                                // A: temas 1-26 · B: 27-37 · C: 38-45
  "actualizado": "2026-10-16",                  // AAAA-MM-DD de la última revisión de la ficha
  "peso": { "nivel": "alto", "nota": "Cuánto y qué cae en examen" },   // nivel: alto | medio | bajo
  "normas": [
    { "nombre": "Ley Orgánica 4/2015, de 30 de marzo, de protección de la seguridad ciudadana",
      "boe": "BOE-A-2015-3442",                 // opcional: solo normas del BOE (es lo que vigila vigilar_leyes.py)
      "url": "https://www.boe.es/buscar/act.php?id=BOE-A-2015-3442",   // obligatoria, https
      "verificado": "Texto consolidado, actualización de 19/12/2025 (leído el 16/10/2026)" }
  ],
  "novedades": ["Reformas recientes que afectan al tema, con su fecha"],
  "clave": ["**Lo imprescindible**: 6-14 frases con el dato y el artículo"],
  "resumen": [
    { "titulo": "Identificación de personas",
      "puntos": ["Frase con el dato y el artículo (art. 16.2)", "…"],   // al menos 2 por sección
      "tabla": { "cabecera": ["Leves", "Graves"], "filas": [["…", "…"]] },   // opcional
      "ampliado": true }                        // opcional: sección «trampa fina», plegada en la web
  ],
  "trampas": ["4-10 cambios típicos de los distractores (órgano, plazo, cifra, absolutos)"],
  "caido": [ { "examen": "1 mar 2025", "concepto": "Qué se preguntó (art. X)" } ],
  "mnemotecnias": ["Regla breve para recordar una lista o una cifra"],
  "tarjetas": [ { "id": "t_14_01", "p": "Pregunta", "r": "Respuesta con **negrita** (art. 16.2)" } ],
  "preguntas": [
    { "id": "q_14_01",
      "enunciado": "Enunciado autónomo",
      "opciones": ["Primera", "Segunda", "Tercera"],   // exactamente 3, distintas
      "correcta": 0,                                  // índice 0, 1 o 2 (no booleanos)
      "explicacion": "Por qué la correcta lo es y por qué fallan las demás, sin citar letras",
      "ref": "art. 16.2 LO 4/2015",                   // artículo/apartado y norma, o la fuente
      "dificultad": 2 }                               // 1 fácil · 2 media · 3 trampa fina
  ],
  "dudas": ["Lo que no se pudo verificar, escrito para el opositor (máx. 300 caracteres)"]
}
```

### Campos y límites

| Campo | Tipo | Regla del validador |
|---|---|---|
| `tema` | entero | 1-45 y coherente con el nombre del fichero. |
| `bloque` | `"A"`/`"B"`/`"C"` | El que corresponde al número de tema. |
| `titulo` | cadena | 3-90 caracteres (la guía pide ≤ 70). |
| `actualizado` | cadena | `AAAA-MM-DD`. |
| `peso.nivel` / `peso.nota` | cadena | `alto`, `medio` o `bajo` / texto no vacío. `build.py` sustituye el nivel por el de `fuentes/pesos-por-tema.json`. |
| `normas[]` | lista ≥ 1 | `nombre` y `url` https obligatorios; sin `verificado` solo hay aviso. |
| `clave` | lista de cadenas | 6-14 elementos. |
| `resumen[]` | lista ≥ 3 | Cada sección con `titulo` y ≥ 2 `puntos`; cada fila de `tabla` con tantas celdas como `cabecera`. |
| `trampas` | lista de cadenas | 4-10 elementos. |
| `caido[]` | lista de objetos | `examen` y `concepto` no vacíos. |
| `mnemotecnias`, `novedades`, `dudas` | listas | Opcionales (`[]` si no hay). |
| `tarjetas[]` | lista | 10-24, cada una con `id`, `p` y `r`. |
| `preguntas[]` | lista | 15-24, o hasta 30 si la ficha tiene alguna sección `ampliado`. |

Reglas de texto que comprueba el validador en todas las cadenas: no vacías, sin HTML (solo `**negrita**`, con los
`**` emparejados). En las opciones están prohibidas «todas/ninguna de las anteriores» y «todas son correctas /
ninguna es correcta», y los enunciados no se repiten dentro de la ficha. La guía de redactores añade: sin listas
Markdown, enlaces ni saltos de línea.

Avisos (no bloquean): falta `verificado`; resumen corto (< 700, 450 o 300 palabras para peso alto, medio o bajo) o
largo (> 2.600), sin contar las secciones `ampliado`; explicación de menos de 12 palabras; explicación que cita
letras («opción B», «a)») —la web baraja las opciones—; una posición de la correcta por debajo del 20 %.

### Identificadores `q_NN_XX` y `t_NN_XX`

- Preguntas `q_NN_XX`, tarjetas `t_NN_XX`: `NN` = tema con dos dígitos, `XX` = número de dos o más dígitos.
  Regex: `q_%02d_\d{2,}` y `t_%02d_\d{2,}`.
- Obligatorios y únicos en toda la aplicación (`validar_tema.py` y `build.py` fallan si no).
- No se escriben a mano: `python -I herramientas/migrar_ids.py` da a cada elemento sin id el siguiente número libre
  (máximo + 1). Los números de elementos borrados no se reutilizan.
- La web guarda el progreso con ellos. Corregir el texto conserva el id. Si cambia el **sentido** de una pregunta
  (otra respuesta correcta), se borra su id y se vuelve a ejecutar `migrar_ids.py`.

### Lo que añade `build.py` (solo en `web/data/datos.js`)

- `peso.nivel` (de `pesos-por-tema.json`), `peso.media` (preguntas por examen) y `peso.confianza`.
- `preguntas[].verif = {"e": estado}` (y `"por": "persona" | "ia"` si está `revisada`), solo si la pregunta no ha
  cambiado desde la auditoría.

## 2. `datos/meta.json`

Generado por `gen_meta.py` desde `fuentes/anexo-I-literal.txt` (los títulos cortos están en el diccionario `CORTOS`
del script).

```jsonc
{ "convocatoria": { "titulo": "…", "boe": "BOE-A-2026-15055", "url": "…", "publicacion": "BOE núm. 167, de 10 de julio de 2026" },
  "bloques": [ { "id": "A", "nombre": "Ciencias Jurídicas", "temas": [1, 26] }, … ],
  "temas":   [ { "tema": 1, "titulo": "Derecho, normas y persona", "bloque": "A", "oficial": "Texto literal del Anexo I" }, … ] }
```

## 3. `fuentes/pesos-por-tema.json`

Lista de `{ "tema", "peso": "alto|medio|bajo", "preguntasMedia": número, "confianza": "alta|media|baja", "nota" }`.
Es la fuente de verdad del peso: la usan `build.py`, el simulacro (reparto de las 100 preguntas) y la guía de estudio.

## 4. Auditoría de preguntas

`datos/auditoria.json` (lo escribe `auditar_preguntas.py`; no se edita a mano):

```jsonc
{ "generado": "AAAA-MM-DD", "normasEnCache": 110, "normasNecesarias": 115,
  "resumen": { "verificada": 201, "revisada": 777, "referencia": 0, "no_verificable": 7, "revisar": 0 },
  "porTema": { "1": { "verificada": 9, "revisada": 10, … }, … },
  "preguntas": { "q_01_01": { "tema": 1, "estado": "verificada", "huella": "972c4a105381",
                              "articulos": [ { "norma": "BOE-A-1889-4763", "art": "22", "encontrado": true } ],
                              "motivos": [], "avisos": ["…"] } } }
```

- `huella`: SHA-1 (12 caracteres) de `[enunciado, opciones, correcta, ref]`. Si cambia uno de esos campos, la
  auditoría queda desfasada (las pruebas fallan) y la web deja de mostrar la insignia. Cambiar solo la
  `explicacion` no altera la huella.
- Estados: `verificada`, `revisada`, `referencia`, `no_verificable`, `revisar` (significado en `LEEME.md`).

`datos/auditoria-revisiones.json`: `{ "q_14_03": { "huella", "fecha", "nota", "por": "persona" | "ia" } }`. Una
revisión vale mientras la huella coincida. Se añade con `auditar_preguntas.py revisar ID … --por ia --nota "…"`.

## 5. Novedades: `datos/novedades.json`

`{ "items": [ … ] }`. Cada novedad de ley (`vigilar_leyes.py`), con valores de ejemplo:

```jsonc
{ "id": "89350361f1",                  // sha1("norma|modificadora|publicación|vigencia")[:10]
  "detectado": "2026-10-16",
  "tipo": "modificada",                // modificada (ya rige) | proxima (entra en vigor más tarde) | derogada
  "estado": "pendiente",               // pendiente | incorporada
  "norma": { "id": "BOE-A-2024-3793", "corto": "RD 207/2024", "titulo": "…", "url": "…" },
  "modificadora": { "id": "BOE-A-2026-9079", "titulo": "…", "url": "…" },
  "publicacion": "2026-04-27", "vigencia": "2026-04-27",
  "articulos": ["Art. 1", "Art. 4", "Art. 8 bis", "Art. 8 ter", "Art. 9", "Art. 13"],   // como mucho 12
  "nArticulos": 6,                     // recuento real
  "temas": [7, 8, 12, 15, 26],         // fichas que citan algún artículo modificado (avisan)
  "otrosTemas": [],                    // citan la norma, pero no esos artículos (no avisan)
  "articulosPorTema": { "7": ["Art. 1", "Art. 4"], … }   // artículos modificados que cita cada ficha de `temas`
  // "revisada": "AAAA-MM-DD"          al pasar a incorporada
  // "sinImpacto": true                si ninguna ficha cita los artículos: `temas` vacío y nace incorporada
}
```

`otrosTemas`, `articulosPorTema` y `sinImpacto` pueden faltar en las novedades registradas antes de la vigilancia por
artículo: el código que las lee usa `e.otrosTemas || []`.

Las de convocatoria (`vigilar_convocatoria.py`) tienen `"tipo": "convocatoria"`, `norma.id` = la resolución nueva,
`temas` = fichas modificadas, renumeradas o eliminadas, y un bloque extra:

```jsonc
// valores de ejemplo
"convocatoria": { "plazas": 0, "plazasLibres": 0, "plazo": "…", "primeraPrueba": "…", "cambios": true,
                  "temario": { "iguales": 40, "renumerados": [ { "de": 9, "a": 10 } ],
                               "modificados": [ { "tema": 8, "nuevoNumero": 8, "antes": "…", "despues": "…", "parecido": 0.91 } ],
                               "nuevos": [ { "tema": 46, "texto": "…" } ], "eliminados": [ { "tema": 33, "texto": "…" } ] } }
```

(`"sinAnexo": true` en `temario` si no se pudo leer el Anexo I.)

`web/data/novedades.js` define `window.AA_NOVEDADES` con `comprobacion`, `normasVigiladas`, `sinConsolidar`,
`otrasFuentes`, `errores` y los 150 `items` más recientes.

## 6. Vigilancia: `datos/vigilancia/`

- `estado.json`: la foto del BOE. `{ "fecha", "normas": { "BOE-A-…": { "corto", "titulo", "derogada", "actualizada",
  "bloques": { "a16": { "r": "Art. 16", "v": ["publicación:vigencia:id_norma_que_modifica", …] } } } } }`.
- `titulos.json`: caché `{id BOE: título}` de las normas modificadoras.
- `convocatoria.json`: `{ "ultimaFecha", "comprobacion", "conocidas": ["BOE-A-2026-15055", …] }`.

## 7. Otros

- `datos/proceso.json`: bases de la convocatoria (`fuente`, `calendario2026`, `idioma`, `psicotecnicos`); `build.py`
  lo publica en `AA_META.proceso`.
- `web/data/fisicas.js`: `window.AA_FISICAS`, baremos del Anexo II (listas `[límite, puntos]` de la mejor a la peor
  marca). Se edita a mano.
- `examenes/<código>.json` (fuera del repositorio): salida de `importar_examen.py`,
  `{ "formato": "academia-abierta-examen-v1", "codigo", "titulo", "fecha", "fuente", "validas",
  "preguntas": [ { "n", "enunciado", "opciones", "correcta", "anulada", "tema"?, "temaPuntos"? } ] }`.
