# Academia Abierta · Policía Nacional (Escala Básica)

Plataforma web gratuita de estudio para la oposición de Policía Nacional, basada en el temario del
Anexo I de la Resolución de 7 de julio de 2026 (BOE-A-2026-15055).

- 45 temas con resumen, «lo imprescindible», trampas de examen y lo que ya ha caído.
- Más de 900 preguntas tipo test originales (3 opciones, corrección con la fórmula oficial) y más de 800 tarjetas
  (las cifras exactas salen de `build.py` y aparecen en el pie de la web).
- Simulacro de 100 preguntas en 50 minutos con el reparto de los cinco últimos exámenes.
- Calculadora de pruebas físicas (Anexo II) y resumen del proceso selectivo, con el requisito de idioma A2.
- Práctica de psicotécnicos (series y cálculo) y examen oficial importado localmente con calibración de nivel.
- Guía de estudio en 4 días por tema (estructura, resumen, trampas y tarjetas, test) con el tiempo estimado de cada
  día según la extensión y el peso del tema, y un planificador de ritmo en el Panel que calcula cuándo se termina la
  primera vuelta al temario.
- Cuaderno de errores: tras fallar una pregunta se puede marcar por qué (despiste, plazo/cifra/órgano, concepto o
  duda entre dos) y la sección de Tests muestra el reparto de motivos y el error que más se repite.
- Entrenamiento de velocidad: mini-tests de 10 o 15 preguntas al azar con 30 segundos por pregunta y avance
  automático, con respondidas, en blanco por tiempo y nota con la fórmula oficial.
- Modo Repaso Intensivo («últimos 30 días») en el Panel: prioriza los fallos diagnosticados, «Lo imprescindible» de
  los temas con menos aciertos y las tarjetas de las cajas 1 y 2.
- Desafío diario: 5 preguntas fijas para todo el día (2 de repaso espaciado de lo acertado hace tiempo, el fallo más
  prioritario, una de un tema de peso alto sin dominar y una nueva), solo con preguntas verificadas o revisadas.
- Muerte súbita: preguntas de dificultad creciente hasta el primer fallo, con 3 blancos permitidos.
- «¿Te compensa contestar las dudas?»: en modo examen, la corrección compara la nota con las dudas marcadas
  contestadas o en blanco, y el acierto en dudas con el umbral de rentabilidad de la fórmula oficial (1 de cada 3).
- Racha de estudio con días de descanso semanales, mapa de constancia de 12 semanas, nivel de dominio por tema
  (una pregunta consolidada caduca a los 60 días sin repasarla), «temario bajo control» ponderado por lo que cae en
  examen y logros por calidad. Rachas y logros se pueden ocultar en Progreso.
- Progreso guardado en el navegador, con copia de seguridad en texto.

## Estructura

