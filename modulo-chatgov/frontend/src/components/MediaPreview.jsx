import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Download, X, FileText, ExternalLink, Play, Pause, ChevronLeft,
  ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize, Printer, MoreVertical,
  Copy, Forward, Square, SkipBack, SkipForward, Image, Film, Music, Paperclip,
} from 'lucide-react';
import { T } from '../theme';
import { formatoArquivo, extensaoDoMime, formatarTamanho, nomeArquivoDaUrl, formatarDataHora } from '../utils/arquivo';

function getToken() {
  try {
    const saved = localStorage.getItem('chatgov_auth');
    if (!saved) return '';
    return JSON.parse(saved).token;
  } catch { return ''; }
}

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

// ─── Helpers ───

function midiaInfo(msg) {
  const url = urlVisualizavel(msg.media_url || msg.mediaUrl);
  const mime = (msg.media_mime || msg.mediaMime || '').toLowerCase();
  const nome = msg.media_nome || msg.mediaNome || nomeArquivoDaUrl(url);
  const ext = extensaoDoMime(msg.media_mime || msg.mediaMime);
  const ehImagem = mime.startsWith('image/');
  const ehVideo = mime.startsWith('video/');
  const ehAudio = mime.startsWith('audio/');
  const ehPdf = isPdf(mime, url);
  const tamanho = formatarTamanho(msg.media_tamanho);
  return { url, mime, nome, ext, ehImagem, ehVideo, ehAudio, ehPdf, tamanho };
}

// Clamp width between min and max, respecting container
function clampWidth(min, max) {
  return `clamp(${min}px, 100%, ${max}px)`;
}

// ─── Subcomponentes ───

function MetadataBar({ info, msg, showSender }) {
  const data = msg.criado_em ? formatarDataHora(msg.criado_em) : '';
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 11, color: T.textMuted, marginTop: 4, paddingLeft: 2 }}>
      {info.ehPdf && info.tamanho && <span style={{ fontWeight: 500, color: T.textSecondary }}>PDF • {info.tamanho}</span>}
      {info.ehImagem && info.tamanho && <span style={{ fontWeight: 500, color: T.textSecondary }}>{info.ext} • {info.tamanho}</span>}
      {info.ehAudio && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: msg.ouvido ? T.textMuted : T.danger, display: 'inline-block' }} />
          {msg.ouvido ? 'Áudio ouvido' : 'Áudio não ouvido'}
        </span>
      )}
      {data && <span>{data}</span>}
    </div>
  );
}

function AcaoPrincipal({ tipo, onClick, label, compacto }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: compacto ? '6px 10px' : '7px 14px', borderRadius: 8,
        border: `1px solid ${T.border}`, background: 'transparent',
        cursor: 'pointer', fontSize: 12, fontWeight: 600,
        color: T.textSecondary,
      }}
    >
      {label}
    </button>
  );
}

