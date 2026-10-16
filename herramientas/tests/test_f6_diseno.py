"""Fase 6: diseño. Comprobaciones estructurales del CSS (sin navegador): contraste WCAG AA, media queries de móvil,
tablet y escritorio, ausencia de anchos fijos que desborden, estados hover/active y objetivos táctiles."""
import os
import re
import unittest

from _comun import HERRAMIENTAS, RAIZ, leer

CSS = leer(os.path.join(RAIZ, "web", "css", "app.css"))


# ---------------------------------------------------------------- análisis mínimo de CSS
def sin_comentarios(txt):
    return re.sub(r"/\*.*?\*/", "", txt, flags=re.S)


def bloque(txt, i):
    """Dado el índice de un '{', devuelve (contenido, índice siguiente al '}' que lo cierra)."""
    prof, j = 0, i
    while j < len(txt):
        if txt[j] == "{":
            prof += 1
        elif txt[j] == "}":
            prof -= 1
            if prof == 0:
                return txt[i + 1:j], j + 1
        j += 1
    raise ValueError("llaves sin cerrar")


def declaraciones(cuerpo):
    out, actual, par = {}, "", 0
    for ch in cuerpo:
        if ch == "(":
            par += 1
        elif ch == ")":
            par -= 1
        if ch == ";" and par == 0:
            _guardar(out, actual)
            actual = ""
        else:
            actual += ch
    _guardar(out, actual)
    return out


def _guardar(out, d):
    if ":" in d:
        k, v = d.split(":", 1)
        out[k.strip()] = v.strip()


def reglas(txt, medio=""):
    """[(condición de @media acumulada, selector, {propiedad: valor})]"""
    txt = sin_comentarios(txt)
    out, i = [], 0
    while True:
        a = txt.find("{", i)
        if a < 0:
            return out
        cabecera = txt[i:a].strip()
        cuerpo, i = bloque(txt, a)
        if cabecera.startswith("@media"):
            out += reglas(cuerpo, (medio + " and " + cabecera[6:].strip()).strip(" and "))
        elif cabecera.startswith("@supports") or cabecera.startswith("@font-face"):
            continue
        else:
            for sel in cabecera.split(","):
                out.append((medio, sel.strip(), declaraciones(cuerpo)))


REGLAS = reglas(CSS)


def props(selector, medio=None):
    """Propiedades de todas las reglas con ese selector (opcionalmente solo en un @media que contenga `medio`)."""
    r = {}
    for m, s, d in REGLAS:
        if s == selector and (medio is None or medio in m):
            r.update(d)
    return r


def base(selector):
    """Propiedades que ese selector tiene fuera de cualquier @media."""
    r = {}
    for m, s, d in REGLAS:
        if s == selector and not m:
            r.update(d)
    return r


def variables(medio_contiene, selector):
    for m, s, d in REGLAS:
        if s == selector and medio_contiene in m:
            return {k: v for k, v in d.items() if k.startswith("--")}
    raise AssertionError("no se encuentra %s en %r" % (selector, medio_contiene))


CLARO = variables("", ":root")
OSCURO_SISTEMA = variables("prefers-color-scheme: dark", ':root:not([data-theme="light"])')
OSCURO_MANUAL = variables("", ':root[data-theme="dark"]')


