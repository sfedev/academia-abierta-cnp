#!/usr/bin/env python
"""Convierte un examen oficial (cuestionario + plantilla de respuestas) en un fichero que la web importa.

Los exámenes oficiales NO se guardan en el repositorio: tú descargas el cuestionario y la plantilla (Portal del
Aspirante o donde los consigas), los conviertes con este script y los importas en la pestaña «Exámenes oficiales»
de la web, que los guarda solo en tu navegador.

Uso:
  python -I herramientas/importar_examen.py cuestionario.txt --plantilla plantilla.txt --codigo P43 \\
         --titulo "Escala Básica, 26/09/2026 (modelo A)" --fecha 2026-09-26
  (cuestionario y plantilla pueden ser .txt o .pdf; el PDF necesita `pypdf` instalado o `pdftotext` en el PATH;
   si no, copia el texto del PDF en un .txt)

Formato que entiende:
  - Preguntas numeradas al principio de línea: «1.», «1)», «1.-», «1 -». El texto puede ocupar varias líneas.
  - Opciones «a)», «A)», «a.», «a -» (tres por pregunta, como el examen real).
  - Plantilla con pares número-letra en cualquier disposición: «1 A», «1-b», «1.c», «1: A», «1A 2C 3B…»,
    y «ANULADA», «*» o «X» para las preguntas anuladas.

Salida: examenes/<codigo>.json (la carpeta examenes/ está en .gitignore). Con el tema estimado de cada pregunta
(por parecido con las fichas) para poder ver los aciertos por bloque; es una estimación y se puede omitir con
--sin-temas.
"""
import argparse
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, "examenes")
FORMATO = "academia-abierta-examen-v1"

RE_PREGUNTA = re.compile(r"^\s*(\d{1,3})\s*(?:\.-|\.|\)|-)\s*(.*)$")
RE_OPCION = re.compile(r"^\s*([a-cA-C])\s*(?:\)|\.|-)\s+(.*)$")
RE_RUIDO = re.compile(r"^\s*(?:p[aá]gina\s+\d+(?:\s+de\s+\d+)?|modelo\s+[a-d]\b.*|hoja\s+\d+.*|\d+\s*/\s*\d+)\s*$", re.I)
RE_PAR_PLANTILLA = re.compile(r"(?<!\d)(\d{1,3})\s*[-.:)]?\s*(ANULADA|anulada|Anulada|[abcABC](?![a-zA-Z])|\*|X(?![a-zA-Z]))")