| Carpeta | Contenido |
|---|---|
| `web/` | La web (HTML, CSS y JS sin dependencias). `index.html` es el punto de entrada. |
| `datos/meta.json` | Los 45 temas con el texto literal del Anexo I. |
| `datos/temas/tema-NN.json` | Una ficha por tema (resumen, tarjetas, preguntas, normas y fecha de verificación). |
| `fuentes/` | Anexo I literal, análisis de exámenes anteriores y pesos por tema. |
| `herramientas/` | Scripts: `boe.py` (descarga una norma consolidada del BOE, vigente a una fecha), `validar_tema.py`, `migrar_ids.py` (ids estables de preguntas y tarjetas), `build.py`, `empaquetar.py`, `serve.py`, `vigilar_leyes.py` y `citas.py` (qué artículos cita cada ficha, para avisar solo donde importa), `descargar_fuentes.py` (fuentes locales de la web), `gen_meta.py` (genera `datos/meta.json` desde el Anexo I), `auditar_preguntas.py` (contrasta cada pregunta con el artículo vigente del BOE), `vigilar_convocatoria.py` (detecta la próxima convocatoria de Escala Básica y compara su temario), `importar_examen.py` (convierte un examen oficial para importarlo en la web) y `ejecutar_tests.py` (pruebas). |
| `datos/auditoria.json`, `datos/auditoria-revisiones.json`, `fuentes/auditoria-preguntas.md` | Estado de verificación de cada pregunta, revisiones registradas e informe legible. |
| `herramientas/tests/` | Pruebas automáticas (Python `unittest` y Node.js), sin dependencias externas. |
| `web/css/fuentes/` | Fuentes de la web (`.woff2`, licencia SIL OFL): no se piden a Google. |
| `datos/novedades.json`, `datos/vigilancia/` | Novedades legislativas detectadas y foto de las versiones del BOE. |
| `datos/proceso.json` | Datos de las bases: calendario, idioma A2 (certificados y méritos) y psicotécnicos. |
| `.github/workflows/` | Vigilancia diaria y publicación en GitHub Pages. |
| `dist/` | Copia de `web/` en ASCII puro: es lo que se publica. |
| `herramientas/GUIA_REDACTORES.md` | Criterios de redacción, verificación y formato de las fichas. |
| `CLAUDE.md`, `llms.txt`, `llms/`, `.claude/skills/` | Contexto y procedimientos para agentes de IA (Claude Code, Cursor, Codex…). |
| `docs/` | Arquitectura, guía de contribución y privacidad. |
| `trabajo/` | Textos de las normas leídas por los redactores (material de consulta, no se publica). |

## Trabajar con el contenido

```bash
# Validar una ficha o todas
python -I herramientas/validar_tema.py datos/temas/tema-*.json

# Dar id (q_NN_01 / t_NN_01) a las preguntas y tarjetas nuevas: así corregir un enunciado no borra el progreso
python -I herramientas/migrar_ids.py

# Regenerar web/data/datos.js tras editar fichas
python -I herramientas/build.py

# Probar en local (http://127.0.0.1:8765)
python herramientas/serve.py 8765

# Ejecutar todas las pruebas (o solo algunas: f1 ... f10, js)
python -I herramientas/ejecutar_tests.py
```

Las pruebas no usan la red ni tocan los datos del repositorio. La parte de JavaScript (Leitner, nota del test,
simulacro, progreso guardado) necesita Node.js; si no está instalado se omite y el resumen lo indica.

Para actualizar un tema cuando cambie una norma: descarga el texto vigente con
`python -I herramientas/boe.py BOE-A-AAAA-NNNN salida.txt`, edita `datos/temas/tema-NN.json`
(campos `actualizado` y `normas[].verificado` incluidos), valida y regenera.

`boe.py` entrega el texto **vigente hoy** (o a la fecha de `--fecha AAAAMMDD`). Si el BOE ya ha publicado
reformas que todavía no han entrado en vigor, las añade justo después, marcadas «desde AAAA-MM-DD» (con
`--sin-futuras` se omiten), y la cabecera indica cuántos bloques las tienen.

## Auditoría de las preguntas

`herramientas/auditar_preguntas.py` contrasta cada pregunta con el texto **vigente** del artículo que cita
(caché local en `trabajo/normas/`, que se descarga con `--descargar`). Comprueba que el artículo existe, que no
está derogado, si tiene una reforma pendiente y si las cifras de la respuesta correcta (plazos, cuantías, edades,
porcentajes, número de miembros, también escritas con letra) aparecen en él. En las preguntas en negativo
(«señale la INCORRECTA») comprueba las opciones verdaderas.

| Estado | Significado (insignia en la web) |
|---|---|
| `verificada` | Las cifras de la respuesta están en el artículo vigente citado. |
| `revisada` | Alguien la comprobó contra la fuente (persona o revisión asistida por IA) y no ha cambiado desde entonces. |
| `referencia` | El artículo existe y está vigente; el sentido de la respuesta requiere lectura. |
| `no_verificable` | La fuente no es una norma del BOE (RAE, autores, UE…) o la ref no dice de qué norma es. |
| `revisar` | Algo no cuadra: hay que corregir la ficha o registrar la revisión. |

