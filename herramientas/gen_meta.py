#!/usr/bin/env python
"""Genera datos/meta.json a partir del Anexo I literal (fuentes/anexo-I-literal.txt)."""
import json
import re

CORTOS = {
    1: "Derecho, normas y persona",
    2: "Constitución (I): derechos y principios",
    3: "Constitución (II): instituciones",
    4: "Unión Europea y cooperación policial",
    5: "Administración General del Estado y Gobierno",
    6: "Funcionarios públicos",
    7: "Ministerio del Interior y Seguridad",
    8: "Dirección General de la Policía y Policía Nacional",
    9: "LO 2/1986 de Fuerzas y Cuerpos de Seguridad",
    10: "Extranjería: entrada, residencia y libre circulación",
    11: "Extranjería: infracciones y sanciones",
    12: "Protección internacional (asilo)",
    13: "Seguridad privada",
    14: "Seguridad Ciudadana (LO 4/2015)",
    15: "Infraestructuras críticas y ciberseguridad",
    16: "Derecho Penal: parte general",
    17: "Delitos contra las personas y la libertad",
    18: "Delitos contra el patrimonio",
    19: "Delitos contra el orden público y armas",
    20: "Delitos informáticos y prueba digital",
    21: "Procesal penal, detención y Policía Judicial",
    22: "Estatuto de la víctima del delito",
    23: "Igualdad, violencia de género, discapacidad y LGTBI",
    24: "Introducción a la prevención de riesgos laborales",
    25: "Marco normativo de prevención de riesgos laborales",
    26: "Protección de datos personales",
    27: "Derechos Humanos",
    28: "Globalización y antiglobalización",
    29: "Actitudes y valores sociales",
    30: "Principios éticos, contravalores y delitos de odio",
    31: "Inmigración e integración social",
    32: "Geografía humana y demografía",
    33: "La seguridad y la delincuencia",
    34: "Drogodependencias",
    35: "Desarrollo sostenible",
    36: "Gramática de la lengua española",
    37: "Ortografía de la lengua española",
    38: "Sistemas operativos",
    39: "Redes informáticas",
    40: "Inteligencia y fuentes abiertas (OSINT)",
    41: "Ciberdelincuencia y amenazas",
    42: "Armas de fuego",
    43: "El vehículo prioritario",
    44: "Seguridad en la conducción de vehículos prioritarios",
    45: "PRL en seguridad vial",
}

BLOQUES = [
    {"id": "A", "nombre": "Ciencias Jurídicas", "temas": [1, 26]},
    {"id": "B", "nombre": "Ciencias Sociales", "temas": [27, 37]},
    {"id": "C", "nombre": "Materias Técnico-Científicas", "temas": [38, 45]},
]


def main():
    lineas = open("fuentes/anexo-I-literal.txt", encoding="utf-8").read().splitlines()
    temas = {}
    for l in lineas:
        # El BOE usa espacios no separables (U+00A0) y cuadratines (U+2003): \s los cubre en Unicode.
        m = re.match(r"\s*Tema\s+(\d+)\.\s*(.*)", l)
        if m:
            temas[int(m.group(1))] = re.sub(r"\s+", " ", m.group(2)).strip()
    assert sorted(temas) == list(range(1, 46)), "faltan temas en el anexo"
    out = {
        "convocatoria": {
            "titulo": "Resolución de 7 de julio de 2026, de la Dirección General de la Policía, por la que se convoca oposición libre para la Escala Básica, categoría de Policía",
            "boe": "BOE-A-2026-15055",
            "url": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-15055",
            "publicacion": "BOE núm. 167, de 10 de julio de 2026",
        },
        "bloques": BLOQUES,
        "temas": [
            {
                "tema": n,
                "titulo": CORTOS[n],
                "bloque": next(b["id"] for b in BLOQUES if b["temas"][0] <= n <= b["temas"][1]),
                "oficial": temas[n],
            }
            for n in range(1, 46)
        ],
    }
    import os
    os.makedirs("datos", exist_ok=True)
    with open("datos/meta.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("datos/meta.json:", len(out["temas"]), "temas")


if __name__ == "__main__":
    main()
