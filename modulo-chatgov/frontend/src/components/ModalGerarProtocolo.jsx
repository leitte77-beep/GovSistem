import React, { useState, useEffect, useRef } from 'react';
import {
  X, FileText, User, Hash, Loader2, AlertCircle, CheckCircle,
  ChevronLeft, ChevronRight, Search, Plus, Trash2, Upload,
  Eye, EyeOff, Copy, Check, ExternalLink, QrCode,
  Save, Calendar, Tag, MessageSquare, Shield, Phone, Mail,
  Building, Users, Server, ClipboardList, Paperclip, Bell, Send,
  FileCheck, UserPlus, MapPin, Clock, Download, RefreshCw,
} from 'lucide-react';
import { T } from '../theme';
import { RichTextEditor } from './RichTextEditor.jsx';

var ORIGENS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'portal', label: 'Portal' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'interno', label: 'Interno' },
  { value: 'outro', label: 'Outro' },
];

var PRIORIDADES = [
  { value: 'BAIXA', label: 'Baixa', cor: T.textMuted },
  { value: 'NORMAL', label: 'Normal', cor: T.primary },
  { value: 'ALTA', label: 'Alta', cor: T.warning },
  { value: 'URGENTE', label: 'Urgente', cor: T.danger },
];

var NIVEIS_ACESSO = [
  { value: 'publico', label: 'Público' },
  { value: 'restrito_cidadao', label: 'Restrito ao cidadão' },
  { value: 'restrito_setor', label: 'Restrito ao setor' },
  { value: 'restrito_usuarios', label: 'Restrito a usuários' },
  { value: 'confidencial', label: 'Confidencial' },
  { value: 'sigiloso', label: 'Sigiloso' },
];

var TIPOS_DOCUMENTO = [
  { value: 'documento', label: 'Documento' },
  { value: 'formulario', label: 'Formulário' },
  { value: 'foto', label: 'Foto' },
  { value: 'outro', label: 'Outro' },
];

var PASSOS = [
  { titulo: 'Tipo e Origem', icone: FileText },
  { titulo: 'Solicitante', icone: User },
  { titulo: 'Solicitação', icone: ClipboardList },
  { titulo: 'Documentos', icone: Paperclip },
  { titulo: 'Comunicação', icone: Bell },
  { titulo: 'Revisão', icone: FileCheck },
];

function formatarCPF(valor) {
  var d = (valor || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
  return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
}

function formatarCNPJ(valor) {
  var d = (valor || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return d.slice(0, 2) + '.' + d.slice(2);
  if (d.length <= 8) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5);
  if (d.length <= 12) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8);
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
}

function formatarTelefone(valor) {
  var d = (valor || '').replace(/\D/g, '');

  // O telefone vindo da conversa já traz o código do país (ex.: 554499885588).
  // Sem remover o "55" aqui, o corte em 11 dígitos descartava o último número
  // e o DDD virava "55" — o cadastro ficava com um telefone inexistente e a
  // mensagem do protocolo não chegava ao cidadão.
  if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) {
    d = d.slice(2);
  }
  d = d.slice(0, 11);

  if (d.length <= 2) return d;
  if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
  if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
}

function validarCPF(cpf) {
  var d = cpf.replace(/\D/g, '');
  if (!d) return '';
  if (d.length !== 11) return 'CPF deve ter 11 dígitos';
  if (/^(\d)\1{10}$/.test(d)) return 'CPF inválido';
  var soma = 0;
  for (var i = 0; i < 9; i++) soma += parseInt(d[i]) * (10 - i);
  var resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(d[9])) return 'CPF inválido';
  soma = 0;
  for (var j = 0; j < 10; j++) soma += parseInt(d[j]) * (11 - j);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(d[10])) return 'CPF inválido';
  return '';
}

function validarEmail(email) {
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'E-mail inválido';
}

function formatarBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatarData(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function inputToken() {
  try {
    var a = JSON.parse(localStorage.getItem('chatgov_auth') || '{}');
    return a.token || '';
  } catch (e) { return ''; }
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + inputToken(),
  };
}

