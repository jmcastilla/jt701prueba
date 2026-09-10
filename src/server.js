require('dotenv').config();
const net = require('net');
const pool = require('./db/pool');
const { parseBinaryPacket } = require('./protocol/binary');
const { parseP45 } = require('./protocol/p45');
const repo = require('./services/repository');
const ota = require('./services/ota');

const HOST = process.env.TCP_HOST || '0.0.0.0';
const PORT = Number(process.env.TCP_PORT || 11000);
const TIMEOUT = Number(process.env.SOCKET_TIMEOUT_MS || 300000);
const LOG_RAW = String(process.env.LOG_RAW || 'true').toLowerCase() === 'true';

function looksAscii(buffer) {
  const s = buffer.toString('ascii');
  return s.includes('P43') || s.includes('P45') || s.startsWith('(');
}

async function processAscii(socket, text) {
  const messages = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (const msg of messages) {
    console.log(`[ASCII] ${msg}`);

    if (msg.includes('P45')) {
      const data = parseP45(msg);
      if (!data) continue;
      await repo.saveLockData(data);
      socket.write(`(P69,0,${data.serialnumber})\r\n`);
      console.log(`[P45] guardado ${data.deviceID}; ACK P69 serial ${data.serialnumber}`);
      await ota.sendPendingOta(socket, data.deviceID);
      continue;
    }

    if (msg.includes('P43')) {
      const clean = msg.replace(/[()\r\n]/g, '');
      const p = clean.split(',').map(x => x.trim());
      const deviceID = p[0] === 'P43' ? p[1] : p[0];
      if (deviceID) {
        await ota.ackP43(deviceID);
        await ota.sendPendingOta(socket, deviceID);
      }
    }
  }
}

async function processBinary(socket, buffer) {
  const d = parseBinaryPacket(buffer);
  await repo.saveMainData(d);
  socket.write(`(P69,0,${d.serialnumber})\r\n`);
  console.log(`[BIN] ${d.deviceID} ${d.latitude},${d.longitude} vel=${d.speed} serial=${d.serialnumber}`);
  await ota.sendPendingOta(socket, d.deviceID);
}

const server = net.createServer(socket => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`\n*******************************\n** NUEVA CONEXION ${remote} **\n*******************************`);
  socket.setTimeout(TIMEOUT);
  socket.setKeepAlive(true, 30000);

  socket.on('data', async buffer => {
    try {
      if (LOG_RAW) console.log(`[RAW ${remote}] ${buffer.toString('hex').toUpperCase()}`);
      if (looksAscii(buffer)) {
        await processAscii(socket, buffer.toString('ascii'));
      } else if (buffer[0] === 0x24) {
        await processBinary(socket, buffer);
      } else {
        console.warn(`[WARN] trama desconocida de ${remote}`);
      }
    } catch (err) {
      console.error(`[ERROR ${remote}]`, err.message);
    }
  });

  socket.on('timeout', () => {
    console.log(`[TIMEOUT] ${remote}`);
    socket.destroy();
  });
  socket.on('close', () => console.log(`[CLOSE] ${remote}`));
  socket.on('error', err => console.error(`[SOCKET ${remote}]`, err.message));
});

async function boot() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  server.listen(PORT, HOST, () => console.log(`JT701 listener activo en ${HOST}:${PORT}`));
}

boot().catch(err => {
  console.error('No se pudo iniciar:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  server.close();
  await pool.end();
  process.exit(0);
});
