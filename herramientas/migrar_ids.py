#!/usr/bin/env python
"""Asigna ids secuenciales y estables a las preguntas y tarjetas de las fichas.

Formato: preguntas `q_NN_01`, `q_NN_02`...; tarjetas `t_NN_01`... (NN = número de tema a dos dígitos).

Por qué: la web guarda el progreso de cada usuario (aciertos, fallos, tarjetas por repasar) con el id de cada
pregunta y tarjeta. Si el id dependiera del texto, corregir una errata borraría el historial. Con un id fijo en la
ficha, el texto se puede editar libremente.

Uso:
  python -I herramientas/migrar_ids.py                       # asigna los que falten en las 45 fichas
  python -I herramientas/migrar_ids.py datos/temas/tema-23.json [otro.json ...]
  python -I herramientas/migrar_ids.py --comprobar           # solo lista lo que falta (salida 1 si falta algo)

Reglas:
- Un elemento que ya tiene un id con el formato nuevo no se toca nunca.
- Los que no tienen id, o tienen uno antiguo (el hash que se usó en la primera versión), reciben el siguiente
  número libre de su lista (máximo + 1). En una ficha sin ningún id nuevo, la numeración sale por orden de aparición.
- Los números no se reutilizan: si quitas una pregunta, su número queda libre y no se reasigna a otra.
- Si el SENTIDO de una pregunta cambia (otra respuesta correcta), dale un id nuevo borrando el suyo y volviendo a
  ejecutar este script; así el historial antiguo no cuenta como acierto de la versión nueva.
- Solo inserta o sustituye el campo `id` en el texto: no reformatea nada más, y comprueba antes de escribir que
  el resto del JSON es idéntico.

La web migra sola el progreso guardado con los ids antiguos (hash del texto) a los ids nuevos la primera vez que
se abre (ver web/js/store.js).
"""
import glob
import json
import os
import re
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LISTAS = {"preguntas": "q", "tarjetas": "t"}  # lista -> prefijo del id


def patron_id(prefijo, tema):
    return re.compile(r"%s_%02d_(\d{2,})" % (prefijo, tema))


def nuevo_id(prefijo, tema, n):
    return "%s_%02d_%02d" % (prefijo, tema, n)


def elementos(txt):
    """Para cada lista (primer nivel del JSON), por elemento: posición de su '{' y, si lo tiene, span del valor de `id`."""
    res = {k: [] for k in LISTAS}
    depth, i, n = 0, 0, len(txt)
    ultima, clave, lista, esperando_id = None, None, None, False
    while i < n:
        c = txt[i]
        if c == '"':
            j = i + 1
            while txt[j] != '"':
                j += 2 if txt[j] == "\\" else 1
            if esperando_id:
                res[lista][-1]["id"] = (i + 1, j)
                esperando_id = False
            ultima = txt[i + 1:j]
            i = j
        elif c == ":":
            if depth == 1:
                clave = ultima
            elif depth == 3 and lista and ultima == "id":
                esperando_id = True
        elif c == "[":
            depth += 1
            if depth == 2 and clave in res:
                lista = clave
        elif c == "{":
            depth += 1
            if depth == 3 and lista:
                res[lista].append({"ini": i, "id": None})
        elif c in "]}":
            depth -= 1
            if c == "]" and depth == 1:
                lista = None
        i += 1
    return res


def sin_ids(datos):
    out = {}
    for k, v in datos.items():
        if k in LISTAS:
            out[k] = [{a: b for a, b in e.items() if a != "id"} for e in v]
        else:
            out[k] = v
    return out


def procesar(path, escribir):
    """Devuelve cuántos ids se asignan (o se asignarían con escribir=False)."""
    with open(path, encoding="utf-8", newline="") as f:
        txt = f.read()
    datos = json.loads(txt)
    tema = datos["tema"]
    pos = elementos(txt)
    ediciones = []  # (posición, longitud a quitar, texto a poner)
    pendientes = 0
    for lista, pref in LISTAS.items():
        elems = datos.get(lista, [])
        if len(elems) != len(pos[lista]):
            raise SystemExit("%s: no se localizan bien los elementos de «%s»" % (path, lista))
        pat = patron_id(pref, tema)
        usados = [int(m.group(1)) for e in elems if isinstance(e.get("id"), str) for m in [pat.fullmatch(e["id"])] if m]
        siguiente = max(usados, default=0)
        for e, p in zip(elems, pos[lista]):
            if isinstance(e.get("id"), str) and pat.fullmatch(e["id"]):
                continue
            pendientes += 1
            siguiente += 1
            nuevo = nuevo_id(pref, tema, siguiente)
            if p["id"] is not None:  # id antiguo: se sustituye el valor
                a, b = p["id"]
                ediciones.append((a, b - a, nuevo))
            else:  # sin id: se inserta justo después de '{', con la misma separación que tenga la primera clave
                ws = re.match(r"\s*", txt[p["ini"] + 1:]).group(0)
                ediciones.append((p["ini"] + 1, 0, '%s"id": "%s",' % (ws, nuevo)))
    if not pendientes or not escribir:
        return pendientes
    nuevo_txt = txt
    for a, largo, nuevo in sorted(ediciones, reverse=True):
        nuevo_txt = nuevo_txt[:a] + nuevo + nuevo_txt[a + largo:]
    despues = json.loads(nuevo_txt)
    if sin_ids(despues) != sin_ids(datos):
        raise SystemExit("%s: la edición alteraría el contenido; no se escribe" % path)
    for lista, pref in LISTAS.items():
        ids = [e["id"] for e in despues[lista]]
        if len(set(ids)) != len(ids):
            raise SystemExit("%s: ids repetidos en «%s»; no se escribe" % (path, lista))
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(nuevo_txt)
    return pendientes


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    args = [a for a in argv if not a.startswith("--")]
    solo_comprobar = "--comprobar" in argv
    ficheros = args or sorted(glob.glob(os.path.join(RAIZ, "datos", "temas", "tema-*.json")))
    total = 0
    for p in ficheros:
        n = procesar(p, not solo_comprobar)
        total += n
        if n:
            print("%s: %s %d" % (os.path.relpath(p, RAIZ), "faltan" if solo_comprobar else "ids asignados:", n))
    print("%s %d ids" % ("Faltan" if solo_comprobar else "Asignados", total))
    return 1 if (solo_comprobar and total) else 0


if __name__ == "__main__":
    sys.exit(main())
