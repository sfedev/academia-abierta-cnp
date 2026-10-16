# Cómo contribuir

Academia Abierta es material de estudio gratuito y **no oficial**. Lo que más valor aporta, por este orden:

1. **Avisar de un error en el contenido**: un plazo, una cifra, un órgano o una respuesta que no cuadra con el BOE.
2. **Corregir o mejorar una ficha** (`datos/temas/tema-NN.json`).
3. **Mejorar la web o las herramientas** (`web/`, `herramientas/`).

Un dato legal mal escrito se estudia como verdadero: la exactitud va por delante de la extensión.

## 1. Avisar de un error

Abre un issue en GitHub con:

- El tema y, si es una pregunta o una tarjeta, su texto (o su id `q_NN_XX` / `t_NN_XX` si lo conoces).
- Qué dice la ficha y qué dice la norma, con el **artículo** y el enlace al BOE consolidado
  (`https://www.boe.es/buscar/act.php?id=BOE-A-…`) u otra fuente primaria.
- Si sabes que es una reforma reciente, desde cuándo rige.

No pegues preguntas de exámenes oficiales ni temario de academias: no se pueden incorporar.

## 2. Redactar o corregir una ficha

La guía completa es [`herramientas/GUIA_REDACTORES.md`](../herramientas/GUIA_REDACTORES.md); para revisar preguntas,
[`herramientas/GUIA_REVISION.md`](../herramientas/GUIA_REVISION.md); el esquema de campos, en
[`llms/data_schema.md`](../llms/data_schema.md). En resumen:

**Fuentes**
- Lee el texto **vigente** de cada norma con `python -I herramientas/boe.py BOE-A-AAAA-NNNN trabajo/<tu_carpeta>/norma.txt`.
  Si trae una versión marcada «desde» una fecha futura, estudia lo vigente y anota el cambio en `novedades`.
- No uses resúmenes de terceros (ni de herramientas de IA) como fuente de artículos, plazos o cifras.
- Cita el artículo en `ref` y en las explicaciones. Lo que no puedas verificar, no lo escribas o ponlo en `dudas`.
- Bloques B y C: fuentes primarias citables (DUDH, RAE, INE, RFC, INCIBE, CCN-CERT, DGT…), con su URL en `normas`.

**Estilo**
- Menos texto y más precisión. Palabras orientativas del `resumen`: peso alto 900-1.800, medio 600-1.200,
  bajo 350-800.
- Secciones tituladas con lo que busca el opositor («Quién puede ser detenido y cuánto tiempo»), ordenadas por lo que
  más cae. Tablas para comparar plazos, órganos o tipos de infracción.
- Solo `**negrita**` como marcado (cifras, plazos, órganos, palabras que cambian la respuesta). Sin HTML, listas
  Markdown, enlaces ni emojis.
- `clave`: lo que no puede fallar la víspera del examen. `trampas`: los cambios típicos de los distractores.
- Secciones `"ampliado": true` para el detalle de «trampa fina» (excepciones, cómputo de plazos, quién propone y
  quién nombra), plegadas en la web y fuera del recuento de palabras.

**Preguntas**
- Originales, de 3 opciones con una sola correcta, autónomas y sin ambigüedad doctrinal.
- Reparto orientativo: ~30 % dato literal, ~50 % concepto o comparación, ~20 % caso práctico.
- Distractores plausibles y claramente falsos: cambian un plazo, un órgano, una cifra o una pareja de conceptos.
- La explicación justifica la correcta y descarta las otras **por su contenido**, nunca por la letra: la web baraja
  las opciones.
- Reparte la posición de la correcta entre la primera, la segunda y la tercera opción.

**Ids**
- No escribas ids a mano: `python -I herramientas/migrar_ids.py` los asigna.
- Al corregir un texto, el id se conserva y nadie pierde su progreso. Si cambia el **sentido** de una pregunta (otra
  respuesta correcta), borra su id y vuelve a ejecutar `migrar_ids.py`.

## 3. Reglas del validador

`python -I herramientas/validar_tema.py datos/temas/tema-NN.json` comprueba la **forma**, no la exactitud jurídica.
Los errores impiden publicar (el workflow no despliega la web); los avisos no bloquean, pero hay que leerlos.

