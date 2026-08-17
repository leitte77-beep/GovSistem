import React, { useState, useEffect, useMemo } from 'react';
import { Building2, FolderTree, Users, Smartphone, Plus, Trash2, Wifi, WifiOff, LogOut, QrCode, KeyRound, Ban, SlidersHorizontal, Save, Loader2, Check, Bot, FileText, Brain, MessageSquare, Bell, BellOff, Volume2, Network, Route, ShieldCheck, Search, ChevronDown, ChevronRight, X } from 'lucide-react';
import { T, CORES_DEPT } from '../theme';
import {
  fetchSecretarias, criarSecretaria, editarSecretaria, excluirSecretaria,
  fetchDepartamentos, criarDepartamento, editarDepartamento, excluirDepartamento,
  fetchOperadores, editarOperador, fetchWhatsAppStatus,
  fetchConfig, salvarConfig, fetchBloqueios, criarBloqueio, removerBloqueio,
  fetchChatbotConfig, salvarChatbotConfig,
  fetchPalavrasChave, criarPalavraChave, editarPalavraChave, excluirPalavraChave,
  fetchFaqs, criarFaq, editarFaq, excluirFaq,
  fetchTemplates, criarTemplate, editarTemplate, excluirTemplate,
  fetchIrisConfig, salvarIrisConfig,
} from '../api';
import { fetchConfigNotificacoes, salvarConfigNotificacoes } from '../api/evolucoes';
import { useSocket } from '../context/SocketContext';
import {
  AbaCanaisAvancados, AbaRegrasOperacionais, AbaGovernanca, VersoesIris, VersoesChatbot,
} from './AdministracaoAvancada';

const GRUPOS_CONFIGURACAO = [
  {
    id: 'integracoes',
    label: 'Integrações',
    abas: [
      { id: 'conexao', label: 'Conexão', icon: Smartphone },
      { id: 'canais', label: 'Canais', icon: Network },
    ],
  },
  {
    id: 'atendimento',
    label: 'Atendimento',
    abas: [
      { id: 'geral', label: 'Atendimento', icon: SlidersHorizontal },
      { id: 'regras', label: 'SLA e roteamento', icon: Route },
      { id: 'bloqueios', label: 'Bloqueios', icon: Ban },
    ],
  },
  {
    id: 'inteligencia',
    label: 'Inteligência e conteúdo',
    abas: [
      { id: 'chatbot', label: 'Chatbot', icon: Bot },
      { id: 'iris', label: 'Iris IA', icon: Brain },
      { id: 'templates', label: 'Templates', icon: MessageSquare },
    ],
  },
  {
    id: 'estrutura',
    label: 'Estrutura organizacional',
    abas: [
      { id: 'secretarias', label: 'Secretarias', icon: Building2 },
      { id: 'departamentos', label: 'Departamentos', icon: FolderTree },
      { id: 'equipe', label: 'Equipe', icon: Users },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    abas: [
      { id: 'notificacoes', label: 'Notificações', icon: Bell },
      { id: 'governanca', label: 'Governança', icon: ShieldCheck },
    ],
  },
];

export function PaginaConfiguracoes({ onOpenQR, breakpoint }) {
  const [aba, setAba] = useState('conexao');
  const ehMobile = breakpoint === 'mobile';
  const abas = GRUPOS_CONFIGURACAO.flatMap((grupo) => grupo.abas);
  const abaAtual = abas.find((item) => item.id === aba);

  return React.createElement('div', { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, overflow: 'hidden' } },
    React.createElement('div', {
      style: {
        padding: ehMobile ? '18px 16px 14px' : '22px 32px 18px',
        background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        minWidth: 0,
      },
    },
      React.createElement('h1', { style: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: '0 0 4px' } }, 'Configurações'),
      React.createElement('p', { style: { fontSize: 13, color: T.textMuted, margin: 0, lineHeight: '20px' } }, 'Administre integrações, regras, equipe e estrutura do órgão.'),
    ),
    ehMobile && React.createElement('nav', {
      'aria-label': 'Seções de configurações',
      style: {
        display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto',
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        WebkitOverflowScrolling: 'touch',
      },
    },
      abas.map((item) => React.createElement('button', {
        key: item.id, type: 'button', onClick: () => setAba(item.id),
        'aria-current': aba === item.id ? 'page' : undefined,
        style: {
          minHeight: 38, padding: '0 13px', borderRadius: 20, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          border: `1px solid ${aba === item.id ? T.primary : T.border}`,
          background: aba === item.id ? T.primarySoft : T.surface,
          color: aba === item.id ? (T.primaryHover || T.primary) : T.textSecondary,
          fontSize: 12, fontWeight: 700,
        },
      }, React.createElement(item.icon, { size: 15 }), item.label)),
    ),
    React.createElement('div', { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' } },
      !ehMobile && React.createElement('aside', {
        style: {
          width: 244, minWidth: 244, padding: '20px 14px', overflowY: 'auto',
          background: T.surface, borderRight: `1px solid ${T.border}`,
        },
      },
        React.createElement('nav', { 'aria-label': 'Seções de configurações', style: { display: 'grid', gap: 18 } },
          GRUPOS_CONFIGURACAO.map((grupo) => React.createElement('div', { key: grupo.id },
            React.createElement('div', {
              style: {
                padding: '0 10px 6px', color: T.textMuted, fontSize: 10,
                fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
              },
            }, grupo.label),
            React.createElement('div', { style: { display: 'grid', gap: 2 } },
              grupo.abas.map((item) => React.createElement('button', {
                key: item.id, type: 'button', onClick: () => setAba(item.id),
                'aria-current': aba === item.id ? 'page' : undefined,
                style: {
                  width: '100%', minHeight: 40, padding: '0 10px', border: 'none',
                  borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', gap: 9,
                  background: aba === item.id ? T.primarySoft : 'transparent',
                  color: aba === item.id ? (T.primaryHover || T.primary) : T.textSecondary,
                  cursor: 'pointer', fontSize: 13, fontWeight: aba === item.id ? 700 : 600,
                  textAlign: 'left',
                },
              }, React.createElement(item.icon, { size: 16 }), item.label)),
            ),
          )),
        ),
      ),
      React.createElement('div', {
        style: {
          flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden',
          padding: ehMobile ? 16 : '24px 28px 32px', boxSizing: 'border-box',
        },
      },
        React.createElement('div', { style: { maxWidth: 1040 } },
          abaAtual && React.createElement('div', { style: { marginBottom: 16 } },
            React.createElement('h2', { style: { margin: 0, color: T.text, fontSize: 18 } }, abaAtual.label),
          ),
          aba === 'conexao' && React.createElement(AbaConexao, { onOpenQR }),
          aba === 'canais' && React.createElement(AbaCanaisAvancados),
          aba === 'geral' && React.createElement(AbaGeral),
          aba === 'regras' && React.createElement(AbaRegrasOperacionais),
          aba === 'chatbot' && React.createElement(AbaChatbot),
          aba === 'iris' && React.createElement(AbaIris),
          aba === 'templates' && React.createElement(AbaTemplates),
          aba === 'bloqueios' && React.createElement(AbaBloqueios),
          aba === 'secretarias' && React.createElement(AbaSecretarias),
          aba === 'departamentos' && React.createElement(AbaDepartamentos),
          aba === 'equipe' && React.createElement(AbaEquipe),
          aba === 'notificacoes' && React.createElement(AbaNotificacoes),
          aba === 'governanca' && React.createElement(AbaGovernanca),
        ),
      ),
    ),
  );
}

