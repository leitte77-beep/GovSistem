import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, Search, Download, ExternalLink, MoreVertical, Grid3X3, List, Filter,
  ChevronLeft, ChevronRight, ZoomIn, Printer, MessageSquare, Copy, CheckSquare,
  Square, FileText, Image, Film, Music, Paperclip, Trash2, FolderOpen,
  FileArchive, FileSpreadsheet, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { T } from '../theme';
import {
  iconeArquivo, nomeArquivoDaUrl, formatoArquivo, formatarTamanho,
  classificarMidia, extensaoDoMime, agruparPorData, formatarDataHora, formatarHora,
} from '../utils/arquivo';
import { urlVisualizavel } from './MediaPreview';

const FILTRO_TODOS = 'todos';

function normalizarTexto(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function nomeRemetente(midia, conversa) {
  if (midia.nome_remetente) return midia.nome_remetente;
  if (midia.direcao === 'entrada') return conversa?.contato_nome || conversa?.contato_telefone || 'Cidadão';
  return midia.remetente_nome || 'Atendente';
}

function midiaCorrespondePesquisa(midia, termo, conversa) {
  if (!termo) return true;
  const t = normalizarTexto(termo);
  const nome = normalizarTexto(midia.media_nome || nomeArquivoDaUrl(midia.media_url || ''));
  const ext = normalizarTexto(extensaoDoMime(midia.media_mime));
  const conteudo = normalizarTexto(midia.conteudo || '');
  const remetente = normalizarTexto(nomeRemetente(midia, conversa));
  const tipo = normalizarTexto(formatoArquivo(midia.media_mime));
  return nome.includes(t) || ext.includes(t) || conteudo.includes(t) || remetente.includes(t) || tipo.includes(t);
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function GaleriaMidias({ conversa, midias, carregando, onFechar, onIrParaMensagem }) {
  const [busca, setBusca] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState(FILTRO_TODOS);
  const [modoExibicao, setModoExibicao] = useState(() => {
    try { return localStorage.getItem('chatgov_galeria_modo') || 'grade'; } catch { return 'grade'; }
  });
  const [ordenacao, setOrdenacao] = useState(() => {
    try { return localStorage.getItem('chatgov_galeria_ordem') || 'recentes'; } catch { return 'recentes'; }
  });
  const [agrupamento, setAgrupamento] = useState(() => {
    try { return localStorage.getItem('chatgov_galeria_agrupar') || 'data'; } catch { return 'data'; }
  });
  const [selecionados, setSelecionados] = useState(new Set());
  const [painelItem, setPainelItem] = useState(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [showMenuAcoes, setShowMenuAcoes] = useState(null);
  const [pdfPagina, setPdfPagina] = useState(1);
  const [pdfTotal, setPdfTotal] = useState(null);
  const inputBuscaRef = useRef(null);

  const filtrosAvancadosRef = useRef({
    periodo: 'todos', enviadoPor: 'todos', tipoArquivo: 'todos', tamanho: 'todos',
  });
  const [filtrosAv, setFiltrosAv] = useState({ ...filtrosAvancadosRef.current });

  // Foco automático no campo de busca
  useEffect(() => {
    setTimeout(() => inputBuscaRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (painelItem) { setPainelItem(null); return; }
        if (showFiltros) { setShowFiltros(false); return; }
        onFechar();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onFechar, painelItem, showFiltros]);

  // ─── Contagens por categoria ───
  const contagens = useMemo(() => {
    const c = { todos: midias.length, imagens: 0, documentos: 0, videos: 0, audios: 0, outros: 0 };
    midias.forEach((m) => {
      const cat = classificarMidia(m.media_mime || m.mediaMime);
      if (c[cat] !== undefined) c[cat]++;
      else c.outros++;
    });
    return c;
  }, [midias]);

  // ─── Filtragem ───
  const midiasFiltradas = useMemo(() => {
    let resultado = midias;

    // Busca textual
    if (busca.trim()) {
      const t = normalizarTexto(busca.trim());
      resultado = resultado.filter((m) => midiaCorrespondePesquisa(m, t, conversa));
    }

    // Aba de categoria
    if (filtroAtivo !== FILTRO_TODOS) {
      const cat = filtroAtivo === 'documentos' ? 'documentos' : filtroAtivo;
      resultado = resultado.filter((m) => classificarMidia(m.media_mime || m.mediaMime) === cat);
    }

    // Filtros avançados
    const fa = filtrosAv;
    if (fa.periodo && fa.periodo !== 'todos') {
      const agora = Date.now();
      let corte = 0;
      if (fa.periodo === 'hoje') corte = agora - 86400000;
      else if (fa.periodo === '7dias') corte = agora - 7 * 86400000;
      else if (fa.periodo === '30dias') corte = agora - 30 * 86400000;
      else if (fa.periodo === 'este_mes') {
        const d = new Date();
        corte = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      }
      if (corte) resultado = resultado.filter((m) => new Date(m.criado_em).getTime() >= corte);
    }

    if (fa.enviadoPor && fa.enviadoPor !== 'todos') {
      if (fa.enviadoPor === 'cidadao') resultado = resultado.filter((m) => m.direcao === 'entrada');
      else if (fa.enviadoPor === 'atendente') resultado = resultado.filter((m) => m.direcao === 'saida');
    }

    if (fa.tipoArquivo && fa.tipoArquivo !== 'todos') {
      resultado = resultado.filter((m) => {
        const mime = (m.media_mime || '').toLowerCase();
        switch (fa.tipoArquivo) {
          case 'pdf': return mime.includes('pdf');
          case 'imagem': return mime.startsWith('image/');
          case 'word': return mime.includes('word') || mime.includes('document');
          case 'excel': return mime.includes('sheet') || mime.includes('excel');
          case 'video': return mime.startsWith('video/');
          case 'audio': return mime.startsWith('audio/');
          case 'zip': return mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('compress');
          default: return true;
        }
      });
    }

    if (fa.tamanho && fa.tamanho !== 'todos') {
      resultado = resultado.filter((m) => {
        const bytes = m.media_tamanho || 0;
        if (fa.tamanho === 'menor1mb') return bytes > 0 && bytes < 1048576;
        if (fa.tamanho === '1a10mb') return bytes >= 1048576 && bytes <= 10485760;
        if (fa.tamanho === 'maior10mb') return bytes > 10485760;
        return true;
      });
    }

    return resultado;
  }, [midias, busca, filtroAtivo, filtrosAv, conversa]);

  // ─── Ordenação ───
  const midiasOrdenadas = useMemo(() => {
    const arr = [...midiasFiltradas];
    switch (ordenacao) {
      case 'recentes': arr.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)); break;
      case 'antigos': arr.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)); break;
      case 'nome_az': arr.sort((a, b) => (a.media_nome || nomeArquivoDaUrl(a.media_url || '')).localeCompare(b.media_nome || nomeArquivoDaUrl(b.media_url || ''))); break;
      case 'nome_za': arr.sort((a, b) => (b.media_nome || nomeArquivoDaUrl(b.media_url || '')).localeCompare(a.media_nome || nomeArquivoDaUrl(a.media_url || ''))); break;
      case 'maior': arr.sort((a, b) => (b.media_tamanho || 0) - (a.media_tamanho || 0)); break;
      case 'menor': arr.sort((a, b) => (a.media_tamanho || 0) - (b.media_tamanho || 0)); break;
    }
    return arr;
  }, [midiasFiltradas, ordenacao]);

  // ─── Agrupamento ───
  const grupos = useMemo(() => {
    if (agrupamento === 'nenhum') return [{ chave: null, itens: midiasOrdenadas }];
    if (agrupamento === 'data') return agruparPorData(midiasOrdenadas);
    if (agrupamento === 'tipo') {
      const mapa = new Map();
      midiasOrdenadas.forEach((m) => {
        const cat = formatoArquivo(m.media_mime || m.mediaMime) || 'Outros';
        if (!mapa.has(cat)) mapa.set(cat, []);
        mapa.get(cat).push(m);
      });
      return Array.from(mapa.entries()).map(([chave, itens]) => ({ chave, itens }));
    }
    if (agrupamento === 'remetente') {
      const mapa = new Map();
      midiasOrdenadas.forEach((m) => {
        const nome = nomeRemetente(m, conversa);
        if (!mapa.has(nome)) mapa.set(nome, []);
        mapa.get(nome).push(m);
      });
      return Array.from(mapa.entries()).map(([chave, itens]) => ({ chave, itens }));
    }
    return [{ chave: null, itens: midiasOrdenadas }];
  }, [midiasOrdenadas, agrupamento, conversa]);

  // ─── Ações ───
  const toggleSelecionado = useCallback((id) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selecionarTodos = useCallback(() => {
    if (selecionados.size === midiasOrdenadas.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(midiasOrdenadas.map((m) => m.id)));
    }
  }, [selecionados, midiasOrdenadas]);

  const limparSelecao = useCallback(() => setSelecionados(new Set()), []);

  const baixarItem = useCallback((midia) => {
    const url = urlVisualizavel(midia.media_url || midia.mediaUrl);
    const nome = midia.media_nome || midia.mediaNome || nomeArquivoDaUrl(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const abrirEmNovaAba = useCallback((midia) => {
    window.open(urlVisualizavel(midia.media_url || midia.mediaUrl), '_blank', 'noopener');
  }, []);

  const copiarNome = useCallback((midia) => {
    const nome = midia.media_nome || midia.mediaNome || nomeArquivoDaUrl(midia.media_url || '');
    navigator.clipboard.writeText(nome).catch(() => {});
  }, []);

  const handleSalvarPreferencia = useCallback((chave, valor) => {
    try { localStorage.setItem(`chatgov_galeria_${chave}`, valor); } catch {}
  }, []);

  // ─── Renderização ───
  const temFiltrosAvancados = filtrosAv.periodo !== 'todos' || filtrosAv.enviadoPor !== 'todos' || filtrosAv.tipoArquivo !== 'todos' || filtrosAv.tamanho !== 'todos';

  const tagsFiltros = [];
  if (filtrosAv.periodo !== 'todos') {
    const labels = { hoje: 'Hoje', '7dias': 'Últimos 7 dias', '30dias': 'Últimos 30 dias', este_mes: 'Este mês' };
    tagsFiltros.push({ chave: 'periodo', label: labels[filtrosAv.periodo] || filtrosAv.periodo });
  }
  if (filtrosAv.enviadoPor !== 'todos') {
    tagsFiltros.push({ chave: 'enviadoPor', label: filtrosAv.enviadoPor === 'cidadao' ? 'Enviado pelo cidadão' : 'Enviado pelo atendente' });
  }
  if (filtrosAv.tipoArquivo !== 'todos') {
    const tl = { pdf: 'PDF', imagem: 'Imagens', word: 'Word', excel: 'Excel', video: 'Vídeos', audio: 'Áudios', zip: 'Compactados' };
    tagsFiltros.push({ chave: 'tipoArquivo', label: tl[filtrosAv.tipoArquivo] || filtrosAv.tipoArquivo });
  }
  if (filtrosAv.tamanho !== 'todos') {
    const sl = { menor1mb: '<1 MB', '1a10mb': '1-10 MB', maior10mb: '>10 MB' };
    tagsFiltros.push({ chave: 'tamanho', label: sl[filtrosAv.tamanho] || filtrosAv.tamanho });
  }

  function removerTag(chave) {
    setFiltrosAv((prev) => ({ ...prev, [chave]: 'todos' }));
    filtrosAvancadosRef.current[chave] = 'todos';
  }

  function limparFiltros() {
    const vazio = { periodo: 'todos', enviadoPor: 'todos', tipoArquivo: 'todos', tamanho: 'todos' };
    setFiltrosAv(vazio);
    filtrosAvancadosRef.current = vazio;
  }

  const nomeContato = conversa?.contato_nome || conversa?.contato_telefone || 'Contato';
  const protocoloTexto = conversa?.protocolo || conversa?.protocolo_numero || '';

  return (
    <div
      onClick={onFechar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(8px, 2vh, 24px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface, borderRadius: 16, width: 'min(1400px, 95vw)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: T.shadowLg,
        }}
      >
        {/* Cabeçalho */}
        <Header
          nomeContato={nomeContato}
          protocoloTexto={protocoloTexto}
          total={contagens.todos}
          onFechar={onFechar}
        />

        {/* Barra de ferramentas fixa */}
        <div style={{
          padding: '10px 18px', borderBottom: `1px solid ${T.border}`,
          background: T.surface, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Linha 1: busca */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 10, background: T.surfaceMuted || T.surfaceAlt,
              border: `1px solid ${T.border}`,
            }}>
              <Search size={17} color={T.textMuted} />
              <input
                ref={inputBuscaRef}
                type="text"
                placeholder="Pesquisar por nome do arquivo, descrição ou mensagem..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 13.5, color: T.text,
                }}
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: T.textMuted, display: 'flex', padding: 2,
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFiltros(!showFiltros)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10, border: `1px solid ${showFiltros || temFiltrosAvancados ? T.primary : T.border}`,
                background: showFiltros || temFiltrosAvancados ? T.primarySoft : 'transparent',
                color: showFiltros || temFiltrosAvancados ? T.primary : T.textSecondary,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              <Filter size={15} />
              Filtros
              {temFiltrosAvancados && (
                <span style={{
                  background: T.primary, color: '#fff', borderRadius: 50,
                  width: 18, height: 18, fontSize: 11, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {Object.values(filtrosAv).filter((v) => v !== 'todos').length}
                </span>
              )}
            </button>
          </div>

          {/* Painel de filtros avançados (expandível) */}
          {showFiltros && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10, padding: '12px 14px', background: T.surfaceAlt || T.surfaceMuted,
              borderRadius: 10, border: `1px solid ${T.border}`,
            }}>
              <FiltroSelect label="Período" value={filtrosAv.periodo} onChange={(v) => { setFiltrosAv((p) => ({ ...p, periodo: v })); filtrosAvancadosRef.current.periodo = v; }}
                options={[
                  { value: 'todos', label: 'Todo o período' },
                  { value: 'hoje', label: 'Hoje' },
                  { value: '7dias', label: 'Últimos 7 dias' },
                  { value: '30dias', label: 'Últimos 30 dias' },
                  { value: 'este_mes', label: 'Este mês' },
                ]}
              />
              <FiltroSelect label="Enviado por" value={filtrosAv.enviadoPor} onChange={(v) => { setFiltrosAv((p) => ({ ...p, enviadoPor: v })); filtrosAvancadosRef.current.enviadoPor = v; }}
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'cidadao', label: 'Cidadão' },
                  { value: 'atendente', label: 'Atendente' },
                ]}
              />
              <FiltroSelect label="Tipo de arquivo" value={filtrosAv.tipoArquivo} onChange={(v) => { setFiltrosAv((p) => ({ ...p, tipoArquivo: v })); filtrosAvancadosRef.current.tipoArquivo = v; }}
                options={[
                  { value: 'todos', label: 'Todos os tipos' },
                  { value: 'pdf', label: 'PDF' },
                  { value: 'imagem', label: 'JPG / PNG' },
                  { value: 'word', label: 'DOC / DOCX' },
                  { value: 'excel', label: 'XLS / XLSX' },
                  { value: 'video', label: 'MP4' },
                  { value: 'audio', label: 'MP3 / OGG' },
                  { value: 'zip', label: 'ZIP / RAR' },
                ]}
              />
              <FiltroSelect label="Tamanho" value={filtrosAv.tamanho} onChange={(v) => { setFiltrosAv((p) => ({ ...p, tamanho: v })); filtrosAvancadosRef.current.tamanho = v; }}
                options={[
                  { value: 'todos', label: 'Qualquer tamanho' },
                  { value: 'menor1mb', label: 'Menor que 1 MB' },
                  { value: '1a10mb', label: 'Entre 1 MB e 10 MB' },
                  { value: 'maior10mb', label: 'Maior que 10 MB' },
                ]}
              />
            </div>
          )}

          {/* Linha 2: abas de categoria */}
          <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 2 }}>
            {[
              { key: FILTRO_TODOS, label: 'Todos', count: contagens.todos },
              { key: 'imagens', label: 'Imagens', count: contagens.imagens },
              { key: 'documentos', label: 'Documentos', count: contagens.documentos },
              { key: 'videos', label: 'Vídeos', count: contagens.videos },
              { key: 'audios', label: 'Áudios', count: contagens.audios },
              { key: 'outros', label: 'Outros', count: contagens.outros },
            ].filter((t) => t.count > 0).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFiltroAtivo(tab.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  background: filtroAtivo === tab.key ? T.primary : 'transparent',
                  color: filtroAtivo === tab.key ? '#fff' : T.textSecondary,
                  transition: 'background 0.15s',
                }}
              >
                {tab.label} {tab.count}
              </button>
            ))}
          </div>

          {/* Tags de filtros ativos */}
          {tagsFiltros.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {tagsFiltros.map((tag) => (
                <span
                  key={tag.chave}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 14, fontSize: 12, fontWeight: 500,
                    background: T.primarySoft, color: T.primaryOnSoft,
                  }}
                >
                  {tag.label}
                  <button
                    onClick={() => removerTag(tag.chave)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: T.primary, display: 'flex', padding: 0, marginLeft: 2,
                    }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
              <button
                onClick={limparFiltros}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: T.textMuted, fontSize: 12, textDecoration: 'underline', padding: '2px 4px',
                }}
              >
                Limpar filtros
              </button>
            </div>
          )}

          {/* Linha 3: controles de ordenação, agrupamento e visualização */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <FiltroSelect
                label="Ordenar"
                value={ordenacao}
                onChange={(v) => { setOrdenacao(v); handleSalvarPreferencia('ordem', v); }}
                options={[
                  { value: 'recentes', label: 'Mais recentes' },
                  { value: 'antigos', label: 'Mais antigos' },
                  { value: 'nome_az', label: 'Nome A-Z' },
                  { value: 'nome_za', label: 'Nome Z-A' },
                  { value: 'maior', label: 'Maior tamanho' },
                  { value: 'menor', label: 'Menor tamanho' },
                ]}
              />
              <FiltroSelect
                label="Agrupar"
                value={agrupamento}
                onChange={(v) => { setAgrupamento(v); handleSalvarPreferencia('agrupar', v); }}
                options={[
                  { value: 'data', label: 'Data' },
                  { value: 'tipo', label: 'Tipo' },
                  { value: 'remetente', label: 'Remetente' },
                  { value: 'nenhum', label: 'Nenhum' },
                ]}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Selecionar todos */}
              {midiasOrdenadas.length > 0 && (
                <button
                  onClick={selecionarTodos}
                  title={selecionados.size === midiasOrdenadas.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px',
                    borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent',
                    cursor: 'pointer', color: T.textSecondary, fontSize: 12, fontWeight: 500,
                  }}
                >
                  {selecionados.size === midiasOrdenadas.length ? <CheckSquare size={15} /> : <Square size={15} />}
                  {selecionados.size > 0 ? `${selecionados.size} selecionados` : 'Todos'}
                </button>
              )}
              {/* Toggle grade/lista */}
              <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                <button
                  onClick={() => { setModoExibicao('grade'); handleSalvarPreferencia('modo', 'grade'); }}
                  title="Visualização em grade"
                  style={{
                    padding: '7px 10px', border: 'none', cursor: 'pointer',
                    background: modoExibicao === 'grade' ? T.primarySoft : 'transparent',
                    color: modoExibicao === 'grade' ? T.primary : T.textMuted,
                    display: 'flex',
                  }}
                >
                  <Grid3X3 size={17} />
                </button>
                <button
                  onClick={() => { setModoExibicao('lista'); handleSalvarPreferencia('modo', 'lista'); }}
                  title="Visualização em lista"
                  style={{
                    padding: '7px 10px', border: 'none', borderLeft: `1px solid ${T.border}`, cursor: 'pointer',
                    background: modoExibicao === 'lista' ? T.primarySoft : 'transparent',
                    color: modoExibicao === 'lista' ? T.primary : T.textMuted,
                    display: 'flex',
                  }}
                >
                  <List size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Corpo: com rolagem */}
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex',
        }}>
          {/* Área principal (grade/lista) */}
          <div style={{
            flex: painelItem ? 3 : 1, minWidth: 0, transition: 'flex 0.2s',
          }}>
            {carregando ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: T.textMuted, flexDirection: 'column', gap: 10 }}>
                <Loader2 size={28} style={{ animation: 'spin 0.8s linear infinite', color: T.textMuted }} />
                <span style={{ fontSize: 13 }}>Carregando arquivos...</span>
              </div>
            ) : grupos.length === 0 || grupos.every((g) => g.itens.length === 0) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: T.textMuted, flexDirection: 'column', gap: 8, textAlign: 'center' }}>
                <FolderOpen size={40} opacity={0.4} />
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary }}>Nenhum arquivo encontrado</div>
                <div style={{ fontSize: 12.5 }}>Tente remover algum filtro ou pesquisar outro termo.</div>
              </div>
            ) : (
              <div style={{ padding: '12px 18px 24px' }}>
                {grupos.map((grupo) => (
                  <div key={grupo.chave || '__sem_grupo__'} style={{ marginBottom: 24 }}>
                    {grupo.chave && (
                      <div style={{
                        fontWeight: 700, fontSize: 13, color: T.textSecondary,
                        marginBottom: 10, paddingLeft: 2,
                      }}>
                        {grupo.chave}
                      </div>
                    )}
                    {modoExibicao === 'grade' ? (
                      <GradeMidias
                        itens={grupo.itens}
                        selecionados={selecionados}
                        painelItem={painelItem}
                        conversa={conversa}
                        onToggleSelecionado={toggleSelecionado}
                        onAbrirPainel={setPainelItem}
                        onBaixar={baixarItem}
                        onAbrirNovaAba={abrirEmNovaAba}
                        onCopiarNome={copiarNome}
                        onIrParaMensagem={onIrParaMensagem}
                        showMenuAcoes={showMenuAcoes}
                        setShowMenuAcoes={setShowMenuAcoes}
                      />
                    ) : (
                      <ListaMidias
                        itens={grupo.itens}
                        selecionados={selecionados}
                        painelItem={painelItem}
                        conversa={conversa}
                        onToggleSelecionado={toggleSelecionado}
                        onAbrirPainel={setPainelItem}
                        onBaixar={baixarItem}
                        onAbrirNovaAba={abrirEmNovaAba}
                        onCopiarNome={copiarNome}
                        onIrParaMensagem={onIrParaMensagem}
                        showMenuAcoes={showMenuAcoes}
                        setShowMenuAcoes={setShowMenuAcoes}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Painel lateral de pré-visualização */}
          {painelItem && (
            <PainelLateral
              midia={painelItem}
              conversa={conversa}
              onFechar={() => setPainelItem(null)}
              onBaixar={baixarItem}
              onAbrirNovaAba={abrirEmNovaAba}
              onIrParaMensagem={onIrParaMensagem}
              pdfPagina={pdfPagina}
              setPdfPagina={setPdfPagina}
              pdfTotal={pdfTotal}
              setPdfTotal={setPdfTotal}
            />
          )}
        </div>

        {/* Barra de seleção múltipla */}
        {selecionados.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
            borderTop: `1px solid ${T.border}`, background: T.surfaceAlt || T.surfaceMuted,
            fontSize: 13,
          }}>
            <span style={{ fontWeight: 700, color: T.text }}>
              {selecionados.size} arquivo{selecionados.size > 1 ? 's' : ''} selecionado{selecionados.size > 1 ? 's' : ''}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                midias
                  .filter((m) => selecionados.has(m.id))
                  .forEach((m) => baixarItem(m));
              }}
              style={btnSecundario}
            >
              <Download size={14} /> Baixar
            </button>
            <button onClick={() => {}} style={btnSecundario}>
              <FileArchive size={14} /> Baixar ZIP
            </button>
            <button onClick={limparSelecao} style={{ ...btnSecundario, color: T.textMuted }}>
              Limpar seleção
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function Header({ nomeContato, protocoloTexto, total, onFechar }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: T.surface,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>
          Arquivos e mídias da conversa
        </div>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>
          {nomeContato}{protocoloTexto ? ` • Protocolo ${protocoloTexto}` : ''} • {total} iten{total !== 1 ? 's' : ''}
        </div>
      </div>
      <button
        onClick={onFechar}
        aria-label="Fechar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.textMuted, display: 'flex', padding: 6, borderRadius: 8,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <X size={22} />
      </button>
    </div>
  );
}

const TIPOS_ICONES = {
  imagem: Image, video: Film, audio: Music, documento: FileText,
  outros: Paperclip,
};

function GradeMidias({ itens, selecionados, painelItem, conversa, onToggleSelecionado, onAbrirPainel, onBaixar, onAbrirNovaAba, onCopiarNome, onIrParaMensagem, showMenuAcoes, setShowMenuAcoes }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 12,
    }}>
      {itens.map((m) => (
        <CardMidia
          key={m.id}
          midia={m}
          selecionado={selecionados.has(m.id)}
          ativo={painelItem?.id === m.id}
          conversa={conversa}
          onToggleSelecionado={onToggleSelecionado}
          onClick={() => onAbrirPainel(m)}
          onBaixar={onBaixar}
          onAbrirNovaAba={onAbrirNovaAba}
          onCopiarNome={onCopiarNome}
          onIrParaMensagem={onIrParaMensagem}
          showMenuAcoes={showMenuAcoes}
          setShowMenuAcoes={setShowMenuAcoes}
        />
      ))}
    </div>
  );
}

