import {
  AlertTriangle, Award, BookOpen, Calendar, Camera, CheckCircle2, ChevronDown, Clock,
  FileDown, Grid3X3, HardHat, IdCard, LayoutList, MapPin, MoreHorizontal, Pencil, Plus,
  QrCode, Search, ShieldAlert, Star, Truck, Upload, UserCheck, Users, Wrench, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import {
  CabecalhoPagina, Carregando, Chip, ErroEstado, Esqueleto, Modal,
  Paginacao, Vazio,
} from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import { formatarData, iniciais } from '../utils';

type Habilitacao = {
  id: string;
  user_id: string;
  nome: string;
  matricula?: string | null;
  email?: string | null;
  perfil?: string | null;
  funcao?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  cnh_vencida: boolean;
  dias_para_vencer_cnh?: number | null;
  opera_maquinas: boolean;
  dirige_veiculos: boolean;
  categorias_autorizadas: string[];
  maquinas_autorizadas: string[];
  veiculos_autorizados: string[];
  cursos: { nome: string; validade?: string }[];
  afastamentos: { motivo: string; inicio: string; fim?: string }[];
  jornada_inicio?: string | null;
  jornada_fim?: string | null;
  jornada_maxima_horas?: number | null;
  escala?: string | null;
  situacao: string;
  observacoes?: string | null;
  alertas: string[];
  created_at: string;
};

type Visualizacao = 'cards' | 'lista';

/* ══════════════════════════════════════════════════════════════════════════════
   Operadores — Centro de Gestão de Operadores
   ══════════════════════════════════════════════════════════════════════════════ */

export function Operadores() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [dados, setDados] = useState<Habilitacao[] | null>(null);
  const [servidores, setServidores] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [maquinasDisponiveis, setMaquinasDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [equipamentosSel, setEquipamentosSel] = useState<Set<string>>(new Set());
  const [servidorBusca, setServidorBusca] = useState('');
  const [servidorSelecionado, setServidorSelecionado] = useState<any>(null);
  const [modo, setModo] = useState<Visualizacao>(
    (localStorage.getItem('operadores.modo') as Visualizacao) || 'cards',
  );
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'cnh_vencida' | 'afastados' | 'operadores' | 'motoristas'>('todos');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const canManage = pode('govinfra.operadores.gerenciar');

  function carregar() {
    setErro('');
    const qs = new URLSearchParams({ por_pagina: '100' });
    if (termo) qs.set('termo', termo);
    if (filtro === 'operadores') qs.set('apenas_operadores', 'true');
    if (filtro === 'motoristas') qs.set('apenas_motoristas', 'true');
    api.get<{ itens: Habilitacao[] }>(`/operadores?${qs.toString()}`)
      .then((r) => setDados(r.itens))
      .catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(); }, [filtro]);

  const debounceBusca = useCallback((valor: string) => {
    setTermo(valor);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => carregar(), 300);
  }, [filtro]);

  async function abrirCriar() {
    setCriando(true);
    setEquipamentosSel(new Set());
    setServidorBusca('');
    setServidorSelecionado(null);
    try {
      const [s, m] = await Promise.all([
        api.get<any[]>('/operadores/servidores'),
        api.get<{ itens: { id: string; nome: string }[] }>('/maquinas?por_pagina=100'),
      ]);
      setServidores(s);
      setMaquinasDisponiveis(m.itens || []);
    } catch { setServidores([]); setMaquinasDisponiveis([]); }
  }

  function mudarModo(novo: Visualizacao) {
    setModo(novo);
    localStorage.setItem('operadores.modo', novo);
  }

  /* ── Filtro local ──────────────────────────────────────────────────────── */

  const dadosFiltrados = useMemo(() => {
    if (!dados) return null;
    let lista = dados;
    if (filtro === 'ativos') lista = lista.filter((h) => h.situacao === 'ativa');
    if (filtro === 'cnh_vencida') lista = lista.filter((h) => h.cnh_vencida);
    if (filtro === 'afastados') lista = lista.filter((h) => h.afastamentos.length > 0);
    if (termo) {
      const t = termo.toLowerCase();
      lista = lista.filter((h) =>
        h.nome.toLowerCase().includes(t) ||
        (h.matricula || '').includes(t) ||
        (h.email || '').toLowerCase().includes(t) ||
        (h.funcao || '').toLowerCase().includes(t),
      );
    }
    return lista;
  }, [dados, filtro, termo]);

  /* ── KPIs ──────────────────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    if (!dados) return { total: 0, ativos: 0, cnhVencida: 0, cnhVence30: 0, afastados: 0 };
    return {
      total: dados.length,
      ativos: dados.filter((h) => h.situacao === 'ativa').length,
      cnhVencida: dados.filter((h) => h.cnh_vencida).length,
      cnhVence30: dados.filter((h) => h.dias_para_vencer_cnh !== null && h.dias_para_vencer_cnh !== undefined && h.dias_para_vencer_cnh >= 0 && h.dias_para_vencer_cnh <= 30).length,
      afastados: dados.filter((h) => h.afastamentos.length > 0).length,
    };
  }, [dados]);

  /* ── Cor da situação ───────────────────────────────────────────────────── */

  function corSituacaoOp(h: Habilitacao): string {
    if (h.cnh_vencida) return 'vermelho';
    if (h.dias_para_vencer_cnh !== null && h.dias_para_vencer_cnh !== undefined && h.dias_para_vencer_cnh <= 15) return 'amarelo';
    if (h.situacao === 'ativa') return 'verde';
    if (h.situacao === 'suspensa') return 'laranja';
    if (h.situacao === 'inativa') return 'cinza';
    return 'cinza';
  }

  function rotuloSituacaoOp(h: Habilitacao): string {
    if (h.cnh_vencida) return 'CNH vencida';
    if (h.dias_para_vencer_cnh !== null && h.dias_para_vencer_cnh !== undefined && h.dias_para_vencer_cnh <= 15) return `CNH vence em ${h.dias_para_vencer_cnh} dias`;
    if (h.afastamentos.length > 0) return 'Afastado';
    return h.situacao === 'ativa' ? 'Ativo' : h.situacao;
  }

  /* ── Modal de criação ──────────────────────────────────────────────────── */

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post('/operadores', {
        user_id: fd.get('user_id'),
        funcao: fd.get('funcao'),
        cnh_numero: fd.get('cnh_numero'),
        cnh_categoria: fd.get('cnh_categoria'),
        cnh_validade: fd.get('cnh_validade') || undefined,
        opera_maquinas: fd.get('opera_maquinas') === 'on',
        dirige_veiculos: fd.get('dirige_veiculos') === 'on',
        maquinas_autorizadas: fd.get('opera_maquinas') === 'on' ? [...equipamentosSel] : [],
        jornada_inicio: fd.get('jornada_inicio') || undefined,
        jornada_fim: fd.get('jornada_fim') || undefined,
        jornada_maxima_horas: Number(fd.get('jornada_maxima_horas')) || 8,
        escala: fd.get('escala') || undefined,
        observacoes: fd.get('observacoes') || undefined,
        situacao: fd.get('situacao') || 'ativa',
      });
      avisar('sucesso', 'Habilitação criada.');
      setCriando(false);
      carregar();
    } catch (err: any) { avisar('erro', err.message); }
    finally { setSalvando(false); }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div>
      {/* ═══ BREADCRUMB ═══ */}
      <nav className="trilha" aria-label="Navegação">
        <a href="/govinfra/dashboard">Operação</a> › <a href="/govinfra/maquinas">Frota</a> › <span className="atual">Operadores</span>
      </nav>

      {/* ═══ CABEÇALHO ═══ */}
      <CabecalhoPagina
        titulo="Operadores"
        descricao="Servidores habilitados para operar máquinas e dirigir veículos, com controle de CNH, treinamentos e disponibilidade."
        acoes={canManage && (
          <button className="botao principal" onClick={abrirCriar}>
            <Plus size={17} /> Habilitar servidor
          </button>
        )}
      />

      {/* ═══ KPIs ═══ */}
      {dados && dados.length > 0 && (
        <div className="cacambas-stats">
          <button className={`cacambas-stat ${filtro === 'todos' ? 'ativo' : ''}`} onClick={() => setFiltro('todos')}>
            <span className="cacambas-stat-icone"><Users size={15} /></span>
            <span className="cacambas-stat-valor">{kpis.total}</span>
            <span className="cacambas-stat-rotulo">Total</span>
          </button>
          <button className={`cacambas-stat verde ${filtro === 'ativos' ? 'ativo' : ''}`} onClick={() => setFiltro(filtro === 'ativos' ? 'todos' : 'ativos')}>
            <span className="cacambas-stat-icone"><CheckCircle2 size={15} /></span>
            <span className="cacambas-stat-valor">{kpis.ativos}</span>
            <span className="cacambas-stat-rotulo">Ativos</span>
          </button>
          <button className={`cacambas-stat vermelho ${filtro === 'cnh_vencida' ? 'ativo' : ''}`} onClick={() => setFiltro(filtro === 'cnh_vencida' ? 'todos' : 'cnh_vencida')}>
            <span className="cacambas-stat-icone"><AlertTriangle size={15} /></span>
            <span className="cacambas-stat-valor">{kpis.cnhVencida}</span>
            <span className="cacambas-stat-rotulo">CNH vencida</span>
          </button>
          <button className={`cacambas-stat amarelo`}>
            <span className="cacambas-stat-icone"><Clock size={15} /></span>
            <span className="cacambas-stat-valor">{kpis.cnhVence30}</span>
            <span className="cacambas-stat-rotulo">CNH vence 30d</span>
          </button>
          <button className={`cacambas-stat laranja ${filtro === 'afastados' ? 'ativo' : ''}`} onClick={() => setFiltro(filtro === 'afastados' ? 'todos' : 'afastados')}>
            <span className="cacambas-stat-icone"><ShieldAlert size={15} /></span>
            <span className="cacambas-stat-valor">{kpis.afastados}</span>
            <span className="cacambas-stat-rotulo">Afastados</span>
          </button>
        </div>
      )}

      {/* ═══ BUSCA ═══ */}
      <div className="cacambas-busca">
        <Search size={19} />
        <input
          value={termo}
          onChange={(e) => debounceBusca(e.target.value)}
          placeholder="Buscar servidor, matrícula, CPF ou CNH…"
          aria-label="Buscar operador"
        />
        {termo && (
          <button className="cacambas-busca-limpar" onClick={() => { setTermo(''); carregar(); }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* ═══ CHIPS DE FILTRO ═══ */}
      <div className="cacambas-chips">
        {[
          { chave: 'todos', rotulo: 'Todos' },
          { chave: 'ativos', rotulo: 'Ativos' },
          { chave: 'cnh_vencida', rotulo: 'CNH vencida' },
          { chave: 'afastados', rotulo: 'Afastados' },
          { chave: 'operadores', rotulo: 'Operadores' },
          { chave: 'motoristas', rotulo: 'Motoristas' },
        ].map(({ chave, rotulo }) => (
          <button
            key={chave}
            className={`cacambas-chip${filtro === chave ? ' ativo' : ''}`}
            onClick={() => setFiltro(chave as any)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="cacambas-toolbar">
        <div className="cacambas-toolbar-esq">
          {dadosFiltrados && (
            <span className="cacambas-contador">
              {dadosFiltrados.length} operador{dadosFiltrados.length !== 1 ? 'es' : ''} encontrado{dadosFiltrados.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="cacambas-toolbar-dir">
          <div className="cacambas-alternador">
            <button className={modo === 'cards' ? 'ativo' : ''} onClick={() => mudarModo('cards')} title="Cards">
              <Grid3X3 size={16} />
            </button>
            <button className={modo === 'lista' ? 'ativo' : ''} onClick={() => mudarModo('lista')} title="Lista">
              <LayoutList size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ CONTEÚDO ═══ */}
      {erro && <ErroEstado mensagem={erro} tentar={carregar} />}
      {!dados && !erro && (
        <div className="cacambas-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cacambas-skeleton-card"><Esqueleto linhas={3} /></div>
          ))}
        </div>
      )}
      {dadosFiltrados && dadosFiltrados.length === 0 && (
        <div className="cacambas-vazio">
          <Users size={48} />
          <h3>Nenhum operador encontrado</h3>
          <p>
            {termo || filtro !== 'todos'
              ? 'Nenhum resultado para os filtros aplicados. Tente ajustar a busca ou limpar os filtros.'
              : 'Cadastre servidores para controlar CNH, categorias, máquinas habilitadas, treinamentos e disponibilidade operacional.'}
          </p>
          <div className="cacambas-vazio-acoes">
            {canManage && (
              <button className="botao principal" onClick={abrirCriar}>
                <Plus size={16} /> Habilitar primeiro servidor
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      {dadosFiltrados && dadosFiltrados.length > 0 && modo === 'cards' && (
        <div className="cacambas-grade">
          {dadosFiltrados.map((h) => (
            <article key={h.id} className="cacambas-card" onClick={() => navegar(`/govinfra/operadores/${h.id}`)}>
              <div className="cacambas-card-cabecalho">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="porteira-beneficiario-avatar" style={{ width: 42, height: 42 }}>
                    {iniciais(h.nome)}
                  </div>
                  <div className="cacambas-card-nome">
                    <span className="cacambas-card-codigo">{h.nome}</span>
                    <span className="cacambas-card-modelo">
                      {h.matricula ? `Matrícula ${h.matricula}` : h.email}
                    </span>
                  </div>
                </div>
                <Chip cor={corSituacaoOp(h)}>{rotuloSituacaoOp(h)}</Chip>
              </div>
              <div className="cacambas-card-corpo">
                {h.funcao && (
                  <div className="cacambas-card-linha">
                    <HardHat size={14} /> <span>{h.funcao}</span>
                  </div>
                )}
                {h.cnh_categoria && (
                  <div className="cacambas-card-linha">
                    <Truck size={14} /> <span>CNH {h.cnh_categoria} · até {formatarData(h.cnh_validade)}</span>
                  </div>
                )}
                {(h.maquinas_autorizadas || []).length > 0 && (
                  <div className="cacambas-card-linha">
                    <Wrench size={14} /> <span>{h.maquinas_autorizadas.slice(0, 3).join(', ')}</span>
                  </div>
                )}
                {(h.veiculos_autorizados || []).length > 0 && (
                  <div className="cacambas-card-linha">
                    <Truck size={14} /> <span>{h.veiculos_autorizados.slice(0, 3).join(', ')}</span>
                  </div>
                )}
                {h.alertas.length > 0 && (
                  <div className="cacambas-card-linha atraso">
                    <AlertTriangle size={14} /> <span>{h.alertas[0]}</span>
                  </div>
                )}
              </div>
              <div className="cacambas-card-rodape">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {h.opera_maquinas && <Chip cor="azul">Opera máquinas</Chip>}
                  {h.dirige_veiculos && <Chip cor="roxo">Dirige veículos</Chip>}
                  {h.escala && <Chip cor="cinza">{h.escala}</Chip>}
                </div>
                <button className="botao pequeno sutil" onClick={(e) => { e.stopPropagation(); navegar(`/govinfra/operadores/${h.id}`); }}>
                  Ver ficha <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      {dadosFiltrados && dadosFiltrados.length > 0 && modo === 'lista' && (
        <>
          <div className="tabela-envolve">
            <table className="tabela tabela-clicavel">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Servidor</th>
                  <th>Matrícula</th>
                  <th>Função</th>
                  <th>CNH</th>
                  <th>Validade CNH</th>
                  <th>Opera</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dadosFiltrados.map((h) => (
                  <tr key={h.id} onClick={() => navegar(`/govinfra/operadores/${h.id}`)}>
                    <td>
                      <div className="porteira-beneficiario-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                        {iniciais(h.nome)}
                      </div>
                    </td>
                    <td><strong>{h.nome}</strong></td>
                    <td>{h.matricula || '—'}</td>
                    <td>{h.funcao || '—'}</td>
                    <td>{h.cnh_categoria || '—'}</td>
                    <td>{formatarData(h.cnh_validade)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {h.opera_maquinas && <Chip cor="azul">Máquinas</Chip>}
                        {h.dirige_veiculos && <Chip cor="roxo">Veículos</Chip>}
                      </div>
                    </td>
                    <td><Chip cor={corSituacaoOp(h)}>{rotuloSituacaoOp(h)}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ MODAL DE CRIAÇÃO ═══ */}
      {criando && (
        <div className="modal-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCriando(false)}>
          <section className="modal largo" role="dialog" aria-modal="true" aria-label="Habilitar operador" style={{ width: 'min(860px, calc(100vw - 32px))' }}>
            <header className="modal-cabecalho-premium">
              <div className="modal-cabecalho-premium-esq">
                <h2>Habilitar operador</h2>
                <p>Configure permissões, CNH, jornada e equipamentos autorizados.</p>
              </div>
              <button className="modal-botao-fechar" aria-label="Fechar" onClick={() => setCriando(false)}>
                <X size={18} />
              </button>
            </header>

            <div className="modal-corpo" style={{ padding: '20px 24px' }}>
              <form id="form-habilitacao" className="cacambas-form-grade" onSubmit={criar}>
                {/* ── Seção: Dados do servidor ─────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><UserCheck size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Dados do servidor</span>
                      <span className="cacambas-form-secao-desc">Selecione o servidor municipal e sua função operacional.</span>
                    </div>
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Servidor <span className="asterisco">*</span></label>
                  <select className="cacambas-select" name="user_id" required onChange={(e) => {
                    const sel = servidores.find((s: any) => s.id === e.target.value);
                    setServidorSelecionado(sel || null);
                  }}>
                    <option value="">Selecione o servidor…</option>
                    {servidores
                      .filter((s: any) => !servidorBusca || s.nome.toLowerCase().includes(servidorBusca.toLowerCase()))
                      .map((s: any) => (
                        <option key={s.id} value={s.id} disabled={s.ja_habilitado}>
                          {s.nome}{s.matricula ? ` — Matrícula ${s.matricula}` : ''}{s.ja_habilitado ? ' (já habilitado)' : ''}
                        </option>
                      ))}
                  </select>
                  {servidorSelecionado && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--laranja-50)', borderRadius: 8, border: '1px solid var(--laranja-200)', fontSize: 12.5 }}>
                      <div className="porteira-beneficiario-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{iniciais(servidorSelecionado.nome)}</div>
                      <div>
                        <strong>{servidorSelecionado.nome}</strong>
                        <div style={{ color: 'var(--cinza-500)' }}>{servidorSelecionado.matricula ? `Matrícula ${servidorSelecionado.matricula}` : servidorSelecionado.email} · {servidorSelecionado.perfil_rotulo}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="campo">
                  <label className="cacambas-label">Função operacional</label>
                  <select className="cacambas-select" name="funcao">
                    <option value="">Selecione a função…</option>
                    <option value="Motorista">Motorista</option>
                    <option value="Operador de máquinas">Operador de máquinas</option>
                    <option value="Operador/Motorista">Operador / Motorista</option>
                    <option value="Auxiliar operacional">Auxiliar operacional</option>
                    <option value="Encarregado de frota">Encarregado de frota</option>
                    <option value="Servidor">Servidor</option>
                  </select>
                </div>

                {/* ── Seção: CNH ──────────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><IdCard size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">CNH</span>
                      <span className="cacambas-form-secao-desc">Número, categoria e validade da habilitação.</span>
                    </div>
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Número da CNH</label>
                  <div className="cacambas-input-envolve">
                    <IdCard size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="cnh_numero" placeholder="00000000000" maxLength={20} />
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Categoria CNH</label>
                  <select className="cacambas-select" name="cnh_categoria">
                    <option value="">Sem CNH</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                    <option value="C">C</option>
                    <option value="AC">AC</option>
                    <option value="D">D</option>
                    <option value="AD">AD</option>
                    <option value="E">E</option>
                    <option value="AE">AE</option>
                  </select>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Validade da CNH</label>
                  <div className="cacambas-input-envolve">
                    <Calendar size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="cnh_validade" type="date" />
                  </div>
                </div>

                {/* ── Seção: Jornada ───────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><Clock size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Jornada</span>
                      <span className="cacambas-form-secao-desc">Horário de trabalho, carga diária e escala.</span>
                    </div>
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Horário início</label>
                  <div className="cacambas-input-envolve">
                    <Clock size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="jornada_inicio" type="time" />
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Horário fim</label>
                  <div className="cacambas-input-envolve">
                    <Clock size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="jornada_fim" type="time" />
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Carga diária (h)</label>
                  <div className="cacambas-input-envolve">
                    <Clock size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="jornada_maxima_horas" type="number" min="1" max="16" defaultValue={8} />
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Escala</label>
                  <select className="cacambas-select" name="escala">
                    <option value="">Selecione…</option>
                    <option value="seg-sex">Segunda a Sexta</option>
                    <option value="12x36">12x36</option>
                    <option value="24x72">24x72</option>
                    <option value="especial">Escala especial</option>
                  </select>
                </div>

                {/* ── Seção: Permissões ────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><ShieldAlert size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Permissões</span>
                      <span className="cacambas-form-secao-desc">Tipos de equipamentos e veículos que o servidor pode operar.</span>
                    </div>
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Dirige veículos</label>
                  <select className="cacambas-select" name="dirige_veiculos">
                    <option value="off">Não</option>
                    <option value="on">Sim — habilitado para dirigir veículos</option>
                  </select>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Opera máquinas</label>
                  <select className="cacambas-select" name="opera_maquinas">
                    <option value="off">Não</option>
                    <option value="on">Sim — habilitado para operar máquinas</option>
                  </select>
                </div>

                {maquinasDisponiveis.length > 0 && (
                  <div className="campo campo-full">
                    <label className="cacambas-label">Equipamentos autorizados</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {maquinasDisponiveis.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`cadastro-chip ${equipamentosSel.has(m.nome) ? 'ativo' : ''}`}
                          onClick={() => {
                            setEquipamentosSel((prev) => {
                              const novo = new Set(prev);
                              if (novo.has(m.nome)) novo.delete(m.nome); else novo.add(m.nome);
                              return novo;
                            });
                          }}
                        >
                          {m.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Seção: Status ────────────────────────────────────── */}
                <div className="cacambas-form-secao">
                  <div className="cacambas-form-secao-header">
                    <div className="cacambas-form-secao-icone"><CheckCircle2 size={17} /></div>
                    <div className="cacambas-form-secao-texto">
                      <span className="cacambas-form-secao-titulo">Status e observações</span>
                      <span className="cacambas-form-secao-desc">Situação atual e informações complementares.</span>
                    </div>
                  </div>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Situação</label>
                  <select className="cacambas-select" name="situacao" defaultValue="ativa">
                    <option value="ativa">Ativo</option>
                    <option value="suspensa">Suspenso</option>
                    <option value="inativa">Inativo</option>
                  </select>
                </div>
                <div className="campo">
                  <label className="cacambas-label">Observações</label>
                  <div className="cacambas-input-envolve" style={{ height: 'auto', padding: '10px 14px' }}>
                    <Pencil size={16} className="cadastro-input-icone" />
                    <input className="cacambas-input" name="observacoes" placeholder="Restrições, treinamentos pendentes…" />
                  </div>
                </div>
              </form>
            </div>

            <footer className="modal-rodape-premium">
              <span className="modal-rodape-premium-esq">* Campos obrigatórios</span>
              <div className="modal-rodape-premium-dir">
                <button className="botao" onClick={() => setCriando(false)}>Cancelar</button>
                <button className="botao" form="form-habilitacao" onClick={() => {
                  const f = document.getElementById('form-habilitacao') as HTMLFormElement;
                  if (!f) return;
                  f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }}>
                  Salvar e cadastrar outro
                </button>
                <button className="botao principal" form="form-habilitacao" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar habilitação'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