// ---------- estilos compartilhados ----------
const painel = { width: '100%', maxWidth: 1040, background: T.surface, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: 'hidden', boxSizing: 'border-box' };
const painelHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '18px 22px', borderBottom: `1px solid ${T.border}` };
const tituloPainel = { fontSize: 16, fontWeight: 700, color: T.text };
const btnAdd = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: T.primary, color: '#fff', border: 'none', borderRadius: T.radiusSm, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 38, boxSizing: 'border-box' };
const linha = { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap', minWidth: 0 };
const input = { padding: '10px 12px', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', maxWidth: '100%' };
const btnIcon = { background: 'transparent', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 6, display: 'flex' };

function PontoCor({ cor }) {
  return React.createElement('span', { style: { width: 12, height: 12, borderRadius: '50%', background: cor || T.primary, flexShrink: 0 } });
}

// ---------- Secretarias ----------
function AbaSecretarias() {
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_DEPT[0]);

  const carregar = () => fetchSecretarias().then(setLista).catch(console.error);
  useEffect(() => { carregar(); }, []);

  const criar = async () => {
    if (!nome.trim()) return;
    await criarSecretaria({ nome: nome.trim(), cor });
    setNome(''); carregar();
  };
  const remover = async (id) => { if (confirm('Excluir esta secretaria?')) { await excluirSecretaria(id); carregar(); } };

  return React.createElement('div', { style: painel },
    React.createElement('div', { style: painelHead },
      React.createElement('div', { style: tituloPainel }, 'Secretarias'),
    ),
    React.createElement('div', { style: { ...linha, background: T.surfaceAlt } },
      React.createElement('input', { value: nome, onChange: (e) => setNome(e.target.value), placeholder: 'Nome da secretaria', style: { ...input, flex: 1 } }),
      React.createElement(SeletorCor, { cor, onChange: setCor }),
      React.createElement('button', { onClick: criar, style: btnAdd }, React.createElement(Plus, { size: 16 }), 'Adicionar'),
    ),
    lista.length === 0
      ? React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhuma secretaria cadastrada.')
      : lista.map((s) =>
          React.createElement('div', { key: s.id, style: linha },
            React.createElement(PontoCor, { cor: s.cor }),
            React.createElement('span', { style: { flex: 1, fontSize: 14, fontWeight: 600, color: T.text } }, s.nome),
            React.createElement('span', { style: { fontSize: 12, color: T.textMuted } }, `${s.total_departamentos || 0} depto(s)`),
            React.createElement('button', { onClick: () => remover(s.id), style: btnIcon, title: 'Excluir' }, React.createElement(Trash2, { size: 16 })),
          )),
  );
}

// ---------- Departamentos ----------
function AbaDepartamentos() {
  const [lista, setLista] = useState([]);
  const [secretarias, setSecretarias] = useState([]);
  const [nome, setNome] = useState('');
  const [secId, setSecId] = useState('');
  const [cor, setCor] = useState(CORES_DEPT[1]);

  const carregar = () => {
    fetchDepartamentos().then(setLista).catch(console.error);
    fetchSecretarias().then(setSecretarias).catch(console.error);
  };
  useEffect(() => { carregar(); }, []);

  const criar = async () => {
    if (!nome.trim()) return;
    await criarDepartamento({ nome: nome.trim(), cor, secretaria_id: secId || null });
    setNome(''); carregar();
  };
  const remover = async (id) => { if (confirm('Excluir este departamento?')) { await excluirDepartamento(id); carregar(); } };
  const trocarSecretaria = async (dep, novaSecId) => { await editarDepartamento(dep.id, { secretaria_id: novaSecId || null }); carregar(); };

  return React.createElement('div', { style: painel },
    React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Departamentos')),
    React.createElement('div', { style: { ...linha, background: T.surfaceAlt, flexWrap: 'wrap' } },
      React.createElement('input', { value: nome, onChange: (e) => setNome(e.target.value), placeholder: 'Nome do departamento', style: { ...input, flex: 1, minWidth: 160 } }),
      React.createElement('select', { value: secId, onChange: (e) => setSecId(e.target.value), style: input },
        React.createElement('option', { value: '' }, 'Sem secretaria'),
        secretarias.map((s) => React.createElement('option', { key: s.id, value: s.id }, s.nome)),
      ),
      React.createElement(SeletorCor, { cor, onChange: setCor }),
      React.createElement('button', { onClick: criar, style: btnAdd }, React.createElement(Plus, { size: 16 }), 'Adicionar'),
    ),
    lista.length === 0
      ? React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhum departamento cadastrado.')
      : lista.map((d) =>
          React.createElement('div', { key: d.id, style: linha },
            React.createElement(PontoCor, { cor: d.cor }),
            React.createElement('span', { style: { flex: 1, fontSize: 14, fontWeight: 600, color: T.text } }, d.nome),
            React.createElement('select', {
              value: d.secretaria_id || '', onChange: (e) => trocarSecretaria(d, e.target.value),
              style: { ...input, padding: '6px 10px', fontSize: 13 },
            },
              React.createElement('option', { value: '' }, 'Sem secretaria'),
              secretarias.map((s) => React.createElement('option', { key: s.id, value: s.id }, s.nome)),
            ),
            React.createElement('button', { onClick: () => remover(d.id), style: btnIcon, title: 'Excluir' }, React.createElement(Trash2, { size: 16 })),
          )),
  );
}

// ---------- Equipe ----------
const PAPEIS_EQUIPE = [
  { id: 'operador', label: 'Operador' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'admin', label: 'Administrador' },
];
const SEM_SECRETARIA = '__sem_secretaria__';

function semAcento(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function iniciaisDe(nome) {
  const partes = String(nome || '?').trim().split(/\s+/);
  const primeira = partes[0] ? partes[0][0] : '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

// Agrupa os departamentos pela secretaria a que pertencem (mantém a ordem vinda da API).
function agruparPorSecretaria(departamentos) {
  const mapa = new Map();
  departamentos.forEach((d) => {
    const chave = d.secretaria_id || SEM_SECRETARIA;
    if (!mapa.has(chave)) {
      mapa.set(chave, { id: chave, nome: d.secretaria_nome || 'Sem secretaria', cor: d.secretaria_cor, deptos: [] });
    }
    mapa.get(chave).deptos.push(d);
  });
  return Array.from(mapa.values());
}

const chipSetor = (cor) => ({
  fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
  border: `1px solid ${cor}40`, background: `${cor}14`, color: cor,
  maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis',
});
const btnSecundario = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: T.textSecondary,
  border: `1px solid ${T.borderStrong}`, borderRadius: T.radiusSm, padding: '7px 12px',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

function AvatarOperador({ op }) {
  return React.createElement('div', { style: { position: 'relative', flexShrink: 0 } },
    op.avatar_url
      ? React.createElement('img', { src: op.avatar_url, alt: '', style: { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' } })
      : React.createElement('div', {
          style: {
            width: 34, height: 34, borderRadius: '50%', background: T.primarySoft, color: T.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
          },
        }, iniciaisDe(op.nome)),
    React.createElement('span', {
      title: op.online ? 'Online' : 'Offline',
      style: {
        position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%',
        background: op.online ? T.online : T.offline, border: `2px solid ${T.surface}`,
      },
    }),
  );
}

function AbaEquipe() {
  const [operadores, setOperadores] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroPapel, setFiltroPapel] = useState('');
  const [filtroSecretaria, setFiltroSecretaria] = useState('');
  const [editando, setEditando] = useState(null);
  const [salvandoPapel, setSalvandoPapel] = useState(null);

  const carregar = () => {
    setCarregando(true);
    Promise.all([fetchOperadores(), fetchDepartamentos()])
      .then(([ops, deps]) => { setOperadores(ops || []); setDepartamentos(deps || []); })
      .catch(console.error)
      .finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(); }, []);

  const porId = useMemo(() => {
    const m = new Map();
    departamentos.forEach((d) => m.set(d.id, d));
    return m;
  }, [departamentos]);
  const grupos = useMemo(() => agruparPorSecretaria(departamentos), [departamentos]);
  const setoresDo = (op) => (op.departamento_ids || []).map((id) => porId.get(id)).filter(Boolean);

  const lista = useMemo(() => {
    const termo = semAcento(busca.trim());
    return operadores.filter((op) => {
      if (filtroPapel && op.papel !== filtroPapel) return false;
      if (filtroSecretaria) {
        const setores = (op.departamento_ids || []).map((id) => porId.get(id)).filter(Boolean);
        if (!setores.some((d) => (d.secretaria_id || SEM_SECRETARIA) === filtroSecretaria)) return false;
      }
      if (!termo) return true;
      return semAcento(op.nome).includes(termo) || semAcento(op.email).includes(termo);
    });
  }, [operadores, busca, filtroPapel, filtroSecretaria, porId]);

  const salvarPapel = async (op, papel) => {
    const anterior = op.papel;
    setOperadores((prev) => prev.map((o) => (o.id === op.id ? { ...o, papel } : o)));
    setSalvandoPapel(op.id);
    try {
      await editarOperador(op.id, { papel });
    } catch (e) {
      setOperadores((prev) => prev.map((o) => (o.id === op.id ? { ...o, papel: anterior } : o)));
      alert(e.message || 'Erro ao alterar o perfil');
    } finally {
      setSalvandoPapel(null);
    }
  };

  const salvarAcessos = async (op, ids) => {
    await editarOperador(op.id, { departamento_ids: ids });
    setOperadores((prev) => prev.map((o) => (o.id === op.id ? { ...o, departamento_ids: ids } : o)));
  };

  const filtroAtivo = !!(busca.trim() || filtroPapel || filtroSecretaria);

  const resumoAcessos = (op) => {
    const setores = setoresDo(op);
    if (setores.length === 0) {
      return React.createElement('span', { style: { fontSize: 12.5, color: T.textMuted, fontStyle: 'italic' } }, 'Nenhum setor');
    }
    const visiveis = setores.slice(0, 2);
    const restantes = setores.length - visiveis.length;
    const titulo = setores.map((d) => (d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome)).join('\n');
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }, title: titulo },
      visiveis.map((d) => React.createElement('span', { key: d.id, style: chipSetor(d.cor || T.primary) }, d.nome)),
      restantes > 0 && React.createElement('span', { style: { ...chipSetor(T.textSecondary), fontWeight: 700 } }, `+${restantes}`),
    );
  };

  return React.createElement('div', { style: { ...painel, maxWidth: 1040 } },
    React.createElement('div', { style: painelHead },
      React.createElement('div', null,
        React.createElement('div', { style: tituloPainel }, 'Equipe e permissões'),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 3 } },
          carregando
            ? 'Carregando...'
            : `${lista.length} de ${operadores.length} pessoa(s) · ${departamentos.length} setor(es) cadastrado(s)`),
      ),
    ),

    // filtros
    React.createElement('div', { style: { ...linha, background: T.surfaceAlt, gap: 10 } },
      React.createElement('div', { style: { position: 'relative', flex: '1 1 220px', minWidth: 180 } },
        React.createElement(Search, { size: 15, style: { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' } }),
        React.createElement('input', {
          value: busca, onChange: (e) => setBusca(e.target.value), placeholder: 'Buscar por nome ou e-mail',
          style: { ...input, width: '100%', paddingLeft: 32, fontSize: 13 },
        }),
      ),
      React.createElement('select', {
        value: filtroPapel, onChange: (e) => setFiltroPapel(e.target.value),
        style: { ...input, padding: '9px 10px', fontSize: 13 },
      },
        React.createElement('option', { value: '' }, 'Todos os perfis'),
        PAPEIS_EQUIPE.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.label)),
      ),
      React.createElement('select', {
        value: filtroSecretaria, onChange: (e) => setFiltroSecretaria(e.target.value),
        style: { ...input, padding: '9px 10px', fontSize: 13, maxWidth: 240 },
      },
        React.createElement('option', { value: '' }, 'Todas as secretarias'),
        grupos.map((g) => React.createElement('option', { key: g.id, value: g.id }, g.nome)),
      ),
      filtroAtivo && React.createElement('button', {
        onClick: () => { setBusca(''); setFiltroPapel(''); setFiltroSecretaria(''); },
        style: btnSecundario,
      }, React.createElement(X, { size: 14 }), 'Limpar'),
    ),

    // lista compacta
    carregando
      ? React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Carregando equipe...')
      : lista.length === 0
        ? React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } },
            operadores.length === 0 ? 'Nenhum usuário cadastrado.' : 'Nenhum usuário encontrado com esses filtros.')
        : lista.map((op) =>
            React.createElement('div', { key: op.id, style: { ...linha, gap: 14, padding: '12px 22px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 230px', minWidth: 0 } },
                React.createElement(AvatarOperador, { op }),
                React.createElement('div', { style: { minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, op.nome),
                  React.createElement('div', { style: { fontSize: 12, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, op.email),
                ),
              ),
              React.createElement('div', { style: { flex: '1 1 250px', minWidth: 0 } }, resumoAcessos(op)),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 } },
                React.createElement('select', {
                  value: op.papel || '', disabled: salvandoPapel === op.id,
                  onChange: (e) => salvarPapel(op, e.target.value),
                  style: { ...input, padding: '7px 10px', fontSize: 13, opacity: salvandoPapel === op.id ? 0.6 : 1 },
                },
                  // preserva perfis avançados definidos fora desta tela (ex.: auditor, operador_ia)
                  !PAPEIS_EQUIPE.some((p) => p.id === op.papel) && op.papel
                    && React.createElement('option', { value: op.papel }, op.papel),
                  PAPEIS_EQUIPE.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.label)),
                ),
                React.createElement('button', {
                  onClick: () => setEditando(op), style: btnSecundario, title: 'Gerenciar setores deste usuário',
                }, React.createElement(ShieldCheck, { size: 14 }), 'Acessos'),
              ),
            )),

    editando && React.createElement(ModalAcessosOperador, {
      operador: editando,
      grupos,
      totalSetores: departamentos.length,
      onFechar: () => setEditando(null),
      onSalvar: salvarAcessos,
    }),
  );
}

