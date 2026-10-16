#!/usr/bin/env python
"""Ejecuta la batería de pruebas del proyecto (Python y JavaScript), sin dependencias externas.

Uso:
  python -I herramientas/ejecutar_tests.py              # todo
  python -I herramientas/ejecutar_tests.py f1 f2        # solo las pruebas de las fases 1 y 2
  python -I herramientas/ejecutar_tests.py js -v        # solo las pruebas de JavaScript, con detalle

Cada fichero herramientas/tests/test_<filtro>*.py es un módulo `unittest`. Las pruebas de la lógica de la web
(Leitner, nota del test, muestreo, simulacro, progreso guardado) están en herramientas/tests/js/*.test.js y las
lanza test_js.py con Node.js; si Node no está instalado, esas pruebas se omiten y el resumen lo indica.
Las pruebas no usan la red ni modifican los datos del repositorio (trabajan en carpetas temporales).
Sale con código 1 si falla alguna.
"""
import glob
import os
import sys
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
TESTS = os.path.join(AQUI, "tests")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    try:  # la consola de Windows usa cp1252 y no puede mostrar los símbolos que imprime Node
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    detalle = "-v" in argv
    filtros = [a for a in argv if not a.startswith("-")]
    sys.path.insert(0, TESTS)  # python -I no añade carpetas al path
    modulos = [os.path.splitext(os.path.basename(p))[0] for p in sorted(glob.glob(os.path.join(TESTS, "test_*.py")))]
    if filtros:
        modulos = [m for m in modulos if any(m.startswith("test_" + f) for f in filtros)]
    if not modulos:
        print("Ninguna prueba coincide con: %s" % ", ".join(filtros))
        return 1
    cargador = unittest.TestLoader()
    suite = unittest.TestSuite(cargador.loadTestsFromName(m) for m in modulos)
    print("Pruebas: %s" % ", ".join(m[5:] for m in modulos))
    t0 = time.time()
    res = unittest.TextTestRunner(verbosity=2 if detalle else 1, stream=sys.stdout).run(suite)
    omitidas = len(res.skipped)
    print("\n%d pruebas, %d fallos, %d errores, %d omitidas (%.1f s)" % (res.testsRun, len(res.failures), len(res.errors), omitidas, time.time() - t0))
    for _, motivo in res.skipped:
        print("  omitida: %s" % motivo)
    print("TODO CORRECTO" if res.wasSuccessful() else "HAY FALLOS")
    return 0 if res.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
