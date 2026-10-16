# Arquitectura

Academia Abierta es una web **estática**: no hay servidor de aplicación, base de datos ni cuentas. El contenido vive
en ficheros JSON del repositorio, unos scripts de Python lo convierten en JavaScript y GitHub Pages sirve el
resultado. El progreso de cada opositor se queda en su navegador.

Detalle técnico para agentes de IA en [`llms/architecture.md`](../llms/architecture.md),
[`llms/data_schema.md`](../llms/data_schema.md) y [`llms/boevigilance.md`](../llms/boevigilance.md).

## 1. Vista general

```
                    ┌──────────────────────────── FUENTES ────────────────────────────┐
                    │ BOE (API de datos abiertos)   Anexo I literal   Pesos por tema  │
                    └───────┬──────────────────────────────┬──────────────────────────┘
                            │ boe.py (redactores)          │ gen_meta.py
                            ▼                              ▼
┌──────────────── CONTENIDO (repositorio) ─────────────────────────────────────────────┐
│ datos/temas/tema-NN.json   datos/meta.json   fuentes/pesos-por-tema.json             │
│ datos/proceso.json         datos/auditoria.json (auditar_preguntas.py)               │
│ datos/novedades.json + datos/vigilancia/ (vigilar_leyes.py, vigilar_convocatoria.py) │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │ validar_tema.py (forma) · migrar_ids.py (ids estables)
                │ build.py
                ▼
┌──────────────── WEB (web/, UTF-8) ───────────────────────────────────────────────────┐
│ data/datos.js  data/novedades.js  data/fisicas.js                                    │
│ js/util.js → store.js → motivacion.js → vistas.js → test.js → oficiales.js           │
│            → psicotecnicos.js → paginas.js → app.js                                  │
│ css/app.css + css/fuentes/*.woff2                                                    │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │ empaquetar.py (todo a ASCII, sin recursos externos)
                ▼
        dist/ (fragmento HTML)  ·  sitio/ (documento completo) ──► GitHub Pages
                                                                       │
                                                                       ▼
                                                    Navegador del opositor
                                                    └─ localStorage (progreso)
```

## 2. Ciclo diario en GitHub Actions

```
cron 05:17 UTC / push a main / a mano
        │
        ├─► vigilar_leyes.py ──────────► ¿artículo citado modificado? ──sí──► novedad pendiente + issue «novedades-leyes»
        │      (API legislación consolidada)                          └─no──► novedad «sin impacto» (sin aviso)
        │
        ├─► vigilar_convocatoria.py ───► ¿convocatoria nueva de Escala Básica? ──sí──► compara Anexo I + issue «convocatoria»
        │      (sumarios diarios)
        │
        ├─► commit de datos/novedades.json y datos/vigilancia/ (usuario vigilante-leyes)
        ├─► commit vacío si el último tiene ≥ 40 días (mantiene vivo el cron)
        ├─► validar_tema.py ── errores ──► se detiene: la web no se publica
        ├─► build.py + empaquetar.py
        └─► deploy de sitio/ en GitHub Pages
```

Una persona (o un agente con la skill `resolver-novedad`) actualiza las fichas afectadas, marca la novedad como
incorporada con `vigilar_leyes.py revisar ID` y sube los cambios: el workflow republica la web y el aviso
desaparece.

## 3. La aplicación en el navegador

```
index.html (fragmento) ── carga en orden ──┐
                                           ▼
 datos globales: AA_META · AA_TEMAS · AA_FISICAS · AA_NOVEDADES
                                           │
 window.AA ────────────────────────────────┤
   util.js        AA.h() (montaje del DOM), AA.rich() (**negrita** segura), fechas, nota oficial
   store.js       temario, bancos de preguntas y tarjetas, progreso en localStorage, Leitner, guía,
                  registro diario, consolidación (caduca a los 60 días), logros y récords guardados
   motivacion.js  racha, dominio y niveles por tema, logros, desafío diario, rentabilidad de las dudas
   vistas.js      Panel, Temario, ficha de tema, Novedades
   test.js        tests, simulacros, velocidad, muerte súbita, desafío, cuaderno de errores, tarjetas
   oficiales.js   exámenes oficiales importados y calibración
   psicotecnicos.js  ejercicios generados al momento
   paginas.js     Proceso, Pruebas físicas, Progreso (constancia, logros, copia de seguridad)
   app.js         router por hash (#panel, #tema-14…), navegación, buscador, claro/oscuro
                                           │
 hashchange ──► route() ──► vista() devuelve un nodo ──► sustituye #vista
```

- Sin frameworks ni dependencias: JavaScript con sintaxis ES5 en funciones autoejecutables (IIFE) que cuelgan de
  `window.AA`.
- Cada cambio de ruta vuelve a pintar la vista completa.
- El progreso se indexa por el id fijo de cada pregunta (`q_NN_XX`) y tarjeta (`t_NN_XX`): corregir un texto no
  borra el historial de nadie.

## 4. Por qué se publica en ASCII

Algunos visores sirven los `.js` sin declarar la codificación y el navegador los lee como Windows-1252 («Policía» →
«PolicÃ­a»). `empaquetar.py` convierte todo lo publicado a ASCII puro (`\uXXXX` en JavaScript, `&#NNN;` en HTML) y
comprueba que no queda ningún byte fuera de ASCII ni ninguna petición a servidores externos. `web/` sigue en UTF-8
para poder editarse cómodamente.

## 5. Decisiones de diseño

| Decisión | Motivo |
|---|---|
| Web estática + JSON + GitHub Pages | Coste cero, sin mantenimiento de servidores, funciona sin conexión una vez cargada. |
| Sin dependencias (ni en la web ni en Python) | Nada que actualizar ni que pueda romperse o filtrar datos; cualquiera puede ejecutar los scripts con Python 3. |
| Progreso solo en `localStorage` | Privacidad: no hay cuentas ni datos personales en ningún servidor. Copia de seguridad en texto para cambiar de navegador. |
| Ids estables en preguntas y tarjetas | Corregir erratas sin borrar el progreso guardado. |
| Vigilancia por artículo citado | Avisar solo en las fichas que pueden haber quedado desfasadas; ante la duda, avisar. |
| Validación en la CI antes de publicar | Un error de formato en una ficha no llega a la web. |
| Pruebas sin red | Se pueden ejecutar en cualquier sitio y no dependen de la disponibilidad del BOE. |
