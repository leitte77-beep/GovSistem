import React, { useRef, useCallback, useEffect } from 'react';
import { T } from '../theme.js';

var PLACEHOLDER_CSS = '[data-placeholder]:empty::before{content:attr(data-placeholder);color:#97a3b2;pointer-events:none}[data-placeholder]:focus:empty::before{opacity:.6}';
var injected = false;

var TOOLBAR_BUTTONS = [
  { label: 'Desfazer',    cmd: 'undo',        icon: '↩' },
  { label: 'Refazer',     cmd: 'redo',        icon: '↪' },
  null,
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

var toolbarBtnStyle = {
  position: 'relative', width: 28, height: 28, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  border: 'none', borderRadius: 6, background: 'transparent',
  color: '#5d7085', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'background .12s, color .12s',
  flexShrink: 0,
};

export function RichTextEditor({ value, onChange, placeholder, minHeight }) {
  useEffect(function () {
    if (injected) return;
    injected = true;
    var style = document.createElement('style');
    style.textContent = PLACEHOLDER_CSS;
    document.head.appendChild(style);
  }, []);

  var mh = minHeight || 120;
  var editorRef = useRef(null);
  var initialized = useRef(false);

  var emitChange = useCallback(function () {
    if (!editorRef.current) return;
    var html = editorRef.current.innerHTML;
    var text = editorRef.current.innerText || '';
    if (!text.trim() && !html.includes('<img')) {
      onChange && onChange('');
    } else {
      onChange && onChange(html);
    }
  }, [onChange]);

  var setRef = useCallback(function (el) {
    if (!el || initialized.current) return;
    editorRef.current = el;
    if (value && el.innerHTML !== value) {
      el.innerHTML = value;
    }
    initialized.current = true;
    el.addEventListener('input', emitChange);
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = e.clipboardData.getData('text/plain');
      var html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n?/g, '\n')
        .replace(/\n/g, '<br>');
      document.execCommand('insertHTML', false, html);
    });
  }, [value, emitChange]);

  var exec = useCallback(function (cmd, val) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, val || null);
    emitChange();
  }, [emitChange]);

  return React.createElement('div', {
    style: {
      border: '1px solid ' + T.borderStrong, borderRadius: T.radiusSm, overflow: 'hidden',
      background: T.surfaceAlt, transition: 'border-color .18s, box-shadow .18s',
    },
    onFocus: function (e) {
      e.currentTarget.style.borderColor = T.primary;
      e.currentTarget.style.boxShadow = '0 0 0 3px ' + T.primarySoft;
    },
    onBlur: function (e) {
      e.currentTarget.style.borderColor = T.borderStrong;
      e.currentTarget.style.boxShadow = 'none';
    },
  },
    // Toolbar
    React.createElement('div', {
      style: {
        display: 'flex', flexWrap: 'wrap', gap: 2, padding: '5px 6px',
        borderBottom: '1px solid ' + T.border, background: T.surface,
      },
      onMouseDown: function (e) { e.preventDefault(); },
    },
      TOOLBAR_BUTTONS.map(function (btn, i) {
        if (!btn) return React.createElement('span', { key: 'sep' + i, style: { width: 1, background: T.border, margin: '2px 3px', alignSelf: 'stretch' } });

        if (btn.isLink) {
          return React.createElement('button', {
            key: i, type: 'button', title: btn.label, 'aria-label': btn.label,
            onClick: function () {
              var url = window.prompt('URL do link:');
              if (url) exec(btn.cmd, url);
            },
            style: toolbarBtnStyle,
          }, btn.icon);
        }

        if (btn.isColor) {
          return React.createElement('button', {
            key: i, type: 'button', title: btn.label, 'aria-label': btn.label,
            onClick: function () { exec(btn.cmd, btn.defaultValue || '#111827'); },
            style: toolbarBtnStyle,
          },
            React.createElement('span', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center' } },
              React.createElement('span', null, btn.icon),
              React.createElement('input', {
                type: 'color',
                defaultValue: btn.defaultValue || '#111827',
                onChange: function (e) { exec(btn.cmd, e.target.value); },
                style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' },
                title: btn.label,
                'aria-label': btn.label,
              }),
            ));
        }

        if (btn.isSelect) {
          return React.createElement('button', {
            key: i, type: 'button', title: btn.label, 'aria-label': btn.label,
            onClick: function () {},
            style: Object.assign({}, toolbarBtnStyle, { cursor: 'default' }),
          },
            React.createElement('span', null, btn.icon),
            React.createElement('select', {
              onChange: function (e) { exec(btn.cmd, e.target.value); },
              style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', fontSize: 11 },
              defaultValue: '',
              'aria-label': btn.label,
            },
              React.createElement('option', { value: '' }, ''),
              (btn.options || []).map(function (o) { return React.createElement('option', { key: o, value: o }, o); }),
            ));
        }

        return React.createElement('button', {
          key: i, type: 'button', title: btn.label, 'aria-label': btn.label,
          onClick: function () { exec(btn.cmd); },
          style: toolbarBtnStyle,
        }, btn.icon);
      }),
    ),

    React.createElement('div', {
      ref: setRef,
      contentEditable: true,
      suppressContentEditableWarning: true,
      'data-placeholder': placeholder || '',
      style: {
        minHeight: mh, padding: '10px 13px', outline: 'none',
        fontSize: 13.5, lineHeight: 1.55, color: T.text,
        fontFamily: T.font, wordBreak: 'break-word',
      },
      onInput: emitChange,
    }),
  );
}
