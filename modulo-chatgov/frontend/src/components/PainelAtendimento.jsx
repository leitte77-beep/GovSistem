import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Paperclip, Smile, ShieldCheck, Clock, UserPlus, CheckCircle2, Building2, MessageSquare, Tag, StickyNote, ChevronDown, ChevronRight, Archive, Trash2, ArrowRightLeft, Undo2, UserCheck, X, MoreVertical, ArrowDown, Loader2, Mic, Square, Play, Pause, RotateCcw, Images, Mail, Search, ArrowLeft } from 'lucide-react';
import { Avatar } from './Avatar';
import { BolhaConversa } from './BolhaConversa';
import { DeptBadge } from './DeptBadge';
import { ModalParticipantes } from './ModalParticipantes';
import { ModalTransferir } from './ModalTransferir';
import { MediaPreview, MediaLightbox } from './MediaPreview';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fetchMensagens, fetchDepartamentos, fetchTemplates, fetchEtiquetas, fetchEtiquetasConversa, fetchNotasInternas, editarContato, fetchTransferenciaPendente, excluirMensagemConversa, fetchMidiasConversa, marcarConversaNaoLida } from '../api';
import { mimeParaTipo, encodeFileBase64 } from '../utils/arquivo';
import { T } from '../theme';

const EMOJIS_RAPIDOS = ['😀', '😅', '👍', '🙏', '❤️', '😊', '👏', '✅', '⚠️', '📎'];
const PERTO_DO_FIM_PX = 120;
const MAX_MIDIA_BYTES = 16 * 1024 * 1024; // 16 MB (limite prático do WhatsApp)
const AUDIO_MAX_MS = 2 * 60 * 1000; // 2 minutos
const EXTENSOES_PROIBIDAS = ['exe','bat','cmd','msi','vbs','ps1','scr','com','sh','dll','pif','cpl','wsf','wsh','hta','jar','reg','scf','lnk'];

