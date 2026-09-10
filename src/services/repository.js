const pool = require('../db/pool');

const MAIN_FIELDS = [
  'deviceID','protocolVersion','deviceType','dataType','dateTime','latitude','longitude',
  'locationIndicator','speed','direction','mileage','satquality','deviceStatus','lbsStatus',
  'entergeofenceAlarm','exitgeofenceAlarm','steelcutAlarm','vibrationAlarm','tobeconfirmed',
  'steelstringStatus','motorlockStatus','unlockingAlarm','wrongpassAlarm','unauthorizedRFIDAlarm',
  'lowBattAlarm','openBackCapAlarm','backCapStatus','motorFaultAlarm','reserved','battery',
  'cellID','gsmquality','rawData'
];

async function saveMainData(d) {
  const fields = MAIN_FIELDS.filter(f => d[f] !== undefined);
  const sql = `INSERT INTO maindata (${fields.map(f => `\`${f}\``).join(',')}, insertDateTime)
               VALUES (${fields.map(() => '?').join(',')}, NOW())`;
  await pool.execute(sql, fields.map(f => d[f]));
}

async function saveLockData(d) {
  const sql = `INSERT INTO lockdata
    (deviceID,dateTime,latitude,longitude,speed,course,eventsource,unlockstatus,idcard,passwordstatus,passwordverify,serialnumber,rawData,insertDateTime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`;
  await pool.execute(sql, [
    d.deviceID,d.dateTime,d.latitude,d.longitude,d.speed,d.course,d.eventsource,d.unlockstatus,
    d.idcard,d.passwordstatus,d.passwordverify,d.serialnumber,d.rawData
  ]);
}

async function getPendingOta(deviceID) {
  const [rows] = await pool.execute(
    "SELECT lockotaID, otaCommand FROM lockota WHERE deviceID=? AND otaStatus='a' ORDER BY lockotaID LIMIT 1",
    [deviceID]
  );
  return rows[0] || null;
}

async function markOtaSent(lockotaID) {
  await pool.execute("UPDATE lockota SET dateTimeSent=NOW(), otaStatus='s' WHERE lockotaID=?", [lockotaID]);
}

async function markOtaAck(lockotaID) {
  await pool.execute("UPDATE lockota SET dateTimeAck=NOW(), otaStatus='c' WHERE lockotaID=?", [lockotaID]);
}

module.exports = { saveMainData, saveLockData, getPendingOta, markOtaSent, markOtaAck };