# ---------------------------------------------------------------- contraste WCAG
def luminancia(hexa):
    h = hexa.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contraste(a, b):
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# (texto, fondo, mínimo): AA = 4,5 para texto normal; 3 para bordes de controles y anillo de foco (WCAG 1.4.11)
PARES_TEXTO = [
    ("--ink", "--bg"), ("--ink", "--surface"), ("--ink", "--surface-2"), ("--ink", "--accent-soft"),
    ("--ink", "--warn-soft"), ("--ink", "--ok-soft"), ("--ink", "--ko-soft"),
    ("--ink-2", "--bg"), ("--ink-2", "--surface"), ("--ink-2", "--surface-2"),
    ("--muted", "--bg"), ("--muted", "--surface"), ("--muted", "--surface-2"),
    ("--accent", "--bg"), ("--accent", "--surface"), ("--accent", "--surface-2"), ("--accent", "--accent-soft"),
    ("--accent-ink", "--accent"), ("--accent-ink", "--accent-2"),
    ("--on-solid", "--a"), ("--on-solid", "--b"), ("--on-solid", "--c"), ("--on-solid", "--ok"), ("--on-solid", "--ko"),
    ("--a", "--a-soft"), ("--b", "--b-soft"), ("--c", "--c-soft"),
    ("--a", "--surface"), ("--b", "--surface"), ("--c", "--surface"),
    ("--ok", "--ok-soft"), ("--ko", "--ko-soft"), ("--warn", "--warn-soft"),
    ("--ok", "--surface"), ("--ko", "--surface"), ("--warn", "--surface"),
]
PARES_COMPONENTE = [("--line-strong", "--surface"), ("--line-strong", "--bg"), ("--accent", "--surface"), ("--accent", "--bg")]


class Paleta(unittest.TestCase):
    def test_los_dos_bloques_del_tema_oscuro_son_identicos(self):
        self.assertEqual(OSCURO_SISTEMA, OSCURO_MANUAL, "el tema oscuro está duplicado (preferencia del sistema y data-theme): mantenlos iguales")

    def test_ambos_temas_definen_las_mismas_variables_de_color(self):
        colores = lambda v: {k for k, x in v.items() if x.startswith(("#", "rgb"))}
        self.assertEqual(colores(CLARO), colores(OSCURO_MANUAL))

    def comprobar(self, nombre, tema):
        malos = []
        for t, f in PARES_TEXTO:
            r = contraste(tema[t], tema[f])
            if r < 4.5:
                malos.append("%s sobre %s = %.2f" % (t, f, r))
        for t, f in PARES_COMPONENTE:
            r = contraste(tema[t], tema[f])
            if r < 3.0:
                malos.append("%s sobre %s = %.2f (mínimo 3)" % (t, f, r))
        self.assertEqual(malos, [], "tema %s: contrastes por debajo de WCAG AA" % nombre)

    def test_tema_claro_cumple_wcag_aa(self):
        self.comprobar("claro", CLARO)

    def test_tema_oscuro_cumple_wcag_aa(self):
        self.comprobar("oscuro", OSCURO_MANUAL)

    def test_el_contraste_se_calcula_bien(self):
        self.assertAlmostEqual(contraste("#000000", "#ffffff"), 21.0, places=1)
        self.assertAlmostEqual(contraste("#777777", "#ffffff"), 4.48, places=1)

    def test_los_tres_bloques_tienen_color_propio(self):
        for tema in (CLARO, OSCURO_MANUAL):
            self.assertEqual(len({tema["--a"], tema["--b"], tema["--c"]}), 3)
            self.assertEqual(len({tema["--a-soft"], tema["--b-soft"], tema["--c-soft"]}), 3)


# ---------------------------------------------------------------- resaltado de los datos clave
def a_rgba(valor):
    """'#rrggbb' o 'rgba(r, g, b, a)' -> (r, g, b, alfa)."""
    v = valor.strip()
    if v.startswith("#"):
        h = v.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)", v)
    assert m, "color no reconocido: " + valor
    return int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4) or 1)


def sobre_fondo(valor, fondo_hex):
    """Color efectivo (hex) de `valor` (con transparencia) pintado encima de `fondo_hex`."""
    r, g, b, a = a_rgba(valor)
    fr, fg, fb, _ = a_rgba(fondo_hex)
    return "#%02x%02x%02x" % tuple(round(a * c + (1 - a) * f) for c, f in ((r, fr), (g, fg), (b, fb)))


