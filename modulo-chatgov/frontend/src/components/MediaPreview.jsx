import React, { useEffect } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { T } from '../theme';
import { iconeArquivo, nomeArquivoDaUrl, formatoArquivo } from '../utils/arquivo';

function getToken() {
  try {
    const saved = localStorage.getItem('chatgov_auth');
    if (!saved) return '';
    return JSON.parse(saved).token;
  } catch { return ''; }
}

// Converte URLs autenticadas (/api/.../download) em URLs servidas via
// proxy público com token via query string. URLs estáticas (/media/...)
// ou externas (https://...) passam direto.
export function urlVisualizavel(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/media/')) return url;
  if (url.includes('/api/evolucoes/arquivos/') && url.includes('/download')) {
    const id = url.split('/').slice(-2, -1)[0];
    const token = getToken();
    return `/api/evolucoes/arquivos/${id}/raw${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  if (url.includes('/api/evolucoes/arquivos/') && url.endsWith('/raw')) {
    const token = getToken();
    return token && !url.includes('token=') ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
  }
  return url;
}

function isPdf(mime, url) {
  if ((mime || '').toLowerCase().includes('pdf')) return true;
  return /\.pdf(\?|$)/i.test(url || '');
}

// Lightbox fullscreen para imagem ou vídeo. Esc ou clique fora fecha.
export function MediaLightbox({ src, tipo, mime, nome, onClose }) {
  const srcAuth = urlVisualizavel(src);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const isVideo = tipo === 'video' || (mime || '').startsWith('video/');
  const isImage = tipo === 'image' || tipo === 'imagem' || (mime || '').startsWith('image/');
  const ehPdf = isPdf(mime, src);

  return React.createElement('div', {
    role: 'dialog', 'aria-label': nome || 'Visualizador de mídia',
    onClick: onClose,
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500, cursor: 'zoom-out' },
  },
    React.createElement('div', { onClick: (e) => e.stopPropagation(), style: { position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, zIndex: 2 } },
      React.createElement('a', {
        href: srcAuth, download: nome || undefined, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': 'Baixar',
        style: { background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' },
      }, React.createElement(Download, { size: 18 })),
      React.createElement('button', {
        onClick: onClose, 'aria-label': 'Fechar',
        style: { background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, React.createElement(X, { size: 20 })),
    ),
    isImage && React.createElement('img', {
      src: srcAuth, alt: nome || 'Imagem',
      style: { maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 6, cursor: 'default' },
    }),
    isVideo && React.createElement('video', {
      src: srcAuth, controls: true, autoPlay: true,
      style: { maxWidth: '95vw', maxHeight: '90vh', borderRadius: 6, background: '#000', cursor: 'default' },
    }),
    ehPdf && React.createElement('iframe', {
      src: srcAuth, title: nome || 'PDF',
      style: { width: '90vw', height: '90vh', maxWidth: 1200, background: '#fff', border: 'none', borderRadius: 6 },
    }),
  );
}

export function MediaPreview({ msg, isMe, onOpenLightbox }) {
  const mediaUrl = urlVisualizavel(msg.media_url || msg.mediaUrl);
  const mediaMime = msg.media_mime || msg.mediaMime || '';
  const tipo = msg.tipo || 'texto';
  if (!mediaUrl) return null;
  const nomeArq = nomeArquivoDaUrl(mediaUrl);

  // Vídeo: player inline + clique amplia
  if (tipo === 'video' || mediaMime.startsWith('video/')) {
    return React.createElement(React.Fragment, null,
      React.createElement('video', {
        src: mediaUrl, controls: true, preload: 'metadata',
        onClick: (e) => { e.stopPropagation(); onOpenLightbox?.(mediaUrl, 'video', mediaMime, nomeArq); },
        'aria-label': `Vídeo: ${nomeArq}`,
        style: { maxWidth: 300, maxHeight: 280, borderRadius: 6, display: 'block', cursor: 'zoom-in', background: '#000' },
      }),
    );
  }

  // Áudio: player inline
  if (tipo === 'audio' || mediaMime.startsWith('audio/')) {
    return React.createElement('audio', {
      src: mediaUrl, controls: true, preload: 'metadata',
      'aria-label': `Áudio: ${nomeArq}`,
      style: { maxWidth: 280, display: 'block' },
    });
  }

  // Imagem: miniatura + clique amplia
  if (tipo === 'imagem' || tipo === 'image' || mediaMime.startsWith('image/')) {
    return React.createElement('img', {
      src: mediaUrl, alt: nomeArq, loading: 'lazy',
      onClick: (e) => { e.stopPropagation(); onOpenLightbox?.(mediaUrl, 'imagem', mediaMime, nomeArq); },
      'aria-label': `Imagem: ${nomeArq} (clique para ampliar)`,
      style: { maxWidth: 300, maxHeight: 300, borderRadius: 6, display: 'block', objectFit: 'cover', cursor: 'zoom-in' },
    });
  }

  // PDF: preview inline (iframe) com ações de abrir/baixar
  if (isPdf(mediaMime, mediaUrl)) {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      React.createElement('iframe', {
        src: mediaUrl,
        title: nomeArq,
        'aria-label': `Pré-visualização de PDF: ${nomeArq}`,
        style: { width: 320, height: 380, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' },
      }),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.text } },
        React.createElement(FileText, { size: 14, color: T.danger }),
        React.createElement('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nomeArq),
        React.createElement('button', {
          onClick: (e) => { e.stopPropagation(); onOpenLightbox?.(mediaUrl, 'pdf', mediaMime, nomeArq); },
          'aria-label': 'Ampliar PDF',
          style: { background: 'none', border: 'none', color: T.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '2px 6px' },
        }, 'Ampliar'),
        React.createElement('a', {
          href: mediaUrl, target: '_blank', rel: 'noopener noreferrer',
          'aria-label': 'Abrir PDF em nova aba',
          onClick: (e) => e.stopPropagation(),
          style: { color: T.primary, textDecoration: 'none', fontSize: 11, fontWeight: 600, padding: '2px 6px' },
        }, 'Abrir'),
        React.createElement('a', {
          href: mediaUrl, download: nomeArq,
          'aria-label': 'Baixar PDF',
          onClick: (e) => e.stopPropagation(),
          style: { color: T.primary, textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '2px 4px' },
        }, React.createElement(Download, { size: 14 })),
      ),
    );
  }

  // Documento genérico
  return React.createElement('a', {
    href: mediaUrl, target: '_blank', rel: 'noopener noreferrer',
    onClick: (e) => e.stopPropagation(),
    'aria-label': `Abrir documento: ${nomeArq}`,
    style: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      background: isMe ? 'rgba(255,255,255,0.6)' : T.surface,
      borderRadius: 8, border: `1px solid ${T.border}`,
      textDecoration: 'none', color: T.text, fontSize: 13,
    },
  },
    React.createElement('span', { style: { fontSize: 22 } }, iconeArquivo(mediaMime)),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { style: { fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nomeArq),
      React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, formatoArquivo(mediaMime)),
    ),
  );
}
