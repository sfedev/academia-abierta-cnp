/* Páginas: proceso selectivo, pruebas físicas y progreso. */
(function () {
  var AA = window.AA;
  var h = AA.h;
  var store = AA.store;
  var V = (AA.vistas = AA.vistas || {});
  var CONV = "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-15055";

  function ext(url, txt) {
    return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, txt);
  }
  function ul(items) {
    return h("ul", { style: "margin:0;padding-left:1.15em;display:grid;gap:6px" }, items.map(function (x) { return h("li", { html: AA.rich(x) }); }));
  }
  function tabla(cab, filas, extraCls) {
    return h("div", { class: "tbl" }, h("table", { style: "min-width:420px" },
      h("thead", {}, h("tr", {}, cab.map(function (c) { return h("th", {}, c); }))),
      h("tbody", {}, filas.map(function (f) { return h("tr", {}, f.map(function (c) { return h("td", { html: AA.rich(c) }); })); }))));
  }

  /* ================= Proceso selectivo ================= */
  V.proceso = function () {
    var root = h("div", { style: "max-width:860px" });
    root.appendChild(h("div", { class: "eyebrow" }, "Escala Básica · categoría de Policía"));
    root.appendChild(h("h1", { class: "page-title" }, "Cómo es el proceso selectivo"));
    root.appendChild(h("p", { class: "lead" }, "Resumen de la convocatoria de 2026 (", ext(CONV, "BOE-A-2026-15055"), "). Las próximas convocatorias suelen seguir el mismo esquema, pero lee siempre las bases publicadas."));

    function sec(titulo, cuerpo) {
      root.appendChild(h("section", { class: "section" }, h("h2", { class: "sec-title" }, titulo), cuerpo));
    }

    sec("La convocatoria", h("div", { class: "card" }, ul([
      "**2.704 plazas** de alumnos de la Escuela Nacional de Policía: **2.163** de oposición libre y **541** reservadas a militares de tropa y marinería con al menos cinco años de servicio.",
      "Resolución de 7 de julio de 2026 de la Dirección General de la Policía, publicada en el BOE núm. 167 de 10 de julio de 2026.",
      "El proceso tiene tres fases: **oposición**, **curso de formación** y **módulo de formación práctica en puesto de trabajo**.",
      "Plazo de solicitud: quince días hábiles desde el día siguiente a la publicación. La solicitud es telemática en el Portal del Aspirante de policia.es.",
    ])));

    sec("Requisitos principales", h("div", { class: "card" }, ul([
      "Nacionalidad española y mayoría de edad (18 años), sin exceder la edad máxima de jubilación en la Policía Nacional.",
      "No haber sido condenado por delito doloso grave o menos grave, ni separado del servicio de una Administración, ni inhabilitado para funciones públicas.",
      "No incurrir en el cuadro médico de exclusiones (Real Decreto 326/2021) y no consumir drogas.",
      "Compromiso de portar armas y, en su caso, utilizarlas.",
      "Permiso de conducir **clase B** sin restricciones y título de **Bachiller** o equivalente.",
      "Nivel **A2 como mínimo en inglés o francés**, acreditado antes de que termine el plazo de solicitud.",
    ])));

    // Idioma y psicotécnicos: datos de datos/proceso.json (bases de la convocatoria)
    var P = AA.meta.proceso;
    if (P && P.idioma) {
      var id = P.idioma;
      var check = h("input", { type: "checkbox", id: "tengo-a2" });
      check.checked = !!store.ajuste("a2");
      check.addEventListener("change", function () {
        store.ajuste("a2", check.checked);
        AA.toast(check.checked ? "Anotado: ya tienes el A2" : "Recordatorio del A2 activado");
      });
      var certs = function (titulo, lista) { return h("div", { style: "min-width:0" }, h("strong", {}, titulo), ul(lista)); };
      sec("Idioma: nivel A2 obligatorio", h("div", { class: "card stack", id: "idioma" },
        h("p", { html: AA.rich("**" + id.requisito + "** " + id.consecuencia) }),
        h("p", {}, id.comoSeAcredita),
        h("div", { class: "grid" },
          certs("Inglés y francés", id.certificadosA2.inglesYFrances),
          certs("Inglés: certificados que acreditan A2", id.certificadosA2.ingles),
          certs("Francés: certificados que acreditan A2", id.certificadosA2.frances)),
        tabla(["Nivel acreditado (mérito)", "Puntos"], id.meritos.map(function (m) { return [m.nivel, AA.fmt1(m.puntos)]; })),
        h("p", { class: "muted" }, id.meritosTexto),
        h("div", { class: "notice" }, h("strong", {}, "Consejo: "), id.consejo),
        h("label", { class: "opt-line", for: "tengo-a2" }, check, "Ya tengo un certificado A2 válido (oculta el recordatorio del Panel)")));
    }
    if (P && P.psicotecnicos) {
      var ps = P.psicotecnicos;
      sec("Test psicotécnicos", h("div", { class: "card stack" },
        ul([ps.descripcion, ps.formula, ps.calificacion, ps.cuando, ps.impugnacion]),
        h("div", {}, AA.ui.enlace("psicotecnicos", "btn btn--sm btn--primary", "Practicar psicotécnicos"))));
    }

    sec("Pruebas de la fase de oposición", tabla(
      ["Prueba", "En qué consiste", "Cómo se supera"],
      [
        ["**1.ª Conocimientos**", "Test de **100 preguntas** con 3 opciones, **50 minutos**, sobre el temario (Anexo I). Se hace en acto único con los test psicotécnicos.", "Mínimo **3 puntos** y estar entre los mejores hasta **1,75 aspirantes por plaza** libre."],
        ["**2.ª Aptitud física**", "Circuito de agilidad, dominadas (hombres) o suspensión en barra (mujeres) y 1.000 metros.", "Media de los tres ejercicios de **5 puntos** como mínimo; un **0** en cualquiera elimina."],
        ["**3.ª** Reconocimiento médico", "Comprobación de que no hay causas de exclusión del cuadro médico (RD 326/2021) y analíticas.", "Apto / no apto."],
        ["**3.ª** Entrevista personal", "Entrevista profesional y personal; seis criterios (socialización, comunicación, orientación a metas, personalidad, observaciones clínicas, competencias profesionales). Guía completa en la pestaña Entrevista.", "Apto con los seis puntos iniciales mantenidos; con menos de seis, no apto."],
        ["**3.ª** Test psicotécnicos", "Uno o varios test de aptitudes, máximo 60 minutos en total.", "Apto / no apto según el mínimo que fije el tribunal."],
      ]));
    root.lastChild.appendChild(h("div", { class: "row", style: "margin-top:12px" },
      AA.ui.enlace("fisicas", "btn btn--sm", "Calculadora y registro de marcas físicas"),
      AA.ui.enlace("entrevista", "btn btn--sm", "Guía de la entrevista")));

    sec("La nota del test de conocimientos", h("div", { class: "card stack" },
      h("p", {}, "Fórmula oficial: ", h("span", { class: "mono" }, "[A − E/(n−1)] × 10 / P"), ", con A aciertos, E errores, n = 3 alternativas y P = 100 preguntas. Cada error resta **0,5** aciertos."),
      h("p", { class: "muted" }, "Ejemplo: 70 aciertos, 20 errores y 10 en blanco dan (70 − 10) × 10 / 100 = 6,00. Las respuestas en blanco no restan."),
      h("p", {}, "Tienes dos días hábiles para impugnar preguntas tras la publicación del cuestionario.")
    ));

    sec("Calificación final y méritos", h("div", { class: "card" }, ul([
      "La calificación final de la oposición es la **suma** de la nota del test de conocimientos y la de aptitud física.",
      "Desempates, por este orden: conocimientos, aptitud física, primer ejercicio físico (y después el segundo y el tercero) y test psicotécnicos.",
      "Después se suman méritos a quien haya superado la oposición: **idiomas** (B1 0,5; B2 1; C1 1,5; C2 2 puntos, máximo 2), servicios en las Fuerzas Armadas (0,15 por año, máximo 1,5, más puntos por empleo) y deportistas de alto nivel.",
    ])));

    sec("Notas de corte del test de conocimientos (orientativas)", h("div", {},
      tabla(["Examen", "Fecha", "Nota de corte", "Reparto jurídicas / sociales / técnicas"], [
        ["P39", "23/04/2023", "5,4", "71 / 14 / 15"],
        ["P40", "13/04/2024", "6,16", "80 / 11 / 8"],
        ["P41", "01/03/2025", "7,72", "77 / 11 / 12"],
        ["P42", "25/10/2025", "≈ 7,17", "73 / 15 / 12"],
        ["P43", "26/09/2026", "7,05 (sin confirmar)", "74 / 15 / 11"],
      ]),
      h("p", { class: "muted", style: "margin-top:10px;font-size:.88rem" }, "Cifras recogidas de portales de oposiciones y de análisis de academias; no hemos podido contrastarlas con el Portal del Aspirante. El reparto por bloques sigue la clasificación de una de esas academias y puede diferir unas preguntas de otras.")
    ));

    sec("Fuentes", h("div", { class: "card" }, ul([
      "Bases oficiales: Resolución de 7 de julio de 2026 (BOE-A-2026-15055), con el temario en el Anexo I y los baremos físicos en el Anexo II.",
      "Reglamento de procesos selectivos y formación de la Policía Nacional (Real Decreto 853/2022) y Orden INT/632/2024.",
      "Resúmenes de temas: texto consolidado de cada norma en el BOE; el día de la última consulta figura en cada ficha.",
      "Preguntas de exámenes anteriores: se han usado análisis publicados por academias y los cuestionarios para saber qué conceptos se preguntan. Las preguntas de esta web son originales.",
    ])));

    sec("Aviso", h("div", { class: "notice" }, h("strong", {}, "Material de estudio no oficial. "), "Está elaborado desde el BOE, pero puede contener errores o quedar desfasado por reformas posteriores. Contrasta los datos decisivos con el texto vigente del BOE y con la convocatoria que te afecte."));
    return root;
  };

  /* ================= Pruebas físicas ================= */
  var calc = { sexo: null, agil: "", fuerza: "", min: "", seg: "" };
  var reg = { dia: "", ej: "agilidad", v: "", min: "", seg: "" }; // formulario del registro de marcas
  var FA = AA.fisicas;

  function elegirBaremo(b) {
    calc.sexo = b;
    store.ajuste("baremo", b);
  }

  V.fisicas = function () {
    var FIS = window.AA_FISICAS;
    if (!calc.sexo) calc.sexo = store.ajuste("baremo") === "M" ? "M" : "H";
    var root = h("div", { style: "max-width:860px" });
    root.appendChild(h("div", { class: "eyebrow" }, "Segunda prueba · Anexo II de la convocatoria"));
    root.appendChild(h("h1", { class: "page-title" }, "Pruebas físicas"));
    root.appendChild(h("p", { class: "lead" }, "Tres ejercicios puntuados de 0 a 10. Se aprueba con una media de 5 y sin ningún 0, y la nota se suma a la del test de conocimientos. Calcula tu nota con los baremos oficiales y anota tus marcas para ver cómo evolucionas."));

    var sal = h("div", { class: "section" });
    var form = h("div", { class: "card setup" });
    var seg = h("div", { class: "seg", role: "group", "aria-label": "Baremo" },
      h("button", { type: "button", "aria-pressed": calc.sexo === "H" ? "true" : "false", onclick: function () { elegirBaremo("H"); pintarTodo(); } }, "Hombres"),
      h("button", { type: "button", "aria-pressed": calc.sexo === "M" ? "true" : "false", onclick: function () { elegirBaremo("M"); pintarTodo(); } }, "Mujeres")
    );
    form.appendChild(h("div", { class: "row", style: "margin-bottom:14px" }, h("strong", {}, "Baremo:"), seg));
    var fuerzaNombre = calc.sexo === "H" ? FIS.fuerza.H : FIS.fuerza.M;
    var inputs = h("div", { class: "calc" },
      h("label", { for: "f-agil" }, "Circuito de agilidad", h("input", { class: "field", id: "f-agil", type: "number", step: "0.1", min: "0", placeholder: "p. ej. 9,8", inputmode: "decimal", value: calc.agil, oninput: function (e) { calc.agil = e.target.value; resultado(); } }), h("small", {}, "segundos, con una décima")),
      h("label", { for: "f-fuerza" }, fuerzaNombre.nombre, h("input", { class: "field", id: "f-fuerza", type: "number", step: "1", min: "0", placeholder: calc.sexo === "H" ? "p. ej. 10" : "p. ej. 60", inputmode: "numeric", value: calc.fuerza, oninput: function (e) { calc.fuerza = e.target.value; resultado(); } }), h("small", {}, fuerzaNombre.unidad)),
      h("label", { for: "f-min" }, "1.000 metros", h("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" },
        h("input", { class: "field", id: "f-min", type: "number", step: "1", min: "0", placeholder: "min", inputmode: "numeric", "aria-label": "Minutos", value: calc.min, oninput: function (e) { calc.min = e.target.value; resultado(); } }),
        h("input", { class: "field", id: "f-seg", type: "number", step: "1", min: "0", max: "59", placeholder: "seg", inputmode: "numeric", "aria-label": "Segundos", value: calc.seg, oninput: function (e) { calc.seg = e.target.value; resultado(); } })), h("small", {}, "minutos y segundos"))
    );
    form.appendChild(inputs);
    root.appendChild(form);
    root.appendChild(sal);

    function resultado() {
      sal.textContent = "";
      var ag = parseFloat(String(calc.agil).replace(",", "."));
      var fu = parseFloat(calc.fuerza);
      var mi = parseFloat(calc.min);
      var se = parseFloat(calc.seg);
      var tiene = { a: !isNaN(ag), f: !isNaN(fu), r: !isNaN(mi) || !isNaN(se) };
      var b = calc.sexo;
      var elimina = b === "H" ? FIS.agilidad.eliminaH : FIS.agilidad.eliminaM;
      var pa = tiene.a ? (ag >= elimina ? 0 : FA.puntos("agilidad", b, ag)) : null;
      var pf = tiene.f ? FA.puntos("fuerza", b, fu) : null;
      var segs = tiene.r ? (isNaN(mi) ? 0 : mi) * 60 + (isNaN(se) ? 0 : se) : null;
      var pr = tiene.r ? FA.puntos("resistencia", b, segs) : null;
      var celdas = [["Agilidad", pa, "agilidad", ag], ["Fuerza", pf, "fuerza", fu], ["1.000 m", pr, "resistencia", segs]];
      var grid = h("div", { class: "grid" });
      celdas.forEach(function (c) {
        grid.appendChild(h("div", { class: "card" }, h("div", { class: "eyebrow" }, c[0]), h("div", { class: "pts" + (c[1] === 0 ? " ko" : "") , style: c[1] === 0 ? "color:var(--ko)" : "" }, c[1] == null ? "–" : c[1]), h("div", { class: "muted", style: "font-size:.85rem" }, "puntos"),
          c[1] == null ? null : h("p", { class: "marca-sig" }, FA.textoSiguiente(c[2], b, FA.siguiente(c[2], b, c[3])))));
      });
      sal.appendChild(grid);
      if (pa != null && pf != null && pr != null) {
        var media = (pa + pf + pr) / 3;
        var cero = pa === 0 || pf === 0 || pr === 0;
        var apto = media >= 5 && !cero;
        sal.appendChild(h("div", { class: "card section", style: "border-color:" + (apto ? "var(--ok)" : "var(--ko)") },
          h("div", { class: "row-between" },
            h("div", {}, h("div", { class: "eyebrow" }, "Nota de la prueba (media)"), h("div", { class: "pts num" }, AA.fmt1(media))),
            h("span", { class: "pill", style: "font-size:.9rem;padding:4px 14px;background:" + (apto ? "var(--ok-soft)" : "var(--ko-soft)") + ";color:" + (apto ? "var(--ok)" : "var(--ko)") }, apto ? "Superada" : "No superada")
          ),
          h("p", { class: "muted", style: "margin-top:8px" }, cero ? "Un ejercicio con 0 puntos elimina, aunque la media sea alta." : media < 5 ? "Hace falta una media de 5 como mínimo." : "Esta nota se suma a la del test de conocimientos para la calificación final.")
        ));
      } else {
        sal.appendChild(h("p", { class: "muted", style: "margin-top:12px" }, "Rellena los tres ejercicios para ver la nota de la prueba."));
      }
    }
    resultado();

    function pintarTodo() {
      var host = document.getElementById("vista");
      if (host) { host.textContent = ""; host.appendChild(V.fisicas()); }
    }

    root.appendChild(seccionRegistro(calc.sexo));

    var reglas = h("section", { class: "section" }, h("h2", { class: "sec-title" }, "Cómo se hace cada ejercicio"),
      h("div", { class: "stack" },
        h("details", { class: "card", open: true }, h("summary", { style: "cursor:pointer;font-weight:700" }, "Circuito de agilidad (hombres y mujeres)"),
          h("div", { style: "margin-top:10px" }, ul([
            "Mide la agilidad. Se sale de pie, detrás de la línea, y se completa el recorrido del gráfico superando las vallas.",
            "El tiempo se cuenta hasta que se toca el suelo con uno o los dos pies tras superar con todo el cuerpo la última valla.",
            "**Un intento.** Solo repite quien haya hecho nulo el primero (por modificar el recorrido, derribar o apoyarse en un elemento, o agarrarlo).",
            "Marca máxima antes de eliminación: **11,7 s o más en hombres y 12,8 s o más en mujeres** supone la eliminación.",
          ]))),
        h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700" }, "Dominadas (hombres)"),
          h("div", { style: "margin-top:10px" }, ul([
            "Suspendido de la barra con las palmas al frente (agarre prono), brazos extendidos y cuerpo estático. Agarre ligeramente más ancho que los hombros.",
            "La barbilla debe superar claramente la barra, que queda a la altura del tercio inferior del cuello. Cabeza en posición anatómica.",
            "No valen oscilaciones, balanceos ni impulso. Mínima pausa entre repeticiones y no más de **5 segundos** suspendido entre ellas.",
            "Sin guantes ni sustancias que faciliten el agarre, y no se puede soltar ninguna mano. **Un intento.**",
          ]))),
        h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700" }, "Suspensión en barra (mujeres)"),
          h("div", { style: "margin-top:10px" }, ul([
            "Suspendida con agarre supino (palmas hacia atrás), brazos flexionados, **barbilla por encima de la barra** y cuerpo extendido y estático.",
            "Se mantiene la posición el mayor tiempo posible. Acaba cuando la barbilla queda a la altura de la barra, por debajo o la toca.",
            "Sin flexión de cadera, sin balanceos, cabeza sin extender hacia atrás, sin soltar ni mover las manos. **Un intento.**",
          ]))),
        h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700" }, "1.000 metros (hombres y mujeres)"),
          h("div", { style: "margin-top:10px" }, ul([
            "Se corre en grupo sobre superficie lisa, plana y dura; el tiempo se mide en minutos y segundos.",
            "Calzado deportivo obligatorio y **sin zapatillas de clavos**. Abandonar la zona de carrera o una conducta antideportiva eliminan.",
            "**Un solo intento.**",
          ]))),
        h("div", { class: "notice" }, h("strong", {}, "Antes de la prueba: "), "hay que ir con atuendo deportivo y entregar un certificado médico, según los requisitos de los Colegios de Médicos, que acredite que se reúnen las condiciones físicas para las pruebas. Sin él, se queda fuera del proceso.")
      ));
    root.appendChild(reglas);
    root.appendChild(h("p", { class: "muted", style: "margin-top:18px;font-size:.85rem" }, "Baremos del ", ext(CONV, "Anexo II de la convocatoria de 2026"), ". La calificación de la prueba es la media aritmética de los tres ejercicios."));
    return root;
  };

  /* ---------- Registro de marcas (lógica en web/js/marcas.js, estado en AA.store) ---------- */
  var histAbierto = {}; // historiales desplegados: siguen abiertos al anotar o borrar una marca
  var MAX_GRAFICO = 20; // marcas más recientes en el gráfico de evolución; el historial las lista todas

  function numero(txt) {
    var t = String(txt == null ? "" : txt).trim().replace(",", ".");
    return t === "" ? NaN : Number(t);
  }

  /* Gráfico de evolución de un ejercicio: una serie, la mejor marca arriba (en los tiempos el eje va invertido) y una
     línea discontinua en la marca del siguiente punto. Puntos HTML encima de un SVG que se estira: los círculos y el
     texto no se deforman en ningún ancho. */
  function grafico(ej, b, lista, sig) {
    var datos = lista.slice(-MAX_GRAFICO);
    var vals = datos.map(function (m) { return m.v; });
    if (sig && !sig.max) vals.push(sig.objetivo);
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { min -= 1; max += 1; }
    var mejorArriba = FA.menorEsMejor(ej);
    function y(v) { return (mejorArriba ? (v - min) / (max - min) : (max - v) / (max - min)) * 100; }
    function x(i) { return datos.length === 1 ? 50 : (i / (datos.length - 1)) * 100; }
    var pts = datos.map(function (m, i) { return x(i).toFixed(2) + "," + y(m.v).toFixed(2); }).join(" ");
    var area = h("div", { class: "evo-area" },
      // innerHTML crea el SVG en su espacio de nombres (AA.h haría un elemento HTML); los puntos son números
      h("div", { class: "evo-svg", "aria-hidden": "true", html: '<svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">' +
        '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>' }));
    if (sig && !sig.max) {
      area.appendChild(h("div", { class: "evo-obj", style: "top:" + y(sig.objetivo).toFixed(2) + "%" },
        h("span", {}, AA.plural(sig.puntosObjetivo, "punto", "puntos") + ": " + FA.formato(ej, b, sig.objetivo))));
    }
    datos.forEach(function (m, i) {
      area.appendChild(h("span", { class: "evo-pt" + (i === datos.length - 1 ? " ult" : ""), style: "left:" + x(i).toFixed(2) + "%;top:" + y(m.v).toFixed(2) + "%",
        title: AA.fecha(m.dia) + ": " + FA.formato(ej, b, m.v) + " (" + AA.plural(m.puntos, "punto", "puntos") + ")" }));
    });
    var desc = "Evolución de " + FA.nombre(ej, b) + ": " + datos.map(function (m) { return AA.fecha(m.dia) + " " + FA.formato(ej, b, m.v); }).join("; ") + ".";
    return h("figure", { class: "evo" },
      h("div", { class: "evo-marco", role: "img", "aria-label": desc }, area),
      h("figcaption", { class: "evo-ejes" },
        h("span", {}, AA.fecha(datos[0].dia)),
        h("span", {}, mejorArriba ? "Arriba, menos tiempo" : "Arriba, mejor marca"),
        h("span", {}, AA.fecha(datos[datos.length - 1].dia))));
  }

  function tarjetaEjercicio(ej, b, marcas, repintar) {
    var ev = FA.evolucion(marcas, ej, b);
    var card = h("section", { class: "card ejer" }, h("h3", {}, FA.nombre(ej, b)));
    if (!ev.ultima) {
      card.appendChild(h("p", { class: "muted" }, "Sin marcas todavía."));
      return card;
    }
    var u = ev.ultima;
    var sig = FA.siguiente(ej, b, u.v);
    card.appendChild(h("div", { class: "cajas ejer-cifras" },
      h("div", {}, h("b", { style: u.puntos ? null : "color:var(--ko)" }, FA.formato(ej, b, u.v)), h("span", {}, "última (" + AA.fecha(u.dia) + "): " + AA.plural(u.puntos, "punto", "puntos"))),
      h("div", {}, h("b", {}, FA.formato(ej, b, ev.mejor.v)), h("span", {}, "mejor marca: " + AA.plural(ev.mejor.puntos, "punto", "puntos")))));
    card.appendChild(h("p", { class: "objetivo section-sm " + (sig.max ? "objetivo--ok" : u.puntos ? "" : "objetivo--no") }, FA.textoSiguiente(ej, b, sig)));
    if (ev.cambio != null) {
      var txt = ev.cambio > 0 ? "Has mejorado " + FA.formatoDif(ej, b, ev.cambio) : ev.cambio < 0 ? "Has empeorado " + FA.formatoDif(ej, b, ev.cambio) : "Sin cambios";
      card.appendChild(h("p", { class: "muted section-sm", style: "font-size:.88rem" }, txt + " desde tu primera marca (" + AA.fecha(ev.primera.dia) + ", " + FA.formato(ej, b, ev.primera.v) + ")."));
    }
    if (ev.lista.length > 1) card.appendChild(grafico(ej, b, ev.lista, sig));
    var filas = ev.lista.slice().reverse().map(function (m) {
      return h("li", {},
        h("span", { class: "num" }, AA.fecha(m.dia)),
        h("strong", { class: "num" }, FA.formato(ej, b, m.v)),
        h("span", { class: "muted" }, AA.plural(m.puntos, "punto", "puntos")),
        h("button", { type: "button", class: "btn btn--sm btn--ghost", "aria-label": "Borrar la marca del " + AA.fecha(m.dia) + " (" + FA.formato(ej, b, m.v) + ")",
          onclick: function () { store.borrarMarca(m.ts); AA.toast("Marca borrada"); repintar(); } }, "Borrar"));
    });
    var det = h("details", { class: "marcas-hist", open: histAbierto[ej] ? true : null }, h("summary", {}, "Historial (" + ev.lista.length + ")"), h("ul", { class: "marcas-lista" }, filas));
    det.addEventListener("toggle", function () { histAbierto[ej] = det.open; });
    card.appendChild(det);
    return card;
  }

  function seccionRegistro(b) {
    var sec = h("section", { class: "section", id: "registro" });
    var hoy = AA.isoDia(Date.now());
    if (!reg.dia || reg.dia > hoy) reg.dia = hoy;

    function repintar() {
      var nuevo = seccionRegistro(b);
      sec.parentNode.replaceChild(nuevo, sec);
    }

    var error = h("p", { class: "marca-error", role: "alert" });
    var campoMarca = h("div", { class: "marca-campo" });
    function pintarCampo() {
      campoMarca.textContent = "";
      if (reg.ej === "resistencia") {
        campoMarca.appendChild(h("span", { class: "marca-lab", id: "m-lab" }, "Tiempo"));
        campoMarca.appendChild(h("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" },
          h("input", { class: "field", id: "m-min", type: "number", step: "1", min: "0", inputmode: "numeric", placeholder: "min", "aria-label": "Minutos", value: reg.min, oninput: function (e) { reg.min = e.target.value; } }),
          h("input", { class: "field", id: "m-seg", type: "number", step: "1", min: "0", max: "59", inputmode: "numeric", placeholder: "seg", "aria-label": "Segundos", value: reg.seg, oninput: function (e) { reg.seg = e.target.value; } })));
        campoMarca.appendChild(h("small", {}, "minutos y segundos"));
      } else {
        var agil = reg.ej === "agilidad";
        var unidad = agil ? "segundos, con una décima" : b === "H" ? "dominadas válidas" : "segundos";
        campoMarca.appendChild(h("label", { for: "m-v", class: "marca-lab" }, agil ? "Tiempo" : b === "H" ? "Repeticiones" : "Tiempo"));
        campoMarca.appendChild(h("input", { class: "field", id: "m-v", type: "text", inputmode: agil ? "decimal" : "numeric", autocomplete: "off", placeholder: agil ? "p. ej. 9,8" : b === "H" ? "p. ej. 10" : "p. ej. 60", value: reg.v, oninput: function (e) { reg.v = e.target.value; } }));
        campoMarca.appendChild(h("small", {}, unidad));
      }
    }
    pintarCampo();
    var selEj = h("select", { class: "field", id: "m-ej", onchange: function (e) { reg.ej = e.target.value; reg.v = ""; error.textContent = ""; pintarCampo(); } },
      FA.EJERCICIOS.map(function (ej) { return h("option", { value: ej, selected: reg.ej === ej }, FA.nombre(ej, b)); }));
    var inDia = h("input", { class: "field", id: "m-dia", type: "date", max: hoy, value: reg.dia, onchange: function (e) { reg.dia = e.target.value; } });

    function anotar() {
      var v;
      if (reg.ej === "resistencia") {
        var mi = numero(reg.min), se = numero(reg.seg);
        v = isNaN(mi) && isNaN(se) ? NaN : (isNaN(mi) ? 0 : mi) * 60 + (isNaN(se) ? 0 : se);
        if (se >= 60) { error.textContent = "Los segundos van de 0 a 59."; return; }
      } else v = numero(reg.v);
      try {
        store.guardarMarca({ dia: reg.dia, ej: reg.ej, b: b, v: v });
      } catch (e) {
        error.textContent = e.message;
        return;
      }
      var p = FA.puntos(reg.ej, b, v);
      reg.v = ""; reg.min = ""; reg.seg = "";
      AA.toast("Marca anotada: " + FA.formato(reg.ej, b, v) + " = " + AA.plural(p, "punto", "puntos"));
      repintar();
    }

    sec.appendChild(h("h2", { class: "sec-title" }, "Tu registro de marcas"));
    sec.appendChild(h("p", { class: "lead", style: "margin-top:0" }, "Anota las marcas de tus entrenamientos con el baremo " + (b === "H" ? "de hombres" : "de mujeres") + ": verás su evolución y lo que te falta para el siguiente punto de cada ejercicio."));
    sec.appendChild(h("div", { class: "notice section-sm" }, h("strong", {}, "Solo el baremo, no un plan de entrenamiento. "),
      "Las cifras salen del Anexo II de la convocatoria. Antes de empezar o cambiar tu preparación física, consulta a un profesional sanitario o de la actividad física; para la prueba necesitarás además un certificado médico."));
    sec.appendChild(h("form", { class: "card setup section-sm", onsubmit: function (e) { e.preventDefault(); anotar(); } },
      h("div", { class: "calc" },
        h("label", { for: "m-dia" }, "Fecha", inDia),
        h("label", { for: "m-ej" }, "Ejercicio", selEj),
        campoMarca),
      error,
      h("div", { class: "row", style: "margin-top:12px" }, h("button", { type: "submit", class: "btn btn--primary" }, "Anotar marca"))));

    var marcas = store.marcas();
    var r = FA.resumen(marcas, b);
    if (r.completa) {
      sec.appendChild(h("div", { class: "objetivo section-sm " + (r.apto ? "objetivo--ok" : "objetivo--no") },
        h("strong", {}, "Con tus últimas marcas: " + AA.fmt1(r.media) + " puntos de media. "),
        r.cero ? "Un ejercicio en 0 te eliminaría." : r.apto ? "Superarías la prueba." : "Te falta llegar a una media de 5."));
    }
    var grid = h("div", { class: "stack section-sm" });
    FA.EJERCICIOS.forEach(function (ej) { grid.appendChild(tarjetaEjercicio(ej, b, marcas, repintar)); });
    sec.appendChild(grid);
    var otro = marcas.filter(function (m) { return m.b !== b; }).length;
    if (otro) sec.appendChild(h("p", { class: "muted section-sm", style: "font-size:.88rem" }, AA.plural(otro, "marca anotada", "marcas anotadas") + " con el baremo " + (b === "H" ? "de mujeres" : "de hombres") + ": cambia de baremo arriba para verlas."));
    return sec;
  }

  /* ================= Entrevista personal ================= */
  V.entrevista = function () {
    var P = AA.meta.proceso;
    var E = P && P.entrevista;
    var root = h("div", { style: "max-width:860px" });
    root.appendChild(h("div", { class: "eyebrow" }, "Tercera prueba · parte b · base " + (E ? E.base : "6.1.3.b")));
    root.appendChild(h("h1", { class: "page-title" }, "Entrevista personal"));
    if (!E) {
      root.appendChild(h("div", { class: "notice section" }, "No hay datos de la entrevista en esta versión. Consulta la ", ext(CONV, "convocatoria"), "."));
      return root;
    }
    root.appendChild(h("p", { class: "lead" }, "Qué dice la convocatoria (", ext(CONV, "BOE-A-2026-15055"), ") sobre la entrevista, cómo se califica, qué documentos hay que llevar y una lista para ordenar tu trayectoria."));
    function sec(titulo, cuerpo, id) {
      root.appendChild(h("section", { class: "section", id: id || null }, h("h2", { class: "sec-title" }, titulo), cuerpo));
    }
    sec("Qué es", h("div", { class: "card" }, ul([E.finalidad, E.quien])));
    sec("Los seis criterios", h("div", { class: "card stack" },
      h("ol", { class: "criterios" }, E.criterios.map(function (c) { return h("li", {}, c); })),
      h("p", { class: "muted" }, E.criteriosNota)));
    sec("Cómo se califica", h("div", { class: "card stack" }, ul(E.calificacion), h("p", { class: "muted", style: "font-size:.9rem" }, E.motivacion)));
    sec("Antes de la entrevista", h("div", { class: "card" }, ul(E.antes)));
    sec("El día de la entrevista", h("div", { class: "card" }, ul(E.desarrollo)));
    sec("Documentación", h("div", { class: "card stack" },
      h("p", {}, "El día en que te citen a la entrevista entregas al tribunal (base 7.1):"),
      ul(E.documentos),
      h("p", {}, E.documentosSinAutorizacionTexto),
      ul(E.documentosSinAutorizacion),
      h("p", { class: "muted", style: "font-size:.9rem" }, E.formalidades),
      h("div", {}, AA.ui.enlace("proceso", "btn btn--sm", "Ver los certificados de idioma admitidos"))), "documentos");
    if (E.trayectoria) root.appendChild(seccionTrayectoria(E.trayectoria));
    sec("Fuentes", h("div", { class: "card" }, ul([
      "Bases 6.1.3.b (entrevista), 6.6 a 6.10 (llamamiento, sedes, calendario e identificación) y 7 (acreditación documental) de la Resolución de 7 de julio de 2026 (BOE-A-2026-15055).",
      "Artículo 17 de la Orden INT/632/2024, de 20 de junio (motivación del «no apto»).",
    ])));
    root.appendChild(h("div", { class: "notice section" }, h("strong", {}, "Material de estudio no oficial. "), "Comprueba siempre la convocatoria que te afecte: la próxima puede cambiar la entrevista."));
    return root;
  };

  function seccionTrayectoria(T) {
    var sec = h("section", { class: "section", id: "trayectoria" });
    var estado = store.entrevista();
    var cuenta = h("span", { class: "pill" });
    function contar() {
      var n = T.items.filter(function (it) { return estado[it.id] && estado[it.id].h; }).length;
      cuenta.textContent = n + " de " + T.items.length + " preparados";
    }
    contar();
    var lista = h("ul", { class: "tray-lista" }, T.items.map(function (it) {
      var guardado = estado[it.id] || {};
      var chk = h("input", { type: "checkbox", id: "tray-" + it.id, class: "tray-chk" });
      chk.checked = !!guardado.h;
      chk.addEventListener("change", function () {
        store.prepararEntrevista(it.id, "hecho", chk.checked);
        estado = store.entrevista();
        contar();
      });
      var ta = h("textarea", { class: "field", id: "tray-n-" + it.id, rows: 3, maxlength: "2000" });
      ta.value = guardado.n || "";
      ta.addEventListener("change", function () {
        store.prepararEntrevista(it.id, "nota", ta.value);
        estado = store.entrevista();
        AA.toast("Nota guardada");
      });
      return h("li", { class: "tray-item" },
        chk,
        h("div", { class: "tray-txt" },
          h("label", { for: "tray-" + it.id }, h("strong", {}, it.titulo)),
          h("p", {}, it.pista),
          h("details", { class: "tray-notas", open: guardado.n ? true : null },
            h("summary", {}, guardado.n ? "Tus notas" : "Añadir notas"),
            h("label", { for: "tray-n-" + it.id, class: "sr" }, "Notas: " + it.titulo), ta)));
    }));
    sec.appendChild(h("div", { class: "row-between" }, h("h2", { class: "sec-title", style: "margin:0" }, "Prepara tu trayectoria"), cuenta));
    sec.appendChild(h("p", { class: "muted section-sm" }, T.nota));
    sec.appendChild(h("div", { class: "card section-sm" }, lista,
      h("p", { class: "muted", style: "font-size:.85rem;margin-top:12px" }, "Las marcas y las notas se guardan solo en este navegador y van en la copia de seguridad de Progreso.")));
    return sec;
  }

  /* ================= Progreso ================= */
  /* ---------- Rachas y logros (web/js/motivacion.js) ---------- */
  var DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
  function tituloDia(x) {
    var d = x.d || {};
    var partes = [];
    if (d.p) partes.push(AA.plural(d.p, "pregunta", "preguntas"));
    if (d.t) partes.push(AA.plural(d.t, "tarjeta", "tarjetas"));
    if (d.des && d.des.hecho) partes.push("desafío hecho");
    if (d.g) partes.push(AA.plural(d.g, "día de guía", "días de guía"));
    if (d.l) partes.push(AA.plural(d.l, "tema leído", "temas leídos"));
    if (d.s) partes.push("psicotécnicos");
    if (d.r && !partes.length) partes.push("estudio anterior al registro diario");
    return AA.fecha(x.iso) + ": " + (partes.length ? partes.join(", ") : "sin actividad");
  }

  /* Racha, mapa de constancia de 12 semanas, días de descanso e interruptor para ocultar rachas y logros. Cambiar los
     días de descanso redibuja solo esta tarjeta; mostrar u ocultar, la página entera. */
  function tarjetaConstancia(foco) {
    var visible = AA.motiv.visible();
    var interruptor = h("button", {
      type: "button", class: "interruptor", id: "motiv-interruptor", role: "switch", "aria-checked": visible ? "true" : "false", "aria-labelledby": "motiv-tit",
      onclick: function () {
        AA.motiv.mostrar(!visible);
        AA.go("progreso");
        var nuevo = document.getElementById("motiv-interruptor");
        if (nuevo) nuevo.focus();
        AA.toast(visible ? "Rachas y logros ocultos" : "Rachas y logros a la vista");
      },
    }, h("span", { class: "interruptor-pista", "aria-hidden": "true" }), h("span", { "aria-hidden": "true" }, visible ? "A la vista" : "Ocultos"));
    var sec = h("section", { class: "section card constancia" },
      h("div", { class: "repaso-cab" },
        h("div", { class: "repaso-txt" },
          h("h2", { class: "sec-title", id: "motiv-tit" }, "Rachas y logros"),
          h("p", {}, visible ? "Un día cuenta como día de estudio con el desafío diario o con 10 preguntas, 10 tarjetas, un día de guía, un tema leído o una sesión de psicotécnicos." :
            "Ocultos: el Panel y los resultados no muestran rachas ni logros. Se siguen registrando por si los vuelves a mostrar.")),
        interruptor));
    if (!visible) return sec;

    var r = AA.motiv.racha();
    var mapa = AA.motiv.constancia(12);
    var hoy = AA.isoDia(Date.now());
    sec.appendChild(h("div", { class: "cajas constancia-cifras" },
      h("div", {}, h("b", {}, r.actual), h("span", {}, r.hoy ? "días de racha (hoy cuenta)" : "días de racha")),
      h("div", {}, h("b", {}, r.mejor), h("span", {}, "mejor racha")),
      h("div", {}, h("b", {}, mapa.activos), h("span", {}, "días de estudio en 12 semanas"))));

    var semanas = h("div", { class: "calor-semanas" });
    mapa.semanas.forEach(function (sem) {
      semanas.appendChild(h("div", { class: "calor-sem" }, sem.map(function (x) {
        return h("i", { class: "n" + x.nivel + (x.iso === hoy ? " hoy" : "") + (x.futuro ? " futuro" : ""), title: x.futuro ? null : tituloDia(x) });
      })));
    });
    var primero = mapa.semanas[0][0].iso;
    sec.appendChild(h("div", { class: "calor", role: "img", "aria-label": "Mapa de constancia del " + AA.fecha(primero) + " a hoy: " + AA.plural(mapa.activos, "día de estudio", "días de estudio") + "." },
      h("div", { class: "calor-dias", "aria-hidden": "true" }, DIAS_SEMANA.map(function (d) { return h("span", {}, d); })),
      semanas));
    sec.appendChild(h("div", { class: "calor-ley", "aria-hidden": "true" },
      h("span", {}, "Desde el " + AA.fecha(primero)),
      h("span", { class: "calor-escala" }, "Menos", [0, 1, 2, 3].map(function (n) { return h("i", { class: "n" + n }); }), "Más")));

    var seg = h("div", { class: "seg", role: "group", "aria-label": "Días de descanso por semana" });
    AA.motiv.DESCANSOS.forEach(function (n) {
      var b = h("button", {
        type: "button", "aria-pressed": n === r.descansos ? "true" : "false",
        onclick: function () {
          store.ajuste("descansos", n);
          var nuevo = tarjetaConstancia(n);
          sec.parentNode.replaceChild(nuevo, sec);
          AA.toast(n ? AA.plural(n, "día de descanso", "días de descanso") + " por semana sin romper la racha" : "Sin días de descanso: la racha exige estudiar a diario");
        },
      }, String(n));
      seg.appendChild(b);
      if (foco === n) setTimeout(function () { b.focus(); }, 0); // el botón pulsado se ha redibujado
    });
    sec.appendChild(h("div", { class: "constancia-desc" },
      h("span", {}, "Días por semana sin estudio que no rompen la racha (tampoco suman):"), seg));
    return sec;
  }

  function tarjetaLogros() {
    var lista = AA.motiv.logros();
    var hechos = lista.filter(function (l) { return l.ts; }).length;
    return h("section", { class: "section card" },
      h("h2", { class: "sec-title" }, "Logros · " + hechos + " de " + lista.length),
      h("ul", { class: "logros" }, lista.map(function (l) {
        return h("li", { class: "logro" + (l.ts ? " logro--on" : "") },
          h("span", { class: "logro-ic", "aria-hidden": "true" }, l.ts ? "★" : "☆"),
          h("span", { class: "logro-txt" },
            h("strong", {}, l.nombre),
            h("small", {}, l.txt),
            l.ts ? h("small", { class: "logro-fecha" }, "Conseguido el " + AA.fecha(AA.isoDia(l.ts))) : h("span", { class: "sr" }, "Pendiente.")));
      })));
  }

  V.progreso = function () {
    var root = h("div");
    var g = store.statsGlobal();
    root.appendChild(h("div", { class: "eyebrow" }, "Se guarda en este navegador"));
    root.appendChild(h("h1", { class: "page-title" }, "Tu progreso"));

    root.appendChild(h("section", { class: "section" }, h("div", { class: "kv" },
      h("div", {}, h("b", {}, store.totalLeidos()), h("span", {}, "temas leídos")),
      h("div", {}, h("b", {}, g.intentos ? g.pct + " %" : "–"), h("span", {}, "aciertos en tests")),
      h("div", {}, h("b", {}, g.vistas + "/" + g.total), h("span", {}, "preguntas vistas")),
      h("div", {}, h("b", {}, store.tarjetasDominadas() + "/" + AA.tarjetas.length), h("span", {}, "tarjetas dominadas"))
    )));
    if (!store.guardadoActivo()) {
      root.appendChild(h("div", { class: "notice section" }, h("strong", {}, "No se puede guardar en este navegador. "), "Tu progreso se perderá al cerrar la página. Usa la copia de seguridad de abajo."));
    }
    AA.motiv.revisar();
    root.appendChild(tarjetaConstancia());
    if (AA.motiv.visible()) root.appendChild(tarjetaLogros());

    // Simulacros
    var sims = store.simulacros().slice().reverse().slice(0, 12);
    var cuerpoSims;
    if (!sims.length) cuerpoSims = h("p", { class: "muted" }, "Cuando termines tests de 20 preguntas o más, verás aquí tu evolución.");
    else {
      var max = 10;
      var barras = h("div", { class: "stack", style: "gap:8px" });
      sims.forEach(function (s) {
        var f = new Date(s.ts);
        barras.appendChild(h("div", { style: "display:grid;grid-template-columns:92px minmax(0,1fr) 46px;gap:10px;align-items:center;font-size:.88rem" },
          h("span", { class: "muted num" }, AA.pad(f.getDate()) + "/" + AA.pad(f.getMonth() + 1) + " " + AA.pad(f.getHours()) + ":" + AA.pad(f.getMinutes())),
          h("div", { class: "bar", title: s.titulo + ": " + s.a + " aciertos, " + s.e + " errores" }, h("i", { style: "width:" + (100 * s.nota) / max + "%" })),
          h("strong", { class: "num", style: "text-align:right" }, AA.fmt1(s.nota))));
      });
      cuerpoSims = h("div", {}, barras, h("p", { class: "muted", style: "font-size:.82rem;margin-top:10px" }, "Nota sobre 10 de los últimos tests (más reciente arriba)."));
    }
    root.appendChild(h("section", { class: "section card" }, h("h2", { class: "sec-title" }, "Tests recientes"), cuerpoSims));
    // ¿Compensa contestar las dudas? Acumulado de los tests en modo examen (web/js/motivacion.js)
    var dg = AA.motiv.dudasGlobal();
    if (dg.n) {
      root.appendChild(h("section", { class: "section card" }, h("h2", { class: "sec-title" }, "Tus dudas en modo examen"),
        h("p", {}, "Has contestado " + AA.plural(dg.n, "pregunta marcada como duda", "preguntas marcadas como duda") + " y has acertado el " + dg.pct + " %."),
        h("p", { class: "objetivo section-sm " + (dg.compensa ? "objetivo--ok" : "objetivo--no") }, dg.compensa ?
          "Por encima del 33,3 %: con la fórmula oficial (cada error resta medio acierto), contestar tus dudas te compensa." :
          "Por debajo del 33,3 %: con la fórmula oficial, contestar tus dudas te resta. Déjalas en blanco salvo que puedas descartar una de las tres opciones."),
        dg.n < 30 ? h("p", { class: "muted section-sm" }, "Con menos de 30 dudas contestadas el porcentaje todavía es poco fiable: marca las dudas en tus próximos tests.") : null));
    }
    // Banco propio frente a exámenes oficiales importados (web/js/oficiales.js)
    if (AA.tarjetaCalibracion) root.appendChild(h("section", { class: "section" }, AA.tarjetaCalibracion(),
      h("div", { class: "row", style: "margin-top:10px" }, AA.ui.enlace("oficiales", "btn btn--sm", "Ir a exámenes oficiales"))));

    // Por tema
    var filas = h("tbody");
    AA.listaTemas.forEach(function (t) {
      var st = store.statsTema(t.tema);
      var nv = AA.motiv.nivelTema(t.tema);
      filas.appendChild(h("tr", {},
        h("td", { class: "mono" }, t.tema),
        h("td", {}, h("a", { href: "#tema-" + t.tema, style: "color:inherit" }, t.titulo)),
        h("td", {}, nv ? AA.ui.insigniaNivel(nv) : "–"),
        h("td", { class: "r" }, store.leido(t.tema) ? "✓" : ""),
        h("td", { class: "r" }, st.total ? st.vistas + "/" + st.total : "–"),
        h("td", { class: "r" }, st.intentos ? st.pct + " %" : "–")));
    });
    root.appendChild(h("section", { class: "section card" }, h("h2", { class: "sec-title" }, "Por tema"),
      h("div", { class: "tbl", style: "border:0;margin:0" }, h("table", { class: "mini", style: "min-width:560px" },
        h("thead", {}, h("tr", {}, h("th", {}, "Tema"), h("th", {}, "Título"), h("th", {}, "Nivel"), h("th", { class: "r" }, "Leído"), h("th", { class: "r" }, "Vistas"), h("th", { class: "r" }, "Acierto"))),
        filas))));

    // Copia de seguridad
    var ta = h("textarea", { class: "field", id: "copia", "aria-label": "Copia de seguridad", rows: 4, spellcheck: "false" });
    ta.value = store.exportar();
    var estado = h("p", { class: "muted", style: "font-size:.88rem;margin-top:8px", role: "status" });
    var zonaReset = h("div", { class: "row", style: "margin-top:10px" });
    function pintarReset(confirmando) {
      zonaReset.textContent = "";
      if (!confirmando) zonaReset.appendChild(h("button", { class: "btn btn--sm btn--danger", onclick: function () { pintarReset(true); } }, "Borrar todo el progreso"));
      else {
        zonaReset.appendChild(h("span", {}, "¿Seguro? Se borra todo lo guardado en este navegador."));
        zonaReset.appendChild(h("button", { class: "btn btn--sm btn--danger", onclick: function () { store.reiniciar(); AA.go("panel"); AA.toast("Progreso borrado"); } }, "Sí, borrar"));
        zonaReset.appendChild(h("button", { class: "btn btn--sm", onclick: function () { pintarReset(false); } }, "Cancelar"));
      }
    }
    pintarReset(false);
    root.appendChild(h("section", { class: "section card" },
      h("h2", { class: "sec-title" }, "Copia de seguridad"),
      h("p", { class: "muted", style: "margin-bottom:10px;font-size:.92rem" }, "Tu progreso vive solo en este navegador. Copia este texto para llevarlo a otro dispositivo o guardarlo, y pégalo aquí para restaurarlo."),
      ta,
      h("div", { class: "row", style: "margin-top:10px" },
        h("button", { class: "btn btn--sm", onclick: function () { ta.value = store.exportar(); ta.select(); AA.copy(ta.value, "Copia copiada al portapapeles"); } }, "Copiar"),
        h("button", { class: "btn btn--sm", onclick: function () {
          try { store.importar(ta.value); estado.textContent = "Progreso restaurado."; AA.toast("Progreso restaurado"); }
          catch (e) { estado.textContent = "No se pudo restaurar: el texto no es una copia válida."; }
        } }, "Restaurar desde el texto")),
      estado, zonaReset));
    return root;
  };
})();
