#!/usr/bin/env python
"""Vigilante de leyes: detecta cambios en las normas del BOE que usan las fichas.

Compara, artículo por artículo, las versiones del texto consolidado del BOE con una foto
guardada (datos/vigilancia/estado.json). Cada cambio nuevo (artículo modificado, reforma que
entrará en vigor más adelante, norma derogada) se guarda como novedad en datos/novedades.json y
se publica en la web (web/data/novedades.js) para la pestaña «Novedades» y los avisos de las fichas.

Uso:
  python -I herramientas/vigilar_leyes.py                      # comprueba y actualiza todo
  python -I herramientas/vigilar_leyes.py --historial 20260101 # además, siembra el historial reciente
  python -I herramientas/vigilar_leyes.py listar               # muestra las novedades
  python -I herramientas/vigilar_leyes.py revisar ID [ID...]   # marca novedades como incorporadas
  python -I herramientas/vigilar_leyes.py revisar --todo

La primera ejecución (sin foto previa) solo guarda la línea base: no inventa cambios.
Las fuentes que no son del BOE (UE, RAE, INE, DGT...) no se vigilan aquí: se cuentan y se avisan.
"""
import argparse
import concurrent.futures as cf
import datetime
import glob
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
API = "https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/%s/%s"
ORIGINAL = "https://www.boe.es/diario_boe/xml.php?id=%s"
ESTADO = os.path.join(RAIZ, "datos", "vigilancia", "estado.json")
TITULOS = os.path.join(RAIZ, "datos", "vigilancia", "titulos.json")
NOVEDADES = os.path.join(RAIZ, "datos", "novedades.json")
WEB = os.path.join(RAIZ, "web", "data", "novedades.js")
RESUMEN_MD = os.path.join(RAIZ, "novedades-resumen.md")

ABREV = {
    "Ley Orgánica": "LO",
    "Real Decreto": "RD",
    "Real Decreto Legislativo": "RDLeg",
    "Real Decreto-ley": "RDL",
    "Ley": "Ley",
    "Orden": "Orden",
    "Resolución": "Resolución",
    "Constitución": "CE",
    "Código": "Código",
}


def hoy():
    return datetime.date.today().strftime("%Y%m%d")


def iso(d):
    return "%s-%s-%s" % (d[:4], d[4:6], d[6:8]) if d and len(d) >= 8 else ""


def get(url, accept="application/xml", intentos=4):
    ultimo = None
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "Mozilla/5.0 (vigilante-leyes)"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            ultimo = e
        except Exception as e:  # noqa: BLE001
            ultimo = e
        time.sleep(1.5 * (i + 1))
    raise ultimo


def cargar_json(p, defecto):
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return defecto


def guardar_json(p, datos, indent=None):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, ensure_ascii=False, indent=indent, sort_keys=True, separators=(",", ":") if indent is None else None)
        f.write("\n")


# ---------------------------------------------------------------- normas que citan las fichas
def normas_de_fichas():
    ids, otras = {}, 0
    for p in sorted(glob.glob(os.path.join(RAIZ, "datos", "temas", "tema-*.json"))):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        for n in d.get("normas", []):
            b = n.get("boe")
            if b and re.match(r"^BOE-A-\d{4}-\d+$", b):
                ids.setdefault(b, set()).add(d["tema"])
            else:
                otras += 1
    return {k: sorted(v) for k, v in ids.items()}, otras


# ---------------------------------------------------------------- lectura de una norma
def rotulo(version):
    """'Artículo 36. Infracciones graves.' -> 'Art. 36'."""
    for p in version.findall("p"):
        if p.get("class") == "articulo":
            t = re.sub(r"[­ ]", "", "".join(p.itertext())).strip()
            m = re.match(r"^Art[ií]culo\s+([^.]+?)\s*\.", t)
            if m:
                return "Art. " + m.group(1)
            m = re.match(r"^(Disposición\s+\w+(?:\s+\w+)?)\.?", t, re.I)
            return (m.group(1) if m else t)[:60]
    return ""