class Resaltado(unittest.TestCase):
    """El resaltado (negritas del temario y coincidencias del buscador) debe leerse bien sobre cualquier fondo en que aparece."""
    FONDOS = ("--bg", "--surface", "--surface-2", "--accent-soft", "--warn-soft", "--ok-soft", "--ko-soft")

    def comprobar(self, nombre, tema):
        malos = []
        for fondo in self.FONDOS:
            relleno = sobre_fondo(tema["--mark-bg"], tema[fondo])
            r = contraste(tema["--mark-fg"], relleno)
            if r < 4.5:
                malos.append("texto del resaltado sobre %s = %.2f" % (fondo, r))
        for fondo in ("--bg", "--surface"):  # la línea inferior es lo que distingue el resaltado: >= 3:1 (WCAG 1.4.11)
            r = contraste(tema["--mark-line"], tema[fondo])
            if r < 3.0:
                malos.append("línea del resaltado sobre %s = %.2f (mínimo 3)" % (fondo, r))
        self.assertEqual(malos, [], "tema %s: resaltado por debajo de WCAG AA" % nombre)

    def test_resaltado_claro_cumple_wcag_aa(self):
        self.comprobar("claro", CLARO)

    def test_resaltado_oscuro_cumple_wcag_aa(self):
        self.comprobar("oscuro", OSCURO_MANUAL)

    def test_el_relleno_con_transparencia_se_mezcla_bien(self):
        self.assertEqual(sobre_fondo("rgba(255, 255, 255, 0.5)", "#000000"), "#808080")
        self.assertEqual(sobre_fondo("#fef08a", "#123456"), "#fef08a")

    def test_las_reglas_usan_las_variables_del_resaltado(self):
        for sel in (".read strong", "mark"):
            d = props(sel)
            self.assertEqual(d.get("color"), "var(--mark-fg)", sel)
            self.assertEqual(d.get("background-color"), "var(--mark-bg)", sel)
            self.assertIn("var(--mark-line)", d.get("border-bottom", ""), sel)
        # el buscador no debe volver a pintar sus coincidencias con otro estilo, ni heredar el color
        self.assertNotIn("color", props(".sres mark"))
        self.assertNotIn("background", props(".sres mark"))


# ---------------------------------------------------------------- media queries
class MediaQueries(unittest.TestCase):
    MEDIOS = {m for m, _, _ in REGLAS if m}

    def test_cubren_movil_tablet_y_escritorio(self):
        movil = [m for m in self.MEDIOS if re.search(r"\(max-width:\s*767px\)", m)]
        tablet = [m for m in self.MEDIOS if re.search(r"\(min-width:\s*768px\)", m) and re.search(r"\(max-width:\s*1023px\)", m)]
        escritorio = [m for m in self.MEDIOS if re.search(r"\(min-width:\s*1024px\)", m)]
        self.assertTrue(movil, "falta @media (max-width: 767px)")
        self.assertTrue(tablet, "falta @media (min-width: 768px) and (max-width: 1023px)")
        self.assertTrue(escritorio, "falta @media (min-width: 1024px)")

    def test_los_puntos_de_corte_no_se_solapan_ni_dejan_huecos(self):
        anchos = set()
        for m in self.MEDIOS:
            anchos |= {int(x) for x in re.findall(r"(?:min|max)-width:\s*(\d+)px", m)}
        self.assertTrue({767, 768, 1023, 1024} <= anchos, anchos)
        self.assertFalse({x for x in anchos if x in (520, 860, 1000)}, "quedan puntos de corte antiguos: " + str(sorted(anchos)))

    def test_movil_usa_barra_inferior_y_oculta_la_navegacion_superior(self):
        self.assertEqual(props(".nav", "max-width: 767px").get("display"), "none")
        self.assertEqual(props(".tabbar", "max-width: 767px").get("display"), "flex")
        self.assertEqual(props(".tabbar", "max-width: 767px").get("position"), "fixed")
        self.assertEqual(base(".tabbar").get("display"), "none")  # fuera de móvil no se ve
        self.assertIn("env(safe-area-inset-bottom", props(".tabbar", "max-width: 767px").get("padding-bottom", ""))
        self.assertIn("--tabbar-h", props("main", "max-width: 767px").get("padding-block", ""))  # el contenido no queda tapado

    def test_tablet_y_movil_usan_indice_flotante_y_escritorio_lateral(self):
        for medio in ("max-width: 1023px", "max-width: 767px"):
            self.assertEqual(props(".toc", medio).get("position"), "fixed", medio)
            self.assertEqual(props(".toc-fab", medio).get("position"), "fixed", medio)
        self.assertEqual(props(".toc", "min-width: 1024px").get("position"), "sticky")
        self.assertEqual(props(".toc", "min-width: 1024px").get("display"), "block")
        self.assertIn("none", props(".toc-fab", "min-width: 1024px").get("display", ""))
        self.assertEqual(base(".toc").get("display"), "none")  # cerrado por defecto
        self.assertEqual(props(".toc.abierto", "max-width: 1023px").get("display"), "block")

    def test_la_ficha_solo_tiene_dos_columnas_en_escritorio(self):
        self.assertEqual(base(".ficha").get("grid-template-columns"), "minmax(0, 1fr)")
        self.assertIn("240px", props(".ficha", "min-width: 1024px").get("grid-template-columns", ""))

    def test_hay_ajustes_tactiles_y_de_movimiento_reducido(self):
        self.assertTrue(any("pointer: coarse" in m for m in self.MEDIOS))
        self.assertTrue(any("hover: none" in m for m in self.MEDIOS))
        self.assertTrue(any("prefers-reduced-motion" in m for m in self.MEDIOS))
        self.assertIn("transition: none", sin_comentarios(CSS))