function ModalAcessosOperador({ operador, grupos, totalSetores, onFechar, onSalvar }) {
  const iniciais = operador.departamento_ids || [];
  const [selecionados, setSelecionados] = useState(() => new Set(iniciais));
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [abertos, setAbertos] = useState(() => {
    const set = new Set();
    grupos.forEach((g) => { if (g.deptos.some((d) => iniciais.includes(d.id))) set.add(g.id); });
    if (set.size === 0) grupos.slice(0, 2).forEach((g) => set.add(g.id));
    return set;
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  const termo = semAcento(busca.trim());
  const gruposVisiveis = useMemo(() => {
    if (!termo) return grupos;
    return grupos
      .map((g) => {
        if (semAcento(g.nome).includes(termo)) return g;
        const deptos = g.deptos.filter((d) => semAcento(d.nome).includes(termo));
        return deptos.length ? { ...g, deptos } : null;
      })
      .filter(Boolean);
  }, [grupos, termo]);

  const alternar = (id) => setSelecionados((prev) => {
    const proximo = new Set(prev);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });
  const alternarGrupo = (grupo) => setSelecionados((prev) => {
    const proximo = new Set(prev);
    const todos = grupo.deptos.every((d) => proximo.has(d.id));
    grupo.deptos.forEach((d) => { if (todos) proximo.delete(d.id); else proximo.add(d.id); });
    return proximo;
  });
  const alternarAberto = (id) => setAbertos((prev) => {
    const proximo = new Set(prev);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar(operador, Array.from(selecionados));
      onFechar();
    } catch (e) {
      alert(e.message || 'Erro ao salvar os acessos');
    } finally {
      setSalvando(false);
    }
  };

  const overlayAcessos = { position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
  const cardAcessos = { background: T.surface, borderRadius: T.radiusLg, width: '100%', maxWidth: 520, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: T.shadowLg, overflow: 'hidden' };

  return React.createElement('div', { style: overlayAcessos, onClick: onFechar },
    React.createElement('div', { style: cardAcessos, onClick: (e) => e.stopPropagation() },
      // cabeçalho
      React.createElement('div', { style: { padding: '18px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('div', { style: { width: 38, height: 38, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
          React.createElement(ShieldCheck, { size: 20, color: T.primary })),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontSize: 16, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, operador.nome),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, operador.email),
        ),
        React.createElement('button', { onClick: onFechar, style: btnIcon, title: 'Fechar' }, React.createElement(X, { size: 18 })),
      ),

      (operador.papel === 'admin' || operador.papel === 'supervisor')
        && React.createElement('div', { style: { padding: '10px 20px', background: T.surfaceAlt, fontSize: 12, color: T.textSecondary, borderBottom: `1px solid ${T.border}` } },
          'Administradores e supervisores enxergam todas as conversas do órgão. Os setores abaixo definem filas, painéis e relatórios.'),

      // busca + ações em massa
      React.createElement('div', { style: { padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${T.border}` } },
        React.createElement('div', { style: { position: 'relative', flex: '1 1 180px', minWidth: 150 } },
          React.createElement(Search, { size: 15, style: { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' } }),
          React.createElement('input', {
            value: busca, onChange: (e) => setBusca(e.target.value), placeholder: 'Buscar setor',
            style: { ...input, width: '100%', paddingLeft: 32, fontSize: 13 },
          }),
        ),
        React.createElement('button', {
          onClick: () => setSelecionados(new Set(grupos.flatMap((g) => g.deptos.map((d) => d.id)))), style: btnSecundario,
        }, 'Marcar todos'),
        React.createElement('button', { onClick: () => setSelecionados(new Set()), style: btnSecundario }, 'Limpar'),
      ),

      // grupos por secretaria
      React.createElement('div', { style: { overflowY: 'auto', flex: 1 } },
        gruposVisiveis.length === 0
          ? React.createElement('div', { style: { padding: 20, fontSize: 13, color: T.textMuted } }, 'Nenhum setor encontrado.')
          : gruposVisiveis.map((g) => {
              const marcados = g.deptos.filter((d) => selecionados.has(d.id)).length;
              const todos = marcados === g.deptos.length && g.deptos.length > 0;
              const aberto = termo ? true : abertos.has(g.id);
              const cor = g.cor || T.primary;
              return React.createElement('div', { key: g.id, style: { borderBottom: `1px solid ${T.border}` } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', background: T.surfaceAlt } },
                  React.createElement('input', {
                    type: 'checkbox', checked: todos, onChange: () => alternarGrupo(g),
                    ref: (el) => { if (el) el.indeterminate = marcados > 0 && !todos; },
                    style: { width: 15, height: 15, cursor: 'pointer', accentColor: T.primary },
                  }),
                  React.createElement(PontoCor, { cor }),
                  React.createElement('span', { style: { flex: 1, fontSize: 13, fontWeight: 700, color: T.text, minWidth: 0 } }, g.nome),
                  React.createElement('span', { style: { fontSize: 11.5, fontWeight: 600, color: marcados ? T.primary : T.textMuted } }, `${marcados}/${g.deptos.length}`),
                  React.createElement('button', {
                    onClick: () => alternarAberto(g.id), style: btnIcon, title: aberto ? 'Recolher' : 'Expandir', disabled: !!termo,
                  }, React.createElement(aberto ? ChevronDown : ChevronRight, { size: 16 })),
                ),
                aberto && g.deptos.map((d) =>
                  React.createElement('label', {
                    key: d.id,
                    style: {
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px 9px 46px', cursor: 'pointer',
                      fontSize: 13.5, color: T.text, background: selecionados.has(d.id) ? T.primarySoft : 'transparent',
                    },
                  },
                    React.createElement('input', {
                      type: 'checkbox', checked: selecionados.has(d.id), onChange: () => alternar(d.id),
                      style: { width: 15, height: 15, cursor: 'pointer', accentColor: T.primary },
                    }),
                    React.createElement('span', { style: { flex: 1 } }, d.nome),
                  )),
              );
            }),
      ),

      // rodapé
      React.createElement('div', { style: { padding: '14px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        React.createElement('span', { style: { flex: 1, fontSize: 12.5, color: T.textSecondary, minWidth: 120 } },
          `${selecionados.size} de ${totalSetores} setor(es) selecionado(s)`),
        React.createElement('button', { onClick: onFechar, style: btnSecundario }, 'Cancelar'),
        React.createElement('button', { onClick: salvar, disabled: salvando, style: { ...btnAdd, opacity: salvando ? 0.6 : 1 } },
          salvando ? React.createElement(Loader2, { size: 16, className: 'spin' }) : React.createElement(Check, { size: 16 }),
          salvando ? 'Salvando...' : 'Salvar acessos'),
      ),
    ),
  );
}

// ---------- Conexão (QR inline + API oficial) ----------
const label = { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 5, display: 'block' };
const campo = { width: '100%', padding: '10px 12px', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 14 };

function BotaoSalvar({ salvando, salvo, onClick, texto }) {
  return React.createElement('button', { onClick, disabled: salvando, style: { ...btnAdd, opacity: salvando ? 0.6 : 1 } },
    salvando ? React.createElement(Loader2, { size: 16, className: 'spin' }) : (salvo ? React.createElement(Check, { size: 16 }) : React.createElement(Save, { size: 16 })),
    salvando ? 'Salvando...' : (salvo ? 'Salvo!' : (texto || 'Salvar')),
  );
}

function AbaConexao({ onOpenQR }) {
  const [status, setStatus] = useState({ status: 'desconectado', numero: null });
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [qr, setQr] = useState(null);
  const [gerando, setGerando] = useState(false);
  const { socket } = useSocket();

  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetchWhatsAppStatus().then(setStatus).catch(console.error);
    fetchConfig().then(setCfg).catch(console.error);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onQr = (data) => { setQr(data.qr); setGerando(false); };
    const onConn = ({ numero }) => { setStatus({ status: 'conectado', numero }); setQr(null); setGerando(false); };
    const onDisc = () => setStatus({ status: 'desconectado', numero: null });
    socket.on('whatsapp:qr', onQr);
    socket.on('whatsapp:conectado', onConn);
    socket.on('whatsapp:desconectado', onDisc);
    return () => { socket.off('whatsapp:qr', onQr); socket.off('whatsapp:conectado', onConn); socket.off('whatsapp:desconectado', onDisc); };
  }, [socket]);

  const conectado = status.status === 'conectado';
  const provider = cfg?.provider || 'baileys';

  const gerarQR = () => { setGerando(true); setQr(null); socket?.emit('whatsapp:solicitarQR'); };
  const handleLogout = () => {
    if (!socket) return;
    setLogoutLoading(true);
    socket.emit('whatsapp:logout');
    socket.once('whatsapp:desconectado', () => { setLogoutLoading(false); fetchWhatsAppStatus().then(setStatus).catch(console.error); });
    socket.once('whatsapp:erro', () => setLogoutLoading(false));
  };

  const setField = (k, v) => setCfg((p) => ({ ...p, [k]: v }));
  const salvar = async () => {
    setSalvando(true);
    try { await salvarConfig(cfg); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }
    catch (e) { alert(e.message); }
    finally { setSalvando(false); }
  };

  if (!cfg) return React.createElement('div', { style: { color: T.textMuted } }, 'Carregando...');

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 620 } },
    // Seletor de provedor
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Como o WhatsApp será conectado')),
      React.createElement('div', { style: { padding: 18, display: 'flex', gap: 12, flexWrap: 'wrap' } },
        React.createElement(CartaoProvider, {
          ativo: provider === 'baileys', icon: QrCode, titulo: 'Via QR Code', desc: 'Conecta um número lendo o QR no celular. Ideal para começar rápido.',
          onClick: () => setField('provider', 'baileys'),
        }),
        React.createElement(CartaoProvider, {
          ativo: provider === 'oficial', icon: KeyRound, titulo: 'API Oficial (Cloud)', desc: 'Usa a API oficial da Meta com token. Recomendado para alto volume.',
          onClick: () => setField('provider', 'oficial'),
        }),
      ),
    ),

    // QR / status (provider baileys)
    provider === 'baileys' && React.createElement('div', { style: { ...painel, maxWidth: 620 } },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Conexão por QR Code')),
      React.createElement('div', { style: { padding: 24, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' } },
        React.createElement('div', {
          style: { width: 200, height: 200, borderRadius: T.radius, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.surfaceAlt, flexShrink: 0 },
        },
          conectado
            ? React.createElement('div', { style: { textAlign: 'center', color: T.success } }, React.createElement(Wifi, { size: 40 }), React.createElement('div', { style: { fontSize: 13, fontWeight: 700, marginTop: 8 } }, 'Conectado'))
            : qr
              ? React.createElement('img', { src: qr, alt: 'QR Code', style: { width: 188, height: 188 } })
              : React.createElement('div', { style: { color: T.textMuted, fontSize: 13, textAlign: 'center', padding: 12 } }, gerando ? 'Gerando QR...' : 'Clique em "Gerar QR Code"'),
        ),
        React.createElement('div', { style: { flex: 1, minWidth: 220 } },
          React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: conectado ? T.success : T.danger, marginBottom: 6 } },
            conectado ? `Conectado · ${status.numero || ''}` : 'Desconectado'),
          React.createElement('ol', { style: { margin: '0 0 16px 16px', padding: 0, color: T.textSecondary, fontSize: 13, lineHeight: '22px' } },
            React.createElement('li', null, 'Abra o WhatsApp no celular'),
            React.createElement('li', null, 'Toque em Aparelhos conectados'),
            React.createElement('li', null, 'Conectar um aparelho'),
            React.createElement('li', null, 'Aponte para o QR ao lado'),
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            React.createElement('button', { onClick: gerarQR, style: btnAdd }, React.createElement(QrCode, { size: 16 }), conectado ? 'Trocar número' : 'Gerar QR Code'),
            conectado && React.createElement('button', { onClick: handleLogout, disabled: logoutLoading, style: { ...btnAdd, background: T.danger } },
              React.createElement(LogOut, { size: 16 }), logoutLoading ? 'Desconectando...' : 'Desconectar'),
          ),
        ),
      ),
    ),

    // API oficial (provider oficial)
    provider === 'oficial' && React.createElement('div', { style: { ...painel, maxWidth: 620 } },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Credenciais da API Oficial (Meta Cloud)')),
      React.createElement('div', { style: { padding: 22 } },
        React.createElement('label', { style: label }, 'Phone Number ID'),
        React.createElement('input', { value: cfg.wa_api_phone_id || '', onChange: (e) => setField('wa_api_phone_id', e.target.value), placeholder: 'Ex: 1029384756', style: campo }),
        React.createElement('label', { style: label }, 'WhatsApp Business Account ID'),
        React.createElement('input', { value: cfg.wa_api_business_id || '', onChange: (e) => setField('wa_api_business_id', e.target.value), placeholder: 'Opcional', style: campo }),
        React.createElement('label', { style: label }, 'Token de acesso permanente'),
        React.createElement('input', {
          type: 'password', value: cfg.wa_api_token || '',
          onChange: (e) => setField('wa_api_token', e.target.value),
          placeholder: cfg.wa_api_token_set ? '•••••••• (já salvo — preencha para trocar)' : 'Cole o token aqui', style: campo,
        }),
        React.createElement('label', { style: label }, 'Verify Token (webhook)'),
        React.createElement('input', { value: cfg.wa_api_verify_token || '', onChange: (e) => setField('wa_api_verify_token', e.target.value), placeholder: 'Token de verificação do webhook', style: campo }),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
          React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvar, texto: 'Salvar credenciais' }),
        ),
      ),
    ),

    provider === 'baileys' && React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', width: '100%', maxWidth: 620 } },
      React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvar, texto: 'Salvar preferências' }),
    ),
  );
}

function CartaoProvider({ ativo, icon: Icon, titulo, desc, onClick }) {
  return React.createElement('button', {
    onClick,
    style: {
      flex: '1 1 220px', textAlign: 'left', cursor: 'pointer', padding: 16, borderRadius: T.radius,
      background: ativo ? T.primarySoft : T.surface, border: `2px solid ${ativo ? T.primary : T.border}`,
    },
  },
    React.createElement(Icon, { size: 22, color: ativo ? T.primary : T.textSecondary }),
    React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text, margin: '8px 0 4px' } }, titulo),
    React.createElement('div', { style: { fontSize: 12, color: T.textMuted, lineHeight: '17px' } }, desc),
  );
}

// ---------- Atendimento (geral) ----------
const DIAS = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];

function AbaGeral() {
  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => { fetchConfig().then(setCfg).catch(console.error); }, []);
  const setField = (k, v) => setCfg((p) => ({ ...p, [k]: v }));
  const dias = (cfg?.dias_atendimento || '').split(',').filter(Boolean);
  const toggleDia = (d) => {
    const novo = dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d];
    setField('dias_atendimento', novo.join(','));
  };
  const salvar = async () => {
    setSalvando(true);
    try { await salvarConfig(cfg); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }
    catch (e) { alert(e.message); } finally { setSalvando(false); }
  };

  if (!cfg) return React.createElement('div', { style: { color: T.textMuted } }, 'Carregando...');

  return React.createElement('div', { style: { ...painel, maxWidth: 620 } },
    React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Mensagens e horário de atendimento')),
    React.createElement('div', { style: { padding: 22 } },
      React.createElement('label', { style: label }, 'Mensagem de saudação (boas-vindas)'),
      React.createElement('textarea', { value: cfg.saudacao || '', onChange: (e) => setField('saudacao', e.target.value), rows: 2, placeholder: 'Olá! Bem-vindo ao atendimento da Prefeitura...', style: { ...campo, resize: 'vertical', fontFamily: T.font } }),

      React.createElement('label', { style: label }, 'Mensagem de ausência (fora do horário)'),
      React.createElement('textarea', { value: cfg.mensagem_ausencia || '', onChange: (e) => setField('mensagem_ausencia', e.target.value), rows: 2, placeholder: 'Nosso atendimento funciona de seg. a sex...', style: { ...campo, resize: 'vertical', fontFamily: T.font } }),

      React.createElement('label', { style: label }, 'Dias de atendimento'),
      React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' } },
        DIAS.map(([v, lbl]) =>
          React.createElement('button', {
            key: v, onClick: () => toggleDia(v),
            style: {
              padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${dias.includes(v) ? T.primary : T.border}`,
              background: dias.includes(v) ? T.primarySoft : 'transparent',
              color: dias.includes(v) ? T.primary : T.textMuted,
            },
          }, lbl))),

      React.createElement('div', { style: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' } },
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('label', { style: label }, 'Início'),
          React.createElement('input', { type: 'time', value: cfg.horario_inicio || '', onChange: (e) => setField('horario_inicio', e.target.value), style: { ...campo, marginBottom: 0 } }),
        ),
        React.createElement('div', { style: { flex: 1, minWidth: 140 } },
          React.createElement('label', { style: label }, 'Fim'),
          React.createElement('input', { type: 'time', value: cfg.horario_fim || '', onChange: (e) => setField('horario_fim', e.target.value), style: { ...campo, marginBottom: 0 } }),
        ),
      ),

      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 18 } },
        React.createElement('input', { type: 'checkbox', checked: !!cfg.fora_horario_ativo, onChange: (e) => setField('fora_horario_ativo', e.target.checked) }),
        React.createElement('span', { style: { fontSize: 13, color: T.text } }, 'Responder automaticamente com a mensagem de ausência fora do horário'),
      ),

      React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, paddingTop: 16, marginBottom: 4 } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 } },
          React.createElement('input', { type: 'checkbox', checked: cfg.assinatura_ativa !== false, onChange: (e) => setField('assinatura_ativa', e.target.checked) }),
          React.createElement('span', { style: { fontSize: 13, color: T.text } }, 'Assinar mensagens com o nome do atendente (o destinatário vê quem respondeu)'),
        ),
        cfg.assinatura_ativa !== false && React.createElement('div', { style: { marginLeft: 24, marginBottom: 14 } },
          React.createElement('label', { style: label }, 'Formato do nome'),
          React.createElement('select', {
            value: cfg.assinatura_modo || 'completo',
            onChange: (e) => setField('assinatura_modo', e.target.value),
            style: { ...campo, marginBottom: 0, maxWidth: 240 },
          },
            React.createElement('option', { value: 'completo' }, 'Nome completo'),
            React.createElement('option', { value: 'primeiro' }, 'Apenas primeiro nome'),
          ),
        ),
      ),

      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap' } },
        React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvar }),
      ),
    ),
  );
}