def corto_de(rango, num, titulo):
    """'Real Decreto 305/2022' -> 'RD 305/2022' (el BOE a veces deja vacío numero_oficial)."""
    if titulo.startswith("Constituci"):
        return "CE"
    if not num:
        m = re.search(r"\b(\d+/\d{4})\b", titulo)
        num = m.group(1) if m else ""
    if not num:
        # Normas antiguas sin número (p. ej. el Real decreto de 1882 de la LECrim): usa lo que aprueba.
        m = re.search(r"aprueba (?:el |la |los |las )?(.+?)\.?$", titulo)
        if m and len(m.group(1)) < 60:
            return m.group(1)[0].upper() + m.group(1)[1:]
        return titulo.split(",")[0][:50]
    return ("%s %s" % (ABREV.get(rango, rango), num)).strip()


def leer_norma(norma_id):
    """Devuelve dict con metadatos y versiones por bloque, o {'sinConsolidar': True}."""
    try:
        meta = ET.fromstring(get(API % (norma_id, "metadatos"))).find("./data/metadatos")
        texto = ET.fromstring(get(API % (norma_id, "texto")))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"sinConsolidar": True}
        raise
    rango = meta.findtext("rango", "")
    num = meta.findtext("numero_oficial", "")
    out = {
        "titulo": re.sub(r"\s+", " ", meta.findtext("titulo", "")).strip(),
        "corto": corto_de(rango, num, re.sub(r"\s+", " ", meta.findtext("titulo", "")).strip()),
        "derogada": meta.findtext("estatus_derogacion", "") == "S",
        "actualizada": meta.findtext("fecha_actualizacion", "")[:8],
        "bloques": {},
    }
    for b in texto.iter("bloque"):
        vs = b.findall("version")
        if not vs:
            continue
        out["bloques"][b.get("id")] = {
            "v": ["%s:%s:%s" % (v.get("fecha_publicacion", ""), v.get("fecha_vigencia", ""), (v.get("id_norma", "") or "")) for v in vs],
            "r": rotulo(vs[-1]),
        }
    return out


def titulo_de(norma_id, cache):
    """Título de la norma que modifica (cualquier BOE-A), con caché."""
    if norma_id in cache:
        return cache[norma_id]
    t = ""
    try:
        raw = get(ORIGINAL % norma_id, accept="*/*")
        m = re.search(r"<titulo>(.*?)</titulo>", raw, re.S)
        if m:
            import html
            t = re.sub(r"\s+", " ", html.unescape(m.group(1))).strip()
    except Exception:  # noqa: BLE001
        pass
    cache[norma_id] = t
    return t


# ---------------------------------------------------------------- comparación
def comparar(norma_id, previo, actual, temas, h, cache_titulos, historial=None):
    """Genera novedades agrupadas por (norma modificadora, publicación, vigencia)."""
    eventos = []
    nuevos = {}  # (modificadora, pub, vig) -> [rotulos]
    prev_b = previo["bloques"] if previo else {}
    for bid, b in actual["bloques"].items():
        vistos = set(prev_b.get(bid, {}).get("v", [])) if previo else None
        for v in b["v"]:
            pub, vig, mod = v.split(":")
            if previo is not None:
                if v in vistos:
                    continue
            else:  # sin foto previa: solo con --historial
                if not historial or pub < historial:
                    continue
            nuevos.setdefault((mod, pub, vig), []).append(b["r"])  # "" si el bloque no es un artículo
    for (mod, pub, vig), arts in nuevos.items():
        arts = [a for a in arts if a]  # solo artículos y disposiciones, no encabezados de capítulo o sección
        # La versión inicial de la norma (su propia publicación) no es una modificación.
        if mod == norma_id:
            continue
        mod_id = mod
        futura = vig > h
        eid = hashlib.sha1(("%s|%s|%s|%s" % (norma_id, mod, pub, vig)).encode()).hexdigest()[:10]
        eventos.append({
            "id": eid,
            "detectado": iso(h),
            "norma": {"id": norma_id, "corto": actual["corto"], "titulo": actual["titulo"], "url": "https://www.boe.es/buscar/act.php?id=" + norma_id},
            "temas": temas,
            "tipo": "proxima" if futura else "modificada",
            "modificadora": {"id": mod_id, "titulo": titulo_de(mod_id, cache_titulos) if mod_id else "", "url": ("https://www.boe.es/buscar/doc.php?id=" + mod_id) if mod_id else ""},
            "publicacion": iso(pub),
            "vigencia": iso(vig),
            "articulos": ordenar_arts(arts)[:12],
            "nArticulos": len(arts),
            "estado": "pendiente" if (previo is not None or futura) else "incorporada",
        })
    if previo is not None and not previo.get("derogada") and actual["derogada"]:
        eventos.append({
            "id": hashlib.sha1(("%s|derogada|%s" % (norma_id, h)).encode()).hexdigest()[:10],
            "detectado": iso(h),
            "norma": {"id": norma_id, "corto": actual["corto"], "titulo": actual["titulo"], "url": "https://www.boe.es/buscar/act.php?id=" + norma_id},
            "temas": temas,
            "tipo": "derogada",
            "modificadora": {"id": "", "titulo": "", "url": ""},
            "publicacion": "",
            "vigencia": iso(actual["actualizada"]),
            "articulos": [],
            "nArticulos": 0,
            "estado": "pendiente",
        })
    return eventos


