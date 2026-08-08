import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, MessageSquare, Paperclip, ArrowRightLeft, AlertCircle,
  History, User, Link2, Shield, Send, Loader2, Eye, Download, Clock,
  Tag, MoreVertical, Hand, UserPlus, CheckCircle, ChevronDown, Plus,
  Search, Info, Edit, Inbox, XCircle, Lock, Unlock, Check, Globe,
  MessageCircle, Phone, AtSign, AlertTriangle, Upload, Flag, RefreshCw,
  ExternalLink, MapPin, Hash, Building2, Calendar, FileImage, Copy,
  ArrowLeft, Users, Archive, ChevronRight, X,
} from 'lucide-react';
import { T } from '../theme';
import './PaginaProtocoloDetalhe.css';

var STATUS_PROT = {
  ABERTO: { label: 'Aberto', cor: T.warning, bg: T.warningSoft },
  EM_TRIAGEM: { label: 'Em triagem', cor: '#3B82F6', bg: '#DBEAFE' },
  DISTRIBUIDO: { label: 'Distribu\u00eddo', cor: '#7C3AED', bg: '#EDE9FE' },
  RECEBIDO: { label: 'Recebido', cor: '#0D9488', bg: '#CCFBF1' },
  EM_ANALISE: { label: 'Em an\u00e1lise', cor: T.primary, bg: T.primarySoft },
  EM_ANDAMENTO: { label: 'Em andamento', cor: T.primary, bg: T.primarySoft },
  AGUARDANDO_CIDADAO: { label: 'Aguardando cidad\u00e3o', cor: '#F59E0B', bg: '#FEF3C7' },
  PENDENTE: { label: 'Pendente', cor: '#F59E0B', bg: '#FEF3C7' },
  CONCLUIDO: { label: 'Conclu\u00eddo', cor: T.success, bg: T.successSoft },
  CANCELADO: { label: 'Cancelado', cor: T.danger, bg: T.dangerSoft },
  ARQUIVADO: { label: 'Arquivado', cor: '#6B7280', bg: '#F3F4F6' },
};

var PRIORIDADE_COR = { BAIXA: T.success, NORMAL: T.textMuted, ALTA: T.warning, URGENTE: T.danger };
var PRIORIDADE_LABEL = { BAIXA: 'Baixa', NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' };

var ORIGEM_LABEL = {
  whatsapp: 'WhatsApp', portal: 'Portal', presencial: 'Presencial',
  telefone: 'Telefone', email: 'E-mail', interno: 'Interno',
  app: 'App', api: 'API', assistente_virtual: 'Assistente',
};

var CANAIS_ENVIO = [
  { id: 'portal', label: 'Portal', Icone: Globe },
  { id: 'whatsapp', label: 'WhatsApp', Icone: MessageCircle },
  { id: 'email', label: 'E-mail', Icone: AtSign },
  { id: 'portal_whatsapp', label: 'Portal+WhatsApp', Icone: Send },
];

var ICONES_EVENTO = {
  criacao: FileText, edicao: Edit, atribuicao: UserPlus, encaminhamento: ArrowRightLeft,
  recebimento: Inbox, mudanca_status: RefreshCw, mudanca_prioridade: Flag,
  mudanca_prazo: Clock, mensagem: MessageSquare, documento: Paperclip,
  pendencia: AlertCircle, conclusao: CheckCircle, cancelamento: XCircle,
};

var ABAS = [
  { id: 'visao_geral', label: 'Vis\u00e3o Geral', Icone: FileText },
  { id: 'mensagens', label: 'Mensagens', Icone: MessageSquare },
  { id: 'documentos', label: 'Documentos', Icone: Paperclip },
  { id: 'tramitacoes', label: 'Tramita\u00e7\u00f5es', Icone: ArrowRightLeft },
  { id: 'pendencias', label: 'Pend\u00eancias', Icone: AlertCircle },
  { id: 'historico', label: 'Hist\u00f3rico', Icone: History },
];

var TIPOS_PENDENCIA = [
  { id: 'documento', label: 'Solicitar documento' },
  { id: 'informacao', label: 'Solicitar informa\u00e7\u00e3o' },
  { id: 'comparecimento', label: 'Solicitar comparecimento' },
  { id: 'assinatura', label: 'Solicitar assinatura' },
  { id: 'pagamento', label: 'Solicitar pagamento' },
  { id: 'outro', label: 'Outro' },
];

var TIPOS_RELACAO = [
  { id: 'principal', label: 'Principal' },
  { id: 'complementar', label: 'Complementar' },
  { id: 'resposta', label: 'Resposta' },
  { id: 'recurso', label: 'Recurso' },
  { id: 'renovacao', label: 'Renova\u00e7\u00e3o' },
  { id: 'duplicado', label: 'Duplicado' },
  { id: 'dependente', label: 'Dependente' },
  { id: 'desmembrado', label: 'Desmembrado' },
  { id: 'apensado', label: 'Apensado' },
];

function formatarDataHora(iso) {
  if (!iso) return '\u2014';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatarData(iso) {
  if (!iso) return '\u2014';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatarBytes(bytes) {
  if (!bytes) return '\u2014';
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

var btnBaseStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '7px 13px', borderRadius: T.radiusSm, border: 'none',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  transition: 'all 0.15s',
};

var inputBaseStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: T.radiusSm,
  border: '1px solid ' + T.borderStrong, fontSize: 13, color: T.text,
  background: T.surfaceAlt, outline: 'none', fontFamily: 'inherit',
};

function BadgeStatus(_a) {
  var status = _a.status;
  var info = STATUS_PROT[status] || { label: status || '\u2014', cor: T.textMuted, bg: T.surfaceMuted };
  return React.createElement('span', {
    style: { display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: info.cor, background: info.bg, whiteSpace: 'nowrap' },
  }, info.label);
}

function BadgePrioridade(_a) {
  var prioridade = _a.prioridade;
  var cor = PRIORIDADE_COR[prioridade] || T.textMuted;
  if (!prioridade || prioridade === 'NORMAL') return null;
  return React.createElement('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: cor, background: cor + '18', whiteSpace: 'nowrap' },
  }, React.createElement(AlertTriangle, { size: 10 }), PRIORIDADE_LABEL[prioridade] || prioridade);
}

function BadgeOrigem(_a) {
  var origem = _a.origem;
  if (!origem) return null;
  var label = ORIGEM_LABEL[origem] || origem;
  return React.createElement('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: T.surfaceMuted, color: T.textSecondary, whiteSpace: 'nowrap' },
  }, label);
}

function BadgeNivelAcesso(_a) {
  var nivel = _a.nivel;
  var label = nivel === 'PUBLICO' ? 'P\u00fablico' : nivel === 'RESTRITO' ? 'Restrito' : nivel === 'SIGILOSO' ? 'Sigiloso' : (nivel || '\u2014');
  var isPublico = nivel === 'PUBLICO';
  return React.createElement('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 4, color: isPublico ? T.success : T.textMuted, background: isPublico ? T.successSoft : T.surfaceMuted },
  }, isPublico ? React.createElement(Unlock, { size: 10 }) : React.createElement(Lock, { size: 10 }), label);
}

function SectionTitle(_a) {
  var text = _a.text, style = _a.style;
  return React.createElement('div', {
    style: Object.assign({ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }, style || {}),
  }, text);
}

function CampoInfo(_a) {
  var Icone = _a.Icone, rotulo = _a.rotulo, valor = _a.valor, maskCPF_campo = _a.maskCPF;
  var displayValor = maskCPF_campo && valor ? maskCPF(valor) : (valor || '\u2014');
  return React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 } },
    Icone && React.createElement(Icone, { size: 13, style: { color: T.textMuted, marginTop: 2, flexShrink: 0 } }),
    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
      React.createElement('div', { style: { fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 } }, rotulo),
      React.createElement('div', {
        style: { fontSize: 12.5, color: T.text, fontWeight: 600, wordBreak: 'break-word', fontFamily: maskCPF_campo ? 'monospace' : 'inherit' },
      }, displayValor),
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
  var label = _a.label, Icone = _a.Icone, onClick = _a.onClick;
  return React.createElement('button', {
    onClick: function () { onClick(); },
    style: {
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
      padding: '8px 14px', border: 'none', background: 'transparent', color: T.text,
      fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    },
    onMouseEnter: function (e) { e.target.style.background = T.surfaceAlt; },
    onMouseLeave: function (e) { e.target.style.background = 'transparent'; },
  }, Icone && React.createElement(Icone, { size: 13 }), label);
}

