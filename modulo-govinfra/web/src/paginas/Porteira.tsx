import {
  AlertTriangle, ArrowUpRight, BookOpen, Calendar, CheckCircle2,
  Clock, FileText, FolderKanban, Hash, History, ListChecks, MapPin, Plus,
  RefreshCw, Search, Settings, Tractor, TrendingUp, UserCheck, Users,
  Wrench, X, HardHat,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import {
  CabecalhoPagina, Carregando, Chip, ErroEstado, Esqueleto, Modal, Vazio,
} from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Beneficiario, Dashboard, Maquina, Programa } from '../types';
import { formatarData, formatarDinheiro, iniciais } from '../utils';

/* ══════════════════════════════════════════════════════════════════════════════
   Porteira Adentro — Dashboard do Programa
   ══════════════════════════════════════════════════════════════════════════════ */

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function Porteira() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const navegar = useNavigate();

  const [painel, setPainel] = useState<Dashboard | null>(null);
  const [programas, setProgramas] = useState<Programa[] | null>(null);
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[] | null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [erro, setErro] = useState('');
  const [termo, setTermo] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'com_saldo' | 'sem_saldo' | 'esgotado'>('todos');

  const [criandoPrograma, setCriandoPrograma] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    api.get<Dashboard>('/dashboard?dias=7')
      .then(setPainel)
      .catch((e) => setErro(e.message));
    api.get<Programa[]>('/porteira/programas')
      .then(setProgramas)
      .catch(() => {});
    api.get<{ itens: Beneficiario[] }>('/porteira/beneficiarios?por_pagina=100')
      .then((r) => setBeneficiarios(r.itens))
      .catch(() => {});
    api.get<{ itens: Maquina[] }>('/maquinas?por_pagina=50')
      .then((r) => setMaquinas(r.itens))
      .catch(() => {});
  }, [recarga]);

  const p = painel?.porteira;

  /* ── Beneficiários filtrados ───────────────────────────────────────────── */

  const beneficiariosFiltrados = useMemo(() => {
    let lista = beneficiarios || [];
    if (filtro === 'com_saldo') lista = lista.filter((b) => b.saldo_total_disponivel > 0);
    if (filtro === 'sem_saldo') lista = lista.filter((b) => b.saldo_total_disponivel === 0);
    if (filtro === 'esgotado') lista = lista.filter((b) => b.saldo_total_disponivel <= 0);
    if (termo) {
      const t = termo.toLowerCase();
      lista = lista.filter(
        (b) =>
          (b.pessoa?.nome || '').toLowerCase().includes(t) ||
          (b.pessoa?.documento || '').includes(t) ||
          (b.classificacao || '').toLowerCase().includes(t) ||
          (b.atividade_produtiva || '').toLowerCase().includes(t),
      );
    }
    return lista;
  }, [beneficiarios, filtro, termo]);

  /* ── Alertas ───────────────────────────────────────────────────────────── */

  const alertas = useMemo(() => {
    const lista: { nivel: string; texto: string }[] = [];
    if (p) {
      if (p.solicitacoes_pendentes > 0)
        lista.push({ nivel: 'atencao', texto: `${p.solicitacoes_pendentes} solicitações pendentes` });
      if (p.aguardando_vistoria > 0)
        lista.push({ nivel: 'atencao', texto: `${p.aguardando_vistoria} aguardando vistoria` });
      if (p.maquinas_em_manutencao > 0)
        lista.push({ nivel: 'critico', texto: `${p.maquinas_em_manutencao} máquinas em manutenção` });
    }
    return lista;
  }, [p]);

  /* ── Agenda semanal simulada ───────────────────────────────────────────── */

  const agendaSemanal = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - hoje.getDay() + i);
      return { rotulo: DIAS_SEMANA[dia.getDay()], qtde: Math.floor(Math.random() * 6) + (i === hoje.getDay() ? 2 : 0) };
    });
  }, [recarga]);

  /* ── Máquinas resumidas ────────────────────────────────────────────────── */

  const maquinasResumo = useMemo(() => {
    return (maquinas || []).slice(0, 5).map((m) => ({
      ...m,
      cor: m.situacao === 'disponivel' ? 'verde' : m.situacao === 'em_operacao' ? 'azul' : m.situacao.includes('manutencao') ? 'vermelho' : 'cinza',
    }));
  }, [maquinas]);

  /* ── Programa ativo ────────────────────────────────────────────────────── */

  const programaAtivo = (programas || []).find((prog) => prog.ativo);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (erro) return <ErroEstado mensagem={erro} tentar={() => window.location.reload()} />;
  if (!painel || !programas) return <Carregando texto="Carregando painel…" />;

  return (
    <div>
      {/* ═══ CABEÇALHO ═══ */}
      <div className="porteira-cabecalho">
        <div>
          <h1>Porteira Adentro</h1>
          <p>Programa Municipal de Apoio ao Produtor Rural — controle de horas, máquinas e serviços.</p>
        </div>
        <div className="porteira-cabecalho-acoes">
          <button className="botao principal" onClick={() => navegar('/govinfra/porteira/solicitacoes/nova')}>
            <Plus size={16} /> Nova solicitação
          </button>
          {pode('govinfra.configuracoes.editar') && (
            <button className="botao" onClick={() => setCriandoPrograma(true)}>
              <Plus size={16} /> Novo programa
            </button>
          )}
          <button className="botao sutil" onClick={() => navegar('/govinfra/relatorios')}>
            <FileText size={16} /> Relatórios
          </button>
          <button className="botao sutil" onClick={() => navegar('/govinfra/configuracoes')}>
            <Settings size={16} />
          </button>
          <button className="botao pequeno sutil" onClick={() => setRecarga((r) => r + 1)} title="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ═══ INDICADORES ═══ */}
      <div className="porteira-stats">
        <button className="porteira-stat" onClick={() => navegar('/govinfra/porteira')}>
          <span className="porteira-stat-icone"><FolderKanban size={16} /></span>
          <span className="porteira-stat-valor">{programas.filter((prog) => prog.ativo).length}</span>
          <span className="porteira-stat-rotulo">Programas ativos</span>
        </button>
        <button className="porteira-stat verde" onClick={() => navegar('/govinfra/porteira')}>
          <span className="porteira-stat-icone"><Users size={16} /></span>
          <span className="porteira-stat-valor">{beneficiarios?.length ?? 0}</span>
          <span className="porteira-stat-rotulo">Produtores</span>
        </button>
        <button className="porteira-stat laranja" onClick={() => navegar('/govinfra/porteira/solicitacoes?situacao=protocolada')}>
          <span className="porteira-stat-icone"><Clock size={16} /></span>
          <span className="porteira-stat-valor">{p?.solicitacoes_pendentes ?? 0}</span>
          <span className="porteira-stat-rotulo">Pendentes</span>
        </button>
        <button className="porteira-stat azul" onClick={() => navegar('/govinfra/ordens?situacao=em_execucao')}>
          <span className="porteira-stat-icone"><Tractor size={16} /></span>
          <span className="porteira-stat-valor">{p?.em_execucao ?? 0}</span>
          <span className="porteira-stat-rotulo">Em execução</span>
        </button>
        <button className="porteira-stat azul" onClick={() => navegar('/govinfra/relatorios')}>
          <span className="porteira-stat-icone"><TrendingUp size={16} /></span>
          <span className="porteira-stat-valor">{p?.horas_utilizadas ?? 0}h</span>
          <span className="porteira-stat-rotulo">Horas utilizadas</span>
        </button>
        <button className="porteira-stat verde">
          <span className="porteira-stat-icone"><CheckCircle2 size={16} /></span>
          <span className="porteira-stat-valor">{((p?.horas_autorizadas ?? 0) - (p?.horas_utilizadas ?? 0)).toFixed(0)}h</span>
          <span className="porteira-stat-rotulo">Horas disponíveis</span>
        </button>
        <button className="porteira-stat azul" onClick={() => navegar('/govinfra/maquinas')}>
          <span className="porteira-stat-icone"><Tractor size={16} /></span>
          <span className="porteira-stat-valor">{p?.maquinas_disponiveis ?? 0}</span>
          <span className="porteira-stat-rotulo">Máq. em operação</span>
        </button>
        <button className="porteira-stat roxo" onClick={() => navegar('/govinfra/porteira/solicitacoes?situacao=concluida')}>
          <span className="porteira-stat-icone"><CheckCircle2 size={16} /></span>
          <span className="porteira-stat-valor">{p?.concluidos_periodo ?? 0}</span>
          <span className="porteira-stat-rotulo">Serviços concluídos</span>
        </button>
      </div>

      {/* ═══ ALERTAS ═══ */}
      {alertas.length > 0 && (
        <div className="cacambas-alertas">
          {alertas.map((a, i) => (
            <button
              key={i}
              className={`cacambas-alerta ${a.nivel}`}
              onClick={() => navegar('/govinfra/porteira/solicitacoes')}
            >
              <AlertTriangle size={13} /> {a.texto}
            </button>
          ))}
        </div>
      )}

      {/* ═══ LAYOUT PRINCIPAL 70/30 ═══ */}
      <div className="porteira-grid">
        {/* ── COLUNA ESQUERDA ──────────────────────────────────────────────── */}
        <div className="porteira-principal">
          {/* ── Programa ativo ──────────────────────────────────────────────── */}
          {programaAtivo ? (
            <div className="porteira-programa-card">
              <div className="porteira-programa-esq">
                <div className="porteira-programa-nome">
                  <FolderKanban size={18} style={{ color: 'var(--laranja-600)' }} />
                  {programaAtivo.nome}
                </div>
                <div className="porteira-programa-info">
                  <span><Hash size={13} /> {programaAtivo.chave}</span>
                  <span><Calendar size={13} /> {formatarData(programaAtivo.vigencia_inicio)} até {formatarData(programaAtivo.vigencia_fim)}</span>
                  <span><Clock size={13} /> {programaAtivo.horas_por_beneficiario ?? 0}h por produtor</span>
                  <span>
                    <Users size={13} /> {programaAtivo.beneficiarios ?? 0} produtores vinculados
                  </span>
                </div>
              </div>
              <div className="porteira-programa-acoes">
                <Chip cor="verde">Ativo</Chip>
                <button className="botao pequeno" onClick={() => navegar('/govinfra/porteira/solicitacoes/nova')}>
                  <Plus size={13} /> Nova solicitação
                </button>
              </div>
            </div>
          ) : (
            <div className="porteira-programa-vazio">
              <FolderKanban size={36} />
              <h3>Nenhum programa ativo</h3>
              <p>
                Cadastre o primeiro programa municipal para começar a controlar horas autorizadas,
                produtores, máquinas, serviços e custos operacionais.
              </p>
              {pode('govinfra.configuracoes.editar') && (
                <button className="botao principal" onClick={() => setCriandoPrograma(true)}>
                  <Plus size={16} /> Criar primeiro programa
                </button>
              )}
            </div>
          )}

          {/* ── Todos os programas ──────────────────────────────────────────── */}
          {programas.length > 1 && (
            <div className="porteira-secao">
              <div className="porteira-secao-titulo">
                <FolderKanban size={16} /> Programas
                <span className="porteira-secao-contador">{programas.length} cadastrados</span>
              </div>
              <div className="porteira-programas-grade">
                {programas.map((prog) => (
                  <div key={prog.id} className="porteira-programa-mini">
                    <div className="porteira-programa-mini-topo">
                      <span className="porteira-programa-mini-nome">{prog.nome}</span>
                      <Chip cor={prog.ativo ? 'verde' : 'cinza'}>{prog.ativo ? 'Ativo' : 'Inativo'}</Chip>
                    </div>
                    <div className="porteira-programa-mini-info">
                      <span><Users size={12} /> {prog.beneficiarios ?? 0} produtores</span>
                      <span><Clock size={12} /> {prog.horas_utilizadas ?? 0}h de {prog.horas_concedidas ?? 0}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Beneficiários ───────────────────────────────────────────────── */}
          <div className="porteira-secao">
            <div className="porteira-secao-titulo">
              <Users size={16} /> Produtores vinculados
              <span className="porteira-secao-contador">{beneficiariosFiltrados.length} encontrados</span>
            </div>

            <div className="porteira-busca">
              <Search size={16} />
              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Pesquisar produtor, CPF, protocolo, comunidade…"
                aria-label="Buscar produtor"
              />
              {termo && (
                <button className="cacambas-busca-limpar" onClick={() => setTermo('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="porteira-beneficiario-chips">
              {[
                { chave: 'todos', rotulo: 'Todos' },
                { chave: 'com_saldo', rotulo: 'Com saldo' },
                { chave: 'sem_saldo', rotulo: 'Sem saldo' },
                { chave: 'esgotado', rotulo: 'Horas esgotadas' },
              ].map(({ chave, rotulo }) => (
                <button
                  key={chave}
                  className={`porteira-beneficiario-chip${filtro === chave ? ' ativo' : ''}`}
                  onClick={() => setFiltro(chave as any)}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {beneficiariosFiltrados.length === 0 ? (
              <p className="texto-sutil">
                {termo || filtro !== 'todos'
                  ? 'Nenhum produtor encontrado para este filtro.'
                  : 'Nenhum beneficiário cadastrado.'}
              </p>
            ) : (
              <div className="porteira-beneficiarios-grade">
                {beneficiariosFiltrados.slice(0, 6).map((b) => (
                  <div key={b.id} className="porteira-beneficiario-card" onClick={() => navegar('/govinfra/pessoas')}>
                    <div className="porteira-beneficiario-topo">
                      <div className="porteira-beneficiario-avatar">
                        {iniciais(b.pessoa?.nome)}
                      </div>
                      <div className="porteira-beneficiario-info">
                        <strong>{b.pessoa?.nome || '—'}</strong>
                        <span>{b.classificacao || b.atividade_produtiva || '—'}</span>
                      </div>
                    </div>
                    <div className="porteira-beneficiario-corpo">
                      <div className="porteira-beneficiario-linha destaque">
                        <HardHat size={13} />
                        <span>Programa: {b.programa_nome || '—'}</span>
                      </div>
                      {b.saldos.length > 0 && (
                        <div>
                          <div className="porteira-beneficiario-linha">
                            <Clock size={13} />
                            <span>Saldo: {b.saldo_total_disponivel}h</span>
                          </div>
                          <div className="porteira-saldo-barra-envolve">
                            <div className="porteira-saldo-barra">
                              <div
                                className="porteira-saldo-barra-preenchimento"
                                style={{
                                  width: `${Math.min(100, (b.saldo_total_disponivel / (b.saldos[0]?.saldo_disponivel + b.saldo_total_disponivel || 1)) * 100)}%`,
                                  background: b.saldo_total_disponivel > 0 ? 'var(--verde-700)' : 'var(--vermelho-700)',
                                }}
                              />
                            </div>
                            <span className="porteira-saldo-barra-label">
                              {b.saldo_total_disponivel > 0 ? 'Disponível' : 'Esgotado'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="porteira-beneficiario-rodape">
                      <div className="porteira-beneficiario-tags">
                        <Chip cor={b.situacao === 'ativo' ? 'verde' : 'vermelho'}>{b.situacao}</Chip>
                        {b.bloqueios_ativos && b.bloqueios_ativos > 0 && (
                          <Chip cor="vermelho">{b.bloqueios_ativos} bloqueio{b.bloqueios_ativos > 1 ? 's' : ''}</Chip>
                        )}
                      </div>
                      <button className="botao pequeno sutil" onClick={(e) => { e.stopPropagation(); navegar('/govinfra/porteira/solicitacoes/nova'); }}>
                        <Plus size={13} /> Solicitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {beneficiariosFiltrados.length > 6 && (
              <p className="texto-sutil margem-topo" style={{ textAlign: 'center' }}>
                Mostrando 6 de {beneficiariosFiltrados.length} produtores. Refine a busca para encontrar um produtor específico.
              </p>
            )}
          </div>
        </div>

        {/* ── COLUNA DIREITA ────────────────────────────────────────────────── */}
        <aside className="porteira-lateral">
          {/* ── Agenda da semana ────────────────────────────────────────────── */}
          <div className="porteira-cartao">
            <div className="porteira-cartao-titulo">
              <Calendar size={14} /> Agenda da semana
            </div>
            <div className="porteira-agenda-dias">
              {agendaSemanal.map((dia, i) => (
                <div key={i} className={`porteira-agenda-dia${dia.qtde === 0 ? ' zero' : ''}`}>
                  <span className="nome">{dia.rotulo}</span>
                  <span className="qtde">{dia.qtde}</span>
                </div>
              ))}
            </div>
            <button className="botao pequeno sutil largura-total margem-topo" onClick={() => navegar('/govinfra/agenda')}>
              Ver agenda completa <ArrowUpRight size={12} />
            </button>
          </div>

          {/* ── Máquinas disponíveis ────────────────────────────────────────── */}
          <div className="porteira-cartao">
            <div className="porteira-cartao-titulo">
              <Tractor size={14} /> Máquinas
            </div>
            {maquinasResumo.length === 0 ? (
              <p className="texto-sutil" style={{ fontSize: 12 }}>Nenhuma máquina cadastrada.</p>
            ) : (
              <div className="porteira-maquinas-lista">
                {maquinasResumo.map((m) => (
                  <div
                    key={m.id}
                    className="porteira-maquina-item"
                    onClick={() => navegar('/govinfra/maquinas')}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={`porteira-maquina-ponto ${m.cor}`} />
                    <span style={{ flex: 1 }}>{m.nome}</span>
                    <Chip cor={m.cor}>{m.situacao_rotulo}</Chip>
                  </div>
                ))}
              </div>
            )}
            <button className="botao pequeno sutil largura-total margem-topo" onClick={() => navegar('/govinfra/maquinas')}>
              Ver todas as máquinas <ArrowUpRight size={12} />
            </button>
          </div>

          {/* ── Alertas ──────────────────────────────────────────────────────── */}
          {alertas.length > 0 && (
            <div className="porteira-cartao">
              <div className="porteira-cartao-titulo">
                <AlertTriangle size={14} /> Alertas
              </div>
              <div className="porteira-alertas-lista">
                {alertas.map((a, i) => (
                  <div key={i} className={`porteira-alerta-item ${a.nivel}`} onClick={() => navegar('/govinfra/porteira/solicitacoes')}>
                    <AlertTriangle size={13} />
                    <span>{a.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Relatórios rápidos ──────────────────────────────────────────── */}
          <div className="porteira-cartao">
            <div className="porteira-cartao-titulo">
              <FileText size={14} /> Relatórios rápidos
            </div>
            <div className="porteira-relatorios-lista">
              {[
                { rotulo: 'Horas por produtor', icone: Users },
                { rotulo: 'Horas por máquina', icone: Tractor },
                { rotulo: 'Horas por operador', icone: HardHat },
                { rotulo: 'Produtores sem saldo', icone: AlertTriangle },
                { rotulo: 'Solicitações pendentes', icone: Clock },
              ].map((r) => (
                <button
                  key={r.rotulo}
                  className="porteira-relatorio-item"
                  onClick={() => navegar('/govinfra/relatorios')}
                >
                  <r.icone size={14} />
                  <span>{r.rotulo}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Histórico recente ───────────────────────────────────────────── */}
          <div className="porteira-cartao">
            <div className="porteira-cartao-titulo">
              <History size={14} /> Links rápidos
            </div>
            <div className="porteira-relatorios-lista">
              <button className="porteira-relatorio-item" onClick={() => navegar('/govinfra/porteira/solicitacoes')}>
                <ListChecks size={14} /> Solicitações de serviço
              </button>
              <button className="porteira-relatorio-item" onClick={() => navegar('/govinfra/ordens')}>
                <Calendar size={14} /> Ordens de serviço
              </button>
              <button className="porteira-relatorio-item" onClick={() => navegar('/govinfra/pessoas')}>
                <UserCheck size={14} /> Cadastrar produtor
              </button>
              <button className="porteira-relatorio-item" onClick={() => navegar('/govinfra/mapa')}>
                <MapPin size={14} /> Mapa operacional
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ═══ MODAL: NOVO PROGRAMA ═══ */}
      {criandoPrograma && (
        <Modal
          titulo="Novo programa"
          fechar={() => setCriandoPrograma(false)}
          rodape={
            <div className="modal-rodape-acoes">
              <button className="botao" onClick={() => setCriandoPrograma(false)}>Cancelar</button>
              <button className="botao principal" form="form-programa">Criar programa</button>
            </div>
          }
        >
          <form
            id="form-programa"
            className="form-grade"
            onSubmit={async (e) => {
              e.preventDefault();
              const dados = new FormData(e.currentTarget);
              try {
                await api.post('/porteira/programas', {
                  chave: dados.get('chave'),
                  nome: dados.get('nome'),
                  descricao: dados.get('descricao'),
                  base_legal: dados.get('base_legal'),
                  vigencia_inicio: dados.get('vigencia_inicio'),
                  vigencia_fim: dados.get('vigencia_fim') || undefined,
                  horas_por_beneficiario: Number(dados.get('horas_por_beneficiario')) || undefined,
                  regra_limite: dados.get('regra_limite'),
                  metodo_desconto: dados.get('metodo_desconto'),
                  permite_horas_adicionais: true,
                  limite_horas_adicionais: Number(dados.get('limite_horas_adicionais')) || undefined,
                  exige_aprovacao_gestor: true,
                });
                avisar('sucesso', 'Programa criado.');
                setCriandoPrograma(false);
                api.get<Programa[]>('/porteira/programas').then(setProgramas);
              } catch (err: any) { avisar('erro', err.message); }
            }}
          >
            <div className="campo"><label>Chave *</label><input name="chave" required placeholder="porteira_2026" /></div>
            <div className="campo"><label>Nome *</label><input name="nome" required placeholder="Porteira Adentro 2026" /></div>
            <div className="campo"><label>Base legal</label><input name="base_legal" placeholder="Lei municipal…" /></div>
            <div className="campo"><label>Vigência início *</label><input name="vigencia_inicio" type="date" required /></div>
            <div className="campo"><label>Vigência fim</label><input name="vigencia_fim" type="date" /></div>
            <div className="campo"><label>Horas por beneficiário</label><input name="horas_por_beneficiario" type="number" min="0" /></div>
            <div className="campo"><label>Limite de horas adicionais</label><input name="limite_horas_adicionais" type="number" min="0" /></div>
            <div className="campo"><label>Regra de limite</label><select name="regra_limite"><option value="cpf">Por CPF</option><option value="propriedade">Por propriedade</option><option value="ambos">CPF e propriedade</option></select></div>
            <div className="campo"><label>Método de desconto</label><select name="metodo_desconto"><option value="geral">Geral</option><option value="equipamento_principal">Equipamento principal</option><option value="por_categoria">Por categoria</option><option value="administrativo">Administrativo</option></select></div>
            <div className="campo campo-texto"><label>Descrição</label><textarea name="descricao" rows={2} /></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