export function ModalGerarProtocolo({ conversa, onClose, onCriado }) {
  var isFromConversa = !!(conversa && conversa.id);

  var [step, setStep] = useState(0);
  var [tipo, setTipo] = useState('EXTERNO');
  var [origem, setOrigem] = useState(function () {
    if (isFromConversa && conversa.wa_jid) return 'whatsapp';
    if (isFromConversa) return 'whatsapp';
    return 'presencial';
  });
  var origemDisabled = isFromConversa;

  var [searchQuery, setSearchQuery] = useState('');
  var [searchResults, setSearchResults] = useState([]);
  var [searching, setSearching] = useState(false);
  var [selectedCitizen, setSelectedCitizen] = useState(null);
  var [showNewCitizen, setShowNewCitizen] = useState(false);
  var [citizenNome, setCitizenNome] = useState(isFromConversa ? (conversa.contato_nome || '') : '');
  var [citizenNomeSocial, setCitizenNomeSocial] = useState('');
  var [citizenCPF, setCitizenCPF] = useState('');
  var [citizenCNPJ, setCitizenCNPJ] = useState('');
  var [citizenTelefone, setCitizenTelefone] = useState(isFromConversa ? (conversa.contato_telefone || '') : '');
  var [citizenEmail, setCitizenEmail] = useState('');

  var [unidadeSolicitante, setUnidadeSolicitante] = useState('');
  var [setorSolicitante, setSetorSolicitante] = useState('');

  var [categoriaId, setCategoriaId] = useState('');
  var [servicoId, setServicoId] = useState('');
  var [assunto, setAssunto] = useState('');
  var [descricao, setDescricao] = useState('');
  var [prioridade, setPrioridade] = useState('NORMAL');
  var [nivelAcesso, setNivelAcesso] = useState('publico');
  var [setorInicial, setSetorInicial] = useState('');
  var [responsavelId, setResponsavelId] = useState('');
  var [prazo, setPrazo] = useState('');
  var [tags, setTags] = useState('');
  var [observacaoInterna, setObservacaoInterna] = useState('');

  var [files, setFiles] = useState([]);
  var [dragOver, setDragOver] = useState(false);

  var [gerarSenha, setGerarSenha] = useState(true);
  var [enviarWhatsapp, setEnviarWhatsapp] = useState(false);
  var [enviarEmail, setEnviarEmail] = useState(false);
  var [mensagemCustom, setMensagemCustom] = useState('');
  var [confirmarCidadao, setConfirmarCidadao] = useState(false);

  var [erros, setErros] = useState({});
  var [enviando, setEnviando] = useState(false);
  var [sucesso, setSucesso] = useState(null);
  var [erroGeral, setErroGeral] = useState('');

  var [departamentos, setDepartamentos] = useState([]);
  var [categorias, setCategorias] = useState([]);
  var [servicos, setServicos] = useState([]);
  var [operadores, setOperadores] = useState([]);
  var [carregando, setCarregando] = useState(true);
  var [copiado, setCopiado] = useState('');

  var searchTimer = useRef(null);
  // Chave de idempotência da tentativa de criação em curso.
  var idempotencyRef = useRef(null);
  // '' | 'enviando' | 'ok' | 'erro' — feedback do reenvio de acesso.
  var [envioWhats, setEnvioWhats] = useState('');

  useEffect(function () {
    var token = inputToken();
    var headers = { Authorization: 'Bearer ' + token };
    Promise.all([
      fetch('/api/departamentos', { headers: headers }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch('/api/v1/admin/protocols/categories', { headers: headers }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch('/api/v1/admin/protocols/services', { headers: headers }).then(function (r) { return r.ok ? r.json() : []; }),
    ])
      .then(function (res) {
        setDepartamentos(Array.isArray(res[0]) ? res[0] : []);
        setCategorias(Array.isArray(res[1]) ? res[1] : []);
        setServicos(Array.isArray(res[2]) ? res[2] : []);
      })
      .catch(function () {})
      .finally(function () { setCarregando(false); });
  }, []);

  useEffect(function () {
    if (isFromConversa && conversa.departamento_id) {
      setSetorInicial(conversa.departamento_id);
    }
  }, [conversa, isFromConversa]);

  useEffect(function () {
    if (!setorInicial) { setResponsavelId(''); setOperadores([]); return; }
    var token = inputToken();
    fetch('/api/v1/admin/protocols/operators?departamento_id=' + setorInicial, {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { setOperadores(Array.isArray(data) ? data : []); })
      .catch(function () { setOperadores([]); });
  }, [setorInicial]);

  useEffect(function () {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(function () {
      setSearching(true);
      var token = inputToken();
      fetch('/api/v1/admin/protocols/citizens?busca=' + encodeURIComponent(searchQuery), {
        headers: { Authorization: 'Bearer ' + token },
      })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (data) { setSearchResults(Array.isArray(data) ? data : []); })
        .catch(function () { setSearchResults([]); })
        .finally(function () { setSearching(false); });
    }, 350);
    return function () { clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  function selectCitizen(citizen) {
    if (!citizen) return;
    setSelectedCitizen(citizen);
    setCitizenNome(citizen.nome || '');
    setCitizenNomeSocial(citizen.nome_social || '');
    setCitizenCPF(citizen.cpf ? formatarCPF(citizen.cpf) : '');
    setCitizenCNPJ(citizen.cnpj ? formatarCNPJ(citizen.cnpj) : '');
    setCitizenTelefone(citizen.telefone ? formatarTelefone(citizen.telefone) : '');
    setCitizenEmail(citizen.email || '');
    setShowNewCitizen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function clearCitizen() {
    setSelectedCitizen(null);
    setCitizenNome('');
    setCitizenNomeSocial('');
    setCitizenCPF('');
    setCitizenCNPJ('');
    setCitizenTelefone('');
    setCitizenEmail('');
    setShowNewCitizen(false);
  }

  function handleFiles(fl) {
    var accepted = fl ? Array.from(fl) : [];
    var validFiles = [];
    for (var i = 0; i < accepted.length; i++) {
      var f = accepted[i];
      var ext = (f.name || '').toLowerCase().split('.').pop();
      if (['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'].indexOf(ext) === -1) continue;
      if (f.size > 10 * 1024 * 1024) continue;
      validFiles.push({
        name: f.name,
        size: f.size,
        tipo: 'documento',
        visibilidade: 'publico',
        _file: f,
        _id: Date.now() + '-' + i + '-' + f.name,
      });
    }
    setFiles(function (prev) { return prev.concat(validFiles); });
  }

  function removeFile(id) {
    setFiles(function (prev) { return prev.filter(function (f) { return f._id !== id; }); });
  }

  function updateFile(id, key, value) {
    setFiles(function (prev) {
      return prev.map(function (f) { return f._id === id ? Object.assign({}, f, createObj(key, value)) : f; });
    });
  }

  function createObj(k, v) {
    var o = {};
    o[k] = v;
    return o;
  }

  function validarPasso() {
    var e = {};
    if (step === 0) {
      if (!tipo) e.tipo = 'Selecione o tipo de protocolo';
      if (!origem) e.origem = 'Selecione a origem';
    }
    if (step === 1) {
      if (tipo === 'EXTERNO') {
        if (!selectedCitizen && !showNewCitizen) e.solicitante = 'Selecione ou cadastre um cidadão';
        if (showNewCitizen) {
          if (!citizenNome.trim()) e.citizenNome = 'Nome é obrigatório';
          if (citizenCPF) {
            var erroCPF = validarCPF(citizenCPF);
            if (erroCPF) e.citizenCPF = erroCPF;
          }
          if (citizenEmail) {
            var erroEmail = validarEmail(citizenEmail);
            if (erroEmail) e.citizenEmail = erroEmail;
          }
        }
      } else {
        if (!setorSolicitante) e.setorSolicitante = 'Setor solicitante é obrigatório';
        if (!unidadeSolicitante.trim()) e.unidadeSolicitante = 'Unidade solicitante é obrigatória';
      }
    }
    if (step === 2) {
      if (!assunto.trim()) e.assunto = 'Assunto é obrigatório';
      if (!descricao.trim()) e.descricao = 'Descrição é obrigatória';
      if (!setorInicial) e.setorInicial = 'Setor inicial é obrigatório';
      if (!prioridade) e.prioridade = 'Prioridade é obrigatória';
      if (prazo) {
        var hoje = new Date().toISOString().split('T')[0];
        if (prazo < hoje) e.prazo = 'Prazo não pode ser no passado';
      }
    }
    if (step === 4) {
      if (enviarEmail && !citizenEmail) e.enviarEmail = 'Cidadão não possui e-mail cadastrado';
      if (enviarWhatsapp && !citizenTelefone) e.enviarWhatsapp = 'Cidadão não possui telefone cadastrado';
    }
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function proximo() {
    if (!validarPasso()) return;
    setStep(function (s) { return Math.min(s + 1, PASSOS.length - 1); });
  }

  function anterior() {
    setStep(function (s) { return Math.max(s - 1, 0); });
  }

  // Mapeia o nome do campo devolvido pelo backend para o passo do formulário
  // onde ele é editado, para conseguir levar o usuário até o erro.
  var STEP_DO_CAMPO = {
    origem: 0, tipo: 0,
    cidadao_id: 1, nome_cidadao: 1, cpf_cidadao: 1, cnpj_cidadao: 1,
    telefone_cidadao: 1, email_cidadao: 1, departamento_id: 1,
    assunto: 2, descricao: 2, prioridade: 2, nivel_acesso: 2,
    prazo: 2, prazo_dias: 2,
  };

  // Nome do campo no backend -> chave usada pelo state `erros` do formulário.
  var CAMPO_UI = {
    nome_cidadao: 'citizenNome', cpf_cidadao: 'citizenCPF',
    cnpj_cidadao: 'citizenCNPJ', email_cidadao: 'citizenEmail',
    telefone_cidadao: 'citizenTelefone', cidadao_id: 'solicitante',
    departamento_id: 'setorSolicitante', assunto: 'assunto',
    descricao: 'descricao', prazo: 'prazo', prioridade: 'prioridade',
    origem: 'origem', tipo: 'tipo', nivel_acesso: 'nivelAcesso',
  };

  function aplicarErrosDoServidor(lista) {
    var mapeados = {};
    var menorStep = null;
    lista.forEach(function (item) {
      var chave = CAMPO_UI[item.campo] || item.campo;
      mapeados[chave] = item.mensagem;
      var s = STEP_DO_CAMPO[item.campo];
      if (s !== undefined && (menorStep === null || s < menorStep)) menorStep = s;
    });
    setErros(mapeados);
    // Volta para o primeiro passo que contém um campo com erro.
    if (menorStep !== null) setStep(menorStep);
  }

  function criar() {
    if (!validarPasso()) return;
    setEnviando(true);
    setErroGeral('');
    setErros({});
    // Uma chave por tentativa de criação: se a resposta se perder ou o
    // usuário clicar duas vezes, o backend devolve o mesmo protocolo.
    if (!idempotencyRef.current) {
      idempotencyRef.current = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
    var body = {
      tipo: tipo,
      origem: origem,
      assunto: assunto.trim(),
      descricao: descricao.trim(),
      prioridade: prioridade,
      nivel_acesso: nivelAcesso,
      departamento_id: setorInicial || null,
      responsavel_id: responsavelId || null,
      prazo: prazo || null,
      tags: tags ? tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [],
      observacao_interna: observacaoInterna.trim() || null,
      gerar_senha: gerarSenha,
      categoria_id: categoriaId || null,
      servico_id: servicoId || null,
    };

    if (conversa && conversa.id) {
      body.conversa_id = conversa.id;
    }

    if (tipo === 'EXTERNO') {
      body.nome_cidadao = citizenNome.trim() || null;
      body.nome_social = citizenNomeSocial.trim() || null;
      body.cpf_cidadao = citizenCPF ? citizenCPF.replace(/\D/g, '') : null;
      body.cnpj_cidadao = citizenCNPJ ? citizenCNPJ.replace(/\D/g, '') : null;
      body.telefone_cidadao = citizenTelefone ? citizenTelefone.replace(/\D/g, '') : null;
      body.email_cidadao = citizenEmail.trim() || null;
      body.contato_id = selectedCitizen ? (selectedCitizen.contato_id || null) : null;
    } else {
      body.unidade_solicitante = unidadeSolicitante.trim();
      body.setor_solicitante = setorSolicitante || null;
      body.servidor_solicitante = null;
    }

    body.enviar_whatsapp = enviarWhatsapp;
    body.enviar_email = enviarEmail;
    body.mensagem_custom = mensagemCustom.trim() || null;
    body.confirmar_cidadao = confirmarCidadao;

    var headers = Object.assign({}, apiHeaders(), {
      'Idempotency-Key': idempotencyRef.current,
    });

    fetch('/api/v1/protocols', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) {
            // 422 traz a lista de campos inválidos: mostramos cada mensagem
            // abaixo do respectivo campo em vez de um alerta genérico.
            if (r.status === 422 && Array.isArray(data.erros) && data.erros.length > 0) {
              aplicarErrosDoServidor(data.erros);
              var err = new Error(data.erro || 'Verifique os campos destacados.');
              err.tratado = true;
              throw err;
            }
            throw new Error(data.erro || 'Erro ao criar protocolo');
          }
          // Criação aceita: libera a chave para uma eventual próxima criação.
          idempotencyRef.current = null;
          return enviarAnexos(data.id).then(function (falhas) {
            setSucesso(data);
            if (falhas.length > 0) {
              setErroGeral('Protocolo criado, mas estes anexos não foram enviados: ' + falhas.join(', '));
            }
            if (onCriado) onCriado(data);
          });
        });
      })
      .catch(function (e) {
        setErroGeral(e.message);
      })
      .finally(function () { setEnviando(false); });
  }

  // Os arquivos escolhidos na etapa Documentos ficavam apenas no estado do
  // formulário: a criação envia JSON e nunca chegava a subir os anexos.
  // Depois de criar o protocolo, cada arquivo vai em uma requisição própria.
  function enviarAnexos(protocoloId) {
    if (!protocoloId || files.length === 0) return Promise.resolve([]);

    var falhas = [];
    var sequencia = files.reduce(function (anterior, f) {
      return anterior.then(function () {
        var formData = new FormData();
        formData.append('arquivo', f._file);
        formData.append('tipo_documental', f.tipo || 'documento');
        // "Público" na etapa de documentos significa visível ao cidadão.
        formData.append('nivel_acesso', f.visibilidade === 'publico' ? 'restrito_cidadao' : 'restrito_setor');

        return fetch('/api/v1/protocols/' + protocoloId + '/documents/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + inputToken() },
          body: formData,
        }).then(function (r) {
          if (!r.ok) {
            return r.json().catch(function () { return {}; }).then(function (d) {
              falhas.push(f.name + (d.erro ? ' (' + d.erro + ')' : ''));
            });
          }
          // Documento marcado como público já entra liberado no portal.
          if (f.visibilidade === 'publico') {
            return r.json().then(function (doc) {
              return fetch('/api/v1/protocols/' + protocoloId + '/documents/' + doc.id + '/visibility', {
                method: 'POST',
                headers: apiHeaders(),
                body: JSON.stringify({ visivel_cidadao: true }),
              }).catch(function () {});
            }).catch(function () {});
          }
          return null;
        }).catch(function () {
          falhas.push(f.name);
        });
      });
    }, Promise.resolve());

    return sequencia.then(function () { return falhas; });
  }

  // Reenvia número + código de acesso ao cidadão pelo WhatsApp. O código não
  // volta para a tela: ele segue apenas na mensagem enviada ao destinatário.
  function enviarAcessoWhatsapp() {
    if (!sucesso || !sucesso.id || envioWhats === 'enviando') return;
    setEnvioWhats('enviando');
    fetch('/api/v1/protocols/' + sucesso.id + '/send-whatsapp-access', {
      method: 'POST',
      headers: apiHeaders(),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.erro || 'Falha ao enviar');
          setEnvioWhats('ok');
        });
      })
      .catch(function (e) {
        setEnvioWhats('erro');
        setErroGeral(e.message);
      });
  }

  // Comprovante é gerado pelo backend (HTML imprimível, com QR de consulta).
  function abrirComprovante() {
    if (!sucesso || !sucesso.id) return;
    var authRaw = localStorage.getItem('chatgov_auth');
    var token = '';
    try { token = JSON.parse(authRaw || '{}').token || ''; } catch (e) { token = ''; }

    fetch('/api/v1/protocols/' + sucesso.id + '/receipt', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Não foi possível gerar o comprovante');
        return r.text();
      })
      .then(function (html) {
        var janela = window.open('', '_blank');
        if (!janela) {
          setErroGeral('Permita pop-ups para abrir o comprovante.');
          return;
        }
        janela.document.write(html);
        janela.document.close();
      })
      .catch(function (e) { setErroGeral(e.message); });
  }

  function copiar(texto, label) {
    navigator.clipboard.writeText(texto).then(function () {
      setCopiado(label);
      setTimeout(function () { setCopiado(''); }, 2000);
    }).catch(function () {});
  }

  var inputBase = function (extra) {
    var ex = extra || {};
    return Object.assign({
      width: '100%', boxSizing: 'border-box', padding: '10px 12px',
      borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
      fontSize: 13, color: T.text, background: T.surfaceAlt,
      outline: 'none', fontFamily: T.font, transition: 'border-color 0.15s, box-shadow 0.15s',
    }, ex);
  };

  var labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4,
  };

  var erroStyle = function (temErro) {
    return temErro
      ? { borderColor: T.danger, boxShadow: '0 0 0 2px ' + T.dangerSoft }
      : {};
  };

  if (carregando) {
    return React.createElement('div', {
      style: { position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' },
    },
      React.createElement('div', {
        style: { background: T.surface, borderRadius: T.radiusLg, padding: 40, textAlign: 'center' },
      },
        React.createElement(Loader2, { size: 32, style: { color: T.primary, animation: 'girar 1s linear infinite' } }),
        React.createElement('p', { style: { marginTop: 12, color: T.textSecondary, fontSize: 14 } }, 'Carregando...'),
      ),
    );
  }

  if (sucesso) {
    // Leva à tela de consulta do portal com o número já preenchido.
    var linkPortal = 'https://prot.govsistem.com.br';
    if (sucesso.numero) linkPortal += '/?protocolo=' + encodeURIComponent(sucesso.numero);
    var temWhatsapp = citizenTelefone && citizenTelefone.replace(/\D/g, '').length >= 10;

    return React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      },
      onClick: function (event) { if (event.target === event.currentTarget && onClose) onClose(); },
    },
      React.createElement('div', {
        style: {
          background: T.surface, borderRadius: T.radiusLg, maxWidth: 520, width: '95%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: T.shadowLg,
          animation: 'modal-entrada 0.25s ease-out',
        },
        onClick: function (event) { event.stopPropagation(); },
      },
        React.createElement('div', { style: { padding: 32, textAlign: 'center' } },
          React.createElement('div', {
            style: {
              width: 64, height: 64, borderRadius: '50%', background: T.successSoft,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            },
          }, React.createElement(CheckCircle, { size: 36, style: { color: T.success } })),
          React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Protocolo criado com sucesso!'),
          React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 24px' } }, 'Os dados do protocolo foram registrados no sistema.'),

          React.createElement('div', {
            style: {
              background: T.surfaceAlt, borderRadius: T.radius, padding: 20, marginBottom: 20,
              textAlign: 'left', border: '1px solid ' + T.border,
            },
          },
            React.createElement('div', { style: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 } }, 'Número do protocolo'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
              React.createElement('span', { style: { fontSize: 22, fontWeight: 800, color: T.primary, fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace", letterSpacing: 1 } }, sucesso.numero),
              React.createElement('button', {
                onClick: function () { copiar(sucesso.numero, 'numero'); },
                style: {
                  padding: '6px 10px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                  background: T.surface, color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                },
              },
                copiado === 'numero' ? React.createElement(Check, { size: 13, style: { color: T.success } }) : React.createElement(Copy, { size: 13 }),
                copiado === 'numero' ? 'Copiado' : 'Copiar',
              ),
            ),

            sucesso.senha_acesso && React.createElement(React.Fragment, null,
              React.createElement('div', { style: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 8 } }, 'Código de acesso'),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                React.createElement('span', { style: { fontSize: 20, fontWeight: 800, color: T.text, fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace", letterSpacing: 4 } }, sucesso.senha_acesso),
                React.createElement('button', {
                  onClick: function () { copiar(sucesso.senha_acesso, 'codigo'); },
                  style: {
                    padding: '6px 10px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                    background: T.surface, color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  },
                },
                  copiado === 'codigo' ? React.createElement(Check, { size: 13, style: { color: T.success } }) : React.createElement(Copy, { size: 13 }),
                  copiado === 'codigo' ? 'Copiado' : 'Copiar',
                ),
              ),
            ),

            linhaDetalhe('Solicitante', citizenNome || (tipo === 'EXTERNO' ? '—' : unidadeSolicitante)),
            linhaDetalhe('Assunto', assunto),
            linhaDetalhe('Setor', departamentos.find(function (d) { return d.id === setorInicial; })?.nome || '—'),
            linhaDetalhe('Abertura', formatarData(new Date().toISOString())),
            prazo && linhaDetalhe('Prazo', formatarData(prazo + 'T00:00:00')),
            linhaDetalhe('Prioridade', PRIORIDADES.find(function (p) { return p.value === prioridade; })?.label || prioridade),
            files.length > 0 && linhaDetalhe('Documentos', files.length + ' arquivo(s)'),
          ),

          React.createElement('div', { style: { marginBottom: 20 } },
            React.createElement('p', { style: { fontSize: 12, color: T.textSecondary, margin: '0 0 4px' } }, 'Link para consulta pública:'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' } },
              React.createElement('a', {
                href: linkPortal, target: '_blank', rel: 'noopener noreferrer',
                style: { fontSize: 13, color: T.link, textDecoration: 'none', fontWeight: 600 },
              }, linkPortal),
              React.createElement('button', {
                onClick: function () { copiar(linkPortal, 'link'); },
                style: {
                  padding: '4px 8px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                  background: T.surface, color: T.textSecondary, fontSize: 11, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                },
              }, copiado === 'link' ? React.createElement(Check, { size: 12, style: { color: T.success } }) : React.createElement(Copy, { size: 12 }), copiado === 'link' ? 'Copiado' : 'Copiar'),
            ),
          ),

          React.createElement('div', {
            style: {
              width: 100, height: 100, margin: '0 auto 20px', background: T.surfaceMuted,
              borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid ' + T.border,
            },
          }, React.createElement(QrCode, { size: 48, style: { color: T.textMuted } })),

          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 8 } },
            React.createElement(botaoAcao, { onClick: function () { copiar(sucesso.numero, 'numero'); }, icone: Copy, label: 'Copiar número', cor: T.surface, corTexto: T.text }, copiado === 'numero' ? 'Copiado' : 'Copiar número'),
            sucesso.senha_acesso && React.createElement(botaoAcao, { onClick: function () { copiar(sucesso.senha_acesso, 'codigo'); }, icone: Hash, label: 'Copiar código', cor: T.surface, corTexto: T.text }, copiado === 'codigo' ? 'Copiado' : 'Copiar código'),
            React.createElement(botaoAcao, { onClick: function () { copiar(linkPortal, 'link'); }, icone: ExternalLink, label: 'Copiar link', cor: T.surface, corTexto: T.text }, copiado === 'link' ? 'Copiado' : 'Copiar link'),
            temWhatsapp && React.createElement(botaoAcao, {
              onClick: enviarAcessoWhatsapp,
              icone: Send,
              label: 'WhatsApp',
              cor: T.surface,
              corTexto: T.text,
            }, envioWhats === 'enviando' ? 'Enviando…' : envioWhats === 'ok' ? 'Enviado' : 'WhatsApp'),
            React.createElement(botaoAcao, {
              onClick: abrirComprovante,
              icone: Download,
              label: 'Comprovante',
              cor: T.surface,
              corTexto: T.text,
            }, 'Comprovante'),
          ),

          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 } },
            React.createElement(botaoAcao, {
              onClick: function () {
                setSucesso(null);
                setStep(0);
                setEnviando(false);
                setErroGeral('');
                setErros({});
              },
              icone: RefreshCw, label: 'Criar outro', cor: T.primarySoft, corTexto: T.primary,
            }, 'Criar outro protocolo'),
            React.createElement(botaoAcao, {
              onClick: onClose, icone: X, label: 'Fechar', cor: T.surfaceMuted, corTexto: T.textSecondary,
            }, 'Fechar'),
          ),
        ),
      ),
    );
  }

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', padding: 16,
    },
    onClick: function (event) { if (event.target === event.currentTarget && onClose) onClose(); },
  },
    React.createElement('div', {
      style: {
        background: T.surface, borderRadius: T.radiusLg, width: '100%', maxWidth: 900,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: T.shadowLg, overflow: 'hidden', animation: 'modal-entrada 0.25s ease-out',
      },
      onClick: function (event) { event.stopPropagation(); },
    },
      React.createElement('div', {
        style: {
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid ' + T.border, flexShrink: 0,
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement('div', {
            style: {
              width: 36, height: 36, borderRadius: T.radiusSm, background: T.primaryGradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
          }, React.createElement(FileText, { size: 18, style: { color: '#fff' } })),
          React.createElement('div', null,
            React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: 0 } }, 'Novo Protocolo'),
            isFromConversa && React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, 'Conversa: ' + (conversa.contato_nome || conversa.contato_telefone || 'Cidadão')),
          ),
        ),
        React.createElement('button', {
          onClick: onClose, 'aria-label': 'Fechar',
          style: { width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
        }, React.createElement(X, { size: 18 })),
      ),

      React.createElement('div', {
        style: { padding: '12px 20px', borderBottom: '1px solid ' + T.border, flexShrink: 0 },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          PASSOS.map(function (p, i) {
            return React.createElement(PassoItem, {
              key: p.titulo, icone: p.icone, titulo: p.titulo,
              indice: i, atual: step, ativo: i <= step, ultimo: i < PASSOS.length - 1,
            });
          }),
        ),
      ),

      React.createElement('div', {
        style: { flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0 },
      },
        step === 0 && renderStep1(),
        step === 1 && renderStep2(),
        step === 2 && renderStep3(),
        step === 3 && renderStep4(),
        step === 4 && renderStep5(),
        step === 5 && renderStep6(),
      ),

      React.createElement('div', {
        style: {
          padding: '14px 20px', borderTop: '1px solid ' + T.border,
          display: 'flex', justifyContent: 'space-between', flexShrink: 0,
          background: T.surfaceAlt,
        },
      },
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          step > 0 && React.createElement('button', {
            onClick: anterior,
            style: {
              padding: '10px 18px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
              background: T.surface, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            },
          }, React.createElement(ChevronLeft, { size: 15 }), 'Voltar'),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          erroGeral && React.createElement('span', { style: { fontSize: 12, color: T.danger, marginRight: 8 } }, erroGeral),
          step < PASSOS.length - 1
            ? React.createElement('button', {
              onClick: proximo,
              style: {
                padding: '10px 22px', borderRadius: T.radiusSm, border: 'none',
                background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              },
            }, 'Próximo', React.createElement(ChevronRight, { size: 15 }))
            : React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('button', {
                onClick: onClose,
                style: {
                  padding: '10px 18px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                  background: T.surface, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                },
              }, 'Salvar rascunho'),
              React.createElement('button', {
                onClick: criar, disabled: enviando,
                style: {
                  padding: '10px 24px', borderRadius: T.radiusSm, border: 'none',
                  background: enviando ? T.surfaceMuted : T.primary,
                  color: enviando ? T.textMuted : '#fff',
                  fontSize: 13, fontWeight: 700,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: enviando ? 0.7 : 1,
                },
              }, enviando && React.createElement(Loader2, { size: 14, style: { animation: 'girar 1s linear infinite' } }), 'Criar protocolo'),
            ),
        ),
      ),

      React.createElement('style', null, '\n' +
        '  @keyframes modal-entrada {\n' +
        '    from { opacity: 0; transform: translateY(24px) scale(0.97); }\n' +
        '    to { opacity: 1; transform: translateY(0) scale(1); }\n' +
        '  }\n' +
        '  @keyframes girar { to { transform: rotate(360deg); } }\n' +
      ''),
    ),
  );

  function renderStep1() {
    return React.createElement('div', { style: { maxWidth: 500 } },
      React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Tipo e Origem'),
      React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Defina o tipo de protocolo e a origem da solicitação.'),

      campoLabel('Tipo de protocolo'),
      React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 20 } },
        React.createElement(toggleOpcao, {
          ativo: tipo === 'EXTERNO',
          onClick: function () { setTipo('EXTERNO'); if (showNewCitizen && !selectedCitizen) setShowNewCitizen(true); },
          label: 'Externo',
          desc: 'Solicitação de cidadão/empresa',
          icone: Users,
        }),
        React.createElement(toggleOpcao, {
          ativo: tipo === 'INTERNO',
          onClick: function () { setTipo('INTERNO'); },
          label: 'Interno',
          desc: 'Solicitação entre setores',
          icone: Building,
        }),
      ),

      campoLabel('Origem'),
      React.createElement('select', {
        value: origem, onChange: function (e) { setOrigem(e.target.value); },
        disabled: origemDisabled,
        style: Object.assign({}, inputBase(), erroStyle(!!erros.origem), { marginBottom: 4 }),
      },
        ORIGENS.map(function (o) {
          return React.createElement('option', { key: o.value, value: o.value }, o.label);
        }),
      ),
      origemDisabled && React.createElement('p', { style: { fontSize: 11, color: T.textMuted, margin: '0 0 8px' } }, 'Origem fixada pela conversa do WhatsApp.'),
      erros.origem && React.createElement(erroCampo, null, erros.origem),
    );
  }

  function renderStep2() {
    if (tipo === 'EXTERNO') {
      return React.createElement('div', { style: { maxWidth: 600 } },
        React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Dados do Solicitante'),
        React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Busque um cidadão já cadastrado ou adicione um novo.'),

        !selectedCitizen && !showNewCitizen && React.createElement(React.Fragment, null,
          React.createElement('div', { style: { position: 'relative', marginBottom: 12 } },
            React.createElement(Search, { size: 16, style: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none', zIndex: 1 } }),
            React.createElement('input', {
              value: searchQuery, onChange: function (e) { setSearchQuery(e.target.value); },
              placeholder: 'Buscar por nome, CPF ou telefone...',
              style: Object.assign({}, inputBase(), { paddingLeft: 38, marginBottom: 0 }),
            }),
            searching && React.createElement(Loader2, { size: 14, style: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, animation: 'girar 1s linear infinite' } }),
          ),
          searchResults.length > 0 && React.createElement('div', {
            style: {
              background: T.surface, border: '1px solid ' + T.border, borderRadius: T.radiusSm,
              marginBottom: 12, maxHeight: 200, overflowY: 'auto',
            },
          },
            searchResults.map(function (c) {
              return React.createElement('div', {
                key: c.id,
                onClick: function () { selectCitizen(c); },
                style: {
                  padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid ' + T.border,
                  transition: 'background 0.1s',
                },
                onMouseEnter: function (e) { e.currentTarget.style.background = T.surfaceAlt; },
                onMouseLeave: function (e) { e.currentTarget.style.background = ''; },
              },
                React.createElement('div', { style: { fontWeight: 600, fontSize: 13, color: T.text } }, c.nome),
                React.createElement('div', { style: { fontSize: 11, color: T.textMuted } },
                  [c.cpf ? 'CPF: ' + formatarCPF(c.cpf) : '', c.telefone ? formatarTelefone(c.telefone) : '', c.email].filter(Boolean).join(' · ')),
              );
            }),
          ),
          React.createElement('button', {
            onClick: function () { setShowNewCitizen(true); },
            style: {
              padding: '10px 16px', borderRadius: T.radiusSm, border: '1px dashed ' + T.borderStrong,
              background: 'transparent', color: T.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, width: '100%', justifyContent: 'center',
            },
          }, React.createElement(Plus, { size: 15 }), 'Adicionar novo cidadão'),
        ),

        (selectedCitizen || showNewCitizen) && React.createElement('div', null,
          selectedCitizen && React.createElement('div', {
            style: {
              padding: '10px 12px', background: T.successSoft, borderRadius: T.radiusSm,
              marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: '1px solid ' + T.success + '33',
            },
          },
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, selectedCitizen.nome),
              React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, selectedCitizen.cpf ? 'CPF: ' + formatarCPF(selectedCitizen.cpf) : '', ' ', selectedCitizen.telefone ? formatarTelefone(selectedCitizen.telefone) : ''),
            ),
            React.createElement('button', {
              onClick: clearCitizen,
              style: { padding: '4px 10px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft, color: T.danger, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
            }, 'Remover'),
          ),

          showNewCitizen && React.createElement(React.Fragment, null,
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
              campoInput('Nome completo *', citizenNome, function (e) { setCitizenNome(e.target.value); }, { placeholder: 'Nome completo do cidadão', erro: erros.citizenNome }),
              campoInput('Nome social', citizenNomeSocial, function (e) { setCitizenNomeSocial(e.target.value); }, { placeholder: 'Nome social (opcional)' }),
              campoInput('CPF', citizenCPF, function (e) { setCitizenCPF(formatarCPF(e.target.value)); }, { placeholder: '000.000.000-00', erro: erros.citizenCPF }),
              campoInput('CNPJ', citizenCNPJ, function (e) { setCitizenCNPJ(formatarCNPJ(e.target.value)); }, { placeholder: '00.000.000/0000-00' }),
              campoInput('Telefone com DDD', citizenTelefone, function (e) { setCitizenTelefone(formatarTelefone(e.target.value)); }, { placeholder: '(44) 99999-9999' }),
              campoInput('E-mail', citizenEmail, function (e) { setCitizenEmail(e.target.value); }, { placeholder: 'email@exemplo.com', type: 'email', erro: erros.citizenEmail }),
            ),
            !selectedCitizen && React.createElement('button', {
              onClick: function () { setShowNewCitizen(false); },
              style: {
                padding: '6px 14px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                background: T.surface, color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              },
            }, 'Cancelar novo'),
          ),
        ),

        (!selectedCitizen && !showNewCitizen) && erros.solicitante && React.createElement(erroCampo, null, erros.solicitante),
      );
    }

    return React.createElement('div', { style: { maxWidth: 600 } },
      React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Dados do Setor Solicitante'),
      React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Informe a unidade e o setor que está solicitando o protocolo interno.'),

      campoInput('Unidade solicitante *', unidadeSolicitante, function (e) { setUnidadeSolicitante(e.target.value); }, { placeholder: 'Ex: Secretaria de Saúde', erro: erros.unidadeSolicitante }),
      campoSelect('Setor *', setorSolicitante, function (e) { setSetorSolicitante(e.target.value); }, departamentos, erros.setorSolicitante, '— Selecione o setor —'),
    );
  }

  function renderStep3() {
    return React.createElement('div', { style: { maxWidth: 700 } },
      React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Dados da Solicitação'),
      React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Preencha as informações do protocolo.'),

      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
        campoSelect('Categoria', categoriaId, function (e) { setCategoriaId(e.target.value); }, categorias, null, '— Selecione —', function (c) { return c.nome || c.descricao; }),
        campoSelect('Serviço', servicoId, function (e) { setServicoId(e.target.value); }, servicos, null, '— Selecione —', function (s) { return s.nome || s.descricao; }),
      ),

      campoInput('Assunto *', assunto, function (e) { setAssunto(e.target.value); }, { placeholder: 'Título resumido da solicitação', erro: erros.assunto }),

      React.createElement('label', { style: labelStyle }, 'Descrição *'),
      React.createElement(RichTextEditor, {
        value: descricao,
        onChange: function (html) { setDescricao(html); },
        placeholder: 'Descreva detalhadamente a solicitação...',
        minHeight: 140,
      }),
      erros.descricao && React.createElement(erroCampo, null, erros.descricao),
      React.createElement('div', { style: { height: 8 } }),

      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 } },
        React.createElement('div', null,
          campoLabel('Prioridade *'),
          React.createElement('select', {
            value: prioridade, onChange: function (e) { setPrioridade(e.target.value); },
            style: Object.assign({}, inputBase(), erroStyle(!!erros.prioridade), { marginBottom: 4 }),
          },
            PRIORIDADES.map(function (p) { return React.createElement('option', { key: p.value, value: p.value }, p.label); }),
          ),
          erros.prioridade && React.createElement(erroCampo, null, erros.prioridade),
        ),
        React.createElement('div', null,
          campoLabel('Nível de acesso'),
          React.createElement('select', {
            value: nivelAcesso, onChange: function (e) { setNivelAcesso(e.target.value); },
            style: Object.assign({}, inputBase(), { marginBottom: 0 }),
          },
            NIVEIS_ACESSO.map(function (n) { return React.createElement('option', { key: n.value, value: n.value }, n.label); }),
          ),
        ),
        campoInput('Prazo', prazo, function (e) { setPrazo(e.target.value); }, { type: 'date', erro: erros.prazo }),
      ),

      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
        React.createElement('div', null,
          campoLabel('Setor inicial *'),
          React.createElement('select', {
            value: setorInicial, onChange: function (e) { setSetorInicial(e.target.value); },
            style: Object.assign({}, inputBase(), erroStyle(!!erros.setorInicial), { marginBottom: 4 }),
          },
            React.createElement('option', { value: '' }, '— Selecione —'),
            departamentos.map(function (d) {
              return React.createElement('option', { key: d.id, value: d.id },
                d.secretaria_nome ? d.secretaria_nome + ' › ' + d.nome : d.nome);
            }),
          ),
          erros.setorInicial && React.createElement(erroCampo, null, erros.setorInicial),
        ),
        React.createElement('div', null,
          campoLabel('Responsável inicial'),
          React.createElement('select', {
            value: responsavelId, onChange: function (e) { setResponsavelId(e.target.value); },
            style: Object.assign({}, inputBase(), { marginBottom: 0 }),
            disabled: !setorInicial || operadores.length === 0,
          },
            React.createElement('option', { value: '' }, '— Automático —'),
            operadores.map(function (o) { return React.createElement('option', { key: o.id, value: o.id }, o.nome || o.email); }),
          ),
        ),
      ),

      campoInput('Tags', tags, function (e) { setTags(e.target.value); }, { placeholder: 'Ex: urgente, licitação, fiscal (separadas por vírgula)' }),

      React.createElement('label', { style: labelStyle }, 'Observação interna'),
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('textarea', {
          value: observacaoInterna, onChange: function (e) { setObservacaoInterna(e.target.value); },
          placeholder: 'Observações visíveis apenas para a equipe interna...',
          rows: 3, maxLength: 1000,
          style: Object.assign({}, inputBase(), { resize: 'vertical', marginBottom: 0, minHeight: 70, lineHeight: 1.5, fontFamily: 'inherit' }),
        }),
        React.createElement('span', {
          style: { display: 'block', textAlign: 'right', fontSize: 10.5, color: T.textMuted, marginTop: 2, fontWeight: 500 },
        }, (observacaoInterna || '').length + '/1000'),
      ),
    );
  }

  function renderStep4() {
    return React.createElement('div', null,
      React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Documentos'),
      React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Anexe documentos relevantes ao protocolo. Formatos aceitos: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (máx. 10MB).'),

      React.createElement('div', {
        onDragOver: function (e) { e.preventDefault(); setDragOver(true); },
        onDragLeave: function () { setDragOver(false); },
        onDrop: function (e) { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); },
        onClick: function () {
          var inp = document.getElementById('file-upload-protocolo');
          if (inp) inp.click();
        },
        style: {
          border: '2px dashed ' + (dragOver ? T.primary : T.borderStrong),
          borderRadius: T.radius, padding: '28px 20px',
          textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          background: dragOver ? T.primarySoft : T.surfaceAlt,
          transition: 'all 0.15s',
        },
      },
        React.createElement(Upload, { size: 32, style: { color: T.textMuted, marginBottom: 8 } }),
        React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: T.text, margin: '0 0 4px' } }, 'Arraste arquivos ou clique aqui'),
        React.createElement('p', { style: { fontSize: 12, color: T.textMuted, margin: 0 } }, 'PDF, imagens, documentos — até 10MB cada'),
        React.createElement('input', {
          id: 'file-upload-protocolo', type: 'file', multiple: true,
          accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx',
          onChange: function (e) { handleFiles(e.target.files); e.target.value = ''; },
          style: { display: 'none' },
        }),
      ),

      files.length > 0 && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 } },
        files.map(function (f) {
          return React.createElement('div', {
            key: f._id,
            style: {
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: T.surfaceAlt, borderRadius: T.radiusSm, border: '1px solid ' + T.border,
            },
          },
            React.createElement(Paperclip, { size: 16, style: { color: T.textMuted, flexShrink: 0 } }),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, f.name),
              React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, formatarBytes(f.size)),
            ),
            React.createElement('select', {
              value: f.tipo,
              onChange: function (e) { updateFile(f._id, 'tipo', e.target.value); },
              style: {
                padding: '4px 8px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                fontSize: 11, color: T.text, background: T.surface, cursor: 'pointer',
              },
            },
              TIPOS_DOCUMENTO.map(function (t) { return React.createElement('option', { key: t.value, value: t.value }, t.label); }),
            ),
            React.createElement('select', {
              value: f.visibilidade,
              onChange: function (e) { updateFile(f._id, 'visibilidade', e.target.value); },
              style: {
                padding: '4px 8px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
                fontSize: 11, color: T.text, background: T.surface, cursor: 'pointer',
              },
            },
              React.createElement('option', { value: 'publico' }, 'Público'),
              React.createElement('option', { value: 'interno' }, 'Interno'),
            ),
            React.createElement('button', {
              onClick: function () { removeFile(f._id); },
              style: {
                padding: '4px 6px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft,
                color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center',
              },
            }, React.createElement(Trash2, { size: 14 })),
          );
        }),
      ),
      files.length === 0 && React.createElement('p', { style: { fontSize: 12, color: T.textMuted, textAlign: 'center' } }, 'Nenhum documento anexado.'),
    );
  }

  function renderStep5() {
    var temWhatsapp = citizenTelefone && citizenTelefone.replace(/\D/g, '').length >= 10;
    var temEmail = !!citizenEmail && citizenEmail.includes('@');

    return React.createElement('div', { style: { maxWidth: 600 } },
      React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Comunicação'),
      React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Configure as notificações e o acesso ao protocolo.'),

      React.createElement('div', {
        style: {
          padding: '14px 16px', background: T.surfaceAlt, borderRadius: T.radius, marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: '1px solid ' + T.border,
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement('div', {
            style: {
              width: 36, height: 36, borderRadius: T.radiusSm, background: T.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
          }, React.createElement(Hash, { size: 18, style: { color: T.primary } })),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, 'Código de acesso'),
            React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, 'Permite consulta pública do protocolo'),
          ),
        ),
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
          React.createElement('span', { style: { fontSize: 12, color: T.textSecondary } }, gerarSenha ? 'Sim' : 'Não'),
          React.createElement('div', {
            onClick: function () { setGerarSenha(!gerarSenha); },
            style: {
              width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
              background: gerarSenha ? T.success : T.surfaceMuted, border: '1px solid ' + T.borderStrong,
              transition: 'background 0.2s',
            },
          },
            React.createElement('div', {
              style: {
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, left: gerarSenha ? 23 : 2,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              },
            }),
          ),
        ),
      ),

      tipo === 'EXTERNO' && React.createElement(React.Fragment, null,
        React.createElement('div', {
          style: {
            padding: '14px 16px', background: T.surfaceAlt, borderRadius: T.radius, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid ' + T.border,
            opacity: temWhatsapp ? 1 : 0.5,
          },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            React.createElement('div', {
              style: {
                width: 36, height: 36, borderRadius: T.radiusSm, background: T.whatsappGreenSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              },
            }, React.createElement(Send, { size: 18, style: { color: T.whatsappGreen } })),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, 'Enviar via WhatsApp'),
              React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, temWhatsapp ? citizenTelefone : 'Telefone não informado'),
            ),
          ),
          temWhatsapp
            ? React.createElement(toggle, { valor: enviarWhatsapp, onChange: setEnviarWhatsapp })
            : React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, 'Indisponível'),
        ),
        enviarWhatsapp && erros.enviarWhatsapp && React.createElement(erroCampo, null, erros.enviarWhatsapp),

        React.createElement('div', {
          style: {
            padding: '14px 16px', background: T.surfaceAlt, borderRadius: T.radius, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid ' + T.border,
            opacity: temEmail ? 1 : 0.5,
          },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            React.createElement('div', {
              style: {
                width: 36, height: 36, borderRadius: T.radiusSm, background: T.primarySoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              },
            }, React.createElement(Mail, { size: 18, style: { color: T.primary } })),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, 'Enviar via E-mail'),
              React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, temEmail ? citizenEmail : 'E-mail não informado'),
            ),
          ),
          temEmail
            ? React.createElement(toggle, { valor: enviarEmail, onChange: setEnviarEmail })
            : React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, 'Indisponível'),
        ),
        enviarEmail && erros.enviarEmail && React.createElement(erroCampo, null, erros.enviarEmail),

        React.createElement('label', { style: labelStyle }, 'Mensagem personalizada'),
        React.createElement('textarea', {
          value: mensagemCustom, onChange: function (e) { setMensagemCustom(e.target.value); },
          placeholder: 'Mensagem opcional que será enviada junto com os dados do protocolo...',
          rows: 3,
          style: Object.assign({}, inputBase(), { resize: 'vertical', marginBottom: 12, minHeight: 60 }),
        }),

        React.createElement('div', {
          style: {
            padding: '14px 16px', background: T.surfaceAlt, borderRadius: T.radius, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid ' + T.border,
          },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            React.createElement('div', {
              style: {
                width: 36, height: 36, borderRadius: T.radiusSm, background: T.warningSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              },
            }, React.createElement(Bell, { size: 18, style: { color: T.warning } })),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, 'Solicitar confirmação'),
              React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, 'Cidadão pode confirmar recebimento'),
            ),
          ),
          React.createElement(toggle, { valor: confirmarCidadao, onChange: setConfirmarCidadao }),
        ),
      ),
    );
  }

  function renderStep6() {
    var deptNome = departamentos.find(function (d) { return d.id === setorInicial; })?.nome || '—';
    var respNome = operadores.find(function (o) { return o.id === responsavelId; })?.nome || 'Automático';
    var catNome = categorias.find(function (c) { return c.id === categoriaId; })?.nome || '—';
    var servNome = servicos.find(function (s) { return s.id === servicoId; })?.nome || '—';
    var priorNome = PRIORIDADES.find(function (p) { return p.value === prioridade; })?.label || prioridade;
    var nivelNome = NIVEIS_ACESSO.find(function (n) { return n.value === nivelAcesso; })?.label || nivelAcesso;
    var origemNome = ORIGENS.find(function (o) { return o.value === origem; })?.label || origem;

    return React.createElement('div', { style: { maxWidth: 650 } },
      React.createElement('h4', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, 'Revisão dos Dados'),
      React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Confira todas as informações antes de criar o protocolo.'),

      erroGeral && React.createElement('div', {
        style: { padding: '10px 12px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 12.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 },
      }, React.createElement(AlertCircle, { size: 14 }), erroGeral),

      React.createElement('div', {
        style: {
          background: T.surfaceAlt, borderRadius: T.radius, padding: 20, border: '1px solid ' + T.border, marginBottom: 16,
        },
      },
        secaoRevisao('Tipo e Origem', [
          { label: 'Tipo', valor: tipo === 'EXTERNO' ? 'Externo' : 'Interno' },
          { label: 'Origem', valor: origemNome },
        ]),
        secaoRevisao('Solicitante',
          tipo === 'EXTERNO'
            ? [
              { label: 'Nome', valor: citizenNome || '—' },
              citizenNomeSocial && { label: 'Nome social', valor: citizenNomeSocial },
              citizenCPF && { label: 'CPF', valor: citizenCPF },
              citizenCNPJ && { label: 'CNPJ', valor: citizenCNPJ },
              { label: 'Telefone', valor: citizenTelefone || '—' },
              { label: 'E-mail', valor: citizenEmail || '—' },
            ].filter(Boolean)
            : [
              { label: 'Unidade', valor: unidadeSolicitante || '—' },
              { label: 'Setor', valor: departamentos.find(function (d) { return d.id === setorSolicitante; })?.nome || '—' },
            ]
        ),
        secaoRevisao('Solicitação', [
          catNome !== '—' && { label: 'Categoria', valor: catNome },
          servNome !== '—' && { label: 'Serviço', valor: servNome },
          { label: 'Assunto', valor: assunto || '—' },
          { label: 'Descrição', valor: descricao || '—' },
          { label: 'Prioridade', valor: priorNome, badge: prioridade === 'URGENTE' ? T.danger : prioridade === 'ALTA' ? T.warning : undefined },
          { label: 'Acesso', valor: nivelNome },
          { label: 'Setor inicial', valor: deptNome },
          { label: 'Responsável', valor: respNome },
          prazo && { label: 'Prazo', valor: formatarData(prazo + 'T00:00:00') },
          tags && { label: 'Tags', valor: tags },
        ].filter(Boolean)),
        files.length > 0 && secaoRevisao('Documentos', [
          { label: 'Quantidade', valor: files.length + ' arquivo(s)' },
          { label: 'Lista', valor: files.map(function (f) { return f.name; }).join(', ') },
        ]),
        secaoRevisao('Comunicação', [
          { label: 'Código de acesso', valor: gerarSenha ? 'Sim' : 'Não' },
          enviarWhatsapp && { label: 'WhatsApp', valor: 'Enviar para ' + citizenTelefone },
          enviarEmail && { label: 'E-mail', valor: 'Enviar para ' + citizenEmail },
          confirmarCidadao && { label: 'Confirmação', valor: 'Solicitada' },
          mensagemCustom && { label: 'Mensagem', valor: mensagemCustom },
        ].filter(Boolean).length > 0
          ? [
            { label: 'Código de acesso', valor: gerarSenha ? 'Sim' : 'Não' },
            enviarWhatsapp && { label: 'WhatsApp', valor: 'Enviar para ' + citizenTelefone },
            enviarEmail && { label: 'E-mail', valor: 'Enviar para ' + citizenEmail },
            confirmarCidadao && { label: 'Confirmação', valor: 'Solicitada' },
            mensagemCustom && { label: 'Mensagem', valor: mensagemCustom },
          ].filter(Boolean)
          : [{ label: 'Status', valor: 'Sem notificações adicionais' }],
        ),
      ),
    );
  }

  function secaoRevisao(titulo, linhas) {
    return React.createElement('div', { style: { marginBottom: 14 } },
      React.createElement('div', { style: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 } }, titulo),
      linhas.length > 0 ? linhas.map(function (l) {
        return React.createElement('div', { key: l.label, style: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5 } },
          React.createElement('span', { style: { color: T.textSecondary, flexShrink: 0, marginRight: 16 } }, l.label),
          React.createElement('span', {
            style: {
              color: T.text, fontWeight: 500, textAlign: 'right',
              background: l.badge ? (l.badge + '22') : 'transparent',
              color: l.badge || T.text,
              padding: l.badge ? '1px 6px' : 0,
              borderRadius: l.badge ? T.radiusSm : 0,
              fontSize: l.badge ? 11 : 12.5,
              fontWeight: l.badge ? 700 : 500,
            },
          }, l.valor),
        );
      }) : React.createElement('div', { style: { fontSize: 12, color: T.textMuted, fontStyle: 'italic' } }, 'Nenhuma informação.'),
    );
  }

  function campoLabel(texto) {
    return React.createElement('label', { style: labelStyle }, texto);
  }

  function campoInput(label, valor, onChange, opts) {
    var o = opts || {};
    return React.createElement('div', { style: { marginBottom: 12 } },
      React.createElement('label', { style: labelStyle }, label),
      React.createElement('input', {
        value: valor, onChange: onChange,
        type: o.type || 'text',
        placeholder: o.placeholder || '',
        disabled: o.disabled,
        style: Object.assign({}, inputBase(), erroStyle(!!o.erro), o.style || {}, { marginBottom: 4 }),
      }),
      o.erro && React.createElement(erroCampo, null, o.erro),
    );
  }

  function campoSelect(label, valor, onChange, opcoes, erroCampoMsg, placeholder, formatLabel) {
    return React.createElement('div', { style: { marginBottom: 12 } },
      React.createElement('label', { style: labelStyle }, label),
      React.createElement('select', {
        value: valor, onChange: onChange,
        style: Object.assign({}, inputBase(), erroStyle(!!erroCampoMsg), { marginBottom: 4 }),
      },
        React.createElement('option', { value: '' }, placeholder || '— Selecione —'),
        (opcoes || []).map(function (o) {
          return React.createElement('option', { key: o.id, value: o.id },
            formatLabel ? formatLabel(o) : (o.secretaria_nome ? o.secretaria_nome + ' › ' + o.nome : (o.nome || o.descricao || o.id)));
        }),
      ),
      erroCampoMsg && React.createElement(erroCampo, null, erroCampoMsg),
    );
  }

  function erroCampo(props) {
    return React.createElement('div', {
      style: { fontSize: 11, color: T.danger, display: 'flex', alignItems: 'center', gap: 4, marginTop: -2, marginBottom: 8 },
    }, React.createElement(AlertCircle, { size: 12 }), props.children);
  }

  function linhaDetalhe(label, valor) {
    return React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12.5 } },
      React.createElement('span', { style: { color: T.textSecondary } }, label),
      React.createElement('span', { style: { color: T.text, fontWeight: 500 } }, valor),
    );
  }

  function botaoAcao(props) {
    return React.createElement('button', {
      onClick: props.onClick,
      style: {
        padding: '8px 14px', borderRadius: T.radiusSm, border: '1px solid ' + T.borderStrong,
        background: props.cor || T.surface, color: props.corTexto || T.text,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      },
    },
      props.icone && React.createElement(props.icone, { size: 14 }),
      props.children || props.label,
    );
  }
}

