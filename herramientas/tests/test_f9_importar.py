"""Fase 9 (plan F3): conversor de exámenes oficiales (cuestionario + plantilla) para importarlos en la web."""
import contextlib
import io
import json
import os
import unittest

from _comun import RAIZ, ConTemporal, cargar_modulo, escribir

ie = cargar_modulo("importar_examen")

CUESTIONARIO = """MINISTERIO DEL INTERIOR
DIRECCIÓN GENERAL DE LA POLICÍA
MODELO A
1. Según el artículo 17.2 de la Constitución Española, la detención preventiva no podrá durar
más del tiempo estrictamente necesario y, en todo caso, el plazo máximo será de:
a) Setenta y dos horas.
b) Cuarenta y ocho horas.
c) Veinticuatro horas.
2.- Conforme a la LO 4/2015, la identificación en dependencias policiales no podrá exceder de:
A) Seis horas.
B) Doce horas,
salvo autorización judicial.
C) Veinticuatro horas.
Página 1 de 12
3) En 2015 se aprobó la ley que regula:
a. La seguridad ciudadana.
b. La seguridad privada.
c. El tráfico.
"""


class Cuestionario(unittest.TestCase):
    def test_lee_numeraciones_y_opciones_variadas(self):
        qs = ie.parsear_cuestionario(CUESTIONARIO)
        self.assertEqual([q["n"] for q in qs], [1, 2, 3])
        self.assertTrue(qs[0]["enunciado"].startswith("Según el artículo 17.2"))
        self.assertIn("plazo máximo será de:", qs[0]["enunciado"])  # varias líneas
        self.assertEqual(qs[0]["opciones"], ["Setenta y dos horas.", "Cuarenta y ocho horas.", "Veinticuatro horas."])
        self.assertEqual(qs[1]["opciones"][1], "Doce horas, salvo autorización judicial.")  # opción en dos líneas
        self.assertNotIn("Página", " ".join(qs[1]["opciones"]))  # el pie de página se ignora

    def test_un_numero_al_inicio_de_linea_no_abre_pregunta_si_no_toca(self):
        qs = ie.parsear_cuestionario("1. Enunciado que sigue\n2015. Esto es continuación\na) x\nb) y\nc) z\n")
        self.assertEqual(len(qs), 1)
        self.assertIn("2015. Esto es continuación", qs[0]["enunciado"])


class Plantilla(unittest.TestCase):
    def test_formatos_de_plantilla(self):
        self.assertEqual(ie.parsear_plantilla("1 A\n2-b\n3.c\n4: A"), {1: 0, 2: 1, 3: 2, 4: 0})
        self.assertEqual(ie.parsear_plantilla("1A 2C 3B"), {1: 0, 2: 2, 3: 1})
        self.assertEqual(ie.parsear_plantilla("1 A 2 ANULADA 3 *"), {1: 0, 2: None, 3: None})

    def test_no_confunde_palabras_con_respuestas(self):
        self.assertEqual(ie.parsear_plantilla("Modelo A, 100 preguntas. 1 B"), {1: 1})


class Construccion(unittest.TestCase):
    def test_examen_completo(self):
        ex, err = ie.construir(CUESTIONARIO, "1 A 2 A 3 ANULADA", "P99", "Prueba", "2026-09-26")
        self.assertEqual(err, [])
        self.assertEqual(ex["formato"], "academia-abierta-examen-v1")
        self.assertEqual(ex["validas"], 2)
        self.assertTrue(ex["preguntas"][2]["anulada"])
        self.assertIsNone(ex["preguntas"][2]["correcta"])

    def test_errores(self):
        _, err = ie.construir(CUESTIONARIO, "1 A 2 B 7 C", "P99")
        txt = " ".join(err)
        self.assertIn("Pregunta 3: no está en la plantilla", txt)
        self.assertIn("preguntas que no están en el cuestionario: 7", txt)
        _, err = ie.construir("1. Solo enunciado\na) una\nb) dos\n", "1 A", "P99")
        self.assertIn("se leen 2 opciones", " ".join(err))
        _, err = ie.construir("sin preguntas", "", "P99")
        self.assertIn("No se ha encontrado ninguna pregunta", " ".join(err))

    def test_tema_estimado_con_las_fichas_reales(self):
        modelo = ie.modelo_temas()
        if not modelo:
            self.skipTest("sin fichas")
        tema, puntos = ie.estimar_tema("Conforme a la LO 4/2015 de protección de la seguridad ciudadana, la identificación "
                                       "en dependencias policiales y los registros corporales externos", modelo)
        self.assertEqual(tema, 14, puntos)
        self.assertEqual(ie.estimar_tema("", modelo), (None, 0.0))


class LineaDeComandos(ConTemporal):
    def test_escribe_el_json_y_respeta_los_errores(self):
        escribir(self.ruta("c.txt"), CUESTIONARIO)
        escribir(self.ruta("p.txt"), "1 A 2 A 3 B")
        salida = self.ruta("ex.json")
        with contextlib.redirect_stdout(io.StringIO()):
            ie.main([self.ruta("c.txt"), "--plantilla", self.ruta("p.txt"), "--codigo", "P99", "--salida", salida, "--sin-temas"])
        ex = json.load(open(salida, encoding="utf-8"))
        self.assertEqual(len(ex["preguntas"]), 3)
        self.assertNotIn("tema", ex["preguntas"][0])
        escribir(self.ruta("p2.txt"), "1 A")
        with self.assertRaises(SystemExit), contextlib.redirect_stdout(io.StringIO()):
            ie.main([self.ruta("c.txt"), "--plantilla", self.ruta("p2.txt"), "--codigo", "P98", "--salida", self.ruta("ex2.json")])
        self.assertFalse(os.path.exists(self.ruta("ex2.json")))

    def test_codigo_invalido(self):
        escribir(self.ruta("c.txt"), CUESTIONARIO)
        with self.assertRaises(SystemExit):
            ie.main([self.ruta("c.txt"), "--plantilla", self.ruta("c.txt"), "--codigo", "con espacios"])

    def test_los_examenes_no_se_suben_al_repositorio(self):
        self.assertIn("examenes/", open(os.path.join(RAIZ, ".gitignore"), encoding="utf-8").read())


if __name__ == "__main__":
    unittest.main()
