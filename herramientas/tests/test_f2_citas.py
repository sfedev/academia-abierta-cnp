"""Fase 2: qué artículos de qué norma cita cada ficha (citas.py)."""
import json
import unittest

from _comun import cargar_modulo, fichas_reales, leer

citas = cargar_modulo("citas")


def ficha(texto, *normas):
    return {"normas": [dict(n) for n in normas], "clave": [texto]}


LEY = {"nombre": "Ley 1/2000, de 1 de enero, de pruebas", "boe": "BOE-A-2000-1"}
CE = {"nombre": "Constitución Española", "boe": "BOE-A-1978-31229"}
LO = {"nombre": "Ley Orgánica 1/2004, de 28 de diciembre", "boe": "BOE-A-2004-21760"}
TREBEP = {"nombre": "Real Decreto Legislativo 5/2015, de 30 de octubre, ... Empleado Público (TREBEP)", "boe": "BOE-A-2015-11719"}


class ExtraccionDeNumeros(unittest.TestCase):
    def nums(self, t):
        return citas.articulos_citados(t)

    def test_formas_de_citar(self):
        self.assertEqual(self.nums("art. 17.2 CE"), {17})
        self.assertEqual(self.nums("Art. 36.5.a) y art. 7 bis"), {36, 7})
        self.assertEqual(self.nums("artículo 49 y artículos 10, 11 y 12"), {49, 10, 11, 12})
        self.assertEqual(self.nums("arts. 6.2, 7.1 y 8 LO 3/2007"), {6, 7, 8})

    def test_rangos(self):
        self.assertEqual(self.nums("arts. 156 a 158"), {156, 157, 158})
        self.assertEqual(self.nums("(arts. 61-69)"), set(range(61, 70)))
        self.assertEqual(self.nums("arts. 17 al 19"), {17, 18, 19})

    def test_no_confunde_otros_numeros(self):
        self.assertEqual(self.nums("La Ley 4/2023, de 28 de febrero, tiene 80 artículos y 3 disposiciones"), set())
        self.assertEqual(self.nums("art. 5 de la Ley 4/2023, de 28 de febrero"), {5})
        self.assertEqual(self.nums("Disposición adicional 13.ª sin artículos"), set())
        self.assertEqual(self.nums("art. 5, 2 días después"), {5, 2})  # lista ambigua: se incluye por prudencia

    def test_ignora_notas_de_novedades_y_dudas(self):
        d = {"clave": ["art. 7"], "novedades": ["art. 49 modificado"], "dudas": ["art. 50"], "normas": [{"verificado": "art. 51"}]}
        self.assertEqual(self.nums("\n".join(citas.textos(d))), {7})


