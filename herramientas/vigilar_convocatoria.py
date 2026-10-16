#!/usr/bin/env python
"""Vigilante de la convocatoria: detecta en el BOE la próxima oposición a la Escala Básica y compara su temario.

Cada día que se ejecuta:
  1. Lee los sumarios diarios del BOE (API de datos abiertos) desde la última fecha revisada hasta hoy.
  2. Busca una «Resolución … de la Dirección General de la Policía, por la que se convoca oposición libre …
     Escala Básica, categoría de Policía» distinta de las ya conocidas (la de 2026 es BOE-A-2026-15055).
  3. Si aparece, descarga su texto, extrae el Anexo I (temario), las plazas y el plazo de solicitud, y compara
     el temario tema por tema con fuentes/anexo-I-literal.txt: temas nuevos, eliminados, renumerados y con el
     epígrafe modificado.
  4. Lo registra como novedad de tipo «convocatoria» en datos/novedades.json (la web la muestra en la pestaña
     Novedades, con una insignia en los temas que cambian y un banner en sus fichas) y deja un resumen para el
     aviso por issue del workflow.

Estado: datos/vigilancia/convocatoria.json (última fecha revisada y convocatorias ya conocidas).

Uso:
  python -I herramientas/vigilar_convocatoria.py                   # revisa los sumarios pendientes (máx. 60 días por ejecución)
  python -I herramientas/vigilar_convocatoria.py --desde 20260701  # vuelve a revisar desde esa fecha
  python -I herramientas/vigilar_convocatoria.py --probar BOE-A-2026-15055   # compara una convocatoria concreta (no guarda nada)
"""
import argparse
import datetime
import difflib
import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ESTADO = os.path.join(RAIZ, "datos", "vigilancia", "convocatoria.json")
NOVEDADES = os.path.join(RAIZ, "datos", "novedades.json")
ANEXO_ACTUAL = os.path.join(RAIZ, "fuentes", "anexo-I-literal.txt")
RESUMEN_MD = os.path.join(RAIZ, "convocatoria-resumen.md")
SUMARIO = "https://www.boe.es/datosabiertos/api/boe/sumario/%s"
DOCUMENTO = "https://www.boe.es/diario_boe/xml.php?id=%s"

CONOCIDAS_INICIALES = ["BOE-A-2026-15055"]  # convocatoria de 2026: la base del temario actual
MAX_DIAS = 60  # días de sumario por ejecución (el primer día puede haber muchos pendientes)


# ---------------------------------------------------------------- red
def get(url, accept="application/json", intentos=3):
    ultimo = None
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "Mozilla/5.0 (vigilante-convocatoria)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            ultimo = e
        except Exception as e:  # noqa: BLE001
            ultimo = e
        time.sleep(1.5 * (i + 1))
    raise ultimo


def sumario(fecha):
    """Disposiciones del BOE de ese día [{identificador, titulo, url_html}] ([] si no hay BOE: domingos, festivos)."""
    try:
        d = json.loads(get(SUMARIO % fecha))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    items = []

    def recorrer(o):
        if isinstance(o, dict):
            if "identificador" in o and "titulo" in o:
                items.append({"identificador": o["identificador"], "titulo": o["titulo"], "url_html": o.get("url_html", "")})
            for v in o.values():
                recorrer(v)
        elif isinstance(o, list):
            for x in o:
                recorrer(x)

    recorrer(d.get("data", {}).get("sumario", {}))
    return items


def texto_documento(boe_id):
    """Texto plano de una disposición publicada (xml.php), conservando los saltos de párrafo."""
    t = get(DOCUMENTO % boe_id, accept="*/*")
    t = re.sub(r"</(p|h\d|li|tr|div|titulo)>", "\n", t)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    return re.sub(r"\n\s*\n+", "\n", t)


# ---------------------------------------------------------------- reconocer la convocatoria
def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def es_convocatoria_escala_basica(titulo):
    """La resolución que CONVOCA la oposición libre de la Escala Básica (no listas de admitidos, nombramientos…)."""
    t = sin_tildes(titulo).lower()
    return ("direccion general de la policia" in t
            and re.search(r"por la que se convoca(?:n)?\s+(?:la\s+)?(?:oposicion libre|proceso selectivo)", t) is not None
            and "escala basica" in t and "categoria de policia" in t)


