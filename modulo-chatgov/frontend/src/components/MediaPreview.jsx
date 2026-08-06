import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Download, X, Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  RotateCw, MoreVertical, Copy, SkipBack, SkipForward, Eye, ExternalLink,
} from 'lucide-react';
import { T } from '../theme';
import { extensaoDoMime, formatarTamanho, nomeArquivoDaUrl } from '../utils/arquivo';

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

function clampWidth(min, max) {
  return `clamp(${min}px, 100%, ${max}px)`;
}

function dataRelativa(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const agora = new Date();
    const dias = Math.floor((agora - d) / 86400000);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dias <= 0 && d.toDateString() === agora.toDateString()) return `Hoje às ${hora}`;
    if (dias === 1) return `Ontem às ${hora}`;
    if (dias < 7) {
      const semana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return `${semana[d.getDay()]} às ${hora}`;
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + hora;
  } catch { return ''; }
}

function iconeFileType(mime) {
  if (!mime) return '📎';
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('compress')) return '🗜';
  return '📎';
}

// ─── Card wrapper com hover ───

function Card({ children, isMe, onClick, hoverable }) {
  const ref = useRef(null);
  const handleEnter = () => {
    if (!hoverable || !ref.current) return;
    ref.current.style.transform = 'translateY(-1px)';
    ref.current.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
    ref.current.style.borderColor = T.primary;
  };
  const handleLeave = () => {
    if (!ref.current) return;
    ref.current.style.transform = '';
    ref.current.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
    ref.current.style.borderColor = isMe ? (T.primary + '40') : T.border;
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="media-card"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        width: clampWidth(280, 460), cursor: 'pointer', userSelect: 'none',
        borderRadius: 14, border: `1.5px solid ${isMe ? T.primary + '40' : T.border}`,
        background: isMe ? T.primarySoft : T.surface,
        overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Skeleton ───

function Skeleton({ w, h, br = 6 }) {
  return (
    <div style={{
      width: w || '100%', height: h || 14, borderRadius: br,
      background: T.surfaceMuted || '#e5e7eb',
      animation: 'skeletonPulse 1.2s ease-in-out infinite',
    }} />
  );
}

// ─── Metadata ───

function Meta({ info, msg }) {
  const data = dataRelativa(msg.criado_em);
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      fontSize: 11.5, color: T.textMuted, marginTop: 2,
    }}>
      {info.ext && <span style={{ fontWeight: 500, color: T.textSecondary }}>{info.ext}</span>}
      {info.tamanho && <span>{info.tamanho}</span>}
      {info.ehPdf && info.pages && <span>{info.pages} página{info.pages !== 1 ? 's' : ''}</span>}
      {data && <>
        <span style={{ color: T.border, fontWeight: 700 }}>·</span>
        <span>{data}</span>
      </>}
    </div>
  );
}

// ─── Action button ───

function Btn({ label, icon: Icon, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 8,
        border: `1px solid ${T.border}`, background: 'transparent',
        cursor: 'pointer', fontSize: 12, fontWeight: 600,
        color: T.textSecondary,
      }}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  );
}

// ─── Menu ───

