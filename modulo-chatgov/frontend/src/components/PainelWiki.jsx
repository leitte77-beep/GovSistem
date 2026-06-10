import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Search, Edit3, Eye } from 'lucide-react';
import { fetchArtigos, fetchCategoriasWiki, criarArtigoApi } from '../api/evolucoes';
import { useAuth } from '../context/AuthContext';
import { T } from '../theme';

export function PainelWiki() {
  const { auth } = useAuth();
  const [artigos, setArtigos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [artigoAtivo, setArtigoAtivo] = useState(null);
  const [showNovo, setShowNovo] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    fetchArtigos(categoriaAtiva).then(setArtigos).catch(console.error);
    fetchCategoriasWiki().then(setCategorias).catch(console.error);
  }, [categoriaAtiva]);

  const handleCriar = async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      const artigo = await criarArtigoApi({
        titulo: form.titulo.value,
        conteudo: form.conteudo?.value || '',
        categoria: form.categoria.value || 'Geral',
        leitura_obrigatoria: form.leitura_obrigatoria?.checked || false,
      });
      const atualizados = await fetchArtigos(categoriaAtiva);
      setArtigos(atualizados);
      setShowNovo(false);
    } catch (err) { console.error(err); }
  };

  const artigosFiltrados = busca
    ? artigos.filter((a) => a.titulo.toLowerCase().includes(busca.toLowerCase()) || a.conteudo?.toLowerCase().includes(busca.toLowerCase()))
    : artigos;

  return React.createElement('div', { style: { flex: 1, display: 'flex', height: '100%', background: T.bg } },
    // Sidebar - Categorias
    React.createElement('div', { style: { width: 220, borderRight: `1px solid ${T.border}`, background: T.surface, padding: 12, overflowY: 'auto', flexShrink: 0 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 } },
        React.createElement(BookOpen, { size: 18, color: T.primary }),
        React.createElement('span', { style: { fontWeight: 700, fontSize: 14, color: T.text } }, 'Base de Conhecimento'),
      ),
      React.createElement('div', { onClick: () => { setCategoriaAtiva(null); setArtigoAtivo(null); }, style: { padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: !categoriaAtiva ? T.primary : T.text, background: !categoriaAtiva ? T.surfaceMuted : 'transparent', marginBottom: 2 } }, 'Todos'),
      ...categorias.map((c) => React.createElement('div', {
        key: c.categoria, onClick: () => { setCategoriaAtiva(c.categoria); setArtigoAtivo(null); },
        style: { padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: categoriaAtiva === c.categoria ? T.primary : T.text, background: categoriaAtiva === c.categoria ? T.surfaceMuted : 'transparent' },
      },
        c.categoria,
        React.createElement('span', { style: { fontSize: 10, color: T.textMuted, marginLeft: 4 } }, `(${c.total})`),
      )),
    ),
    // Main content
    React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
      React.createElement('div', { style: { padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 } },
        React.createElement('input', { value: busca, onChange: (e) => setBusca(e.target.value), placeholder: 'Buscar artigos...', style: { flex: 1, padding: '7px 12px', border: `1px solid ${T.border}`, borderRadius: 20, fontSize: 13, outline: 'none', background: T.surfaceMuted, color: T.text } }),
        React.createElement('button', { onClick: () => setShowNovo(true), style: { background: T.primary, border: 'none', borderRadius: 6, padding: '7px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
          React.createElement(Plus, { size: 14 }), 'Novo Artigo'),
      ),
      React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
        artigoAtivo
          ? React.createElement('div', { style: { background: T.surface, borderRadius: 10, padding: 20, border: `1px solid ${T.border}`, maxWidth: 800 } },
              React.createElement('button', { onClick: () => setArtigoAtivo(null), style: { background: 'none', border: 'none', cursor: 'pointer', color: T.primary, fontSize: 13, marginBottom: 12 } }, '← Voltar'),
              React.createElement('h2', { style: { color: T.text, margin: '0 0 4px', fontSize: 20 } }, artigoAtivo.titulo),
              React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginBottom: 16 } },
                `Por ${artigoAtivo.autor_nome || '—'} · ${new Date(artigoAtivo.atualizado_em).toLocaleDateString('pt-BR')} · ${artigoAtivo.categoria}`),
              artigoAtivo.leitura_obrigatoria && React.createElement('div', { style: { background: '#FFF3CD', padding: '6px 10px', borderRadius: 6, fontSize: 12, color: '#856404', marginBottom: 12 } }, '📌 Leitura obrigatória'),
              React.createElement('div', { style: { color: T.text, fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-wrap' } }, artigoAtivo.conteudo),
            )
          : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              artigosFiltrados.length === 0
                ? React.createElement('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40 } }, 'Nenhum artigo encontrado')
                : artigosFiltrados.map((a) => React.createElement('div', {
                    key: a.id, onClick: () => setArtigoAtivo(a),
                    style: { background: T.surface, borderRadius: 8, padding: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${T.border}`, borderLeft: a.leitura_obrigatoria ? '3px solid #F59E0B' : `3px solid ${T.primary}` },
                  },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      React.createElement('span', { style: { fontWeight: 600, fontSize: 14, color: T.text } }, a.titulo),
                      React.createElement('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: T.surfaceMuted, color: T.textMuted } }, a.categoria),
                    ),
                    React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 4 } }, `Por ${a.autor_nome || '—'} · ${new Date(a.atualizado_em).toLocaleDateString('pt-BR')}`),
                  )),
            ),
      ),
    ),
    // Modal: Novo Artigo
    showNovo && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('form', { onSubmit: handleCriar, style: { background: '#fff', borderRadius: 12, padding: 20, width: 500 } },
        React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16, color: T.text } }, 'Novo Artigo'),
        React.createElement('input', { name: 'titulo', placeholder: 'Título', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('select', { name: 'categoria', defaultValue: 'Geral', style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } },
          ...categorias.map((c) => React.createElement('option', { key: c.categoria, value: c.categoria }, c.categoria)),
          React.createElement('option', { value: 'Geral' }, 'Geral'),
        ),
        React.createElement('textarea', { name: 'conteudo', placeholder: 'Conteúdo do artigo', rows: 6, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14, fontFamily: T.font } }),
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.text, marginBottom: 12 } },
          React.createElement('input', { name: 'leitura_obrigatoria', type: 'checkbox' }), 'Leitura obrigatória para novos servidores'),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { type: 'button', onClick: () => setShowNovo(false), style: { padding: '6px 14px', background: T.surfaceMuted, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 } }, 'Cancelar'),
          React.createElement('button', { type: 'submit', style: { padding: '6px 14px', background: T.primary, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 } }, 'Publicar'),
        ),
      ),
    ),
  );
}
