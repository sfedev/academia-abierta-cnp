"""Utilidades comunes de las pruebas. Solo biblioteca estándar."""
import glob
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
HERRAMIENTAS = os.path.dirname(AQUI)
RAIZ = os.path.dirname(HERRAMIENTAS)
_CACHE = {}


def cargar_modulo(nombre):
    """Importa herramientas/<nombre>.py por su ruta (python -I no añade esa carpeta a sys.path)."""
    if nombre not in _CACHE:
        spec = importlib.util.spec_from_file_location("hh_" + nombre, os.path.join(HERRAMIENTAS, nombre + ".py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _CACHE[nombre] = mod
    return _CACHE[nombre]


def fichas_reales():
    return sorted(glob.glob(os.path.join(RAIZ, "datos", "temas", "tema-*.json")))


def leer(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def escribir(path, txt):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(txt)


def quitar_ids(txt):
    """Texto de una ficha tal y como estaba antes de asignar ids (quita `"id": "…",` y su separación)."""
    return re.sub(r'"id":\s*"[^"]*",\s*', "", txt)


class ConTemporal(unittest.TestCase):
    """Cada test dispone de una carpeta temporal que se borra al terminar."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="aa_test_")
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def ruta(self, *partes):
        return os.path.join(self.tmp, *partes)