```bash
python -I herramientas/auditar_preguntas.py --descargar        # primera vez: baja las normas a trabajo/normas/
python -I herramientas/auditar_preguntas.py                    # auditoría completa sin red
python -I herramientas/auditar_preguntas.py --listar revisar   # qué hay que mirar
python -I herramientas/auditar_preguntas.py revisar q_14_03 --por persona --nota "Comprobado con el art. 36"
python -I herramientas/build.py                                # lleva los estados a la web
```

Las pruebas exigen que `datos/auditoria.json` esté al día con las fichas y sin preguntas en `revisar`: si editas
una pregunta, vuelve a ejecutar la auditoría. «Verificada» significa que las cifras están en el artículo citado,
no que la pregunta sea perfecta.

## Exámenes oficiales y calibración

Los exámenes oficiales de convocatorias anteriores **no están en el repositorio** (la web es pública y las copias que
circulan no siempre son fiables). Cada opositor los convierte y los importa en su navegador:

```bash
python -I herramientas/importar_examen.py cuestionario.pdf --plantilla plantilla.txt --codigo P43 --fecha 2026-09-26
```

El conversor lee el cuestionario y la plantilla (texto o PDF con `pypdf`/`pdftotext`), comprueba que cada pregunta
tenga tres opciones y respuesta, marca las anuladas y estima el tema de cada pregunta. Genera `examenes/P43.json`
(carpeta en `.gitignore`), que se importa en la pestaña **Exámenes oficiales**. Allí se hace en modo examen (media
pregunta por minuto, fórmula oficial, nota de corte de esa convocatoria como objetivo) o en modo estudio.

La **calibración** (en Exámenes oficiales y en Progreso) compara el acierto del banco propio con el de las preguntas
oficiales y estima la nota real. El **simulacro** reproduce la mezcla de dificultad de los exámenes analizados
(≈ 50 % fáciles, 30 % medias, 20 % difíciles) y el **simulacro exigente** sube las difíciles al 30 %; ambos marcan el
objetivo de 7,5, por encima de las notas de corte recientes.

## Idioma A2 y psicotécnicos

`datos/proceso.json` reúne lo que dicen las bases de la convocatoria de 2026 sobre el **idioma** (requisito de A2 en
inglés o francés antes de que acabe el plazo de solicitud, certificados del Anexo VI y méritos de B1 a C2) y sobre los
**psicotécnicos** (base 6.1.3.c). `build.py` lo publica en `AA_META.proceso` y la web lo usa en **Proceso**. El Panel
recuerda el A2 hasta que se marca «Ya tengo un certificado A2» y, si hay convocatoria nueva, calcula el último día
aproximado del plazo (15 días hábiles sin contar sábados ni domingos; los festivos no se descuentan).

La pestaña **Psicotécnicos** explica la estrategia con la penalización: con la fórmula de las bases, contestar al
azar no gana ni pierde de media, y en cuanto se descarta una opción contestar compensa. También tiene trucos de
cálculo y una práctica cronometrada con ejercicios generados al momento: series numéricas y de letras (alfabeto de
27 letras, con la Ñ), porcentajes, regla de tres y cálculo mental. Son ejercicios originales del tipo habitual en
estas pruebas, no un modelo oficial: las bases no publican el tipo de ejercicios.

## Publicar (y por qué existe `dist/`)

Las fuentes de `web/` están en UTF-8. Algunos visores sirven los `.js` sin declarar el juego de
caracteres y el navegador los lee como Windows-1252 o Latin-1, con lo que «Policía» se ve como
«PolicÃ­a» (o la página no arranca). Para que no dependa de eso, **se publica `dist/`**, que
`empaquetar.py` genera con todo el texto en ASCII puro (acentos como `\uXXXX` en JS y `&#NNN;`
en HTML). No edites `dist/` a mano.

```bash
python -I herramientas/build.py        # datos de las fichas -> web/data/datos.js (ya sale en ASCII)
python -I herramientas/empaquetar.py   # web/ -> dist/ en ASCII puro
python herramientas/serve.py 8765 dist --latin1   # prueba forzando la decodificación errónea
```

