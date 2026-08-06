import {
  AlertTriangle, ArrowRight, Calendar, ChevronLeft, Columns2, ExternalLink,
  HardHat, Hash, LayoutGrid, List, MapPin, Package, PanelRightClose, Plus,
  RefreshCw, RotateCw, Search, SlidersHorizontal, User, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Paginacao, Vazio } from '../componentes/Comuns';
import { useSessao } from '../contexto/SessaoContexto';
import type { Dashboard, Paginado, RegistroAuditoria, SolicitacaoCacamba } from '../types';
import { corSituacao, formatarData, formatarDataHora, rotuloSituacao } from '../utils';

/* ── Constantes ─────────────────────────────────────────────────────────── */

const POR_PAGINA = 15;
const POR_PAGINA_KANBAN = 50;
const POR_PAGINA_SUGESTOES = 6;

const SITUACOES = [
  'rascunho', 'pendente', 'em_analise', 'aguardando_documentos', 'aprovada', 'reprovada',
  'aguardando_agendamento', 'agendada', 'aguardando_entrega', 'em_transporte', 'em_uso',
  'aguardando_retirada', 'em_retirada', 'concluida', 'cancelada',
];

const COLUNAS_KANBAN = [
  { chave: 'pendentes', titulo: 'Pendentes', situacoes: ['rascunho', 'pendente'], corBarra: 'coluna-amarelo' },
  { chave: 'em_analise', titulo: 'Em Análise', situacoes: ['em_analise', 'aguardando_documentos'], corBarra: 'coluna-roxo' },
  { chave: 'aprovadas', titulo: 'Aprov./Agend.', situacoes: ['aprovada', 'aguardando_agendamento', 'agendada'], corBarra: 'coluna-azul' },
  { chave: 'execucao', titulo: 'Em Execução', situacoes: ['aguardando_entrega', 'em_transporte', 'em_uso'], corBarra: 'coluna-laranja' },
  { chave: 'retirada', titulo: 'Retirada', situacoes: ['aguardando_retirada', 'em_retirada'], corBarra: 'coluna-amarelo' },
  { chave: 'finalizadas', titulo: 'Finalizadas', situacoes: ['concluida', 'cancelada', 'reprovada'], corBarra: 'coluna-verde' },
];

const CHIPS_RAPIDOS = [
  { chave: '', rotulo: 'Todas' },
  { chave: 'pendente', rotulo: 'Pendentes' },
  { chave: 'aprovada', rotulo: 'Aprovadas' },
  { chave: 'agendada', rotulo: 'Agendadas' },
  { chave: 'em_transporte', rotulo: 'Em rota' },
  { chave: 'em_uso', rotulo: 'Instaladas' },
  { chave: 'aguardando_retirada', rotulo: 'Retirada pend.' },
  { chave: 'concluida', rotulo: 'Concluídas' },
  { chave: 'cancelada', rotulo: 'Canceladas' },
];

type ModoVisualizacao = 'cards' | 'tabela' | 'kanban';

function salvarPreferencia(modo: ModoVisualizacao) {
  try { localStorage.setItem('govinfra.solicitacoes.modo', modo); } catch { /* noop */ }
}
function carregarPreferencia(): ModoVisualizacao {
  try { return (localStorage.getItem('govinfra.solicitacoes.modo') as ModoVisualizacao) || 'cards'; } catch { return 'cards'; }
}

/* ── Componente principal ───────────────────────────────────────────────── */

