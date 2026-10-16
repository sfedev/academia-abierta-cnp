"""Fase 7 (plan F1.1): auditoría automática del banco de preguntas contra el texto del BOE. Sin red."""
import contextlib
import io
import json
import os
import re
import unittest
from unittest import mock

from _comun import RAIZ, ConTemporal, cargar_modulo, escribir, fichas_reales

ap = cargar_modulo("auditar_preguntas")
build = cargar_modulo("build")

HOY = "2026-10-16"
LEY = "BOE-A-2000-1"
OTRA = "BOE-A-2001-2"

TEXTO_LEY = """# Ley 1/2000, de 1 de enero, de pruebas.
# Identificador: BOE-A-2000-1
# Texto consolidado, última actualización de la consolidación: 20261001T000000Z
# Vigente a: 2026-10-16
# Versiones futuras: 1 bloque(s)
# Derogada: N
# URL: https://www.boe.es/buscar/act.php?id=BOE-A-2000-1

[a1]
Artículo 1. Plazo de detención.
La detención no podrá durar más de setenta y dos horas.

[a2]
Artículo 2. Multas.
Las infracciones graves se sancionarán con multa de 601 a 30.000 euros.

[a3]
Artículo 3. Edad.
Están obligados los mayores de catorce años.

[a3 · desde 2099-01-01 · BOE-A-2098-5]
Artículo 3. Edad.
Están obligados los mayores de dieciséis años.

[a4]
Artículo 4 bis. Prescripción.
Las infracciones prescribirán a los seis meses, al año o a los dos años.

[a5]
Artículo 7.
(Derogado)

[a6]
Artículo cuarenta y nueve. Comité.
El Comité estará integrado por ocho representantes, cuatro del Estado y cuatro de las Comunidades Autónomas.

[a7]
Artículo 588 septies a. Presupuestos.
Podrá autorizarse para delitos de terrorismo y delitos cometidos contra menores.

[a8]
Artículo 27. Ayudas.
Rentas inferiores al 75 por 100 del salario mínimo interprofesional.

[a9]
Art. 24.º
La remoción requerirá informe de la Comisión.

[a10]
Art. 37.
Art. 3 de la Ley citada: esta línea no abre otro artículo.
"""


def ficha(preguntas, normas=None):
    return {"tema": 9, "normas": normas if normas is not None else [{"nombre": "Ley 1/2000, de 1 de enero, de pruebas", "boe": LEY}],
            "preguntas": preguntas}


def pregunta(qid, enunciado, opciones, correcta, ref):
    return {"id": qid, "enunciado": enunciado, "opciones": opciones, "correcta": correcta, "ref": ref, "explicacion": "x", "dificultad": 2}


class Cifras(unittest.TestCase):
    def test_palabras_a_numero(self):
        self.assertEqual(ap.palabras_a_numero(["setenta", "y", "dos"]), 72)
        self.assertEqual(ap.palabras_a_numero(["seiscientos", "mil"]), 600000)
        self.assertEqual(ap.palabras_a_numero(["dos", "mil", "quinientos"]), 2500)
        self.assertIsNone(ap.palabras_a_numero(["plazo"]))

    def test_normalizar(self):
        self.assertIn("72 horas", ap.normalizar("setenta y dos horas"))
        self.assertIn("2 y 3 dias", ap.normalizar("dos y tres días"))  # «y» entre unidades separa dos números
        self.assertIn("600000 euros", ap.normalizar("600.000 €"))
        self.assertIn("1 ano", ap.normalizar("un año"))
        self.assertIn("al 1 ano", ap.normalizar("prescribirán al año"))
        self.assertIn("75 porciento", ap.normalizar("75 por 100"))
        self.assertIn("50 porciento", ap.normalizar("el 50 %"))
        self.assertIn("una persona", ap.normalizar("una persona"))  # artículo indeterminado: no es una cifra
        self.assertIn("art. 17.2 ce", ap.normalizar("art. 17.2 CE"))  # la puntuación se conserva

    def test_datos_ignoran_articulos_normas_anos_y_fechas(self):
        d = ap.datos_de("Según el art. 36.2 de la LO 4/2015 (BOE de 7 de febrero de 1992), son 6 meses")
        self.assertEqual(d, {("6", "mes")})

    def test_datos_reconocen_unidades_con_puntuacion_pegada(self):
        self.assertIn(("30000", "euro"), ap.datos_de("multa de 601 a 30.000 euros;"))
        self.assertIn(("8", "representante"), ap.datos_de("por ocho representantes, cuatro del Estado"))

    def test_aparece_exige_la_unidad(self):
        t = ap.normalizar("en el plazo máximo de setenta y dos horas, y 24 meses después")
        self.assertTrue(ap.aparece(("72", "hora"), t))
        self.assertFalse(ap.aparece(("24", "hora"), t))
        self.assertTrue(ap.aparece(("24", None), t))


