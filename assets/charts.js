/* The site's chart script: line charts drawn as inline SVG, with a crosshair and a readout that shows every series'
   figure at the pointer and the fit's parameters. No library and no request to any other host: the pages work from
   disk. At phone width the readout is a sheet at the bottom of the screen; the arrow keys step one point when the
   chart has the focus. This file is published as it stands - nothing in it may name its origin. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var W = 640, H = 270, ML = 46, MR = 14, MT = 14, MB = 36;
  var PHONE = window.matchMedia ? window.matchMedia("(max-width:640px)") : { matches: false };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) { e.setAttribute(k, attrs[k]); } }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function ticks(lo, hi, n) {
    var out = [];
    for (var i = 0; i <= n; i++) { out.push(lo + (hi - lo) * i / n); }
    return out;
  }

  function line(box, spec) {
    var state = { spec: spec, idx: null };
    box.classList.add("chartbox");
    box.innerHTML = "";
    box.setAttribute("tabindex", "0");
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": spec.label || "chart" }, box);
    var ro = document.createElement("div");
    ro.className = "readout";
    box.appendChild(ro);
    var legend = document.createElement("div");
    legend.className = "legend";
    box.appendChild(legend);
    var geom = {};

    function draw() {
      var s = state.spec;
      while (svg.firstChild) { svg.removeChild(svg.firstChild); }
      var xs = [], ys = [];
      s.series.forEach(function (sr) { sr.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
      if (!xs.length) { return; }
      var x0 = s.xMin !== undefined ? s.xMin : Math.min.apply(null, xs);
      var x1 = s.xMax !== undefined ? s.xMax : Math.max.apply(null, xs);
      var y0 = s.yMin !== undefined ? s.yMin : Math.min.apply(null, ys);
      var y1 = s.yMax !== undefined ? s.yMax : Math.max.apply(null, ys);
      if (y1 - y0 < 1e-9) { y0 -= 0.5; y1 += 0.5; }
      var pad = (y1 - y0) * 0.08;
      if (s.yMin === undefined) { y0 -= pad; }
      if (s.yMax === undefined) { y1 += pad; }
      if (x1 === x0) { x1 = x0 + 1; }
      geom = {
        x0: x0, x1: x1, y0: y0, y1: y1,
        sx: function (v) { return ML + (v - x0) / (x1 - x0) * (W - ML - MR); },
        sy: function (v) { return MT + (1 - (v - y0) / (y1 - y0)) * (H - MT - MB); }
      };
      var xf = s.xFmt || function (v) { return String(Math.round(v * 1e2) / 1e2); };
      var yf = s.yFmt || function (v) { return v.toFixed(2); };
      ticks(y0, y1, 4).forEach(function (v) {
        var y = Math.round(geom.sy(v));
        el("line", { x1: ML, x2: W - MR, y1: y, y2: y, stroke: "currentColor", "stroke-opacity": "0.12" }, svg);
        el("text", { x: ML - 6, y: y + 4, "text-anchor": "end" }, svg).textContent = yf(v);
      });
      (s.xTickVals || ticks(x0, x1, 4)).forEach(function (v) {
        el("text", { x: Math.round(geom.sx(v)), y: H - MB + 16, "text-anchor": "middle" }, svg).textContent =
          s.xTick ? s.xTick(v) : xf(v);
      });
      if (s.xLabel) {
        el("text", { x: Math.round((ML + W - MR) / 2), y: H - 4, "text-anchor": "middle" }, svg).textContent = s.xLabel;
      }
      if (s.yLabel) { el("text", { x: 4, y: MT - 2, "text-anchor": "start" }, svg).textContent = s.yLabel; }
      if (s.zero && y0 < 0 && y1 > 0) {
        var yz = Math.round(geom.sy(0));
        el("line", { x1: ML, x2: W - MR, y1: yz, y2: yz, stroke: "currentColor", "stroke-opacity": "0.45" }, svg);
      }
      s.series.forEach(function (sr) {
        var d = sr.pts.map(function (p, i) {
          return (i ? "L" : "M") + Math.round(geom.sx(p[0])) + "," + Math.round(geom.sy(p[1]));
        }).join(" ");
        el("path", { d: d, fill: "none", stroke: sr.color, "stroke-width": sr.width !== undefined ? sr.width : 1.6,
                     "stroke-dasharray": sr.dash || "none", "class": sr.cls || "" }, svg);
        if (sr.dots) {
          sr.pts.forEach(function (p) {
            el("circle", { cx: Math.round(geom.sx(p[0])), cy: Math.round(geom.sy(p[1])), r: 3, fill: sr.color,
                           "class": sr.cls || "" }, svg);
          });
        }
      });
      geom.cross = el("line", { x1: 0, x2: 0, y1: MT, y2: H - MB, stroke: "currentColor", "stroke-opacity": "0.5",
                                visibility: "hidden" }, svg);
      geom.xs = Array.from(new Set(xs)).sort(function (a, b) { return a - b; });
      legend.innerHTML = s.series.map(function (sr) {
        return '<span><i class="' + esc(sr.cls || "") + '" style="background:' + sr.color + '"></i>' + esc(sr.name) +
          "</span>";
      }).join("");
      geom.xf = xf;
      geom.yf = yf;
    }

    function nearest(sr, x) {
      var best = null, bd = Infinity;
      sr.pts.forEach(function (p) { var d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = p; } });
      var span = (geom.x1 - geom.x0) / 40;
      return best && bd <= Math.max(span, 1e-9) ? best : null;
    }

    function show(i, cx, cy) {
      if (i === null || !geom.xs) { return; }
      state.idx = i;
      var x = geom.xs[i], s = state.spec;
      var px = Math.round(geom.sx(x));
      geom.cross.setAttribute("x1", px);
      geom.cross.setAttribute("x2", px);
      geom.cross.setAttribute("visibility", "visible");
      var rows = s.series.map(function (sr) {
        var p = nearest(sr, x);
        return p ? '<div><span style="color:' + sr.color + '">&#9632;</span> ' + esc(sr.name) + ": <b>" +
          esc(geom.yf(p[1])) + "</b></div>" : "";
      }).join("");
      var note = typeof s.note === "function" ? s.note(x) : s.note;
      ro.innerHTML = "<b>" + esc(geom.xf(x)) + "</b>" + rows + (note ? '<div class="p">' + esc(note) + "</div>" : "");
      ro.style.display = "block";
      ro.classList.toggle("sheet", !!PHONE.matches);
      if (!PHONE.matches) {
        var r = box.getBoundingClientRect();
        var left = (cx !== undefined ? cx - r.left : px / W * r.width) + 14;
        if (left + ro.offsetWidth > r.width) { left = Math.max(0, left - ro.offsetWidth - 28); }
        ro.style.left = left + "px";
        ro.style.top = Math.max(0, (cy !== undefined ? cy - r.top : 20) - 10) + "px";
      }
    }
    function hide() {
      ro.style.display = "none";
      if (geom.cross) { geom.cross.setAttribute("visibility", "hidden"); }
    }
    function at(clientX) {
      var r = svg.getBoundingClientRect();
      var vx = (clientX - r.left) / r.width * W;
      var x = geom.x0 + (vx - ML) / (W - ML - MR) * (geom.x1 - geom.x0);
      var bi = 0, bd = Infinity;
      geom.xs.forEach(function (v, i) { var d = Math.abs(v - x); if (d < bd) { bd = d; bi = i; } });
      return bi;
    }
    box.addEventListener("pointermove", function (e) { if (geom.xs) { show(at(e.clientX), e.clientX, e.clientY); } });
    box.addEventListener("pointerdown", function (e) { if (geom.xs) { show(at(e.clientX), e.clientX, e.clientY); } });
    box.addEventListener("pointerleave", function () { if (!PHONE.matches) { hide(); } });
    box.addEventListener("keydown", function (e) {
      if (!geom.xs) { return; }
      var i = state.idx === null ? 0 : state.idx;
      if (e.key === "ArrowRight") { show(Math.min(geom.xs.length - 1, i + 1)); e.preventDefault(); }
      if (e.key === "ArrowLeft") { show(Math.max(0, i - 1)); e.preventDefault(); }
      if (e.key === "Escape") { hide(); }
    });
    draw();
    return { update: function (spec2) { state.spec = spec2; state.idx = null; hide(); draw(); } };
  }

  window.MZ = { line: line };
}());
