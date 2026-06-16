import React, { useState, useEffect } from 'react';
import { Building2, FolderTree, Users, Smartphone, Plus, Trash2, Wifi, WifiOff, LogOut, QrCode, KeyRound, Ban, SlidersHorizontal, Save, Loader2, Check, Bot, FileText, BarChart3, Brain, MessageSquare } from 'lucide-react';
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
  fetchDashboard,
  fetchIrisConfig, salvarIrisConfig,
} from '../api';
import { useSocket } from '../context/SocketContext';

const ABAS = [
  { id: 'conexao', label: 'Conexão', icon: Smartphone },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'geral', label: 'Atendimento', icon: SlidersHorizontal },
  { id: 'chatbot', label: 'Chatbot', icon: Bot },
  { id: 'iris', label: 'Iris IA', icon: Brain },
  { id: 'templates', label: 'Templates', icon: MessageSquare },
  { id: 'bloqueios', label: 'Bloqueios', icon: Ban },
  { id: 'secretarias', label: 'Secretarias', icon: Building2 },
  { id: 'departamentos', label: 'Departamentos', icon: FolderTree },
  { id: 'equipe', label: 'Equipe', icon: Users },
];

export function PaginaConfiguracoes({ onOpenQR }) {
  const [aba, setAba] = useState('conexao');

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    React.createElement('div', { style: { padding: '22px 32px 0', background: T.surface, borderBottom: `1px solid ${T.border}` } },
      React.createElement('h1', { style: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 } }, 'Configurações'),
      React.createElement('p', { style: { fontSize: 13, color: T.textMuted, marginBottom: 16 } }, 'Estruture seu órgão, equipe e canais de atendimento.'),
      React.createElement('div', { style: { display: 'flex', gap: 4 } },
        ABAS.map((a) =>
          React.createElement('button', {
            key: a.id, onClick: () => setAba(a.id),
            style: {
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', border: 'none', cursor: 'pointer',
              background: 'transparent', fontSize: 14, fontWeight: 600,
              color: aba === a.id ? T.primary : T.textSecondary,
              borderBottom: `2px solid ${aba === a.id ? T.primary : 'transparent'}`,
            },
          }, React.createElement(a.icon, { size: 16 }), a.label)),
      ),
    ),
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 32 } },
      aba === 'conexao' && React.createElement(AbaConexao, { onOpenQR }),
      aba === 'dashboard' && React.createElement(AbaDashboard),
      aba === 'geral' && React.createElement(AbaGeral),
      aba === 'chatbot' && React.createElement(AbaChatbot),
      aba === 'iris' && React.createElement(AbaIris),
      aba === 'templates' && React.createElement(AbaTemplates),
      aba === 'bloqueios' && React.createElement(AbaBloqueios),
      aba === 'secretarias' && React.createElement(AbaSecretarias),
      aba === 'departamentos' && React.createElement(AbaDepartamentos),
      aba === 'equipe' && React.createElement(AbaEquipe),
    ),
  );
}

// ---------- estilos compartilhados ----------
const painel = { maxWidth: 820, background: T.surface, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: 'hidden' };
const painelHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${T.border}` };
const tituloPainel = { fontSize: 16, fontWeight: 700, color: T.text };
const btnAdd = { display: 'flex', alignItems: 'center', gap: 6, background: T.primary, color: '#fff', border: 'none', borderRadius: T.radiusSm, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const linha = { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${T.border}` };
const input = { padding: '10px 12px', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 14, outline: 'none' };
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

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 620 } },
    // Seletor de provedor
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Como o WhatsApp será conectado')),
      React.createElement('div', { style: { padding: 18, display: 'flex', gap: 12 } },
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
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
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

    provider === 'baileys' && React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', maxWidth: 620 } },
      React.createElement(BotaoSalvar, { salvando, salvo, onClick: salvar, texto: 'Salvar preferências' }),
    ),
  );
}

