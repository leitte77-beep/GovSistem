import React, { useState, useEffect, useRef } from 'react';
import { CalendarPlus, Bell, X, Trash2, Link2 } from 'lucide-react';
import { T } from '../../theme';
import { criarItemAgenda, atualizarItemAgenda, excluirItemAgenda } from '../../api/agenda';
import { TIPOS, PRIORIDADES, OPCOES_LEMBRETE, montarISO, partesDoISO } from './util';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
};
const card = {
  background: T.surface, borderRadius: T.radiusLg, width: '100%', maxWidth: 520,
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: T.shadowLg,
};
const rotulo = { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block' };
const campo = {
  width: '100%', fontSize: 14, padding: '9px 11px', border: `1px solid ${T.border}`,
  borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
};

/**
 * Criação e edição de um item da agenda.
 *
 * `item` preenche o formulário para edição; `preenchimento` traz valores
 * iniciais de quem abriu o modal (ex.: o vínculo com a conversa aberta).
 */
export function ModalCompromisso({ item, preenchimento = {}, onClose, onSalvo, onExcluido }) {
  const editando = Boolean(item?.id);
  const partes = partesDoISO(item?.inicio || preenchimento.inicio);
  const partesFim = item?.fim ? partesDoISO(item.fim) : null;

  const [tipo, setTipo] = useState(item?.tipo || preenchimento.tipo || 'compromisso');
  const [titulo, setTitulo] = useState(item?.titulo || preenchimento.titulo || '');
  const [descricao, setDescricao] = useState(item?.descricao || '');
  const [data, setData] = useState(partes.data);
  const [hora, setHora] = useState(partes.hora);
  const [horaFim, setHoraFim] = useState(partesFim?.hora || '');
  const [diaTodo, setDiaTodo] = useState(Boolean(item?.dia_todo));
  const [prioridade, setPrioridade] = useState(item?.prioridade || 'normal');
  const [categoria, setCategoria] = useState(item?.categoria || '');
  const [lembretes, setLembretes] = useState(
    item?.lembretes?.length ? item.lembretes.map((l) => l.offset_min) : [30]
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const tituloRef = useRef(null);

  useEffect(() => { tituloRef.current?.focus(); }, []);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const vinculo = item?.conversa_id || preenchimento.conversa_id
    ? (item?.protocolo_numero || preenchimento.protocolo_numero || item?.contato_nome || preenchimento.contato_nome || 'Conversa em atendimento')
    : null;

  const alternarLembrete = (min) => {
    setLembretes((atuais) => (atuais.includes(min) ? atuais.filter((m) => m !== min) : [...atuais, min].sort((a, b) => a - b)));
  };

  const salvar = async () => {
    if (salvando) return;
    if (!titulo.trim()) { setErro('Informe um título.'); tituloRef.current?.focus(); return; }
    const inicio = montarISO(data, diaTodo ? '00:00' : hora);
    if (!inicio) { setErro('Informe uma data válida.'); return; }

    setSalvando(true);
    setErro('');
    const corpo = {
      tipo,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      inicio,
      // Hora final só existe em compromisso com hora — o backend descarta nos
      // demais casos, mas não faz sentido enviar.
      fim: tipo === 'compromisso' && !diaTodo && horaFim ? montarISO(data, horaFim) : null,
      dia_todo: diaTodo,
      prioridade,
      categoria: categoria.trim() || null,
      conversa_id: item?.conversa_id ?? preenchimento.conversa_id ?? null,
      contato_id: item?.contato_id ?? preenchimento.contato_id ?? null,
      protocolo_id: item?.protocolo_id ?? preenchimento.protocolo_id ?? null,
      lembretes: lembretes.map((min) => ({ offset_min: min })),
    };

    try {
      const salvo = editando
        ? await atualizarItemAgenda(item.id, corpo)
        : await criarItemAgenda(corpo);
      onSalvo?.(salvo);
      onClose?.();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      await excluirItemAgenda(item.id);
      onExcluido?.(item.id);
      onClose?.();
    } catch (e) {
      setErro(e.message || 'Não foi possível excluir.');
      setSalvando(false);
    }
  };

  return React.createElement('div', {
    style: overlay,
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose?.(); },
  },
    React.createElement('div', { style: card, role: 'dialog', 'aria-modal': 'true', 'aria-label': editando ? 'Editar compromisso' : 'Novo compromisso' },

      /* ── cabeçalho ── */
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px 14px', borderBottom: `1px solid ${T.border}` } },
        React.createElement('div', { style: { width: 36, height: 36, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
          React.createElement(CalendarPlus, { size: 19, color: T.primary })),
        React.createElement('h3', { style: { fontSize: 17, fontWeight: 700, color: T.text, flex: 1 } },
          editando ? 'Editar compromisso' : 'Novo compromisso'),
        React.createElement('button', {
          onClick: onClose, 'aria-label': 'Fechar',
          style: { width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, React.createElement(X, { size: 18, color: T.textMuted })),
      ),

      /* ── corpo ── */
      React.createElement('div', { style: { padding: '16px 22px', overflowY: 'auto', flex: 1 } },

        /* tipo */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('span', { style: rotulo }, 'Tipo'),
          React.createElement('div', { style: { display: 'flex', gap: 6 } },
            ...Object.entries(TIPOS).map(([chave, cfg]) =>
              React.createElement('button', {
                key: chave,
                onClick: () => setTipo(chave),
                title: cfg.ajuda,
                style: {
                  flex: 1, padding: '8px 6px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  borderRadius: T.radiusSm,
                  border: `1px solid ${tipo === chave ? T.primary : T.border}`,
                  background: tipo === chave ? T.primarySoft : T.surface,
                  color: tipo === chave ? T.primary : T.textSecondary,
                },
              }, cfg.label)),
          ),
          React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 5 } }, TIPOS[tipo].ajuda),
        ),

        /* título */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('label', { style: rotulo, htmlFor: 'ag-titulo' }, 'Título'),
          React.createElement('input', {
            id: 'ag-titulo', ref: tituloRef, value: titulo, maxLength: 200,
            onChange: (e) => setTitulo(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') salvar(); },
            placeholder: 'Ex.: Retornar contato para João',
            style: campo,
          }),
        ),

        /* data / horários */
        React.createElement('div', { style: { display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' } },
          React.createElement('div', { style: { flex: '1 1 150px', minWidth: 140 } },
            React.createElement('label', { style: rotulo, htmlFor: 'ag-data' },
              tipo === 'compromisso' ? 'Data' : 'Prazo'),
            React.createElement('input', {
              id: 'ag-data', type: 'date', value: data,
              onChange: (e) => setData(e.target.value), style: campo,
            }),
          ),
          !diaTodo && React.createElement('div', { style: { flex: '0 1 110px' } },
            React.createElement('label', { style: rotulo, htmlFor: 'ag-hora' }, 'Hora'),
            React.createElement('input', {
              id: 'ag-hora', type: 'time', value: hora,
              onChange: (e) => setHora(e.target.value), style: campo,
            }),
          ),
          !diaTodo && tipo === 'compromisso' && React.createElement('div', { style: { flex: '0 1 110px' } },
            React.createElement('label', { style: rotulo, htmlFor: 'ag-hora-fim' }, 'Até'),
            React.createElement('input', {
              id: 'ag-hora-fim', type: 'time', value: horaFim,
              onChange: (e) => setHoraFim(e.target.value), style: campo,
            }),
          ),
        ),

        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.textSecondary, marginBottom: 14, cursor: 'pointer' } },
          React.createElement('input', {
            type: 'checkbox', checked: diaTodo,
            onChange: (e) => setDiaTodo(e.target.checked),
          }),
          'Dia inteiro',
        ),

        /* prioridade */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('span', { style: rotulo }, 'Prioridade'),
          React.createElement('div', { style: { display: 'flex', gap: 6 } },
            ...Object.entries(PRIORIDADES).map(([chave, cfg]) =>
              React.createElement('button', {
                key: chave,
                onClick: () => setPrioridade(chave),
                style: {
                  flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  borderRadius: T.radiusSm,
                  border: `1px solid ${prioridade === chave ? cfg.cor : T.border}`,
                  background: prioridade === chave ? cfg.fundo : T.surface,
                  color: prioridade === chave ? cfg.cor : T.textMuted,
                },
              }, cfg.label)),
          ),
        ),

        /* lembretes */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('span', { style: { ...rotulo, display: 'flex', alignItems: 'center', gap: 5 } },
            React.createElement(Bell, { size: 13 }), 'Lembretes'),
          React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            ...OPCOES_LEMBRETE.map((opt) => {
              const ativo = lembretes.includes(opt.min);
              return React.createElement('button', {
                key: opt.min,
                onClick: () => alternarLembrete(opt.min),
                style: {
                  padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  borderRadius: 9999,
                  border: `1px solid ${ativo ? T.primary : T.border}`,
                  background: ativo ? T.primarySoft : T.surface,
                  color: ativo ? T.primary : T.textMuted,
                },
              }, opt.label);
            }),
          ),
          React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 5 } },
            lembretes.length === 0 ? 'Sem aviso — o item só aparece na agenda.' : 'Pode marcar mais de um.'),
        ),

        /* categoria */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('label', { style: rotulo, htmlFor: 'ag-categoria' }, 'Categoria (opcional)'),
          React.createElement('input', {
            id: 'ag-categoria', value: categoria, maxLength: 60,
            onChange: (e) => setCategoria(e.target.value),
            placeholder: 'Ex.: Licitação, Protocolo, Reunião',
            style: campo,
          }),
        ),

        /* descrição */
        React.createElement('div', { style: { marginBottom: vinculo ? 14 : 0 } },
          React.createElement('label', { style: rotulo, htmlFor: 'ag-descricao' }, 'Descrição (opcional)'),
          React.createElement('textarea', {
            id: 'ag-descricao', value: descricao, rows: 2,
            onChange: (e) => setDescricao(e.target.value),
            style: { ...campo, resize: 'vertical' },
          }),
        ),

        /* vínculo com o atendimento */
        vinculo && React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: T.surfaceAlt, borderRadius: T.radiusSm, fontSize: 12, color: T.textSecondary },
        },
          React.createElement(Link2, { size: 14, color: T.primary }),
          React.createElement('span', null, 'Vinculado a ', React.createElement('strong', null, vinculo)),
        ),

        erro && React.createElement('div', {
          role: 'alert',
          style: { marginTop: 12, padding: '9px 11px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600 },
        }, erro),
      ),

      /* ── rodapé ── */
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '14px 22px', borderTop: `1px solid ${T.border}` } },
        editando && (confirmandoExclusao
          ? React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginRight: 'auto' } },
              React.createElement('span', { style: { fontSize: 12, color: T.textSecondary } }, 'Excluir?'),
              React.createElement('button', {
                onClick: excluir, disabled: salvando,
                style: { border: 'none', background: T.danger, color: '#fff', padding: '7px 12px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 700 },
              }, 'Sim'),
              React.createElement('button', {
                onClick: () => setConfirmandoExclusao(false),
                style: { border: `1px solid ${T.borderStrong}`, background: 'transparent', color: T.textSecondary, padding: '7px 12px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12 },
              }, 'Não'),
            )
          : React.createElement('button', {
              onClick: () => setConfirmandoExclusao(true),
              title: 'Excluir compromisso',
              style: { marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: T.danger, padding: '8px 10px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
            }, React.createElement(Trash2, { size: 15 }), 'Excluir')
        ),
        React.createElement('button', {
          onClick: onClose,
          style: { marginLeft: editando ? 0 : 'auto', background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
        }, 'Cancelar'),
        React.createElement('button', {
          onClick: salvar, disabled: salvando,
          style: { border: 'none', background: T.primary, color: '#fff', padding: '9px 20px', borderRadius: T.radiusSm, cursor: salvando ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, opacity: salvando ? 0.6 : 1 },
        }, salvando ? 'Salvando...' : 'Salvar'),
      ),
    ),
  );
}
