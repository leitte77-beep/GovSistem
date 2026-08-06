import {
  FileBarChart2, FileDown, FileSpreadsheet, FileText, Search, Star, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, baixar } from '../api/cliente';
import { Carregando, Chip, ErroEstado } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { RelatorioCatalogo } from '../types';

const FAVS_KEY = 'relatorios.favoritos';

export function Relatorios() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [catalogo, setCatalogo] = useState<RelatorioCatalogo[] | null>(null);
  const [erro, setErro] = useState('');
  const [ativo, setAtivo] = useState<RelatorioCatalogo | null>(null);
  const [resultado, setResultado] = useState<{ colunas: string[]; linhas: (string | number)[][]; titulo: string } | null>(null);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [termo, setTermo] = useState('');
  const [favoritos, setFavoritos] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch { return []; }
  });
  const [recentes, setRecentes] = useState<{ chave: string; titulo: string; formato: string; quando: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('relatorios.recentes') || '[]'); } catch { return []; }
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.get<RelatorioCatalogo[]>('/relatorios').then(setCatalogo).catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { localStorage.setItem(FAVS_KEY, JSON.stringify(favoritos)); }, [favoritos]);
  useEffect(() => { localStorage.setItem('relatorios.recentes', JSON.stringify(recentes.slice(0, 5))); }, [recentes]);

  const filtrados = useMemo(() => {
    if (!catalogo) return [];
    if (!termo) return catalogo;
    const t = termo.toLowerCase();
    return catalogo.filter((r) => r.titulo.toLowerCase().includes(t) || r.chave.toLowerCase().includes(t) || r.area.toLowerCase().includes(t));
  }, [catalogo, termo]);

  const favLista = useMemo(() => filtrados.filter((r) => favoritos.includes(r.chave)), [filtrados, favoritos]);

  function toggleFavorito(chave: string) {
    setFavoritos((prev) => prev.includes(chave) ? prev.filter((f) => f !== chave) : [...prev, chave]);
  }

  async function executar(relatorio: RelatorioCatalogo) {
    setCarregando(true);
    setAtivo(relatorio);
    try {
      const p = new URLSearchParams();
      if (inicio) p.set('inicio', inicio);
      if (fim) p.set('fim', fim);
      const resposta = await api.get<any>(`/relatorios/${relatorio.chave}${p.toString() ? `?${p.toString()}` : ''}`);
      setResultado(resposta);
    } catch (e: any) { avisar('erro', e.message); setAtivo(null); }
    finally { setCarregando(false); }
  }

  async function exportar(formato: 'csv' | 'xlsx' | 'pdf') {
    if (!ativo) return;
    const p = new URLSearchParams({ formato });
    if (inicio) p.set('inicio', inicio);
    if (fim) p.set('fim', fim);
    try {
      await baixar(`/relatorios/${ativo.chave}?${p.toString()}`, `${ativo.chave}.${formato === 'csv' ? 'csv' : formato === 'xlsx' ? 'xlsx' : 'pdf'}`);
      avisar('sucesso', 'Exportação iniciada.');
      setRecentes((prev) => [{ chave: ativo.chave, titulo: ativo.titulo, formato, quando: new Date().toISOString() }, ...prev]);
    } catch (e: any) { avisar('erro', e.message); }
  }

  if (erro) return <ErroEstado mensagem={erro} tentar={() => window.location.reload()} />;
  if (!catalogo) return <Carregando />;

  return (
    <div>
      <header className="config-cabecalho">
        <div>
          <h1>Relatórios</h1>
          <p>Indicadores, gráficos e exportações da Secretaria de Infraestrutura.</p>
        </div>
        <div className="config-cabecalho-busca">
          <Search size={16} />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Pesquisar relatório…" />
          {termo && <button className="config-busca-limpar" onClick={() => setTermo('')}><X size={13} /></button>}
        </div>
      </header>

      {/* ── Favoritos ─────────────────────────────────────────────────── */}
      {favLista.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cinza-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            <Star size={12} /> Favoritos
          </div>
          <div className="relatorios-favoritos">
            {favLista.map((r) => (
              <button key={r.chave} className="relatorio-favorito" onClick={() => executar(r)}>
                <Star size={12} fill="#eab308" color="#eab308" /> {r.titulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Filtros de período ──────────────────────────────────────────── */}
      <div className="relatorios-toolbar">
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} placeholder="Início" title="Data inicial" />
        <span style={{ color: 'var(--cinza-500)', fontSize: 13 }}>até</span>
        <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} placeholder="Fim" title="Data final" />
        <button
          className="botao pequeno"
          onClick={() => { if (ativo) executar(ativo); }}
          title="Executar novamente com as novas datas"
        >
          <Search size={13} /> Aplicar datas
        </button>
        {(inicio || fim) && (
          <button className="botao pequeno sutil" onClick={() => { setInicio(''); setFim(''); }}>Limpar datas</button>
        )}
      </div>

      {/* ── Catálogo ────────────────────────────────────────────────────── */}
      <div className="relatorios-grade">
        {filtrados.map((r) => (
          <button
            key={r.chave}
            className={`relatorio-card ${ativo?.chave === r.chave ? 'ativo' : ''}`}
            type="button"
            onClick={() => executar(r)}
          >
            <div className="relatorio-card-icone"><FileBarChart2 size={22} /></div>
            <div className="relatorio-card-titulo">{r.titulo}</div>
            <div className="relatorio-card-meta">
              <span>{r.area}</span>
              <span>{r.formatos.join(', ')}</span>
            </div>
            <button
              className={`relatorio-card-favorito ${favoritos.includes(r.chave) ? 'fav' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleFavorito(r.chave); }}
              title={favoritos.includes(r.chave) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              <Star size={14} fill={favoritos.includes(r.chave) ? '#eab308' : 'none'} />
            </button>
          </button>
        ))}
      </div>

      {/* ── Resultado ───────────────────────────────────────────────────── */}
      {carregando && <Carregando texto="Gerando relatório…" />}
      {ativo && resultado && (
        <section className="secao-painel">
          <div className="relatorios-preview-toolbar">
            <h2>{resultado.titulo || ativo.titulo}</h2>
            {pode('govinfra.relatorios.exportar') && (
              <div className="barra-acoes">
                <button className="botao" onClick={() => exportar('csv')}><FileSpreadsheet size={14} /> CSV</button>
                <button className="botao" onClick={() => exportar('xlsx')}><FileSpreadsheet size={14} /> Excel</button>
                <button className="botao" onClick={() => exportar('pdf')}><FileText size={14} /> PDF</button>
              </div>
            )}
          </div>
          {resultado.linhas.length === 0 ? (
            <p className="texto-sutil">Nenhum registro para o período selecionado.</p>
          ) : (
            <div className="tabela-envolve">
              <table className="tabela">
                <thead>
                  <tr>{(resultado.colunas || []).map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {resultado.linhas.map((linha, i) => (
                    <tr key={i}>{linha.map((celula, j) => <td key={j}>{String(celula ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="texto-sutil margem-topo">
            {resultado.linhas.length} registro(s). <Chip cor="cinza"><FileDown size={12} /> Exportação registrada na auditoria</Chip>
          </p>
        </section>
      )}

      {/* ── Exportações recentes ─────────────────────────────────────────── */}
      {recentes.length > 0 && (
        <section className="secao-painel">
          <h2>Exportações recentes</h2>
          <div className="relatorios-recentes-lista">
            {recentes.map((r, i) => (
              <div key={i} className="relatorio-recente-item">
                <FileDown size={13} />
                <span>{r.titulo}</span>
                <Chip cor="cinza">{r.formato.toUpperCase()}</Chip>
                <small style={{ marginLeft: 'auto', color: 'var(--cinza-400)' }}>
                  {new Date(r.quando).toLocaleDateString('pt-BR')}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
