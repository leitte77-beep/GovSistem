import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Bold, Italic, Strikethrough, Code, Minimize2, Loader2, Eye, PenLine } from 'lucide-react';
import { formatarWhatsapp } from '../utils/formatoWhatsapp';
import { T } from '../theme';

// Editor em tela cheia (sobre o painel da conversa) para mensagens longas:
// o campo do rodapé mostra só algumas linhas, e revisar um orçamento de 900
// caracteres ali é rolar às cegas. Aqui o texto é o mesmo estado do composer
// (fechar não perde nada) e a prévia mostra a formatação como chega no WhatsApp.
//
// Teclas: Enter quebra linha (em texto longo, enviar por engano é o pior erro),
// Ctrl/⌘+Enter envia, Esc volta ao campo normal, Ctrl+B/I aplicam negrito/itálico.

const MARCADORES = [
  { id: 'negrito', icone: Bold, marca: '*', titulo: 'Negrito (Ctrl+B)' },
  { id: 'italico', icone: Italic, marca: '_', titulo: 'Itálico (Ctrl+I)' },
  { id: 'riscado', icone: Strikethrough, marca: '~', titulo: 'Riscado' },
  { id: 'mono', icone: Code, marca: '```', titulo: 'Monoespaçado' },
];

export function EditorMensagemAmpliado({ texto, setTexto, maxLength, onEnviar, onFechar, nomeContato, respondendoA, podeEnviar, enviando, compacto }) {
  const areaRef = useRef(null);
  const [aba, setAba] = useState('escrever'); // só usada no layout compacto

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    const fim = el.value.length;
    el.setSelectionRange(fim, fim);
  }, []);

  const aplicarMarca = (marca) => {
    const el = areaRef.current;
    if (!el) return;
    const ini = el.selectionStart;
    const fim = el.selectionEnd;
    const selecionado = texto.slice(ini, fim);
    // Espaços nas pontas ficam fora do marcador: "*texto *" não formata no WhatsApp.
    const lead = selecionado.match(/^\s*/)[0];
    const trail = selecionado.slice(lead.length).match(/\s*$/)[0];
    const miolo = selecionado.slice(lead.length, selecionado.length - trail.length);
    const novo = texto.slice(0, ini) + lead + marca + miolo + marca + trail + texto.slice(fim);
    if (maxLength && novo.length > maxLength) return;
    setTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      const a = ini + lead.length + marca.length;
      el.setSelectionRange(a, a + miolo.length);
    });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFechar(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (podeEnviar) onEnviar(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); aplicarMarca('*'); }
      else if (k === 'i') { e.preventDefault(); aplicarMarca('_'); }
    }
  };

  const linhas = texto ? texto.split('\n').length : 0;
  const palavras = texto.trim() ? texto.trim().split(/\s+/).length : 0;
  const perto = maxLength && texto.length > maxLength * 0.95;

  const btnIcone = {
    width: 32, height: 32, display: 'grid', placeItems: 'center', border: 'none', borderRadius: T.radiusSm,
    background: 'transparent', color: T.textSecondary, cursor: 'pointer',
  };

  const editor = React.createElement('textarea', {
    ref: areaRef, value: texto, maxLength,
    onChange: (e) => setTexto(e.target.value),
    onKeyDown,
    'aria-label': 'Mensagem (editor ampliado)',
    placeholder: 'Escreva ou cole aqui a sua mensagem…',
    spellCheck: true,
    style: {
      flex: 1, minHeight: 0, width: '100%', boxSizing: 'border-box', resize: 'none',
      padding: '16px 18px', border: 'none', outline: 'none', background: 'transparent',
      color: T.text, fontFamily: 'inherit', fontSize: 15, lineHeight: '24px',
    },
  });

  const previa = React.createElement('div', {
    style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', background: T.bg },
  },
    texto.trim()
      ? React.createElement('div', {
        style: {
          marginLeft: 'auto', maxWidth: 560, background: T.bubbleOut, color: T.text, borderRadius: 10,
          borderTopRightRadius: 2, padding: '8px 10px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
          fontSize: 14.2, lineHeight: '19px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        },
      }, formatarWhatsapp(texto))
      : React.createElement('div', { style: { color: T.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 } },
        'A prévia aparece aqui enquanto você escreve.'),
  );

  const tituloColuna = (icone, rotulo) => React.createElement('div', {
    style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.textMuted, borderBottom: `1px solid ${T.border}`, flexShrink: 0 },
  }, React.createElement(icone, { size: 13 }), rotulo);

  const abaBtn = (id, icone, rotulo) => React.createElement('button', {
    type: 'button', onClick: () => setAba(id), 'aria-pressed': aba === id,
    style: {
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0',
      border: 'none', borderBottom: `2px solid ${aba === id ? T.primary : 'transparent'}`, background: 'transparent',
      color: aba === id ? T.primary : T.textSecondary, fontWeight: 700, fontSize: 13, cursor: 'pointer',
    },
  }, React.createElement(icone, { size: 15 }), rotulo);

  return React.createElement('div', {
    role: 'dialog', 'aria-modal': true, 'aria-label': 'Editor de mensagem ampliado',
    style: { position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: T.surface },
  },
    // Cabeçalho
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 },
    },
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 15, fontWeight: 800, color: T.text } }, 'Escrever mensagem'),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          `Para ${nomeContato}`,
          respondendoA && ` · respondendo: “${(respondendoA.conteudo || '[mídia]').slice(0, 60)}”`),
      ),
      React.createElement('button', {
        type: 'button', onClick: onFechar, title: 'Voltar ao campo normal (Esc)', 'aria-label': 'Voltar ao campo normal',
        style: { ...btnIcone, width: 36, height: 36 },
      }, React.createElement(compacto ? X : Minimize2, { size: 18 })),
    ),

    // Barra de formatação
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 2, padding: '4px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surfaceAlt },
    },
      MARCADORES.map((m) => React.createElement('button', {
        key: m.id, type: 'button', title: m.titulo, 'aria-label': m.titulo,
        onMouseDown: (e) => e.preventDefault(), // não tira o foco/seleção do texto
        onClick: () => aplicarMarca(m.marca),
        style: btnIcone,
      }, React.createElement(m.icone, { size: 16 }))),
      React.createElement('span', { style: { marginLeft: 8, fontSize: 11.5, color: T.textMuted } },
        'Selecione um trecho e clique para formatar'),
    ),

    // Corpo: lado a lado no computador, abas no celular/tablet
    compacto
      ? React.createElement('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { style: { display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0 } },
          abaBtn('escrever', PenLine, 'Escrever'), abaBtn('previa', Eye, 'Prévia')),
        aba === 'escrever' ? editor : previa)
      : React.createElement('div', { style: { flex: 1, minHeight: 0, display: 'flex' } },
        React.createElement('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` } },
          tituloColuna(PenLine, 'Texto'), editor),
        React.createElement('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } },
          tituloColuna(Eye, 'Como o cidadão vai ver'), previa)),

    // Rodapé
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: `1px solid ${T.border}`, flexShrink: 0, flexWrap: 'wrap' },
    },
      React.createElement('div', { style: { flex: compacto ? '1 1 100%' : 1, minWidth: 180, fontSize: 12, color: T.textMuted } },
        React.createElement('span', { style: { color: perto ? T.danger : T.textMuted, fontWeight: perto ? 700 : 400 } },
          `${texto.length}/${maxLength} caracteres`),
        ` · ${palavras} palavra${palavras === 1 ? '' : 's'} · ${linhas} linha${linhas === 1 ? '' : 's'}`,
        !compacto && React.createElement('span', { style: { marginLeft: 10, opacity: 0.8 } }, 'Enter quebra linha · Ctrl+Enter envia · Esc volta'),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8, marginLeft: 'auto' } },
      React.createElement('button', {
        type: 'button', onClick: onFechar,
        style: { border: `1px solid ${T.borderStrong}`, background: T.surface, color: T.textSecondary, borderRadius: T.radiusSm, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
      }, 'Voltar ao campo'),
      React.createElement('button', {
        type: 'button', onClick: onEnviar, disabled: !podeEnviar,
        style: {
          display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: T.radiusSm, padding: '9px 18px',
          fontSize: 13, fontWeight: 700, color: '#fff', background: podeEnviar ? T.primary : T.borderStrong,
          cursor: podeEnviar ? 'pointer' : 'default',
        },
      }, enviando ? React.createElement(Loader2, { size: 16, className: 'spin' }) : React.createElement(Send, { size: 16 }), 'Enviar'),
      ),
    ),
  );
}
