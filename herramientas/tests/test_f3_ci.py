"""Fase 3: el workflow valida las fichas antes de generar y publicar la web, y un fallo lo bloquea todo."""
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import unittest

from _comun import HERRAMIENTAS, RAIZ, ConTemporal, escribir, fichas_reales, leer

WORKFLOW = os.path.join(RAIZ, ".github", "workflows", "vigilar-y-publicar.yml")


def pasos_del_job(texto, job):
    """Lista de (nombre, texto del paso) del job indicado, leyendo el YAML a mano (sin PyYAML)."""
    m = re.search(r"^  %s:\n(.*?)(?=^  \S|\Z)" % re.escape(job), texto, re.S | re.M)
    assert m, "no se encuentra el job " + job
    cuerpo = m.group(1)
    trozos = re.split(r"^      - (?=name:)", cuerpo, flags=re.M)[1:]
    return [(re.match(r"name:\s*(.+)", t).group(1).strip(), t) for t in trozos]


def orden(pasos, patron):
    for i, (nombre, texto) in enumerate(pasos):
        if re.search(patron, texto):
            return i
    return None


class WorkflowDePublicacion(unittest.TestCase):
    def setUp(self):
        self.texto = leer(WORKFLOW)
        self.pasos = pasos_del_job(self.texto, "construir")

    def test_valida_las_fichas_con_el_comando_esperado(self):
        validar = [t for _, t in self.pasos if "validar_tema.py" in t]
        self.assertEqual(len(validar), 1)
        self.assertRegex(validar[0], r"run:\s*python -I herramientas/validar_tema\.py datos/temas/tema-\*\.json\s*$")

    def test_la_validacion_va_antes_de_generar_y_empaquetar(self):
        v = orden(self.pasos, r"validar_tema\.py")
        b = orden(self.pasos, r"herramientas/build\.py")
        e = orden(self.pasos, r"herramientas/empaquetar\.py")
        s = orden(self.pasos, r"upload-pages-artifact")
        self.assertIsNotNone(v)
        self.assertTrue(v < b <= e < s, "orden de los pasos: validar %s, build %s, empaquetar %s, subir %s" % (v, b, e, s))

    def test_nada_hace_que_un_fallo_de_validacion_se_ignore(self):
        self.assertNotIn("continue-on-error", self.texto)
        paso = [t for _, t in self.pasos if "validar_tema.py" in t][0]
        self.assertNotRegex(paso, r"\|\|\s*(true|:)")
        self.assertNotRegex(paso, r"\bif:\s")  # el paso se ejecuta siempre que los anteriores hayan ido bien

    def test_el_despliegue_depende_de_la_construccion(self):
        m = re.search(r"^  desplegar:\n(.*?)(?=^  \S|\Z)", self.texto, re.S | re.M)
        self.assertIsNotNone(m)
        self.assertRegex(m.group(1), r"needs:\s*construir")

    def test_los_novedades_se_guardan_antes_de_validar(self):
        # Un error de formato en una ficha no debe impedir registrar los cambios legales detectados.
        self.assertLess(orden(self.pasos, r"git add datos/novedades\.json"), orden(self.pasos, r"validar_tema\.py"))


class ElComandoDelWorkflowBloquea(ConTemporal):
    """Ejecuta el mismo comando que el workflow sobre una copia del repositorio, con y sin fichas rotas."""

    def preparar(self):
        raiz = self.ruta("repo")
        os.makedirs(os.path.join(raiz, "herramientas"), exist_ok=True)
        shutil.copy(os.path.join(HERRAMIENTAS, "validar_tema.py"), os.path.join(raiz, "herramientas", "validar_tema.py"))
        for p in fichas_reales():
            escribir(os.path.join(raiz, "datos", "temas", os.path.basename(p)), leer(p))
        return raiz

    def ejecutar_como_el_workflow(self, raiz):
        comando = re.search(r"run:\s*(python -I herramientas/validar_tema\.py datos/temas/tema-\*\.json)", leer(WORKFLOW)).group(1)
        args = comando.split()[1:]  # -I herramientas/validar_tema.py datos/temas/tema-*.json
        # bash expande el comodín antes de lanzar python; aquí se hace igual (cmd.exe no lo expandiría)
        expandido = []
        for a in args:
            expandido += sorted(os.path.relpath(f, raiz) for f in glob.glob(os.path.join(raiz, a))) if "*" in a else [a]
        return subprocess.run([sys.executable] + expandido, cwd=raiz, capture_output=True, text=True, encoding="utf-8", errors="replace")

    def test_con_las_45_fichas_validas_termina_bien(self):
        r = self.ejecutar_como_el_workflow(self.preparar())
        self.assertEqual(r.returncode, 0, r.stdout[-800:] + r.stderr[-400:])
        self.assertEqual(r.stdout.count("== datos"), 45)

    def test_un_json_intencionadamente_invalido_bloquea(self):
        raiz = self.preparar()
        ruta = os.path.join(raiz, "datos", "temas", "tema-23.json")
        escribir(ruta, leer(ruta)[:-40])  # JSON truncado
        r = self.ejecutar_como_el_workflow(raiz)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("JSON no válido", r.stdout)

    def test_una_ficha_con_datos_incorrectos_bloquea(self):
        raiz = self.preparar()
        ruta = os.path.join(raiz, "datos", "temas", "tema-06.json")
        escribir(ruta, leer(ruta).replace('"correcta": 1', '"correcta": 7', 1).replace('"correcta": 0', '"correcta": 7', 1).replace('"correcta": 2', '"correcta": 7', 1))
        r = self.ejecutar_como_el_workflow(raiz)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("ERROR", r.stdout)

    def test_un_id_repetido_entre_fichas_bloquea(self):
        raiz = self.preparar()
        a = os.path.join(raiz, "datos", "temas", "tema-23.json")
        escribir(os.path.join(raiz, "datos", "temas", "tema-24.json"), leer(a).replace('"tema": 23', '"tema": 24'))
        r = self.ejecutar_como_el_workflow(raiz)
        self.assertNotEqual(r.returncode, 0)

    def test_solo_los_avisos_no_bloquean(self):
        raiz = self.preparar()
        ruta = os.path.join(raiz, "datos", "temas", "tema-23.json")
        d = json.loads(leer(ruta))
        for n in d["normas"]:
            n.pop("verificado", None)
        escribir(ruta, json.dumps(d, ensure_ascii=False, indent=2))
        r = self.ejecutar_como_el_workflow(raiz)
        self.assertIn("aviso: normas[0]: falta 'verificado'", r.stdout)  # el validador avisa...
        self.assertEqual(r.returncode, 0, r.stdout[-600:])  # ...pero no bloquea


if __name__ == "__main__":
    unittest.main()
