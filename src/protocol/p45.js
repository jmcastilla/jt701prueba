const { mysqlDateTimeFromDdMmYy } = require('../utils/format');

function parseP45(text) {
  const clean = text.replace(/[()\r\n]/g, '').trim();
  const p = clean.split(',').map(v => v.trim());
  if (!clean.includes('P45') || p.length < 17) return null;

  // El JAR toma p[0] como deviceID aunque contiene el encabezado completo.
  // Para compatibilidad practica aceptamos formatos DEVICE,P45,... y P45,DEVICE,...
  let deviceID;
  let base;
  if (p[0] === 'P45') {
    deviceID = p[1];
    base = 1;
  } else if (p[1] === 'P45') {
    deviceID = p[0];
    base = 0;
  } else {
    deviceID = p[0];
    base = 0;
  }

  const dayMonthYear = p[base + 2];
  const hourMinuteSecond = p[base + 3];
  let latitude = Number(p[base + 4]);
  const latIndicator = p[base + 5];
  let longitude = Number(p[base + 6]);
  const longIndicator = p[base + 7];

  if (String(latIndicator).toUpperCase() === 'S') latitude *= -1;
  if (String(longIndicator).toUpperCase() === 'W') longitude *= -1;

  return {
    deviceID,
    dateTime: mysqlDateTimeFromDdMmYy(dayMonthYear, hourMinuteSecond),
    latitude,
    longitude,
    gpsStatus: p[base + 8],
    speed: p[base + 9],
    course: p[base + 10],
    eventsource: p[base + 11],
    unlockstatus: p[base + 12],
    idcard: p[base + 13],
    passwordstatus: p[base + 14],
    passwordverify: p[base + 15],
    serialnumber: p[base + 16],
    rawData: text.trim(),
  };
}

module.exports = { parseP45 };
