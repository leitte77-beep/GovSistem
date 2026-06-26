import { Readable, Writable } from 'stream';

let _fluent = null;
let _ffmpegPath = null;
let _availability = null;

async function _loadDeps() {
  if (_availability !== null) return;
  try {
    const fluent = (await import('fluent-ffmpeg')).default;
    const ffmpegStatic = await import('ffmpeg-static');
    const path = ffmpegStatic.default || ffmpegStatic;
    if (!path) throw new Error('ffmpeg-static sem binário');
    _fluent = fluent;
    _ffmpegPath = path;
    _fluent.setFfmpegPath(path);
    _availability = { ok: true, path };
  } catch (err) {
    _availability = { ok: false, err: err.message };
  }
}

export async function isAudioTranscoderAvailable() {
  await _loadDeps();
  return _availability?.ok === true;
}

export async function getTranscoderInfo() {
  await _loadDeps();
  return _availability || { ok: false };
}

// Formatos de áudio que o iOS reproduz nativamente como anexo comum. OGG/Opus
// NÃO entra aqui de propósito: o iOS só decodifica Opus dentro da "nota de voz"
// (ptt), não como arquivo de áudio — por isso convertemos para MP3.
const FORMATOS_AUDIO_IOS = new Set(['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/x-m4a']);

export function precisaTranscodificar(mimetype) {
  const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();
  return mime.startsWith('audio/') && !FORMATOS_AUDIO_IOS.has(mime);
}

export async function transcodeToOggOpus(buffer, mimeEntrada) {
  await _loadDeps();
  if (!_availability?.ok) {
    throw new Error(`ffmpeg indisponível: ${_availability?.err || 'desconhecido'}`);
  }

  return new Promise((resolve, reject) => {
    const input = Readable.from(buffer);
    const chunks = [];
    let stderrBuf = '';

    const cmd = _fluent(input)
      .inputFormat(_detectInputFormat(mimeEntrada))
      .noVideo()
      .audioCodec('libopus')
      .audioBitrate('32k')
      .audioChannels(1)
      .audioFrequency(48000)
      .outputOptions([
        '-f', 'ogg',
        '-application', 'voip',
      ])
      .on('error', (err) => {
        reject(new Error(`ffmpeg transcode falhou: ${err.message}`));
      })
      .on('stderr', (line) => { stderrBuf += line + '\n'; })
      .on('end', () => {
        if (chunks.length === 0) {
          reject(new Error('ffmpeg transcode não produziu output. stderr: ' + stderrBuf.slice(-800)));
          return;
        }
        resolve({ buffer: Buffer.concat(chunks), mime: 'audio/ogg' });
      });

    const ffstream = new Writable({
      write(chunk, encoding, cb) { chunks.push(chunk); cb(); },
    });
    cmd.pipe(ffstream, { end: true });
  });
}

// Converte qualquer áudio (ex.: webm/opus gravado no navegador) para MP3, que o
// iOS/Android reproduzem nativamente como anexo de áudio comum. Mono/96k é
// suficiente para voz e mantém o arquivo pequeno.
export async function transcodeToMp3(buffer, mimeEntrada) {
  await _loadDeps();
  if (!_availability?.ok) {
    throw new Error(`ffmpeg indisponível: ${_availability?.err || 'desconhecido'}`);
  }

  return new Promise((resolve, reject) => {
    const input = Readable.from(buffer);
    const chunks = [];
    let stderrBuf = '';

    const cmd = _fluent(input)
      .inputFormat(_detectInputFormat(mimeEntrada))
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .audioChannels(1)
      .audioFrequency(44100)
      .outputOptions(['-f', 'mp3'])
      .on('error', (err) => {
        reject(new Error(`ffmpeg transcode falhou: ${err.message}`));
      })
      .on('stderr', (line) => { stderrBuf += line + '\n'; })
      .on('end', () => {
        if (chunks.length === 0) {
          reject(new Error('ffmpeg transcode não produziu output. stderr: ' + stderrBuf.slice(-800)));
          return;
        }
        resolve({ buffer: Buffer.concat(chunks), mime: 'audio/mpeg' });
      });

    const ffstream = new Writable({
      write(chunk, encoding, cb) { chunks.push(chunk); cb(); },
    });
    cmd.pipe(ffstream, { end: true });
  });
}

function _detectInputFormat(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp4') || m.includes('m4a')) return 'mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  return null;
}