# ---------------------------------------------------------------- lectura de ficheros
def leer_texto(ruta):
    if not ruta.lower().endswith(".pdf"):
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return f.read()
    try:
        import pypdf  # opcional
        return "\n".join((p.extract_text() or "") for p in pypdf.PdfReader(ruta).pages)
    except ImportError:
        pass
    if shutil.which("pdftotext"):
        r = subprocess.run(["pdftotext", "-layout", ruta, "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0:
            return r.stdout
    raise SystemExit("No puedo leer el PDF: instala pypdf (pip install pypdf), instala pdftotext, o copia el texto del PDF en un .txt")


# ---------------------------------------------------------------- cuestionario
def limpiar(s):
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def parsear_cuestionario(texto):
    """[{n, enunciado, opciones[3]}]. Una línea que empieza por número solo abre pregunta si es la siguiente."""
    preguntas, actual, destino = [], None, None
    esperado = 1
    for linea in texto.splitlines():
        if not linea.strip() or RE_RUIDO.match(linea):
            continue
        m = RE_PREGUNTA.match(linea)
        if m and int(m.group(1)) == esperado:
            actual = {"n": esperado, "enunciado": m.group(2), "opciones": []}
            preguntas.append(actual)
            destino = "enunciado"
            esperado += 1
            continue
        o = RE_OPCION.match(linea)
        if actual is not None and o and len(actual["opciones"]) < 3 and "abc"[len(actual["opciones"])] == o.group(1).lower():
            actual["opciones"].append(o.group(2))
            destino = "opcion"
            continue
        if actual is None:
            continue  # cabecera del cuestionario
        if destino == "opcion":
            actual["opciones"][-1] += " " + linea.strip()
        else:
            actual["enunciado"] += " " + linea.strip()
    for p in preguntas:
        p["enunciado"] = limpiar(p["enunciado"])
        p["opciones"] = [limpiar(x) for x in p["opciones"]]
    return preguntas


def parsear_plantilla(texto):
    """{número: 0|1|2 o None si está anulada}."""
    out = {}
    for n, v in RE_PAR_PLANTILLA.findall(texto):
        n = int(n)
        if n in out:
            continue
        out[n] = None if v.upper() in ("ANULADA", "*", "X") else "abc".index(v.lower())
    return out


# ---------------------------------------------------------------- tema estimado
def _palabras(s):
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return [w for w in re.findall(r"[a-zñ0-9/]{4,}", s) if w not in VACIAS]


VACIAS = set("""cual cuales cuando segun sobre entre todos todas tiene tienen como para pero desde hasta este esta estos
estas otro otra otros otras dicho dicha debera deberan podra podran sera seran sido esta estan sera solo siempre nunca
ninguna ninguno siguiente siguientes senale afirmacion correcta incorrecta respuesta articulo articulos establece
dispone indica respecto mediante caso casos parte partes forma lugar plazo""".split())


def modelo_temas(carpeta=None):
    """{tema: {palabra: peso tf-idf}} a partir de las fichas (título, epígrafe oficial, normas, clave, resumen)."""
    carpeta = carpeta or os.path.join(RAIZ, "datos", "temas")
    meta = {}
    p_meta = os.path.join(RAIZ, "datos", "meta.json")
    if os.path.exists(p_meta):
        with open(p_meta, encoding="utf-8") as f:
            meta = {t["tema"]: t for t in json.load(f)["temas"]}
    docs = {}
    for p in sorted(glob.glob(os.path.join(carpeta, "tema-*.json"))):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        partes = [d.get("titulo", ""), meta.get(d["tema"], {}).get("oficial", "")]
        partes += [n.get("nombre", "") for n in d.get("normas", [])]
        partes += d.get("clave", []) + [s.get("titulo", "") + " " + " ".join(s.get("puntos", [])) for s in d.get("resumen", [])]
        partes += [q.get("enunciado", "") for q in d.get("preguntas", [])]
        docs[d["tema"]] = _palabras(" ".join(partes))
    df = {}
    for ws in docs.values():
        for w in set(ws):
            df[w] = df.get(w, 0) + 1
    n = len(docs) or 1
    modelo = {}
    for t, ws in docs.items():
        tf = {}
        for w in ws:
            tf[w] = tf.get(w, 0) + 1
        modelo[t] = {w: (1 + math.log(c)) * math.log(1 + n / df[w]) for w, c in tf.items()}
    return modelo


def estimar_tema(texto, modelo, minimo=1.5):
    """(tema, puntuación) del tema más parecido, o (None, 0) si ninguno destaca."""
    ws = set(_palabras(texto))
    if not ws or not modelo:
        return None, 0.0
    puntos = sorted(((sum(m.get(w, 0) for w in ws), t) for t, m in modelo.items()), reverse=True)
    mejor, t = puntos[0]
    segundo = puntos[1][0] if len(puntos) > 1 else 0
    if mejor < minimo or mejor < segundo * 1.1:
        return None, round(mejor, 2)
    return t, round(mejor, 2)


# ---------------------------------------------------------------- examen
def construir(cuestionario, plantilla, codigo, titulo="", fecha="", fuente="", modelo=None):
    """Devuelve (examen, errores). Los errores impiden importarlo (salvo --forzar)."""
    preguntas = parsear_cuestionario(cuestionario)
    claves = parsear_plantilla(plantilla)
    errores = []
    out = []
    for p in preguntas:
        if len(p["opciones"]) != 3:
            errores.append("Pregunta %d: se leen %d opciones (deben ser 3)." % (p["n"], len(p["opciones"])))
        if p["n"] not in claves:
            errores.append("Pregunta %d: no está en la plantilla." % p["n"])
        q = {"n": p["n"], "enunciado": p["enunciado"], "opciones": p["opciones"], "correcta": claves.get(p["n"]),
             "anulada": p["n"] in claves and claves[p["n"]] is None}
        if modelo is not None:
            q["tema"], q["temaPuntos"] = estimar_tema(p["enunciado"] + " " + " ".join(p["opciones"]), modelo)
        out.append(q)
    sobran = sorted(set(claves) - {p["n"] for p in preguntas})
    if sobran:
        errores.append("La plantilla tiene respuestas para preguntas que no están en el cuestionario: %s." % ", ".join(map(str, sobran[:10])))
    if not preguntas:
        errores.append("No se ha encontrado ninguna pregunta numerada.")
    examen = {"formato": FORMATO, "codigo": codigo, "titulo": titulo or codigo, "fecha": fecha, "fuente": fuente,
              "preguntas": out, "validas": sum(1 for q in out if not q["anulada"])}
    return examen, errores


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cuestionario")
    ap.add_argument("--plantilla", required=True, help="fichero con las respuestas correctas")
    ap.add_argument("--codigo", required=True, help="identificador corto, p. ej. P43")
    ap.add_argument("--titulo", default="")
    ap.add_argument("--fecha", default="", help="AAAA-MM-DD")
    ap.add_argument("--fuente", default="", help="de dónde sale (para tu referencia)")
    ap.add_argument("--salida", help="fichero de salida (por defecto examenes/<codigo>.json)")
    ap.add_argument("--sin-temas", action="store_true", help="no estimar el tema de cada pregunta")
    ap.add_argument("--forzar", action="store_true", help="escribir el fichero aunque haya errores")
    args = ap.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,20}", args.codigo):
        raise SystemExit("El código solo puede tener letras, números, - y _ (máximo 20).")
    modelo = None if args.sin_temas else modelo_temas()
    examen, errores = construir(leer_texto(args.cuestionario), leer_texto(args.plantilla), args.codigo, args.titulo, args.fecha, args.fuente, modelo)
    for e in errores[:30]:
        print("ERROR: " + e)
    if errores and not args.forzar:
        raise SystemExit("No se ha escrito nada (%d errores). Revisa el texto o usa --forzar." % len(errores))
    salida = args.salida or os.path.join(SALIDA, args.codigo + ".json")
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump(examen, f, ensure_ascii=False, indent=1)
    con_tema = sum(1 for q in examen["preguntas"] if q.get("tema"))
    print("Examen %s: %d preguntas (%d válidas, %d anuladas)%s -> %s" % (
        args.codigo, len(examen["preguntas"]), examen["validas"], len(examen["preguntas"]) - examen["validas"],
        ("; tema estimado en %d" % con_tema) if modelo is not None else "", os.path.relpath(salida)))
    print("Impórtalo en la web: pestaña «Exámenes oficiales» > «Importar examen». Solo se guarda en tu navegador.")


if __name__ == "__main__":
    main()