function ListaMidias({ itens, selecionados, painelItem, conversa, onToggleSelecionado, onAbrirPainel, onBaixar, onAbrirNovaAba, onCopiarNome, onIrParaMensagem, showMenuAcoes, setShowMenuAcoes }) {
  if (itens.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', border: `1px solid ${T.border}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Cabeçalho da tabela */}
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 1fr 100px 140px 100px 80px 40px',
        gap: 8, padding: '9px 14px', background: T.surfaceAlt || T.surfaceMuted,
        fontSize: 11.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        <span></span>
        <span>Arquivo</span>
        <span>Tipo</span>
        <span>Enviado por</span>
        <span>Data</span>
        <span>Tamanho</span>
        <span></span>
      </div>
      {itens.map((m) => (
        <div
          key={m.id}
          onClick={() => onAbrirPainel(m)}
          style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 100px 140px 100px 80px 40px',
            gap: 8, padding: '10px 14px', alignItems: 'center',
            borderTop: `1px solid ${T.border}`, position: 'relative',
            background: painelItem?.id === m.id ? T.primarySoft : selecionados.has(m.id) ? (T.surfaceAlt || T.surfaceMuted) : 'transparent',
            cursor: 'pointer', transition: 'background 0.1s', fontSize: 13,
          }}
          onMouseEnter={(e) => {
            if (painelItem?.id !== m.id && !selecionados.has(m.id)) e.currentTarget.style.background = T.surfaceAlt || T.surfaceMuted;
          }}
          onMouseLeave={(e) => {
            if (painelItem?.id !== m.id && !selecionados.has(m.id)) e.currentTarget.style.background = 'transparent';
          }}
        >
          <div onClick={(e) => { e.stopPropagation(); onToggleSelecionado(m.id); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {selecionados.has(m.id) ? <CheckSquare size={17} color={T.primary} /> : <Square size={17} color={T.textMuted} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Thumbnail midia={m} tamanho={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontWeight: 600, fontSize: 13, color: T.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {m.media_nome || m.mediaNome || nomeArquivoDaUrl(m.media_url || m.mediaUrl || '')}
              </div>
              {m.conteudo && (
                <div style={{
                  fontSize: 11.5, color: T.textMuted, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1,
                }}>
                  {m.conteudo}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary }}>
            {extensaoDoMime(m.media_mime || m.mediaMime)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.textSecondary }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: 50,
              background: m.direcao === 'entrada' ? T.success : T.primary, flexShrink: 0,
            }} />
            {nomeRemetente(m, conversa)}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, whiteSpace: 'nowrap' }}>
            {formatarDataHora(m.criado_em)}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted }}>
            {formatarTamanho(m.media_tamanho) || extensaoDoMime(m.media_mime || m.mediaMime)}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <MenuAcoes
              midia={m}
              aberto={showMenuAcoes === m.id}
              onToggle={() => setShowMenuAcoes(showMenuAcoes === m.id ? null : m.id)}
              onBaixar={onBaixar}
              onAbrirNovaAba={onAbrirNovaAba}
              onCopiarNome={onCopiarNome}
              onIrParaMensagem={onIrParaMensagem}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CardMidia({ midia, selecionado, ativo, conversa, onToggleSelecionado, onClick, onBaixar, onAbrirNovaAba, onCopiarNome, onIrParaMensagem, showMenuAcoes, setShowMenuAcoes }) {
  const nome = midia.media_nome || midia.mediaNome || nomeArquivoDaUrl(midia.media_url || midia.mediaUrl || '');
  const ext = extensaoDoMime(midia.media_mime || midia.mediaMime);
  const mime = midia.media_mime || midia.mediaMime || '';
  const ref = useRef(null);

  return (
    <div
      ref={ref}
      onClick={() => onClick(midia)}
      style={{
        background: ativo ? T.primarySoft : selecionado ? (T.surfaceAlt || T.surfaceMuted) : T.surface,
        borderRadius: 12, border: `1.5px solid ${ativo ? T.primary : selecionado ? T.primarySoft : T.border}`,
        overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s',
        display: 'flex', flexDirection: 'column',
        boxShadow: ativo ? `0 0 0 2px ${T.primary}40` : 'none',
      }}
      onMouseEnter={() => { if (ref.current && !ativo && !selecionado) ref.current.style.boxShadow = T.shadowMd; }}
      onMouseLeave={() => { if (ref.current && !ativo) ref.current.style.boxShadow = 'none'; }}
    >
      {/* Miniatura */}
      <div style={{ position: 'relative', height: 140, background: T.surfaceMuted || T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Thumbnail midia={midia} tamanho={140} />
        {/* Checkbox de seleção */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelecionado(midia.id); }}
          style={{
            position: 'absolute', top: 6, left: 6,
            background: selecionado ? T.primary : 'rgba(255,255,255,0.9)',
            borderRadius: 6, padding: 2, display: 'flex', cursor: 'pointer',
            boxShadow: selecionado ? 'none' : '0 1px 4px rgba(0,0,0,0.15)',
          }}
        >
          {selecionado ? <CheckSquare size={18} color="#fff" /> : <Square size={18} color={T.textMuted} />}
        </div>
        {/* Indicador de direção */}
        <span style={{
          position: 'absolute', top: 6, right: 6,
          padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600,
          background: midia.direcao === 'entrada' ? T.successSoft : T.primarySoft,
          color: midia.direcao === 'entrada' ? T.success : T.primary,
        }}>
          {midia.direcao === 'entrada' ? 'Recebido' : 'Enviado'}
        </span>
        {/* Menu três pontos */}
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 6, right: 6 }}>
          <MenuAcoes
            midia={midia}
            aberto={showMenuAcoes === midia.id}
            onToggle={() => setShowMenuAcoes(showMenuAcoes === midia.id ? null : midia.id)}
            onBaixar={onBaixar}
            onAbrirNovaAba={onAbrirNovaAba}
            onCopiarNome={onCopiarNome}
            onIrParaMensagem={onIrParaMensagem}
          />
        </div>
      </div>
      {/* Informações */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          fontWeight: 600, fontSize: 12.5, color: T.text,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', lineHeight: 1.35,
        }} title={nome}>
          {nome}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textMuted }}>
          <span style={{ fontWeight: 500, color: T.textSecondary }}>{ext}</span>
          <span style={{ color: T.border }}>•</span>
          <span>{formatarTamanho(midia.media_tamanho) || formatoArquivo(mime)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.textMuted }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: 50,
            background: midia.direcao === 'entrada' ? T.success : T.primary, flexShrink: 0,
          }} />
          {nomeRemetente(midia, conversa)}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          {new Date(midia.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          {' às '}
          {new Date(midia.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

function Thumbnail({ midia, tamanho }) {
  const url = urlVisualizavel(midia.media_url || midia.mediaUrl);
  const mime = (midia.media_mime || midia.mediaMime || '').toLowerCase();
  const ehImagem = mime.startsWith('image/');
  const ehVideo = mime.startsWith('video/');
  const ehAudio = mime.startsWith('audio/');
  const ehPdf = mime.includes('pdf');

  if (ehImagem) {
    return (
      <img
        src={url} alt="" loading="lazy"
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          maxHeight: tamanho,
        }}
      />
    );
  }

  if (ehVideo) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 6,
      }}>
        <Film size={tamanho > 60 ? 36 : 20} color={T.textMuted} />
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Vídeo</span>
      </div>
    );
  }

  if (ehAudio) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 6,
      }}>
        <Music size={tamanho > 60 ? 36 : 20} color={T.textMuted} />
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Áudio</span>
      </div>
    );
  }

  if (ehPdf) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 6,
        background: '#fef2f2',
      }}>
        <FileText size={tamanho > 60 ? 36 : 20} color="#dc2626" />
        <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>PDF</span>
      </div>
    );
  }

  const TipoIcone = TIPOS_ICONES[classificarMidia(mime)] || TIPOS_ICONES.outros;

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 6,
    }}>
      <TipoIcone size={tamanho > 60 ? 36 : 20} color={T.textMuted} />
      <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>
        {formatoArquivo(mime) || 'Arquivo'}
      </span>
    </div>
  );
}