function MenuTresPontos({ msg, info, onOpenLightbox, compacto, onIrParaMensagem }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [aberto]);

  const url = info.url;
  const nome = info.nome;

  const itens = [
    { label: 'Baixar', icon: Download, onClick: () => { const a = document.createElement('a'); a.href = url; a.download = nome; a.target = '_blank'; a.click(); } },
    { label: 'Abrir em nova aba', icon: ExternalLink, onClick: () => window.open(url, '_blank', 'noopener') },
    { label: 'Copiar nome', icon: Copy, onClick: () => navigator.clipboard.writeText(nome).catch(() => {}) },
    ...(onIrParaMensagem ? [{ label: 'Ir para mensagem', icon: Forward, onClick: () => onIrParaMensagem(msg) }] : []),
  ];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setAberto(!aberto); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: compacto ? 3 : 4,
          color: T.textMuted, display: 'flex', borderRadius: 6,
        }}
        title="Mais ações"
      >
        <MoreVertical size={compacto ? 14 : 16} />
      </button>
      {aberto && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, bottom: '100%', marginBottom: 4, zIndex: 200,
            background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`,
            boxShadow: T.shadowMd, minWidth: 200, padding: 4, display: 'flex', flexDirection: 'column',
          }}
        >
          {itens.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setAberto(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 13, color: T.text, width: '100%', textAlign: 'left',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <item.icon size={14} /> {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PDF Message ───

function PdfMessage({ info, msg, isMe, onOpenLightbox, compacto }) {
  const nome = info.nome;
  return (
    <div
      onClick={() => onOpenLightbox?.(info.url, 'pdf', info.mime, nome)}
      style={{
        width: clampWidth(280, 460), cursor: 'pointer',
        borderRadius: 12, border: `1.5px solid ${T.border}`, overflow: 'hidden',
        background: T.surface, boxShadow: T.shadow, transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = T.shadowMd; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = T.shadow; }}
    >
      <div style={{
        height: 200, background: '#fef2f2', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 8,
      }}>
        <FileText size={48} color="#dc2626" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>Documento PDF</span>
        <span style={{ fontSize: 11, color: '#ef4444' }}>Clique para visualizar</span>
      </div>
      <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }} title={nome}>
          {nome}
        </div>
        <MetadataBar info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <AcaoPrincipal tipo="pdf" onClick={() => onOpenLightbox?.(info.url, 'pdf', info.mime, nome)} label="Visualizar documento" compacto={compacto} />
          <MenuTresPontos msg={msg} info={info} onOpenLightbox={onOpenLightbox} compacto={compacto} />
        </div>
      </div>
    </div>
  );
}

// ─── Image Message ───

function ImageMessage({ info, msg, isMe, onOpenLightbox, compacto }) {
  const [loaded, setLoaded] = useState(false);
  const [erro, setErro] = useState(false);
  const nome = info.nome;

  if (erro) {
    return (
      <div style={{
        width: clampWidth(280, 460), height: 200, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 8,
        borderRadius: 12, border: `1px solid ${T.border}`, background: T.surfaceMuted || T.surfaceAlt,
      }}>
        <Image size={36} color={T.textMuted} />
        <span style={{ fontSize: 12, color: T.textMuted }}>Não foi possível carregar a imagem</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpenLightbox?.(info.url, 'imagem', info.mime, nome)}
      style={{
        width: clampWidth(280, 460), cursor: 'zoom-in', position: 'relative',
        borderRadius: 12, border: `1.5px solid ${T.border}`, overflow: 'hidden',
        background: T.surface, boxShadow: T.shadow,
      }}
    >
      <div style={{
        maxHeight: 520, background: '#f3f4f6', display: 'flex',
        alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        {!loaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
        <img
          src={info.url}
          alt={nome}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErro(true)}
          style={{
            width: '100%', maxHeight: 520, objectFit: 'contain',
            display: loaded ? 'block' : 'none', cursor: 'zoom-in',
          }}
        />
      </div>
      <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }} title={nome}>
          {nome}
        </div>
        <MetadataBar info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <AcaoPrincipal tipo="imagem" onClick={() => onOpenLightbox?.(info.url, 'imagem', info.mime, nome)} label="Ampliar" compacto={compacto} />
          <MenuTresPontos msg={msg} info={info} onOpenLightbox={onOpenLightbox} compacto={compacto} />
        </div>
      </div>
    </div>
  );
}

// ─── Audio Message ───

function AudioMessage({ info, msg, isMe, compacto }) {
  const audioRef = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const [barras] = useState(() => Array.from({ length: 24 }, () => Math.random() * 0.7 + 0.3));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
    const onEnd = () => setTocando(false);
    const onPlay = () => setTocando(true);
    const onPause = () => setTocando(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDur);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDur);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.playbackRate = velocidade; }
  }, [velocidade]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); }
    else { a.pause(); }
  };

  const skip = (seg) => {
    const a = audioRef.current;
    if (a) { a.currentTime = Math.min(Math.max(a.currentTime + seg, 0), a.duration || 0); }
  };

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const progresso = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{
      width: clampWidth(300, 440), borderRadius: 12, border: `1.5px solid ${T.border}`,
      background: T.surface, boxShadow: T.shadow, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <audio ref={audioRef} src={info.url} preload="metadata" style={{ display: 'none' }} />

      {/* Forma de onda + play */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: T.primary, color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0, boxShadow: T.shadow,
          }}
        >
          {tocando ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: 36, minWidth: 0 }}>
          {barras.map((h, i) => {
            const pos = (i / barras.length) * 100;
            const ativa = progresso > pos;
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: `${Math.max(h * 100, 15)}%`,
                  borderRadius: 2, minWidth: 2,
                  background: ativa ? T.primary : (T.surfaceMuted || '#e5e7eb'),
                  transition: 'background 0.15s',
                }}
              />
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {tocando ? fmt(currentTime) : fmt(duration)}
        </span>
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); skip(-10); }} style={ctrlBtn} title="Retroceder 10s">
            <SkipBack size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); skip(10); }} style={ctrlBtn} title="Avançar 10s">
            <SkipForward size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {/* Velocidades */}
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => (
            v !== 1 || velocidade === 1 ? (
              <button
                key={v}
                onClick={(e) => { e.stopPropagation(); setVelocidade(v); }}
                style={{
                  ...spdBtn,
                  background: velocidade === v ? T.primarySoft : 'transparent',
                  color: velocidade === v ? T.primary : T.textMuted,
                  fontWeight: velocidade === v ? 600 : 400,
                }}
              >
                {v}x
              </button>
            ) : null
          ))}
          <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 4 }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <MenuTresPontos msg={msg} info={info} compacto={compacto} />
        </div>
      </div>

      <MetadataBar info={info} msg={msg} />
    </div>
  );
}

// ─── Video Message ───

function VideoMessage({ info, msg, isMe, onOpenLightbox, compacto }) {
  return (
    <div
      onClick={() => onOpenLightbox?.(info.url, 'video', info.mime, info.nome)}
      style={{
        width: clampWidth(280, 460), cursor: 'pointer', position: 'relative',
        borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T.border}`,
        background: T.surface, boxShadow: T.shadow,
      }}
    >
      <div style={{ position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          src={info.url}
          preload="metadata"
          controls={false}
          style={{ width: '100%', maxHeight: 360, display: 'block' }}
        />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Play size={26} color="#fff" style={{ marginLeft: 3 }} />
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={info.nome}>
          {info.nome}
        </div>
        <MetadataBar info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <AcaoPrincipal tipo="video" onClick={() => onOpenLightbox?.(info.url, 'video', info.mime, info.nome)} label="Reproduzir" compacto={compacto} />
          <MenuTresPontos msg={msg} info={info} onOpenLightbox={onOpenLightbox} compacto={compacto} />
        </div>
      </div>
    </div>
  );
}

