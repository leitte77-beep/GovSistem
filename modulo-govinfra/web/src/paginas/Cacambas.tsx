import {
  AlertTriangle, ArrowUpDown, Box, Calendar, Camera, CheckCircle2, ChevronDown,
  Circle, ClipboardCheck, Clock, Droplets, FileDown, FileText, Grid3X3, HardHat,
  Image, LayoutList, MapPin, MoreHorizontal, Pencil, Plus, QrCode, Search,
  Truck, Upload, Wrench, X, Hash, DollarSign, Package,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import {
  CabecalhoPagina, Carregando, Chip, Drawer, ErroEstado, Esqueleto, Modal, Paginacao,
} from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Cacamba, Paginado } from '../types';
import {
  categoriaSituacao, corSituacao, formatarData, formatarDataHora, iconeSituacao,
  rotuloCurto, rotuloSituacao, tempoDecorrido,
} from '../utils';

/* ── Ícones por nome ──────────────────────────────────────────────────────── */

const ICONES: Record<string, React.FC<{ size?: number }>> = {
  CheckCircle2, Calendar, Clock, Truck, HardHat, Droplets, ClipboardCheck, Wrench,
  AlertTriangle,
} as any;

function IconeSituacao({ situacao, size = 14 }: { situacao: string; size?: number }) {
  const nome = iconeSituacao(situacao);
  const Comp = ICONES[nome] || AlertTriangle;
  return <Comp size={size} />;
}

/* ── Situações para cards e chips ─────────────────────────────────────────── */

const SITUACOES_FILTRO = [
  { chave: '', rotulo: 'Todas', cor: '' },
  { chave: 'disponivel', rotulo: 'Disponíveis', cor: 'verde' },
  { chave: 'reservada', rotulo: 'Reservadas', cor: 'roxo' },
  { chave: 'aguardando_entrega', rotulo: 'Ag. entrega', cor: 'laranja' },
  { chave: 'em_transporte_entrega', rotulo: 'Em trânsito', cor: 'roxo' },
  { chave: 'em_uso', rotulo: 'Em uso', cor: 'azul' },
  { chave: 'aguardando_retirada', rotulo: 'Ag. retirada', cor: 'amarelo' },
  { chave: 'em_transporte_retorno', rotulo: 'Retornando', cor: 'roxo' },
  { chave: 'em_limpeza', rotulo: 'Limpeza', cor: 'roxo' },
  { chave: 'em_vistoria', rotulo: 'Vistoria', cor: 'roxo' },
  { chave: 'em_manutencao', rotulo: 'Manutenção', cor: 'vermelho' },
  { chave: 'indisponivel', rotulo: 'Indisponíveis', cor: 'vermelho' },
  { chave: 'inativa', rotulo: 'Inativas', cor: 'cinza' },
];

const CAPACIDADES = [
  { chave: '', rotulo: 'Qualquer capacidade' },
  { chave: '3', rotulo: '3 m³' },
  { chave: '4', rotulo: '4 m³' },
  { chave: '5', rotulo: '5 m³' },
  { chave: '6', rotulo: '6 m³' },
  { chave: '7', rotulo: '7 m³' },
  { chave: '10', rotulo: '10 m³' },
];

type Visualizacao = 'cards' | 'lista';

/* ══════════════════════════════════════════════════════════════════════════════
   Caçambas — Central de Gestão do Inventário
   ══════════════════════════════════════════════════════════════════════════════ */

