import React, { useState, useEffect, useCallback } from 'react';
import { T } from '../theme.js';
import { Settings, Package, Tag, Layers, Clock, Calendar, Plus, X, Save, Trash2, Loader2 } from 'lucide-react';

const API = '/api/v1/admin/protocols';
const token = () => { try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch { return ''; } };
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

async function get(path) {
  const res = await fetch(API + path, { headers: headers() });
  if (!res.ok) throw new Error('Erro ao carregar');
  return res.json();
}
async function post(path, body) {
  const res = await fetch(API + path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.erro || 'Erro'); }
  return res.json();
}
async function put(path, body) {
  const res = await fetch(API + path, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.erro || 'Erro'); }
  return res.json();
}
async function del(path) {
  await fetch(API + path, { method: 'DELETE', headers: headers() });
}

const ABAS = [
  { id: 'servicos', label: 'Serviços', Icone: Package, desc: 'Catálogo de serviços e formulários' },
  { id: 'categorias', label: 'Categorias', Icone: Layers, desc: 'Categorias de protocolo' },
  { id: 'tipos', label: 'Tipos', Icone: Tag, desc: 'Tipos de protocolo' },
  { id: 'slas', label: 'SLAs', Icone: Clock, desc: 'Regras de prazo e prioridade' },
  { id: 'feriados', label: 'Feriados', Icone: Calendar, desc: 'Calendário de feriados' },
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12.5,
  borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`,
  background: T.surfaceAlt, color: T.text, outline: 'none', fontFamily: 'inherit',
  marginBottom: 8,
};

const btnPrimary = {
  padding: '8px 16px', borderRadius: T.radiusSm, border: 'none', background: T.primary,
  color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
};

export function PaginaConfigProtocolos({ breakpoint }) {
  const [aba, setAba] = useState('servicos');
  const ehMobile = breakpoint === 'mobile';

  return React.createElement('div', {
    style: { flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, overflow: 'hidden' },
  },
    React.createElement('div', {
      style: { padding: '16px 20px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
        React.createElement(Settings, { size: 22, style: { color: T.primary } }),
        React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0 } }, 'Configurações de Protocolo'),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 2, flexWrap: 'wrap' } },
        ABAS.map(a => React.createElement('button', {
          key: a.id,
          onClick: () => setAba(a.id),
          style: {
            display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            border: 'none', background: aba === a.id ? T.primarySoft : 'transparent',
            color: aba === a.id ? T.primary : T.textSecondary,
            fontWeight: aba === a.id ? 700 : 500, fontSize: 12.5, borderRadius: T.radiusSm,
            cursor: 'pointer', fontFamily: 'inherit',
          },
        }, React.createElement(a.Icone, { size: 14 }), a.label)),
      ),
    ),

    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 20 } },
      aba === 'servicos' && React.createElement(GerenciadorServicos, null),
      aba === 'categorias' && React.createElement(GerenciadorSimples, { tipo: 'categories', titulo: 'Categorias', campo: 'nome' }),
      aba === 'tipos' && React.createElement(GerenciadorSimples, { tipo: 'types', titulo: 'Tipos de Protocolo', campo: 'nome' }),
      aba === 'slas' && React.createElement(GerenciadorSLAs, null),
      aba === 'feriados' && React.createElement(GerenciadorFeriados, null),
    ),
  );
}

// ─── Gerenciador de Serviços (com formulários dinâmicos) ─────
function GerenciadorServicos() {
  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setServicos(await get('/services')); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const excluir = async (id) => { if (!confirm('Desativar serviço?')) return; await del(`/services/${id}`); carregar(); };

  if (loading) return React.createElement('div', { style: { textAlign: 'center', padding: 40 } }, React.createElement(Loader2, { size: 24, className: 'spin', style: { color: T.textMuted } }));

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    React.createElement('button', {
      onClick: () => setEditando({ nome: '', descricao: '', prazo_estimado_dias: 10, campos: [] }),
      style: { ...btnPrimary, alignSelf: 'flex-start' },
    }, React.createElement(Plus, { size: 14 }), 'Novo serviço'),

    servicos.map(s => React.createElement('div', {
      key: s.id,
      style: { padding: '12px 14px', borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 },
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: 13.5, fontWeight: 700, color: T.text } }, s.nome),
        s.descricao && React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 2 } }, s.descricao),
        React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 4 } },
          s.secretaria_nome ? `${s.secretaria_nome} · ` : '',
          s.prazo_estimado_dias ? `${s.prazo_estimado_dias} dias` : '',
          s.total_campos ? ` · ${s.total_campos} campos` : '',
        ),
      ),
      React.createElement('button', { onClick: () => setEditando(s), style: { padding: '6px 12px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surface, color: T.primary, fontSize: 12, cursor: 'pointer' } }, 'Editar'),
      React.createElement('button', { onClick: () => excluir(s.id), style: { padding: '6px 12px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft, color: T.danger, fontSize: 12, cursor: 'pointer' } }, 'Desativar'),
    )),

    editando && React.createElement(ModalServico, {
      servico: editando,
      onClose: () => setEditando(null),
      onSalvo: () => { setEditando(null); carregar(); },
    }),
  );
}

function ModalServico({ servico, onClose, onSalvo }) {
  const [nome, setNome] = useState(servico.nome || '');
  const [descricao, setDescricao] = useState(servico.descricao || '');
  const [prazo, setPrazo] = useState(servico.prazo_estimado_dias || 10);
  const [campos, setCampos] = useState(servico.campos || []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    if (!nome.trim()) { setErro('Nome obrigatório'); return; }
    setSalvando(true); setErro('');
    try {
      const body = { nome: nome.trim(), descricao: descricao.trim() || null, prazo_estimado_dias: prazo, campos };
      if (servico.id) await put(`/services/${servico.id}`, body);
      else await post('/services', body);
      onSalvo();
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };

  const addCampo = () => setCampos([...campos, { nome_campo: '', rotulo: '', tipo: 'texto', obrigatorio: false }]);
  const remCampo = (i) => setCampos(campos.filter((_, idx) => idx !== i));
  const attCampo = (i, k, v) => {
    const c = [...campos];
    c[i] = { ...c[i], [k]: v };
    setCampos(c);
  };

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' },
    onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
  },
    React.createElement('div', {
      style: { background: T.surface, borderRadius: T.radiusLg, padding: 24, maxWidth: 600, width: '95%', maxHeight: '85vh', overflowY: 'auto', boxShadow: T.shadowLg },
      onClick: (e) => e.stopPropagation(),
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 } },
        React.createElement('h3', { style: { fontSize: 17, fontWeight: 700, color: T.text, margin: 0, flex: 1 } }, servico.id ? 'Editar serviço' : 'Novo serviço'),
        React.createElement('button', { onClick: onClose, style: { width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer', fontSize: 18 } }, React.createElement(X, { size: 18 })),
      ),

      React.createElement('input', { value: nome, onChange: e => setNome(e.target.value), placeholder: 'Nome do serviço', style: inputStyle }),
      React.createElement('textarea', { value: descricao, onChange: e => setDescricao(e.target.value), placeholder: 'Descrição', rows: 2, style: { ...inputStyle, resize: 'vertical' } }),
      React.createElement('input', { type: 'number', value: prazo, onChange: e => setPrazo(parseInt(e.target.value) || 0), placeholder: 'Prazo estimado (dias)', style: inputStyle }),

      React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.text, margin: '12px 0 8px' } }, 'Campos do formulário'),
      campos.map((c, i) => React.createElement('div', { key: i, style: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' } },
        React.createElement('input', { value: c.rotulo, onChange: e => attCampo(i, 'rotulo', e.target.value), placeholder: 'Rótulo', style: { ...inputStyle, flex: 2, marginBottom: 0 } }),
        React.createElement('select', { value: c.tipo, onChange: e => attCampo(i, 'tipo', e.target.value), style: { ...inputStyle, flex: 1, marginBottom: 0 } },
          React.createElement('option', { value: 'texto' }, 'Texto'),
          React.createElement('option', { value: 'texto_longo' }, 'Longo'),
          React.createElement('option', { value: 'numero' }, 'Número'),
          React.createElement('option', { value: 'data' }, 'Data'),
          React.createElement('option', { value: 'email' }, 'E-mail'),
          React.createElement('option', { value: 'selecao' }, 'Seleção'),
        ),
        React.createElement('label', { style: { fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' } },
          React.createElement('input', { type: 'checkbox', checked: c.obrigatorio, onChange: e => attCampo(i, 'obrigatorio', e.target.checked) }), 'Obrig.'),
        React.createElement('button', { onClick: () => remCampo(i), style: { padding: '6px 8px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft, color: T.danger, cursor: 'pointer', fontSize: 11 } }, React.createElement(X, { size: 12 })),
      )),
      React.createElement('button', { onClick: addCampo, style: { ...btnPrimary, background: T.surfaceAlt, color: T.primary, border: `1px dashed ${T.primary}`, marginBottom: 16 } }, React.createElement(Plus, { size: 14 }), 'Adicionar campo'),

      erro && React.createElement('div', { style: { fontSize: 12, color: T.danger, background: T.dangerSoft, padding: '8px 12px', borderRadius: T.radiusSm, marginBottom: 12 } }, erro),

      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement('button', { onClick: onClose, style: { padding: '8px 16px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 12.5, cursor: 'pointer' } }, 'Cancelar'),
        React.createElement('button', { onClick: salvar, disabled: salvando, style: { ...btnPrimary } }, salvando ? 'Salvando...' : 'Salvar'),
      ),
    ),
  );
}

// ─── Gerenciador Simples (categorias, tipos) ─────────────────
function GerenciadorSimples({ tipo, titulo, campo }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setItens(await get(`/${tipo}`)); } catch {}
    setLoading(false);
  }, [tipo]);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    if (!novo.trim()) return;
    try {
      await post(`/${tipo}`, { [campo]: novo.trim() });
      setNovo('');
      carregar();
    } catch (e) { alert(e.message); }
  };

  const excluir = async (id) => {
    await del(`/${tipo}/${id}`);
    carregar();
  };

  if (loading) return React.createElement('div', { style: { textAlign: 'center', padding: 40 } }, React.createElement(Loader2, { size: 24, className: 'spin', style: { color: T.textMuted } }));

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    React.createElement('div', { style: { display: 'flex', gap: 6 } },
      React.createElement('input', { value: novo, onChange: e => setNovo(e.target.value), onKeyDown: e => { if (e.key === 'Enter') criar(); }, placeholder: `Nova ${titulo.toLowerCase()}...`, style: { ...inputStyle, flex: 1, marginBottom: 0 } }),
      React.createElement('button', { onClick: criar, style: btnPrimary }, 'Adicionar'),
    ),
    itens.map(item => React.createElement('div', {
      key: item.id,
      style: { display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` },
    },
      React.createElement('span', { style: { flex: 1, fontSize: 13.5, fontWeight: 600, color: T.text } }, item[campo]),
      React.createElement('button', { onClick: () => excluir(item.id), style: { padding: '5px 10px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft, color: T.danger, fontSize: 11.5, cursor: 'pointer' } }, 'Desativar'),
    )),
  );
}

