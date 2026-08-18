import React, { useState, useEffect, useRef } from 'react';
import { CalendarPlus, Bell, X, Trash2, Link2, CheckCircle2, Clock, ChevronDown } from 'lucide-react';
import { T } from '../../theme';
import { criarItemAgenda, atualizarItemAgenda, excluirItemAgenda } from '../../api/agenda';
import { TIPOS, PRIORIDADES, OPCOES_LEMBRETE, montarISO, partesDoISO } from './util';
import { useModalFocus } from '../../hooks/useModalFocus';

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

const CONFIG_TIPO = {
  compromisso: {
    tituloNovo: 'Novo compromisso', tituloEditar: 'Editar compromisso',
    subtitulo: 'Agende um horário e defina os detalhes.',
    icone: CalendarPlus,
    labelData: 'Data', labelHora: 'Início', labelHoraFim: 'Término',
    mostraHoraFim: true, mostraDiaTodo: true, labelDiaTodo: 'Dia inteiro',
    botaoSalvar: 'Salvar compromisso', botaoCriar: 'Criar compromisso',
    placeholder: 'Ex.: Retornar contato para João',
  },
  tarefa: {
    tituloNovo: 'Nova tarefa', tituloEditar: 'Editar tarefa',
    subtitulo: 'Defina um prazo e acompanhe a conclusão.',
    icone: CheckCircle2,
    labelData: 'Prazo', labelHora: 'Horário', labelHoraFim: null,
    mostraHoraFim: false, mostraDiaTodo: true, labelDiaTodo: 'Sem horário definido',
    botaoSalvar: 'Salvar tarefa', botaoCriar: 'Criar tarefa',
    placeholder: 'Ex.: Conferir empenhos do mês',
  },
  lembrete: {
    tituloNovo: 'Novo lembrete', tituloEditar: 'Editar lembrete',
    subtitulo: 'Receba um aviso na data e hora escolhidas.',
    icone: Bell,
    labelData: 'Data', labelHora: 'Hora do aviso', labelHoraFim: null,
    mostraHoraFim: false, mostraDiaTodo: false, labelDiaTodo: null,
    botaoSalvar: 'Salvar lembrete', botaoCriar: 'Criar lembrete',
    placeholder: 'Ex.: Enviar mensagem para o fornecedor',
  },
};

function labelLembrete(min) {
  const opt = OPCOES_LEMBRETE.find((o) => o.min === min);
  if (opt) return opt.label;
  if (min < 60) return `${min} minutos antes`;
  if (min < 1440) return `${Math.round(min / 60)} hora(s) antes`;
  return `${Math.round(min / 1440)} dia(s) antes`;
}