class LecturaDeNormas(ConTemporal):
    def setUp(self):
        super().setUp()
        escribir(self.ruta("BOE-A-2000-1.txt"), TEXTO_LEY)
        self.n = ap.leer_norma(self.ruta("BOE-A-2000-1.txt"))

    def test_claves_de_articulo(self):
        a = self.n["articulos"]
        for clave in ("1", "2", "3", "4 bis", "7", "49", "588 septies a", "27", "24", "37"):
            self.assertIn(clave, a, clave)
        self.assertTrue(self.n["consolidada"])
        self.assertIn("Art. 3 de la Ley", a["37"]["texto"])  # rótulo abreviado («Art. 24.º») solo al abrir el bloque

    def test_derogados_y_reformas_futuras(self):
        a = self.n["articulos"]
        self.assertTrue(a["7"]["derogado"])
        self.assertFalse(a["1"]["derogado"])
        self.assertEqual(a["3"]["futuras"], ["2099-01-01"])
        self.assertIn("16 anos", a["3"]["futuras_txt"][0][1])

    def test_texto_original_sin_consolidar(self):
        escribir(self.ruta("o.txt"), "# Convenio\n# Identificador: BOE-A-1990-1\n# AVISO: texto ORIGINAL de la publicación\n# URL: x\n\n"
                                     "Artículo 1.\nTexto uno con diez días.\nArtículo 2.\nTexto dos.\n")
        n = ap.leer_norma(self.ruta("o.txt"))
        self.assertFalse(n["consolidada"])
        self.assertEqual(sorted(n["articulos"]), ["1", "2"])
        self.assertIn("10 dias", n["articulos"]["1"]["norm"])

    def test_buscar_articulo_junta_las_subdivisiones(self):
        a = ap.buscar_articulo(self.n, "588 septies")
        self.assertIsNotNone(a)
        self.assertIn("terrorismo", a["texto"])