# ---------------------------------------------------------------- extraer datos de la convocatoria
RE_TEMA = re.compile(r"^\s*Tema\s+(\d+)\s*\.\s*(.*)$")


def normalizar_espacios(s):
    return re.sub(r"\s+", " ", s.replace(" ", " ").replace(" ", " ")).strip()


def extraer_anexo_i(texto):
    """{número de tema: texto} del Anexo I. El BOE usa espacios no separables (U+00A0, U+2003)."""
    lineas = [normalizar_espacios(l) for l in texto.splitlines()]
    try:
        ini = next(i for i, l in enumerate(lineas) if re.fullmatch(r"ANEXO I\.?", l))
    except StopIteration:
        return {}
    fin = next((i for i in range(ini + 1, len(lineas)) if re.match(r"^ANEXO II\b", lineas[i])), len(lineas))
    temas = {}
    for l in lineas[ini + 1:fin]:
        m = RE_TEMA.match(l)
        if m:
            temas[int(m.group(1))] = m.group(2).strip()
    return temas


def datos_basicos(texto):
    """Plazas, plazo de solicitud y formato de la primera prueba (lo que se pueda leer; None si no)."""
    t = normalizar_espacios(texto)
    out = {"plazas": None, "plazasLibres": None, "plazo": None, "primeraPrueba": None}
    m = re.search(r"Se convocan\s+([\d.]+)\s+plazas", t)
    if m:
        out["plazas"] = int(m.group(1).replace(".", ""))
    m = re.search(r"Las\s+([\d.]+)\s+plazas restantes serán cubiertas por el procedimiento de oposición libre", t)
    if m:
        out["plazasLibres"] = int(m.group(1).replace(".", ""))
    # la última aparición es la de las bases (la primera puede ser el índice); se toma la frase que sigue
    plazos = re.findall(r"Plazo para solicitud de admisi[oó]n\.\s*([^.]{10,250}\.)", t)
    if plazos:
        out["plazo"] = plazos[-1].strip()
    m = re.search(r"(La prueba consistirá en la contestación por escrito en [^.]{10,300}\.)", t)
    if m:
        out["primeraPrueba"] = m.group(1).strip()
    return out


def leer_anexo_actual(ruta=None):
    with open(ruta or ANEXO_ACTUAL, encoding="utf-8") as f:
        texto = f.read()
    temas = {}
    for l in texto.splitlines():
        m = RE_TEMA.match(normalizar_espacios(l))
        if m:
            temas[int(m.group(1))] = m.group(2).strip()
    return temas


# ---------------------------------------------------------------- comparar temarios
def _clave(s):
    return re.sub(r"[^a-z0-9 ]", "", sin_tildes(s).lower())


def parecido(a, b):
    return difflib.SequenceMatcher(None, _clave(a), _clave(b)).ratio()


def comparar_temarios(actual, nuevo, umbral_mismo=0.6, umbral_igual=0.985):
    """Empareja cada tema nuevo con el tema actual más parecido y clasifica los cambios.

    Devuelve {iguales, renumerados: [{de, a}], modificados: [{tema, nuevoNumero, antes, despues, parecido}],
              nuevos: [{tema, texto}], eliminados: [{tema, texto}]}."""
    libres = dict(actual)
    pares = []
    candidatos = sorted(((parecido(t_a, t_n), n_a, n_n) for n_n, t_n in nuevo.items() for n_a, t_a in actual.items()), reverse=True)
    usados_n = set()
    for r, n_a, n_n in candidatos:  # emparejamiento voraz: primero los más parecidos
        if r < umbral_mismo:
            break
        if n_a in libres and n_n not in usados_n:
            pares.append((n_a, n_n, r))
            del libres[n_a]
            usados_n.add(n_n)
    out = {"iguales": 0, "renumerados": [], "modificados": [], "nuevos": [], "eliminados": []}
    for n_a, n_n, r in sorted(pares, key=lambda x: x[1]):
        if n_a != n_n:
            out["renumerados"].append({"de": n_a, "a": n_n})
        if r >= umbral_igual:
            if n_a == n_n:
                out["iguales"] += 1
        else:
            out["modificados"].append({"tema": n_a, "nuevoNumero": n_n, "antes": actual[n_a], "despues": nuevo[n_n], "parecido": round(r, 3)})
    for n_n in sorted(set(nuevo) - usados_n):
        out["nuevos"].append({"tema": n_n, "texto": nuevo[n_n]})
    for n_a in sorted(libres):
        out["eliminados"].append({"tema": n_a, "texto": actual[n_a]})
    return out


