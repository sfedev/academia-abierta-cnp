"""Fase 1: ids estables de preguntas y tarjetas (migrar_ids.py, validador y build)."""
import contextlib
import io
import json
import os
import re
import unittest

from _comun import ConTemporal, cargar_modulo, escribir, fichas_reales, leer, quitar_ids

migrar = cargar_modulo("migrar_ids")
validar = cargar_modulo("validar_tema")
build = cargar_modulo("build")


def callado(f, *a):
    """Ejecuta f(*a) sin dejar salir lo que imprima."""
    with contextlib.redirect_stdout(io.StringIO()):
        return f(*a)


def sin_ids(txt):
    return migrar.sin_ids(json.loads(txt))


class MigracionDeIds(ConTemporal):
    def copia(self, nombre, transformar=lambda t: t):
        """Copia la ficha real a la carpeta temporal aplicando `transformar` al texto."""
        src = next(p for p in fichas_reales() if p.endswith(nombre))
        dst = self.ruta(nombre)
        escribir(dst, transformar(leer(src)))
        return src, dst

    def test_migrar_ficha_sin_ids_reproduce_exactamente_la_real(self):
        # Formatos distintos: tema 06 con tarjetas en una línea; tema 23 con todo en varias líneas.
        for nombre in ("tema-06.json", "tema-23.json", "tema-38.json"):
            real, dst = self.copia(nombre, quitar_ids)
            self.assertNotIn('"id"', leer(dst))
            n = migrar.procesar(dst, True)
            self.assertGreater(n, 30)
            self.assertEqual(leer(dst), leer(real), "la migración no reproduce byte a byte " + nombre)

    def test_migrar_sustituye_ids_antiguos_por_hash(self):
        antiguo = lambda t: re.sub(r'"id": "[qt]_\d{2}_\d+"', '"id": "k3x9f"', t)
        real, dst = self.copia("tema-23.json", antiguo)
        self.assertIn('"id": "k3x9f"', leer(dst))
        migrar.procesar(dst, True)
        self.assertEqual(leer(dst), leer(real))

    def test_no_pierde_ningun_dato(self):
        for real in fichas_reales():
            nombre = os.path.basename(real)
            _, dst = self.copia(nombre, quitar_ids)
            original = sin_ids(leer(real))
            migrar.procesar(dst, True)
            self.assertEqual(sin_ids(leer(dst)), original, nombre)

    def test_es_idempotente_y_no_toca_ids_ya_asignados(self):
        _, dst = self.copia("tema-23.json")
        antes = leer(dst)
        self.assertEqual(migrar.procesar(dst, True), 0)
        self.assertEqual(leer(dst), antes)

    def test_ids_secuenciales_y_sin_reutilizar_numeros(self):
        _, dst = self.copia("tema-06.json")
        d = json.loads(leer(dst))
        # Se quita una pregunta del medio y se añade una nueva sin id: recibe max+1, no el hueco.
        quitada = d["preguntas"].pop(3)["id"]
        d["preguntas"].append({k: v for k, v in d["preguntas"][0].items() if k != "id"})
        d["preguntas"][-1]["enunciado"] = "Pregunta nueva de prueba"
        escribir(dst, json.dumps(d, ensure_ascii=False, indent=2))
        self.assertEqual(migrar.procesar(dst, True), 1)
        ids = [q["id"] for q in json.loads(leer(dst))["preguntas"]]
        n = len(ids)
        self.assertNotIn(quitada, ids)
        self.assertEqual(ids[-1], "q_06_%02d" % (n + 1))
        self.assertEqual(len(set(ids)), n)

    def test_pasada_de_comprobar_no_escribe(self):
        _, dst = self.copia("tema-23.json", quitar_ids)
        antes = leer(dst)
        self.assertEqual(callado(migrar.main, [dst, "--comprobar"]), 1)
        self.assertEqual(leer(dst), antes)

    def test_si_el_json_cambiaria_no_escribe(self):
        _, dst = self.copia("tema-06.json", quitar_ids)
        original = migrar.sin_ids
        try:
            migrar.sin_ids = lambda d: d if "tema" in d and d.get("_x") else {"x": id(d)}  # fuerza la discrepancia
            with self.assertRaises(SystemExit):
                migrar.procesar(dst, True)
        finally:
            migrar.sin_ids = original
        self.assertNotIn('"id"', leer(dst))


