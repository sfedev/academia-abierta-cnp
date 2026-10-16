"""Fase 5: cobertura de las reglas de validar_tema.py (errores que bloquean y avisos que no)."""
import json
import os
import unittest

from _comun import ConTemporal, cargar_modulo, escribir, fichas_reales, leer

validar = cargar_modulo("validar_tema")


class ReglasDelValidador(ConTemporal):
    def base(self):
        real = next(p for p in fichas_reales() if p.endswith("tema-23.json"))
        return json.loads(leer(real))

    def comprobar(self, mutar, nombre="tema-23.json"):
        d = self.base()
        mutar(d)
        ruta = self.ruta(nombre)
        escribir(ruta, json.dumps(d, ensure_ascii=False, indent=2))
        err, avi, _ = validar.validar(ruta)
        return err, avi

    def assertError(self, mutar, fragmento, nombre="tema-23.json"):
        err, _ = self.comprobar(mutar, nombre)
        self.assertTrue(any(fragmento in e for e in err), "esperaba un error con «%s»; errores: %s" % (fragmento, err[:4]))

    def assertAviso(self, mutar, fragmento):
        err, avi = self.comprobar(mutar)
        self.assertEqual(err, [], "no debería haber errores: %s" % err[:3])
        self.assertTrue(any(fragmento in a for a in avi), "esperaba un aviso con «%s»; avisos: %s" % (fragmento, avi[:4]))

    # -------------------------------------------------------------- una ficha correcta
    def test_la_ficha_base_es_valida_y_las_45_reales_tambien(self):
        err, _ = self.comprobar(lambda d: None)
        self.assertEqual(err, [])
        for p in fichas_reales():
            self.assertEqual(validar.validar(p)[0], [], p)

    # -------------------------------------------------------------- estructura general
    def test_json_no_valido(self):
        ruta = self.ruta("tema-23.json")
        escribir(ruta, '{"tema": 23,')
        err, _, _ = validar.validar(ruta)
        self.assertTrue(err and "JSON no válido" in err[0])

    def test_tema_bloque_y_nombre_de_fichero(self):
        self.assertError(lambda d: d.update(tema=99), "tema debe ser un entero 1-45")
        self.assertError(lambda d: d.update(tema="23"), "tema debe ser un entero 1-45")
        self.assertError(lambda d: d.update(bloque="C"), "bloque debe ser A para el tema 23")
        self.assertError(lambda d: None, "el nombre del fichero no coincide", nombre="tema-24.json")

    def test_titulo_y_fecha(self):
        self.assertError(lambda d: d.update(titulo="ab"), "titulo (3-90 caracteres)")
        self.assertError(lambda d: d.update(titulo="x" * 91), "titulo (3-90 caracteres)")
        self.assertError(lambda d: d.update(actualizado="16/10/2026"), "actualizado con formato AAAA-MM-DD")

    def test_peso(self):
        self.assertError(lambda d: d["peso"].update(nivel="enorme"), "peso.nivel debe ser alto|medio|bajo")
        self.assertError(lambda d: d["peso"].update(nota="<b>mucho</b>"), "contiene HTML")

    def test_normas(self):
        self.assertError(lambda d: d.update(normas=[]), "normas: al menos 1")
        self.assertError(lambda d: d["normas"][0].pop("nombre"), "normas[0]: faltan nombre/url")
        self.assertError(lambda d: d["normas"][0].update(url="http://www.boe.es/x"), "normas[0].url debe ser https")
        self.assertAviso(lambda d: d["normas"][0].pop("verificado"), "falta 'verificado'")

    # -------------------------------------------------------------- resumen, clave, trampas
    def test_resumen(self):
        self.assertError(lambda d: d.update(resumen=d["resumen"][:2]), "resumen: al menos 3 secciones")
        self.assertError(lambda d: d["resumen"][0].update(puntos=d["resumen"][0]["puntos"][:1]), "resumen[0].puntos: al menos 2")
        self.assertError(lambda d: d["resumen"][0].update(titulo=""), "resumen[0].titulo")

    def test_tablas(self):
        def fila_corta(d):
            d["resumen"][2]["tabla"]["filas"][0] = ["solo una celda"]
        self.assertError(fila_corta, "tabla fila 0 no cuadra con la cabecera")
        self.assertError(lambda d: d["resumen"][2]["tabla"].update(filas=[]), "tabla mal formada")

    def test_marcado_de_texto(self):
        self.assertError(lambda d: d["clave"].__setitem__(0, "dato **sin cerrar"), "'**' sin cerrar")
        self.assertError(lambda d: d["trampas"].__setitem__(0, "con <i>html</i>"), "contiene HTML")
        self.assertError(lambda d: d["tarjetas"][0].update(r="  "), "texto vacío")
        self.assertError(lambda d: d["preguntas"][0].update(explicacion="**abierta"), "'**' sin cerrar")

    def test_numero_de_elementos(self):
        self.assertError(lambda d: d.update(clave=d["clave"][:5]), "clave: entre 6 y 14")
        self.assertError(lambda d: d.update(clave=d["clave"] * 2), "clave: entre 6 y 14")
        self.assertError(lambda d: d.update(trampas=d["trampas"][:3]), "trampas: entre 4 y 10")
        self.assertError(lambda d: d.update(tarjetas=d["tarjetas"][:9]), "tarjetas: entre 10 y 24")
        self.assertError(lambda d: d.update(preguntas=d["preguntas"][:14]), "preguntas: entre 15 y 24")

    def test_listas_opcionales(self):
        self.assertError(lambda d: d.update(novedades="no es lista"), "novedades debe ser una lista")
        self.assertError(lambda d: d["caido"].append({"examen": "1 mar 2025"}), "caido[")
        self.assertError(lambda d: d.update(mnemotecnias=["ok", 5]), "mnemotecnias[1]")

    # -------------------------------------------------------------- preguntas
    def test_tres_opciones_exactas(self):
        self.assertError(lambda d: d["preguntas"][0].update(opciones=["a", "b"]), "exactamente 3 opciones")
        self.assertError(lambda d: d["preguntas"][0].update(opciones=["a", "b", "c", "d"]), "exactamente 3 opciones")
        self.assertError(lambda d: d["preguntas"][0].update(opciones=["a", "a", "c"]), "opciones repetidas")

    def test_opciones_prohibidas(self):
        for frase in ("Todas las anteriores", "Ninguna de las anteriores", "Todas son correctas", "Ninguna es correcta"):
            self.assertError(lambda d, f=frase: d["preguntas"][0]["opciones"].__setitem__(1, f), "(prohibido)")

    def test_respuesta_correcta_ref_y_dificultad(self):
        self.assertError(lambda d: d["preguntas"][0].update(correcta=3), "correcta debe ser 0, 1 o 2")
        self.assertError(lambda d: d["preguntas"][0].update(correcta="1"), "correcta debe ser 0, 1 o 2")
        self.assertError(lambda d: d["preguntas"][0].update(correcta=True), "correcta debe ser 0, 1 o 2")  # un booleano no es 0/1/2
        self.assertError(lambda d: d["preguntas"][0].update(dificultad=True), "dificultad 1-3")
        self.assertError(lambda d: d["preguntas"][0].pop("ref"), "falta 'ref'")
        self.assertError(lambda d: d["preguntas"][0].update(ref="  "), "falta 'ref'")
        self.assertError(lambda d: d["preguntas"][0].update(dificultad=4), "dificultad 1-3")

    def test_enunciado_repetido(self):
        def repetir(d):
            d["preguntas"][1]["enunciado"] = d["preguntas"][0]["enunciado"].upper()
        self.assertError(repetir, "enunciado repetido")

    # -------------------------------------------------------------- avisos (no bloquean)
    def test_aviso_explicacion_corta(self):
        self.assertAviso(lambda d: d["preguntas"][0].update(explicacion="Corta."), "explicación demasiado corta")

    def test_aviso_si_la_explicacion_cita_letras(self):
        self.assertAviso(lambda d: d["preguntas"][0].update(explicacion="La opción B es la correcta porque el artículo lo dice así claramente."), "cita una letra")

    def test_aviso_posicion_correcta_desequilibrada(self):
        def sesgar(d):
            for q in d["preguntas"]:
                q["correcta"] = 1
        self.assertAviso(sesgar, "infrarrepresentada")

    def test_aviso_resumen_largo_y_corto(self):
        def largo(d):
            d["resumen"][0]["puntos"].append("palabra " * 3000)
        self.assertAviso(largo, "resumen largo")

        def corto(d):
            d["peso"]["nivel"] = "alto"
            d["resumen"] = [{"titulo": "T%d" % i, "puntos": ["uno dos tres", "cuatro cinco seis"]} for i in range(3)]
        self.assertAviso(corto, "resumen corto")

    def test_las_secciones_ampliadas_no_cuentan_para_el_limite(self):
        def ampliar(d):
            d["resumen"][0]["puntos"].append("palabra " * 3000)
            d["resumen"][0]["ampliado"] = True
        err, avi = self.comprobar(ampliar)
        self.assertEqual(err, [])
        self.assertFalse(any("resumen largo" in a for a in avi))


class SalidaDelValidador(ConTemporal):
    def test_codigo_de_salida_y_mensajes(self):
        real = next(p for p in fichas_reales() if p.endswith("tema-23.json"))
        buena, mala = self.ruta("b", "tema-23.json"), self.ruta("m", "tema-23.json")
        escribir(buena, leer(real))
        d = json.loads(leer(real))
        d["preguntas"][0]["opciones"] = ["a", "b"]
        escribir(mala, json.dumps(d, ensure_ascii=False))
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()) as o:
            self.assertEqual(validar.main([buena]), 0)
        self.assertIn("OK", o.getvalue())
        with contextlib.redirect_stdout(io.StringIO()) as o:
            self.assertEqual(validar.main([mala]), 1)
        self.assertIn("ERROR: preguntas[0]: debe tener exactamente 3 opciones", o.getvalue())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(validar.main([]), 1)  # sin argumentos muestra la ayuda y falla


if __name__ == "__main__":
    unittest.main()
