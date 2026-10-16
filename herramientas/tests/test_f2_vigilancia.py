"""Fase 2: el vigilante con la API del BOE simulada. Avisa si cambia un artículo citado; ignora los demás."""
import argparse
import contextlib
import io
import json
import os
import re
import unittest
import urllib.error
from unittest import mock

from _comun import ConTemporal, cargar_modulo, escribir

vl = cargar_modulo("vigilar_leyes")

HOY = "20261016"
LEY, CE, SIN_TEXTO = "BOE-A-2000-1", "BOE-A-1978-31229", "BOE-A-1999-9"


def version(pub, vig, mod):
    return (pub, vig, mod)


def norma(titulo, bloques, derogada="N"):
    """bloques: {id: (texto del rótulo, [(publicación, vigencia, norma que modifica), ...])}."""
    return {"titulo": titulo, "derogada": derogada, "bloques": bloques}


def art(n, *extra):
    return ("Artículo %s. Título." % n, [version("20000101", "20000102", LEY)] + list(extra))


def xml_norma(nid, n, parte):
    if parte == "metadatos":
        return ("<response><data><metadatos><titulo>%s</titulo><rango>Ley</rango><numero_oficial>%s</numero_oficial>"
                "<estatus_derogacion>%s</estatus_derogacion><fecha_actualizacion>20261001T000000Z</fecha_actualizacion>"
                "</metadatos></data></response>" % (n["titulo"], "1/2000" if nid == LEY else "", n["derogada"]))
    bloques = []
    for bid, (rotulo, versiones) in n["bloques"].items():
        vs = "".join('<version id_norma="%s" fecha_publicacion="%s" fecha_vigencia="%s"><p class="articulo">%s</p><p class="parrafo">texto</p></version>'
                     % (mod, pub, vig, rotulo) for pub, vig, mod in versiones)
        bloques.append('<bloque id="%s" tipo="precepto">%s</bloque>' % (bid, vs))
    return "<response><data><texto>%s</texto></data></response>" % "".join(bloques)


