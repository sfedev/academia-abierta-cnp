#!/usr/bin/env python
"""Valida los ficheros datos/temas/tema-NN.json.

Uso:  python -I herramientas/validar_tema.py datos/temas/tema-14.json [otro.json ...]

Sale con código 1 si hay ERRORES. Los AVISOS no bloquean, pero conviene leerlos.

Cada pregunta y tarjeta debe tener un `id` (q_NN_01 / t_NN_01) único en toda la aplicación: si pasas varias
fichas a la vez, también se comprueba que no se repitan entre ficheros. Los asigna herramientas/migrar_ids.py.
"""
import json
import re
import sys
from collections import Counter

BLOQUES = {range(1, 27): "A", range(27, 38): "B", range(38, 46): "C"}
PESOS = {"alto", "medio", "bajo"}
PROHIBIDAS = ["todas las anteriores", "ninguna de las anteriores", "todas son correctas", "ninguna es correcta"]


def bloque_de(n):
    for r, b in BLOQUES.items():
        if n in r:
            return b
    return None


def palabras(s):
    return len(re.findall(r"\w+", s, flags=re.UNICODE))


def validar(path):
    err, avi = [], []
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except Exception as e:  # noqa: BLE001
        return ["JSON no válido: %s" % e], [], {}

    def need(cond, msg):
        if not cond:
            err.append(msg)

    def warn(cond, msg):
        if not cond:
            avi.append(msg)

    def texto_ok(s, donde):
        if not isinstance(s, str) or not s.strip():
            err.append("%s: texto vacío o no es cadena" % donde)
            return
        if re.search(r"<[a-zA-Z/][^>]*>", s):
            err.append("%s: contiene HTML (solo se admite **negrita**): %s" % (donde, s[:60]))
        if s.count("**") % 2:
            err.append("%s: '**' sin cerrar: %s" % (donde, s[:60]))

    t = d.get("tema")
    need(isinstance(t, int) and 1 <= t <= 45, "tema debe ser un entero 1-45")
    if isinstance(t, int):
        need(d.get("bloque") == bloque_de(t), "bloque debe ser %s para el tema %s" % (bloque_de(t), t))
        m = re.search(r"tema-(\d+)\.json$", path.replace("\\", "/"))
        if m:
            need(int(m.group(1)) == t, "el nombre del fichero no coincide con 'tema'")
    need(isinstance(d.get("titulo"), str) and 3 <= len(d["titulo"]) <= 90, "titulo (3-90 caracteres)")
    need(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(d.get("actualizado", ""))), "actualizado con formato AAAA-MM-DD")

    peso = d.get("peso", {})
    need(peso.get("nivel") in PESOS, "peso.nivel debe ser alto|medio|bajo")
    texto_ok(peso.get("nota", ""), "peso.nota")

    normas = d.get("normas", [])
    need(isinstance(normas, list) and len(normas) >= 1, "normas: al menos 1")
    for i, n in enumerate(normas):
        need(isinstance(n, dict) and n.get("nombre") and n.get("url"), "normas[%d]: faltan nombre/url" % i)
        need(str(n.get("url", "")).startswith("https://"), "normas[%d].url debe ser https" % i)
        warn(n.get("verificado"), "normas[%d]: falta 'verificado' (fecha de consolidación leída con boe.py)" % i)

    res = d.get("resumen", [])
    need(isinstance(res, list) and len(res) >= 3, "resumen: al menos 3 secciones")
    total_pal = 0
    amp_pal = 0
    for i, s in enumerate(res):
        antes = total_pal
        texto_ok(s.get("titulo", ""), "resumen[%d].titulo" % i)
        pts = s.get("puntos", [])
        need(isinstance(pts, list) and len(pts) >= 2, "resumen[%d].puntos: al menos 2" % i)
        for j, p in enumerate(pts):
            texto_ok(p, "resumen[%d].puntos[%d]" % (i, j))
            total_pal += palabras(p) if isinstance(p, str) else 0
        tb = s.get("tabla")
        if tb is not None:
            cab, filas = tb.get("cabecera"), tb.get("filas")
            need(isinstance(cab, list) and isinstance(filas, list) and filas, "resumen[%d].tabla mal formada" % i)
            if isinstance(cab, list) and isinstance(filas, list):
                for k, fila in enumerate(filas):
                    need(isinstance(fila, list) and len(fila) == len(cab), "resumen[%d].tabla fila %d no cuadra con la cabecera" % (i, k))
                    for c in fila if isinstance(fila, list) else []:
                        texto_ok(c, "resumen[%d].tabla" % i)
                        total_pal += palabras(c) if isinstance(c, str) else 0
    nivel = peso.get("nivel")
    for sec in res:
        if isinstance(sec, dict) and sec.get("ampliado") is True:
            n_sec = sum(palabras(x) for x in sec.get("puntos", []) if isinstance(x, str))
            tb2 = sec.get("tabla") or {}
            n_sec += sum(palabras(c) for f in tb2.get("filas", []) if isinstance(f, list) for c in f if isinstance(c, str))
            amp_pal += n_sec
    total_pal -= amp_pal
    minimo = {"alto": 700, "medio": 450, "bajo": 300}.get(nivel, 300)
    warn(total_pal >= minimo, "resumen corto (%d palabras; para peso %s se esperan >= %d)" % (total_pal, nivel, minimo))
    warn(total_pal <= 2600, "resumen largo (%d palabras): recorta a lo esencial" % total_pal)

    clave = d.get("clave", [])
    need(isinstance(clave, list) and 6 <= len(clave) <= 14, "clave: entre 6 y 14 elementos (%d)" % len(clave))
    for i, c in enumerate(clave):
        texto_ok(c, "clave[%d]" % i)
    trampas = d.get("trampas", [])
    need(isinstance(trampas, list) and 4 <= len(trampas) <= 10, "trampas: entre 4 y 10 elementos (%d)" % len(trampas))
    for i, c in enumerate(trampas):
        texto_ok(c, "trampas[%d]" % i)

    for k in ("caido", "novedades", "dudas", "mnemotecnias"):
        if k in d:
            need(isinstance(d[k], list), "%s debe ser una lista" % k)
    for i, c in enumerate(d.get("caido", [])):
        need(isinstance(c, dict) and c.get("examen") and c.get("concepto"), "caido[%d]: faltan examen/concepto" % i)
    for i, c in enumerate(d.get("mnemotecnias", [])):
        texto_ok(c if isinstance(c, str) else "", "mnemotecnias[%d]" % i)

    # `id` obligatorio: la web guarda el progreso del usuario con él. Formato q_NN_01 (preguntas) y t_NN_01
    # (tarjetas), con NN = número de tema; los asigna herramientas/migrar_ids.py.
    def comprobar_id(obj, donde, prefijo, vistos_ids):
        i = obj.get("id")
        if i is None:
            err.append("%s: falta 'id' (ejecuta python -I herramientas/migrar_ids.py %s)" % (donde, path))
            return
        formato = "%s_%02d_01" % (prefijo, t if isinstance(t, int) else 0)
        patron = r"%s_%02d_\d{2,}" % (prefijo, t if isinstance(t, int) else 0)
        need(isinstance(i, str) and re.fullmatch(patron, i), "%s: id %r no válido (formato %s, con el número de tema)" % (donde, i, formato))
        need(i not in vistos_ids, "%s: id repetido (%s)" % (donde, i))
        vistos_ids.add(i)

    tar = d.get("tarjetas", [])
    need(isinstance(tar, list) and 10 <= len(tar) <= 24, "tarjetas: entre 10 y 24 (%d)" % len(tar))
    ids_t = set()
    for i, c in enumerate(tar):
        need(isinstance(c, dict), "tarjetas[%d] no es objeto" % i)
        if isinstance(c, dict):
            texto_ok(c.get("p", ""), "tarjetas[%d].p" % i)
            texto_ok(c.get("r", ""), "tarjetas[%d].r" % i)
            comprobar_id(c, "tarjetas[%d]" % i, "t", ids_t)

    pre = d.get("preguntas", [])
    # Los temas con secciones «ampliado» (detalle de trampa fina) admiten hasta 30: las de dificultad 3 salen de ahí
    con_amp = any(isinstance(s, dict) and s.get("ampliado") is True for s in res)
    tope = 30 if con_amp else 24
    need(isinstance(pre, list) and 15 <= len(pre) <= tope,
         "preguntas: entre 15 y 24, o hasta 30 si el tema tiene secciones ampliadas (%d)" % len(pre))
    pos = Counter()
    vistos = set()
    ids_p = set()
    for i, q in enumerate(pre):
        w = "preguntas[%d]" % i
        if not isinstance(q, dict):
            err.append("%s no es objeto" % w)
            continue
        comprobar_id(q, w, "q", ids_p)
        texto_ok(q.get("enunciado", ""), w + ".enunciado")
        ops = q.get("opciones")
        need(isinstance(ops, list) and len(ops) == 3, "%s: debe tener exactamente 3 opciones" % w)
        if isinstance(ops, list):
            for j, o in enumerate(ops):
                texto_ok(o, "%s.opciones[%d]" % (w, j))
                if isinstance(o, str):
                    for pr in PROHIBIDAS:
                        need(pr not in o.lower(), "%s: opción con '%s' (prohibido)" % (w, pr))
            need(len(set(map(str, ops))) == len(ops), "%s: opciones repetidas" % w)
        c = q.get("correcta")
        need(type(c) is int and c in (0, 1, 2), "%s: correcta debe ser 0, 1 o 2" % w)  # true/false no valen
        if type(c) is int and c in (0, 1, 2):
            pos[c] += 1
        e = q.get("explicacion", "")
        texto_ok(e, w + ".explicacion")
        warn(isinstance(e, str) and palabras(e) >= 12, "%s: explicación demasiado corta" % w)
        if isinstance(e, str) and re.search(r"(opci[oó]n|respuesta|alternativa)\s+(a|b|c)\b|(?<![\w])[abc]\)", e, flags=re.I):
            avi.append("%s: la explicación cita una letra (A/B/C); la web baraja las opciones, descríbelas por su contenido" % w)
        need(isinstance(q.get("ref"), str) and q["ref"].strip(), "%s: falta 'ref' (artículo/apartado/fuente)" % w)
        need(type(q.get("dificultad")) is int and q["dificultad"] in (1, 2, 3), "%s: dificultad 1-3" % w)
        en = str(q.get("enunciado", "")).strip().lower()
        need(en not in vistos, "%s: enunciado repetido" % w)
        vistos.add(en)
    if pre and sum(pos.values()):
        n = sum(pos.values())
        for k in (0, 1, 2):
            warn(pos[k] / n >= 0.2, "posición correcta %s infrarrepresentada (%d de %d): reparte mejor" % ("abc"[k], pos[k], n))
    stats = {"palabras": total_pal, "ampliacion": amp_pal, "preguntas": len(pre), "tarjetas": len(tar), "correctas": dict(pos)}
    return err, avi, stats


def ids_de(path):
    """Ids de preguntas y tarjetas de una ficha (vacío si el JSON no es válido)."""
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return [e["id"] for k in ("preguntas", "tarjetas") for e in d.get(k, []) if isinstance(e, dict) and isinstance(e.get("id"), str)]
    except Exception:  # noqa: BLE001
        return []


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    try:  # la salida lleva acentos: que no dependa de la página de códigos de la consola (cp1252 en Windows)
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    if not argv:
        print(__doc__)
        return 1
    fallo = False
    donde = {}  # id -> fichero donde se vio por primera vez
    for p in argv:
        err, avi, stats = validar(p)
        for i in ids_de(p):  # los ids deben ser únicos en toda la aplicación, no solo dentro de una ficha
            if i in donde and donde[i] != p:
                err.append("id %s repetido en %s y %s" % (i, donde[i], p))
            donde.setdefault(i, p)
        print("== %s  %s" % (p, stats))
        for e in err:
            print("  ERROR: " + e)
        for a in avi:
            print("  aviso: " + a)
        if err:
            fallo = True
        elif not avi:
            print("  OK")
    return 1 if fallo else 0


if __name__ == "__main__":
    sys.exit(main())
