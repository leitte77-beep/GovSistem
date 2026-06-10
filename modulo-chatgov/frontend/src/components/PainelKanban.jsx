import React, { useState, useEffect } from 'react';
import { Plus, MoreHorizontal, Clock, User, AlertCircle, CheckCircle2, ListTodo, Calendar, Kanban } from 'lucide-react';
import { fetchKanban, criarColunaApi, criarTarefaApi, moverTarefaApi, fetchMinhasTarefas, fetchProjetos, criarProjetoApi } from '../api/evolucoes';
import { useAuth } from '../context/AuthContext';
import { T } from '../theme';

const PRIORIDADES = [
  { valor: 'baixa', cor: '#9CA3AF', label: 'Baixa' },
  { valor: 'media', cor: '#FBBF24', label: 'Média' },
  { valor: 'alta', cor: '#F97316', label: 'Alta' },
  { valor: 'urgente', cor: '#EF4444', label: 'Urgente' },
];

export function PainelKanban() {
  const { auth } = useAuth();
  const [projetos, setProjetos] = useState([]);
  const [projetoAtivo, setProjetoAtivo] = useState(null);
  const [kanban, setKanban] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNovaColuna, setShowNovaColuna] = useState(false);
  const [showNovaTarefa, setShowNovaTarefa] = useState(false);
  const [showNovoProjeto, setShowNovoProjeto] = useState(false);
  const [dragOverColuna, setDragOverColuna] = useState(null);
  const [visao, setVisao] = useState('kanban');
  const [minhasTarefas, setMinhasTarefas] = useState([]);

  useEffect(() => {
    fetchProjetos().then(setProjetos).catch(console.error);
    fetchMinhasTarefas().then(setMinhasTarefas).catch(console.error);
  }, []);

  useEffect(() => {
    if (!projetoAtivo) return;
    setLoading(true);
    fetchKanban(projetoAtivo.id).then((data) => {
      setKanban(data);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, [projetoAtivo?.id]);

  const handleDragStart = (e, tarefa) => {
    e.dataTransfer.setData('tarefaId', tarefa.id);
    e.dataTransfer.setData('colunaOrigem', tarefa.coluna_id);
  };

  const handleDragOver = (e, colunaId) => {
    e.preventDefault();
    setDragOverColuna(colunaId);
  };

  const handleDrop = async (e, colunaDestinoId) => {
    e.preventDefault();
    setDragOverColuna(null);
    const tarefaId = e.dataTransfer.getData('tarefaId');
    if (!tarefaId) return;
    try {
      await moverTarefaApi(tarefaId, { coluna_id: colunaDestinoId, ordem: 0 });
      if (projetoAtivo) {
        const data = await fetchKanban(projetoAtivo.id);
        setKanban(data);
      }
    } catch (err) {
      console.error('Erro ao mover tarefa:', err);
    }
  };

  const handleCriarColuna = async (e) => {
    e.preventDefault();
    const nome = e.target.nome.value;
    if (!nome || !projetoAtivo) return;
    try {
      await criarColunaApi(projetoAtivo.id, { nome, cor: e.target.cor?.value || '#6B7280' });
      const data = await fetchKanban(projetoAtivo.id);
      setKanban(data);
      setShowNovaColuna(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCriarTarefa = async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!projetoAtivo || !kanban) return;
    const colunaId = form.coluna_id.value || kanban.colunas[0]?.id;
    try {
      await criarTarefaApi({
        titulo: form.titulo.value,
        descricao: form.descricao?.value || '',
        projeto_id: projetoAtivo.id,
        coluna_id: colunaId,
        prioridade: form.prioridade?.value || 'media',
        prazo: form.prazo?.value || null,
      });
      const data = await fetchKanban(projetoAtivo.id);
      setKanban(data);
      setShowNovaTarefa(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCriarProjeto = async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      const projeto = await criarProjetoApi({ nome: form.nome.value, descricao: form.descricao?.value || '', cor: form.cor?.value || '#2563EB' });
      const projetosAtualizados = await fetchProjetos();
      setProjetos(projetosAtualizados);
      setProjetoAtivo(projeto);
      setShowNovoProjeto(false);
    } catch (err) {
      console.error(err);
    }
  };

  const prioridadeCor = (p) => PRIORIDADES.find((pr) => pr.valor === p)?.cor || '#9CA3AF';
  const prazoVencido = (prazo) => prazo && new Date(prazo) < new Date();

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    // Header
    React.createElement('div', { style: { padding: '10px 16px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 } },
      React.createElement(Kanban, { size: 20, color: T.primary }),
      React.createElement('select', {
        value: projetoAtivo?.id || '', onChange: (e) => { const p = projetos.find((pr) => pr.id === e.target.value); setProjetoAtivo(p); },
        style: { background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', color: T.text, fontSize: 14, flex: 1 },
      },
        React.createElement('option', { value: '' }, 'Selecione um projeto...'),
        projetos.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.nome)),
      ),
      React.createElement('button', { onClick: () => setShowNovoProjeto(true), style: { background: T.primary, border: 'none', borderRadius: 6, padding: '5px 10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 } },
        React.createElement(Plus, { size: 14 }), 'Projeto'),
      // Visões
      React.createElement('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
        ['kanban', 'minhas'].map((v) =>
          React.createElement('button', { key: v, onClick: () => setVisao(v), style: { background: visao === v ? T.primary : T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 6, padding: '5px 8px', color: visao === v ? '#fff' : T.text, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 } },
            v === 'kanban' ? React.createElement(Kanban, { size: 12 }) : React.createElement(ListTodo, { size: 12 }),
            v === 'kanban' ? 'Kanban' : 'Minhas',
          ),
        ),
      ),
    ),
    // Content
    loading
      ? React.createElement('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted } }, 'Carregando...')
      : visao === 'minhas'
        ? React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
            !minhasTarefas.length ? React.createElement('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40 } }, 'Nenhuma tarefa atribuída a você') :
              minhasTarefas.map((t) => React.createElement('div', { key: t.id, style: { background: T.surface, borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${prioridadeCor(t.prioridade)}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } },
                React.createElement('div', { style: { fontWeight: 600, fontSize: 14, color: T.text } }, t.titulo),
                React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 4 } }, t.projeto_nome, ' · ', t.coluna_nome),
                t.prazo && React.createElement('div', { style: { fontSize: 11, color: prazoVencido(t.prazo) ? '#EF4444' : T.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 } },
                  React.createElement(Clock, { size: 11 }), new Date(t.prazo).toLocaleDateString('pt-BR')),
              )))
        : !projetoAtivo
        ? React.createElement('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: 14 } }, 'Selecione um projeto para visualizar o Kanban')
        : React.createElement('div', { style: { flex: 1, display: 'flex', overflowX: 'auto', padding: 16, gap: 12 } },
            kanban?.colunas?.map((col) => React.createElement('div', {
              key: col.id,
              onDragOver: (e) => handleDragOver(e, col.id),
              onDragLeave: () => setDragOverColuna(null),
              onDrop: (e) => handleDrop(e, col.id),
              style: {
                minWidth: 260, maxWidth: 300, background: dragOverColuna === col.id ? T.surfaceMuted : T.surface, borderRadius: 10,
                padding: 10, display: 'flex', flexDirection: 'column', gap: 8, border: dragOverColuna === col.id ? `2px dashed ${T.primary}` : `1px solid ${T.border}`,
              },
            },
              // Column header
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: `2px solid ${col.cor || T.primary}` } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  React.createElement('div', { style: { width: 10, height: 10, borderRadius: '50%', background: col.cor || T.primary } }),
                  React.createElement('span', { style: { fontWeight: 700, fontSize: 13, color: T.text } }, col.nome),
                  React.createElement('span', { style: { background: T.surfaceMuted, borderRadius: 8, padding: '0 6px', fontSize: 11, color: T.textMuted } }, col.tarefas?.length || 0),
                ),
              ),
              // Tarefas
              ...col.tarefas?.map((t) => React.createElement('div', {
                key: t.id, draggable: true, onDragStart: (e) => handleDragStart(e, t),
                style: {
                  background: '#fff', borderRadius: 8, padding: '8px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'grab',
                  borderLeft: `3px solid ${prioridadeCor(t.prioridade)}`,
                },
              },
                React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 } }, t.titulo),
                t.responsaveis && t.responsaveis.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 2, marginTop: 4 } },
                  ...t.responsaveis.slice(0, 3).map((r) =>
                    React.createElement('div', { key: r.id, style: { width: 22, height: 22, borderRadius: '50%', background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }, title: r.nome }, r.nome[0]?.toUpperCase()),
                  ),
                ),
                t.prazo && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: prazoVencido(t.prazo) ? '#EF4444' : T.textMuted, marginTop: 4 } },
                  React.createElement(Clock, { size: 10 }), new Date(t.prazo).toLocaleDateString('pt-BR')),
                t.checklist_concluido > 0 && React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 4 } }, `✓ ${t.checklist_concluido}/${t.total_checklist}`),
              ) || []),
              // Add task button
              React.createElement('button', {
                onClick: () => { setShowNovaTarefa(true); if (!projetoAtivo) return; },
                style: { background: 'none', border: `1px dashed ${T.border}`, borderRadius: 6, padding: '6px', cursor: 'pointer', color: T.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
              }, React.createElement(Plus, { size: 12 }), 'Tarefa'),
            )),
            // Add column
            React.createElement('button', {
              onClick: () => setShowNovaColuna(true),
              style: { minWidth: 180, height: 50, background: 'none', border: `2px dashed ${T.border}`, borderRadius: 10, cursor: 'pointer', color: T.textMuted, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10 },
            }, React.createElement(Plus, { size: 16 }), 'Nova Coluna'),
          ),

    // Modal: Nova Coluna
    showNovaColuna && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('form', { onSubmit: handleCriarColuna, style: { background: '#fff', borderRadius: 12, padding: 20, width: 320 } },
        React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16, color: T.text } }, 'Nova Coluna'),
        React.createElement('input', { name: 'nome', placeholder: 'Nome da coluna', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('input', { name: 'cor', type: 'color', defaultValue: '#6B7280', style: { width: '100%', height: 36, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8 } }),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { type: 'button', onClick: () => setShowNovaColuna(false), style: { padding: '6px 14px', background: T.surfaceMuted, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 } }, 'Cancelar'),
          React.createElement('button', { type: 'submit', style: { padding: '6px 14px', background: T.primary, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 } }, 'Criar'),
        ),
      ),
    ),
    // Modal: Nova Tarefa
    showNovaTarefa && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('form', { onSubmit: handleCriarTarefa, style: { background: '#fff', borderRadius: 12, padding: 20, width: 400 } },
        React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16, color: T.text } }, 'Nova Tarefa'),
        React.createElement('input', { name: 'titulo', placeholder: 'Título da tarefa', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('textarea', { name: 'descricao', placeholder: 'Descrição', rows: 2, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        kanban?.colunas && React.createElement('select', { name: 'coluna_id', style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } },
          ...kanban.colunas.map((c) => React.createElement('option', { key: c.id, value: c.id }, c.nome)),
        ),
        React.createElement('select', { name: 'prioridade', defaultValue: 'media', style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } },
          ...PRIORIDADES.map((p) => React.createElement('option', { key: p.valor, value: p.valor }, p.label)),
        ),
        React.createElement('input', { name: 'prazo', type: 'datetime-local', style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { type: 'button', onClick: () => setShowNovaTarefa(false), style: { padding: '6px 14px', background: T.surfaceMuted, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 } }, 'Cancelar'),
          React.createElement('button', { type: 'submit', style: { padding: '6px 14px', background: T.primary, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 } }, 'Criar'),
        ),
      ),
    ),
    // Modal: Novo Projeto
    showNovoProjeto && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('form', { onSubmit: handleCriarProjeto, style: { background: '#fff', borderRadius: 12, padding: 20, width: 360 } },
        React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16, color: T.text } }, 'Novo Projeto'),
        React.createElement('input', { name: 'nome', placeholder: 'Nome do projeto', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('textarea', { name: 'descricao', placeholder: 'Descrição', rows: 2, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('input', { name: 'cor', type: 'color', defaultValue: '#2563EB', style: { width: '100%', height: 36, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8 } }),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { type: 'button', onClick: () => setShowNovoProjeto(false), style: { padding: '6px 14px', background: T.surfaceMuted, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 } }, 'Cancelar'),
          React.createElement('button', { type: 'submit', style: { padding: '6px 14px', background: T.primary, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 } }, 'Criar'),
        ),
      ),
    ),
  );
}