Al publicar como artefacto de Claude, sube `dist/index.html` y los ficheros de `dist/css`, `dist/js` y
`dist/data`. Para un servidor web normal (GitHub Pages) se genera además `sitio/`, que es lo mismo con
`index.html` como documento completo. La copia publicada como artefacto no se actualiza sola.

## Vigilancia de leyes y publicación en GitHub

Un workflow de GitHub Actions (`.github/workflows/vigilar-y-publicar.yml`) se ejecuta cada día:

1. `herramientas/vigilar_leyes.py` compara, artículo por artículo, las normas del BOE que citan las fichas
   con la foto guardada en `datos/vigilancia/estado.json`. Detecta artículos modificados, reformas que
   entrarán en vigor más adelante y normas derogadas, y los guarda en `datos/novedades.json`. Solo avisa en
   las fichas que **citan** algún artículo modificado (`temas`); las demás fichas que citan la norma van en
   `otrosTemas`, y si ninguna cita esos artículos la novedad queda como «sin impacto» (se anota, sin aviso).
   Los números de artículo se extraen del texto de la ficha sin distinguir de qué norma son, así que puede
   avisar de más, pero no de menos (disposiciones, anexos y fichas sin artículos citados siempre avisan).
2. Si hay cambios nuevos, abre un **issue** (aviso de GitHub por correo y en la app) con el enlace a la pestaña
   **Novedades** de la web.
3. Valida las fichas (`validar_tema.py`): si alguna tiene errores de formato, no se publica.
4. Regenera la web y la publica en GitHub Pages. La pestaña **Novedades** muestra un punto rojo con lo que
   no has visto, y cada ficha afectada enseña un banner hasta que se revise.

El mismo workflow ejecuta `herramientas/vigilar_convocatoria.py`, que lee los **sumarios diarios del BOE** y busca la
resolución de la Dirección General de la Policía que convoca la oposición libre a la Escala Básica (la de 2026,
BOE-A-2026-15055, ya está registrada en `datos/vigilancia/convocatoria.json`). Si sale una nueva, extrae su Anexo I,
las plazas y el plazo, compara el temario tema por tema con `fuentes/anexo-I-literal.txt` (temas nuevos, eliminados,
renumerados y con el epígrafe cambiado), lo publica en **Novedades** con una insignia en el Temario y un banner en las
fichas afectadas, y abre un issue con la etiqueta `convocatoria` que recuerda acreditar el A2 antes del cierre.

```bash
python -I herramientas/vigilar_convocatoria.py                       # revisar los sumarios pendientes
python -I herramientas/vigilar_convocatoria.py --probar BOE-A-2026-15055   # comparar una convocatoria sin guardar nada
```

Cómo resolver una novedad (actualizar fichas, validar, marcarla como incorporada): `herramientas/GUIA_ACTUALIZACION.md`.

```bash
python -I herramientas/vigilar_leyes.py            # comprobar ahora (en local)
python -I herramientas/vigilar_leyes.py listar     # ver novedades
python -I herramientas/vigilar_leyes.py revisar ID # marcar una novedad como incorporada
```

No se vigilan las normas sin texto consolidado en el BOE ni las referencias que no son del BOE (Derecho de la
UE, RAE, INE, DGT…): la pestaña Novedades indica cuántas son. El BOE consolida el texto días o semanas
después de publicar una reforma, por lo que un aviso puede llegar con retraso.

`trabajo/` y `fuentes/analisis-examenes.md` se quedan solo en local (están en `.gitignore`).

## Aviso

Material de estudio no oficial. Se elabora desde el texto consolidado del BOE y desde análisis de
exámenes anteriores, pero puede contener errores o quedar desfasado por reformas posteriores.
Cada ficha lleva sus normas con la fecha en que se leyó el texto consolidado y, plegadas al final,
notas sobre lo que no se pudo verificar. Contrasta los datos decisivos con el BOE vigente.
