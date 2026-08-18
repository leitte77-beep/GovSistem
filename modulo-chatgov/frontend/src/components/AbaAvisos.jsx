import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Megaphone, Pencil, RotateCcw, Send, Trash2, Users, XCircle } from 'lucide-react';
import { fetchDepartamentos } from '../api';
import {
  criarAvisoApi, desativarAvisoApi, editarAvisoApi, fetchAvisosAdmin,
  fetchDestinatariosAviso, republicarAvisoApi,
} from '../api/evolucoes';
import { T } from '../theme';

const FORM_INICIAL = {
  titulo: '', mensagem: '', prioridade: 'informativo', publico: 'todos',
  exige_confirmacao: true, departamento_ids: [], expira_em: '',
};

const PRIORIDADES = {
  informativo: { label: 'Informativo', cor: '#2563EB', fundo: '#EFF6FF' },
  importante: { label: 'Importante', cor: '#B45309', fundo: '#FFF7ED' },
  urgente: { label: 'Urgente', cor: '#DC2626', fundo: '#FEF2F2' },
};

const campo = {
  width: '100%', minHeight: 42, padding: '10px 12px', boxSizing: 'border-box',
  border: `1px solid ${T.controlBorder || T.borderStrong}`, borderRadius: 8,
  background: T.surface, color: T.text, fontSize: 13.5, outline: 'none',
};
const rotulo = { display: 'block', marginBottom: 6, fontSize: 11.5, fontWeight: 750, color: T.textSecondary };
const botaoPrimario = {
  minHeight: 40, padding: '0 15px', border: 0, borderRadius: 8, background: T.primary,
  color: '#fff', fontSize: 13, fontWeight: 750, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
};
const botaoSecundario = {
  minHeight: 36, padding: '0 11px', border: `1px solid ${T.borderStrong}`, borderRadius: 8,
  background: T.surface, color: T.textSecondary, fontSize: 12, fontWeight: 700,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};

