import React, { useState, useEffect } from 'react';
import { Building2, FolderTree, Users, Smartphone, Plus, Trash2, Wifi, WifiOff, LogOut, QrCode, KeyRound, Ban, SlidersHorizontal, Save, Loader2, Check, Bot, FileText, Brain, MessageSquare, Bell, BellOff, Volume2, Network, Route, ShieldCheck, Megaphone, Send, UserRound, Globe, Users2, Clock, Timer, History, AlertTriangle, CalendarClock, Info, BellRing, PhoneOff } from 'lucide-react';
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
  fetchAvisoAtual, enviarAvisoGlobal, limparAvisoGlobal, fetchHistoricoAvisos,
} from '../api';
import { fetchConfigNotificacoes, salvarConfigNotificacoes } from '../api/evolucoes';
import { useSocket } from '../context/SocketContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
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
      { id: 'avisos', label: 'Avisos', icon: Megaphone },
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
          aba === 'avisos' && React.createElement(AbaAvisos),
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
function AbaEquipe() {
  const [operadores, setOperadores] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);

  const carregar = () => {
    fetchOperadores().then(setOperadores).catch(console.error);
    fetchDepartamentos().then(setDepartamentos).catch(console.error);
  };
  useEffect(() => { carregar(); }, []);

  const salvarPapel = async (op, papel) => { await editarOperador(op.id, { papel }); carregar(); };
  const toggleDepto = async (op, depId) => {
    const atuais = op.departamento_ids || [];
    const novos = atuais.includes(depId) ? atuais.filter((i) => i !== depId) : [...atuais, depId];
    await editarOperador(op.id, { departamento_ids: novos });
    carregar();
  };

  return React.createElement('div', { style: { ...painel, maxWidth: 980 } },
    React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Equipe e permissões')),
    operadores.map((op) =>
      React.createElement('div', { key: op.id, style: { padding: '16px 22px', borderBottom: `1px solid ${T.border}` } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 } },
          React.createElement('span', { style: { width: 9, height: 9, borderRadius: '50%', background: op.online ? T.online : T.offline } }),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text } }, op.nome),
            React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, op.email),
          ),
          React.createElement('select', {
            value: op.papel, onChange: (e) => salvarPapel(op, e.target.value),
            style: { ...input, padding: '7px 10px', fontSize: 13 },
          },
            React.createElement('option', { value: 'operador' }, 'Operador'),
            React.createElement('option', { value: 'supervisor' }, 'Supervisor'),
            React.createElement('option', { value: 'admin' }, 'Administrador'),
          ),
        ),
        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          departamentos.map((d) => {
            const ativo = (op.departamento_ids || []).includes(d.id);
            return React.createElement('button', {
              key: d.id, onClick: () => toggleDepto(op, d.id),
              style: {
                fontSize: 12, padding: '5px 11px', borderRadius: 20, cursor: 'pointer', fontWeight: 600,
                border: `1px solid ${ativo ? d.cor || T.primary : T.border}`,
                background: ativo ? `${d.cor || T.primary}1a` : 'transparent',
                color: ativo ? (d.cor || T.primary) : T.textMuted,
              },
            }, d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome);
          }),
        ),
      )),
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

    // Recusa de chamadas — só no QR Code: a API oficial da Meta não recebe ligações.
    provider === 'baileys' && React.createElement('div', { style: { ...painel, maxWidth: 620 } },
      React.createElement('div', { style: painelHead },
        React.createElement('div', { style: { ...tituloPainel, display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement(PhoneOff, { size: 16 }), 'Chamadas telefônicas'),
      ),
      React.createElement('div', { style: { padding: 22 } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 6 } },
          React.createElement('input', {
            type: 'checkbox', checked: cfg.chamadas_recusar_ativo !== false,
            onChange: (e) => setField('chamadas_recusar_ativo', e.target.checked),
            style: { marginTop: 2 },
          }),
          React.createElement('span', { style: { fontSize: 13, color: T.text } },
            'Recusar chamadas automaticamente',
            React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 2 } },
              'Encerra ligações de voz e vídeo assim que chegam e responde ao cidadão com o aviso abaixo.'),
          ),
        ),

        cfg.chamadas_recusar_ativo !== false && React.createElement('div', { style: { marginTop: 18 } },
          React.createElement('label', { style: label }, 'Nome do órgão na mensagem'),
          React.createElement('input', {
            value: cfg.chamadas_nome_exibicao || '',
            onChange: (e) => setField('chamadas_nome_exibicao', e.target.value),
            placeholder: cfg.chamadas_nome_sugerido || 'Ex.: Prefeitura Municipal de Farol',
            style: { ...campo, marginBottom: 4 },
          }),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginBottom: 14 } },
            cfg.chamadas_nome_sugerido
              ? `Se ficar vazio, usa o nome cadastrado: ${cfg.chamadas_nome_sugerido}`
              : 'Se ficar vazio, usa o nome cadastrado do órgão.'),

          React.createElement('label', { style: label }, 'Telefone para ligações'),
          React.createElement('input', {
            value: cfg.chamadas_telefone || '',
            onChange: (e) => setField('chamadas_telefone', e.target.value),
            placeholder: cfg.chamadas_telefone_sugerido || 'Ex.: (44) 3563-1101',
            style: { ...campo, marginBottom: 4 },
          }),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginBottom: 14 } },
            cfg.chamadas_telefone_sugerido
              ? `Se ficar vazio, usa o número conectado: ${cfg.chamadas_telefone_sugerido}`
              : 'Conecte o WhatsApp para o número ser sugerido automaticamente.'),

          React.createElement('label', { style: label }, 'Mensagem enviada'),
          React.createElement('textarea', {
            value: cfg.chamadas_mensagem || '',
            onChange: (e) => setField('chamadas_mensagem', e.target.value),
            rows: 12,
            style: { ...campo, marginBottom: 4, resize: 'vertical', fontFamily: 'inherit', lineHeight: '20px' },
          }),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted } },
            React.createElement('code', { style: { background: T.surfaceMuted, padding: '1px 4px', borderRadius: 3 } }, '{orgao}'),
            ' e ',
            React.createElement('code', { style: { background: T.surfaceMuted, padding: '1px 4px', borderRadius: 3 } }, '{telefone}'),
            ' são preenchidos automaticamente no envio.'),

          React.createElement('div', {
            style: {
              marginTop: 16, padding: '10px 12px', borderRadius: T.radiusSm,
              background: T.surfaceMuted, border: `1px solid ${T.border}`,
              fontSize: 12, color: T.textSecondary, lineHeight: '18px',
            },
          },
            React.createElement(Info, { size: 13, style: { verticalAlign: '-2px', marginRight: 6 } }),
            'O aparelho ainda toca por 1 a 2 segundos antes da recusa. Para não tocar nada, ative no celular: WhatsApp → Configurações → Privacidade → Chamadas → "Silenciar chamadas de desconhecidos".'),
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

