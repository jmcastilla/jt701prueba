const repo = require('./repository');

async function sendPendingOta(socket, deviceID) {
  const ota = await repo.getPendingOta(deviceID);
  if (!ota) return;
  const command = String(ota.otaCommand || '').trim();
  if (!command) return;
  socket.write(command.endsWith('\r\n') ? command : `${command}\r\n`);
  await repo.markOtaSent(ota.lockotaID);
  console.log(`[OTA] enviado a ${deviceID}: ${command}`);
}

async function ackP43(deviceID) {
  const ota = await repo.getPendingOta(deviceID);
  if (ota) await repo.markOtaAck(ota.lockotaID);
}

module.exports = { sendPendingOta, ackP43 };