// ---------- Bloqueios ----------
function AbaBloqueios() {
  const [lista, setLista] = useState([]);
  const [telefone, setTelefone] = useState('');
  const [motivo, setMotivo] = useState('');

  const carregar = () => fetchBloqueios().then(setLista).catch(console.error);
  useEffect(() => { carregar(); }, []);

  const bloquear = async () => {
    if (telefone.replace(/\D/g, '').length < 10) return;
    try { await criarBloqueio({ telefone, motivo: motivo.trim() || null }); setTelefone(''); setMotivo(''); carregar(); }
    catch (e) { alert(e.message); }
  };
  const desbloquear = async (id) => { await removerBloqueio(id); carregar(); };

  return React.createElement('div', { style: painel },
    React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Números bloqueados')),
    React.createElement('div', { style: { ...linha, background: T.surfaceAlt, flexWrap: 'wrap' } },
      React.createElement('input', { value: telefone, onChange: (e) => setTelefone(e.target.value), placeholder: 'Telefone (DDD + número)', style: { ...input, width: 200 } }),
      React.createElement('input', { value: motivo, onChange: (e) => setMotivo(e.target.value), placeholder: 'Motivo (opcional)', style: { ...input, flex: 1, minWidth: 160 } }),
      React.createElement('button', { onClick: bloquear, style: { ...btnAdd, background: T.danger } }, React.createElement(Ban, { size: 16 }), 'Bloquear'),
    ),
    React.createElement('div', { style: { padding: '8px 22px', fontSize: 12, color: T.textMuted } }, 'Mensagens recebidas desses números são ignoradas automaticamente.'),
    lista.length === 0
      ? React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhum número bloqueado.')
      : lista.map((b) =>
          React.createElement('div', { key: b.id, style: linha },
            React.createElement(Ban, { size: 16, color: T.danger }),
            React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: T.text, minWidth: 130 } }, b.telefone),
            React.createElement('span', { style: { flex: 1, fontSize: 13, color: T.textMuted } }, b.motivo || '—'),
            React.createElement('button', { onClick: () => desbloquear(b.id), style: btnIcon, title: 'Desbloquear' }, React.createElement(Trash2, { size: 16 })),
          )),
  );
}

