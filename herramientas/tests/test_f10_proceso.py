"""Fase 10 (plan F4): datos del proceso selectivo (idioma A2 y psicotécnicos), su paso por build.py y su uso en la web."""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import unittest

from _comun import HERRAMIENTAS, RAIZ, ConTemporal, cargar_modulo, fichas_reales, leer

PROCESO = os.path.join(RAIZ, "datos", "proceso.json")
WEB_JS = os.path.join(RAIZ, "web", "js")


def dias_habiles(desde, n):
    """Día en que vence un plazo de n días hábiles contados desde el siguiente a `desde` (sin sábados ni domingos)."""
    d = desde
    while n:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


class EsquemaProceso(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = json.loads(leer(PROCESO))

    def test_fuente_es_la_convocatoria_vigilada(self):
        f = self.p["fuente"]
        self.assertRegex(f["boe"], r"^BOE-A-\d{4}-\d+$")
        self.assertIn(f["boe"], f["url"])
        self.assertTrue(f["url"].startswith("https://www.boe.es/"))
        vc = cargar_modulo("vigilar_convocatoria")
        self.assertIn(f["boe"], vc.CONOCIDAS_INICIALES)  # la que la vigilancia ya conoce

    def test_calendario_coherente_con_quince_dias_habiles(self):
        c = self.p["calendario2026"]
        pub, ini, fin = (datetime.date.fromisoformat(c[k]) for k in ("publicacion", "plazoInicio", "plazoFin"))
        self.assertEqual(ini, dias_habiles(pub, 1))
        self.assertEqual(fin, dias_habiles(pub, 15))
        self.assertIn("ince días hábiles", c["plazoTexto"])

    def test_idioma(self):
        i = self.p["idioma"]
        for k in ("requisito", "consecuencia", "comoSeAcredita", "meritosTexto", "consejo"):
            self.assertIsInstance(i[k], str)
            self.assertGreater(len(i[k]), 30, k)
        self.assertIn("A2", i["requisito"])
        self.assertRegex(i["requisito"], r"inglés o francés")
        cert = i["certificadosA2"]
        self.assertEqual(sorted(cert), ["frances", "ingles", "inglesYFrances"])
        for k, lista in cert.items():
            self.assertTrue(lista and all(isinstance(x, str) and x.strip() for x in lista), k)
            self.assertEqual(len(lista), len(set(lista)), k)
        self.assertTrue(any("Escuela Oficial de Idiomas" in x for x in cert["inglesYFrances"]))
        self.assertTrue(any("DELF A2" in x for x in cert["frances"]))
        niveles = [m["nivel"] for m in i["meritos"]]
        puntos = [m["puntos"] for m in i["meritos"]]
        self.assertEqual(niveles, ["B1", "B2", "C1", "C2"])
        self.assertEqual(puntos, sorted(puntos))
        self.assertEqual(max(puntos), 2)
        self.assertIn("máximo 2", i["meritosTexto"])

    def test_meritos_coinciden_con_el_texto_de_la_pagina(self):
        """paginas.js repite los méritos de idioma en «Calificación final»: no pueden contradecir proceso.json."""
        txt = leer(os.path.join(WEB_JS, "paginas.js"))
        m = re.search(r"\*\*idiomas\*\* \(([^)]*)\)", txt)
        self.assertIsNotNone(m)
        pares = dict(re.findall(r"([ABC][12]) (\d+(?:,\d+)?)", m.group(1)))
        esperado = {x["nivel"]: ("%g" % x["puntos"]).replace(".", ",") for x in self.p["idioma"]["meritos"]}
        self.assertEqual(pares, esperado)

    def test_psicotecnicos(self):
        ps = self.p["psicotecnicos"]
        for k in ("base", "descripcion", "formula", "calificacion", "cuando", "impugnacion"):
            self.assertIsInstance(ps[k], str, k)
        self.assertIn("60 minutos", ps["descripcion"])
        self.assertIn("n−1", ps["formula"])
        self.assertRegex(ps["calificacion"], r"[Aa]pto o no apto")

    def test_sin_mojibake(self):
        txt = leer(PROCESO)
        self.assertNotRegex(txt, r"Ã.|â€|�")


class BuildIncluyeProceso(ConTemporal):
    def repo(self, con_proceso=True):
        raiz = self.ruta("repo")
        os.makedirs(os.path.join(raiz, "herramientas"))
        for script in ("build.py", "auditar_preguntas.py", "citas.py"):
            shutil.copy(os.path.join(HERRAMIENTAS, script), os.path.join(raiz, "herramientas", script))
        os.makedirs(os.path.join(raiz, "datos", "temas"))
        os.makedirs(os.path.join(raiz, "fuentes"))
        shutil.copy(os.path.join(RAIZ, "datos", "meta.json"), os.path.join(raiz, "datos", "meta.json"))
        if con_proceso:
            shutil.copy(PROCESO, os.path.join(raiz, "datos", "proceso.json"))
        shutil.copy(os.path.join(RAIZ, "fuentes", "pesos-por-tema.json"), os.path.join(raiz, "fuentes", "pesos-por-tema.json"))
        for p in fichas_reales():
            shutil.copy(p, os.path.join(raiz, "datos", "temas", os.path.basename(p)))
        return raiz

    def meta(self, raiz):
        r = subprocess.run([sys.executable, "-I", "herramientas/build.py"], cwd=raiz, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        txt = leer(os.path.join(raiz, "web", "data", "datos.js"))
        txt.encode("ascii")
        return json.loads(re.search(r"window\.AA_META=(.*?);\r?\n", txt, re.S).group(1))

    def test_build_publica_proceso_en_meta(self):
        self.assertEqual(self.meta(self.repo())["proceso"], json.loads(leer(PROCESO)))

    def test_build_sin_proceso_no_falla(self):
        self.assertIsNone(self.meta(self.repo(con_proceso=False))["proceso"])


class WebUsaProceso(unittest.TestCase):
    def test_paginas_idioma_y_psicotecnicos(self):
        txt = leer(os.path.join(WEB_JS, "paginas.js"))
        for trozo in ("AA.meta.proceso", "P.idioma", "P.psicotecnicos", 'id: "tengo-a2"', 'store.ajuste("a2", check.checked)',
                      "Idioma: nivel A2 obligatorio", 'enlace("psicotecnicos"'):
            self.assertIn(trozo, txt)
        # La sección del idioma va antes de las pruebas de la oposición
        self.assertLess(txt.index("Idioma: nivel A2 obligatorio"), txt.index("Pruebas de la fase de oposición"))

    def test_panel_recuerda_el_a2_hasta_marcarlo(self):
        txt = leer(os.path.join(WEB_JS, "vistas.js"))
        self.assertIn('if (!store.ajuste("a2"))', txt)
        self.assertIn("AA.plazoEstimado(conv.publicacion)", txt)

    def test_psicotecnicos_lee_las_bases(self):
        txt = leer(os.path.join(WEB_JS, "psicotecnicos.js"))
        self.assertIn("AA.meta.proceso", txt)
        self.assertIn("store.guardarPsico", txt)
        self.assertIn("V.psicotecnicos", txt)

    def test_store_guarda_ajustes_y_psicotecnicos(self):
        txt = leer(os.path.join(WEB_JS, "store.js"))
        self.assertRegex(txt, r"function fresh\(\) \{\s*return \{[^\n]*aj: \{\}, psico: \[\]")


if __name__ == "__main__":
    unittest.main()