class EstadosDeLaAuditoria(ConTemporal):
    def setUp(self):
        super().setUp()
        escribir(self.ruta("BOE-A-2000-1.txt"), TEXTO_LEY)
        self.cache = {LEY: ap.leer_norma(self.ruta("BOE-A-2000-1.txt"))}

    def estado(self, q, normas=None, revisiones=None):
        return ap.auditar_pregunta(q, ficha([q], normas), self.cache, HOY, revisiones)

    def test_verificada_si_la_cifra_esta_en_el_articulo(self):
        r = self.estado(pregunta("q_09_01", "¿Plazo máximo?", ["72 horas", "48 horas", "24 horas"], 0, "art. 1 Ley 1/2000"))
        self.assertEqual(r["estado"], "verificada", r)
        self.assertTrue(r["articulos"][0]["encontrado"])

    def test_revisar_si_la_cifra_no_esta(self):
        r = self.estado(pregunta("q_09_02", "¿Plazo máximo?", ["48 horas", "72 horas", "24 horas"], 0, "art. 1 Ley 1/2000"))
        self.assertEqual(r["estado"], "revisar")
        self.assertIn("48 hora", " ".join(r["motivos"]))
        self.assertIn("72 hora", " ".join(r["avisos"]))  # un distractor coincide con el artículo

    def test_cuantias_y_porcentajes(self):
        self.assertEqual(self.estado(pregunta("q_09_03", "¿Multa?", ["De 601 a 30.000 euros", "De 100 a 600 euros", "De 30.001 a 600.000 euros"], 0, "art. 2 Ley 1/2000"))["estado"], "verificada")
        self.assertEqual(self.estado(pregunta("q_09_04", "¿Rentas?", ["75 % del SMI", "50 % del SMI", "100 % del SMI"], 0, "art. 27 Ley 1/2000"))["estado"], "verificada")

    def test_articulo_con_letra_y_sufijos(self):
        self.assertEqual(self.estado(pregunta("q_09_05", "¿Composición?", ["Ocho representantes", "Seis", "Diez"], 0, "art. 49.1 Ley 1/2000"))["estado"], "verificada")
        self.assertEqual(self.estado(pregunta("q_09_06", "¿Prescripción?", ["Seis meses, un año y dos años", "Uno, dos y tres años", "Tres meses"], 0, "art. 4 bis Ley 1/2000"))["estado"], "verificada")

    def test_articulo_inexistente_con_la_norma_nombrada(self):
        r = self.estado(pregunta("q_09_07", "¿Qué dice?", ["10 días", "5 días", "3 días"], 0, "art. 99 Ley 1/2000"))
        self.assertEqual(r["estado"], "revisar")
        self.assertIn("No se encuentra el art. 99", " ".join(r["motivos"]))

    def test_sin_norma_identificable_no_es_un_error(self):
        normas = [{"nombre": "Ley 1/2000", "boe": LEY}, {"nombre": "Ley 2/2001", "boe": OTRA}]
        r = self.estado(pregunta("q_09_08", "¿Qué dice?", ["10 días", "5 días", "3 días"], 0, "art. 99 (sin norma)"), normas)
        self.assertEqual(r["estado"], "no_verificable")

    def test_fuente_que_no_es_del_boe(self):
        r = self.estado(pregunta("q_09_09", "¿Tilde?", ["Sí", "No", "A veces"], 0, "RAE, Ortografía 2010, 4.6"))
        self.assertEqual(r["estado"], "no_verificable")

    def test_norma_que_no_esta_en_la_ficha(self):
        r = self.estado(pregunta("q_09_10", "¿Plazo?", ["72 horas", "48 horas", "24 horas"], 0, "art. 1 LO 5/2000"))
        self.assertEqual(r["estado"], "no_verificable")
        self.assertIn("no está entre las normas de la ficha", " ".join(r["motivos"]))

    def test_derogado_sin_esperarlo_y_esperandolo(self):
        r = self.estado(pregunta("q_09_11", "¿Qué dice el art. 7?", ["10 días", "5 días", "3 días"], 0, "art. 7 Ley 1/2000"))
        self.assertEqual(r["estado"], "revisar")
        self.assertIn("derogado", " ".join(r["motivos"]))
        r = self.estado(pregunta("q_09_12", "¿Qué pasó con el art. 7?", ["Fue derogado", "Sigue vigente", "Se amplió"], 0, "art. 7 Ley 1/2000"))
        self.assertEqual(r["estado"], "verificada")

    def test_reforma_futura_avisa(self):
        r = self.estado(pregunta("q_09_13", "¿Edad?", ["Mayores de 14 años", "De 16 años", "De 18 años"], 0, "art. 3 Ley 1/2000"))
        self.assertEqual(r["estado"], "verificada")
        self.assertIn("2099-01-01", " ".join(r["avisos"]))

    def test_redaccion_futura_anunciada(self):
        r = self.estado(pregunta("q_09_14", "¿Edad?", ["Mayores de 16 años", "De 14 años", "De 18 años"], 0, "art. 3 Ley 1/2000 (redacción de la Ley 9/2098)"))
        self.assertEqual(r["estado"], "verificada", r)
        r = self.estado(pregunta("q_09_15", "¿Edad?", ["Mayores de 16 años", "De 14 años", "De 18 años"], 0, "art. 3 Ley 1/2000"))
        self.assertEqual(r["estado"], "revisar")
        self.assertIn("redacción que entra en vigor", " ".join(r["motivos"]))

    def test_pregunta_en_negativo_comprueba_las_opciones_verdaderas(self):
        q = pregunta("q_09_16", "Señale la afirmación INCORRECTA sobre la detención:", ["Puede durar 96 horas", "No puede pasar de 72 horas", "Es un plazo máximo"], 0, "art. 1 Ley 1/2000")
        r = self.estado(q)
        self.assertEqual(r["estado"], "verificada", r)
        self.assertIn("negativo", " ".join(r["avisos"]))

    def test_respuesta_calculada(self):
        r = self.estado(pregunta("q_09_17", "Detenido el lunes a las 10:00, ¿hasta cuándo?", ["Hasta las 10:00 horas del jueves", "Del miércoles", "Del viernes"], 0, "art. 1 Ley 1/2000"))
        self.assertEqual(r["estado"], "referencia")

    def test_revision_manual_y_su_caducidad(self):
        q = pregunta("q_09_18", "¿Plazo?", ["48 horas", "72 horas", "24 horas"], 0, "art. 1 Ley 1/2000")
        rev = {"q_09_18": {"huella": ap.huella(q), "fecha": HOY, "nota": "comprobado", "por": "ia"}}
        r = self.estado(q, revisiones=rev)
        self.assertEqual(r["estado"], "revisada")
        self.assertEqual(r["estado_auto"], "revisar")
        self.assertEqual(r["revision"]["por"], "ia")
        q["opciones"][0] = "36 horas"  # si la pregunta cambia, la revisión deja de valer
        self.assertEqual(self.estado(q, revisiones=rev)["estado"], "revisar")