def temas_afectados(cmp):
    """Fichas actuales (por su número) que hay que revisar: las modificadas, las renumeradas y las eliminadas."""
    t = {m["tema"] for m in cmp["modificados"]} | {e["tema"] for e in cmp["eliminados"]} | {r["de"] for r in cmp["renumerados"]}
    return sorted(t)


def hay_cambios(cmp):
    return bool(cmp["modificados"] or cmp["nuevos"] or cmp["eliminados"] or cmp["renumerados"])


# ---------------------------------------------------------------- novedad y resumen
def novedad(item, fecha_pub, basicos, cmp, hoy_iso):
    eid = hashlib.sha1(("convocatoria|%s" % item["identificador"]).encode()).hexdigest()[:10]
    return {
        "id": eid,
        "detectado": hoy_iso,
        "tipo": "convocatoria",
        "norma": {"id": item["identificador"], "corto": "Nueva convocatoria", "titulo": item["titulo"],
                  "url": "https://www.boe.es/diario_boe/txt.php?id=" + item["identificador"]},
        "temas": temas_afectados(cmp),
        "otrosTemas": [],
        "modificadora": {"id": "", "titulo": "", "url": ""},
        "publicacion": fecha_pub,
        "vigencia": fecha_pub,
        "articulos": [],
        "nArticulos": 0,
        "estado": "pendiente",
        "convocatoria": dict(basicos, temario=cmp, cambios=hay_cambios(cmp)),
    }


def resumen_markdown(e):
    c = e["convocatoria"]
    t = c["temario"]
    l = ["Se ha publicado en el BOE una nueva convocatoria de oposición libre a la **Escala Básica (categoría de Policía)**:",
         "", "**%s** — [%s](%s), publicada el %s." % (e["norma"]["titulo"], e["norma"]["id"], e["norma"]["url"], e["publicacion"]), ""]
    if c.get("plazas"):
        l.append("- Plazas: **%s**%s." % (c["plazas"], (" (%s de oposición libre)" % c["plazasLibres"]) if c.get("plazasLibres") else ""))
    if c.get("plazo"):
        l.append("- Plazo de solicitud: %s" % c["plazo"])
    l.append("- Recuerda acreditar el nivel A2 de inglés o francés antes de que termine el plazo de solicitud.")
    l += ["", "**Cambios en el temario (Anexo I) respecto al de 2026:**", ""]
    if not c["cambios"]:
        l.append("- Ninguno: los 45 temas tienen el mismo epígrafe.")
    for n in t["nuevos"]:
        l.append("- Tema nuevo %d: %s" % (n["tema"], n["texto"][:300]))
    for x in t["eliminados"]:
        l.append("- Eliminado el tema %d: %s" % (x["tema"], x["texto"][:200]))
    for m in t["modificados"]:
        l.append("- Cambia el tema %d%s." % (m["tema"], (" (ahora tema %d)" % m["nuevoNumero"]) if m["nuevoNumero"] != m["tema"] else ""))
    ren = [r for r in t["renumerados"] if not any(m["tema"] == r["de"] for m in t["modificados"])]
    if ren:
        l.append("- Renumerados sin otros cambios: %s." % ", ".join("%d→%d" % (r["de"], r["a"]) for r in ren))
    l += ["", "Siguiente paso: rehacer las fichas afectadas y actualizar `fuentes/anexo-I-literal.txt` (ver `herramientas/GUIA_ACTUALIZACION.md`)."]
    return "\n".join(l) + "\n"


# ---------------------------------------------------------------- comandos
def cargar_json(p, defecto):
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return defecto


def guardar_json(p, datos):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")


def fechas_pendientes(desde_iso, hoy, maximo=MAX_DIAS):
    """Días (AAAAMMDD) posteriores a `desde_iso` hasta hoy incluido, como mucho `maximo`."""
    d = datetime.date.fromisoformat(desde_iso) + datetime.timedelta(days=1)
    out = []
    while d <= hoy and len(out) < maximo:
        out.append(d.strftime("%Y%m%d"))
        d += datetime.timedelta(days=1)
    return out


