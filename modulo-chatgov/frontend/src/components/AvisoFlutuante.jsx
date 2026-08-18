import React, { useCallback, useEffect, useState } from 'react';
import { Check, Megaphone, X } from 'lucide-react';
import { fetchAvisosPendentes, marcarAvisoLidoApi } from '../api/evolucoes';
import { useSocket } from '../context/SocketContext';
import { T } from '../theme';

const VISUAL = {
  informativo: { cor: '#2563EB', fundo: '#EFF6FF', rotulo: 'Informativo' },
  importante: { cor: '#B45309', fundo: '#FFF7ED', rotulo: 'Importante' },
  urgente: { cor: '#DC2626', fundo: '#FEF2F2', rotulo: 'Urgente' },
};

export function AvisoFlutuante() {
  const { socket, connected } = useSocket();
  const [avisos, setAvisos] = useState([]);
  const [ocultados, setOcultados] = useState(() => new Set());
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    if (!connected) return;
    fetchAvisosPendentes()
      .then((lista) => setAvisos(Array.isArray(lista) ? lista : []))
      .catch((err) => console.error('[Avisos] carregar:', err.message));
  }, [connected]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!socket) return undefined;
    const atualizar = () => {
      carregar();
    };
    socket.on('aviso:atualizado', atualizar);
    socket.on('aviso:lido', atualizar);
    return () => {
      socket.off('aviso:atualizado', atualizar);
      socket.off('aviso:lido', atualizar);
    };
  }, [socket, carregar]);

  const aviso = avisos.find((item) => !ocultados.has(item.id));
  if (!aviso) return null;
  const visual = VISUAL[aviso.prioridade] || VISUAL.informativo;
  const restantes = avisos.filter((item) => item.id !== aviso.id && !ocultados.has(item.id)).length;

  const retirar = () => setOcultados((atuais) => new Set([...atuais, aviso.id]));
  const fechar = async () => {
    if (aviso.exige_confirmacao) return retirar();
    setSalvando(true);
    try {
      await marcarAvisoLidoApi(aviso.id, false);
      retirar();
    } finally {
      setSalvando(false);
    }
  };
  const confirmar = async () => {
    setSalvando(true);
    try {
      await marcarAvisoLidoApi(aviso.id, true);
      setAvisos((lista) => lista.filter((item) => item.id !== aviso.id));
    } catch (err) {
      console.error('[Avisos] confirmar:', err.message);
    } finally {
      setSalvando(false);
    }
  };

  return React.createElement(React.Fragment, null,
    React.createElement('style', null, `
      @keyframes avisoChatgovEntrar { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .aviso-chatgov { animation: none !important; } }
    `),
    React.createElement('aside', {
      className: 'aviso-chatgov', role: 'dialog', 'aria-modal': 'false',
      'aria-labelledby': `aviso-titulo-${aviso.id}`,
      style: {
        position: 'fixed', right: 20, bottom: 22, zIndex: 3200,
        width: 'min(380px, calc(100vw - 32px))', background: T.surface,
        border: `1px solid ${T.borderStrong}`, borderRadius: 14,
        boxShadow: '0 18px 48px rgba(15, 23, 42, .24)', overflow: 'hidden',
        animation: 'avisoChatgovEntrar .24s ease-out',
      },
    },
      React.createElement('div', { style: { height: 5, background: visual.cor } }),
      React.createElement('div', { style: { padding: '15px 16px 14px', display: 'grid', gap: 11 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 11 } },
          React.createElement('div', {
            style: {
              width: 36, height: 36, borderRadius: 10, background: visual.fundo,
              color: visual.cor, display: 'grid', placeItems: 'center', flexShrink: 0,
            },
          }, React.createElement(Megaphone, { size: 19 })),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', {
              style: { fontSize: 10, fontWeight: 800, letterSpacing: 1.1, color: visual.cor, textTransform: 'uppercase' },
            }, `Comunicado interno · ${visual.rotulo}`),
            React.createElement('h3', {
              id: `aviso-titulo-${aviso.id}`,
              style: { margin: '4px 0 0', fontSize: 16, lineHeight: 1.3, color: T.text, letterSpacing: -0.15 },
            }, aviso.titulo),
          ),
          React.createElement('button', {
            type: 'button', onClick: fechar, disabled: salvando,
            'aria-label': aviso.exige_confirmacao ? 'Ler este aviso depois' : 'Fechar aviso',
            style: { border: 0, background: 'transparent', color: T.textMuted, padding: 2, cursor: 'pointer' },
          }, React.createElement(X, { size: 18 })),
        ),
        React.createElement('p', {
          style: { margin: 0, color: T.textSecondary, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' },
        }, aviso.mensagem),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 9 } },
          React.createElement('span', { style: { flex: 1, color: T.textMuted, fontSize: 11.5 } },
            restantes > 0 ? `Mais ${restantes} aviso(s) depois deste` : (aviso.autor_nome ? `Publicado por ${aviso.autor_nome}` : 'Aviso da administração'),
          ),
          React.createElement('button', {
            type: 'button', onClick: aviso.exige_confirmacao ? confirmar : fechar, disabled: salvando,
            style: {
              minHeight: 36, padding: '0 13px', border: 0, borderRadius: 8,
              background: visual.cor, color: '#fff', fontSize: 12.5, fontWeight: 750,
              cursor: salvando ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            },
          }, React.createElement(Check, { size: 15 }), salvando ? 'Registrando...' : (aviso.exige_confirmacao ? 'Li e entendi' : 'Marcar como lido')),
        ),
      ),
    ),
  );
}
