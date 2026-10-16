"""Fase 5: scripts de construcción y empaquetado (build.py, empaquetar.py), boe.py, gen_meta.py y coherencia de la documentación."""
import datetime
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET
from unittest import mock

from _comun import AQUI, HERRAMIENTAS, RAIZ, ConTemporal, cargar_modulo, escribir, fichas_reales, leer

empaquetar = cargar_modulo("empaquetar")
boe = cargar_modulo("boe")
NODE = shutil.which("node")


def ejecutar(args, cwd):
    return subprocess.run([sys.executable, "-I"] + args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def leer_datos_js(ruta):
    txt = leer(ruta)
    meta = json.loads(re.search(r"window\.AA_META=(.*?);\r?\n", txt, re.S).group(1))
    temas = json.loads(re.search(r"window\.AA_TEMAS=(.*?);\s*$", txt, re.S).group(1))
    return txt, meta, temas


# ====================================================================== build.py
class ConstruccionDeDatosJs(ConTemporal):
    def repo(self, sin=()):
        raiz = self.ruta("repo")
        os.makedirs(os.path.join(raiz, "herramientas"))
        for script in ("build.py", "auditar_preguntas.py", "citas.py"):  # build.py lee el estado de la auditoría
            shutil.copy(os.path.join(HERRAMIENTAS, script), os.path.join(raiz, "herramientas", script))
        os.makedirs(os.path.join(raiz, "datos", "temas"), exist_ok=True)
        os.makedirs(os.path.join(raiz, "fuentes"), exist_ok=True)
        shutil.copy(os.path.join(RAIZ, "datos", "meta.json"), os.path.join(raiz, "datos", "meta.json"))
        for extra in ("auditoria.json", "proceso.json"):  # estado de la auditoría y datos del proceso selectivo
            if os.path.exists(os.path.join(RAIZ, "datos", extra)):
                shutil.copy(os.path.join(RAIZ, "datos", extra), os.path.join(raiz, "datos", extra))
        shutil.copy(os.path.join(RAIZ, "fuentes", "pesos-por-tema.json"), os.path.join(raiz, "fuentes", "pesos-por-tema.json"))
        for p in fichas_reales():
            if os.path.basename(p) not in sin:
                shutil.copy(p, os.path.join(raiz, "datos", "temas", os.path.basename(p)))
        return raiz

    def construir(self, raiz):
        return ejecutar(["herramientas/build.py"], raiz)

    def test_datos_js_contiene_todo_y_solo_ascii(self):
        raiz = self.repo()
        r = self.construir(raiz)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        txt, meta, temas = leer_datos_js(os.path.join(raiz, "web", "data", "datos.js"))
        txt.encode("ascii")  # lanza UnicodeEncodeError si hay algo que no sea ASCII
        self.assertTrue(txt.startswith("/* Generado por herramientas/build.py"))
        self.assertEqual(len(meta["temas"]), 45)
        self.assertEqual(sorted(map(int, temas)), list(range(1, 46)))
        fichas = {int(os.path.basename(p)[5:7]): json.loads(leer(p)) for p in fichas_reales()}
        self.assertEqual(meta["resumen"], {"temasConContenido": 45,
                                            "preguntas": sum(len(f["preguntas"]) for f in fichas.values()),
                                            "tarjetas": sum(len(f["tarjetas"]) for f in fichas.values())})
        self.assertEqual(meta["generado"], datetime.date.today().isoformat())

    def test_cada_ficha_llega_integra_salvo_el_peso_que_se_completa(self):
        raiz = self.repo()
        self.construir(raiz)
        _, meta, temas = leer_datos_js(os.path.join(raiz, "web", "data", "datos.js"))
        pesos = {x["tema"]: x for x in json.loads(leer(os.path.join(RAIZ, "fuentes", "pesos-por-tema.json")))}
        for p in fichas_reales():
            origen = json.loads(leer(p))
            n = origen["tema"]
            publicada = temas[str(n)]
            # build.py completa el peso y añade a cada pregunta su estado de verificación («verif»)
            limpia = lambda d: {k: ([{kk: vv for kk, vv in q.items() if kk != "verif"} for q in v] if k == "preguntas" else v)
                                for k, v in d.items() if k != "peso"}
            self.assertEqual(limpia(publicada), limpia(origen), "tema %d" % n)
            self.assertEqual(publicada["peso"]["nivel"], pesos[n]["peso"])  # pesos-por-tema.json manda sobre la ficha
            self.assertEqual(publicada["peso"]["media"], pesos[n]["preguntasMedia"])
            self.assertEqual(publicada["peso"]["confianza"], pesos[n]["confianza"])
            self.assertEqual([q["id"] for q in publicada["preguntas"]], [q["id"] for q in origen["preguntas"]])
        self.assertTrue(all("peso" in t and "media" in t for t in meta["temas"]))

    def test_un_tema_sin_ficha_se_avisa_y_no_se_cuenta(self):
        raiz = self.repo(sin=("tema-45.json",))
        r = self.construir(raiz)
        self.assertEqual(r.returncode, 0)
        self.assertRegex(r.stdout, r"Temas sin contenido todav.a: \[45\]")
        _, meta, temas = leer_datos_js(os.path.join(raiz, "web", "data", "datos.js"))
        self.assertEqual(meta["resumen"]["temasConContenido"], 44)
        self.assertNotIn("45", temas)

    def test_si_falta_un_id_o_esta_repetido_la_construccion_falla(self):
        raiz = self.repo()
        ruta = os.path.join(raiz, "datos", "temas", "tema-23.json")
        d = json.loads(leer(ruta))
        d["preguntas"][0].pop("id")
        escribir(ruta, json.dumps(d, ensure_ascii=False))
        r = self.construir(raiz)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("ids", r.stderr + r.stdout)
        self.assertFalse(os.path.exists(os.path.join(raiz, "web", "data", "datos.js")))
        d["preguntas"][0]["id"] = d["preguntas"][1]["id"]
        escribir(ruta, json.dumps(d, ensure_ascii=False))
        self.assertNotEqual(self.construir(raiz).returncode, 0)

    def test_el_datos_js_del_repositorio_esta_al_dia_con_las_fichas(self):
        raiz = self.repo()
        self.construir(raiz)
        nuevo = leer_datos_js(os.path.join(raiz, "web", "data", "datos.js"))
        actual = leer_datos_js(os.path.join(RAIZ, "web", "data", "datos.js"))
        nuevo[1].pop("generado")
        actual[1].pop("generado")
        self.assertEqual(actual[1], nuevo[1], "web/data/datos.js está desfasado: ejecuta python -I herramientas/build.py")
        self.assertEqual(actual[2], nuevo[2], "web/data/datos.js está desfasado: ejecuta python -I herramientas/build.py")


# ====================================================================== empaquetar.py
class ConversionAAscii(unittest.TestCase):
    def test_js_escapa_lo_que_no_es_ascii_y_se_recupera_igual(self):
        for s in ("Policía Nacional", "ñandú → ≈ « » ¿qué?", "emoji 😀 y 𝒜", "solo ascii 123"):
            esc = empaquetar.escapar_js(s)
            esc.encode("ascii")
            self.assertEqual(json.loads('"%s"' % esc), s)
        self.assertEqual(empaquetar.escapar_js("Policía"), "Polic\\u00eda")
        self.assertEqual(empaquetar.escapar_js("😀"), "\\ud83d\\ude00")

    def test_html_usa_entidades_numericas(self):
        for s in ("<p>Policía y ñ</p>", "a — b · c"):
            esc = empaquetar.entidades_html(s)
            esc.encode("ascii")
            self.assertEqual(html.unescape(esc), s)
        self.assertEqual(empaquetar.entidades_html("é"), "&#233;")

    def test_css_admite_acentos_solo_en_comentarios(self):
        self.assertEqual(empaquetar.css_ascii("/* Política */ a { color: red }", "x.css"), "/* Politica */ a { color: red }")
        with self.assertRaises(SystemExit):
            empaquetar.css_ascii('a::after { content: "é" }', "x.css")


class EmpaquetadoCompleto(ConTemporal):
    def empaquetar(self):
        raiz = self.ruta("repo")
        shutil.copytree(os.path.join(RAIZ, "web"), os.path.join(raiz, "web"))
        os.makedirs(os.path.join(raiz, "herramientas"))
        shutil.copy(os.path.join(HERRAMIENTAS, "empaquetar.py"), os.path.join(raiz, "herramientas", "empaquetar.py"))
        r = ejecutar(["herramientas/empaquetar.py"], raiz)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return raiz

    def test_dist_y_sitio_reflejan_web_y_todo_el_texto_es_ascii(self):
        raiz = self.empaquetar()
        web = sorted(os.path.relpath(os.path.join(d, f), os.path.join(raiz, "web")) for d, _, fs in os.walk(os.path.join(raiz, "web")) for f in fs)
        for carpeta in ("dist", "sitio"):
            base = os.path.join(raiz, carpeta)
            publicados = sorted(os.path.relpath(os.path.join(d, f), base) for d, _, fs in os.walk(base) for f in fs if f != ".nojekyll")
            self.assertEqual(publicados, web, carpeta)
            for rel in publicados:
                if rel.endswith((".js", ".css", ".html")):
                    with open(os.path.join(base, rel), "rb") as fh:
                        fh.read().decode("ascii")
        self.assertTrue(os.path.exists(os.path.join(raiz, "sitio", ".nojekyll")))
        index = leer(os.path.join(raiz, "sitio", "index.html"))
        self.assertTrue(index.startswith("<!doctype html>\n<html lang=\"es\">"))
        self.assertIn('<meta charset="utf-8">', index[:600])  # el charset debe ir en los primeros 1024 bytes
        self.assertIn('<div id="app">', index)

    @unittest.skipUnless(NODE, "Node.js no está instalado")
    def test_los_datos_publicados_son_identicos_a_los_originales(self):
        raiz = self.empaquetar()
        comparador = os.path.join(AQUI, "js", "comparar_datos.js")
        for fichero in ("datos.js", "novedades.js", "fisicas.js"):
            r = subprocess.run([NODE, comparador, os.path.join(RAIZ, "web", "data", fichero), os.path.join(raiz, "dist", "data", fichero)],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            self.assertEqual(r.returncode, 0, fichero + "\n" + r.stdout + r.stderr)

    @unittest.skipUnless(NODE, "Node.js no está instalado")
    def test_todos_los_scripts_publicados_compilan(self):
        raiz = self.empaquetar()
        for f in glob.glob(os.path.join(raiz, "dist", "**", "*.js"), recursive=True):
            r = subprocess.run([NODE, "--check", f], capture_output=True, text=True, encoding="utf-8", errors="replace")
            self.assertEqual(r.returncode, 0, f + "\n" + r.stderr[-400:])


@unittest.skipUnless(NODE, "Node.js no está instalado")
class SintaxisDeLaWeb(unittest.TestCase):
    def test_todos_los_js_de_web_compilan(self):
        for f in sorted(glob.glob(os.path.join(RAIZ, "web", "js", "*.js")) + glob.glob(os.path.join(RAIZ, "web", "data", "*.js"))):
            r = subprocess.run([NODE, "--check", f], capture_output=True, text=True, encoding="utf-8", errors="replace")
            self.assertEqual(r.returncode, 0, f + "\n" + r.stderr[-400:])


# ====================================================================== boe.py
def xml_texto(bloques):
    """bloques: {id: [(fecha_vigencia, id_norma, texto), ...]}"""
    out = []
    for bid, versiones in bloques.items():
        vs = "".join('<version id_norma="%s" fecha_publicacion="%s" fecha_vigencia="%s"><p>%s</p></version>' % (mod, vig, vig, txt) for vig, mod, txt in versiones)
        out.append('<bloque id="%s">%s</bloque>' % (bid, vs))
    return "<response><data><texto>%s</texto></data></response>" % "".join(out)


XML_META = ("<response><data><metadatos><titulo>Ley de prueba</titulo><fecha_actualizacion>20261005T000000Z</fecha_actualizacion>"
            "<estatus_derogacion>N</estatus_derogacion></metadatos></data></response>")


class DescargaDeNormas(unittest.TestCase):
    BLOQUES = {
        "a1": [("20000101", "BOE-A-2000-1", "Artículo 1 original"), ("20240101", "BOE-A-2024-9", "Artículo 1 reformado")],
        "a2": [("20000101", "BOE-A-2000-1", "Artículo 2 vigente"), ("20261023", "BOE-A-2026-20528", "Artículo 2 futuro")],
        "a3": [("20261023", "BOE-A-2026-20528", "Artículo 3 nuevo")],
        "a4": [("20000101", "BOE-A-2000-1", "Artículo 4 sin cambios")],
    }

    def consolidada(self, fecha, con_futuras=True):
        def falso(url, accept="application/xml"):
            return XML_META if url.endswith("/metadatos") else xml_texto(self.BLOQUES)
        with mock.patch.object(boe, "get", falso):
            return boe.consolidada("BOE-A-2000-1", fecha, con_futuras)

    def test_texto_vigente_hoy_con_las_futuras_marcadas(self):
        txt, n = self.consolidada("20261016")
        self.assertEqual(n, 2)
        self.assertIn("# Vigente a: 2026-10-16", txt)
        self.assertIn("# Versiones futuras: 2 bloque(s)", txt)
        self.assertIn("[a1]\nArtículo 1 reformado", txt)
        self.assertNotIn("Artículo 1 original", txt)  # solo la última versión vigente
        self.assertIn("[a2]\nArtículo 2 vigente\n\n[a2 · desde 2026-10-23 · BOE-A-2026-20528]\nArtículo 2 futuro", txt)
        self.assertIn("[a3 · NUEVO desde 2026-10-23 · BOE-A-2026-20528]\nArtículo 3 nuevo", txt)
        self.assertNotIn("\n[a3]\n", txt)
        self.assertIn("[a4]\nArtículo 4 sin cambios", txt)

    def test_sin_futuras_solo_deja_lo_vigente(self):
        txt, n = self.consolidada("20261016", con_futuras=False)
        self.assertEqual(n, 2)  # se cuentan, pero no se incluyen
        self.assertNotIn("Artículo 2 futuro", txt)
        self.assertNotIn("Artículo 3 nuevo", txt)
        self.assertIn("NO se incluyen (--sin-futuras)", txt)

    def test_vigente_a_otra_fecha(self):
        txt, _ = self.consolidada("20230615")
        self.assertIn("[a1]\nArtículo 1 original\n\n[a1 · desde 2024-01-01 · BOE-A-2024-9]\nArtículo 1 reformado", txt)
        sin, _ = self.consolidada("20230615", con_futuras=False)
        self.assertIn("[a1]\nArtículo 1 original", sin)
        self.assertNotIn("Artículo 1 reformado", sin)
        txt, n = self.consolidada("20261101")
        self.assertEqual(n, 0)
        self.assertIn("[a2]\nArtículo 2 futuro", txt)
        self.assertIn("[a3]\nArtículo 3 nuevo", txt)
        self.assertIn("# Versiones futuras: ninguna", txt)

    def test_el_dia_de_entrada_en_vigor_ya_rige(self):
        txt, _ = self.consolidada("20261023")
        self.assertIn("[a2]\nArtículo 2 futuro", txt)

    def test_separar_ordena_las_versiones_por_fecha(self):
        bloque = ET.fromstring(xml_texto({"a1": [("20240101", "B", "nueva"), ("20000101", "A", "vieja"), ("20270101", "C", "futura")]}))
        vigente, futuras = boe.separar(list(bloque.iter("version")), "20260101")
        self.assertEqual("".join(vigente.itertext()), "nueva")
        self.assertEqual(["".join(v.itertext()) for v in futuras], ["futura"])


# ====================================================================== gen_meta.py y documentación
class GeneracionDeMeta(ConTemporal):
    def test_meta_json_se_reproduce_desde_el_anexo_literal(self):
        raiz = self.ruta("repo")
        os.makedirs(os.path.join(raiz, "fuentes"))
        shutil.copy(os.path.join(RAIZ, "fuentes", "anexo-I-literal.txt"), os.path.join(raiz, "fuentes", "anexo-I-literal.txt"))
        shutil.copy(os.path.join(HERRAMIENTAS, "gen_meta.py"), self.ruta("repo", "gen_meta.py"))
        r = ejecutar(["gen_meta.py"], raiz)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        generado = json.loads(leer(os.path.join(raiz, "datos", "meta.json")))
        actual = json.loads(leer(os.path.join(RAIZ, "datos", "meta.json")))
        self.assertEqual(generado, actual)
        self.assertEqual([t["tema"] for t in actual["temas"]], list(range(1, 46)))


class CoherenciaDeLaDocumentacion(unittest.TestCase):
    def test_leeme_menciona_todos_los_scripts(self):
        leeme = leer(os.path.join(RAIZ, "LEEME.md"))
        for p in sorted(glob.glob(os.path.join(HERRAMIENTAS, "*.py"))):
            self.assertIn(os.path.basename(p), leeme, "LEEME.md no menciona " + os.path.basename(p))

    def test_las_guias_no_nombran_herramientas_que_ya_no_existen(self):
        existentes = {os.path.basename(p) for p in glob.glob(os.path.join(HERRAMIENTAS, "*.py"))}
        for doc in ("LEEME.md", os.path.join("herramientas", "GUIA_ACTUALIZACION.md"), os.path.join("herramientas", "GUIA_REDACTORES.md")):
            for nombre in set(re.findall(r"\b([a-z_]+\.py)\b", leer(os.path.join(RAIZ, doc)))):
                self.assertIn(nombre, existentes, "%s menciona %s, que no existe" % (doc, nombre))

    def test_leeme_no_fija_cifras_exactas_que_caducan(self):
        leeme = leer(os.path.join(RAIZ, "LEEME.md"))
        # (el simulacro «de 100 preguntas» es el formato del examen, no el tamaño del banco)
        for m in re.finditer(r"\b\d{3,4} (preguntas tipo test|preguntas originales|tarjetas)\b", leeme):
            self.assertTrue(leeme[:m.start()].endswith(("Más de ", "más de ")), "cifra exacta que caduca: " + m.group(0))

    def test_el_workflow_usa_scripts_que_existen(self):
        for nombre in set(re.findall(r"herramientas/([a-z_]+\.py)", leer(os.path.join(RAIZ, ".github", "workflows", "vigilar-y-publicar.yml")))):
            self.assertTrue(os.path.exists(os.path.join(HERRAMIENTAS, nombre)), nombre)


if __name__ == "__main__":
    unittest.main()
