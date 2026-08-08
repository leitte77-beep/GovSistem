import React, { useRef, useCallback } from 'react';

const TOOLBAR_BUTTONS = [
  { label: 'Desfazer',    cmd: 'undo',        icon: '↩' },
  { label: 'Refazer',     cmd: 'redo',        icon: '↪' },
  null, // separator
  { label: 'Negrito',     cmd: 'bold',        icon: 'N',  style: { fontWeight: 700 } },
  { label: 'Itálico',     cmd: 'italic',      icon: 'I',  style: { fontStyle: 'italic' } },
  { label: 'Sublinhado',  cmd: 'underline',   icon: 'S',  style: { textDecoration: 'underline' } },
  { label: 'Tachado',     cmd: 'strikeThrough', icon: 'S̶', style: { textDecoration: 'line-through' } },
  null,
  { label: 'Sobrescrito', cmd: 'superscript', icon: 'X²' },
  { label: 'Subscrito',   cmd: 'subscript',   icon: 'X₂' },
  null,
  { label: 'Tamanho fonte', cmd: 'fontSize',  icon: 'A▾', isSelect: true, options: ['1', '2', '3', '4', '5', '6', '7'] },
  { label: 'Cor do texto',  cmd: 'foreColor', icon: 'A▾', isColor: true, defaultValue: '#111827' },
  { label: 'Cor de fundo',  cmd: 'hiliteColor', icon: '🖌', isColor: true, defaultValue: '#fef08a' },
  null,
  { label: 'Lista não ordenada', cmd: 'insertUnorderedList', icon: '☰' },
  { label: 'Lista ordenada',     cmd: 'insertOrderedList',   icon: '1.' },
  null,
  { label: 'Alinhar esquerda', cmd: 'justifyLeft',   icon: '⫷' },
  { label: 'Centralizar',      cmd: 'justifyCenter', icon: '⫿' },
  { label: 'Alinhar direita',  cmd: 'justifyRight',  icon: '⫸' },
  { label: 'Justificar',       cmd: 'justifyFull',   icon: '⬜' },
  null,
  { label: 'Aumentar recuo', cmd: 'indent',    icon: '→|' },
  { label: 'Diminuir recuo', cmd: 'outdent',   icon: '|←' },
  null,
  { label: 'Inserir link', cmd: 'createLink', icon: '🔗', isLink: true },
  { label: 'Remover formatação', cmd: 'removeFormat', icon: '✕' },
];

export function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }) {
  const editorRef = useRef(null);
  const initialized = useRef(false);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Reset to placeholder if empty
    const text = editorRef.current.innerText || '';
    if (!text.trim() && !html.includes('<img')) {
      onChange && onChange('');
    } else {
      onChange && onChange(html);
    }
  }, [onChange]);

  const setRef = useCallback((el) => {
    if (!el || initialized.current) return;
    editorRef.current = el;
    if (value && el.innerHTML !== value) {
      el.innerHTML = value;
    }
    initialized.current = true;

    el.addEventListener('input', emitChange);
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }, [value, emitChange]);

  const exec = useCallback((cmd, val) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, val || null);
    emitChange();
  }, [emitChange]);

  return React.createElement('div', {
    style: {
      border: '1px solid #cfd8e5', borderRadius: 10, overflow: 'hidden',
      background: '#fbfcfe', transition: 'border-color .18s, box-shadow .18s',
    },
    onFocus: (e) => {
      e.currentTarget.style.borderColor = 'var(--pd-blue, #2563eb)';
      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37,91,231,.1)';
    },
    onBlur: (e) => {
      e.currentTarget.style.borderColor = '#cfd8e5';
      e.currentTarget.style.boxShadow = 'none';
    },
  },
    // Toolbar
    React.createElement('div', {
      style: {
        display: 'flex', flexWrap: 'wrap', gap: 2, padding: '5px 6px',
        borderBottom: '1px solid #e5ebf3', background: '#f8fafc',
      },
      onMouseDown: (e) => e.preventDefault(),
    },
      TOOLBAR_BUTTONS.map((btn, i) => {
        if (!btn) return React.createElement('span', { key: 'sep' + i, style: { width: 1, background: '#dfe6f0', margin: '2px 3px', alignSelf: 'stretch' } });

        if (btn.isLink) {
          return React.createElement('button', {
            key: i,
            type: 'button',
            title: btn.label,
            onClick: () => {
              const url = window.prompt('URL do link:');
              if (url) exec(btn.cmd, url);
            },
            style: toolbarBtnStyle,
          }, btn.icon);
        }

        if (btn.isColor) {
          return React.createElement('button', {
            key: i,
            type: 'button',
            title: btn.label,
            onClick: () => exec(btn.cmd, btn.defaultValue || '#111827'),
            style: toolbarBtnStyle,
          },
            React.createElement('span', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center' } },
              React.createElement('span', null, btn.icon),
              React.createElement('input', {
                type: 'color',
                defaultValue: btn.defaultValue || '#111827',
                onChange: (e) => exec(btn.cmd, e.target.value),
                style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' },
                title: btn.label,
              }),
            ));
        }

        if (btn.isSelect) {
          return React.createElement('button', {
            key: i,
            type: 'button',
            title: btn.label,
            onClick: () => {},
            style: Object.assign({}, toolbarBtnStyle, { cursor: 'default' }),
          },
            React.createElement('span', null, btn.icon),
            React.createElement('select', {
              onChange: (e) => exec(btn.cmd, e.target.value),
              style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', fontSize: 11 },
              defaultValue: '',
            },
              React.createElement('option', { value: '' }, ''),
              (btn.options || []).map(o => React.createElement('option', { key: o, value: o }, o)),
            ));
        }

        return React.createElement('button', {
          key: i,
          type: 'button',
          title: btn.label,
          onClick: () => exec(btn.cmd),
          style: toolbarBtnStyle,
        }, btn.icon);
      }),
    ),

    // Editor area
    React.createElement('div', {
      ref: setRef,
      contentEditable: true,
      suppressContentEditableWarning: true,
      'data-placeholder': placeholder || '',
      style: {
        minHeight: minHeight, padding: '10px 13px', outline: 'none',
        fontSize: 14, lineHeight: 1.55, color: '#14213d',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        wordBreak: 'break-word',
      },
      onInput: emitChange,
    }),
  );
}

const toolbarBtnStyle = {
  position: 'relative', width: 28, height: 28, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  border: 'none', borderRadius: 6, background: 'transparent',
  color: '#5d7085', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'background .12s, color .12s',
  flexShrink: 0,
};
