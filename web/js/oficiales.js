/* Exámenes oficiales importados por el opositor y calibración de nivel.

   Los exámenes NO forman parte de la web publicada: se convierten con herramientas/importar_examen.py y se
   importan aquí desde un fichero .json. Se guardan solo en este navegador (localStorage). */
(function () {
  var AA = window.AA;
  var h = AA.h;
  var store = AA.store;
  var V = (AA.vistas = AA.vistas || {});
  var CLAVE = "academia-abierta-oficiales-v1";
  var FORMATO = "academia-abierta-examen-v1";
  // Notas de corte orientativas de la prueba de conocimientos (portales y academias; ver «Proceso»)
  var CORTES = { P39: 5.4, P40: 6.16, P41: 7.72, P42: 7.17, P43: 7.05 };
  var MINIMO_CALIBRAR = 30; // respuestas oficiales necesarias para dar una estimación

  function cargar() {
    try {
      var o = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (o && o.examenes) return o;
    } catch (e) {}
    return { examenes: {} };
  }
  function guardar(o) {
    try { localStorage.setItem(CLAVE, JSON.stringify(o)); return true; } catch (e) { return false; }
  }

  /* Comprueba un examen importado. Devuelve una lista de errores (vacía si es válido). */
  function validar(ex) {
    var err = [];
    if (!ex || ex.formato !== FORMATO) return ["No es un fichero de examen de importar_examen.py (formato desconocido)."];
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(ex.codigo || "")) err.push("El código del examen no es válido.");
    if (!Array.isArray(ex.preguntas) || !ex.preguntas.length) return err.concat(["El examen no tiene preguntas."]);
    ex.preguntas.forEach(function (q, i) {
      var n = q && q.n != null ? q.n : i + 1;
      if (!q || typeof q.enunciado !== "string" || !q.enunciado.trim()) err.push("Pregunta " + n + ": sin enunciado.");
      if (!q || !Array.isArray(q.opciones) || q.opciones.length !== 3) err.push("Pregunta " + n + ": debe tener 3 opciones.");
      if (q && !q.anulada && [0, 1, 2].indexOf(q.correcta) < 0) err.push("Pregunta " + n + ": sin respuesta correcta.");
    });
    return err;
  }

  /* Preguntas jugables (sin las anuladas) con el mismo formato que el banco propio. */
  function preguntasDe(ex) {
    return ex.preguntas.filter(function (q) { return !q.anulada; }).map(function (q) {
      var tema = q.tema && AA.temas[q.tema] ? q.tema : 0;
      return {
        id: "of_" + ex.codigo + "_" + q.n, tema: tema, bloque: tema ? AA.temas[tema].bloque : null,
        q: q.enunciado, ops: q.opciones, ok: q.correcta,
        exp: "Pregunta oficial: la plantilla da como correcta la opción marcada. No hay explicación propia.",
        ref: "Examen oficial " + (ex.titulo || ex.codigo) + ", pregunta " + q.n, dif: 2, verif: null, oficial: true,
      };
    });
  }

  /* Aciertos del banco propio frente a las preguntas oficiales, y nota real estimada. */
  function calibracion() {
    var S = store.estado();
    var propia = store.statsGlobal();
    var of = { intentos: 0, aciertos: 0, vistas: 0 };
    Object.keys(S.preg || {}).forEach(function (k) {
      if (k.indexOf("of_") !== 0) return;
      var r = S.preg[k];
      of.vistas++; of.intentos += r.n; of.aciertos += r.ok;
    });
    of.pct = of.intentos ? Math.round((100 * of.aciertos) / of.intentos) : 0;
    var sims = store.simulacros();
    var propios = sims.filter(function (s) { return !s.oficial && s.n >= 50; }).slice(-5);
    var oficiales = sims.filter(function (s) { return s.oficial; }).slice(-5);
    var media = function (l) { return l.length ? l.reduce(function (a, s) { return a + s.nota; }, 0) / l.length : null; };
    var out = {
      propia: { pct: propia.pct, intentos: propia.intentos }, oficial: of,
      notaSimulacros: media(propios), notaOficiales: media(oficiales), suficiente: of.intentos >= MINIMO_CALIBRAR,
      factor: null, notaEstimada: null, objetivo: 7.5,
    };
    if (out.suficiente && propia.intentos && propia.pct) {
      out.factor = Math.round((of.pct / propia.pct) * 100) / 100;
      // Lo más fiable es la nota en exámenes oficiales; si no hay, se proyecta la de los simulacros con el factor.
      out.notaEstimada = out.notaOficiales != null ? out.notaOficiales : (out.notaSimulacros != null ? Math.min(10, out.notaSimulacros * out.factor) : null);
    }
    return out;
  }

  AA.oficiales = {
    listar: function () {
      var o = cargar();
      return Object.keys(o.examenes).map(function (k) { return o.examenes[k]; }).sort(function (a, b) { return (b.fecha || "").localeCompare(a.fecha || ""); });
    },
    importar: function (ex) {
      var err = validar(ex);
      if (err.length) return err;
      var o = cargar();
      o.examenes[ex.codigo] = ex;
      return guardar(o) ? [] : ["No se ha podido guardar en este navegador (almacenamiento lleno o bloqueado)."];
    },
    eliminar: function (codigo) {
      var o = cargar();
      delete o.examenes[codigo];
      guardar(o);
    },
    corteDe: function (codigo) { return CORTES[codigo] || null; },
    validar: validar, preguntasDe: preguntasDe, calibracion: calibracion, MINIMO_CALIBRAR: MINIMO_CALIBRAR,
  };

  /* ---------- Tarjeta de calibración (la usan esta vista y «Progreso») ---------- */
  AA.tarjetaCalibracion = function () {
    var c = calibracion();
    var cuerpo = h("div", { class: "stack" });
    var barra = function (etq, pct, cls) {
      return h("div", { class: "calib-fila" }, h("span", {}, etq), h("div", { class: "bar" + (cls ? " " + cls : "") }, h("i", { style: "width:" + pct + "%" })), h("strong", { class: "num" }, pct + " %"));
    };
    cuerpo.appendChild(barra("Banco propio", c.propia.pct));
    cuerpo.appendChild(barra("Exámenes oficiales", c.oficial.pct, "bar--B"));
    if (!c.suficiente) {
      cuerpo.appendChild(h("p", { class: "muted" }, "Responde al menos " + MINIMO_CALIBRAR + " preguntas de exámenes oficiales para comparar tu nivel (llevas " + c.oficial.intentos + ")."));
    } else {
      cuerpo.appendChild(h("p", {}, c.factor < 1 ?
        "En las preguntas oficiales aciertas un " + Math.round((1 - c.factor) * 100) + " % menos que en el banco propio: el examen real te resulta más difícil que el banco." :
        "Aciertas igual o más en las preguntas oficiales que en el banco propio."));
      if (c.notaEstimada != null) {
        var ok = c.notaEstimada >= c.objetivo;
        cuerpo.appendChild(h("div", { class: "objetivo " + (ok ? "objetivo--ok" : "objetivo--no") },
          h("strong", {}, "Nota real estimada: " + AA.fmt1(c.notaEstimada)), " · objetivo " + AA.fmt1(c.objetivo) +
          (c.notaOficiales != null ? " (media de tus exámenes oficiales)" : " (simulacros corregidos con tu diferencia entre banco y oficiales)")));
      }
    }
    return h("div", { class: "card" }, h("h2", { class: "sec-title" }, "Calibración con exámenes reales"), cuerpo);
  };

  /* ---------- Vista «Exámenes oficiales» ---------- */
  V.oficiales = function () {
    var root = h("div");
    root.appendChild(h("div", { class: "eyebrow" }, "Calibración con exámenes reales"));
    root.appendChild(h("h1", { class: "page-title" }, "Exámenes oficiales"));
    root.appendChild(h("p", { class: "lead" }, "Haz los exámenes de convocatorias anteriores con las mismas reglas que el real y compara tu acierto con el del banco propio. Los exámenes no están en esta web: los importas tú y se guardan solo en este navegador."));

    var estado = h("p", { class: "muted", role: "status", style: "margin-top:8px" });
    var input = h("input", { type: "file", id: "importar-examen", accept: ".json,application/json", class: "sr" });
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var lector = new FileReader();
      lector.onload = function () {
        var ex;
        try { ex = JSON.parse(lector.result); } catch (e) { estado.textContent = "El fichero no es JSON válido."; return; }
        var err = AA.oficiales.importar(ex);
        if (err.length) { estado.textContent = "No se ha importado: " + err.slice(0, 3).join(" "); return; }
        AA.toast("Examen " + ex.codigo + " importado");
        pintar();
      };
      lector.readAsText(f);
      input.value = "";
    });
    root.appendChild(h("section", { class: "section card stack" },
      h("h2", { class: "sec-title" }, "Importar un examen"),
      h("ol", { class: "pasos-import" },
        h("li", {}, "Descarga el cuestionario y la plantilla de respuestas de una convocatoria anterior (Portal del Aspirante de policia.es o la copia que tengas)."),
        h("li", {}, "Conviértelos con: ", h("code", {}, "python -I herramientas/importar_examen.py cuestionario.pdf --plantilla plantilla.txt --codigo P43 --fecha 2026-09-26")),
        h("li", {}, "Elige aquí el fichero examenes/P43.json que genera.")),
      h("div", { class: "row" }, h("label", { for: "importar-examen", class: "btn btn--primary" }, "Importar examen (.json)"), input),
      estado));

    var lista = h("section", { class: "section" });
    root.appendChild(lista);
    var calib = h("section", { class: "section" });
    root.appendChild(calib);

    function pintar() {
      lista.textContent = "";
      calib.textContent = "";
      var exs = AA.oficiales.listar();
      lista.appendChild(h("h2", { class: "sec-title" }, exs.length ? "Tus exámenes" : "Todavía no has importado ningún examen"));
      var grid = h("div", { class: "grid" });
      exs.forEach(function (ex) {
        var validas = preguntasDe(ex);
        var corte = AA.oficiales.corteDe(ex.codigo);
        var hechos = store.simulacros().filter(function (s) { return s.oficial === ex.codigo; });
        var ultimo = hechos.length ? hechos[hechos.length - 1] : null;
        var borrar = h("button", { class: "btn btn--sm btn--ghost", onclick: function () {
          if (borrar.dataset.seguro) { AA.oficiales.eliminar(ex.codigo); pintar(); return; }
          borrar.dataset.seguro = "1"; borrar.textContent = "Pulsa otra vez para eliminar";
        } }, "Eliminar");
        grid.appendChild(h("div", { class: "card stack" },
          h("div", {}, h("h3", {}, ex.titulo || ex.codigo), h("div", { class: "muted", style: "font-size:.88rem" },
            (ex.fecha ? AA.fecha(ex.fecha) + " · " : "") + validas.length + " preguntas válidas" + (ex.preguntas.length - validas.length ? " (" + (ex.preguntas.length - validas.length) + " anuladas)" : "") +
            (corte ? " · nota de corte orientativa " + AA.fmt1(corte) : ""))),
          ultimo ? h("div", { class: "num" }, "Último intento: ", h("strong", {}, AA.fmt1(ultimo.nota)), " / 10") : null,
          h("div", { class: "row" },
            // en el orden del cuestionario original, como el día del examen
            h("button", { class: "btn btn--sm btn--primary", onclick: function () { AA.test.prepararOficial(ex, "examen", preguntasDe(ex)); } }, "Hacer en modo examen"),
            h("button", { class: "btn btn--sm", onclick: function () { AA.test.prepararOficial(ex, "estudio", preguntasDe(ex)); } }, "Modo estudio"),
            borrar)));
      });
      if (exs.length) lista.appendChild(grid);
      calib.appendChild(AA.tarjetaCalibracion());
    }
    pintar();
    root.appendChild(h("p", { class: "muted", style: "margin-top:18px;font-size:.85rem" },
      "Las preguntas oficiales no llevan explicación ni insignia de verificación: la referencia es la plantilla del tribunal. Comprueba en el BOE las que hayan podido quedar desfasadas por reformas posteriores."));
    return root;
  };
})();