export function Cacambas() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const navegar = useNavigate();
  const [params] = useSearchParams();

  /* estado principal */
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState(params.get('situacao') || '');
  const [capacidade, setCapacidade] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<Cacamba> | null>(null);
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<Visualizacao>(
    (localStorage.getItem('cacambas.modo') as Visualizacao) || 'cards',
  );
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  /* contagens por situação */
  const [contagens, setContagens] = useState<{ chave: string; rotulo: string; quantidade: number }[]>([]);

  /* drawer */
  const [cacambaAberta, setCacambaAberta] = useState<Cacamba | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  /* modal de criação */
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [capOutra, setCapOutra] = useState(false);
  const [corOutra, setCorOutra] = useState(false);

  /* modal de edição */
  const [editando, setEditando] = useState<Cacamba | null>(null);

  /* ordenação da tabela */
  const [ordem, setOrdem] = useState<{ campo: string; dir: 'asc' | 'desc' }>({ campo: 'codigo', dir: 'asc' });

  /* ref para busca com debounce */
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── API ────────────────────────────────────────────────────────────────── */

  function carregar(paginaAtual = pagina, filtros: { termo?: string; situacao?: string; capacidade?: string } = {}) {
    const t = filtros.termo ?? termo;
    const s = filtros.situacao ?? situacao;
    const cap = filtros.capacidade ?? capacidade;
    setErro('');
    const qs = new URLSearchParams();
    qs.set('pagina', String(paginaAtual));
    qs.set('por_pagina', '20');
    if (t) qs.set('termo', t);
    if (s) qs.set('situacao', s);
    api.get<Paginado<Cacamba>>(`/cacambas?${qs.toString()}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }

  function carregarContagens() {
    api.get<{ chave: string; rotulo: string; quantidade: number }[]>('/cacambas/situacoes')
      .then(setContagens)
      .catch(() => {});
  }

  useEffect(() => {
    carregar(1);
    carregarContagens();
  }, []);

  const debounceBusca = useCallback((valor: string) => {
    setTermo(valor);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      carregar(1, { termo: valor });
    }, 300);
  }, [situacao, capacidade]);

  /* ── Total por contagens ────────────────────────────────────────────────── */

  const totalCacambas = useMemo(
    () => contagens.reduce((s, c) => s + c.quantidade, 0),
    [contagens],
  );

  const qtdSituacao = (chave: string) =>
    contagens.find((c) => c.chave === chave)?.quantidade ?? 0;

  const alertas = useMemo(() => {
    const lista: { nivel: string; texto: string; situacao?: string }[] = [];
    const retiradas = qtdSituacao('aguardando_retirada');
    if (retiradas > 0) lista.push({ nivel: 'atencao', texto: `${retiradas} aguardando retirada`, situacao: 'aguardando_retirada' });
    const semLoc = /* simplificado */ 0;
    const manut = qtdSituacao('em_manutencao');
    if (manut > 0) lista.push({ nivel: 'atencao', texto: `${manut} em manutenção`, situacao: 'em_manutencao' });
    return lista;
  }, [contagens]);

  /* ── Ordenação ──────────────────────────────────────────────────────────── */

  const itensOrdenados = useMemo(() => {
    if (!dados) return [];
    const lista = [...dados.itens];
    lista.sort((a, b) => {
      const aVal = (a as any)[ordem.campo] ?? '';
      const bVal = (b as any)[ordem.campo] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), 'pt-BR', { numeric: true });
      return ordem.dir === 'asc' ? cmp : -cmp;
    });
    return lista;
  }, [dados, ordem]);

  function alternarOrdem(campo: string) {
    setOrdem((prev) => ({
      campo,
      dir: prev.campo === campo && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }

  /* ── Drawer ─────────────────────────────────────────────────────────────── */

  async function abrirDrawer(cacamba: Cacamba) {
    setCacambaAberta(cacamba);
    setCarregandoDetalhe(true);
    try {
      const detalhe = await api.get<Cacamba>(`/cacambas/${cacamba.id}`);
      setCacambaAberta(detalhe);
    } catch {
      avisar('erro', 'Não foi possível carregar os detalhes.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  async function criarCacamba(corpo: Record<string, unknown>) {
    setSalvando(true);
    try {
      await api.post('/cacambas', corpo);
      avisar('sucesso', 'Caçamba cadastrada.');
      setCriando(false);
      carregar(1);
      carregarContagens();
    } catch (e: any) { avisar('erro', e.message); }
    finally { setSalvando(false); }
  }

  async function salvarEdicao(corpo: Record<string, unknown>) {
    if (!editando) return;
    setSalvando(true);
    try {
      await api.put(`/cacambas/${editando.id}`, corpo);
      avisar('sucesso', 'Caçamba atualizada.');
      setEditando(null);
      carregar(pagina);
      if (cacambaAberta?.id === editando.id) abrirDrawer(editando);
    } catch (e: any) { avisar('erro', e.message); }
    finally { setSalvando(false); }
  }

  async function mudarSituacao(cacamba: Cacamba, novaSituacao: string, motivo?: string) {
    try {
      await api.post(`/cacambas/${cacamba.id}/situacao`, { situacao: novaSituacao, motivo: motivo || '' });
      avisar('sucesso', 'Situação alterada.');
      carregar(pagina);
      carregarContagens();
      if (cacambaAberta?.id === cacamba.id) abrirDrawer(cacamba);
    } catch (e: any) { avisar('erro', e.message); }
  }

  /* ── Seleção múltipla ───────────────────────────────────────────────────── */

  function alternarSelecao(id: string, event?: React.MouseEvent) {
    event?.stopPropagation();
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  function limparSelecao() { setSelecionados(new Set()); }

  /* ── Ações rápidas ──────────────────────────────────────────────────────── */

  function acoesPorSituacao(situacao: string) {
    const mapa: Record<string, { rotulo: string; destino: string; cor?: string }[]> = {
      disponivel: [
        { rotulo: 'Reservar', destino: 'reservada' },
        { rotulo: 'Enviar p/ limpeza', destino: 'em_limpeza' },
        { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
      ],
      reservada: [
        { rotulo: 'Liberar reserva', destino: 'disponivel' },
        { rotulo: 'Ag. entrega', destino: 'aguardando_entrega' },
      ],
      aguardando_entrega: [
        { rotulo: 'Iniciar transporte', destino: 'em_transporte_entrega' },
        { rotulo: 'Cancelar', destino: 'disponivel' },
      ],
      em_transporte_entrega: [
        { rotulo: 'Confirmar entrega', destino: 'em_uso' },
        { rotulo: 'Cancelar', destino: 'disponivel' },
      ],
      em_uso: [
        { rotulo: 'Solicitar retirada', destino: 'aguardando_retirada' },
      ],
      aguardando_retirada: [
        { rotulo: 'Iniciar retirada', destino: 'em_transporte_retorno' },
        { rotulo: 'Marcar retirada', destino: 'em_uso' },
      ],
      em_transporte_retorno: [
        { rotulo: 'Chegou ao pátio', destino: 'disponivel' },
        { rotulo: 'Enviar p/ limpeza', destino: 'em_limpeza' },
        { rotulo: 'Enviar p/ vistoria', destino: 'em_vistoria' },
        { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
      ],
      em_limpeza: [
        { rotulo: 'Liberar', destino: 'disponivel' },
        { rotulo: 'Enviar p/ vistoria', destino: 'em_vistoria' },
      ],
      em_vistoria: [
        { rotulo: 'Liberar', destino: 'disponivel' },
        { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
        { rotulo: 'Marcar indisponível', destino: 'indisponivel' },
      ],
      em_manutencao: [
        { rotulo: 'Liberar', destino: 'disponivel' },
        { rotulo: 'Marcar indisponível', destino: 'indisponivel' },
      ],
      indisponivel: [
        { rotulo: 'Liberar', destino: 'disponivel' },
        { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
      ],
    };
    return mapa[situacao] || [{ rotulo: 'Liberar', destino: 'disponivel' }];
  }

  /* ── Mudar modo ─────────────────────────────────────────────────────────── */

  function mudarModo(novo: Visualizacao) {
    setModo(novo);
    localStorage.setItem('cacambas.modo', novo);
    limparSelecao();
  }

  /* ── Exportar listagem ──────────────────────────────────────────────────── */

  function exportarExcel() {
    avisar('info', 'Exportação será implementada em breve.');
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div>
      {/* ═══ CABEÇALHO ═══ */}
      <CabecalhoPagina
        titulo="Caçambas municipais"
        descricao="Controle de disponibilidade, localização, uso e manutenção do patrimônio."
        acoes={
          pode('govinfra.cacambas.criar') && (
            <button className="botao principal" onClick={() => setCriando(true)}>
              <Plus size={17} /> Nova caçamba
            </button>
          )
        }
      />

      {/* ═══ INDICADORES ═══ */}
      <div className="cacambas-stats">
        <button
          className={`cacambas-stat ${!situacao ? 'ativo' : ''}`}
          onClick={() => { setSituacao(''); setPagina(1); carregar(1, { situacao: '' }); }}
        >
          <span className="cacambas-stat-valor">{totalCacambas}</span>
          <span className="cacambas-stat-rotulo">Total cadastradas</span>
        </button>
        {[
          { chave: 'disponivel', rotulo: 'Disponíveis', cor: 'verde' },
          { chave: 'reservada', rotulo: 'Reservadas', cor: 'roxo' },
          { chave: 'em_uso', rotulo: 'Em uso', cor: 'azul' },
          { chave: 'aguardando_retirada', rotulo: 'Ag. retirada', cor: 'amarelo' },
          { chave: 'em_manutencao', rotulo: 'Manutenção', cor: 'vermelho' },
          { chave: 'em_limpeza', rotulo: 'Limpeza', cor: 'roxo' },
        ].map(({ chave, rotulo, cor }) => (
          <button
            key={chave}
            className={`cacambas-stat ${cor} ${situacao === chave ? 'ativo' : ''}`}
            onClick={() => {
              const nova = situacao === chave ? '' : chave;
              setSituacao(nova);
              setPagina(1);
              carregar(1, { situacao: nova });
            }}
          >
            <span className="cacambas-stat-valor">{qtdSituacao(chave)}</span>
            <span className="cacambas-stat-rotulo">{rotulo}</span>
          </button>
        ))}
      </div>

      {/* ═══ ALERTAS ═══ */}
      {alertas.length > 0 && (
        <div className="cacambas-alertas">
          {alertas.map((a, i) => (
            <button
              key={i}
              className={`cacambas-alerta ${a.nivel}`}
              onClick={() => {
                if (a.situacao) {
                  setSituacao(a.situacao);
                  setPagina(1);
                  carregar(1, { situacao: a.situacao });
                }
              }}
            >
              <AlertTriangle size={13} /> {a.texto}
            </button>
          ))}
        </div>
      )}

      {/* ═══ BUSCA + FILTROS ═══ */}
      <div className="cacambas-busca">
        <Search size={19} />
        <input
          value={termo}
          onChange={(e) => debounceBusca(e.target.value)}
          placeholder="Pesquise por código, patrimônio, identificação, situação, endereço ou protocolo…"
          aria-label="Buscar caçamba"
        />
        {termo && (
          <button className="cacambas-busca-limpar" onClick={() => { setTermo(''); carregar(1, { termo: '' }); }}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="cacambas-filtros-inline">
        <div className="cacambas-filtro">
          <select value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1); carregar(1, { situacao: e.target.value }); }}>
            <option value="">Todas as situações</option>
            {SITUACOES_FILTRO.filter((s) => s.chave).map((s) => (
              <option key={s.chave} value={s.chave}>{s.rotulo}</option>
            ))}
          </select>
        </div>
        <div className="cacambas-filtro">
          <select value={capacidade} onChange={(e) => { setCapacidade(e.target.value); setPagina(1); carregar(1, { capacidade: e.target.value }); }}>
            {CAPACIDADES.map((c) => (
              <option key={c.chave} value={c.chave}>{c.rotulo}</option>
            ))}
          </select>
        </div>
        {dados && dados.total > 0 && (
          <span className="cacambas-contador">
            {dados.total} caçamba{dados.total !== 1 ? 's' : ''} encontrada{dados.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ═══ CHIPS DE FILTRO RÁPIDO ═══ */}
      <div className="cacambas-chips">
        {SITUACOES_FILTRO.slice(0, 8).map(({ chave, rotulo }) => (
          <button
            key={chave}
            className={`cacambas-chip${situacao === chave ? ' ativo' : ''}`}
            onClick={() => {
              setSituacao(chave);
              setPagina(1);
              carregar(1, { situacao: chave });
            }}
          >
            {rotulo}
          </button>
        ))}
        {SITUACOES_FILTRO.length > 8 && (
          <button className="cacambas-chip">
            <MoreHorizontal size={14} /> Mais <ChevronDown size={12} />
          </button>
        )}
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="cacambas-toolbar">
        <div className="cacambas-toolbar-esq">
          {selecionados.size > 0 && (
            <div className="cacambas-acoes-selecionadas">
              {selecionados.size} selecionada{selecionados.size !== 1 ? 's' : ''}
              <button className="botao pequeno sutil" onClick={limparSelecao}>Limpar</button>
              <button className="botao pequeno" onClick={exportarExcel}>
                <FileDown size={13} /> Exportar
              </button>
            </div>
          )}
        </div>
        <div className="cacambas-toolbar-dir">
          <div className="cacambas-alternador">
            <button className={modo === 'cards' ? 'ativo' : ''} onClick={() => mudarModo('cards')} title="Visualizar em cards">
              <Grid3X3 size={16} />
            </button>
            <button className={modo === 'lista' ? 'ativo' : ''} onClick={() => mudarModo('lista')} title="Visualizar em lista">
              <LayoutList size={16} />
            </button>
          </div>
          <button className="botao pequeno sutil" onClick={exportarExcel} title="Exportar Excel">
            <FileDown size={15} />
          </button>
        </div>
      </div>

      {/* ═══ CONTEÚDO ═══ */}
      {erro && <ErroEstado mensagem={erro} tentar={() => carregar()} />}
      {!dados && !erro && (
        <div className="cacambas-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cacambas-skeleton-card">
              <Esqueleto linhas={4} altura={14} />
            </div>
          ))}
        </div>
      )}
      {dados && dados.total === 0 && (
        <div className="cacambas-vazio">
          <HardHat size={48} />
          <h3>Nenhuma caçamba encontrada</h3>
          <p>
            {termo || situacao
              ? 'Nenhum resultado para os filtros aplicados. Tente ajustar a busca ou limpar os filtros.'
              : 'Cadastre o patrimônio de caçambas do município para controlar disponibilidade, localização, agendamentos, entregas e retiradas.'}
          </p>
          <div className="cacambas-vazio-acoes">
            {pode('govinfra.cacambas.criar') && (
              <button className="botao principal" onClick={() => setCriando(true)}>
                <Plus size={16} /> Cadastrar primeira caçamba
              </button>
            )}
            <button className="botao">Importar planilha</button>
          </div>
        </div>
      )}

      {/* ── Modo Cards ─────────────────────────────────────────────────────── */}
      {dados && dados.total > 0 && modo === 'cards' && (
        <>
          <div className="cacambas-grade">
            {itensOrdenados.map((c) => (
              <article
                key={c.id}
                className={`cacambas-card${selecionados.has(c.id) ? ' selecionado' : ''}`}
                onClick={() => abrirDrawer(c)}
              >
                {selecionados.has(c.id) && (
                  <span className="cacambas-card-indice">
                    {[...selecionados].indexOf(c.id) + 1}
                  </span>
                )}
                <div className="cacambas-card-cabecalho">
                  <div className="cacambas-card-nome">
                    <span className="cacambas-card-codigo">{c.codigo}</span>
                    {c.identificacao_visual && (
                      <span className="cacambas-card-modelo">{c.identificacao_visual}</span>
                    )}
                  </div>
                  <Chip cor={corSituacao(c.situacao)}>
                    <IconeSituacao situacao={c.situacao} size={12} />
                    {rotuloCurto(c.situacao)}
                  </Chip>
                </div>
                <div className="cacambas-card-corpo">
                  {c.patrimonio && (
                    <div className="cacambas-card-linha">
                      <QrCode size={14} />
                      <span>Patrimônio: {c.patrimonio}</span>
                    </div>
                  )}
                  {(c.capacidade_m3 || c.tipo) && (
                    <div className="cacambas-card-linha">
                      <HardHat size={14} />
                      <span>
                        {c.capacidade_m3 ? `${c.capacidade_m3} m³` : ''}
                        {c.capacidade_m3 && c.tipo ? ' · ' : ''}
                        {c.tipo || ''}
                      </span>
                    </div>
                  )}
                  {c.localizacao_atual && (
                    <div className={`cacambas-card-linha${c.localizacao_padrao && c.localizacao_atual !== c.localizacao_padrao ? ' destaque' : ''}`}>
                      <MapPin size={14} />
                      <span>{c.localizacao_atual}</span>
                    </div>
                  )}
                  {c.solicitacao_atual && (
                    <div className="cacambas-card-linha destaque">
                      <Clock size={14} />
                      <span>
                        {c.dias_em_uso != null ? `${c.dias_em_uso} dia(s) em uso` : 'Em uso'}
                        {c.solicitacao_atual.data_prevista_retirada && (
                          <> · retirada {formatarData(c.solicitacao_atual.data_prevista_retirada)}</>
                        )}
                      </span>
                    </div>
                  )}
                  {c.solicitacao_atual?.atrasada && (
                    <div className="cacambas-card-linha atraso">
                      <AlertTriangle size={14} />
                      <span>Retirada atrasada</span>
                    </div>
                  )}
                </div>
                <div className="cacambas-card-rodape">
                  <div className="cacambas-card-acoes">
                    {acoesPorSituacao(c.situacao).slice(0, 2).map((a) => (
                      <button
                        key={a.destino}
                        className="cacambas-card-acao primario"
                        onClick={(e) => {
                          e.stopPropagation();
                          mudarSituacao(c, a.destino);
                        }}
                      >
                        {a.rotulo}
                      </button>
                    ))}
                  </div>
                  <button
                    className="cacambas-card-acao"
                    onClick={(e) => alternarSelecao(c.id, e)}
                  >
                    {selecionados.has(c.id) ? 'Selecionado' : 'Selecionar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Paginacao
            pagina={dados.pagina}
            paginas={dados.paginas}
            mudar={(p) => { setPagina(p); carregar(p); }}
          />
        </>
      )}

      {/* ── Modo Lista ─────────────────────────────────────────────────────── */}
      {dados && dados.total > 0 && modo === 'lista' && (
        <>
          <div className="cacambas-tabela-envolve">
            <table className="tabela">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th className="ordenavel" onClick={() => alternarOrdem('codigo')}>
                    Código <span className="ordenacao">{ordem.campo === 'codigo' ? (ordem.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th className="ordenavel" onClick={() => alternarOrdem('patrimonio')}>
                    Patrimônio <span className="ordenacao">{ordem.campo === 'patrimonio' ? (ordem.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th>Capacidade</th>
                  <th>Tipo</th>
                  <th>Situação</th>
                  <th>Localização atual</th>
                  <th>Em uso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itensOrdenados.map((c) => (
                  <tr
                    key={c.id}
                    className={`tabela-clicavel ${selecionados.has(c.id) ? 'selecionado' : ''}`}
                    onClick={() => abrirDrawer(c)}
                  >
                    <td onClick={(e) => alternarSelecao(c.id, e)}>
                      <input type="checkbox" checked={selecionados.has(c.id)} readOnly style={{ cursor: 'pointer' }} />
                    </td>
                    <td><strong>{c.codigo}</strong></td>
                    <td>{c.patrimonio || '—'}</td>
                    <td>{c.capacidade_m3 ? `${c.capacidade_m3} m³` : '—'}</td>
                    <td>{c.tipo || '—'}</td>
                    <td>
                      <Chip cor={corSituacao(c.situacao)}>
                        <IconeSituacao situacao={c.situacao} size={11} />
                        {rotuloCurto(c.situacao)}
                      </Chip>
                    </td>
                    <td>{c.localizacao_atual || '—'}</td>
                    <td>{c.dias_em_uso != null ? `${c.dias_em_uso} dias` : '—'}</td>
                    <td className="acoes-coluna">
                      <button className="botao pequeno sutil" onClick={(e) => { e.stopPropagation(); abrirDrawer(c); }}>
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao
            pagina={dados.pagina}
            paginas={dados.paginas}
            mudar={(p) => { setPagina(p); carregar(p); }}
          />
        </>
      )}

      {/* ═══ DRAWER DE DETALHES ═══ */}
      <Drawer
        titulo={cacambaAberta?.codigo || 'Detalhes'}
        aberto={!!cacambaAberta}
        fechar={() => { setCacambaAberta(null); }}
        voltar={() => {
          navegar(`/govinfra/cacambas/${cacambaAberta?.id}`);
          setCacambaAberta(null);
        }}
        acoes={
          cacambaAberta && pode('govinfra.cacambas.editar') && (
            <button className="botao pequeno sutil" onClick={() => {
              setEditando(cacambaAberta);
              setCacambaAberta(null);
            }}>
              <Pencil size={14} /> Editar
            </button>
          )
        }
      >
        {carregandoDetalhe && <Carregando texto="Carregando detalhes…" />}
        {!carregandoDetalhe && cacambaAberta && (
          <>
            {/* ── Resumo ────────────────────────────────────────── */}
            <div className="drawer-secao">
              <div className="drawer-secao-titulo">Resumo</div>
              <div className="drawer-grade">
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Código</span>
                  <span className="drawer-campo-valor">{cacambaAberta.codigo}</span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Patrimônio</span>
                  <span className="drawer-campo-valor">{cacambaAberta.patrimonio || '—'}</span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Situação</span>
                  <span className="drawer-campo-valor">
                    <Chip cor={corSituacao(cacambaAberta.situacao)}>
                      <IconeSituacao situacao={cacambaAberta.situacao} size={11} />
                      {cacambaAberta.situacao_rotulo}
                    </Chip>
                  </span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Capacidade</span>
                  <span className="drawer-campo-valor">{cacambaAberta.capacidade_m3 ? `${cacambaAberta.capacidade_m3} m³` : '—'}</span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Tipo</span>
                  <span className="drawer-campo-valor">{cacambaAberta.tipo || '—'}</span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Modelo</span>
                  <span className="drawer-campo-valor">{cacambaAberta.modelo || '—'}</span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Estado de conservação</span>
                  <span className="drawer-campo-valor">{cacambaAberta.estado_conservacao || '—'}</span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Localização padrão</span>
                  <span className="drawer-campo-valor">{cacambaAberta.localizacao_padrao || '—'}</span>
                </div>
              </div>
            </div>

            {/* ── Localização atual ─────────────────────────────── */}
            {cacambaAberta.localizacao_atual && (
              <div className="drawer-secao">
                <div className="drawer-secao-titulo"><MapPin size={13} /> Localização atual</div>
                <div style={{ fontSize: '13px', color: 'var(--cinza-700)', marginBottom: '8px' }}>
                  {cacambaAberta.localizacao_atual}
                </div>
                {cacambaAberta.latitude && cacambaAberta.longitude && (
                  <div className="drawer-mapa" style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cinza-500)', fontSize: 12 }}>
                    Coordenadas: {cacambaAberta.latitude.toFixed(6)}, {cacambaAberta.longitude.toFixed(6)}
                  </div>
                )}
              </div>
            )}

            {/* ── Uso atual ─────────────────────────────────────── */}
            {cacambaAberta.solicitacao_atual && (
              <div className="drawer-secao">
                <div className="drawer-secao-titulo"><Clock size={13} /> Uso atual</div>
                <div className="drawer-grade">
                  <div className="drawer-campo">
                    <span className="drawer-campo-rotulo">Endereço</span>
                    <span className="drawer-campo-valor">{cacambaAberta.solicitacao_atual.endereco || '—'}</span>
                  </div>
                  <div className="drawer-campo">
                    <span className="drawer-campo-rotulo">Protocolo</span>
                    <span className="drawer-campo-valor">{cacambaAberta.solicitacao_atual.protocolo}</span>
                  </div>
                  <div className="drawer-campo">
                    <span className="drawer-campo-rotulo">Dias em uso</span>
                    <span className="drawer-campo-valor">{cacambaAberta.dias_em_uso ?? '—'}</span>
                  </div>
                  <div className="drawer-campo">
                    <span className="drawer-campo-rotulo">Retirada prevista</span>
                    <span className="drawer-campo-valor">
                      {cacambaAberta.solicitacao_atual.data_prevista_retirada
                        ? formatarData(cacambaAberta.solicitacao_atual.data_prevista_retirada)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Ações rápidas ─────────────────────────────────── */}
            {pode('govinfra.cacambas.movimentar') && (
              <div className="drawer-secao">
                <div className="drawer-secao-titulo">Ações rápidas</div>
                <div className="drawer-acoes">
                  {acoesPorSituacao(cacambaAberta.situacao).map((a) => (
                    <button
                      key={a.destino}
                      className={`drawer-acao${a.cor === 'perigo' ? ' perigo' : ''}`}
                      onClick={() => {
                        const promptMotivo = window.prompt(`Motivo para "${a.rotulo}":`);
                        if (promptMotivo === null) return;
                        mudarSituacao(cacambaAberta, a.destino, promptMotivo);
                      }}
                    >
                      <IconeSituacao situacao={a.destino} size={13} />
                      {a.rotulo}
                    </button>
                  ))}
                  <button className="drawer-acao" onClick={() => navegar(`/govinfra/cacambas/${cacambaAberta.id}`)}>
                    <ArrowUpDown size={13} /> Histórico completo
                  </button>
                  <button className="drawer-acao primario" onClick={() => {
                    setCacambaAberta(null);
                    navegar(`/govinfra/solicitacoes/nova?cacamba=${cacambaAberta.id}`);
                  }}>
                    <Calendar size={13} /> Nova solicitação
                  </button>
                  {cacambaAberta.qr_code && (
                    <button className="drawer-acao" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/consulta/${cacambaAberta.qr_code}`); avisar('sucesso', 'Link copiado.'); }}>
                      <QrCode size={13} /> Copiar link do QR Code
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* ═══ MODAL DE CRIAÇÃO ═══ */}
      {criando && (
        <div className="modal-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCriando(false)}>
          <section className="modal largo" role="dialog" aria-modal="true" aria-label="Cadastrar nova caçamba" style={{ width: 'min(820px, calc(100vw - 32px))' }}>
            <header className="modal-cabecalho-premium">
              <div className="modal-cabecalho-premium-esq">
                <h2>Cadastrar nova caçamba</h2>
                <p>Registre a identificação, características, localização e estado de conservação.</p>
              </div>
              <div className="modal-cabecalho-premium-dir">
                <span className="modal-cabecalho-premium-badge">
                  <Hash size={12} /> Código sugerido: CAC-{String(totalCacambas + 1).padStart(3, '0')}
                </span>
                <button className="modal-botao-fechar" aria-label="Fechar" onClick={() => setCriando(false)}>
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="modal-corpo">
              <form
                id="form-cacamba"
                className="cacambas-form-grade"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const cap = fd.get('capacidade_m3') as string;
                  criarCacamba({
                    codigo: fd.get('codigo'),
                    patrimonio: fd.get('patrimonio'),
                    identificacao_visual: fd.get('identificacao_visual'),
                    tipo: fd.get('tipo'),
                    modelo: fd.get('modelo'),
                    capacidade_m3: cap && cap !== 'outra' ? Number(cap) : (fd.get('capacidade_outra') ? Number(fd.get('capacidade_outra')) : undefined),
                    cor: fd.get('cor') === 'outra' ? fd.get('cor_outra') : fd.get('cor'),
                    data_aquisicao: fd.get('data_aquisicao') || undefined,
                    valor_aquisicao: fd.get('valor_aquisicao') ? Number(fd.get('valor_aquisicao')) : undefined,
                    estado_conservacao: fd.get('estado_conservacao') || undefined,
                    localizacao_padrao: fd.get('localizacao_padrao'),
                    proxima_vistoria_em: fd.get('proxima_vistoria_em') || undefined,
                    ano_fabricacao: fd.get('ano_fabricacao') ? Number(fd.get('ano_fabricacao')) : undefined,
                    fornecedor: fd.get('fornecedor') || undefined,
                    nota_fiscal: fd.get('nota_fiscal') || undefined,
                    numero_serie: fd.get('numero_serie') || undefined,
                    garantia_ate: fd.get('garantia_ate') || undefined,
                    observacoes: fd.get('observacoes') || undefined,
                  });
                }}
              >
                {/* ── Seção: Identificação ─────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><Hash size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Identificação</span>
                      <span className="cacambas-form-secao-desc">Código único, patrimônio e dados de identificação da caçamba.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Código único <span className="asterisco">*</span></label>
                  <div className="cacambas-input-envolve">
                    <Hash size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="codigo" required placeholder={`CAC-${String(totalCacambas + 1).padStart(3, '0')}`} autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Patrimônio</label>
                  <div className="cacambas-input-envolve">
                    <QrCode size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="patrimonio" placeholder="000154" autoComplete="off" />
                  </div>
                </div>

                <div className="campo campo-full">
                  <label className="cacambas-label">Identificação visual</label>
                  <div className="cacambas-input-envolve">
                    <Pencil size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="identificacao_visual" placeholder="Ex.: Caçamba laranja grande" autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Número de série</label>
                  <div className="cacambas-input-envolve">
                    <Hash size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="numero_serie" placeholder="SN-..." autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Ano de fabricação</label>
                  <div className="cacambas-input-envolve">
                    <Calendar size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="ano_fabricacao" type="number" min="2000" max={new Date().getFullYear()} placeholder="2024" />
                  </div>
                </div>

                {/* ── Seção: Características ────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><HardHat size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Características</span>
                      <span className="cacambas-form-secao-desc">Tipo, capacidade, dimensões e especificações físicas.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Tipo</label>
                  <select className="cacambas-select" name="tipo">
                    <option value="">Selecione o tipo</option>
                    <option value="estacionaria">Estacionária</option>
                    <option value="roll_on_roll_off">Roll-on / Roll-off</option>
                    <option value="basculante">Basculante</option>
                    <option value="compactadora">Compactadora</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Modelo</label>
                  <div className="cacambas-input-envolve">
                    <Package size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="modelo" placeholder="Modelo ou fabricante" autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Capacidade</label>
                  <select
                    className="cacambas-select"
                    name="capacidade_m3"
                    onChange={(e) => setCapOutra(e.target.value === 'outra')}
                  >
                    <option value="">Selecione a capacidade</option>
                    <option value="3">3 m³</option>
                    <option value="4">4 m³</option>
                    <option value="5">5 m³</option>
                    <option value="7">7 m³</option>
                    <option value="10">10 m³</option>
                    <option value="12">12 m³</option>
                    <option value="outra">Outra capacidade</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Cor</label>
                  <select
                    className="cacambas-select"
                    name="cor"
                    onChange={(e) => setCorOutra(e.target.value === 'outra')}
                  >
                    <option value="">Selecione a cor</option>
                    <option value="Laranja">Laranja</option>
                    <option value="Amarela">Amarela</option>
                    <option value="Azul">Azul</option>
                    <option value="Verde">Verde</option>
                    <option value="Cinza">Cinza</option>
                    <option value="Branca">Branca</option>
                    <option value="outra">Outra cor</option>
                  </select>
                </div>

                {capOutra && (
                  <div className="campo">
                    <label className="cacambas-label">Capacidade personalizada (m³)</label>
                    <div className="cacambas-input-envolve">
                      <HardHat size={16} className="cadastro-input-icone" />
                      <input className="cacambas-input" name="capacidade_outra" type="number" step="0.1" min="0.1" placeholder="Ex.: 4.5" />
                    </div>
                  </div>
                )}

                {corOutra && (
                  <div className="campo">
                    <label className="cacambas-label">Cor personalizada</label>
                    <div className="cacambas-input-envolve">
                      <Circle size={16} className="cadastro-input-icone" />
                      <input className="cacambas-input" name="cor_outra" placeholder="Descreva a cor" />
                    </div>
                  </div>
                )}

                {/* ── Seção: Situação e Localização ──────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><MapPin size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Situação e localização</span>
                      <span className="cacambas-form-secao-desc">Estado operacional, conservação e local de armazenamento.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Estado de conservação</label>
                  <select className="cacambas-select" name="estado_conservacao">
                    <option value="">Selecione o estado de conservação</option>
                    <option value="nova">Nova</option>
                    <option value="excelente">Excelente</option>
                    <option value="bom">Bom</option>
                    <option value="regular">Regular</option>
                    <option value="ruim">Ruim</option>
                    <option value="inoperante">Inoperante</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Localização padrão</label>
                  <div className="cacambas-input-envolve">
                    <MapPin size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="localizacao_padrao" placeholder="Pátio Municipal" autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Data de aquisição</label>
                  <div className="cacambas-input-envolve">
                    <Calendar size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="data_aquisicao" type="date" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Próxima vistoria</label>
                  <div className="cacambas-input-envolve">
                    <ClipboardCheck size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="proxima_vistoria_em" type="date" />
                  </div>
                </div>

                {/* ── Seção: Dados patrimoniais ──────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><DollarSign size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Dados patrimoniais</span>
                      <span className="cacambas-form-secao-desc">Informações de aquisição, fornecedor e documentação fiscal.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Valor de aquisição (R$)</label>
                  <div className="cacambas-input-envolve">
                    <DollarSign size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="valor_aquisicao" type="number" step="0.01" min="0" placeholder="0,00" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Fornecedor</label>
                  <div className="cacambas-input-envolve">
                    <Truck size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="fornecedor" placeholder="Nome do fornecedor" autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Nota fiscal</label>
                  <div className="cacambas-input-envolve">
                    <FileText size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="nota_fiscal" placeholder="Número da NF" autoComplete="off" />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Garantia até</label>
                  <div className="cacambas-input-envolve">
                    <Calendar size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="garantia_ate" type="date" />
                  </div>
                </div>

                {/* ── Seção: Fotos e documentos ───────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><Camera size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Fotos e documentos</span>
                      <span className="cacambas-form-secao-desc">Imagens da caçamba, placa patrimonial e documentos de aquisição.</span>
                    </div>
                  </div>
                </div>

                <div className="campo campo-full">
                  <div className="cacambas-upload-area">
                    <Camera size={28} />
                    <div className="titulo">Arraste as imagens ou clique para selecionar</div>
                    <div className="desc">Fotos frontal, lateral, interna e placa patrimonial. Formatos: JPG, PNG, WEBP.</div>
                    <button type="button" className="botao pequeno margem-topo" onClick={() => avisar('info', 'Upload de fotos será implementado em breve.')}>
                      <Upload size={13} /> Adicionar fotos
                    </button>
                  </div>
                </div>

                {/* ── Seção: Observações ──────────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><Pencil size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Observações</span>
                      <span className="cacambas-form-secao-desc">Informações internas, restrições e histórico relevante.</span>
                    </div>
                  </div>
                </div>

                <div className="campo campo-full">
                  <textarea
                    className="cacambas-textarea"
                    name="observacoes"
                    placeholder="Descreva avarias, restrições, adaptações, histórico relevante ou outras informações internas…"
                    maxLength={1500}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      const counter = el.parentElement?.querySelector('.cacambas-contador-caractere') as HTMLElement | null;
                      if (counter) counter.textContent = `${el.value.length} / 1500 caracteres`;
                    }}
                  />
                  <div className="cacambas-contador-caractere">0 / 1500 caracteres</div>
                </div>
              </form>
            </div>

            <footer className="modal-rodape-premium">
              <span className="modal-rodape-premium-esq">* Campos obrigatórios</span>
              <div className="modal-rodape-premium-dir">
                <button className="botao" onClick={() => setCriando(false)}>Cancelar</button>
                <button
                  className="botao"
                  form="form-cacamba"
                  onClick={() => {
                    const f = document.getElementById('form-cacamba') as HTMLFormElement;
                    if (!f) return;
                    const fd = new FormData(f);
                    const cap = fd.get('capacidade_m3') as string;
                    criarCacamba({
                      codigo: fd.get('codigo'),
                      patrimonio: fd.get('patrimonio'),
                      identificacao_visual: fd.get('identificacao_visual'),
                      tipo: fd.get('tipo'),
                      modelo: fd.get('modelo'),
                      capacidade_m3: cap && cap !== 'outra' ? Number(cap) : (fd.get('capacidade_outra') ? Number(fd.get('capacidade_outra')) : undefined),
                      cor: fd.get('cor') === 'outra' ? fd.get('cor_outra') : fd.get('cor'),
                      data_aquisicao: fd.get('data_aquisicao') || undefined,
                      valor_aquisicao: fd.get('valor_aquisicao') ? Number(fd.get('valor_aquisicao')) : undefined,
                      estado_conservacao: fd.get('estado_conservacao') || undefined,
                      localizacao_padrao: fd.get('localizacao_padrao'),
                      proxima_vistoria_em: fd.get('proxima_vistoria_em') || undefined,
                      ano_fabricacao: fd.get('ano_fabricacao') ? Number(fd.get('ano_fabricacao')) : undefined,
                      fornecedor: fd.get('fornecedor') || undefined,
                      nota_fiscal: fd.get('nota_fiscal') || undefined,
                      numero_serie: fd.get('numero_serie') || undefined,
                      garantia_ate: fd.get('garantia_ate') || undefined,
                      observacoes: fd.get('observacoes') || undefined,
                    });
                    setCriando(false);
                  }}
                >
                  Salvar e cadastrar outra
                </button>
                <button className="botao principal" form="form-cacamba" disabled={salvando}>
                  {salvando ? 'Cadastrando…' : 'Cadastrar caçamba'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {/* ═══ MODAL DE EDIÇÃO ═══ */}
      {editando && (
        <div className="modal-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setEditando(null)}>
          <section className="modal largo" role="dialog" aria-modal="true" aria-label={`Editar caçamba ${editando.codigo}`} style={{ width: 'min(820px, calc(100vw - 32px))' }}>
            <header className="modal-cabecalho-premium">
              <div className="modal-cabecalho-premium-esq">
                <h2>Editar caçamba {editando.codigo}</h2>
                <p>Atualize os dados cadastrais, características e situação patrimonial.</p>
              </div>
              <div className="modal-cabecalho-premium-dir">
                <span className="modal-cabecalho-premium-badge">{editando.patrimonio ? `Patrimônio ${editando.patrimonio}` : 'Sem patrimônio'}</span>
                <button className="modal-botao-fechar" aria-label="Fechar" onClick={() => setEditando(null)}>
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="modal-corpo">
              <form
                id="form-editar-cacamba"
                className="cacambas-form-grade"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const cap = fd.get('capacidade_m3') as string;
                  salvarEdicao({
                    codigo: fd.get('codigo'),
                    patrimonio: fd.get('patrimonio'),
                    identificacao_visual: fd.get('identificacao_visual'),
                    tipo: fd.get('tipo'),
                    modelo: fd.get('modelo'),
                    capacidade_m3: cap && cap !== 'outra' ? Number(cap) : (fd.get('capacidade_outra') ? Number(fd.get('capacidade_outra')) : undefined),
                    cor: fd.get('cor') === 'outra' ? fd.get('cor_outra') : fd.get('cor'),
                    data_aquisicao: fd.get('data_aquisicao') || undefined,
                    valor_aquisicao: fd.get('valor_aquisicao') ? Number(fd.get('valor_aquisicao')) : undefined,
                    estado_conservacao: fd.get('estado_conservacao') || undefined,
                    localizacao_padrao: fd.get('localizacao_padrao'),
                    proxima_vistoria_em: fd.get('proxima_vistoria_em') || undefined,
                    ano_fabricacao: fd.get('ano_fabricacao') ? Number(fd.get('ano_fabricacao')) : undefined,
                    fornecedor: fd.get('fornecedor') || undefined,
                    nota_fiscal: fd.get('nota_fiscal') || undefined,
                    garantia_ate: fd.get('garantia_ate') || undefined,
                    observacoes: fd.get('observacoes') || undefined,
                  });
                }}
              >
                {/* ── Identificação ──────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><Hash size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Identificação</span>
                      <span className="cacambas-form-secao-desc">Código único, patrimônio e dados de identificação.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Código único <span className="asterisco">*</span></label>
                  <div className="cacambas-input-envolve">
                    <Hash size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="codigo" required defaultValue={editando.codigo} />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Patrimônio</label>
                  <div className="cacambas-input-envolve">
                    <QrCode size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="patrimonio" defaultValue={editando.patrimonio || ''} />
                  </div>
                </div>

                <div className="campo campo-full">
                  <label className="cacambas-label">Identificação visual</label>
                  <div className="cacambas-input-envolve">
                    <Pencil size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="identificacao_visual" defaultValue={editando.identificacao_visual || ''} />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Número de série</label>
                  <input className="cacambas-input" name="numero_serie" defaultValue={''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                <div className="campo">
                  <label className="cacambas-label">Ano de fabricação</label>
                  <input className="cacambas-input" name="ano_fabricacao" type="number" min="2000" defaultValue={''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                {/* ── Características ─────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><HardHat size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Características</span>
                      <span className="cacambas-form-secao-desc">Tipo, capacidade e especificações físicas.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Tipo</label>
                  <select className="cacambas-select" name="tipo" defaultValue={editando.tipo || ''}>
                    <option value="">Selecione o tipo</option>
                    <option value="estacionaria">Estacionária</option>
                    <option value="roll_on_roll_off">Roll-on / Roll-off</option>
                    <option value="basculante">Basculante</option>
                    <option value="compactadora">Compactadora</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Modelo</label>
                  <input className="cacambas-input" name="modelo" defaultValue={editando.modelo || ''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                <div className="campo">
                  <label className="cacambas-label">Capacidade (m³)</label>
                  <select className="cacambas-select" name="capacidade_m3" defaultValue={editando.capacidade_m3 ? String(editando.capacidade_m3) : ''}>
                    <option value="">Selecione a capacidade</option>
                    {[3, 4, 5, 7, 10, 12].map((v) => (
                      <option key={v} value={v}>{v} m³</option>
                    ))}
                    <option value="outra">Outra capacidade</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Cor</label>
                  <select className="cacambas-select" name="cor" defaultValue={editando.cor || ''}>
                    <option value="">Selecione a cor</option>
                    {['Laranja', 'Amarela', 'Azul', 'Verde', 'Cinza', 'Branca'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="outra">Outra cor</option>
                  </select>
                </div>

                {/* ── Situação e localização ──────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><MapPin size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Situação e localização</span>
                      <span className="cacambas-form-secao-desc">Estado operacional, conservação e local de armazenamento.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Estado de conservação</label>
                  <select className="cacambas-select" name="estado_conservacao" defaultValue={editando.estado_conservacao || ''}>
                    <option value="">Selecione o estado</option>
                    <option value="nova">Nova</option>
                    <option value="excelente">Excelente</option>
                    <option value="bom">Bom</option>
                    <option value="regular">Regular</option>
                    <option value="ruim">Ruim</option>
                    <option value="inoperante">Inoperante</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Localização padrão</label>
                  <div className="cacambas-input-envolve">
                    <MapPin size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="localizacao_padrao" defaultValue={editando.localizacao_padrao || ''} />
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Data de aquisição</label>
                  <input className="cacambas-input" name="data_aquisicao" type="date" defaultValue={editando.data_aquisicao || ''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                <div className="campo">
                  <label className="cacambas-label">Próxima vistoria</label>
                  <input className="cacambas-input" name="proxima_vistoria_em" type="date" defaultValue={editando.proxima_vistoria_em || ''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                {/* ── Dados patrimoniais ──────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><DollarSign size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Dados patrimoniais</span>
                      <span className="cacambas-form-secao-desc">Informações de aquisição, fornecedor e garantia.</span>
                    </div>
                  </div>
                </div>

                <div className="campo">
                  <label className="cacambas-label">Valor de aquisição (R$)</label>
                  <input className="cacambas-input" name="valor_aquisicao" type="number" step="0.01" min="0" defaultValue={editando.valor_aquisicao || ''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                <div className="campo">
                  <label className="cacambas-label">Fornecedor</label>
                  <input className="cacambas-input" name="fornecedor" defaultValue={''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                <div className="campo">
                  <label className="cacambas-label">Nota fiscal</label>
                  <input className="cacambas-input" name="nota_fiscal" defaultValue={''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                <div className="campo">
                  <label className="cacambas-label">Garantia até</label>
                  <input className="cacambas-input" name="garantia_ate" type="date" defaultValue={''} style={{ border: '1px solid #D8DEE8', borderRadius: '10px', height: '46px', padding: '0 14px', width: '100%' }} />
                </div>

                {/* ── Observações ──────────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><Pencil size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Observações</span>
                      <span className="cacambas-form-secao-desc">Informações internas e restrições.</span>
                    </div>
                  </div>
                </div>

                <div className="campo campo-full">
                  <textarea
                    className="cacambas-textarea"
                    name="observacoes"
                    defaultValue={editando.observacoes || ''}
                    placeholder="Descreva avarias, restrições, adaptações…"
                    maxLength={1500}
                    style={{ marginTop: 0 }}
                  />
                </div>
              </form>
            </div>

            <footer className="modal-rodape-premium">
              <span className="modal-rodape-premium-esq">* Campos obrigatórios</span>
              <div className="modal-rodape-premium-dir">
                <button className="botao" onClick={() => setEditando(null)}>Cancelar</button>
                <button className="botao principal" form="form-editar-cacamba" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
