import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Paperclip, Smile, ShieldCheck, Clock, UserPlus, CheckCircle2, Building2, MessageSquare, Tag, StickyNote, ChevronDown, Archive, Trash2, ArrowRightLeft, Undo2, UserCheck, X, MoreVertical, ArrowDown, Loader2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { BolhaConversa } from './BolhaConversa';
import { DeptBadge } from './DeptBadge';
import { ModalParticipantes } from './ModalParticipantes';
import { ModalTransferir } from './ModalTransferir';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fetchMensagens, fetchDepartamentos, fetchTemplates, fetchEtiquetas, fetchEtiquetasConversa, fetchNotasInternas, editarContato, fetchTransferenciaPendente, excluirMensagemConversa } from '../api';
import { mimeParaTipo, encodeFileBase64 } from '../utils/arquivo';
import { T } from '../theme';

const EMOJIS_RAPIDOS = ['😀', '😅', '👍', '🙏', '❤️', '😊', '👏', '✅', '⚠️', '📎'];
const PERTO_DO_FIM_PX = 120;
const MAX_MIDIA_BYTES = 16 * 1024 * 1024; // 16 MB (limite prático do WhatsApp)

// Preenche variáveis de template com dados da conversa.
function aplicarVariaveis(texto, conversa) {
  if (!texto) return texto;
  return texto
    .replace(/\{\{\s*nome\s*\}\}/gi, conversa?.contato_nome || conversa?.contato_telefone || '')
    .replace(/\{\{\s*telefone\s*\}\}/gi, conversa?.contato_telefone || '')
    .replace(/\{\{\s*protocolo\s*\}\}/gi, conversa?.protocolo || conversa?.protocolo_numero || '')
    .replace(/\{\{\s*data\s*\}\}/gi, new Date().toLocaleDateString('pt-BR'));
}

