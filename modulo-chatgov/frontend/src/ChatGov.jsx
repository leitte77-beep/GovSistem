import React, { useState, useCallback, useEffect } from 'react';
import { RailNavegacao } from './components/RailNavegacao';
import { ColunaEsquerda } from './components/ColunaEsquerda';
import { PainelAtendimento } from './components/PainelAtendimento';
import { PainelChatInternoAvancado } from './components/PainelChatInternoAvancado';
import { CentroNotificacoes } from './components/CentroNotificacoes';
import { PaginaConfiguracoes } from './components/PaginaConfiguracoes';
import { PaginaRelatoriosProtocolos } from './components/PaginaRelatoriosProtocolos';
import { PaginaProtocolos } from './components/PaginaProtocolos';
import { PaginaAgenda } from './components/PaginaAgenda';
import { PaginaDashboard } from './components/PaginaDashboard';
import { TelaQR } from './components/TelaQR';
import { ModalGerarProtocolo } from './components/ModalGerarProtocolo';
import { PaginaProtocoloDetalhe } from './components/PaginaProtocoloDetalhe';
import { PaginaConfigProtocolos } from './components/PaginaConfigProtocolos';
import { AgendaCompleta } from './components/agenda/AgendaCompleta';
import { ModalResumoLogin } from './components/agenda/ModalResumoLogin';
import { PopupLembrete } from './components/agenda/PopupLembrete';
import { useLembretesAgenda } from './hooks/useLembretesAgenda';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useBreakpoint } from './hooks/useBreakpoint';
import { T } from './theme';
import { fetchConversa, fetchWhatsAppStatus } from './api';
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
    // `agenda` saiu da lista de propósito: a chave mudou de significado (era a
    // lista de contatos, virou a de compromissos). Quem tinha a antiga salva
    // cai no fallback em vez de aterrissar numa tela que não pediu.
    const VIEWS_VALIDAS = ['atendimento', 'compromissos', 'contatos', 'interno', 'protocolos', 'config-protocolos', 'relatorios', 'notificacoes', 'configuracoes'];
    if (isAdmin) VIEWS_VALIDAS.push('dashboard');
    try {
      const salva = localStorage.getItem('chatgov_view');
      return VIEWS_VALIDAS.includes(salva) ? salva : 'atendimento';
    } catch { return 'atendimento'; }
  });
  const [conversaAtiva, setConversaAtiva] = useState(null);
  const [canalAtivo, setCanalAtivo] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [protocolosRefresh, setProtocolosRefresh] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [waStatus, setWaStatus] = useState({ status: 'desconectado', numero: null });

  // Protocolo
  const [showGerarProtocolo, setShowGerarProtocolo] = useState(false);
  const [protocoloDetalheFull, setProtocoloDetalheFull] = useState(() => {
    var match = window.location.hash.match(/^#\/protocolos\/([^/]+)$/);
    return match ? { id: decodeURIComponent(match[1]) } : null;
  });

  useNotificacoesDesktop({ conversaAtivaId: conversaAtiva?.id });

  // Lembretes da agenda pessoal. Ficam aqui, e não dentro do painel central,
  // porque precisam avisar o atendente esteja ele onde estiver — inclusive com
  // uma conversa aberta ou na tela de relatórios.
  const lembretes = useLembretesAgenda({ ativo: Boolean(auth?.operador?.id) });

  // Reaproveita o caminho que as notificações já usam para abrir uma conversa
  // pelo id: troca de view e carrega a conversa pelo socket.
  const abrirConversaPorId = useCallback((conversaId) => {
    window.dispatchEvent(new CustomEvent('notificacao:abrir-conversa', { detail: { conversaId } }));
  }, []);

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

  useEffect(() => {
    fetchWhatsAppStatus().then(setWaStatus).catch(console.error);
    if (!socket) return;
    const onConectado = (d) => setWaStatus({ status: 'conectado', numero: d?.numero });
    const onDesconectado = () => setWaStatus({ status: 'desconectado', numero: null });
    socket.on('whatsapp:conectado', onConectado);
    socket.on('whatsapp:desconectado', onDesconectado);
    return () => {
      socket.off('whatsapp:conectado', onConectado);
      socket.off('whatsapp:desconectado', onDesconectado);
    };
  }, [socket]);

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
    setProtocoloDetalheFull(null);
    setView(v);
    if (window.location.hash.match(/^#\/protocolos\/[^/]+$/)) {
      window.history.pushState({}, '', v === 'protocolos' ? '#/protocolos' : window.location.pathname);
    }
    try { localStorage.setItem('chatgov_view', v); } catch {}
  }, []);

  const handleVoltar = useCallback(() => {
    setConversaAtiva(null);
    setCanalAtivo(null);
    try { localStorage.removeItem('chatgov_conversa'); } catch {}
    try { localStorage.removeItem('chatgov_canal'); } catch {}
  }, []);

  // `convId` é opcional: quando vem preenchido, só fecha se aquela conversa ainda
  // for a aberta — o atendente pode ter clicado em outra no intervalo entre o
  // pedido e a confirmação, e fechar a tela dele seria pior que não fechar nada.
  const fecharConversa = useCallback((convId) => {
    setConversaAtiva((atual) => {
      if (convId && atual?.id !== convId) return atual;
      try { localStorage.removeItem('chatgov_conversa'); } catch {}
      return null;
    });
  }, []);

  // Exclusão administrativa: quem estiver com a conversa aberta sai dela na
  // hora. O backend passa a recusar leitura e envio, então manter o painel
  // aberto só rende o erro "Conversa não encontrada" no primeiro envio.
  useEffect(() => {
    if (!socket) return undefined;
    const onRemovida = ({ convId }) => {
      setConversaAtiva((atual) => {
        if (atual?.id !== convId) return atual;
        try { localStorage.removeItem('chatgov_conversa'); } catch {}
        return null;
      });
    };
    socket.on('conversa:removida', onRemovida);
    return () => socket.off('conversa:removida', onRemovida);
  }, [socket]);

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

  const handleGerarProtocoloConversa = useCallback(() => setShowGerarProtocolo(true), []);
  const handleProtocoloCriado = useCallback((proto) => {
    setShowGerarProtocolo(false);
    setProtocolosRefresh((n) => n + 1);
    if (proto?.id) {
      setProtocoloDetalheFull(proto);
      window.history.pushState({}, '', '#/protocolos/' + encodeURIComponent(proto.id));
    }
    handleConversaUpdated();
  }, [handleConversaUpdated]);

  const abrirPaginaProtocolo = useCallback((proto) => {
    if (!proto?.id) return;
    setProtocoloDetalheFull(proto);
    window.history.pushState({}, '', '#/protocolos/' + encodeURIComponent(proto.id));
  }, []);

  const handleAbrirProtocolo = useCallback((proto) => {
    if (typeof proto === 'string') {
      // Buscar pelo número
      const token = JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token;
      fetch(`/api/v1/protocols?busca=${encodeURIComponent(proto)}&limite=1`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(lista => {
        if (lista && lista.length > 0) {
          abrirPaginaProtocolo(lista[0]);
        }
      }).catch(() => {});
    } else if (proto?.id) {
      abrirPaginaProtocolo(proto);
    }
  }, [abrirPaginaProtocolo]);

  useEffect(() => {
    const sincronizarRotaProtocolo = () => {
      var match = window.location.hash.match(/^#\/protocolos\/([^/]+)$/);
      setProtocoloDetalheFull(match ? { id: decodeURIComponent(match[1]) } : null);
    };
    window.addEventListener('popstate', sincronizarRotaProtocolo);
    window.addEventListener('hashchange', sincronizarRotaProtocolo);
    return () => {
      window.removeEventListener('popstate', sincronizarRotaProtocolo);
      window.removeEventListener('hashchange', sincronizarRotaProtocolo);
    };
  }, []);

  const handleVoltarProtocolos = useCallback(() => {
    setProtocoloDetalheFull(null);
    window.history.pushState({}, '', '#/protocolos');
  }, []);

  // A conversa selecionada chega da lista como um retrato do instante do clique.
  // Setor, responsável e status mudam depois (encaminhar, assumir, devolver,
  // reabrir), e o painel precisa desses campos frescos — senão continua exibindo
  // avisos que já não valem, como "sem setor responsável" numa conversa já
  // encaminhada. Mantemos o objeto sincronizado com o servidor.
  const conversaAtivaId = conversaAtiva?.id;
  useEffect(() => {
    if (!conversaAtivaId) return undefined;
    let cancelado = false;
    let debounce = null;

    const sincronizar = () => {
      fetchConversa(conversaAtivaId)
        .then((fresca) => {
          if (cancelado || !fresca || fresca.id !== conversaAtivaId) return;
          setConversaAtiva((atual) => (
            atual?.id === fresca.id && JSON.stringify(atual) === JSON.stringify(fresca)
              ? atual   // nada mudou: preserva a identidade e evita re-render do painel
              : fresca
          ));
        })
        .catch((err) => {
          // A conversa deixou de existir (exclusão administrativa): fecha o
          // painel em vez de deixar o atendente escrevendo numa tela morta.
          if (!cancelado && err?.name === 'ConversaRemovidaError') fecharConversa();
        });
    };

    sincronizar();

    if (!socket) return () => { cancelado = true; };
    // 'conversa:atualizada' também dispara a cada tique de entrega/leitura:
    // coalescemos os eventos para não virar uma enxurrada de GETs.
    const onAtualizada = ({ convId }) => {
      if (convId !== conversaAtivaId) return;
      clearTimeout(debounce);
      debounce = setTimeout(sincronizar, 600);
    };
    socket.on('conversa:atualizada', onAtualizada);
    return () => {
      cancelado = true;
      clearTimeout(debounce);
      socket.off('conversa:atualizada', onAtualizada);
    };
  }, [socket, conversaAtivaId, recarregar, fecharConversa]);

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
      view, onChange: handleChangeView, isAdmin, verRelatorios, notifCount, breakpoint, waStatus,
    }),

    // Views de tela cheia
    protocoloDetalheFull
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaProtocoloDetalhe, {
            protocoloId: protocoloDetalheFull.id,
            onVoltar: handleVoltarProtocolos,
            onAtualizado: handleConversaUpdated,
            breakpoint,
          }),
        )
      : view === 'dashboard' && isAdmin
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaDashboard, { breakpoint }),
        )
      : view === 'configuracoes'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaConfiguracoes, { onOpenQR: () => setShowQR(true), breakpoint }),
        )
      : view === 'relatorios'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaRelatoriosProtocolos, { breakpoint }),
        )
      : view === 'protocolos'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaProtocolos, {
            breakpoint,
            refreshKey: protocolosRefresh,
            onAbrirProtocolo: handleAbrirProtocolo,
            onCriarProtocolo: () => setShowGerarProtocolo(true),
          }),
        )
      : view === 'config-protocolos' && isAdmin
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(PaginaConfigProtocolos, { breakpoint }),
        )
      : view === 'notificacoes'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(CentroNotificacoes, { onCountChange: setNotifCount }),
        )
      : view === 'compromissos'
      ? React.createElement('div', { style: pageShellStyle },
          React.createElement(AgendaCompleta, {
            modo: 'pagina',
            breakpoint,
            onAbrirConversa: abrirConversaPorId,
          }),
        )
      : view === 'contatos'
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
                    // Usado pelo painel do cidadão para pular para um atendimento
                    // anterior do mesmo contato.
                    onAbrirConversa: (convId) => handleSelectConversa({ id: convId }),
                    onEncerrada: fecharConversa,
                    onGerarProtocolo: handleGerarProtocoloConversa,
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
                    onAbrirConversa: (convId) => handleSelectConversa({ id: convId }),
                    onEncerrada: fecharConversa,
                    onGerarProtocolo: handleGerarProtocoloConversa,
                  })
                : React.createElement(PainelChatInternoAvancado, { canal: canalAtivo, breakpoint }),
            ),
          ),

    showQR && React.createElement(TelaQR, { onClose: () => setShowQR(false) }),

    // Resumo do dia: decide sozinho se deve aparecer (só quando há compromisso
    // de hoje, pendência atrasada ou item urgente).
    React.createElement(ModalResumoLogin, {
      operadorNome: auth?.operador?.nome,
      onAbrirConversa: abrirConversaPorId,
      breakpoint,
    }),

    lembretes.atual && React.createElement(PopupLembrete, {
      lembrete: lembretes.atual,
      restantes: lembretes.restantes,
      ocupado: lembretes.ocupado,
      onDispensar: lembretes.dispensar,
      onAdiar: lembretes.adiar,
      onConcluir: lembretes.concluir,
      onAbrirConversa: abrirConversaPorId,
      breakpoint,
    }),

    showGerarProtocolo && React.createElement(ModalGerarProtocolo, {
      conversa: view === 'atendimento' ? conversaAtiva : null,
      onClose: () => setShowGerarProtocolo(false),
      onCriado: handleProtocoloCriado,
    }),

  );
}