# ---------------------------------------------------------------- desbordamientos
class SinDesbordes(unittest.TestCase):
    def test_guardas_globales(self):
        self.assertEqual(props("html").get("overflow-x"), "clip")
        self.assertEqual(props("body").get("overflow-x"), "clip")
        self.assertEqual(props("body").get("max-width"), "100%")
        self.assertEqual(props("img").get("max-width"), "100%")
        self.assertIn("border-box", sin_comentarios(CSS))

    def test_ningun_ancho_fijo_supera_un_movil_pequeno_fuera_de_un_contenedor_con_scroll(self):
        permitidos = {".tbl table"}  # su contenedor .tbl tiene overflow-x: auto
        for medio, sel, d in REGLAS:
            if re.search(r"min-width:\s*(7|8|9|1\d)\d\dpx", medio):
                continue  # reglas que solo se aplican en pantallas anchas
            for prop in ("width", "min-width"):
                m = re.fullmatch(r"(\d+)px", d.get(prop, ""))
                if m and int(m.group(1)) > 360:
                    self.assertIn(sel, permitidos, "%s { %s: %s } puede desbordar un móvil" % (sel, prop, d[prop]))

    def test_las_tablas_y_listas_largas_se_desplazan_dentro_de_su_contenedor(self):
        self.assertEqual(props(".tbl").get("overflow-x"), "auto")
        self.assertIn("touch", props(".tbl").get("-webkit-overflow-scrolling", ""))
        self.assertEqual(props(".tbl").get("scroll-behavior"), "smooth")
        self.assertEqual(props(".nav").get("overflow-x"), "auto")
        self.assertEqual(props(".temapick").get("overflow"), "auto")
        self.assertEqual(props(".sres").get("overflow"), "auto")

    def test_el_texto_largo_se_parte_en_vez_de_desbordar(self):
        for sel in (".tema-row .t", ".normas a", ".normas .ver", ".nov-titulo", ".nov-detalle", ".qtext", ".explica .ref", ".callout li", ".aviso-ley ul"):
            self.assertRegex(props(sel).get("overflow-wrap", ""), r"anywhere|break-word", sel)
        self.assertRegex(props("h1").get("overflow-wrap", ""), r"anywhere|break-word")

    def test_las_etiquetas_largas_pueden_ocupar_varias_lineas(self):
        for sel in (".chip", ".pill", ".tagb"):
            self.assertEqual(props(sel).get("max-width"), "100%", sel)
        self.assertNotIn("white-space", base(".chip"))  # solo .pill y .tagb son nowrap; .chip puede partirse
        self.assertEqual(props(".pill").get("white-space"), "nowrap")