export function PaginaProtocoloDetalhe(_a) {
  var protocoloId = _a.protocoloId, onVoltar = _a.onVoltar, onAtualizado = _a.onAtualizado, breakpoint = _a.breakpoint;
  var ehMobile = breakpoint === 'mobile';

  var [proto, setProto] = useState(null);
  var [aba, setAba] = useState('visao_geral');
  var [carregando, setCarregando] = useState(true);
  var [erro, setErro] = useState('');

  var [mensagens, setMensagens] = useState([]);
  var [textoMsg, setTextoMsg] = useState('');
  var [enviandoMsg, setEnviandoMsg] = useState(false);
  var [canalMsg, setCanalMsg] = useState('portal');
  var [textoAnotacao, setTextoAnotacao] = useState('');
  var [enviandoAnot, setEnviandoAnot] = useState(false);
  var [mostrarAnotacao, setMostrarAnotacao] = useState(false);

  var [historico, setHistorico] = useState([]);
  var [documentos, setDocumentos] = useState([]);
  var [tramitacoes, setTramitacoes] = useState([]);
  var [pendencias, setPendencias] = useState([]);
  var [relacionados, setRelacionados] = useState([]);

  var [showMaisAcoes, setShowMaisAcoes] = useState(false);
  var [showEncaminhar, setShowEncaminhar] = useState(false);
  var [showNovaPendencia, setShowNovaPendencia] = useState(false);
  var [showRelacionar, setShowRelacionar] = useState(false);
  var [showAtribuir, setShowAtribuir] = useState(false);
  var [uploadingDoc, setUploadingDoc] = useState(false);
  // Falha de upload/download precisa aparecer na tela, não só no console.
  var [erroDoc, setErroDoc] = useState('');
  var [expandirEvento, setExpandirEvento] = useState(null);
  var [copiado, setCopiado] = useState(false);

  var [encaminhamento, setEncaminhamento] = useState({ setor_destino: '', operador_destino: '', motivo: '', instrucoes: '', notificar_setor: true, notificar_cidadao: false });
  var [novaPendencia, setNovaPendencia] = useState({ tipo: 'documento', titulo: '', descricao: '', prazo: '', docs_esperados: '', instrucoes: '', suspender_prazo: false });
  var [relacionamento, setRelacionamento] = useState({ protocolo_id: '', tipo: 'complementar' });
  var [atribuicao, setAtribuicao] = useState({ operador_id: '', motivo: '' });

  var fileInputRef = useRef(null);
  var maisAcoesRef = useRef(null);

  var token = useCallback(function () {
    try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch (e) { return ''; }
  }, []);

  var authHeaders = useCallback(function () {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() };
  }, [token]);

  var carregarDetalhes = useCallback(function () {
    if (!protocoloId) return;
    setCarregando(true);
    setErro('');
    var h = { Authorization: 'Bearer ' + token() };
    var baseUrl = '/api/v1/protocols/' + protocoloId;
    Promise.all([
      fetch(baseUrl, { headers: h }).then(function (r) { return r.ok ? r.json() : null; }),
      fetch(baseUrl + '/history', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(baseUrl + '/messages', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(baseUrl + '/documents', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(baseUrl + '/relations', { headers: h }).then(function (r) { return r.ok ? r.json() : []; }),
    ]).then(function (results) {
      var respProto = results[0], respHist = results[1], respMsg = results[2], respDocs = results[3], respRel = results[4];
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
  }, [protocoloId, token]);

  useEffect(function () { carregarDetalhes(); }, [carregarDetalhes]);

  useEffect(function () {
    function handleClick(e) {
      if (maisAcoesRef.current && !maisAcoesRef.current.contains(e.target)) setShowMaisAcoes(false);
    }
    document.addEventListener('mousedown', handleClick);
    return function () { document.removeEventListener('mousedown', handleClick); };
  }, []);

  function notificarAtualizacao() {
    carregarDetalhes();
    if (onAtualizado) onAtualizado();
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

  function copiarNumero() {
    var texto = proto.numero || proto.id || '';
    navigator.clipboard.writeText(texto).then(function () {
      setCopiado(true);
      setTimeout(function () { setCopiado(false); }, 2000);
    }).catch(function () {});
  }

  var enviarMensagem = function () {
    if (!textoMsg.trim()) return;
    setEnviandoMsg(true);
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/messages', { conteudo: textoMsg.trim(), canal: canalMsg })
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
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/internal-notes', { conteudo: textoAnotacao.trim() })
      .then(function () { setTextoAnotacao(''); carregarDetalhes(); })
      .catch(function () {})
      .finally(function () { setEnviandoAnot(false); });
  };

  var assumirProtocolo = function () {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/assign', { operador_id: 'self' })
      .then(function () { notificarAtualizacao(); })
      .catch(function () {});
  };

  var atribuirProtocolo = function () {
    if (!atribuicao.operador_id.trim()) return;
    setShowAtribuir(false);
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/assign', atribuicao)
      .then(function () { setAtribuicao({ operador_id: '', motivo: '' }); notificarAtualizacao(); })
      .catch(function () {});
  };

  var concluirProtocolo = function () {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/complete', {})
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  // Cancelar e reabrir exigem motivo no backend; sem ele a chamada voltava 422
  // e o clique não fazia nada.
  var cancelarProtocolo = function () {
    var motivo = window.prompt('Informe o motivo do cancelamento:');
    if (!motivo || !motivo.trim()) return;
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/cancel', { justificativa: motivo.trim() })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var reabrirProtocolo = function () {
    var motivo = window.prompt('Informe o motivo da reabertura:');
    if (!motivo || !motivo.trim()) return;
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/reopen', { justificativa: motivo.trim() })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var arquivarProtocolo = function () {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/status', { status: 'ARQUIVADO' })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  // Muda a situação do protocolo e registra um andamento visível para o cidadão
  // no portal. `observacao` é o texto que ele lê.
  var alterarSituacao = function (destino, observacao) {
    setErro('');
    setShowMaisAcoes(false);
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/status', {
      status_operacional: destino,
      observacao: observacao,
      justificativa: observacao,
    })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var alterarPrioridade = function (nova) {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/status', { prioridade: nova })
      .then(function () { notificarAtualizacao(); })
      .catch(function (err) { setErro(err.message); });
  };

  var executarEncaminhamento = function () {
    if (!encaminhamento.setor_destino) return;
    setShowEncaminhar(false);
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/forward', encaminhamento)
      .then(function () {
        setEncaminhamento({ setor_destino: '', operador_destino: '', motivo: '', instrucoes: '', notificar_setor: true, notificar_cidadao: false });
        notificarAtualizacao();
      })
      .catch(function () {});
  };

  var criarPendencia = function () {
    if (!novaPendencia.titulo.trim()) return;
    setShowNovaPendencia(false);
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/pending-items', novaPendencia)
      .then(function () {
        setNovaPendencia({ tipo: 'documento', titulo: '', descricao: '', prazo: '', docs_esperados: '', instrucoes: '', suspender_prazo: false });
        carregarDetalhes();
      })
      .catch(function () {});
  };

  var resolverPendencia = function (id) {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/pending-items/' + id + '/resolve', {})
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var excluirPendencia = function (id) {
    if (!window.confirm('Remover esta pend\u00eancia?')) return;
    fetch('/api/v1/protocols/' + protocoloId + '/pending-items/' + id, { method: 'DELETE', headers: authHeaders() })
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
      return fetch('/api/v1/protocols/' + protocoloId + '/documents/upload', {
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
    fetch('/api/v1/protocols/' + protocoloId + '/documents/' + doc.id + '/download', {
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

  // Visualizar: abre o arquivo em nova aba para preview inline (PDF, imagens, etc.)
  var visualizarDocumento = function (doc) {
    setErroDoc('');
    fetch('/api/v1/protocols/' + protocoloId + '/documents/' + doc.id + '/download', {
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
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/documents/' + doc.id + '/visibility', { visivel_cidadao: !doc.visivel_cidadao })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var aprovarDoc = function (doc) {
    setErroDoc('');
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/documents/' + doc.id + '/status', { status: 'APROVADO' })
      .then(function () { carregarDetalhes(); })
      .catch(function (err) { setErroDoc(err.message); });
  };

  var rejeitarDoc = function (doc) {
    setErroDoc('');
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/documents/' + doc.id + '/status', { status: 'REJEITADO' })
      .then(function () { carregarDetalhes(); })
      .catch(function (err) { setErroDoc(err.message); });
  };

  var adicionarRelacionamento = function () {
    if (!relacionamento.protocolo_id) return;
    setShowRelacionar(false);
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/relations', relacionamento)
      .then(function () { setRelacionamento({ protocolo_id: '', tipo: 'complementar' }); carregarDetalhes(); })
      .catch(function () {});
  };

  var removerRelacionamento = function (rel) {
    if (!window.confirm('Remover este v\u00ednculo?')) return;
    fetch('/api/v1/protocols/' + protocoloId + '/relations/' + rel.id, { method: 'DELETE', headers: authHeaders() })
      .then(function () { carregarDetalhes(); })
      .catch(function () {});
  };

  var gerarCredenciaisAcesso = function () {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/access-credentials', {})
      .then(function () { notificarAtualizacao(); })
      .catch(function () {});
  };

  var enviarWhatsAppAcesso = function () {
    callApi('POST', '/api/v1/protocols/' + protocoloId + '/send-whatsapp-access', {})
      .then(function () { notificarAtualizacao(); })
      .catch(function () {});
  };

  function AbaVisaoGeral() {
    var cidadao = proto.contato_nome || proto.cidadao_nome || proto.solicitante_nome;
    var temCidadao = !!cidadao;
    var unidadeInterna = proto.setor_solicitante_nome || proto.unidade_solicitante_nome;
    var pendenciasAtivas = (pendencias || []).filter(function (p) { return p.status === 'pendente'; });
    var ultimosDocs = documentos.slice(0, 3);

    var slaStatus;
    if (proto.status_operacional === 'CONCLUIDO' || proto.status_operacional === 'CANCELADO') {
      slaStatus = 'done';
    } else if (proto.prazo_em) {
      var agora = Date.now();
      var prazoMs = new Date(proto.prazo_em).getTime();
      var diff = prazoMs - agora;
      if (diff < 0) slaStatus = 'breached';
      else if (diff < 24 * 60 * 60 * 1000) slaStatus = 'warning';
      else slaStatus = 'on_time';
    }

    var slaLabels = { on_time: 'No prazo', warning: 'Pr\u00f3ximo ao vencimento', breached: 'Vencido', done: 'Finalizado' };
    var slaColors = { on_time: T.success, warning: T.warning, breached: T.danger, done: T.textMuted };
    var slaBg = { on_time: T.successSoft, warning: T.warningSoft, breached: T.dangerSoft, done: T.surfaceMuted };

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },

      React.createElement('div', null,
        React.createElement(SectionTitle, { text: 'Informa\u00e7\u00f5es do Protocolo' }),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : '1fr 1fr', gap: 10 } },
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
                  style: { padding: '8px 12px', borderRadius: T.radiusSm, background: T.primarySoft, fontSize: 12, color: T.primary, fontWeight: 600 },
                }, 'Protocolo interno'),
                React.createElement(CampoInfo, { Icone: Building2, rotulo: 'Unidade solicitante', valor: unidadeInterna }),
                proto.setor_solicitante_secretaria && React.createElement(CampoInfo, { Icone: Building2, rotulo: 'Secretaria', valor: proto.setor_solicitante_secretaria }),
                proto.solicitante_nome && React.createElement(CampoInfo, { Icone: User, rotulo: 'Servidor solicitante', valor: proto.solicitante_nome }),
              )
            : React.createElement('div', {
                style: { padding: '10px 12px', borderRadius: T.radiusSm, background: T.warningSoft, fontSize: 12, color: T.warning, display: 'flex', alignItems: 'center', gap: 8 },
              }, React.createElement(AlertTriangle, { size: 14 }), 'Protocolo externo sem dados do cidad\u00e3o \u2014 poss\u00edvel inconsist\u00eancia nos dados.'),
      ),

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
      pendenciasAtivas.length > 0 && React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
        React.createElement(SectionTitle, { text: 'Pend\u00eancias ativas (' + pendenciasAtivas.length + ')' }),
        pendenciasAtivas.slice(0, 5).map(function (p) {
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

      // Últimos documentos
      ultimosDocs.length > 0 && React.createElement('div', { style: { borderTop: '1px solid ' + T.border, paddingTop: 14 } },
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

  function AbaMensagens() {
    var canalAtual = CANAIS_ENVIO.find(function (c) { return c.id === canalMsg; }) || CANAIS_ENVIO[0];

    var gruposPorData = [];
    if (mensagens.length > 0) {
      var grupos = {};
      mensagens.forEach(function (m) {
        var data = formatarData(m.criado_em);
        if (!grupos[data]) grupos[data] = [];
        grupos[data].push(m);
      });
      gruposPorData = Object.keys(grupos).map(function (d) { return { data: d, msgs: grupos[d] }; });
    }

    var hoje = formatarData(new Date().toISOString());
    var ontemD = new Date(); ontemD.setDate(ontemD.getDate() - 1);
    var ontem = formatarData(ontemD.toISOString());

    function rotuloData(data) {
      if (data === hoje) return 'Hoje';
      if (data === ontem) return 'Ontem';
      return data;
    }

    function renderBubble(m) {
      var iconeCanal;
      switch (m.canal) {
        case 'whatsapp': iconeCanal = MessageCircle; break;
        case 'email': iconeCanal = AtSign; break;
        case 'portal': iconeCanal = Globe; break;
        default: iconeCanal = null;
      }
      var isEntrada = m.direcao === 'entrada';
      var isSaida = !isEntrada;
      var bg = isEntrada ? '#f8fafc' : T.primarySoft;
      var align = isEntrada ? 'flex-start' : 'flex-end';
      var borderColor = isEntrada ? '#e2e8f0' : '#bfdbfe';

      return React.createElement('div', {
        key: m.id,
        style: { display: 'flex', alignItems: 'flex-end', gap: 7, alignSelf: align, maxWidth: '88%', flexDirection: isEntrada ? 'row' : 'row-reverse' },
      },
        React.createElement('div', {
          style: { width: 26, height: 26, borderRadius: '50%', background: isEntrada ? '#e2e8f0' : T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 1 },
        }, React.createElement(isEntrada ? User : MessageSquare, { size: 13, style: { color: isEntrada ? '#64748b' : '#fff' } })),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: isEntrada ? 'flex-start' : 'flex-end', maxWidth: '100%' } },
          React.createElement('div', {
            style: {
              padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.55,
              background: bg, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: '1px solid ' + borderColor,
              borderBottomLeftRadius: isEntrada ? 4 : 12,
              borderBottomRightRadius: isEntrada ? 12 : 4,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              color: T.text,
            },
          }, m.conteudo),
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: T.textMuted, marginTop: 4, paddingLeft: isEntrada ? 2 : 0, paddingRight: isEntrada ? 0 : 2 },
          },
            m.autor_nome && React.createElement('span', { style: { fontWeight: 600, color: T.text } }, m.autor_nome),
            iconeCanal && React.createElement(iconeCanal, { size: 10, style: { opacity: 0.6 } }),
            React.createElement('span', null, formatarDataHora(m.criado_em).split(', ').pop()),
            isSaida && React.createElement(Check, { size: 11, style: { color: T.success, opacity: 0.7 } }),
          ),
        ),
      );
    }

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },

      React.createElement('div', { style: { flex: 1, overflowY: 'auto', paddingBottom: 16 } },
        mensagens.length === 0
          ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 } },
              React.createElement('div', { style: { width: 56, height: 56, borderRadius: '50%', background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                React.createElement(MessageSquare, { size: 26, style: { color: T.primary, opacity: 0.7 } }),
              ),
              React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, 'Nenhuma mensagem ainda'),
              React.createElement('div', { style: { fontSize: 12, color: T.textMuted, textAlign: 'center', maxWidth: 280 } },
                'As mensagens trocadas com o cidad\u00e3o aparecer\u00e3o aqui. Use o campo abaixo para iniciar uma conversa.',
              ),
            )
          : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              gruposPorData.map(function (g) {
                return React.createElement('div', { key: g.data, style: { display: 'flex', flexDirection: 'column', gap: 5 } },
                  React.createElement('div', { style: { textAlign: 'center', padding: '6px 0' } },
                    React.createElement('span', { style: { fontSize: 10.5, fontWeight: 600, color: T.textMuted, background: T.surfaceAlt, padding: '3px 10px', borderRadius: 999 } }, rotuloData(g.data)),
                  ),
                  g.msgs.map(function (m) { return renderBubble(m); }),
                );
              }),
            ),
      ),

      // ── ENVIAR MENSAGEM ──
      React.createElement('div', { style: { borderTop: '2px solid ' + T.border, paddingTop: 12 } },

        React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 8, background: T.surfaceAlt, borderRadius: 10, padding: 3 } },
          CANAIS_ENVIO.map(function (c) {
            var ativo = canalMsg === c.id;
            return React.createElement('button', {
              key: c.id, onClick: function () { setCanalMsg(c.id); }, title: c.label,
              style: {
                flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '6px 4px', borderRadius: 8, border: 'none',
                background: ativo ? T.surface : 'transparent',
                color: ativo ? T.primary : T.textMuted,
                fontSize: 11, fontWeight: ativo ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: ativo ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              },
            }, React.createElement(c.Icone, { size: 12 }), c.label);
          }),
        ),

        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('div', { style: { flex: 1, position: 'relative' } },
            React.createElement('div', { style: { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.primary, display: 'flex', zIndex: 1 } },
              React.createElement(canalAtual.Icone, { size: 14 }),
            ),
            React.createElement('input', {
              value: textoMsg, onChange: function (e) { setTextoMsg(e.target.value); },
              onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } },
              placeholder: 'Digite sua mensagem...',
              style: Object.assign({}, inputBaseStyle, { flex: 1, margin: 0, paddingLeft: 32, background: T.surface, borderRadius: 10, border: '1px solid ' + T.borderStrong }),
            }),
          ),
          React.createElement('button', {
            onClick: enviarMensagem, disabled: enviandoMsg || !textoMsg.trim(),
            style: {
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: (enviandoMsg || !textoMsg.trim()) ? T.surfaceMuted : T.primary,
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: (enviandoMsg || !textoMsg.trim()) ? 'default' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: (enviandoMsg || !textoMsg.trim()) ? 'none' : '0 1px 3px rgba(37,99,235,0.3)',
            },
          }, enviandoMsg ? React.createElement(Loader2, { size: 15 }) : React.createElement(Send, { size: 15 })),
        ),
      ),

      // ── ANOTAÇÃO INTERNA (colapsável) ──
      React.createElement('div', { style: { marginTop: 12 } },
        React.createElement('button', {
          onClick: function () { setMostrarAnotacao(!mostrarAnotacao); },
          style: {
            display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 0',
            border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 600, color: mostrarAnotacao ? T.warning : T.textMuted,
          },
        },
          React.createElement(AlertCircle, { size: 12, style: { color: T.warning } }),
          'Anota\u00e7\u00e3o interna',
          React.createElement('span', { style: { fontSize: 10, color: T.textMuted, fontWeight: 400 } }, '(vis\u00edvel apenas para servidores)'),
          React.createElement('span', { style: { marginLeft: 'auto', transform: mostrarAnotacao ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex' } },
            React.createElement(ChevronDown, { size: 13 }),
          ),
        ),

        mostrarAnotacao && React.createElement('div', { style: { padding: '10px 12px', borderRadius: 10, background: T.warningSoft + '80', border: '1px dashed ' + T.warning + '55', marginTop: 4 } },
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('input', {
              value: textoAnotacao, onChange: function (e) { setTextoAnotacao(e.target.value); },
              onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarAnotacao(); } },
              placeholder: 'Registrar anota\u00e7\u00e3o interna...',
              style: Object.assign({}, inputBaseStyle, { flex: 1, margin: 0, border: '1px solid ' + T.warning + '44', background: 'rgba(255,255,255,0.7)', borderRadius: 8 }),
            }),
            React.createElement('button', {
              onClick: enviarAnotacao, disabled: enviandoAnot || !textoAnotacao.trim(),
              style: Object.assign({}, btnBaseStyle, { padding: '9px 14px', background: T.warning, color: '#fff', border: 'none', borderRadius: 8, cursor: (enviandoAnot || !textoAnotacao.trim()) ? 'default' : 'pointer', opacity: (enviandoAnot || !textoAnotacao.trim()) ? 0.5 : 1 }),
            }, enviandoAnot ? React.createElement(Loader2, { size: 13 }) : React.createElement(Send, { size: 13 })),
          ),
        ),
      ),
    );
  }

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
          textAlign: 'center', cursor: 'pointer', background: T.surfaceAlt, transition: 'background 0.15s',
        },
        onMouseEnter: function (e) { e.currentTarget.style.background = T.border; },
        onMouseLeave: function (e) { e.currentTarget.style.background = T.surfaceAlt; },
      },
        React.createElement('input', {
          ref: fileInputRef, type: 'file', multiple: true,
          accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx', style: { display: 'none' },
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
            React.createElement('div', {
              className: 'protocolo-document-header',
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
                className: 'protocolo-document-row',
                style: { display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 60px', gap: 6, padding: '10px', borderRadius: T.radiusSm, background: T.surfaceAlt, border: '1px solid ' + T.border, alignItems: 'center', fontSize: 12 },
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
                React.createElement('span', null,
                  d.visivel_cidadao
                    ? React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: T.success, padding: '1px 6px', borderRadius: 4, background: T.successSoft } },
                        React.createElement(Unlock, { size: 10 }), 'P\u00fablico')
                    : React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: T.textMuted, padding: '1px 6px', borderRadius: 4, background: T.surfaceMuted } },
                        React.createElement(Lock, { size: 10 }), 'Interno'),
                ),
                React.createElement('div', { className: 'protocolo-document-actions', style: { display: 'flex', gap: 2, justifyContent: 'flex-end' } },
                  React.createElement('button', { title: 'Visualizar', onClick: function () { visualizarDocumento(d); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.textMuted, fontSize: 11 }) }, React.createElement(Eye, { size: 14 })),
                  React.createElement('button', { title: 'Baixar', onClick: function () { downloadDocumento(d); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.textMuted, fontSize: 11 }) }, React.createElement(Download, { size: 14 })),
                  d.status !== 'APROVADO' && React.createElement('button', { title: 'Aprovar', onClick: function () { aprovarDoc(d); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.success, fontSize: 11 }) }, React.createElement(Check, { size: 14 })),
                  d.status !== 'REJEITADO' && React.createElement('button', { title: 'Rejeitar', onClick: function () { rejeitarDoc(d); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.danger, fontSize: 11 }) }, React.createElement(X, { size: 14 })),
                  React.createElement('button', { title: d.visivel_cidadao ? 'Tornar interno' : 'Liberar ao cidad\u00e3o', onClick: function () { alternarVisibilidadeDoc(d); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: d.visivel_cidadao ? T.warning : T.textMuted, fontSize: 11 }) }, d.visivel_cidadao ? React.createElement(Lock, { size: 14 }) : React.createElement(Unlock, { size: 14 })),
                ),
              );
            }),
          ),
    );
  }

  function AbaTramitacoes() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('button', {
        onClick: function () { setShowEncaminhar(true); },
        style: Object.assign({}, btnBaseStyle, { background: T.primary, color: '#fff', alignSelf: 'flex-start' }),
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
                    style: { width: 28, height: 28, borderRadius: '50%', background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
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
    );
  }

  function AbaPendencias() {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('button', {
        onClick: function () { setShowNovaPendencia(true); },
        style: Object.assign({}, btnBaseStyle, { background: T.primary, color: '#fff', alignSelf: 'flex-start' }),
      }, React.createElement(Plus, { size: 14 }), 'Solicitar ao cidad\u00e3o'),

      pendencias.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12.5 } },
            React.createElement(AlertCircle, { size: 28, style: { display: 'block', margin: '0 auto 10px', opacity: 0.4 } }),
            'Nenhuma pend\u00eancia registrada',
          )
        : pendencias.map(function (p) {
            var resolved = p.status !== 'pendente';
            return React.createElement('div', {
              key: p.id,
              style: { padding: '12px 14px', borderRadius: T.radiusSm, background: resolved ? T.surfaceAlt : T.warningSoft, border: '1px solid ' + (resolved ? T.border : T.warning), opacity: resolved ? 0.7 : 1 },
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
                  React.createElement('button', { title: 'Marcar como resolvida', onClick: function () { resolverPendencia(p.id); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 8px', background: T.successSoft, color: T.success, fontSize: 10.5 }) }, React.createElement(Check, { size: 13 })),
                  React.createElement('button', { title: 'Excluir', onClick: function () { excluirPendencia(p.id); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 8px', background: T.dangerSoft, color: T.danger, fontSize: 10.5 }) }, React.createElement(X, { size: 13 })),
                ),
              ),
            );
          }),
    );
  }

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
                  style: { width: 28, height: 28, borderRadius: '50%', background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
                }, React.createElement(IconeEvt, { size: 14 })),
                i < arr.length - 1 && React.createElement('div', { style: { width: 2, flex: 1, background: T.border, minHeight: 18 } }),
              ),
              React.createElement('div', {
                style: { paddingBottom: 14, minWidth: 0, flex: 1, cursor: evt.detalhes ? 'pointer' : 'default' },
                onClick: evt.detalhes ? function () { setExpandirEvento(isExpanded ? null : evt.id); } : undefined,
              },
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

  function CampoSimples(_a) {
    var rotulo = _a.rotulo, valor = _a.valor;
    return React.createElement('div', null,
      React.createElement('div', { style: { fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 } }, rotulo),
      React.createElement('div', { style: { fontSize: 12.5, color: T.text, fontWeight: 600, wordBreak: 'break-word' } }, valor || '\u2014'),
    );
  }

  // Maps tabs to components
  var mapaAbas = {
    visao_geral: AbaVisaoGeral,
    mensagens: AbaMensagens,
    documentos: AbaDocumentos,
    tramitacoes: AbaTramitacoes,
    pendencias: AbaPendencias,
    historico: AbaHistorico,
  };
  var AbaAtual = mapaAbas[aba];

  // SLA bar color for sidebar
  var slaBarColor = T.textMuted;
  var slaBarBg = T.surfaceMuted;
  var slaLabels = { on_time: 'No prazo', warning: 'Pr\u00f3ximo ao prazo', breached: 'Vencido', done: 'Finalizado' };
  var slaBarWidth = '0%';
  if (proto && proto.status_operacional === 'CONCLUIDO' || (proto && proto.status_operacional === 'CANCELADO')) {
    slaBarColor = T.textMuted;
    slaBarBg = T.surfaceMuted;
    slaBarWidth = '100%';
  } else if (proto && proto.prazo_em) {
    var agora = Date.now();
    var prazoMs = new Date(proto.prazo_em).getTime();
    var aberturaMs = proto.aberto_em ? new Date(proto.aberto_em).getTime() : prazoMs - 86400000;
    var total = prazoMs - aberturaMs;
    var decorrido = agora - aberturaMs;
    slaBarWidth = Math.min(100, Math.max(0, (decorrido / total) * 100)).toFixed(0) + '%';
    if (agora > prazoMs) { slaBarColor = T.danger; slaBarBg = T.dangerSoft; }
    else if (prazoMs - agora < 24 * 60 * 60 * 1000) { slaBarColor = T.warning; slaBarBg = T.warningSoft; }
    else { slaBarColor = T.success; slaBarBg = T.successSoft; }
  }

  var pendenciasAtivas = (pendencias || []).filter(function (p) { return p.status === 'pendente'; });
  var naoAtribuido = !proto || (!proto.responsavel_nome && !proto.operador_nome);

  // ── RENDER ──
  return React.createElement('div', {
    className: 'protocolo-page',
    style: {
      width: '100%', height: '100%', background: T.bg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
  },
    // ── TOP HEADER ──
    React.createElement('div', {
      className: 'protocolo-topbar',
      style: {
        padding: ehMobile ? '10px 12px' : '14px 24px',
        background: T.surface, borderBottom: '1px solid ' + T.border,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0,
      },
    },
      // Back button
      React.createElement('button', {
        onClick: onVoltar,
        className: 'protocolo-back',
        style: Object.assign({}, btnBaseStyle, { padding: '6px 10px', background: T.surfaceAlt, color: T.textSecondary, fontSize: 11.5 }),
      }, React.createElement(ArrowLeft, { size: 16 }), !ehMobile && 'Voltar'),

      // Protocol number
      React.createElement('div', { className: 'protocolo-identity', style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement(FileText, { size: 20, style: { color: T.primary } }),
        React.createElement('span', {
          style: { fontSize: 16, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontVariantNumeric: 'tabular-nums' },
        }, proto ? (proto.numero || proto.id || '\u2014') : '\u2014'),
      ),

      // Status badge
      proto && React.createElement(BadgeStatus, { status: proto.status_operacional }),

      // Priority badge
      proto && React.createElement(BadgePrioridade, { prioridade: proto.prioridade }),

      // Origin badge
      proto && React.createElement(BadgeOrigem, { origem: proto.origem }),

      // Spacer
      React.createElement('div', { style: { flex: 1 } }),

      // Action buttons row
      !ehMobile && React.createElement('div', { className: 'protocolo-header-actions', style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
        naoAtribuido && React.createElement('button', {
          onClick: assumirProtocolo, title: 'Assumir',
          style: Object.assign({}, btnBaseStyle, { background: T.primarySoft, color: T.primary }),
        }, React.createElement(Hand, { size: 13 }), 'Assumir'),

        React.createElement('button', {
          onClick: function () { setShowAtribuir(true); }, title: 'Atribuir',
          style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary }),
        }, React.createElement(UserPlus, { size: 13 }), 'Atribuir'),

        React.createElement('button', {
          onClick: function () { setShowEncaminhar(true); }, title: 'Encaminhar',
          style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary }),
        }, React.createElement(ArrowRightLeft, { size: 13 }), 'Encaminhar'),

        React.createElement('button', {
          onClick: function () { setAba('mensagens'); }, title: 'Responder',
          style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary }),
        }, React.createElement(MessageSquare, { size: 13 }), 'Responder'),

        React.createElement('button', {
          onClick: function () { if (fileInputRef.current) fileInputRef.current.click(); }, title: 'Anexar documento',
          style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary }),
        }, React.createElement(Paperclip, { size: 13 }), 'Anexar'),

        React.createElement('button', {
          onClick: function () { setShowNovaPendencia(true); }, title: 'Solicitar ao cidad\u00e3o',
          style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary }),
        }, React.createElement(AlertCircle, { size: 13 }), 'Solicitar'),

        // Só faz sentido enquanto o protocolo ainda não avançou: é o clique que
        // leva o cidadão de "Solicitação recebida" para "Em análise".
        proto && (proto.status_operacional === 'ABERTO' || proto.status_operacional === 'PENDENTE')
          && React.createElement('button', {
            onClick: function () {
              alterarSituacao('EM_ANDAMENTO', 'Sua solicitação está em análise pelo setor responsável.');
            },
            title: 'Dar andamento (o cidadão passa a ver "Em análise")',
            style: Object.assign({}, btnBaseStyle, { background: T.primarySoft, color: T.primary }),
          }, React.createElement(RefreshCw, { size: 13 }), 'Dar andamento'),

        React.createElement('button', {
          onClick: concluirProtocolo, title: 'Concluir',
          style: Object.assign({}, btnBaseStyle, { background: T.successSoft, color: T.success }),
        }, React.createElement(CheckCircle, { size: 13 }), 'Concluir'),

        React.createElement('div', { style: { position: 'relative' }, ref: maisAcoesRef },
          React.createElement('button', {
            onClick: function () { setShowMaisAcoes(!showMaisAcoes); }, title: 'Mais a\u00e7\u00f5es',
            style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary }),
          }, React.createElement(MoreVertical, { size: 13 })),
          showMaisAcoes && React.createElement('div', {
            style: {
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: T.surface, border: '1px solid ' + T.border, borderRadius: T.radiusSm,
              padding: '4px 0', boxShadow: T.shadowMd, zIndex: 100, minWidth: 200,
            },
          },
            React.createElement(ActionMenuItem, { label: 'Aguardando cidadão', Icone: User, onClick: function () { alterarSituacao('PENDENTE', 'Aguardando uma resposta ou documento seu para prosseguir.'); } }),
            React.createElement(ActionMenuItem, { label: 'Alterar prioridade para Alta', Icone: Flag, onClick: function () { alterarPrioridade('ALTA'); setShowMaisAcoes(false); } }),
            React.createElement(ActionMenuItem, { label: 'Alterar prioridade para Urgente', Icone: AlertCircle, onClick: function () { alterarPrioridade('URGENTE'); setShowMaisAcoes(false); } }),
            React.createElement(ActionMenuItem, { label: 'Alterar prioridade para Baixa', Icone: ChevronDown, onClick: function () { alterarPrioridade('BAIXA'); setShowMaisAcoes(false); } }),
            React.createElement(ActionMenuItem, { label: 'Alterar prazo', Icone: Clock, onClick: function () { setShowMaisAcoes(false); } }),
            React.createElement(ActionMenuItem, { label: 'Cancelar protocolo', Icone: XCircle, onClick: function () { cancelarProtocolo(); setShowMaisAcoes(false); } }),
            React.createElement(ActionMenuItem, { label: 'Arquivar protocolo', Icone: Archive, onClick: function () { arquivarProtocolo(); setShowMaisAcoes(false); } }),
            React.createElement(ActionMenuItem, { label: 'Reabrir protocolo', Icone: RefreshCw, onClick: function () { reabrirProtocolo(); setShowMaisAcoes(false); } }),
          ),
        ),
      ),
    ),

    // ── MOBILE ACTION BAR ──
    ehMobile && React.createElement('div', {
      className: 'protocolo-mobile-actions',
      style: { padding: '8px 12px', background: T.surfaceAlt, borderBottom: '1px solid ' + T.border, display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 },
    },
      naoAtribuido && React.createElement('button', { onClick: assumirProtocolo, style: Object.assign({}, btnBaseStyle, { background: T.primarySoft, color: T.primary, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(Hand, { size: 12 }), 'Assumir'),
      React.createElement('button', { onClick: function () { setShowAtribuir(true); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(UserPlus, { size: 12 }), 'Atribuir'),
      React.createElement('button', { onClick: function () { setShowEncaminhar(true); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(ArrowRightLeft, { size: 12 })),
      React.createElement('button', { onClick: function () { setAba('mensagens'); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(MessageSquare, { size: 12 })),
      React.createElement('button', { onClick: function () { if (fileInputRef.current) fileInputRef.current.click(); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(Paperclip, { size: 12 })),
      proto && (proto.status_operacional === 'ABERTO' || proto.status_operacional === 'PENDENTE')
        && React.createElement('button', {
          onClick: function () { alterarSituacao('EM_ANDAMENTO', 'Sua solicitação está em análise pelo setor responsável.'); },
          title: 'Dar andamento',
          style: Object.assign({}, btnBaseStyle, { background: T.primarySoft, color: T.primary, fontSize: 10.5, padding: '5px 8px' }),
        }, React.createElement(RefreshCw, { size: 12 })),
      React.createElement('button', { onClick: concluirProtocolo, style: Object.assign({}, btnBaseStyle, { background: T.successSoft, color: T.success, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(CheckCircle, { size: 12 })),
      React.createElement('div', { style: { position: 'relative' }, ref: maisAcoesRef },
        React.createElement('button', { onClick: function () { setShowMaisAcoes(!showMaisAcoes); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceAlt, color: T.textSecondary, fontSize: 10.5, padding: '5px 8px' }) }, React.createElement(MoreVertical, { size: 12 })),
        showMaisAcoes && React.createElement('div', {
          style: { position: 'absolute', top: '100%', right: 0, marginTop: 4, background: T.surface, border: '1px solid ' + T.border, borderRadius: T.radiusSm, padding: '4px 0', boxShadow: T.shadowMd, zIndex: 100, minWidth: 200 },
        },
          React.createElement(ActionMenuItem, { label: 'Alterar prioridade para Alta', Icone: Flag, onClick: function () { alterarPrioridade('ALTA'); setShowMaisAcoes(false); } }),
          React.createElement(ActionMenuItem, { label: 'Alterar prioridade para Urgente', Icone: AlertCircle, onClick: function () { alterarPrioridade('URGENTE'); setShowMaisAcoes(false); } }),
          React.createElement(ActionMenuItem, { label: 'Cancelar', Icone: XCircle, onClick: function () { cancelarProtocolo(); setShowMaisAcoes(false); } }),
          React.createElement(ActionMenuItem, { label: 'Arquivar', Icone: Archive, onClick: function () { arquivarProtocolo(); setShowMaisAcoes(false); } }),
          React.createElement(ActionMenuItem, { label: 'Reabrir', Icone: RefreshCw, onClick: function () { reabrirProtocolo(); setShowMaisAcoes(false); } }),
        ),
      ),
    ),

    proto && React.createElement('section', { className: 'protocolo-summary', 'aria-label': 'Resumo do protocolo' },
      React.createElement('div', { className: 'protocolo-summary-title' },
        React.createElement('span', null, 'Assunto'),
        React.createElement('strong', null, proto.assunto || proto.servico_nome || proto.categoria_nome || 'Sem assunto informado'),
        proto.descricao && React.createElement('p', null, proto.descricao),
      ),
      React.createElement('div', { className: 'protocolo-summary-fact' },
        React.createElement(Building2, { size: 17 }),
        React.createElement('span', null, 'Setor atual'),
        React.createElement('strong', null, proto.setor_atual_nome || proto.departamento_nome || 'Não definido'),
      ),
      React.createElement('div', { className: 'protocolo-summary-fact' },
        React.createElement(User, { size: 17 }),
        React.createElement('span', null, 'Responsável'),
        React.createElement('strong', null, proto.responsavel_nome || proto.operador_nome || 'Não atribuído'),
      ),
      React.createElement('div', { className: 'protocolo-summary-fact' },
        React.createElement(Clock, { size: 17 }),
        React.createElement('span', null, 'Prazo'),
        React.createElement('strong', null, proto.prazo_em ? formatarData(proto.prazo_em) : 'Sem prazo definido'),
      ),
    ),

    // ── TABS BAR ──
    React.createElement('div', {
      className: 'protocolo-tabs',
      style: { padding: '0 24px', background: T.surface, borderBottom: '1px solid ' + T.border, display: 'flex', gap: 0, overflowX: 'auto', flexShrink: 0 },
    },
      ABAS.map(function (a) {
        var isActive = aba === a.id;
        return React.createElement('button', {
          key: a.id, onClick: function () { setAba(a.id); }, title: a.label,
          className: isActive ? 'is-active' : '',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 14px',
            border: 'none', background: 'transparent',
            color: isActive ? T.primary : T.textMuted,
            fontSize: 12.5, fontWeight: isActive ? 700 : 500,
            borderBottom: isActive ? '2px solid ' + T.primary : '2px solid transparent',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
          },
        }, React.createElement(a.Icone, { size: 13 }), a.label);
      }),
    ),

    // ── MAIN CONTENT ──
    React.createElement('div', {
      className: 'protocolo-scroll-area',
      style: { flex: 1, overflowY: 'auto', minHeight: 0 },
    },
      React.createElement('div', {
        className: 'protocolo-content-grid',
        style: {
          maxWidth: 1200, margin: '0 auto', padding: ehMobile ? '12px' : '20px 24px',
          display: 'flex', gap: 20, flexDirection: ehMobile ? 'column' : 'row', minHeight: '100%',
        },
      },
        // ── LEFT COLUMN (60%) ──
        React.createElement('div', {
          style: {
            flex: '0 0 ' + (ehMobile ? 'auto' : '60%'), maxWidth: ehMobile ? '100%' : '60%',
            display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
          },
        },
          erro && React.createElement('div', {
            style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 12.5 },
          }, erro),

          carregando
            ? React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 60, textAlign: 'center', boxShadow: T.shadowMd } },
                React.createElement(Loader2, { size: 32, style: { color: T.textMuted } }),
                React.createElement('div', { style: { marginTop: 14, fontSize: 13, color: T.textMuted } }, 'Carregando...'),
              )
            : React.createElement('div', { className: 'protocolo-main-card', style: { background: T.surface, borderRadius: T.radius, padding: 20, boxShadow: T.shadowMd } },
                AbaAtual(),
              ),
        ),

        // ── RIGHT COLUMN (40%) ──
        !ehMobile && React.createElement('div', {
          style: {
            flex: '0 0 ' + (ehMobile ? 'auto' : '40%'), maxWidth: ehMobile ? '100%' : '40%',
            display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
          },
        },
          proto && React.createElement(RightSidebar, {
            proto: proto, pendenciasAtivas: pendenciasAtivas, relacionados: relacionados,
            slaBarColor: slaBarColor, slaBarBg: slaBarBg, slaBarWidth: slaBarWidth,
            copiarNumero: copiarNumero, copiado: copiado,
            gerarCredenciaisAcesso: gerarCredenciaisAcesso,
            enviarWhatsAppAcesso: enviarWhatsAppAcesso,
            onShowRelacionar: function () { setShowRelacionar(true); },
          }),

          // Relations section for mobile
          relacionados.length > 0 && React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
            React.createElement(SectionTitle, { text: 'Protocolos relacionados (' + relacionados.length + ')' }),
            relacionados.map(function (r) {
              var tipoLabel = (TIPOS_RELACAO.find(function (t) { return t.id === r.tipo; }) || {}).label || r.tipo;
              return React.createElement('div', {
                key: r.id,
                style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: T.radiusSm, background: T.surfaceAlt, border: '1px solid ' + T.border, marginBottom: 4 },
              },
                React.createElement(Link2, { size: 14, style: { color: T.primary, flexShrink: 0 } }),
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' } }, r.protocolo_numero || r.protocolo_id),
                  React.createElement('div', { style: { fontSize: 11, color: T.textSecondary, marginTop: 1 } }, r.protocolo_assunto || r.assunto),
                ),
                React.createElement('span', {
                  style: { display: 'inline-flex', padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: T.surfaceMuted, color: T.textMuted, whiteSpace: 'nowrap' },
                }, tipoLabel),
              );
            }),
          ),
        ),
      ),
    ),

    // ── MODALS ──

    // Modal: Encaminhar
    showEncaminhar && React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      onClick: function (e) { if (e.target === e.currentTarget) setShowEncaminhar(false); },
    },
      React.createElement('div', {
        style: { width: 420, maxHeight: '80vh', overflowY: 'auto', background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
          React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Encaminhar protocolo'),
          React.createElement('button', { onClick: function () { setShowEncaminhar(false); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.textMuted }) }, React.createElement(X, { size: 16 })),
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
              style: Object.assign({}, inputBaseStyle, { resize: 'vertical' }),
            }),
          ),
          React.createElement(InputLabel, { label: 'Instru\u00e7\u00f5es adicionais' },
            React.createElement('textarea', {
              value: encaminhamento.instrucoes, placeholder: 'Instru\u00e7\u00f5es para o setor de destino...', rows: 2,
              onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { instrucoes: e.target.value })); },
              style: Object.assign({}, inputBaseStyle, { resize: 'vertical' }),
            }),
          ),
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' } },
            React.createElement('input', { type: 'checkbox', checked: encaminhamento.notificar_setor, onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { notificar_setor: e.target.checked })); } }),
            'Notificar setor de destino',
          ),
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' } },
            React.createElement('input', { type: 'checkbox', checked: encaminhamento.notificar_cidadao, onChange: function (e) { setEncaminhamento(Object.assign({}, encaminhamento, { notificar_cidadao: e.target.checked })); } }),
            'Notificar cidad\u00e3o',
          ),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
          React.createElement('button', { onClick: function () { setShowEncaminhar(false); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceMuted, color: T.text }) }, 'Cancelar'),
          React.createElement('button', { onClick: executarEncaminhamento, disabled: !encaminhamento.setor_destino, style: Object.assign({}, btnBaseStyle, { background: T.primary, color: '#fff', opacity: encaminhamento.setor_destino ? 1 : 0.6 }) }, 'Encaminhar'),
        ),
      ),
    ),

    // Modal: Nova Pendência
    showNovaPendencia && React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      onClick: function (e) { if (e.target === e.currentTarget) setShowNovaPendencia(false); },
    },
      React.createElement('div', {
        style: { width: 420, maxHeight: '80vh', overflowY: 'auto', background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
          React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Nova solicita\u00e7\u00e3o ao cidad\u00e3o'),
          React.createElement('button', { onClick: function () { setShowNovaPendencia(false); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.textMuted }) }, React.createElement(X, { size: 16 })),
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement(InputLabel, { label: 'Tipo de solicita\u00e7\u00e3o' },
            React.createElement('select', {
              value: novaPendencia.tipo,
              onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { tipo: e.target.value })); },
              style: inputBaseStyle,
            }, TIPOS_PENDENCIA.map(function (tp) { return React.createElement('option', { key: tp.id, value: tp.id }, tp.label); })),
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
              style: Object.assign({}, inputBaseStyle, { resize: 'vertical' }),
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
              style: Object.assign({}, inputBaseStyle, { resize: 'vertical' }),
            }),
          ),
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' } },
            React.createElement('input', { type: 'checkbox', checked: novaPendencia.suspender_prazo, onChange: function (e) { setNovaPendencia(Object.assign({}, novaPendencia, { suspender_prazo: e.target.checked })); } }),
            'Suspender prazo interno do protocolo at\u00e9 resposta',
          ),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
          React.createElement('button', { onClick: function () { setShowNovaPendencia(false); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceMuted, color: T.text }) }, 'Cancelar'),
          React.createElement('button', { onClick: criarPendencia, disabled: !novaPendencia.titulo.trim(), style: Object.assign({}, btnBaseStyle, { background: T.primary, color: '#fff', opacity: novaPendencia.titulo.trim() ? 1 : 0.6 }) }, 'Criar solicita\u00e7\u00e3o'),
        ),
      ),
    ),

    // Modal: Atribuir
    showAtribuir && React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      onClick: function (e) { if (e.target === e.currentTarget) setShowAtribuir(false); },
    },
      React.createElement('div', {
        style: { width: 400, background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
          React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Atribuir protocolo'),
          React.createElement('button', { onClick: function () { setShowAtribuir(false); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.textMuted }) }, React.createElement(X, { size: 16 })),
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement(InputLabel, { label: 'Operador', required: true },
            React.createElement('input', {
              value: atribuicao.operador_id, placeholder: 'Nome ou matr\u00edcula do operador...',
              onChange: function (e) { setAtribuicao(Object.assign({}, atribuicao, { operador_id: e.target.value })); },
              style: inputBaseStyle,
            }),
          ),
          React.createElement(InputLabel, { label: 'Motivo' },
            React.createElement('textarea', {
              value: atribuicao.motivo, placeholder: 'Motivo da atribui\u00e7\u00e3o...', rows: 2,
              onChange: function (e) { setAtribuicao(Object.assign({}, atribuicao, { motivo: e.target.value })); },
              style: Object.assign({}, inputBaseStyle, { resize: 'vertical' }),
            }),
          ),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
          React.createElement('button', { onClick: function () { setShowAtribuir(false); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceMuted, color: T.text }) }, 'Cancelar'),
          React.createElement('button', { onClick: atribuirProtocolo, disabled: !atribuicao.operador_id.trim(), style: Object.assign({}, btnBaseStyle, { background: T.primary, color: '#fff', opacity: atribuicao.operador_id.trim() ? 1 : 0.6 }) }, 'Atribuir'),
        ),
      ),
    ),

    // Modal: Vincular protocolo
    showRelacionar && React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      onClick: function (e) { if (e.target === e.currentTarget) setShowRelacionar(false); },
    },
      React.createElement('div', {
        style: { width: 380, background: T.surface, borderRadius: T.radiusLg, padding: 20, boxShadow: T.shadowLg },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
          React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, color: T.text } }, 'Vincular protocolo'),
          React.createElement('button', { onClick: function () { setShowRelacionar(false); }, style: Object.assign({}, btnBaseStyle, { padding: '4px 6px', background: 'transparent', color: T.textMuted }) }, React.createElement(X, { size: 16 })),
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
            }, TIPOS_RELACAO.map(function (tp) { return React.createElement('option', { key: tp.id, value: tp.id }, tp.label); })),
          ),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
          React.createElement('button', { onClick: function () { setShowRelacionar(false); }, style: Object.assign({}, btnBaseStyle, { background: T.surfaceMuted, color: T.text }) }, 'Cancelar'),
          React.createElement('button', { onClick: adicionarRelacionamento, disabled: !relacionamento.protocolo_id, style: Object.assign({}, btnBaseStyle, { background: T.primary, color: '#fff', opacity: relacionamento.protocolo_id ? 1 : 0.6 }) }, 'Vincular'),
        ),
      ),
    ),

    // Hidden file input
    React.createElement('input', {
      ref: fileInputRef, type: 'file', multiple: true,
      accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx', style: { display: 'none' },
      onChange: handleFileUpload,
    }),
  );
}