export function Solicitacoes() {
  const { pode } = useSessao();
  const navegar = useNavigate();
  const [params] = useSearchParams();

  /* estado da lista */
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState(params.get('situacao') || '');
  const [apenasAtrasadas, setApenasAtrasadas] = useState(params.get('atrasadas') === '1');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<SolicitacaoCacamba> | null>(null);
  const [erro, setErro] = useState('');

  /* kanban */
  const [dadosKanban, setDadosKanban] = useState<SolicitacaoCacamba[] | null>(null);

  /* dashboard */
  const [painel, setPainel] = useState<Dashboard | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  /* visualização */
  const [modo, setModo] = useState<ModoVisualizacao>(carregarPreferencia);

  /* busca premium */
  const [sugestoes, setSugestoes] = useState<SolicitacaoCacamba[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);
  const inputBuscaRef = useRef<HTMLInputElement>(null);
  const sugestoesRef = useRef<HTMLDivElement>(null);

  /* painel lateral */
  const [painelId, setPainelId] = useState<string | null>(null);

  /* filtros avançados (data) */
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mostrarAvancados, setMostrarAvancados] = useState(false);

  /* ── Chamadas à API ─────────────────────────────────────────────── */

  const carregarLista = useCallback((pag: number) => {
    setErro('');
    const q = new URLSearchParams({ pagina: String(pag), por_pagina: String(POR_PAGINA) });
    if (termo) q.set('termo', termo);
    if (situacao) q.set('situacao', situacao);
    if (apenasAtrasadas) q.set('atrasadas', '1');
    if (dataInicio) q.set('data_inicio', dataInicio);
    if (dataFim) q.set('data_fim', dataFim);
    api.get<Paginado<SolicitacaoCacamba>>(`/solicitacoes?${q.toString()}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [termo, situacao, apenasAtrasadas, dataInicio, dataFim]);

  const carregarPainel = useCallback(() => {
    setAtualizando(true);
    api.get<Dashboard>('/dashboard?dias=7')
      .then(setPainel)
      .catch(() => {})
      .finally(() => setAtualizando(false));
  }, []);

  const carregarKanban = useCallback(() => {
    api.get<Paginado<SolicitacaoCacamba>>(`/solicitacoes?pagina=1&por_pagina=${POR_PAGINA_KANBAN}`)
      .then((r) => setDadosKanban(r.itens))
      .catch(() => setDadosKanban([]));
  }, []);

  /* ── Efeitos ────────────────────────────────────────────────────── */

  useEffect(() => { carregarLista(1); /* eslint-disable-next-line */ }, []);
  useEffect(() => { carregarPainel(); }, [carregarPainel]);

  /* sugestões da busca (independente da lista principal) */
  useEffect(() => {
    if (termo.length < 2) { setSugestoes([]); return; }
    setCarregandoSugestoes(true);
    const timer = setTimeout(() => {
      api.get<Paginado<SolicitacaoCacamba>>(`/solicitacoes?pagina=1&por_pagina=${POR_PAGINA_SUGESTOES}&termo=${encodeURIComponent(termo)}`)
        .then((r) => setSugestoes(r.itens))
        .catch(() => setSugestoes([]))
        .finally(() => setCarregandoSugestoes(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [termo]);

  /* debounce da lista principal */
  const timerLista = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timerLista.current);
    timerLista.current = setTimeout(() => { setPagina(1); carregarLista(1); }, 400);
    return () => clearTimeout(timerLista.current);
  }, [termo, situacao, apenasAtrasadas, dataInicio, dataFim, carregarLista]);

  /* auto-refresh do painel */
  useEffect(() => {
    const id = setInterval(carregarPainel, 60000);
    return () => clearInterval(id);
  }, [carregarPainel]);

  /* carrega kanban ao trocar para esse modo */
  useEffect(() => {
    if (modo === 'kanban' && !dadosKanban) carregarKanban();
  }, [modo, dadosKanban, carregarKanban]);

  /* atalho ⌘K / Ctrl+K */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputBuscaRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* fecha sugestões ao clicar fora */
  useEffect(() => {
    function cliqueFora(e: MouseEvent) {
      if (sugestoesRef.current && !sugestoesRef.current.contains(e.target as Node) &&
          inputBuscaRef.current && !inputBuscaRef.current.contains(e.target as Node)) {
        setMostrarSugestoes(false);
      }
    }
    document.addEventListener('mousedown', cliqueFora);
    return () => document.removeEventListener('mousedown', cliqueFora);
  }, []);

  /* ── Ações ──────────────────────────────────────────────────────── */

  function mudarModo(novo: ModoVisualizacao) { setModo(novo); salvarPreferencia(novo); }

  function mudarSituacaoChip(chave: string) { setSituacao(chave); setPagina(1); }

  function abrirPainel(id: string) { setPainelId(id); }
  function fecharPainel() { setPainelId(null); }

  function limparFiltros() { setTermo(''); setSituacao(''); setApenasAtrasadas(false); setDataInicio(''); setDataFim(''); }

  function navegarSugestao(id: string) {
    setMostrarSugestoes(false);
    navegar(`/govinfra/solicitacoes/${id}`);
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  const c = painel?.cacambas;

  return <div>
    {/* Cabeçalho */}
    <CabecalhoPagina
      titulo="Solicitações de caçamba"
      descricao="Central de operações — visualize, filtre e gerencie todas as solicitações."
      acoes={pode('govinfra.solicitacoes.criar') && (
        <button className="botao principal" onClick={() => navegar('/govinfra/solicitacoes/nova')}>
          <Plus size={17}/> Nova solicitação
        </button>
      )}
    />

    {/* ── 1. Barra de indicadores ─────────────────────────────────── */}
    {painel && c && (
      <div className="solicitacoes-stats">
        <div className="stat-item"><span className="stat-valor">{c.entregas_hoje}</span><span className="stat-rotulo">Entregas hoje</span></div>
        <div className="stat-item"><span className="stat-valor">{c.retiradas_hoje}</span><span className="stat-rotulo">Retiradas hoje</span></div>
        <div className="stat-item"><span className="stat-valor">{c.solicitacoes_pendentes}</span><span className="stat-rotulo">Pendentes</span></div>
        <div className="stat-item"><span className="stat-valor">{c.em_uso}</span><span className="stat-rotulo">Em uso</span></div>
        <div className="stat-item"><span className="stat-valor">{c.atrasadas}</span><span className="stat-rotulo">Atrasadas</span></div>
        <div className="stat-item destaque-verde"><span className="stat-valor">{c.disponiveis}</span><span className="stat-rotulo">Disponíveis</span></div>
        <div className="stat-item"><span className="stat-valor">{c.em_manutencao}</span><span className="stat-rotulo">Manutenção</span></div>
        <div className="stat-item destaque-laranja"><span className="stat-valor">{dados?.total ?? '—'}</span><span className="stat-rotulo">Total cadastradas</span></div>
        <button className="stat-refresh" onClick={carregarPainel} title="Atualizar indicadores" disabled={atualizando}>
          <RotateCw size={14} className={atualizando ? 'giro' : ''}/>
        </button>
      </div>
    )}

    {/* ── 2. Busca premium ────────────────────────────────────────── */}
    <div className="busca-premium-envolve">
      <div className="busca-premium">
        <Search size={20}/>
        <input
          ref={inputBuscaRef}
          value={termo}
          onChange={(e) => { setTermo(e.target.value); setMostrarSugestoes(true); }}
          onFocus={() => { if (termo.length >= 2) setMostrarSugestoes(true); }}
          placeholder="Pesquise por cidadão, CPF, telefone, endereço, bairro, protocolo ou nº da caçamba…"
          aria-label="Pesquisar solicitações"
        />
        {termo && (
          <button className="busca-limpar" onClick={() => setTermo('')} aria-label="Limpar busca"><X size={16}/></button>
        )}
        <kbd className="busca-atalho">⌘K</kbd>
      </div>

      {mostrarSugestoes && termo.length >= 2 && (
        <div className="busca-sugestoes" ref={sugestoesRef}>
          {carregandoSugestoes && <div className="busca-sugestao-vazia">Pesquisando…</div>}
          {!carregandoSugestoes && sugestoes.length === 0 && (
            <div className="busca-sugestao-vazia">Nenhum resultado para "<strong>{termo}</strong>"</div>
          )}
          {!carregandoSugestoes && sugestoes.map((s) => (
            <button key={s.id} className="busca-sugestao-item" onClick={() => navegarSugestao(s.id)}>
              <div className="busca-sugestao-principal">
                <Hash size={13}/> <strong>{s.protocolo_formatado}</strong>
                {s.atrasada
                  ? <Chip cor="vermelho"><AlertTriangle size={10}/> Atrasada {s.dias_atraso}d</Chip>
                  : <Chip cor={corSituacao(s.situacao)}>{s.situacao_rotulo}</Chip>}
              </div>
              <div className="busca-sugestao-secundaria">
                <span><User size={11}/> {s.solicitante || '—'}</span>
                <span><MapPin size={11}/> {s.bairro || '—'}</span>
                {s.cacamba_codigo && <span><HardHat size={11}/> {s.cacamba_codigo}</span>}
              </div>
            </button>
          ))}
          {!carregandoSugestoes && sugestoes.length > 0 && (
            <div className="busca-sugestao-rodape">
              <span>Pressione <kbd>Enter</kbd> para ver todos os resultados</span>
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── 3. Chips de filtro rápido ────────────────────────────────── */}
    <div className="solicitacoes-chips">
      {CHIPS_RAPIDOS.map((chip) => (
        <button
          key={chip.chave}
          className={`chip-filtro ${situacao === chip.chave ? 'ativo' : ''}`}
          onClick={() => mudarSituacaoChip(chip.chave)}
        >
          {chip.rotulo}
        </button>
      ))}
      <button
        className={`chip-filtro ${apenasAtrasadas ? 'ativo vermelho' : ''}`}
        onClick={() => { setApenasAtrasadas(!apenasAtrasadas); setPagina(1); }}
      >
        <AlertTriangle size={13}/> {apenasAtrasadas ? 'Atrasadas ✓' : 'Atrasadas'}
      </button>
    </div>

    {/* ── 4. Filtros inline ────────────────────────────────────────── */}
    <div className="solicitacoes-filtros-inline">
      <div className="filtros-grupo">
        <div className="filtro-item">
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            {SITUACOES.map((s) => <option key={s} value={s}>{rotuloSituacao('solicitacao', s)}</option>)}
          </select>
        </div>
        <button
          className={`botao pequeno sutil ${mostrarAvancados ? 'selecionado' : ''}`}
          onClick={() => setMostrarAvancados(!mostrarAvancados)}
        >
          <SlidersHorizontal size={14}/> {mostrarAvancados ? 'Menos filtros' : 'Mais filtros'}
        </button>
      </div>
      <div className="filtros-grupo direita">
        {(termo || situacao || apenasAtrasadas || dataInicio) && (
          <button className="botao pequeno sutil" onClick={limparFiltros}>
            <X size={14}/> Limpar filtros
          </button>
        )}
        <span className="toolbar-contador">{dados?.total ?? '—'} resultado(s)</span>
        <div className="alternador-visualizacao">
          <button className={modo === 'cards' ? 'ativo' : ''} onClick={() => mudarModo('cards')} title="Cards" aria-label="Cards"><LayoutGrid size={15}/></button>
          <button className={modo === 'tabela' ? 'ativo' : ''} onClick={() => mudarModo('tabela')} title="Tabela" aria-label="Tabela"><List size={15}/></button>
          <button className={modo === 'kanban' ? 'ativo' : ''} onClick={() => mudarModo('kanban')} title="Kanban" aria-label="Kanban"><Columns2 size={15}/></button>
        </div>
      </div>
    </div>

    {/* Filtros de data expandíveis */}
    {mostrarAvancados && (
      <div className="filtros-data-expand">
        <div className="filtro-data-item">
          <label>Data início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}/>
        </div>
        <div className="filtro-data-item">
          <label>Data fim</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}/>
        </div>
        <label className="camada-toggle filtro-data-toggle">
          <input type="checkbox" checked={apenasAtrasadas} onChange={(e) => setApenasAtrasadas(e.target.checked)}/>
          Somente atrasadas
        </label>
      </div>
    )}

    {/* ── 5. Conteúdo ──────────────────────────────────────────────── */}

    {erro && <ErroEstado mensagem={erro} tentar={() => carregarLista(1)}/>}

    {!dados && !erro && modo !== 'kanban' && (
      <div className="solicitacoes-skeleton">
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="esqueleto" style={{width:'60%',height:16}}/>
            <div className="esqueleto" style={{width:'40%',height:14}}/>
            <div className="esqueleto" style={{width:'80%',height:14}}/>
            <div className="esqueleto" style={{width:'50%',height:14}}/>
          </div>
        ))}
      </div>
    )}

    {dados && dados.total === 0 && (
      <Vazio
        titulo="Nenhuma solicitação encontrada"
        texto={termo || situacao || apenasAtrasadas || dataInicio
          ? 'Tente ajustar os filtros ou limpar a busca.'
          : 'Comece criando a primeira solicitação de caçamba.'}
        acao={<>
          <button className="botao principal" onClick={() => navegar('/govinfra/solicitacoes/nova')}><Plus size={16}/> Criar solicitação</button>
          {(termo || situacao || apenasAtrasadas) && (
            <button className="botao" onClick={limparFiltros}><RotateCw size={14}/> Limpar filtros</button>
          )}
        </>}
      />
    )}

    {dados && dados.total > 0 && <>
      {modo === 'tabela' && <VisaoTabela dados={dados} navegar={navegar} abrirPainel={abrirPainel} />}
      {modo === 'cards' && <VisaoCards dados={dados} navegar={navegar} abrirPainel={abrirPainel} modo={modo} setModo={mudarModo} />}
      {modo === 'kanban' && <VisaoKanban dadosKanban={dadosKanban} navegar={navegar} abrirPainel={abrirPainel} recarregar={carregarKanban} />}
      {modo !== 'kanban' && (
        <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregarLista(p); }}/>
      )}
    </>}

    {/* ── Painel lateral ────────────────────────────────────────────── */}
    {painelId && <PainelDetalhe id={painelId} fechar={fecharPainel} navegar={navegar} />}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub‑componentes
   ═══════════════════════════════════════════════════════════════════════════ */

function VisaoTabela({ dados, navegar, abrirPainel }: {
  dados: Paginado<SolicitacaoCacamba>; navegar: (url: string) => void; abrirPainel: (id: string) => void;
}) {
  return (
    <div className="tabela-envolve">
      <table className="tabela tabela-clicavel">
        <thead><tr><th>Protocolo</th><th>Solicitante</th><th>Endereço</th><th>Caçamba</th><th>Entrega</th><th>Retirada</th><th>Situação</th><th></th></tr></thead>
        <tbody>{dados.itens.map((s) => (
          <tr key={s.id} onClick={() => navegar(`/govinfra/solicitacoes/${s.id}`)}>
            <td><strong>{s.protocolo_formatado}</strong></td>
            <td>{s.solicitante || '—'}</td>
            <td>{[s.logradouro, s.bairro].filter(Boolean).join(', ') || '—'}</td>
            <td>{s.cacamba_codigo || '—'}</td>
            <td>{formatarData(s.data_prevista_entrega)}</td>
            <td>{formatarData(s.data_prevista_retirada)}</td>
            <td>{s.atrasada
              ? <Chip cor="vermelho"><AlertTriangle size={12}/> Atrasada {s.dias_atraso}d</Chip>
              : <Chip cor={corSituacao(s.situacao)}>{s.situacao_rotulo}</Chip>}</td>
            <td onClick={(e) => { e.stopPropagation(); abrirPainel(s.id); }}>
              <button className="botao sutil icone pequeno" title="Abrir painel rápido"><PanelRightClose size={14}/></button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function VisaoCards({ dados, navegar, abrirPainel, modo, setModo }: {
  dados: Paginado<SolicitacaoCacamba>; navegar: (url: string) => void; abrirPainel: (id: string) => void;
  modo: string; setModo: (m: ModoVisualizacao) => void;
}) {
  return (
    <div className="solicitacoes-grade">
      {dados.itens.map((s) => (
        <article key={s.id} className="cartao-solicitacao" tabIndex={0} role="button"
          aria-label={`Solicitação ${s.protocolo_formatado}`}
          onClick={() => navegar(`/govinfra/solicitacoes/${s.id}`)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navegar(`/govinfra/solicitacoes/${s.id}`); }}}
        >
          <header className="cartao-solicitacao-cabecalho">
            <span className="cartao-protocolo"><Hash size={14}/> {s.protocolo_formatado}</span>
            {s.atrasada
              ? <Chip cor="vermelho"><AlertTriangle size={12}/> Atrasada {s.dias_atraso}d</Chip>
              : <Chip cor={corSituacao(s.situacao)}>{s.situacao_rotulo}</Chip>}
          </header>
          <div className="cartao-solicitacao-corpo">
            <div className="cartao-linha"><User size={15}/><span>{s.solicitante || '—'}</span></div>
            <div className="cartao-linha"><MapPin size={15}/><span>{[s.logradouro, s.bairro].filter(Boolean).join(', ') || '—'}</span></div>
            <div className="cartao-linha"><Package size={15}/><span>{s.cacamba_codigo || 'Sem caçamba'}</span></div>
            <div className="cartao-linha"><Calendar size={15}/><span>{formatarData(s.data_prevista_entrega)} &rarr; {formatarData(s.data_prevista_retirada)}</span></div>
          </div>
          <footer className="cartao-solicitacao-rodape">
            <span className="ver-detalhes">Ver detalhes <ArrowRight size={14}/></span>
            <button className="botao sutil icone pequeno" onClick={(e) => { e.stopPropagation(); abrirPainel(s.id); }} title="Abrir painel rápido">
              <PanelRightClose size={14}/>
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function VisaoKanban({ dadosKanban, navegar, abrirPainel, recarregar }: {
  dadosKanban: SolicitacaoCacamba[] | null; navegar: (url: string) => void; abrirPainel: (id: string) => void; recarregar: () => void;
}) {
  if (!dadosKanban) return <Carregando texto="Carregando colunas…"/>;

  const agrupado = COLUNAS_KANBAN.map((col) => ({
    ...col,
    itens: dadosKanban.filter((s) => col.situacoes.includes(s.situacao)),
  }));

  return (
    <div className="kanban-envolve">
      <div className="kanban-barra">
        <span className="kanban-titulo">Quadro Kanban</span>
        <button className="botao sutil pequeno" onClick={recarregar}><RefreshCw size={14}/> Atualizar</button>
        <span className="kanban-contador">Mostrando até {POR_PAGINA_KANBAN} solicitações</span>
      </div>
      <div className="kanban-grade">
        {agrupado.map((col) => (
          <div key={col.chave} className={`kanban-coluna ${col.corBarra}`}>
            <div className="kanban-cabecalho">
              <span className="kanban-rotulo">{col.titulo}</span>
              <span className="kanban-quantidade">{col.itens.length}</span>
            </div>
            <div className="kanban-itens">
              {col.itens.length === 0 && <div className="kanban-vazio">Nenhum item</div>}
              {col.itens.map((s) => (
                <button key={s.id} className="kanban-card" onClick={() => navegar(`/govinfra/solicitacoes/${s.id}`)}>
                  <div className="kanban-card-topo">
                    <strong className="kanban-protocolo">{s.protocolo_formatado}</strong>
                    {s.atrasada && <span className="kanban-atraso"><AlertTriangle size={10}/> {s.dias_atraso}d</span>}
                  </div>
                  <div className="kanban-card-linha"><User size={12}/> {s.solicitante || '—'}</div>
                  <div className="kanban-card-linha"><MapPin size={12}/> {s.bairro || '—'}</div>
                  {s.cacamba_codigo && <div className="kanban-card-linha"><HardHat size={12}/> {s.cacamba_codigo}</div>}
                  {s.data_prevista_entrega && (
                    <div className="kanban-card-linha"><Calendar size={12}/> {formatarData(s.data_prevista_entrega)}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Painel lateral ──────────────────────────────────────────────────────── */

function PainelDetalhe({ id, fechar, navegar }: { id: string; fechar: () => void; navegar: (url: string) => void }) {
  const [solicitacao, setSolicitacao] = useState<SolicitacaoCacamba | null>(null);
  const [timeline, setTimeline] = useState<RegistroAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<'dados' | 'timeline'>('dados');

  useEffect(() => {
    setCarregando(true);
    Promise.all([
      api.get<SolicitacaoCacamba>(`/solicitacoes/${id}`),
      api.get<Paginado<RegistroAuditoria>>(`/auditoria?entidade=solicitacao&entidade_id=${id}&por_pagina=30`),
    ])
      .then(([sol, aud]) => { setSolicitacao(sol); setTimeline(aud.itens); })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') fechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fechar]);

  return (
    <div className="painel-fundo" onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <aside className="painel-lateral" role="dialog" aria-label="Detalhes da solicitação">
        <header className="painel-cabecalho">
          <div>
            <h2>Detalhes da solicitação</h2>
            {solicitacao && <span className="painel-protocolo">{solicitacao.protocolo_formatado}</span>}
          </div>
          <button className="botao sutil icone" onClick={fechar} aria-label="Fechar painel"><X size={18}/></button>
        </header>

        {carregando && <div className="painel-carregando"><Carregando texto="Carregando detalhes…"/></div>}
        {!carregando && !solicitacao && <div className="painel-erro">Não foi possível carregar.</div>}
        {!carregando && solicitacao && <>
          <nav className="painel-abas">
            <button className={`painel-aba ${aba === 'dados' ? 'ativa' : ''}`} onClick={() => setAba('dados')}>Dados</button>
            <button className={`painel-aba ${aba === 'timeline' ? 'ativa' : ''}`} onClick={() => setAba('timeline')}>
              Histórico {timeline.length > 0 && <span className="contador-aba">{timeline.length}</span>}
            </button>
          </nav>

          {aba === 'dados' && (
            <div className="painel-corpo">
              <div className="painel-status">
                <Chip cor={corSituacao(solicitacao.situacao)}>{solicitacao.situacao_rotulo}</Chip>
                {solicitacao.atrasada && <Chip cor="vermelho"><AlertTriangle size={12}/> Atrasada {solicitacao.dias_atraso}d</Chip>}
              </div>
              <div className="painel-grade">
                <InfoLinha rotulo="Solicitante" valor={solicitacao.solicitante || '—'}/>
                <InfoLinha rotulo="Endereço" valor={[solicitacao.logradouro, solicitacao.bairro].filter(Boolean).join(', ') || '—'}/>
                <InfoLinha rotulo="Caçamba" valor={solicitacao.cacamba_codigo || '—'}/>
                <InfoLinha rotulo="Veículo" valor={solicitacao.veiculo_placa || '—'}/>
                <InfoLinha rotulo="Entrega prevista" valor={formatarData(solicitacao.data_prevista_entrega)}/>
                <InfoLinha rotulo="Retirada prevista" valor={formatarData(solicitacao.data_prevista_retirada)}/>
                <InfoLinha rotulo="Tipo de resíduo" valor={solicitacao.tipo_residuo || '—'}/>
                <InfoLinha rotulo="Prioridade" valor={solicitacao.prioridade}/>
              </div>
            </div>
          )}

          {aba === 'timeline' && (
            <div className="painel-corpo">
              {timeline.length === 0 && <p className="texto-sutil">Nenhum registro de histórico encontrado.</p>}
              {timeline.length > 0 && (
                <div className="linha-tempo">
                  {timeline.map((r) => (
                    <div key={r.id}>
                      <div className="ponto ok"/>
                      <p>
                        <strong>{r.acao}</strong> — {r.resultado}
                        {r.detalhe && <span className="texto-sutil">{r.detalhe}</span>}
                        {r.usuario?.nome && <small>{r.usuario.nome} · {formatarDataHora(r.criada_em)}</small>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>}

        <footer className="painel-rodape">
          <button className="botao" onClick={fechar}><ChevronLeft size={15}/> Fechar</button>
          <button className="botao principal" onClick={() => { navegar(`/govinfra/solicitacoes/${id}`); fechar(); }}>
            <ExternalLink size={14}/> Tela completa
          </button>
        </footer>
      </aside>
    </div>
  );
}

function InfoLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="painel-info">
      <span className="painel-info-rotulo">{rotulo}</span>
      <span className="painel-info-valor">{valor}</span>
    </div>
  );
}
