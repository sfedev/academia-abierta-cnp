# Academia Abierta · Policía Nacional (Escala Básica)

Plataforma web gratuita de estudio para la oposición de Policía Nacional, basada en el temario del
Anexo I de la Resolución de 7 de julio de 2026 (BOE-A-2026-15055).

- 45 temas con resumen, «lo imprescindible», trampas de examen y lo que ya ha caído.
- Más de 900 preguntas tipo test originales (3 opciones, corrección con la fórmula oficial) y más de 800 tarjetas
  (las cifras exactas salen de `build.py` y aparecen en el pie de la web).
- Simulacro de 100 preguntas en 50 minutos con el reparto de los cinco últimos exámenes.
- Calculadora de pruebas físicas (Anexo II) y resumen del proceso selectivo.
- Progreso guardado en el navegador, con copia de seguridad en texto.

## Estructura

| Carpeta | Contenido |
|---|---|
| `web/` | La web (HTML, CSS y JS sin dependencias). `index.html` es el punto de entrada. |
| `datos/meta.json` | Los 45 temas con el texto literal del Anexo I. |
| `datos/temas/tema-NN.json` | Una ficha por tema (resumen, tarjetas, preguntas, normas y fecha de verificación). |
| `fuentes/` | Anexo I literal, análisis de exámenes anteriores y pesos por tema. |
| `herramientas/` | Scripts: `boe.py` (descarga una norma consolidada del BOE, vigente a una fecha), `validar_tema.py`, `migrar_ids.py` (ids estables de preguntas y tarjetas), `build.py`, `empaquetar.py`, `serve.py`, `vigilar_leyes.py` y `citas.py` (qué artículos cita cada ficha, para avisar solo donde importa), `descargar_fuentes.py` (fuentes locales de la web), `gen_meta.py` (genera `datos/meta.json` desde el Anexo I) y `ejecutar_tests.py` (pruebas). |
| `herramientas/tests/` | Pruebas automáticas (Python `unittest` y Node.js), sin dependencias externas. |
| `web/css/fuentes/` | Fuentes de la web (`.woff2`, licencia SIL OFL): no se piden a Google. |
| `datos/novedades.json`, `datos/vigilancia/` | Novedades legislativas detectadas y foto de las versiones del BOE. |
| `.github/workflows/` | Vigilancia diaria y publicación en GitHub Pages. |
| `dist/` | Copia de `web/` en ASCII puro: es lo que se publica. |
| `herramientas/GUIA_REDACTORES.md` | Criterios de redacción, verificación y formato de las fichas. |
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

# Ejecutar todas las pruebas (o solo algunas: f1 ... f6, js)
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
