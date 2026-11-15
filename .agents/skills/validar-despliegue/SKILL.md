---
name: validar-despliegue
description: Checklist de comprobaciones y comandos antes de hacer commit y push a `main` en este repositorio (fichas válidas, ids, auditoría al día, datos.js regenerado, empaquetado ASCII, batería de pruebas en verde, rebase sobre los commits del vigilante y mensaje de commit). Úsala siempre antes de subir cambios, cuando se pida «validar», «preparar el commit», «subir a main» o «desplegar», y cuando falle el workflow de GitHub Actions.
---

# Validar antes de subir a `main`

Un push a `main` que toque `web/`, `datos/`, `herramientas/` o `.github/workflows/` dispara el workflow
`vigilar-y-publicar.yml`, que valida las fichas y **republica la web en GitHub Pages**. No hay rama de pruebas:
lo que llega a `main` es lo que ven los opositores.

## 1. Qué has cambiado

```bash
git status --short
git diff --stat
```

- No debe aparecer nada de `trabajo/`, `examenes/`, `dist/`, `sitio/`, `fuentes/analisis-examenes.md`,
  `PROYECTO_*.md` ni temporales (`novedades-resumen.md`, `cuerpo-issue.md`, `convocatoria-resumen.md`,
  `cuerpo-convocatoria.md`, `.tmp*`). Están en `.gitignore`; si aparecen, algo ha cambiado en él.
- `web/data/datos.js` y `web/data/novedades.js` son generados: su diff debe venir de `build.py` o del vigilante,
  nunca de una edición a mano.

## 2. Si has tocado fichas (`datos/temas/`), pesos o datos del proceso

```bash
python -I herramientas/migrar_ids.py --comprobar        # sale con 1 si falta algún id
python -I herramientas/migrar_ids.py                    # (si faltaban) los asigna
python -I herramientas/validar_tema.py datos/temas/tema-*.json   # 0 errores; lee los avisos
python -I herramientas/auditar_preguntas.py --temas NN  # temas cuyas preguntas has cambiado
python -I herramientas/auditar_preguntas.py --sin-guardar --listar revisar   # sin escribir: no debe listar nada
python -I herramientas/build.py                         # regenera web/data/datos.js
```

- La auditoría solo es necesaria si cambiaste `enunciado`, `opciones`, `correcta` o `ref` de alguna pregunta (su
  huella). Para las que queden en `revisar`, skill `auditar-pregunta`.
- `build.py` también es obligatorio si cambiaste `fuentes/pesos-por-tema.json`, `datos/meta.json`,
  `datos/proceso.json` o `datos/auditoria.json`.

## 3. Si has tocado la web (`web/`)

```bash
python -I herramientas/empaquetar.py                    # ASCII puro y sin recursos externos en dist/ y sitio/
python herramientas/serve.py 8765                       # http://127.0.0.1:8765
python herramientas/serve.py 8765 dist --latin1         # lo publicado, con la decodificación errónea
```

- Revisa en el navegador las vistas que has tocado, en claro y oscuro, a 360-390 px, 768 px y escritorio: sin
  desbordes horizontales ni errores en la consola, y los acentos bien en el modo `--latin1`.
- Si cambiaste colores, las pruebas `f6` comprueban el contraste WCAG AA; los valores oscuros van en dos sitios de
  `app.css`.
- Un fichero JS nuevo se añade a `web/index.html` en el orden correcto.

## 4. Si has añadido o renombrado un script de `herramientas/`

- Menciónalo en `LEEME.md` (tabla de estructura). Una prueba exige que el LEEME nombre todos los
  `herramientas/*.py` y que ninguna guía nombre uno que no existe.
- Si el workflow lo usa, que la ruta exista (otra prueba lo comprueba).

## 5. Toda la batería de pruebas

```bash
python -I herramientas/ejecutar_tests.py
```

- Tiene que acabar en `TODO CORRECTO` con **0 fallos y 0 errores**. Anota el número de pruebas para el mensaje.
- Si dice «omitida: …Node…», las pruebas de JavaScript no se han ejecutado: instala Node.js o dilo en el informe.
- Fallos habituales: `datos.js está desfasado` → `build.py`; «preguntas cambiadas después de la auditoría» →
  `auditar_preguntas.py`; «LEEME.md no menciona …» → documenta el script; contraste → ajusta el color.
- No desactives, borres ni relajes una prueba para que pase.

## 6. Commit

```bash
git add <ficheros concretos>          # evita git add -A si hay ficheros sin revisar
git commit
```

Mensaje en español, como los del historial (`git log -5`):

```
Título que dice qué cambia (sin punto final)

- Área 1: qué y por qué.
- Área 2: …

Pruebas: N en verde.

Co-Authored-By: <agente que ha preparado el commit>
```

Para actualizaciones de contenido basta un título claro, p. ej. «Actualiza las fichas 6, 23 y 24 por la Ley 4/2026».

## 7. Push (solo si la persona lo ha pedido)

```bash
git pull --rebase                     # el vigilante (vigilante-leyes) hace commits propios en main cada día
python -I herramientas/ejecutar_tests.py   # otra vez si el rebase ha traído cambios en datos/
git push origin main
```

- Si el rebase da conflicto en `datos/novedades.json` o `datos/vigilancia/`, conserva lo que trae el vigilante y
  vuelve a aplicar tus cambios encima (por ejemplo, repite `vigilar_leyes.py revisar ID`). Nunca `git push --force`.

## 8. Después del push

```bash
gh run list --workflow vigilar-y-publicar.yml --limit 3
gh run watch                           # sigue la ejecución en curso
```

- Si falla «Validar las fichas», la web no se ha publicado: corrige la ficha y vuelve a subir.
- La web publicada está en `https://<usuario>.github.io/<repositorio>/` (el workflow construye la URL con el
  propietario y el nombre del repositorio).
