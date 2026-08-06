import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Download, X, Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  RotateCw, MoreVertical, Copy, SkipBack, SkipForward, Eye, ExternalLink, Check,
} from 'lucide-react';
import { T } from '../theme';
import { extensaoDoMime, formatarTamanho, nomeArquivoDaUrl } from '../utils/arquivo';

const IMG_MAX_W = 500;
const IMG_MAX_H = 600;
const IMG_TALL_RATIO = 2.2;

// Hash filename pattern: looks like a hex/random hash with no extension
function ehHash(str) {
  if (!str) return false;
  const semExt = str.replace(/\.[^.]+$/, '');
  if (/^[a-f0-9]{24,}$/i.test(semExt)) return true;
  return false;
}

// Friendly display name — never show raw hashes
function nomeAmigavel(nome, mime) {
  if (!nome || ehHash(nome)) {
    if (mime.startsWith('image/')) return 'Imagem recebida';
    if (mime.startsWith('video/')) return 'V\u00eddeo recebido';
    if (mime.startsWith('audio/')) return '\u00c1udio recebido';
    if (mime.includes('pdf')) return 'Documento PDF';
    return 'Arquivo recebido';
  }
  return nome.replace(/_+/g, ' ')
    .replace(/-+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function midiaInfo(msg) {
  const url = urlVisualizavel(msg.media_url || msg.mediaUrl);
  const mime = (msg.media_mime || msg.mediaMime || '').toLowerCase();
  const raw = msg.media_nome || msg.mediaNome || nomeArquivoDaUrl(url);
  const nome = nomeAmigavel(raw, mime);
  const nomeTitle = nome !== raw ? raw : nome;
  const ext = extensaoDoMime(msg.media_mime || msg.mediaMime);
  const ehImagem = mime.startsWith('image/');
  const ehVideo = mime.startsWith('video/');
  const ehAudio = mime.startsWith('audio/');
  const ehPdf = isPdf(mime, url);
  const tamanho = formatarTamanho(msg.media_tamanho);
  return { url, mime, nome, nomeTitle, ext, ehImagem, ehVideo, ehAudio, ehPdf, tamanho };
}

function clampWidth(min, max) {
  return `clamp(${min}px, 100%, ${max}px)`;
}

function dataCompacta(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const agora = new Date();
    const dias = Math.floor((agora - d) / 86400000);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dias <= 0 && d.toDateString() === agora.toDateString()) return `Hoje \u2022 ${hora}`;
    if (dias === 1) return `Ontem \u2022 ${hora}`;
    if (dias < 7) {
      const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b'];
      return `${semana[d.getDay()]} \u2022 ${hora}`;
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ` \u2022 ${hora}`;
  } catch { return ''; }
}

function iconEmoji(mime) {
  if (!mime) return '\uD83D\uDCCE';
  if (mime.startsWith('image/')) return '\uD83D\uDDBC';
  if (mime.startsWith('video/')) return '\uD83C\uDFAC';
  if (mime.startsWith('audio/')) return '\uD83C\uDFB5';
  if (mime.includes('pdf')) return '\uD83D\uDCC4';
  if (mime.includes('word') || mime.includes('document')) return '\uD83D\uDCDD';
  if (mime.includes('sheet') || mime.includes('excel')) return '\uD83D\uDCCA';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '\uD83D\uDDDC';
  return '\uD83D\uDCCE';
}

// ─── Card with hover lift ───

function Card({ children, isMe, onClick }) {
  const ref = useRef(null);
  const bg = isMe ? '#EEF5FF' : T.surface;
  const border = isMe ? '#BFDBFE' : T.border;

  const onEnter = () => {
    if (!ref.current) return;
    ref.current.style.transform = 'translateY(-2px)';
    ref.current.style.boxShadow = '0 8px 28px rgba(0,0,0,0.1)';
    ref.current.style.borderColor = T.primary;
  };
  const onLeave = () => {
    if (!ref.current) return;
    ref.current.style.transform = '';
    ref.current.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
    ref.current.style.borderColor = border;
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="media-card"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: clampWidth(280, 460), cursor: 'pointer', userSelect: 'none',
        borderRadius: 14, border: `1.5px solid ${border}`, background: bg,
        overflow: 'hidden', transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Skeleton shimmer ───

function Skeleton({ w, h, br = 6 }) {
  return (
    <div style={{
      width: w || '100%', height: h || 14, borderRadius: br,
      background: `linear-gradient(90deg, ${T.surfaceMuted || '#e5e7eb'} 25%, ${T.surfaceAlt || '#f3f4f6'} 50%, ${T.surfaceMuted || '#e5e7eb'} 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease-in-out infinite',
    }} />
  );
}

// ─── Metadata single line ───

function Meta({ info, msg }) {
  const data = dataCompacta(msg.criado_em);
  const parts = [];
  if (info.ext) parts.push(info.ext);
  if (info.tamanho) parts.push(info.tamanho);
  if (data) parts.push(data);
  return (
    <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>
      {parts.join(' \u2022 ')}
    </div>
  );
}

// ─── CTA button ───

function Btn({ label, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 8,
        background: T.primary, color: '#fff', border: 'none',
        cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        boxShadow: '0 1px 4px rgba(37,99,235,0.25)',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(37,99,235,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(37,99,235,0.25)'; e.currentTarget.style.transform = ''; }}
    >
      <Eye size={14} />
      {label}
    </button>
  );
}

// ─── Menu 3 pontos ───

function Menu({ msg, info, onIrParaMensagem }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const { url, nome } = info;

  useEffect(() => {
    if (!aberto) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [aberto]);

  const itens = [
    { l: 'Baixar', a: () => { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); } },
    { l: 'Abrir em nova aba', a: () => window.open(url, '_blank', 'noopener') },
    { l: 'Copiar nome', a: () => navigator.clipboard.writeText(nome).catch(() => {}) },
    ...(onIrParaMensagem ? [{ l: 'Ir para mensagem', a: () => onIrParaMensagem(msg) }] : []),
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
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div style={{
          position: 'absolute', right: 0, bottom: '100%', marginBottom: 4, zIndex: 200,
          background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`,
          boxShadow: T.shadowMd, minWidth: 190, padding: 4,
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
  const nome = info.nome;
  return (
    <Card isMe={isMe} onClick={() => onOpenLightbox?.(info.url, 'pdf', info.mime, nome)}>
      <div style={{
        height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
      }}>
        <span style={{ fontSize: 52 }}>{'\uD83D\uDCC4'}</span>
      </div>
      <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3,
          maxHeight: 42, overflow: 'hidden', wordBreak: 'break-word',
        }} title={info.nomeTitle || info.nome}>
          {nome}
        </div>
        <Meta info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <Btn label="Visualizar PDF" onClick={() => onOpenLightbox?.(info.url, 'pdf', info.mime, nome)} />
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
  const [dims, setDims] = useState(null);
  const nome = info.nome;

  const handleLoad = (e) => {
    const img = e.target;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setLoaded(true);
  };

  const ehVertical = dims && dims.h > 0 && (dims.h / dims.w) > IMG_TALL_RATIO;
  const showTall = loaded && ehVertical;

  if (erro) {
    return (
      <div style={{
        width: clampWidth(280, IMG_MAX_W), padding: 36, borderRadius: 12,
        border: `1px solid ${T.border}`, background: T.surfaceMuted || T.surfaceAlt,
        textAlign: 'center', color: T.textMuted, fontSize: 13,
      }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>{'\uD83D\uDDBC'}</div>
        N\u00e3o foi poss\u00edvel carregar a imagem
      </div>
    );
  }

  return (
    <Card isMe={isMe} onClick={() => onOpenLightbox?.(info.url, 'imagem', info.mime, nome)}>
      <div style={{
        position: 'relative', background: '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!loaded && (
          <div style={{ width: '100%', padding: '40% 20px' }}>
            <Skeleton h={260} />
          </div>
        )}
        <img
          src={info.url}
          alt={nome}
          onLoad={handleLoad}
          onError={() => setErro(true)}
          style={{
            width: '100%', maxWidth: IMG_MAX_W, maxHeight: showTall ? Math.round(IMG_MAX_H * 0.7) : IMG_MAX_H,
            objectFit: 'contain', display: loaded ? 'block' : 'none', cursor: 'zoom-in',
            borderRadius: 0,
          }}
        />
        {showTall && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
            padding: '28px 12px 8px', textAlign: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{'\u2193'} Ver imagem completa</span>
          </div>
        )}
        {/* Hover overlay */}
        <div
          className="media-image-hint"
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,0.35)', opacity: 0,
            transition: 'opacity 0.2s', pointerEvents: 'none',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
            borderRadius: 20, background: 'rgba(255,255,255,0.2)',
            color: '#fff', fontSize: 13, fontWeight: 600,
          }}>
            <ZoomIn size={18} /> Ampliar
          </div>
        </div>
      </div>
      <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.3,
          maxHeight: 40, overflow: 'hidden', wordBreak: 'break-word',
        }} title={info.nomeTitle || info.nome}>
          {nome}
        </div>
        <Meta info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <Btn label="Ampliar" onClick={() => onOpenLightbox?.(info.url, 'imagem', info.mime, nome)} />
          <Menu msg={msg} info={info} />
        </div>
      </div>
    </Card>
  );
}