function SeletorCor({ cor, onChange }) {
  return React.createElement('div', { style: { display: 'flex', gap: 4 } },
    CORES_DEPT.slice(0, 6).map((c) =>
      React.createElement('button', {
        key: c, onClick: () => onChange(c), title: c,
        style: {
          width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
          border: cor === c ? `2px solid ${T.text}` : '2px solid transparent',
        },
      })),
  );
}

// ---------- Chatbot (imp.md 1.1) ----------
function AbaChatbot() {
  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [pcs, setPcs] = useState([]);
  const [pNome, setPNome] = useState('');
  const [pResposta, setPResposta] = useState('');
  const [pDepto, setPDepto] = useState('');

  const [faqs, setFaqs] = useState([]);
  const [fPergunta, setFPergunta] = useState('');
  const [fResposta, setFResposta] = useState('');

  const [departamentos, setDepartamentos] = useState([]);

  useEffect(() => {
    fetchChatbotConfig().then((c) => setCfg(c || {})).catch(console.error);
    fetchPalavrasChave().then(setPcs).catch(console.error);
    fetchFaqs().then(setFaqs).catch(console.error);
    fetchDepartamentos().then(setDepartamentos).catch(console.error);
  }, []);

  const setField = (k, v) => setCfg((p) => ({ ...p, [k]: v }));
  const salvarCfg = async () => {
    setSalvando(true);
    try { await salvarChatbotConfig(cfg); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }
    catch (e) { alert(e.message); } finally { setSalvando(false); }
  };

  const addPC = async () => {
    if (!pNome.trim() || !pResposta.trim()) return;
    await criarPalavraChave({ palavras: pNome.split(',').map((s) => s.trim()), resposta: pResposta, prioridade: 0, departamento_id: pDepto || null });
    setPNome(''); setPResposta(''); setPDepto('');
    fetchPalavrasChave().then(setPcs).catch(console.error);
  };
  const delPC = async (id) => { await excluirPalavraChave(id); fetchPalavrasChave().then(setPcs).catch(console.error); };

  const addFaq = async () => {
    if (!fPergunta.trim() || !fResposta.trim()) return;
    await criarFaq({ pergunta: fPergunta, resposta: fResposta, categoria: 'Geral' });
    setFPergunta(''); setFResposta('');
    fetchFaqs().then(setFaqs).catch(console.error);
  };
  const delFaq = async (id) => { await excluirFaq(id); fetchFaqs().then(setFaqs).catch(console.error); };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 700 } },
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead },
        React.createElement('div', { style: tituloPainel }, 'Configuração do Chatbot'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
            React.createElement('input', { type: 'checkbox', checked: !!cfg?.ativo, onChange: (e) => setField('ativo', e.target.checked) }),
            'Ativo'),
        ),
      ),
      React.createElement('div', { style: { padding: 22 } },
        React.createElement('label', { style: label }, 'Mensagem de boas-vindas'),
        React.createElement('textarea', { value: cfg?.mensagem_boas_vindas || '', onChange: (e) => setField('mensagem_boas_vindas', e.target.value), rows: 2, style: { ...campo, resize: 'vertical', fontFamily: T.font } }),

        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' } },
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
            React.createElement('input', { type: 'checkbox', checked: cfg?.usar_keywords !== false, onChange: (e) => setField('usar_keywords', e.target.checked) }),
            'Palavras-chave'),
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
            React.createElement('input', { type: 'checkbox', checked: cfg?.usar_faq !== false, onChange: (e) => setField('usar_faq', e.target.checked) }),
            'FAQ'),
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
            React.createElement('input', { type: 'checkbox', checked: cfg?.usar_llm === true, onChange: (e) => setField('usar_llm', e.target.checked) }),
            'IA (LLM)'),
        ),

        cfg?.usar_faq !== false && React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('label', { style: label }, 'Threshold de similaridade (FAQ)'),
          React.createElement('input', { type: 'range', min: 0.3, max: 1, step: 0.05, value: cfg?.threshold_faq || 0.6, onChange: (e) => setField('threshold_faq', parseFloat(e.target.value)), style: { width: '100%' } }),
          React.createElement('span', { style: { fontSize: 12, color: T.textMuted } }, `${((cfg?.threshold_faq || 0.6) * 100).toFixed(0)}%`),
        ),

        cfg?.usar_llm === true && React.createElement(React.Fragment, null,
          React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' } },
            React.createElement('div', { style: { flex: 1, minWidth: 180 } },
              React.createElement('label', { style: label }, 'Provider'),
              React.createElement('select', { value: cfg?.llm_provider || 'openai', onChange: (e) => setField('llm_provider', e.target.value), style: { ...campo, marginBottom: 0 } },
                React.createElement('option', { value: 'openai' }, 'OpenAI'),
                React.createElement('option', { value: 'deepseek' }, 'DeepSeek'),
                React.createElement('option', { value: 'anthropic' }, 'Anthropic (Claude)'),
              ),
            ),
            React.createElement('div', { style: { flex: 1, minWidth: 180 } },
              React.createElement('label', { style: label }, 'Modelo'),
              React.createElement('input', { value: cfg?.llm_model || '', onChange: (e) => setField('llm_model', e.target.value), placeholder: 'gpt-4o-mini', style: campo }),
            ),
          ),
          React.createElement('label', { style: label }, 'API Key'),
          React.createElement('input', { type: 'password', value: cfg?.llm_api_key || '', onChange: (e) => setField('llm_api_key', e.target.value), placeholder: cfg?.llm_api_key_set ? '•••• (preencha para trocar)' : 'sk-...', style: campo }),
          React.createElement('label', { style: label }, 'System Prompt'),
          React.createElement('textarea', { value: cfg?.llm_system_prompt || '', onChange: (e) => setField('llm_system_prompt', e.target.value), rows: 3, placeholder: 'Você é um assistente da prefeitura...', style: { ...campo, resize: 'vertical', fontFamily: T.font } }),
        ),

        React.createElement('label', { style: label }, 'Mensagem de fallback (quando não entende)'),
        React.createElement('textarea', { value: cfg?.mensagem_fallback || '', onChange: (e) => setField('mensagem_fallback', e.target.value), rows: 2, style: { ...campo, resize: 'vertical', fontFamily: T.font } }),

        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap' } },
          React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvarCfg }),
        ),
      ),
    ),

    // Palavras-chave
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Palavras-chave')),
      React.createElement('div', { style: { ...linha, background: T.surfaceAlt } },
        React.createElement('input', { value: pNome, onChange: (e) => setPNome(e.target.value), placeholder: 'Palavras (separadas por vírgula)', style: { ...input, flex: 1 } }),
        React.createElement('input', { value: pResposta, onChange: (e) => setPResposta(e.target.value), placeholder: 'Resposta automática', style: { ...input, flex: 2 } }),
        React.createElement('select', { value: pDepto, onChange: (e) => setPDepto(e.target.value), style: { ...input, width: 140, flex: '1 1 140px' } },
          React.createElement('option', { value: '' }, 'Setor (opcional)'),
          departamentos.map((d) => React.createElement('option', { key: d.id, value: d.id }, d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome)),
        ),
        React.createElement('button', { onClick: addPC, style: btnAdd }, React.createElement(Plus, { size: 16 }), 'Adicionar'),
      ),
      pcs.map((pc) => {
        const deptoNome = pc.departamento_id ? (departamentos.find((d) => d.id === pc.departamento_id) || {}).nome || '—' : null;
        return React.createElement('div', { key: pc.id, style: linha },
          React.createElement(React.Fragment, null,
            React.createElement('span', { style: { fontSize: 13, color: T.text, flex: 1 } }, (pc.palavras || []).join(', ')),
            React.createElement('span', { style: { fontSize: 13, color: T.textSecondary, flex: 2 } }, pc.resposta),
            deptoNome && React.createElement('span', { style: { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: T.surfaceMuted, color: T.textMuted, marginRight: 8 } }, deptoNome),
            React.createElement('button', { onClick: () => delPC(pc.id), style: btnIcon }, React.createElement(Trash2, { size: 16 })),
          ));
      }),
      pcs.length === 0 && React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhuma regra cadastrada.'),
    ),

    // FAQs
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'FAQ (Perguntas Frequentes)')),
      React.createElement('div', { style: { ...linha, background: T.surfaceAlt, flexDirection: 'column', alignItems: 'stretch', gap: 8 } },
        React.createElement('input', { value: fPergunta, onChange: (e) => setFPergunta(e.target.value), placeholder: 'Pergunta', style: input }),
        React.createElement('input', { value: fResposta, onChange: (e) => setFResposta(e.target.value), placeholder: 'Resposta', style: input }),
        React.createElement('button', { onClick: addFaq, style: { ...btnAdd, alignSelf: 'flex-end' } }, React.createElement(Plus, { size: 16 }), 'Adicionar FAQ'),
      ),
      faqs.map((f) =>
        React.createElement('div', { key: f.id, style: { ...linha, flexDirection: 'column', alignItems: 'stretch', gap: 4 } },
          React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, f.pergunta),
          React.createElement('div', { style: { fontSize: 13, color: T.textSecondary } }, f.resposta),
          React.createElement('button', { onClick: () => delFaq(f.id), style: { ...btnIcon, alignSelf: 'flex-end' } }, React.createElement(Trash2, { size: 16 })),
        )),
      faqs.length === 0 && React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhuma FAQ cadastrada.'),
    ),
    React.createElement(VersoesChatbot),
  );
}

