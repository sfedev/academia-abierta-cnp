"""Lanza con Node.js las pruebas de la lógica de la web (herramientas/tests/js/*.test.js)."""
import glob
import os
import shutil
import subprocess
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "Node.js no está instalado: se omiten las pruebas de JavaScript")
class PruebasJavaScript(unittest.TestCase):
    pass


def _crear(ruta):
    nombre = os.path.basename(ruta)[:-len(".test.js")]

    def prueba(self):
        r = subprocess.run([NODE, "--test", ruta], capture_output=True, text=True, encoding="utf-8", timeout=120)
        self.assertEqual(r.returncode, 0, "\n" + r.stdout[-3500:] + r.stderr[-1500:])

    prueba.__name__ = "test_" + nombre.replace("-", "_")
    return prueba


for _ruta in sorted(glob.glob(os.path.join(AQUI, "js", "*.test.js"))):
    _f = _crear(_ruta)
    setattr(PruebasJavaScript, _f.__name__, _f)

if __name__ == "__main__":
    unittest.main()
