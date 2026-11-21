(function (global) {
  const ChartBrowser = global.ChartBrowser || (global.ChartBrowser = {});

  const HEADER_ALIASES = {
    date: "date",
    open: "open",
    high: "high",
    low: "low",
    close: "close",
    volume: "volume",
    vol: "volume",
    "adj close": "adjClose",
    adj_close: "adjClose",
    adjclose: "adjClose",
    "adjusted close": "adjClose",
  };

  function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function normalizeHeader(name) {
    return String(name || "")
      .replace(/^\ufeff/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function parseNumber(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s || s === "-" || s === "." || /^n\/?a$/i.test(s)) return null;
    s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeDate(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!m) return null;
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    const iso = `${y}-${mo}-${d}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.toISOString().slice(0, 10) !== iso) return null;
    return iso;
  }

  /**
   * Parse a price CSV. Returns { bars, warnings, error }.
   * bars: [{ time, open, high, low, close, volume }]
   */
  function parsePriceCsv(text) {
    const warnings = [];
    if (text == null || !String(text).trim()) {
      return { bars: [], warnings, error: "檔案是空的。" };
    }

    const lines = stripBom(String(text))
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      return { bars: [], warnings, error: "沒有有效的股價列。" };
    }

    const headerCells = splitCsvLine(lines[0]).map(normalizeHeader);
    const index = {};
    headerCells.forEach((name, i) => {
      const key = HEADER_ALIASES[name];
      if (key && index[key] == null) index[key] = i;
    });

    if (index.date == null) {
      return { bars: [], warnings, error: "找不到 Date 欄。" };
    }

    const hasClose = index.close != null;
    const hasAdj = index.adjClose != null;
    if (!hasClose && !hasAdj) {
      return { bars: [], warnings, error: "找不到 Close 欄。" };
    }
    if (!hasClose && hasAdj) {
      warnings.push("沒有 Close，已改用 Adj Close 畫圖。");
    }

    const byTime = new Map();
    let skipped = 0;

    for (let r = 1; r < lines.length; r += 1) {
      const cells = splitCsvLine(lines[r]);
      const time = normalizeDate(cells[index.date]);
      if (!time) {
        skipped += 1;
        continue;
      }

      let close = hasClose ? parseNumber(cells[index.close]) : null;
      if (close == null && hasAdj) close = parseNumber(cells[index.adjClose]);
      if (close == null || close <= 0) {
        skipped += 1;
        continue;
      }

      let open = index.open != null ? parseNumber(cells[index.open]) : close;
      let high = index.high != null ? parseNumber(cells[index.high]) : close;
      let low = index.low != null ? parseNumber(cells[index.low]) : close;
      if (open == null || open <= 0) open = close;
      if (high == null || high <= 0) high = Math.max(open, close);
      if (low == null || low <= 0) low = Math.min(open, close);
      high = Math.max(high, open, close, low);
      low = Math.min(low, open, close, high);

      let volume = index.volume != null ? parseNumber(cells[index.volume]) : 0;
      if (volume == null || volume < 0) volume = 0;

      byTime.set(time, { time, open, high, low, close, volume });
    }

    const bars = Array.from(byTime.values()).sort((a, b) => (a.time < b.time ? -1 : 1));
    if (skipped) {
      warnings.push(`已略過 ${skipped} 列無法解析的資料。`);
    }
    if (!bars.length) {
      return { bars, warnings, error: "沒有有效的股價列。" };
    }
    return { bars, warnings, error: null };
  }

  ChartBrowser.parsePriceCsv = parsePriceCsv;
  ChartBrowser.normalizeDate = normalizeDate;
})(window);