function PassoItem(props) {
  var { icone, titulo, indice, atual, ativo, ultimo } = props;
  var Icone = icone;
  var cor = indice === atual ? T.primary : ativo ? T.success : T.textMuted;
  var bg = indice === atual ? T.primarySoft : ativo ? T.successSoft : T.surfaceMuted;

  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 } },
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 } },
      React.createElement('div', {
        style: {
          width: 34, height: 34, borderRadius: '50%',
          background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s', border: '2px solid ' + (indice === atual ? T.primary : 'transparent'),
        },
      },
        indice < atual
          ? React.createElement(CheckCircle, { size: 18, style: { color: T.success } })
          : React.createElement(Icone, { size: 16, style: { color: cor } }),
      ),
      React.createElement('span', {
        style: {
          fontSize: 10, fontWeight: indice === atual ? 700 : 500, color: cor,
          marginTop: 4, whiteSpace: 'nowrap', textAlign: 'center',
          display: 'block', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis',
        },
      }, titulo),
    ),
    ultimo && React.createElement('div', {
      style: {
        height: 2, flex: 1, background: indice < atual ? T.success : T.border,
        marginBottom: 18, borderRadius: 1, transition: 'background 0.2s',
      },
    }),
  );
}

function toggleOpcao(props) {
  var { ativo, onClick, label, desc, icone } = props;
  var Icon = icone;
  return React.createElement('div', {
    onClick: onClick,
    style: {
      flex: 1, padding: '14px 16px', borderRadius: T.radius,
      border: '2px solid ' + (ativo ? T.primary : T.borderStrong),
      background: ativo ? T.primarySoft : T.surfaceAlt,
      cursor: 'pointer', transition: 'all 0.15s',
      display: 'flex', alignItems: 'center', gap: 10,
    },
  },
    Icon && React.createElement(Icon, { size: 22, style: { color: ativo ? T.primary : T.textMuted } }),
    React.createElement('div', null,
      React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: ativo ? T.primary : T.text } }, label),
      React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, desc),
    ),
    ativo && React.createElement(CheckCircle, { size: 18, style: { color: T.primary, marginLeft: 'auto' } }),
  );
}

function toggle(props) {
  return React.createElement('div', {
    onClick: function () { props.onChange(!props.valor); },
    style: {
      width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer', flexShrink: 0,
      background: props.valor ? T.success : T.surfaceMuted,
      border: '1px solid ' + (props.valor ? T.success : T.borderStrong),
      transition: 'background 0.2s',
    },
  },
    React.createElement('div', {
      style: {
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: props.valor ? 23 : 2,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      },
    }),
  );
}
