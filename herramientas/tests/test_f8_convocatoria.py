"""Fase 8 (plan F2): vigilancia de la convocatoria de Escala Básica en el BOE y comparación del Anexo I. Sin red."""
import datetime
import json
import os
import unittest
import urllib.error
from unittest import mock

from _comun import RAIZ, ConTemporal, cargar_modulo, escribir, leer

vc = cargar_modulo("vigilar_convocatoria")

TITULO_2027 = ("Resolución de 2 de julio de 2027, de la Dirección General de la Policía, por la que se convoca oposición libre "
               "para cubrir plazas de alumnos/as de la Escuela Nacional de Policía, de la División de Formación y "
               "Perfeccionamiento, aspirantes a ingreso en la Escala Básica, categoría de Policía, de la Policía Nacional.")
SENUELOS = [
    "Resolución de 2 de julio de 2027, de la Dirección General de la Policía, por la que se convoca oposición libre para cubrir plazas de alumnos/as de la Escuela Nacional de Policía, aspirantes a ingreso en la Escala Ejecutiva, categoría de Inspector/a, de la Policía Nacional.",
    "Resolución de 2 de julio de 2027, de la Dirección General de la Policía, por la que se nombran policías alumnos a las personas aprobadas en la fase de oposición para ingreso en la Escala Básica, categoría de Policía, convocada por Resolución de 7 de julio de 2026.",
    "Resolución de 6 de agosto de 2026, de la Dirección General de la Policía, por la que se publica la relación de personas admitidas y excluidas a la oposición libre (…) Escala Básica, categoría de Policía, convocada por Resolución de 7 de julio de 2026.",
]

ANEXO_ACTUAL = ("ANEXO I — Temario oficial\n    A) Ciencias Jurídicas\n"
                "    Tema 1. El Derecho: concepto y acepciones.\n"
                "    Tema 2. La Constitución Española (I): estructura y caracteres.\n"
                "    Tema 3. La Constitución Española (II): De la Corona. De las Cortes Generales.\n"
                "    Tema 4. La Unión Europea: referencia histórica. El Derecho derivado.\n"
                "    Tema 5. Ciberdelincuencia y agentes de la amenaza: botnet, phishing, ransomware.\n")


def documento(temas, extra=""):
    lineas = ["Resolución de 2 de julio de 2027", "1.1 Número de plazas.", "Se convocan 3.000 plazas de alumnos/as de la Escuela Nacional.",
              "Las 2.400 plazas restantes serán cubiertas por el procedimiento de oposición libre.",
              "3.1 Plazo para solicitud de admisión.", "Quince días hábiles contados a partir del día siguiente al de la publicación de la presente resolución en el «Boletín Oficial del Estado».",
              "La prueba consistirá en la contestación por escrito en cincuenta minutos a un cuestionario de cien preguntas, con tres alternativas.",
              extra, "ANEXO I", "A) Ciencias Jurídicas"]
    lineas += ["Tema %d. %s" % (n, t) for n, t in temas]
    lineas += ["ANEXO II", "Tema 99. No es del temario."]
    return "\n".join(lineas)


ACTUAL = {1: "El Derecho: concepto y acepciones.", 2: "La Constitución Española (I): estructura y caracteres.",
          3: "La Constitución Española (II): De la Corona. De las Cortes Generales.",
          4: "La Unión Europea: referencia histórica. El Derecho derivado.",
          5: "Ciberdelincuencia y agentes de la amenaza: botnet, phishing, ransomware."}


class Reconocimiento(unittest.TestCase):
    def test_reconoce_la_convocatoria_de_escala_basica(self):
        self.assertTrue(vc.es_convocatoria_escala_basica(TITULO_2027))
        # la de 2026 tal como salió en el BOE («del Cuerpo Nacional de Policía»)
        self.assertTrue(vc.es_convocatoria_escala_basica("Resolución de 7 de julio de 2026, de la Dirección General de la Policía, por la que se convoca oposición libre para cubrir plazas de alumnos/as de la Escuela Nacional de Policía, de la División de Formación y Perfeccionamiento, aspirantes a ingreso en la Escala Básica, categoría de Policía, del Cuerpo Nacional de Policía."))

    def test_descarta_otras_resoluciones_parecidas(self):
        for t in SENUELOS:
            self.assertFalse(vc.es_convocatoria_escala_basica(t), t[:80])