class IdsEnLasFichasReales(unittest.TestCase):
    def test_todas_las_preguntas_y_tarjetas_tienen_id_secuencial(self):
        total = 0
        for p in fichas_reales():
            d = json.loads(leer(p))
            n = d["tema"]
            for lista, pref in (("preguntas", "q"), ("tarjetas", "t")):
                esperado = ["%s_%02d_%02d" % (pref, n, i + 1) for i in range(len(d[lista]))]
                self.assertEqual([e["id"] for e in d[lista]], esperado, "%s %s" % (os.path.basename(p), lista))
                total += len(esperado)
        self.assertGreater(total, 1700)

    def test_ids_unicos_en_toda_la_aplicacion(self):
        ids = []
        for p in fichas_reales():
            d = json.loads(leer(p))
            ids += [e["id"] for k in ("preguntas", "tarjetas") for e in d[k]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_el_validador_acepta_las_45_fichas(self):
        for p in fichas_reales():
            err, _, _ = validar.validar(p)
            self.assertEqual(err, [], p)
        self.assertEqual(callado(validar.main, fichas_reales()), 0)


class ValidadorDeIds(ConTemporal):
    def ficha(self, mutar, nombre="tema-23.json"):
        real = next(p for p in fichas_reales() if p.endswith(nombre))
        d = json.loads(leer(real))
        mutar(d)
        dst = self.ruta(nombre)
        escribir(dst, json.dumps(d, ensure_ascii=False, indent=2))
        return dst

    def errores_de_id(self, dst):
        err, _, _ = validar.validar(dst)
        return [e for e in err if "id" in e]

    def test_falta_id_en_pregunta(self):
        dst = self.ficha(lambda d: d["preguntas"][0].pop("id"))
        self.assertTrue(any("preguntas[0]: falta 'id'" in e for e in self.errores_de_id(dst)))

    def test_falta_id_en_tarjeta(self):
        dst = self.ficha(lambda d: d["tarjetas"][2].pop("id"))
        self.assertTrue(any("tarjetas[2]: falta 'id'" in e for e in self.errores_de_id(dst)))

    def test_prefijo_o_tema_equivocado(self):
        def mutar(d):
            d["preguntas"][0]["id"] = "t_23_01"  # prefijo de tarjeta en una pregunta
            d["tarjetas"][0]["id"] = "t_24_01"  # número de otro tema
        errs = self.errores_de_id(self.ficha(mutar))
        self.assertTrue(any("preguntas[0]" in e and "no válido" in e for e in errs))
        self.assertTrue(any("tarjetas[0]" in e and "no válido" in e for e in errs))

    def test_id_repetido_dentro_de_la_ficha(self):
        def mutar(d):
            d["preguntas"][1]["id"] = d["preguntas"][0]["id"]
        self.assertTrue(any("repetido" in e for e in self.errores_de_id(self.ficha(mutar))))

    def test_id_repetido_entre_fichas(self):
        # Dos ficheros del mismo tema, cada uno válido por separado: solo falla la comprobación global.
        real = next(p for p in fichas_reales() if p.endswith("tema-23.json"))
        a, b = self.ruta("a", "tema-23.json"), self.ruta("b", "tema-23.json")
        escribir(a, leer(real))
        escribir(b, leer(real))
        self.assertEqual(callado(validar.main, [a]), 0)
        self.assertEqual(callado(validar.main, [b]), 0)
        self.assertEqual(callado(validar.main, [a, b]), 1)

    def test_main_devuelve_codigo_de_salida(self):
        buena = self.ficha(lambda d: None)
        mala = self.ficha(lambda d: d["preguntas"][0].pop("id"), "tema-24.json")
        self.assertEqual(callado(validar.main, [buena]), 0)
        self.assertEqual(callado(validar.main, [mala]), 1)


class BuildExigeIds(unittest.TestCase):
    def temas(self):
        return {1: {"preguntas": [{"id": "q_01_01"}, {"id": "q_01_02"}], "tarjetas": [{"id": "t_01_01"}]},
                2: {"preguntas": [{"id": "q_02_01"}], "tarjetas": [{"id": "t_02_01"}]}}

    def test_acepta_ids_validos_y_unicos(self):
        self.assertEqual(build.comprobar_ids(self.temas()), 5)

    def test_rechaza_ids_ausentes_mal_formados_o_repetidos(self):
        for mutar in (lambda t: t[1]["preguntas"][0].pop("id"),
                      lambda t: t[1]["tarjetas"][0].update(id="q_01_01"),
                      lambda t: t[2]["preguntas"][0].update(id="q_01_01"),
                      lambda t: t[1]["preguntas"][1].update(id="q_01_01")):
            t = self.temas()
            mutar(t)
            with self.assertRaises(SystemExit):
                build.comprobar_ids(t)


if __name__ == "__main__":
    unittest.main()
