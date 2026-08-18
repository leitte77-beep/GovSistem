import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, FileText, MessageSquare, Paperclip, ArrowRightLeft, AlertCircle,
  History, User, Link2, Shield, Send, Loader2, Download, Eye, Clock,
  Tag, MoreVertical, Hand, UserPlus, CheckCircle, ChevronDown, Plus,
  Search, Info, Edit, Inbox, XCircle, Lock, Unlock, Check, Globe,
  MessageCircle, Phone, AtSign, AlertTriangle, Upload, Flag, RefreshCw,
  ExternalLink, MapPin, Hash, Building2, Calendar, FileImage, Copy,
} from 'lucide-react';
import { T } from '../theme';

const STATUS_PROT = {
  ABERTO: { label: 'Aberto', cor: T.warning, bg: T.warningSoft },
  EM_ANDAMENTO: { label: 'Em andamento', cor: T.primary, bg: T.primarySoft },
  PENDENTE: { label: 'Pendente', cor: '#F59E0B', bg: '#FEF3C7' },
  CONCLUIDO: { label: 'Concluído', cor: T.success, bg: T.successSoft },
  CANCELADO: { label: 'Cancelado', cor: T.danger, bg: T.dangerSoft },
};

const PRIORIDADE_COR = { NORMAL: T.textMuted, BAIXA: T.success, ALTA: T.warning, URGENTE: T.danger };

const CANAIS_ENVIO = [
  { id: 'portal', label: 'Portal', icon: Globe },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'email', label: 'E-mail', icon: AtSign },
  { id: 'portal_whatsapp', label: 'Portal+WhatsApp', icon: Send },
];

const TIPOS_PENDENCIA = [
  { id: 'documento', label: 'Solicitar documento' },
  { id: 'informacao', label: 'Solicitar informação' },
  { id: 'comparecimento', label: 'Solicitar comparecimento' },
  { id: 'assinatura', label: 'Solicitar assinatura' },
  { id: 'pagamento', label: 'Solicitar pagamento' },
  { id: 'outro', label: 'Outro' },
];

const TIPOS_RELACAO = [
  { id: 'principal', label: 'Principal' },
  { id: 'complementar', label: 'Complementar' },
  { id: 'resposta', label: 'Resposta' },
  { id: 'recurso', label: 'Recurso' },
  { id: 'renovacao', label: 'Renovação' },
  { id: 'duplicado', label: 'Duplicado' },
  { id: 'dependente', label: 'Dependente' },
  { id: 'desmembrado', label: 'Desmembrado' },
  { id: 'apensado', label: 'Apensado' },
];

const ICONES_EVENTO = {
  criacao: FileText, edicao: Edit, atribuicao: UserPlus, encaminhamento: ArrowRightLeft,
  recebimento: Inbox, mudanca_status: RefreshCw, mudanca_prioridade: Flag,
  mudanca_prazo: Clock, mensagem: MessageSquare, documento: Paperclip,
  pendencia: AlertCircle, conclusao: CheckCircle, cancelamento: XCircle,
};

function formatarDataHora(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d)) return '\u2014';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatarData(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d)) return '\u2014';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatarBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function maskCPF(cpf) {
  if (!cpf) return '';
  var cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return cpf;
  return '***' + cleaned.substring(3, 9) + '**';
}

function BadgeStatus({ status }) {
  var info = STATUS_PROT[status] || { label: status || '\u2014', cor: T.textMuted, bg: T.surfaceMuted };
  return React.createElement('span', {
    style: { display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: info.cor, background: info.bg, whiteSpace: 'nowrap' },
  }, info.label);
}

function BadgePrioridade({ prioridade }) {
  var cor = PRIORIDADE_COR[prioridade] || T.textMuted;
  if (!prioridade || prioridade === 'NORMAL') return null;
  return React.createElement('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: cor, background: cor + '18', whiteSpace: 'nowrap' },
  }, React.createElement(AlertTriangle, { size: 10 }), prioridade);
}

function BadgeVisibilidade({ publico }) {
  if (publico) {
    return React.createElement('span', {
      style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: T.success, padding: '1px 6px', borderRadius: 4, background: T.successSoft },
    }, React.createElement(Unlock, { size: 10 }), 'Público');
  }
  return React.createElement('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: T.textMuted, padding: '1px 6px', borderRadius: 4, background: T.surfaceMuted },
  }, React.createElement(Lock, { size: 10 }), 'Interno');
}

function SectionTitle({ text, style: extraStyle }) {
  return React.createElement('div', {
    style: { fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, ...(extraStyle || {}) },
  }, text);
}

function CampoInfo({ Icone, rotulo, valor, maskCPF: mascarar }) {
  var displayValor = mascarar && valor ? maskCPF(valor) : (valor || '\u2014');
  return React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 } },
    Icone && React.createElement(Icone, { size: 13, style: { color: T.textMuted, marginTop: 2, flexShrink: 0 } }),
    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
      React.createElement('div', { style: { fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 } }, rotulo),
      React.createElement('div', { style: { fontSize: 12.5, color: T.text, fontWeight: 600, wordBreak: 'break-word', fontFamily: mascarar ? 'monospace' : 'inherit' } }, displayValor),
    ),
  );
}

function CampoSimples({ rotulo, valor }) {
  return React.createElement('div', null,
    React.createElement('div', { style: { fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 } }, rotulo),
    React.createElement('div', { style: { fontSize: 12.5, color: T.text, fontWeight: 600, wordBreak: 'break-word' } }, valor || '\u2014'),
  );
}

var btnBaseStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '7px 12px', borderRadius: T.radiusSm, border: 'none',
  fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};
var inputBaseStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: T.radiusSm,
  border: '1px solid ' + T.borderStrong, fontSize: 13, color: T.text,
  background: T.surfaceAlt, outline: 'none', fontFamily: 'inherit',
};

var ABAS = [
  { id: 'visao_geral', label: 'Vis\u00e3o Geral', Icone: FileText },
  { id: 'mensagens', label: 'Mensagens', Icone: MessageSquare },
  { id: 'documentos', label: 'Documentos', Icone: Paperclip },
  { id: 'tramitacoes', label: 'Tramita\u00e7\u00f5es', Icone: ArrowRightLeft },
  { id: 'pendencias', label: 'Pend\u00eancias', Icone: AlertCircle },
  { id: 'historico', label: 'Hist\u00f3rico', Icone: History },
  { id: 'solicitante', label: 'Solicitante', Icone: User },
  { id: 'relacionados', label: 'Relacionados', Icone: Link2 },
  { id: 'auditoria', label: 'Auditoria', Icone: Shield },
];