def ordenar_arts(arts):
    def clave(a):
        m = re.search(r"(\d+)", a)
        return (int(m.group(1)) if m else 10**6, a)
    return sorted(set(arts), key=clave)


# ---------------------------------------------------------------- salida para la web
def escribir_web(items, comprobacion, vigiladas, sin_consolidar, otras, errores):
    datos = {
        "comprobacion": iso(comprobacion),
        "normasVigiladas": vigiladas,
        "sinConsolidar": sin_consolidar,
        "otrasFuentes": otras,
        "errores": errores,
        "items": sorted(items, key=lambda x: (x.get("detectado", ""), x.get("publicacion", "")), reverse=True)[:150],
    }
    os.makedirs(os.path.dirname(WEB), exist_ok=True)
    with open(WEB, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* Generado por herramientas/vigilar_leyes.py: no editar a mano. */\n")
        f.write("window.AA_NOVEDADES=" + json.dumps(datos, ensure_ascii=True, separators=(",", ":")) + ";\n")


def resumen_markdown(nuevas, repo_url=""):
    l = ["Se %s **%d** %s en normas que usa el temario.\n" % ("ha detectado" if len(nuevas) == 1 else "han detectado", len(nuevas), "cambio" if len(nuevas) == 1 else "cambios")]
    for e in nuevas:
        arts = ", ".join(e["articulos"][:6]) + ("…" if e["nArticulos"] > 6 else "")
        cuando = ("entra en vigor el %s" % e["vigencia"]) if e["tipo"] == "proxima" else ("vigente desde %s" % e["vigencia"])
        mod = (" por [%s](%s)" % (e["modificadora"]["id"], e["modificadora"]["url"])) if e["modificadora"]["id"] else ""
        l.append("- **%s**%s (%s; %s). Afecta a los temas: %s. %s" % (
            e["norma"]["corto"], mod, e["tipo"], cuando, ", ".join(str(t) for t in e["temas"]), ("Artículos: " + arts) if arts else ""))
    l.append("\nRevisa las fichas afectadas y marca las novedades como incorporadas con `python -I herramientas/vigilar_leyes.py revisar ID`.")
    return "\n".join(l)


# ---------------------------------------------------------------- comandos
def cmd_comprobar(args):
    h = hoy()
    normas, otras = normas_de_fichas()
    estado = cargar_json(ESTADO, {"normas": {}, "fecha": ""})
    cache_titulos = cargar_json(TITULOS, {})
    novedades = cargar_json(NOVEDADES, {"items": []})
    primera = not estado["normas"]
    print("Vigilando %d normas del BOE (%s)%s" % (len(normas), "primera ejecucion: linea base" if primera else "comparando con la foto del " + estado.get("fecha", "?"), ""))

    resultados, errores = {}, []
    with cf.ThreadPoolExecutor(max_workers=args.hilos) as ex:
        futs = {ex.submit(leer_norma, nid): nid for nid in normas}
        for fu in cf.as_completed(futs):
            nid = futs[fu]
            try:
                resultados[nid] = fu.result()
            except Exception as e:  # noqa: BLE001
                errores.append({"id": nid, "error": str(e)[:80]})

    nuevas, sin_consolidar = [], []
    nuevo_estado = {"fecha": iso(h), "normas": {}}
    for nid in sorted(normas):
        r = resultados.get(nid)
        if r is None:  # error de red: conserva la foto anterior, no inventa cambios
            if nid in estado["normas"]:
                nuevo_estado["normas"][nid] = estado["normas"][nid]
            continue
        if r.get("sinConsolidar"):
            sin_consolidar.append(nid)
            continue
        previo = estado["normas"].get(nid)
        if previo is not None or args.historial:
            nuevas += comparar(nid, previo, r, normas[nid], h, cache_titulos, args.historial)
        nuevo_estado["normas"][nid] = {"corto": r["corto"], "titulo": r["titulo"], "derogada": r["derogada"], "actualizada": r["actualizada"], "bloques": r["bloques"]}

    ya = {i["id"] for i in novedades["items"]}
    anadidas = [e for e in nuevas if e["id"] not in ya]
    novedades["items"] = novedades["items"] + anadidas
    guardar_json(NOVEDADES, novedades, indent=1)
    # La foto solo se reescribe si cambió algo: así los commits diarios no cargan el repositorio.
    if nuevo_estado["normas"] != estado["normas"]:
        guardar_json(ESTADO, nuevo_estado)
    guardar_json(TITULOS, cache_titulos, indent=1)
    escribir_web(novedades["items"], h, len(nuevo_estado["normas"]), sin_consolidar, otras, errores)

    pendientes_nuevas = [e for e in anadidas if e["estado"] == "pendiente"]
    print("Comprobadas: %d | sin texto consolidado: %d | errores de red: %d | fuentes no BOE sin vigilar: %d" % (len(nuevo_estado["normas"]), len(sin_consolidar), len(errores), otras))
    print("Novedades nuevas: %d (pendientes de revisar: %d)" % (len(anadidas), len(pendientes_nuevas)))
    for e in anadidas:
        print("  [%s] %s %s -> temas %s | vigencia %s | %d art." % (e["estado"], e["tipo"], e["norma"]["corto"], e["temas"], e["vigencia"], e["nArticulos"]))
    if errores:
        print("  errores:", errores[:5])
    if pendientes_nuevas:
        with open(RESUMEN_MD, "w", encoding="utf-8") as f:
            f.write(resumen_markdown(pendientes_nuevas))
    elif os.path.exists(RESUMEN_MD):
        os.remove(RESUMEN_MD)
    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as f:
            f.write("nuevas=%d\n" % len(pendientes_nuevas))


def cmd_listar(_):
    nov = cargar_json(NOVEDADES, {"items": []})
    items = sorted(nov["items"], key=lambda x: (x["detectado"], x["publicacion"]), reverse=True)
    if not items:
        print("Sin novedades registradas.")
    for e in items:
        print("%s  [%-11s] %-9s %-12s temas %-12s vig %s  (%d art.)" % (e["id"], e["estado"], e["tipo"], e["norma"]["corto"], ",".join(map(str, e["temas"])), e["vigencia"], e["nArticulos"]))


def cmd_revisar(args):
    nov = cargar_json(NOVEDADES, {"items": []})
    estado = cargar_json(ESTADO, {"normas": {}})
    n = 0
    for e in nov["items"]:
        if e["estado"] == "pendiente" and (args.todo or e["id"] in args.ids):
            e["estado"] = "incorporada"
            e["revisada"] = iso(hoy())
            n += 1
    guardar_json(NOVEDADES, nov, indent=1)
    normas, otras = normas_de_fichas()
    escribir_web(nov["items"], hoy(), len(estado["normas"]), [], otras, [])
    print("Novedades marcadas como incorporadas: %d" % n)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    ap.add_argument("--historial", help="AAAAMMDD: siembra novedades de versiones publicadas desde esa fecha (solo línea base)")
    ap.add_argument("--hilos", type=int, default=4)
    sub.add_parser("listar")
    r = sub.add_parser("revisar")
    r.add_argument("ids", nargs="*")
    r.add_argument("--todo", action="store_true")
    args = ap.parse_args()
    if args.cmd == "listar":
        cmd_listar(args)
    elif args.cmd == "revisar":
        if not args.todo and not args.ids:
            sys.exit("Indica ids o --todo")
        cmd_revisar(args)
    else:
        cmd_comprobar(args)


if __name__ == "__main__":
    main()