class ExtraccionDelAnexo(unittest.TestCase):
    def test_extrae_los_temas_con_espacios_no_separables_y_solo_del_anexo_i(self):
        temas = vc.extraer_anexo_i(documento(ACTUAL.items()))
        self.assertEqual(temas, ACTUAL)  # el «Tema 99» del Anexo II no cuenta

    def test_datos_basicos(self):
        d = vc.datos_basicos(documento(ACTUAL.items()))
        self.assertEqual(d["plazas"], 3000)
        self.assertEqual(d["plazasLibres"], 2400)
        self.assertTrue(d["plazo"].startswith("Quince días hábiles"))
        self.assertIn("cien preguntas", d["primeraPrueba"])

    def test_sin_anexo(self):
        self.assertEqual(vc.extraer_anexo_i("Resolución sin anexos"), {})


class Comparacion(unittest.TestCase):
    def test_temario_identico(self):
        c = vc.comparar_temarios(ACTUAL, dict(ACTUAL))
        self.assertEqual(c["iguales"], 5)
        self.assertFalse(vc.hay_cambios(c))
        self.assertEqual(vc.temas_afectados(c), [])

    def test_epigrafe_modificado(self):
        nuevo = dict(ACTUAL)
        nuevo[2] = "La Constitución Española (I): estructura, caracteres y reforma de 2024 del artículo 49."
        c = vc.comparar_temarios(ACTUAL, nuevo)
        self.assertEqual([m["tema"] for m in c["modificados"]], [2])
        self.assertEqual(vc.temas_afectados(c), [2])

    def test_tema_nuevo_intercalado_renumera_los_siguientes(self):
        nuevo = {1: ACTUAL[1], 2: ACTUAL[2], 3: "Inteligencia artificial y delitos: el Reglamento europeo de IA.",
                 4: ACTUAL[3], 5: ACTUAL[4], 6: ACTUAL[5]}
        c = vc.comparar_temarios(ACTUAL, nuevo)
        self.assertEqual([n["tema"] for n in c["nuevos"]], [3])
        self.assertEqual(c["modificados"], [])
        self.assertEqual(sorted((r["de"], r["a"]) for r in c["renumerados"]), [(3, 4), (4, 5), (5, 6)])
        self.assertEqual(vc.temas_afectados(c), [3, 4, 5])

    def test_tema_eliminado(self):
        nuevo = {1: ACTUAL[1], 2: ACTUAL[2], 3: ACTUAL[3], 4: ACTUAL[4]}
        c = vc.comparar_temarios(ACTUAL, nuevo)
        self.assertEqual([e["tema"] for e in c["eliminados"]], [5])