// ---------- Iris — Assistente IA (DeepSeek) ----------
function AbaIris() {
  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [departamentos, setDepartamentos] = useState([]);

  useEffect(() => {
    fetchIrisConfig().then((c) => setCfg(c || {})).catch(console.error);
    fetchDepartamentos().then(setDepartamentos).catch(console.error);
  }, []);

  const setField = (k, v) => setCfg((p) => ({ ...p, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    try { await salvarIrisConfig(cfg); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }
    catch (e) { alert(e.message); } finally { setSalvando(false); }
  };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 700 } },
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead },
        React.createElement('div', { style: tituloPainel }, 'Configuração da Iris'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
            React.createElement('input', { type: 'checkbox', checked: !!cfg?.ativo, onChange: (e) => setField('ativo', e.target.checked) }),
            'Ativo 24h'),
        ),
      ),
      React.createElement('div', { style: { padding: 22 } },
        React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, marginBottom: 16 } },
          'A Iris é uma assistente virtual com IA que atende os cidadãos 24 horas por dia. Ela entende a intenção da mensagem, conversa com o cidadão e encaminha automaticamente para o departamento correto.'),
        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' } },
          React.createElement('div', { style: { flex: 1, minWidth: 180 } },
            React.createElement('label', { style: label }, 'Modelo'),
            React.createElement('select', { value: cfg?.model || 'deepseek-chat', onChange: (e) => setField('model', e.target.value), style: { ...campo, marginBottom: 0 } },
              React.createElement('option', { value: 'deepseek-chat' }, 'DeepSeek V4 Flash'),
              React.createElement('option', { value: 'deepseek-reasoner' }, 'DeepSeek R1 (Reasoner)'),
            ),
          ),
          React.createElement('div', { style: { flex: 1, minWidth: 180 } },
            React.createElement('label', { style: label }, 'Temperatura'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement('input', { type: 'range', min: 0.1, max: 1, step: 0.1, value: cfg?.temperatura ?? 0.7, onChange: (e) => setField('temperatura', parseFloat(e.target.value)), style: { flex: 1 } }),
              React.createElement('span', { style: { fontSize: 12, color: T.textMuted, width: 32, textAlign: 'right' } }, (cfg?.temperatura ?? 0.7).toFixed(1)),
            ),
          ),
        ),
        React.createElement('label', { style: label }, 'API Key da DeepSeek'),
        React.createElement('input', { type: 'password', value: cfg?.api_key || '', onChange: (e) => setField('api_key', e.target.value), placeholder: cfg?.api_key_set ? '•••• (preencha para trocar)' : 'sk-...', style: campo }),
        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' } },
          React.createElement('div', { style: { flex: 1, minWidth: 180 } },
            React.createElement('label', { style: label }, 'Max Tokens'),
            React.createElement('input', { type: 'number', value: cfg?.max_tokens ?? 1024, onChange: (e) => setField('max_tokens', parseInt(e.target.value) || 1024), min: 256, max: 4096, style: campo }),
          ),
        ),
        React.createElement('label', { style: label }, 'System Prompt personalizado (opcional — deixe vazio para usar o padrão)'),
        React.createElement('textarea', { value: cfg?.system_prompt || '', onChange: (e) => setField('system_prompt', e.target.value), rows: 4, placeholder: 'Prompt padrão: a Iris conhece automaticamente todos os departamentos cadastrados...', style: { ...campo, resize: 'vertical', fontFamily: T.font } }),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap' } },
          React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvar, texto: 'Salvar configuração' }),
        ),
      ),
    ),
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Departamentos conhecidos pela Iris')),
      React.createElement('div', { style: { padding: 22 } },
        departamentos.length === 0
          ? React.createElement('div', { style: { color: T.textMuted, fontSize: 13 } }, 'Nenhum departamento cadastrado. Crie departamentos na aba "Departamentos".')
          : React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              departamentos.map((d) =>
                React.createElement('span', { key: d.id, style: { fontSize: 12, padding: '5px 11px', borderRadius: 20, background: T.surfaceMuted, color: T.text, border: `1px solid ${T.border}`, fontWeight: 500 } },
                  d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome),
              )),
      ),
    ),
    React.createElement(VersoesIris),
  );
}

