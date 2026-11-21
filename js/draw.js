(function (global) {
  const ChartBrowser = global.ChartBrowser || (global.ChartBrowser = {});

  function normalizeTime(time) {
    if (time == null) return null;
    if (typeof time === "string") return ChartBrowser.normalizeDate(time) || time;
    if (typeof time === "number") {
      const ms = time < 1e12 ? time * 1000 : time;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    }
    if (typeof time === "object" && time.year != null) {
      const y = String(time.year);
      const m = String(time.month).padStart(2, "0");
      const d = String(time.day).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  function formatPrice(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    const a = Math.abs(value);
    if (a >= 1000) return value.toFixed(2);
    if (a >= 1) return value.toFixed(2);
    if (a >= 0.01) return value.toFixed(4);
    return value.toPrecision(4);
  }

  function formatVolume(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    const a = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(2)}K`;
    return String(Math.round(value));
  }

  function formatPct(pct) {
    if (pct == null || !Number.isFinite(pct)) return "—";
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct.toFixed(2)}%`;
  }

  function formatDelta(delta) {
    if (delta == null || !Number.isFinite(delta)) return "—";
    const sign = delta > 0 ? "+" : "";
    return `${sign}${formatPrice(delta)}`;
  }

  function measureStats(p1, p2, bars) {
    const start = p1.price;
    const end = p2.price;
    const delta = end - start;
    const pct = start !== 0 ? (delta / start) * 100 : null;
    let barsBetween = null;
    if (bars && bars.length) {
      const t1 = normalizeTime(p1.time);
      const t2 = normalizeTime(p2.time);
      let i1 = -1;
      let i2 = -1;
      for (let i = 0; i < bars.length; i += 1) {
        if (bars[i].time === t1) i1 = i;
        if (bars[i].time === t2) i2 = i;
      }
      if (i1 >= 0 && i2 >= 0) barsBetween = Math.abs(i2 - i1);
    }
    return { start, end, delta, pct, barsBetween };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  class OverlayView {
    constructor(owner) {
      this._owner = owner;
    }
    zOrder() {
      return "top";
    }
    renderer() {
      return this._owner;
    }
  }

  class MeasurePrimitive {
    constructor() {
      this._p1 = null;
      this._p2 = null;
      this._bars = [];
      this._chart = null;
      this._series = null;
      this._requestUpdate = null;
      this._view = new OverlayView(this);
    }

    attached(param) {
      this._chart = param.chart;
      this._series = param.series;
      this._requestUpdate = param.requestUpdate;
    }

    detached() {
      this._chart = null;
      this._series = null;
      this._requestUpdate = null;
    }

    setBars(bars) {
      this._bars = bars || [];
    }

    setPoints(p1, p2) {
      this._p1 = p1;
      this._p2 = p2;
      if (this._requestUpdate) this._requestUpdate();
    }

    clear() {
      this.setPoints(null, null);
    }

    hasPoints() {
      return !!(this._p1 && this._p2);
    }

    paneViews() {
      return [this._view];
    }

    updateAllViews() {}

    draw(target) {
      const p1 = this._p1;
      const p2 = this._p2;
      const chart = this._chart;
      const series = this._series;
      if (!p1 || !p2 || !chart || !series) return;

      target.useMediaCoordinateSpace((scope) => {
        const ctx = scope.context;
        const x1 = chart.timeScale().timeToCoordinate(p1.time);
        const x2 = chart.timeScale().timeToCoordinate(p2.time);
        const y1 = series.priceToCoordinate(p1.price);
        const y2 = series.priceToCoordinate(p2.price);
        if (x1 == null || x2 == null || y1 == null || y2 == null) return;

        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const up = p2.price >= p1.price;
        const color = up ? "38, 166, 154" : "239, 83, 80";

        ctx.save();
        ctx.fillStyle = `rgba(${color}, 0.12)`;
        if (width > 1 && height > 1) {
          ctx.fillRect(left, top, width, height);
        }

        ctx.strokeStyle = `rgba(${color}, 0.9)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        [ [x1, y1], [x2, y2] ].forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${color})`;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#0b0e13";
          ctx.stroke();
        });

        const stats = measureStats(p1, p2, this._bars);
        const lines = [formatPct(stats.pct), formatDelta(stats.delta)];
        if (stats.barsBetween != null) {
          lines.push(`${stats.barsBetween} 根`);
        }

        ctx.font = "12px Segoe UI, Microsoft JhengHei, sans-serif";
        const padX = 8;
        const padY = 5;
        const lineH = 16;
        const textW = Math.max(...lines.map((t) => ctx.measureText(t).width));
        const boxW = textW + padX * 2;
        const boxH = lines.length * lineH + padY * 2;
        let lx = (x1 + x2) / 2 - boxW / 2;
        let ly = (y1 + y2) / 2 - boxH / 2;
        const maxX = scope.mediaSize.width;
        const maxY = scope.mediaSize.height;
        lx = Math.max(4, Math.min(lx, maxX - boxW - 4));
        ly = Math.max(4, Math.min(ly, maxY - boxH - 4));

        roundedRect(ctx, lx, ly, boxW, boxH, 4);
        ctx.fillStyle = "rgba(11, 14, 19, 0.88)";
        ctx.fill();
        ctx.strokeStyle = `rgba(${color}, 0.85)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = up ? "#26a69a" : "#ef5350";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
          if (i === 2) ctx.fillStyle = "#d7dde8";
          ctx.fillText(line, lx + padX, ly + padY + i * lineH);
        });
        ctx.restore();
      });
    }
  }

  class NotesPrimitive {
    constructor() {
      this._notes = [];
      this._selectedId = null;
      this._boxes = [];
      this._chart = null;
      this._series = null;
      this._requestUpdate = null;
      this._view = new OverlayView(this);
    }

    attached(param) {
      this._chart = param.chart;
      this._series = param.series;
      this._requestUpdate = param.requestUpdate;
    }

    detached() {
      this._chart = null;
      this._series = null;
      this._requestUpdate = null;
    }

    setNotes(notes, selectedId) {
      this._notes = notes || [];
      this._selectedId = selectedId || null;
      if (this._requestUpdate) this._requestUpdate();
    }

    paneViews() {
      return [this._view];
    }

    updateAllViews() {}

    hitTest(x, y) {
      for (let i = this._boxes.length - 1; i >= 0; i -= 1) {
        const box = this._boxes[i];
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
          return {
            externalId: box.id,
            zOrder: "top",
            cursorStyle: "pointer",
            itemType: "primitive",
            distance: 0,
            hitTestPriority: 2,
          };
        }
      }
      return null;
    }

    draw(target) {
      const chart = this._chart;
      const series = this._series;
      this._boxes = [];
      if (!chart || !series || !this._notes.length) return;

      target.useMediaCoordinateSpace((scope) => {
        const ctx = scope.context;
        ctx.save();
        ctx.font = "12px Segoe UI, Microsoft JhengHei, sans-serif";
        this._notes.forEach((note) => {
          const x = chart.timeScale().timeToCoordinate(note.time);
          const y = series.priceToCoordinate(note.price);
          if (x == null || y == null) return;
          const text = String(note.text || "");
          const padX = 6;
          const padY = 4;
          const textW = ctx.measureText(text).width;
          const boxW = Math.max(18, textW + padX * 2);
          const boxH = 20;
          let lx = x + 8;
          let ly = y - boxH - 8;
          if (lx + boxW > scope.mediaSize.width - 4) lx = x - boxW - 8;
          if (ly < 4) ly = y + 8;
          const selected = note.id === this._selectedId;

          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = selected ? "#3d8bfd" : "#d7dde8";
          ctx.fill();

          roundedRect(ctx, lx, ly, boxW, boxH, 3);
          ctx.fillStyle = selected ? "rgba(61, 139, 253, 0.22)" : "rgba(20, 25, 34, 0.9)";
          ctx.fill();
          ctx.strokeStyle = selected ? "#3d8bfd" : "#4a5568";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = "#e8edf7";
          ctx.textBaseline = "middle";
          ctx.fillText(text, lx + padX, ly + boxH / 2);

          this._boxes.push({ id: note.id, x: lx, y: ly, w: boxW, h: boxH });
        });
        ctx.restore();
      });
    }
  }

  ChartBrowser.normalizeTime = normalizeTime;
  ChartBrowser.formatPrice = formatPrice;
  ChartBrowser.formatVolume = formatVolume;
  ChartBrowser.formatPct = formatPct;
  ChartBrowser.formatDelta = formatDelta;
  ChartBrowser.MeasurePrimitive = MeasurePrimitive;
  ChartBrowser.NotesPrimitive = NotesPrimitive;
})(window);