class LineaDeComandos(ConTemporal):
    def setUp(self):
        super().setUp()
        escribir(self.ruta("cache", "BOE-A-2000-1.txt"), TEXTO_LEY)
        qs = [pregunta("q_09_01", "¿Plazo?", ["72 horas", "48 horas", "24 horas"], 0, "art. 1 Ley 1/2000"),
              pregunta("q_09_02", "¿Plazo?", ["48 horas", "72 horas", "24 horas"], 0, "art. 1 Ley 1/2000")]
        escribir(self.ruta("temas", "tema-09.json"), json.dumps(ficha(qs), ensure_ascii=False))
        self.parches = [mock.patch.object(ap, n, self.ruta(*p)) for n, p in (
            ("TEMAS", ("temas",)), ("CACHE", ("cache",)), ("SALIDA", ("datos", "auditoria.json")),
            ("REVISIONES", ("datos", "auditoria-revisiones.json")), ("INFORME", ("fuentes", "auditoria.md")))]
        for p in self.parches:
            p.start()
            self.addCleanup(p.stop)

    def ejecutar(self, *argv):
        # cargar_cache captura CACHE como valor por defecto al importarse: se le da la caché del test
        with mock.patch.object(ap, "cargar_cache", lambda ids, cache=None: {LEY: ap.leer_norma(self.ruta("cache", "BOE-A-2000-1.txt"))}):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                ap.main(list(argv))
        return out.getvalue()

    def test_genera_json_e_informe(self):
        self.ejecutar()
        d = json.load(open(self.ruta("datos", "auditoria.json"), encoding="utf-8"))
        self.assertEqual(d["preguntas"]["q_09_01"]["estado"], "verificada")
        self.assertEqual(d["preguntas"]["q_09_02"]["estado"], "revisar")
        self.assertEqual(d["resumen"]["revisar"], 1)
        md = open(self.ruta("fuentes", "auditoria.md"), encoding="utf-8").read()
        self.assertIn("q_09_02", md)

    def test_revisar_y_fusionar(self):
        self.ejecutar("revisar", "q_09_02", "--por", "ia", "--nota", "visto", "--archivo", self.ruta("trabajo", "g.json"))
        self.assertFalse(os.path.exists(self.ruta("datos", "auditoria-revisiones.json")))  # con --archivo no toca el principal
        self.ejecutar("fusionar", self.ruta("trabajo", "g.json"))
        self.ejecutar()
        d = json.load(open(self.ruta("datos", "auditoria.json"), encoding="utf-8"))
        self.assertEqual(d["preguntas"]["q_09_02"]["estado"], "revisada")
        self.assertEqual(d["preguntas"]["q_09_02"]["revision"]["por"], "ia")


