(function (global) {
  const ChartBrowser = global.ChartBrowser || (global.ChartBrowser = {});

  function sma(closes, period) {
    const out = new Array(closes.length).fill(null);
    if (period <= 0 || closes.length < period) return out;
    let sum = 0;
    for (let i = 0; i < closes.length; i += 1) {
      sum += closes[i];
      if (i >= period) sum -= closes[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(closes, period) {
    const out = new Array(closes.length).fill(null);
    if (period <= 0 || closes.length < period) return out;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i += 1) sum += closes[i];
    let prev = sum / period;
    out[period - 1] = prev;
    for (let i = period; i < closes.length; i += 1) {
      prev = closes[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function toLineData(bars, values) {
    const data = [];
    for (let i = 0; i < bars.length; i += 1) {
      if (values[i] != null && Number.isFinite(values[i])) {
        data.push({ time: bars[i].time, value: values[i] });
      }
    }
    return data;
  }

  function computeOverlays(bars) {
    const closes = bars.map((b) => b.close);
    const ema10 = ema(closes, 10);
    const ema20 = ema(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    return {
      values: { ema10, ema20, sma50, sma200 },
      series: {
        ema10: toLineData(bars, ema10),
        ema20: toLineData(bars, ema20),
        sma50: toLineData(bars, sma50),
        sma200: toLineData(bars, sma200),
      },
    };
  }

  ChartBrowser.computeOverlays = computeOverlays;
})(window);