class ComprobacionDiaria(ConTemporal):
    def setUp(self):
        super().setUp()
        self.parches = [mock.patch.object(vc, n, self.ruta(*p)) for n, p in (
            ("ESTADO", ("datos", "vigilancia", "convocatoria.json")), ("NOVEDADES", ("datos", "novedades.json")),
            ("ANEXO_ACTUAL", ("fuentes", "anexo.txt")), ("RESUMEN_MD", ("convocatoria-resumen.md",)))]
        for p in self.parches:
            p.start()
            self.addCleanup(p.stop)
        escribir(self.ruta("fuentes", "anexo.txt"), ANEXO_ACTUAL)
        escribir(self.ruta("datos", "novedades.json"), json.dumps({"items": []}))
        escribir(self.ruta("datos", "vigilancia", "convocatoria.json"), json.dumps({"ultimaFecha": "2027-06-30", "conocidas": ["BOE-A-2026-15055"]}))
        nuevo = dict(ACTUAL)
        nuevo[2] = "La Constitución Española (I): estructura, caracteres y reforma de 2024 del artículo 49."
        self.doc = documento(nuevo.items())
        self.sumarios = {
            "20270701": [{"identificador": "BOE-A-2027-1", "titulo": SENUELOS[0], "url_html": ""}],
            "20270702": [{"identificador": "BOE-A-2027-2", "titulo": TITULO_2027, "url_html": ""},
                         {"identificador": "BOE-A-2027-3", "titulo": SENUELOS[1], "url_html": ""}],
        }

    def ejecutar(self, hoy=datetime.date(2027, 7, 4)):
        def sumario(f):
            if f == "20270704":  # domingo: no hay BOE
                return []
            return self.sumarios.get(f, [])
        with mock.patch.object(vc, "sumario", side_effect=sumario), \
             mock.patch.object(vc, "texto_documento", return_value=self.doc), \
             mock.patch.object(vc, "regenerar_web") as web, \
             mock.patch.dict(os.environ, {"GITHUB_OUTPUT": self.ruta("salida.txt")}):
            r = vc.comprobar(hoy=hoy)
        return r, web

    def test_detecta_la_convocatoria_y_compara_el_temario(self):
        (revisadas, nuevas), web = self.ejecutar()
        self.assertEqual(revisadas, 4)  # del 1 al 4 de julio
        self.assertEqual(len(nuevas), 1)
        n = nuevas[0]
        self.assertEqual(n["tipo"], "convocatoria")
        self.assertEqual(n["norma"]["id"], "BOE-A-2027-2")
        self.assertEqual(n["publicacion"], "2027-07-02")
        self.assertEqual(n["temas"], [2])
        self.assertEqual(n["convocatoria"]["plazas"], 3000)
        self.assertTrue(n["convocatoria"]["cambios"])
        guardadas = json.loads(leer(self.ruta("datos", "novedades.json")))["items"]
        self.assertEqual([i["norma"]["id"] for i in guardadas], ["BOE-A-2027-2"])
        estado = json.loads(leer(self.ruta("datos", "vigilancia", "convocatoria.json")))
        self.assertEqual(estado["ultimaFecha"], "2027-07-04")
        self.assertIn("BOE-A-2027-2", estado["conocidas"])
        md = leer(self.ruta("convocatoria-resumen.md"))
        self.assertIn("Cambia el tema 2", md)
        self.assertIn("A2", md)
        self.assertIn("nueva=1", leer(self.ruta("salida.txt")))
        web.assert_called_once()

    def test_no_repite_el_aviso(self):
        self.ejecutar()
        (revisadas, nuevas), _ = self.ejecutar(hoy=datetime.date(2027, 7, 6))
        self.assertEqual(nuevas, [])
        self.assertEqual(revisadas, 2)  # solo los días nuevos (5 y 6 de julio)
        self.assertEqual(len(json.loads(leer(self.ruta("datos", "novedades.json")))["items"]), 1)
        self.assertFalse(os.path.exists(self.ruta("convocatoria-resumen.md")))

    def test_limita_los_dias_por_ejecucion(self):
        dias = vc.fechas_pendientes("2027-01-01", datetime.date(2027, 12, 31), maximo=60)
        self.assertEqual(len(dias), 60)
        self.assertEqual(dias[0], "20270102")

    def test_un_dia_sin_boe_no_rompe_la_comprobacion(self):
        def falla(url, accept="application/json", intentos=3):
            raise urllib.error.HTTPError(url, 404, "no", {}, None)
        with mock.patch.object(vc, "get", side_effect=falla):
            self.assertEqual(vc.sumario("20270704"), [])


class IntegracionWebYWorkflow(unittest.TestCase):
    def test_la_web_trata_las_convocatorias(self):
        vistas = leer(os.path.join(RAIZ, "web", "js", "vistas.js"))
        self.assertIn('"convocatoria"', vistas)
        css = leer(os.path.join(RAIZ, "web", "css", "app.css"))
        for clase in (".conv-cambios", ".insignia-conv", ".aviso-conv"):
            self.assertIn(clase, css, clase)

    def test_el_workflow_vigila_la_convocatoria_y_avisa(self):
        wf = leer(os.path.join(RAIZ, ".github", "workflows", "vigilar-y-publicar.yml"))
        self.assertIn("python -I herramientas/vigilar_convocatoria.py", wf)
        self.assertIn("steps.convocatoria.outputs.nueva", wf)
        self.assertIn("datos/vigilancia", wf)  # el estado se guarda en el repositorio

    def test_el_estado_inicial_conoce_la_convocatoria_de_2026(self):
        ruta = os.path.join(RAIZ, "datos", "vigilancia", "convocatoria.json")
        self.assertTrue(os.path.exists(ruta), "falta datos/vigilancia/convocatoria.json")
        estado = json.loads(leer(ruta))
        self.assertIn("BOE-A-2026-15055", estado["conocidas"])


if __name__ == "__main__":
    unittest.main()