// ---------- Avisos globais (popup do admin para atendentes online) ----------
const IMPORTANCIA_OPCOES = [
  { id: 'baixa', rotulo: 'Baixa', desc: 'Popup discreto no canto', cor: '#2563EB', grad: 'linear-gradient(135deg,#2563EB,#3B82F6)' },
  { id: 'media', rotulo: 'Média', desc: 'Popup no canto, destaque', cor: '#D97706', grad: 'linear-gradient(135deg,#D97706,#F59E0B)' },
  { id: 'alta', rotulo: 'Alta', desc: 'Modal em tela cheia', cor: '#DC2626', grad: 'linear-gradient(135deg,#DC2626,#EF4444)' },
];
const IMPORTANCIA_ICONE = { baixa: Info, media: BellRing, alta: AlertTriangle };

function AbaAvisos() {
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [importancia, setImportancia] = useState('media');
  const [destino, setDestino] = useState('todos');
  const [departamentos, setDepartamentos] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [selDeps, setSelDeps] = useState([]);
  const [selUsers, setSelUsers] = useState([]);
  const [agendar, setAgendar] = useState(false);
  const [agendarEm, setAgendarEm] = useState('');
  const [duracao, setDuracao] = useState(0);
  const [diario, setDiario] = useState(false);
  const [encerraEm, setEncerraEm] = useState('');
  const [historico, setHistorico] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [abaAtual, setAbaAtual] = useState('criar');
  const [confirmar, setConfirmar] = useState(null);

  const SwitchBtn = ({ checked, onChange, label }) => React.createElement('button', {
    type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label,
    onClick: () => onChange(!checked),
    style: {
      position: 'relative', display: 'inline-block', width: 44, height: 24, borderRadius: 24,
      border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0,
      background: checked ? T.primary : '#d1d5db', transition: 'background 0.2s',
    },
  }, React.createElement('span', {
    style: {
      position: 'absolute', left: checked ? 22 : 3, bottom: 3, width: 18, height: 18, borderRadius: '50%',
      background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.2s', pointerEvents: 'none',
    },
  }));

  const carregarHistorico = () => fetchHistoricoAvisos().then(setHistorico).catch(() => {});
useEffect(() => {
    Promise.all([fetchAvisoAtual(), fetchDepartamentos(), fetchOperadores(), fetchHistoricoAvisos()])
      .then(([a, deps, ops, hist]) => {
        setDepartamentos(deps || []);
        setOperadores(ops || []);
        setHistorico(hist || []);
        // Formulário começa vazio a cada carregamento (sem prefill do último aviso).
      })
      .catch(() => {});
  }, []);

  const toggleDep = (id) => setSelDeps((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleUser = (id) => setSelUsers((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const resumoAlvo = () => {
    if (destino === 'departamentos') return selDeps.length ? `${selDeps.length} departamento(s)` : 'Nenhum departamento selecionado';
    if (destino === 'usuarios') return selUsers.length ? `${selUsers.length} usuário(s)` : 'Nenhum usuário selecionado';
    return 'Todos os atendentes online';
  };

  const enviar = async () => {
    const texto = mensagem.trim();
    if (!texto) { alert('Escreva a mensagem do aviso.'); return; }
    if (destino === 'departamentos' && selDeps.length === 0) { alert('Selecione ao menos um departamento.'); return; }
    if (destino === 'usuarios' && selUsers.length === 0) { alert('Selecione ao menos um usuário.'); return; }
    if (agendar && !agendarEm) { alert('Informe a data/hora do agendamento.'); return; }
    const quando = agendar ? (new Date(agendarEm).toISOString()) : null;
    if (agendar && (!quando || Number.isNaN(new Date(quando).getTime()))) { alert('Data/hora de agendamento inválida.'); return; }
    let encerraISO = null;
    if (diario) {
      if (!encerraEm) { alert('Informe a data/hora de encerramento do aviso diário.'); return; }
      encerraISO = new Date(encerraEm).toISOString();
      if (Number.isNaN(new Date(encerraISO).getTime())) { alert('Data/hora de encerramento inválida.'); return; }
      if (new Date(encerraISO).getTime() <= (quando ? new Date(quando).getTime() : Date.now())) {
        alert('A data de encerramento deve ser posterior ao início do aviso.'); return;
      }
    }
    setConfirmar({
      tipo: 'enviar',
      titulo: agendar ? 'Agendar aviso' : 'Enviar aviso agora',
      payload: { titulo: titulo.trim(), mensagem: texto, destino, departamento_ids: selDeps, operador_ids: selUsers, importancia, agendar_em: quando, duracao_min: diario ? 0 : (Number(duracao) > 0 ? Number(duracao) : 0), recorrencia: diario ? 'diario' : 'unico', encerra_em: encerraISO },
    });
  };

  const executarEnvio = async (payload) => {
    setConfirmar(null);
    setEnviando(true);
    try {
      await enviarAvisoGlobal(payload);
      setFeito(true);
      setTimeout(() => setFeito(false), 2500);
      await carregarHistorico();
      setMensagem(''); setTitulo(''); setAgendar(false); setAgendarEm(''); setDuracao(0); setDiario(false); setEncerraEm('');
    } catch (e) {
      alert(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const limpar = async () => {
    setConfirmar({ tipo: 'limpar' });
  };

  const executarLimpar = async () => {
    setConfirmar(null);
    setLimpando(true);
    try {
      await limparAvisoGlobal();
      await carregarHistorico();
    } catch (e) {
      alert(e.message);
    } finally {
      setLimpando(false);
    }
  };

  const cancelar = (id) => {
    setConfirmar({ tipo: 'cancelar', id });
  };

  const executarCancelar = async (id) => {
    setConfirmar(null);
    try { await cancelarAviso(id); await carregarHistorico(); } catch (e) { alert(e.message); }
  };

  const fmtDataHora = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const statusAviso = (a) => {
    if (!a.ativo) return { rotulo: 'Finalizado', cor: '#9CA3AF' };
    if (!a.enviado_em) return { rotulo: 'Agendado', cor: '#7C3AED' };
    return { rotulo: 'Ativo', cor: '#059669' };
  };

  const iniciais = (nome) => {
    const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : partes[0]?.[1] || '')).toUpperCase() || '?';
  };
  const nomeOperador = (id) => (operadores.find((o) => o.id === id) || {}).nome;
  const nomeDepartamento = (id) => {
    const d = departamentos.find((x) => x.id === id);
    return d ? (d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome) : null;
  };
  const resumoNomes = (ids, buscar) => {
    const nomes = (ids || []).map(buscar).filter(Boolean);
    const faltando = (ids || []).length - nomes.length;
    const texto = nomes.join(', ');
    return texto + (faltando > 0 ? (texto ? ` +${faltando}` : `${faltando} selecionado(s)`) : '');
  };

  // Cartões do público-alvo
  const opcoesAlvo = [
    { id: 'todos', icone: Globe, titulo: 'Todos', desc: 'Atendentes online', cor: T.primary },
    { id: 'departamentos', icone: FolderTree, titulo: 'Departamentos', desc: 'Setores selecionados', cor: '#7C3AED' },
    { id: 'usuarios', icone: UserRound, titulo: 'Usuários', desc: 'Pessoas específicas', cor: '#059669' },
  ];

  const iconeTab = { criar: Megaphone, historico: History };
  const bp = useBreakpoint();
  const duasColunas = bp === 'desktop';

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 22, width: '100%' } },
    // Hero
    React.createElement('div', {
      style: { borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, #7C3AED 0%, #DB2777 55%, #F59E0B 130%)', color: '#fff', padding: '24px 26px', boxShadow: '0 12px 32px rgba(124,58,237,0.28)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
    },
      React.createElement('span', { style: { width: 58, height: 58, borderRadius: 16, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' } },
        React.createElement(Megaphone, { size: 30 })),
      React.createElement('div', { style: { flex: 1, minWidth: 240 } },
        React.createElement('div', { style: { fontSize: 20, fontWeight: 800, letterSpacing: -0.4 } }, 'Avisos em tempo real'),
        React.createElement('div', { style: { fontSize: 13, opacity: 0.92, lineHeight: '19px', marginTop: 3 } },
          'Comunicados que aparecem como popup. Defina prioridade, público, agendamento e duração.'),
      ),
    ),

    // Abas: Criar / Histórico
    React.createElement('div', { style: { display: 'flex', gap: 8 } },
      [['criar', 'Criar aviso', Megaphone], ['historico', 'Histórico', History]].map(([id, rotulo, Icon]) =>
        React.createElement('button', {
          key: id, onClick: () => setAbaAtual(id), 'aria-current': abaAtual === id ? 'page' : undefined,
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
            border: abaAtual === id ? `1.5px solid ${T.primary}` : `1.5px solid ${T.border}`,
            background: abaAtual === id ? T.primarySoft : T.surface, color: abaAtual === id ? T.primary : T.textSecondary,
          },
        }, React.createElement(Icon, { size: 16 }), rotulo),
      ),
    ),

    // ═══ ABA: CRIAR ═══
    abaAtual === 'criar' && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: duasColunas ? 'minmax(0, 1fr) minmax(320px, 400px)' : 'minmax(0, 1fr)', gap: 22, alignItems: 'start' } },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 } },
      // Importância
      React.createElement('div', { style: painel },
        React.createElement('div', { style: painelHead },
          React.createElement('div', { style: tituloPainel }, 'Prioridade'),
          React.createElement('span', { style: { fontSize: 12, color: T.textMuted } }, 'Define como o popup aparece'),
        ),
        React.createElement('div', { style: { padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 } },
          IMPORTANCIA_OPCOES.map((op) => {
            const ativo = importancia === op.id;
            const Icon = IMPORTANCIA_ICONE[op.id];
            return React.createElement('button', {
              key: op.id, onClick: () => setImportancia(op.id), 'aria-pressed': ativo,
              style: {
                display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                border: ativo ? `2px solid ${op.cor}` : `1.5px solid ${T.border}`,
                background: ativo ? `${op.cor}12` : T.surfaceAlt, boxShadow: ativo ? `0 6px 18px ${op.cor}26` : 'none', transition: 'all 0.15s',
              },
            },
              React.createElement('span', { style: { width: 40, height: 40, borderRadius: 11, background: ativo ? op.grad : T.surfaceMuted, color: ativo ? '#fff' : T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                React.createElement(Icon, { size: 20 })),
              React.createElement('div', { style: { minWidth: 0 } },
                React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: ativo ? op.cor : T.text } }, op.rotulo),
                React.createElement('div', { style: { fontSize: 11, color: T.textMuted, lineHeight: '15px' } }, op.desc),
              ),
            );
          }),
        ),
      ),

      // Público-alvo
      React.createElement('div', { style: painel },
        React.createElement('div', { style: painelHead },
          React.createElement('div', { style: tituloPainel }, 'Público-alvo'),
        ),
        React.createElement('div', { style: { padding: 20, display: 'flex', flexDirection: 'column', gap: 16 } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 } },
            opcoesAlvo.map((op) => {
              const ativo = destino === op.id;
              return React.createElement('button', {
                key: op.id, onClick: () => setDestino(op.id), 'aria-pressed': ativo,
                style: {
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                  border: ativo ? `2px solid ${op.cor}` : `1.5px solid ${T.border}`,
                  background: ativo ? `${op.cor}12` : T.surfaceAlt, boxShadow: ativo ? `0 6px 18px ${op.cor}26` : 'none', transition: 'all 0.15s',
                },
              },
                React.createElement('span', { style: { width: 38, height: 38, borderRadius: 11, background: ativo ? op.cor : T.surfaceMuted, color: ativo ? '#fff' : T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                  React.createElement(op.icone, { size: 19 })),
                React.createElement('div', { style: { minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text } }, op.titulo),
                  React.createElement('div', { style: { fontSize: 11, color: T.textMuted, lineHeight: '15px' } }, op.desc),
                ),
              );
            }),
          ),
          destino === 'departamentos' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 } },
              React.createElement('div', { style: label }, 'Selecione os departamentos'),
              React.createElement('span', { style: { fontSize: 12, color: T.textMuted, fontWeight: 600 } }, `${selDeps.length} selecionado(s)`),
            ),
            departamentos.length === 0
              ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted } }, 'Nenhum departamento cadastrado.')
              : React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 } },
                  departamentos.map((d) => {
                    const ativo = selDeps.includes(d.id);
                    const cor = d.cor || '#7C3AED';
                    return React.createElement('button', {
                      key: d.id, onClick: () => toggleDep(d.id), 'aria-pressed': ativo, title: d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome,
                      style: {
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', minWidth: 0,
                        border: ativo ? `1.5px solid ${cor}` : `1.5px solid ${T.border}`,
                        background: ativo ? `${cor}12` : T.surfaceAlt, boxShadow: ativo ? `0 6px 16px ${cor}22` : 'none', transition: 'all 0.15s',
                      },
                    },
                      React.createElement('span', {
                        style: {
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', background: ativo ? cor : '#94A3B8',
                        },
                      }, React.createElement(FolderTree, { size: 17 })),
                      React.createElement('div', { style: { minWidth: 0, flex: 1 } },
                        React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: ativo ? cor : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.nome),
                        React.createElement('div', { style: { fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.secretaria_nome || 'Sem secretaria'),
                      ),
                    );
                  }),
                ),
          ),
          destino === 'usuarios' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 } },
              React.createElement('div', { style: label }, 'Selecione os usuários'),
              React.createElement('span', { style: { fontSize: 12, color: T.textMuted, fontWeight: 600 } }, `${selUsers.length} selecionado(s)`),
            ),
            operadores.length === 0
              ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted } }, 'Nenhum usuário cadastrado.')
              : React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 } },
                  operadores.map((o) => {
                    const ativo = selUsers.includes(o.id);
                    return React.createElement('button', {
                      key: o.id, onClick: () => toggleUser(o.id), 'aria-pressed': ativo, title: o.email || o.nome,
                      style: {
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', minWidth: 0,
                        border: ativo ? '1.5px solid #059669' : `1.5px solid ${T.border}`,
                        background: ativo ? '#05966912' : T.surfaceAlt, boxShadow: ativo ? '0 6px 16px #05966922' : 'none', transition: 'all 0.15s',
                      },
                    },
                      React.createElement('span', {
                        style: {
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: '#fff', background: ativo ? '#059669' : '#94A3B8',
                        },
                      }, iniciais(o.nome)),
                      React.createElement('div', { style: { minWidth: 0, flex: 1 } },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                          React.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: ativo ? '#059669' : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, o.nome),
                          React.createElement('span', { title: o.online ? 'Online' : 'Offline', style: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: o.online ? '#10B981' : '#9CA3AF', boxShadow: o.online ? '0 0 0 3px #10B98122' : 'none' } }),
                        ),
                        React.createElement('div', { style: { fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, o.email || o.papel || ''),
                      ),
                    );
                  }),
                ),
          ),
        ),
      ),

      // Conteúdo
      React.createElement('div', { style: painel },
        React.createElement('div', { style: painelHead },
          React.createElement('div', { style: tituloPainel }, 'Conteúdo'),
          React.createElement('span', { style: { fontSize: 12, color: T.textMuted, fontWeight: 600 } }, `${mensagem.length}/500`),
        ),
        React.createElement('div', { style: { padding: 22, display: 'flex', flexDirection: 'column', gap: 16 } },
          React.createElement('div', null,
            React.createElement('label', { style: label }, 'Título (opcional)'),
            React.createElement('input', { value: titulo, onChange: (e) => setTitulo(e.target.value), placeholder: 'Ex.: TI / Aviso do sistema', style: campo, maxLength: 80 }),
          ),
          React.createElement('div', null,
            React.createElement('label', { style: label }, 'Mensagem'),
            React.createElement('textarea', { value: mensagem, onChange: (e) => setMensagem(e.target.value), rows: 4, placeholder: 'Ex.: Preciso que todos se desloguem e loguem novamente...', style: { ...campo, resize: 'vertical', fontFamily: T.font, minHeight: 110, marginBottom: 0 }, maxLength: 500 }),
          ),
        ),
      ),

      // Agendamento e duração
      React.createElement('div', { style: painel },
        React.createElement('div', { style: painelHead },
          React.createElement('div', { style: tituloPainel }, 'Quando e por quanto tempo'),
        ),
        React.createElement('div', { style: { padding: 20, display: 'flex', flexDirection: 'column', gap: 16 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('span', { style: { width: 36, height: 36, borderRadius: 10, background: agendar ? `${T.primary}18` : T.surfaceMuted, color: agendar ? T.primary : T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                React.createElement(CalendarClock, { size: 18 })),
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, 'Agendar envio'),
                React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Programar para uma data/hora futura'),
              ),
            ),
            React.createElement(SwitchBtn, { checked: agendar, onChange: setAgendar, label: 'Agendar envio' }),
          ),
          agendar && React.createElement('input', {
            type: 'datetime-local', value: agendarEm, onChange: (e) => setAgendarEm(e.target.value),
            style: { ...input, width: '100%', minHeight: 44, fontFamily: T.font },
          }),
          React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                React.createElement('span', { style: { width: 36, height: 36, borderRadius: 10, background: diario ? `${T.primary}18` : T.surfaceMuted, color: diario ? T.primary : T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                  React.createElement(CalendarClock, { size: 18 })),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, 'Repetir todo dia'),
                  React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'O popup reaparece diariamente até a data de encerramento'),
                ),
              ),
              React.createElement(SwitchBtn, { checked: diario, onChange: setDiario, label: 'Repetir todo dia' }),
            ),
            diario && React.createElement('input', {
              type: 'datetime-local', value: encerraEm, onChange: (e) => setEncerraEm(e.target.value),
              style: { ...input, width: '100%', minHeight: 44, fontFamily: T.font },
            }),
            !diario && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('span', { style: { width: 36, height: 36, borderRadius: 10, background: T.surfaceMuted, color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                React.createElement(Timer, { size: 18 })),
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, 'Duração (opcional)'),
                React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Por quanto tempo o aviso fica ativo; após isso o popup some'),
              ),
            ),
            !diario && React.createElement('input', {
              type: 'number', min: 0, value: duracao || '', onChange: (e) => setDuracao(Math.max(0, Number(e.target.value))),
              placeholder: 'Duração em minutos (0 = sem limite)', style: { ...input, width: '100%', minHeight: 44, fontFamily: T.font },
            }),
          ),
        ),
      ),

      // Pré-visualização (coluna direita, fixa ao rolar)
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0, ...(duasColunas ? { position: 'sticky', top: 16 } : {}) } },
        React.createElement('div', { style: painel },
        React.createElement('div', { style: painelHead },
          React.createElement('div', { style: tituloPainel }, 'Pré-visualização'),
          React.createElement('span', { style: { fontSize: 12, color: T.textMuted, fontWeight: 600 } }, `→ ${resumoAlvo()}`),
        ),
        React.createElement('div', { style: { padding: 24, display: 'flex', justifyContent: 'center', background: T.surfaceAlt } },
          React.createElement('div', {
            style: {
              width: '100%', borderRadius: 18, overflow: 'hidden',
              background: T.surface, boxShadow: '0 16px 40px rgba(0,0,0,0.12)',
              border: importancia === 'alta' ? '1px solid #FECACA' : `1px solid ${T.border}`,
            },
          },
            React.createElement('div', {
              style: { height: 4, background: (IMPORTANCIA_OPCOES.find((o) => o.id === importancia) || IMPORTANCIA_OPCOES[1]).grad },
            }),
            React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: (IMPORTANCIA_OPCOES.find((o) => o.id === importancia) || IMPORTANCIA_OPCOES[1]).fundo || `${(IMPORTANCIA_OPCOES.find((o) => o.id === importancia) || IMPORTANCIA_OPCOES[1]).cor}12` },
            },
              React.createElement('span', { style: { width: 40, height: 40, borderRadius: 11, background: (IMPORTANCIA_OPCOES.find((o) => o.id === importancia) || IMPORTANCIA_OPCOES[1]).grad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                React.createElement(IMPORTANCIA_ICONE[importancia] || BellRing, { size: 22 })),
              React.createElement('div', { style: { minWidth: 0 } },
                React.createElement('div', { style: { fontSize: 14, fontWeight: 800, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, titulo.trim() || 'Aviso do administrador'),
                React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, (IMPORTANCIA_OPCOES.find((o) => o.id === importancia) || IMPORTANCIA_OPCOES[1]).rotulo + ' · ' + (agendar ? 'Agendado' : 'Tempo real')),
              ),
            ),
            React.createElement('div', { style: { padding: '18px 20px' } },
              React.createElement('p', { style: { margin: 0, fontSize: 14.5, lineHeight: '21px', color: T.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
                mensagem.trim() || 'Sua mensagem aparecerá aqui em tempo real para os destinatários.'),
              React.createElement('div', { style: { marginTop: 18, textAlign: 'right' } },
                React.createElement('button', {
                  style: { padding: '9px 20px', borderRadius: T.radiusSm, background: (IMPORTANCIA_OPCOES.find((o) => o.id === importancia) || IMPORTANCIA_OPCOES[1]).cor, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
                }, importancia === 'alta' ? 'Entendi' : 'Fechar'),
              ),
            ),
          ),
          (destino === 'usuarios' && selUsers.length > 0) || (destino === 'departamentos' && selDeps.length > 0)
            ? React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 } },
                React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.textMuted } }, 'Destinatários'),
                React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                  destino === 'usuarios'
                    ? selUsers.map((id) => {
                        const o = operadores.find((x) => x.id === id);
                        return React.createElement('span', { key: id, title: o?.email || '', style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: '#05966914', color: '#059669' } },
                          React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: o?.online ? '#10B981' : '#9CA3AF', flexShrink: 0 } }),
                          o?.nome || 'Usuário removido',
                        );
                      })
                    : selDeps.map((id) => {
                        const d = departamentos.find((x) => x.id === id);
                        const cor = d?.cor || '#7C3AED';
                        return React.createElement('span', { key: id, style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: `${cor}14`, color: cor } },
                          React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0 } }),
                          d ? (d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome) : 'Departamento removido',
                        );
                      }),
                ),
              )
            : null,
        ),
        ),

        React.createElement('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement('button', {
          onClick: enviar, disabled: enviando,
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 24px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#fff', border: 'none',
            background: enviando ? T.primary : 'linear-gradient(135deg, #7C3AED, #DB2777)', boxShadow: '0 8px 24px rgba(124,58,237,0.32)', opacity: enviando ? 0.7 : 1,
          },
        },
          enviando ? React.createElement(Loader2, { size: 18, className: 'spin' }) : (feito ? React.createElement(Check, { size: 18 }) : React.createElement(agendar ? CalendarClock : Send, { size: 18 })),
          enviando ? 'Enviando...' : (feito ? 'Tudo certo!' : (agendar ? 'Agendar aviso' : 'Enviar aviso agora'))),
        ),
      ),
    ),

    // ═══ ABA: HISTÓRICO ═══
    abaAtual === 'historico' && React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead },
        React.createElement('div', { style: tituloPainel }, 'Histórico de avisos'),
        React.createElement('span', { style: { fontSize: 12, color: T.textMuted } }, `${historico.length} registro(s)`),
      ),
      historico.length === 0
        ? React.createElement('div', { style: { padding: 26, color: T.textMuted, fontSize: 13, textAlign: 'center' } }, 'Nenhum aviso enviado ainda.')
        : historico.map((a) => {
            const st = statusAviso(a);
            const imp = IMPORTANCIA_OPCOES.find((o) => o.id === (a.importancia || 'media')) || IMPORTANCIA_OPCOES[1];
            const Icon = IMPORTANCIA_ICONE[a.importancia || 'media'] || BellRing;
            const resumo = a.destino === 'todos'
              ? 'Todos'
              : a.destino === 'departamentos'
                ? (resumoNomes(a.departamento_ids, nomeDepartamento) || `${(a.departamento_ids || []).length} departamento(s)`)
                : (resumoNomes(a.operador_ids, nomeOperador) || `${(a.operador_ids || []).length} usuário(s)`);
            return React.createElement('div', { key: a.id, style: { padding: '16px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 14, alignItems: 'flex-start' } },
              React.createElement('span', { style: { width: 40, height: 40, borderRadius: 11, background: imp.fundo || `${imp.cor}12`, color: imp.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                React.createElement(Icon, { size: 20 })),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                  React.createElement('span', { style: { fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.titulo || 'Aviso'),
                  React.createElement('span', { style: { fontSize: 11, padding: '2px 9px', borderRadius: 999, fontWeight: 700, background: `${st.cor}18`, color: st.cor } }, st.rotulo),
                  React.createElement('span', { style: { fontSize: 11, padding: '2px 9px', borderRadius: 999, fontWeight: 700, background: `${imp.cor}18`, color: imp.cor } }, imp.rotulo),
                ),
                React.createElement('div', { style: { marginTop: 6, fontSize: 13, color: T.textSecondary, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, a.mensagem),
                React.createElement('div', { style: { marginTop: 8, fontSize: 11.5, color: T.textMuted, display: 'flex', gap: 14, flexWrap: 'wrap' } },
                  React.createElement('span', { title: resumo, style: { maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `Alvo: ${resumo}`),
                  a.recorrencia === 'diario' && React.createElement('span', { style: { fontWeight: 700, color: T.primary } }, `Diário até ${fmtDataHora(a.encerra_em)}`),
                  React.createElement('span', null, `Criado: ${fmtDataHora(a.criado_em)}`),
                  a.agendar_em && React.createElement('span', null, `Agendado: ${fmtDataHora(a.agendar_em)}`),
                  a.enviado_em && React.createElement('span', null, `Enviado: ${fmtDataHora(a.enviado_em)}`),
                  a.expiracao_em && React.createElement('span', null, `Expira: ${fmtDataHora(a.expiracao_em)}`),
                  a.criado_por_nome && React.createElement('span', null, `Por: ${a.criado_por_nome}`),
                ),
              ),
              !a.enviado_em && a.ativo && React.createElement('button', {
                onClick: () => cancelar(a.id), title: 'Cancelar agendamento',
                style: { background: 'none', border: 'none', cursor: 'pointer', color: T.danger, padding: 6, display: 'flex', flexShrink: 0 },
              }, React.createElement(Ban, { size: 17 })),
            );
          }),
    ),

    // Modal de confirmação
    confirmar && React.createElement('div', {
      role: 'alertdialog',
      'aria-modal': 'true',
      onClick: () => setConfirmar(null),
      style: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    },
      React.createElement('div', {
        role: 'document',
        onClick: (e) => e.stopPropagation(),
        style: { width: '100%', maxWidth: 440, borderRadius: 18, overflow: 'hidden', background: T.surface, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${T.border}`, background: confirmar.tipo === 'enviar' ? '#FEF3E2' : '#FDECEC' } },
          React.createElement('span', { style: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', background: confirmar.tipo === 'enviar' ? 'linear-gradient(135deg, #7C3AED, #DB2777)' : '#DC2626' } },
            React.createElement(confirmar.tipo === 'enviar' ? Send : confirmar.tipo === 'limpar' ? BellOff : Ban, { size: 22 })),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', { style: { fontSize: 15, fontWeight: 800, color: T.text } },
              confirmar.tipo === 'enviar' ? (confirmar.payload.agendar_em ? 'Agendar aviso' : 'Enviar aviso agora')
                : confirmar.tipo === 'limpar' ? 'Limpar popups'
                : 'Cancelar aviso agendado'),
            React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 2 } },
              confirmar.tipo === 'enviar' ? 'Confirme os dados antes de prosseguir'
                : confirmar.tipo === 'limpar' ? 'Esta ação fecha os popups abertos'
                : 'O agendamento será descartado'),
          ),
        ),
        React.createElement('div', { style: { padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 } },
          confirmar.tipo === 'enviar' ? React.createElement(React.Fragment, null,
            React.createElement('div', { style: { borderRadius: 12, border: `1px solid ${T.border}`, background: T.surfaceAlt, padding: '12px 14px' } },
              React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 } }, confirmar.payload.titulo || 'Aviso do administrador'),
              React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, confirmar.payload.mensagem),
            ),
            React.createElement('div', { style: { fontSize: 12.5, color: T.textMuted, display: 'flex', flexDirection: 'column', gap: 4 } },
              React.createElement('span', null, `Público: ${resumoAlvo()}`),
              confirmar.payload.agendar_em && React.createElement('span', null, `Agendado para: ${fmtDataHora(confirmar.payload.agendar_em)}`),
              confirmar.payload.recorrencia === 'diario' && React.createElement('span', null, `Repete todo dia até ${fmtDataHora(confirmar.payload.encerra_em)}`),
              !confirmar.payload.agendar_em && confirmar.payload.duracao_min > 0 && React.createElement('span', null, `Expira após ${confirmar.payload.duracao_min} minuto(s)`),
            ),
          ) : React.createElement('p', { style: { margin: 0, fontSize: 14, lineHeight: '20px', color: T.text } },
            confirmar.tipo === 'limpar'
              ? 'Remover os popups abertos deste aviso em todos os destinatários?'
              : 'Cancelar este aviso agendado? O agendamento será descartado.'),
        ),
        React.createElement('div', { style: { padding: '0 22px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 } },
          React.createElement('button', {
            onClick: () => setConfirmar(null),
            style: { padding: '10px 20px', borderRadius: T.radiusSm, background: T.surfaceMuted, color: T.textSecondary, border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
          }, 'Cancelar'),
          React.createElement('button', {
            onClick: () => {
              if (confirmar.tipo === 'enviar') executarEnvio(confirmar.payload);
              else if (confirmar.tipo === 'limpar') executarLimpar();
              else if (confirmar.tipo === 'cancelar') executarCancelar(confirmar.id);
            },
            style: { padding: '10px 20px', borderRadius: T.radiusSm, background: confirmar.tipo === 'enviar' ? 'linear-gradient(135deg, #7C3AED, #DB2777)' : '#DC2626', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(124,58,237,0.25)' },
          }, confirmar.tipo === 'enviar' ? 'Confirmar envio' : 'Confirmar'),
        ),
      ),
    ),
  );
}