// ─── Audio ───

function AudioMessage({ info, msg, isMe }) {
  const audioRef = useRef(null);
  const waveRef = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const [ouvido, setOuvido] = useState(false);
  const [barras] = useState(() => Array.from({ length: 30 }, () => Math.random() * 0.6 + 0.35));

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onT = () => {
      const ct = a.currentTime;
      setCurrentTime(ct);
      if (a.duration > 0 && ct / a.duration > 0.8) setOuvido(true);
    };
    const onD = () => setDuration(a.duration);
    a.addEventListener('timeupdate', onT);
    a.addEventListener('loadedmetadata', onD);
    a.addEventListener('ended', () => { setTocando(false); setOuvido(true); });
    a.addEventListener('play', () => setTocando(true));
    a.addEventListener('pause', () => setTocando(false));
    return () => {
      a.removeEventListener('timeupdate', onT);
      a.removeEventListener('loadedmetadata', onD);
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

  const seekTo = (e) => {
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    if (audioRef.current) audioRef.current.currentTime = pct * duration;
  };

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const progresso = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card isMe={isMe}>
      <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <audio ref={audioRef} src={info.url} preload="metadata" style={{ display: 'none' }} />

        {/* Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
            {!tocando && !ouvido && <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.danger, display: 'inline-block' }} />}
            {ouvido && <Check size={12} color={T.success} />}
            <span style={{ color: ouvido ? T.success : (tocando ? T.primary : T.danger) }}>
              {tocando ? 'Reproduzindo' : ouvido ? 'Ouvido' : 'N\u00e3o ouvido'}
            </span>
          </span>
        </div>

        {/* Play + Wave */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={(e) => { e.stopPropagation(); skip(-10); }} style={ctrlBtn} title="Retroceder 10s">
            <SkipBack size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: T.primary, color: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 10px rgba(37,99,235,0.3)',
              transition: 'transform 0.12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
          >
            {tocando ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); skip(10); }} style={ctrlBtn} title="Avan\u00e7ar 10s">
            <SkipForward size={15} />
          </button>

          {/* Wave clic\u00e1vel */}
          <div
            ref={waveRef}
            onClick={(e) => { e.stopPropagation(); seekTo(e); }}
            style={{
              flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: 34,
              minWidth: 0, cursor: 'pointer',
            }}
          >
            {barras.map((h, i) => {
              const ativa = (i / barras.length) * 100 <= progresso;
              return (
                <div key={i} style={{
                  flex: 1, height: `${Math.max(h * 100, 10)}%`, borderRadius: 2, minWidth: 2,
                  background: ativa ? T.primary : (T.surfaceMuted || '#e5e7eb'),
                  transition: 'background 0.1s',
                }} />
              );
            })}
          </div>
        </div>

        {/* Controles inferiores */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11.5, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>
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
  const videoRef = useRef(null);
  const [duration, setDuration] = useState(null);

  const fmtDur = (s) => {
    if (!s || !isFinite(s)) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <Card isMe={isMe} onClick={() => onOpenLightbox?.(info.url, 'video', info.mime, info.nome)}>
      <div style={{ position: 'relative', background: '#000' }}>
        <video
          ref={videoRef}
          src={info.url} preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          style={{ width: '100%', maxHeight: 320, display: 'block' }}
        />
        {duration && (
          <div style={{
            position: 'absolute', top: 8, right: 8, padding: '2px 8px',
            borderRadius: 6, background: 'rgba(0,0,0,0.7)', color: '#fff',
            fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtDur(duration)}
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none', background: 'rgba(0,0,0,0.15)',
        }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={28} color="#fff" style={{ marginLeft: 3 }} />
          </div>
        </div>
      </div>
      <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={info.nome}>
          {'\uD83C\uDFAC'} {info.nome}
        </div>
        <Meta info={info} msg={msg} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <Btn label="Reproduzir" onClick={() => onOpenLightbox?.(info.url, 'video', info.mime, info.nome)} />
          <Menu msg={msg} info={info} />
        </div>
      </div>
    </Card>
  );
}

// ─── Generic ───

function GenericFileMessage({ info, msg, isMe }) {
  const nome = info.nome;
  const icon = iconEmoji(info.mime);
  return (
    <Card isMe={isMe} onClick={() => window.open(info.url, '_blank', 'noopener')}>
      <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 12, background: T.surfaceMuted || T.surfaceAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={info.nomeTitle || nome}>
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

export function MediaLightbox({ src, tipo, mime, nome, onClose, todasMidias, midiaAtualIdx, onNavigate, msg }) {
  const srcAuth = urlVisualizavel(src);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pdfPagina, setPdfPagina] = useState(1);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDur, setVideoDur] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisivel(true)); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onNavigate && midiaAtualIdx > 0) { onNavigate(midiaAtualIdx - 1); reset(); }
      if (e.key === 'ArrowRight' && onNavigate && todasMidias && midiaAtualIdx < todasMidias.length - 1) { onNavigate(midiaAtualIdx + 1); reset(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, onNavigate, midiaAtualIdx, todasMidias]);

  const isVideo = tipo === 'video' || (mime || '').startsWith('video/');
  const isImage = tipo === 'image' || tipo === 'imagem' || (mime || '').startsWith('image/');
  const ehPdf = isPdf(mime, src);
  const total = todasMidias?.length || 0;
  const idx = midiaAtualIdx ?? 0;
  const ext = extensaoDoMime(mime);
  const tamanho = formatarTamanho(msg?.media_tamanho);
  const dataStr = dataCompacta(msg?.criado_em);

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

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotate(0); setPdfPagina(1); };

  const fmtDur = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const toggleVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const seekVideo = (e) => {
    const v = videoRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!v || !videoDur) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * videoDur;
  };

  const metaParts = [ext, tamanho, dataStr].filter(Boolean);

  return (
    <div
      role="dialog" aria-label={nome || 'Visualizador'} onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#111315',
        zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', opacity: visivel ? 1 : 0,
        transition: 'opacity 0.2s ease-out',
        cursor: isImage && zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-out',
      }}
      onWheel={handleWheel}
      onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
      onMouseUp={() => setDragging(false)}
    >
      {/* ── Premium header ── */}
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'rgba(17,19,21,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E5E7EB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {!isVideo && iconEmoji(mime)}{' '}{nome}
          </div>
          {metaParts.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {metaParts.join(' \u2022 ')}{total > 1 ? ` \u2022 ${idx + 1}/${total}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* PDF page nav */}
          {ehPdf && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <LBtn onClick={() => setPdfPagina((p) => Math.max(1, p - 1))}><ChevronLeft size={15} /></LBtn>
              <input
                type="number"
                value={pdfPagina}
                onChange={(e) => setPdfPagina(Math.max(1, parseInt(e.target.value) || 1))}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 44, textAlign: 'center', background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                  color: '#fff', fontSize: 12, padding: '4px 2px', outline: 'none',
                }}
              />
              <LBtn onClick={() => setPdfPagina((p) => p + 1)}><ChevronRight size={15} /></LBtn>
            </div>
          )}
          {/* Image tools */}
          {isImage && (
            <>
              <LBtn onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}><ZoomOut size={15} /></LBtn>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, minWidth: 38, textAlign: 'center', fontWeight: 600 }}>{Math.round(zoom * 100)}%</span>
              <LBtn onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}><ZoomIn size={15} /></LBtn>
              <LBtn onClick={() => setRotate((r) => r - 90)}><RotateCw size={15} /></LBtn>
              {zoom !== 1 && <LBtn onClick={reset}><span style={{ fontSize: 10, fontWeight: 700 }}>1:1</span></LBtn>}
            </>
          )}
          <a href={srcAuth} download={nome} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <LBtn><Download size={15} /></LBtn>
          </a>
          <LBtn onClick={onClose}><X size={17} /></LBtn>
        </div>
      </div>

      {/* Navigation arrows */}
      {onNavigate && total > 1 && (
        <>
          {idx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onNavigate(idx - 1); reset(); }} style={navBtnL}>
              <ChevronLeft size={28} />
            </button>
          )}
          {idx < total - 1 && (
            <button onClick={(e) => { e.stopPropagation(); onNavigate(idx + 1); reset(); }} style={navBtnR}>
              <ChevronRight size={28} />
            </button>
          )}
        </>
      )}

      {/* Content area */}
      <div onClick={(e) => e.stopPropagation()} style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', padding: '60px 16px 16px', overflow: 'auto',
      }}>
        {isImage && (
          <img src={srcAuth} alt={nome || 'Imagem'} draggable={false} onMouseDown={handleMouseDown} onDoubleClick={() => zoom > 1 ? reset() : setZoom(2)}
            style={{
              maxWidth: '92vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: 6,
              transform: `scale(${zoom}) rotate(${rotate}deg) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: dragging ? 'none' : 'transform 0.2s ease-out', boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
        )}
        {isVideo && (
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '82vh', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
            <video
              ref={videoRef}
              src={srcAuth}
              autoPlay
              onTimeUpdate={(e) => setVideoTime(e.target.currentTime)}
              onLoadedMetadata={(e) => setVideoDur(e.target.duration)}
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onClick={toggleVideo}
              style={{ display: 'block', maxWidth: '90vw', maxHeight: '78vh', cursor: 'pointer' }}
            />
            {/* Custom controls overlay */}
            <div onClick={(e) => e.stopPropagation()} style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
              padding: '28px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {/* Progress bar */}
              <div
                onClick={seekVideo}
                style={{
                  width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)',
                  cursor: 'pointer', position: 'relative',
                }}
              >
                <div style={{
                  width: videoDur > 0 ? `${(videoTime / videoDur) * 100}%` : '0%',
                  height: '100%', borderRadius: 2, background: '#fff', transition: 'width 0.1s linear',
                }} />
              </div>
              {/* Controls row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={toggleVideo} style={LBtnStyle}>
                    {videoPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 1 }} />}
                  </button>
                  <span style={{ color: '#fff', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDur(videoTime)} / {fmtDur(videoDur)}
                  </span>
                </div>
                <a href={srcAuth} download={nome} style={{ textDecoration: 'none' }}>
                  <button style={LBtnStyle}><Download size={15} /></button>
                </a>
              </div>
            </div>
          </div>
        )}
        {ehPdf && (
          <iframe
            src={`${srcAuth}#page=${pdfPagina}`}
            title={nome || 'PDF'}
            style={{
              width: '90vw', maxWidth: 1300, height: '86vh',
              background: '#fff', border: 'none', borderRadius: 8,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
        )}
      </div>

      {/* Footer with sender info */}
      {msg && (msg.direcao || dataStr) && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
          padding: '8px 18px', display: 'flex', justifyContent: 'center', gap: 16,
          background: 'rgba(17,19,21,0.85)', borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            {dataStr && `${dataStr}`}
          </span>
        </div>
      )}
    </div>
  );
}

function LBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={LBtnStyle}>{children}</button>
  );
}

const LBtnStyle = {
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: 'none',
  borderRadius: 7, width: 34, height: 34, display: 'flex', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer', transition: 'background 0.12s',
};

const ctrlBtn = {
  display: 'inline-flex', alignItems: 'center', padding: 4, borderRadius: 6,
  border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted,
};

const spdBtn = {
  border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 5,
  fontSize: 12, fontVariantNumeric: 'tabular-nums', background: 'transparent',
};

const navBtnL = {
  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 5,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'rgba(255,255,255,0.6)', transition: 'background 0.12s',
};

const navBtnR = {
  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 5,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'rgba(255,255,255,0.6)', transition: 'background 0.12s',
};
