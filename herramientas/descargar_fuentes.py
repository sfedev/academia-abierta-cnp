#!/usr/bin/env python
"""Descarga las fuentes de la web (Archivo, IBM Plex Mono, Source Serif 4) y las deja en web/css/fuentes/.

La web se sirve con las fuentes incluidas (formato .woff2, subconjunto latino: cubre el español completo), de modo
que funciona sin conexión y no hace peticiones a terceros (Google Fonts) cuando la abre un usuario. Este script solo
hace falta para añadir o actualizar fuentes; el resultado se guarda en el repositorio.

Uso:  python -I herramientas/descargar_fuentes.py

Qué hace:
  1. Pide a Google Fonts la hoja de estilos de las familias y pesos de FAMILIAS (con un navegador moderno como
     agente, para recibir .woff2) y se queda con los bloques del subconjunto «latin».
  2. Descarga cada fichero distinto a web/css/fuentes/ con un nombre legible.
  3. Descarga el texto de la licencia (SIL Open Font License 1.1) de cada familia a web/css/fuentes/LICENCIAS.txt.
  4. Reescribe en web/css/app.css el bloque entre «@fuentes:inicio» y «@fuentes:fin» con las declaraciones @font-face.

Las tres familias se publican con la licencia SIL OFL 1.1, que permite incluirlas y redistribuirlas siempre que se
conserve su aviso de licencia (LICENCIAS.txt viaja con las fuentes).
"""
import os
import re
import sys
import urllib.request

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DESTINO = os.path.join(RAIZ, "web", "css", "fuentes")
APP_CSS = os.path.join(RAIZ, "web", "css", "app.css")
CSS_GOOGLE = ("https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500"
              "&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap")
AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SUBCONJUNTO = "latin"
# familia -> (prefijo de los ficheros, carpeta de la familia en github.com/google/fonts para bajar la licencia)
FAMILIAS = {
    "Archivo": ("archivo", "archivo"),
    "IBM Plex Mono": ("ibm-plex-mono", "ibmplexmono"),
    "Source Serif 4": ("source-serif-4", "sourceserif4"),
}
LICENCIA_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/%s/OFL.txt"


def pedir(url, binario=False):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=60) as r:
        datos = r.read()
    return datos if binario else datos.decode("utf-8")


def bloques_latinos(css):
    """[{familia, estilo, pesos (min, max), url, rango}] del subconjunto latino, uniendo los pesos que comparten fichero."""
    por_fichero = {}
    for sub, cuerpo in re.findall(r"/\* (\S+) \*/\s*@font-face \{(.*?)\}", css, re.S):
        if sub != SUBCONJUNTO:
            continue
        fam = re.search(r"font-family: '([^']+)'", cuerpo).group(1)
        estilo = re.search(r"font-style: (\w+)", cuerpo).group(1)
        peso = int(re.search(r"font-weight: (\d+)", cuerpo).group(1))
        url = re.search(r"url\((\S+?)\)", cuerpo).group(1)
        rango = re.search(r"unicode-range: ([^;]+);", cuerpo).group(1).strip()
        b = por_fichero.setdefault(url, {"familia": fam, "estilo": estilo, "pesos": [], "url": url, "rango": rango})
        b["pesos"].append(peso)
    return list(por_fichero.values())


def nombre_fichero(b, distintos_de_la_familia):
    prefijo = FAMILIAS[b["familia"]][0]
    sufijo = "" if b["estilo"] == "normal" else "-" + b["estilo"]
    if len(b["pesos"]) > 1:  # fuente variable: un solo fichero para varios pesos
        return "%s%s-variable.woff2" % (prefijo, sufijo)
    return "%s%s-%d.woff2" % (prefijo, sufijo, b["pesos"][0])


def declaracion(b, fichero):
    lo, hi = min(b["pesos"]), max(b["pesos"])
    peso = str(lo) if lo == hi else "%d %d" % (lo, hi)
    return ('@font-face {\n  font-family: "%s";\n  font-style: %s;\n  font-weight: %s;\n  font-display: swap;\n'
            '  src: url("fuentes/%s") format("woff2");\n  unicode-range: %s;\n}\n' % (b["familia"], b["estilo"], peso, fichero, b["rango"]))


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    bloques = bloques_latinos(pedir(CSS_GOOGLE))
    if not bloques:
        sys.exit("No se han encontrado fuentes del subconjunto %s en la respuesta de Google Fonts" % SUBCONJUNTO)
    os.makedirs(DESTINO, exist_ok=True)
    css, total = [], 0
    for b in sorted(bloques, key=lambda x: (x["familia"], x["estilo"], x["pesos"])):
        fichero = nombre_fichero(b, bloques)
        datos = pedir(b["url"], binario=True)
        if datos[:4] != b"wOF2":
            sys.exit("%s no es un fichero woff2" % b["url"])
        with open(os.path.join(DESTINO, fichero), "wb") as f:
            f.write(datos)
        total += len(datos)
        css.append(declaracion(b, fichero))
        print("  %-34s %6.1f KB  %s %s %s" % (fichero, len(datos) / 1024, b["familia"], b["estilo"], "/".join(map(str, sorted(b["pesos"])))))
    # licencias
    lic = ["Fuentes incluidas en esta carpeta (subconjunto latino, formato woff2), obtenidas de Google Fonts.",
           "Las tres familias se distribuyen con la licencia SIL Open Font License, versión 1.1 (https://openfontlicense.org).",
           "Se conservan aquí los avisos de copyright y el texto de la licencia de cada familia, como exige la licencia.", ""]
    for fam, (_, carpeta) in FAMILIAS.items():
        lic.append("=" * 78)
        lic.append(fam)
        lic.append("=" * 78)
        try:
            lic.append(pedir(LICENCIA_URL % carpeta).strip())
        except Exception as e:  # noqa: BLE001
            lic.append("(No se pudo descargar el texto: %s. Consúltalo en https://github.com/google/fonts/tree/main/ofl/%s)" % (e, carpeta))
        lic.append("")
    with open(os.path.join(DESTINO, "LICENCIAS.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lic))
    # app.css
    with open(APP_CSS, encoding="utf-8") as f:
        app = f.read()
    bloque = ("/* @fuentes:inicio - generado por herramientas/descargar_fuentes.py (Google Fonts, licencia SIL OFL;\n"
              "   ver css/fuentes/LICENCIAS.txt). No editar a mano. */\n" + "\n".join(css) + "/* @fuentes:fin */")
    if "@fuentes:inicio" in app:
        app = re.sub(r"/\* @fuentes:inicio.*?@fuentes:fin \*/", lambda m: bloque, app, flags=re.S)
    else:  # primera vez: justo después del comentario de cabecera
        i = app.index("*/") + 2
        app = app[:i] + "\n\n" + bloque + app[i:]
    with open(APP_CSS, "w", encoding="utf-8", newline="\n") as f:
        f.write(app)
    print("%d ficheros, %.0f KB en total -> %s" % (len(bloques), total / 1024, os.path.relpath(DESTINO, RAIZ)))


if __name__ == "__main__":
    main()
