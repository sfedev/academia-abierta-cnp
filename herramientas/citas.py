"""Qué artículos de qué normas cita cada ficha (lo usa vigilar_leyes.py para avisar solo donde importa).

Las fichas citan los artículos en texto libre («art. 49», «arts. 156 a 158», «art. 17.2 CE», «art. 5 de la
Ley 4/2023»). Aquí se extraen esos números y se atribuyen a la norma a la que pertenecen cuando la ficha lo
dice a continuación del número («art. 17.2 CE», «arts. 6.2 y 8 LO 3/2007»). Si no se puede saber de qué norma
es una cita, se atribuye a TODAS las normas de la ficha: esta herramienta puede avisar de más, nunca de menos.

Sin dependencias: solo biblioteca estándar.
"""
import re

# «art. 7», «arts. 7», «artículo 7», «artículos 7»
RE_ART = re.compile(r"\b(?:arts?\.|art[ií]culos?)\s*(?=\d)", re.I)
# 49, 36.5, 36.5.a, 7 bis, 7.º
RE_NUM = re.compile(r"(\d{1,4})(?:\.\d+)*(?:\.?\s?[ºª°])?(?:\s*(?:bis|ter|qu[aá]ter|quinquies))?(?:\.[a-z]\b)?", re.I)
# separadores entre números de una misma cita: «17, 18», «17 y 18», «17-20», «17 a 20»
RE_SEP = re.compile(r"\s*(?:,|;|-|–|—|\by\b|\be\b|\bal?\b)\s*(?=\d)", re.I)
RE_RANGO = re.compile(r"\s*(?:-|–|—|al?\b)", re.I)

# Notas de la ficha que hablan de reformas: no cuentan como «citas» de la ficha.
NO_CUENTAN = ("novedades", "dudas", "verificado")

# Abreviaturas habituales según lo que diga el nombre de la norma en la ficha.
ABREVIATURAS = [
    (re.compile(r"Constituci[oó]n Espa", re.I), ["CE", "Constitución"]),
    (re.compile(r"C[oó]digo Penal|Ley Org[aá]nica 10/1995", re.I), ["CP"]),
    (re.compile(r"C[oó]digo Civil", re.I), ["CC"]),
    (re.compile(r"Enjuiciamiento Criminal", re.I), ["LECrim"]),
    (re.compile(r"Enjuiciamiento Civil", re.I), ["LEC"]),
    (re.compile(r"Poder Judicial", re.I), ["LOPJ"]),
    (re.compile(r"Estatuto B[aá]sico del Empleado", re.I), ["TREBEP", "EBEP"]),
    (re.compile(r"Ley General de la Seguridad Social", re.I), ["LGSS"]),
    (re.compile(r"Funcionamiento de la Uni[oó]n Europea", re.I), ["TFUE"]),
    (re.compile(r"Tratado de la Uni[oó]n Europea", re.I), ["TUE"]),
]

# Lo que puede haber entre el número de artículo y el nombre de la norma: «de la Ley 4/2023», «(LO 3/2007)»…
CABEZA = (r"[\s,(]*(?:(?:de|del|en)\s+(?:la\s+|el\s+)?|la\s+|el\s+)?"
          r"(?:Ley\s+Org[aá]nica\s+|Ley\s+|Real\s+Decreto\s+Legislativo\s+|Real\s+Decreto-ley\s+|Real\s+Decreto\s+|LO\s+|RDLeg\s+|RDL\s+|RD\s+)?")


def textos(o):
    """Todas las cadenas de una ficha salvo las notas sobre reformas."""
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from textos(x)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in NO_CUENTAN:
                yield from textos(v)


def secuencias(texto):
    """Cada cita «art(s). …» del texto: (números de artículo, texto que la sigue hasta la siguiente cita o frase)."""
    for m in RE_ART.finditer(texto):
        pos, prev, rango, nums = m.end(), None, False, set()
        while True:
            n = RE_NUM.match(texto, pos)
            if not n:
                break
            v = int(n.group(1))
            if rango and prev is not None and prev < v <= prev + 500:
                nums.update(range(prev, v + 1))
            else:
                nums.add(v)
            prev, pos = v, n.end()
            sep = RE_SEP.match(texto, pos)
            if not sep:
                break
            rango = bool(RE_RANGO.match(sep.group(0)))
            pos = sep.end()
        if not nums:
            continue
        ventana = texto[pos:pos + 60]
        sig = RE_ART.search(ventana)
        if sig:
            ventana = ventana[:sig.start()]
        ventana = re.split(r"[;\n]|\.\s", ventana)[0]
        yield nums, ventana


def articulos_citados(texto):
    """Números de artículo que aparecen en un texto, sin distinguir la norma."""
    out = set()
    for nums, _ in secuencias(texto):
        out |= nums
    return out


def alias_de(norma):
    """Formas en que la ficha puede nombrar esa norma tras un número de artículo (None si no hay ninguna)."""
    nombre = str(norma.get("nombre", ""))
    al = set(re.findall(r"(?<![\d/])(\d{1,4}/\d{4})(?!\d)", nombre))
    al.update(re.findall(r"\(([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚ]{1,9})\)", nombre))
    for rx, abrev in ABREVIATURAS:
        if rx.search(nombre):
            al.update(abrev)
    if not al:
        return None
    partes = []
    for a in sorted(al):
        if re.fullmatch(r"\d{1,4}/\d{4}", a):
            partes.append(r"(?<![\d/])%s(?!\d)" % re.escape(a))
        else:
            partes.append(r"\b%s\b" % re.escape(a))
    return re.compile("^" + CABEZA + "(?:" + "|".join(partes) + ")")


def citados_por_norma(ficha):
    """{id BOE de cada norma de la ficha: números de artículo que la ficha puede citar de esa norma}."""
    normas = ficha.get("normas", [])
    rxs = [alias_de(n) for n in normas]
    por_norma = [set() for _ in normas]
    texto = "\n".join(textos(ficha))
    for nums, ventana in secuencias(texto):
        duenas = [i for i, rx in enumerate(rxs) if rx and rx.match(ventana)]
        for i in (duenas if len(duenas) == 1 else range(len(normas))):  # sin certeza: a todas
            por_norma[i] |= nums
    out = {}
    for n, s in zip(normas, por_norma):
        b = n.get("boe")
        if b:
            out.setdefault(b, set()).update(s)
    return out


def articulos_afectados(arts, citados):
    """De los artículos modificados ('Art. 49', 'Disposición adicional…'), los que la ficha cita.

    Si no se puede descartar nada (la ficha no cita artículos de esa norma, o el cambio es una disposición,
    un anexo o un «Art. único»), devuelve todos: ante la duda, se avisa.
    """
    if not citados:
        return list(arts)
    out = []
    for a in arts:
        m = re.match(r"^Art\. (\d+)", a)
        if not m or int(m.group(1)) in citados:
            out.append(a)
    return out
