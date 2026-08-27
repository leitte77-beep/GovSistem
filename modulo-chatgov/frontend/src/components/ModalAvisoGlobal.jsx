import React, { useEffect, useState } from 'react';
import { Megaphone, X, BellRing, AlertTriangle, Info } from 'lucide-react';
import { T } from '../theme';

// Tempo (ms) de exibição automática do popup de canto, por importância.
const AUTOCLOSE_MS = { baixa: 5000, media: 8000, alta: null };

const IMPORTANCIA = {
  baixa: { cor: '#2563EB', rotulo: 'Baixa prioridade', icone: Info, fundo: '#EFF6FF', grad: 'linear-gradient(135deg, #2563EB, #3B82F6)' },
  media: { cor: '#D97706', rotulo: 'Prioridade média', icone: BellRing, fundo: '#FEF3E2', grad: 'linear-gradient(135deg, #D97706, #F59E0B)' },
  alta: { cor: '#DC2626', rotulo: 'Alta prioridade', icone: AlertTriangle, fundo: '#FDECEC', grad: 'linear-gradient(135deg, #DC2626, #EF4444)' },
};

export function ModalAvisoGlobal({ aviso, onClose }) {
  const [visivel, setVisivel] = useState(false);
  const importancia = (aviso?.importancia || 'media');
  const ehAlta = importancia === 'alta';
  const diario = aviso?.recorrencia === 'diario';
  const estilo = IMPORTANCIA[importancia] || IMPORTANCIA.media;
  const Icone = estilo.icone;

  useEffect(() => {
    if (!aviso) return;
    requestAnimationFrame(() => setVisivel(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    // Fecha quando a duração do aviso expira.
    let timerExp;
    if (aviso.expiracao_em) {
      const ms = new Date(aviso.expiracao_em).getTime() - Date.now();
      if (ms > 0) timerExp = setTimeout(onClose, ms);
    }
    // Popup de canto (não-alta) some sozinho após alguns segundos.
    // Avisos diários ficam abertos até o usuário fechar.
    const auto = !diario && !ehAlta && AUTOCLOSE_MS[importancia] ? setTimeout(onClose, AUTOCLOSE_MS[importancia]) : null;

    return () => {
      document.removeEventListener('keydown', onKey);
      if (timerExp) clearTimeout(timerExp);
      if (auto) clearTimeout(auto);
    };
  }, [aviso, ehAlta, diario, importancia, onClose]);

  if (!aviso) return null;

  const fmtEncerra = diario && aviso.encerra_em
    ? (() => { try { return new Date(aviso.encerra_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })()
    : null;
  const rotuloRecorrencia = diario && fmtEncerra ? `${estilo.rotulo} · repete todo dia até ${fmtEncerra}` : estilo.rotulo;

  // ── Importância ALTA: modal em tela cheia (requer ação) ──
  if (ehAlta) {
    return React.createElement('div', {
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-label': aviso.titulo || 'Aviso do administrador',
      onClick: onClose,
      style: {
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, opacity: visivel ? 1 : 0, transition: 'opacity 0.2s',
      },
    },
      React.createElement('div', {
        role: 'document',
        onClick: (e) => e.stopPropagation(),
        style: {
          width: '100%', maxWidth: 460,
          borderRadius: 18, overflow: 'hidden',
          background: T.surface, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', transform: visivel ? 'scale(1)' : 'scale(0.96)', transition: 'transform 0.2s',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', background: estilo.fundo, borderBottom: `1px solid ${T.border}` },
        },
          React.createElement('span', { style: { width: 44, height: 44, borderRadius: 12, background: estilo.grad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
            React.createElement(Icone, { size: 24 })),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', { style: { fontSize: 15, fontWeight: 800, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              aviso.titulo || 'Aviso do administrador'),
            React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 2 } }, rotuloRecorrencia),
          ),
          React.createElement('button', {
            onClick: onClose, 'aria-label': 'Fechar aviso', title: 'Fechar',
            style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 6, display: 'flex', flexShrink: 0 },
          }, React.createElement(X, { size: 20 })),
        ),
        React.createElement('div', { style: { padding: '20px 22px', display: 'flex', flexDirection: 'column' } },
          React.createElement('p', { style: { margin: 0, fontSize: 15, lineHeight: '22px', color: T.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, aviso.mensagem),
          React.createElement('div', { style: { marginTop: 22, display: 'flex', justifyContent: 'flex-end' } },
            React.createElement('button', {
              onClick: onClose, autoFocus: true,
              style: { padding: '10px 22px', borderRadius: T.radiusSm, background: estilo.cor, color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
            }, 'Entendi'),
          ),
        ),
      ),
    );
  }

  // ── Importância MÉDIA / BAIXA: popup no canto (não bloqueia) ──
  return React.createElement('div', {
    role: 'alert',
    'aria-live': 'polite',
    onClick: onClose,
    style: {
      position: 'fixed', bottom: 20, right: 20, zIndex: 2900,
      width: 'calc(100% - 40px)', maxWidth: 360, cursor: 'pointer',
      borderRadius: 16, overflow: 'hidden',
      background: T.surface, boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
      border: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      opacity: visivel ? 1 : 0, transform: visivel ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.25s, transform 0.25s',
    },
  },
    React.createElement('div', {
      style: { height: 4, background: estilo.grad, flexShrink: 0 },
    }),
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 11, padding: '14px 14px 12px' } },
      React.createElement('span', { style: { width: 38, height: 38, borderRadius: 11, background: estilo.fundo, color: estilo.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
        React.createElement(Icone, { size: 21 })),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          React.createElement('div', { style: { fontSize: 13, fontWeight: 800, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            aviso.titulo || 'Aviso'),
          React.createElement('button', {
            onClick: (e) => { e.stopPropagation(); onClose(); }, 'aria-label': 'Fechar', title: 'Fechar',
            style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, display: 'flex', flexShrink: 0 },
          }, React.createElement(X, { size: 16 })),
        ),
        React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, marginTop: 1 } }, rotuloRecorrencia),
        React.createElement('p', { style: { margin: '7px 0 0', fontSize: 13, lineHeight: '19px', color: T.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, aviso.mensagem),
      ),
    ),
    React.createElement('div', { style: { padding: '0 14px 11px', display: 'flex', justifyContent: 'flex-end' } },
      React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: estilo.cor, textTransform: 'uppercase', letterSpacing: 0.4 } }, 'Ver detalhes'),
    ),
  );
}
