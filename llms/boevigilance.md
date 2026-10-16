# Vigilancia del BOE

Dos vigilantes, los dos en Python con la biblioteca estándar, que ejecuta cada día el workflow
`.github/workflows/vigilar-y-publicar.yml`:

| Script | Vigila | Estado guardado | Resultado |
|---|---|---|---|
| `herramientas/vigilar_leyes.py` | Las normas del BOE que citan las fichas, artículo por artículo. | `datos/vigilancia/estado.json` | Novedades `modificada`, `proxima` o `derogada`. |
| `herramientas/vigilar_convocatoria.py` | Los sumarios diarios del BOE, por si sale una convocatoria nueva. | `datos/vigilancia/convocatoria.json` | Novedad `convocatoria` con la comparación del Anexo I. |

Los dos escriben en `datos/novedades.json` (esquema en [`data_schema.md`](data_schema.md)) y en
`web/data/novedades.js`, que la web muestra en la pestaña **Novedades**, con un punto rojo en la navegación y un
banner en cada ficha afectada mientras la novedad siga `pendiente`. Cómo resolverlas:
[`.claude/skills/resolver-novedad/`](../.claude/skills/resolver-novedad/SKILL.md) y
`herramientas/GUIA_ACTUALIZACION.md`.

## 1. El workflow diario

Cron `17 5 * * *` (05:17 UTC), a mano (`workflow_dispatch`, con la opción `probar_aviso`) y en cada push a `main` que
toque `web/`, `datos/`, `herramientas/` o el workflow:

1. `vigilar_leyes.py` → deja `nuevas=N` en `GITHUB_OUTPUT` y el cuerpo del issue en `novedades-resumen.md`.
2. `vigilar_convocatoria.py` → deja `nueva=0|1` y `convocatoria-resumen.md`.
3. Si cambiaron `datos/novedades.json` o `datos/vigilancia/`, commit y push a `main` como `vigilante-leyes`
   («Vigilancia de leyes y convocatoria: novedades detectadas»).
4. Issues: etiqueta `convocatoria` si hay convocatoria nueva; `novedades-leyes` si hay novedades pendientes nuevas.
5. Si el último commit tiene 40 días o más, un commit vacío (GitHub apaga los cron de repos públicos a los 60 días).
6. `validar_tema.py` sobre todas las fichas: **con errores no se publica**. Va después de guardar las novedades para
   que un error de formato no impida registrar un cambio legal.
7. `build.py` + `empaquetar.py` y despliegue de `sitio/` en GitHub Pages.

## 2. `vigilar_leyes.py`: cambios en las leyes

Comandos: sin argumentos comprueba y actualiza; `listar`; `revisar ID…` o `revisar --todo` (marca `incorporada` sin
volver a consultar el BOE); `--historial AAAAMMDD` siembra novedades desde esa fecha; `--hilos N` (4 por defecto).

Algoritmo de la comprobación:

1. **Qué vigilar.** Recorre `datos/temas/*.json` y reúne las `normas[].boe` con forma `BOE-A-AAAA-N`:
   `{norma: {tema: artículos de esa norma que cita la ficha}}` (lo calcula `citas.py`, apartado 3). Las referencias
   que no son del BOE (UE, RAE, INE, DGT…) solo se cuentan (`otrasFuentes`).
2. **Leer el BOE.** Para cada norma, en paralelo y con reintentos, pide a la API de legislación consolidada
   `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/<ID>/metadatos` y `…/texto`. De cada `<bloque>`
   (artículo, disposición, anexo) guarda su rótulo (`"Art. 16"`) y la lista de versiones
   `fecha_publicacion:fecha_vigencia:id_norma`. Un 404 significa «sin texto consolidado» (`sinConsolidar`).
3. **Comparar con la foto.** Toda versión que no estaba en `estado.json` es un cambio. Se agrupan por
   (norma modificadora, publicación, vigencia) y se ignora la versión inicial de la propia norma.
   - `tipo`: `proxima` si la vigencia es posterior a hoy; si no, `modificada`. Si la norma pasa a derogada, una
     novedad `derogada` para todas las fichas que la citan.
   - `id` = `sha1("norma|modificadora|publicación|vigencia")[:10]`: la misma reforma no se registra dos veces.
4. **A quién avisar.** Para cada ficha que cita la norma, `citas.articulos_afectados(artículos modificados, citados)`:
   - `temas`: fichas con algún artículo afectado → la novedad avisa (issue y banner).
   - `otrosTemas`: fichas que citan la norma pero ninguno de esos artículos → no avisan.
   - `articulosPorTema`: qué artículos modificados cita cada ficha de `temas`.
   - Si `temas` queda vacío: `estado: incorporada` y `sinImpacto: true` desde el principio (se ve en la web, sin
     issue ni banner).
5. **Guardar.** Añade las novedades nuevas a `datos/novedades.json`, reescribe `estado.json` **solo si cambió algo**
   (para no inflar el repositorio con commits diarios), actualiza la caché `titulos.json` y genera
   `web/data/novedades.js`.

Robustez: la primera ejecución (sin foto) solo guarda la línea base, no inventa cambios; si una norma da error de
red se conserva su foto anterior y el error se publica en `errores`.

## 3. `citas.py`: qué artículos cita cada ficha

Las fichas citan en texto libre. `citas.py` extrae las citas de **todas las cadenas de la ficha salvo**
`novedades`, `dudas` y `verificado` (hablan de reformas, no son citas del contenido).

