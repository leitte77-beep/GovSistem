import React, { useState, useCallback, useEffect } from 'react';
import { RailNavegacao } from './components/RailNavegacao';
import { ColunaEsquerda } from './components/ColunaEsquerda';
import { PainelAtendimento } from './components/PainelAtendimento';
import { PainelChatInternoAvancado } from './components/PainelChatInternoAvancado';
import { CentroNotificacoes } from './components/CentroNotificacoes';
import { PaginaConfiguracoes } from './components/PaginaConfiguracoes';
import { PaginaRelatorios } from './components/PaginaRelatorios';
import { PaginaProtocolos } from './components/PaginaProtocolos';
import { PaginaAgenda } from './components/PaginaAgenda';
import { TelaQR } from './components/TelaQR';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useBreakpoint } from './hooks/useBreakpoint';
import { T } from './theme';
import { fetchNotificacoesStatus } from './api/evolucoes';
import { useNotificacoesDesktop } from './hooks/useNotificacoesDesktop';

export function ChatGov() {
  const { auth } = useAuth();
  const { socket, connected } = useSocket();
  const breakpoint = useBreakpoint();
  const isAdmin = auth?.operador?.papel === 'admin';
  const verRelatorios = isAdmin || auth?.operador?.papel === 'supervisor';
  const ehMobile = breakpoint === 'mobile';

  const [view, setView] = useState(() => {
    const VIEWS_VALIDAS = ['atendimento', 'agenda', 'interno', 'protocolos', 'relatorios', 'notificacoes', 'configuracoes'];
    try {
      const salva = localStorage.getItem('chatgov_view');
      return VIEWS_VALIDAS.includes(salva) ? salva : 'atendimento';
    } catch { return 'atendimento'; }
  });
  const [conversaAtiva, setConversaAtiva] = useState(null);
  const [canalAtivo, setCanalAtivo] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useNotificacoesDesktop({ conversaAtivaId: conversaAtiva?.id });

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

  const handleVoltar = useCallback(() => {
    setConversaAtiva(null);
    setCanalAtivo(null);
    try { localStorage.removeItem('chatgov_conversa'); } catch {}
    try { localStorage.removeItem('chatgov_canal'); } catch {}
  }, []);

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

  const mostrarListaMobile = ehMobile && !conversaAtiva && !canalAtivo;
  const mostrarPainelMobile = ehMobile && (conversaAtiva || canalAtivo);

  // No celular, quando um chat está aberto (atendimento/equipe), ocupamos a tela
  // inteira e escondemos a barra inferior — exatamente como o WhatsApp faz.
  const ehViewChat = view === 'atendimento' || view === 'interno';
  const chatMobileAberto = mostrarPainelMobile && ehViewChat;

  const containerStyle = {
    display: 'flex',
    flexDirection: ehMobile ? 'column' : 'row',
    height: '100%', width: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    background: T.bg, fontFamily: T.font, color: T.text,
    paddingBottom: ehMobile && !chatMobileAberto ? 'calc(70px + env(safe-area-inset-bottom, 0px))' : 0,
    boxSizing: 'border-box',
  };

  const pageShellStyle = {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  return React.createElement('div', { style: containerStyle },
    // Rail: lateral no desktop/tablet, bottom-tab fixo no mobile.
    // Some quando um chat está aberto no celular (tela cheia, estilo WhatsApp).
    !chatMobileAberto && React.createElement(RailNavegacao, {
      view, onChange: handleChangeView, isAdmin, verRelatorios, notifCount, breakpoint,
    }),

    // Views de tela cheia
    view === 'configuracoes'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaConfiguracoes, { onOpenQR: () => setShowQR(true), breakpoint }),
        )
      : view === 'relatorios'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaRelatorios),
        )
      : view === 'protocolos'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaProtocolos, { breakpoint }),
        )
      : view === 'notificacoes'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(CentroNotificacoes, { onCountChange: setNotifCount }),
        )
      : view === 'agenda'
      ? (ehMobile
          ? React.createElement('div', { style: { ...pageShellStyle, overflow: 'hidden' } },
              React.createElement(PaginaAgenda, {
                breakpoint,
                onSendMessage: (conv) => {
                  handleChangeView('atendimento');
                  handleSelectConversa(conv);
                },
              }),
            )
          : React.createElement(PaginaAgenda, {
              breakpoint,
              onSendMessage: (conv) => {
                handleChangeView('atendimento');
                handleSelectConversa(conv);
              },
            })
        )
      : // Views chat (atendimento / interno)
        ehMobile
        ? React.createElement(React.Fragment, null,
            mostrarListaMobile && React.createElement(ColunaEsquerda, {
              view,
              onChange: handleChangeView,
              onSelectConversa: handleSelectConversa,
              onSelectCanal: handleSelectCanal,
              onOpenQR: () => setShowQR(true),
              conversaAtivaId: conversaAtiva?.id,
              canalAtivoId: canalAtivo?.id,
              recarregar,
              breakpoint,
            }),
            mostrarPainelMobile && React.createElement('div', { style: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 } },
              view === 'atendimento'
                ? React.createElement(PainelAtendimento, {
                    conversa: conversaAtiva,
                    onConversaUpdated: handleConversaUpdated,
                    breakpoint,
                    onVoltar: handleVoltar,
                  })
                : React.createElement(PainelChatInternoAvancado, {
                    canal: canalAtivo,
                    breakpoint,
                    onVoltar: handleVoltar,
                  }),
            ),
          )
        : React.createElement(React.Fragment, null,
            React.createElement(ColunaEsquerda, {
              view,
              onChange: handleChangeView,
              onSelectConversa: handleSelectConversa,
              onSelectCanal: handleSelectCanal,
              onOpenQR: () => setShowQR(true),
              conversaAtivaId: conversaAtiva?.id,
              canalAtivoId: canalAtivo?.id,
              recarregar,
              breakpoint,
            }),
            React.createElement('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
              view === 'atendimento'
                ? React.createElement(PainelAtendimento, {
                    conversa: conversaAtiva,
                    onConversaUpdated: handleConversaUpdated,
                    breakpoint,
                  })
                : React.createElement(PainelChatInternoAvancado, { canal: canalAtivo, breakpoint }),
            ),
          ),

    showQR && React.createElement(TelaQR, { onClose: () => setShowQR(false) }),
  );
}
