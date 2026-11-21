(function () {
  const LC = window.LightweightCharts;
  const CB = window.ChartBrowser;

  const COLORS = {
    background: "#0b0e13",
    text: "#d7dde8",
    grid: "#1c2230",
    border: "#2a3140",
    up: "#26a69a",
    down: "#ef5350",
    ema10: "#f5d76e",
    ema20: "#5dade2",
    sma50: "#c39bd3",
    sma200: "#e59866",
    crosshair: "#758696",
  };

  const STORAGE_PREFIX = "chart-browser:annotations:";
  const DRAW_PREFIX = "chart-browser:drawings:";
  const DRAW_TOOLS = { trend: true, hline: true, rect: true };

  const els = {
    yearFilter: document.getElementById("year-filter"),
    caseSelect: document.getElementById("case-select"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    counter: document.getElementById("counter"),
    measureBtn: document.getElementById("measure-btn"),
    textBtn: document.getElementById("text-btn"),
    trendBtn: document.getElementById("trend-btn"),
    hlineBtn: document.getElementById("hline-btn"),
    rectBtn: document.getElementById("rect-btn"),
    deleteDrawBtn: document.getElementById("delete-draw-btn"),
    fullscreenBtn: document.getElementById("fullscreen-btn"),
    saveDrawBtn: document.getElementById("save-draw-btn"),
    downloadImageBtn: document.getElementById("download-image-btn"),
    clearDrawBtn: document.getElementById("clear-draw-btn"),
    drawList: document.getElementById("draw-list"),
    drawEmpty: document.getElementById("draw-empty"),
    drawSaved: document.getElementById("draw-saved"),
    stage: document.getElementById("app"),
    status: document.getElementById("status"),
    chart: document.getElementById("chart"),
    wrap: document.getElementById("chart-wrap"),
    noteEditor: document.getElementById("note-editor"),
    noteInput: document.getElementById("note-input"),
    bootError: document.getElementById("boot-error"),
    valEma10: document.getElementById("val-ema10"),
    valEma20: document.getElementById("val-ema20"),
    valSma50: document.getElementById("val-sma50"),
    valSma200: document.getElementById("val-sma200"),
    ohlc: document.getElementById("ohlc"),
  };

  const state = {
    allCases: [],
    filtered: [],
    index: -1,
    bars: [],
    overlays: null,
    currentPath: null,
    tool: "none", // none | measure | text | trend | hline | rect
    shiftHeld: false,
    measuring: false,
    measureStart: null,
    notes: [],
    selectedNoteId: null,
    drawings: [],
    selectedDrawingId: null,
    draft: null,
    pendingNote: null,
    panEnabled: true,
  };

  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let maSeries = {};
  let measurePrimitive = null;
  let notesPrimitive = null;
  let drawingsPrimitive = null;

  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.className = kind || "";
  }

  function storageKey(path) {
    return STORAGE_PREFIX + path;
  }

  function loadNotes(path) {
    if (!path) return [];
    try {
      const raw = localStorage.getItem(storageKey(path));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((n) => n && n.id && n.time && Number.isFinite(n.price) && n.text)
        .map((n) => ({
          id: String(n.id),
          time: CB.normalizeTime(n.time) || n.time,
          price: Number(n.price),
          text: String(n.text).slice(0, 80),
        }));
    } catch (err) {
      return [];
    }
  }

  function saveNotes(path, notes) {
    if (!path) return;
    try {
      if (!notes.length) localStorage.removeItem(storageKey(path));
      else localStorage.setItem(storageKey(path), JSON.stringify(notes));
    } catch (err) {
      setStatus("無法儲存文字註記（瀏覽器儲存空間可能已滿）。", "error");
    }
  }

  function refreshNotesPrimitive() {
    if (notesPrimitive) notesPrimitive.setNotes(state.notes, state.selectedNoteId);
  }

  function currentCase() {
    return state.filtered[state.index] || null;
  }

  function chartImageName() {
    const item = currentCase();
    let raw = "chart";
    if (item && item.year && item.ticker) raw = `${item.year}_${item.ticker}`;
    else if (item && item.path) raw = String(item.path).replace(/^.*\//, "").replace(/\.csv$/i, "");
    const safe = raw.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "chart";
    return `${safe}.png`;
  }

  function downloadChartImage() {
    if (!chart || typeof chart.takeScreenshot !== "function") {
      setStatus("無法下載圖片。", "error");
      return;
    }
    let canvas;
    try {
      // Drawings, saved measures, and text notes paint on the chart's top
      // canvas. The first argument composites that layer into the PNG; the
      // bare price chart would otherwise omit every mark the user drew.
      canvas = chart.takeScreenshot(true);
    } catch (err) {
      setStatus("無法產生圖片。", "error");
      return;
    }
    const name = chartImageName();
    let url;
    try {
      url = canvas.toDataURL("image/png");
    } catch (err) {
      setStatus("無法產生圖片。", "error");
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus(`已下載 ${name}。`, "info");
  }

  function updateNav() {
    const n = state.filtered.length;
    const has = n > 0 && state.index >= 0;
    els.prevBtn.disabled = !has || state.index <= 0;
    els.nextBtn.disabled = !has || state.index >= n - 1;
    els.counter.textContent = has ? `第 ${state.index + 1} 題 / ${n}` : `0 / ${n}`;
    const c = currentCase();
    if (c && els.caseSelect.value !== c.path) els.caseSelect.value = c.path;
  }

  function populateYears() {
    const years = Array.from(new Set(state.allCases.map((c) => c.year))).sort();
    els.yearFilter.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "全部年份";
    els.yearFilter.appendChild(all);
    years.forEach((year) => {
      const opt = document.createElement("option");
      opt.value = year;
      opt.textContent = year;
      els.yearFilter.appendChild(opt);
    });
  }

  function populateCases() {
    const year = els.yearFilter.value;
    state.filtered = year
      ? state.allCases.filter((c) => c.year === year)
      : state.allCases.slice();

    els.caseSelect.innerHTML = "";
    const groups = new Map();
    state.filtered.forEach((c) => {
      if (!groups.has(c.year)) groups.set(c.year, []);
      groups.get(c.year).push(c);
    });
    groups.forEach((list, yr) => {
      const og = document.createElement("optgroup");
      og.label = yr;
      list.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.path;
        opt.textContent = c.label;
        og.appendChild(opt);
      });
      els.caseSelect.appendChild(og);
    });

    if (!state.filtered.length) {
      state.index = -1;
      updateNav();
      return;
    }

    const currentPath = state.currentPath;
    const found = state.filtered.findIndex((c) => c.path === currentPath);
    state.index = found >= 0 ? found : 0;
    updateNav();
  }

  function setPanEnabled(enabled) {
    if (!chart) return;
    state.panEnabled = enabled;
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: enabled,
        horzTouchDrag: enabled,
        vertTouchDrag: false,
      },
    });
  }

  function drawToolActive() {
    return !!DRAW_TOOLS[state.tool];
  }

  function measureActive() {
    if (drawToolActive() || state.tool === "text") return false;
    return state.tool === "measure" || state.shiftHeld;
  }

  function syncInteraction() {
    const drawing = drawToolActive() || !!state.draft;
    setPanEnabled(!measureActive() && !state.measuring && !drawing);
    if (chart) {
      chart.applyOptions({
        crosshair: {
          mode: measureActive() || drawToolActive()
            ? LC.CrosshairMode.Normal
            : LC.CrosshairMode.Magnet,
        },
      });
    }
    els.measureBtn.classList.toggle("active", state.tool === "measure");
    els.textBtn.classList.toggle("active", state.tool === "text");
    els.trendBtn.classList.toggle("active", state.tool === "trend");
    els.hlineBtn.classList.toggle("active", state.tool === "hline");
    els.rectBtn.classList.toggle("active", state.tool === "rect");
    els.deleteDrawBtn.disabled = !state.selectedDrawingId;
    els.stage.classList.toggle("is-drawing", drawing);
    const cursor = state.tool === "text"
      ? "text"
      : measureActive() || drawToolActive()
        ? "crosshair"
        : "";
    els.wrap.style.cursor = cursor;
  }

  function clearMeasure() {
    state.measuring = false;
    state.measureStart = null;
    if (measurePrimitive) measurePrimitive.clear();
  }

  function drawingName(type) {
    if (type === "hline") return "水平線";
    if (type === "rect") return "矩形";
    if (type === "measure") return "測量";
    return "趨勢線";
  }

  function sanitizeDrawing(raw) {
    if (!raw || !raw.id) return null;
    const id = String(raw.id);
    if (raw.type === "hline") {
      const price = Number(raw.price);
      if (!Number.isFinite(price)) return null;
      return { id, type: "hline", price };
    }
    if (raw.type !== "trend" && raw.type !== "rect" && raw.type !== "measure") return null;
    const time1 = CB.normalizeTime(raw.time1) || raw.time1;
    const time2 = CB.normalizeTime(raw.time2) || raw.time2;
    const price1 = Number(raw.price1);
    const price2 = Number(raw.price2);
    if (!time1 || !time2 || !Number.isFinite(price1) || !Number.isFinite(price2)) return null;
    return { id, type: raw.type, time1, price1, time2, price2 };
  }

  function loadDrawings(path) {
    if (!path) return [];
    try {
      const raw = localStorage.getItem(DRAW_PREFIX + path);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeDrawing).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function persistDrawings() {
    if (!state.currentPath) return false;
    try {
      const key = DRAW_PREFIX + state.currentPath;
      if (!state.drawings.length) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(state.drawings));
      if (els.drawSaved) els.drawSaved.textContent = "已儲存";
      return true;
    } catch (err) {
      if (els.drawSaved) els.drawSaved.textContent = "未能儲存";
      setStatus("無法儲存畫線與測量（瀏覽器儲存空間可能已滿）。", "error");
      return false;
    }
  }

  function drawingLabel(item) {
    if (item.type === "hline") return `水平線　${CB.formatPrice(item.price)}`;
    const a = `${item.time1} ${CB.formatPrice(item.price1)}`;
    const b = `${item.time2} ${CB.formatPrice(item.price2)}`;
    if (item.type === "measure") {
      const pct = item.price1 !== 0 ? ((item.price2 - item.price1) / item.price1) * 100 : null;
      return `測量　${CB.formatPct(pct)}　${a} → ${b}`;
    }
    return `${drawingName(item.type)}　${a} → ${b}`;
  }

  function refreshDrawings() {
    if (!drawingsPrimitive) return;
    drawingsPrimitive.setBars(state.bars);
    const draft = state.draft
      ? {
          type: state.draft.type,
          time1: state.draft.p1.time,
          price1: state.draft.p1.price,
          time2: state.draft.p2.time,
          price2: state.draft.p2.price,
          price: state.draft.p1.price,
        }
      : null;
    drawingsPrimitive.setModel(state.drawings, state.selectedDrawingId, draft);
  }

  function renderDrawList() {
    const list = els.drawList;
    list.replaceChildren();
    const empty = !state.drawings.length;
    els.drawEmpty.hidden = !empty;
    els.clearDrawBtn.disabled = empty;
    state.drawings.forEach((item) => {
      const li = document.createElement("li");
      if (item.id === state.selectedDrawingId) li.className = "selected";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "draw-item";
      open.textContent = drawingLabel(item);
      open.addEventListener("click", () => {
        state.selectedDrawingId = item.id;
        state.selectedNoteId = null;
        refreshNotesPrimitive();
        refreshDrawings();
        renderDrawList();
        syncInteraction();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "draw-remove";
      remove.textContent = "刪除";
      remove.addEventListener("click", () => deleteDrawing(item.id));
      li.append(open, remove);
      list.append(li);
    });
    syncInteraction();
  }

  function cancelDraft() {
    state.draft = null;
    refreshDrawings();
  }

  function commitDrawing(item) {
    state.drawings = state.drawings.concat(item);
    state.selectedDrawingId = item.id;
    state.draft = null;
    persistDrawings();
    refreshDrawings();
    renderDrawList();
  }

  function deleteDrawing(id) {
    if (!id) return;
    state.drawings = state.drawings.filter((item) => item.id !== id);
    if (state.selectedDrawingId === id) state.selectedDrawingId = null;
    persistDrawings();
    refreshDrawings();
    renderDrawList();
  }

  function newDrawingId() {
    return `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function pointsFarEnough(a, b) {
    if (!a || !b) return false;
    return a.time !== b.time || Math.abs(a.price - b.price) > Math.max(Math.abs(a.price) * 0.000001, 1e-8);
  }

  function pointerMoved(event, draft) {
    return Math.hypot(event.clientX - draft.originX, event.clientY - draft.originY) > 8;
  }

  function hideNoteEditor() {
    state.pendingNote = null;
    els.noteEditor.classList.remove("visible");
    els.noteInput.value = "";
  }

  function showNoteEditor(clientX, clientY, existing) {
    const rect = els.wrap.getBoundingClientRect();
    const editorWidth = Math.min(240, Math.max(120, rect.width - 16));
    let left = clientX - rect.left;
    let top = clientY - rect.top;
    left = Math.max(8, Math.min(left, Math.max(8, rect.width - editorWidth - 8)));
    top = Math.max(16, Math.min(top, rect.height - 16));
    els.noteEditor.style.left = `${left}px`;
    els.noteEditor.style.top = `${top}px`;
    els.noteEditor.classList.add("visible");
    els.noteInput.value = existing && existing.text ? existing.text : "";
    els.noteInput.focus();
    els.noteInput.select();
  }

  function layoutPanes() {
    if (!chart) return;
    const panes = chart.panes();
    if (panes.length < 2) return;
    const total = els.chart.clientHeight;
    if (total < 80) return;
    const vol = Math.max(72, Math.min(180, Math.round(total * 0.22)));
    panes[1].setHeight(vol);
  }

  function resizeChart() {
    if (!chart) return;
    const width = els.chart.clientWidth;
    const height = els.chart.clientHeight;
    if (width > 0 && height > 0) {
      chart.resize(width, height);
      layoutPanes();
    }
  }

  function createChart() {
    chart = LC.createChart(els.chart, {
      layout: {
        background: { color: COLORS.background },
        textColor: COLORS.text,
        fontFamily: "Segoe UI, Microsoft JhengHei, sans-serif",
        attributionLogo: true,
        panes: {
          separatorColor: COLORS.border,
          separatorHoverColor: "#3d8bfd66",
        },
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: LC.CrosshairMode.Magnet,
        vertLine: { color: COLORS.crosshair, labelBackgroundColor: "#2a3140" },
        horzLine: { color: COLORS.crosshair, labelBackgroundColor: "#2a3140" },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: false,
        secondsVisible: false,
      },
      localization: {
        dateFormat: "yyyy-MM-dd",
      },
      autoSize: false,
      width: els.chart.clientWidth,
      height: els.chart.clientHeight,
    });

    candleSeries = chart.addSeries(LC.CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });

    maSeries.ema10 = chart.addSeries(LC.LineSeries, {
      color: COLORS.ema10,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    maSeries.ema20 = chart.addSeries(LC.LineSeries, {
      color: COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    maSeries.sma50 = chart.addSeries(LC.LineSeries, {
      color: COLORS.sma50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    maSeries.sma200 = chart.addSeries(LC.LineSeries, {
      color: COLORS.sma200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const volPane = chart.addPane(true);
    volumeSeries = volPane.addSeries(LC.HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.15, bottom: 0 },
      borderColor: COLORS.border,
    });

    measurePrimitive = new CB.MeasurePrimitive();
    notesPrimitive = new CB.NotesPrimitive();
    drawingsPrimitive = new CB.DrawingsPrimitive();
    candleSeries.attachPrimitive(measurePrimitive);
    candleSeries.attachPrimitive(notesPrimitive);
    candleSeries.attachPrimitive(drawingsPrimitive);

    chart.subscribeCrosshairMove(onCrosshairMove);
    layoutPanes();
    bindPaneEvents();
  }

  function onCrosshairMove(param) {
    const empty = { ema10: "—", ema20: "—", sma50: "—", sma200: "—" };
    if (!param || !param.time || !state.bars.length) {
      setLegend(null, empty);
      return;
    }
    const time = CB.normalizeTime(param.time);
    const idx = state.bars.findIndex((b) => b.time === time);
    if (idx < 0) {
      setLegend(null, empty);
      return;
    }
    const bar = state.bars[idx];
    const values = state.overlays ? state.overlays.values : null;
    setLegend(bar, {
      ema10: values && values.ema10[idx] != null ? CB.formatPrice(values.ema10[idx]) : "—",
      ema20: values && values.ema20[idx] != null ? CB.formatPrice(values.ema20[idx]) : "—",
      sma50: values && values.sma50[idx] != null ? CB.formatPrice(values.sma50[idx]) : "—",
      sma200: values && values.sma200[idx] != null ? CB.formatPrice(values.sma200[idx]) : "—",
    });
  }

  function setLegend(bar, ma) {
    els.valEma10.textContent = ma.ema10;
    els.valEma20.textContent = ma.ema20;
    els.valSma50.textContent = ma.sma50;
    els.valSma200.textContent = ma.sma200;
    if (!bar) {
      els.ohlc.textContent = "";
      els.ohlc.className = "ohlc";
      return;
    }
    const cls = bar.close >= bar.open ? "up" : "down";
    els.ohlc.className = `ohlc ${cls}`;
    els.ohlc.innerHTML =
      `開 <b>${CB.formatPrice(bar.open)}</b> 高 <b>${CB.formatPrice(bar.high)}</b> ` +
      `低 <b>${CB.formatPrice(bar.low)}</b> 收 <b>${CB.formatPrice(bar.close)}</b> ` +
      `量 <b>${CB.formatVolume(bar.volume)}</b>`;
  }

  function getPointFromEvent(event) {
    if (!chart || !candleSeries) return null;
    const paneEl = candleSeries.getPane().getHTMLElement();
    if (!paneEl) return null;
    const rect = paneEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const timeRaw = chart.timeScale().coordinateToTime(x);
    const price = candleSeries.coordinateToPrice(y);
    const time = CB.normalizeTime(timeRaw);
    if (time == null || price == null || !Number.isFinite(price)) return null;
    return { time, price, clientX: event.clientX, clientY: event.clientY };
  }

  function bindPaneEvents() {
    const paneEl = candleSeries.getPane().getHTMLElement();
    if (!paneEl || paneEl.dataset.bound === "1") return;
    paneEl.dataset.bound = "1";

    paneEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (els.noteEditor.classList.contains("visible")) return;

      if (state.tool === "text") {
        event.preventDefault();
        event.stopPropagation();
        const point = getPointFromEvent(event);
        if (!point || !state.currentPath) return;
        const hit = notesPrimitive && notesPrimitive.hitTest
          ? notesPrimitive.hitTest(
              event.clientX - paneEl.getBoundingClientRect().left,
              event.clientY - paneEl.getBoundingClientRect().top
            )
          : null;
        if (hit && hit.externalId) {
          const existing = state.notes.find((n) => n.id === hit.externalId);
          state.selectedNoteId = existing ? existing.id : null;
          refreshNotesPrimitive();
          state.pendingNote = existing
            ? { mode: "edit", note: existing }
            : null;
          if (existing) showNoteEditor(event.clientX, event.clientY, existing);
          return;
        }
        state.selectedNoteId = null;
        refreshNotesPrimitive();
        state.pendingNote = { mode: "create", point };
        showNoteEditor(event.clientX, event.clientY, null);
        return;
      }

      if (drawToolActive()) {
        const point = getPointFromEvent(event);
        if (!point || !state.currentPath) return;
        event.preventDefault();
        event.stopPropagation();
        state.selectedNoteId = null;
        refreshNotesPrimitive();
        if (state.tool === "hline") {
          state.draft = {
            type: "hline",
            p1: point,
            p2: point,
            phase: "drag",
            originX: event.clientX,
            originY: event.clientY,
          };
        } else if (!state.draft || state.draft.type !== state.tool || state.draft.phase !== "await") {
          state.draft = {
            type: state.tool,
            p1: point,
            p2: point,
            phase: "drag",
            originX: event.clientX,
            originY: event.clientY,
            clicks: 0,
          };
        } else {
          state.draft.p2 = point;
          state.draft.phase = "drag";
          state.draft.originX = event.clientX;
          state.draft.originY = event.clientY;
        }
        refreshDrawings();
        setPanEnabled(false);
        try {
          paneEl.setPointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
        return;
      }

      if (measureActive()) {
        const point = getPointFromEvent(event);
        if (!point) return;
        event.preventDefault();
        state.measuring = true;
        state.measureStart = point;
        measurePrimitive.setPoints(point, point);
        setPanEnabled(false);
        try {
          paneEl.setPointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
        return;
      }

      if (state.tool === "none" && drawingsPrimitive) {
        const localX = event.clientX - paneEl.getBoundingClientRect().left;
        const localY = event.clientY - paneEl.getBoundingClientRect().top;
        const hit = drawingsPrimitive.hitTest(localX, localY);
        if (hit && hit.externalId) {
          event.preventDefault();
          event.stopPropagation();
          state.selectedDrawingId = hit.externalId;
          state.selectedNoteId = null;
          refreshNotesPrimitive();
          refreshDrawings();
          renderDrawList();
        } else if (state.selectedDrawingId) {
          state.selectedDrawingId = null;
          refreshDrawings();
          renderDrawList();
        }
      }
    });

    paneEl.addEventListener("pointermove", (event) => {
      if (state.draft && state.draft.phase === "drag") {
        const point = getPointFromEvent(event);
        if (!point) return;
        if (state.draft.type === "hline") {
          state.draft.p1 = point;
          state.draft.p2 = point;
        } else {
          state.draft.p2 = point;
        }
        refreshDrawings();
        return;
      }
      if (!state.measuring || !state.measureStart) return;
      const point = getPointFromEvent(event);
      if (!point) return;
      measurePrimitive.setPoints(state.measureStart, point);
    });

    const endPointer = (event) => {
      if (state.draft && state.draft.phase === "drag") {
        const point = getPointFromEvent(event);
        const draft = state.draft;
        if (point) {
          if (draft.type === "hline") {
            draft.p1 = point;
            draft.p2 = point;
          } else {
            draft.p2 = point;
          }
        }
        const moved = pointerMoved(event, draft);
        if (draft.type === "hline") {
          commitDrawing({
            id: newDrawingId(),
            type: "hline",
            price: draft.p1.price,
          });
          if (els.drawSaved) els.drawSaved.textContent = "已儲存";
          return;
        }
        const distinct = pointsFarEnough(draft.p1, draft.p2);
        if (moved && distinct) {
          commitDrawing({
            id: newDrawingId(),
            type: draft.type,
            time1: draft.p1.time,
            price1: draft.p1.price,
            time2: draft.p2.time,
            price2: draft.p2.price,
          });
          return;
        }
        if (draft.clicks > 0 && distinct) {
          commitDrawing({
            id: newDrawingId(),
            type: draft.type,
            time1: draft.p1.time,
            price1: draft.p1.price,
            time2: draft.p2.time,
            price2: draft.p2.price,
          });
          return;
        }
        draft.phase = "await";
        draft.clicks += 1;
        draft.p2 = draft.p1;
        refreshDrawings();
        if (els.drawSaved) els.drawSaved.textContent = "再點一下完成";
        syncInteraction();
        return;
      }
      finishMeasure(event);
    };

    function finishMeasure(event) {
      if (!state.measuring) return;
      const start = state.measureStart;
      const point = (event && getPointFromEvent(event)) || (measurePrimitive && measurePrimitive._p2);
      const moved = !!(event && start && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 8);
      state.measuring = false;
      state.measureStart = null;
      if (measurePrimitive) measurePrimitive.clear();
      if (moved && start && point && pointsFarEnough(start, point) && state.currentPath) {
        commitDrawing({
          id: newDrawingId(),
          type: "measure",
          time1: start.time,
          price1: start.price,
          time2: point.time,
          price2: point.price,
        });
        return;
      }
      syncInteraction();
    }
    paneEl.addEventListener("pointerup", endPointer);
    paneEl.addEventListener("pointercancel", (event) => {
      if (state.draft && state.draft.phase === "drag") {
        cancelDraft();
        if (els.drawSaved) els.drawSaved.textContent = "";
        syncInteraction();
        return;
      }
      endPointer(event);
    });
  }

  function clearSeries() {
    candleSeries.setData([]);
    volumeSeries.setData([]);
    Object.values(maSeries).forEach((s) => s.setData([]));
    measurePrimitive.clear();
    notesPrimitive.setNotes([], null);
    state.drawings = [];
    state.selectedDrawingId = null;
    state.draft = null;
    refreshDrawings();
    renderDrawList();
    state.bars = [];
    state.overlays = null;
    setLegend(null, { ema10: "—", ema20: "—", sma50: "—", sma200: "—" });
  }

  async function loadCase(index, fromNavEnd) {
    hideNoteEditor();
    clearMeasure();
    cancelDraft();
    state.selectedNoteId = null;
    state.selectedDrawingId = null;
    state.drawings = [];
    refreshDrawings();
    renderDrawList();

    if (index < 0 || index >= state.filtered.length) {
      if (fromNavEnd) {
        setStatus(index < 0 ? "已是第一題。" : "已是最後一題。", "info");
      }
      updateNav();
      return;
    }

    state.index = index;
    updateNav();
    const item = state.filtered[index];
    state.currentPath = item.path;
    setStatus(`載入 ${item.label}…`);

    let text;
    try {
      const res = await fetch(`stock_data/${encodeURI(item.path)}`, { cache: "no-store" });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error((errJson && errJson.error) || `讀取失敗（${res.status}）`);
      }
      text = await res.text();
    } catch (err) {
      clearSeries();
      setStatus(`${item.label}：${err.message || "讀取失敗。"}`, "error");
      return;
    }

    const parsed = CB.parsePriceCsv(text);
    if (parsed.error) {
      clearSeries();
      setStatus(`${item.label}：${parsed.error}`, "error");
      return;
    }

    state.bars = parsed.bars;
    state.overlays = CB.computeOverlays(parsed.bars);
    state.notes = loadNotes(item.path);
    state.drawings = loadDrawings(item.path);
    state.selectedDrawingId = null;
    if (els.drawSaved) els.drawSaved.textContent = state.drawings.length ? "已儲存" : "";

    candleSeries.setData(
      parsed.bars.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );
    volumeSeries.setData(
      parsed.bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? "rgba(38, 166, 154, 0.55)" : "rgba(239, 83, 80, 0.55)",
      }))
    );
    maSeries.ema10.setData(state.overlays.series.ema10);
    maSeries.ema20.setData(state.overlays.series.ema20);
    maSeries.sma50.setData(state.overlays.series.sma50);
    maSeries.sma200.setData(state.overlays.series.sma200);
    measurePrimitive.setBars(parsed.bars);
    refreshNotesPrimitive();
    refreshDrawings();
    renderDrawList();
    chart.timeScale().fitContent();
    layoutPanes();

    const bits = [];
    if (parsed.warnings.length) bits.push(parsed.warnings.join(" "));
    bits.push(maHint(parsed.bars.length));
    const volMissing = parsed.bars.every((b) => b.volume === 0);
    if (volMissing) bits.push("此檔沒有成交量，或成交量皆為 0。");
    setStatus(`${item.label}　${bits.join(" ")}`);
  }

  function maHint(count) {
    if (count < 50) return `共 ${count} 根；SMA 50／200 資料不足會隱藏。`;
    if (count < 200) return `共 ${count} 根；SMA 200 需 200 根才會顯示。`;
    return `共 ${count} 根。`;
  }

  function commitNote() {
    const pending = state.pendingNote;
    if (!pending || !state.currentPath) {
      hideNoteEditor();
      return;
    }
    const text = els.noteInput.value.trim().slice(0, 80);
    if (pending.mode === "edit") {
      if (!text) {
        state.notes = state.notes.filter((n) => n.id !== pending.note.id);
      } else {
        pending.note.text = text;
      }
      state.selectedNoteId = text ? pending.note.id : null;
    } else if (text) {
      const note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: pending.point.time,
        price: pending.point.price,
        text,
      };
      state.notes = state.notes.concat(note);
      state.selectedNoteId = note.id;
    }
    saveNotes(state.currentPath, state.notes);
    refreshNotesPrimitive();
    hideNoteEditor();
  }

  function deleteSelectedNote() {
    if (!state.selectedNoteId || !state.currentPath) return;
    state.notes = state.notes.filter((n) => n.id !== state.selectedNoteId);
    state.selectedNoteId = null;
    saveNotes(state.currentPath, state.notes);
    refreshNotesPrimitive();
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  function goPrev() {
    if (state.index <= 0) {
      setStatus("已是第一題。", "info");
      return;
    }
    loadCase(state.index - 1);
  }

  function goNext() {
    if (state.index >= state.filtered.length - 1) {
      setStatus("已是最後一題。", "info");
      return;
    }
    loadCase(state.index + 1);
  }

  function onKeyDown(event) {
    if (event.key === "Shift") {
      state.shiftHeld = true;
      syncInteraction();
    }

    if (els.noteEditor.classList.contains("visible")) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitNote();
      } else if (event.key === "Escape") {
        event.preventDefault();
        hideNoteEditor();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    if (event.key === "Escape") {
      event.preventDefault();
      if (state.draft) {
        cancelDraft();
        if (els.drawSaved) els.drawSaved.textContent = state.drawings.length ? "已儲存" : "";
        syncInteraction();
        return;
      }
      if (isFallbackFullscreen()) exitFullscreen();
      hideNoteEditor();
      clearMeasure();
      state.tool = "none";
      state.selectedNoteId = null;
      state.selectedDrawingId = null;
      refreshNotesPrimitive();
      refreshDrawings();
      renderDrawList();
      if (els.drawSaved) els.drawSaved.textContent = state.drawings.length ? "已儲存" : "";
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && state.selectedDrawingId) {
      event.preventDefault();
      deleteDrawing(state.selectedDrawingId);
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && state.selectedNoteId) {
      event.preventDefault();
      deleteSelectedNote();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
  }

  function onKeyUp(event) {
    if (event.key === "Shift") {
      state.shiftHeld = false;
      if (!state.measuring && state.tool !== "measure") {
        syncInteraction();
      }
    }
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isFallbackFullscreen() {
    return els.stage.classList.contains("is-fs-fallback");
  }

  function isChartFullscreen() {
    return fullscreenElement() === els.stage || isFallbackFullscreen();
  }

  function syncFullscreenButton() {
    const on = isChartFullscreen();
    const embedded = document.documentElement.classList.contains("is-embed");
    els.fullscreenBtn.textContent = on ? "結束全螢幕" : "全螢幕";
    els.fullscreenBtn.classList.toggle("active", on);
    els.fullscreenBtn.title = on ? (embedded ? "結束全螢幕" : "回到文章") : "放大圖表";
    requestAnimationFrame(() => resizeChart());
    setTimeout(() => resizeChart(), 60);
  }

  function enterFallbackFullscreen() {
    els.stage.classList.add("is-fs-fallback");
    document.body.classList.add("fs-lock");
    syncFullscreenButton();
  }

  function exitFullscreen() {
    const current = fullscreenElement();
    if (current) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) Promise.resolve(exit.call(document)).catch(() => {});
    }
    els.stage.classList.remove("is-fs-fallback");
    document.body.classList.remove("fs-lock");
    syncFullscreenButton();
  }

  function enterFullscreen() {
    const req = els.stage.requestFullscreen || els.stage.webkitRequestFullscreen;
    if (!req) {
      enterFallbackFullscreen();
      return;
    }
    Promise.resolve(req.call(els.stage)).catch(() => enterFallbackFullscreen());
  }

  function toggleFullscreen() {
    if (isChartFullscreen()) exitFullscreen();
    else enterFullscreen();
  }

  function setChartTool(next) {
    hideNoteEditor();
    clearMeasure();
    cancelDraft();
    state.selectedNoteId = null;
    refreshNotesPrimitive();
    state.tool = state.tool === next ? "none" : next;
    if (els.drawSaved) {
      if (state.tool === "hline") els.drawSaved.textContent = "點一個價位";
      else if (state.tool === "trend" || state.tool === "rect") els.drawSaved.textContent = "拖拉或再點一下";
      else if (state.tool === "measure") els.drawSaved.textContent = "拖拉兩點";
      else els.drawSaved.textContent = state.drawings.length ? "已儲存" : "";
    }
    syncInteraction();
  }

  function bindUi() {
    els.yearFilter.addEventListener("change", () => {
      populateCases();
      if (state.filtered.length) loadCase(state.index >= 0 ? state.index : 0);
      else {
        clearSeries();
        setStatus("這個年份沒有案例。", "error");
        updateNav();
      }
    });

    els.caseSelect.addEventListener("change", () => {
      const idx = state.filtered.findIndex((c) => c.path === els.caseSelect.value);
      if (idx >= 0) loadCase(idx);
    });

    els.prevBtn.addEventListener("click", goPrev);
    els.nextBtn.addEventListener("click", goNext);

    els.measureBtn.addEventListener("click", () => setChartTool("measure"));
    els.textBtn.addEventListener("click", () => setChartTool("text"));
    els.trendBtn.addEventListener("click", () => setChartTool("trend"));
    els.hlineBtn.addEventListener("click", () => setChartTool("hline"));
    els.rectBtn.addEventListener("click", () => setChartTool("rect"));
    els.deleteDrawBtn.addEventListener("click", () => {
      if (state.selectedDrawingId) deleteDrawing(state.selectedDrawingId);
      else setStatus("先點選一條畫線。", "info");
    });
    els.saveDrawBtn.addEventListener("click", () => {
      if (persistDrawings()) setStatus("已儲存這個案例的畫線與測量。", "info");
    });
    els.clearDrawBtn.addEventListener("click", () => {
      if (!state.currentPath || !state.drawings.length) return;
      state.drawings = [];
      state.selectedDrawingId = null;
      state.draft = null;
      persistDrawings();
      if (els.drawSaved) els.drawSaved.textContent = "已清除";
      refreshDrawings();
      renderDrawList();
      setStatus("已清除這個案例的畫線與測量。", "info");
    });
    els.fullscreenBtn.addEventListener("click", toggleFullscreen);
    if (els.downloadImageBtn) {
      els.downloadImageBtn.addEventListener("click", downloadChartImage);
    }
    document.addEventListener("fullscreenchange", syncFullscreenButton);
    document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

    els.noteInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitNote();
      } else if (event.key === "Escape") {
        event.preventDefault();
        hideNoteEditor();
      }
    });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => {
      state.shiftHeld = false;
      if (!state.measuring) syncInteraction();
    });

    new ResizeObserver(() => resizeChart()).observe(els.chart);
  }

  async function boot() {
    if (!LC || !CB) {
      els.bootError.textContent = "無法載入圖表程式庫。請確認 vendor 資料夾完整，並以 GitHub Pages 或本機靜態網站開啟。";
      els.bootError.classList.add("visible");
      return;
    }

    bindUi();
    createChart();
    resizeChart();
    syncInteraction();

    let payload;
    try {
      const res = await fetch("cases.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`cases.json HTTP ${res.status}`);
      payload = await res.json();
    } catch (err) {
      setStatus("無法載入案例清單（cases.json）。請用 GitHub Pages 或本機靜態伺服器開啟，不要直接雙擊 HTML。", "error");
      return;
    }

    state.allCases = payload.cases || [];
    populateYears();
    populateCases();

    if (!state.filtered.length) {
      setStatus(payload.error || "找不到價格 CSV。請確認 stock_data\\西元年份\\*.csv 是否存在。", "error");
      return;
    }
    if (payload.error) setStatus(payload.error, "error");
    await loadCase(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
