import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Smile, Reply, MoreHorizontal, Pin, Trash2, Edit3, Forward, Paperclip, X, CheckCheck, ArrowDown, Undo2, Image as ImageIcon, Mic, Square, Play, Pause, RotateCcw, Search, UserPlus, UserMinus, LogOut, BarChart2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fetchMensagensInternas, fetchCanaisInternos, fetchOperadores, buscarMensagensCanal, adicionarMembrosCanal, removerMembroCanal, sairCanal, criarEnquete } from '../api';
import { fetchMensagensFixadas, uploadArquivoApi } from '../api/evolucoes';
import { T } from '../theme';
import { BolhaMensagem } from './BolhaMensagem';
import { normalizarMsg, normalizarMensagens, normalizarCanal } from '../utils/normalizar';
import { encodeFileBase64, mimeParaTipo, agruparMensagens, formatarHora } from '../utils/arquivo';

const EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '🤔', '✅', '👀'];
const SCROLL_THRESHOLD = 100;
const AUDIO_MAX_MS = 2 * 60 * 1000; // 2 minutos
const AUDIO_MAX_BYTES = 16 * 1024 * 1024; // 16 MB

function formatarDuracao(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Converte um Blob em base64 (sem prefixo data:...).
function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result || ''); resolve(s.includes(',') ? s.split(',')[1] : s); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function PainelChatInternoAvancado({ canal }) {
  const { socket } = useSocket();
  const { auth } = useAuth();
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [fixadas, setFixadas] = useState([]);
  const [respondendoA, setRespondendoA] = useState(null);
  const [editando, setEditando] = useState(null);
  const [menuMsg, setMenuMsg] = useState(null);
  const [showEmoji, setShowEmoji] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [anexoPreview, setAnexoPreview] = useState(null);
  const [anexosMultiplos, setAnexosMultiplos] = useState([]); // upload múltiplo
  const [digitando, setDigitando] = useState([]);
  const [digitandoMap, setDigitandoMap] = useState({});
  const [showForwardModal, setShowForwardModal] = useState(null);
  const [canaisTodos, setCanaisTodos] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [operadoresMap, setOperadoresMap] = useState({});
  const [preservarExcluida, setPreservarExcluida] = useState(null);
  const [novasPendentes, setNovasPendentes] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMaisAntigas, setTemMaisAntigas] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(null);
  const [draggingFile, setDraggingFile] = useState(false);
  // @menções
  const [mencoesAtivas, setMencoesAtivas] = useState(false);
  const [mencaoBusca, setMencaoBusca] = useState('');
  const [mencaoIdx, setMencaoIdx] = useState(0);
  // Busca de mensagens
  const [modoBusca, setModoBusca] = useState(false);
  const [buscaQuery, setBuscaQuery] = useState('');
  const [buscaResultados, setBuscaResultados] = useState([]);
  const [buscaCarregando, setBuscaCarregando] = useState(false);
  // Gerenciamento de grupo
  const [showGrupoInfo, setShowGrupoInfo] = useState(false);
  // Enquete
  const [showEnquete, setShowEnquete] = useState(false);
  const [enquetePergunta, setEnquetePergunta] = useState('');
  const [enqueteOpcoes, setEnqueteOpcoes] = useState(['', '']);
  const membrosCanal = useMemo(() => {
    const ids = new Set((canal?.membros || []).map((m) => m.id));
    return operadores.filter((o) => ids.has(o.id) && o.id !== opId);
  }, [canal?.membros, operadores, opId]);
  // Gravação de áudio
  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuracao, setAudioDuracao] = useState(0);
  const [audioErro, setAudioErro] = useState(null);
  const [tocando, setTocando] = useState(false);
  const [tempoGravadoMs, setTempoGravadoMs] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const gravacaoInicioRef = useRef(0);
  const gravacaoTimerRef = useRef(null);
  const gravacaoLimiteRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const audioChunksRef = useRef([]);

  const areaMensagensRef = useRef(null);
  const typingTimerRef = useRef(null);
  const digitandoTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Som de notificação via Web Audio API
  const playNotificacao = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(800, ctx.currentTime);
      o.frequency.setValueAtTime(1000, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.25);
    } catch {}
  }, []);

  // Colar imagem do clipboard (Ctrl+V)
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const file = new File([blob], `colado-${Date.now()}.png`, { type: blob.type || 'image/png' });
        const previewUrl = URL.createObjectURL(file);
        setAnexoPreview({ file, tipo: 'imagem', nome: file.name, mime: file.type, previewUrl });
        break;
      }
    }
  }, []);
  const longPressTimerRef = useRef(null);
  const digitandoPorOperadorRef = useRef({});
  const ultimaScrollHeightRef = useRef(0);
  const canalRef = useRef(canal);

  const opId = auth?.operador?.id;

  useEffect(() => { canalRef.current = canal; }, [canal]);

  useEffect(() => {
    fetchOperadores().then((ops) => {
      setOperadores(ops);
      const m = {};
      for (const o of ops) m[o.id] = o.nome;
      setOperadoresMap(m);
    }).catch(() => {});
  }, []);

  const isNearBottom = useCallback(() => {
    const el = areaMensagensRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    const el = areaMensagensRef.current;
    if (!el) return;
    if (force || isNearBottom()) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [isNearBottom]);

  useEffect(() => {
    if (!canal) {
      setMensagens([]);
      setFixadas([]);
      setRespondendoA(null);
      setEditando(null);
      setAnexoPreview(null);
      setNovasPendentes(0);
      return;
    }
    setMensagens([]);
    setFixadas([]);
    setRespondendoA(null);
    setEditando(null);
    setAnexoPreview(null);
    setNovasPendentes(0);
    setTemMaisAntigas(false);
    socket?.emit('interno:abrir', canal.id);
    socket?.emit('mensagem:ler', { canalId: canal.id });
    fetchMensagensFixadas(canal.id).then(setFixadas).catch(console.error);
    fetchMensagensInternas(canal.id, { limite: 50 }).then((msgs) => {
      const norm = normalizarMensagens(msgs).map((m) => {
        let _reacoes = {};
        if (m._reacao_raw) {
          const grupo = {};
          // Converte o formato da API: { emoji, contagem, usuarios: [{operador_id, nome}] }
          // para o formato do socket: { [emoji]: { operadores: [...], contagem } }
          const raw = m._reacao_raw;
          grupo[raw.emoji] = {
            operadores: raw.usuarios || [],
            contagem: raw.contagem || 0,
          };
          _reacoes = grupo;
        }
        return { ...m, _isMe: m.remetente_id === opId, _reacoes };
      });
      setMensagens(norm);
      setTemMaisAntigas(msgs.length === 50);
      setTimeout(() => scrollToBottom(true), 50);
    }).catch(console.error);
    if (canaisTodos.length === 0) fetchCanaisInternos().then((arr) => setCanaisTodos(arr.map(normalizarCanal))).catch(() => {});
  }, [canal?.id, socket]);

  useEffect(() => {
    if (!socket) return;
    const onNova = (msg) => {
      const norm = normalizarMsg(msg);
      const isMine = norm.remetente_id === opId;
      setMensagens((prev) => {
        if (prev.some((m) => m.id === norm.id)) return prev;
        return [...prev, { ...norm, _isMe: isMine }];
      });
      if (canalRef.current?.id === norm.canal_id && !isMine) {
        socket?.emit('mensagem:ler', { canalId: norm.canal_id });
      }
      if (!isMine && canalRef.current?.id !== norm.canal_id) {
        playNotificacao();
      }
      if (!isNearBottom() && canalRef.current?.id === norm.canal_id) {
        setNovasPendentes((n) => n + 1);
      } else if (canalRef.current?.id === norm.canal_id) {
        setTimeout(() => scrollToBottom(true), 30);
      }
    };
    const onEditada = (msg) => setMensagens((prev) => prev.map((m) => m.id === msg.id ? { ...m, conteudo: msg.conteudo, editada: true, editada_em: msg.editada_em, editadaEm: msg.editada_em } : m));
    const onExcluida = ({ msgId }) => setMensagens((prev) => prev.map((m) => (m.id === msgId ? { ...m, excluida: true, conteudo: 'Mensagem excluida' } : m)));
    const onReacao = ({ msgId, emoji, operadorId, operadorNome, acao }) => {
      setMensagens((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const reacoes = { ...(m._reacoes || {}) };
        const lista = reacoes[emoji] || { operadores: [], contagem: 0 };
        let ops = lista.operadores || [];
        if (acao === 'adicionar') {
          if (!ops.some((o) => (typeof o === 'string' ? o : o.operador_id) === operadorId)) {
            ops = [...ops, { operador_id: operadorId, nome: operadorNome }];
          }
        } else {
          ops = ops.filter((o) => (typeof o === 'string' ? o : o.operador_id) !== operadorId);
        }
        if (ops.length === 0) { delete reacoes[emoji]; }
        else { reacoes[emoji] = { operadores: ops, contagem: ops.length }; }
        return { ...m, _reacoes: reacoes };
      }));
    };
    const onDigitando = ({ opId: senderId, canalId, nome }) => {
      if (canalId !== canalRef.current?.id || senderId === opId) return;
      digitandoPorOperadorRef.current[senderId] = Date.now();
      setDigitandoMap((prev) => ({ ...prev, [senderId]: nome || prev[senderId] || 'Alguem' }));
      setDigitando((prev) => prev.includes(senderId) ? prev : [...prev, senderId]);
      if (digitandoTimerRef.current) clearTimeout(digitandoTimerRef.current);
      digitandoTimerRef.current = setInterval(() => {
        const now = Date.now();
        const ativos = Object.entries(digitandoPorOperadorRef.current)
          .filter(([_, t]) => now - t < 4000)
          .map(([id]) => id);
        digitandoPorOperadorRef.current = Object.fromEntries(ativos.map((id) => [id, digitandoPorOperadorRef.current[id]]));
        setDigitando(ativos);
        if (ativos.length === 0) clearInterval(digitandoTimerRef.current);
      }, 2000);
    };

    socket.on('interno:nova', onNova);
    socket.on('mensagem:editada', onEditada);
    socket.on('mensagem:excluida', onExcluida);
    socket.on('mensagem:exclusaoDesfeita', ({ msgId }) => {
      setMensagens((prev) => prev.map((m) => (m.id === msgId ? { ...m, excluida: false } : m)));
    });
    socket.on('mensagem:reacao', onReacao);
    socket.on('interno:digitando', onDigitando);
    socket.on('interno:digitando:parou', ({ opId: senderId }) => {
      delete digitandoPorOperadorRef.current[senderId];
      setDigitando((prev) => prev.filter((id) => id !== senderId));
      setDigitandoMap((prev) => { const n = { ...prev }; delete n[senderId]; return n; });
    });
    socket.on('canais:fixada', () => fetchMensagensFixadas(canalRef.current?.id).then(setFixadas).catch(console.error));
    socket.on('canais:desafixada', () => fetchMensagensFixadas(canalRef.current?.id).then(setFixadas).catch(console.error));
    socket.on('enquete:atualizada', ({ msgId, dados }) => {
      setMensagens((prev) => prev.map((m) => m.id === msgId ? { ...m, conteudo: typeof dados === 'string' ? dados : JSON.stringify(dados) } : m));
    });

    return () => {
      socket.off('enquete:atualizada');
      socket.off('interno:nova', onNova);
      socket.off('mensagem:editada', onEditada);
      socket.off('mensagem:excluida', onExcluida);
      socket.off('mensagem:exclusaoDesfeita');
      socket.off('mensagem:reacao', onReacao);
      socket.off('interno:digitando', onDigitando);
      socket.off('interno:digitando:parou');
      socket.off('canais:fixada');
      socket.off('canais:desafixada');
    };
  }, [socket, opId, isNearBottom, scrollToBottom]);

  useEffect(() => {
    setRespondendoA((r) => r && mensagens.find((m) => m.id === r.id && !m.excluida) ? r : null);
    setEditando((e) => e && mensagens.find((m) => m.id === e.id && !m.excluida) ? e : null);
  }, [mensagens]);

  const handleTyping = useCallback(() => {
    if (!canalRef.current) return;
    socket?.emit('interno:digitando', { canalId: canalRef.current.id });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket?.emit('interno:digitando:parou', { canalId: canalRef.current?.id });
    }, 3000);
  }, [socket]);

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setErroEnvio(null);
    const novos = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { setErroEnvio('Arquivo maior que 50MB'); continue; }
      const tipo = mimeParaTipo(file.type);
      const previewUrl = tipo === 'imagem' ? URL.createObjectURL(file) : null;
      novos.push({ file, tipo, nome: file.name, mime: file.type, previewUrl });
    }
    if (novos.length === 1 && anexosMultiplos.length === 0 && !anexoPreview) {
      setAnexoPreview(novos[0]);
    } else {
      setAnexosMultiplos((prev) => [...prev, ...novos].slice(0, 10));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e) => { e.preventDefault(); setDraggingFile(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDraggingFile(false); };
  const handleDrop = async (e) => {
    e.preventDefault();
    setDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setErroEnvio('Arquivo maior que 50MB'); return; }
    const tipo = mimeParaTipo(file.type);
    const previewUrl = tipo === 'imagem' ? URL.createObjectURL(file) : null;
    setAnexoPreview({ file, tipo, nome: file.name, mime: file.type, previewUrl });
  };

  const cancelarAnexo = () => setAnexoPreview(null);

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

      // Limite de 2 min — encerra automaticamente.
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

  // Cleanup ao trocar de canal/desmontar.
  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    pararStream();
    if (gravacaoTimerRef.current) clearInterval(gravacaoTimerRef.current);
    if (gravacaoLimiteRef.current) clearTimeout(gravacaoLimiteRef.current);
  }, [pararStream]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const enviar = async (e) => {
    e?.preventDefault();
    const txt = texto.trim();
    const temAnexos = anexosMultiplos.length > 0 || anexoPreview;
    if ((!txt && !temAnexos && !audioBlob) || !canal) return;
    if (editando) {
      socket?.emit('mensagem:editar', { canalId: canal.id, msgId: editando.id, conteudo: txt }, (res) => {
        if (res?.ok) { setEditando(null); setTexto(''); }
        else setErroEnvio(res?.erro || 'Erro ao editar');
      });
      return;
    }

    // Coleta todos os anexos
    const todosAnexos = anexoPreview ? [anexoPreview, ...anexosMultiplos] : anexosMultiplos;
    let primeiroEnviado = false;

    const enviarUm = async (conteudoLocal, midia) => {
      let mediaUrlLocal = null;
      let tipoEnvio = 'texto';
      let mediaMimeLocal = null;

      if (midia) {
        try {
          setUploading(true);
          setUploadProgress(10);
          const result = await uploadArquivoApi(midia.file, null, null, canal.id, null);
          setUploadProgress(90);
          mediaUrlLocal = result.url || result.media_url || `/api/evolucoes/arquivos/${result.id}/download`;
          tipoEnvio = midia.tipo;
          mediaMimeLocal = midia.mime;
          setUploadProgress(100);
        } catch (err) {
          setErroEnvio('Falha no upload de arquivo');
          return;
        }
        setUploading(false);
        setUploadProgress(0);
      }

      if (conteudoLocal || mediaUrlLocal) {
        const otimista = {
          id: 'opt-' + Date.now() + Math.random(), canal_id: canal.id, conteudo: conteudoLocal,
          tipo: tipoEnvio, media_url: mediaUrlLocal, media_mime: mediaMimeLocal,
          remetente_id: opId, remetente_nome: auth?.operador?.nome,
          criado_em: new Date().toISOString(), _isMe: true, _otimista: true,
        };
        setMensagens((prev) => [...prev, otimista]);
        setTimeout(() => scrollToBottom(true), 30);

        socket?.emit('interno:enviar', {
          canalId: canal.id, conteudo: conteudoLocal || null,
          tipo: tipoEnvio, mediaUrl: mediaUrlLocal || null, mediaMime: mediaMimeLocal,
          mediaBase64: null, mediaNome: midia?.nome || null,
          respondendoA: !primeiroEnviado ? (respondendoA?.id || null) : null,
        }, (res) => {
          if (!res?.ok) setErroEnvio(res?.erro || 'Falha ao enviar');
          else setMensagens((prev) => prev.filter((m) => m.id !== otimista.id));
        });
        primeiroEnviado = true;
      }
    };

    // Envia texto primeiro (se existir)
    if (txt) await enviarUm(txt, null);

    // Envia cada anexo
    for (const midia of todosAnexos) await enviarUm(null, midia);

    setTexto('');
    setRespondendoA(null);
    setAnexoPreview(null);
    setAnexosMultiplos([]);
  };

  const handleTeclaInput = (e) => {
    if (mencoesAtivas) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMencaoIdx((i) => Math.min(i + 1, sugestoes.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMencaoIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (sugestoes[mencaoIdx]) {
          inserirMencao(sugestoes[mencaoIdx]);
          setMencoesAtivas(false);
        }
        return;
      }
      if (e.key === 'Escape') { setMencoesAtivas(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    else if (e.key === 'Escape') { setRespondendoA(null); setEditando(null); setTexto(''); setMencoesAtivas(false); }
    else handleTyping();
  };

  const handleTextoChange = (e) => {
    const val = e.target.value;
    setTexto(val);

    // Detecta @ para menções
    const cursorPos = e.target.selectionStart;
    const textoAteCursor = val.slice(0, cursorPos);
    const match = textoAteCursor.match(/@(\S*)$/);
    if (match) {
      const busca = match[1].toLowerCase();
      setMencoesAtivas(true);
      setMencaoBusca(busca);
      setMencaoIdx(0);
    } else {
      setMencoesAtivas(false);
    }
  };

  const sugestoes = useMemo(() => {
    if (!mencaoBusca) return membrosCanal.slice(0, 5);
    const b = mencaoBusca.toLowerCase();
    return membrosCanal.filter((o) => (o.nome || '').toLowerCase().includes(b)).slice(0, 5);
  }, [mencaoBusca, membrosCanal]);

  const inserirMencao = (operador) => {
    const cursorPos = document.querySelector('textarea')?.selectionStart || texto.length;
    const textoAteCursor = texto.slice(0, cursorPos);
    const textoAposCursor = texto.slice(cursorPos);
    const novoAte = textoAteCursor.replace(/@\S*$/, `@${operador.nome} `);
    setTexto(novoAte + textoAposCursor);
  };

  const handleReagir = (msgId, emoji) => {
    socket?.emit('mensagem:reagir', { canalId: canal?.id, msgId, emoji });
    setShowEmoji(null); setMenuMsg(null);
  };

  const handleFixar = (msgId) => {
    socket?.emit('mensagem:fixar', { canalId: canal?.id, msgId }, (res) => {
      if (!res?.ok) setErroEnvio('Nao foi possivel fixar');
    });
    setMenuMsg(null);
  };

  const handleExcluir = (msgId) => {
    const msg = mensagens.find((m) => m.id === msgId);
    if (!msg) return;
    socket?.emit('mensagem:excluir', { canalId: canal?.id, msgId });
    setPreservarExcluida({ msg, timer: setTimeout(() => setPreservarExcluida(null), 5000) });
    setMenuMsg(null);
  };

  const handleDesfazerExcluir = async () => {
    if (!preservarExcluida) return;
    clearTimeout(preservarExcluida.timer);
    const { msg } = preservarExcluida;
    socket?.emit('mensagem:desfazerExclusao', { canalId: canal.id, msgId: msg.id });
    setMensagens((prev) => prev.map((m) => m.id === msg.id ? { ...m, excluida: false, conteudo: msg.conteudo } : m));
    setPreservarExcluida(null);
  };

  const iniciarEdicao = (msg) => { setEditando(msg); setTexto(msg.conteudo || ''); setMenuMsg(null); };
  const cancelarEdicao = () => { setEditando(null); setTexto(''); };
  const iniciarResposta = (msg) => { setRespondendoA(msg); setMenuMsg(null); };

  const handleEncaminhar = (msgId) => {
    setShowForwardModal(msgId);
    setMenuMsg(null);
    if (canaisTodos.length === 0) fetchCanaisInternos().then((arr) => setCanaisTodos(arr.map(normalizarCanal))).catch(() => {});
  };

  const confirmarEncaminhar = (canalDestinoId) => {
    if (showForwardModal && canalDestinoId) {
      socket?.emit('mensagem:encaminhar', { msgId: showForwardModal, canalDestinoId }, (res) => {
        if (!res?.ok) setErroEnvio(res?.erro || 'Falha ao encaminhar');
      });
    }
    setShowForwardModal(null);
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setMenuMsg(msg.id);
  };

  const handleTouchStart = (msgId) => {
    longPressTimerRef.current = setTimeout(() => setMenuMsg(msgId), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  const carregarMaisAntigas = async () => {
    if (!canal || carregandoMais || mensagens.length === 0) return;
    setCarregandoMais(true);
    const el = areaMensagensRef.current;
    const oldHeight = el?.scrollHeight || 0;
    try {
      const antesDe = mensagens[0].criado_em;
      const antigas = await fetchMensagensInternas(canal.id, { antesDe, limite: 50 });
      if (antigas.length === 0) { setTemMaisAntigas(false); return; }
      const norm = normalizarMensagens(antigas).map((m) => {
        let _reacoes = {};
        if (m._reacao_raw) {
          const raw = m._reacao_raw;
          _reacoes = {
            [raw.emoji]: {
              operadores: raw.usuarios || [],
              contagem: raw.contagem || 0,
            },
          };
        }
        return { ...m, _isMe: m.remetente_id === opId, _reacoes };
      });
      setMensagens((prev) => [...norm, ...prev]);
      setTemMaisAntigas(antigas.length === 50);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - oldHeight;
      });
    } catch (err) {
      setErroEnvio('Erro ao carregar mais mensagens');
    } finally {
      setCarregandoMais(false);
    }
  };

  const onScrollArea = () => {
    const el = areaMensagensRef.current;
    if (!el) return;
    if (el.scrollTop < 50 && temMaisAntigas && !carregandoMais) {
      carregarMaisAntigas();
    }
  };

  const grupos = useMemo(() => {
    return agruparMensagens(mensagens);
  }, [mensagens]);

  const subtituloHeader = useMemo(() => {
    if (digitando.length === 0) return canal?.descricao || '';
    const nomes = digitando.map((id) => digitandoMap[id] || '').filter(Boolean);
    if (nomes.length === 0) return 'digitando...';
    if (nomes.length === 1) return `${nomes[0]} esta digitando...`;
    return `${nomes.slice(0, 2).join(', ')} estao digitando...`;
  }, [digitando, digitandoMap, canal?.descricao]);

  if (!canal) {
    return React.createElement('div', {
      style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5', backgroundImage: 'radial-gradient(#d1d7db 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' },
    },
      React.createElement('div', { style: { textAlign: 'center' } },
        React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 64, display: 'block', marginBottom: 16, color: '#d1d7db', fontVariationSettings: "'FILL' 0" } }, 'forum'),
        React.createElement('p', { style: { fontSize: 14, color: T.textMuted } }, 'Selecione um canal para conversar'),
      ),
    );
  }

  const nome = canal.tipo === 'dm'
    ? (canal.membros?.find((m) => m.id !== opId)?.nome || 'Conversa')
    : (canal.nome || 'Grupo');

  const outroMembro = canal.tipo === 'dm' ? canal.membros?.find((m) => m.id !== opId) : null;
  const outroOnline = outroMembro?.online === true;

  const canaisDestino = canaisTodos.filter((c) => c.id !== canal.id);

  return React.createElement('div', {
    style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, position: 'relative' },
    onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, onPaste: handlePaste,
  },
    draggingFile && React.createElement('div', {
      style: { position: 'absolute', inset: 0, background: 'rgba(37,99,235,0.08)', border: '3px dashed #2563EB', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none' },
    },
      React.createElement('div', { style: { background: '#2563EB', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600 } }, 'Solte o arquivo aqui'),
    ),

    React.createElement('div', { style: { display: 'flex', alignItems: 'center', padding: '10px 16px', background: T.surface, gap: 10, flexShrink: 0, borderBottom: '1px solid #d1d7db', minHeight: 56 } },
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('div', { style: { width: 36, height: 36, borderRadius: '50%', background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 } }, (nome[0] || '?').toUpperCase()),
        canal.tipo === 'dm' && React.createElement('div', {
          style: {
            position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%',
            background: outroOnline ? '#10B981' : '#9CA3AF',
            border: '2px solid #fff',
          },
          title: outroOnline ? 'Online' : 'Offline',
        }),
      ),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nome),
        React.createElement('div', { style: { fontSize: 11, color: (canal.tipo === 'dm' && outroOnline) ? '#10B981' : (digitando.length > 0 ? T.primary : T.textMuted), fontStyle: digitando.length > 0 ? 'italic' : 'normal' } },
          digitando.length > 0 ? subtituloHeader : (canal.tipo === 'dm' ? (outroOnline ? 'Online' : 'Offline') : subtituloHeader)),
      ),
      React.createElement('button', {
        onClick: () => { setModoBusca((v) => !v); setBuscaQuery(''); setBuscaResultados([]); },
        'aria-label': 'Buscar mensagens',
        style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', color: modoBusca ? T.primary : T.textMuted },
      }, React.createElement(Search, { size: 18 })),
      React.createElement('button', {
        onClick: () => setShowGrupoInfo((v) => !v),
        'aria-label': 'Informacoes do canal',
        style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', color: showGrupoInfo ? T.primary : T.textMuted },
      }, React.createElement(MoreHorizontal, { size: 18 })),
    ),

    // Barra de busca
    modoBusca && React.createElement('div', { style: { padding: '8px 12px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 } },
      React.createElement('input', {
        type: 'text', value: buscaQuery, autoFocus: true,
        onChange: async (e) => {
          const val = e.target.value;
          setBuscaQuery(val);
          if (val.trim().length < 2) { setBuscaResultados([]); return; }
          setBuscaCarregando(true);
          try {
            const res = await buscarMensagensCanal(canal.id, val.trim());
            setBuscaResultados(res);
          } catch { setBuscaResultados([]); }
          finally { setBuscaCarregando(false); }
        },
        placeholder: 'Buscar mensagens...',
        style: { flex: 1, border: 'none', outline: 'none', fontSize: 13, background: T.surfaceMuted, borderRadius: 8, padding: '6px 10px', color: T.text },
      }),
      buscaCarregando && React.createElement('div', { style: { width: 16, height: 16, border: '2px solid #d1d7db', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.6s linear infinite' } }),
      buscaQuery && React.createElement('span', { style: { fontSize: 12, color: T.textMuted, flexShrink: 0 } }, `${buscaResultados.length} resultado(s)`),
      React.createElement('button', {
        onClick: () => { setModoBusca(false); setBuscaQuery(''); setBuscaResultados([]); },
        'aria-label': 'Fechar busca',
        style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, display: 'flex' },
      }, React.createElement(X, { size: 16 })),
    ),

    // Painel de resultados da busca
    modoBusca && buscaResultados.length > 0 && React.createElement('div', { style: { position: 'absolute', top: modoBusca ? 120 : 56, left: 0, right: 0, maxHeight: '50%', overflow: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 150, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 } },
      buscaResultados.map((m) => React.createElement('div', {
        key: m.id,
        onClick: () => {
          // Rola até a mensagem e destaca
          const el = document.querySelector(`[data-msg-id="${m.id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setModoBusca(false);
        },
        style: { padding: '8px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, fontSize: 13 },
      },
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: T.primary, marginBottom: 2 } }, m.remetente_nome || 'Alguem'),
          React.createElement('div', { style: { color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, m.conteudo),
        ),
        React.createElement('span', { style: { fontSize: 10, color: T.textMuted, flexShrink: 0 } }, formatarHora(m.criado_em)),
      )),
    ),

    fixadas.length > 0 && React.createElement('div', { role: 'region', 'aria-label': 'Mensagens fixadas', style: { padding: '6px 12px', background: '#FFF3CD', borderBottom: '1px solid #FFE69C', fontSize: 12, display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 } },
      React.createElement(Pin, { size: 12, color: '#856404' }),
      ...fixadas.map((f) => React.createElement('span', { key: f.id, title: f.conteudo, style: { color: '#856404', whiteSpace: 'nowrap' } }, `${f.remetente_nome || 'Alguem'}: ${(f.conteudo || '').slice(0, 60)}${(f.conteudo || '').length > 60 ? '...' : ''}`)),
    ),

    preservarExcluida && React.createElement('div', { role: 'status', 'aria-live': 'polite', style: { position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#1F2937', color: '#fff', padding: '10px 16px', borderRadius: 22, fontSize: 13, display: 'flex', alignItems: 'center', gap: 12, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' } },
      React.createElement('span', null, 'Mensagem exclu\u00edda'),
      React.createElement('button', { onClick: handleDesfazerExcluir, 'aria-label': 'Desfazer exclusao', style: { background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 } },
        React.createElement(Undo2, { size: 14 }), 'Desfazer'),
    ),

    respondendoA && React.createElement('div', { style: { padding: '8px 16px', background: T.surfaceMuted, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMuted, flexShrink: 0, borderBottom: `1px solid ${T.border}` } },
      React.createElement(Reply, { size: 14, 'aria-hidden': true }),
      React.createElement('span', null, `Respondendo a ${(respondendoA.remetente_nome || respondendoA.remetenteNome || 'mensagem').split(' ')[0]}`),
      React.createElement('button', { onClick: () => setRespondendoA(null), 'aria-label': 'Cancelar resposta', style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 14, display: 'flex' } }, React.createElement(X, { size: 14 })),
    ),

    React.createElement('div', {
      ref: areaMensagensRef, onScroll: onScrollArea, role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensagens do canal',
      style: { flex: 1, overflowY: 'auto', padding: '12px 16px', position: 'relative', backgroundColor: '#f0f2f5', backgroundImage: 'radial-gradient(#d1d7db 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' },
    },
      carregandoMais && React.createElement('div', { style: { textAlign: 'center', padding: 8, color: T.textMuted, fontSize: 12 } }, 'Carregando...'),
      !carregandoMais && temMaisAntigas && React.createElement('button', { onClick: carregarMaisAntigas, style: { display: 'block', margin: '0 auto 8px', background: 'transparent', border: 'none', color: T.primary, fontSize: 12, cursor: 'pointer' } }, 'Carregar mensagens anteriores'),

      grupos.map((grupo, gi) => {
        const isMe = grupo.isMe;
        return React.createElement('div', { key: `${grupo.autorId}-${grupo.msgs[0].id}-${gi}`, style: { display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' } },
          ...grupo.msgs.map((msg, mi) => React.createElement(BolhaMensagem, {
            key: msg.id, msg, isMe: msg._isMe, agrupada: mi > 0, opId, operadores: operadoresMap, onContextMenu: handleContextMenu, mostrarAutor: mi === 0,
            onTouchStart: () => handleTouchStart(msg.id), onTouchEnd: handleTouchEnd,
          })),
        );
      }),

      novasPendentes > 0 && React.createElement('button', {
        onClick: () => { setNovasPendentes(0); scrollToBottom(true); },
        'aria-label': `${novasPendentes} novas mensagens`,
        style: { position: 'absolute', bottom: 16, right: 16, background: T.primary, color: '#fff', border: 'none', borderRadius: 20, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
      },
        React.createElement(ArrowDown, { size: 14 }), `${novasPendentes} nova${novasPendentes > 1 ? 's' : ''}`,
      ),
    ),

    editando && React.createElement('div', { style: { padding: '6px 16px', background: '#FFF3CD', fontSize: 12, color: '#856404', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 } },
      React.createElement(Edit3, { size: 12 }), 'Editando mensagem',
      React.createElement('button', { onClick: cancelarEdicao, style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', fontSize: 12, textDecoration: 'underline' } }, 'Cancelar'),
    ),

    erroEnvio && React.createElement('div', { role: 'alert', style: { padding: '6px 16px', background: '#FEE2E2', color: '#991B1B', fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 } },
      React.createElement('span', null, erroEnvio),
      React.createElement('button', { onClick: () => setErroEnvio(null), 'aria-label': 'Fechar erro', style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B' } }, React.createElement(X, { size: 14 })),
    ),

    anexoPreview && React.createElement('div', { style: { padding: '8px 16px', background: T.surfaceMuted, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderTop: `1px solid ${T.border}` } },
      anexoPreview.previewUrl
        ? React.createElement('img', { src: anexoPreview.previewUrl, alt: anexoPreview.nome, style: { width: 40, height: 40, borderRadius: 6, objectFit: 'cover' } })
        : React.createElement(ImageIcon, { size: 16, color: T.primary }),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, anexoPreview.nome),
        uploading && React.createElement('div', { style: { height: 3, background: T.border, borderRadius: 2, marginTop: 4, overflow: 'hidden' } },
          React.createElement('div', { style: { width: `${uploadProgress}%`, height: '100%', background: T.primary, transition: 'width 0.2s' } })),
      ),
      React.createElement('button', { onClick: cancelarAnexo, 'aria-label': 'Cancelar anexo', style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, display: 'flex' } }, React.createElement(X, { size: 16 })),
    ),

    // Anexos adicionais (upload múltiplo)
    anexosMultiplos.length > 0 && React.createElement('div', { style: { padding: '6px 16px', background: T.surfaceMuted, display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0, borderTop: `1px solid ${T.border}` } },
      ...anexosMultiplos.map((a, i) => React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 11, border: `1px solid ${T.border}` } },
        a.previewUrl
          ? React.createElement('img', { src: a.previewUrl, alt: a.nome, style: { width: 24, height: 24, borderRadius: 4, objectFit: 'cover' } })
          : React.createElement(ImageIcon, { size: 12, color: T.textMuted }),
        React.createElement('span', { style: { maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.nome),
        React.createElement('button', {
          onClick: () => setAnexosMultiplos((prev) => prev.filter((_, j) => j !== i)),
          style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 0, display: 'flex' },
        }, React.createElement(X, { size: 10 })),
      )),
      React.createElement('span', { style: { fontSize: 10, color: T.textMuted, alignSelf: 'center' } }, `${anexosMultiplos.length} anexo(s)`),
    ),

    // Banner durante gravação
    gravando && React.createElement('div', { role: 'status', 'aria-live': 'polite', style: { padding: '10px 16px', background: T.dangerSoft, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderTop: `1px solid ${T.border}` } },
      React.createElement('span', { className: 'pulse-dot', style: { width: 10, height: 10, borderRadius: '50%', background: T.danger, display: 'inline-block' } }),
      React.createElement('span', { style: { fontSize: 13, color: T.danger, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
        `Gravando... ${formatarDuracao(tempoGravadoMs)} / 2:00`,
      ),
      React.createElement('div', { style: { flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' } },
        React.createElement('div', { style: { width: `${Math.min(100, (tempoGravadoMs / AUDIO_MAX_MS) * 100)}%`, height: '100%', background: T.danger, transition: 'width 0.2s' } })),
      React.createElement('button', { type: 'button', onClick: pararGravacao, 'aria-label': 'Parar grava\u00e7\u00e3o', style: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: T.danger, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(Square, { size: 14, fill: '#fff' })),
    ),

    // Preview do áudio gravado (antes de enviar)
    audioBlob && !gravando && React.createElement('div', { style: { padding: '8px 16px', background: T.surfaceMuted, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderTop: `1px solid ${T.border}` } },
      React.createElement('button', { type: 'button', onClick: tocarPausarPreview, 'aria-label': tocando ? 'Pausar pr\u00e9-visualiza\u00e7\u00e3o' : 'Ouvir pr\u00e9-visualiza\u00e7\u00e3o', style: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: T.primary, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        tocando ? React.createElement(Pause, { size: 16 }) : React.createElement(Play, { size: 16, fill: '#fff' })),
      React.createElement('audio', { ref: audioPreviewRef, src: audioUrl, onPlay: () => setTocando(true), onPause: () => setTocando(false), onEnded: () => setTocando(false), preload: 'metadata' }),
      React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
        React.createElement('span', { style: { fontSize: 12, color: T.text, fontWeight: 600 } }, 'Mensagem de voz'),
        React.createElement('span', { style: { fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums' } }, formatarDuracao(audioDuracao)),
      ),
      React.createElement('button', { type: 'button', onClick: descartarAudio, 'aria-label': 'Descartar \u00e1udio', title: 'Regravar', style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex' } },
        React.createElement(RotateCcw, { size: 16 })),
      React.createElement('button', { type: 'button', onClick: descartarAudio, 'aria-label': 'Cancelar \u00e1udio', style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, display: 'flex' } },
        React.createElement(X, { size: 16 })),
    ),

    audioErro && React.createElement('div', { role: 'alert', style: { padding: '6px 16px', background: '#FEE2E2', color: '#991B1B', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 } },
      React.createElement('span', { style: { flex: 1 } }, audioErro),
      React.createElement('button', { onClick: () => setAudioErro(null), 'aria-label': 'Fechar', style: { background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B' } }, React.createElement(X, { size: 14 })),
    ),

    React.createElement('form', {
      onSubmit: enviar,
      style: { display: 'flex', alignItems: 'flex-end', padding: '10px 14px', background: T.surface, gap: 8, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      React.createElement('button', { type: 'button', onClick: handleFilePick, disabled: uploading || gravando, 'aria-label': 'Anexar arquivo', style: { background: 'none', border: 'none', cursor: uploading || gravando ? 'not-allowed' : 'pointer', padding: 4, display: 'flex' } },
        React.createElement(Paperclip, { size: 20, color: uploading || gravando ? T.textMuted : T.primary })),
      React.createElement('button', { type: 'button', onClick: () => { setShowEnquete(true); setEnquetePergunta(''); setEnqueteOpcoes(['', '']); }, disabled: gravando, 'aria-label': 'Criar enquete', style: { background: 'none', border: 'none', cursor: gravando ? 'not-allowed' : 'pointer', padding: 4, display: 'flex' } },
        React.createElement(BarChart2, { size: 20, color: gravando ? T.textMuted : T.primary })),

      // Modal de criação de enquete
      showEnquete && React.createElement('div', { onClick: () => setShowEnquete(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }, role: 'dialog', 'aria-label': 'Criar enquete' },
        React.createElement('div', { onClick: (e) => e.stopPropagation(), style: { background: '#fff', borderRadius: 12, padding: 20, width: 400, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' } },
          React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, marginBottom: 16 } }, 'Nova Enquete'),
          React.createElement('input', { type: 'text', value: enquetePergunta, onChange: (e) => setEnquetePergunta(e.target.value), placeholder: 'Pergunta', style: { width: '100%', padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, marginBottom: 12, outline: 'none', boxSizing: 'border-box' } }),
          ...enqueteOpcoes.map((op, i) => React.createElement('div', { key: i, style: { display: 'flex', gap: 8, marginBottom: 8 } },
            React.createElement('input', { type: 'text', value: op, onChange: (e) => { const n = [...enqueteOpcoes]; n[i] = e.target.value; setEnqueteOpcoes(n); }, placeholder: `Opcao ${i + 1}`, style: { flex: 1, padding: '6px 10px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 13, outline: 'none' } }),
            enqueteOpcoes.length > 2 && React.createElement('button', { onClick: () => setEnqueteOpcoes((p) => p.filter((_, j) => j !== i)), style: { background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer' } }, React.createElement(X, { size: 14 })),
          )),
          React.createElement('button', { onClick: () => setEnqueteOpcoes((p) => [...p, '']), style: { background: 'none', border: 'none', color: T.primary, cursor: 'pointer', fontSize: 12, marginBottom: 12 } }, '+ Adicionar opcao'),
          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            React.createElement('button', { onClick: () => setShowEnquete(false), style: { padding: '8px 16px', background: T.surfaceMuted, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: T.textMuted } }, 'Cancelar'),
            React.createElement('button', {
              onClick: async () => {
                const ops = enqueteOpcoes.filter((o) => o.trim());
                if (!enquetePergunta.trim() || ops.length < 2) return;
                try {
                  await criarEnquete(canal.id, enquetePergunta.trim(), ops.map((o) => o.trim()));
                  setShowEnquete(false);
                } catch (e) { console.error(e); }
              },
              disabled: enqueteOpcoes.filter((o) => o.trim()).length < 2 || !enquetePergunta.trim(),
              style: { padding: '8px 16px', background: enqueteOpcoes.filter((o) => o.trim()).length >= 2 && enquetePergunta.trim() ? T.primary : T.border, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
            }, 'Criar'),
          ),
        ),
      ),
      React.createElement('input', { type: 'file', ref: fileInputRef, onChange: handleFileChange, multiple: true, style: { display: 'none' }, 'aria-hidden': true, accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip' }),

      // Dropdown de @menções
      mencoesAtivas && sugestoes.length > 0 && React.createElement('div', {
        style: { position: 'absolute', bottom: 60, left: 16, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 200, minWidth: 220 },
      },
        sugestoes.map((o, i) => React.createElement('div', {
          key: o.id,
          onClick: () => { inserirMencao(o); setMencoesAtivas(false); },
          onMouseEnter: () => setMencaoIdx(i),
          style: {
            padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
            background: i === mencaoIdx ? T.surfaceMuted : '#fff',
            color: T.text,
          },
        },
          React.createElement('div', { style: { width: 28, height: 28, borderRadius: '50%', background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 } }, (o.nome[0] || '?').toUpperCase()),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', { style: { fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, o.nome),
            React.createElement('div', { style: { fontSize: 10, color: o.online ? '#10B981' : T.textMuted } }, o.online ? 'Online' : 'Offline'),
          ),
        )),
      ),

      React.createElement('textarea', {
        value: texto, onChange: handleTextoChange, onKeyDown: handleTeclaInput,
        placeholder: editando ? 'Editar mensagem...' : respondendoA ? 'Responder...' : anexoPreview ? 'Adicione uma legenda...' : gravando ? 'Gravando áudio...' : audioBlob ? 'Adicione uma legenda (opcional)...' : 'Digite uma mensagem (use @ para mencionar)',
        'aria-label': 'Caixa de mensagem', rows: 1, disabled: gravando,
        style: { flex: 1, background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 20, padding: '8px 14px', color: T.text, fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', maxHeight: 100, opacity: gravando ? 0.5 : 1 },
      }),
      // Bot\u00e3o de microfone (vira stop durante grava\u00e7\u00e3o)
      !audioBlob && React.createElement('button', {
        type: 'button',
        onClick: gravando ? pararGravacao : iniciarGravacao,
        'aria-label': gravando ? 'Parar grava\u00e7\u00e3o' : 'Gravar \u00e1udio',
        title: gravando ? 'Parar' : 'Gravar \u00e1udio (m\u00e1x. 2 min)',
        style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' },
      },
        gravando
          ? React.createElement(Square, { size: 20, color: T.danger, fill: T.danger })
          : React.createElement(Mic, { size: 20, color: T.primary })),
      React.createElement('button', {
        type: 'submit',
        disabled: (!texto.trim() && !anexoPreview && !audioBlob) || uploading || gravando,
        'aria-label': 'Enviar mensagem',
        style: { width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: ((texto.trim() || anexoPreview || audioBlob) && !uploading && !gravando) ? 'pointer' : 'not-allowed', background: ((texto.trim() || anexoPreview || audioBlob) && !uploading && !gravando) ? T.primary : T.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      }, React.createElement(Send, { size: 18, color: ((texto.trim() || anexoPreview || audioBlob) && !uploading && !gravando) ? '#fff' : T.textMuted })),
    ),

    menuMsg && (() => {
      const msg = mensagens.find((m) => m.id === menuMsg && !m.excluida);
      if (!msg) return null;
      const isMe = msg._isMe;
      return React.createElement('div', { onClick: () => setMenuMsg(null), style: { position: 'fixed', inset: 0, zIndex: 90 } },
        React.createElement('div', { onClick: (e) => e.stopPropagation(), style: { position: 'absolute', top: Math.min(window.innerHeight - 60, 200), left: isMe ? 'auto' : 60, right: isMe ? 60 : 'auto', display: 'flex', gap: 2, background: T.surface, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.15)', padding: 4, zIndex: 95 } },
          React.createElement('button', { onClick: () => setShowEmoji(showEmoji === msg.id ? null : msg.id), 'aria-label': 'Reagir a mensagem', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4, display: 'flex' } }, React.createElement(Smile, { size: 16, color: T.textMuted })),
          React.createElement('button', { onClick: () => iniciarResposta(msg), 'aria-label': 'Responder', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4, display: 'flex' } }, React.createElement(Reply, { size: 16, color: T.textMuted })),
          React.createElement('button', { onClick: () => handleFixar(msg.id), 'aria-label': 'Fixar mensagem', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4, display: 'flex' } }, React.createElement(Pin, { size: 16, color: T.textMuted })),
          isMe && React.createElement('button', { onClick: () => iniciarEdicao(msg), 'aria-label': 'Editar mensagem', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4, display: 'flex' } }, React.createElement(Edit3, { size: 16, color: T.textMuted })),
          isMe && React.createElement('button', { onClick: () => handleExcluir(msg.id), 'aria-label': 'Excluir mensagem', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4, display: 'flex' } }, React.createElement(Trash2, { size: 16, color: '#EF4444' })),
          React.createElement('button', { onClick: () => handleEncaminhar(msg.id), 'aria-label': 'Encaminhar mensagem', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4, display: 'flex' } }, React.createElement(Forward, { size: 16, color: T.textMuted })),
        ),
      );
    })(),

    showEmoji && React.createElement('div', { onClick: () => setShowEmoji(null), style: { position: 'fixed', inset: 0, zIndex: 95 } },
      React.createElement('div', { onClick: (e) => e.stopPropagation(), style: { position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, padding: 6, background: T.surface, borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', zIndex: 100, maxWidth: '90vw', flexWrap: 'wrap' } },
        ...EMOJIS_RAPIDOS.map((emoji) =>
          React.createElement('button', { key: emoji, onClick: () => handleReagir(showEmoji, emoji), 'aria-label': `Reagir com ${emoji}`, style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 4 } }, emoji),
        ),
      ),
    ),

    showForwardModal && React.createElement('div', { onClick: () => setShowForwardModal(null), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }, role: 'dialog', 'aria-label': 'Encaminhar mensagem' },
      React.createElement('div', { onClick: (e) => e.stopPropagation(), style: { background: T.surface, borderRadius: 12, padding: 20, width: 360, maxHeight: '60vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' } },
        React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, marginBottom: 12, color: T.text } }, 'Encaminhar para'),
        canaisDestino.length === 0
          ? React.createElement('p', { style: { fontSize: 13, color: T.textMuted, padding: 12, textAlign: 'center' } }, 'Nenhum outro canal disponivel')
          : canaisDestino.map((c) => {
              const nomeDest = c.tipo === 'dm'
                ? (c.membros?.find((m) => m.id !== opId)?.nome || 'Conversa')
                : (c.nome || 'Grupo');
              return React.createElement('button', {
                key: c.id, onClick: () => confirmarEncaminhar(c.id),
                'aria-label': `Encaminhar para ${nomeDest}`,
                style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, textAlign: 'left', color: T.text, fontSize: 14, borderBottom: `1px solid ${T.border}` },
              },
                React.createElement('div', { style: { width: 32, height: 32, borderRadius: '50%', background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 } }, (nomeDest[0] || '?').toUpperCase()),
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nomeDest),
                  React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, c.tipo === 'dm' ? 'Conversa direta' : `${c.membros?.length || 0} membros`),
                ),
              );
            }),
        React.createElement('button', { onClick: () => setShowForwardModal(null), style: { marginTop: 12, width: '100%', padding: '8px', background: T.surfaceMuted, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: T.textMuted } }, 'Cancelar'),
      ),
    ),

    // Modal de informacoes do grupo
    showGrupoInfo && React.createElement('div', { onClick: () => setShowGrupoInfo(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }, role: 'dialog', 'aria-label': 'Informacoes do canal' },
      React.createElement('div', { onClick: (e) => e.stopPropagation(), style: { background: T.surface, borderRadius: 12, padding: 20, width: 380, maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' } },
        React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: T.text } }, canal.tipo === 'grupo' ? 'Informacoes do Grupo' : 'Conversa Direta'),
        React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('p', { style: { fontSize: 13, color: T.textMuted, marginBottom: 8 } }, `${canal.membros?.length || 0} membros`),
          (canal.membros || []).map((m) => React.createElement('div', {
            key: m.id,
            style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 },
          },
            React.createElement('div', { style: { position: 'relative' } },
              React.createElement('div', { style: { width: 32, height: 32, borderRadius: '50%', background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 } }, (m.nome || '?')[0].toUpperCase()),
              React.createElement('div', { style: { position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: m.online ? '#10B981' : '#9CA3AF', border: '1.5px solid #fff' } }),
            ),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontWeight: 600 } }, m.nome),
              React.createElement('div', { style: { fontSize: 10, color: T.textMuted } }, m.online ? 'Online' : 'Offline'),
            ),
            canal.criado_por === m.id && React.createElement('span', { style: { fontSize: 10, color: T.textMuted, fontStyle: 'italic' } }, 'Criador'),
            canal.tipo === 'grupo' && m.id !== opId && canal.criado_por === opId && React.createElement('button', {
              onClick: async () => {
                try { await removerMembroCanal(canal.id, m.id); setShowGrupoInfo(false); } catch {}
              },
              style: { background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', padding: 4 },
            }, React.createElement(UserMinus, { size: 14 })),
          )),
        ),
        canal.tipo === 'grupo' && canal.criado_por === opId && React.createElement('button', {
          onClick: () => setShowGrupoInfo(false),
          style: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px', background: T.primarySoft, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: T.primary, fontWeight: 600, marginBottom: 8 },
        }, React.createElement(UserPlus, { size: 14 }), 'Adicionar membros'),
        canal.tipo === 'grupo' && canal.criado_por !== opId && React.createElement('button', {
          onClick: async () => {
            if (confirm('Deseja sair deste grupo?')) {
              try { await sairCanal(canal.id); setShowGrupoInfo(false); } catch {}
            }
          },
          style: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px', background: '#FEE2E2', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#991B1B', fontWeight: 600, marginBottom: 8 },
        }, React.createElement(LogOut, { size: 14 }), 'Sair do grupo'),
        React.createElement('button', { onClick: () => setShowGrupoInfo(false), style: { width: '100%', padding: '8px', background: T.surfaceMuted, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: T.textMuted } }, 'Fechar'),
      ),
    ),
  );
}
