import React, { useState, useEffect } from 'react';
import { FolderOpen, Upload, Search, File, Image, Film, Music, FileText, Download, Trash2 } from 'lucide-react';
import { fetchPastas, fetchArquivosPasta, uploadArquivoApi, fetchArquivosBusca } from '../api/evolucoes';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { T } from '../theme';

function formatarTamanho(bytes) {
  if (!bytes) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let tamanho = bytes;
  while (tamanho >= 1024 && i < unidades.length - 1) { tamanho /= 1024; i++; }
  return `${tamanho.toFixed(1)} ${unidades[i]}`;
}

function iconeTipo(tipo) {
  const map = { imagem: Image, video: Film, audio: Music, documento: FileText, planilha: FileText };
  return map[tipo] || File;
}

export function PainelArquivos() {
  const { auth } = useAuth();
  const [pastas, setPastas] = useState([]);
  const [pastaAtiva, setPastaAtiva] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [busca, setBusca] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPastas().then(setPastas).catch(console.error);
  }, []);

  useEffect(() => {
    if (pastaAtiva) {
      fetchArquivosPasta(pastaAtiva.id).then(setArquivos).catch(console.error);
    }
  }, [pastaAtiva?.id]);

  const handleBusca = async () => {
    if (!busca.trim()) return;
    const results = await fetchArquivosBusca(busca);
    setArquivos(results);
    setPastaAtiva(null);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadArquivoApi(file, null, pastaAtiva?.id || null, null, null);
      if (pastaAtiva) {
        const updated = await fetchArquivosPasta(pastaAtiva.id);
        setArquivos(updated);
      }
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  return React.createElement('div', { style: { flex: 1, display: 'flex', height: '100%', background: T.bg } },
    // Sidebar - Pastas
    React.createElement('div', { style: { width: 220, borderRight: `1px solid ${T.border}`, background: T.surface, padding: 12, overflowY: 'auto', flexShrink: 0 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 } },
        React.createElement(FolderOpen, { size: 18, color: T.primary }),
        React.createElement('span', { style: { fontWeight: 700, fontSize: 14, color: T.text } }, 'Pastas'),
      ),
      React.createElement('div', { onClick: () => { setPastaAtiva(null); setBusca(''); }, style: { padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: !pastaAtiva ? T.primary : T.text, background: !pastaAtiva ? T.surfaceMuted : 'transparent', marginBottom: 2 } }, 'Todos os arquivos'),
      ...pastas.map((p) => React.createElement('div', {
        key: p.id, onClick: () => { setPastaAtiva(p); setBusca(''); },
        style: { padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: pastaAtiva?.id === p.id ? T.primary : T.text, background: pastaAtiva?.id === p.id ? T.surfaceMuted : 'transparent' },
      },
        React.createElement(FolderOpen, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }),
        p.nome,
        React.createElement('span', { style: { fontSize: 10, color: T.textMuted, marginLeft: 4 } }, `(${p.total_arquivos || 0})`),
      )),
    ),
    // Main content
    React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
      React.createElement('div', { style: { padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 } },
        React.createElement('input', { value: busca, onChange: (e) => setBusca(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleBusca(), placeholder: 'Buscar arquivos...', style: { flex: 1, padding: '7px 12px', border: `1px solid ${T.border}`, borderRadius: 20, fontSize: 13, outline: 'none', background: T.surfaceMuted, color: T.text } }),
        React.createElement('button', { onClick: handleBusca, style: { background: T.primary, border: 'none', borderRadius: 6, padding: '7px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
          React.createElement(Search, { size: 14 }), 'Buscar'),
        React.createElement('label', { style: { background: T.primary, border: 'none', borderRadius: 6, padding: '7px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
          React.createElement(Upload, { size: 14 }), uploading ? 'Enviando...' : 'Upload',
          React.createElement('input', { type: 'file', onChange: handleUpload, style: { display: 'none' } }),
        ),
      ),
      React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' } },
        arquivos.length === 0
          ? React.createElement('div', { style: { width: '100%', textAlign: 'center', color: T.textMuted, padding: 40 } }, 'Nenhum arquivo encontrado')
          : arquivos.map((a) => {
              const Icon = iconeTipo(a.tipo);
              return React.createElement('div', { key: a.id, style: { width: 180, background: T.surface, borderRadius: 10, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${T.border}` } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: 8 } },
                  React.createElement(Icon, { size: 40, color: T.primary })),
                React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, title: a.nome_original }, a.nome_original),
                React.createElement('div', { style: { fontSize: 10, color: T.textMuted } }, formatarTamanho(a.tamanho)),
                React.createElement('div', { style: { fontSize: 10, color: T.textMuted } }, new Date(a.enviado_em).toLocaleDateString('pt-BR')),
                a.enviado_por_nome && React.createElement('div', { style: { fontSize: 10, color: T.textMuted, marginTop: 2 } }, a.enviado_por_nome),
                a.duplicado && React.createElement('div', { style: { fontSize: 10, color: '#F59E0B', marginTop: 4 } }, '⚠ Duplicado'),
              );
            }),
      ),
    ),
  );
}
