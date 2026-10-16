/* Baremos de las pruebas de aptitud física: Anexo II de la Resolución de 7 de julio de 2026 (BOE-A-2026-15055).
   Cada lista "umbrales" va de la mejor marca a la peor: la primera fila cuyo límite se cumple da los puntos. */
window.AA_FISICAS = {
  fuente: "Anexo II, BOE-A-2026-15055 (BOE núm. 167, 10/07/2026)",
  agilidad: {
    nombre: "Circuito de agilidad",
    unidad: "segundos (décimas)",
    eliminaH: 11.7, // 11,7 s o más = 0 puntos y eliminación
    eliminaM: 12.8,
    // tiempo <= limite → puntos
    H: [[8.2, 10], [8.8, 9], [9.3, 8], [9.7, 7], [10.1, 6], [10.5, 5], [10.9, 4], [11.2, 3], [11.4, 2], [11.6, 1]],
    M: [[9.3, 10], [9.8, 9], [10.3, 8], [10.8, 7], [11.2, 6], [11.6, 5], [12.0, 4], [12.3, 3], [12.5, 2], [12.7, 1]],
  },
  fuerza: {
    H: {
      nombre: "Dominadas (agarre prono)",
      unidad: "repeticiones",
      // repeticiones >= limite → puntos
      tabla: [[17, 10], [16, 9], [15, 8], [14, 7], [12, 6], [10, 5], [8, 4], [7, 3], [6, 2], [5, 1]],
    },
    M: {
      nombre: "Suspensión con barbilla sobre la barra (agarre supino)",
      unidad: "segundos",
      tabla: [[95, 10], [86, 9], [78, 8], [70, 7], [63, 6], [57, 5], [52, 4], [46, 3], [41, 2], [36, 1]],
    },
  },
  resistencia: {
    nombre: "1.000 metros lisos",
    unidad: "min:seg",
    // segundos <= limite → puntos
    H: [[174, 10], [180, 9], [186, 8], [192, 7], [198, 6], [204, 5], [210, 4], [216, 3], [222, 2], [228, 1]],
    M: [[204, 10], [213, 9], [222, 8], [231, 7], [240, 6], [249, 5], [258, 4], [267, 3], [276, 2], [285, 1]],
  },
};
