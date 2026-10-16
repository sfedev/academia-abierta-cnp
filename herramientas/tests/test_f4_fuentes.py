"""Fase 4: fuentes locales (sin Google Fonts) y su empaquetado en dist/ y sitio/."""
import os
import re
import shutil
import subprocess
import sys
import unittest

from _comun import HERRAMIENTAS, RAIZ, ConTemporal, cargar_modulo, leer

WEB = os.path.join(RAIZ, "web")
FUENTES = os.path.join(WEB, "css", "fuentes")
ESPERADAS = {"archivo-variable.woff2", "ibm-plex-mono-400.woff2", "ibm-plex-mono-500.woff2",
             "source-serif-4-italic-400.woff2", "source-serif-4-variable.woff2"}
descargar = cargar_modulo("descargar_fuentes")


class FuentesEnElRepositorio(unittest.TestCase):
    def test_estan_los_woff2_y_son_validos(self):
        presentes = {f for f in os.listdir(FUENTES) if f.endswith(".woff2")}
        self.assertEqual(presentes, ESPERADAS)
        for f in presentes:
            with open(os.path.join(FUENTES, f), "rb") as fh:
                datos = fh.read()
            self.assertEqual(datos[:4], b"wOF2", f)
            self.assertGreater(len(datos), 8000, f)

    def test_la_licencia_viaja_con_las_fuentes(self):
        txt = leer(os.path.join(FUENTES, "LICENCIAS.txt"))
        for familia in ("Archivo", "IBM Plex Mono", "Source Serif 4"):
            self.assertIn(familia, txt)
        self.assertGreaterEqual(txt.upper().count("SIL OPEN FONT LICENSE"), 3)

    def test_app_css_declara_las_familias_con_ficheros_que_existen(self):
        css = leer(os.path.join(WEB, "css", "app.css"))
        caras = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)
        self.assertGreaterEqual(len(caras), 5)
        declaradas = set()
        for c in caras:
            familia = re.search(r'font-family:\s*"([^"]+)"', c).group(1)
            estilo = re.search(r"font-style:\s*(\w+)", c).group(1)
            peso = re.search(r"font-weight:\s*([\d ]+);", c).group(1).strip()
            self.assertIn("font-display: swap", c)
            url = re.search(r'url\("([^"]+)"\)\s*format\("woff2"\)', c).group(1)
            self.assertTrue(os.path.exists(os.path.join(WEB, "css", url)), url)
            declaradas.add((familia, estilo, peso))
        self.assertTrue({("Archivo", "normal", "400 700"), ("IBM Plex Mono", "normal", "400"), ("IBM Plex Mono", "normal", "500"),
                         ("Source Serif 4", "normal", "400 600"), ("Source Serif 4", "italic", "400")} <= declaradas, declaradas)

    def test_las_familias_que_usa_la_web_estan_declaradas(self):
        css = leer(os.path.join(WEB, "css", "app.css"))
        usadas = {m.strip().strip('"') for v in re.findall(r"--font-(?:ui|read|mono):\s*([^;]+);", css) for m in [v.split(",")[0]]}
        self.assertEqual(usadas, {"Archivo", "Source Serif 4", "IBM Plex Mono"})
        declaradas = set(re.findall(r'@font-face\s*\{[^}]*?font-family:\s*"([^"]+)"', css))
        self.assertTrue(usadas <= declaradas)

    def test_ni_el_html_ni_el_css_ni_el_js_piden_nada_a_google(self):
        for ruta in ("index.html", os.path.join("css", "app.css"), *(os.path.join("js", f) for f in os.listdir(os.path.join(WEB, "js")))):
            self.assertNotRegex(leer(os.path.join(WEB, ruta)), r"fonts\.(googleapis|gstatic)\.com", ruta)
        html = leer(os.path.join(WEB, "index.html"))
        self.assertEqual(re.findall(r'<(?:link|script)\b[^>]*(?:href|src)="(https?:[^"]+)"', html), [])


