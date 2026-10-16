#!/usr/bin/env python
"""Descarga una norma del BOE en texto plano y vigente.

Uso:  python -I herramientas/boe.py BOE-A-2015-3442 salida.txt

- Intenta primero la API de legislación consolidada (texto vigente: de cada
  bloque se toma la ÚLTIMA versión).
- Si la norma no está consolidada, usa el texto original publicado en el BOE
  (xml.php) y lo avisa en la cabecera.
- La cabecera del fichero incluye título, fecha de última actualización de la
  consolidación y URL, para poder citar "verificado el ..." en la web.
"""
import re
import sys
import html
import urllib.request
import xml.etree.ElementTree as ET

API = "https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/{id}/{what}"
ORIG = "https://www.boe.es/diario_boe/xml.php?id={id}"


def get(url, accept="application/xml"):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def ptext(el):
    return html.unescape("".join(el.itertext())).strip()


def consolidada(norma_id):
    meta = ET.fromstring(get(API.format(id=norma_id, what="metadatos")))
    md = meta.find("./data/metadatos")
    titulo = md.findtext("titulo", "")
    actual = md.findtext("fecha_actualizacion", "")
    derog = md.findtext("estatus_derogacion", "")
    texto = ET.fromstring(get(API.format(id=norma_id, what="texto")))
    out = []
    for bloque in texto.iter("bloque"):
        versiones = bloque.findall("version")
        if not versiones:
            continue
        v = versiones[-1]
        lineas = [ptext(p) for p in v if p.tag in ("p", "blockquote") or p.tag == "table"]
        lineas = [l for l in lineas if l]
        if not lineas:
            continue
        out.append("[%s]" % bloque.get("id"))
        out.extend(lineas)
        out.append("")
    cab = [
        "# " + titulo,
        "# Identificador: %s" % norma_id,
        "# Texto consolidado, última actualización de la consolidación: %s" % actual,
        "# Derogada: %s" % derog,
        "# URL: https://www.boe.es/buscar/act.php?id=%s" % norma_id,
        "",
    ]
    return "\n".join(cab + out)


def original(norma_id):
    t = get(ORIG.format(id=norma_id), accept="*/*")
    titulo = re.search(r"<titulo>(.*?)</titulo>", t, re.S)
    titulo = html.unescape(titulo.group(1)).strip() if titulo else norma_id
    t = re.sub(r"</(p|h\d|li|tr|div)>", "\n", t)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    cab = [
        "# " + titulo,
        "# Identificador: %s" % norma_id,
        "# AVISO: texto ORIGINAL de la publicación (sin consolidar). Comprueba modificaciones posteriores.",
        "# URL: https://www.boe.es/buscar/doc.php?id=%s" % norma_id,
        "",
    ]
    return "\n".join(cab) + t


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    norma_id, destino = sys.argv[1], sys.argv[2]
    try:
        txt = consolidada(norma_id)
        modo = "consolidada"
    except Exception as e:  # noqa: BLE001
        print("No consolidada (%s). Uso texto original." % e, file=sys.stderr)
        txt = original(norma_id)
        modo = "original"
    with open(destino, "w", encoding="utf-8") as f:
        f.write(txt)
    print("%s -> %s (%s, %d caracteres)" % (norma_id, destino, modo, len(txt)))


if __name__ == "__main__":
    main()
