import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Paperclip, Smile, ShieldCheck, Clock, User, UserPlus, CheckCircle2, Building2, MessageSquare, Tag, StickyNote, ChevronDown, ChevronRight, Archive, Trash2, ArrowRightLeft, Undo2, UserCheck, X, MoreVertical, ArrowDown, Loader2, Mic, Square, Play, Pause, RotateCcw, Images, Mail, Search, ArrowLeft, CalendarPlus, FileText, Copy, Check, Pen } from 'lucide-react';
import { Avatar } from './Avatar';
import { BolhaConversa } from './BolhaConversa';
import { DeptBadge } from './DeptBadge';
import { ModalParticipantes } from './ModalParticipantes';
import { ModalTransferir } from './ModalTransferir';
import { MediaPreview, MediaLightbox } from './MediaPreview';
import { GaleriaMidias } from './GaleriaMidias';
import { PainelCidadao } from './PainelCidadao';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fetchMensagens, fetchDepartamentos, fetchTemplates, fetchEtiquetas, fetchEtiquetasConversa, fetchNotasInternas, editarContato, fetchTransferenciaPendente, excluirMensagemConversa, fetchMidiasConversa, marcarConversaNaoLida, criarContato, iniciarConversa } from '../api';
import { mimeParaTipo, encodeFileBase64, mesmaData, formatarDataSeparador } from '../utils/arquivo';
import { SeparadorData } from './SeparadorData';
import { PainelMinhaAgenda } from './agenda/PainelMinhaAgenda';
import { ModalCompromisso } from './agenda/ModalCompromisso';
import { notificarAgendaAtualizada } from './agenda/eventos';
import { T } from '../theme';

const EMOJIS_RAPIDOS = ['😀', '😅', '👍', '🙏', '❤️', '😊', '👏', '✅', '⚠️', '📎'];
const PERTO_DO_FIM_PX = 120;
const MAX_MIDIA_BYTES = 16 * 1024 * 1024; // 16 MB (limite prático do WhatsApp)
// Largura da coluna de leitura das mensagens. Acima disso as bolhas ficariam
// nas beiradas de um monitor grande, forçando o olho a varrer a tela inteira.