// ---------- Notificações ----------
function AbaNotificacoes() {
  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetchConfigNotificacoes().then((c) => setCfg(c || {})).catch(console.error);
  }, []);

  const setField = (k, v) => setCfg((p) => ({ ...p, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfigNotificacoes(cfg);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (e) {
      alert(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 500 } },
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead },
        React.createElement('div', { style: tituloPainel }, 'Preferências de notificação'),
      ),
      React.createElement('div', { style: { padding: 22, display: 'flex', flexDirection: 'column', gap: 20 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            cfg?.push_ativo ? React.createElement(Bell, { size: 20, color: T.primary })
                            : React.createElement(BellOff, { size: 20, color: T.textMuted }),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, 'Notificações desktop'),
              React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Exibe alertas quando chegam novas mensagens e você está em outra aba'),
            ),
          ),
          React.createElement('label', { style: { position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' } },
            React.createElement('input', {
              type: 'checkbox', checked: cfg?.push_ativo !== false,
              onChange: (e) => setField('push_ativo', e.target.checked),
              style: { opacity: 0, width: 0, height: 0 },
            }),
            React.createElement('span', {
              style: {
                position: 'absolute', inset: 0, borderRadius: 24,
                background: cfg?.push_ativo !== false ? T.primary : '#d1d5db',
                transition: 'background 0.2s',
              },
            }),
            React.createElement('span', {
              style: {
                position: 'absolute', left: cfg?.push_ativo !== false ? 22 : 3, bottom: 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              },
            }),
          ),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            React.createElement(Volume2, { size: 20, color: cfg?.som_ativado !== false ? T.primary : T.textMuted }),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, 'Som de notificação'),
              React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Toca um som curto ao receber nova mensagem'),
            ),
          ),
          React.createElement('label', { style: { position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' } },
            React.createElement('input', {
              type: 'checkbox', checked: cfg?.som_ativado !== false,
              onChange: (e) => setField('som_ativado', e.target.checked),
              style: { opacity: 0, width: 0, height: 0 },
            }),
            React.createElement('span', {
              style: {
                position: 'absolute', inset: 0, borderRadius: 24,
                background: cfg?.som_ativado !== false ? T.primary : '#d1d5db',
                transition: 'background 0.2s',
              },
            }),
            React.createElement('span', {
              style: {
                position: 'absolute', left: cfg?.som_ativado !== false ? 22 : 3, bottom: 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              },
            }),
          ),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          React.createElement('div', { style: { flex: 1, minWidth: 130 } },
            React.createElement('label', { style: label }, 'Não perturbe — início'),
            React.createElement('input', {
              type: 'time', value: cfg?.nao_perturbe_inicio || '',
              onChange: (e) => setField('nao_perturbe_inicio', e.target.value || null),
              style: campo,
            }),
          ),
          React.createElement('span', { style: { color: T.textMuted, fontSize: 13, marginTop: 20 } }, 'até'),
          React.createElement('div', { style: { flex: 1, minWidth: 130 } },
            React.createElement('label', { style: label }, 'Não perturbe — fim'),
            React.createElement('input', {
              type: 'time', value: cfg?.nao_perturbe_fim || '',
              onChange: (e) => setField('nao_perturbe_fim', e.target.value || null),
              style: campo,
            }),
          ),
        ),
        React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: -8 } },
          'Durante este período, notificações desktop e sons são suprimidos.'),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap' } },
          React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvar, texto: 'Salvar preferências' }),
        ),
      ),
    ),
  );
}

