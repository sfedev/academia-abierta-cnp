# Privacidad

Última revisión: 17 de octubre de 2026.

Academia Abierta no tiene cuentas, ni servidor propio, ni base de datos. **No recoge, no envía y no ve ningún dato
de las personas que la usan.** Esta página explica por qué, y qué se guarda en tu navegador.

## Resumen

| | |
|---|---|
| Cookies | **Ninguna.** El código no usa `document.cookie`. |
| Peticiones a terceros | **Ninguna.** Ni analítica, ni publicidad, ni CDN, ni fuentes de Google: todo se sirve desde el mismo sitio que la web. |
| Datos personales en un servidor | **Ninguno.** No hay registro ni formularios que envíen nada. |
| Dónde está tu progreso | Solo en el `localStorage` de tu navegador, en tu dispositivo. |

## Qué se guarda en tu navegador

La web usa el almacenamiento local del navegador (`localStorage`) con tres claves:

| Clave | Contenido |
|---|---|
| `academia-abierta-policia-v1` | Tu progreso: temas leídos, respuestas a cada pregunta (intentos, aciertos, último resultado y, si lo marcas, el motivo del fallo), estado de las tarjetas de repaso, historial de simulacros, entrenamiento de velocidad y psicotécnicos, días hechos de la guía de estudio, actividad de cada día de los últimos 400 días (para la racha, el mapa de constancia y el desafío diario), logros y récords, novedades legales ya vistas y ajustes (como el Modo Repaso Intensivo o los días de descanso de la racha). |
| `academia-abierta-theme` | Si has forzado el tema claro u oscuro. |
| `academia-abierta-oficiales-v1` | Los exámenes oficiales que tú hayas importado desde un fichero. |

- Estos datos **no salen de tu dispositivo**: la web no tiene ningún código que los envíe a ninguna parte.
- No se sincronizan entre navegadores ni dispositivos. Para llevarte el progreso, usa **Progreso → Copia de
  seguridad**: genera un texto que tú copias y pegas en el otro navegador («Restaurar desde el texto»). Ese texto solo lo manejas tú.
- Para borrarlos: **Progreso → Borrar todo el progreso**, o borra los datos del sitio desde la configuración del navegador. En
  modo privado o de incógnito el navegador los descarta al cerrar la ventana.
- Si el navegador no permite guardar (almacenamiento bloqueado o lleno), la web sigue funcionando y la pestaña
  Progreso avisa de que no se guarda.

## Ficheros que importas

En **Exámenes oficiales** puedes importar un examen convertido con `herramientas/importar_examen.py`. El fichero se
lee en tu navegador y se guarda en `localStorage`; no se sube a ningún sitio. Los exámenes oficiales no están en el
repositorio.

## Enlaces externos

Las fichas y las novedades enlazan al BOE y a otras fuentes oficiales. Esos enlaces solo se abren si los pulsas, en
una pestaña nueva y con `rel="noopener noreferrer"`, de modo que el sitio de destino no recibe la dirección de la
página de la que vienes. A partir de ahí se aplica la política de privacidad de ese sitio.

El botón **Copiar** de la copia de seguridad usa el portapapeles solo cuando lo pulsas.

## Alojamiento

La web se publica en **GitHub Pages**. Como cualquier servidor web, GitHub recibe los datos técnicos de la conexión
(dirección IP, navegador, página pedida) al entregar los ficheros, y los trata según su
[declaración de privacidad](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement).
El proyecto no instala analítica ni tiene acceso a registros de visitas. Si usas una copia de la web publicada en
otro sitio, se aplica la política de ese alojamiento.

## Cómo se garantiza

- `herramientas/empaquetar.py` se detiene si lo publicado carga algún recurso externo o hace referencia a Google
  Fonts, y las pruebas automáticas (`python -I herramientas/ejecutar_tests.py`) lo comprueban en cada cambio.
- Las fuentes tipográficas se sirven desde `web/css/fuentes/`.
- El código de la web es abierto: puedes comprobar en `web/js/` que no hay `fetch`, `XMLHttpRequest` ni cookies.

## Herramientas del repositorio

Los scripts de `herramientas/` (que ejecutan los mantenedores y GitHub Actions, no tu navegador) consultan la API de
datos abiertos del BOE para leer normas y sumarios. No envían ningún dato de usuarios, porque no tienen ninguno.

## Contacto

Para cualquier duda sobre privacidad, abre un issue en el repositorio de GitHub del proyecto. Los issues son
públicos: no incluyas datos personales.