function RightSidebar(_a) {
  var proto = _a.proto, pendenciasAtivas = _a.pendenciasAtivas, relacionados = _a.relacionados,
      slaBarColor = _a.slaBarColor, slaBarBg = _a.slaBarBg, slaBarWidth = _a.slaBarWidth,
      copiarNumero = _a.copiarNumero, copiado = _a.copiado,
      gerarCredenciaisAcesso = _a.gerarCredenciaisAcesso,
      enviarWhatsAppAcesso = _a.enviarWhatsAppAcesso,
      onShowRelacionar = _a.onShowRelacionar;

  var cidadao = proto.contato_nome || proto.cidadao_nome || proto.solicitante_nome;
  var unidadeInterna = proto.setor_solicitante_nome || proto.unidade_solicitante_nome;

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    // Card: Solicitante/Dados
    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
      React.createElement(SectionTitle, { text: 'Solicitante / Dados' }),
      cidadao
        ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('div', {
                style: { width: 40, height: 40, borderRadius: '50%', background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 },
              }, (cidadao || '').charAt(0).toUpperCase()),
              React.createElement('div', { style: { minWidth: 0 } },
                React.createElement('div', { style: { fontSize: 13.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, cidadao),
                proto.cidadao_nome_social && React.createElement('div', { style: { fontSize: 11, color: T.textSecondary } }, 'Nome social: ' + proto.cidadao_nome_social),
              ),
            ),
            React.createElement(CampoInfo, { Icone: Hash, rotulo: 'CPF', valor: proto.contato_cpf || proto.cidadao_cpf, maskCPF: true }),
            proto.cidadao_cnpj && React.createElement(CampoInfo, { Icone: Hash, rotulo: 'CNPJ', valor: proto.cidadao_cnpj }),
            proto.contato_telefone && React.createElement(CampoInfo, { Icone: Phone, rotulo: 'Telefone', valor: proto.contato_telefone }),
            proto.contato_email && React.createElement(CampoInfo, { Icone: AtSign, rotulo: 'E-mail', valor: proto.contato_email }),
          )
        : unidadeInterna
          ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              React.createElement('div', {
                style: { padding: '8px 12px', borderRadius: T.radiusSm, background: T.primarySoft, fontSize: 12, color: T.primary, fontWeight: 600 },
              }, '\uD83C\uDFE2 Protocolo interno'),
              React.createElement(CampoInfo, { Icone: Building2, rotulo: 'Unidade solicitante', valor: unidadeInterna }),
              proto.setor_solicitante_secretaria && React.createElement(CampoInfo, { Icone: Building2, rotulo: 'Secretaria', valor: proto.setor_solicitante_secretaria }),
              proto.solicitante_nome && React.createElement(CampoInfo, { Icone: User, rotulo: 'Servidor solicitante', valor: proto.solicitante_nome }),
              proto.solicitante_matricula && React.createElement(CampoInfo, { Icone: Hash, rotulo: 'Matr\u00edcula', valor: proto.solicitante_matricula }),
            )
          : React.createElement('div', { style: { fontSize: 12, color: T.textMuted, fontStyle: 'italic' } }, 'Sem dados do solicitante'),
    ),

    // Card: Informações do Protocolo
    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
      React.createElement(SectionTitle, { text: 'Informa\u00e7\u00f5es' }),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        React.createElement(CampoSimplesSidebar, { rotulo: 'Setor atual', valor: proto.setor_atual_nome || proto.departamento_nome, Icone: Building2 }),
        React.createElement(CampoSimplesSidebar, { rotulo: 'Respons\u00e1vel', valor: proto.responsavel_nome || proto.operador_nome || 'N\u00e3o atribu\u00eddo', Icone: User }),
        React.createElement(CampoSimplesSidebar, { rotulo: 'Prioridade', valor: PRIORIDADE_LABEL[proto.prioridade] || proto.prioridade, Icone: Flag }),
        React.createElement(CampoSimplesSidebar, { rotulo: 'N\u00edvel de acesso', valor: proto.nivel_acesso === 'PUBLICO' ? 'P\u00fablico' : proto.nivel_acesso === 'RESTRITO' ? 'Restrito' : proto.nivel_acesso === 'SIGILOSO' ? 'Sigiloso' : (proto.nivel_acesso || '\u2014'), Icone: Lock }),
      ),
    ),

    // Card: Datas e SLA
    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
      React.createElement(SectionTitle, { text: 'Datas' }),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        React.createElement(CampoSimplesSidebar, { rotulo: 'Aberto em', valor: formatarDataHora(proto.aberto_em || proto.criado_em), Icone: Calendar }),
        proto.prazo_em && React.createElement(CampoSimplesSidebar, { rotulo: 'Prazo', valor: formatarDataHora(proto.prazo_em), Icone: Clock }),
        React.createElement(CampoSimplesSidebar, { rotulo: '\u00daltima movimenta\u00e7\u00e3o', valor: formatarDataHora(proto.ultima_movimentacao_em || proto.atualizado_em), Icone: RefreshCw }),
        proto.concluido_em && React.createElement(CampoSimplesSidebar, { rotulo: 'Conclu\u00eddo em', valor: formatarDataHora(proto.concluido_em), Icone: CheckCircle }),
      ),

      // SLA bar
      React.createElement('div', { style: { marginTop: 12 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
          React.createElement('span', { style: { fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' } }, 'SLA'),
          React.createElement('span', { style: { fontSize: 10, fontWeight: 700, color: slaBarColor } }, slaBarWidth),
        ),
        React.createElement('div', {
          style: { height: 6, borderRadius: 3, background: slaBarBg, overflow: 'hidden' },
        },
          React.createElement('div', {
            style: { height: '100%', borderRadius: 3, background: slaBarColor, width: slaBarWidth, transition: 'width 0.3s ease' },
          }),
        ),
      ),
    ),

    // Card: Pendências
    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
      React.createElement(SectionTitle, { text: 'Pend\u00eancias' }),
      pendenciasAtivas.length === 0
        ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Sem pend\u00eancias ativas')
        : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            React.createElement('div', {
              style: { display: 'inline-flex', alignSelf: 'flex-start', padding: '3px 10px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: T.warningSoft, color: T.warning },
            }, pendenciasAtivas.length + ' pendente' + (pendenciasAtivas.length > 1 ? 's' : '')),
            pendenciasAtivas.slice(0, 3).map(function (p) {
              return React.createElement('div', { key: p.id, style: { fontSize: 11.5, color: T.text, padding: '4px 0', borderBottom: '1px solid ' + T.border } },
                React.createElement(AlertCircle, { size: 10, style: { color: T.warning, marginRight: 4, display: 'inline', verticalAlign: 'middle' } }),
                p.titulo,
              );
            }),
          ),
    ),

    // Card: Protocolos Relacionados
    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
        React.createElement(SectionTitle, { text: 'Relacionados', style: { marginBottom: 0 } }),
        React.createElement('button', { onClick: onShowRelacionar, style: Object.assign({}, btnBaseStyle, { padding: '4px 8px', background: T.primarySoft, color: T.primary, fontSize: 10.5 }) },
          React.createElement(Plus, { size: 11 }), 'Vincular'),
      ),
      relacionados.length === 0
        ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Nenhum v\u00ednculo')
        : relacionados.slice(0, 5).map(function (r) {
            var tipoLabel = (TIPOS_RELACAO.find(function (t) { return t.id === r.tipo; }) || {}).label || r.tipo;
            return React.createElement('div', {
              key: r.id,
              style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid ' + T.border, fontSize: 11 },
            },
              React.createElement(Link2, { size: 12, style: { color: T.primary, flexShrink: 0 } }),
              React.createElement('span', { style: { fontWeight: 600, fontFamily: 'monospace', color: T.text } }, r.protocolo_numero || r.protocolo_id),
              React.createElement('span', { style: { padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: T.surfaceMuted, color: T.textMuted } }, tipoLabel),
            );
          }),
    ),

    // Card: Quick Links
    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 16, boxShadow: T.shadowMd } },
      React.createElement(SectionTitle, { text: 'Links r\u00e1pidos' }),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        React.createElement('button', {
          onClick: copiarNumero,
          style: Object.assign({}, btnBaseStyle, { justifyContent: 'flex-start', background: T.surfaceAlt, color: T.text, width: '100%' }),
        }, React.createElement(copiado ? Check : Copy, { size: 13 }), copiado ? 'Copiado!' : 'Copiar n\u00famero'),
        React.createElement('button', {
          onClick: gerarCredenciaisAcesso,
          style: Object.assign({}, btnBaseStyle, { justifyContent: 'flex-start', background: T.surfaceAlt, color: T.text, width: '100%' }),
        }, React.createElement(Link2, { size: 13 }), 'Gerar link de acesso'),
        React.createElement('button', {
          onClick: enviarWhatsAppAcesso,
          style: Object.assign({}, btnBaseStyle, { justifyContent: 'flex-start', background: T.whatsappGreenSoft, color: T.whatsappGreen, width: '100%' }),
        }, React.createElement(MessageCircle, { size: 13 }), 'Enviar acesso via WhatsApp'),
      ),
    ),
  );
}

function CampoSimplesSidebar(_a) {
  var rotulo = _a.rotulo, valor = _a.valor, Icone = _a.Icone;
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 } },
    Icone && React.createElement(Icone, { size: 12, style: { color: T.textMuted, flexShrink: 0 } }),
    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
      React.createElement('div', { style: { fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 } }, rotulo),
      React.createElement('div', { style: { color: T.text, fontWeight: 600, wordBreak: 'break-word' } }, valor || '\u2014'),
    ),
  );
}