// ---------- Templates / Respostas Rápidas (imp.md 1.5) ----------
function AbaTemplates() {
  const [lista, setLista] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [categoria, setCategoria] = useState('Geral');

  const carregar = () => fetchTemplates().then(setLista).catch(console.error);
  useEffect(() => { carregar(); }, []);

  const criar = async () => {
    if (!titulo.trim() || !conteudo.trim()) return;
    await criarTemplate({ titulo: titulo.trim(), conteudo: conteudo.trim(), categoria });
    setTitulo(''); setConteudo(''); carregar();
  };
  const remover = async (id) => { await excluirTemplate(id); carregar(); };

  return React.createElement('div', { style: painel },
    React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Templates de resposta rápida')),
    React.createElement('div', { style: { ...linha, background: T.surfaceAlt, flexDirection: 'column', alignItems: 'stretch', gap: 8 } },
      React.createElement('input', { value: titulo, onChange: (e) => setTitulo(e.target.value), placeholder: 'Título do template', style: input }),
      React.createElement('textarea', { value: conteudo, onChange: (e) => setConteudo(e.target.value), rows: 2, placeholder: 'Conteúdo da mensagem', style: { ...campo, resize: 'vertical', fontFamily: T.font, marginBottom: 0 } }),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        React.createElement('input', { value: categoria, onChange: (e) => setCategoria(e.target.value), placeholder: 'Categoria', style: { ...input, width: 160, flex: '1 1 160px' } }),
        React.createElement('button', { onClick: criar, style: btnAdd }, React.createElement(Plus, { size: 16 }), 'Criar template'),
      ),
    ),
    lista.length === 0
      ? React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhum template criado.')
      : lista.map((t) =>
          React.createElement('div', { key: t.id, style: { ...linha, flexDirection: 'column', alignItems: 'stretch', gap: 4 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement('span', { style: { fontSize: 12, padding: '2px 8px', borderRadius: 10, background: T.surfaceMuted, color: T.textSecondary } }, t.categoria),
              React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: T.text, flex: 1 } }, t.titulo),
              React.createElement('button', { onClick: () => remover(t.id), style: btnIcon }, React.createElement(Trash2, { size: 16 })),
            ),
            React.createElement('span', { style: { fontSize: 13, color: T.textSecondary, lineHeight: '18px' } }, t.conteudo),
          )),
  );
}