function Menu({ msg, info, compacto, onIrParaMensagem }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const url = info.url;
  const nome = info.nome;

  useEffect(() => {
    if (!aberto) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [aberto]);

  const itens = [
    { l: '⬇ Download', a: () => { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); } },
    { l: '🔗 Abrir em nova aba', a: () => window.open(url, '_blank', 'noopener') },
    { l: '📋 Copiar nome', a: () => navigator.clipboard.writeText(nome).catch(() => {}) },
    ...(onIrParaMensagem ? [{ l: '📌 Ir para mensagem', a: () => onIrParaMensagem(msg) }] : []),
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setAberto(!aberto)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.textMuted, display: 'flex', padding: 4, borderRadius: 6,
          opacity: aberto ? 1 : 0, transition: 'opacity 0.15s',
        }}
        className="media-card-menu-btn"
      >
        <MoreVertical size={compacto ? 14 : 16} />
      </button>
      {aberto && (
        <div style={{
          position: 'absolute', right: 0, bottom: '100%', marginBottom: 4, zIndex: 200,
          background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`,
          boxShadow: T.shadowMd, minWidth: 190, padding: 4, display: 'flex', flexDirection: 'column',
        }}>
          {itens.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.a(); setAberto(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 13, color: T.text, width: '100%', textAlign: 'left', borderRadius: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PDF ───

function PdfMessage({ info, msg, isMe, onOpenLightbox }) {
  const [loaded, setLoaded] = useState(false);
  const nome = info.nome;

  return (
    <Card isMe={isMe} hoverable onClick={() => onOpenLightbox?.(info.url, 'pdf', info.mime, nome)}>
      <div
        style={{
          height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6, background: '#fef2f2', position: 'relative',
        }}
      >
        {!loaded && <Skeleton w={120} h={32} />}
        <span style={{ fontSize: 40 }}>📄</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>Documento PDF</span>
        <span style={{ fontSize: 11, color: '#ef4444' }}>Clique para visualizar</span>
      </div>
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', wordBreak: 'break-word',
        }} title={nome}>
          {nome}
        </div>
        <Meta info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Btn label="Visualizar" icon={Eye} onClick={() => onOpenLightbox?.(info.url, 'pdf', info.mime, nome)} />
          <Menu msg={msg} info={info} />
        </div>
      </div>
    </Card>
  );
}

// ─── Image ───

function ImageMessage({ info, msg, isMe, onOpenLightbox }) {
  const [loaded, setLoaded] = useState(false);
  const [erro, setErro] = useState(false);
  const nome = info.nome;

  if (erro) {
    return (
      <div style={{
        width: clampWidth(280, 460), padding: 40, borderRadius: 12,
        border: `1px solid ${T.border}`, background: T.surfaceMuted || T.surfaceAlt,
        textAlign: 'center', color: T.textMuted, fontSize: 13,
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🖼</div>
        Não foi possível carregar a imagem
      </div>
    );
  }

  return (
    <Card isMe={isMe} hoverable onClick={() => onOpenLightbox?.(info.url, 'imagem', info.mime, nome)}>
      <div style={{
        position: 'relative', minHeight: 60,
        background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 8,
          }}>
            <Skeleton w="80%" h={200} />
          </div>
        )}
        <img
          src={info.url}
          alt={nome}
          onLoad={() => setLoaded(true)}
          onError={() => setErro(true)}
          style={{
            width: '100%', maxHeight: 480, objectFit: 'contain',
            display: loaded ? 'block' : 'none', cursor: 'zoom-in',
          }}
        />
        {loaded && (
          <div
            style={{
              position: 'absolute', top: 8, right: 8, padding: '4px 8px', borderRadius: 8,
              background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, fontWeight: 600,
              opacity: 0, pointerEvents: 'none',
            }}
            className="media-image-hint"
          >
            🔍 Clique para ampliar
          </div>
        )}
      </div>
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', wordBreak: 'break-word',
        }} title={nome}>
          {nome}
        </div>
        <Meta info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Btn label="Ampliar" icon={ZoomIn} onClick={() => onOpenLightbox?.(info.url, 'imagem', info.mime, nome)} />
          <Menu msg={msg} info={info} />
        </div>
      </div>
    </Card>
  );
}

// ─── Audio ───

function AudioMessage({ info, msg, isMe, compacto }) {
  const audioRef = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const [barras] = useState(() => Array.from({ length: 22 }, () => Math.random() * 0.65 + 0.3));

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onT = () => setCurrentTime(a.currentTime);
    const onD = () => setDuration(a.duration);
    const onEnd = () => setTocando(false);
    a.addEventListener('timeupdate', onT);
    a.addEventListener('loadedmetadata', onD);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', () => setTocando(true));
    a.addEventListener('pause', () => setTocando(false));
    return () => {
      a.removeEventListener('timeupdate', onT);
      a.removeEventListener('loadedmetadata', onD);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = velocidade; }, [velocidade]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  };

  const skip = (s) => {
    const a = audioRef.current;
    if (a) a.currentTime = Math.min(Math.max(a.currentTime + s, 0), a.duration || 0);
  };

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const progresso = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card isMe={isMe} hoverable={false}>
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <audio ref={audioRef} src={info.url} preload="metadata" style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            style={{
              width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: tocando ? T.danger : T.primary, color: '#fff', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'background 0.15s',
            }}
          >
            {tocando ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: 34, minWidth: 0 }}>
            {barras.map((h, i) => {
              const ativa = (i / barras.length) * 100 <= progresso;
              return (
                <div key={i} style={{
                  flex: 1, height: `${Math.max(h * 100, 12)}%`, borderRadius: 2, minWidth: 2,
                  background: ativa ? (tocando ? T.primary : T.success) : (T.surfaceMuted || '#e5e7eb'),
                  transition: 'background 0.12s',
                }} />
              );
            })}
          </div>
          <span style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 34, textAlign: 'right' }}>
            {tocando ? fmt(currentTime) : fmt(duration)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={(e) => { e.stopPropagation(); skip(-10); }} style={ctrlBtn}><SkipBack size={13} /></button>
            <button onClick={(e) => { e.stopPropagation(); skip(10); }} style={ctrlBtn}><SkipForward size={13} /></button>
            <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 2 }}>
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 1.5, 2].map((v) => (
              <button key={v} onClick={(e) => { e.stopPropagation(); setVelocidade(v); }} style={{
                ...spdBtn, background: velocidade === v ? T.primarySoft : 'transparent',
                color: velocidade === v ? T.primary : T.textMuted, fontWeight: velocidade === v ? 600 : 400,
              }}>{v}x</button>
            ))}
          </div>
          <Menu msg={msg} info={info} />
        </div>
        <Meta info={info} msg={msg} />
      </div>
    </Card>
  );
}

// ─── Video ───

function VideoMessage({ info, msg, isMe, onOpenLightbox }) {
  return (
    <Card isMe={isMe} hoverable onClick={() => onOpenLightbox?.(info.url, 'video', info.mime, info.nome)}>
      <div style={{ position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video src={info.url} preload="metadata" style={{ width: '100%', maxHeight: 320, display: 'block' }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={28} color="#fff" style={{ marginLeft: 3 }} />
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={info.nome}>
          🎬 {info.nome}
        </div>
        <Meta info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Btn label="Reproduzir" icon={Play} onClick={() => onOpenLightbox?.(info.url, 'video', info.mime, info.nome)} />
          <Menu msg={msg} info={info} />
        </div>
      </div>
    </Card>
  );
}

// ─── Generic ───

function GenericFileMessage({ info, msg, isMe }) {
  const nome = info.nome;
  const icon = iconeFileType(info.mime);

  return (
    <Card isMe={isMe} hoverable onClick={() => window.open(info.url, '_blank', 'noopener')}>
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 12, background: T.surfaceMuted || T.surfaceAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nome}>
            {nome}
          </div>
          <Meta info={info} msg={msg} />
        </div>
        <Menu msg={msg} info={info} />
      </div>
    </Card>
  );
}

// ─── Main ───

export function MediaPreview({ msg, isMe, onOpenLightbox, compacto, onIrParaMensagem }) {
  const url = urlVisualizavel(msg.media_url || msg.mediaUrl);
  if (!url) return null;
  const info = midiaInfo(msg);

  const props = { info, msg, isMe, onOpenLightbox, compacto, onIrParaMensagem };

  if (info.ehPdf) return <PdfMessage {...props} />;
  if (info.ehImagem) return <ImageMessage {...props} />;
  if (info.ehAudio) return <AudioMessage {...props} />;
  if (info.ehVideo) return <VideoMessage {...props} />;
  return <GenericFileMessage {...props} />;
}

// ─── Lightbox ───

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
    setZoom((z) => Math.min(Math.max(z + (e.deltaY > 0 ? -0.15 : 0.15), 0.25), 5));
  };

  const handleMouseDown = (e) => {
    if (!isImage || zoom <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotate(0); };

  const total = todasMidias?.length || 0;
  const idx = midiaAtualIdx ?? 0;

  return (
    <div
      role="dialog" aria-label={nome || 'Visualizador'} onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)',
        zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: isImage && zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-out',
      }}
      onWheel={handleWheel}
      onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
      onMouseUp={() => setDragging(false)}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 52,
        background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 14px', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
          {total > 1 && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{idx + 1}/{total}</span>}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {isImage && (
            <>
              <LBtn onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}><ZoomIn size={15} /></LBtn>
              <LBtn onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}><ZoomOut size={15} /></LBtn>
              <LBtn onClick={() => setRotate((r) => r - 90)}><RotateCw size={15} /></LBtn>
              {zoom !== 1 && <LBtn onClick={reset}><span style={{ fontSize: 11, fontWeight: 700 }}>1:1</span></LBtn>}
            </>
          )}
          <a href={srcAuth} download={nome} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><LBtn><Download size={15} /></LBtn></a>
          <LBtn onClick={onClose}><X size={17} /></LBtn>
        </div>
      </div>

      {onNavigate && total > 1 && (
        <>
          {idx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onNavigate(idx - 1); reset(); }} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 3, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}><ChevronLeft size={26} /></button>
          )}
          {idx < total - 1 && (
            <button onClick={(e) => { e.stopPropagation(); onNavigate(idx + 1); reset(); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 3, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}><ChevronRight size={26} /></button>
          )}
        </>
      )}

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '96vw', maxHeight: '92vh' }}>
        {isImage && (
          <img ref={imgRef} src={srcAuth} alt={nome || 'Imagem'} draggable={false} onMouseDown={handleMouseDown}
            style={{
              maxWidth: '94vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 4,
              transform: `scale(${zoom}) rotate(${rotate}deg) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: dragging ? 'none' : 'transform 0.2s ease-out',
            }}
          />
        )}
        {isVideo && <video src={srcAuth} controls autoPlay style={{ maxWidth: '94vw', maxHeight: '90vh', borderRadius: 6, background: '#000' }} />}
        {ehPdf && <iframe src={srcAuth} title={nome || 'PDF'} style={{ width: '92vw', maxWidth: 1300, height: '92vh', background: '#fff', border: 'none', borderRadius: 6 }} />}
      </div>
    </div>
  );
}

function LBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
      borderRadius: 7, width: 34, height: 34, display: 'flex', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

const ctrlBtn = {
  display: 'inline-flex', alignItems: 'center', padding: 3, borderRadius: 5,
  border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted,
};

const spdBtn = {
  border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
  fontSize: 11.5, fontVariantNumeric: 'tabular-nums', background: 'transparent',
};