function MenuAcoes({ midia, aberto, onToggle, onBaixar, onAbrirNovaAba, onCopiarNome, onIrParaMensagem }) {
  if (!aberto) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{
          background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 6,
          cursor: 'pointer', display: 'flex', padding: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
        title="Mais ações"
      >
        <MoreVertical size={14} color={T.textSecondary} />
      </button>
    );
  }

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 12.5, color: T.text, width: '100%', textAlign: 'left',
    borderRadius: 6, transition: 'background 0.1s',
  };

  const fechar = () => onToggle();

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', right: 0, top: 28, zIndex: 200,
        background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`,
        boxShadow: T.shadowMd, minWidth: 200, padding: 6, display: 'flex',
        flexDirection: 'column', gap: 2,
      }}
    >
      <button
        style={itemStyle}
        onClick={() => { fechar(); onBaixar(midia); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Download size={14} /> Baixar arquivo
      </button>
      <button
        style={itemStyle}
        onClick={() => { fechar(); onAbrirNovaAba(midia); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <ExternalLink size={14} /> Abrir em nova aba
      </button>
      <button
        style={itemStyle}
        onClick={() => { fechar(); onIrParaMensagem?.(midia); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <MessageSquare size={14} /> Ir para mensagem original
      </button>
      <button
        style={itemStyle}
        onClick={() => { fechar(); onCopiarNome(midia); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceMuted || T.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Copy size={14} /> Copiar nome do arquivo
      </button>
    </div>
  );
}

function PainelLateral({ midia, conversa, onFechar, onBaixar, onAbrirNovaAba, onIrParaMensagem, pdfPagina, setPdfPagina, pdfTotal, setPdfTotal }) {
  const url = urlVisualizavel(midia.media_url || midia.mediaUrl);
  const mime = (midia.media_mime || midia.mediaMime || '').toLowerCase();
  const nome = midia.media_nome || midia.mediaNome || nomeArquivoDaUrl(url);
  const ehImagem = mime.startsWith('image/');
  const ehVideo = mime.startsWith('video/');
  const ehAudio = mime.startsWith('audio/');
  const ehPdf = mime.includes('pdf');

  return (
    <div style={{
      width: 380, minWidth: 320, borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', background: T.surface,
      overflow: 'hidden',
    }}>
      {/* Cabeçalho do painel */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Pré-visualização</span>
        <button
          onClick={onFechar}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.textMuted, display: 'flex', padding: 4, borderRadius: 6,
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Área de visualização */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: T.surfaceMuted || T.surfaceAlt, position: 'relative',
          borderBottom: `1px solid ${T.border}`,
        }}>
          {ehImagem && (
            <img
              src={url} alt={nome}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }}
            />
          )}
          {ehVideo && (
            <video
              src={url} controls
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            />
          )}
          {ehAudio && (
            <div style={{ textAlign: 'center' }}>
              <Music size={48} color={T.textMuted} />
              <div style={{ marginTop: 12 }}>
                <audio src={url} controls style={{ maxWidth: 280 }} />
              </div>
            </div>
          )}
          {ehPdf && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <iframe
                src={`${url}#page=${pdfPagina}`}
                title={nome}
                style={{ flex: 1, border: 'none', background: '#fff' }}
              />
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: '6px 12px', borderTop: `1px solid ${T.border}`,
                fontSize: 12, color: T.textSecondary,
              }}>
                <button
                  onClick={() => setPdfPagina(Math.max(1, pdfPagina - 1))}
                  disabled={pdfPagina <= 1}
                  style={btnPequeno}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>Página {pdfPagina}{pdfTotal ? ` de ${pdfTotal}` : ''}</span>
                <button
                  onClick={() => setPdfPagina(pdfPagina + 1)}
                  style={btnPequeno}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
          {!ehImagem && !ehVideo && !ehAudio && !ehPdf && (
            <Thumbnail midia={midia} tamanho={260} />
          )}
        </div>

        {/* Metadados */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.text, wordBreak: 'break-word' }}>
            {nome}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, color: T.textMuted }}>
            <span style={{ fontWeight: 500, color: T.textSecondary }}>{extensaoDoMime(mime)}</span>
            <span>•</span>
            <span>{formatarTamanho(midia.media_tamanho) || formatoArquivo(mime)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: 50,
              background: midia.direcao === 'entrada' ? T.success : T.primary,
            }} />
            {nomeRemetente(midia, conversa)}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted }}>
            {new Date(midia.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          {midia.conteudo && (
            <div style={{
              fontSize: 12, color: T.textMuted, lineHeight: 1.5,
              background: T.surfaceMuted || T.surfaceAlt, padding: '8px 12px',
              borderRadius: 8, borderLeft: `3px solid ${T.border}`,
            }}>
              {midia.conteudo}
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            onClick={() => onAbrirNovaAba(midia)}
            style={{
              ...btnPrimario, flex: 1, minWidth: 100,
            }}
          >
            <ExternalLink size={14} /> Abrir
          </button>
          <button
            onClick={() => onBaixar(midia)}
            style={{ ...btnSecundario, flex: 1, minWidth: 100 }}
          >
            <Download size={14} /> Baixar
          </button>
          {onIrParaMensagem && (
            <button
              onClick={() => onIrParaMensagem(midia)}
              style={{ ...btnSecundario, flex: 1, minWidth: 100 }}
            >
              <MessageSquare size={14} /> Localizar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FiltroSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
          background: T.surface, color: T.text, fontSize: 13, outline: 'none',
          cursor: 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// Estilos reutilizáveis para botões
const btnPrimario = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 16px', borderRadius: 9, border: 'none',
  background: T.primary, color: '#fff', cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
};

const btnSecundario = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 9, border: `1px solid ${T.border}`,
  background: 'transparent', color: T.textSecondary, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 500,
};

const btnPequeno = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 4, borderRadius: 6, border: `1px solid ${T.border}`,
  background: 'transparent', cursor: 'pointer', color: T.textSecondary,
};