class AtribucionAUnaNorma(unittest.TestCase):
    def por_norma(self, texto, *normas):
        return citas.citados_por_norma(ficha(texto, *normas))

    def test_cita_etiquetada_va_solo_a_su_norma(self):
        r = self.por_norma("Según el art. 17.2 CE se exige orden judicial.", LEY, CE)
        self.assertEqual(r["BOE-A-1978-31229"], {17})
        self.assertEqual(r["BOE-A-2000-1"], set())

    def test_etiquetas_con_numero_de_norma_y_conectores(self):
        for t in ("art. 5 de la Ley 1/2000", "art. 5 Ley 1/2000", "art. 5 (Ley 1/2000)", "art. 5, Ley 1/2000", "art. 5 del texto de la Ley 1/2000".replace("del texto de la ", "de la ")):
            r = self.por_norma(t, LEY, CE)
            self.assertEqual(r["BOE-A-2000-1"], {5}, t)
            self.assertEqual(r["BOE-A-1978-31229"], set(), t)

    def test_abreviatura_entre_parentesis_del_nombre(self):
        r = self.por_norma("art. 49 TREBEP y art. 7 CE", TREBEP, CE)
        self.assertEqual(r["BOE-A-2015-11719"], {49})
        self.assertEqual(r["BOE-A-1978-31229"], {7})

    def test_cita_sin_etiqueta_va_a_todas_las_normas(self):
        r = self.por_norma("El art. 9 establece el plazo.", LEY, CE)
        self.assertEqual(r["BOE-A-2000-1"], {9})
        self.assertEqual(r["BOE-A-1978-31229"], {9})

    def test_cita_con_prosa_antes_de_la_etiqueta_es_ambigua(self):
        # «arts. 24 y 25 desarrollan lo previsto en la CE»: los artículos no son de la CE; no se pueden descartar para la Ley.
        r = self.por_norma("Los arts. 24 y 25 desarrollan lo previsto en la CE.", LEY, CE)
        self.assertEqual(r["BOE-A-2000-1"], {24, 25})
        self.assertEqual(r["BOE-A-1978-31229"], {24, 25})

    def test_dos_normas_cerca_es_ambiguo(self):
        r = self.por_norma("art. 12 de la Ley 1/2000 y de la LO 1/2004", LEY, LO)
        self.assertEqual(r["BOE-A-2000-1"], {12})  # etiqueta inmediata: la primera
        r2 = self.por_norma("art. 12, art. 13 CE", LEY, CE)  # el 12 queda sin etiqueta (la ventana acaba en la siguiente cita)
        self.assertEqual(r2["BOE-A-2000-1"], {12})
        self.assertEqual(r2["BOE-A-1978-31229"], {12, 13})

    def test_cada_cita_lleva_su_etiqueta(self):
        r = self.por_norma("arts. 10 y 11 (LO 1/2004) y art. 12 CE", LO, CE, LEY)
        self.assertEqual(r["BOE-A-2004-21760"], {10, 11})
        self.assertEqual(r["BOE-A-1978-31229"], {12})
        self.assertEqual(r["BOE-A-2000-1"], set())

    def test_etiqueta_de_una_norma_que_no_esta_en_la_ficha_no_descarta_nada(self):
        r = self.por_norma("art. 3 CC", LEY, CE)  # CC no figura entre las normas de la ficha
        self.assertEqual(r["BOE-A-2000-1"], {3})
        self.assertEqual(r["BOE-A-1978-31229"], {3})

    def test_fechas_no_se_toman_por_numero_de_norma(self):
        n = {"nombre": "Ley 4/2023, de 28/02/2023", "boe": "BOE-A-2023-5366"}
        self.assertIsNotNone(citas.alias_de(n))
        self.assertIsNone(citas.alias_de({"nombre": "Convenio sin número ni siglas"}))
        r = self.por_norma("art. 3 de la 02/2023", n, CE)  # «02/2023» no es un número de norma
        self.assertEqual(r["BOE-A-2023-5366"], {3})
        self.assertEqual(r["BOE-A-1978-31229"], {3})


class ArticulosAfectados(unittest.TestCase):
    def test_solo_los_citados(self):
        self.assertEqual(citas.articulos_afectados(["Art. 2", "Art. 4", "Art. 9"], {2, 9}), ["Art. 2", "Art. 9"])
        self.assertEqual(citas.articulos_afectados(["Art. 4", "Art. 5"], {2, 9}), [])

    def test_bis_y_ter_cuentan_por_su_numero_base(self):
        self.assertEqual(citas.articulos_afectados(["Art. 7 bis", "Art. 8 ter"], {7}), ["Art. 7 bis"])

    def test_ante_la_duda_se_avisa(self):
        self.assertEqual(citas.articulos_afectados(["Art. 4"], set()), ["Art. 4"])  # la ficha no cita artículos de esa norma
        self.assertEqual(citas.articulos_afectados(["Disposición adicional primera"], {2}), ["Disposición adicional primera"])
        self.assertEqual(citas.articulos_afectados(["Anexo I", "Art. 4"], {2}), ["Anexo I"])
        self.assertEqual(citas.articulos_afectados(["Art. único"], {2}), ["Art. único"])


class ConLasFichasReales(unittest.TestCase):
    def test_se_extraen_citas_de_casi_todas_las_normas_vigiladas(self):
        pares = con = 0
        for p in fichas_reales():
            d = json.loads(leer(p))
            por = citas.citados_por_norma(d)
            for n in d["normas"]:
                if n.get("boe"):
                    pares += 1
                    con += bool(por.get(n["boe"]))
        self.assertGreater(pares, 150)
        self.assertGreater(con / pares, 0.9, "la extracción de citas deja demasiadas normas sin artículos")


if __name__ == "__main__":
    unittest.main()
