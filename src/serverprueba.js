require('dotenv').config();

const net = require('net');
const fs = require('fs');
const path = require('path');

const { parseBinaryPacket } = require('./protocol/binary');
const { parseP45 } = require('./protocol/p45');
const { FrameAccumulator } = require('./protocol/framer');

const HOST = process.env.TCP_HOST || '0.0.0.0';
const PORT = Number(process.env.TCP_PORT || 11000);
const TIMEOUT = Number(process.env.SOCKET_TIMEOUT_MS || 300000);
// Longitud fija de la trama binaria (1 byte 0x24 + 61 de payload). Se puede
// sobreescribir con BINARY_FRAME_LEN si un firmware usara otro tamano.
const BINARY_FRAME_LEN = Number(process.env.BINARY_FRAME_LEN || 62);

const LOG_DIR = path.join(__dirname, '../logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Fecha local para logs
 */
function now() {
  return new Date().toISOString();
}

/**
 * Nombre de archivo diario:
 * raw-2026-09-10.log
 */
function getLogFile(prefix) {
  const date = new Date().toISOString().substring(0, 10);
  return path.join(LOG_DIR, `${prefix}-${date}.log`);
}

/**
 * Guarda texto en archivo
 */
function writeLog(prefix, text) {
  const file = getLogFile(prefix);

  fs.appendFile(
    file,
    text + '\n',
    err => {
      if (err) {
        console.error('Error escribiendo log:', err.message);
      }
    }
  );
}

/**
 * Log simple por device: logs/motorlockstatus-<deviceID>-YYYY-MM-DD.log
 * Cada linea -> fecha | cadena | valor de motorlockStatus
 */
function logMotorlock(buffer) {
  try {
    let cadena;
    let deviceID = 'desconocido';
    let motorlockStatus = 'N/A';
    if (buffer[0] === 0x24) {
      cadena = buffer.toString('hex').toUpperCase();
      try {
        const d = parseBinaryPacket(buffer);
        deviceID = d.deviceID;
        motorlockStatus = d.motorlockStatus;
      } catch (e) {}
    } else {
      cadena = buffer.toString('ascii').trim();
      const p = cadena.replace(/[()\r\n]/g, '').trim().split(',').map(x => x.trim());
      deviceID = (p[0] === 'P45' || p[0] === 'P43' || p[0] === 'P69') ? p[1] : p[0];
    }
    const safe = String(deviceID || 'desconocido').replace(/[^A-Za-z0-9_-]/g, '') || 'desconocido';
    writeLog(`motorlockstatus-${safe}`, `${now()} | ${cadena} | motorlockStatus=${motorlockStatus}`);
  } catch (err) {
    console.error('[LOG motorlock]', err.message);
  }
}

/**
 * Convierte caracteres no imprimibles a punto
 * para poder visualizar mejor el contenido.
 */
function printableAscii(buffer) {
  return Array.from(buffer)
    .map(byte => {
      if (byte >= 32 && byte <= 126) {
        return String.fromCharCode(byte);
      }

      return '.';
    })
    .join('');
}

// Nota: la deteccion de protocolo por heuristica de texto (looksAscii) se
// reemplazo por el reensamblador (framer): el tipo lo decide el primer byte
// de cada trama completa (0x24 = binaria, 0x28 '(' = ASCII).

/**
 * Imprime un bloque completo con toda
 * la información recibida.
 */
function logRawPacket(remote, buffer) {

  const hex = buffer.toString('hex').toUpperCase();
  const ascii = printableAscii(buffer);

  const header = `
============================================================
FECHA      : ${now()}
REMOTE     : ${remote}
BYTES      : ${buffer.length}
HEX        : ${hex}
ASCII      : ${ascii}
============================================================
`;

  console.log(header);

  writeLog('raw', header);
}

/**
 * Procesa mensajes ASCII
 */
async function processAscii(socket, buffer, remote) {

  const text = buffer.toString('ascii');

  console.log('\n[ASCII RAW]');
  console.log(text);

  writeLog(
    'ascii',
    `
------------------------------------------------------------
${now()}
REMOTE: ${remote}

${text}
------------------------------------------------------------
`
  );

  const messages = text
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  for (const msg of messages) {

    console.log('\n[ASCII MESSAGE]');
    console.log(msg);

    /**
     * P45
     */
    if (msg.includes('P45')) {

      try {

        const data = parseP45(msg);

        console.log('\n[P45 PARSEADO]');

        if (data) {

          console.dir(data, {
            depth: null,
            colors: true
          });

          writeLog(
            'parsed',
            JSON.stringify({
              timestamp: now(),
              remote,
              protocol: 'P45',
              raw: msg,
              parsed: data
            }, null, 2)
          );

        } else {

          console.warn('[P45] No se pudo interpretar');

          writeLog(
            'errors',
            `${now()} | ${remote} | P45 NO INTERPRETADO | ${msg}`
          );
        }

      } catch (err) {

        console.error('[P45 ERROR]', err);

        writeLog(
          'errors',
          `${now()} | ${remote} | ${err.stack}`
        );
      }

      continue;
    }

    /**
     * P43
     */
    if (msg.includes('P43')) {

      const clean = msg.replace(/[()\r\n]/g, '');

      const parts = clean
        .split(',')
        .map(x => x.trim());

      console.log('\n[P43 PARTES]');

      parts.forEach((value, index) => {
        console.log(`[${index}] = ${value}`);
      });

      writeLog(
        'parsed',
        JSON.stringify({
          timestamp: now(),
          remote,
          protocol: 'P43',
          raw: msg,
          parts
        }, null, 2)
      );

      continue;
    }

    /**
     * Otro ASCII desconocido
     */

    console.log('\n[ASCII DESCONOCIDO]');
    console.log(msg);

    writeLog(
      'unknown',
      `${now()} | ${remote} | ASCII | ${msg}`
    );
  }
}

/**
 * Procesa trama binaria
 */
async function processBinary(socket, buffer, remote) {

  console.log('\n[BINARIO DETECTADO]');

  try {

    const data = parseBinaryPacket(buffer);

    console.log('\n[BINARIO PARSEADO]');

    console.dir(data, {
      depth: null,
      colors: true
    });

    writeLog(
      'parsed',
      JSON.stringify({
        timestamp: now(),
        remote,
        protocol: 'BINARY',
        bytes: buffer.length,
        hex: buffer.toString('hex').toUpperCase(),
        parsed: data
      }, null, 2)
    );

  } catch (err) {

    console.error('\n[ERROR PARSEANDO BINARIO]');
    console.error(err);

    writeLog(
      'errors',
      `
${now()}
REMOTE: ${remote}
HEX: ${buffer.toString('hex').toUpperCase()}
ERROR:
${err.stack}
`
    );
  }
}

/**
 * Respuesta al equipo, replicando el bytecode del listener Java:
 *   - Trama binaria 0x24  -> (P69,0,<ultimo byte del paquete>)\r\n
 *   - Trama ASCII  P45    -> (P69,0,<campo 16 = serialnumber>)\r\n
 *   - Trama ASCII  P43    -> no responde nada
 *   - Otro                -> no responde nada
 * Devuelve el string a escribir en el socket, o null si no hay que responder.
 */
function buildAck(frame) {
  try {
    if (frame.type === 'binary') {
      const serial = frame.buffer[frame.buffer.length - 1];
      return `(P69,0,${serial})\r\n`;
    }

    const text = frame.text || frame.buffer.toString('ascii');
    if (text.includes('P45')) {
      const parts = text.replace(/[()\r\n]/g, '').split(',').map(x => x.trim());
      const serial = parts.length >= 17 ? parts[16] : '0';
      return `(P69,0,${serial})\r\n`;
    }

    return null; // P43 y demas: el Java no contesta
  } catch (e) {
    return null;
  }
}

/**
 * Servidor TCP
 */
const server = net.createServer(socket => {

  const acc = new FrameAccumulator(BINARY_FRAME_LEN);

  const remote =
    `${socket.remoteAddress}:${socket.remotePort}`;

  const connectionInfo = `
************************************************************
NUEVA CONEXION
FECHA  : ${now()}
REMOTE : ${remote}
************************************************************
`;

  console.log(connectionInfo);

  writeLog(
    'connections',
    connectionInfo
  );

  socket.setTimeout(TIMEOUT);

  socket.setKeepAlive(
    true,
    30000
  );

  /**
   * Cada vez que llegan bytes
   */
  socket.on('data', async buffer => {

    try {

      console.log('\n\n');
      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      console.log('NUEVO BLOQUE TCP RECIBIDO');
      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');

      /**
       * Primero guardamos SIEMPRE
       * lo que llegó crudo.
       */
      logRawPacket(
        remote,
        buffer
      );

      /**
       * Mostramos cada byte individualmente (del chunk crudo).
       */
      console.log('\n[BYTES INDIVIDUALES]');

      buffer.forEach(
        (byte, index) => {

          const hex =
            byte
              .toString(16)
              .padStart(2, '0')
              .toUpperCase();

          const ascii =
            byte >= 32 && byte <= 126
              ? String.fromCharCode(byte)
              : '.';

          console.log(
            `${index.toString().padStart(4, '0')} | DEC=${byte.toString().padStart(3)} | HEX=${hex} | ASCII=${ascii}`
          );
        }
      );

      /**
       * Reensamblamos: el chunk TCP puede traer media trama o varias pegadas.
       * acc.push() devuelve solo las tramas COMPLETAS.
       */
      const frames = acc.push(buffer);

      if (frames.length === 0) {
        console.log('\n[FRAMER] Aun no hay trama completa, esperando mas bytes');
        writeLog('framer', `${now()} | ${remote} | parcial, sin trama completa | +${buffer.length}B`);
      }

      for (const frame of frames) {

        console.log(`\n[FRAMER] trama completa: ${frame.type} (${frame.buffer.length} bytes)`);
        writeLog('framer', `${now()} | ${remote} | ${frame.type} | ${frame.buffer.toString('hex').toUpperCase()}`);

        logMotorlock(frame.buffer);

        if (frame.type === 'ascii') {
          console.log('\nTIPO DETECTADO: ASCII');
          await processAscii(socket, frame.buffer, remote);
        } else {
          console.log('\nTIPO DETECTADO: BINARIO JT701');
          await processBinary(socket, frame.buffer, remote);
        }

        /**
         * Respuesta al equipo, igual que el Java. serverprueba NO toca la BD,
         * pero si contesta para que el dispositivo deje de reenviar la trama.
         */
        const ack = buildAck(frame);
        if (ack) {
          socket.write(ack);
          console.log(`[ACK -> ${remote}] ${ack.trim()}`);
          writeLog('ack', `${now()} | ${remote} | ${frame.type} | ${ack.trim()}`);
        } else {
          console.log(`[ACK -> ${remote}] (sin respuesta, igual que el Java)`);
          writeLog('ack', `${now()} | ${remote} | ${frame.type} | (sin respuesta)`);
        }
      }

    } catch (err) {

      console.error(
        `[ERROR ${remote}]`,
        err
      );

      writeLog(
        'errors',
        `
${now()}
REMOTE: ${remote}

${err.stack}
`
      );
    }
  });

  /**
   * Timeout
   */
  socket.on(
    'timeout',
    () => {

      console.log(
        `[TIMEOUT] ${remote}`
      );

      writeLog(
        'connections',
        `${now()} | TIMEOUT | ${remote}`
      );

      socket.destroy();
    }
  );

  /**
   * Cierre
   */
  socket.on(
    'close',
    hadError => {

      console.log(
        `[CLOSE] ${remote} error=${hadError}`
      );

      writeLog(
        'connections',
        `${now()} | CLOSE | ${remote} | error=${hadError}`
      );
    }
  );

  /**
   * Error socket
   */
  socket.on(
    'error',
    err => {

      console.error(
        `[SOCKET ${remote}]`,
        err.message
      );

      writeLog(
        'errors',
        `${now()} | SOCKET | ${remote} | ${err.stack}`
      );
    }
  );
});

/**
 * Inicio
 */
server.listen(
  PORT,
  HOST,
  () => {

    console.log(`
============================================================
JT701 LISTENER MODO DIAGNOSTICO
============================================================

HOST : ${HOST}
PORT : ${PORT}

MYSQL              : DESACTIVADO
GUARDADO DE DATOS  : SOLO LOGS

Directorio logs:
${LOG_DIR}

============================================================
`);
  }
);

/**
 * Cierre limpio
 */
process.on(
  'SIGINT',
  () => {

    console.log('\nCerrando listener...');

    server.close(
      () => {
        process.exit(0);
      }
    );
  }
);