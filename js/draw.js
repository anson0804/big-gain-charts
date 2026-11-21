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

  function paintMeasure(ctx, x1, y1, x2, y2, p1, p2, bars, mediaSize, selected) {
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
    ctx.lineWidth = selected ? 2 : 1;
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

    [[x1, y1], [x2, y2]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, selected ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${color})`;
      ctx.fill();
      ctx.lineWidth = selected ? 2 : 1.5;
      ctx.strokeStyle = selected ? "#f5d76e" : "#0b0e13";
      ctx.stroke();
    });

    const stats = measureStats(p1, p2, bars);
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
    const maxX = mediaSize.width;
    const maxY = mediaSize.height;
    lx = Math.max(4, Math.min(lx, maxX - boxW - 4));
    ly = Math.max(4, Math.min(ly, maxY - boxH - 4));

    roundedRect(ctx, lx, ly, boxW, boxH, 4);
    ctx.fillStyle = "rgba(11, 14, 19, 0.88)";
    ctx.fill();
    ctx.strokeStyle = selected ? "#f5d76e" : `rgba(${color}, 0.85)`;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = up ? "#26a69a" : "#ef5350";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      if (i === 2) ctx.fillStyle = "#d7dde8";
      ctx.fillText(line, lx + padX, ly + padY + i * lineH);
    });
    ctx.restore();
    return { x: lx, y: ly, w: boxW, h: boxH };
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
        const x1 = timeToX(chart, p1.time, this._bars);
        const x2 = timeToX(chart, p2.time, this._bars);
        const y1 = series.priceToCoordinate(p1.price);
        const y2 = series.priceToCoordinate(p2.price);
        if (x1 == null || x2 == null || y1 == null || y2 == null) return;
        paintMeasure(ctx, x1, y1, x2, y2, p1, p2, this._bars, scope.mediaSize, false);
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

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = x1 + t * dx;
    const y = y1 + t * dy;
    return Math.hypot(px - x, py - y);
  }

  function timeToX(chart, time, bars) {
    if (!chart || time == null) return null;
    const scale = chart.timeScale();
    const direct = scale.timeToCoordinate(time);
    if (direct != null) return direct;
    if (!bars || typeof scale.logicalToCoordinate !== "function") return null;
    const key = normalizeTime(time);
    for (let i = 0; i < bars.length; i += 1) {
      if (bars[i].time === key) return scale.logicalToCoordinate(i);
    }
    return null;
  }

  function drawingColor(type, selected) {
    if (selected) return { stroke: "#f5d76e", fill: "rgba(245, 215, 110, 0.16)" };
    if (type === "hline") return { stroke: "#ff7ab8", fill: "rgba(255, 122, 184, 0.16)" };
    if (type === "rect") return { stroke: "#d2ff6b", fill: "rgba(210, 255, 107, 0.12)" };
    return { stroke: "#7fdbff", fill: "rgba(127, 219, 255, 0.14)" };
  }

  class DrawingsPrimitive {
    constructor() {
      this._items = [];
      this._selectedId = null;
      this._draft = null;
      this._bars = [];
      this._hits = [];
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

    setModel(items, selectedId, draft) {
      this._items = items || [];
      this._selectedId = selectedId || null;
      this._draft = draft || null;
      if (this._requestUpdate) this._requestUpdate();
    }

    paneViews() {
      return [this._view];
    }

    updateAllViews() {}

    hitTest(x, y) {
      const tol = 8;
      for (let i = this._hits.length - 1; i >= 0; i -= 1) {
        const hit = this._hits[i];
        let matched = false;
        if (hit.kind === "hline") {
          matched = Math.abs(y - hit.y) <= tol;
        } else if (hit.kind === "trend") {
          matched = distToSegment(x, y, hit.x1, hit.y1, hit.x2, hit.y2) <= tol;
        } else if (hit.kind === "rect") {
          const left = Math.min(hit.x1, hit.x2) - tol;
          const right = Math.max(hit.x1, hit.x2) + tol;
          const top = Math.min(hit.y1, hit.y2) - tol;
          const bottom = Math.max(hit.y1, hit.y2) + tol;
          const inside = x >= left && x <= right && y >= top && y <= bottom;
          const nearEdge = [
            distToSegment(x, y, hit.x1, hit.y1, hit.x2, hit.y1),
            distToSegment(x, y, hit.x2, hit.y1, hit.x2, hit.y2),
            distToSegment(x, y, hit.x2, hit.y2, hit.x1, hit.y2),
            distToSegment(x, y, hit.x1, hit.y2, hit.x1, hit.y1),
          ].some((d) => d <= tol);
          matched = inside || nearEdge;
        } else if (hit.kind === "measure") {
          const nearPoint = Math.hypot(x - hit.x1, y - hit.y1) <= tol
            || Math.hypot(x - hit.x2, y - hit.y2) <= tol;
          const nearLine = [
            distToSegment(x, y, hit.x1, hit.y1, hit.x2, hit.y2),
            distToSegment(x, y, hit.x1, hit.y1, hit.x2, hit.y1),
            distToSegment(x, y, hit.x2, hit.y1, hit.x2, hit.y2),
          ].some((d) => d <= tol);
          const label = hit.label;
          const inLabel = !!(label
            && x >= label.x && x <= label.x + label.w
            && y >= label.y && y <= label.y + label.h);
          matched = nearPoint || nearLine || inLabel;
        }
        if (matched) {
          return {
            externalId: hit.id,
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

    _project(item) {
      const chart = this._chart;
      const series = this._series;
      if (!chart || !series) return null;
      if (item.type === "hline") {
        const y = series.priceToCoordinate(item.price);
        if (y == null) return null;
        return { kind: "hline", y };
      }
      const x1 = timeToX(chart, item.time1, this._bars);
      const x2 = timeToX(chart, item.time2, this._bars);
      const y1 = series.priceToCoordinate(item.price1);
      const y2 = series.priceToCoordinate(item.price2);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      return { kind: item.type, x1, y1, x2, y2 };
    }

    draw(target) {
      const chart = this._chart;
      const series = this._series;
      this._hits = [];
      if (!chart || !series) return;

      const shapes = this._items.map((item) => ({
        item,
        geom: this._project(item),
        selected: item.id === this._selectedId,
        draft: false,
      }));
      if (this._draft) {
        shapes.push({
          item: this._draft,
          geom: this._project(this._draft),
          selected: true,
          draft: true,
        });
      }

      target.useMediaCoordinateSpace((scope) => {
        const ctx = scope.context;
        const width = scope.mediaSize.width;
        ctx.save();
        ctx.font = "12px Segoe UI, Microsoft JhengHei, sans-serif";
        shapes.forEach((shape) => {
          const geom = shape.geom;
          if (!geom) return;
          const color = drawingColor(shape.item.type, shape.selected);
          ctx.save();
          ctx.lineWidth = shape.selected ? 2 : 1.5;
          ctx.strokeStyle = color.stroke;
          ctx.fillStyle = color.fill;
          if (shape.draft) ctx.setLineDash([5, 4]);

          if (geom.kind === "hline") {
            ctx.beginPath();
            ctx.moveTo(0, geom.y);
            ctx.lineTo(width, geom.y);
            ctx.stroke();
            const label = formatPrice(shape.item.price);
            const padX = 6;
            const boxW = ctx.measureText(label).width + padX * 2;
            const boxH = 18;
            const lx = 8;
            const ly = Math.max(4, Math.min(geom.y - boxH - 4, scope.mediaSize.height - boxH - 4));
            roundedRect(ctx, lx, ly, boxW, boxH, 3);
            ctx.fillStyle = "rgba(11, 14, 19, 0.9)";
            ctx.fill();
            ctx.strokeStyle = color.stroke;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.stroke();
            ctx.fillStyle = color.stroke;
            ctx.textBaseline = "middle";
            ctx.fillText(label, lx + padX, ly + boxH / 2);
            if (!shape.draft && shape.item.id) {
              this._hits.push({ id: shape.item.id, kind: "hline", y: geom.y, width });
            }
          } else if (geom.kind === "trend") {
            ctx.beginPath();
            ctx.moveTo(geom.x1, geom.y1);
            ctx.lineTo(geom.x2, geom.y2);
            ctx.stroke();
            [[geom.x1, geom.y1], [geom.x2, geom.y2]].forEach(([x, y]) => {
              ctx.beginPath();
              ctx.arc(x, y, shape.selected ? 4 : 3, 0, Math.PI * 2);
              ctx.fillStyle = color.stroke;
              ctx.fill();
            });
            if (!shape.draft && shape.item.id) {
              this._hits.push({
                id: shape.item.id,
                kind: "trend",
                x1: geom.x1,
                y1: geom.y1,
                x2: geom.x2,
                y2: geom.y2,
              });
            }
          } else if (geom.kind === "rect") {
            const left = Math.min(geom.x1, geom.x2);
            const top = Math.min(geom.y1, geom.y2);
            const w = Math.abs(geom.x2 - geom.x1);
            const h = Math.abs(geom.y2 - geom.y1);
            if (w > 0 && h > 0) ctx.fillRect(left, top, w, h);
            ctx.strokeRect(left, top, Math.max(w, 1), Math.max(h, 1));
            if (!shape.draft && shape.item.id) {
              this._hits.push({
                id: shape.item.id,
                kind: "rect",
                x1: geom.x1,
                y1: geom.y1,
                x2: geom.x2,
                y2: geom.y2,
              });
            }
          } else if (geom.kind === "measure") {
            const box = paintMeasure(
              ctx,
              geom.x1,
              geom.y1,
              geom.x2,
              geom.y2,
              { time: shape.item.time1, price: shape.item.price1 },
              { time: shape.item.time2, price: shape.item.price2 },
              this._bars,
              scope.mediaSize,
              shape.selected
            );
            if (!shape.draft && shape.item.id) {
              this._hits.push({
                id: shape.item.id,
                kind: "measure",
                x1: geom.x1,
                y1: geom.y1,
                x2: geom.x2,
                y2: geom.y2,
                label: box,
              });
            }
          }
          ctx.restore();
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
  ChartBrowser.DrawingsPrimitive = DrawingsPrimitive;
})(window);