function CartaoProvider({ ativo, icon: Icon, titulo, desc, onClick }) {
  return React.createElement('button', {
    onClick,
    style: {
      flex: 1, textAlign: 'left', cursor: 'pointer', padding: 16, borderRadius: T.radius,
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
      React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 16 } },
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

      React.createElement('div', { style: { display: 'flex', gap: 16, marginBottom: 16 } },
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('label', { style: label }, 'Início'),
          React.createElement('input', { type: 'time', value: cfg.horario_inicio || '', onChange: (e) => setField('horario_inicio', e.target.value), style: { ...campo, marginBottom: 0 } }),
        ),
        React.createElement('div', { style: { flex: 1 } },
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

      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
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

// ---------- Dashboard (imp.md Admin) ----------
function AbaDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => { fetchDashboard().then(setData).catch(console.error); }, []);

  if (!data) return React.createElement('div', { style: { color: T.textMuted } }, 'Carregando...');

  const kpiStyle = (color) => ({
    background: T.surface,
    borderRadius: T.radiusLg,
    border: `1px solid ${T.border}`,
    padding: 20,
    flex: 1,
    minWidth: 160,
  });

  const statusMap = { fila: 'Aguardando', aberta: 'Em andamento', resolvida: 'Encerrados' };
  const statusColor = { fila: '#F59E0B', aberta: '#3B82F6', resolvida: '#10B981' };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24 } },
    // KPIs
    React.createElement('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap' } },
      React.createElement('div', { style: kpiStyle() },
        React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: T.text } }, data.total_hoje || 0),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Atendimentos hoje'),
      ),
      React.createElement('div', { style: kpiStyle() },
        React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: T.text } }, data.total_semana || 0),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Últimos 7 dias'),
      ),
      React.createElement('div', { style: kpiStyle() },
        React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: T.text } }, data.total_mes || 0),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Este mês'),
      ),
      React.createElement('div', { style: kpiStyle() },
        React.createElement('div', {
          style: { fontSize: 28, fontWeight: 800, color: (data.nps?.nps || 0) >= 50 ? T.success : T.warning },
        }, data.nps?.nps?.toFixed(0) || '—'),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'NPS'),
      ),
    ),

    // Status
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Conversas por status')),
      React.createElement('div', { style: { display: 'flex', gap: 16, padding: 22 } },
        (data.por_status || []).map((s) =>
          React.createElement('div', {
            key: s.status,
            style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
          },
            React.createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: statusColor[s.status] || T.textMuted } }),
            React.createElement('span', { style: { fontWeight: 600, color: T.text } }, statusMap[s.status] || s.status),
            React.createElement('span', { style: { color: T.textMuted, fontWeight: 700 } }, String(s.count)),
          )),
        (!data.por_status || data.por_status.length === 0) &&
          React.createElement('span', { style: { color: T.textMuted, fontSize: 13 } }, 'Nenhuma conversa registrada.'),
      ),
    ),

    // Operadores online
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead },
        React.createElement('div', { style: tituloPainel }, 'Operadores'),
        React.createElement('span', { style: { fontSize: 12, color: T.textMuted } },
          `${(data.operadores_online || []).filter((o) => o.online).length} online`),
      ),
      React.createElement('div', { style: { padding: '4px 0' } },
        (data.operadores_online || []).map((o) =>
          React.createElement('div', { key: o.id, style: linha },
            React.createElement('span', {
              style: { width: 9, height: 9, borderRadius: '50%', background: o.online ? T.online : T.offline },
            }),
            React.createElement('span', { style: { flex: 1, fontSize: 14, fontWeight: 600, color: T.text } }, o.nome),
            React.createElement('span', {
              style: { fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600, color: T.textSecondary, background: T.surfaceMuted },
            }, o.status_atendente || 'disponivel'),
            React.createElement('span', { style: { fontSize: 12, color: T.textMuted } }, `Carga: ${o.carga || 0}`),
          )),
        (data.operadores_online || []).length === 0 &&
          React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhum operador cadastrado.'),
      ),
    ),

    // Top assuntos
    React.createElement('div', { style: painel },
      React.createElement('div', { style: painelHead }, React.createElement('div', { style: tituloPainel }, 'Top 5 assuntos (mês)')),
      React.createElement('div', { style: { padding: '4px 0' } },
        (data.top_assuntos || []).map((a, i) =>
          React.createElement('div', { key: a.assunto, style: linha },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: T.textMuted, minWidth: 24 } }, `${i + 1}.`),
            React.createElement('span', { style: { flex: 1, fontSize: 14, color: T.text } }, a.assunto),
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: T.textMuted } }, String(a.total)),
          )),
        (data.top_assuntos || []).length === 0 &&
          React.createElement('div', { style: { padding: 22, color: T.textMuted, fontSize: 13 } }, 'Nenhum dado suficiente.'),
      ),
    ),
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

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 700 } },
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

        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14 } },
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
          React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14 } },
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('label', { style: label }, 'Provider'),
              React.createElement('select', { value: cfg?.llm_provider || 'openai', onChange: (e) => setField('llm_provider', e.target.value), style: { ...campo, marginBottom: 0 } },
                React.createElement('option', { value: 'openai' }, 'OpenAI'),
                React.createElement('option', { value: 'deepseek' }, 'DeepSeek'),
                React.createElement('option', { value: 'anthropic' }, 'Anthropic (Claude)'),
              ),
            ),
            React.createElement('div', { style: { flex: 1 } },
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

        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
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
        React.createElement('select', { value: pDepto, onChange: (e) => setPDepto(e.target.value), style: { ...input, width: 140 } },
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

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 700 } },
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
        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14 } },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('label', { style: label }, 'Modelo'),
            React.createElement('select', { value: cfg?.model || 'deepseek-chat', onChange: (e) => setField('model', e.target.value), style: { ...campo, marginBottom: 0 } },
              React.createElement('option', { value: 'deepseek-chat' }, 'DeepSeek V4 Flash'),
              React.createElement('option', { value: 'deepseek-reasoner' }, 'DeepSeek R1 (Reasoner)'),
            ),
          ),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('label', { style: label }, 'Temperatura'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement('input', { type: 'range', min: 0.1, max: 1, step: 0.1, value: cfg?.temperatura ?? 0.7, onChange: (e) => setField('temperatura', parseFloat(e.target.value)), style: { flex: 1 } }),
              React.createElement('span', { style: { fontSize: 12, color: T.textMuted, width: 32, textAlign: 'right' } }, (cfg?.temperatura ?? 0.7).toFixed(1)),
            ),
          ),
        ),
        React.createElement('label', { style: label }, 'API Key da DeepSeek'),
        React.createElement('input', { type: 'password', value: cfg?.api_key || '', onChange: (e) => setField('api_key', e.target.value), placeholder: cfg?.api_key_set ? '•••• (preencha para trocar)' : 'sk-...', style: campo }),
        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 14 } },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('label', { style: label }, 'Max Tokens'),
            React.createElement('input', { type: 'number', value: cfg?.max_tokens ?? 1024, onChange: (e) => setField('max_tokens', parseInt(e.target.value) || 1024), min: 256, max: 4096, style: campo }),
          ),
        ),
        React.createElement('label', { style: label }, 'System Prompt personalizado (opcional — deixe vazio para usar o padrão)'),
        React.createElement('textarea', { value: cfg?.system_prompt || '', onChange: (e) => setField('system_prompt', e.target.value), rows: 4, placeholder: 'Prompt padrão: a Iris conhece automaticamente todos os departamentos cadastrados...', style: { ...campo, resize: 'vertical', fontFamily: T.font } }),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
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
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('input', { value: categoria, onChange: (e) => setCategoria(e.target.value), placeholder: 'Categoria', style: { ...input, width: 160 } }),
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