class VigilanteConBoeSimulado(ConTemporal):
    def setUp(self):
        super().setUp()
        # Fichas: la 1 cita arts. 2, 3, 6-8 de la Ley y el art. 5 de la CE (y un art. 9 sin etiquetar);
        # la 2 solo cita el art. 10 de la Ley; la 1 cita además una norma sin texto consolidado.
        ficha1 = {"tema": 1, "normas": [{"nombre": "Ley 1/2000, de 1 de enero", "boe": LEY},
                                       {"nombre": "Constitución Española", "boe": CE},
                                       {"nombre": "Convenio antiguo", "boe": SIN_TEXTO},
                                       {"nombre": "Directiva de la UE", "url": "https://eur-lex.europa.eu/x"}],
                  "clave": ["El art. 2 de la Ley 1/2000 fija el plazo; véanse el art. 3.1 Ley 1/2000 y los arts. 6 a 8 Ley 1/2000.",
                            "La libertad se protege en el art. 5 CE. El art. 9 completa el régimen."]}
        ficha2 = {"tema": 2, "normas": [{"nombre": "Ley 1/2000, de 1 de enero", "boe": LEY}], "clave": ["Solo el art. 10 de la Ley 1/2000."]}
        for t, f in ((1, ficha1), (2, ficha2)):
            escribir(self.ruta("raiz", "datos", "temas", "tema-%02d.json" % t), json.dumps(f))
        bloques_ley = {"a%d" % i: art(i) for i in range(1, 11)}
        bloques_ley["dap"] = ("Disposición adicional primera. Algo.", [version("20000101", "20000102", LEY)])
        self.normas = {
            LEY: norma("Ley 1/2000, de pruebas", bloques_ley),
            CE: norma("Constitución Española", {"a%d" % i: art(i) for i in (5, 6)}),
        }
        parches = [
            mock.patch.object(vl, "RAIZ", self.ruta("raiz")),
            mock.patch.object(vl, "ESTADO", self.ruta("raiz", "datos", "vigilancia", "estado.json")),
            mock.patch.object(vl, "TITULOS", self.ruta("raiz", "datos", "vigilancia", "titulos.json")),
            mock.patch.object(vl, "NOVEDADES", self.ruta("raiz", "datos", "novedades.json")),
            mock.patch.object(vl, "WEB", self.ruta("raiz", "web", "data", "novedades.js")),
            mock.patch.object(vl, "RESUMEN_MD", self.ruta("raiz", "novedades-resumen.md")),
            mock.patch.object(vl, "hoy", lambda: HOY),
            mock.patch.object(vl, "get", self.get_falso),
        ]
        for p in parches:
            p.start()
            self.addCleanup(p.stop)

    def get_falso(self, url, accept="application/xml", intentos=4):
        m = re.search(r"/id/(BOE-A-[\d-]+)/(metadatos|texto)$", url)
        if m:
            if m.group(1) not in self.normas:
                raise urllib.error.HTTPError(url, 404, "No encontrado", {}, None)
            return xml_norma(m.group(1), self.normas[m.group(1)], m.group(2))
        if "xml.php" in url:
            return "<documento><titulo>Ley modificadora de prueba</titulo></documento>"
        raise AssertionError("petición inesperada: " + url)

    # ------------------------------------------------------------------ utilidades
    def comprobar(self):
        with contextlib.redirect_stdout(io.StringIO()):
            vl.cmd_comprobar(argparse.Namespace(hilos=1, historial=None))
        return self.novedades()

    def novedades(self):
        with open(vl.NOVEDADES, encoding="utf-8") as f:
            return json.load(f)["items"]

    def cambiar(self, norma_id, bloque, pub="20261010", vig="20261010", mod="BOE-A-2026-1"):
        self.normas[norma_id]["bloques"][bloque][1].append(version(pub, vig, mod))

    def web(self):
        return vl.leer_web()

    # ------------------------------------------------------------------ pruebas
    def test_primera_ejecucion_solo_guarda_la_linea_base(self):
        items = self.comprobar()
        self.assertEqual(items, [])
        w = self.web()
        self.assertEqual(w["normasVigiladas"], 2)
        self.assertEqual(w["sinConsolidar"], [SIN_TEXTO])
        self.assertEqual(w["otrasFuentes"], 1)
        self.assertFalse(os.path.exists(vl.RESUMEN_MD))

    def test_avisa_si_cambia_un_articulo_citado(self):
        self.comprobar()
        self.cambiar(LEY, "a2")
        (e,) = self.comprobar()
        self.assertEqual(e["estado"], "pendiente")
        self.assertEqual(e["tipo"], "modificada")
        self.assertEqual(e["temas"], [1])
        self.assertEqual(e["otrosTemas"], [2])  # la ficha 2 cita la Ley, pero no el art. 2
        self.assertEqual(e["articulosPorTema"], {"1": ["Art. 2"]})
        self.assertEqual(e["articulos"], ["Art. 2"])
        self.assertNotIn("sinImpacto", e)
        self.assertEqual(e["modificadora"]["id"], "BOE-A-2026-1")
        self.assertIn("Ley modificadora de prueba", e["modificadora"]["titulo"])
        self.assertTrue(os.path.exists(vl.RESUMEN_MD))  # habrá issue
        with open(vl.RESUMEN_MD, encoding="utf-8") as f:
            md = f.read()
        self.assertIn("temas: 1", md)
        self.assertIn("temas 2", md)

    def test_ignora_si_el_articulo_modificado_no_lo_cita_ninguna_ficha(self):
        self.comprobar()
        self.cambiar(LEY, "a4")
        (e,) = self.comprobar()
        self.assertEqual(e["temas"], [])
        self.assertEqual(sorted(e["otrosTemas"]), [1, 2])
        self.assertTrue(e["sinImpacto"])
        self.assertEqual(e["estado"], "incorporada")  # se anota, pero no hay nada que revisar
        self.assertEqual(e["articulosPorTema"], {})
        self.assertFalse(os.path.exists(vl.RESUMEN_MD), "no debe abrirse un issue para un cambio sin impacto")

    def test_avisa_solo_a_las_fichas_que_citan_el_articulo(self):
        self.comprobar()
        self.cambiar(LEY, "a10")
        (e,) = self.comprobar()
        self.assertEqual(e["temas"], [2])
        self.assertEqual(e["otrosTemas"], [1])
        self.assertEqual(e["articulosPorTema"], {"2": ["Art. 10"]})

    def test_la_cita_etiquetada_con_otra_norma_no_cuenta(self):
        # La ficha 1 cita el art. 5 «CE»: un cambio en el art. 5 de la Ley 1/2000 no la afecta...
        self.normas[LEY]["bloques"]["a5"] = art(5)
        self.comprobar()
        self.cambiar(LEY, "a5")
        (e,) = self.comprobar()
        self.assertTrue(e["sinImpacto"])
        # ...pero un cambio en el art. 5 de la CE sí.
        self.cambiar(CE, "a5", pub="20261011", vig="20261011", mod="BOE-A-2026-2")
        e2 = [x for x in self.comprobar() if x["norma"]["id"] == CE]
        self.assertEqual(len(e2), 1)
        self.assertEqual(e2[0]["temas"], [1])
        self.assertEqual(e2[0]["estado"], "pendiente")

    def test_cita_sin_etiqueta_cuenta_para_todas_las_normas(self):
        self.normas[LEY]["bloques"]["a9"] = art(9)
        self.normas[CE]["bloques"]["a9"] = art(9)
        self.comprobar()
        self.cambiar(LEY, "a9")
        self.cambiar(CE, "a9", mod="BOE-A-2026-2")
        nuevas = self.comprobar()
        self.assertEqual(sorted(e["temas"] for e in nuevas), [[1], [1]])
        self.assertTrue(all(e["estado"] == "pendiente" for e in nuevas))

    def test_una_disposicion_siempre_avisa(self):
        self.comprobar()
        self.cambiar(LEY, "dap")
        (e,) = self.comprobar()
        self.assertEqual(e["temas"], [1, 2])
        self.assertEqual(e["estado"], "pendiente")

    def test_reforma_que_entrara_en_vigor_es_proxima_y_avisa(self):
        self.comprobar()
        self.cambiar(LEY, "a3", pub="20261003", vig="20261023")
        (e,) = self.comprobar()
        self.assertEqual(e["tipo"], "proxima")
        self.assertEqual(e["vigencia"], "2026-10-23")
        self.assertEqual(e["temas"], [1])
        self.assertEqual(e["estado"], "pendiente")

    def test_varios_cambios_de_una_misma_reforma_se_agrupan(self):
        self.comprobar()
        for b in ("a2", "a4", "a7"):
            self.cambiar(LEY, b)
        (e,) = self.comprobar()
        self.assertEqual(e["nArticulos"], 3)
        self.assertEqual(e["articulos"], ["Art. 2", "Art. 4", "Art. 7"])
        self.assertEqual(e["articulosPorTema"], {"1": ["Art. 2", "Art. 7"]})  # el 4 no lo cita nadie

    def test_derogacion_afecta_a_todas_las_fichas_que_citan_la_norma(self):
        self.comprobar()
        self.normas[LEY]["derogada"] = "S"
        (e,) = self.comprobar()
        self.assertEqual(e["tipo"], "derogada")
        self.assertEqual(e["temas"], [1, 2])
        self.assertEqual(e["estado"], "pendiente")

    def test_no_repite_novedades_ya_registradas(self):
        self.comprobar()
        self.cambiar(LEY, "a2")
        self.assertEqual(len(self.comprobar()), 1)
        self.assertEqual(len(self.comprobar()), 1)

    def test_revisar_marca_incorporada_y_conserva_los_datos_de_la_comprobacion(self):
        self.comprobar()
        self.cambiar(LEY, "a2")
        (e,) = self.comprobar()
        antes = self.web()
        with contextlib.redirect_stdout(io.StringIO()):
            vl.cmd_revisar(argparse.Namespace(ids=[e["id"]], todo=False))
        (r,) = self.novedades()
        self.assertEqual(r["estado"], "incorporada")
        self.assertRegex(r["revisada"], r"^\d{4}-\d{2}-\d{2}$")
        despues = self.web()
        for campo in ("comprobacion", "normasVigiladas", "sinConsolidar", "errores"):
            self.assertEqual(despues[campo], antes[campo], campo)
        self.assertEqual(despues["sinConsolidar"], [SIN_TEXTO])
        self.assertEqual(despues["items"][0]["estado"], "incorporada")

    def test_una_norma_que_deja_de_responder_no_inventa_cambios(self):
        self.comprobar()
        antes = self.normas.pop(CE)
        self.assertEqual(self.comprobar(), [])
        self.normas[CE] = antes
        self.assertEqual(self.comprobar(), [])


if __name__ == "__main__":
    unittest.main()