export function ModalCompromisso({ item, preenchimento = {}, onClose, onSalvo, onExcluido }) {
  const editando = Boolean(item?.id);
  const partes = partesDoISO(item?.inicio || preenchimento.inicio);
  const partesFim = item?.fim ? partesDoISO(item.fim) : null;

  const [tipo, setTipo] = useState(item?.tipo || preenchimento.tipo || 'compromisso');
  const cfg = CONFIG_TIPO[tipo];
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
  const [lembreteAberto, setLembreteAberto] = useState(false);
  const [lembreteCustom, setLembreteCustom] = useState(false);
  const [customQtd, setCustomQtd] = useState(30);
  const [customUnidade, setCustomUnidade] = useState('minutos');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const tituloRef = useRef(null);
  const lembreteRef = useRef(null);
  const dialogRef = useRef(null);
  useModalFocus(dialogRef, onClose, tituloRef);

  useEffect(() => {
    if (!lembreteAberto) return;
    const onClick = (e) => {
      if (lembreteRef.current && !lembreteRef.current.contains(e.target)) {
        setLembreteAberto(false);
        setLembreteCustom(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [lembreteAberto]);

  // Reseta diaTodo e ajusta campos ao trocar de tipo
  useEffect(() => {
    if (tipo === 'lembrete' && diaTodo) setDiaTodo(false);
    setErro('');
    setAviso('');
  }, [tipo]);

  const vinculo = item?.conversa_id || preenchimento.conversa_id
    ? (item?.protocolo_numero || preenchimento.protocolo_numero || item?.contato_nome || preenchimento.contato_nome || 'Conversa em atendimento')
    : null;

  const removerLembrete = (min) => {
    setLembretes((l) => l.filter((m) => m !== min));
  };

  const adicionarLembrete = (min) => {
    if (lembretes.includes(min)) {
      removerLembrete(min);
    } else {
      setLembretes((l) => [...l, min].sort((a, b) => a - b));
    }
    setLembreteAberto(false);
    setLembreteCustom(false);
  };

  const adicionarCustom = () => {
    const multiplicador = customUnidade === 'horas' ? 60 : customUnidade === 'dias' ? 1440 : 1;
    const min = Math.max(1, Number(customQtd) || 30) * multiplicador;
    adicionarLembrete(min);
  };

  const validar = () => {
    setErro('');
    setAviso('');
    if (!titulo.trim()) { setErro('Informe um título.'); tituloRef.current?.focus(); return false; }

    if (tipo === 'lembrete' && !hora) { setErro('Informe a hora do aviso.'); return false; }

    if (!diaTodo && cfg.mostraHoraFim && horaFim && hora >= horaFim) {
      setErro('O horário de término deve ser posterior ao início.');
      return false;
    }

    const inicioDate = montarISO(data, diaTodo ? '00:00' : hora);
    if (!inicioDate) { setErro('Informe uma data válida.'); return false; }

    if (!editando && new Date(inicioDate).getTime() < Date.now() - 60000) {
      setAviso('A data informada está no passado.');
    }

    if (!diaTodo && cfg.mostraHoraFim && horaFim) {
      const fimDate = montarISO(data, horaFim);
      if (fimDate && fimDate <= inicioDate) {
        setErro('O horário de término deve ser posterior ao início.');
        return false;
      }
    }

    return true;
  };

  const salvar = async () => {
    if (salvando) return;
    if (!validar()) return;

    setSalvando(true);
    setErro('');
    setAviso('');

    const inicio = montarISO(data, diaTodo ? '00:00' : hora);
    const corpo = {
      tipo,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      inicio,
      fim: tipo === 'compromisso' && !diaTodo && horaFim ? montarISO(data, horaFim) : null,
      dia_todo: diaTodo && tipo !== 'lembrete',
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

  const tituloForm = editando ? cfg.tituloEditar : cfg.tituloNovo;
  const textoSalvar = editando ? cfg.botaoSalvar : cfg.botaoCriar;
  const podeSalvar = titulo.trim().length > 0 && !salvando;
  const IconeCabecalho = cfg.icone;

  return React.createElement('div', {
    style: overlay,
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose?.(); },
  },
    React.createElement('div', { ref: dialogRef, style: card, role: 'dialog', 'aria-modal': true, 'aria-label': tituloForm, tabIndex: -1 },

      /* ── cabeçalho ── */
      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '18px 22px 14px', borderBottom: `1px solid ${T.border}` } },
        React.createElement('div', { style: { width: 36, height: 36, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
          React.createElement(IconeCabecalho, { size: 19, color: T.primary })),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('h3', { style: { fontSize: 17, fontWeight: 700, color: T.text, margin: 0 } }, tituloForm),
          React.createElement('p', { style: { fontSize: 12, color: T.textMuted, margin: '2px 0 0', lineHeight: '17px' } }, cfg.subtitulo),
        ),
        React.createElement('button', {
          onClick: onClose, 'aria-label': 'Fechar',
          style: { width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, React.createElement(X, { size: 18, color: T.textMuted })),
      ),

      /* ── corpo ── */
      React.createElement('div', { style: { padding: '16px 22px', overflowY: 'auto', flex: 1 } },

        /* seletor de tipo com ícones */
        React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('span', { style: rotulo }, 'Tipo'),
          React.createElement('div', { style: { display: 'flex', gap: 6 } },
            ...Object.entries(TIPOS).map(([chave, cfgTipo]) => {
              const ativo = tipo === chave;
              const Icone = CONFIG_TIPO[chave].icone;
              return React.createElement('button', {
                key: chave,
                onClick: () => setTipo(chave),
                title: cfgTipo.ajuda,
                style: {
                  flex: 1, padding: '9px 6px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  border: `1px solid ${ativo ? T.primary : T.border}`,
                  background: ativo ? T.primarySoft : T.surface,
                  color: ativo ? T.primary : T.textSecondary,
                },
              }, React.createElement(Icone, { size: 14 }), cfgTipo.label);
            }),
          ),
        ),

        /* título */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('label', { style: rotulo, htmlFor: 'ag-titulo' }, 'Título'),
          React.createElement('input', {
            id: 'ag-titulo', ref: tituloRef, value: titulo, maxLength: 200,
            onChange: (e) => { setTitulo(e.target.value); setErro(''); },
            onKeyDown: (e) => { if (e.key === 'Enter') salvar(); },
            placeholder: cfg.placeholder,
            style: campo,
          }),
        ),

        /* data / horários */
        React.createElement('div', { style: { display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
          React.createElement('div', { style: { flex: '1 1 150px', minWidth: 140 } },
            React.createElement('label', { style: rotulo, htmlFor: 'ag-data' }, cfg.labelData),
            React.createElement('input', {
              id: 'ag-data', type: 'date', value: data,
              onChange: (e) => setData(e.target.value), style: campo,
            }),
          ),
          !diaTodo && React.createElement('div', { style: { flex: '0 1 110px' } },
            React.createElement('label', { style: rotulo, htmlFor: 'ag-hora' }, cfg.labelHora),
            React.createElement('input', {
              id: 'ag-hora', type: 'time', value: hora,
              onChange: (e) => setHora(e.target.value), style: campo,
            }),
          ),
          !diaTodo && cfg.mostraHoraFim && React.createElement('div', { style: { flex: '0 1 110px' } },
            React.createElement('label', { style: rotulo, htmlFor: 'ag-hora-fim' }, cfg.labelHoraFim),
            React.createElement('input', {
              id: 'ag-hora-fim', type: 'time', value: horaFim,
              onChange: (e) => setHoraFim(e.target.value),
              style: { ...campo, borderColor: horaFim && hora >= horaFim ? T.danger : T.border },
            }),
          ),
        ),

        cfg.mostraDiaTodo && React.createElement('label', {
          style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.textSecondary, marginBottom: 14, cursor: 'pointer' },
        },
          React.createElement('input', {
            type: 'checkbox', checked: diaTodo,
            onChange: (e) => setDiaTodo(e.target.checked),
          }),
          cfg.labelDiaTodo,
        ),

        /* prioridade */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('span', { style: rotulo }, 'Prioridade'),
          React.createElement('div', { style: { display: 'flex', gap: 6 } },
            ...Object.entries(PRIORIDADES).map(([chave, cfgPrio]) =>
              React.createElement('button', {
                key: chave,
                onClick: () => setPrioridade(chave),
                style: {
                  flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  borderRadius: T.radiusSm,
                  border: `1px solid ${prioridade === chave ? cfgPrio.cor : T.border}`,
                  background: prioridade === chave ? cfgPrio.fundo : T.surface,
                  color: prioridade === chave ? cfgPrio.cor : T.textMuted,
                },
              }, cfgPrio.label)),
          ),
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

        /* lembretes — dropdown seletor */
        React.createElement('div', { style: { marginBottom: 14 } },
          React.createElement('span', { style: { ...rotulo, display: 'flex', alignItems: 'center', gap: 5 } },
            React.createElement(Bell, { size: 13 }), 'Lembretes'),

          lembretes.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 } },
            ...lembretes.map((min) =>
              React.createElement('span', {
                key: min,
                style: {
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 9px', fontSize: 12, fontWeight: 600,
                  borderRadius: 9999, background: T.primarySoft, color: T.primaryOnSoft,
                  border: `1px solid ${T.primary}20`,
                },
              },
                labelLembrete(min),
                React.createElement('button', {
                  onClick: () => removerLembrete(min),
                  'aria-label': `Remover lembrete ${labelLembrete(min)}`,
                  style: { border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: T.primary, opacity: 0.7 },
                }, React.createElement(X, { size: 12 })),
              )),
          ),

          React.createElement('div', { ref: lembreteRef, style: { position: 'relative' } },
            React.createElement('button', {
              onClick: () => { setLembreteAberto(!lembreteAberto); setLembreteCustom(false); },
              style: {
                display: 'flex', alignItems: 'center', gap: 4,
                width: '100%', padding: '8px 11px', fontSize: 13, fontWeight: 500,
                border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                background: T.surface, color: T.textSecondary, cursor: 'pointer',
                textAlign: 'left',
              },
            },
              lembretes.length === 0 ? 'Sem lembrete' : '+ Adicionar lembrete',
              React.createElement(ChevronDown, { size: 14, style: { marginLeft: 'auto' } }),
            ),

            lembreteAberto && React.createElement('div', {
              style: {
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                boxShadow: T.shadowMd, zIndex: 10, marginTop: 4, maxHeight: 260, overflowY: 'auto',
              },
            },
              ...OPCOES_LEMBRETE.map((opt) => {
                const ativo = lembretes.includes(opt.min);
                return React.createElement('button', {
                  key: opt.min,
                  onClick: () => adicionarLembrete(opt.min),
                  style: {
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    border: 'none', background: ativo ? T.primarySoft : 'transparent',
                    color: ativo ? T.primary : T.text, textAlign: 'left',
                  },
                },
                  opt.label,
                  ativo && React.createElement('span', { style: { fontSize: 11, color: T.primary } }, '✓'),
                );
              }),

              !lembreteCustom && React.createElement('button', {
                onClick: () => setLembreteCustom(true),
                style: {
                  display: 'flex', alignItems: 'center', gap: 5,
                  width: '100%', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  border: 'none', borderTop: `1px solid ${T.border}`, background: 'transparent',
                  color: T.primary, fontWeight: 600, textAlign: 'left',
                },
              }, '+ Personalizado'),

              lembreteCustom && React.createElement('div', {
                style: { padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 6, alignItems: 'center' },
              },
                React.createElement('input', {
                  type: 'number', min: 1, value: customQtd,
                  onChange: (e) => setCustomQtd(Number(e.target.value) || 30),
                  style: { width: 60, padding: '6px 8px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, textAlign: 'center' },
                }),
                React.createElement('select', {
                  value: customUnidade,
                  onChange: (e) => setCustomUnidade(e.target.value),
                  style: { flex: 1, padding: '6px 8px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, background: T.surface, color: T.text },
                },
                  React.createElement('option', { value: 'minutos' }, 'minutos'),
                  React.createElement('option', { value: 'horas' }, 'horas'),
                  React.createElement('option', { value: 'dias' }, 'dias'),
                ),
                React.createElement('button', {
                  onClick: adicionarCustom,
                  style: { padding: '6px 10px', border: 'none', background: T.primary, color: '#fff', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
                }, 'Ok'),
              ),
            ),
          ),

          React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 5 } },
            lembretes.length === 0 ? 'Sem aviso — o item só aparece na agenda.' : 'O lembrete será exibido na hora programada.'),
        ),

        /* vínculo com a conversa */
        vinculo && React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: T.primarySoft, borderRadius: T.radiusSm, fontSize: 12, color: T.textSecondary, marginBottom: 14 },
        },
          React.createElement(Link2, { size: 14, color: T.primary }),
          React.createElement('span', null, 'Vinculado a ', React.createElement('strong', null, vinculo)),
        ),

        /* descrição */
        React.createElement('div', { style: { marginBottom: 0 } },
          React.createElement('label', { style: rotulo, htmlFor: 'ag-descricao' }, 'Descrição (opcional)'),
          React.createElement('textarea', {
            id: 'ag-descricao', value: descricao, rows: 2,
            onChange: (e) => setDescricao(e.target.value),
            style: { ...campo, resize: 'vertical' },
          }),
        ),

        aviso && React.createElement('div', {
          role: 'status',
          style: { marginTop: 12, padding: '9px 11px', background: T.warningSoft, color: T.warning, borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600 },
        }, aviso),

        erro && React.createElement('div', {
          role: 'alert',
          style: { marginTop: 12, padding: '9px 11px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600 },
        }, erro),
      ),

      /* ── rodapé ── */
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '14px 22px', borderTop: `1px solid ${T.border}` } },
        editando && (confirmandoExclusao
          ? React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginRight: 'auto' } },
              React.createElement('span', { style: { fontSize: 12, color: T.textSecondary } }, 'Excluir este item?'),
              React.createElement('button', {
                onClick: excluir, disabled: salvando,
                style: { border: 'none', background: T.danger, color: '#fff', padding: '7px 12px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12, fontWeight: 700 },
              }, 'Sim, excluir'),
              React.createElement('button', {
                onClick: () => setConfirmandoExclusao(false),
                style: { border: `1px solid ${T.borderStrong}`, background: 'transparent', color: T.textSecondary, padding: '7px 12px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12 },
              }, 'Não'),
            )
          : React.createElement('button', {
              onClick: () => setConfirmandoExclusao(true),
              title: 'Excluir',
              style: { marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: T.danger, padding: '8px 10px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
            }, React.createElement(Trash2, { size: 15 }), 'Excluir')
        ),
        React.createElement('button', {
          onClick: onClose,
          style: { marginLeft: editando ? 0 : 'auto', background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
        }, 'Cancelar'),
        React.createElement('button', {
          onClick: salvar, disabled: !podeSalvar,
          style: { border: 'none', background: T.primary, color: '#fff', padding: '9px 20px', borderRadius: T.radiusSm, cursor: podeSalvar ? 'pointer' : 'default', fontSize: 13, fontWeight: 700, opacity: podeSalvar ? 1 : 0.5 },
        }, salvando ? 'Salvando...' : textoSalvar),
      ),
    ),
  );
}