function formatarData(valor) {
  if (!valor) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

export function AbaAvisos() {
  const [avisos, setAvisos] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [detalheId, setDetalheId] = useState(null);
  const [destinatarios, setDestinatarios] = useState([]);

  const carregar = () => Promise.all([fetchAvisosAdmin(), fetchDepartamentos()])
    .then(([lista, setores]) => { setAvisos(lista || []); setDepartamentos(setores || []); })
    .catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const preview = PRIORIDADES[form.prioridade] || PRIORIDADES.informativo;
  const totalAtivos = useMemo(() => avisos.filter((a) => a.ativo).length, [avisos]);
  const alterar = (chave, valor) => setForm((atual) => ({ ...atual, [chave]: valor }));
  const alternarSetor = (id) => alterar('departamento_ids', form.departamento_ids.includes(id)
    ? form.departamento_ids.filter((item) => item !== id)
    : [...form.departamento_ids, id]);
  const limpar = () => { setForm(FORM_INICIAL); setEditandoId(null); setErro(''); };

  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      const payload = { ...form, expira_em: form.expira_em ? new Date(form.expira_em).toISOString() : null };
      if (editandoId) await editarAvisoApi(editandoId, payload);
      else await criarAvisoApi(payload);
      limpar();
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const editar = (aviso) => {
    setEditandoId(aviso.id);
    setForm({
      titulo: aviso.titulo, mensagem: aviso.mensagem, prioridade: aviso.prioridade,
      publico: aviso.publico, exige_confirmacao: aviso.exige_confirmacao,
      departamento_ids: aviso.departamento_ids || [],
      expira_em: aviso.expira_em ? new Date(aviso.expira_em).toISOString().slice(0, 16) : '',
    });
    window.requestAnimationFrame(() => document.getElementById('form-aviso-titulo')?.focus());
  };

  const desativar = async (id) => {
    if (!window.confirm('Desativar este aviso? Ele deixará de aparecer para os atendentes.')) return;
    await desativarAvisoApi(id); await carregar();
  };
  const republicar = async (id) => {
    if (!window.confirm('Republicar este aviso? As confirmações serão zeradas e ele aparecerá novamente.')) return;
    await republicarAvisoApi(id); await carregar();
  };
  const verLeituras = async (id) => {
    if (detalheId === id) { setDetalheId(null); return; }
    setDetalheId(id); setDestinatarios([]);
    try { setDestinatarios(await fetchDestinatariosAviso(id)); } catch (e) { setErro(e.message); }
  };

  return React.createElement('div', { 'data-testid': 'avisos-admin', style: { display: 'grid', gap: 20, width: '100%', maxWidth: 1040 } },
    React.createElement('section', {
      style: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: T.shadow, overflow: 'hidden' },
    },
      React.createElement('div', {
        style: { padding: '17px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 11 },
      },
        React.createElement('div', { style: { width: 38, height: 38, borderRadius: 10, background: '#FFF7ED', color: '#D97706', display: 'grid', placeItems: 'center' } }, React.createElement(Megaphone, { size: 20 })),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { style: { fontSize: 15, fontWeight: 800, color: T.text } }, editandoId ? 'Editar e republicar aviso' : 'Novo aviso aos atendentes'),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 2 } }, 'A publicação aparece imediatamente para quem estiver conectado.'),
        ),
        React.createElement('span', { style: { fontSize: 11.5, color: T.textMuted } }, `${totalAtivos} ativo(s)`),
      ),
      React.createElement('div', { style: { padding: 20, display: 'grid', gap: 16 } },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 16 } },
          React.createElement('div', null,
            React.createElement('label', { htmlFor: 'form-aviso-titulo', style: rotulo }, 'Título'),
            React.createElement('input', { id: 'form-aviso-titulo', value: form.titulo, maxLength: 120, onChange: (e) => alterar('titulo', e.target.value), placeholder: 'Ex.: Nova funcionalidade no ChatGov', style: campo }),
          ),
          React.createElement('div', null,
            React.createElement('label', { htmlFor: 'form-aviso-prioridade', style: rotulo }, 'Destaque'),
            React.createElement('select', { id: 'form-aviso-prioridade', value: form.prioridade, onChange: (e) => alterar('prioridade', e.target.value), style: campo },
              Object.entries(PRIORIDADES).map(([valor, item]) => React.createElement('option', { key: valor, value: valor }, item.label)),
            ),
          ),
        ),
        React.createElement('div', null,
          React.createElement('label', { htmlFor: 'form-aviso-mensagem', style: rotulo }, 'Mensagem'),
          React.createElement('textarea', { id: 'form-aviso-mensagem', value: form.mensagem, maxLength: 2000, rows: 4, onChange: (e) => alterar('mensagem', e.target.value), placeholder: 'Escreva de forma objetiva o que mudou e o que o atendente precisa saber.', style: { ...campo, resize: 'vertical', lineHeight: 1.5 } }),
          React.createElement('div', { style: { marginTop: 4, textAlign: 'right', fontSize: 10.5, color: T.textMuted } }, `${form.mensagem.length}/2000`),
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 16 } },
          React.createElement('fieldset', { style: { margin: 0, padding: 0, border: 0 } },
            React.createElement('legend', { style: rotulo }, 'Quem recebe'),
            React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              [['todos', 'Todos os atendentes'], ['setores', 'Setores específicos']].map(([valor, texto]) => React.createElement('button', {
                key: valor, type: 'button', onClick: () => alterar('publico', valor),
                'aria-pressed': form.publico === valor,
                style: { ...botaoSecundario, borderColor: form.publico === valor ? T.primary : T.borderStrong, color: form.publico === valor ? T.primaryOnSoft || T.primary : T.textSecondary, background: form.publico === valor ? T.primarySoft : T.surface },
              }, texto)),
            ),
          ),
          React.createElement('div', null,
            React.createElement('label', { htmlFor: 'form-aviso-validade', style: rotulo }, 'Validade (opcional)'),
            React.createElement('input', { id: 'form-aviso-validade', type: 'datetime-local', value: form.expira_em, onChange: (e) => alterar('expira_em', e.target.value), style: campo }),
          ),
        ),
        form.publico === 'setores' && React.createElement('div', { style: { padding: 12, borderRadius: 10, background: T.surfaceAlt, border: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 8 } },
          departamentos.map((dep) => React.createElement('label', { key: dep.id, style: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 8, background: form.departamento_ids.includes(dep.id) ? T.primarySoft : T.surface, color: T.text, fontSize: 12.5, cursor: 'pointer', border: `1px solid ${form.departamento_ids.includes(dep.id) ? T.primary : T.border}` } },
            React.createElement('input', { type: 'checkbox', checked: form.departamento_ids.includes(dep.id), onChange: () => alternarSetor(dep.id), style: { accentColor: T.primary } }), dep.nome,
          )),
        ),
        React.createElement('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: T.textSecondary, cursor: 'pointer' } },
          React.createElement('input', { type: 'checkbox', checked: form.exige_confirmacao, onChange: (e) => alterar('exige_confirmacao', e.target.checked), style: { marginTop: 2, accentColor: T.primary } }),
          React.createElement('span', null, React.createElement('strong', { style: { color: T.text } }, 'Exigir “Li e entendi”. '), 'Se fechar sem confirmar, o aviso volta no próximo acesso.'),
        ),
        (form.titulo || form.mensagem) && React.createElement('div', { style: { borderLeft: `5px solid ${preview.cor}`, borderRadius: 9, padding: '11px 13px', background: preview.fundo } },
          React.createElement('div', { style: { fontSize: 9.5, fontWeight: 850, letterSpacing: 1, color: preview.cor, textTransform: 'uppercase' } }, `Prévia · ${preview.label}`),
          React.createElement('div', { style: { marginTop: 4, fontSize: 13.5, fontWeight: 800, color: '#111827' } }, form.titulo || 'Título do aviso'),
          React.createElement('div', { style: { marginTop: 3, fontSize: 12.5, color: '#475569', whiteSpace: 'pre-wrap' } }, form.mensagem || 'Mensagem do aviso'),
        ),
        erro && React.createElement('div', { role: 'alert', style: { padding: '9px 11px', borderRadius: 8, background: T.dangerSoft, color: T.dangerDark || T.danger, fontSize: 12.5 } }, erro),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 9, flexWrap: 'wrap' } },
          editandoId && React.createElement('button', { type: 'button', onClick: limpar, style: botaoSecundario }, 'Cancelar edição'),
          React.createElement('button', { type: 'button', onClick: salvar, disabled: salvando, style: { ...botaoPrimario, opacity: salvando ? .65 : 1 } }, React.createElement(Send, { size: 16 }), salvando ? 'Publicando...' : (editandoId ? 'Salvar e republicar' : 'Publicar aviso')),
        ),
      ),
    ),
    React.createElement('section', { style: { display: 'grid', gap: 10 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 } },
        React.createElement('h3', { style: { margin: 0, fontSize: 15, color: T.text } }, 'Histórico de avisos'),
        React.createElement('span', { style: { fontSize: 11.5, color: T.textMuted } }, `${avisos.length} publicação(ões)`),
      ),
      avisos.length === 0
        ? React.createElement('div', { style: { padding: 24, borderRadius: 12, border: `1px dashed ${T.borderStrong}`, color: T.textMuted, textAlign: 'center', fontSize: 13 } }, 'Nenhum aviso publicado. O primeiro comunicado aparecerá aqui.')
        : avisos.map((aviso) => {
          const visual = PRIORIDADES[aviso.prioridade] || PRIORIDADES.informativo;
          const lidos = Number(aviso.total_lidos || 0);
          const total = Number(aviso.total_destinatarios || 0);
          return React.createElement('article', { key: aviso.id, style: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', opacity: aviso.ativo ? 1 : .72 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'stretch' } },
              React.createElement('div', { style: { width: 5, background: aviso.ativo ? visual.cor : T.textMuted } }),
              React.createElement('div', { style: { flex: 1, minWidth: 0, padding: '14px 16px', display: 'grid', gap: 8 } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' } },
                  React.createElement('div', { style: { flex: 1, minWidth: 180 } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' } },
                      React.createElement('strong', { style: { fontSize: 14, color: T.text } }, aviso.titulo),
                      React.createElement('span', { style: { padding: '3px 7px', borderRadius: 20, background: visual.fundo, color: visual.cor, fontSize: 9.5, fontWeight: 850, textTransform: 'uppercase' } }, visual.label),
                      !aviso.ativo && React.createElement('span', { style: { fontSize: 10, fontWeight: 800, color: T.textMuted } }, 'DESATIVADO'),
                    ),
                    React.createElement('p', { style: { margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45, color: T.textSecondary, whiteSpace: 'pre-wrap' } }, aviso.mensagem),
                  ),
                  React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    React.createElement('button', { type: 'button', onClick: () => verLeituras(aviso.id), style: botaoSecundario }, React.createElement(Eye, { size: 14 }), 'Ver leituras'),
                    React.createElement('button', { type: 'button', onClick: () => editar(aviso), style: botaoSecundario }, React.createElement(Pencil, { size: 14 }), 'Editar'),
                    aviso.ativo
                      ? React.createElement('button', { type: 'button', onClick: () => desativar(aviso.id), style: botaoSecundario }, React.createElement(Trash2, { size: 14 }), 'Desativar')
                      : React.createElement('button', { type: 'button', onClick: () => republicar(aviso.id), style: botaoSecundario }, React.createElement(RotateCcw, { size: 14 }), 'Republicar'),
                  ),
                ),
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', fontSize: 11.5, color: T.textMuted } },
                  React.createElement('span', null, aviso.publico === 'todos' ? 'Todos os atendentes' : (aviso.departamento_nomes || []).join(', ')),
                  React.createElement('span', null, `${lidos}/${total} leram`),
                  aviso.exige_confirmacao && React.createElement('span', null, `${aviso.total_confirmados || 0}/${total} confirmaram`),
                  React.createElement('span', null, `Publicado em ${formatarData(aviso.publicado_em)}`),
                ),
              ),
            ),
            detalheId === aviso.id && React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, background: T.surfaceAlt, padding: '10px 16px', display: 'grid', gap: 6 } },
              destinatarios.length === 0
                ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted, padding: 6 } }, 'Nenhum destinatário encontrado.')
                : destinatarios.map((pessoa) => React.createElement('div', { key: pessoa.id, style: { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', background: T.surface, borderRadius: 8, border: `1px solid ${T.border}` } },
                    pessoa.confirmado_em
                      ? React.createElement(CheckCircle2, { size: 16, color: T.success })
                      : React.createElement(XCircle, { size: 16, color: pessoa.lido_em ? T.warning : T.textMuted }),
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                      React.createElement('div', { style: { fontSize: 12.5, fontWeight: 700, color: T.text } }, pessoa.nome),
                      React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted } }, (pessoa.departamentos || []).join(', ') || pessoa.email),
                    ),
                    React.createElement('span', { style: { fontSize: 10.5, color: pessoa.confirmado_em ? T.success : T.textMuted } },
                      pessoa.confirmado_em ? `Confirmado ${formatarData(pessoa.confirmado_em)}` : (pessoa.lido_em ? 'Lido, sem confirmação' : 'Ainda não leu'),
                    ),
                  )),
            ),
          );
        }),
    ),
  );
}
