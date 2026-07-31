import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Building2, Search, X, Check } from 'lucide-react';
import { T } from '../theme';

// Combobox de secretaria › departamento. Substitui o <select> nativo, que numa
// prefeitura vira uma lista de dezenas de linhas do tipo
// "Secretaria de Administração e Planejamento › Notificações/Aditivos" —
// impossível de varrer com o olho. Aqui o departamento vem em destaque e a
// secretaria embaixo, em texto menor, e a busca casa com os dois.
export function SeletorDepartamento({ departamentos, valor, onChange, placeholder }) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const containerRef = useRef(null);
  const buscaRef = useRef(null);

  const selecionado = departamentos.find((d) => d.id === valor);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc, true);
    buscaRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc, true);
    };
  }, [aberto]);

  const normalizar = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Agrupa por secretaria e filtra: o termo casa com o nome do departamento OU
  // com o da secretaria (digitar "administração" traz todos os setores dela).
  const grupos = useMemo(() => {
    const t = normalizar(termo.trim());
    const porSecretaria = new Map();
    departamentos.forEach((dep) => {
      const secretaria = dep.secretaria_nome || 'Sem secretaria';
      const casa = !t || normalizar(dep.nome).includes(t) || normalizar(secretaria).includes(t);
      if (!casa) return;
      if (!porSecretaria.has(secretaria)) porSecretaria.set(secretaria, []);
      porSecretaria.get(secretaria).push(dep);
    });
    return [...porSecretaria.entries()]
      .map(([secretaria, deps]) => ({ secretaria, deps }))
      .sort((a, b) => a.secretaria.localeCompare(b.secretaria, 'pt-BR'));
  }, [departamentos, termo]);

  const totalFiltrado = grupos.reduce((acc, g) => acc + g.deps.length, 0);

  const escolher = (id) => {
    onChange(id);
    setAberto(false);
    setTermo('');
  };

  return React.createElement('div', { ref: containerRef, style: { position: 'relative', marginBottom: 14 } },
    // Campo (fechado)
    React.createElement('button', {
      type: 'button',
      onClick: () => setAberto((v) => !v),
      'aria-haspopup': 'listbox',
      'aria-expanded': aberto,
      style: {
        width: '100%', padding: '10px 14px 10px 44px', position: 'relative',
        background: T.surfaceMuted, border: `1px solid ${aberto ? T.primary : T.border}`,
        borderRadius: T.radius, color: T.text, fontSize: 14, cursor: 'pointer',
        textAlign: 'left', minHeight: 46, boxSizing: 'border-box', fontFamily: 'inherit',
      },
    },
      React.createElement(Building2, {
        size: 18,
        style: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textMuted },
      }),
      selecionado
        ? React.createElement('span', null,
            React.createElement('span', { style: { display: 'block', fontWeight: 600, lineHeight: 1.25 } }, selecionado.nome),
            selecionado.secretaria_nome && React.createElement('span', {
              style: { display: 'block', fontSize: 11, color: T.textMuted, lineHeight: 1.25 },
            }, selecionado.secretaria_nome),
          )
        : React.createElement('span', { style: { color: T.textMuted } }, placeholder || 'Sem encaminhamento'),
      selecionado && React.createElement('span', {
        role: 'button', 'aria-label': 'Limpar setor',
        onClick: (e) => { e.stopPropagation(); onChange(''); },
        style: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: T.textMuted },
      }, React.createElement(X, { size: 15 })),
    ),

    // Lista (aberta)
    aberto && React.createElement('div', {
      role: 'listbox',
      style: {
        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
        boxShadow: T.shadowLg || '0 12px 40px rgba(0,0,0,0.16)', overflow: 'hidden',
      },
    },
      React.createElement('div', { style: { padding: 8, borderBottom: `1px solid ${T.border}`, position: 'relative' } },
        React.createElement(Search, {
          size: 15,
          style: { position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: T.textMuted },
        }),
        React.createElement('input', {
          ref: buscaRef,
          value: termo,
          onChange: (e) => setTermo(e.target.value),
          placeholder: 'Digite: Compras, Saúde, Obras...',
          'aria-label': 'Buscar secretaria ou departamento',
          style: {
            width: '100%', padding: '8px 10px 8px 34px', border: `1px solid ${T.border}`,
            borderRadius: T.radiusSm, fontSize: 13, outline: 'none', boxSizing: 'border-box',
            background: T.surfaceMuted, color: T.text, fontFamily: 'inherit',
          },
        }),
      ),
      React.createElement('div', { style: { maxHeight: 260, overflowY: 'auto' } },
        React.createElement('button', {
          type: 'button', onClick: () => escolher(''),
          style: { ...itemStyle, color: T.textSecondary, fontStyle: 'italic' },
        }, 'Sem encaminhamento'),
        totalFiltrado === 0
          ? React.createElement('div', { style: { padding: 14, fontSize: 13, color: T.textMuted } }, 'Nenhum setor encontrado.')
          : grupos.map((g) =>
              React.createElement('div', { key: g.secretaria },
                React.createElement('div', {
                  style: {
                    padding: '7px 14px 3px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                    textTransform: 'uppercase', color: T.textMuted, background: T.surfaceAlt,
                  },
                }, g.secretaria),
                g.deps.map((dep) =>
                  React.createElement('button', {
                    key: dep.id, type: 'button', role: 'option',
                    'aria-selected': dep.id === valor,
                    onClick: () => escolher(dep.id),
                    style: { ...itemStyle, background: dep.id === valor ? T.primarySoft : 'transparent' },
                  },
                    React.createElement('span', {
                      style: { width: 8, height: 8, borderRadius: '50%', background: dep.cor || T.primary, flexShrink: 0 },
                    }),
                    React.createElement('span', { style: { flex: 1, minWidth: 0 } },
                      React.createElement('span', {
                        style: { display: 'block', fontSize: 13.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                      }, dep.nome),
                      React.createElement('span', {
                        style: { display: 'block', fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                      }, g.secretaria),
                    ),
                    dep.id === valor && React.createElement(Check, { size: 15, color: T.primary }),
                  )),
              )),
      ),
    ),
  );
}

const itemStyle = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
  padding: '9px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
  fontSize: 13.5, fontFamily: 'inherit', background: 'transparent',
};