// ─── Generic File Message ───

function GenericFileMessage({ info, msg, isMe, onOpenLightbox, compacto }) {
  const nome = info.nome;
  const Icone = info.mime.startsWith('application/zip') || info.mime.startsWith('application/x-rar') || info.mime.startsWith('application/x-7z')
    ? Paperclip : FileText;

  return (
    <div
      onClick={() => window.open(info.url, '_blank', 'noopener')}
      style={{
        width: clampWidth(280, 440), cursor: 'pointer',
        borderRadius: 12, border: `1.5px solid ${T.border}`, overflow: 'hidden',
        background: T.surface, boxShadow: T.shadow, transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = T.shadowMd; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = T.shadow; }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10, background: T.surfaceMuted || T.surfaceAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icone size={24} color={T.textSecondary} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nome}>
            {nome}
          </div>
          <MetadataBar info={info} msg={msg} />
        </div>
        <MenuTresPontos msg={msg} info={info} onOpenLightbox={onOpenLightbox} compacto={compacto} />
      </div>
    </div>
  );
}

// ─── MediaPreview principal ───

export function MediaPreview({ msg, isMe, onOpenLightbox, compacto, onIrParaMensagem }) {
  const url = urlVisualizavel(msg.media_url || msg.mediaUrl);
  if (!url) return null;

  const info = midiaInfo(msg);

  if (info.ehPdf) {
    return <PdfMessage info={info} msg={msg} isMe={isMe} onOpenLightbox={onOpenLightbox} compacto={compacto} />;
  }

  if (info.ehImagem) {
    return <ImageMessage info={info} msg={msg} isMe={isMe} onOpenLightbox={onOpenLightbox} compacto={compacto} />;
  }

  if (info.ehAudio) {
    return <AudioMessage info={info} msg={msg} isMe={isMe} compacto={compacto} />;
  }

  if (info.ehVideo) {
    return <VideoMessage info={info} msg={msg} isMe={isMe} onOpenLightbox={onOpenLightbox} compacto={compacto} />;
  }

  return <GenericFileMessage info={info} msg={msg} isMe={isMe} onOpenLightbox={onOpenLightbox} compacto={compacto} />;
}

// ─── MediaLightbox renovado ───