| Errores (bloquean) | Avisos (no bloquean) |
|---|---|
| JSON no válido. | Norma sin `verificado`. |
| `tema` fuera de 1-45 o distinto del nombre del fichero; `bloque` que no corresponde (1-26 A, 27-37 B, 38-45 C). | Resumen corto: menos de 700, 450 o 300 palabras para peso alto, medio o bajo (sin contar secciones `ampliado`). |
| `titulo` fuera de 3-90 caracteres; `actualizado` sin formato `AAAA-MM-DD`. | Resumen de más de 2.600 palabras (sin `ampliado`). |
| `peso.nivel` distinto de `alto`/`medio`/`bajo`; `peso.nota` vacía. | Explicación de menos de 12 palabras. |
| Ninguna norma, o norma sin `nombre` o con `url` que no es `https://`. | Explicación que cita una letra («opción B», «a)»). |
| `resumen` con menos de 3 secciones o una sección con menos de 2 puntos; tabla con filas que no cuadran con la cabecera. | Posición de la correcta por debajo del 20 % de las preguntas. |
| `clave` fuera de 6-14; `trampas` fuera de 4-10; `tarjetas` fuera de 10-24. | |
| `preguntas` fuera de 15-24 (hasta 30 si hay secciones `ampliado`). | |
| Pregunta sin exactamente 3 opciones, con opciones repetidas o con «todas/ninguna de las anteriores» o «todas son correctas / ninguna es correcta». | |
| `correcta` distinta de 0, 1 o 2 (los booleanos no valen); `dificultad` distinta de 1, 2 o 3; `ref` vacía. | |
| Enunciado repetido en la ficha. | |
| `id` ausente, con formato distinto de `q_NN_XX` / `t_NN_XX` (NN = tema) o repetido, también entre fichas. | |
| Texto vacío, con HTML o con `**` sin cerrar; `caido` sin `examen` o `concepto`. | |

Además, las pruebas del repositorio exigen que la auditoría de preguntas esté al día: después de cambiar un
enunciado, sus opciones, la respuesta o la `ref`, ejecuta `python -I herramientas/auditar_preguntas.py --temas NN`
y resuelve lo que quede en `revisar` (ver `GUIA_REVISION.md`).

## 4. Contribuir con código

Las reglas de estilo y arquitectura están en [`CLAUDE.md`](../CLAUDE.md) (sirven para personas y para agentes de
IA). Lo esencial:

- **Web**: HTML5, CSS3 con variables y JavaScript con sintaxis ES5 en IIFE bajo `window.AA`. Cero dependencias en
  runtime: nada de CDN, analítica ni peticiones a terceros. Contraste WCAG AA en claro y oscuro, diseño adaptable a móvil, tablet y escritorio.
- **Herramientas**: Python 3 solo con la biblioteca estándar, ejecutado con `python -I`. Cada script nuevo se
  documenta en `LEEME.md` y lleva pruebas sin red en `herramientas/tests/`.
- **Generados**: no edites a mano `web/data/datos.js`, `web/data/novedades.js`, `datos/auditoria.json`, `dist/` ni
  `sitio/`.

## 5. Antes de enviar

```bash
python -I herramientas/migrar_ids.py
python -I herramientas/validar_tema.py datos/temas/tema-*.json
python -I herramientas/auditar_preguntas.py --temas NN     # si cambiaste preguntas
python -I herramientas/build.py
python -I herramientas/ejecutar_tests.py                   # todo en verde
```

Checklist completo: [`.claude/skills/validar-despliegue/SKILL.md`](../.claude/skills/validar-despliegue/SKILL.md).

- Si no tienes permisos de escritura, haz un fork, crea una rama y abre un pull request contra `main`.
- Mensajes de commit en español, con un título que diga qué cambia y, si hace falta, viñetas por área. En los cambios
  de contenido, indica las normas leídas y su fecha de consolidación.
- No subas `trabajo/`, `examenes/` ni los análisis de exámenes (`fuentes/analisis-examenes.md`): están en
  `.gitignore` a propósito.
- Las fuentes tipográficas de `web/css/fuentes/` tienen licencia SIL OFL (`web/css/fuentes/LICENCIAS.txt`).
