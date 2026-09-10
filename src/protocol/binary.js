const { hex, mysqlDateTimeFromDdMmYy } = require('../utils/format');

class Cursor {
  constructor(buffer) { this.b = buffer; this.o = 0; }
  need(n) { if (this.o + n > this.b.length) throw new Error(`Trama incompleta: faltan ${this.o + n - this.b.length} bytes`); }
  bytes(n) { this.need(n); const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
  u8() { return this.bytes(1)[0]; }
  u16be() { this.need(2); const v = this.b.readUInt16BE(this.o); this.o += 2; return v; }
}

function dmToDecimalLat(h) {
  const deg = Number(h.slice(0, 2));
  const min = Number(`${h.slice(2, 4)}.${h.slice(4, 8)}`);
  return deg + min / 60;
}
function dmToDecimalLon(h) {
  const deg = Number(h.slice(0, 3));
  const min = Number(`${h.slice(3, 5)}.${h.slice(5, 9)}`);
  return deg + min / 60;
}

function parseStatus(statusHex) {
  const bits = parseInt(statusHex, 16).toString(2).padStart(16, '0');
  const names = [
    'reserved','motorFaultAlarm','backCapStatus','openBackCapAlarm',
    'lowBattAlarm','unauthorizedRFIDAlarm','wrongpassAlarm','unlockingAlarm',
    'motorlockStatus','steelstringStatus','tobeconfirmed','vibrationAlarm',
    'steelcutAlarm','exitgeofenceAlarm','entergeofenceAlarm','lbsStatus'
  ];
  return Object.fromEntries(names.map((n, i) => [n, bits[i]]));
}

function parseBinaryPacket(buffer) {
  const c = new Cursor(buffer);
  if (c.u8() !== 0x24) throw new Error('La trama binaria no inicia con 0x24');

  const deviceID = hex(c.bytes(5));
  const protocolVersion = c.u8();
  const deviceAndDataType = c.u8();
  const dataLength = c.u16be();
  const dateHex = hex(c.bytes(3));
  const timeHex = hex(c.bytes(3));
  const latHex = hex(c.bytes(4));
  const lonWithIndicatorHex = hex(c.bytes(5));

  let latitude = dmToDecimalLat(latHex);
  let longitude = dmToDecimalLon(lonWithIndicatorHex.slice(0, 9));
  const locationIndicator = lonWithIndicatorHex.slice(9, 10);

  // El Java extrae dos bits de este nibble para aplicar signo.
  const liBits = parseInt(locationIndicator, 16).toString(2).padStart(4, '0');
  if (liBits[1] === '0') longitude *= -1;
  if (liBits[2] === '0') latitude *= -1;

  const speed = c.u8();
  const direction = c.u8();
  const mileageBytes = c.bytes(4);
  const mileage = mileageBytes.readUInt32BE(0);
  const satquality = c.u8();
  const vehicleID = hex(c.bytes(4));
  const deviceStatusHex = hex(c.bytes(2));
  const status = parseStatus(deviceStatusHex);
  const battery = c.u8();
  const cellIDLac = hex(c.bytes(4));
  const gsmquality = c.u8();
  const geofenceAlarm = c.u8();
  const expandedStatus = c.u8();
  const reserve = hex(c.bytes(2));
  const reserve2 = hex(c.bytes(8));
  const cellID = hex(c.bytes(2));
  const mcc = hex(c.bytes(2));
  const mnc = hex(c.bytes(1));
  const serialnumber = c.u8();

  return {
    deviceID,
    protocolVersion: protocolVersion.toString(16),
    deviceType: deviceAndDataType.toString(16),
    dataType: deviceAndDataType.toString(16),
    dataLength,
    dateTime: mysqlDateTimeFromDdMmYy(dateHex, timeHex),
    latitude,
    longitude,
    locationIndicator,
    speed,
    direction,
    mileage,
    satquality,
    deviceStatus: deviceStatusHex,
    ...status,
    battery,
    cellID,
    gsmquality,
    vehicleID,
    cellIDLac,
    geofenceAlarm,
    expandedStatus,
    reserve2,
    mcc,
    mnc,
    serialnumber,
    rawData: hex(buffer),
    bytesConsumed: c.o,
    reserve,
  };
}

module.exports = { parseBinaryPacket };
