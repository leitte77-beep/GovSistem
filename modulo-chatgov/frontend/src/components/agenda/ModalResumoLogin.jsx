import React, { useState, useEffect } from 'react';
import { CalendarDays, X, AlertTriangle } from 'lucide-react';
import { T } from '../../theme';
import { fetchResumoAgenda } from '../../api/agenda';
import { ItemAgenda } from './ItemAgenda';
import { AgendaCompleta } from './AgendaCompleta';
import { saudacao, primeiroNome, estaAtrasado } from './util';
import { notificarAgendaAtualizada } from './eventos';

// Duas chaves, duas regras diferentes:
// - sessão: já mostrei nesta aba, não repito a cada F5;
// - dia: o usuário pediu para não ver de novo hoje.
const CHAVE_SESSAO = 'chatgov_agenda_modal_sessao';
const CHAVE_DIA = 'chatgov_agenda_modal_oculto_em';

const hojeStr = () => new Date().toISOString().slice(0, 10);

function jaMostrado() {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO) === hojeStr()
      || localStorage.getItem(CHAVE_DIA) === hojeStr();
  } catch {
    return false;
  }
}

/**
 * Resumo mostrado uma vez por sessão, logo depois do login.
 *
 * Só abre quando existe algo que mereça interromper: compromisso de hoje,
 * pendência atrasada ou item urgente. Modal vazio ensina o usuário a fechar
 * sem ler — e aí o dia em que houver algo importante ele também vai fechar.
 */
export function ModalResumoLogin({ operadorNome, onAbrirConversa, breakpoint }) {
  const [resumo, setResumo] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [naoMostrarHoje, setNaoMostrarHoje] = useState(false);
  const [verAgenda, setVerAgenda] = useState(false);
  const ehMobile = breakpoint === 'mobile';

  useEffect(() => {
    if (jaMostrado()) return;
    let cancelado = false;
    fetchResumoAgenda({ dias: 7 })
      .then((dados) => {
        if (cancelado) return;
        const relevante = dados.hoje.length > 0
          || dados.pendencias.length > 0
          || dados.contadores.urgentes > 0;
        if (!relevante) return;
        setResumo(dados);
        setAberto(true);
        try { sessionStorage.setItem(CHAVE_SESSAO, hojeStr()); } catch {}
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const fechar = () => {
    if (naoMostrarHoje) {
      try { localStorage.setItem(CHAVE_DIA, hojeStr()); } catch {}
    }
    setAberto(false);
  };

  useEffect(() => {
    if (!aberto) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape' && !verAgenda) fechar(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  });

  if (verAgenda) {
    return React.createElement(AgendaCompleta, {
      onClose: () => { setVerAgenda(false); setAberto(false); },
      onAbrirConversa,
      breakpoint,
    });
  }

  if (!aberto || !resumo) return null;

  const { hoje, pendencias, contadores } = resumo;
  const atrasadosDeHoje = hoje.filter((i) => estaAtrasado(i));
  const linhasContagem = [
    hoje.length && `${hoje.length} ${hoje.length === 1 ? 'compromisso hoje' : 'compromissos hoje'}`,
    contadores.atrasados && `${contadores.atrasados} ${contadores.atrasados === 1 ? 'item atrasado' : 'itens atrasados'}`,
    contadores.urgentes && `${contadores.urgentes} ${contadores.urgentes === 1 ? 'item urgente' : 'itens urgentes'}`,
  ].filter(Boolean);

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: 16,
    },
    onMouseDown: (e) => { if (e.target === e.currentTarget) fechar(); },
  },
    React.createElement('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Resumo da agenda',
      style: {
        background: T.surface, borderRadius: T.radiusLg, width: '100%', maxWidth: 460,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: T.shadowLg, overflow: 'hidden',
      },
    },
      /* cabeçalho */
      React.createElement('div', { style: { padding: '20px 22px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 } },
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('h2', { style: { fontSize: 18, fontWeight: 700, color: T.text } },
            `${saudacao()}${operadorNome ? `, ${primeiroNome(operadorNome)}` : ''}`),
          linhasContagem.length > 0 && React.createElement('div', {
            style: { fontSize: 13, color: T.textSecondary, marginTop: 4 },
          }, 'Você tem ', linhasContagem.join(', '), '.'),
        ),
        React.createElement('button', {
          onClick: fechar, 'aria-label': 'Fechar',
          style: { width: 30, height: 30, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, React.createElement(X, { size: 17, color: T.textMuted })),
      ),

      /* corpo: só o que é de hoje ou está atrasado */
      React.createElement('div', { style: { padding: '14px 22px', overflowY: 'auto', flex: 1 } },
        pendencias.length > 0 && React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: T.danger, marginBottom: 6 } },
            React.createElement(AlertTriangle, { size: 12 }), 'Atrasado'),
          ...pendencias.slice(0, 4).map((item) => React.createElement(ItemAgenda, {
            key: item.id, item, mostrarDia: true, compacto: true, onAbrirConversa,
          })),
          pendencias.length > 4 && React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginLeft: 13, marginTop: 2 } },
            `+${pendencias.length - 4} na agenda completa`),
        ),

        hoje.length > 0 && React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: T.textMuted, marginBottom: 6 } }, 'Hoje'),
          ...hoje.slice(0, 5).map((item) => React.createElement(ItemAgenda, {
            key: item.id, item, compacto: true, onAbrirConversa,
          })),
          hoje.length > 5 && React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginLeft: 13, marginTop: 2 } },
            `+${hoje.length - 5} na agenda completa`),
        ),

        atrasadosDeHoje.length > 0 && React.createElement('div', {
          style: { marginTop: 12, fontSize: 11.5, color: T.textMuted },
        }, `${atrasadosDeHoje.length} ${atrasadosDeHoje.length === 1 ? 'item de hoje já passou do horário' : 'itens de hoje já passaram do horário'}.`),
      ),

      /* rodapé */
      React.createElement('div', { style: { padding: '12px 22px 16px', borderTop: `1px solid ${T.border}` } },
        React.createElement('label', {
          style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMuted, cursor: 'pointer', marginBottom: 12 },
        },
          React.createElement('input', {
            type: 'checkbox', checked: naoMostrarHoje,
            onChange: (e) => setNaoMostrarHoje(e.target.checked),
          }),
          'Não mostrar novamente hoje',
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexDirection: ehMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end' } },
          React.createElement('button', {
            onClick: () => { notificarAgendaAtualizada(); setVerAgenda(true); },
            style: { border: `1px solid ${T.borderStrong}`, background: 'transparent', color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
          }, React.createElement(CalendarDays, { size: 15 }), 'Ver agenda'),
          React.createElement('button', {
            onClick: fechar,
            style: { border: 'none', background: T.primary, color: '#fff', padding: '9px 20px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 700 },
          }, 'Começar atendimento'),
        ),
      ),
    ),
  );
}
