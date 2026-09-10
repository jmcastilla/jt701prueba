function hex(buffer) {
  return Buffer.from(buffer).toString('hex').toUpperCase();
}

function mysqlDateTimeFromDdMmYy(ddmmyy, hhmmss) {
  if (!/^\d{6}$/.test(ddmmyy) || !/^\d{6}$/.test(hhmmss)) return null;
  const dd = ddmmyy.slice(0, 2);
  const mm = ddmmyy.slice(2, 4);
  const yy = ddmmyy.slice(4, 6);
  const hh = hhmmss.slice(0, 2);
  const mi = hhmmss.slice(2, 4);
  const ss = hhmmss.slice(4, 6);
  return `20${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function bcdHex(buffer) {
  return hex(buffer);
}

module.exports = { hex, mysqlDateTimeFromDdMmYy, bcdHex };
