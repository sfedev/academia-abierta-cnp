#!/usr/bin/env python
"""Genera dist/ a partir de web/ con todo el contenido en ASCII puro.

Por qué: algunos visores sirven los .js sin declarar el juego de caracteres y el navegador los
decodifica como Windows-1252, de modo que "Policía" se ve como "PolicÃ­a". Si los ficheros
publicados solo contienen ASCII (los acentos van como \\uXXXX en JS y como &#NNN; en HTML),
se leen igual con cualquier codificación.

Las fuentes de web/ siguen en UTF-8 y legibles; se publica siempre dist/.

Uso:  python -I herramientas/empaquetar.py
"""
import os
import re
import shutil
import sys
import unicodedata

ORIGEN = "web"
DESTINO = "dist"
SITIO = "sitio"


def escapar_js(s):
    out = []
    for ch in s:
        o = ord(ch)
        if o < 128:
            out.append(ch)
        elif o < 0x10000:
            out.append("\\u%04x" % o)
        else:  # par sustituto
            o -= 0x10000
            out.append("\\u%04x\\u%04x" % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return "".join(out)


def entidades_html(s):
    return "".join(ch if ord(ch) < 128 else "&#%d;" % ord(ch) for ch in s)


def css_ascii(s, ruta):
    partes = re.split(r"(/\*.*?\*/)", s, flags=re.S)
    res = []
    for p in partes:
        if p.startswith("/*"):
            # En los comentarios se pueden quitar los acentos sin efecto alguno.
            p = unicodedata.normalize("NFKD", p).encode("ascii", "ignore").decode("ascii")
        elif re.search(r"[^\x00-\x7f]", p):
            raise SystemExit("%s: hay caracteres no ASCII fuera de comentarios en el CSS" % ruta)
        res.append(p)
    return "".join(res)


def main():
    if os.path.isdir(DESTINO):
        shutil.rmtree(DESTINO)
    n = 0
    for raiz, _, ficheros in os.walk(ORIGEN):
        for f in ficheros:
            src = os.path.join(raiz, f)
            rel = os.path.relpath(src, ORIGEN)
            dst = os.path.join(DESTINO, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            ext = os.path.splitext(f)[1].lower()
            if ext in (".js", ".html", ".css"):
                with open(src, encoding="utf-8") as fh:
                    s = fh.read()
                if ext == ".js":
                    s = escapar_js(s)
                elif ext == ".html":
                    s = entidades_html(s)
                else:
                    s = css_ascii(s, rel)
                with open(dst, "w", encoding="ascii", newline="\n") as fh:
                    fh.write(s)
            else:
                shutil.copyfile(src, dst)
            n += 1
    # sitio/: lo mismo que dist/, pero con index.html como documento completo (doctype, head, body)
    # para alojarlo en un servidor normal como GitHub Pages. dist/ queda sin envolver para el artefacto.
    if os.path.isdir(SITIO):
        shutil.rmtree(SITIO)
    shutil.copytree(DESTINO, SITIO)
    with open(os.path.join(DESTINO, "index.html"), encoding="ascii") as fh:
        contenido = fh.read()
    cabeza, cuerpo = contenido.split('<div id="app">', 1)
    envuelto = (
        # El charset debe ir en los primeros 1024 bytes del documento.
        '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + cabeza.replace('<meta charset="utf-8">\n', "")
        + '<link rel="icon" href="data:,">\n'
        "<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n"
        '</head>\n<body>\n<div id="app">' + cuerpo + "\n</body>\n</html>\n"
    )
    with open(os.path.join(SITIO, "index.html"), "w", encoding="ascii", newline="\n") as fh:
        fh.write(envuelto)
    open(os.path.join(SITIO, ".nojekyll"), "w").close()

    # Comprobación: nada de texto fuera de ASCII en lo publicado.
    malos = []
    for raiz, _, ficheros in os.walk(DESTINO):
        for f in ficheros:
            if f.lower().endswith((".js", ".html", ".css")):
                with open(os.path.join(raiz, f), "rb") as fh:
                    if re.search(rb"[\x80-\xff]", fh.read()):
                        malos.append(f)
    if malos:
        sys.exit("ERROR: quedan caracteres no ASCII en: %s" % ", ".join(malos))
    print("dist/ generado: %d ficheros, todo el texto en ASCII" % n)


if __name__ == "__main__":
    main()