// ─── Gerenciador de SLAs ─────────────────────────────────────
function GerenciadorSLAs() {
  const [slas, setSlas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nome: '', prazo_horas: 48, prioridade: 'NORMAL' });

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setSlas(await get('/slas')); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    if (!form.nome.trim()) return;
    await post('/slas', form);
    setForm({ nome: '', prazo_horas: 48, prioridade: 'NORMAL' });
    carregar();
  };
  const excluir = async (id) => { await del(`/slas/${id}`); carregar(); };

  if (loading) return React.createElement('div', { style: { textAlign: 'center', padding: 40 } }, React.createElement(Loader2, { size: 24, className: 'spin', style: { color: T.textMuted } }));

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
      React.createElement('input', { value: form.nome, onChange: e => setForm({ ...form, nome: e.target.value }), placeholder: 'Nome da regra', style: { ...inputStyle, flex: 2, minWidth: 150, marginBottom: 0 } }),
      React.createElement('input', { type: 'number', value: form.prazo_horas, onChange: e => setForm({ ...form, prazo_horas: parseInt(e.target.value) || 0 }), placeholder: 'Horas', style: { ...inputStyle, flex: 1, minWidth: 80, marginBottom: 0 } }),
      React.createElement('select', { value: form.prioridade, onChange: e => setForm({ ...form, prioridade: e.target.value }), style: { ...inputStyle, flex: 1, minWidth: 100, marginBottom: 0 } },
        React.createElement('option', { value: 'NORMAL' }, 'Normal'),
        React.createElement('option', { value: 'ALTA' }, 'Alta'),
        React.createElement('option', { value: 'URGENTE' }, 'Urgente'),
        React.createElement('option', { value: 'BAIXA' }, 'Baixa'),
      ),
      React.createElement('button', { onClick: criar, style: btnPrimary }, 'Criar SLA'),
    ),
    slas.map(sla => React.createElement('div', {
      key: sla.id,
      style: { display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` },
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('span', { style: { fontSize: 13.5, fontWeight: 600, color: T.text } }, sla.nome),
        React.createElement('span', { style: { fontSize: 11.5, color: T.textMuted, marginLeft: 8 } }, `${sla.prazo_horas}h · ${sla.prioridade}`),
        sla.departamento_nome && React.createElement('span', { style: { fontSize: 11, color: T.textMuted, marginLeft: 4 } }, `· ${sla.departamento_nome}`),
      ),
      React.createElement('button', { onClick: () => excluir(sla.id), style: { padding: '5px 10px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft, color: T.danger, fontSize: 11.5, cursor: 'pointer' } }, 'Remover'),
    )),
  );
}

// ─── Gerenciador de Feriados ─────────────────────────────────
function GerenciadorFeriados() {
  const [feriados, setFeriados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nome: '', data: '', tipo: 'feriado' });

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setFeriados(await get('/holidays')); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    if (!form.nome.trim() || !form.data) return;
    await post('/holidays', form);
    setForm({ nome: '', data: '', tipo: 'feriado' });
    carregar();
  };
  const excluir = async (id) => { await del(`/holidays/${id}`); carregar(); };

  if (loading) return React.createElement('div', { style: { textAlign: 'center', padding: 40 } }, React.createElement(Loader2, { size: 24, className: 'spin', style: { color: T.textMuted } }));

  const formatar = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
      React.createElement('input', { value: form.nome, onChange: e => setForm({ ...form, nome: e.target.value }), placeholder: 'Nome do feriado', style: { ...inputStyle, flex: 2, minWidth: 150, marginBottom: 0 } }),
      React.createElement('input', { type: 'date', value: form.data, onChange: e => setForm({ ...form, data: e.target.value }), style: { ...inputStyle, flex: 1, minWidth: 130, marginBottom: 0 } }),
      React.createElement('button', { onClick: criar, style: btnPrimary }, 'Adicionar'),
    ),
    feriados.map(f => React.createElement('div', {
      key: f.id,
      style: { display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` },
    },
      React.createElement(Calendar, { size: 16, style: { color: T.warning } }),
      React.createElement('div', { style: { flex: 1, marginLeft: 10 } },
        React.createElement('div', { style: { fontSize: 13.5, fontWeight: 600, color: T.text } }, f.nome),
        React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted } }, `${formatar(f.data)} · ${f.tipo}${f.recorrente ? ' · recorrente' : ''}`),
      ),
      React.createElement('button', { onClick: () => excluir(f.id), style: { padding: '5px 10px', borderRadius: T.radiusSm, border: 'none', background: T.dangerSoft, color: T.danger, fontSize: 11.5, cursor: 'pointer' } }, 'Remover'),
    )),
  );
}
