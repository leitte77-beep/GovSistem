import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, ExternalLink,
  Fuel, HardHat, MapPin, MessageSquare, Plus, RefreshCw, Sparkles,
  Timer, Tractor, Truck, UserPlus, Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado } from '../componentes/Comuns';
import { useSessao } from '../contexto/SessaoContexto';
import type { Dashboard, Paginado, RegistroAuditoria } from '../types';
import { formatarDataHora } from '../utils';

const MOEDA = { style: 'currency', currency: 'BRL' } as const;

function decorrido(quando: Date): string {
  const minutos = Math.floor((Date.now() - quando.getTime()) / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `há ${horas}h ${minutos % 60}min`;
}

function porcento(parte: number, total: number): number {
  return total > 0 ? Math.round((parte * 100) / total) : 0;
}

/* ── Componente principal ───────────────────────────────────────────────── */

export function Painel() {
  const { dados: sessao } = useSessao();
  const navegar = useNavigate();
  const [painel, setPainel] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState('');
  const [periodoDias, setPeriodoDias] = useState(7);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [falhaAtualizacao, setFalhaAtualizacao] = useState(false);
  const [recarga, setRecarga] = useState(0);

  /* atividade recente */
  const [atividades, setAtividades] = useState<RegistroAuditoria[]>([]);

  useEffect(() => {
    let ativo = true;
    setAtualizando(true);
    setFalhaAtualizacao(false);
    api.get<Dashboard>(`/dashboard?dias=${periodoDias}`)
      .then((d) => { if (ativo) { setPainel(d); setAtualizadoEm(new Date()); } })
      .catch((e) => { if (ativo) { if (painel === null) setErro(e.message); else setFalhaAtualizacao(true); } })
      .finally(() => { if (ativo) setAtualizando(false); });
    return () => { ativo = false; };
  }, [periodoDias, recarga]);

  useEffect(() => {
    api.get<Paginado<RegistroAuditoria>>('/auditoria?por_pagina=6')
      .then((r) => setAtividades(r.itens))
      .catch(() => {});
  }, [recarga]);

  useEffect(() => {
    const id = setInterval(() => setRecarga((r) => r + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const barras = useMemo(() => {
    if (!painel) return [] as { rotulo: string; valor: number; cor: string; pct: number }[];
    const c = painel.cacambas;
    const maxValor = Math.max(c.disponiveis, c.em_uso, c.aguardando_entrega, c.aguardando_retirada, c.em_manutencao, c.atrasadas, 1);
    return [
      { rotulo: 'Disponíveis', valor: c.disponiveis, cor: '#16a34a', pct: porcento(c.disponiveis, maxValor) },
      { rotulo: 'Em uso', valor: c.em_uso, cor: '#2563eb', pct: porcento(c.em_uso, maxValor) },
      { rotulo: 'Ag. entrega', valor: c.aguardando_entrega, cor: '#ea580c', pct: porcento(c.aguardando_entrega, maxValor) },
      { rotulo: 'Ag. retirada', valor: c.aguardando_retirada, cor: '#ca8a04', pct: porcento(c.aguardando_retirada, maxValor) },
      { rotulo: 'Manutenção', valor: c.em_manutencao, cor: '#dc2626', pct: porcento(c.em_manutencao, maxValor) },
      { rotulo: 'Atrasadas', valor: c.atrasadas, cor: '#b91c1c', pct: porcento(c.atrasadas, maxValor) },
    ];
  }, [painel]);

  if (erro) return <ErroEstado mensagem={erro} tentar={() => { setErro(''); setPainel(null); }}/>;
  if (!painel) return <Carregando texto="Carregando painel…"/>;

  const c = painel.cacambas;
  const p = painel.porteira;
  const cb = painel.combustivel;
  const mapaConfig = sessao?.mapa;

  return <div>
    {/* Cabeçalho com ações integradas */}
    <header className="painel-cabecalho">
      <div>
        <h1>Centro de Operações</h1>
        <p>{sessao?.organizacao.nome} · resumo dos últimos {periodoDias} dia{periodoDias > 1 ? 's' : ''}</p>
      </div>
      <div className="painel-cabecalho-acoes">
        <div className="painel-periodo">
          <select value={periodoDias} onChange={(e) => setPeriodoDias(Number(e.target.value))}>
            <option value={1}>Hoje</option>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
        <button className="botao principal" onClick={() => navegar('/govinfra/solicitacoes/nova')}>
          <Plus size={16}/> Nova solicitação
        </button>
        <span className="painel-atualizacao">
          <RefreshCw size={13} className={atualizando ? 'giro' : ''}/>
          {atualizadoEm ? `atualizado ${decorrido(atualizadoEm)}` : 'atualizando…'}
          {falhaAtualizacao && <button className="botao pequeno sutil" onClick={() => { setFalhaAtualizacao(false); setRecarga((r) => r + 1); }}>re tentar</button>}
        </span>
      </div>
    </header>

    {/* ═══════════════════  LAYOUT PRINCIPAL 70/30 ═══════════════════ */}
    <div className="painel-grid">

      {/* ── COLUNA ESQUERDA (70%) ──────────────────────────────────── */}
      <div className="painel-principal">

        {/* ── Operação do dia ─────────────────────────────────────── */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo"><Sparkles size={16}/> Operação do dia</h3>
          <div className="painel-resumo-grade">
            <div className="painel-resumo-item principal">
              <span className="painel-resumo-numero">{c.solicitacoes_pendentes}</span>
              <span className="painel-resumo-rotulo">Solicitações pendentes</span>
            </div>
            <div className="painel-resumo-item">
              <span className="painel-resumo-numero">{c.entregas_hoje}</span>
              <span className="painel-resumo-rotulo">Entregas hoje</span>
            </div>
            <div className="painel-resumo-item">
              <span className="painel-resumo-numero">{c.retiradas_hoje}</span>
              <span className="painel-resumo-rotulo">Retiradas hoje</span>
            </div>
            <div className="painel-resumo-item atencao">
              <span className="painel-resumo-numero">{c.atrasadas}</span>
              <span className="painel-resumo-rotulo">Atrasadas</span>
            </div>
          </div>
        </section>

        {/* ── Caçambas ────────────────────────────────────────────── */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo">
            <HardHat size={16}/> Caçambas
            <span className="painel-cartao-sub">{c.total} cadastradas · {c.em_uso} em uso</span>
          </h3>
          <div className="painel-barras">
            {barras.map((bar) => (
              <div key={bar.rotulo} className="painel-barra-item">
                <div className="painel-barra-rotulo">
                  <span>{bar.rotulo}</span>
                  <strong>{bar.valor}</strong>
                </div>
                <div className="painel-barra-trilha">
                  <div className="painel-barra-preenchimento" style={{ width: `${bar.pct}%`, background: bar.cor }}/>
                </div>
              </div>
            ))}
          </div>
          <div className="painel-mini-cards">
            <MiniCard rotulo="Total" valor={c.total} aoClicar={() => navegar('/govinfra/cacambas')}/>
            <MiniCard rotulo="Disponíveis" valor={c.disponiveis} cor="verde" aoClicar={() => navegar('/govinfra/cacambas?situacao=disponivel')}/>
            <MiniCard rotulo="Em uso" valor={c.em_uso} cor="azul" aoClicar={() => navegar('/govinfra/cacambas?situacao=em_uso')}/>
            <MiniCard rotulo="Manutenção" valor={c.em_manutencao} cor="vermelho" aoClicar={() => navegar('/govinfra/cacambas?situacao=em_manutencao')}/>
            <MiniCard rotulo="Pendentes" valor={c.solicitacoes_pendentes} cor="laranja" aoClicar={() => navegar('/govinfra/solicitacoes?situacao=pendente')}/>
          </div>
        </section>

        {/* ── Porteira Adentro ────────────────────────────────────── */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo">
            <MapPin size={16}/> Porteira Adentro
            <span className="painel-cartao-sub">{p.concluidos_periodo} concluídos · {p.horas_utilizadas}h executadas</span>
          </h3>
          <div className="painel-mini-cards">
            <MiniCard rotulo="Pendentes" valor={p.solicitacoes_pendentes} cor="laranja" aoClicar={() => navegar('/govinfra/porteira/solicitacoes?situacao=protocolada')}/>
            <MiniCard rotulo="Em análise" valor={p.em_analise} cor="azul" aoClicar={() => navegar('/govinfra/porteira/solicitacoes?situacao=em_analise')}/>
            <MiniCard rotulo="Aprovadas" valor={p.aprovadas} cor="verde" aoClicar={() => navegar('/govinfra/porteira/solicitacoes?situacao=aprovada')}/>
            <MiniCard rotulo="Em execução" valor={p.em_execucao} cor="azul" aoClicar={() => navegar('/govinfra/ordens?situacao=em_execucao')}/>
            <MiniCard rotulo="Horas autoriz." valor={`${p.horas_autorizadas}h`} cor="azul" aoClicar={() => navegar('/govinfra/porteira/solicitacoes')}/>
            <MiniCard rotulo="Horas utiliz." valor={`${p.horas_utilizadas}h`} aoClicar={() => navegar('/govinfra/relatorios')}/>
            <MiniCard rotulo="Máquinas disp." valor={p.maquinas_disponiveis} cor="verde" aoClicar={() => navegar('/govinfra/maquinas')}/>
            <MiniCard rotulo="Caminhões disp." valor={p.caminhoes_disponiveis} cor="verde" aoClicar={() => navegar('/govinfra/veiculos')}/>
          </div>
        </section>

        {/* ── Combustível ─────────────────────────────────────────── */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo"><Fuel size={16}/> Combustível no período</h3>
          <div className="painel-mini-cards">
            <MiniCard rotulo="Diesel consumido" valor={`${cb.litros_periodo} L`} cor="azul"/>
            <MiniCard rotulo="Custo estimado" valor={cb.custo_estimado.toLocaleString('pt-BR', MOEDA)} cor="azul"/>
            <MiniCard rotulo="Abastecimentos" valor={cb.abastecimentos}/>
            <MiniCard rotulo="Sem OS" valor={cb.sem_ordem_servico} cor={cb.sem_ordem_servico > 0 ? 'vermelho' : undefined} aoClicar={() => navegar('/govinfra/combustivel')}/>
            <MiniCard rotulo="Inconsistências" valor={cb.com_inconsistencia} cor={cb.com_inconsistencia > 0 ? 'vermelho' : undefined} aoClicar={() => navegar('/govinfra/combustivel')}/>
          </div>
        </section>

      </div>

      {/* ── COLUNA DIREITA (30%) ──────────────────────────────────── */}
      <aside className="painel-lateral-coluna">

        {/* Mini mapa */}
        {mapaConfig && mapaConfig.latitude != null && mapaConfig.longitude != null && (
          <section className="painel-cartao painel-mapa-envolve">
            <h3 className="painel-cartao-titulo"><MapPin size={16}/> Mapa operacional</h3>
            <div className="painel-mapa">
              <MapContainer
                center={[mapaConfig.latitude, mapaConfig.longitude]}
                zoom={mapaConfig.zoom - 1}
                zoomControl={false}
                attributionControl={false}
                style={{ height: '100%', width: '100%', borderRadius: 8 }}
                scrollWheelZoom={false}
                dragging={false}
              >
                <TileLayer url={mapaConfig.url_tiles} attribution={mapaConfig.atribuicao}/>
                <Marker position={[mapaConfig.latitude, mapaConfig.longitude]}
                  icon={L.divIcon({ className: '', html: '<div style="width:16px;height:16px;background:#ea580c;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"/>', iconSize: [16, 16], iconAnchor: [8, 8] })}/>
              </MapContainer>
            </div>
            <button className="botao pequeno sutil largura-total margem-topo" onClick={() => navegar('/govinfra/mapa')}>
              <ExternalLink size={13}/> Abrir mapa completo
            </button>
          </section>
        )}

        {/* Agenda do dia */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo"><CalendarClock size={16}/> Agenda do dia</h3>
          {painel.agenda_hoje.length === 0
            ? <p className="texto-sutil">Nenhum atendimento agendado para hoje.</p>
            : <div className="painel-agenda-lista">
              {painel.agenda_hoje.slice(0, 5).map((item) => (
                <button key={item.id} className="painel-agenda-item"
                  onClick={() => navegar(item.tipo === 'ordem_servico' ? `/govinfra/ordens/${item.id}` : `/govinfra/solicitacoes/${item.id}`)}>
                  <span className="painel-agenda-tipo">{item.tipo === 'ordem_servico' ? '⚙' : '📦'}</span>
                  <span className="painel-agenda-texto">
                    <strong>{item.titulo}</strong>
                    {item.detalhe && <small>{item.detalhe}</small>}
                  </span>
                </button>
              ))}
            </div>}
        </section>

        {/* Últimas atividades */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo"><Clock size={16}/> Últimas atividades</h3>
          {atividades.length === 0
            ? <p className="texto-sutil">Nenhuma atividade recente.</p>
            : <div className="painel-feed">
              {atividades.slice(0, 6).map((a) => (
                <div key={a.id} className="painel-feed-item">
                  <div className={`painel-feed-ponto ${a.resultado === 'sucesso' ? 'verde' : a.resultado === 'erro' ? 'vermelho' : 'cinza'}`}/>
                  <span className="painel-feed-texto">
                    <strong>{a.acao}</strong>
                    {a.entidade_descricao && <> — {a.entidade_descricao}</>}
                    <small>{a.usuario?.nome?.split(' ')[0]} · {formatarDataHora(a.criada_em)}</small>
                  </span>
                </div>
              ))}
            </div>}
        </section>

        {/* Alertas */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo"><AlertTriangle size={16}/> Alertas</h3>
          {painel.alertas.length === 0
            ? <p className="texto-sutil painel-alertas-ok"><CheckCircle2 size={14}/> Tudo em ordem</p>
            : <div className="painel-feed">
              {painel.alertas.map((alerta, i) => (
                <div key={i} className={`painel-feed-item painel-alerta-${alerta.nivel}`}>
                  <div className={`painel-feed-ponto ${alerta.nivel === 'critico' ? 'vermelho' : alerta.nivel === 'atencao' ? 'laranja' : 'azul'}`}/>
                  <span className="painel-feed-texto">
                    <strong>{alerta.titulo}</strong>
                    {alerta.link && <a className="botao pequeno sutil" href={alerta.link}>Ver</a>}
                  </span>
                </div>
              ))}
            </div>}
        </section>

        {/* Atalhos */}
        <section className="painel-cartao">
          <h3 className="painel-cartao-titulo"><ArrowRight size={16}/> Atalhos rápidos</h3>
          <div className="painel-atalhos-grade">
            <button className="painel-atalho" onClick={() => navegar('/govinfra/solicitacoes/nova')}>
              <span className="painel-atalho-icone"><Plus size={18}/></span>
              <span className="painel-atalho-texto">Nova solicitação</span>
            </button>
            <button className="painel-atalho" onClick={() => navegar('/govinfra/pessoas')}>
              <span className="painel-atalho-icone"><UserPlus size={18}/></span>
              <span className="painel-atalho-texto">Cadastrar cidadão</span>
            </button>
            <button className="painel-atalho" onClick={() => navegar('/govinfra/cacambas')}>
              <span className="painel-atalho-icone"><HardHat size={18}/></span>
              <span className="painel-atalho-texto">Gerenciar caçambas</span>
            </button>
            <button className="painel-atalho" onClick={() => navegar('/govinfra/maquinas')}>
              <span className="painel-atalho-icone"><Tractor size={18}/></span>
              <span className="painel-atalho-texto">Máquinas</span>
            </button>
            <button className="painel-atalho" onClick={() => navegar('/govinfra/veiculos')}>
              <span className="painel-atalho-icone"><Truck size={18}/></span>
              <span className="painel-atalho-texto">Caminhões</span>
            </button>
            <button className="painel-atalho" onClick={() => navegar('/govinfra/relatorios')}>
              <span className="painel-atalho-icone"><MessageSquare size={18}/></span>
              <span className="painel-atalho-texto">Relatórios</span>
            </button>
          </div>
        </section>

      </aside>
    </div>
  </div>;
}

/* ── Mini indicador compacto ─────────────────────────────────────────────── */

function MiniCard({ rotulo, valor, cor, aoClicar }: {
  rotulo: string; valor: string | number; cor?: string; aoClicar?: () => void;
}) {
  const Comp = aoClicar ? 'button' : 'div';
  return (
    <Comp className={`mini-card ${cor || ''} ${aoClicar ? 'clicavel' : ''}`}
      onClick={aoClicar}
      {...(Comp === 'button' ? { type: 'button' as const } : {})}
    >
      <span className="mini-card-valor">{valor}</span>
      <span className="mini-card-rotulo">{rotulo}</span>
    </Comp>
  );
}