# ---------------------------------------------------------------- interacción y accesibilidad táctil
class Interaccion(unittest.TestCase):
    def test_estados_hover_y_active(self):
        existentes = {s for _, s, _ in REGLAS}
        for sel in (".btn:hover", ".btn:active", ".btn--primary:hover", ".btn--primary:active", ".iconbtn:hover", ".iconbtn:active",
                    ".nav a:hover", ".nav a:active", ".tema-row:hover", ".tema-row:active", ".opt:hover:not([disabled])", ".opt:active:not([disabled])",
                    ".chipbtn:hover", ".chipbtn:active", ".palette button:hover", ".palette button:active", ".tabbar a:active", ".sheet a:active",
                    ".field:focus", ".toc-fab:active", "button.flash-card:hover", "button.flash-card:active"):
            self.assertIn(sel, existentes, "falta el estado " + sel)

    def test_foco_visible_con_anillo_grueso(self):
        d = props(":focus-visible")
        self.assertRegex(d.get("outline", ""), r"^[3-9]px solid var\(--accent\)")

    def test_objetivos_tactiles_de_al_menos_44_px(self):
        px = lambda v: int(re.match(r"(\d+)px", v).group(1))
        self.assertGreaterEqual(px(props(".btn")["min-height"]), 44)
        self.assertGreaterEqual(px(props(".iconbtn")["width"]), 42)
        self.assertGreaterEqual(px(props(".iconbtn", "pointer: coarse")["width"]), 46)
        self.assertGreaterEqual(px(props(".opt")["min-height"]), 52)
        self.assertGreaterEqual(px(props(".opt", "max-width: 767px")["min-height"]), 56)
        self.assertGreaterEqual(px(props(".btn", "max-width: 767px")["min-height"]), 48)
        self.assertGreaterEqual(px(props(".field")["min-height"]), 44)
        self.assertGreaterEqual(px(props(":root")["--tabbar-h"]), 56)
        self.assertGreaterEqual(px(props(".sheet a")["min-height"]), 48)
        self.assertGreaterEqual(px(props(".rate .btn", "max-width: 767px")["min-height"]), 52)

    def test_el_desplazamiento_de_tablas_avisa_con_sombras(self):
        self.assertIn("local", props(".tbl").get("background-attachment", ""))


class HtmlYJs(unittest.TestCase):
    def test_la_pagina_publicada_declara_el_viewport_movil(self):
        emp = leer(os.path.join(HERRAMIENTAS, "empaquetar.py"))
        self.assertIn('name="viewport" content="width=device-width,initial-scale=1', emp)

    def test_la_barra_inferior_cubre_todas_las_secciones(self):
        app = leer(os.path.join(RAIZ, "web", "js", "app.js"))
        nav = set(re.findall(r'^\s*\["(\w+)", "[^"]+"\],?\s*$', app.split("var VALIDAS")[0], re.M))
        tabs = set(re.findall(r'^\s*\["(\w+)", "[^"]+", \'<', app, re.M))
        mas = set(re.findall(r'"(\w+)"', re.search(r"var MAS = \[(.*?)\];", app).group(1)))
        self.assertTrue(nav, "no se leyó la lista NAV")
        self.assertEqual(tabs | mas, nav)
        self.assertFalse(tabs & mas)
        self.assertLessEqual(len(tabs) + 1, 5)  # máximo cinco accesos en la barra (incluido «Más»)

    def test_las_clases_que_usa_el_js_para_el_diseno_existen_en_el_css(self):
        selectores = " ".join(s for _, s, _ in REGLAS)
        for clase in ("tabbar", "sheet", "sheet-fondo", "toc-fab", "toc", "abierto", "badge", "overlay", "flash-card",
                      "motivos", "diag-fila", "vel-reloj", "interruptor", "repaso-grid", "clave-rapida", "cajas",
                      "nivel", "nivel--dominado", "refrescar", "dominio-ficha", "desafio-card", "subita-dots", "premio",
                      "dudas-cmp", "comparativa", "calor", "calor-sem", "constancia-cifras", "logro", "logro--on", "aparece"):
            self.assertIn("." + clase, selectores, clase)


if __name__ == "__main__":
    unittest.main()