- **Detección** (`secuencias`): `art.`, `arts.`, `artículo(s)` seguido de números. Admite apartados y letras
  (`36.5.a`), `bis`/`ter`/`quáter`/`quinquies`, ordinales (`7.º`), listas (`17, 18 y 20`) y rangos
  (`156 a 158`, `17-20`, hasta 500 artículos de salto). Tras los números toma una ventana de 60 caracteres, cortada en
  la siguiente cita, en `;`, salto de línea o fin de frase.
- **Atribución a una norma** (`alias_de`, `citados_por_norma`): para cada norma de `normas[]` se construyen sus alias
  desde el `nombre`: números `N/AAAA` («4/2015»), siglas entre paréntesis («(LOPJ)») y abreviaturas conocidas
  (`CE`, `CP`, `CC`, `LECrim`, `LEC`, `LOPJ`, `TREBEP`/`EBEP`, `LGSS`, `TFUE`, `TUE`). Si la ventana empieza por un
  alias («art. 17.2 CE», «arts. 6 y 8 LO 3/2007», «art. 5 de la Ley 4/2023») y **solo una** norma encaja, la cita es
  de esa norma. Si no se sabe, cuenta para **todas** las normas de la ficha.
- **Afectación** (`articulos_afectados`): de los artículos modificados, la ficha queda afectada por los `Art. N`
  cuyo número cita. Lo que no es `Art. N` (disposiciones, anexos, «Art. único») cuenta siempre, y si la ficha no cita
  ningún artículo de esa norma, cuentan todos.

Principio de diseño: **puede avisar de más, nunca de menos**. Para reducir falsos avisos en una ficha, nombra la
norma detrás del número del artículo («art. 49 TREBEP», no «art. 49»).

## 4. `vigilar_convocatoria.py`: convocatoria nueva y Anexo I

Comandos: sin argumentos revisa los sumarios pendientes (como mucho 60 días por ejecución); `--desde AAAAMMDD`
vuelve a revisar desde esa fecha; `--probar BOE-A-…` compara una disposición concreta sin guardar nada.

1. **Sumarios.** Desde `ultimaFecha` de `datos/vigilancia/convocatoria.json` hasta hoy, pide
   `https://www.boe.es/datosabiertos/api/boe/sumario/AAAAMMDD` (404 = no hubo BOE ese día).
2. **Reconocer la convocatoria** (`es_convocatoria_escala_basica`): título, sin tildes y en minúsculas, que contiene
   «dirección general de la policía», «por la que se convoca(n) [la] oposición libre / proceso selectivo», «escala
   básica» y «categoría de policía», y que no está en `conocidas` (la de 2026, `BOE-A-2026-15055`, es la base).
3. **Leer el documento** (`https://www.boe.es/diario_boe/xml.php?id=…`, convertido a texto con saltos de párrafo).
   `extraer_anexo_i` toma las líneas `Tema N. …` entre la línea `ANEXO I` y la que empieza por `ANEXO II`.
   `datos_basicos` saca, si puede, plazas, plazas libres, el plazo de solicitud y el formato de la primera prueba.
4. **Comparar temarios** (`comparar_temarios`, con `fuentes/anexo-I-literal.txt` como temario actual):
   - Parecido = `difflib.SequenceMatcher` sobre los epígrafes sin tildes, en minúsculas y sin signos.
   - Emparejamiento voraz de todos los pares (tema actual, tema nuevo), del más parecido al menos, con umbral 0,6.
   - Pareja con número distinto → `renumerados`; parecido < 0,985 → `modificados` (con el epígrafe `antes` y
     `despues`); temas nuevos sin pareja → `nuevos`; actuales sin pareja → `eliminados`.
   - Fichas que revisar (`temas` de la novedad): modificadas, renumeradas y eliminadas.
5. **Registrar.** Novedad `tipo: "convocatoria"` (`id` = `sha1("convocatoria|BOE-A-…")[:10]`), `estado: pendiente`,
   resumen para el issue (recuerda acreditar el A2 antes del cierre del plazo) y `web/data/novedades.js` regenerado
   conservando los datos de la última comprobación de leyes. Si no pudo leer el Anexo I, `temario.sinAnexo = true` y
   hay que comparar a mano.

## 5. Límites conocidos

- Solo se vigilan normas del BOE con texto consolidado. Las que no lo tienen (`sinConsolidar`) y las fuentes que no
  son del BOE (UE, RAE, INE, DGT, convenios…) dependen de revisión manual; la pestaña Novedades dice cuántas son.
- El BOE consolida días o semanas después de publicar una reforma: el aviso puede llegar con retraso.
- La atribución por artículo es heurística (apartado 3): avisa de más ante la duda.
- La comparación del Anexo I es textual: un cambio de redacción pequeño puede quedar por encima de 0,985 y pasar como
  igual, y un tema muy reescrito puede salir como eliminado + nuevo. Revisa siempre contra el texto oficial.

## 6. Probar sin red

- `python -I herramientas/ejecutar_tests.py f2` (citas y vigilante con la API del BOE simulada) y `f8` (convocatoria
  y comparación del Anexo I). Las pruebas sustituyen las rutas de estado y salida por carpetas temporales.
- En local, con red: `python -I herramientas/vigilar_leyes.py` y `python -I herramientas/vigilar_convocatoria.py`
  modifican `datos/` como en la CI; revisa el diff antes de subirlo.