function formatarDuracao(ms) {
  if (!ms || ms <= 0) return '0:00';
  const totalSeg = Math.floor(ms / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}

// Preenche variáveis de template com dados da conversa.
function aplicarVariaveis(texto, conversa) {
  if (!texto) return texto;
  return texto
    .replace(/\{\{\s*nome\s*\}\}/gi, conversa?.contato_nome || conversa?.contato_telefone || '')
    .replace(/\{\{\s*telefone\s*\}\}/gi, conversa?.contato_telefone || '')
    .replace(/\{\{\s*protocolo\s*\}\}/gi, conversa?.protocolo || conversa?.protocolo_numero || '')
    .replace(/\{\{\s*data\s*\}\}/gi, new Date().toLocaleDateString('pt-BR'));
}

export function PainelAtendimento({ conversa, onConversaUpdated, breakpoint, onVoltar }) {
  const { socket, connected } = useSocket();
  const { auth } = useAuth();
  const ehMobile = breakpoint === 'mobile';
  // No celular e no tablet o header não comporta os ~9 botões com texto, então
  // tudo colapsa num único menu "⋮" e os menus ricos viram bottom-sheets.
  const ehCompacto = breakpoint === 'mobile' || breakpoint === 'tablet';
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [departamentos, setDepartamentos] = useState([]);
  const [showEncaminhar, setShowEncaminhar] = useState(false);
  const [secEncAberta, setSecEncAberta] = useState(null); // secretaria expandida no menu Encaminhar
  const [filtroEnc, setFiltroEnc] = useState('');         // busca dentro do menu Encaminhar
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
  const [showAcoes, setShowAcoes] = useState(false); // menu de ações combinado (mobile/tablet)
  const [showEmojis, setShowEmojis] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const [respondendoA, setRespondendoA] = useState(null);
  const [showGaleria, setShowGaleria] = useState(false);
  const [midias, setMidias] = useState([]);
  const [carregandoMidias, setCarregandoMidias] = useState(false);
  const [galeriaLightbox, setGaleriaLightbox] = useState(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  // Gravação de áudio
  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuracao, setAudioDuracao] = useState(0);
  const [audioErro, setAudioErro] = useState(null);
  const [tocando, setTocando] = useState(false);
  const [tempoGravadoMs, setTempoGravadoMs] = useState(0);
  const [previewArquivo, setPreviewArquivo] = useState(null); // { file, dataUrl, tipo }
  const [previewLegenda, setPreviewLegenda] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const gravacaoInicioRef = useRef(0);
  const gravacaoTimerRef = useRef(null);
  const gravacaoLimiteRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const audioChunksRef = useRef([]);
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
    const convId = conversa.id;
    const ac = new AbortController();
    setMensagens([]);
    setTemMais(false);
    setNovasAbaixo(0);
    setClienteDigitando(false);
    setBotDigitando(null);
    pertoDoFimRef.current = true;
    fetchMensagens(convId, { signal: ac.signal })
      .then(({ mensagens, temMais }) => { setMensagens(mensagens); setTemMais(temMais); })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e); });
    fetchDepartamentos().then(setDepartamentos).catch(console.error);
    fetchTemplates().then(setTemplates).catch(console.error);
    fetchEtiquetas().then(setEtiquetas).catch(console.error);
    fetchEtiquetasConversa(convId).then(setEtiquetasConv).catch(console.error);
    fetchNotasInternas(convId).then(setNotas).catch(console.error);
    fetchTransferenciaPendente(convId).then(setTransferencia).catch(() => setTransferencia(null));
    socket?.emit('conversa:abrir', convId);
    return () => {
      ac.abort();
      socket?.emit('conversa:fechar', convId);
    };
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
      if (msg.conversa_id !== conversa?.id) return;
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

  // ── Gravação de áudio ───────────────────────────────────────────

  const pararStream = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      audioStreamRef.current = null;
    }
  }, []);

  const limparGravacao = useCallback(() => {
    pararStream();
    if (gravacaoTimerRef.current) { clearInterval(gravacaoTimerRef.current); gravacaoTimerRef.current = null; }
    if (gravacaoLimiteRef.current) { clearTimeout(gravacaoLimiteRef.current); gravacaoLimiteRef.current = null; }
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch {} }
    if (audioPreviewRef.current) { try { audioPreviewRef.current.pause(); } catch {} }
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioDuracao(0);
    setAudioErro(null);
    setTocando(false);
    setTempoGravadoMs(0);
    audioChunksRef.current = [];
  }, [pararStream, audioUrl]);

  const iniciarGravacao = useCallback(async () => {
    if (gravando) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
      setAudioErro('Seu navegador não suporta gravação de áudio.');
      return;
    }
    setAudioErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = window.MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (window.MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        const dur = Date.now() - gravacaoInicioRef.current;
        setAudioDuracao(dur);
        setTempoGravadoMs(dur);
        audioChunksRef.current = [];
        pararStream();
      };
      gravacaoInicioRef.current = Date.now();
      rec.start();
      setGravando(true);
      setTocando(false);
      setTempoGravadoMs(0);
      setAudioBlob(null);
      setAudioUrl(null);
      setAudioDuracao(0);
      gravacaoTimerRef.current = setInterval(() => {
        setTempoGravadoMs(Date.now() - gravacaoInicioRef.current);
      }, 200);
      gravacaoLimiteRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          try { mediaRecorderRef.current.stop(); } catch {}
        }
      }, AUDIO_MAX_MS);
    } catch (err) {
      pararStream();
      setGravando(false);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setAudioErro('Permissão de microfone negada.');
      } else if (err?.name === 'NotFoundError') {
        setAudioErro('Nenhum microfone encontrado.');
      } else {
        setAudioErro('Não foi possível iniciar a gravação.');
      }
    }
  }, [gravando, pararStream]);

  const pararGravacao = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (gravacaoTimerRef.current) { clearInterval(gravacaoTimerRef.current); gravacaoTimerRef.current = null; }
    if (gravacaoLimiteRef.current) { clearTimeout(gravacaoLimiteRef.current); gravacaoLimiteRef.current = null; }
    setGravando(false);
  }, []);

  const descartarAudio = useCallback(() => {
    limparGravacao();
  }, [limparGravacao]);

  const tocarPausarPreview = useCallback(() => {
    const el = audioPreviewRef.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => setTocando(false)); setTocando(true); }
    else { el.pause(); setTocando(false); }
  }, []);

  const enviarAudio = useCallback(async (caption) => {
    if (!audioBlob || !conversa || !socket || !connected) return;
    setEnviando(true);
    setErroEnvio('');
    try {
      const mediaBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      const mime = audioBlob.type || 'audio/webm';
      socket.timeout(30000).emit('mensagem:enviar', {
        convId: conversa.id,
        jid: conversa.wa_jid,
        texto: caption?.trim() || undefined,
        tipo: 'audio',
        mediaBase64,
        mediaMime: mime,
        mediaNome: `audio-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`,
        respondendoA: respondendoA?.id || undefined,
      }, (err, ack) => {
        setEnviando(false);
        if (err) { setErroEnvio('Tempo esgotado ao enviar o áudio.'); return; }
        if (!ack?.ok) { setErroEnvio(ack?.erro || 'Não foi possível enviar o áudio.'); return; }
        if (ack.mensagem) setMensagens((prev) => (prev.some((m) => m.id === ack.mensagem.id) ? prev : [...prev, ack.mensagem]));
        setTexto('');
        setRespondendoA(null);
        irParaOFim();
        onConversaUpdated?.();
      });
    } catch (e) {
      setEnviando(false);
      setErroEnvio('Erro ao processar o áudio.');
    }
    limparGravacao();
  }, [audioBlob, conversa, socket, connected, irParaOFim, onConversaUpdated, limparGravacao, respondendoA]);

  // Cleanup gravação ao desmontar
  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    pararStream();
    if (gravacaoTimerRef.current) clearInterval(gravacaoTimerRef.current);
    if (gravacaoLimiteRef.current) clearTimeout(gravacaoLimiteRef.current);
  }, [pararStream]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const enviar = (e) => {
    e?.preventDefault();
    if (!conversa || enviando) return;

    // Se tem preview de arquivo, envia com legenda
    if (previewArquivo) {
      enviarMidia(previewArquivo.file, previewLegenda || texto.trim() || undefined);
      return;
    }

    // Se tem áudio gravado, envia o áudio (com legenda opcional)
    if (audioBlob) {
      enviarAudio(texto.trim() || undefined);
      return;
    }

    const txt = texto.trim();
    if (!txt) return;
    if (!socket || !connected) {
      setErroEnvio('Conexão em tempo real indisponível. Recarregue a página e tente novamente.');
      return;
    }

    setEnviando(true);
    setErroEnvio('');
    socket.timeout(8000).emit('mensagem:enviar', { convId: conversa.id, jid: conversa.wa_jid, texto: txt, respondendoA: respondendoA?.id || undefined }, (err, ack) => {
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
      setRespondendoA(null);
      inputRef.current?.focus();
      irParaOFim();
      onConversaUpdated?.();
    });
  };

  // Agrupa os departamentos por secretaria para o menu Encaminhar ficar em árvore
  // (secretaria → departamentos) em vez de uma lista única que toma a tela toda.
  // A API já devolve ordenado por secretaria e depois por departamento.
  const gruposEncaminhar = useMemo(() => {
    const mapa = new Map();
    for (const dep of departamentos) {
      const chave = dep.secretaria_id || '__sem__';
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: chave,
          nome: dep.secretaria_nome || 'Sem secretaria',
          cor: dep.secretaria_cor || dep.cor || T.primary,
          deps: [],
        });
      }
      mapa.get(chave).deps.push(dep);
    }
    return Array.from(mapa.values());
  }, [departamentos]);

  const termoEnc = filtroEnc.trim().toLowerCase();
  const gruposEncFiltrados = termoEnc
    ? gruposEncaminhar
        .map((g) => ({
          ...g,
          deps: g.nome.toLowerCase().includes(termoEnc)
            ? g.deps
            : g.deps.filter((d) => (d.nome || '').toLowerCase().includes(termoEnc)),
        }))
        .filter((g) => g.deps.length > 0)
    : gruposEncaminhar;

  const abrirEncaminhar = () => {
    const abrir = !showEncaminhar;
    setShowEncaminhar(abrir);
    if (abrir) {
      setFiltroEnc('');
      // Já deixa aberta a secretaria do departamento atual (se houver), senão nada.
      const atual = departamentos.find((d) => d.id === conversa?.departamento_id);
      setSecEncAberta(atual?.secretaria_id || (gruposEncaminhar.length === 1 ? gruposEncaminhar[0].id : null));
    }
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

  const enviarMidia = async (file, legenda) => {
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
        texto: legenda?.trim() || texto.trim() || undefined,
        tipo: mimeParaTipo(file.type),
        mediaBase64,
        mediaMime: file.type || 'application/octet-stream',
        mediaNome: file.name,
        respondendoA: respondendoA?.id || undefined,
      }, (err, ack) => {
        setAnexando(false);
        if (err) { setErroEnvio('Tempo esgotado ao enviar o arquivo.'); return; }
        if (!ack?.ok) { setErroEnvio(ack?.erro || 'Não foi possível enviar o arquivo.'); return; }
        if (ack.mensagem) setMensagens((prev) => (prev.some((m) => m.id === ack.mensagem.id) ? prev : [...prev, ack.mensagem]));
        setTexto('');
        setPreviewArquivo(null);
        setPreviewLegenda('');
        setRespondendoA(null);
        irParaOFim();
        onConversaUpdated?.();
      });
    } catch (e) {
      setAnexando(false);
      notificar('Falha ao ler o arquivo.', 'erro');
    }
  };

  const cancelarPreview = () => {
    setPreviewArquivo(null);
    setPreviewLegenda('');
  };

  // Limpa o "respondendo a" ao trocar de conversa.
  useEffect(() => { setRespondendoA(null); }, [conversa?.id]);

  // Reagir a uma mensagem (alterna: mesma reação remove). Sincroniza com o WhatsApp.
  const reagirMsg = (msg, emoji) => {
    if (!conversa || !socket) return;
    const novo = msg.reacao === emoji ? '' : emoji;
    socket.emit('conversa:reagir', { convId: conversa.id, msgId: msg.id, emoji: novo }, (ack) => {
      if (ack && !ack.ok) notificar(ack.erro || 'Não foi possível reagir.', 'erro');
    });
  };

  const marcarNaoLida = async () => {
    if (!conversa) return;
    try {
      await marcarConversaNaoLida(conversa.id);
      notificar('Conversa marcada como não lida.', 'sucesso');
      onConversaUpdated?.();
    } catch (e) {
      notificar(e.message || 'Erro ao marcar como não lida.', 'erro');
    }
  };

  const abrirGaleria = async () => {
    if (!conversa) return;
    setShowGaleria(true);
    setCarregandoMidias(true);
    try {
      setMidias(await fetchMidiasConversa(conversa.id));
    } catch {
      setMidias([]);
    } finally {
      setCarregandoMidias(false);
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
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!arquivoPermitido(file.name, file.type)) {
      notificar('Tipo de arquivo não permitido por segurança.', 'erro');
      return;
    }
    if (file.size > MAX_MIDIA_BYTES) {
      notificar('Arquivo muito grande (máx. 16 MB).', 'erro');
      return;
    }
    const tipo = file.type.startsWith('image/') ? 'imagem'
      : file.type.startsWith('audio/') ? 'audio'
      : file.type.startsWith('video/') ? 'video'
      : 'documento';
    const reader = new FileReader();
    reader.onload = () => setPreviewArquivo({ file, dataUrl: reader.result, tipo });
    reader.readAsDataURL(file);
  };

  const arquivoPermitido = (nome, tipo) => {
    const ext = (nome || '').split('.').pop()?.toLowerCase();
    if (ext && EXTENSOES_PROIBIDAS.includes(ext)) return false;
    if (tipo === 'application/x-msdownload' || tipo === 'application/x-msdos-program' || tipo === 'application/x-bat') return false;
    return true;
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    if (items.length === 0) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const file = new File([blob], `imagem-colada-${Date.now()}.png`, { type: blob.type || 'image/png' });
        const reader = new FileReader();
        reader.onload = () => setPreviewArquivo({ file, dataUrl: reader.result, tipo: 'imagem' });
        reader.readAsDataURL(file);
        break;
      }
      if (item.kind === 'file') {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const ext = (file.name || '').split('.').pop()?.toLowerCase();
        if (ext && EXTENSOES_PROIBIDAS.includes(ext)) {
          notificar(`Arquivo .${ext} não é permitido por segurança.`, 'erro');
          continue;
        }
        if (!arquivoPermitido(file.name, file.type)) {
          notificar('Tipo de arquivo não permitido por segurança.', 'erro');
          continue;
        }
        if (file.size > MAX_MIDIA_BYTES) {
          notificar('Arquivo muito grande (máx. 16 MB).', 'erro');
          continue;
        }
        const tipo = file.type.startsWith('image/') ? 'imagem'
          : file.type.startsWith('audio/') ? 'audio'
          : file.type.startsWith('video/') ? 'video'
          : 'documento';
        const reader = new FileReader();
        reader.onload = () => setPreviewArquivo({ file, dataUrl: reader.result, tipo });
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  if (!conversa) {
    return React.createElement(EstadoVazio, {
      title: 'Central de Atendimento',
      subtitle: 'Selecione uma conversa à esquerda ou inicie uma nova para começar.',
    });
  }

  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;

  // Item do menu de ações (bottom-sheet) usado no celular/tablet.
  const acaoSheetItem = (Icone, label, onClick, cor) => React.createElement('button', {
    key: label, onClick,
    style: { display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '14px 20px', border: 'none', background: 'transparent', color: cor || T.text, cursor: 'pointer', fontSize: 15, fontWeight: 500, textAlign: 'left' },
  }, React.createElement(Icone, { size: 20, style: { flexShrink: 0 } }), label);

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
      style: { display: 'flex', alignItems: 'center', padding: ehCompacto ? '8px 10px' : '10px 20px', background: T.surface, gap: ehCompacto ? 8 : 12, flexShrink: 0, borderBottom: `1px solid #d1d7db`, minHeight: 56 },
    },
      // Voltar (apenas no celular, onde a lista some ao abrir a conversa)
      onVoltar && ehMobile && React.createElement('button', {
        onClick: onVoltar, 'aria-label': 'Voltar', title: 'Voltar',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.text },
      }, React.createElement(ArrowLeft, { size: 22 })),
      React.createElement(Avatar, { nome, url: conversa.contato_avatar_url, tamanho: ehCompacto ? 38 : 42, isNumber }),
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
          (conversa.protocolo_numero || conversa.protocolo) && React.createElement('span', {
            title: 'Protocolo do atendimento',
            style: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 999, background: T.primarySoft, color: T.primary, fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' },
          }, '#', conversa.protocolo_numero || conversa.protocolo),
          conversa.departamento_nome && React.createElement(DeptBadge, { nome: conversa.departamento_nome, cor: conversa.departamento_cor }),
        ),
      ),
      // Celular/tablet: todas as ações colapsam num único menu "⋮"
      ehCompacto && React.createElement('button', {
        onClick: () => setShowAcoes(true), 'aria-label': 'Ações da conversa', title: 'Ações',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.textSecondary },
      }, React.createElement(MoreVertical, { size: 22 })),
      // Desktop: barra completa de ações inline
      !ehCompacto && React.createElement(React.Fragment, null,
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
      // Atribuir secretaria — árvore secretaria › departamento, recolhível e com busca
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', { onClick: abrirEncaminhar, style: { ...acaoBtn } },
          React.createElement(Building2, { size: 16 }), 'Encaminhar'),
        showEncaminhar && React.createElement('div', { className: 'cg-enc-menu', style: { ...dropdown, minWidth: 280 } },
          React.createElement('style', null, ESTILO_ENCAMINHAR),
          React.createElement('div', { style: { padding: '8px 14px 6px', fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' } }, 'Encaminhar para'),
          // Busca
          React.createElement('div', { style: { padding: '0 10px 8px', position: 'relative' } },
            React.createElement(Search, { size: 14, color: T.textMuted, style: { position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' } }),
            React.createElement('input', {
              value: filtroEnc, onChange: (e) => setFiltroEnc(e.target.value), autoFocus: true,
              placeholder: 'Buscar secretaria ou departamento…',
              style: { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '7px 10px 7px 30px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' },
              onFocus: (e) => { e.target.style.borderColor = T.primary; e.target.style.boxShadow = `0 0 0 3px ${T.primarySoft}`; },
              onBlur: (e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; },
            }),
          ),
          // Lista agrupada com rolagem própria (não toma a tela toda)
          React.createElement('div', { style: { maxHeight: 320, overflowY: 'auto', paddingBottom: 4 } },
            gruposEncFiltrados.length === 0
              ? React.createElement('div', { style: { padding: '10px 14px', fontSize: 13, color: T.textMuted } }, 'Nenhum resultado.')
              : gruposEncFiltrados.map((g) => {
                  const aberta = !!termoEnc || secEncAberta === g.id;
                  return React.createElement('div', { key: g.id, style: { borderTop: `1px solid ${T.surfaceMuted}` } },
                    // Cabeçalho da secretaria (recolhível)
                    React.createElement('button', {
                      className: 'cg-enc-sec',
                      onClick: () => setSecEncAberta(aberta && !termoEnc ? null : g.id),
                    },
                      React.createElement(ChevronRight, { size: 15, className: 'cg-enc-chevron' + (aberta ? ' aberta' : '') }),
                      React.createElement('span', { style: { width: 9, height: 9, borderRadius: '50%', background: g.cor, flexShrink: 0 } }),
                      React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, g.nome),
                      React.createElement('span', { className: 'cg-enc-badge' }, String(g.deps.length)),
                    ),
                    // Departamentos da secretaria — entram em cascata
                    aberta && g.deps.map((dep, i) =>
                      React.createElement('button', {
                        key: dep.id, onClick: () => encaminhar(dep.id),
                        className: 'cg-enc-dep' + (dep.id === conversa?.departamento_id ? ' sel' : ''),
                        style: { animationDelay: `${Math.min(i, 8) * 0.035}s` },
                      },
                        React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: dep.cor || g.cor || T.primary, flexShrink: 0 } }),
                        React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, dep.nome),
                      )),
                  );
                }),
          ),
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
          React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); abrirGaleria(); }, style: { ...dropdownItem, color: T.textSecondary } },
            React.createElement(Images, { size: 15 }), 'Ver mídias'),
          React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); marcarNaoLida(); }, style: { ...dropdownItem, color: T.textSecondary } },
            React.createElement(Mail, { size: 15 }), 'Marcar como não lida'),
          conversa.status === 'arquivada'
            ? React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); desarquivar(); }, style: { ...dropdownItem, color: T.primary } },
                React.createElement(Archive, { size: 15 }), 'Desarquivar')
            : React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); arquivar(); }, style: { ...dropdownItem, color: T.textSecondary } },
                React.createElement(Archive, { size: 15 }), 'Arquivar'),
          React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); excluirConversa(); }, style: { ...dropdownItem, color: T.danger } },
            React.createElement(Trash2, { size: 15 }), 'Excluir conversa'),
        ),
      ),
      ), // fecha o Fragment da barra de ações desktop (!ehCompacto)
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
          flex: 1, overflowY: 'auto', padding: ehMobile ? '12px 10px' : '20px 24px',
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
          onResponder: () => setRespondendoA(msg),
          onReagir: (emoji) => reagirMsg(msg, emoji),
          respondida: msg.respondendo_a ? mensagens.find((m) => m.id === msg.respondendo_a) : null,
          nomeContato: nome,
          compacto: ehMobile,
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

    // Banner durante gravação
    gravando && React.createElement('div', {
      role: 'status', 'aria-live': 'polite',
      style: { padding: '10px 16px', background: T.dangerSoft, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      React.createElement('span', { className: 'pulse-dot', style: { width: 10, height: 10, borderRadius: '50%', background: T.danger, display: 'inline-block' } }),
      React.createElement('span', { style: { fontSize: 13, color: T.danger, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
        `Gravando... ${formatarDuracao(tempoGravadoMs)} / 2:00`,
      ),
      React.createElement('div', { style: { flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' } },
        React.createElement('div', { style: { width: `${Math.min(100, (tempoGravadoMs / AUDIO_MAX_MS) * 100)}%`, height: '100%', background: T.danger, transition: 'width 0.2s' } })),
      React.createElement('button', { type: 'button', onClick: pararGravacao, 'aria-label': 'Parar gravação', style: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: T.danger, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(Square, { size: 14, fill: '#fff' })),
    ),

    // Preview do áudio gravado (antes de enviar)
    audioBlob && !gravando && React.createElement('div', {
      style: { padding: '8px 16px', background: T.surfaceMuted, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      React.createElement('button', { type: 'button', onClick: tocarPausarPreview, 'aria-label': tocando ? 'Pausar pré-visualização' : 'Ouvir pré-visualização', style: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: T.primary, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        tocando ? React.createElement(Pause, { size: 16 }) : React.createElement(Play, { size: 16, fill: '#fff' })),
      React.createElement('audio', { ref: audioPreviewRef, src: audioUrl, onPlay: () => setTocando(true), onPause: () => setTocando(false), onEnded: () => setTocando(false), preload: 'metadata' }),
      React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
        React.createElement('span', { style: { fontSize: 12, color: T.text, fontWeight: 600 } }, 'Mensagem de voz'),
        React.createElement('span', { style: { fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums' } }, formatarDuracao(audioDuracao)),
      ),
      React.createElement('button', { type: 'button', onClick: descartarAudio, 'aria-label': 'Regravar áudio', title: 'Regravar', style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex' } },
        React.createElement(RotateCcw, { size: 16 })),
      React.createElement('button', { type: 'button', onClick: descartarAudio, 'aria-label': 'Cancelar áudio', style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, display: 'flex' } },
        React.createElement(X, { size: 16 })),
    ),

    audioErro && React.createElement('div', {
      role: 'alert',
      style: { padding: '6px 16px', background: '#FEE2E2', color: '#991B1B', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
    },
      React.createElement('span', { style: { flex: 1 } }, audioErro),
      React.createElement('button', { onClick: () => setAudioErro(null), 'aria-label': 'Fechar', style: { background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B' } }, React.createElement(X, { size: 14 })),
    ),

    // Barra "respondendo a" (acima do compositor)
    respondendoA && React.createElement('div', {
      style: { padding: '8px 16px', background: T.surfaceMuted, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      React.createElement('div', { style: { width: 3, alignSelf: 'stretch', background: T.primary, borderRadius: 2 } }),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: T.primary } },
          respondendoA.direcao === 'saida' ? (respondendoA.operador_nome || 'Operador') : (nome || 'Cidadão')),
        React.createElement('div', { style: { fontSize: 12.5, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          respondendoA.conteudo || `[${respondendoA.tipo || 'mídia'}]`),
      ),
      React.createElement('button', {
        onClick: () => setRespondendoA(null), 'aria-label': 'Cancelar resposta', title: 'Cancelar',
        style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex' },
      }, React.createElement(X, { size: 16 })),
    ),

    // Preview do arquivo antes de enviar (Ctrl+V, drag & drop, anexo)
    previewArquivo && React.createElement('div', {
      style: { padding: '10px 16px', background: T.surface, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      // Thumbnail / preview da imagem
      previewArquivo.tipo === 'imagem'
        ? React.createElement('img', {
            src: previewArquivo.dataUrl,
            alt: previewArquivo.file.name,
            style: { width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, flexShrink: 0 },
          })
        : React.createElement('div', {
            style: { width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${T.border}`, flexShrink: 0, background: T.surfaceMuted },
          },
            React.createElement(Paperclip, { size: 24, color: T.textMuted })),
      // Info do arquivo + legenda
      React.createElement('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('span', {
            style: { fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, previewArquivo.file.name),
          React.createElement('span', { style: { fontSize: 11, color: T.textMuted, flexShrink: 0 } },
            previewArquivo.file.size > 1024 * 1024
              ? `${(previewArquivo.file.size / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.round(previewArquivo.file.size / 1024)} KB`),
        ),
        React.createElement('input', {
          type: 'text',
          value: previewLegenda,
          onChange: (e) => setPreviewLegenda(e.target.value),
          placeholder: 'Adicione uma legenda (opcional)...',
          maxLength: 1000,
          onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); enviarMidia(previewArquivo.file, previewLegenda); } },
          style: { width: '100%', border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, color: T.text, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
        }),
      ),
      // Botões
      React.createElement('button', {
        type: 'button',
        onClick: cancelarPreview,
        disabled: anexando,
        title: 'Cancelar',
        style: { background: 'none', border: 'none', cursor: anexando ? 'not-allowed' : 'pointer', color: T.textMuted, padding: 6, display: 'flex', flexShrink: 0 },
      }, React.createElement(X, { size: 20 })),
      React.createElement('button', {
        type: 'button',
        onClick: () => enviarMidia(previewArquivo.file, previewLegenda),
        disabled: anexando,
        title: 'Enviar arquivo',
        style: { width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: anexando ? 'not-allowed' : 'pointer', background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      }, anexando
        ? React.createElement(Loader2, { size: 18, color: '#fff', className: 'spin' })
        : React.createElement(Send, { size: 18, color: '#fff' })),
    ),

    // Composer
    erroEnvio && React.createElement('div', {
      role: 'alert',
      style: { padding: '8px 16px', background: T.dangerSoft, color: T.danger, fontSize: 12, fontWeight: 600, borderTop: `1px solid ${T.border}` },
    }, erroEnvio),
    React.createElement('form', {
      onSubmit: enviar,
      style: { position: 'relative', display: 'flex', alignItems: 'flex-end', padding: ehMobile ? '8px 8px' : '10px 16px', background: T.surface, gap: ehMobile ? 6 : 10, flexShrink: 0, borderTop: `1px solid ${T.border}` },
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
        onChange: (e) => {
          const file = e.target.files?.[0];
          if (!file) { e.target.value = ''; return; }
          if (!arquivoPermitido(file.name, file.type)) {
            notificar('Tipo de arquivo não permitido por segurança.', 'erro');
            e.target.value = ''; return;
          }
          if (file.size > MAX_MIDIA_BYTES) {
            notificar('Arquivo muito grande (máx. 16 MB).', 'erro');
            e.target.value = ''; return;
          }
          const tipo = file.type.startsWith('image/') ? 'imagem'
            : file.type.startsWith('audio/') ? 'audio'
            : file.type.startsWith('video/') ? 'video'
            : 'documento';
          const reader = new FileReader();
          reader.onload = () => setPreviewArquivo({ file, dataUrl: reader.result, tipo });
          reader.readAsDataURL(file);
          e.target.value = '';
        },
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
          placeholder: gravando ? 'Gravando áudio...' : previewArquivo ? 'Digite uma legenda e pressione Enter para enviar...' : audioBlob ? 'Adicione uma legenda (opcional)...' : 'Digite (Enter envia, Shift+Enter quebra linha, Ctrl+V cola arquivo)',
          rows: 1,
          'aria-label': 'Mensagem',
          maxLength: 4000,
          disabled: gravando,
          onPaste: handlePaste,
          onKeyDown: (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e); }
            else if (e.key === 'Escape' && respondendoA) { setRespondendoA(null); }
          },
          style: { width: '100%', resize: 'none', maxHeight: 120, minHeight: 22, boxSizing: 'border-box', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 22, padding: '11px 52px 11px 16px', color: T.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', lineHeight: '20px', opacity: gravando ? 0.5 : 1 },
        }),
        texto.length > 0 && React.createElement('span', {
          style: { position: 'absolute', right: 12, bottom: 6, fontSize: 10, color: texto.length > 3800 ? T.danger : T.textMuted },
        }, `${texto.length}/4000`),
      ),
      // Botão de microfone (vira stop durante gravação)
      !audioBlob && React.createElement('button', {
        type: 'button',
        onClick: gravando ? pararGravacao : iniciarGravacao,
        'aria-label': gravando ? 'Parar gravação' : 'Gravar áudio',
        title: gravando ? 'Parar' : 'Gravar áudio (máx. 2 min)',
        disabled: anexando,
        style: {
          width: 44, height: 44, flexShrink: 0, borderRadius: '50%', border: 'none',
          cursor: anexando ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: gravando ? T.danger : (anexando ? T.surfaceMuted : T.primarySoft),
          transition: 'all 0.2s',
          boxShadow: gravando ? `0 0 0 4px ${T.danger}40` : 'none',
          animation: gravando ? 'pulse 1s ease-in-out infinite' : 'none',
        },
      },
        gravando
          ? React.createElement(Square, { size: 18, color: '#fff', fill: '#fff' })
          : React.createElement(Mic, { size: 20, color: anexando ? T.textMuted : T.primary })),
      React.createElement('button', {
        type: 'submit',
        disabled: enviando || anexando || gravando || (!texto.trim() && !audioBlob),
        'aria-label': 'Enviar mensagem',
        title: connected ? 'Enviar' : 'Conectando...',
        style: { width: 44, height: 44, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: enviando || (!texto.trim() && !audioBlob) ? 'default' : 'pointer', background: (texto.trim() || audioBlob) && !enviando && !gravando ? T.primary : T.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, enviando
        ? React.createElement(Loader2, { size: 20, color: '#fff', className: 'spin' })
        : React.createElement(Send, { size: 20, color: (texto.trim() || audioBlob) && !enviando && !gravando ? '#fff' : T.textMuted })),
    ),

    // ===== Bottom-sheets do celular/tablet (substituem os dropdowns do header) =====
    ehCompacto && showAcoes && React.createElement(BottomSheet, { titulo: nome, onClose: () => setShowAcoes(false) },
      semDono && acaoSheetItem(UserCheck, 'Assumir conversa', () => { setShowAcoes(false); assumir(); }, T.primary),
      conversa.operador_id && podeGerir && acaoSheetItem(ArrowRightLeft, 'Transferir', () => { setShowAcoes(false); setShowTransferir(true); }),
      conversa.operador_id && podeGerir && acaoSheetItem(Undo2, 'Devolver para a fila', () => { setShowAcoes(false); devolver(); }),
      acaoSheetItem(UserPlus, 'Anexar atendente', () => { setShowAcoes(false); setShowParticipantes(true); }),
      acaoSheetItem(MessageSquare, 'Templates / respostas rápidas', () => { setShowAcoes(false); setShowTemplates(true); }),
      acaoSheetItem(Tag, 'Etiquetas', () => { setShowAcoes(false); setShowEtiquetas(true); }),
      acaoSheetItem(Building2, 'Encaminhar para setor', () => { setShowAcoes(false); if (!showEncaminhar) abrirEncaminhar(); }),
      acaoSheetItem(CheckCircle2, 'Resolver conversa', () => { setShowAcoes(false); resolver(); }, T.success),
      acaoSheetItem(Images, 'Ver mídias', () => { setShowAcoes(false); abrirGaleria(); }),
      acaoSheetItem(Mail, 'Marcar como não lida', () => { setShowAcoes(false); marcarNaoLida(); }),
      conversa.status === 'arquivada'
        ? acaoSheetItem(Archive, 'Desarquivar', () => { setShowAcoes(false); desarquivar(); }, T.primary)
        : acaoSheetItem(Archive, 'Arquivar', () => { setShowAcoes(false); arquivar(); }),
      acaoSheetItem(Trash2, 'Excluir conversa', () => { setShowAcoes(false); excluirConversa(); }, T.danger),
    ),

    ehCompacto && showTemplates && React.createElement(BottomSheet, { titulo: 'Respostas rápidas', onClose: () => setShowTemplates(false) },
      templates.length === 0
        ? React.createElement('div', { style: { padding: 20, fontSize: 13, color: T.textMuted } }, 'Nenhum template. Crie no menu Admin > Templates.')
        : templates.map((t) => React.createElement('button', {
            key: t.id, onClick: () => { aplicarTemplate(t.conteudo); setShowTemplates(false); },
            style: { display: 'block', width: '100%', padding: '13px 20px', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', textAlign: 'left' },
          },
            React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, t.titulo),
            React.createElement('div', { style: { fontSize: 12.5, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.conteudo),
          )),
    ),

    ehCompacto && showEtiquetas && React.createElement(BottomSheet, { titulo: 'Categorizar', onClose: () => setShowEtiquetas(false) },
      etiquetas.length === 0
        ? React.createElement('div', { style: { padding: 20, fontSize: 13, color: T.textMuted } }, 'Nenhuma etiqueta.')
        : etiquetas.map((et) => {
            const ativo = etiquetasConv.some((e) => e.id === et.id);
            return React.createElement('button', {
              key: et.id, onClick: () => toggleEtiqueta(et.id),
              style: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 20px', border: 'none', borderBottom: `1px solid ${T.border}`, background: ativo ? T.primarySoft : 'transparent', cursor: 'pointer', fontSize: 14.5, color: T.text, textAlign: 'left' },
            },
              React.createElement('span', { style: { width: 12, height: 12, borderRadius: '50%', background: et.cor, flexShrink: 0 } }),
              React.createElement('span', { style: { flex: 1 } }, et.nome),
              ativo && React.createElement(CheckCircle2, { size: 16, color: T.success }),
            );
          }),
    ),

    ehCompacto && showEncaminhar && React.createElement(BottomSheet, { titulo: 'Encaminhar para', onClose: () => setShowEncaminhar(false) },
      React.createElement('style', null, ESTILO_ENCAMINHAR),
      React.createElement('div', { style: { padding: '4px 16px 10px', position: 'relative' } },
        React.createElement(Search, { size: 16, color: T.textMuted, style: { position: 'absolute', left: 26, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' } }),
        React.createElement('input', {
          value: filtroEnc, onChange: (e) => setFiltroEnc(e.target.value),
          placeholder: 'Buscar secretaria ou departamento…',
          style: { width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px 10px 34px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none' },
        }),
      ),
      gruposEncFiltrados.length === 0
        ? React.createElement('div', { style: { padding: '10px 18px', fontSize: 14, color: T.textMuted } }, 'Nenhum resultado.')
        : gruposEncFiltrados.map((g) => {
            const aberta = !!termoEnc || secEncAberta === g.id;
            return React.createElement('div', { key: g.id, style: { borderTop: `1px solid ${T.surfaceMuted}` } },
              React.createElement('button', { className: 'cg-enc-sec', onClick: () => setSecEncAberta(aberta && !termoEnc ? null : g.id) },
                React.createElement(ChevronRight, { size: 16, className: 'cg-enc-chevron' + (aberta ? ' aberta' : '') }),
                React.createElement('span', { style: { width: 9, height: 9, borderRadius: '50%', background: g.cor, flexShrink: 0 } }),
                React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' } }, g.nome),
                React.createElement('span', { className: 'cg-enc-badge' }, String(g.deps.length)),
              ),
              aberta && g.deps.map((dep) => React.createElement('button', {
                key: dep.id, onClick: () => encaminhar(dep.id),
                className: 'cg-enc-dep' + (dep.id === conversa?.departamento_id ? ' sel' : ''),
              },
                React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: dep.cor || g.cor || T.primary, flexShrink: 0 } }),
                React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, dep.nome),
              )),
            );
          }),
    ),

    showParticipantes && React.createElement(ModalParticipantes, { conversa, onClose: () => setShowParticipantes(false) }),
    showTransferir && React.createElement(ModalTransferir, { conversa, onClose: () => setShowTransferir(false), onTransferido: () => onConversaUpdated?.() }),

    // Galeria de mídia da conversa
    showGaleria && React.createElement('div', {
      onClick: () => setShowGaleria(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    },
      React.createElement('div', {
        onClick: (e) => e.stopPropagation(),
        style: { background: T.surface, borderRadius: 12, width: 'min(720px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: T.shadowMd },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${T.border}` } },
          React.createElement('span', { style: { fontWeight: 700, fontSize: 15, color: T.text } }, `Mídias da conversa${midias.length ? ` (${midias.length})` : ''}`),
          React.createElement('button', { onClick: () => setShowGaleria(false), 'aria-label': 'Fechar', style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, display: 'flex' } }, React.createElement(X, { size: 20 })),
        ),
        React.createElement('div', { style: { padding: 16, overflowY: 'auto' } },
          carregandoMidias
            ? React.createElement('div', { style: { textAlign: 'center', padding: 30, color: T.textMuted } }, React.createElement(Loader2, { size: 22, className: 'spin' }))
            : midias.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', padding: 30, color: T.textMuted, fontSize: 13 } }, 'Nenhuma mídia trocada nesta conversa.')
            : React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 } },
                midias.map((m) => React.createElement('div', {
                  key: m.id, style: { background: T.surfaceMuted, borderRadius: 8, padding: 6, overflow: 'hidden' },
                },
                  React.createElement(MediaPreview, { msg: m, isMe: m.direcao === 'saida', onOpenLightbox: (src, t, mime, nome) => setGaleriaLightbox({ src, tipo: t, mime, nome }) }),
                  React.createElement('div', { style: { fontSize: 10, color: T.textMuted, marginTop: 4, textAlign: 'center' } }, new Date(m.criado_em).toLocaleDateString('pt-BR')),
                )),
              ),
        ),
      ),
    ),
    galeriaLightbox && React.createElement(MediaLightbox, { src: galeriaLightbox.src, tipo: galeriaLightbox.tipo, mime: galeriaLightbox.mime, nome: galeriaLightbox.nome, onClose: () => setGaleriaLightbox(null) }),
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

function RelogioCalendario() {
  const [hora, setHora] = React.useState(new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const saudacao = hora.getHours() < 12 ? 'Bom dia' : hora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const diaSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][hora.getDay()];
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const dataStr = `${diaSemana}, ${hora.getDate()} de ${meses[hora.getMonth()]} de ${hora.getFullYear()}`;
  const horaStr = hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return React.createElement('div', { style: { textAlign: 'center', marginBottom: 24 } },
    React.createElement('p', { style: { fontSize: 18, fontWeight: 700, color: T.primary, marginBottom: 8 } }, saudacao + '!'),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 6 } },
      React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20, color: T.textSecondary } }, 'schedule'),
      React.createElement('span', { style: { fontSize: 26, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 } }, horaStr),
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 } },
      React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 18, color: T.textSecondary } }, 'calendar_today'),
      React.createElement('span', { style: { fontSize: 13, color: T.textSecondary } }, dataStr),
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
        React.createElement(RelogioCalendario),
        React.createElement('p', {
          style: { fontSize: 14, color: T.textSecondary, lineHeight: '22px', marginBottom: 40, maxWidth: 380, margin: '0 auto 40px' },
        }, 'Selecione um atendimento na lista ao lado para iniciar uma conversa. Você pode alternar entre departamentos clicando no nome do setor no topo da barra lateral.'),
        React.createElement('p', {
          style: { fontSize: 13, color: T.textMuted, lineHeight: '20px', maxWidth: 340, margin: '0 auto 24px' },
        }, 'Atalho: use Ctrl + K para buscar conversas rapidamente pelo nome ou número do cidadão.'),
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

// Painel deslizante de baixo (estilo WhatsApp mobile) para os menus de ação.
function BottomSheet({ titulo, onClose, children }) {
  return React.createElement('div', { style: { position: 'fixed', inset: 0, zIndex: 1190 } },
    React.createElement('style', null, '@keyframes cgSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }'),
    React.createElement('div', { onClick: onClose, style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' } }),
    React.createElement('div', {
      style: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: T.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        maxHeight: '78vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.18)', animation: 'cgSheetUp 0.22s ease both',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      },
    },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', padding: '8px 0 2px', flexShrink: 0 } },
        React.createElement('div', { style: { width: 40, height: 4, borderRadius: 2, background: T.borderStrong } })),
      titulo && React.createElement('div', {
        style: { padding: '6px 20px 10px', fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, borderBottom: `1px solid ${T.border}` },
      }, titulo),
      React.createElement('div', { style: { overflowY: 'auto', flex: 1, paddingBottom: 6 } }, children),
    ),
  );
}
const dropdown = { position: 'absolute', top: '100%', right: 0, background: T.surface, borderRadius: T.radius, boxShadow: T.shadowMd, border: `1px solid ${T.border}`, zIndex: 100, minWidth: 230, overflow: 'hidden', marginTop: 6 };
const dropdownItem = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 13.5, textAlign: 'left' };

// Estilos + animações do menu Encaminhar (hover real e cascata exigem CSS, não dá com inline)
const ESTILO_ENCAMINHAR = `
@keyframes cgEncMenuIn { from { opacity: 0; transform: translateY(-6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes cgEncDepIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.cg-enc-menu { animation: cgEncMenuIn 0.16s ease both; transform-origin: top right; }
.cg-enc-sec { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: none; background: transparent; color: ${T.text}; cursor: pointer; font-size: 13px; font-weight: 600; text-align: left; transition: background 0.15s ease; }
.cg-enc-sec:hover { background: ${T.surfaceAlt}; }
.cg-enc-chevron { color: ${T.textMuted}; flex-shrink: 0; transition: transform 0.22s cubic-bezier(0.4,0,0.2,1); }
.cg-enc-chevron.aberta { transform: rotate(90deg); }
.cg-enc-badge { font-size: 11px; font-weight: 600; color: ${T.textSecondary}; background: ${T.surfaceMuted}; border-radius: 10px; padding: 1px 7px; flex-shrink: 0; transition: background 0.15s ease, color 0.15s ease; }
.cg-enc-sec:hover .cg-enc-badge { background: ${T.primarySoft}; color: ${T.primary}; }
.cg-enc-dep { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px 8px 34px; border: none; background: transparent; color: ${T.text}; cursor: pointer; font-size: 13px; text-align: left; animation: cgEncDepIn 0.2s ease both; transition: background 0.15s ease, padding-left 0.15s ease; }
.cg-enc-dep:hover { background: ${T.surfaceAlt}; padding-left: 38px; }
.cg-enc-dep.sel { background: ${T.primarySoft}; box-shadow: inset 3px 0 0 ${T.primary}; }
.cg-enc-dep.sel:hover { background: #cfe0fd; }
`;
