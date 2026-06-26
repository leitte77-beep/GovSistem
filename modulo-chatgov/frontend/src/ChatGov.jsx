import React, { useState, useCallback, useEffect } from 'react';
import { RailNavegacao } from './components/RailNavegacao';
import { ColunaEsquerda } from './components/ColunaEsquerda';
import { PainelAtendimento } from './components/PainelAtendimento';
import { PainelChatInternoAvancado } from './components/PainelChatInternoAvancado';
import { PainelKanban } from './components/PainelKanban';
import { PainelArquivos } from './components/PainelArquivos';
import { PainelReunioes } from './components/PainelReunioes';
import { PainelWiki } from './components/PainelWiki';
import { CentroNotificacoes } from './components/CentroNotificacoes';
import { PaginaConfiguracoes } from './components/PaginaConfiguracoes';
import { PaginaAgenda } from './components/PaginaAgenda';
import { TelaQR } from './components/TelaQR';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { T } from './theme';
import { fetchNotificacoesStatus } from './api/evolucoes';
import { useNotificacoesDesktop } from './hooks/useNotificacoesDesktop';

export function ChatGov() {
  const { auth } = useAuth();
  const { socket, connected } = useSocket();
  const isAdmin = auth?.operador?.papel === 'admin';

  const [view, setView] = useState(() => {
    try { return localStorage.getItem('chatgov_view') || 'atendimento'; }
    catch { return 'atendimento'; }
  });
  const [conversaAtiva, setConversaAtiva] = useState(null);
  const [canalAtivo, setCanalAtivo] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  // ── Desktop push notifications ──
  useNotificacoesDesktop({ conversaAtivaId: conversaAtiva?.id });

  // ── Polling do badge a cada 10s ──
  useEffect(() => {
    if (!connected) return;

    const atualizar = () => {
      fetchNotificacoesStatus()
        .then(({ total }) => setNotifCount(total || 0))
        .catch(() => {});
    };

    atualizar();
    const interval = setInterval(atualizar, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  const handleSelectConversa = useCallback((c) => {
    setConversaAtiva(c);
    setCanalAtivo(null);
    if (c?.id) {
      try { localStorage.setItem('chatgov_conversa', c.id); } catch {}
    } else {
      try { localStorage.removeItem('chatgov_conversa'); } catch {}
    }
  }, []);

  const handleSelectCanal = useCallback((c) => {
    setCanalAtivo(c);
    setConversaAtiva(null);
    if (c?.id) {
      try { localStorage.setItem('chatgov_canal', c.id); } catch {}
    } else {
      try { localStorage.removeItem('chatgov_canal'); } catch {}
    }
  }, []);

  const handleChangeView = useCallback((v) => {
    setView(v);
    try { localStorage.setItem('chatgov_view', v); } catch {}
  }, []);

  // ── Handler: clique em notificação desktop abre a conversa ──
  useEffect(() => {
    if (!socket) return;

    const handler = (e) => {
      const { conversaId } = e.detail;
      handleChangeView('atendimento');
      socket.timeout(5000).emit('conversa:abrir', conversaId, (conv) => {
        if (conv) handleSelectConversa(conv);
      });
    };

    window.addEventListener('notificacao:abrir-conversa', handler);
    return () => window.removeEventListener('notificacao:abrir-conversa', handler);
  }, [socket, handleChangeView, handleSelectConversa]);

  const handleConversaUpdated = useCallback(() => setRecarregar((n) => n + 1), []);

  const isFullScreen = ['kanban', 'arquivos', 'reunioes', 'wiki', 'configuracoes', 'notificacoes'].includes(view);

  return React.createElement('div', {
    style: {
      display: 'flex', height: '100%', width: '100%', overflow: 'hidden',
      background: T.bg, fontFamily: T.font, color: T.text,
    },
  },
    React.createElement(RailNavegacao, {
      view, onChange: handleChangeView, isAdmin, notifCount,
    }),

    view === 'configuracoes'
      ? React.createElement(PaginaConfiguracoes, { onOpenQR: () => setShowQR(true) })
      : view === 'kanban'
      ? React.createElement(PainelKanban)
      : view === 'arquivos'
      ? React.createElement(PainelArquivos)
      : view === 'reunioes'
      ? React.createElement(PainelReunioes)
      : view === 'wiki'
      ? React.createElement(PainelWiki)
      : view === 'notificacoes'
      ? React.createElement(CentroNotificacoes, { onCountChange: setNotifCount })
      :       view === 'agenda'
      ? React.createElement(PaginaAgenda, {
          onSendMessage: (conv) => {
            handleChangeView('atendimento');
            handleSelectConversa(conv);
          },
        })
      : React.createElement(React.Fragment, null,
          React.createElement(ColunaEsquerda, {
            view,
            onSelectConversa: handleSelectConversa,
            onSelectCanal: handleSelectCanal,
            onOpenQR: () => setShowQR(true),
            conversaAtivaId: conversaAtiva?.id,
            canalAtivoId: canalAtivo?.id,
            recarregar,
          }),
          view === 'atendimento'
            ? React.createElement(PainelAtendimento, {
                conversa: conversaAtiva,
                onConversaUpdated: handleConversaUpdated,
              })
            : React.createElement(PainelChatInternoAvancado, { canal: canalAtivo }),
        ),

    showQR && React.createElement(TelaQR, { onClose: () => setShowQR(false) }),
  );
}
