#!/usr/bin/env python
"""Ensambla web/data/datos.js a partir de datos/meta.json + datos/temas/*.json + fuentes/pesos-por-tema.json.

Uso:  python -I herramientas/build.py
"""
import glob
import json
import os
import re
import sys
import datetime

ROOT = os.getcwd()


def leer(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def comprobar_ids(temas):
    """La web guarda el progreso con el `id` de cada pregunta y tarjeta: deben existir y ser únicos en toda la app."""
    vistos, errores = {}, []
    for n, d in temas.items():
        for lista, pref in (("preguntas", "q"), ("tarjetas", "t")):
            for i, e in enumerate((d or {}).get(lista, [])):
                ident = e.get("id")
                donde = "tema %d, %s[%d]" % (n, lista, i)
                if not re.fullmatch(r"%s_%02d_\d{2,}" % (pref, n), str(ident or "")):
                    errores.append("%s: id %r no válido (formato %s_%02d_01)" % (donde, ident, pref, n))
                elif ident in vistos:
                    errores.append("%s: id %s repetido (ya en %s)" % (donde, ident, vistos[ident]))
                else:
                    vistos[ident] = donde
    if errores:
        raise SystemExit("ERROR en los ids (ejecuta python -I herramientas/migrar_ids.py):\n  " + "\n  ".join(errores[:20]))
    return len(vistos)


def anadir_auditoria(temas, ruta="datos/auditoria.json"):
    """Copia a cada pregunta su estado de verificación (datos/auditoria.json, de auditar_preguntas.py).

    Solo si la pregunta no ha cambiado desde la auditoría (misma huella): si se editó después, no lleva
    insignia hasta que se vuelva a auditar. Devuelve el resumen para la web (o None si no hay auditoría)."""
    if not os.path.exists(ruta):
        return None
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import auditar_preguntas  # noqa: E402
    aud = leer(ruta)
    estados = aud.get("preguntas", {})
    vigentes = {}
    for d in temas.values():
        for q in d.get("preguntas", []):
            r = estados.get(q.get("id"))
            if not r or r.get("huella") != auditar_preguntas.huella(q):
                continue
            q["verif"] = {"e": r["estado"]}
            if r["estado"] == "revisada":
                q["verif"]["por"] = (r.get("revision") or {}).get("por", "persona")
            vigentes[r["estado"]] = vigentes.get(r["estado"], 0) + 1
    return {"fecha": aud.get("generado"), "resumen": vigentes}


def main():
    dir_temas = "datos/temas"
    out = "web/data/datos.js"
    args = sys.argv[1:]
    if "--dir" in args:
        dir_temas = args[args.index("--dir") + 1]
    if "--out" in args:
        out = args[args.index("--out") + 1]
    meta = leer("datos/meta.json")
    pesos = {x["tema"]: x for x in leer("fuentes/pesos-por-tema.json")}
    temas = {}
    sin_datos = []
    for t in meta["temas"]:
        n = t["tema"]
        p = os.path.join(dir_temas, "tema-%02d.json" % n)
        peso = pesos.get(n, {})
        if not os.path.exists(p):
            sin_datos.append(n)
            temas[n] = None
            continue
        d = leer(p)
        d.setdefault("peso", {})
        d["peso"]["nivel"] = peso.get("peso", d["peso"].get("nivel", "medio"))
        d["peso"]["media"] = peso.get("preguntasMedia")
        d["peso"]["confianza"] = peso.get("confianza")
        d["peso"].setdefault("nota", peso.get("nota", ""))
        temas[n] = d
    comprobar_ids({k: v for k, v in temas.items() if v})
    meta["auditoria"] = anadir_auditoria({k: v for k, v in temas.items() if v})
    # Requisitos, calendario, idioma y psicotécnicos de la convocatoria (pestañas Proceso, Psicotécnicos y Panel)
    meta["proceso"] = leer("datos/proceso.json") if os.path.exists("datos/proceso.json") else None
    # el peso también va en meta (para el temario aunque falte contenido)
    for t in meta["temas"]:
        pe = pesos.get(t["tema"], {})
        t["peso"] = pe.get("peso", "medio")
        t["media"] = pe.get("preguntasMedia")
    meta["generado"] = datetime.date.today().isoformat()
    meta["resumen"] = {
        "temasConContenido": sum(1 for v in temas.values() if v),
        "preguntas": sum(len(v.get("preguntas", [])) for v in temas.values() if v),
        "tarjetas": sum(len(v.get("tarjetas", [])) for v in temas.values() if v),
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* Generado por herramientas/build.py: no editar a mano. */\n")
        f.write("window.AA_META=" + json.dumps(meta, ensure_ascii=True, separators=(",", ":")) + ";\n")
        f.write("window.AA_TEMAS=" + json.dumps({str(k): v for k, v in temas.items() if v}, ensure_ascii=True, separators=(",", ":")) + ";\n")
    size = os.path.getsize(out)
    print("%s: %d KB, %s" % (out, size // 1024, meta["resumen"]))
    if sin_datos:
        print("Temas sin contenido todavía:", sin_datos)


if __name__ == "__main__":
    main()
