#!/usr/bin/env python
"""Auditoría automática del banco de preguntas contra el texto vigente del BOE.

Para cada pregunta de datos/temas/tema-NN.json:
  1. Lee su `ref` (y, si no basta, el enunciado) y averigua qué artículo de qué norma de la ficha cita.
  2. Busca ese artículo en el texto consolidado y vigente de la norma (caché local en trabajo/normas/,
     descargado con boe.py). Comprueba que existe, que no está derogado y si tiene una reforma pendiente.
  3. Extrae los datos comprobables de la respuesta correcta (plazos, cuantías, edades, porcentajes,
     número de miembros...) y comprueba que aparecen en el artículo. Las cifras escritas con letra
     («setenta y dos horas») se comparan como números.
  4. Avisa si una cifra de una respuesta incorrecta también aparece en el artículo (posible ambigüedad).

Estados de cada pregunta:
  verificada      el artículo existe, está vigente y contiene los datos de la respuesta correcta
  referencia      el artículo existe y está vigente, pero la respuesta no tiene cifras comprobables:
                  su sentido requiere lectura humana
  revisar         algo no cuadra (dato no encontrado, artículo inexistente o derogado, reforma pendiente...)
  no_verificable  la fuente no es una norma del BOE en caché (RAE, autores, UE...) o la ref no cita artículo
  revisada        una persona la revisó y su texto no ha cambiado desde entonces (datos/auditoria-revisiones.json)

Salidas: datos/auditoria.json (estado por id de pregunta, lo usa la web) y fuentes/auditoria-preguntas.md.

Uso:
  python -I herramientas/auditar_preguntas.py                 # sin red: usa la caché trabajo/normas/
  python -I herramientas/auditar_preguntas.py --descargar     # descarga las normas que falten en la caché
  python -I herramientas/auditar_preguntas.py --actualizar    # vuelve a descargar todas (texto de hoy)
  python -I herramientas/auditar_preguntas.py revisar q_14_03 q_14_07 --nota "Comprobado a mano"
  python -I herramientas/auditar_preguntas.py --temas 8,9 --listar revisar

Una auditoría automática no sustituye la lectura: «verificada» significa que las cifras de la respuesta
están en el artículo citado, no que la pregunta sea perfecta. Lo marcado como «revisar» lo resuelve una
persona (o una sesión de Claude siguiendo GUIA_ACTUALIZACION.md) y después se registra con `revisar`.
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.error

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)  # python -I no añade la carpeta del script
import citas  # noqa: E402

RAIZ = os.path.dirname(AQUI)
TEMAS = os.path.join(RAIZ, "datos", "temas")
CACHE = os.path.join(RAIZ, "trabajo", "normas")
SALIDA = os.path.join(RAIZ, "datos", "auditoria.json")
REVISIONES = os.path.join(RAIZ, "datos", "auditoria-revisiones.json")
INFORME = os.path.join(RAIZ, "fuentes", "auditoria-preguntas.md")

ESTADOS = ("verificada", "revisada", "referencia", "revisar", "no_verificable")


# ---------------------------------------------------------------- normalización de texto y cifras
def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


UNIDADES = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7,
    "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
    "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiun": 21,
    "veintiuno": 21, "veintiuna": 21, "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
    "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29,
}
DECENAS = {"treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90}
CENTENAS = {
    "cien": 100, "ciento": 100, "doscientos": 200, "doscientas": 200, "trescientos": 300, "trescientas": 300,
    "cuatrocientos": 400, "cuatrocientas": 400, "quinientos": 500, "quinientas": 500, "seiscientos": 600,
    "seiscientas": 600, "setecientos": 700, "setecientas": 700, "ochocientos": 800, "ochocientas": 800,
    "novecientos": 900, "novecientas": 900,
}
PALABRAS_NUM = set(UNIDADES) | set(DECENAS) | set(CENTENAS) | {"mil", "millon", "millones"}


def palabras_a_numero(palabras):
    """['setenta', 'y', 'dos'] -> 72; ['seiscientos', 'mil'] -> 600000. None si no es un número."""
    total, actual, visto = 0, 0, False
    for w in palabras:
        if w == "y":
            continue
        if w in UNIDADES:
            actual += UNIDADES[w]
        elif w in DECENAS:
            actual += DECENAS[w]
        elif w in CENTENAS:
            actual += CENTENAS[w]
        elif w == "mil":
            total += (actual or 1) * 1000
            actual = 0
        elif w in ("millon", "millones"):
            total = (total + (actual or 1)) * 1000000
            actual = 0
        else:
            return None
        visto = True
    return total + actual if visto else None


_NUMW = "|".join(sorted(PALABRAS_NUM, key=len, reverse=True))
# secuencias de palabras numéricas: «setenta y dos», «seiscientos mil», «dos mil quinientos»
RE_SECUENCIA = re.compile(r"\b(?:%s)(?:(?:\s+y\s+|\s+)(?:%s))*\b" % (_NUMW, _NUMW))
UNIDAD_TRAS_UN = r"(?:ano|anos|mes|meses|dia|dias|hora|horas|semana|semanas|minuto|minutos|vez|miembro|representante|vocal)\b"


def _secuencia_a_cifras(m):
    """Convierte una secuencia de palabras en cifras. «y» solo une decenas y unidades («treinta y dos»):
    en «dos y tres» son dos números. Un «un/una/uno» suelto es un artículo indeterminado y se deja."""
    palabras = m.group(0).split()
    grupos, actual = [], []
    for i, w in enumerate(palabras):
        if w == "y":
            sig = palabras[i + 1] if i + 1 < len(palabras) else ""
            if actual and actual[-1] in DECENAS and sig in UNIDADES and UNIDADES[sig] < 10:
                actual.append(w)
            else:
                grupos.append(actual)
                grupos.append(["y"])
                actual = []
            continue
        actual.append(w)
    grupos.append(actual)
    salida = []
    for g in grupos:
        if not g:
            continue
        if g == ["y"] or (len(g) == 1 and g[0] in ("un", "una", "uno")):
            salida.append(" ".join(g))
            continue
        n = palabras_a_numero(g)
        salida.append(str(n) if n is not None else " ".join(g))
    return " ".join(salida)


def normalizar(texto):
    """Minúsculas, sin tildes, sin separadores de miles y con las cifras escritas en letra pasadas a dígitos.
    Conserva la puntuación original para que «art. 17.2» o «4/2015» no se confundan con datos."""
    t = sin_tildes(str(texto).lower()).replace(" ", " ").replace("­", "")
    t = re.sub(r"(?<![\d.])(\d{1,3})((?:\.\d{3})+)(?![\d.])", lambda m: m.group(1) + m.group(2).replace(".", ""), t)
    # «%» y «por ciento» a una sola palabra, para que «ciento» no se lea como la cifra 100
    t = t.replace("€", " euros ").replace("%", " porciento ")
    t = re.sub(r"\bpor\s+(?:cien(?:to)?|100)\b", "porciento", t)  # «75 por 100» es un porcentaje
    t = RE_SECUENCIA.sub(_secuencia_a_cifras, t)
    t = re.sub(r"\b(?:un|una|uno)\s+(?=%s)" % UNIDAD_TRAS_UN, "1 ", t)  # «un año» -> «1 año»
    t = re.sub(r"\bal\s+(?=(?:ano|mes|dia|semana)\b)", "al 1 ", t)  # «prescribirán… al año» -> «al 1 año»
    return re.sub(r"[ \t]+", " ", t)


# Unidades que dan sentido a una cifra (familia -> formas normalizadas)
FAMILIAS = {
    "hora": ("hora", "horas"), "minuto": ("minuto", "minutos"), "dia": ("dia", "dias"), "semana": ("semana", "semanas"),
    "mes": ("mes", "meses"), "ano": ("ano", "anos"), "euro": ("euro", "euros"), "pct": ("porciento",),
    "miembro": ("miembro", "miembros"), "representante": ("representante", "representantes"),
    "vocal": ("vocal", "vocales"), "senador": ("senador", "senadores"), "diputado": ("diputado", "diputados"),
    "magistrado": ("magistrado", "magistrados"), "persona": ("persona", "personas"), "plaza": ("plaza", "plazas"),
    "kilometro": ("kilometro", "kilometros", "km"), "metro": ("metro", "metros"), "gramo": ("gramo", "gramos", "g/l"),
    "vez": ("vez", "veces"), "edad": ("ano de edad", "anos de edad"),
}
UNIDAD_DE = {forma: fam for fam, formas in FAMILIAS.items() for forma in formas}
RE_CIFRA = re.compile(r"(?<![\w/.-])(\d+(?:,\d+)?)(?![\w/]|\.\d)")
CONTEXTO_EXCLUIDO = re.compile(r"(?:\bart|\barts|\barticulo|\barticulos|\bapartado|\bapartados|\bdisposicion|\bley|"
                               r"\blo|\brd|\breal decreto|\borden|\bboe|\bnum|\bn\.|\bcapitulo|\btitulo|\bseccion|\banexo|\bprotocolo)\W*$")


MESES = re.compile(r"\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b")


def datos_de(texto):
    """Cifras con sentido de un texto: {(valor, familia o None)}. Ignora números de artículo, de norma y años."""
    t = normalizar(texto)
    out = set()
    for m in RE_CIFRA.finditer(t):
        valor = m.group(1)
        antes = t[max(0, m.start() - 22):m.start()]
        if CONTEXTO_EXCLUIDO.search(antes):
            continue
        if re.fullmatch(r"(1[89]|20)\d\d", valor):  # años: el artículo rara vez los repite
            continue
        if MESES.match(t, m.end()):  # «7 de febrero»: fechas de publicación o de firma, no datos del artículo
            continue
        despues = re.findall(r"[a-z]+(?:/[a-z]+)?", t[m.end():m.end() + 40])  # palabras, sin la puntuación pegada
        familia = None
        for k in (3, 2, 1):
            cand = " ".join(despues[:k])
            if cand in UNIDAD_DE:
                familia = UNIDAD_DE[cand]
                break
        if familia is None and len(despues) >= 2:
            # «6 meses o 1 año», «72 horas siguientes»: la unidad puede venir tras una palabra
            for w in despues[1:3]:
                if w in UNIDAD_DE and despues[0] in ("dias", "habiles", "naturales", "o", "de", "mas", "y"):
                    familia = UNIDAD_DE[w]
                    break
        out.add((valor, familia))
    return out


def aparece(dato, texto_norm):
    """¿Aparece la cifra (con su unidad, si la tiene) en un texto ya normalizado?"""
    valor, familia = dato
    rx_valor = r"(?<![\w.,/-])%s(?![\w,]|\.\d)" % re.escape(valor)
    if familia is None:
        return re.search(rx_valor, texto_norm) is not None
    formas = "|".join(re.escape(f) for f in FAMILIAS[familia])
    rx = rx_valor + r"(?:\W+\w+){0,3}?\W+(?:%s)\b" % formas
    return re.search(rx, texto_norm) is not None


# ---------------------------------------------------------------- normas en caché
RE_CABECERA = re.compile(r"^\[([^\]\s·]+)(?: · (NUEVO )?desde (\d{4}-\d{2}-\d{2})(?: · ([^\]]+))?)?\]$")
# «Artículo 36.», «Artículo 4 bis.», «Artículo único.», y también con letra: «Artículo cuarenta y nueve.», «Artículo quinto.»
SUFIJOS = r"bis|ter|qu[aá]ter|quinquies|sexies|septies|octies|nonies|decies"
RE_ARTICULO = re.compile(r"^Art[ií]culo\s+(\d+|[a-záéíóúñ]+(?:\s+y\s+[a-záéíóúñ]+)?)\s*(?:(%s)(?:\s+([a-z]))?)?\s*(?=[.:\s]|$)" % SUFIJOS, re.I)
# Rótulo abreviado de algunas normas antiguas («Art. 1.º», RD 769/1987). Solo se usa en el primer renglón de un
# bloque [aN] del texto consolidado: en el texto corrido, «Art. 3 de la Ley…» no abre un artículo.
RE_ARTICULO_ABREV = re.compile(r"^Art\.\s*(\d+)\s*\.?\s*[º°ª]?\s*(?:(%s)(?:\s+([a-z]))?)?\s*(?=[.:\s]|$)" % SUFIJOS, re.I)
ORDINALES = {
    "primero": 1, "segundo": 2, "tercero": 3, "cuarto": 4, "quinto": 5, "sexto": 6, "septimo": 7, "octavo": 8,
    "noveno": 9, "decimo": 10, "undecimo": 11, "duodecimo": 12, "decimotercero": 13, "decimocuarto": 14,
    "decimoquinto": 15, "decimosexto": 16, "decimoseptimo": 17, "decimoctavo": 18, "decimonoveno": 19, "vigesimo": 20,
}


def numero_articulo(palabra):
    """'36' -> '36'; 'cuarenta y nueve' -> '49'; 'quinto' -> '5'; 'único' -> 'unico'; otra cosa -> None."""
    p = sin_tildes(palabra).lower().strip()
    if p.isdigit():
        return str(int(p))
    if p == "unico":
        return "unico"
    if p in ORDINALES:
        return str(ORDINALES[p])
    n = palabras_a_numero(p.split())
    return str(n) if n else None
RE_DEROGADO = re.compile(r"\((?:derogad[oa]s?|sin contenido|suprimid[oa])\)|^\s*(?:derogad[oa]|sin contenido)\.?\s*$", re.I | re.M)


def clave_articulo(num, sufijo="", letra=""):
    """'588', 'septies', 'a' -> '588 septies a' (así se distinguen los artículos 588 septies a, b, c...)."""
    num = sin_tildes(str(num)).lower()
    partes = [num] + [sin_tildes(x).lower() for x in (sufijo, letra) if x]
    return " ".join(partes).strip()


def leer_norma(path):
    """Texto de boe.py -> {'titulo', 'consolidada', 'articulos': {clave: {'texto', 'derogado', 'futuras': [fechas]}}}."""
    with open(path, encoding="utf-8") as f:
        lineas = f.read().splitlines()
    titulo = lineas[0][2:].strip() if lineas and lineas[0].startswith("# ") else ""
    consolidada = not any("texto ORIGINAL" in l for l in lineas[:8])
    arts, por_bloque = {}, {}

    def guardar(bid, futura, nuevo, fecha, cuerpo):
        if not cuerpo:
            return
        m = RE_ARTICULO.match(cuerpo[0].strip()) or RE_ARTICULO_ABREV.match(cuerpo[0].strip())
        num = numero_articulo(m.group(1)) if m else None
        clave = clave_articulo(num, m.group(2), m.group(3)) if num else por_bloque.get(bid)
        if not clave:
            return
        if not futura:
            por_bloque[bid] = clave
            derogado = bool(RE_DEROGADO.search("\n".join(cuerpo[:3])))
            previo = arts.get(clave)
            if previo and not previo.get("solo_futuro"):
                # mismo número en dos partes de la norma (p. ej. el RD y el reglamento que aprueba): se juntan
                previo["texto"] += "\n" + "\n".join(cuerpo)
                previo["derogado"] = previo["derogado"] and derogado
            else:
                arts[clave] = {"texto": "\n".join(cuerpo), "derogado": derogado, "futuras": (previo or {}).get("futuras", [])}
        else:
            a = arts.setdefault(clave, {"texto": "", "derogado": False, "futuras": [], "solo_futuro": True})
            a["futuras"].append(fecha)
            a.setdefault("futuras_txt", []).append((fecha, normalizar("\n".join(cuerpo))))

    if consolidada:
        bid = futura = nuevo = fecha = None
        cuerpo = []
        for l in lineas:
            m = RE_CABECERA.match(l.strip())
            if m:
                if bid:
                    guardar(bid, futura, nuevo, fecha, cuerpo)
                bid, nuevo, fecha = m.group(1), bool(m.group(2)), m.group(3)
                futura = fecha is not None
                cuerpo = []
            elif bid is not None and not l.startswith("# "):
                if l.strip():
                    cuerpo.append(l.strip())
        if bid:
            guardar(bid, futura, nuevo, fecha, cuerpo)
    else:  # texto original: se parte por «Artículo N.»
        actual, cuerpo = None, []
        for l in lineas[5:]:
            m = RE_ARTICULO.match(l.strip())
            num = numero_articulo(m.group(1)) if m else None
            if num:
                if actual:
                    arts[actual] = {"texto": "\n".join(cuerpo), "derogado": False, "futuras": []}
                actual, cuerpo = clave_articulo(num, m.group(2), m.group(3)), [l.strip()]
            elif actual and l.strip():
                cuerpo.append(l.strip())
        if actual:
            arts[actual] = {"texto": "\n".join(cuerpo), "derogado": False, "futuras": []}
    for a in arts.values():
        a["norm"] = normalizar(a["texto"])
    return {"titulo": titulo, "consolidada": consolidada, "articulos": arts}


def ruta_cache(norma_id, cache=None):
    return os.path.join(cache or CACHE, norma_id + ".txt")


def descargar(norma_ids, cache=None, todas=False):
    import boe  # solo hace falta con red
    cache = cache or CACHE
    os.makedirs(cache, exist_ok=True)
    hoy = datetime.date.today().strftime("%Y%m%d")
    hechas, fallos = 0, []
    for nid in sorted(norma_ids):
        destino = ruta_cache(nid, cache)
        if os.path.exists(destino) and not todas:
            continue
        try:
            try:
                txt, _ = boe.consolidada(nid, hoy, con_futuras=True)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                txt = boe.original(nid)
            with open(destino, "w", encoding="utf-8", newline="\n") as f:
                f.write(txt)
            hechas += 1
        except Exception as e:  # noqa: BLE001
            fallos.append("%s (%s)" % (nid, str(e)[:60]))
    return hechas, fallos


# ---------------------------------------------------------------- qué cita cada pregunta
def tokens_de_norma(norma):
    """Formas en que se puede nombrar una norma: '4/2015', 'LECrim', 'CE'..."""
    nombre = str(norma.get("nombre", ""))
    # Solo el número PROPIO de la norma (el primero): «RD 328/2026, por el que se modifica el RD 1009/2023»
    # no debe pasar por el RD 1009/2023.
    propio = re.search(r"(?<![\d/])(\d{1,4}/\d{4})(?!\d)", nombre)
    tok = {propio.group(1)} if propio else set()
    tok.update(re.findall(r"\(([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚ]{1,9})\)", nombre))
    for rx, abrev in citas.ABREVIATURAS:
        if rx.search(nombre):
            tok.update(abrev)
    for rx, abrev in SIGLAS_EXTRA:
        if rx.search(nombre):
            tok.update(abrev)
    # El nombre propio sin rango ni número («Reglamento de Organización y Funcionamiento del Defensor del Pueblo»)
    frase = re.sub(r"^(?:Instrumento de ratificaci[oó]n del?\s+|Real Decreto(?:-ley| Legislativo)?\s+[\d/]+\s*|Ley(?: Org[aá]nica)?\s+[\d/]+\s*|Orden\s+\S+\s*)",
                   "", nombre.split(",")[0], flags=re.I).strip(" ,.")
    if len(frase.split()) >= 3:
        tok.add(frase)
    return tok


# Siglas con que las fichas citan normas cuyo nombre no las contiene
SIGLAS_EXTRA = [
    (re.compile(r"Tribunal Constitucional", re.I), ["LOTC"]),
    (re.compile(r"R[eé]gimen Electoral General", re.I), ["LOREG"]),
    (re.compile(r"Estatuto Org[aá]nico del Ministerio Fiscal", re.I), ["EOMF"]),
    (re.compile(r"Tribunal del Jurado", re.I), ["LOTJ"]),
    (re.compile(r"Convenio (?:Europeo )?para la Protecci[oó]n de los Derechos Humanos|Convenio Europeo de Derechos Humanos", re.I), ["CEDH"]),
    (re.compile(r"Protocolo Facultativo.*Tortura", re.I), ["OPCAT", "Protocolo Facultativo"]),
    (re.compile(r"Convenci[oó]n contra la Tortura", re.I), ["CAT", "Convención contra la Tortura"]),
    (re.compile(r"Reglamento de Armas", re.I), ["Reglamento de Armas"]),
    (re.compile(r"Reglamento General de Circulaci", re.I), ["RGC", "Reglamento General de Circulación"]),
    (re.compile(r"Reglamento General de Veh[ií]culos", re.I), ["RGV"]),
    (re.compile(r"Ley sobre Tr[aá]fico|Ley de Tr[aá]fico", re.I), ["LSV", "Ley de Tráfico"]),
    (re.compile(r"Reglamento \(UE\) 2016/679", re.I), ["RGPD"]),
    (re.compile(r"Defensor del Pueblo", re.I), ["Defensor del Pueblo"]),
]


def menciona(texto, token):
    return posicion(texto, token) is not None


def posicion(texto, token):
    """Dónde nombra el texto la norma (sin distinguir mayúsculas ni tildes), o None."""
    if re.fullmatch(r"\d{1,4}/\d{4}", token):
        m = re.search(r"(?<![\d/])%s(?!\d)" % re.escape(token), texto)
    else:
        m = re.search(r"(?<![\w])%s(?![\w])" % re.escape(sin_tildes(token).lower()), sin_tildes(texto).lower())
    return m.start() if m else None


def otras_normas(texto):
    """¿Nombra el texto una norma con número (p. ej. 'LO 6/1985') que podría no estar en la ficha?"""
    return set(re.findall(r"(?<![\d/])(\d{1,4}/\d{4})(?!\d)", texto))


def citas_de(pregunta, ficha):
    """[(id BOE o None, clave de artículo)] que cita la pregunta, más un motivo si no se puede atribuir."""
    normas = [n for n in ficha.get("normas", [])]
    texto_ref = pregunta.get("ref", "")
    fuentes = [texto_ref] if citas.RE_ART.search(texto_ref) else [texto_ref, pregunta.get("enunciado", "")]
    out = []
    for texto in fuentes:
        nombradas = [n for n in normas if n.get("boe") and any(menciona(texto, t) for t in tokens_de_norma(n))]
        desconocidas = otras_normas(texto) - {t for n in normas for t in tokens_de_norma(n)}
        for m in citas.RE_ART.finditer(texto):
            # la letra de «588 septies a» va de la a a la h: así no se confunde con la «y» de «8 bis y 8 ter»
            sec = re.match(r"(\d{1,4})\s*(?:(%s)(?:\s+([a-h])\b)?)?(?![\d])" % SUFIJOS, texto[m.end():], re.I)
            if not sec:
                continue
            # todos los números de esta cita («arts. 5.1, 5.4 y 5.5», «arts. 156 a 158»)
            nums = None
            for ns, _ in citas.secuencias(texto[m.start():]):
                nums = ns
                break
            claves = sorted({str(n) for n in (nums or {int(sec.group(1))})}, key=int)
            if sec.group(2) and len(claves) == 1:
                claves = [clave_articulo(sec.group(1), sec.group(2), sec.group(3))]
            ventana = texto[m.end():m.end() + 70]
            # la norma nombrada más cerca, justo detrás del número («art. 5 Ley 39/2006 (redacción de la Ley 4/2026)»)
            posiciones = []
            for n in normas:  # también las que no son del BOE: si la cita es de una de ellas, no se puede comprobar
                pos = [p for p in (posicion(ventana, t) for t in tokens_de_norma(n)) if p is not None]
                if pos:
                    posiciones.append((min(pos), n))
            # Empates (dos normas nombradas en el mismo sitio, p. ej. la LO del Defensor del Pueblo y su Reglamento):
            # gana la que comparte más palabras con la cita.
            palabras_v = set(re.findall(r"[a-zñ]{4,}", sin_tildes(ventana).lower()))
            posiciones.sort(key=lambda x: (x[0], -len(palabras_v & set(re.findall(r"[a-zñ]{4,}", sin_tildes(x[1].get("nombre", "")).lower())))))
            ajena = re.search(r"(?<![\d/])\d{1,4}/\d{4}(?!\d)", ventana)
            if posiciones and (not ajena or ajena.start() >= posiciones[0][0]):
                # todas las empatadas en primera posición, por orden de afinidad: se busca el artículo en ese orden
                empatadas = [n for p, n in posiciones if p == posiciones[0][0]]
                duenas = [n for n in empatadas if n.get("boe")] if empatadas[0].get("boe") else []
            elif ajena and (not posiciones or ajena.start() < posiciones[0][0]):
                duenas = []  # cita una norma que no está entre las de la ficha
            elif len(nombradas) == 1:
                duenas = nombradas
            elif desconocidas and not nombradas:
                duenas = []
            else:
                duenas = [n for n in normas if n.get("boe")]
            # segura: la ref nombra la norma; si no, se prueban todas las de la ficha y un fallo no es concluyente
            segura = (bool(posiciones) or len(nombradas) == 1) and texto is texto_ref
            for c in claves[:6]:
                out.append(([n["boe"] for n in duenas], c, segura))
        if out:
            break
    return out


# ---------------------------------------------------------------- auditoría
def huella(q):
    base = json.dumps([q.get("enunciado"), q.get("opciones"), q.get("correcta"), q.get("ref")], ensure_ascii=False)
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:12]


def buscar_articulo(norma, clave):
    """El artículo con esa clave; si la cita es «588 ter» y el BOE lo divide en «588 ter a, b, c…», los junta."""
    a = norma["articulos"].get(clave)
    if a:
        return a
    partes = [v for k, v in sorted(norma["articulos"].items()) if k.startswith(clave + " ") and not v.get("solo_futuro")]
    if not partes:
        return None
    return {"texto": "\n".join(p["texto"] for p in partes), "norm": "\n".join(p["norm"] for p in partes),
            "derogado": all(p["derogado"] for p in partes), "futuras": [f for p in partes for f in p["futuras"]],
            "futuras_txt": [x for p in partes for x in p.get("futuras_txt", [])]}


RE_NEGATIVA_MAY = re.compile(r"\b(?:INCORRECTA|INCORRECTO|FALSA|FALSO|NO|EXCEPTO|SALVO)\b")
RE_NEGATIVA = re.compile(r"se[ñn]ale la (?:afirmaci[oó]n |respuesta |opci[oó]n )?(?:incorrecta|falsa)|"
                         r"¿\s*cu[aá]l(?:es)? (?:de (?:las|los) siguientes )?(?:\w+ )?no\b|"
                         r"\bno (?:es|son|est[aá]n?|figura|figuran|se (?:encuentra|incluye|considera|exige)|corresponde|constituye|forma parte|recoge|aparece)\b", re.I)


def auditar_pregunta(q, ficha, normas_cache, hoy_iso, revisiones=None):
    res = {"tema": ficha["tema"], "estado": "", "motivos": [], "avisos": [], "articulos": [], "huella": huella(q)}
    rev = (revisiones or {}).get(q.get("id"))
    citas_q = citas_de(q, ficha)
    correcta = q["opciones"][q["correcta"]] if 0 <= q.get("correcta", -1) < len(q.get("opciones", [])) else ""
    datos = datos_de(correcta)
    distractores = set()
    for i, o in enumerate(q.get("opciones", [])):
        if i != q.get("correcta"):
            distractores |= {d for d in datos_de(o) if d[1] is not None} - datos

    ref = q.get("ref", "")
    # Respuesta calculada (horas de reloj, días de la semana): la cifra no está literalmente en la norma.
    calculada = bool(re.search(r"\b\d{1,2}:\d{2}\b|\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b", correcta, re.I))
    # La ref también remite a partes que el auditor no lee (disposiciones, anexos, instrucciones...).
    parcial = bool(re.search(r"\b(?:DA|DT|DF|DD|disp\.|disposici[oó]n|anexo|ap\.|apartado|instrucci[oó]n|circular|protocolo|"
                             r"reglamento\s+\(UE\)|directiva|sentencia|STC|STS)\b", ref, re.I))
    if calculada:
        datos = set()
        res["avisos"].append("Respuesta calculada (fechas u horas): el auditor solo comprueba el artículo.")
    # Preguntas en negativo («señale la INCORRECTA», «¿cuál NO…?»): la respuesta correcta es la afirmación falsa,
    # así que lo que debe estar en el artículo son las cifras de las otras opciones.
    negativa = bool(RE_NEGATIVA.search(q.get("enunciado", "")) or RE_NEGATIVA_MAY.search(q.get("enunciado", "")))
    if negativa and not calculada:
        datos = set()
        for i, o in enumerate(q.get("opciones", [])):
            if i != q.get("correcta"):
                datos |= {d for d in datos_de(o) if d[1] is not None}
        distractores = set()
        res["avisos"].append("Pregunta en negativo: se comprueban las cifras de las opciones verdaderas.")

    if not citas_q:
        res["estado"] = "no_verificable"
        res["motivos"].append("La referencia no cita un artículo de una norma del BOE de la ficha.")
    else:
        textos_ok, alguna_en_cache, no_localizables = [], False, []
        futuros, todas_seguras, derogacion_confirmada = [], True, False
        espera_derogado = re.search(r"derog|suprimid|sin contenido|sin efecto|dej[oó] de estar", correcta, re.I)
        redaccion_futura = re.search(r"redacci[oó]n (?:de|dada por)", ref, re.I)
        for norma_ids, clave, segura in citas_q:
            # a igualdad, antes el texto consolidado que una norma de reforma publicada sin consolidar
            norma_ids = sorted(norma_ids, key=lambda nid: 0 if (normas_cache.get(nid) or {}).get("consolidada") else 1)
            encontrado = None
            for nid in norma_ids:
                n = normas_cache.get(nid)
                if n is None:
                    continue
                alguna_en_cache = True
                a = buscar_articulo(n, clave)
                if a:
                    encontrado = (nid, a)
                    break
            if not norma_ids:
                continue
            if encontrado is None:
                en_cache = [nid for nid in norma_ids if nid in normas_cache]
                # Solo es un error si sabemos de qué norma es la cita y esa norma tiene artículos localizables.
                if segura and en_cache and normas_cache[en_cache[0]]["articulos"]:
                    res["motivos"].append("No se encuentra el art. %s en %s." % (clave, en_cache[0]))
                    res["articulos"].append({"norma": en_cache[0], "art": clave, "encontrado": False})
                elif en_cache:
                    no_localizables.append(clave)
                continue
            nid, a = encontrado
            res["articulos"].append({"norma": nid, "art": clave, "encontrado": True})
            todas_seguras = todas_seguras and segura
            futuros += [(f, t) for f, t in a.get("futuras_txt", []) if f > hoy_iso]
            if a.get("solo_futuro"):
                if redaccion_futura:
                    res["avisos"].append("El art. %s de %s entra en vigor el %s (la pregunta usa esa redacción)." % (clave, nid, ", ".join(a["futuras"])))
                else:
                    res["motivos"].append("El art. %s de %s todavía no está en vigor (entra el %s)." % (clave, nid, ", ".join(a["futuras"])))
                continue
            if a["derogado"]:
                if espera_derogado:  # la pregunta pregunta precisamente por la derogación
                    derogacion_confirmada = True
                else:
                    res["motivos"].append("El art. %s de %s figura como derogado o sin contenido." % (clave, nid))
                continue
            if a["futuras"]:
                futuras = [f for f in a["futuras"] if f > hoy_iso]
                if futuras:
                    res["avisos"].append("El art. %s de %s tiene una reforma que entra en vigor el %s." % (clave, nid, ", ".join(sorted(set(futuras)))))
            textos_ok.append(a["norm"])

        if not res["articulos"] and not alguna_en_cache:
            res["estado"] = "no_verificable"
            if all(not ids for ids, _, _ in citas_q):
                res["motivos"].append("Cita una norma que no está entre las normas de la ficha.")
            else:
                res["motivos"].append("Ninguna de las normas citadas está en la caché (ejecuta con --descargar).")
        elif not textos_ok and derogacion_confirmada and not res["motivos"]:
            res["estado"] = "verificada"  # la respuesta afirma la derogación y el BOE la confirma
        elif not textos_ok and futuros and redaccion_futura and not res["motivos"]:
            juntos_f = "\n".join(t for _, t in futuros)
            faltan_f = [d for d in datos if not aparece(d, juntos_f)]
            res["estado"] = "revisar" if faltan_f else ("verificada" if datos else "referencia")
            if faltan_f:
                res["motivos"].append("Datos que no aparecen en la redacción que entra en vigor: %s." % ", ".join("%s %s" % (v, f or "") for v, f in faltan_f))
        elif not textos_ok and not res["motivos"]:
            res["estado"] = "no_verificable"
            res["motivos"].append("No se puede localizar el art. %s en el texto del BOE (tratado o norma sin texto consolidado, "
                                  "o la ref no dice de qué norma es)." % ", ".join(sorted(set(no_localizables)) or ["citado"]))
        elif not textos_ok:
            res["estado"] = "revisar"
        else:
            juntos = "\n".join(textos_ok)
            faltan_d = [d for d in datos if not aparece(d, juntos)]
            # ¿Están en la redacción que todavía no rige? Si la ref lo anuncia, cuenta como comprobada.
            juntos_f = "\n".join(t for _, t in futuros)
            if faltan_d and futuros and all(aparece(d, juntos_f) for d in faltan_d):
                fechas = ", ".join(sorted({f for f, _ in futuros}))
                if redaccion_futura:
                    res["avisos"].append("Cifras comprobadas en la redacción que entra en vigor el %s." % fechas)
                    faltan_d = []
                else:
                    res["motivos"].append("Las cifras de la respuesta corresponden a la redacción que entra en vigor el %s, no a la vigente." % fechas)
                    faltan_d = []
            faltan = sorted("%s%s" % (v, " " + (f or "")) for v, f in faltan_d)
            if faltan and negativa:
                # en negativo las cifras vienen de varias opciones verdaderas: puede que alguna esté en otro artículo
                res["avisos"].append("Cifras de las opciones verdaderas no localizadas en el artículo citado: %s." % ", ".join(x.strip() for x in faltan))
                faltan = []
                datos = set()  # sin cifras comprobadas: queda como «referencia»
            if faltan and not todas_seguras:
                res["avisos"].append("Cifras no localizadas; la ref no dice con certeza de qué norma es el artículo: %s." % ", ".join(x.strip() for x in faltan))
                faltan = []
                if not res["motivos"]:
                    res["estado"] = "no_verificable"
            if faltan and parcial:
                res["avisos"].append("Cifras que no están en los artículos citados (pueden estar en la disposición o el documento "
                                     "que también cita la ref): %s." % ", ".join(x.strip() for x in faltan))
            elif faltan:
                res["motivos"].append("Datos de la respuesta correcta que no aparecen en el artículo citado: %s." % ", ".join(x.strip() for x in faltan))
            dudosos = sorted("%s %s" % d for d in distractores if aparece(d, juntos))
            if dudosos:
                res["avisos"].append("Una respuesta incorrecta usa una cifra que también está en el artículo: %s." % ", ".join(dudosos))
            if res["motivos"]:
                res["estado"] = "revisar"
            elif res["estado"] == "no_verificable":
                pass
            elif datos and not any(a.startswith("Cifras que no están") for a in res["avisos"]):
                res["estado"] = "verificada"
            else:
                res["estado"] = "referencia"
    if rev and rev.get("huella") == res["huella"] and res["estado"] in ("revisar", "referencia", "no_verificable"):
        res["estado_auto"] = res["estado"]
        res["estado"] = "revisada"
        res["revision"] = {"fecha": rev.get("fecha"), "nota": rev.get("nota", ""), "por": rev.get("por", "persona")}
    return res


def cargar_fichas(temas=None, carpeta=None):
    fichas = []
    for p in sorted(glob.glob(os.path.join(carpeta or TEMAS, "tema-*.json"))):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        if temas and d["tema"] not in temas:
            continue
        fichas.append(d)
    return fichas


def normas_necesarias(fichas):
    return {n["boe"] for f in fichas for n in f.get("normas", []) if n.get("boe") and re.match(r"^BOE-A-\d{4}-\d+$", n["boe"])}


def cargar_cache(ids, cache=None):
    out = {}
    for nid in ids:
        p = ruta_cache(nid, cache)
        if os.path.exists(p):
            out[nid] = leer_norma(p)
    return out


def auditar(fichas, normas_cache, revisiones, hoy_iso):
    resultado = {}
    for f in fichas:
        for q in f.get("preguntas", []):
            resultado[q["id"]] = auditar_pregunta(q, f, normas_cache, hoy_iso, revisiones)
    return resultado


def resumen(preguntas):
    total = {e: 0 for e in ESTADOS}
    por_tema = {}
    for r in preguntas.values():
        total[r["estado"]] += 1
        t = por_tema.setdefault(str(r["tema"]), {e: 0 for e in ESTADOS})
        t[r["estado"]] += 1
    return total, por_tema


def informe_md(preguntas, fichas, total, hoy_iso, en_cache, necesarias):
    enunciados = {q["id"]: q for f in fichas for q in f["preguntas"]}
    n = sum(total.values()) or 1
    l = ["# Auditoría automática del banco de preguntas", "",
         "Generada el %s por `herramientas/auditar_preguntas.py` con %d de %d normas del BOE en caché." % (hoy_iso, en_cache, necesarias), "",
         "| Estado | Preguntas | % |", "|---|---|---|"]
    nombres = {"verificada": "Verificada (cifras en el artículo)", "revisada": "Revisada a mano", "referencia": "Artículo vigente, sin cifras que comprobar",
               "revisar": "Pendiente de revisar", "no_verificable": "Fuente no comprobable automáticamente"}
    for e in ESTADOS:
        l.append("| %s | %d | %.1f %% |" % (nombres[e], total[e], 100.0 * total[e] / n))
    l += ["", "## Preguntas pendientes de revisar", ""]
    pend = [(r["tema"], qid, r) for qid, r in preguntas.items() if r["estado"] == "revisar"]
    for tema, qid, r in sorted(pend, key=lambda x: (x[0], x[1])):
        q = enunciados.get(qid, {})
        l.append("- **%s** (tema %s, ref: %s) — %s" % (qid, tema, q.get("ref", ""), " ".join(r["motivos"])))
    avisos = [(r["tema"], qid, r) for qid, r in preguntas.items() if r["avisos"] and r["estado"] != "revisar"]
    if avisos:
        l += ["", "## Avisos (no bloquean)", ""]
        for tema, qid, r in sorted(avisos, key=lambda x: (x[0], x[1])):
            l.append("- %s (tema %s): %s" % (qid, tema, " ".join(r["avisos"])))
    return "\n".join(l) + "\n"


def guardar_json(p, datos):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")


def cargar_json(p, defecto):
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return defecto


def cmd_auditar(args):
    hoy_iso = datetime.date.today().isoformat()
    temas = {int(x) for x in args.temas.split(",")} if args.temas else None
    fichas = cargar_fichas(temas)
    necesarias = normas_necesarias(fichas)
    if args.descargar or args.actualizar:
        hechas, fallos = descargar(necesarias, todas=args.actualizar)
        print("Descargadas %d normas%s" % (hechas, ("; fallos: " + "; ".join(fallos)) if fallos else ""))
    cache = cargar_cache(necesarias)
    revisiones = cargar_json(REVISIONES, {})
    for extra in (args.revisiones_extra or []):  # revisiones aún sin fusionar (modo --sin-guardar)
        revisiones.update(cargar_json(extra, {}))
    preguntas = auditar(fichas, cache, revisiones, hoy_iso)
    if args.sin_guardar:  # solo consulta: no escribe nada (útil con varias revisiones en paralelo)
        total, _ = resumen(preguntas)
        for e in ESTADOS:
            print("  %-15s %4d" % (e, total[e]))
        for qid, r in sorted(preguntas.items()):
            if not args.listar or r["estado"] == args.listar:
                print("%s  [%s] %s" % (qid, r["estado"], " ".join(r["motivos"] + r["avisos"])))
        return
    if temas:  # auditoría parcial: se mezcla con la anterior
        previo = cargar_json(SALIDA, {}).get("preguntas", {})
        previo = {k: v for k, v in previo.items() if v.get("tema") not in temas}
        previo.update(preguntas)
        preguntas = previo
        fichas_todas = cargar_fichas()
    else:
        fichas_todas = fichas
    total, por_tema = resumen(preguntas)
    guardar_json(SALIDA, {"generado": hoy_iso, "normasEnCache": len(cache), "normasNecesarias": len(necesarias),
                          "resumen": total, "porTema": por_tema, "preguntas": preguntas})
    os.makedirs(os.path.dirname(INFORME), exist_ok=True)
    with open(INFORME, "w", encoding="utf-8", newline="\n") as f:
        f.write(informe_md(preguntas, fichas_todas, total, hoy_iso, len(cache), len(normas_necesarias(fichas_todas))))
    n = sum(total.values()) or 1
    print("Auditadas %d preguntas con %d/%d normas en caché:" % (sum(total.values()), len(cache), len(necesarias)))
    for e in ESTADOS:
        print("  %-15s %4d  (%.1f %%)" % (e, total[e], 100.0 * total[e] / n))
    if args.listar:
        for qid, r in sorted(preguntas.items()):
            if r["estado"] == args.listar:
                print("%s  %s" % (qid, " ".join(r["motivos"] + r["avisos"])))


def cmd_revisar(args):
    """Registra revisiones. Con --archivo se guardan en un fichero aparte (para revisiones en paralelo que
    después se juntan con `fusionar`), y no en datos/auditoria-revisiones.json."""
    fichas = {q["id"]: q for f in cargar_fichas() for q in f["preguntas"]}
    destino = args.archivo or REVISIONES
    revisiones = cargar_json(destino, {})
    hechas = 0
    for qid in args.ids:
        if qid not in fichas:
            print("No existe la pregunta %s" % qid)
            continue
        revisiones[qid] = {"huella": huella(fichas[qid]), "fecha": datetime.date.today().isoformat(),
                           "nota": args.nota or "", "por": args.por}
        hechas += 1
    guardar_json(destino, revisiones)
    print("Registradas %d revisiones en %s. Vuelve a ejecutar la auditoría para actualizar los estados." % (hechas, os.path.relpath(destino, RAIZ)))


def cmd_fusionar(args):
    """Junta ficheros de revisiones (de `revisar --archivo`) en datos/auditoria-revisiones.json."""
    revisiones = cargar_json(REVISIONES, {})
    n = 0
    for p in args.ficheros:
        for qid, r in cargar_json(p, {}).items():
            revisiones[qid] = r
            n += 1
    guardar_json(REVISIONES, revisiones)
    print("Fusionadas %d revisiones; total %d." % (n, len(revisiones)))


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    ap.add_argument("--descargar", action="store_true", help="descarga las normas que falten en trabajo/normas/")
    ap.add_argument("--actualizar", action="store_true", help="vuelve a descargar todas las normas")
    ap.add_argument("--temas", help="lista de temas separados por comas (auditoría parcial)")
    ap.add_argument("--listar", choices=ESTADOS, help="muestra las preguntas en ese estado")
    ap.add_argument("--sin-guardar", action="store_true", help="no escribe datos/auditoria.json ni el informe: solo muestra el resultado")
    ap.add_argument("--revisiones-extra", nargs="*", help="ficheros de revisiones (de revisar --archivo) que se tienen en cuenta sin fusionarlos")
    r = sub.add_parser("revisar", help="registra que unas preguntas se han revisado contra su fuente")
    r.add_argument("ids", nargs="+")
    r.add_argument("--nota", default="")
    r.add_argument("--por", choices=("persona", "ia"), default="persona", help="quién revisó (la web lo indica)")
    r.add_argument("--archivo", help="guardar en este fichero en vez de datos/auditoria-revisiones.json")
    fu = sub.add_parser("fusionar", help="junta ficheros de revisiones en datos/auditoria-revisiones.json")
    fu.add_argument("ficheros", nargs="+")
    args = ap.parse_args(argv)
    if args.cmd == "revisar":
        cmd_revisar(args)
    elif args.cmd == "fusionar":
        cmd_fusionar(args)
    else:
        cmd_auditar(args)


if __name__ == "__main__":
    main()
