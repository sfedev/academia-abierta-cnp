#!/usr/bin/env python
"""Descarga una norma del BOE en texto plano, vigente a una fecha.

Uso:  python -I herramientas/boe.py BOE-A-2015-3442 salida.txt [--fecha AAAAMMDD] [--sin-futuras]

- Intenta primero la API de legislación consolidada. De cada bloque (artículo,
  disposición...) toma la versión VIGENTE a la fecha indicada (por defecto, hoy).
- Si el BOE ya ha publicado reformas que todavía no han entrado en vigor, esas
  versiones FUTURAS se añaden justo después del texto vigente, en un bloque marcado
  «[a49 · desde 2026-10-23 · BOE-A-2026-20528]» (o «NUEVO» si el artículo aún no
  existe). La cabecera indica cuántos bloques las tienen. Con --sin-futuras no se
  incluyen.
- Si la norma no está consolidada, usa el texto original publicado en el BOE
  (xml.php) y lo avisa en la cabecera.
- La cabecera del fichero incluye título, fecha de última actualización de la
  consolidación y URL, para poder citar "verificado el ..." en la web.
"""
import argparse
import datetime
import html
import re
import sys
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


def iso(d):
    return "%s-%s-%s" % (d[:4], d[4:6], d[6:8]) if d and len(d) >= 8 else "?"


def lineas_de(version):
    ls = [ptext(p) for p in version if p.tag in ("p", "blockquote", "table")]
    return [l for l in ls if l]


def separar(versiones, fecha):
    """Devuelve (versión vigente a `fecha` o None, [versiones futuras en orden])."""
    ordenadas = sorted(versiones, key=lambda v: (v.get("fecha_vigencia") or "", v.get("fecha_publicacion") or ""))
    vigente, futuras = None, []
    for v in ordenadas:
        if (v.get("fecha_vigencia") or "") <= fecha:
            vigente = v
        else:
            futuras.append(v)
    return vigente, futuras


def consolidada(norma_id, fecha, con_futuras=True):
    meta = ET.fromstring(get(API.format(id=norma_id, what="metadatos")))
    md = meta.find("./data/metadatos")
    titulo = md.findtext("titulo", "")
    actual = md.findtext("fecha_actualizacion", "")
    derog = md.findtext("estatus_derogacion", "")
    texto = ET.fromstring(get(API.format(id=norma_id, what="texto")))
    out = []
    con_cambios = 0
    desde = set()
    for bloque in texto.iter("bloque"):
        versiones = bloque.findall("version")
        if not versiones:
            continue
        vigente, futuras = separar(versiones, fecha)
        if futuras:
            con_cambios += 1
            desde.update(v.get("fecha_vigencia") for v in futuras)
        ls = lineas_de(vigente) if vigente is not None else []
        if ls:
            out.append("[%s]" % bloque.get("id"))
            out.extend(ls)
            out.append("")
        if con_futuras:
            for v in futuras:
                lf = lineas_de(v)
                if not lf:
                    continue
                marca = "desde %s" % iso(v.get("fecha_vigencia") or "")
                if v.get("id_norma"):
                    marca += " · %s" % v.get("id_norma")
                if not ls:
                    marca = "NUEVO " + marca
                out.append("[%s · %s]" % (bloque.get("id"), marca))
                out.extend(lf)
                out.append("")
    if con_cambios:
        fechas = sorted(d for d in desde if d)
        futuras_txt = "%d bloque(s) con reformas que aún no han entrado en vigor (entran entre %s y %s)%s" % (
            con_cambios, iso(fechas[0]), iso(fechas[-1]),
            "; se añaden tras el texto vigente con la marca «desde AAAA-MM-DD»" if con_futuras else "; NO se incluyen (--sin-futuras)")
    else:
        futuras_txt = "ninguna"
    cab = [
        "# " + titulo,
        "# Identificador: %s" % norma_id,
        "# Texto consolidado, última actualización de la consolidación: %s" % actual,
        "# Vigente a: %s" % iso(fecha),
        "# Versiones futuras: %s" % futuras_txt,
        "# Derogada: %s" % derog,
        "# URL: https://www.boe.es/buscar/act.php?id=%s" % norma_id,
        "",
    ]
    return "\n".join(cab + out), con_cambios


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
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("norma", help="identificador BOE-A-AAAA-NNNN")
    ap.add_argument("destino", help="fichero de salida")
    ap.add_argument("--fecha", help="AAAAMMDD: texto vigente a esa fecha (por defecto, hoy)")
    ap.add_argument("--sin-futuras", action="store_true", help="no añadir las versiones que aún no han entrado en vigor")
    args = ap.parse_args()
    fecha = args.fecha or datetime.date.today().strftime("%Y%m%d")
    if not re.fullmatch(r"\d{8}", fecha):
        sys.exit("--fecha debe tener el formato AAAAMMDD")
    try:
        txt, n_fut = consolidada(args.norma, fecha, not args.sin_futuras)
        modo = "consolidada"
    except Exception as e:  # noqa: BLE001
        print("No consolidada (%s). Uso texto original." % e, file=sys.stderr)
        txt = original(args.norma)
        modo, n_fut = "original", 0
    with open(args.destino, "w", encoding="utf-8") as f:
        f.write(txt)
    extra = ", %d bloque(s) con versiones futuras" % n_fut if n_fut else ""
    print("%s -> %s (%s, vigente a %s%s, %d caracteres)" % (args.norma, args.destino, modo, iso(fecha), extra, len(txt)))


if __name__ == "__main__":
    main()