def comprobar(desde=None, hoy=None, escribir_web=True):
    hoy = hoy or datetime.date.today()
    estado = cargar_json(ESTADO, {"ultimaFecha": "2026-07-10", "conocidas": list(CONOCIDAS_INICIALES)})
    if desde:
        estado["ultimaFecha"] = (datetime.datetime.strptime(desde, "%Y%m%d").date() - datetime.timedelta(days=1)).isoformat()
    conocidas = set(estado.get("conocidas", [])) | set(CONOCIDAS_INICIALES)
    actual = leer_anexo_actual()
    nuevas = []
    revisadas = 0
    for f in fechas_pendientes(estado["ultimaFecha"], hoy):
        items = sumario(f)
        revisadas += 1
        for it in items:
            if it["identificador"] in conocidas or not es_convocatoria_escala_basica(it["titulo"]):
                continue
            texto = texto_documento(it["identificador"])
            fecha_pub = "%s-%s-%s" % (f[:4], f[4:6], f[6:])
            anexo = extraer_anexo_i(texto)
            cmp = comparar_temarios(actual, anexo) if anexo else {"iguales": 0, "renumerados": [], "modificados": [], "nuevos": [], "eliminados": [], "sinAnexo": True}
            nuevas.append(novedad(it, fecha_pub, datos_basicos(texto), cmp, hoy.isoformat()))
            conocidas.add(it["identificador"])
        estado["ultimaFecha"] = "%s-%s-%s" % (f[:4], f[4:6], f[6:])
    estado["conocidas"] = sorted(conocidas)
    estado["comprobacion"] = hoy.isoformat()
    guardar_json(ESTADO, estado)
    if nuevas:
        nov = cargar_json(NOVEDADES, {"items": []})
        ya = {i["id"] for i in nov["items"]}
        nov["items"] += [n for n in nuevas if n["id"] not in ya]
        guardar_json(NOVEDADES, nov)
        with open(RESUMEN_MD, "w", encoding="utf-8") as fh:
            fh.write("\n\n".join(resumen_markdown(n) for n in nuevas))
        if escribir_web:
            regenerar_web(nov["items"])
    elif os.path.exists(RESUMEN_MD):
        os.remove(RESUMEN_MD)
    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as fh:
            fh.write("nueva=%d\n" % (1 if nuevas else 0))
    return revisadas, nuevas


def regenerar_web(items):
    """Vuelve a escribir web/data/novedades.js con las novedades (incluida la convocatoria), conservando el resto."""
    sys.path.insert(0, AQUI)
    import vigilar_leyes  # noqa: E402
    previo = vigilar_leyes.leer_web()
    vigilar_leyes.escribir_web(items, (previo.get("comprobacion") or datetime.date.today().isoformat()).replace("-", ""),
                               previo.get("normasVigiladas", 0), previo.get("sinConsolidar", []), previo.get("otrasFuentes", 0), previo.get("errores", []))


def cmd_probar(boe_id):
    texto = texto_documento(boe_id)
    anexo = extraer_anexo_i(texto)
    cmp = comparar_temarios(leer_anexo_actual(), anexo)
    print("Temas en el Anexo I de %s: %d | iguales: %d | modificados: %d | nuevos: %d | eliminados: %d | renumerados: %d" % (
        boe_id, len(anexo), cmp["iguales"], len(cmp["modificados"]), len(cmp["nuevos"]), len(cmp["eliminados"]), len(cmp["renumerados"])))
    print(json.dumps(datos_basicos(texto), ensure_ascii=False, indent=1))
    for m in cmp["modificados"][:10]:
        print("  cambia el tema %d (parecido %.2f)" % (m["tema"], m["parecido"]))


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--desde", help="AAAAMMDD: volver a revisar los sumarios desde esa fecha")
    ap.add_argument("--probar", metavar="BOE-ID", help="compara el temario de esa disposición con el actual, sin guardar nada")
    args = ap.parse_args(argv)
    if args.probar:
        cmd_probar(args.probar)
        return
    revisadas, nuevas = comprobar(args.desde)
    print("Sumarios del BOE revisados: %d | convocatorias nuevas de Escala Básica: %d" % (revisadas, len(nuevas)))
    for n in nuevas:
        t = n["convocatoria"]["temario"]
        print("  %s (%s): plazas %s | temas modificados %d, nuevos %d, eliminados %d" % (
            n["norma"]["id"], n["publicacion"], n["convocatoria"].get("plazas"), len(t["modificados"]), len(t["nuevos"]), len(t["eliminados"])))


if __name__ == "__main__":
    main()
