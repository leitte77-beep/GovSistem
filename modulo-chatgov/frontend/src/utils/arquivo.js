export function formatoArquivo(mime) {
  if (!mime) return 'Arquivo';
  if (mime.startsWith('image/')) return 'Imagem';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('word') || mime.includes('document')) return 'Documento';
  if (mime.includes('sheet') || mime.includes('excel')) return 'Planilha';
  return 'Arquivo';
}

export function iconeArquivo(mime) {
  if (!mime) return '\uD83D\uDCC4';
  if (mime.startsWith('image/')) return '\uD83D\uDDBC\uFE0F';
  if (mime.startsWith('video/')) return '\uD83C\uDFAC';
  if (mime.startsWith('audio/')) return '\uD83C\uDFB5';
  if (mime.includes('pdf')) return '\uD83D\uDCC4';
  return '\uD83D\uDCC1';
}

export function nomeArquivoDaUrl(url) {
  if (!url) return 'arquivo';
  try {
    const parts = url.split('/');
    const last = parts[parts.length - 1];
    const decoded = decodeURIComponent(last.split('?')[0]);
    return decoded.length > 40 ? decoded.slice(0, 37) + '...' : decoded;
  } catch { return 'arquivo'; }
}

export function mimeParaTipo(mime) {
  if (!mime) return 'documento';
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'documento';
}

export function encodeFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => reject(new Error('Timeout')), 30000);
    reader.onload = () => { clearTimeout(timer); resolve(reader.result); };
    reader.onerror = () => { clearTimeout(timer); reject(reader.error); };
    reader.readAsDataURL(file);
  });
}

export function formatarHora(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function formatarDataHora(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    if (mesmoDia) return formatarHora(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + formatarHora(ts);
  } catch { return ''; }
}

// Hora relativa para listas: "14:32" hoje, "Ontem", dia da semana, ou data curta.
export function formatarHoraRelativa(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (dias <= 0 && d.toDateString() === new Date().toDateString()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    if (dias === 1) return 'Ontem';
    if (dias < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return ''; }
}

export function agruparMensagens(mensagens) {
  const grupos = [];
  let atual = null;
  for (const m of mensagens) {
    const isMe = m._isMe;
    const autor = m.remetente_id;
    if (atual && atual.autorId === autor && !atual.excluida && !m.excluida) {
      atual.msgs.push(m);
    } else {
      atual = { autorId: autor, isMe, msgs: [m] };
      grupos.push(atual);
    }
  }
  return grupos;
}
