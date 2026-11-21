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

  const els = {
    yearFilter: document.getElementById("year-filter"),
    caseSelect: document.getElementById("case-select"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    counter: document.getElementById("counter"),
    measureBtn: document.getElementById("measure-btn"),
    textBtn: document.getElementById("text-btn"),
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
    tool: "none", // none | measure | text
    shiftHeld: false,
    measuring: false,
    measureStart: null,
    notes: [],
    selectedNoteId: null,
    pendingNote: null,
    panEnabled: true,
  };

  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let maSeries = {};
  let measurePrimitive = null;
  let notesPrimitive = null;

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

  function updateNav() {
    const n = state.filtered.length;
    const has = n > 0 && state.index >= 0;
    els.prevBtn.disabled = !has || state.index <= 0;
    els.nextBtn.disabled = !has || state.index >= n - 1;
    els.counter.textContent = has ? `${state.index + 1} / ${n}` : `0 / ${n}`;
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
        vertTouchDrag: enabled,
      },
    });
  }

  function measureActive() {
    return state.tool === "measure" || state.shiftHeld;
  }

  function syncInteraction() {
    setPanEnabled(!measureActive() && !state.measuring);
    if (chart) {
      chart.applyOptions({
        crosshair: {
          mode: measureActive()
            ? LC.CrosshairMode.Normal
            : LC.CrosshairMode.Magnet,
        },
      });
    }
    els.measureBtn.classList.toggle("active", state.tool === "measure");
    els.textBtn.classList.toggle("active", state.tool === "text");
    els.wrap.style.cursor = state.tool === "text"
      ? "text"
      : measureActive()
        ? "crosshair"
        : "";
  }

  function clearMeasure() {
    state.measuring = false;
    state.measureStart = null;
    if (measurePrimitive) measurePrimitive.clear();
  }

  function hideNoteEditor() {
    state.pendingNote = null;
    els.noteEditor.classList.remove("visible");
    els.noteInput.value = "";
  }

  function showNoteEditor(clientX, clientY, existing) {
    const rect = els.wrap.getBoundingClientRect();
    let left = clientX - rect.left;
    let top = clientY - rect.top;
    left = Math.max(8, Math.min(left, rect.width - 260));
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
    candleSeries.attachPrimitive(measurePrimitive);
    candleSeries.attachPrimitive(notesPrimitive);

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
      }
    });

    paneEl.addEventListener("pointermove", (event) => {
      if (!state.measuring || !state.measureStart) return;
      const point = getPointFromEvent(event);
      if (!point) return;
      measurePrimitive.setPoints(state.measureStart, point);
    });

    const endMeasureDrag = (event) => {
      if (!state.measuring) return;
      const point = getPointFromEvent(event) || measurePrimitive._p2;
      if (state.measureStart && point) {
        measurePrimitive.setPoints(state.measureStart, point);
      }
      state.measuring = false;
      state.measureStart = null;
      syncInteraction();
    };
    paneEl.addEventListener("pointerup", endMeasureDrag);
    paneEl.addEventListener("pointercancel", endMeasureDrag);
  }

  function clearSeries() {
    candleSeries.setData([]);
    volumeSeries.setData([]);
    Object.values(maSeries).forEach((s) => s.setData([]));
    measurePrimitive.clear();
    notesPrimitive.setNotes([], null);
    state.bars = [];
    state.overlays = null;
    setLegend(null, { ema10: "—", ema20: "—", sma50: "—", sma200: "—" });
  }

  async function loadCase(index, fromNavEnd) {
    hideNoteEditor();
    clearMeasure();
    state.selectedNoteId = null;

    if (index < 0 || index >= state.filtered.length) {
      if (fromNavEnd) {
        setStatus(index < 0 ? "已是第一張。" : "已是最後一張。", "info");
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
      setStatus("已是第一張。", "info");
      return;
    }
    loadCase(state.index - 1);
  }

  function goNext() {
    if (state.index >= state.filtered.length - 1) {
      setStatus("已是最後一張。", "info");
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
      hideNoteEditor();
      clearMeasure();
      state.tool = "none";
      state.selectedNoteId = null;
      refreshNotesPrimitive();
      syncInteraction();
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

    els.measureBtn.addEventListener("click", () => {
      hideNoteEditor();
      if (state.tool === "measure") {
        state.tool = "none";
        clearMeasure();
      } else {
        state.tool = "measure";
        state.selectedNoteId = null;
        refreshNotesPrimitive();
      }
      syncInteraction();
    });

    els.textBtn.addEventListener("click", () => {
      if (state.tool === "text") {
        state.tool = "none";
        hideNoteEditor();
      } else {
        state.tool = "text";
        clearMeasure();
      }
      syncInteraction();
    });

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
