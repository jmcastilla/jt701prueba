# JT701 Node Listener

Migracion a Node.js de la logica observada en `JT701NEW.jar` (`commServer11000D`).

## Incluye

- Listener TCP puerto 11000.
- Pool MySQL equivalente al HikariCP del Java.
- Recepcion de trama binaria iniciada en `0x24`.
- Device ID de 5 bytes.
- Parsing de fecha/hora, latitud, longitud, velocidad, direccion, kilometraje, estado, bateria, GSM, Cell ID y serial.
- `INSERT INTO maindata`.
- Procesamiento ASCII `P45` y `INSERT INTO lockdata`.
- Respuesta `(P69,0,serial)`.
- Lectura de comandos pendientes desde `lockota`.
- Cambio de `otaStatus` al enviar/confirmar.

## Instalacion

```bash
npm install
cp .env.example .env
```

Edita `.env` con tu MySQL y ejecuta:

```bash
npm start
```

Para exponerlo en un servidor con IP publica, no se escribe la IP publica en Node. Deja:

```env
TCP_HOST=0.0.0.0
TCP_PORT=11000
```

y abre TCP/11000 en firewall/security group.

## Importante sobre la migracion

El JAR no contiene el fuente Java original. Este proyecto fue reconstruido desde bytecode (`javap`). La estructura, tablas, campos y respuestas principales salen del JAR. Antes de sustituir produccion, comparar una o mas tramas reales contra el listener Java para validar los bits de `locationIndicator` y los limites exactos de cada paquete TCP.

Node TCP puede recibir media trama o varias tramas en un mismo evento `data`. El proyecto actual reproduce el comportamiento del Java de forma directa. Si los dispositivos fragmentan paquetes, el siguiente ajuste recomendado es incorporar un acumulador/framer basado en `dataLength`.