export function PainelAtendimento({ conversa, onConversaUpdated }) {
  const { socket, connected } = useSocket();
  const { auth } = useAuth();
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [departamentos, setDepartamentos] = useState([]);
  const [showEncaminhar, setShowEncaminhar] = useState(false);
  const [showParticipantes, setShowParticipantes] = useState(false);
  const [showTransferir, setShowTransferir] = useState(false);
  const [transferencia, setTransferencia] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showEtiquetas, setShowEtiquetas] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [etiquetas, setEtiquetas] = useState([]);
  const [etiquetasConv, setEtiquetasConv] = useState([]);
  const [notas, setNotas] = useState([]);
  const [notaTexto, setNotaTexto] = useState('');
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEdit, setNomeEdit] = useState('');
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const [clienteDigitando, setClienteDigitando] = useState(false);
  const [botDigitando, setBotDigitando] = useState(null); // null | 'iris' | 'chatbot'
  const [conversaStatus, setConversaStatus] = useState(conversa?.status);
  const [showMenuMais, setShowMenuMais] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const areaMensagensRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const pertoDoFimRef = useRef(true);
  const dragCounterRef = useRef(0);

  // Toast simples (substitui alerts). Auto-some em 3.5s.
  const notificar = useCallback((mensagem, tipo = 'info') => {
    setToast({ mensagem, tipo });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Modal de confirmação (substitui confirm/prompt). `comInput` habilita um campo.
  const pedirConfirmacao = useCallback((opcoes) => setConfirmacao(opcoes), []);

  const opId = auth?.operador?.id;
  const ehGestor = ['admin', 'supervisor'].includes(auth?.operador?.papel);
  const souDono = conversa?.operador_id && conversa.operador_id === opId;
  const semDono = conversa && !conversa.operador_id;

  useEffect(() => { setConversaStatus(conversa?.status); }, [conversa?.id, conversa?.status]);
  const podeGerir = souDono || ehGestor;
  const transfParaMim = transferencia && transferencia.para_operador_id === opId;

  useEffect(() => {
    if (!conversa) return;
    const ac = new AbortController();
    setMensagens([]);
    setTemMais(false);
    setNovasAbaixo(0);
    setClienteDigitando(false);
    setBotDigitando(null);
    pertoDoFimRef.current = true;
    fetchMensagens(conversa.id, { signal: ac.signal })
      .then(({ mensagens, temMais }) => { setMensagens(mensagens); setTemMais(temMais); })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e); });
    fetchDepartamentos().then(setDepartamentos).catch(console.error);
    fetchTemplates().then(setTemplates).catch(console.error);
    fetchEtiquetas().then(setEtiquetas).catch(console.error);
    fetchEtiquetasConversa(conversa.id).then(setEtiquetasConv).catch(console.error);
    fetchNotasInternas(conversa.id).then(setNotas).catch(console.error);
    fetchTransferenciaPendente(conversa.id).then(setTransferencia).catch(() => setTransferencia(null));
    socket?.emit('conversa:abrir', conversa.id);
    return () => ac.abort();
  }, [conversa?.id, socket]);

  // Carrega o lote anterior (scroll infinito) preservando a posição visual.
  const carregarMais = useCallback(() => {
    if (carregandoMais || !temMais || mensagens.length === 0) return;
    const area = areaMensagensRef.current;
    const alturaAntes = area ? area.scrollHeight : 0;
    setCarregandoMais(true);
    fetchMensagens(conversa.id, { antesDe: mensagens[0].criado_em })
      .then(({ mensagens: antigas, temMais: mais }) => {
        setMensagens((prev) => [...antigas, ...prev]);
        setTemMais(mais);
        requestAnimationFrame(() => {
          if (area) area.scrollTop = area.scrollHeight - alturaAntes;
        });
      })
      .catch(console.error)
      .finally(() => setCarregandoMais(false));
  }, [carregandoMais, temMais, mensagens, conversa?.id]);

  useEffect(() => {
    if (!socket) return;
    const onNova = (msg) => {
      setMensagens((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      // Se o usuário não está no fim, conta como "nova mensagem abaixo".
      if (!pertoDoFimRef.current && msg.direcao === 'entrada') {
        setNovasAbaixo((n) => n + 1);
      }
    };
    const onStatus = ({ waMessageId, status }) =>
      setMensagens((prev) => prev.map((m) => (m.wa_message_id === waMessageId ? { ...m, status } : m)));
    const onReacao = ({ mensagemId, emoji }) =>
      setMensagens((prev) => prev.map((m) => (m.id === mensagemId ? { ...m, reacao: emoji } : m)));
    const onExcluida = ({ mensagemId }) =>
      setMensagens((prev) => prev.map((m) => (m.id === mensagemId ? { ...m, excluida: true, conteudo: null, media_url: null } : m)));
    const onPresenca = ({ convId, digitando, estado, bot }) => {
      if (convId === conversa?.id) {
        if (estado === 'bot_digitando') {
          setClienteDigitando(false);
          setBotDigitando(bot || 'bot');
        } else {
          setBotDigitando(null);
          setClienteDigitando(!!digitando);
        }
      }
    };
    socket.on('mensagem:nova', onNova);
    socket.on('mensagem:status', onStatus);
    socket.on('mensagem:reacao', onReacao);
    socket.on('mensagem:excluida', onExcluida);
    socket.on('cliente:presenca', onPresenca);
    const onConvAtualizada = ({ convId }) => {
      if (convId === conversa?.id) {
        // Atualiza status da conversa ativa quando reaberta (ex: resolved → fila)
        setConversaStatus('fila');
      }
    };
    socket.on('conversa:atualizada', onConvAtualizada);
    const onNotaNova = (nota) => setNotas((prev) => [nota, ...prev]);
    socket.on('nota:nova', onNotaNova);
    const onTransferencia = ({ convId }) => {
      if (convId === conversa?.id) {
        fetchTransferenciaPendente(convId).then(setTransferencia).catch(() => {});
      }
    };
    socket.on('transferencia:nova', onTransferencia);
    return () => {
      socket.off('mensagem:nova', onNova);
      socket.off('mensagem:status', onStatus);
      socket.off('mensagem:reacao', onReacao);
      socket.off('mensagem:excluida', onExcluida);
      socket.off('cliente:presenca', onPresenca);
      socket.off('conversa:atualizada', onConvAtualizada);
      socket.off('nota:nova', onNotaNova);
      socket.off('transferencia:nova', onTransferencia);
    };
  }, [socket, conversa?.id]);

  // Auto-scroll inteligente: só rola ao fim se o usuário já estava perto do fim.
  useEffect(() => {
    const area = areaMensagensRef.current;
    if (!area) return;
    if (pertoDoFimRef.current) {
      area.scrollTop = area.scrollHeight;
    }
  }, [mensagens]);

  const aoRolar = useCallback(() => {
    const area = areaMensagensRef.current;
    if (!area) return;
    const perto = area.scrollHeight - area.scrollTop - area.clientHeight <= PERTO_DO_FIM_PX;
    pertoDoFimRef.current = perto;
    if (perto && novasAbaixo) setNovasAbaixo(0);
    if (area.scrollTop <= 40 && temMais && !carregandoMais) carregarMais();
  }, [novasAbaixo, temMais, carregandoMais, carregarMais]);

  const irParaOFim = useCallback(() => {
    const area = areaMensagensRef.current;
    if (area) area.scrollTop = area.scrollHeight;
    pertoDoFimRef.current = true;
    setNovasAbaixo(0);
  }, []);

  const enviar = (e) => {
    e?.preventDefault();
    const txt = texto.trim();
    if (!txt || !conversa || enviando) return;
    if (!socket || !connected) {
      setErroEnvio('Conexão em tempo real indisponível. Recarregue a página e tente novamente.');
      return;
    }

    setEnviando(true);
    setErroEnvio('');
    socket.timeout(8000).emit('mensagem:enviar', { convId: conversa.id, jid: conversa.wa_jid, texto: txt }, (err, ack) => {
      setEnviando(false);
      if (err) {
        setErroEnvio('Tempo esgotado ao enviar. Verifique a conexão e tente novamente.');
        inputRef.current?.focus();
        return;
      }
      if (!ack?.ok) {
        setErroEnvio(ack?.erro || 'Não foi possível enviar a mensagem.');
        inputRef.current?.focus();
        return;
      }
      if (ack.mensagem) {
        setMensagens((prev) => prev.some((m) => m.id === ack.mensagem.id) ? prev : [...prev, ack.mensagem]);
      }
      setTexto('');
      inputRef.current?.focus();
      irParaOFim();
      onConversaUpdated?.();
    });
  };

  const encaminhar = (depId) => {
    socket?.emit('conversa:atribuir', { convId: conversa.id, departamentoId: depId, operadorId: opId });
    setShowEncaminhar(false);
    onConversaUpdated?.();
  };

  const assumir = () => {
    socket?.emit('conversa:assumir', conversa.id, (ack) => {
      if (ack?.ok) onConversaUpdated?.();
      else notificar(ack?.erro || 'Não foi possível assumir a conversa.', 'erro');
    });
  };

  const devolver = () => {
    pedirConfirmacao({
      titulo: 'Devolver conversa',
      texto: 'Devolver esta conversa para a fila do setor? Você deixará de ser o responsável.',
      confirmarLabel: 'Devolver',
      onConfirm: () => socket?.emit('conversa:devolver', conversa.id, (ack) => {
        if (ack?.ok) onConversaUpdated?.();
        else notificar(ack?.erro || 'Não foi possível devolver a conversa.', 'erro');
      }),
    });
  };

  const responderTransferencia = (aceitar) => {
    if (!aceitar) {
      pedirConfirmacao({
        titulo: 'Recusar transferência',
        texto: 'Você pode informar o motivo da recusa (opcional).',
        comInput: true,
        inputPlaceholder: 'Motivo da recusa',
        confirmarLabel: 'Recusar',
        perigoso: true,
        onConfirm: (motivo) => socket?.emit('conversa:transferencia-responder', { transferenciaId: transferencia.id, aceitar: false, motivo: motivo || null }, (ack) => {
          if (ack?.ok) { setTransferencia(null); onConversaUpdated?.(); }
          else notificar(ack?.erro || 'Não foi possível responder à transferência.', 'erro');
        }),
      });
      return;
    }
    socket?.emit('conversa:transferencia-responder', { transferenciaId: transferencia.id, aceitar: true, motivo: null }, (ack) => {
      if (ack?.ok) { setTransferencia(null); onConversaUpdated?.(); }
      else notificar(ack?.erro || 'Não foi possível responder à transferência.', 'erro');
    });
  };

  const excluirMsg = (msg) => {
    pedirConfirmacao({
      titulo: 'Excluir mensagem',
      texto: 'Excluir esta mensagem? Se possível, ela também será apagada no WhatsApp do cidadão.',
      confirmarLabel: 'Excluir',
      perigoso: true,
      onConfirm: () => {
        excluirMensagemConversa(conversa.id, msg.id)
          .then(() => setMensagens((prev) => prev.map((m) => (m.id === msg.id ? { ...m, excluida: true, conteudo: null, media_url: null } : m))))
          .catch((e) => notificar(e.message || 'Erro ao excluir.', 'erro'));
      },
    });
  };

  const resolver = () => {
    socket?.emit('conversa:resolver', conversa.id, (ack) => {
      if (ack?.ok) {
        onConversaUpdated?.();
      } else {
        console.error('Erro ao resolver:', ack?.erro);
      }
    });
  };

  const salvarNomeContato = async () => {
    if (!nomeEdit.trim()) return;
    try {
      await editarContato(conversa.contato_id, { nome: nomeEdit.trim() });
      setEditandoNome(false);
      onConversaUpdated?.();
    } catch (e) {
      console.error('Erro ao salvar nome:', e);
    }
  };

  const arquivar = () => {
    socket?.emit('conversa:arquivar', conversa.id, (ack) => {
      if (ack?.ok) {
        onConversaUpdated?.();
      }
    });
  };

  const desarquivar = () => {
    socket?.emit('conversa:desarquivar', conversa.id, (ack) => {
      if (ack?.ok) {
        onConversaUpdated?.();
      }
    });
  };

  const excluirConversa = () => {
    pedirConfirmacao({
      titulo: 'Excluir conversa',
      texto: 'Tem certeza que deseja excluir permanentemente esta conversa? Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      perigoso: true,
      onConfirm: () => socket?.emit('conversa:excluir', conversa.id, (ack) => {
        if (ack?.ok) onConversaUpdated?.();
        else notificar(ack?.erro || 'Não foi possível excluir a conversa.', 'erro');
      }),
    });
  };

  const aplicarTemplate = (conteudo) => {
    // Preenche o composer com as variáveis substituídas, permitindo revisão antes do envio.
    setTexto((t) => (t ? `${t} ${aplicarVariaveis(conteudo, conversa)}` : aplicarVariaveis(conteudo, conversa)));
    setShowTemplates(false);
    inputRef.current?.focus();
  };

  const enviarMidia = async (file) => {
    if (!file || !conversa) return;
    if (!socket || !connected) {
      setErroEnvio('Conexão em tempo real indisponível.');
      return;
    }
    if (file.size > MAX_MIDIA_BYTES) {
      notificar('Arquivo muito grande (máx. 16 MB).', 'erro');
      return;
    }
    setAnexando(true);
    setErroEnvio('');
    try {
      const dataUrl = await encodeFileBase64(file);
      const mediaBase64 = String(dataUrl).split(',')[1];
      socket.timeout(30000).emit('mensagem:enviar', {
        convId: conversa.id,
        jid: conversa.wa_jid,
        texto: texto.trim() || undefined,
        tipo: mimeParaTipo(file.type),
        mediaBase64,
        mediaMime: file.type || 'application/octet-stream',
        mediaNome: file.name,
      }, (err, ack) => {
        setAnexando(false);
        if (err) { setErroEnvio('Tempo esgotado ao enviar o arquivo.'); return; }
        if (!ack?.ok) { setErroEnvio(ack?.erro || 'Não foi possível enviar o arquivo.'); return; }
        if (ack.mensagem) setMensagens((prev) => (prev.some((m) => m.id === ack.mensagem.id) ? prev : [...prev, ack.mensagem]));
        setTexto('');
        irParaOFim();
        onConversaUpdated?.();
      });
    } catch (e) {
      setAnexando(false);
      notificar('Falha ao ler o arquivo.', 'erro');
    }
  };

  const toggleEtiqueta = (etiquetaId) => {
    const tem = etiquetasConv.some((e) => e.id === etiquetaId);
    if (tem) {
      socket?.emit('etiqueta:remover', { convId: conversa.id, etiquetaId }, () => {
        fetchEtiquetasConversa(conversa.id).then(setEtiquetasConv).catch(console.error);
      });
    } else {
      socket?.emit('etiqueta:adicionar', { convId: conversa.id, etiquetaId }, () => {
        fetchEtiquetasConversa(conversa.id).then(setEtiquetasConv).catch(console.error);
      });
    }
  };

  const adicionarNota = () => {
    if (!notaTexto.trim()) return;
    socket?.emit('nota:adicionar', { convId: conversa.id, conteudo: notaTexto }, (ack) => {
      if (ack?.ok) {
        setNotaTexto('');
        fetchNotasInternas(conversa.id).then(setNotas).catch(console.error);
      }
    });
  };

  // ── Drag & Drop handlers ──
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes('Files')) setDraggingFile(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDraggingFile(false);
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingFile(false);
    dragCounterRef.current = 0;
    const f = e.dataTransfer?.files?.[0];
    if (f) enviarMidia(f);
  };

  if (!conversa) {
    return React.createElement(EstadoVazio, {
      title: 'Central de Atendimento',
      subtitle: 'Selecione uma conversa à esquerda ou inicie uma nova para começar.',
    });
  }

  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;

  return React.createElement('div', {
    style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, position: 'relative' },
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  },
    // Overlay de drag-and-drop
    draggingFile && React.createElement('div', {
      style: { position: 'absolute', inset: 0, background: 'rgba(37,99,235,0.1)', border: '3px dashed #2563EB', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none' },
    },
      React.createElement('div', {
        style: { background: '#2563EB', color: '#fff', padding: '12px 28px', borderRadius: 10, fontSize: 15, fontWeight: 700, boxShadow: '0 4px 16px rgba(37,99,235,0.35)' },
      }, 'Solte o arquivo aqui para enviar'),
    ),
    // Header - WhatsApp style header bar
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', padding: '10px 20px', background: T.surface, gap: 12, flexShrink: 0, borderBottom: `1px solid #d1d7db`, minHeight: 56 },
    },
      React.createElement(Avatar, { nome, url: conversa.contato_avatar_url, tamanho: 42, isNumber }),
      React.createElement('div', {
        style: { flex: 1, minWidth: 0, cursor: 'pointer' },
        onClick: () => {
          setNomeEdit(conversa.contato_nome || conversa.contato_telefone || '');
          setEditandoNome(true);
        },
        title: 'Clique para editar o nome do contato',
      },
        editandoNome
          ? React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
              React.createElement('input', {
                value: nomeEdit,
                onChange: (e) => setNomeEdit(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') salvarNomeContato();
                  if (e.key === 'Escape') setEditandoNome(false);
                },
                onBlur: () => setEditandoNome(false),
                autoFocus: true,
                style: { fontSize: 14, fontWeight: 700, padding: '4px 8px', border: '2px solid ' + T.primary, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', width: '100%' },
              }),
              React.createElement('button', {
                onMouseDown: (e) => { e.preventDefault(); salvarNomeContato(); },
                style: { ...acaoBtn, padding: '4px 8px', fontSize: 11 },
              }, 'Salvar'),
            )
          : React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text } },
              nome,
              React.createElement('span', { style: { fontSize: 10, color: T.textMuted, marginLeft: 6, fontWeight: 400 } }, '✎ editar'),
            ),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('span', null, conversa.contato_telefone || ''),
          conversa.departamento_nome && React.createElement(DeptBadge, { nome: conversa.departamento_nome, cor: conversa.departamento_cor }),
        ),
      ),
      // Assumir conversa (sem dono)
      semDono && React.createElement('button', {
        onClick: assumir, title: 'Assumir esta conversa',
        style: { ...acaoBtn, color: T.primary, borderColor: T.primary, fontWeight: 700 },
      }, React.createElement(UserCheck, { size: 16 }), 'Assumir'),
      // Transferir para colega (dono ou gestor)
      conversa.operador_id && podeGerir && React.createElement('button', {
        onClick: () => setShowTransferir(true), title: 'Transferir para outro atendente',
        style: { ...acaoBtn },
      }, React.createElement(ArrowRightLeft, { size: 16 }), 'Transferir'),
      // Devolver para a fila (dono ou gestor)
      conversa.operador_id && podeGerir && React.createElement('button', {
        onClick: devolver, title: 'Devolver para a fila do setor',
        style: { ...acaoBtn, color: T.textSecondary },
      }, React.createElement(Undo2, { size: 16 }), 'Devolver'),
      // Anexar atendente
      React.createElement('button', {
        onClick: () => setShowParticipantes(true), title: 'Anexar atendente',
        style: { ...acaoBtn },
      }, React.createElement(UserPlus, { size: 16 }), 'Anexar'),
      // Templates
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', { onClick: () => { setShowTemplates(!showTemplates); setShowEncaminhar(false); setShowEtiquetas(false); }, style: acaoBtn },
          React.createElement(MessageSquare, { size: 16 }), 'Templates'),
        showTemplates && React.createElement('div', { style: dropdown },
          React.createElement('div', { style: { padding: '8px 14px', fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' } }, 'Respostas rápidas'),
          templates.map((t) =>
            React.createElement('button', { key: t.id, onClick: () => aplicarTemplate(t.conteudo), style: dropdownItem },
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, t.titulo),
                React.createElement('div', { style: { fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 } }, t.conteudo),
              ))),
          templates.length === 0 && React.createElement('div', { style: { padding: 14, fontSize: 12, color: T.textMuted } }, 'Nenhum template. Crie no menu Admin > Templates.'),
        ),
      ),
      // Etiquetas
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', { onClick: () => { setShowEtiquetas(!showEtiquetas); setShowEncaminhar(false); setShowTemplates(false); }, style: acaoBtn },
          React.createElement(Tag, { size: 16 }), 'Etiquetas'),
        showEtiquetas && React.createElement('div', { style: dropdown },
          React.createElement('div', { style: { padding: '8px 14px', fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' } }, 'Categorizar'),
          etiquetas.map((et) => {
            const ativo = etiquetasConv.some((e) => e.id === et.id);
            return React.createElement('button', { key: et.id, onClick: () => toggleEtiqueta(et.id), style: { ...dropdownItem, background: ativo ? T.primarySoft : 'transparent' } },
              React.createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: et.cor } }),
              et.nome, ativo && React.createElement(CheckCircle2, { size: 14, color: T.success, style: { marginLeft: 'auto' } }));
          }),
          etiquetas.length === 0 && React.createElement('div', { style: { padding: 14, fontSize: 12, color: T.textMuted } }, 'Nenhuma etiqueta.'),
        ),
      ),
      // Atribuir secretaria
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', { onClick: () => setShowEncaminhar(!showEncaminhar), style: { ...acaoBtn } },
          React.createElement(Building2, { size: 16 }), 'Encaminhar'),
        showEncaminhar && React.createElement('div', { style: dropdown },
          React.createElement('div', { style: { padding: '8px 14px', fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' } }, 'Encaminhar para'),
          departamentos.map((dep) =>
            React.createElement('button', { key: dep.id, onClick: () => encaminhar(dep.id), style: dropdownItem },
              React.createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: dep.cor || T.primary } }),
              dep.secretaria_nome ? `${dep.secretaria_nome} › ${dep.nome}` : dep.nome,
            )),
        ),
      ),
      React.createElement('button', { onClick: resolver, 'aria-label': 'Resolver conversa', style: { ...acaoBtn, color: T.success, borderColor: '#CDEBD6' } },
        React.createElement(CheckCircle2, { size: 16 }), 'Resolver'),
      // Ações destrutivas/secundárias agrupadas num menu "⋯" para não lotar o header.
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          onClick: () => { setShowMenuMais(!showMenuMais); setShowEncaminhar(false); setShowTemplates(false); setShowEtiquetas(false); },
          'aria-label': 'Mais ações', 'aria-haspopup': 'menu', 'aria-expanded': showMenuMais,
          style: { ...acaoBtn, padding: '7px 9px' },
        }, React.createElement(MoreVertical, { size: 16 })),
        showMenuMais && React.createElement('div', { style: dropdown, role: 'menu' },
          conversa.status === 'arquivada'
            ? React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); desarquivar(); }, style: { ...dropdownItem, color: T.primary } },
                React.createElement(Archive, { size: 15 }), 'Desarquivar')
            : React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); arquivar(); }, style: { ...dropdownItem, color: T.textSecondary } },
                React.createElement(Archive, { size: 15 }), 'Arquivar'),
          React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); excluirConversa(); }, style: { ...dropdownItem, color: T.danger } },
            React.createElement(Trash2, { size: 15 }), 'Excluir conversa'),
        ),
      ),
    ),

    // Banner de transferência pendente para mim (aceitar/recusar)
    transfParaMim && React.createElement('div', {
      style: { padding: '10px 16px', background: T.primarySoft, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
    },
      React.createElement(ArrowRightLeft, { size: 16, color: T.primary }),
      React.createElement('div', { style: { flex: 1, fontSize: 13, color: T.text } },
        React.createElement('span', { style: { fontWeight: 700 } }, transferencia.de_nome || 'Um atendente'),
        ' quer transferir esta conversa para você',
        transferencia.motivo && React.createElement('span', { style: { color: T.textMuted } }, ` — "${transferencia.motivo}"`),
      ),
      React.createElement('button', {
        onClick: () => responderTransferencia(true),
        style: { background: T.success, border: 'none', color: '#fff', padding: '7px 14px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 },
      }, React.createElement(CheckCircle2, { size: 14 }), 'Aceitar'),
      React.createElement('button', {
        onClick: () => responderTransferencia(false),
        style: { background: 'transparent', border: `1px solid ${T.danger}`, color: T.danger, padding: '7px 14px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 },
      }, React.createElement(X, { size: 14 }), 'Recusar'),
    ),

    // Selo "em atendimento por" (quando a conversa tem dono que não sou eu)
    conversa.operador_id && !souDono && React.createElement('div', {
      style: { padding: '6px 16px', background: T.surfaceAlt, fontSize: 11, flexShrink: 0, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: T.textSecondary },
    },
      React.createElement(UserCheck, { size: 12, color: T.primary }),
      'Em atendimento por ', React.createElement('strong', { style: { color: T.text } }, conversa.operador_nome || 'outro atendente'),
    ),

    // Faixa de status
    React.createElement('div', {
      style: { padding: '7px 16px', background: conversaStatus === 'fila' ? T.warningSoft : T.surfaceAlt, fontSize: 11, textAlign: 'center', flexShrink: 0, borderBottom: `1px solid ${T.border}` },
    },
      conversaStatus === 'fila'
        ? React.createElement('span', { style: { color: T.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 } },
            React.createElement(Clock, { size: 12 }), 'Aguardando triagem — encaminhe a uma secretaria para responder')
        : conversaStatus === 'arquivada'
        ? React.createElement('span', { style: { color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } },
            React.createElement(Archive, { size: 12 }), 'Conversa arquivada — não aparece nas listas principais')
        : React.createElement('span', { style: { color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } },
            React.createElement(ShieldCheck, { size: 12 }), 'Mensagens registradas para fins de atendimento'),
    ),
    // Etiquetas ativas
    etiquetasConv.length > 0 && React.createElement('div', {
      style: { display: 'flex', gap: 6, padding: '6px 16px', background: T.surface, flexShrink: 0, flexWrap: 'wrap' },
    },
      etiquetasConv.map((et) =>
        React.createElement('span', {
          key: et.id,
          style: { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: `${et.cor}22`, color: et.cor, cursor: 'pointer' },
          onClick: () => toggleEtiqueta(et.id),
          title: 'Clique para remover',
        }, et.nome),
      )),

    // Mensagens (área rolável + botão flutuante "novas mensagens")
    React.createElement('div', { style: { flex: 1, position: 'relative', minHeight: 0, display: 'flex' } },
      React.createElement('div', {
        ref: areaMensagensRef,
        onScroll: aoRolar,
        role: 'log',
        'aria-live': 'polite',
        'aria-label': 'Mensagens da conversa',
        style: {
          flex: 1, overflowY: 'auto', padding: '20px 24px',
          backgroundColor: '#f0f2f5',
          backgroundImage: 'radial-gradient(#d1d7db 0.5px, transparent 0.5px)',
          backgroundSize: '20px 20px',
        },
      },
        carregandoMais && React.createElement('div', { style: { textAlign: 'center', padding: 8, color: T.textMuted } },
          React.createElement(Loader2, { size: 18, className: 'spin' })),
        temMais && !carregandoMais && React.createElement('div', { style: { textAlign: 'center', marginBottom: 8 } },
          React.createElement('button', { onClick: carregarMais, style: { ...acaoBtn, margin: '0 auto' } }, 'Carregar mensagens anteriores')),
        mensagens.map((msg) => React.createElement(BolhaConversa, {
          key: msg.id,
          msg,
          podeExcluir: !msg.excluida && (msg.direcao === 'saida' ? (msg.operador_id === opId || ehGestor) : ehGestor),
          onExcluir: () => excluirMsg(msg),
        })),
        clienteDigitando && React.createElement('div', {
          style: { fontSize: 12, color: T.textMuted, fontStyle: 'italic', padding: '4px 2px' },
        }, `${nome} está digitando…`),
      ),
      // Botão flutuante "↓ X novas mensagens".
      novasAbaixo > 0 && React.createElement('button', {
        onClick: irParaOFim,
        'aria-label': `${novasAbaixo} novas mensagens, ir para o fim`,
        style: {
          position: 'absolute', right: 24, bottom: 16, zIndex: 5,
          display: 'flex', alignItems: 'center', gap: 6,
          background: T.primary, color: '#fff', border: 'none',
          borderRadius: 20, padding: '8px 14px', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, boxShadow: T.shadowMd,
        },
      }, React.createElement(ArrowDown, { size: 14 }), `${novasAbaixo} nova${novasAbaixo > 1 ? 's' : ''}`),
    ),

    // Notas Internas
    React.createElement('div', { style: { flexShrink: 0, borderTop: `1px solid ${T.border}` } },
      React.createElement('button', {
        onClick: () => setShowNotas(!showNotas),
        style: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: 'none', background: T.surfaceAlt, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.textSecondary },
      },
        React.createElement(StickyNote, { size: 16 }), `Notas internas (${notas.length})`, React.createElement(ChevronDown, { size: 14, style: { marginLeft: 'auto', transform: showNotas ? 'rotate(180deg)' : 'none' } })),
      showNotas && React.createElement('div', { style: { maxHeight: 200, overflowY: 'auto', background: T.surface } },
        React.createElement('div', { style: { display: 'flex', gap: 6, padding: '8px 12px' } },
          React.createElement('input', {
            value: notaTexto, onChange: (e) => setNotaTexto(e.target.value), placeholder: 'Nova nota interna (não enviada ao cidadão)',
            onKeyDown: (e) => e.key === 'Enter' && adicionarNota(),
            style: { flex: 1, padding: '8px 12px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, fontSize: 13, background: T.surfaceMuted, color: T.text, outline: 'none' },
          }),
          React.createElement('button', { onClick: adicionarNota, style: { ...acaoBtn, padding: '6px 10px' } }, 'Salvar'),
        ),
        notas.map((n) =>
          React.createElement('div', { key: n.id, style: { padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 12 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
              React.createElement('span', { style: { fontWeight: 700, color: T.text } }, n.operador_nome || 'Operador'),
              React.createElement('span', { style: { color: T.textMuted } }, new Date(n.criado_em).toLocaleString('pt-BR')),
            ),
            React.createElement('div', { style: { color: T.textSecondary } }, n.conteudo),
          )),
        notas.length === 0 && React.createElement('div', { style: { padding: '12px 16px', fontSize: 12, color: T.textMuted } }, 'Nenhuma nota interna registrada.'),
      ),
    ),

    // Composer
    erroEnvio && React.createElement('div', {
      role: 'alert',
      style: { padding: '8px 16px', background: T.dangerSoft, color: T.danger, fontSize: 12, fontWeight: 600, borderTop: `1px solid ${T.border}` },
    }, erroEnvio),
    React.createElement('form', {
      onSubmit: enviar,
      style: { position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '10px 16px', background: T.surface, gap: 10, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      // Picker de emojis rápidos
      showEmojis && React.createElement('div', {
        style: { position: 'absolute', bottom: 58, left: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadowMd, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4, width: 220, zIndex: 20 },
      },
        EMOJIS_RAPIDOS.map((e) => React.createElement('button', {
          key: e, type: 'button',
          onClick: () => { setTexto((t) => t + e); setShowEmojis(false); inputRef.current?.focus(); },
          style: { fontSize: 20, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 },
        }, e))),
      React.createElement('button', {
        type: 'button', onClick: () => setShowEmojis(!showEmojis), 'aria-label': 'Inserir emoji',
        style: iconBtn,
      }, React.createElement(Smile, { size: 22, color: showEmojis ? T.primary : T.textMuted })),
      React.createElement('input', {
        ref: fileRef, type: 'file', style: { display: 'none' },
        onChange: (e) => { const f = e.target.files?.[0]; if (f) enviarMidia(f); e.target.value = ''; },
      }),
      React.createElement('button', {
        type: 'button', onClick: () => fileRef.current?.click(), 'aria-label': 'Anexar arquivo', disabled: anexando,
        style: iconBtn,
      }, anexando
        ? React.createElement(Loader2, { size: 22, color: T.textMuted, className: 'spin' })
        : React.createElement(Paperclip, { size: 22, color: T.textMuted })),
      React.createElement('div', { style: { flex: 1, position: 'relative' } },
        React.createElement('textarea', {
          ref: inputRef, value: texto, onChange: (e) => setTexto(e.target.value),
          placeholder: 'Digite uma mensagem (Enter envia, Shift+Enter quebra linha)',
          rows: 1,
          'aria-label': 'Mensagem',
          maxLength: 4000,
          onKeyDown: (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e); }
          },
          style: { width: '100%', resize: 'none', maxHeight: 120, minHeight: 22, boxSizing: 'border-box', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 22, padding: '11px 52px 11px 16px', color: T.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', lineHeight: '20px' },
        }),
        texto.length > 0 && React.createElement('span', {
          style: { position: 'absolute', right: 12, bottom: 6, fontSize: 10, color: texto.length > 3800 ? T.danger : T.textMuted },
        }, `${texto.length}/4000`),
      ),
      React.createElement('button', {
        type: 'submit',
        disabled: enviando || anexando || !texto.trim(),
        'aria-label': 'Enviar mensagem',
        title: connected ? 'Enviar' : 'Conectando...',
        style: { width: 44, height: 44, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: enviando || !texto.trim() ? 'default' : 'pointer', background: texto.trim() && !enviando ? T.primary : T.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, enviando
        ? React.createElement(Loader2, { size: 20, color: '#fff', className: 'spin' })
        : React.createElement(Send, { size: 20, color: texto.trim() && !enviando ? '#fff' : T.textMuted })),
    ),

    showParticipantes && React.createElement(ModalParticipantes, { conversa, onClose: () => setShowParticipantes(false) }),
    showTransferir && React.createElement(ModalTransferir, { conversa, onClose: () => setShowTransferir(false), onTransferido: () => onConversaUpdated?.() }),
    // Toast + modal de confirmação (substituem alert/confirm/prompt)
    toast && React.createElement('div', {
      role: 'status',
      style: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, background: toast.tipo === 'erro' ? T.danger : (toast.tipo === 'ok' ? T.success : T.text), color: '#fff', padding: '10px 18px', borderRadius: T.radius, boxShadow: T.shadowMd, fontSize: 13, fontWeight: 600, maxWidth: 420 },
    }, toast.mensagem),
    confirmacao && React.createElement(ConfirmModal, {
      ...confirmacao,
      onClose: () => setConfirmacao(null),
    }),
  );
}

// Modal de confirmação reutilizável (com input opcional). Substitui confirm()/prompt().
function ConfirmModal({ titulo, texto, confirmarLabel = 'Confirmar', cancelarLabel = 'Cancelar', perigoso, comInput, inputPlaceholder, onConfirm, onClose }) {
  const [valor, setValor] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const confirmar = () => {
    if (ocupado) return; // proteção contra duplo-clique
    setOcupado(true);
    try { onConfirm?.(comInput ? valor : undefined); } finally { onClose?.(); }
  };
  return React.createElement('div', {
    onClick: onClose,
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500 },
  },
    React.createElement('div', {
      onClick: (e) => e.stopPropagation(), role: 'dialog', 'aria-modal': true, 'aria-label': titulo,
      style: { background: T.surface, borderRadius: T.radius, boxShadow: T.shadowMd, padding: 22, width: 'min(420px, 92vw)' },
    },
      React.createElement('h3', { style: { margin: 0, fontSize: 16, fontWeight: 800, color: T.text } }, titulo),
      texto && React.createElement('p', { style: { margin: '10px 0 0', fontSize: 13.5, color: T.textSecondary, lineHeight: '20px' } }, texto),
      comInput && React.createElement('input', {
        autoFocus: true, value: valor, onChange: (e) => setValor(e.target.value), placeholder: inputPlaceholder || '',
        onKeyDown: (e) => { if (e.key === 'Enter') confirmar(); },
        style: { width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '9px 12px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, fontSize: 13, color: T.text, background: T.surfaceMuted, outline: 'none' },
      }),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 } },
        React.createElement('button', { onClick: onClose, style: { ...acaoBtn } }, cancelarLabel),
        React.createElement('button', {
          onClick: confirmar, disabled: ocupado, autoFocus: !comInput,
          style: { display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: T.radiusSm, padding: '8px 16px', cursor: ocupado ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', background: perigoso ? T.danger : T.primary },
        }, confirmarLabel),
      ),
    ),
  );
}

function EstadoVazio({ title, subtitle }) {
  return React.createElement('div', {
    style: {
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
  },
    React.createElement('header', {
      style: {
        height: 64, width: '100%', display: 'flex', alignItems: 'center',
        padding: '0 24px',
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #d1d7db',
        flexShrink: 0,
      },
    },
      React.createElement('h1', {
        style: { fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.3 },
      }, 'Central de Atendimento'),
    ),
    React.createElement('div', {
      style: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        backgroundColor: T.bg,
        backgroundImage: 'radial-gradient(#d1d7db 0.5px, transparent 0.5px)',
        backgroundSize: '20px 20px',
      },
    },
      React.createElement('div', {
        style: {
          position: 'absolute', inset: 0, pointerEvents: 'none',
        },
      },
        React.createElement('div', {
          style: {
            position: 'absolute', top: '25%', left: '50%',
            transform: 'translateX(-50%)',
            width: 500, height: 500,
            background: 'rgba(37,99,235,0.05)',
            filter: 'blur(120px)', borderRadius: '50%',
          },
        }),
      ),
      React.createElement('div', {
        style: { maxWidth: 448, width: '100%', textAlign: 'center', position: 'relative', zIndex: 10, padding: 24 },
      },
        React.createElement('div', {
          style: { position: 'relative', display: 'inline-block', marginBottom: 32 },
        },
          React.createElement('div', {
            style: {
              width: 96, height: 96, borderRadius: 32,
              background: T.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 40px rgba(37,99,235,0.35)',
              position: 'relative',
            },
          },
            React.createElement('span', {
              className: 'material-symbols-outlined',
              style: { fontSize: 48, fontVariationSettings: "'FILL' 1" },
            }, 'shield'),
          ),
          React.createElement('div', {
            style: {
              position: 'absolute', bottom: -4, right: -4,
              background: '#fff', padding: 8, borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              border: '1px solid #d1d7db',
            },
          },
            React.createElement('span', {
              className: 'material-symbols-outlined',
              style: { color: T.primary, fontSize: 20, fontVariationSettings: "'FILL' 1" },
            }, 'verified'),
          ),
        ),
        React.createElement('h2', {
          style: { fontSize: 28, fontWeight: 800, color: T.text, marginBottom: 16, letterSpacing: -0.5 },
        }, 'GovSistem Web'),
        React.createElement('p', {
          style: { fontSize: 15, color: T.textSecondary, lineHeight: '24px', marginBottom: 40, maxWidth: 380, margin: '0 auto 40px' },
        }, 'Envie e receba mensagens sem precisar manter seu celular conectado. Use o GovSistem em até 4 dispositivos ao mesmo tempo.'),
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: T.textMuted, opacity: 0.6 },
        },
          React.createElement('span', {
            className: 'material-symbols-outlined',
            style: { fontSize: 16 },
          }, 'lock'),
          React.createElement('span', { style: { fontSize: 12 } }, 'Criptografia de ponta a ponta'),
        ),
      ),
    ),
  );
}

const acaoBtn = { display: 'flex', alignItems: 'center', gap: 5, background: T.surface, border: `1px solid ${T.borderStrong}`, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: T.radiusSm, cursor: 'pointer', whiteSpace: 'nowrap' };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' };
const dropdown = { position: 'absolute', top: '100%', right: 0, background: T.surface, borderRadius: T.radius, boxShadow: T.shadowMd, border: `1px solid ${T.border}`, zIndex: 100, minWidth: 230, overflow: 'hidden', marginTop: 6 };
const dropdownItem = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 13.5, textAlign: 'left' };
