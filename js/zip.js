(function (global) {
  const ChartBrowser = global.ChartBrowser || (global.ChartBrowser = {});

  // STORE-method ZIP. PNG bytes are already compressed, so this stays small
  // and does not pull in a deflate library.
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosStamp(date) {
    const d = date || new Date();
    const time = ((d.getHours() & 31) << 11)
      | ((d.getMinutes() & 63) << 5)
      | (Math.floor(d.getSeconds() / 2) & 31);
    const year = Math.max(0, d.getFullYear() - 1980);
    const day = ((year & 127) << 9)
      | (((d.getMonth() + 1) & 15) << 5)
      | (d.getDate() & 31);
    return { time, day };
  }

  function storeZip(files) {
    const list = Array.isArray(files) ? files : [];
    const encoder = new TextEncoder();
    const now = dosStamp(new Date());
    const locals = [];
    const centrals = [];
    let offset = 0;

    list.forEach((file) => {
      const nameBytes = encoder.encode(String((file && file.name) || "chart.png"));
      const raw = file && file.data;
      const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw || []);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, now.time, true);
      view.setUint16(12, now.day, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, now.time, true);
      centralView.setUint16(14, now.day, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      central.set(nameBytes, 46);

      locals.push(local);
      centrals.push(central);
      offset += local.length;
    });

    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, list.length, true);
    endView.setUint16(10, list.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    const out = new Uint8Array(offset + centralSize + end.length);
    let cursor = 0;
    locals.forEach((part) => {
      out.set(part, cursor);
      cursor += part.length;
    });
    centrals.forEach((part) => {
      out.set(part, cursor);
      cursor += part.length;
    });
    out.set(end, cursor);
    return out;
  }

  ChartBrowser.storeZip = storeZip;
})(typeof window !== "undefined" ? window : globalThis);