export function MediaLightbox({ src, tipo, mime, nome, onClose, todasMidias, midiaAtualIdx, onNavigate }) {
  const srcAuth = urlVisualizavel(src);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onNavigate && midiaAtualIdx > 0) onNavigate(midiaAtualIdx - 1);
      if (e.key === 'ArrowRight' && onNavigate && todasMidias && midiaAtualIdx < todasMidias.length - 1) onNavigate(midiaAtualIdx + 1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onNavigate, midiaAtualIdx, todasMidias]);

  const isVideo = tipo === 'video' || (mime || '').startsWith('video/');
  const isImage = tipo === 'image' || tipo === 'imagem' || (mime || '').startsWith('image/');
  const ehPdf = isPdf(mime, src);

  const handleWheel = (e) => {
    if (!isImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => Math.min(Math.max(z + delta, 0.25), 5));
  };

  const handleMouseDown = (e) => {
    if (!isImage || zoom <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  const resetPanZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotate(0); };

  const total = todasMidias?.length || 0;
  const idx = midiaAtualIdx ?? 0;

  return (
    <div
      role="dialog"
      aria-label={nome || 'Visualizador de mídia'}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: isImage && zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-out',
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Barra superior */}
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 56,
        background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nome}
          </span>
          {total > 1 && (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {idx + 1} de {total}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {isImage && (
            <>
              <LightboxBtn onClick={() => setZoom((z) => Math.min(z + 0.25, 5))} title="Ampliar">
                <ZoomIn size={16} />
              </LightboxBtn>
              <LightboxBtn onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))} title="Reduzir">
                <ZoomOut size={16} />
              </LightboxBtn>
              <LightboxBtn onClick={() => setRotate((r) => r - 90)} title="Girar">
                <RotateCw size={16} />
              </LightboxBtn>
              {zoom !== 1 && <LightboxBtn onClick={resetPanZoom} title="Resetar">1:1</LightboxBtn>}
            </>
          )}
          <a href={srcAuth} download={nome} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <LightboxBtn title="Baixar"><Download size={16} /></LightboxBtn>
          </a>
          <LightboxBtn onClick={onClose} title="Fechar"><X size={18} /></LightboxBtn>
        </div>
      </div>

      {/* Navegação */}
      {onNavigate && total > 1 && (
        <>
          {idx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(idx - 1); resetPanZoom(); }}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <ChevronLeft size={28} />
            </button>
          )}
          {idx < total - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(idx + 1); resetPanZoom(); }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <ChevronRight size={28} />
            </button>
          )}
        </>
      )}

      {/* Conteúdo */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '95vw', maxHeight: '90vh' }}>
        {isImage && (
          <img
            ref={imgRef}
            src={srcAuth}
            alt={nome || 'Imagem'}
            draggable={false}
            onMouseDown={handleMouseDown}
            style={{
              maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain',
              borderRadius: 6, transform: `scale(${zoom}) rotate(${rotate}deg) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: dragging ? 'none' : 'transform 0.2s ease-out',
              cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            }}
          />
        )}
        {isVideo && (
          <video
            src={srcAuth}
            controls autoPlay
            style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 6, background: '#000' }}
          />
        )}
        {ehPdf && (
          <iframe
            src={srcAuth}
            title={nome || 'PDF'}
            style={{ width: '90vw', maxWidth: 1200, height: '90vh', background: '#fff', border: 'none', borderRadius: 6 }}
          />
        )}
      </div>

      {/* Rodapé */}
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 44,
        background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 16, zIndex: 2,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
          {infoHeader({ tipo, mime, nome, zoom, rotate })}
        </span>
      </div>
    </div>
  );
}

function LightboxBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
        borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function infoHeader({ tipo, mime, nome, zoom, rotate }) {
  const parts = [];
  if (tipo === 'imagem' || (mime || '').startsWith('image/')) parts.push('Imagem');
  if (tipo === 'video' || (mime || '').startsWith('video/')) parts.push('Vídeo');
  if ((mime || '').includes('pdf')) parts.push('PDF');
  if (zoom && zoom !== 1) parts.push(`${Math.round(zoom * 100)}%`);
  if (rotate && rotate % 360 !== 0) parts.push(`${rotate}°`);
  return parts.join(' • ');
}

// Estilos inline
const ctrlBtn = {
  display: 'inline-flex', alignItems: 'center', padding: 4, borderRadius: 6,
  border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted,
};

const spdBtn = {
  border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
  fontSize: 11.5, fontVariantNumeric: 'tabular-nums', background: 'transparent',
};