class EmpaquetadoConFuentes(ConTemporal):
    """Ejecuta empaquetar.py sobre una copia de web/ y comprueba dist/ y sitio/."""

    def copia(self):
        raiz = self.ruta("repo")
        shutil.copytree(WEB, os.path.join(raiz, "web"))
        os.makedirs(os.path.join(raiz, "herramientas"))
        shutil.copy(os.path.join(HERRAMIENTAS, "empaquetar.py"), os.path.join(raiz, "herramientas", "empaquetar.py"))
        return raiz

    def empaquetar(self, raiz):
        return subprocess.run([sys.executable, "-I", os.path.join("herramientas", "empaquetar.py")], cwd=raiz, capture_output=True, text=True, encoding="utf-8", errors="replace")

    def test_dist_y_sitio_incluyen_las_fuentes_y_no_hay_urls_externas(self):
        raiz = self.copia()
        r = self.empaquetar(raiz)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("5 fuentes .woff2 locales", r.stdout)
        for carpeta in ("dist", "sitio"):
            base = os.path.join(raiz, carpeta, "css", "fuentes")
            self.assertEqual({f for f in os.listdir(base) if f.endswith(".woff2")}, ESPERADAS, carpeta)
            self.assertTrue(os.path.exists(os.path.join(base, "LICENCIAS.txt")), carpeta)
            for f in ESPERADAS:  # copiados sin tocar
                with open(os.path.join(base, f), "rb") as a, open(os.path.join(FUENTES, f), "rb") as b:
                    self.assertEqual(a.read(), b.read(), f)
            for dirpath, _, ficheros in os.walk(os.path.join(raiz, carpeta)):
                for f in ficheros:
                    if f.endswith((".html", ".css", ".js")):
                        with open(os.path.join(dirpath, f), "rb") as fh:
                            datos = fh.read()
                        self.assertNotRegex(datos.decode("ascii"), r"fonts\.(googleapis|gstatic)\.com", f)
        # el CSS publicado apunta a los ficheros publicados
        css = leer(os.path.join(raiz, "sitio", "css", "app.css"))
        for url in re.findall(r'url\("(fuentes/[^"]+)"\)', css):
            self.assertTrue(os.path.exists(os.path.join(raiz, "sitio", "css", url)), url)
        self.assertTrue(leer(os.path.join(raiz, "sitio", "index.html")).startswith("<!doctype html>"))

    def test_si_vuelve_un_enlace_a_google_fonts_el_empaquetado_falla(self):
        raiz = self.copia()
        ruta = os.path.join(raiz, "web", "index.html")
        with open(ruta, "a", encoding="utf-8") as f:
            f.write('\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo">\n')
        r = self.empaquetar(raiz)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("recurso externo", r.stderr + r.stdout)

    def test_si_falta_un_fichero_de_fuente_el_empaquetado_falla(self):
        raiz = self.copia()
        os.remove(os.path.join(raiz, "web", "css", "fuentes", "archivo-variable.woff2"))
        r = self.empaquetar(raiz)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no existe el recurso fuentes/archivo-variable.woff2", r.stderr + r.stdout)


class DescargadorDeFuentes(unittest.TestCase):
    CSS = """
/* latin-ext */
@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 400; font-stretch: 100%;
  src: url(https://fonts.gstatic.com/s/archivo/v1/ext.woff2) format('woff2'); unicode-range: U+0100-02BA; }
/* latin */
@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 400; font-stretch: 100%;
  src: url(https://fonts.gstatic.com/s/archivo/v1/var.woff2) format('woff2'); unicode-range: U+0000-00FF; }
/* latin */
@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 700; font-stretch: 100%;
  src: url(https://fonts.gstatic.com/s/archivo/v1/var.woff2) format('woff2'); unicode-range: U+0000-00FF; }
/* latin */
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 500;
  src: url(https://fonts.gstatic.com/s/plex/v1/m500.woff2) format('woff2'); unicode-range: U+0000-00FF; }
"""

    def test_se_queda_con_el_subconjunto_latino_y_une_los_pesos_de_un_mismo_fichero(self):
        b = {x["familia"]: x for x in descargar.bloques_latinos(self.CSS)}
        self.assertEqual(sorted(b), ["Archivo", "IBM Plex Mono"])
        self.assertEqual(sorted(b["Archivo"]["pesos"]), [400, 700])
        self.assertTrue(b["Archivo"]["url"].endswith("var.woff2"))
        self.assertEqual(descargar.nombre_fichero(b["Archivo"], None), "archivo-variable.woff2")
        self.assertEqual(descargar.nombre_fichero(b["IBM Plex Mono"], None), "ibm-plex-mono-500.woff2")

    def test_declaracion_font_face(self):
        b = descargar.bloques_latinos(self.CSS)[0]
        css = descargar.declaracion(b, "archivo-variable.woff2")
        self.assertIn('font-family: "Archivo";', css)
        self.assertIn("font-weight: 400 700;", css)
        self.assertIn("font-display: swap;", css)
        self.assertIn('url("fuentes/archivo-variable.woff2") format("woff2")', css)
        self.assertIn("unicode-range: U+0000-00FF;", css)


if __name__ == "__main__":
    unittest.main()
