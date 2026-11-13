/* =========================================================
   Как машина учится видеть — deck logic
   ========================================================= */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const DIGITS = window.DIGITS || {};

  const svgNS = "http://www.w3.org/2000/svg";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */
  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(svgNS, tag);
    Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
    return el;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
  }

  function makeCells(container, count, tag = "span") {
    const cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const cell = document.createElement(tag);
      frag.appendChild(cell);
      cells.push(cell);
    }
    container.replaceChildren(frag);
    return cells;
  }

  function rgba(r, g, b, a) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /* ---------------------------------------------------------
     Background network
     --------------------------------------------------------- */
  function initBackground() {
    const canvas = $("#net-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    let raf = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(34, Math.min(82, Math.floor((width * height) / 24000)));
      points = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.5 + 0.7,
      }));
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const maxDist = Math.min(170, width * 0.13);

      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.13;
            ctx.strokeStyle = `rgba(107, 164, 255, ${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(125, 190, 255, 0.5)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(77, 226, 255, 0.035)";
        ctx.fill();
      }
    }

    function tick() {
      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10 || p.x > width + 10) p.vx *= -1;
        if (p.y < -10 || p.y > height + 10) p.vy *= -1;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", () => {
      clearTimeout(resize._t);
      resize._t = setTimeout(resize, 180);
    });

    if (!reducedMotion) {
      raf = requestAnimationFrame(tick);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          raf = null;
        } else if (!raf) {
          raf = requestAnimationFrame(tick);
        }
      });
    }
  }

  /* ---------------------------------------------------------
     Deck navigation
     --------------------------------------------------------- */
  const slides = $$(".slide");
  let current = 0;
  let overlayOpen = false;
  let wheelLock = 0;
  let wheelAcc = 0;
  const controllers = new Map();

  const progressBar = $("#progress-bar");
  const slideNumber = $("#slide-number");
  const slideTotal = $("#slide-total");
  const hudTitle = $("#hud-title");
  const prevBtn = $("#prev-btn");
  const nextBtn = $("#next-btn");
  const liveRegion = $("#live");

  if (slideTotal) slideTotal.textContent = pad(slides.length);

  function isOverlayOpen() {
    return overlayOpen;
  }

  function applyState() {
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === current);
      slide.classList.toggle("is-prev", i < current);
      slide.classList.toggle("is-next", i > current);
      slide.setAttribute("aria-hidden", String(i !== current));
    });

    const active = slides[current];
    if (!active) return;

    slideNumber.textContent = pad(current + 1);
    hudTitle.textContent = active.dataset.title || "";
    progressBar.style.width = `${((current + 1) / slides.length) * 100}%`;
    document.title = `${active.dataset.title || "Презентация"} — как машина учится видеть`;
    if (liveRegion) liveRegion.textContent = `Слайд ${current + 1} из ${slides.length}: ${active.dataset.title || ""}`;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === slides.length - 1;

    if (location.hash !== `#slide-${current + 1}`) {
      try {
        history.replaceState(null, "", `#slide-${current + 1}`);
      } catch (e) {
        location.hash = `slide-${current + 1}`;
      }
    }

    const ctrl = controllers.get(active.id);
    if (ctrl && ctrl.enter) ctrl.enter();
    updateOverviewCurrent();
  }

  function goTo(index) {
    if (!Number.isFinite(index)) return;
    const next = Math.max(0, Math.min(slides.length - 1, index));
    if (next === current) return;

    const old = slides[current];
    const ctrl = controllers.get(old.id);
    if (ctrl && ctrl.leave) ctrl.leave();

    current = next;
    applyState();
  }

  function next() {
    if (current < slides.length - 1) goTo(current + 1);
  }

  function prev() {
    if (current > 0) goTo(current - 1);
  }

  function closeOverlays() {
    closeOverview();
    closeHelp();
    closeBlackout();
  }

  function onKeydown(event) {
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

    if (event.key === "Escape") {
      closeOverlays();
      return;
    }

    if (event.key === "o" || event.key === "O" || event.key === "о" || event.key === "О") {
      event.preventDefault();
      toggleOverview();
      return;
    }

    if (event.key === "?" || event.key === "/") {
      event.preventDefault();
      openHelp();
      return;
    }

    if (event.key === "f" || event.key === "F" || event.key === "а" || event.key === "А") {
      event.preventDefault();
      toggleFullscreen();
      return;
    }

    if (event.key === "b" || event.key === "B" || event.key === "и" || event.key === "И") {
      event.preventDefault();
      toggleBlackout();
      return;
    }

    if (isOverlayOpen()) return;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
      case "Spacebar":
        event.preventDefault();
        next();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        event.preventDefault();
        prev();
        break;
      case "Home":
        event.preventDefault();
        goTo(0);
        break;
      case "End":
        event.preventDefault();
        goTo(slides.length - 1);
        break;
      default:
        break;
    }
  }

  function onWheel(event) {
    if (isOverlayOpen() || window.innerWidth <= 960 || event.ctrlKey) return;
    if (event.target.closest && event.target.closest('.draw-stage, input[type="range"]')) return;
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : 0;
    if (!delta) return;
    event.preventDefault();

    const now = performance.now();
    if (now < wheelLock) return;
    wheelAcc += delta;
    if (Math.abs(wheelAcc) < 55) return;

    wheelAcc = 0;
    wheelLock = now + 720;
    if (delta > 0) next();
    else prev();
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function onTouchStart(event) {
    if (isOverlayOpen() || event.touches.length !== 1) return;
    if (event.target.closest && event.target.closest(".draw-stage")) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchStartTime = performance.now();
  }

  function onTouchEnd(event) {
    if (isOverlayOpen() || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    const dt = performance.now() - touchStartTime;
    if (dt < 700 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) next();
      else prev();
    }
  }

  /* ---------------------------------------------------------
     Hero pixel grid
     --------------------------------------------------------- */
  let heroGridCells = null;
  let heroTimer = null;
  let heroIndex = 0;
  const heroDigits = ["7", "3", "8", "5"];

  function paintHeroGrid(digit) {
    const matrix = DIGITS[digit];
    if (!matrix || !heroGridCells) return;
    for (let r = 0; r < 28; r += 1) {
      for (let c = 0; c < 28; c += 1) {
        const value = matrix[r][c] / 255;
        const a = value < 0.04 ? 0.025 : 0.06 + value * 0.94;
        heroGridCells[r * 28 + c].style.background = rgba(176, 239, 255, a);
        heroGridCells[r * 28 + c].style.boxShadow = value > 0.7 ? "0 0 5px rgba(77,226,255,.25)" : "none";
      }
    }
  }

  function startHero() {
    if (!heroGridCells) {
      const grid = $("#hero-grid");
      if (!grid) return;
      heroGridCells = makeCells(grid, 28 * 28);
    }
    paintHeroGrid(heroDigits[heroIndex]);
    clearInterval(heroTimer);
    if (!reducedMotion) {
      heroTimer = setInterval(() => {
        heroIndex = (heroIndex + 1) % heroDigits.length;
        paintHeroGrid(heroDigits[heroIndex]);
      }, 4200);
    }
  }

  function stopHero() {
    clearInterval(heroTimer);
    heroTimer = null;
  }

  /* ---------------------------------------------------------
     Feature hierarchy
     --------------------------------------------------------- */
  function renderFeatureViz() {
    const inputEl = $("#feat-input");
    const edgeEl = $("#feat-edge");
    const poolEl = $("#feat-pool");
    if (!inputEl || !edgeEl || !poolEl) return;

    const matrix = DIGITS["3"];
    if (!matrix) return;

    const inputCells = makeCells(inputEl, 28 * 28);
    const edgeCells = makeCells(edgeEl, 28 * 28);
    const edge = Array.from({ length: 28 }, () => new Array(28).fill(0));

    for (let y = 1; y < 27; y += 1) {
      for (let x = 1; x < 27; x += 1) {
        const gx = matrix[y][x + 1] - matrix[y][x - 1];
        const gy = matrix[y + 1][x] - matrix[y - 1][x];
        edge[y][x] = Math.min(255, Math.hypot(gx, gy) * 1.45);
      }
    }

    for (let r = 0; r < 28; r += 1) {
      for (let c = 0; c < 28; c += 1) {
        const v = matrix[r][c] / 255;
        inputCells[r * 28 + c].style.background = rgba(234, 242, 255, Math.max(0.025, v));
        const e = edge[r][c] / 255;
        edgeCells[r * 28 + c].style.background = rgba(77, 226, 255, Math.max(0.015, e));
      }
    }

    // 4x4 max-pool of the edge map
    const pooled = [];
    for (let r = 0; r < 7; r += 1) {
      pooled.push([]);
      for (let c = 0; c < 7; c += 1) {
        let max = 0;
        for (let y = 0; y < 4; y += 1) {
          for (let x = 0; x < 4; x += 1) {
            const rr = r * 4 + y;
            const cc = c * 4 + x;
            if (rr < 28 && cc < 28) max = Math.max(max, edge[rr][cc]);
          }
        }
        pooled[r].push(max);
      }
    }

    const poolCells = makeCells(poolEl, 7 * 7);
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const v = pooled[r][c] / 255;
        poolCells[r * 7 + c].style.background = rgba(150, 221, 255, Math.max(0.03, Math.min(1, v * 1.25)));
      }
    }
  }

  /* ---------------------------------------------------------
     Neuron
     --------------------------------------------------------- */
  const neuronState = { bits: [1, 0, 1] };
  let neuronPulseTimer = null;

  function updateNeuron(animate = true) {
    const [a, b, c] = neuronState.bits;
    const z = 0.9 * a + 0.4 * b + 0.7 * c - 0.2;
    const sig = 1 / (1 + Math.exp(-z));
    const out = sig >= 0.5 ? 1 : 0;

    const zEl = $("#z-val");
    const sigEl = $("#sig-val");
    const thresholdEl = $("#threshold-val");
    const outputEl = $("#neuron-output");
    const outTextEl = $("#neuron-out-text");

    if (zEl) zEl.textContent = z.toFixed(2);
    if (sigEl) sigEl.textContent = sig.toFixed(2);
    if (thresholdEl) thresholdEl.textContent = String(out);
    if (outputEl) {
      outputEl.textContent = String(out);
      outputEl.classList.toggle("is-zero", out === 0);
    }
    if (outTextEl) outTextEl.textContent = String(out);

    $$(".bit-btn").forEach((btn, i) => {
      const value = neuronState.bits[i];
      btn.classList.toggle("is-on", value === 1);
      const bEl = btn.querySelector("b");
      if (bEl) bEl.textContent = String(value);
      btn.setAttribute("aria-pressed", String(value === 1));
    });

    if (animate) {
      clearTimeout(neuronPulseTimer);
      ["#sum-node", "#act-node"].forEach((sel) => {
        const node = $(sel);
        if (!node) return;
        node.classList.remove("is-firing");
        // force restart of the CSS animation
        void node.getBoundingClientRect();
        node.classList.add("is-firing");
      });
      neuronPulseTimer = setTimeout(() => {
        $$("#sum-node, #act-node").forEach((n) => n.classList.remove("is-firing"));
      }, 520);
    }
  }

  function initNeuron() {
    $$(".bit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.bit);
        neuronState.bits[idx] = neuronState.bits[idx] ? 0 : 1;
        updateNeuron(true);
      });
    });
    updateNeuron(false);
  }

  /* ---------------------------------------------------------
     Activation chart
     --------------------------------------------------------- */
  const actConfigs = {
    sigmoid: {
      xmin: -6,
      xmax: 6,
      ymin: -0.15,
      ymax: 1.15,
      xticks: [-6, -3, 0, 3, 6],
      yticks: [0, 0.5, 1],
      label: "y = σ(x) = 1 / (1 + e⁻ˣ)",
      range: "выход: 0…1",
      fn: (z) => 1 / (1 + Math.exp(-z)),
      fmtY: (v) => v.toFixed(1).replace(".0", ""),
      dotZ: 1.4,
    },
    relu: {
      xmin: -6,
      xmax: 6,
      ymin: -0.6,
      ymax: 6.2,
      xticks: [-6, -3, 0, 3, 6],
      yticks: [0, 2, 4, 6],
      label: "y = ReLU(x) = max(0, x)",
      range: "выход: 0…∞",
      fn: (z) => Math.max(0, z),
      fmtY: (v) => String(v),
      dotZ: 1.4,
    },
    tanh: {
      xmin: -6,
      xmax: 6,
      ymin: -1.15,
      ymax: 1.15,
      xticks: [-6, -3, 0, 3, 6],
      yticks: [-1, 0, 1],
      label: "y = tanh(x)",
      range: "выход: −1…1",
      fn: (z) => Math.tanh(z),
      fmtY: (v) => v.toFixed(1).replace(".0", ""),
      dotZ: 1.4,
    },
  };
  let currentAct = "sigmoid";
  const actValues = { sigmoid: 1.4, relu: 1.4, tanh: 1.4 };
  const actPlot = { left: 58, right: 560, top: 24, bottom: 330 };

  function xToPx(x, cfg) {
    return actPlot.left + ((x - cfg.xmin) / (cfg.xmax - cfg.xmin)) * (actPlot.right - actPlot.left);
  }
  function yToPx(y, cfg) {
    return actPlot.bottom - ((y - cfg.ymin) / (cfg.ymax - cfg.ymin)) * (actPlot.bottom - actPlot.top);
  }

  function setActivation(type, animate = true) {
    const cfg = actConfigs[type];
    if (!cfg) return;
    currentAct = type;

    $$(".seg[data-act]").forEach((btn) => {
      const active = btn.dataset.act === type;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    const label = $("#act-label");
    const range = $("#act-range");
    if (label) label.textContent = cfg.label;
    if (range) range.textContent = cfg.range;

    const grid = $("#act-grid");
    if (grid) {
      grid.replaceChildren();
      // horizontal grid
      cfg.yticks.forEach((tick) => {
        const y = yToPx(tick, cfg);
        grid.appendChild(svgEl("line", {
          x1: actPlot.left,
          x2: actPlot.right,
          y1: y,
          y2: y,
          class: "act-grid-line",
        }));
        const text = svgEl("text", {
          x: actPlot.left - 10,
          y: y + 3,
          "text-anchor": "end",
          class: "act-grid-label",
        });
        text.textContent = cfg.fmtY(tick);
        grid.appendChild(text);
      });
      // vertical grid
      cfg.xticks.forEach((tick) => {
        const x = xToPx(tick, cfg);
        grid.appendChild(svgEl("line", {
          x1: x,
          x2: x,
          y1: actPlot.top,
          y2: actPlot.bottom,
          class: "act-grid-line",
        }));
        const text = svgEl("text", {
          x,
          y: actPlot.bottom + 19,
          "text-anchor": "middle",
          class: "act-grid-label",
        });
        text.textContent = String(tick);
        grid.appendChild(text);
      });
      // axes
      if (cfg.ymin <= 0 && cfg.ymax >= 0) {
        const y0 = yToPx(0, cfg);
        grid.appendChild(svgEl("line", {
          x1: actPlot.left,
          x2: actPlot.right,
          y1: y0,
          y2: y0,
          class: "act-grid-line",
          "stroke-opacity": "0.55",
        }));
      }
      const x0 = xToPx(0, cfg);
      grid.appendChild(svgEl("line", {
        x1: x0,
        x2: x0,
        y1: actPlot.top,
        y2: actPlot.bottom,
        class: "act-grid-line",
        "stroke-opacity": "0.55",
      }));
      const xLabel = svgEl("text", {
        x: actPlot.right,
        y: actPlot.bottom + 35,
        "text-anchor": "end",
        class: "act-grid-label",
      });
      xLabel.textContent = "x";
      grid.appendChild(xLabel);
      const yLabel = svgEl("text", {
        x: actPlot.left - 10,
        y: actPlot.top - 4,
        "text-anchor": "end",
        class: "act-grid-label",
      });
      yLabel.textContent = "y";
      grid.appendChild(yLabel);
    }

    const path = $("#act-path");
    if (path) {
      let d = "";
      const steps = 160;
      for (let i = 0; i <= steps; i += 1) {
        const x = cfg.xmin + ((cfg.xmax - cfg.xmin) * i) / steps;
        const y = cfg.fn(x);
        const px = xToPx(x, cfg);
        const py = yToPx(y, cfg);
        d += `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)} `;
      }
      path.setAttribute("d", d);

      if (animate && !reducedMotion) {
        const len = path.getTotalLength ? path.getTotalLength() : 1800;
        path.style.transition = "none";
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        void path.getBoundingClientRect();
        path.style.transition = "";
        path.style.strokeDashoffset = "0";
      } else {
        path.style.strokeDasharray = "none";
        path.style.strokeDashoffset = "0";
      }
    }

    updateActPoint(actValues[type] ?? cfg.dotZ, false);
  }

  function updateActPoint(z, animate = true) {
    const cfg = actConfigs[currentAct];
    if (!cfg) return;
    const clamped = Math.max(cfg.xmin, Math.min(cfg.xmax, z));
    actValues[currentAct] = clamped;

    const dot = $("#act-dot");
    const guide = $("#act-guide");
    const dotLabel = $("#act-dot-label");
    const slider = $("#act-slider");
    if (!dot || !guide) return;
    const value = cfg.fn(clamped);
    const px = xToPx(clamped, cfg);
    const py = yToPx(value, cfg);
    dot.setAttribute("cx", px);
    dot.setAttribute("cy", py);
    guide.setAttribute("x1", px);
    guide.setAttribute("x2", px);
    guide.setAttribute("y1", py);
    guide.setAttribute("y2", actPlot.bottom);
    if (dotLabel) dotLabel.textContent = `x = ${clamped.toFixed(1)} → y = ${value.toFixed(2)}`;
    if (slider) {
      slider.min = String(cfg.xmin);
      slider.max = String(cfg.xmax);
      slider.value = String(clamped);
    }
    if (animate) {
      dot.classList.remove("is-dragging");
      void dot.getBoundingClientRect();
      dot.classList.add("is-dragging");
      window.setTimeout(() => dot.classList.remove("is-dragging"), 220);
    }
  }

  function initActivation() {
    $$(".seg[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => setActivation(btn.dataset.act, true));
    });

    const svg = $("#act-svg");
    const slider = $("#act-slider");
    const zFromClientX = (clientX) => {
      const cfg = actConfigs[currentAct];
      const rect = svg.getBoundingClientRect();
      const viewX = ((clientX - rect.left) / rect.width) * 600;
      const ratio = (viewX - actPlot.left) / (actPlot.right - actPlot.left);
      return cfg.xmin + ratio * (cfg.xmax - cfg.xmin);
    };

    if (svg) {
      let dragging = false;
      const move = (event) => {
        if (!dragging) return;
        event.preventDefault();
        updateActPoint(zFromClientX(event.clientX));
      };
      svg.addEventListener("pointerdown", (event) => {
        dragging = true;
        if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
        updateActPoint(zFromClientX(event.clientX));
      });
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", () => { dragging = false; });
      svg.addEventListener("pointercancel", () => { dragging = false; });
      svg.addEventListener("pointerleave", () => { dragging = false; });
    }

    if (slider) {
      slider.addEventListener("input", () => updateActPoint(Number(slider.value)));
    }

    setActivation("sigmoid", false);
  }

  /* ---------------------------------------------------------
     Training loop
     --------------------------------------------------------- */
  let trainRaf = null;

  function startTraining() {
    cancelAnimationFrame(trainRaf);
    const lossEl = $("#train-loss");
    const epochEl = $("#train-epoch");
    const barEl = $("#train-bar");
    if (!lossEl || !epochEl || !barEl) return;

    if (reducedMotion) {
      lossEl.textContent = "0.03";
      epochEl.textContent = "10 / 10";
      barEl.style.width = "2%";
      return;
    }

    const duration = 6800;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const loss = 2.31 + (0.027 - 2.31) * eased;
      const epoch = 1 + eased * 9;
      lossEl.textContent = loss.toFixed(loss < 0.1 ? 3 : 2);
      epochEl.textContent = `${pad(Math.min(10, Math.round(epoch)))} / 10`;
      barEl.style.width = `${Math.max(2, 100 - eased * 98)}%`;
      if (t < 1) trainRaf = requestAnimationFrame(tick);
    }
    trainRaf = requestAnimationFrame(tick);
  }

  function stopTraining() {
    cancelAnimationFrame(trainRaf);
    trainRaf = null;
  }

  /* ---------------------------------------------------------
     Grayscale pixel grid
     --------------------------------------------------------- */
  const grayMatrix = DIGITS["8"] || DIGITS["3"];
  let grayCells = null;

  function grayColor(value) {
    const a = value < 8 ? 0.025 : 0.04 + (value / 255) * 0.96;
    return rgba(234, 242, 255, a);
  }

  function selectGrayPixel(row, col) {
    if (!grayMatrix) return;
    const r = Math.max(0, Math.min(27, row));
    const c = Math.max(0, Math.min(27, col));
    const value = grayMatrix[r][c];

    grayCells.forEach((cell) => cell.classList.remove("is-picked"));
    if (grayCells[r * 28 + c]) grayCells[r * 28 + c].classList.add("is-picked");

    const coord = $("#pixel-coord");
    const valueEl = $("#pixel-value");
    const normEl = $("#pixel-norm");
    if (coord) coord.textContent = `[${r}, ${c}]`;
    if (valueEl) valueEl.textContent = String(value);
    if (normEl) normEl.textContent = (value / 255).toFixed(2);

    const patch = $("#patch-grid");
    if (patch) {
      const cells = [];
      const frag = document.createDocumentFragment();
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const rr = Math.max(0, Math.min(27, r + dy));
          const cc = Math.max(0, Math.min(27, c + dx));
          const span = document.createElement("span");
          span.textContent = String(grayMatrix[rr][cc]);
          if (dy === 0 && dx === 0) span.classList.add("is-center");
          frag.appendChild(span);
          cells.push(span);
        }
      }
      patch.replaceChildren(frag);
    }
  }

  function renderGray() {
    const grid = $("#gray-grid");
    if (!grid || !grayMatrix) return;
    grayCells = makeCells(grid, 28 * 28);
    for (let r = 0; r < 28; r += 1) {
      for (let c = 0; c < 28; c += 1) {
        const cell = grayCells[r * 28 + c];
        cell.style.background = grayColor(grayMatrix[r][c]);
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.addEventListener("pointerenter", () => selectGrayPixel(r, c));
      }
    }
    selectGrayPixel(14, 9);
  }

  /* ---------------------------------------------------------
     Convolution demo
     --------------------------------------------------------- */
  const convKernels = {
    vertical: [
      [-1, 0, 1],
      [-1, 0, 1],
      [-1, 0, 1],
    ],
    horizontal: [
      [-1, -1, -1],
      [0, 0, 0],
      [1, 1, 1],
    ],
    outline: [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0],
    ],
  };

  const conv = {
    input: [],
    kernelName: "vertical",
    output: [],
    norms: [],
    pos: 0,
    timer: null,
    playing: false,
    cells: [],
    outCells: [],
    kernelCells: [],
  };

  function downsampleDigit(digit, size = 14) {
    const matrix = DIGITS[digit];
    if (!matrix) return Array.from({ length: size }, () => new Array(size).fill(0));
    const factor = 28 / size;
    const out = [];
    for (let r = 0; r < size; r += 1) {
      out.push([]);
      for (let c = 0; c < size; c += 1) {
        let sum = 0;
        let count = 0;
        for (let y = 0; y < factor; y += 1) {
          for (let x = 0; x < factor; x += 1) {
            sum += matrix[Math.floor(r * factor + y)][Math.floor(c * factor + x)];
            count += 1;
          }
        }
        out[r].push(sum / count);
      }
    }
    return out;
  }

  function computeConvolution() {
    const kernel = convKernels[conv.kernelName];
    const out = [];
    let maxAbs = 1;
    for (let r = 0; r < 12; r += 1) {
      out.push([]);
      for (let c = 0; c < 12; c += 1) {
        let sum = 0;
        for (let y = 0; y < 3; y += 1) {
          for (let x = 0; x < 3; x += 1) {
            sum += conv.input[r + y][c + x] * kernel[y][x];
          }
        }
        out[r].push(sum);
        maxAbs = Math.max(maxAbs, Math.abs(sum));
      }
    }
    conv.output = out;
    conv.norms = out.map((row) => row.map((v) => Math.abs(v) / maxAbs));
  }

  function renderConvBase() {
    const inputEl = $("#conv-input");
    const outputEl = $("#conv-output");
    const kernelEl = $("#conv-kernel");
    if (!inputEl || !outputEl || !kernelEl) return;

    conv.input = downsampleDigit("3", 14);
    conv.cells = makeCells(inputEl, 14 * 14);
    for (let r = 0; r < 14; r += 1) {
      for (let c = 0; c < 14; c += 1) {
        const value = conv.input[r][c];
        conv.cells[r * 14 + c].style.background = rgba(234, 242, 255, Math.max(0.025, value / 255));
      }
    }

    conv.outCells = makeCells(outputEl, 12 * 12);
    conv.kernelCells = makeCells(kernelEl, 9);

    computeConvolution();
    paintKernel();
    resetConv(false);
  }

  function paintKernel() {
    const kernel = convKernels[conv.kernelName];
    let i = 0;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const cell = conv.kernelCells[i];
        const value = kernel[r][c];
        cell.textContent = value > 0 ? `+${value}` : String(value);
        cell.classList.toggle("is-zero", value === 0);
        i += 1;
      }
    }
  }

  function resetConv(announce = true) {
    conv.pos = 0;
    conv.outCells.forEach((cell) => {
      cell.className = "";
      cell.style.background = "";
    });
    conv.cells.forEach((cell) => cell.classList.remove("in-window"));
    const posEl = $("#conv-pos");
    if (posEl) posEl.textContent = `окно 1 / 144`;
    const rawEl = $("#conv-raw");
    const valEl = $("#conv-value");
    if (rawEl) rawEl.textContent = "—";
    if (valEl) valEl.textContent = "—";
    if (announce) {
      conv.playing = false;
      const play = $("#conv-play");
      if (play) play.textContent = "Продолжить";
      stopConvTimer();
    }
  }

  function stopConvTimer() {
    clearInterval(conv.timer);
    conv.timer = null;
  }

  function convStep() {
    if (conv.pos >= 144) {
      finishConv();
      return;
    }
    const p = conv.pos;
    const row = Math.floor(p / 12);
    const col = p % 12;

    conv.cells.forEach((cell) => cell.classList.remove("in-window"));
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const idx = (row + y) * 14 + (col + x);
        if (conv.cells[idx]) conv.cells[idx].classList.add("in-window");
      }
    }

    conv.outCells.forEach((cell) => cell.classList.remove("is-active"));
    const outCell = conv.outCells[p];
    const raw = conv.output[row][col];
    const norm = conv.norms[row][col];
    if (outCell) {
      outCell.classList.add("is-done", "is-active");
      outCell.style.background = rgba(77, 226, 255, 0.08 + norm * 0.72);
    }

    const posEl = $("#conv-pos");
    const rawEl = $("#conv-raw");
    const valEl = $("#conv-value");
    if (posEl) posEl.textContent = `окно ${p + 1} / 144`;
    if (rawEl) rawEl.textContent = raw > 0 ? `+${Math.round(raw)}` : String(Math.round(raw));
    if (valEl) valEl.textContent = norm.toFixed(2);

    conv.pos += 1;
    if (conv.pos >= 144) finishConv();
  }

  function finishConv() {
    stopConvTimer();
    conv.playing = false;
    const play = $("#conv-play");
    if (play) play.textContent = "Заново";
  }

  function startConv() {
    if (conv.timer) return;
    if (conv.pos >= 144) resetConv(false);
    conv.playing = true;
    const play = $("#conv-play");
    if (play) play.textContent = "Пауза";
    convStep();
    if (conv.pos < 144) {
      conv.timer = setInterval(convStep, 145);
    }
  }

  function pauseConv() {
    stopConvTimer();
    conv.playing = false;
    const play = $("#conv-play");
    if (play) play.textContent = "Продолжить";
  }

  function initConvolution() {
    renderConvBase();

    const play = $("#conv-play");
    const step = $("#conv-step");
    const reset = $("#conv-reset");

    if (play) {
      play.addEventListener("click", () => {
        if (conv.playing) pauseConv();
        else startConv();
      });
    }
    if (step) {
      step.addEventListener("click", () => {
        pauseConv();
        convStep();
      });
    }
    if (reset) {
      reset.addEventListener("click", () => {
        resetConv(true);
      });
    }

    $$(".btn-kernel").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.kernel;
        if (!convKernels[name] || name === conv.kernelName) return;
        conv.kernelName = name;
        $$(".btn-kernel").forEach((b) => b.classList.toggle("is-active", b === btn));
        computeConvolution();
        paintKernel();
        resetConv(false);
        if (conv.playing) {
          conv.playing = false;
          startConv();
        }
      });
    });
  }

  /* ---------------------------------------------------------
     Max pooling demo
     --------------------------------------------------------- */
  const poolInput = [
    [3, 7, 2, 8, 1, 4],
    [9, 4, 6, 2, 8, 5],
    [1, 5, 9, 3, 7, 2],
    [6, 2, 4, 8, 3, 9],
    [7, 1, 5, 2, 6, 4],
    [2, 8, 3, 7, 1, 5],
  ];

  const pool = {
    pos: 0,
    timer: null,
    playing: false,
    cells: [],
    outCells: [],
  };

  function renderPool() {
    const inputEl = $("#pool-input");
    const outEl = $("#pool-output");
    if (!inputEl || !outEl) return;

    pool.cells = makeCells(inputEl, 36);
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const cell = pool.cells[r * 6 + c];
        cell.textContent = String(poolInput[r][c]);
      }
    }
    pool.outCells = makeCells(outEl, 9);
    pool.outCells.forEach((cell) => { cell.textContent = "·"; });
    resetPool(false);
  }

  function resetPool(announce = true) {
    pool.pos = 0;
    pool.cells.forEach((cell) => cell.classList.remove("in-window", "is-max"));
    pool.outCells.forEach((cell) => {
      cell.textContent = "·";
      cell.classList.remove("is-filled");
    });
    const posEl = $("#pool-pos");
    if (posEl) posEl.textContent = "окно 1 / 9";
    const maxEl = $("#pool-max");
    if (maxEl) maxEl.textContent = "max";
    if (announce) {
      pool.playing = false;
      stopPoolTimer();
      const play = $("#pool-play");
      if (play) play.textContent = "Продолжить";
    }
  }

  function stopPoolTimer() {
    clearInterval(pool.timer);
    pool.timer = null;
  }

  function poolStep() {
    if (pool.pos >= 9) {
      stopPoolTimer();
      pool.playing = false;
      const play = $("#pool-play");
      if (play) play.textContent = "Заново";
      return;
    }

    const p = pool.pos;
    const row = Math.floor(p / 3);
    const col = p % 3;
    pool.cells.forEach((cell) => cell.classList.remove("in-window", "is-max"));

    let max = -Infinity;
    let maxIdx = -1;
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        const r = row * 2 + y;
        const c = col * 2 + x;
        const idx = r * 6 + c;
        pool.cells[idx].classList.add("in-window");
        if (poolInput[r][c] > max) {
          max = poolInput[r][c];
          maxIdx = idx;
        }
      }
    }
    if (pool.cells[maxIdx]) pool.cells[maxIdx].classList.add("is-max");

    const outCell = pool.outCells[p];
    if (outCell) {
      outCell.textContent = String(max);
      outCell.classList.add("is-filled");
    }

    const posEl = $("#pool-pos");
    const maxEl = $("#pool-max");
    if (posEl) posEl.textContent = `окно ${p + 1} / 9`;
    if (maxEl) maxEl.textContent = `max ${max}`;

    pool.pos += 1;
    if (pool.pos >= 9) {
      stopPoolTimer();
      pool.playing = false;
      const play = $("#pool-play");
      if (play) play.textContent = "Заново";
    }
  }

  function startPool() {
    if (pool.timer) return;
    if (pool.pos >= 9) resetPool(false);
    pool.playing = true;
    const play = $("#pool-play");
    if (play) play.textContent = "Пауза";
    poolStep();
    if (pool.pos < 9) pool.timer = setInterval(poolStep, 560);
  }

  function pausePool() {
    stopPoolTimer();
    pool.playing = false;
    const play = $("#pool-play");
    if (play) play.textContent = "Продолжить";
  }

  function initPooling() {
    renderPool();
    const play = $("#pool-play");
    const step = $("#pool-step");
    const reset = $("#pool-reset");

    if (play) {
      play.addEventListener("click", () => {
        if (pool.playing) pausePool();
        else startPool();
      });
    }
    if (step) {
      step.addEventListener("click", () => {
        pausePool();
        poolStep();
      });
    }
    if (reset) {
      reset.addEventListener("click", () => resetPool(true));
    }
  }

  /* ---------------------------------------------------------
     Softmax
     --------------------------------------------------------- */
  const softmaxSamples = {
    3: [1.2, 0.8, 2.4, 8.1, 0.4, 1.1, 0.3, 0.9, 1.7, 0.5],
    7: [0.4, 1.1, 0.7, 1.4, 0.9, 0.6, 1.2, 7.8, 1.5, 0.8],
  };
  let softmaxSample = 3;

  function softmax(logits) {
    const max = Math.max(...logits);
    const exps = logits.map((v) => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / sum);
  }

  function renderDigitSmall(container, digit) {
    const matrix = DIGITS[digit];
    if (!container || !matrix) return;
    let grid = container.querySelector(".pixel-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "pixel-grid";
      container.replaceChildren(grid);
    }
    const cells = makeCells(grid, 28 * 28);
    for (let r = 0; r < 28; r += 1) {
      for (let c = 0; c < 28; c += 1) {
        const v = matrix[r][c] / 255;
        cells[r * 28 + c].style.background = rgba(234, 242, 255, Math.max(0.02, v));
      }
    }
  }

  function setSoftmaxSample(digit) {
    softmaxSample = digit;
    const logits = softmaxSamples[digit];
    const probs = softmax(logits);
    const top = probs.indexOf(Math.max(...probs));

    $$(".seg[data-sample]").forEach((btn) => {
      const active = Number(btn.dataset.sample) === digit;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    $$(".bar-row").forEach((row, i) => {
      const fill = row.querySelector(".bar-fill");
      const val = row.querySelector(".bar-val");
      const p = probs[i];
      if (fill) fill.style.width = `${Math.max(0.6, p * 100)}%`;
      if (val) val.textContent = `${(p * 100).toFixed(1)}%`;
      row.classList.toggle("is-top", i === top);
    });

    const sumEl = $("#softmax-sum");
    if (sumEl) sumEl.textContent = probs.reduce((a, b) => a + b, 0).toFixed(3);
    const topEl = $("#softmax-top");
    if (topEl) topEl.textContent = `${top} · ${(probs[top] * 100).toFixed(1)}%`;

    renderDigitSmall($("#softmax-thumb"), digit);
  }

  function initSoftmax() {
    $$(".seg[data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => setSoftmaxSample(Number(btn.dataset.sample)));
    });
    setSoftmaxSample(3);
  }

  /* ---------------------------------------------------------
     Results charts
     --------------------------------------------------------- */
  const accTrain = [0.942, 0.978, 0.984, 0.988, 0.991, 0.993, 0.994, 0.995, 0.996, 0.997];
  const accVal = [0.981, 0.986, 0.988, 0.990, 0.991, 0.992, 0.993, 0.994, 0.994, 0.995];
  const lossTrain = [0.19, 0.071, 0.049, 0.039, 0.031, 0.026, 0.022, 0.019, 0.017, 0.015];
  const lossVal = [0.062, 0.047, 0.041, 0.037, 0.034, 0.032, 0.030, 0.029, 0.028, 0.027];

  const chartStore = [];

  function renderChart(svg, series, cfg) {
    if (!svg) return;
    const left = 34;
    const right = 408;
    const top = 18;
    const bottom = 154;
    const min = cfg.min;
    const max = cfg.max;
    const xFor = (i) => left + (i * (right - left)) / (series[0].data.length - 1);
    const yFor = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);

    svg.replaceChildren();

    const defs = svgEl("defs");
    const gradId = `chartFill-${cfg.id}`;
    const grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": cfg.areaColor, "stop-opacity": "0.18" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": cfg.areaColor, "stop-opacity": "0" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // grid + y labels
    for (let i = 0; i <= 4; i += 1) {
      const value = min + ((max - min) * i) / 4;
      const y = yFor(value);
      svg.appendChild(svgEl("line", {
        x1: left,
        x2: right,
        y1: y,
        y2: y,
        class: "chart-grid-line",
      }));
      const label = svgEl("text", {
        x: left - 6,
        y: y + 3,
        "text-anchor": "end",
        class: "chart-axis-label",
      });
      label.textContent = cfg.format(value);
      svg.appendChild(label);
    }

    // x labels
    [0, 2, 4, 6, 9].forEach((i) => {
      const label = svgEl("text", {
        x: xFor(i),
        y: bottom + 17,
        "text-anchor": "middle",
        class: "chart-axis-label",
      });
      label.textContent = String(i + 1);
      svg.appendChild(label);
    });

    // area under first series
    const areaData = series[0].data;
    let areaD = `M ${xFor(0)} ${bottom} `;
    areaData.forEach((v, i) => { areaD += `L ${xFor(i)} ${yFor(v)} `; });
    areaD += `L ${xFor(areaData.length - 1)} ${bottom} Z`;
    svg.appendChild(svgEl("path", {
      d: areaD,
      fill: `url(#${gradId})`,
      stroke: "none",
    }));

    // lines
    const linePaths = [];
    series.forEach((s) => {
      let d = "";
      s.data.forEach((v, i) => {
        d += `${i === 0 ? "M" : "L"}${xFor(i).toFixed(2)},${yFor(v).toFixed(2)} `;
      });
      const path = svgEl("path", {
        d,
        class: `chart-line ${s.cls}`,
      });
      path.style.stroke = s.color;
      svg.appendChild(path);
      linePaths.push(path);
    });

    // last point dots
    series.forEach((s) => {
      const i = s.data.length - 1;
      svg.appendChild(svgEl("circle", {
        cx: xFor(i),
        cy: yFor(s.data[i]),
        r: 3.2,
        fill: s.color,
        stroke: "#050b16",
        "stroke-width": "1.5",
      }));
    });

    // interactive crosshair
    const hoverLine = svgEl("line", {
      x1: left, x2: left, y1: top, y2: bottom,
      class: "chart-hover-line",
    });
    svg.appendChild(hoverLine);
    const hoverDots = series.map((s) => {
      const dot = svgEl("circle", {
        r: 4.6,
        fill: s.color,
        stroke: "#050b16",
        "stroke-width": "1.6",
        class: "chart-hover-dot",
      });
      svg.appendChild(dot);
      return dot;
    });

    chartStore.push({ svg, paths: linePaths, series, cfg, xFor, yFor, left, right, top, bottom, hoverLine, hoverDots });
  }

  function attachChartHover(card) {
    const svg = card.querySelector(".chart-svg");
    const store = chartStore.find((item) => item.svg === svg);
    if (!svg || !store) return;

    const tip = document.createElement("div");
    tip.className = "chart-tip";
    card.appendChild(tip);

    function hide() {
      store.hoverLine.classList.remove("is-on");
      store.hoverDots.forEach((dot) => dot.classList.remove("is-on"));
      tip.classList.remove("is-on");
    }

    svg.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect();
      const viewX = ((event.clientX - rect.left) / rect.width) * 420;
      let index = 0;
      let best = Infinity;
      for (let i = 0; i < store.series[0].data.length; i += 1) {
        const dist = Math.abs(store.xFor(i) - viewX);
        if (dist < best) { best = dist; index = i; }
      }
      const x = store.xFor(index);
      store.hoverLine.setAttribute("x1", x);
      store.hoverLine.setAttribute("x2", x);
      store.hoverLine.classList.add("is-on");
      store.hoverDots.forEach((dot, i) => {
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", store.yFor(store.series[i].data[index]));
        dot.classList.add("is-on");
      });
      tip.innerHTML = `<b>эпоха ${index + 1}</b>` + store.series.map((s) => (
        `<span><i style="background:${s.color}"></i>${s.label} · ${store.cfg.format(s.data[index])}</span>`
      )).join("");
      const ratio = (x / 420) * 100;
      tip.style.left = `${Math.max(14, Math.min(86, ratio))}%`;
      tip.classList.add("is-on");
    });
    svg.addEventListener("pointerleave", hide);
  }

  function initCharts() {
    renderChart($("#chart-acc"), [
      { data: accTrain, cls: "acc-train", color: "#4de2ff", label: "обучение" },
      { data: accVal, cls: "acc-val", color: "#a98bff", label: "проверка" },
    ], {
      id: "acc",
      min: 0.93,
      max: 1,
      areaColor: "#4de2ff",
      format: (v) => `${Math.round(v * 100)}%`,
    });

    renderChart($("#chart-loss"), [
      { data: lossTrain, cls: "loss-train", color: "#ffca6b", label: "обучение" },
      { data: lossVal, cls: "loss-val", color: "#a98bff", label: "проверка" },
    ], {
      id: "loss",
      min: 0,
      max: 0.2,
      areaColor: "#ffca6b",
      format: (v) => v.toFixed(2),
    });

    $$(".chart-card").forEach((card) => {
      const legend = document.createElement("div");
      legend.className = "chart-legend";
      legend.innerHTML = '<span><i style="background:#4de2ff"></i>обучение</span><span><i style="background:#a98bff"></i>проверка</span>';
      if (card.querySelector("#chart-loss")) {
        legend.innerHTML = '<span><i style="background:#ffca6b"></i>обучение</span><span><i style="background:#a98bff"></i>проверка</span>';
      }
      card.appendChild(legend);
      attachChartHover(card);
    });
  }

  function animateCharts() {
    chartStore.forEach(({ paths }) => {
      paths.forEach((path) => {
        const len = path.getTotalLength ? path.getTotalLength() : 800;
        path.style.transition = "none";
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        void path.getBoundingClientRect();
        path.style.transition = "";
        path.style.strokeDashoffset = "0";
      });
    });

    $$("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      const start = performance.now();
      const duration = 1000;
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = target * eased;
        el.textContent = target >= 1000 ? formatInt(value) : String(Math.round(value));
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target >= 1000 ? formatInt(target) : String(target);
      }
      requestAnimationFrame(tick);
    });
  }

  /* ---------------------------------------------------------
     Overview & overlays
     --------------------------------------------------------- */
  const overview = $("#overview");
  const overviewGrid = $("#overview-grid");
  const helpModal = $("#help-modal");
  const blackout = $("#blackout");

  function buildOverview() {
    if (!overviewGrid) return;
    slides.forEach((slide, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ov-card";
      btn.dataset.index = String(i);
      btn.innerHTML = `<span class="ov-num">${pad(i + 1)}</span><strong>${slide.dataset.title || ""}</strong>`;
      btn.addEventListener("click", () => {
        closeOverview();
        goTo(i);
      });
      overviewGrid.appendChild(btn);
    });
  }

  function updateOverviewCurrent() {
    if (!overviewGrid) return;
    $$(".ov-card", overviewGrid).forEach((card, i) => {
      card.classList.toggle("is-current", i === current);
    });
  }

  function openOverview() {
    if (!overview) return;
    overview.classList.add("is-open");
    overview.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    updateOverviewCurrent();
  }

  function closeOverview() {
    if (!overview) return;
    overview.classList.remove("is-open");
    overview.setAttribute("aria-hidden", "true");
    overlayOpen = helpModal && helpModal.classList.contains("is-open");
  }

  function toggleOverview() {
    if (!overview) return;
    if (overview.classList.contains("is-open")) closeOverview();
    else openOverview();
  }

  function openHelp() {
    if (!helpModal) return;
    helpModal.classList.add("is-open");
    helpModal.setAttribute("aria-hidden", "false");
    overlayOpen = true;
  }

  function closeHelp() {
    if (!helpModal) return;
    helpModal.classList.remove("is-open");
    helpModal.setAttribute("aria-hidden", "true");
    overlayOpen = overview && overview.classList.contains("is-open");
  }

  function toggleBlackout() {
    if (!blackout) return;
    blackout.classList.toggle("is-on");
    blackout.setAttribute("aria-hidden", String(!blackout.classList.contains("is-on")));
  }

  function closeBlackout() {
    if (!blackout) return;
    blackout.classList.remove("is-on");
    blackout.setAttribute("aria-hidden", "true");
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      // fullscreen may be blocked — no need to interrupt the presentation
    }
  }

  function initOverlays() {
    buildOverview();

    const overviewBtn = $("#btn-overview");
    const overviewClose = $("#overview-close");
    const helpBtn = $("#btn-help");
    const helpClose = $("#help-close");
    const fullBtn = $("#btn-fullscreen");

    if (overviewBtn) overviewBtn.addEventListener("click", toggleOverview);
    if (overviewClose) overviewClose.addEventListener("click", closeOverview);
    if (helpBtn) helpBtn.addEventListener("click", openHelp);
    if (helpClose) helpClose.addEventListener("click", closeHelp);
    if (fullBtn) fullBtn.addEventListener("click", toggleFullscreen);

    if (overview) {
      overview.addEventListener("click", (event) => {
        if (event.target === overview) closeOverview();
      });
    }
    if (helpModal) {
      helpModal.addEventListener("click", (event) => {
        if (event.target === helpModal) closeHelp();
      });
    }
  }

  /* ---------------------------------------------------------
     Tasks tab demo
     --------------------------------------------------------- */
  const taskDescriptions = [
    { code: "CLASSIFICATION", text: "Модель отвечает одним словом: «кошка». Этого достаточно, если объект один и занимает почти весь кадр." },
    { code: "LOCALIZATION", text: "К классу добавляется рамка: «кошка — вот здесь». Модель уже понимает не только что, но и где." },
    { code: "DETECTION", text: "Несколько рамок с классами: кошка, собака и утка в одном кадре. Так работают детекторы объектов." },
    { code: "SEGMENTATION", text: "Каждый пиксель получает свой класс. Модель возвращает не рамку, а точную маску объекта." },
  ];
  let taskIndex = 0;
  let taskTimer = null;

  function setTask(i) {
    taskIndex = (i + 4) % 4;
    const focus = $("#task-focus");
    const code = $("#task-code");
    const desc = $("#task-desc");
    const panels = $$(".task-panel");
    if (focus && panels[taskIndex]) {
      const shot = focus.parentElement.getBoundingClientRect();
      const img = panels[taskIndex].querySelector("img").getBoundingClientRect();
      focus.style.left = `${((img.left - shot.left) / shot.width) * 100}%`;
      focus.style.width = `${(img.width / shot.width) * 100}%`;
      focus.style.top = `${((img.top - shot.top) / shot.height) * 100}%`;
      focus.style.height = `${(img.height / shot.height) * 100}%`;
    }
    panels.forEach((panel, idx) => panel.classList.toggle("is-active", idx === taskIndex));
    if (code) code.textContent = taskDescriptions[taskIndex].code;
    if (desc) desc.textContent = taskDescriptions[taskIndex].text;
    $$(".task-tab").forEach((tab, idx) => {
      const active = idx === taskIndex;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }

  function initTasks() {
    $$(".task-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        setTask(Number(tab.dataset.task));
        clearInterval(taskTimer);
        taskTimer = setInterval(() => setTask(taskIndex + 1), 6000);
      });
    });
    setTask(0);
  }

  function startTasks() {
    clearInterval(taskTimer);
    if (!reducedMotion) {
      taskTimer = setInterval(() => setTask(taskIndex + 1), 5200);
    }
  }
  function stopTasks() {
    clearInterval(taskTimer);
    taskTimer = null;
  }

  /* ---------------------------------------------------------
     Draw your own digit
     --------------------------------------------------------- */
  const drawState = { templates: new Map(), ready: false, ink: false };
  let drawPreviewCells = null;
  let drawCtx = null;
  let drawing = false;
  let lastPoint = null;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function normalize28(source) {
    const sctx = source.getContext("2d", { willReadFrequently: true });
    const data = sctx.getImageData(0, 0, 28, 28).data;
    let minX = 28, minY = 28, maxX = -1, maxY = -1, peak = 0;
    for (let y = 0; y < 28; y += 1) {
      for (let x = 0; x < 28; x += 1) {
        const v = data[(y * 28 + x) * 4];
        if (v > peak) peak = v;
        if (v > 22) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const out = new Float32Array(784);
    if (maxX < 0) return out;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const scale = 20 / Math.max(bw, bh);
    const tw = Math.max(1, Math.round(bw * scale));
    const th = Math.max(1, Math.round(bh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = 28;
    canvas.height = 28;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 28, 28);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, minX, minY, bw, bh, Math.round((28 - tw) / 2), Math.round((28 - th) / 2), tw, th);
    const nd = ctx.getImageData(0, 0, 28, 28).data;
    for (let i = 0; i < 784; i += 1) out[i] = nd[i * 4];
    return out;
  }

  function canvasFromImage(img) {
    const canvas = document.createElement("canvas");
    canvas.width = 28;
    canvas.height = 28;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 28, 28);
    ctx.imageSmoothingEnabled = true;
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 28, 28);
    return canvas;
  }

  async function loadDrawTemplates() {
    try {
      for (let digit = 0; digit < 10; digit += 1) {
        const sum = new Float32Array(784);
        let count = 0;
        for (let sample = 0; sample < 5; sample += 1) {
          const img = await loadImage(`assets/img/d-${sample}-${digit}.webp`);
          const vec = normalize28(canvasFromImage(img));
          for (let i = 0; i < 784; i += 1) sum[i] += vec[i];
          count += 1;
        }
        for (let i = 0; i < 784; i += 1) sum[i] /= count;
        drawState.templates.set(digit, sum);
      }
      drawState.ready = true;
      if (drawState.ink) processDrawing();
      else renderDrawBars(null);
    } catch (e) {
      // templates are optional: drawing still works without them
    }
  }

  function paintDrawPreview(vec) {
    if (!drawPreviewCells) return;
    for (let i = 0; i < 784; i += 1) {
      const value = vec ? vec[i] / 255 : 0;
      drawPreviewCells[i].style.background = rgba(176, 239, 255, Math.max(0.03, value));
      drawPreviewCells[i].style.boxShadow = value > 0.75 ? "0 0 4px rgba(77,226,255,.35)" : "none";
    }
  }

  function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < 784; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / Math.sqrt(na * nb);
  }

  function classifyDrawing(vec) {
    if (!drawState.ready || !drawState.templates.size) return null;
    const sims = [];
    let best = -Infinity;
    drawState.templates.forEach((template, digit) => {
      const sim = cosine(vec, template);
      sims.push({ digit, sim });
      if (sim > best) best = sim;
    });
    const exps = sims.map((item) => {
      const value = Math.exp((item.sim - best) * 14);
      return { ...item, value };
    });
    const total = exps.reduce((acc, item) => acc + item.value, 0);
    return exps
      .map((item) => ({ digit: item.digit, prob: item.value / total }))
      .sort((a, b) => b.prob - a.prob);
  }

  function renderDrawBars(list) {
    const bars = $("#draw-bars");
    const cls = $("#draw-class");
    if (!bars || !cls) return;
    if (!list) {
      cls.textContent = drawState.ready ? "—" : "загрузка…";
      bars.replaceChildren();
      return;
    }
    cls.textContent = `${list[0].digit} · ${Math.round(list[0].prob * 100)}%`;
    bars.replaceChildren();
    list.slice(0, 3).forEach((item) => {
      const row = document.createElement("div");
      row.className = "draw-bar";
      const label = document.createElement("span");
      label.className = "mono";
      label.textContent = String(item.digit);
      const track = document.createElement("div");
      track.className = "draw-bar-track";
      const fill = document.createElement("i");
      fill.style.width = `${Math.round(item.prob * 100)}%`;
      track.appendChild(fill);
      const pct = document.createElement("b");
      pct.className = "mono";
      pct.textContent = `${Math.round(item.prob * 100)}%`;
      row.append(label, track, pct);
      bars.appendChild(row);
    });
  }

  function processDrawing() {
    const canvas = $("#draw-canvas");
    if (!canvas) return;
    const small = document.createElement("canvas");
    small.width = 28;
    small.height = 28;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, 28, 28);
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(canvas, 0, 0, 28, 28);
    const vec = normalize28(small);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < 784; i += 1) {
      if (vec[i] > peak) peak = vec[i];
      sum += vec[i];
    }
    drawState.ink = peak > 18;
    paintDrawPreview(vec);
    const normEl = $("#draw-norm");
    if (normEl) normEl.textContent = (sum / 784 / 255).toFixed(2);
    const status = $("#draw-status");
    if (!drawState.ink) {
      if (status) status.textContent = "рисуйте";
      renderDrawBars(null);
      return;
    }
    if (status) status.textContent = "готово";
    renderDrawBars(classifyDrawing(vec));
  }

  function initDraw() {
    const canvas = $("#draw-canvas");
    if (!canvas) return;
    drawCtx = canvas.getContext("2d", { willReadFrequently: true });
    drawCtx.fillStyle = "#000";
    drawCtx.fillRect(0, 0, canvas.width, canvas.height);
    drawCtx.strokeStyle = "#fff";
    drawCtx.fillStyle = "#fff";
    drawCtx.lineWidth = 34;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    const preview = $("#draw-preview");
    if (preview) {
      drawPreviewCells = makeCells(preview, 28 * 28);
      paintDrawPreview(null);
    }

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
      };
    };

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      drawing = true;
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
      lastPoint = point(event);
      drawCtx.beginPath();
      drawCtx.arc(lastPoint.x, lastPoint.y, 17, 0, Math.PI * 2);
      drawCtx.fill();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      event.preventDefault();
      const p = point(event);
      drawCtx.beginPath();
      drawCtx.moveTo(lastPoint.x, lastPoint.y);
      drawCtx.lineTo(p.x, p.y);
      drawCtx.stroke();
      lastPoint = p;
    });
    const finish = () => {
      if (!drawing) return;
      drawing = false;
      processDrawing();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("pointerleave", finish);

    const clearBtn = $("#draw-clear");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      drawCtx.fillStyle = "#000";
      drawCtx.fillRect(0, 0, canvas.width, canvas.height);
      drawCtx.fillStyle = "#fff";
      processDrawing();
    });

    const sampleBtn = $("#draw-sample");
    if (sampleBtn) sampleBtn.addEventListener("click", async () => {
      const digit = Math.floor(Math.random() * 10);
      const sample = Math.floor(Math.random() * 10);
      try {
        const img = await loadImage(`assets/img/d-${sample}-${digit}.webp`);
        drawCtx.fillStyle = "#000";
        drawCtx.fillRect(0, 0, canvas.width, canvas.height);
        const size = canvas.width * 0.74;
        drawCtx.drawImage(img, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
        processDrawing();
      } catch (e) {
        // keep the canvas as-is
      }
    });

    processDrawing();
    loadDrawTemplates();
  }

  /* ---------------------------------------------------------
     Quiz & self-check
     --------------------------------------------------------- */
  const quizQuestions = [
    {
      q: "Что представляет собой изображение для компьютера?",
      options: ["Набор правил", "Матрица чисел", "Готовая нейросеть"],
      correct: 1,
      explain: "Каждый пиксель — число. Чёрно-белая цифра 28×28 — это 784 значения.",
    },
    {
      q: "Зачем нужна свёртка?",
      options: ["Найти локальные признаки", "Сохранить модель на диск", "Увеличить изображение"],
      correct: 0,
      explain: "Ядро скользит по картинке и реагирует на края, штрихи и формы.",
    },
    {
      q: "Что делает MaxPooling?",
      options: ["Считает вероятности", "Меняет цвет пикселей", "Оставляет максимум в окне"],
      correct: 2,
      explain: "MaxPooling уменьшает размер карты, оставляя самые сильные признаки в каждом окне.",
    },
    {
      q: "Что делает Softmax на выходе?",
      options: ["Убирает шум", "Превращает числа в вероятности", "Ускоряет обучение"],
      correct: 1,
      explain: "Softmax превращает 10 выходов в распределение, сумма которого равна единице.",
    },
    {
      q: "Как сеть подбирает веса?",
      options: ["Минимизирует ошибку на примерах", "Случайно перебирает пиксели", "Копирует ответы учителя"],
      correct: 0,
      explain: "Обучение — это подбор весов по ошибке: градиентный спуск и backpropagation.",
    },
  ];
  const quizAnswers = new Array(quizQuestions.length).fill(-1);

  function updateQuizScore() {
    let correct = 0;
    quizAnswers.forEach((answer, i) => {
      if (answer === quizQuestions[i].correct) correct += 1;
    });
    const score = $("#quiz-score");
    if (score) score.textContent = `${correct} / ${quizQuestions.length}`;
    return correct;
  }

  function setQuizFeedback(html) {
    const feedback = $("#quiz-feedback");
    if (feedback) feedback.innerHTML = html;
  }

  function renderQuiz() {
    const grid = $("#quiz-grid");
    if (!grid) return;
    grid.replaceChildren();
    quizQuestions.forEach((question, qi) => {
      const card = document.createElement("article");
      card.className = "quiz-card";
      card.dataset.q = String(qi);

      const head = document.createElement("div");
      head.className = "quiz-card-head";
      const num = document.createElement("span");
      num.className = "mono";
      num.textContent = pad(qi + 1);
      const title = document.createElement("h3");
      title.textContent = question.q;
      head.append(num, title);
      card.appendChild(head);

      const options = document.createElement("div");
      options.className = "quiz-options";
      question.options.forEach((text, oi) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quiz-option";
        btn.dataset.opt = String(oi);
        const letter = document.createElement("span");
        letter.className = "mono";
        letter.textContent = String.fromCharCode(65 + oi);
        const label = document.createElement("span");
        label.textContent = text;
        btn.append(letter, label);
        btn.addEventListener("click", () => answerQuiz(qi, oi));
        options.appendChild(btn);
      });
      card.appendChild(options);
      grid.appendChild(card);
    });
    updateQuizScore();
  }

  function answerQuiz(qi, oi) {
    if (quizAnswers[qi] !== -1) return;
    quizAnswers[qi] = oi;
    const question = quizQuestions[qi];
    const card = $(`.quiz-card[data-q="${qi}"]`);
    if (card) {
      card.classList.add("is-answered");
      $$(".quiz-option", card).forEach((btn, idx) => {
        if (idx === question.correct) btn.classList.add("is-correct");
        else if (idx === oi) btn.classList.add("is-wrong");
        else btn.classList.add("is-dim");
      });
    }
    const correct = oi === question.correct;
    setQuizFeedback(
      `<b class="${correct ? "quiz-ok" : "quiz-bad"}">${correct ? "Верно." : "Не совсем."}</b> ${question.explain}`
    );
    const score = updateQuizScore();
    if (quizAnswers.every((answer) => answer !== -1)) {
      setQuizFeedback(`${score} из ${quizQuestions.length}. ${score >= 4 ? "Отличный результат — переходите к самопроверке." : "Загляните в самопроверку и разберите ошибки."}`);
    }
  }

  function resetQuiz() {
    quizAnswers.fill(-1);
    const feedback = $("#quiz-feedback");
    if (feedback) feedback.textContent = "Выберите ответ в каждом вопросе.";
    renderQuiz();
    syncSelfCheck();
  }

  function initQuiz() {
    if (!$("#quiz-grid")) return;
    renderQuiz();
  }

  function syncSelfCheck() {
    const answered = quizAnswers.filter((answer) => answer !== -1).length;
    let correct = 0;
    quizAnswers.forEach((answer, i) => {
      if (answer === quizQuestions[i].correct) correct += 1;
    });
    const score = $("#self-score");
    const verdict = $("#self-verdict");
    if (score) score.textContent = `${correct} / ${quizQuestions.length}`;
    if (verdict) {
      if (answered < quizQuestions.length) {
        verdict.textContent = `Отвечено ${answered} из 5. Завершите тест — и вернитесь сюда.`;
      } else if (correct === 5) {
        verdict.textContent = "Отлично! Вы можете объяснить весь путь: от пикселя до вероятности.";
      } else if (correct >= 3) {
        verdict.textContent = "Хороший результат. Вернитесь к вопросам, где были ошибки.";
      } else {
        verdict.textContent = "Есть база. Повторите слайды о свёртке, pooling и Softmax.";
      }
    }

    const titleMain = $("#self-title-main");
    const titleSub = $("#self-title-sub");
    if (titleMain && titleSub) {
      let pair = ["Самопроверка:", "что уже получается?"];
      if (answered === 0) {
        pair = ["Ещё ничего не отвечено,", "но это поправимо"];
      } else if (answered < quizQuestions.length) {
        pair = ["Не спешите,", "тест ещё не закончен"];
      } else if (correct === 5) {
        pair = ["Пять из пяти!", "Вы знаете, как видит машина"];
      } else if (correct === 4) {
        pair = ["Почти отлично:", "четыре из пяти"];
      } else if (correct === 3) {
        pair = ["Три из пяти —", "база уже есть"];
      } else if (correct === 2) {
        pair = ["Два из пяти.", "Загляните в шпаргалку"];
      } else if (correct === 1) {
        pair = ["Один из пяти,", "но начало положено"];
      } else {
        pair = ["Ноль из пяти…", "зато честно"];
      }
      titleMain.textContent = pair[0];
      titleSub.textContent = pair[1];
    }
  }

  function initSelfCheck() {
    const checklist = $("#self-checklist");
    if (!checklist) return;
    const boxes = $$('input[type="checkbox"]', checklist);
    const count = $("#self-check-count");
    const update = () => {
      const done = boxes.filter((box) => box.checked).length;
      if (count) count.textContent = `${done} / ${boxes.length}`;
    };
    boxes.forEach((box) => box.addEventListener("change", update));
    update();

    const restart = $("#self-restart");
    if (restart) restart.addEventListener("click", () => {
      resetQuiz();
      const quizIndex = slides.findIndex((slide) => slide.id === "slide-20");
      if (quizIndex >= 0) goTo(quizIndex);
    });
    syncSelfCheck();
  }

  /* ---------------------------------------------------------
     Workshop task checklist
     --------------------------------------------------------- */
  function initWorkCards() {
    const cards = $$(".work-card");
    if (!cards.length) return;
    const bar = $("#work-progress-bar");
    const text = $("#work-progress-text");
    const update = () => {
      const done = cards.filter((card) => card.getAttribute("aria-pressed") === "true").length;
      if (bar) bar.style.width = `${(done / cards.length) * 100}%`;
      if (text) text.textContent = `${done} / ${cards.length}`;
    };
    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const done = card.getAttribute("aria-pressed") !== "true";
        card.setAttribute("aria-pressed", String(done));
        card.classList.toggle("is-done", done);
        update();
      });
    });
    update();
  }

  /* ---------------------------------------------------------
     Slide controllers
     --------------------------------------------------------- */
  function registerControllers() {
    controllers.set("slide-1", { enter: startHero, leave: stopHero });
    controllers.set("slide-3", { enter: startTasks, leave: stopTasks });
    controllers.set("slide-7", {
      enter: () => setActivation(currentAct, true),
    });
    controllers.set("slide-8", { enter: startTraining, leave: stopTraining });
    controllers.set("slide-11", { enter: animateCharts });
    controllers.set("slide-13", {
      enter: () => {
        if (conv.pos >= 144) resetConv(false);
        if (!conv.playing || !conv.timer) startConv();
      },
      leave: pauseConv,
    });
    controllers.set("slide-14", {
      enter: () => {
        if (pool.pos >= 9) resetPool(false);
        if (!pool.playing || !pool.timer) startPool();
      },
      leave: pausePool,
    });
    controllers.set("slide-15", {
      enter: () => setSoftmaxSample(softmaxSample),
    });
    controllers.set("slide-16", { enter: animateCharts });
    controllers.set("slide-17", {
      enter: () => {
        if (!drawState.ink) processDrawing();
      },
    });
    controllers.set("slide-21", { enter: syncSelfCheck });
  }

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */
  function init() {
    renderFeatureViz();
    initNeuron();
    initActivation();
    renderGray();
    initConvolution();
    initPooling();
    initSoftmax();
    initCharts();
    initTasks();
    initDraw();
    initQuiz();
    initSelfCheck();
    initWorkCards();
    initOverlays();
    registerControllers();

    const match = location.hash.match(/slide-(\d+)/);
    current = match ? Math.max(0, Math.min(slides.length - 1, Number(match[1]) - 1)) : 0;
    applyState();

    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    window.addEventListener("hashchange", () => {
      const m = location.hash.match(/slide-(\d+)/);
      if (m) goTo(Number(m[1]) - 1);
    });

    initBackground();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
