'use strict';

// Reensamblador de tramas para el flujo TCP del JT701.
//
// El listener Java (commServer11000D$ConnectionHandler) leia con
// DataInputStream.readFully() campo por campo: eso BLOQUEA hasta tener los bytes
// exactos, asi que nunca ve media trama ni dos tramas pegadas. Node entrega los
// chunks TCP tal cual llegan, por lo que hay que acumular y cortar las tramas.
//
// Reglas (del bytecode):
//   primer byte 0x24 '$'  -> trama binaria de longitud fija (binaryFrameLen)
//   primer byte 0x28 '('  -> trama ASCII: desde '(' hasta el primer ')'
//   cualquier otro byte    -> relleno (p.ej. el \r\n final); se descarta

const BINARY_START = 0x24; // $
const ASCII_OPEN = 0x28;   // (
const ASCII_CLOSE = 0x29;  // )

const DEFAULT_BINARY_FRAME_LEN = 62; // 1 (0x24) + 61 de payload fijo
const MAX_PENDING = 16 * 1024;       // corta ASCII sin cierre / basura infinita

class FrameAccumulator {
  constructor(binaryFrameLen = DEFAULT_BINARY_FRAME_LEN) {
    this.binaryFrameLen = binaryFrameLen;
    this.buf = Buffer.alloc(0);
  }

  // Agrega un chunk y devuelve las tramas completas disponibles.
  // Cada trama: { type: 'binary' | 'ascii', buffer: Buffer, text: string|null }
  push(chunk) {
    this.buf = this.buf.length
      ? Buffer.concat([this.buf, chunk])
      : Buffer.from(chunk);

    const frames = [];

    while (this.buf.length > 0) {
      const b0 = this.buf[0];

      if (b0 === BINARY_START) {
        if (this.buf.length < this.binaryFrameLen) break; // falta cola, esperar
        const raw = Buffer.from(this.buf.subarray(0, this.binaryFrameLen));
        frames.push({ type: 'binary', buffer: raw, text: null });
        this.buf = this.buf.subarray(this.binaryFrameLen);
        continue;
      }

      if (b0 === ASCII_OPEN) {
        const end = this.buf.indexOf(ASCII_CLOSE);
        if (end === -1) {
          if (this.buf.length > MAX_PENDING) this.buf = Buffer.alloc(0);
          break; // falta el ')'
        }
        const raw = Buffer.from(this.buf.subarray(0, end + 1));
        frames.push({ type: 'ascii', buffer: raw, text: raw.toString('ascii') });
        this.buf = this.buf.subarray(end + 1);
        continue;
      }

      // byte de relleno / desconocido: descartar uno y seguir buscando inicio
      this.buf = this.buf.subarray(1);
    }

    // copiar el remanente a un buffer propio para soltar el grande
    this.buf = this.buf.length ? Buffer.from(this.buf) : Buffer.alloc(0);
    return frames;
  }
}

module.exports = { FrameAccumulator, DEFAULT_BINARY_FRAME_LEN };
