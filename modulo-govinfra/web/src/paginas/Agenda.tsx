import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Clock, Filter, HardHat, MapPin, Package, RotateCw, Search, Tractor, Truck, User, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { Carregando, Chip, ErroEstado } from '../componentes/Comuns';
import { corSituacao } from '../utils';

type EventoAgenda = {
  id: string; tipo: string; protocolo: string; solicitante?: string | null;
  endereco?: string | null; bairro?: string | null; cacamba?: string | null;
  veiculo?: string | null; equipe?: string | null; situacao: string;
  situacao_rotulo?: string | null; prioridade?: string | null; atrasada?: boolean;
  data: string; titulo: string; link?: string | null;
};
type Legenda = { chave: string; rotulo: string; cor: string };
type RespostaAgenda = { inicio: string; fim: string; total: number; eventos: EventoAgenda[]; legenda: Legenda[] };

const MAX_EVENTOS_DIA = 4;

export function Agenda() {
  const navegar = useNavigate();
  const [mes, setMes] = useState(() => { const agora = new Date(); return new Date(agora.getFullYear(), agora.getMonth(), 1); });
  const [resposta, setResposta] = useState<RespostaAgenda | null>(null);
  const [erro, setErro] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);

  const [inicio, fim] = useMemo(() => {
    const primeiro = new Date(mes);
    primeiro.setDate(1);
    primeiro.setDate(1 - ((primeiro.getDay() + 6) % 7));
    const ultimo = new Date(mes);
    ultimo.setMonth(ultimo.getMonth() + 1, 0);
    ultimo.setDate(ultimo.getDate() + (6 - ((ultimo.getDay() + 6) % 7)));
    return [primeiro.toISOString().slice(0, 10), ultimo.toISOString().slice(0, 10)];
  }, [mes]);

  useEffect(() => {
    setErro('');
    api.get<RespostaAgenda>(`/agenda?inicio=${inicio}&fim=${fim}&por_pagina=500`)
      .then(setResposta).catch((e) => setErro(e.message));
  }, [inicio, fim]);

  if (erro) return <ErroEstado mensagem={erro} tentar={() => setResposta(null)}/>;
  if (!resposta) return <Carregando texto="Carregando a agenda…"/>;

  const porDia: Record<string, EventoAgenda[]> = {};
  for (const e of resposta.eventos) {
    if (filtroCategoria && e.tipo !== filtroCategoria) continue;
    (porDia[e.data] = porDia[e.data] || []).push(e);
  }

  const dias: Date[] = [];
  const primeiro = new Date(`${inicio}T00:00:00`);
  const ultimo = new Date(`${fim}T00:00:00`);
  for (let d = new Date(primeiro); d <= ultimo; d.setDate(d.getDate() + 1)) dias.push(new Date(d));

  const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const hojeStr = new Date().toISOString().slice(0, 10);
  const hoje = new Date();
  const totalFiltrado = Object.values(porDia).reduce((s, e) => s + e.length, 0);
  const entregasHoje = (porDia[hojeStr] || []).filter((e) => e.tipo === 'entrega_cacamba').length;
  const retiradasHoje = (porDia[hojeStr] || []).filter((e) => e.tipo === 'retirada_cacamba').length;
  const servicosHoje = (porDia[hojeStr] || []).filter((e) => e.tipo === 'servico' || e.tipo === 'ordem_servico').length;

  /* categorias da legenda com contagem para chips */
  const categoriasChips = resposta.legenda.map((l) => ({
    ...l,
    contagem: resposta.eventos.filter((e) => e.tipo === l.chave).length,
  }));

  function abrir(evento: EventoAgenda) {
    if (evento.link) { const d = evento.link; if (d.startsWith('/ordens/')) navegar(`/govinfra${d}`); else if (d.startsWith('/solicitacoes/')) navegar(`/govinfra${d}`); else navegar(`/govinfra${d}`); return; }
    if (evento.tipo === 'ordem_servico' || evento.tipo === 'servico') navegar(`/govinfra/ordens/${evento.id}`);
    else navegar(`/govinfra/solicitacoes/${evento.id}`);
  }

  function iconeTipo(tipo: string) {
    if (tipo === 'entrega_cacamba') return <HardHat size={11}/>;
    if (tipo === 'retirada_cacamba') return <Package size={11}/>;
    if (tipo === 'servico' || tipo === 'ordem_servico') return <Tractor size={11}/>;
    return <Clock size={11}/>;
  }

  return <div>
    {/* Header operacional */}
    <header className="agenda-header">
      <div>
        <h1>Agenda geral</h1>
        <p>Planejamento operacional de caçambas, máquinas, caminhões e equipes.</p>
      </div>
      <button className="botao principal" onClick={() => navegar('/govinfra/solicitacoes/nova')}>
        <CalendarPlus size={16}/> Novo agendamento
      </button>
    </header>

    {/* Stats bar */}
    <div className="agenda-stats">
      <div className="agenda-stat"><span className="agenda-stat-num">{servicosHoje}</span><span className="agenda-stat-rot">Serviços hoje</span></div>
      <div className="agenda-stat"><span className="agenda-stat-num">{entregasHoje}</span><span className="agenda-stat-rot">Entregas hoje</span></div>
      <div className="agenda-stat"><span className="agenda-stat-num">{retiradasHoje}</span><span className="agenda-stat-rot">Retiradas hoje</span></div>
      <div className="agenda-stat destaque"><span className="agenda-stat-num">{resposta.total}</span><span className="agenda-stat-rot">Total no período</span></div>
    </div>

    {/* Toolbar */}
    <div className="agenda-toolbar-nova">
      <div className="agenda-toolbar-navegacao">
        <button className="botao pequeno sutil" onClick={() => setMes(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}>Hoje</button>
        <button className="botao pequeno sutil icone" onClick={() => setMes((m) => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n; })}><ChevronLeft size={16}/></button>
        <strong className="agenda-toolbar-mes">{nomeMes}</strong>
        <button className="botao pequeno sutil icone" onClick={() => setMes((m) => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; })}><ChevronRight size={16}/></button>
      </div>
      <div className="agenda-toolbar-info">
        {filtroCategoria && <span className="agenda-filtro-ativo"><Filter size={12}/> Filtro ativo <button className="botao sutil icone" style={{minHeight:0,padding:2}} onClick={() => setFiltroCategoria(null)}><X size={11}/></button></span>}
        <span className="agenda-contador">{totalFiltrado} evento(s)</span>
      </div>
    </div>

    {/* Categoria chips (legenda interativa) */}
    <div className="agenda-categorias">
      <button className={`agenda-categoria-chip ${!filtroCategoria ? 'ativo' : ''}`} onClick={() => setFiltroCategoria(null)}>Todas</button>
      {categoriasChips.map((cat) => (
        <button key={cat.chave} className={`agenda-categoria-chip ${cat.chave} ${filtroCategoria === cat.chave ? 'ativo' : ''}`}
          onClick={() => setFiltroCategoria(filtroCategoria === cat.chave ? null : cat.chave)}>
          <i className="agenda-categoria-ponto" style={{ background: cat.cor }}/> {cat.rotulo} <span className="agenda-categoria-qtd">{cat.contagem}</span>
        </button>
      ))}
    </div>

    {/* Calendário */}
    <div className="agenda-grade">
      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
        <div key={d} className="agenda-cabecalho-dia"><strong>{d}</strong></div>
      ))}
      {dias.map((dia) => {
        const chave = dia.toISOString().slice(0, 10);
        const eventos = porDia[chave] || [];
        const foraMes = dia.getMonth() !== mes.getMonth();
        const ehHoje = chave === hojeStr;
        const lotado = eventos.length >= 6;
        const moderado = eventos.length >= 3;
        return (
          <div key={chave} className={`agenda-celula ${foraMes ? 'fora' : ''} ${eventos.length > 0 ? 'com-evento' : ''} ${ehHoje ? 'hoje' : ''} ${lotado ? 'lotado' : ''} ${moderado && !lotado ? 'moderado' : ''}`}>
            <div className="agenda-celula-topo">
              <span className={`agenda-celula-dia ${ehHoje ? 'hoje-selo' : ''}`}>{dia.getDate()}</span>
              {eventos.length > 0 && <span className={`agenda-celula-contador ${lotado ? 'lotado' : moderado ? 'moderado' : ''}`}>{eventos.length}</span>}
            </div>
            <div className="agenda-celula-eventos">
              {eventos.slice(0, MAX_EVENTOS_DIA).map((evento) => (
                <button key={evento.id} className={`agenda-evento-chip ${corSituacao(evento.situacao)}`}
                  title={`${evento.titulo}\n${evento.solicitante || ''}\n${evento.endereco || evento.bairro || ''}`}
                  onClick={(e) => { e.stopPropagation(); abrir(evento); }}>
                  <span className="agenda-evento-icone">{iconeTipo(evento.tipo)}</span>
                  <span className="agenda-evento-texto">{evento.titulo.length > 20 ? `${evento.titulo.slice(0, 19)}…` : evento.titulo}</span>
                </button>
              ))}
              {eventos.length > MAX_EVENTOS_DIA && (
                <span className="agenda-mais">+{eventos.length - MAX_EVENTOS_DIA} mais</span>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {/* Pendências */}
    {resposta.total > 0 && (
      <section className="secao-painel margem-topo">
        <h2>Atendimentos de hoje</h2>
        {(porDia[hojeStr] || []).length === 0
          ? <p className="texto-sutil">Nenhum atendimento agendado para hoje.</p>
          : <div className="tabela-envolve"><table className="tabela tabela-clicavel">
            <thead><tr><th>Protocolo</th><th>Atendimento</th><th>Solicitante</th><th>Endereço</th><th>Situação</th></tr></thead>
            <tbody>{(porDia[hojeStr] || []).map((e) => (
              <tr key={e.id} onClick={() => abrir(e)}>
                <td><strong>{e.protocolo}</strong></td>
                <td><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{iconeTipo(e.tipo)}{e.titulo}</span></td>
                <td>{e.solicitante || '—'}</td>
                <td>{e.endereco || e.bairro || '—'}</td>
                <td>{e.atrasada ? <Chip cor="vermelho"><AlertTriangle size={11}/> Atrasado</Chip> : <Chip cor={corSituacao(e.situacao)}>{e.situacao_rotulo || e.situacao}</Chip>}</td>
              </tr>
            ))}</tbody>
          </table></div>}
      </section>
    )}
  </div>;
}