class Integracion(ConTemporal):
    def test_build_copia_el_estado_solo_si_la_pregunta_no_cambio(self):
        q1 = pregunta("q_09_01", "¿Plazo?", ["72 horas", "48 horas", "24 horas"], 0, "art. 1 Ley 1/2000")
        q2 = pregunta("q_09_02", "¿Plazo?", ["48 horas", "72 horas", "24 horas"], 0, "art. 1 Ley 1/2000")
        aud = {"generado": HOY, "preguntas": {"q_09_01": {"estado": "verificada", "huella": ap.huella(q1)},
                                              "q_09_02": {"estado": "revisada", "huella": "otra", "revision": {"por": "ia"}}}}
        escribir(self.ruta("auditoria.json"), json.dumps(aud))
        temas = {9: {"preguntas": [q1, q2]}}
        res = build.anadir_auditoria(temas, self.ruta("auditoria.json"))
        self.assertEqual(q1["verif"], {"e": "verificada"})
        self.assertNotIn("verif", q2)
        self.assertEqual(res["resumen"], {"verificada": 1})

    def test_la_web_muestra_la_insignia(self):
        test_js = open(os.path.join(RAIZ, "web", "js", "test.js"), encoding="utf-8").read()
        store_js = open(os.path.join(RAIZ, "web", "js", "store.js"), encoding="utf-8").read()
        self.assertIn("insigniaVerificacion(q)", test_js)
        self.assertIn("verif: q.verif", store_js)
        for estado in ap.ESTADOS:
            self.assertIn(estado + ":", test_js, estado)


class DatosReales(unittest.TestCase):
    """La auditoría guardada en el repositorio debe estar al día con las fichas y sin pendientes."""

    @classmethod
    def setUpClass(cls):
        ruta = os.path.join(RAIZ, "datos", "auditoria.json")
        if not os.path.exists(ruta):
            raise unittest.SkipTest("sin datos/auditoria.json")
        cls.aud = json.load(open(ruta, encoding="utf-8"))["preguntas"]
        cls.preguntas = {q["id"]: q for p in fichas_reales() for q in json.load(open(p, encoding="utf-8"))["preguntas"]}

    def test_todas_las_preguntas_estan_auditadas_y_al_dia(self):
        faltan = sorted(set(self.preguntas) - set(self.aud))
        self.assertEqual(faltan, [], "preguntas sin auditar: ejecuta herramientas/auditar_preguntas.py")
        desfasadas = sorted(q for q, d in self.preguntas.items() if self.aud[q]["huella"] != ap.huella(d))
        self.assertEqual(desfasadas, [], "preguntas cambiadas después de la auditoría: vuelve a ejecutarla")

    def test_no_quedan_preguntas_pendientes_de_revisar(self):
        pend = sorted(q for q, r in self.aud.items() if r["estado"] == "revisar" and q in self.preguntas)
        self.assertEqual(pend, [], "la auditoría marca preguntas por revisar: corrígelas o regístralas con `revisar`")


class NotasDudas(unittest.TestCase):
    """Las notas `dudas` se publican en la ficha: hablan al opositor, no del proceso de trabajo (GUIA_REVISION.md §4)."""
    PROCESO = re.compile(r"no (?:he|hemos) podido|no se pudo (?:abrir|descargar|leer|acceder)|rechaz[óo] la descarga|buscador|"
                         r"extractos?\b|encargo|redactor|WebFetch|WebSearch|\.py\b|trabajo/|\b(?:HTTP|error)\s*\d{3}\b|\b403\b",
                         re.I)

    def test_notas_breves_y_sin_notas_de_proceso(self):
        malas = []
        for p in fichas_reales():
            for i, nota in enumerate(json.load(open(p, encoding="utf-8")).get("dudas", [])):
                m = self.PROCESO.search(nota)
                if m or len(nota) > 300:
                    malas.append("%s dudas[%d]: %s" % (os.path.basename(p), i, m.group(0) if m else "%d caracteres" % len(nota)))
        self.assertEqual(malas, [], "reescribe estas notas para el opositor (máximo 300 caracteres)")

    def test_el_patron_detecta_notas_de_proceso(self):
        self.assertTrue(self.PROCESO.search("Se contrastó con extractos del buscador."))
        self.assertTrue(self.PROCESO.search("La web devolvió error 403 y no he podido leerla."))
        self.assertFalse(self.PROCESO.search("La distinción es doctrinal: no hay definición legal; se expone la clasificación habitual."))
        self.assertFalse(self.PROCESO.search("El 40 % del IPREM; GooScan es una herramienta antigua de búsqueda."))


if __name__ == "__main__":
    unittest.main()