export function PainelDetalheProtocolo({ protocolo, onClose, onAtualizado }) {
  var [proto, setProto] = useState(protocolo);
  var [aba, setAba] = useState('visao_geral');
  var [carregando, setCarregando] = useState(true);
  var [erro, setErro] = useState('');

  var [mensagens, setMensagens] = useState([]);
  var [textoMsg, setTextoMsg] = useState('');
  var [enviandoMsg, setEnviandoMsg] = useState(false);
  var [canalMsg, setCanalMsg] = useState('portal');
  var [textoAnotacao, setTextoAnotacao] = useState('');
  var [enviandoAnot, setEnviandoAnot] = useState(false);

  var [historico, setHistorico] = useState([]);
  var [documentos, setDocumentos] = useState([]);
  var [tramitacoes, setTramitacoes] = useState([]);
  var [pendencias, setPendencias] = useState([]);
  var [relacionados, setRelacionados] = useState([]);
  var [auditoria, setAuditoria] = useState([]);

  var [showMaisAcoes, setShowMaisAcoes] = useState(false);
  var [showEncaminhar, setShowEncaminhar] = useState(false);
  var [showNovaPendencia, setShowNovaPendencia] = useState(false);
  var [showRelacionar, setShowRelacionar] = useState(false);
  var [uploadingDoc, setUploadingDoc] = useState(false);
  // Falha de upload/download precisa aparecer na tela, não só no console.
  var [erroDoc, setErroDoc] = useState('');

  var [encaminhamento, setEncaminhamento] = useState({ setor_destino: '', operador_destino: '', motivo: '', instrucoes: '', notificar_setor: true, notificar_cidadao: false });
  var [novaPendencia, setNovaPendencia] = useState({ tipo: 'documento', titulo: '', descricao: '', prazo: '', docs_esperados: '', instrucoes: '', suspender_prazo: false });
  var [relacionamento, setRelacionamento] = useState({ protocolo_id: '', tipo: 'complementar' });
  var [expandirEvento, setExpandirEvento] = useState(null);

  var fileInputRef = useRef(null);
  var maisAcoesRef = useRef(null);

  var token = useCallback(function () {
    try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return ''; }
  }, []);

  var authHeaders = useCallback(function () {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() };
  }, [token]);

  var carregarDetalhes = useCallback(function () {
    if (!proto || !proto.id) return;
    setCarregando(true);
    setErro('');
    var h = { Authorization: 'Bearer ' + token() };
    var baseUrl = '/api/v1/protocols/' + proto.id;
    Promise.all([
      fetch(baseUrl, { headers: h }).then(function (r) { return r.ok ? r.json() : null; }),
      fetch(baseUrl + '/history', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(baseUrl + '/messages', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(baseUrl + '/documents', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(baseUrl + '/relations', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
    ]).then(function (_a) {
      var respProto = _a[0], respHist = _a[1], respMsg = _a[2], respDocs = _a[3], respRel = _a[4];
      if (respProto) setProto(respProto);
      setHistorico(Array.isArray(respHist) ? respHist : []);
      setMensagens(Array.isArray(respMsg) ? respMsg : []);
      setDocumentos(Array.isArray(respDocs) ? respDocs : []);
      setTramitacoes(Array.isArray(respProto && respProto.tramitacoes) ? respProto.tramitacoes : []);
      setPendencias(Array.isArray(respProto && respProto.pendencias) ? respProto.pendencias : []);
      setRelacionados(Array.isArray(respRel) ? respRel : []);
    }).catch(function (e) {
      setErro(e.message || 'Erro ao carregar detalhes');
    }).finally(function () {
      setCarregando(false);
    });
  }, [proto && proto.id, token]);

  useEffect(function () { carregarDetalhes(); }, [carregarDetalhes]);

  useEffect(function () {
    function handleClick(e) {
      if (maisAcoesRef.current && !maisAcoesRef.current.contains(e.target)) setShowMaisAcoes(false);
    }
    document.addEventListener('mousedown', handleClick);
    return function () { document.removeEventListener('mousedown', handleClick); };
  }, []);

  var carregarAuditoria = useCallback(function () {
    if (!proto || !proto.id || aba !== 'auditoria') return;
    var h = { Authorization: 'Bearer ' + token() };
    fetch('/api/v1/protocols/' + proto.id + '/audit', { headers: h })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { setAuditoria(Array.isArray(d) ? d : []); })
      .catch(function () {});
  }, [proto && proto.id, aba, token]);

  useEffect(function () { if (aba === 'auditoria') { carregarAuditoria(); } }, [aba, carregarAuditoria]);

  function notificarAtualizacao() {
    Promise.resolve().then(function () {
      carregarDetalhes();
      if (onAtualizado) onAtualizado();
    });
  }

  function callApi(method, path, body) {
    return fetch(path, { method: method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (dados) {
          // O motivo da recusa vem no corpo ("Transição inválida: ...").
          // Trocar isso por "HTTP 422" escondia exatamente o que o atendente
          // precisa ler para saber o que fazer.
          if (!r.ok) throw new Error(dados.erro || 'HTTP ' + r.status);
          return dados;
        });
      });
  }

  var enviarMensagem = function () {
    if (!textoMsg.trim()) return;
    setEnviandoMsg(true);
    callApi('POST', '/api/v1/protocols/' + proto.id + '/messages', { conteudo: textoMsg.trim(), canal: canalMsg })
      .then(function (nova) {
        setMensagens(function (prev) { return prev.concat([nova]); });
        setTextoMsg('');
        carregarDetalhes();
      })
      .catch(function () {})
      .finally(function () { setEnviandoMsg(false); });
  };

  var enviarAnotacao = function () {
    if (!textoAnotacao.trim()) return;
    setEnviandoAnot(true);
    callApi('POST', '/api/v1/protocols/' + proto.id + '/internal-notes', { conteudo: textoAnotacao.trim() })
      .then(function () {
        setTextoAnotacao('');
        carregarDetalhes();
      })
      .catch(function () {})
      .finally(function () { setEnviandoAnot(false); });
  };

  var assumirProtocolo = function () {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/assign', { operador_id: 'self' })
      .then(function () { notificarAtualizacao(); })
      .catch(function () {});
  };

  var concluirProtocolo = function () {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/complete', {})
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  // Cancelar e reabrir exigem motivo no backend; sem ele a chamada voltava 422
  // e o clique não fazia nada.
  var cancelarProtocolo = function () {
    var motivo = window.prompt('Informe o motivo do cancelamento:');
    if (!motivo || !motivo.trim()) return;
    callApi('POST', '/api/v1/protocols/' + proto.id + '/cancel', { justificativa: motivo.trim() })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var reabrirProtocolo = function () {
    var motivo = window.prompt('Informe o motivo da reabertura:');
    if (!motivo || !motivo.trim()) return;
    callApi('POST', '/api/v1/protocols/' + proto.id + '/reopen', { justificativa: motivo.trim() })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var arquivarProtocolo = function () {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/status', { status: 'ARQUIVADO' })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  // Muda a situação do protocolo e registra um andamento que o cidadão vê no
  // portal. `observacao` é o texto que ele lê.
  var alterarSituacao = function (destino, observacao) {
    setErro('');
    setShowMaisAcoes(false);
    callApi('POST', '/api/v1/protocols/' + proto.id + '/status', {
      status_operacional: destino,
      observacao: observacao,
      justificativa: observacao,
    })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var alterarPrioridade = function (novaPrioridade) {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/status', { prioridade: novaPrioridade })
      .then(function () { notificarAtualizacao(); })
      .catch(function () {});
  };

  var executarEncaminhamento = function () {
    if (!encaminhamento.setor_destino) return;
    setShowEncaminhar(false);
    callApi('POST', '/api/v1/protocols/' + proto.id + '/forward', encaminhamento)
      .then(function () {
        setEncaminhamento({ setor_destino: '', operador_destino: '', motivo: '', instrucoes: '', notificar_setor: true, notificar_cidadao: false });
        notificarAtualizacao();
      })
      .catch(function () {});
  };

  var criarPendencia = function () {
    if (!novaPendencia.titulo.trim()) return;
    setShowNovaPendencia(false);
    callApi('POST', '/api/v1/protocols/' + proto.id + '/pending-items', novaPendencia)
      .then(function () {
        setNovaPendencia({ tipo: 'documento', titulo: '', descricao: '', prazo: '', docs_esperados: '', instrucoes: '', suspender_prazo: false });
        carregarDetalhes();
      })
      .catch(function () {});
  };

  var resolverPendencia = function (id) {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/pending-items/' + id + '/resolve', {})
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var excluirPendencia = function (id) {
    if (!window.confirm('Remover esta pend\u00eancia?')) return;
    fetch('/api/v1/protocols/' + proto.id + '/pending-items/' + id, { method: 'DELETE', headers: authHeaders() })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var handleFileUpload = function (e) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingDoc(true);
    setErroDoc('');

    // O endpoint de upload é /documents/upload e espera o campo "arquivo",
    // um arquivo por requisição. Antes o envio ia para /documents (que só
    // aceita JSON) no campo "file", e falhava sem qualquer aviso na tela.
    var envios = Array.from(files).map(function (f) {
      var formData = new FormData();
      formData.append('arquivo', f);
      return fetch('/api/v1/protocols/' + proto.id + '/documents/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token() },
        body: formData,
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error(data.erro || ('Falha ao enviar ' + f.name));
          return data;
        });
      });
    });

    Promise.all(envios)
      .then(function () { carregarDetalhes(); })
      .catch(function (err) { setErroDoc(err.message); })
      .finally(function () {
        setUploadingDoc(false);
        if (e.target) e.target.value = '';
      });
  };

  // O download exige o cabeçalho de autorização, então não dá para apontar
  // um <a href> direto para a URL: buscamos o arquivo e salvamos o blob.
  var downloadDocumento = function (doc) {
    setErroDoc('');
    fetch('/api/v1/protocols/' + proto.id + '/documents/' + doc.id + '/download', {
      headers: { Authorization: 'Bearer ' + token() },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Não foi possível baixar o documento');
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = doc.nome_amigavel || 'documento';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(function (err) { setErroDoc(err.message); });
  };

  var visualizarDocumento = function (doc) {
    setErroDoc('');
    fetch('/api/v1/protocols/' + proto.id + '/documents/' + doc.id + '/download', {
      headers: { Authorization: 'Bearer ' + token() },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Não foi possível visualizar o documento');
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch(function (err) { setErroDoc(err.message); });
  };

  var alternarVisibilidadeDoc = function (doc) {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/documents/' + doc.id + '/visibility', { visivel_cidadao: !doc.visivel_cidadao })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var aprovarDoc = function (doc) {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/documents/' + doc.id + '/status', { status: 'APROVADO' })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var rejeitarDoc = function (doc) {
    callApi('POST', '/api/v1/protocols/' + proto.id + '/documents/' + doc.id + '/status', { status: 'REJEITADO' })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var adicionarRelacionamento = function () {
    if (!relacionamento.protocolo_id) return;
    setShowRelacionar(false);
    callApi('POST', '/api/v1/protocols/' + proto.id + '/relations', relacionamento)
      .then(function () {
        setRelacionamento({ protocolo_id: '', tipo: 'complementar' });
        carregarDetalhes();
      })
      .catch(function () {});
  };

  var removerRelacionamento = function (rel) {
    if (!window.confirm('Remover este v\u00ednculo?')) return;
    fetch('/api/v1/protocols/' + proto.id + '/relations/' + rel.id, { method: 'DELETE', headers: authHeaders() })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  // ====== ABA 1: VISÃO GERAL ======
  function AbaVisaoGeral() {
    var cidadao = proto.contato_nome || proto.cidadao_nome || proto.solicitante_nome;
    var temCidadao = !!cidadao;
    var unidadeInterna = proto.setor_solicitante_nome || proto.unidade_solicitante_nome;

    var slaStatus;
    if (proto.status_operacional === 'CONCLUIDO' || proto.status_operacional === 'CANCELADO') {
      slaStatus = 'done';
    } else if (proto.prazo_em) {
      var agora = Date.now();
      var prazo = new Date(proto.prazo_em).getTime();
      var diff = prazo - agora;
      if (diff < 0) slaStatus = 'breached';
      else if (diff < 24 * 60 * 60 * 1000) slaStatus = 'warning';
      else slaStatus = 'on_time';
    }

    var slaLabels = { on_time: 'No prazo', warning: 'Pr\u00f3ximo ao vencimento', breached: 'Vencido', done: 'Finalizado' };
    var slaColors = { on_time: T.success, warning: T.warning, breached: T.danger, done: T.textMuted };
    var slaBg = { on_time: T.successSoft, warning: T.warningSoft, breached: T.dangerSoft, done: T.surfaceMuted };

    var ultimosDocs = documentos.slice(0, 3);

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },

      // Status + Prioridade
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        React.createElement(BadgeStatus, { status: proto.status_operacional }),
        proto.status_operacional === 'PENDENTE' && proto.status_pendente_motivo && React.createElement('span', {
          style: { fontSize: 11, color: T.textSecondary },
        }, '\u2014 ' + proto.status_pendente_motivo),
        React.createElement(BadgePrioridade, { prioridade: proto.prioridade }),
        slaStatus && React.createElement('span', {
          style: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: slaColors[slaStatus], background: slaBg[slaStatus], marginLeft: 'auto' },
        },
          React.createElement(Clock, { size: 11 }),
          'SLA: ' + slaLabels[slaStatus],
        ),
      ),

      // Assunto
      proto.assunto && React.createElement('div', {
        style: { fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3 },
      }, proto.assunto),

      // Descrição
      proto.descricao && React.createElement('div', {
        style: { fontSize: 13, color: T.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
      }, proto.descricao),

      // Seção: Informações do Protocolo
      React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
        React.createElement(SectionTitle, { text: 'Informa\u00e7\u00f5es do Protocolo' }),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
          React.createElement(CampoSimples, { rotulo: 'Servi\u00e7o', valor: proto.servico_nome || proto.categoria_nome }),
          React.createElement(CampoSimples, { rotulo: 'Categoria', valor: proto.categoria_nome || proto.assunto_categoria }),
          React.createElement(CampoSimples, { rotulo: 'Acesso', valor: proto.nivel_acesso === 'PUBLICO' ? 'P\u00fablico' : proto.nivel_acesso === 'RESTRITO' ? 'Restrito' : proto.nivel_acesso === 'SIGILOSO' ? 'Sigiloso' : (proto.nivel_acesso || '\u2014') }),
          React.createElement(CampoSimples, { rotulo: 'Origem', valor: proto.origem || proto.canal_origem }),
          React.createElement(CampoSimples, { rotulo: 'Aberto em', valor: formatarDataHora(proto.aberto_em || proto.criado_em) }),
          React.createElement(CampoSimples, { rotulo: '\u00daltima movimenta\u00e7\u00e3o', valor: formatarDataHora(proto.ultima_movimentacao_em || proto.atualizado_em) }),
          React.createElement(CampoSimples, { rotulo: 'Prazo', valor: proto.prazo_em ? formatarDataHora(proto.prazo_em) : 'Sem prazo definido' }),
          React.createElement(CampoSimples, { rotulo: 'Setor atual', valor: proto.setor_atual_nome || proto.departamento_nome }),
          React.createElement(CampoSimples, { rotulo: 'Respons\u00e1vel', valor: proto.responsavel_nome || proto.operador_nome || 'N\u00e3o atribu\u00eddo' }),
        ),
      ),

      // Seção: Solicitante
      React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
        React.createElement(SectionTitle, { text: temCidadao ? 'Dados do Solicitante' : 'Solicitante' }),
        temCidadao
          ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              React.createElement(CampoInfo, { Icone: User, rotulo: 'Nome', valor: cidadao }),
              proto.cidadao_nome_social && React.createElement(CampoInfo, { Icone: User, rotulo: 'Nome social', valor: proto.cidadao_nome_social }),
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                React.createElement(CampoInfo, { Icone: Hash, rotulo: 'CPF', valor: proto.contato_cpf || proto.cidadao_cpf, maskCPF: true }),
                proto.cidadao_cnpj && React.createElement(CampoInfo, { Icone: Hash, rotulo: 'CNPJ', valor: proto.cidadao_cnpj }),
              ),
              proto.contato_telefone && React.createElement(CampoInfo, { Icone: Phone, rotulo: 'Telefone', valor: proto.contato_telefone }),
              proto.contato_email && React.createElement(CampoInfo, { Icone: AtSign, rotulo: 'E-mail', valor: proto.contato_email }),
            )
          : unidadeInterna
            ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                React.createElement('div', {
                  style: { padding: '8px 12px', borderRadius: T.radiusSm, background: T.primarySoft, fontSize: 12, color: T.primaryOnSoft, fontWeight: 600 },
                }, 'Protocolo interno'),
                React.createElement(CampoInfo, { Icone: Building2, rotulo: 'Unidade solicitante', valor: unidadeInterna }),
                proto.setor_solicitante_secretaria && React.createElement(CampoInfo, { Icone: Building2, rotulo: 'Secretaria', valor: proto.setor_solicitante_secretaria }),
                proto.solicitante_nome && React.createElement(CampoInfo, { Icone: User, rotulo: 'Servidor solicitante', valor: proto.solicitante_nome }),
              )
            : React.createElement('div', {
                style: { padding: '10px 12px', borderRadius: T.radiusSm, background: T.warningSoft, fontSize: 12, color: T.warning, display: 'flex', alignItems: 'center', gap: 8 },
              },
                React.createElement(AlertTriangle, { size: 14 }),
                'Protocolo externo sem dados do cidad\u00e3o \u2014 poss\u00edvel inconsist\u00eancia nos dados.',
              ),
      ),

      // Tags
      (proto.tags && proto.tags.length > 0) && React.createElement('div', null,
        React.createElement(SectionTitle, { text: 'Tags' }),
        React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
          proto.tags.map(function (t) {
            return React.createElement('span', {
              key: t,
              style: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10.5, background: T.surfaceMuted, color: T.textSecondary, fontWeight: 500 },
            }, React.createElement(Tag, { size: 10 }), t);
          }),
        ),
      ),

      // Pendências ativas
      (pendencias && pendencias.length > 0) && React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
        React.createElement(SectionTitle, { text: 'Pend\u00eancias ativas (' + pendencias.filter(function (p) { return p.status === 'pendente'; }).length + ')' }),
        pendencias.filter(function (p) { return p.status === 'pendente'; }).slice(0, 5).map(function (p) {
          return React.createElement('div', {
            key: p.id,
            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: T.radiusSm, background: T.warningSoft, marginBottom: 4, fontSize: 12 },
          },
            React.createElement(AlertCircle, { size: 13, style: { color: T.warning, flexShrink: 0 } }),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { color: T.text, fontWeight: 600 } }, p.titulo),
              p.descricao && React.createElement('div', { style: { color: T.textSecondary, marginTop: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.descricao),
            ),
            p.prazo_em && React.createElement('span', { style: { fontSize: 10.5, color: T.textMuted, whiteSpace: 'nowrap' } }, 'At\u00e9 ' + formatarData(p.prazo_em)),
          );
        }),
      ),

      // Documentos recentes
      (ultimosDocs && ultimosDocs.length > 0) && React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
        React.createElement(SectionTitle, { text: '\u00daltimos documentos (' + documentos.length + ')' }),
        ultimosDocs.map(function (d) {
          return React.createElement('div', {
            key: d.id,
            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: T.radiusSm, background: T.surfaceAlt, marginBottom: 4 },
          },
            React.createElement(Paperclip, { size: 14, style: { color: T.primary, flexShrink: 0 } }),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.nome_amigavel || d.nome),
              React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted } }, formatarBytes(d.tamanho_bytes) + (d.tipo ? ' \u00b7 ' + d.tipo : '') + (d.enviado_por_nome ? ' \u00b7 ' + d.enviado_por_nome : '')),
            ),
            d.visivel_cidadao ? React.createElement(Unlock, { size: 10, style: { color: T.success } }) : React.createElement(Lock, { size: 10, style: { color: T.textMuted } }),
          );
        }),
      ),
    );
  }

  // ====== ABA 2: MENSAGENS ======
  function AbaMensagens() {
    var canalAtual = CANAIS_ENVIO.find(function (c) { return c.id === canalMsg; }) || CANAIS_ENVIO[0];

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      React.createElement('div', { style: { flex: 1, overflowY: 'auto', paddingBottom: 12 } },
        mensagens.length === 0
          ? React.createElement('div', { style: { textAlign: 'center', padding: 30, color: T.textMuted, fontSize: 12.5 } },
              React.createElement(MessageSquare, { size: 32, style: { display: 'block', margin: '0 auto 12px', opacity: 0.4 } }),
              'Nenhuma mensagem registrada',
            )
          : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              mensagens.map(function (m) {
                var canalIcon;
                switch (m.canal) {
                  case 'whatsapp': canalIcon = React.createElement(MessageCircle, { size: 10 }); break;
                  case 'email': canalIcon = React.createElement(AtSign, { size: 10 }); break;
                  case 'portal': canalIcon = React.createElement(Globe, { size: 10 }); break;
                  default: canalIcon = null;
                }
                var isEntrada = m.direcao === 'entrada';
                var bg = isEntrada ? T.surfaceAlt : T.primarySoft;
                var align = isEntrada ? 'flex-start' : 'flex-end';
                return React.createElement('div', {
                  key: m.id,
                  style: {
                    display: 'flex', flexDirection: 'column',
                    alignSelf: align, maxWidth: '88%',
                  },
                },
                  React.createElement('div', {
                    style: {
                      padding: '9px 13px', borderRadius: T.radiusSm, fontSize: 12.5,
                      background: bg, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      borderBottomLeftRadius: isEntrada ? 2 : T.radiusSm,
                      borderBottomRightRadius: isEntrada ? T.radiusSm : 2,
                    },
                  },
                    React.createElement('div', { style: { color: T.text } }, m.conteudo),
                  ),
                  React.createElement('div', {
                    style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.textMuted, marginTop: 3, paddingLeft: isEntrada ? 4 : 0, paddingRight: isEntrada ? 0 : 4, alignSelf: align === 'flex-end' ? 'flex-end' : 'flex-start' },
                  },
                    canalIcon,
                    formatarDataHora(m.criado_em),
                    m.autor_nome ? ' \u00b7 ' + m.autor_nome : (m.operador_nome ? ' \u00b7 ' + m.operador_nome : ''),
                  ),
                );
              }),
            ),
      ),

      // Input mensagem pública
      React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 10 } },
        React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 6 } },
          CANAIS_ENVIO.map(function (c) {
            var ativo = canalMsg === c.id;
            return React.createElement('button', {
              key: c.id,
              onClick: function () { setCanalMsg(c.id); },
              title: c.label,
              style: {
                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 999,
                border: '1px solid ' + (ativo ? T.primary : T.borderStrong),
                background: ativo ? T.primarySoft : 'transparent',
                color: ativo ? T.primary : T.textMuted,
                fontSize: 10.5, fontWeight: ativo ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
              },
            }, React.createElement(c.icon, { size: 11 }), c.label);
          }),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 6 } },
          React.createElement('input', {
            value: textoMsg, onChange: function (e) { setTextoMsg(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } },
            placeholder: 'Mensagem vis\u00edvel ao cidad\u00e3o...',
            style: { ...inputBaseStyle, flex: 1, margin: 0 },
          }),
          React.createElement('button', {
            onClick: enviarMensagem, disabled: enviandoMsg || !textoMsg.trim(),
            'aria-label': enviandoMsg ? 'Enviando mensagem' : 'Enviar mensagem',
            style: { ...btnBaseStyle, padding: '8px 14px', background: (enviandoMsg || !textoMsg.trim()) ? T.surfaceMuted : T.primary, color: '#fff', cursor: (enviandoMsg || !textoMsg.trim()) ? 'default' : 'pointer' },
          }, enviandoMsg ? React.createElement(Loader2, { size: 14 }) : React.createElement(Send, { size: 14 })),
        ),
      ),

      // Separador
      React.createElement('div', { style: { margin: '16px 0 8px', borderTop: '2px dashed ' + T.borderStrong } }),

      // Anotação interna
      React.createElement('div', { style: { paddingTop: 4 } },
        React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: T.warning, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 } },
          React.createElement(AlertCircle, { size: 12 }),
          'Anota\u00e7\u00e3o interna (n\u00e3o vis\u00edvel ao cidad\u00e3o)',
        ),
        React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 6 } },
          React.createElement('input', {
            value: textoAnotacao, onChange: function (e) { setTextoAnotacao(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarAnotacao(); } },
            placeholder: 'Registrar anota\u00e7\u00e3o interna...',
            style: { ...inputBaseStyle, flex: 1, margin: 0, border: '1px dashed ' + T.warning, background: T.warningSoft + '80' },
          }),
          React.createElement('button', {
            onClick: enviarAnotacao, disabled: enviandoAnot || !textoAnotacao.trim(),
            'aria-label': enviandoAnot ? 'Salvando anotação interna' : 'Salvar anotação interna',
            style: { ...btnBaseStyle, padding: '8px 14px', background: T.warningSoft, color: T.warning, border: '1px dashed ' + T.warning, cursor: (enviandoAnot || !textoAnotacao.trim()) ? 'default' : 'pointer' },
          }, enviandoAnot ? React.createElement(Loader2, { size: 14 }) : React.createElement(Send, { size: 13 })),
        ),
        React.createElement('div', { style: { fontSize: 10, color: T.textMuted } },
          'Esta anota\u00e7\u00e3o ser\u00e1 vis\u00edvel somente para servidores autorizados.',
        ),
      ),
    );
  }

  // ====== ABA 3: DOCUMENTOS ======
  function AbaDocumentos() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      erroDoc && React.createElement('div', {
        style: {
          padding: '8px 12px', borderRadius: T.radiusSm, marginBottom: 4,
          background: T.dangerSoft || 'rgba(220,38,38,0.10)',
          border: '1px solid ' + (T.danger || '#dc2626'),
          color: T.danger || '#dc2626', fontSize: 12,
        },
      }, erroDoc),

      // Área de upload
      React.createElement('div', {
        onClick: function () { if (fileInputRef.current) fileInputRef.current.click(); },
        style: {
          border: '2px dashed ' + T.borderStrong, borderRadius: T.radiusSm, padding: '20px',
          textAlign: 'center', cursor: 'pointer', background: T.surfaceAlt,
          transition: 'background 0.15s',
        },
        onMouseEnter: function (e) { e.currentTarget.style.background = T.border; },
        onMouseLeave: function (e) { e.currentTarget.style.background = T.surfaceAlt; },
      },
        React.createElement('input', {
          ref: fileInputRef,
          type: 'file', multiple: true,
          accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx',
          style: { display: 'none' },
          onChange: handleFileUpload,
        }),
        uploadingDoc
          ? React.createElement(Loader2, { size: 24, style: { color: T.textMuted } })
          : React.createElement('div', null,
              React.createElement(Upload, { size: 28, style: { color: T.textMuted, marginBottom: 8 } }),
              React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 } }, 'Arraste arquivos ou clique para fazer upload'),
              React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, 'PDF, JPG, PNG, DOC, DOCX, XLS, XLSX \u2014 at\u00e9 10MB'),
            ),
      ),

      // Lista de documentos
      documentos.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(Paperclip, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Nenhum documento anexado',
          )
        : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            // Cabeçalho da tabela
            React.createElement('div', {
              style: { display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 60px', gap: 6, padding: '6px 10px', fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' },
            },
              React.createElement('span', null, 'Nome / Enviado por'),
              React.createElement('span', null, 'Tamanho'),
              React.createElement('span', null, 'Status'),
              React.createElement('span', null, 'Visibilidade'),
              React.createElement('span', { style: { textAlign: 'right' } }, 'A\u00e7\u00f5es'),
            ),
            documentos.map(function (d) {
              return React.createElement('div', {
                key: d.id,
                style: {
                  display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 60px', gap: 6,
                  padding: '10px', borderRadius: T.radiusSm, background: T.surfaceAlt,
                  border: '1px solid ' + T.border, alignItems: 'center', fontSize: 12,
                },
              },
                React.createElement('div', { style: { minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.nome_amigavel || d.nome),
                  React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, marginTop: 1 } },
                    (d.enviado_por_nome || '\u2014') + ' \u00b7 ' + formatarDataHora(d.criado_em),
                  ),
                ),
                React.createElement('span', { style: { fontSize: 11, color: T.textSecondary } }, formatarBytes(d.tamanho_bytes)),
                React.createElement('span', { style: { fontSize: 10.5 } },
                  d.status === 'APROVADO'
                    ? React.createElement('span', { style: { color: T.success, fontWeight: 600 } }, 'Aprovado')
                    : d.status === 'REJEITADO'
                      ? React.createElement('span', { style: { color: T.danger, fontWeight: 600 } }, 'Rejeitado')
                      : React.createElement('span', { style: { color: T.textMuted } }, 'Pendente'),
                ),
                React.createElement(BadgeVisibilidade, { publico: d.visivel_cidadao }),
                React.createElement('div', { style: { display: 'flex', gap: 2, justifyContent: 'flex-end' } },
                  React.createElement('button', {
                    title: 'Visualizar', 'aria-label': 'Visualizar documento', onClick: function () { visualizarDocumento(d); },
                    style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.textMuted, fontSize: 11 },
                  }, React.createElement(Eye, { size: 14 })),
                  React.createElement('button', {
                    title: 'Baixar', 'aria-label': 'Baixar documento', onClick: function () { downloadDocumento(d); },
                    style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.textMuted, fontSize: 11 },
                  }, React.createElement(Download, { size: 14 })),
                  d.status !== 'APROVADO' && React.createElement('button', {
                    title: 'Aprovar', 'aria-label': 'Aprovar documento', onClick: function () { aprovarDoc(d); },
                    style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.success, fontSize: 11 },
                  }, React.createElement(Check, { size: 14 })),
                  d.status !== 'REJEITADO' && React.createElement('button', {
                    title: 'Rejeitar', 'aria-label': 'Rejeitar documento', onClick: function () { rejeitarDoc(d); },
                    style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.danger, fontSize: 11 },
                  }, React.createElement(X, { size: 14 })),
                  React.createElement('button', {
                    title: d.visivel_cidadao ? 'Tornar interno' : 'Liberar ao cidad\u00e3o',
                    'aria-label': d.visivel_cidadao ? 'Tornar documento interno' : 'Liberar documento ao cidadão',
                    onClick: function () { alternarVisibilidadeDoc(d); },
                    style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: d.visivel_cidadao ? T.warning : T.textMuted, fontSize: 11 },
                  }, d.visivel_cidadao ? React.createElement(Lock, { size: 14 }) : React.createElement(Unlock, { size: 14 })),
                ),
              );
            }),
          ),
    );
  }

  // ====== ABA 4: TRAMITAÇÕES ======
  function AbaTramitacoes() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('button', {
        onClick: function () { setShowEncaminhar(true); },
        style: { ...btnBaseStyle, background: T.primary, color: '#fff', alignSelf: 'flex-start' },
      }, React.createElement(ArrowRightLeft, { size: 14 }), 'Encaminhar protocolo'),

      tramitacoes.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(ArrowRightLeft, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Nenhuma tramita\u00e7\u00e3o registrada',
          )
        : React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
            tramitacoes.map(function (t, i, arr) {
              return React.createElement('div', { key: t.id, style: { display: 'flex', gap: 10 } },
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 } },
                  React.createElement('div', {
                    style: { width: 28, height: 28, borderRadius: '50%', background: T.primarySoft, color: T.primaryOnSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
                  }, React.createElement(ArrowRightLeft, { size: 14 })),
                  i < arr.length - 1 && React.createElement('div', { style: { width: 2, flex: 1, background: T.border, minHeight: 16 } }),
                ),
                React.createElement('div', { style: { paddingBottom: 14, minWidth: 0, flex: 1 } },
                  React.createElement('div', { style: { fontSize: 12.5, fontWeight: 600, color: T.text } },
                    (t.setor_origem_nome || 'Protocolo') + ' \u2192 ' + (t.setor_destino_nome || 'Setor de destino'),
                  ),
                  t.observacao && React.createElement('div', { style: { fontSize: 11.5, color: T.textSecondary, marginTop: 3, lineHeight: 1.4 } }, t.observacao),
                  React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, marginTop: 4 } },
                    formatarDataHora(t.criado_em),
                    t.operador_nome ? ' \u00b7 Por: ' + t.operador_nome : '',
                    t.operador_destino_nome ? ' \u00b7 Para: ' + t.operador_destino_nome : '',
                  ),
                ),
              );
            }),
          ),

      // Modal de encaminhamento
      showEncaminhar && React.createElement('div', {
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
        onClick: function (e) { if (e.target === e.currentTarget) setShowEncaminhar(false); },
      },
        React.createElement('div', {
          style: { width: 400, maxHeight: '80vh', overflowY: 'auto', background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
            React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Encaminhar protocolo'),
            React.createElement('button', { onClick: function () { setShowEncaminhar(false); }, 'aria-label': 'Fechar encaminhamento', style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.textMuted } }, React.createElement(X, { size: 16 })),
          ),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement(InputLabel, { label: 'Setor de destino', required: true },
              React.createElement('input', {
                value: encaminhamento.setor_destino, placeholder: 'Nome do setor...',
                onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { setor_destino: e.target.value })); },
                style: inputBaseStyle,
              }),
            ),
            React.createElement(InputLabel, { label: 'Operador de destino (opcional)' },
              React.createElement('input', {
                value: encaminhamento.operador_destino, placeholder: 'Nome do operador...',
                onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { operador_destino: e.target.value })); },
                style: inputBaseStyle,
              }),
            ),
            React.createElement(InputLabel, { label: 'Motivo do encaminhamento' },
              React.createElement('textarea', {
                value: encaminhamento.motivo, placeholder: 'Descreva o motivo...', rows: 2,
                onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { motivo: e.target.value })); },
                style: { ...inputBaseStyle, resize: 'vertical' },
              }),
            ),
            React.createElement(InputLabel, { label: 'Instru\u00e7\u00f5es adicionais' },
              React.createElement('textarea', {
                value: encaminhamento.instrucoes, placeholder: 'Instru\u00e7\u00f5es para o setor de destino...', rows: 2,
                onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { instrucoes: e.target.value })); },
                style: { ...inputBaseStyle, resize: 'vertical' },
              }),
            ),
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' } },
              React.createElement('input', {
                type: 'checkbox', checked: encaminhamento.notificar_setor,
                onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { notificar_setor: e.target.checked })); },
              }),
              'Notificar setor de destino',
            ),
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' } },
              React.createElement('input', {
                type: 'checkbox', checked: encaminhamento.notificar_cidadao,
                onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { notificar_cidadao: e.target.checked })); },
              }),
              'Notificar cidad\u00e3o',
            ),
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
            React.createElement('button', {
              onClick: function () { setShowEncaminhar(false); },
              style: { ...btnBaseStyle, background: T.surfaceMuted, color: T.text },
            }, 'Cancelar'),
            React.createElement('button', {
              onClick: executarEncaminhamento, disabled: !encaminhamento.setor_destino,
              style: { ...btnBaseStyle, background: T.primary, color: '#fff', opacity: encaminhamento.setor_destino ? 1 : 0.6 },
            }, 'Encaminhar'),
          ),
        ),
      ),
    );
  }

  // ====== ABA 5: PENDÊNCIAS ======
  function AbaPendencias() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('button', {
        onClick: function () { setShowNovaPendencia(true); },
        style: { ...btnBaseStyle, background: T.primary, color: '#fff', alignSelf: 'flex-start' },
      }, React.createElement(Plus, { size: 14 }), 'Solicitar ao cidad\u00e3o'),

      pendencias.length === 0 && !showNovaPendencia
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(AlertCircle, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Nenhuma pend\u00eancia registrada',
          )
        : pendencias.map(function (p) {
            var resolved = p.status !== 'pendente';
            return React.createElement('div', {
              key: p.id,
              style: {
                padding: '12px 14px', borderRadius: T.radiusSm,
                background: resolved ? T.surfaceAlt : T.warningSoft,
                border: '1px solid ' + (resolved ? T.border : T.warning),
                opacity: resolved ? 0.7 : 1,
              },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                    React.createElement('span', {
                      style: { display: 'inline-flex', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: resolved ? T.textMuted : T.warning, background: resolved ? T.surfaceMuted : 'transparent', border: resolved ? 'none' : '1px solid ' + T.warning },
                    }, p.tipo || 'Pend\u00eancia'),
                    p.prazo_em && React.createElement('span', { style: { fontSize: 10.5, color: T.textMuted } }, 'At\u00e9 ' + formatarData(p.prazo_em)),
                    resolved && React.createElement('span', { style: { fontSize: 10.5, color: T.success, fontWeight: 600 } }, '\u2713 Resolvida'),
                  ),
                  React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, p.titulo),
                  p.descricao && React.createElement('div', { style: { fontSize: 12, color: T.textSecondary, marginTop: 3, lineHeight: 1.4 } }, p.descricao),
                  React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, marginTop: 4 } },
                    'Criada por ' + (p.criado_por_nome || '\u2014') + ' \u00b7 ' + formatarDataHora(p.criado_em),
                    p.resolvido_em ? ' \u00b7 Resolvida em ' + formatarDataHora(p.resolvido_em) : '',
                  ),
                ),
                !resolved && React.createElement('div', { style: { display: 'flex', gap: 4, flexShrink: 0 } },
                  React.createElement('button', {
                    title: 'Marcar como resolvida', 'aria-label': 'Marcar pendência como resolvida', onClick: function () { resolverPendencia(p.id); },
                    style: { ...btnBaseStyle, padding: '4px 8px', background: T.successSoft, color: T.success, fontSize: 10.5 },
                  }, React.createElement(Check, { size: 13 })),
                  React.createElement('button', {
                    title: 'Excluir', 'aria-label': 'Excluir pendência', onClick: function () { excluirPendencia(p.id); },
                    style: { ...btnBaseStyle, padding: '4px 8px', background: T.dangerSoft, color: T.danger, fontSize: 10.5 },
                  }, React.createElement(X, { size: 13 })),
                ),
              ),
            );
          }),

      // Modal nova pendência
      showNovaPendencia && React.createElement('div', {
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
        onClick: function (e) { if (e.target === e.currentTarget) setShowNovaPendencia(false); },
      },
        React.createElement('div', {
          style: { width: 420, maxHeight: '80vh', overflowY: 'auto', background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
            React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Nova solicita\u00e7\u00e3o ao cidad\u00e3o'),
            React.createElement('button', { onClick: function () { setShowNovaPendencia(false); }, 'aria-label': 'Fechar nova solicitação', style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.textMuted } }, React.createElement(X, { size: 16 })),
          ),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement(InputLabel, { label: 'Tipo de solicita\u00e7\u00e3o' },
              React.createElement('select', {
                value: novaPendencia.tipo,
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { tipo: e.target.value })); },
                style: { ...inputBaseStyle },
              }, TIPOS_PENDENCIA.map(function (tp) {
                return React.createElement('option', { key: tp.id, value: tp.id }, tp.label);
              })),
            ),
            React.createElement(InputLabel, { label: 'T\u00edtulo', required: true },
              React.createElement('input', {
                value: novaPendencia.titulo, placeholder: 'Ex: Enviar comprovante de resid\u00eancia...',
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { titulo: e.target.value })); },
                style: inputBaseStyle,
              }),
            ),
            React.createElement(InputLabel, { label: 'Descri\u00e7\u00e3o' },
              React.createElement('textarea', {
                value: novaPendencia.descricao, placeholder: 'Descreva o que \u00e9 necess\u00e1rio...', rows: 2,
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { descricao: e.target.value })); },
                style: { ...inputBaseStyle, resize: 'vertical' },
              }),
            ),
            React.createElement(InputLabel, { label: 'Prazo limite' },
              React.createElement('input', {
                type: 'date', value: novaPendencia.prazo,
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { prazo: e.target.value })); },
                style: inputBaseStyle,
              }),
            ),
            React.createElement(InputLabel, { label: 'Documentos esperados' },
              React.createElement('input', {
                value: novaPendencia.docs_esperados, placeholder: 'Ex: RG, CPF, comprovante...',
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { docs_esperados: e.target.value })); },
                style: inputBaseStyle,
              }),
            ),
            React.createElement(InputLabel, { label: 'Instru\u00e7\u00f5es para o cidad\u00e3o' },
              React.createElement('textarea', {
                value: novaPendencia.instrucoes, placeholder: 'Orienta\u00e7\u00f5es de como proceder...', rows: 2,
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { instrucoes: e.target.value })); },
                style: { ...inputBaseStyle, resize: 'vertical' },
              }),
            ),
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' } },
              React.createElement('input', {
                type: 'checkbox', checked: novaPendencia.suspender_prazo,
                onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { suspender_prazo: e.target.checked })); },
              }),
              'Suspender prazo interno do protocolo at\u00e9 resposta',
            ),
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
            React.createElement('button', {
              onClick: function () { setShowNovaPendencia(false); },
              style: { ...btnBaseStyle, background: T.surfaceMuted, color: T.text },
            }, 'Cancelar'),
            React.createElement('button', {
              onClick: criarPendencia, disabled: !novaPendencia.titulo.trim(),
              style: { ...btnBaseStyle, background: T.primary, color: '#fff', opacity: novaPendencia.titulo.trim() ? 1 : 0.6 },
            }, 'Criar solicita\u00e7\u00e3o'),
          ),
        ),
      ),
    );
  }

  // ====== ABA 6: HISTÓRICO ======
  function AbaHistorico() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
      historico.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(History, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Sem eventos registrados',
          )
        : historico.map(function (evt, i, arr) {
            var IconeEvt = ICONES_EVENTO[evt.tipo] || Info;
            var isExpanded = expandirEvento === evt.id;
            return React.createElement('div', { key: evt.id, style: { display: 'flex', gap: 10 } },
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 } },
                React.createElement('div', {
                  style: { width: 28, height: 28, borderRadius: '50%', background: T.primarySoft, color: T.primaryOnSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
                }, React.createElement(IconeEvt, { size: 14 })),
                i < arr.length - 1 && React.createElement('div', { style: { width: 2, flex: 1, background: T.border, minHeight: 18 } }),
              ),
              React.createElement('div', { style: { paddingBottom: 14, minWidth: 0, flex: 1, cursor: evt.detalhes ? 'pointer' : 'default' }, onClick: evt.detalhes ? function () { setExpandirEvento(isExpanded ? null : evt.id); } : undefined },
                React.createElement('div', { style: { fontSize: 12.5, fontWeight: 600, color: T.text } },
                  evt.descricao || evt.acao || evt.tipo,
                ),
                React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, marginTop: 2 } },
                  formatarDataHora(evt.criado_em),
                  evt.usuario_nome ? ' \u00b7 ' + evt.usuario_nome : (evt.operador_nome ? ' \u00b7 ' + evt.operador_nome : ''),
                  evt.setor_nome ? ' \u00b7 ' + evt.setor_nome : '',
                ),
                isExpanded && evt.detalhes && React.createElement('div', {
                  style: { marginTop: 6, padding: '8px 12px', borderRadius: T.radiusSm, background: T.surfaceAlt, fontSize: 11.5, color: T.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.4 },
                }, typeof evt.detalhes === 'string' ? evt.detalhes : JSON.stringify(evt.detalhes, null, 2)),
              ),
            );
          }),
    );
  }

  // ====== ABA 7: SOLICITANTE ======
   function AbaSolicitante() {
    var cidadao = proto.contato_nome || proto.cidadao_nome || proto.solicitante_nome;
    var temCidadao = !!cidadao;
    var unidadeInterna = proto.setor_solicitante_nome || proto.unidade_solicitante_nome;
    var [editando, setEditando] = useState(false);
    var [editNome, setEditNome] = useState('');
    var [editTelefone, setEditTelefone] = useState('');
    var [editEmail, setEditEmail] = useState('');
    var [editCpf, setEditCpf] = useState('');
    var [editSalvando, setEditSalvando] = useState(false);

    function iniciarEdicao() {
      setEditNome(cidadao || '');
      setEditTelefone(proto.contato_telefone || '');
      setEditEmail(proto.contato_email || '');
      setEditCpf(proto.contato_cpf || proto.cidadao_cpf || '');
      setEditando(true);
    }

    function salvarEdicao() {
      var cidadaoId = proto.cidadao_id || proto.cidadaoId;
      if (!cidadaoId) return;
      setEditSalvando(true);
      var token = (function () { try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return null; } })();
      fetch('/api/v1/admin/protocols/citizens/' + cidadaoId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ nome: editNome, telefone: editTelefone, email: editEmail, cpf: editCpf }),
      }).then(function (r) { return r.json(); })
        .then(function () { setEditando(false); if (onAtualizado) onAtualizado(); })
        .catch(function () {})
        .finally(function () { setEditSalvando(false); });
    }

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
      editando
        ? React.createElement('div', { style: { padding: 16, borderRadius: T.radiusSm, background: T.surfaceAlt, border: '1px solid ' + T.primary } },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.primary, marginBottom: 12 } }, 'Editando dados do cidad\u00e3o'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              React.createElement('label', { style: labelStyle }, 'Nome'),
              React.createElement('input', { value: editNome, onChange: function (e) { setEditNome(e.target.value); }, style: inputBase(), placeholder: 'Nome completo' }),
              React.createElement('label', { style: labelStyle }, 'Telefone'),
              React.createElement('input', { value: editTelefone, onChange: function (e) { setEditTelefone(e.target.value); }, style: inputBase(), placeholder: 'DDD + número' }),
              React.createElement('label', { style: labelStyle }, 'E-mail'),
              React.createElement('input', { value: editEmail, onChange: function (e) { setEditEmail(e.target.value); }, style: inputBase(), placeholder: 'email@exemplo.com' }),
              React.createElement('label', { style: labelStyle }, 'CPF'),
              React.createElement('input', { value: editCpf, onChange: function (e) { setEditCpf(e.target.value); }, style: inputBase(), placeholder: '000.000.000-00' }),
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 12 } },
              React.createElement('button', {
                onClick: function () { setEditando(false); },
                style: { padding: '8px 14px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong, background: T.surface, color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
              }, 'Cancelar'),
              React.createElement('button', {
                onClick: salvarEdicao, disabled: editSalvando,
                style: { padding: '8px 14px', borderRadius: T.radiusSm, border: 'none', background: editSalvando ? T.surfaceMuted : T.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: editSalvando ? 'default' : 'pointer' },
              }, editSalvando ? 'Salvando...' : 'Salvar'),
            ),
          )
        : temCidadao
        ? React.createElement('div', { style: { padding: 16, borderRadius: T.radiusSm, background: T.surfaceAlt, border: '1px solid ' + T.border } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 } },
              React.createElement('div', {
                style: { width: 48, height: 48, borderRadius: '50%', background: T.primarySoft, color: T.primaryOnSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 },
              }, (cidadao || '').charAt(0).toUpperCase()),
              React.createElement('div', { style: { minWidth: 0 } },
                React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text } }, cidadao),
                proto.cidadao_nome_social && React.createElement('div', { style: { fontSize: 12, color: T.textSecondary } }, 'Nome social: ' + proto.cidadao_nome_social),
              ),
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
              React.createElement(CampoSimples, { rotulo: 'CPF', valor: maskCPF(proto.contato_cpf || proto.cidadao_cpf || '') }),
              proto.cidadao_cnpj && React.createElement(CampoSimples, { rotulo: 'CNPJ', valor: proto.cidadao_cnpj }),
              proto.contato_telefone && React.createElement(CampoSimples, { rotulo: 'Telefone', valor: proto.contato_telefone }),
              proto.contato_email && React.createElement(CampoSimples, { rotulo: 'E-mail', valor: proto.contato_email }),
            ),
            (proto.cidadao_endereco || proto.contato_logradouro) && React.createElement('div', { style: { marginTop: 12, borderTop: '1px solid ' + T.border, paddingTop: 12 } },
              React.createElement(SectionTitle, { text: 'Endere\u00e7o' }),
              React.createElement('div', { style: { fontSize: 12.5, color: T.text } },
                [proto.cidadao_endereco || proto.contato_logradouro, proto.cidadao_numero || proto.contato_numero, proto.cidadao_bairro, proto.cidadao_cidade, proto.cidadao_uf].filter(Boolean).join(', ') || '\u2014',
              ),
            ),
            proto.cidadao_id && React.createElement('div', { style: { marginTop: 12, borderTop: '1px solid ' + T.border, paddingTop: 12, display: 'flex', gap: 8 } },
              React.createElement('button', {
                onClick: iniciarEdicao,
                style: { ...btnBaseStyle, background: T.primarySoft, color: T.primaryOnSoft, fontSize: 11 },
              }, React.createElement(Edit, { size: 12 }), 'Editar dados'),
              React.createElement('button', {
                onClick: function () {},
                style: { ...btnBaseStyle, background: T.surfaceMuted, color: T.text, fontSize: 11 },
              }, React.createElement(ExternalLink, { size: 12 }), 'Ver todos os protocolos deste cidad\u00e3o'),
            ),
          )
        : unidadeInterna
          ? React.createElement('div', { style: { padding: 16, borderRadius: T.radiusSm, background: T.primarySoft, border: '1px solid ' + T.primary } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 } },
                React.createElement(Building2, { size: 24, style: { color: T.primary } }),
                React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.primary } }, 'Protocolo interno'),
              ),
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
                React.createElement(CampoSimples, { rotulo: 'Unidade solicitante', valor: unidadeInterna }),
                proto.setor_solicitante_secretaria && React.createElement(CampoSimples, { rotulo: 'Secretaria', valor: proto.setor_solicitante_secretaria }),
                proto.solicitante_nome && React.createElement(CampoSimples, { rotulo: 'Servidor solicitante', valor: proto.solicitante_nome }),
                proto.solicitante_matricula && React.createElement(CampoSimples, { rotulo: 'Matr\u00edcula', valor: proto.solicitante_matricula }),
              ),
            )
          : React.createElement('div', {
              style: { padding: '12px 14px', borderRadius: T.radiusSm, background: T.warningSoft, fontSize: 12, color: T.warning, display: 'flex', alignItems: 'center', gap: 8 },
            },
              React.createElement(AlertTriangle, { size: 14 }),
              'Protocolo externo sem dados do cidad\u00e3o \u2014 poss\u00edvel inconsist\u00eancia nos dados.',
            ),

      // Histórico de contato
      proto.historico_contato && proto.historico_contato.length > 0 && React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
        React.createElement(SectionTitle, { text: 'Hist\u00f3rico de contato recente' }),
        proto.historico_contato.slice(0, 5).map(function (c, i) {
          return React.createElement('div', {
            key: i,
            style: { padding: '8px 10px', borderRadius: T.radiusSm, background: T.surfaceAlt, marginBottom: 4, fontSize: 12, color: T.text },
          },
            React.createElement(MessageCircle, { size: 11, style: { color: T.textMuted, marginRight: 6, display: 'inline', verticalAlign: 'middle' } }),
            formatarDataHora(c.data) + ' \u00b7 ' + (c.resumo || 'Contato registrado'),
          );
        }),
      ),
    );
  }

  // ====== ABA 8: RELACIONADOS ======
  function AbaRelacionados() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('button', {
        onClick: function () { setShowRelacionar(true); },
        style: { ...btnBaseStyle, background: T.primary, color: '#fff', alignSelf: 'flex-start' },
      }, React.createElement(Link2, { size: 14 }), 'Vincular protocolo'),

      relacionados.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(Link2, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Nenhum protocolo relacionado',
          )
        : relacionados.map(function (r) {
            var tipoLabel = (TIPOS_RELACAO.find(function (t) { return t.id === r.tipo; }) || {}).label || r.tipo;
            return React.createElement('div', {
              key: r.id,
              style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: T.radiusSm, background: T.surfaceAlt, border: '1px solid ' + T.border },
            },
              React.createElement(Link2, { size: 16, style: { color: T.primary, flexShrink: 0 } }),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  React.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: T.text, fontFamily: 'monospace' } }, r.protocolo_numero || r.protocolo_id),
                  React.createElement(BadgeStatus, { status: r.protocolo_status }),
                ),
                React.createElement('div', { style: { fontSize: 12, color: T.textSecondary, marginTop: 2 } }, r.protocolo_assunto || r.assunto),
              ),
              React.createElement('span', {
                style: { display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: T.surfaceMuted, color: T.textMuted, whiteSpace: 'nowrap' },
              }, tipoLabel),
              React.createElement('button', {
                title: 'Remover rela\u00e7\u00e3o',
                'aria-label': 'Remover relação entre protocolos',
                onClick: function () { removerRelacionamento(r); },
                style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.danger, fontSize: 11 },
              }, React.createElement(X, { size: 14 })),
            );
          }),

      showRelacionar && React.createElement('div', {
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
        onClick: function (e) { if (e.target === e.currentTarget) setShowRelacionar(false); },
      },
        React.createElement('div', {
          style: { width: 380, maxHeight: '80vh', overflowY: 'auto', background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
            React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Vincular protocolo'),
            React.createElement('button', { onClick: function () { setShowRelacionar(false); }, 'aria-label': 'Fechar vínculo de protocolo', style: { ...btnBaseStyle, padding: '4px 6px', background: 'transparent', color: T.textMuted } }, React.createElement(X, { size: 16 })),
          ),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement(InputLabel, { label: 'N\u00famero do protocolo', required: true },
              React.createElement('input', {
                value: relacionamento.protocolo_id, placeholder: 'Ex: PROTO-2024-0001...',
                onChange: function (e) { setRelacionamento(Object.assign({}, relacionamento, { protocolo_id: e.target.value })); },
                style: inputBaseStyle,
              }),
            ),
            React.createElement(InputLabel, { label: 'Tipo de rela\u00e7\u00e3o' },
              React.createElement('select', {
                value: relacionamento.tipo,
                onChange: function (e) { setRelacionamento(Object.assign({}, relacionamento, { tipo: e.target.value })); },
                style: inputBaseStyle,
              }, TIPOS_RELACAO.map(function (tp) {
                return React.createElement('option', { key: tp.id, value: tp.id }, tp.label);
              })),
            ),
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
            React.createElement('button', {
              onClick: function () { setShowRelacionar(false); },
              style: { ...btnBaseStyle, background: T.surfaceMuted, color: T.text },
            }, 'Cancelar'),
            React.createElement('button', {
              onClick: adicionarRelacionamento, disabled: !relacionamento.protocolo_id,
              style: { ...btnBaseStyle, background: T.primary, color: '#fff', opacity: relacionamento.protocolo_id ? 1 : 0.6 },
            }, 'Vincular'),
          ),
        ),
      ),
    );
  }

  // ====== ABA 9: AUDITORIA ======
  function AbaAuditoria() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
      auditoria.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(Shield, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Nenhum registro de auditoria',
          )
        : React.createElement('div', null,
            React.createElement('div', {
              style: { display: 'grid', gridTemplateColumns: '120px 80px 1fr 60px', gap: 6, padding: '6px 10px', fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid ' + T.border },
            },
              React.createElement('span', null, 'Data/Hora'),
              React.createElement('span', null, 'Usu\u00e1rio'),
              React.createElement('span', null, 'A\u00e7\u00e3o'),
              React.createElement('span', null, 'IP'),
            ),
            auditoria.map(function (a, i) {
              return React.createElement('div', {
                key: a.id || i,
                style: { display: 'grid', gridTemplateColumns: '120px 80px 1fr 60px', gap: 6, padding: '8px 10px', fontSize: 11, borderBottom: '1px solid ' + T.border, alignItems: 'center' },
              },
                React.createElement('span', { style: { color: T.text, fontSize: 10.5 } }, formatarDataHora(a.criado_em || a.data_hora)),
                React.createElement('span', { style: { color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.usuario_nome || '\u2014'),
                React.createElement('div', { style: { minWidth: 0 } },
                  React.createElement('span', { style: { color: T.text } }, a.acao || a.descricao || '\u2014'),
                  a.detalhes && React.createElement('span', { style: { color: T.textMuted, fontSize: 10, marginLeft: 6 } }, typeof a.detalhes === 'string' ? a.detalhes : JSON.stringify(a.detalhes)),
                ),
                React.createElement('span', { style: { color: T.textMuted, fontSize: 10, fontFamily: 'monospace' } }, a.ip || '\u2014'),
              );
            }),
          ),
    );
  }

  // ====== RENDER ======
  var mapaAbas = {
    visao_geral: AbaVisaoGeral,
    mensagens: AbaMensagens,
    documentos: AbaDocumentos,
    tramitacoes: AbaTramitacoes,
    pendencias: AbaPendencias,
    historico: AbaHistorico,
    solicitante: AbaSolicitante,
    relacionados: AbaRelacionados,
    auditoria: AbaAuditoria,
  };
  var AbaAtual = mapaAbas[aba];

  var abasVisiveis = ABAS;

  return React.createElement('div', {
    style: {
      width: 520, minWidth: 520, height: '100%', background: T.surface,
      borderLeft: '1px solid ' + T.border, display: 'flex', flexDirection: 'column', flexShrink: 0,
    },
  },
    // HEADER
    React.createElement('div', {
      style: { padding: '14px 16px', borderBottom: '1px solid ' + T.border, flexShrink: 0 },
    },
      // Linha 1: Protocolo + Status + Fechar
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
        React.createElement(FileText, { size: 18, style: { color: T.primary } }),
        React.createElement('span', {
          style: { fontSize: 15, fontWeight: 700, color: T.text, flex: 1, fontFamily: 'monospace' },
        }, proto.numero || proto.id || '\u2014'),
        React.createElement(BadgeStatus, { status: proto.status_operacional }),
        React.createElement(BadgePrioridade, { prioridade: proto.prioridade }),
        React.createElement('button', {
          onClick: onClose, 'aria-label': 'Fechar',
          style: { width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.surfaceMuted, color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, React.createElement(X, { size: 18 })),
      ),

      // Linha 2: Ações rápidas
      React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 } },
        React.createElement('button', {
          onClick: assumirProtocolo, title: 'Assumir protocolo',
          style: { ...btnBaseStyle, background: T.primarySoft, color: T.primaryOnSoft },
        }, React.createElement(Hand, { size: 13 }), 'Assumir'),
        React.createElement('button', {
          onClick: function () {}, title: 'Atribuir',
          style: { ...btnBaseStyle, background: T.surfaceAlt, color: T.textSecondary },
        }, React.createElement(UserPlus, { size: 13 }), 'Atribuir'),
        React.createElement('button', {
          onClick: function () { setShowEncaminhar(true); }, title: 'Encaminhar',
          style: { ...btnBaseStyle, background: T.surfaceAlt, color: T.textSecondary },
        }, React.createElement(ArrowRightLeft, { size: 13 }), 'Encaminhar'),
        React.createElement('button', {
          onClick: function () { setAba('mensagens'); }, title: 'Responder',
          style: { ...btnBaseStyle, background: T.surfaceAlt, color: T.textSecondary },
        }, React.createElement(MessageSquare, { size: 13 }), 'Responder'),
        // Só faz sentido enquanto o protocolo ainda não avançou: é o clique que
        // leva o cidadão de "Solicitação recebida" para "Em análise".
        (proto.status_operacional === 'ABERTO' || proto.status_operacional === 'PENDENTE')
          && React.createElement('button', {
            onClick: function () {
              alterarSituacao('EM_ANDAMENTO', 'Sua solicitação está em análise pelo setor responsável.');
            },
            title: 'Dar andamento (o cidadão passa a ver "Em análise")',
            style: { ...btnBaseStyle, background: T.primarySoft, color: T.primaryOnSoft },
          }, React.createElement(RefreshCw, { size: 13 }), 'Dar andamento'),
        React.createElement('button', {
          onClick: concluirProtocolo, title: 'Concluir',
          style: { ...btnBaseStyle, background: T.successSoft, color: T.success },
        }, React.createElement(CheckCircle, { size: 13 }), 'Concluir'),
        React.createElement('div', { style: { position: 'relative' }, ref: maisAcoesRef },
          React.createElement('button', {
            onClick: function () { setShowMaisAcoes(!showMaisAcoes); }, title: 'Mais a\u00e7\u00f5es',
            'aria-label': 'Mais ações do protocolo', 'aria-expanded': showMaisAcoes,
            style: { ...btnBaseStyle, background: T.surfaceAlt, color: T.textSecondary },
          }, React.createElement(MoreVertical, { size: 13 })),
          showMaisAcoes && React.createElement('div', {
            style: {
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: T.surface, border: '1px solid ' + T.border, borderRadius: T.radiusSm,
              padding: '4px 0', boxShadow: T.shadowMd, zIndex: 100, minWidth: 180,
            },
          },
            ActionMenuItem({ label: 'Aguardando cidadão', onClick: function () {
              alterarSituacao('PENDENTE', 'Aguardando uma resposta ou documento seu para prosseguir.');
            } }),
            ActionMenuItem({ label: 'Alterar prioridade', onClick: function () { alterarPrioridade('ALTA'); } }),
            ActionMenuItem({ label: 'Alterar prazo', onClick: function () {} }),
            ActionMenuItem({ label: 'Cancelar', onClick: cancelarProtocolo }),
            ActionMenuItem({ label: 'Arquivar', onClick: arquivarProtocolo }),
            ActionMenuItem({ label: 'Reabrir', onClick: reabrirProtocolo }),
          ),
        ),
      ),

      // Tabs
      React.createElement('div', { style: { display: 'flex', gap: 0, overflowX: 'auto' } },
        abasVisiveis.map(function (a) {
          var isActive = aba === a.id;
          return React.createElement('button', {
            key: a.id,
            onClick: function () { setAba(a.id); },
            title: a.label,
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px',
              border: 'none', background: 'transparent',
              color: isActive ? T.primary : T.textMuted,
              fontSize: 11.5, fontWeight: isActive ? 700 : 500,
              borderBottom: isActive ? '2px solid ' + T.primary : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            },
          }, React.createElement(a.Icone, { size: 12 }), a.label);
        }),
      ),
    ),

    // CONTEÚDO
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
      erro && React.createElement('div', {
        style: { padding: '10px 12px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 12.5, marginBottom: 12 },
      }, erro),
      carregando
        ? React.createElement('div', { style: { textAlign: 'center', padding: 60 } },
            React.createElement(Loader2, { size: 28, style: { color: T.textMuted } }),
            React.createElement('div', { style: { marginTop: 12, fontSize: 12.5, color: T.textMuted } }, 'Carregando...'),
          )
        : React.createElement(AbaAtual),
    ),
  );
}

function InputLabel(_a) {
  var label = _a.label, required = _a.required, children = _a.children;
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    React.createElement('div', { style: { fontSize: 11.5, fontWeight: 600, color: T.textSecondary } },
      label,
      required && React.createElement('span', { style: { color: T.danger, marginLeft: 2 } }, ' *'),
    ),
    children,
  );
}

function ActionMenuItem(_a) {
  var label = _a.label, onClick = _a.onClick;
  return React.createElement('button', {
    onClick: function () { onClick(); },
    style: {
      display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px',
      border: 'none', background: 'transparent', color: T.text, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    },
    onMouseEnter: function (e) { e.target.style.background = T.surfaceAlt; },
    onMouseLeave: function (e) { e.target.style.background = 'transparent'; },
  }, label);
}