// Minúsculas e sem acento, para a busca casar "atendimento" com "Atendimento".
function normalizarTexto(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
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

export function PainelAtendimento({ conversa, onConversaUpdated, breakpoint, onVoltar, onAbrirConversa, onEncerrada, onGerarProtocolo, onAbrirProtocolo }) {
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
  const [showMenuMais, setShowMenuMais] = useState(false);
  const [showNovoCompromisso, setShowNovoCompromisso] = useState(false);
  const [showAcoes, setShowAcoes] = useState(false); // menu de ações combinado (mobile/tablet)
  const [showEmojis, setShowEmojis] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const [respondendoA, setRespondendoA] = useState(null);
  const [showGaleria, setShowGaleria] = useState(false);
  // Busca dentro da conversa: filtra as mensagens já carregadas e realça o termo.
  const [showBusca, setShowBusca] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  // Painel do cidadão fica fechado por padrão e lembra a escolha do operador.
  const [showCidadao, setShowCidadao] = useState(() => {
    try { return localStorage.getItem('chatgov_painel_cidadao') === '1'; } catch { return false; }
  });
  const [midias, setMidias] = useState([]);
  const [carregandoMidias, setCarregandoMidias] = useState(false);
  const [galeriaLightbox, setGaleriaLightbox] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [avatarAmpliado, setAvatarAmpliado] = useState(false);
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
  const rolarParaMensagemRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const pertoDoFimRef = useRef(true);
  const dragCounterRef = useRef(0);
  const envioEmCursoRef = useRef(false);
  const [protocolos, setProtocolos] = useState([]);
  const [carregandoProtocolos, setCarregandoProtocolos] = useState(false);
  const [showProtocolos, setShowProtocolos] = useState(false);
  const [showVincularProtocolo, setShowVincularProtocolo] = useState(false);
  const [protocoloBusca, setProtocoloBusca] = useState('');
  const [protocolosBusca, setProtocolosBusca] = useState([]);
  const [buscandoProtocolos, setBuscandoProtocolos] = useState(false);
  const [vincularCarregando, setVincularCarregando] = useState(null);
  const [protocoloCriado, setProtocoloCriado] = useState(null);
  const [protocoloCopiado, setProtocoloCopiado] = useState(false);
  const protocolosAnterioresRef = useRef(-1);

  const novaChaveEnvio = () => (
    globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  // Toast simples (substitui alerts). Auto-some em 3.5s.
  const notificar = useCallback((mensagem, tipo = 'info') => {
    setToast({ mensagem, tipo });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const salvarContatoRecebido = useCallback(async (contato) => {
    const salvo = await criarContato({ nome: contato.nome || null, telefone: contato.telefone, canal: 'whatsapp' });
    notificar(salvo.ja_cadastrado ? 'Este contato já está na agenda.' : 'Contato adicionado à agenda.', 'ok');
    return salvo;
  }, [notificar]);

  const iniciarConversaComContato = useCallback(async (contato) => {
    const novaConversa = await iniciarConversa({
      nome: contato.nome || null,
      telefone: contato.telefone,
      departamento_id: conversa?.departamento_id || null,
      mensagem: null,
    });
    onConversaUpdated?.();
    onAbrirConversa?.(novaConversa.id);
    return novaConversa;
  }, [conversa?.departamento_id, onConversaUpdated, onAbrirConversa]);

  // Modal de confirmação (substitui confirm/prompt). `comInput` habilita um campo.
  const pedirConfirmacao = useCallback((opcoes) => setConfirmacao(opcoes), []);

  const opId = auth?.operador?.id;
  const ehGestor = ['admin', 'supervisor'].includes(auth?.operador?.papel);
  // Busca acentuada e sem diferenciar maiúsculas: "protocolo" acha "Protocolo".
  const mensagensVisiveis = useMemo(() => {
    const termo = showBusca ? termoBusca.trim() : '';
    if (!termo) return mensagens;
    const alvo = normalizarTexto(termo);
    return mensagens.filter((m) => normalizarTexto(m.conteudo || m.media_nome || '').includes(alvo));
  }, [mensagens, termoBusca, showBusca]);
  // Exclusão de conversa é restrita a admin no backend; o menu segue a mesma regra
  // para não oferecer uma ação que sempre falharia.
  const ehAdmin = auth?.operador?.papel === 'admin';
  const souDono = conversa?.operador_id && conversa.operador_id === opId;
  const semDono = conversa && !conversa.operador_id;
  // Estado sempre derivado da prop — o ChatGov mantém a conversa em dia com o
  // servidor. `status_operacional` é a fonte de verdade; `status` é o campo legado.
  const conversaStatus = conversa?.status;
  const statusOper = conversa?.status_operacional;
  // Aguardando triagem: ainda não há atendente responsável.
  const emTriagem = ['NOVA', 'NA_FILA'].includes(statusOper)
    || (!statusOper && conversaStatus === 'fila');
  const semSetor = !conversa?.departamento_id;
  const ehArquivada = statusOper === 'ARQUIVADA' || conversaStatus === 'arquivada';

  // Fecha dropdowns ao clicar fora ou pressionar Esc
  const fecharDropdowns = useCallback(() => {
    setShowMenuMais(false);
    setShowTemplates(false);
    setShowEtiquetas(false);
    setShowEncaminhar(false);
    setShowEmojis(false);
  }, []);

  useEffect(() => {
    if (!showMenuMais && !showTemplates && !showEtiquetas && !showEncaminhar && !showEmojis) return;
    // Um dropdown aberto "pertence" a estes elementos; eventos vindos de dentro
    // deles não podem fechá-lo.
    const dentroDoMenu = (alvo) =>
      alvo instanceof Element && !!alvo.closest('[role="menu"], .cg-enc-menu');
    const onClickFora = (e) => {
      if (!dentroDoMenu(e.target)) fecharDropdowns();
    };
    const onEsc = (e) => { if (e.key === 'Escape') fecharDropdowns(); };
    // O listener é em capture (scroll não borbulha), então ele vê a rolagem de
    // qualquer container — inclusive a lista de setores do próprio menu, que tem
    // rolagem própria. Rolar dentro do menu não pode fechá-lo.
    const onScroll = (e) => {
      if (dentroDoMenu(e.target)) return;
      fecharDropdowns();
    };
    document.addEventListener('click', onClickFora, true);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('click', onClickFora, true);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [showMenuMais, showTemplates, showEtiquetas, showEncaminhar, showEmojis, fecharDropdowns]);

  const podeGerir = souDono || ehGestor;

  useEffect(() => {
    const onShortcut = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      const digitando = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
      if (digitando || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (key === 'n') {
        event.preventDefault();
        setShowNotas(true);
      } else if (key === 't' && podeGerir) {
        event.preventDefault();
        setShowEncaminhar(true);
      } else if (event.key === '/') {
        event.preventDefault();
        setShowTemplates(true);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [podeGerir]);
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

  // ── Protocolos vinculados ────────────────────────────────────────
  useEffect(() => {
    if (!conversa?.id) { setProtocolos([]); setShowProtocolos(false); return; }
    setCarregandoProtocolos(true);
    var token = (function () { try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return null; } })();
    fetch('/api/v1/protocols/conversation/' + conversa.id, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function (data) {
        var lista = Array.isArray(data) ? data : (data.protocolos || data.data || []);
        setProtocolos(lista);
        if (protocolosAnterioresRef.current >= 0 && lista.length > protocolosAnterioresRef.current) {
          var item = lista[0];
          if (item) { setProtocoloCriado(item); setTimeout(function () { setProtocoloCriado(null); }, 10000); }
        }
        protocolosAnterioresRef.current = lista.length;
      })
      .catch(function () { setProtocolos([]); })
      .finally(function () { setCarregandoProtocolos(false); });
  }, [conversa?.id]);

  // ── Carrega o lote anterior (scroll infinito) ──────────────────
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
    // 'conversa:atualizada' é tratado no ChatGov, que rebusca a conversa e repassa
    // o estado real por prop. Aqui não dá para adivinhar o novo status: o evento
    // é o mesmo para abrir, encaminhar, assumir, reabrir e tique de entrega.
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

  // ── Protocolos ────────────────────────────────────────────────────

  const fetchProtocolos = useCallback(function () {
    if (!conversa?.id) return;
    setCarregandoProtocolos(true);
    var token = (function () { try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return null; } })();
    fetch('/api/v1/protocols/conversation/' + conversa.id, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function (data) {
        var lista = Array.isArray(data) ? data : (data.protocolos || data.data || []);
        setProtocolos(lista);
        if (protocolosAnterioresRef.current >= 0 && lista.length > protocolosAnterioresRef.current) {
          var item = lista[0];
          if (item) { setProtocoloCriado(item); setTimeout(function () { setProtocoloCriado(null); }, 10000); }
        }
        protocolosAnterioresRef.current = lista.length;
      })
      .catch(function () { setProtocolos([]); })
      .finally(function () { setCarregandoProtocolos(false); });
  }, [conversa?.id]);

  var timerBuscaRef = useRef(null);

  var aoDigitarProtocolo = useCallback(function (valor) {
    setProtocoloBusca(valor);
    if (timerBuscaRef.current) clearTimeout(timerBuscaRef.current);
    if (!valor || valor.trim().length < 2) { setProtocolosBusca([]); setBuscandoProtocolos(false); return; }
    setBuscandoProtocolos(true);
    timerBuscaRef.current = setTimeout(function () {
      var token = (function () { try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return null; } })();
      fetch('/api/v1/protocols?q=' + encodeURIComponent(valor.trim()) + '&limit=10', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
        .then(function (data) { setProtocolosBusca(Array.isArray(data) ? data : (data.protocolos || data.data || [])); })
        .catch(function () { setProtocolosBusca([]); })
        .finally(function () { setBuscandoProtocolos(false); });
    }, 350);
  }, []);

  var vincularProtocolo = useCallback(function (protocoloId) {
    setVincularCarregando(protocoloId);
    var token = (function () { try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return null; } })();
    fetch('/api/v1/conversations/' + conversa.id + '/link-protocol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || '') },
      body: JSON.stringify({ protocolo_id: protocoloId }),
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function () {
        setShowVincularProtocolo(false);
        setProtocoloBusca('');
        setProtocolosBusca([]);
        fetchProtocolos();
        notificar('Protocolo vinculado com sucesso.', 'sucesso');
      })
      .catch(function () { notificar('Erro ao vincular protocolo.', 'erro'); })
      .finally(function () { setVincularCarregando(null); });
  }, [conversa?.id, fetchProtocolos, notificar]);

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
      socket.timeout(90000).emit('mensagem:enviar', {
        convId: conversa.id,
        jid: conversa.wa_jid,
        texto: caption?.trim() || undefined,
        tipo: 'audio',
        mediaBase64,
        mediaMime: mime,
        mediaNome: `audio-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`,
        respondendoA: respondendoA?.id || undefined,
        idempotencyKey: novaChaveEnvio(),
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
    if (!conversa || enviando || envioEmCursoRef.current) return;

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
    envioEmCursoRef.current = true;
    setErroEnvio('');
    socket.timeout(8000).emit('mensagem:enviar', { convId: conversa.id, jid: conversa.wa_jid, texto: txt, respondendoA: respondendoA?.id || undefined, idempotencyKey: novaChaveEnvio() }, (err, ack) => {
      setEnviando(false);
      envioEmCursoRef.current = false;
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

  const tentarNovamente = (msg) => {
    if (!socket || !connected || !msg?.conteudo || envioEmCursoRef.current) return;
    envioEmCursoRef.current = true;
    socket.timeout(8000).emit('mensagem:enviar', {
      convId: conversa.id,
      jid: conversa.wa_jid,
      texto: msg.conteudo,
      respondendoA: msg.respondendo_a || undefined,
      idempotencyKey: novaChaveEnvio(),
    }, (err, ack) => {
      envioEmCursoRef.current = false;
      if (err || !ack?.ok) {
        notificar(ack?.erro || 'Não foi possível tentar novamente.', 'erro');
        return;
      }
      setMensagens((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'cancelada' } : m)
        .concat(ack.mensagem && !prev.some((m) => m.id === ack.mensagem.id) ? [ack.mensagem] : []));
      notificar('Mensagem reenviada.', 'sucesso');
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
    const dep = departamentos.find((d) => d.id === depId);
    socket?.emit('conversa:atribuir', { convId: conversa.id, departamentoId: depId, operadorId: opId });
    setShowEncaminhar(false);
    onConversaUpdated?.();
    notificar(`Conversa encaminhada para ${dep?.nome || 'o setor'}.`, 'sucesso');
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
        notificar('Atendimento resolvido.', 'sucesso');
        // A conversa sai da lista ao ser resolvida; sem fechar o painel o
        // atendente ficava olhando um atendimento que já não existe na lista —
        // e podia continuar digitando nele. O respiro é só para o toast de
        // confirmação aparecer antes da tela voltar ao início.
        const encerrada = conversa.id;
        setTimeout(() => onEncerrada?.(encerrada), 900);
      } else {
        notificar(ack?.erro || 'Não foi possível resolver o atendimento.', 'erro');
      }
    });
  };

  // Exclusão administrativa: o backend restringe a admin e exige motivo, então a
  // confirmação pede o motivo e deixa explícito o alcance da ação.
  const excluirConversa = () => {
    pedirConfirmacao({
      titulo: 'Excluir conversa',
      texto: 'Esta ação excluirá permanentemente todo o histórico da conversa — mensagens, mídias e notas internas deixam de aparecer no atendimento. Deseja continuar?',
      comInput: true,
      inputPlaceholder: 'Motivo da exclusão (obrigatório)',
      confirmarLabel: 'Excluir conversa',
      perigoso: true,
      onConfirm: (motivo) => {
        if (!motivo?.trim()) {
          notificar('Informe o motivo da exclusão.', 'erro');
          return;
        }
        socket?.emit('conversa:excluir', { convId: conversa.id, motivo: motivo.trim() }, (ack) => {
          if (ack?.ok) {
            notificar('Conversa excluída.', 'sucesso');
            onConversaUpdated?.();
          } else {
            notificar(ack?.erro || 'Não foi possível excluir a conversa.', 'erro');
          }
        });
      },
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
      socket.timeout(90000).emit('mensagem:enviar', {
        convId: conversa.id,
        jid: conversa.wa_jid,
        texto: legenda?.trim() || texto.trim() || undefined,
        tipo: mimeParaTipo(file.type),
        mediaBase64,
        mediaMime: file.type || 'application/octet-stream',
        mediaNome: file.name,
        respondendoA: respondendoA?.id || undefined,
        idempotencyKey: novaChaveEnvio(),
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

  rolarParaMensagemRef.current = (msgId) => {
    setHighlightedMsgId(msgId);
    setTimeout(() => {
      const el = document.getElementById(`chatgov-msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    setTimeout(() => setHighlightedMsgId(null), 4000);
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

  // Sem conversa aberta, a área central deixa de ser um cartaz institucional e
  // passa a mostrar a agenda do próprio atendente — é o momento em que ele está
  // decidindo o que fazer a seguir.
  if (!conversa) {
    return React.createElement(PainelMinhaAgenda, { onAbrirConversa, breakpoint });
  }

  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;

  // Item do menu de ações (bottom-sheet) usado no celular/tablet.
  const acaoSheetItem = (Icone, label, onClick, cor) => React.createElement('button', {
    key: label, onClick,
    style: { display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '14px 20px', minHeight: 44, border: 'none', background: 'transparent', color: cor || T.text, cursor: 'pointer', fontSize: 15, fontWeight: 500, textAlign: 'left' },
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
      style: { display: 'flex', alignItems: 'center', padding: ehCompacto ? '8px 10px' : '10px 20px', background: T.surface, gap: ehCompacto ? 8 : 12, flexShrink: 0, borderBottom: `1px solid ${T.border}`, minHeight: 56, minWidth: 0 },
    },
      // Voltar (apenas no celular, onde a lista some ao abrir a conversa)
      onVoltar && ehMobile && React.createElement('button', {
        onClick: onVoltar, 'aria-label': 'Voltar', title: 'Voltar',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.text },
      }, React.createElement(ArrowLeft, { size: 22 })),
      React.createElement(Avatar, {
        nome, url: conversa.contato_avatar_url, tamanho: ehCompacto ? 38 : 42, isNumber,
        onClick: conversa.contato_avatar_url ? () => setAvatarAmpliado(true) : undefined,
      }),
      // Mobile ≤400px: header em 2 linhas com truncamento
      ehMobile
        ? React.createElement('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } },
            // Linha 1: NOME + ✎ editar + ⋮
            React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 },
            },
              editandoNome
                ? React.createElement(React.Fragment, null,
                    React.createElement('input', {
                      value: nomeEdit,
                      onChange: (e) => setNomeEdit(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter') salvarNomeContato();
                        if (e.key === 'Escape') setEditandoNome(false);
                      },
                      onBlur: () => setEditandoNome(false),
                      autoFocus: true,
                      style: { fontSize: 14, fontWeight: 700, padding: '4px 8px', border: '2px solid ' + T.primary, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', flex: 1, minWidth: 0 },
                    }),
                    React.createElement('button', {
                      onMouseDown: (e) => { e.preventDefault(); salvarNomeContato(); },
                      style: { ...acaoBtn, padding: '4px 8px', fontSize: 11, minHeight: 32 },
                    }, 'Salvar'),
                  )
                : React.createElement('span', {
                    className: 'cg-hdr-name',
                    onClick: () => { setNomeEdit(conversa.contato_nome || conversa.contato_telefone || ''); setEditandoNome(true); },
                    title: 'Clique para editar o nome do contato',
                    style: { fontSize: 15, fontWeight: 700, color: T.text, cursor: 'pointer', flex: 1, minWidth: 0 },
                  }, nome,
                    React.createElement('span', { style: { fontSize: 10, color: T.textMuted, marginLeft: 4, fontWeight: 400 } }, '✎ editar'),
                  ),
              React.createElement('button', {
                onClick: () => setShowAcoes(true), 'aria-label': 'Ações da conversa', title: 'Ações',
                style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.textSecondary },
              }, React.createElement(MoreVertical, { size: 20 })),
            ),
            // Linha 2: telefone · #protocolo + tag (chip truncado)
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
              React.createElement('span', {
                className: 'cg-hdr-truncate',
                style: { fontSize: 12, color: T.textMuted, flex: 1, minWidth: 0 },
              },
                React.createElement('span', { className: 'cg-hdr-phone' }, conversa.contato_telefone || ''),
                (conversa.protocolo_numero || conversa.protocolo) && React.createElement(React.Fragment, null,
                  React.createElement('span', { className: 'cg-hdr-phone' }, ' \u00b7 '),
                  React.createElement('span', {
                    title: 'Protocolo do atendimento',
                    style: { display: 'inline', padding: '1px 6px', borderRadius: 999, background: T.primarySoft, color: T.primary, fontWeight: 700, fontSize: 10, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
                  }, '#', conversa.protocolo_numero || conversa.protocolo),
                ),
              ),
              conversa.departamento_nome && React.createElement('span', {
                className: 'cg-hdr-truncate',
                style: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: `${conversa.departamento_cor || T.primary}22`, color: conversa.departamento_cor || T.primary, maxWidth: '40%', flexShrink: 0 },
              }, conversa.departamento_nome),
            ),
          )
        : React.createElement(React.Fragment, null,
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
                : React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    nome,
                    React.createElement('span', { style: { fontSize: 10, color: T.textMuted, marginLeft: 6, fontWeight: 400 } }, '\u270E editar'),
                  ),
              React.createElement('div', { style: { fontSize: 12, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' } },
                React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, conversa.contato_telefone || ''),
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
          ),
      // Desktop: barra completa de ações inline
      !ehCompacto && React.createElement(React.Fragment, null,
      // Assumir conversa (sem dono)
      semDono && React.createElement('button', {
        onClick: assumir, title: 'Assumir — você passa a ser o atendente responsável',
        style: { ...acaoBtn, color: T.primary, borderColor: T.primary, fontWeight: 700 },
      }, React.createElement(UserCheck, { size: 16 }), 'Assumir'),
      // Transferir para colega (dono ou gestor)
      conversa.operador_id && podeGerir && React.createElement('button', {
        onClick: () => setShowTransferir(true),
        title: 'Transferir atendente — muda quem é o responsável por este atendimento',
        style: { ...acaoBtn },
      }, React.createElement(ArrowRightLeft, { size: 16 }), 'Transferir atendente'),
      // Templates
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          onClick: () => { setShowTemplates(!showTemplates); setShowEncaminhar(false); setShowEtiquetas(false); },
          title: 'Inserir uma resposta pronta no campo de mensagem',
          style: acaoBtn,
        },
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
      // Encaminhar para setor — árvore secretaria › departamento, recolhível e com busca
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          onClick: abrirEncaminhar,
          title: 'Encaminhar para setor — envia o atendimento a uma secretaria ou departamento',
          style: { ...acaoBtn },
        },
          React.createElement(Building2, { size: 16 }), 'Encaminhar para setor'),
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
          // Lista agrupada com rolagem própria (não toma a tela toda). O
          // overscroll contido impede que, ao chegar no fim da lista, a roda do
          // mouse passe a rolar o painel atrás — o que fecharia o menu.
          React.createElement('div', { style: { maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 4 } },
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
      React.createElement('button', {
        onClick: resolver, 'aria-label': 'Resolver atendimento',
        title: 'Resolver — finaliza o atendimento',
        style: { ...acaoBtn, color: T.success, borderColor: '#CDEBD6' },
      },
        React.createElement(CheckCircle2, { size: 16 }), 'Resolver'),
      // Buscar dentro da conversa
      React.createElement('button', {
        onClick: () => { setShowBusca((v) => !v); if (showBusca) setTermoBusca(''); },
        'aria-label': 'Buscar nesta conversa', 'aria-pressed': showBusca,
        title: 'Buscar nesta conversa',
        style: { ...acaoBtn, padding: '7px 9px', color: showBusca ? T.primary : T.textSecondary, borderColor: showBusca ? T.primary : undefined },
      }, React.createElement(Search, { size: 16 })),
      // Gerar protocolo a partir da conversa
      onGerarProtocolo && React.createElement('button', {
        onClick: onGerarProtocolo,
        'aria-label': 'Gerar protocolo', title: 'Gerar protocolo a partir desta conversa',
        style: { ...acaoBtn, padding: '7px 9px', color: conversa?.protocolo_numero ? T.success : T.textSecondary, borderColor: conversa?.protocolo_numero ? T.success : undefined },
      }, React.createElement(FileText, { size: 16 })),
      // Ficha do cidadão: alterna o painel lateral direito.
      React.createElement('button', {
        onClick: () => setShowCidadao((v) => {
          try { localStorage.setItem('chatgov_painel_cidadao', v ? '0' : '1'); } catch {}
          return !v;
        }),
        'aria-label': 'Dados do cidadão', 'aria-pressed': showCidadao,
        title: 'Dados do cidadão — cadastro, protocolos e atendimentos anteriores',
        style: { ...acaoBtn, padding: '7px 9px', color: showCidadao ? T.primary : T.textSecondary, borderColor: showCidadao ? T.primary : undefined },
      }, React.createElement(User, { size: 16 })),
      // Ações secundárias e destrutivas agrupadas no "⋯": o header fica com o
      // fluxo principal (encaminhar → transferir → resolver) e o resto sai da frente.
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          onClick: () => { setShowMenuMais(!showMenuMais); setShowEncaminhar(false); setShowTemplates(false); setShowEtiquetas(false); },
          'aria-label': 'Mais ações', 'aria-haspopup': 'menu', 'aria-expanded': showMenuMais,
          title: 'Mais ações',
          style: { ...acaoBtn, padding: '7px 9px' },
        }, React.createElement(MoreVertical, { size: 16 })),
        showMenuMais && React.createElement('div', { style: dropdown, role: 'menu' },
          conversa.operador_id && podeGerir && React.createElement('button', {
            role: 'menuitem', title: 'Remove o atendente atual e devolve o atendimento para a fila do setor',
            onClick: () => { setShowMenuMais(false); devolver(); }, style: { ...dropdownItem, color: T.textSecondary },
          }, React.createElement(Undo2, { size: 15 }), 'Devolver para a fila'),
          React.createElement('button', {
            role: 'menuitem', title: 'Adiciona outro atendente à conversa sem trocar o responsável',
            onClick: () => { setShowMenuMais(false); setShowParticipantes(true); }, style: { ...dropdownItem, color: T.textSecondary },
          }, React.createElement(UserPlus, { size: 15 }), 'Anexar atendente'),
          React.createElement('button', {
            role: 'menuitem', title: 'Categorizar o atendimento com etiquetas',
            onClick: () => { setShowMenuMais(false); setShowEtiquetas(true); }, style: { ...dropdownItem, color: T.textSecondary },
          }, React.createElement(Tag, { size: 15 }), 'Etiquetas',
            etiquetasConv.length > 0 && React.createElement('span', {
              style: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.primary },
            }, String(etiquetasConv.length))),
          React.createElement('button', {
            role: 'menuitem', title: 'Marca um retorno na sua agenda, já vinculado a esta conversa',
            onClick: () => { setShowMenuMais(false); setShowNovoCompromisso(true); }, style: { ...dropdownItem, color: T.textSecondary },
          }, React.createElement(CalendarPlus, { size: 15 }), 'Criar lembrete'),
          React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); abrirGaleria(); }, style: { ...dropdownItem, color: T.textSecondary } },
            React.createElement(Images, { size: 15 }), 'Ver mídias'),
          React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); marcarNaoLida(); }, style: { ...dropdownItem, color: T.textSecondary } },
            React.createElement(Mail, { size: 15 }), 'Marcar como não lida'),
          ehArquivada
            ? React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); desarquivar(); }, style: { ...dropdownItem, color: T.primary } },
                React.createElement(Archive, { size: 15 }), 'Desarquivar')
            : React.createElement('button', { role: 'menuitem', onClick: () => { setShowMenuMais(false); arquivar(); }, style: { ...dropdownItem, color: T.textSecondary } },
                React.createElement(Archive, { size: 15 }), 'Arquivar'),
          // Só admin: o backend recusa a exclusão de qualquer outro papel.
          ehAdmin && React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 4 } },
            React.createElement('button', {
              role: 'menuitem', title: 'Exclui permanentemente todo o histórico da conversa',
              onClick: () => { setShowMenuMais(false); excluirConversa(); }, style: { ...dropdownItem, color: T.danger },
            }, React.createElement(Trash2, { size: 15 }), 'Excluir conversa'),
          ),
        ),
        // Etiquetas passaram a abrir a partir do "⋯", ancoradas neste mesmo container.
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
      ), // fecha o Fragment da barra de ações desktop (!ehCompacto)
    ),

    // ── Protocolos vinculados à conversa ─────────────────────────────
    React.createElement('div', { style: { flexShrink: 0, borderBottom: '1px solid ' + T.border, background: T.surface } },
      React.createElement('button', {
        onClick: function () { setShowProtocolos(function (v) { return !v; }); },
        'aria-expanded': showProtocolos,
        style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: T.textSecondary },
      },
        React.createElement(FileText, { size: 14, color: protocolos.length > 0 ? T.primary : T.textMuted }),
        React.createElement('span', { style: { flex: 1, textAlign: 'left' } },
          'Protocolos',
          protocolos.length > 0 && React.createElement('span', { style: { marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: T.primarySoft, color: T.primary } }, String(protocolos.length))
        ),
        showProtocolos ? React.createElement(ChevronDown, { size: 14, color: T.textMuted }) : React.createElement(ChevronRight, { size: 14, color: T.textMuted }),
      ),
      showProtocolos && React.createElement('div', { style: { padding: '0 16px 10px', background: T.surfaceAlt } },
        carregandoProtocolos && React.createElement('div', { style: { padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMuted } },
          React.createElement(Loader2, { size: 14, className: 'spin' }), 'Carregando...'),
        !carregandoProtocolos && protocolos.length > 0 && React.createElement('div', { style: { paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 } },
          protocolos.map(function (p, i) {
            var numero = p.numero || p.protocolo_numero || p.protocolo || (p.id ? '#' + String(p.id).padStart(6, '0') : 'N/A');
            var statusLabel = p.status || p.estado || '';
            var statusColor = (statusLabel === 'ABERTO' || statusLabel === 'aberto') ? T.warning
              : (statusLabel === 'CONCLUIDO' || statusLabel === 'concluido' || statusLabel === 'fechado') ? T.success
              : (statusLabel === 'CANCELADO' || statusLabel === 'cancelado') ? T.danger
              : T.textMuted;
            var assunto = p.assunto || p.descricao || p.titulo || '';
            return React.createElement('button', {
              key: p.id || i,
              onClick: function () { onAbrirProtocolo && onAbrirProtocolo(p); },
              title: 'Abrir protocolo ' + numero,
              style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', border: 'none', borderRadius: T.radiusSm, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12.5, color: T.text, transition: 'background 0.15s' },
              onMouseEnter: function (e) { e.currentTarget.style.background = T.surface; },
              onMouseLeave: function (e) { e.currentTarget.style.background = 'transparent'; },
            },
              React.createElement('span', { style: { fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontSize: 12, fontWeight: 700, color: T.primary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, '#' + String(numero).replace(/^#/, '')),
              statusLabel && React.createElement('span', { style: { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: statusColor + '20', color: statusColor, flexShrink: 0 } }, statusLabel),
              React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.textSecondary, fontSize: 11.5 } }, assunto),
              React.createElement(Pen, { size: 12, color: T.textMuted, style: { flexShrink: 0 } }),
            );
          }),
        ),
        !carregandoProtocolos && protocolos.length === 0 && React.createElement('div', { style: { padding: '8px 0 4px', fontSize: 12, color: T.textMuted } }, 'Nenhum protocolo vinculado.'),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          React.createElement('button', {
            onClick: function () { setShowVincularProtocolo(function (v) { return !v; }); },
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid ' + T.borderStrong, borderRadius: T.radiusSm, background: T.surface, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: T.textSecondary },
          }, React.createElement(Search, { size: 13 }), showVincularProtocolo ? 'Fechar busca' : 'Vincular protocolo existente'),
          onGerarProtocolo && React.createElement('button', {
            onClick: onGerarProtocolo,
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid ' + T.primary, borderRadius: T.radiusSm, background: T.primarySoft, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: T.primary },
          }, React.createElement(FileText, { size: 13 }), 'Criar protocolo'),
        ),
        showVincularProtocolo && React.createElement('div', { style: { marginTop: 8 } },
          React.createElement('div', { style: { position: 'relative', marginBottom: 6 } },
            React.createElement(Search, { size: 13, color: T.textMuted, style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' } }),
            React.createElement('input', {
              value: protocoloBusca,
              onChange: function (e) { aoDigitarProtocolo(e.target.value); },
              placeholder: 'Buscar por n\u00famero ou assunto...',
              autoFocus: true,
              style: { width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '7px 10px 7px 30px', border: '1px solid ' + T.border, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none' },
              onKeyDown: function (e) { if (e.key === 'Escape') { setShowVincularProtocolo(false); setProtocoloBusca(''); setProtocolosBusca([]); } },
            }),
          ),
          buscandoProtocolos && React.createElement('div', { style: { padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMuted } },
            React.createElement(Loader2, { size: 14, className: 'spin' }), 'Buscando...'),
          !buscandoProtocolos && protocoloBusca.trim().length >= 2 && protocolosBusca.length === 0 && React.createElement('div', { style: { padding: '6px 0', fontSize: 12, color: T.textMuted } }, 'Nenhum protocolo encontrado.'),
          protocolosBusca.map(function (p, i) {
            var jahVinculado = protocolos.some(function (vp) { return vp.id === p.id; });
            var numero = p.numero || p.protocolo_numero || p.protocolo || (p.id ? '#' + String(p.id).padStart(6, '0') : 'N/A');
            var statusLabel = p.status || p.estado || '';
            var statusColor = (statusLabel === 'ABERTO' || statusLabel === 'aberto') ? T.warning
              : (statusLabel === 'CONCLUIDO' || statusLabel === 'concluido' || statusLabel === 'fechado') ? T.success
              : (statusLabel === 'CANCELADO' || statusLabel === 'cancelado') ? T.danger
              : T.textMuted;
            var assunto = p.assunto || p.descricao || p.titulo || '';
            return React.createElement('button', {
              key: p.id || i,
              onClick: function () { if (!jahVinculado && !vincularCarregando) vincularProtocolo(p.id); },
              disabled: jahVinculado || vincularCarregando === p.id,
              title: jahVinculado ? 'Já vinculado' : 'Vincular protocolo ' + numero,
              style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 10px', border: 'none', borderRadius: T.radiusSm, background: 'transparent', cursor: jahVinculado ? 'default' : 'pointer', textAlign: 'left', fontSize: 12.5, color: jahVinculado ? T.textMuted : T.text, opacity: jahVinculado ? 0.6 : 1, transition: 'background 0.15s' },
              onMouseEnter: function (e) { if (!jahVinculado) e.currentTarget.style.background = T.surface; },
              onMouseLeave: function (e) { e.currentTarget.style.background = 'transparent'; },
            },
              vincularCarregando === p.id ? React.createElement(Loader2, { size: 14, color: T.primary, className: 'spin' })
                : jahVinculado ? React.createElement(CheckCircle2, { size: 14, color: T.success })
                : React.createElement(FileText, { size: 14, color: T.primary }),
              React.createElement('span', { style: { fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontSize: 12, fontWeight: 700, color: jahVinculado ? T.textMuted : T.primary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, '#' + String(numero).replace(/^#/, '')),
              statusLabel && React.createElement('span', { style: { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: statusColor + '20', color: statusColor, flexShrink: 0 } }, statusLabel),
              React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.textSecondary, fontSize: 11.5 } }, assunto),
              jahVinculado && React.createElement('span', { style: { fontSize: 10, color: T.textMuted, flexShrink: 0 } }, 'vinculado'),
            );
          }),
        ),
      ),
    ),

    // ── Notificação de protocolo criado ──────────────────────────────
    protocoloCriado && React.createElement('div', {
      style: { padding: '10px 16px', background: T.successSoft, borderBottom: '1px solid ' + T.border, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
    },
      React.createElement(CheckCircle2, { size: 16, color: T.success }),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 12.5, fontWeight: 700, color: T.text } }, 'Protocolo criado com sucesso'),
        React.createElement('div', { style: { fontSize: 11.5, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 } },
          React.createElement('span', { style: { whiteSpace: 'nowrap' } },
            React.createElement('strong', { style: { fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontVariantNumeric: 'tabular-nums', color: T.text } }, '#' + String(protocoloCriado.numero || protocoloCriado.protocolo_numero || protocoloCriado.protocolo || protocoloCriado.id || 'N/A').replace(/^#/, '')),
          ),
          (protocoloCriado.codigo_acesso || protocoloCriado.access_code) && React.createElement('span', { style: { whiteSpace: 'nowrap' } },
            'Código: ',
            React.createElement('strong', { style: { fontFamily: 'ui-monospace,SFMono-Regular,monospace', color: T.text } }, protocoloCriado.codigo_acesso || protocoloCriado.access_code),
          ),
        ),
      ),
      (protocoloCriado.codigo_acesso || protocoloCriado.access_code) && React.createElement('button', {
        onClick: function () {
          var codigo = protocoloCriado.codigo_acesso || protocoloCriado.access_code;
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(codigo).then(function () {
              setProtocoloCopiado(true);
              setTimeout(function () { setProtocoloCopiado(false); }, 2000);
            }).catch(function () {});
          }
        },
        title: 'Copiar código de acesso',
        style: { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid ' + T.borderStrong, borderRadius: T.radiusSm, background: T.surface, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: T.textSecondary, flexShrink: 0 },
      },
        protocoloCopiado ? React.createElement(Check, { size: 14, color: T.success })
          : React.createElement(Copy, { size: 14, color: T.textMuted }),
        protocoloCopiado ? 'Copiado' : 'Copiar',
      ),
      onAbrirProtocolo && React.createElement('button', {
        onClick: function () { setProtocoloCriado(null); onAbrirProtocolo(protocoloCriado); },
        title: 'Abrir protocolo',
        style: { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid ' + T.primary, borderRadius: T.radiusSm, background: T.primarySoft, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: T.primary, flexShrink: 0 },
      }, 'Abrir'),
      React.createElement('button', {
        onClick: function () { setProtocoloCriado(null); },
        'aria-label': 'Fechar notificação',
        style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex', flexShrink: 0 },
      }, React.createElement(X, { size: 14 })),
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

    // Faixa de status. Enquanto o atendimento está em triagem ela vira uma chamada
    // para ação: diz exatamente o que falta — setor ou atendente — e traz o botão
    // que resolve, em vez de só descrever o problema.
    React.createElement('div', {
      style: { padding: '7px 16px', background: emTriagem ? T.warningSoft : T.surfaceAlt, fontSize: 11, textAlign: 'center', flexShrink: 0, borderBottom: `1px solid ${T.border}` },
    },
      emTriagem
        ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' } },
            React.createElement(Clock, { size: 14, color: T.warning, style: { flexShrink: 0 } }),
            React.createElement('div', { style: { textAlign: 'left' } },
              React.createElement('div', { style: { color: T.warning, fontWeight: 700, fontSize: 12 } },
                semSetor ? 'Atendimento sem setor responsável' : 'Atendimento aguardando atendente'),
              React.createElement('div', { style: { color: T.textSecondary, fontSize: 11 } },
                semSetor
                  ? 'Encaminhe esta conversa para que um servidor do setor possa responder.'
                  : `Na fila de ${conversa.departamento_nome || 'um setor'} — assuma para se tornar o responsável.`),
            ),
            semSetor || !semDono
              ? React.createElement('button', {
                  onClick: abrirEncaminhar,
                  style: {
                    background: T.warning, border: 'none', color: '#fff', padding: '6px 14px',
                    borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  },
                }, React.createElement(Building2, { size: 14 }), 'Escolher setor')
              : React.createElement('button', {
                  onClick: assumir,
                  style: {
                    background: T.warning, border: 'none', color: '#fff', padding: '6px 14px',
                    borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  },
                }, React.createElement(UserCheck, { size: 14 }), 'Assumir'),
          )
        : ehArquivada
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

    // Barra de busca dentro da conversa
    showBusca && React.createElement('div', {
      style: { padding: '8px 16px', background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    },
      React.createElement(Search, { size: 15, color: T.textMuted, style: { flexShrink: 0 } }),
      React.createElement('input', {
        autoFocus: true,
        value: termoBusca,
        onChange: (e) => setTermoBusca(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Escape') { setShowBusca(false); setTermoBusca(''); } },
        placeholder: 'Buscar nesta conversa...',
        'aria-label': 'Buscar nas mensagens desta conversa',
        style: {
          flex: 1, padding: '7px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
          background: T.surface, color: T.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
        },
      }),
      React.createElement('span', { style: { fontSize: 12, color: T.textMuted, whiteSpace: 'nowrap' } },
        termoBusca.trim()
          ? `${mensagensVisiveis.length} de ${mensagens.length}`
          : `${mensagens.length} carregadas`),
      React.createElement('button', {
        onClick: () => { setShowBusca(false); setTermoBusca(''); },
        'aria-label': 'Fechar busca',
        style: { background: 'transparent', border: 'none', cursor: 'pointer', color: T.textMuted, display: 'flex', padding: 4 },
      }, React.createElement(X, { size: 15 })),
    ),
    // Só as mensagens já carregadas entram na busca — o aviso evita a impressão
    // de que a conversa inteira foi varrida quando ainda há histórico no servidor.
    showBusca && termoBusca.trim() && temMais && React.createElement('div', {
      style: { padding: '5px 16px', fontSize: 11, color: T.textMuted, background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, flexShrink: 0 },
    }, 'Busca nas mensagens já carregadas. Use "Carregar mensagens anteriores" para ampliar.'),

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
          backgroundColor: T.bg,
          backgroundImage: `radial-gradient(${T.borderStrong} 0.5px, transparent 0.5px)`,
          backgroundSize: '20px 20px',
        },
      },
        // Ocupa toda a largura útil para alinhar as mensagens recebidas e enviadas
        // às laterais da conversa, respeitando apenas o padding da área rolável.
        React.createElement('div', { style: { width: '100%' } },
        carregandoMais && React.createElement('div', { style: { textAlign: 'center', padding: 8, color: T.textMuted } },
          React.createElement(Loader2, { size: 18, className: 'spin' })),
        temMais && !carregandoMais && React.createElement('div', { style: { textAlign: 'center', marginBottom: 8 } },
          React.createElement('button', { onClick: carregarMais, style: { ...acaoBtn, margin: '0 auto' } }, 'Carregar mensagens anteriores')),
        showBusca && termoBusca.trim() && mensagensVisiveis.length === 0 && React.createElement('div', {
          style: { textAlign: 'center', padding: 20, fontSize: 13, color: T.textMuted },
        }, `Nenhuma mensagem carregada contém "${termoBusca.trim()}".`),
        mensagensVisiveis.reduce((acc, msg, i) => {
          const anterior = mensagensVisiveis[i - 1];
          if (!anterior || !mesmaData(anterior.criado_em, msg.criado_em)) {
            acc.push(React.createElement(SeparadorData, { key: `sep-${msg.id}`, label: formatarDataSeparador(msg.criado_em) }));
          }
          acc.push(React.createElement(BolhaConversa, {
            key: msg.id,
            msg,
            podeExcluir: !msg.excluida && (msg.direcao === 'saida' ? (msg.operador_id === opId || ehGestor) : ehGestor),
            onExcluir: () => excluirMsg(msg),
            onResponder: () => setRespondendoA(msg),
            onReagir: (emoji) => reagirMsg(msg, emoji),
            onRetry: () => tentarNovamente(msg),
            respondida: msg.respondendo_a ? mensagens.find((m) => m.id === msg.respondendo_a) : null,
            realce: showBusca ? termoBusca.trim() : '',
            nomeContato: nome,
            compacto: ehMobile,
            onSalvarContato: salvarContatoRecebido,
            onIniciarConversa: iniciarConversaComContato,
            destacado: highlightedMsgId === msg.id,
          }));
          return acc;
        }, []),
        clienteDigitando && React.createElement('div', {
          style: { fontSize: 12, color: T.textMuted, fontStyle: 'italic', padding: '4px 2px' },
        }, `${nome} está digitando…`),
        ), // fecha a coluna de leitura
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

      // Painel lateral do cidadão (não aparece no celular, onde não há espaço).
      showCidadao && !ehCompacto && React.createElement(PainelCidadao, {
        conversa,
        etiquetas: etiquetasConv,
        onFechar: () => {
          setShowCidadao(false);
          try { localStorage.setItem('chatgov_painel_cidadao', '0'); } catch {}
        },
        onContatoAtualizado: () => onConversaUpdated?.(),
        onAbrirConversa: (convId) => onAbrirConversa?.(convId),
      }),
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
      className: 'composer',
      style: { position: 'relative', background: T.surface, flexShrink: 0, borderTop: `1px solid ${T.border}` },
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
        type: 'button', onClick: () => setShowEmojis(!showEmojis), 'aria-label': 'Inserir emoji', className: 'icon-btn icon-emoji',
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
        type: 'button', onClick: () => fileRef.current?.click(), 'aria-label': 'Anexar arquivo', disabled: anexando, className: 'icon-btn',
        style: iconBtn,
      }, anexando
        ? React.createElement(Loader2, { size: 22, color: T.textMuted, className: 'spin' })
        : React.createElement(Paperclip, { size: 22, color: T.textMuted })),
      React.createElement('div', { className: 'composer-textarea', style: { flex: 1, position: 'relative', minWidth: 0 } },
        React.createElement('textarea', {
          ref: inputRef, value: texto, onChange: (e) => setTexto(e.target.value),
          placeholder: gravando ? 'Gravando áudio...' : previewArquivo ? 'Digite uma legenda e pressione Enter para enviar...' : audioBlob ? 'Adicione uma legenda (opcional)...' : 'Digite sua mensagem…',
          rows: 1,
          'aria-label': 'Mensagem',
          maxLength: 4000,
          disabled: gravando,
          onPaste: handlePaste,
          onKeyDown: (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e); }
            else if (e.key === 'Escape' && respondendoA) { setRespondendoA(null); }
          },
          style: { width: '100%', boxSizing: 'border-box', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 22, paddingRight: 40, color: T.text, outline: 'none', fontFamily: 'inherit', opacity: gravando ? 0.5 : 1 },
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
          width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: 'none',
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
        style: { width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: enviando || (!texto.trim() && !audioBlob) ? 'default' : 'pointer', background: (texto.trim() || audioBlob) && !enviando && !gravando ? T.primary : T.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' },
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
      onGerarProtocolo && acaoSheetItem(FileText, 'Gerar protocolo', () => { setShowAcoes(false); onGerarProtocolo(); }),
      acaoSheetItem(CalendarPlus, 'Criar lembrete', () => { setShowAcoes(false); setShowNovoCompromisso(true); }),
      acaoSheetItem(Images, 'Ver mídias', () => { setShowAcoes(false); abrirGaleria(); }),
      acaoSheetItem(Mail, 'Marcar como não lida', () => { setShowAcoes(false); marcarNaoLida(); }),
      ehArquivada
        ? acaoSheetItem(Archive, 'Desarquivar', () => { setShowAcoes(false); desarquivar(); }, T.primary)
        : acaoSheetItem(Archive, 'Arquivar', () => { setShowAcoes(false); arquivar(); }),
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

    // Lembrete criado de dentro do atendimento já nasce vinculado à conversa —
    // é o que permite o popup oferecer "Abrir conversa" na hora do retorno.
    showNovoCompromisso && React.createElement(ModalCompromisso, {
      preenchimento: {
        tipo: 'lembrete',
        titulo: `Retornar para ${nome}`,
        conversa_id: conversa.id,
        contato_id: conversa.contato_id || null,
        contato_nome: nome,
      },
      onClose: () => setShowNovoCompromisso(false),
      onSalvo: notificarAgendaAtualizada,
    }),
    showParticipantes && React.createElement(ModalParticipantes, { conversa, onClose: () => setShowParticipantes(false) }),
    showTransferir && React.createElement(ModalTransferir, { conversa, onClose: () => setShowTransferir(false), onTransferido: () => onConversaUpdated?.() }),

    showGaleria && React.createElement(GaleriaMidias, {
      conversa,
      midias,
      carregando: carregandoMidias,
      onFechar: () => setShowGaleria(false),
      onIrParaMensagem: (midia) => {
        setShowGaleria(false);
        setTimeout(() => {
          rolarParaMensagemRef.current?.(midia.id);
        }, 200);
      },
    }),
    avatarAmpliado && React.createElement(MediaLightbox, {
      src: conversa.contato_avatar_url, tipo: 'imagem', mime: 'image/jpeg', nome: `Foto de ${nome}`,
      onClose: () => setAvatarAmpliado(false),
    }),
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

const acaoBtn = { display: 'flex', alignItems: 'center', gap: 5, background: T.surface, border: `1px solid ${T.borderStrong}`, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, padding: '9px 14px', borderRadius: T.radiusSm, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 44 };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' };

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
const dropdown = { position: 'absolute', top: '100%', right: 0, background: T.surface, borderRadius: T.radius, boxShadow: '0 8px 24px rgba(0,0,0,.18)', border: `1px solid ${T.border}`, zIndex: 9999, minWidth: 230, overflow: 'hidden', marginTop: 6 };
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
