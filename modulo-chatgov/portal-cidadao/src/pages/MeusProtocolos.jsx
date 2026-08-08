import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileSearch,
  Loader2,
  Plus,
  Search,
  Timer,
} from 'lucide-react';
import { api, getToken } from '../api.js';
import { useLogado } from './LogadoContext.jsx';
import { PortalFooter, PortalHeader } from '../components/PortalChrome.jsx';

const STATUS = {
  ABERTO: { label: 'Recebida', tom: 'blue' },
  EM_ANDAMENTO: { label: 'Em análise', tom: 'blue' },
  PENDENTE: { label: 'Aguardando você', tom: 'warning' },
  CONCLUIDO: { label: 'Concluída', tom: 'success' },
  CANCELADO: { label: 'Cancelada', tom: 'danger' },
  ARQUIVADO: { label: 'Arquivada', tom: 'neutral' },
};

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'pendente', label: 'Aguardando você' },
  { id: 'concluido', label: 'Concluídos' },
];

const EM_ANDAMENTO = ['ABERTO', 'EM_ANDAMENTO'];

function statusDe(p) {
  return STATUS[p.status_operacional] || { label: p.status_operacional || 'Em análise', tom: 'neutral' };
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasDesde(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function prazoInfo(p) {
  if (!p.prazo_em || ['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'].includes(p.status_operacional)) return null;
  const prazo = new Date(p.prazo_em);
  if (isNaN(prazo)) return null;
  const dias = Math.ceil((prazo.getTime() - Date.now()) / 86400000);
  if (dias < 0) return { texto: `Prazo vencido há ${Math.abs(dias)} dia(s)`, atrasado: true };
  if (dias === 0) return { texto: 'Prazo vence hoje', atrasado: true };
  return { texto: `Prazo em ${dias} dia(s)`, atrasado: false };
}

function Resumo({ icone: Icone, tom, valor, rotulo }) {
  return (
    <article className={`pd-metric pd-metric--${tom}`}>
      <span className="pd-metric__icon"><Icone size={19} /></span>
      <strong>{valor}</strong>
      <small>{rotulo}</small>
    </article>
  );
}

export function MeusProtocolos({ navigate }) {
  const { conta, login, logout } = useLogado();
  const [protocolos, setProtocolos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!getToken()) { navigate(''); return; }
    api.meusProtocolos()
      .then(p => setProtocolos(Array.isArray(p) ? p : []))
      .catch(e => {
        setErro(e.message);
        if (/login|sessão|autoriza/i.test(e.message)) { logout(); navigate(''); }
      })
      .finally(() => setLoading(false));
  }, []);

  // Sessão válida sem os dados locais da conta (outra aba, storage limpo):
  // busca o cadastro para não cair num "Olá, cidadão" genérico.
  useEffect(() => {
    if (conta || !getToken()) return;
    api.minhaConta()
      .then(c => login(getToken(), { nome: c.nome, email: c.email, conta_id: c.conta_id }))
      .catch(() => {});
  }, [conta]);

  const resumo = useMemo(() => ({
    total: protocolos.length,
    andamento: protocolos.filter(p => EM_ANDAMENTO.includes(p.status_operacional)).length,
    pendentes: protocolos.filter(p => p.status_operacional === 'PENDENTE' || p.pendencias_abertas > 0).length,
    concluidos: protocolos.filter(p => p.status_operacional === 'CONCLUIDO').length,
  }), [protocolos]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return protocolos.filter(p => {
      if (filtro === 'andamento' && !EM_ANDAMENTO.includes(p.status_operacional)) return false;
      if (filtro === 'pendente' && p.status_operacional !== 'PENDENTE' && !(p.pendencias_abertas > 0)) return false;
      if (filtro === 'concluido' && p.status_operacional !== 'CONCLUIDO') return false;
      if (!termo) return true;
      return [p.numero, p.assunto, p.servico_nome, p.setor_atual_nome]
        .some(v => String(v || '').toLowerCase().includes(termo));
    });
  }, [protocolos, filtro, busca]);

  const primeiroNome = (conta?.nome || '').trim().split(/\s+/)[0] || 'cidadão';
  const aguardando = protocolos.find(p => p.status_operacional === 'PENDENTE' || p.pendencias_abertas > 0);

  const sair = () => { logout(); navigate(''); };

  return (
    <div className="pd-app">
      <PortalHeader navigate={navigate} conta={conta} onSair={sair} />
      <div className="pd-dash">
        <main className="pd-dash__main">
          <section className="pd-dash-hero">
            <div>
              <div className="pd-eyebrow">Minha área</div>
              <h1>Olá, {primeiroNome}.</h1>
              <p>
                {loading
                  ? 'Carregando suas solicitações…'
                  : resumo.total === 0
                    ? 'Você ainda não abriu nenhuma solicitação por aqui.'
                    : `Você tem ${resumo.total} solicitação(ões) registrada(s)${resumo.andamento ? `, ${resumo.andamento} em andamento` : ''}.`}
              </p>
            </div>
            <button className="pd-primary-btn pd-dash-hero__cta" type="button" onClick={() => navigate('nova-solicitacao')}>
              <Plus size={17} /> Abrir nova solicitação
            </button>
          </section>

          <section className="pd-metrics" aria-label="Resumo das solicitações">
            <Resumo icone={ClipboardList} tom="blue" valor={resumo.total} rotulo="Solicitações" />
            <Resumo icone={Clock3} tom="info" valor={resumo.andamento} rotulo="Em andamento" />
            <Resumo icone={AlertCircle} tom="warning" valor={resumo.pendentes} rotulo="Aguardando você" />
            <Resumo icone={CheckCircle2} tom="success" valor={resumo.concluidos} rotulo="Concluídas" />
          </section>

          {aguardando && (
            <section className="pd-dash-alert">
              <span><AlertCircle size={19} /></span>
              <div>
                <strong>Uma solicitação precisa de você</strong>
                <p>O protocolo {aguardando.numero} está aguardando um documento ou resposta para seguir.</p>
              </div>
              <button type="button" onClick={() => navigate(`protocolo/${aguardando.id}`)}>
                Resolver agora <ArrowRight size={15} />
              </button>
            </section>
          )}

          <section className="pd-dash-list" aria-labelledby="pd-dash-list-title">
            <header className="pd-dash-list__head">
              <div>
                <h2 id="pd-dash-list-title">Minhas solicitações</h2>
                <p>Acompanhe o andamento de cada pedido.</p>
              </div>
              <div className="pd-dash-search">
                <Search size={16} aria-hidden="true" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por número ou assunto"
                  aria-label="Buscar solicitação"
                />
              </div>
            </header>

            <div className="pd-chips" role="tablist" aria-label="Filtrar por situação">
              {FILTROS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  className="pd-chip"
                  aria-selected={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="pd-dash-loading">
                <Loader2 size={20} className="pd-spin" />
                <span>Carregando suas solicitações…</span>
              </div>
            ) : erro ? (
              <div className="pd-alert" role="alert"><AlertCircle size={17} /><span>{erro}</span></div>
            ) : protocolos.length === 0 ? (
              <div className="pd-empty-state">
                <span><FileSearch size={22} /></span>
                <strong>Nenhuma solicitação por aqui ainda</strong>
                <p>Quando você abrir um pedido, ele aparece nesta lista com todo o histórico de movimentações.</p>
                <button className="pd-primary-btn pd-empty-state__cta" type="button" onClick={() => navigate('nova-solicitacao')}>
                  <Plus size={17} /> Fazer uma solicitação
                </button>
              </div>
            ) : visiveis.length === 0 ? (
              <div className="pd-empty-state">
                <span><Search size={22} /></span>
                <strong>Nada encontrado com esse filtro</strong>
                <p>Ajuste a busca ou volte para “Todos” para ver suas solicitações.</p>
              </div>
            ) : (
              <ul className="pd-protocol-list">
                {visiveis.map(p => {
                  const st = statusDe(p);
                  const prazo = prazoInfo(p);
                  const dias = diasDesde(p.aberto_em);
                  return (
                    <li key={p.id}>
                      <button type="button" className="pd-protocol-card" onClick={() => navigate(`protocolo/${p.id}`)}>
                        <div className="pd-protocol-card__top">
                          <span className="pd-protocol-card__number">{p.numero}</span>
                          <span className={`pd-status pd-status--${st.tom}`}>{st.label}</span>
                        </div>
                        <h3>{p.assunto || p.servico_nome || 'Solicitação'}</h3>
                        <div className="pd-protocol-card__meta">
                          <span><CalendarDays size={14} /> {formatarData(p.aberto_em)}{dias !== null && dias > 0 ? ` · há ${dias} dia(s)` : ''}</span>
                          {p.setor_atual_nome && <span><Building2 size={14} /> {p.setor_atual_nome}</span>}
                          {prazo && (
                            <span className={prazo.atrasado ? 'is-late' : ''}><Timer size={14} /> {prazo.texto}</span>
                          )}
                          {p.pendencias_abertas > 0 && (
                            <span className="is-late"><AlertCircle size={14} /> {p.pendencias_abertas} pendência(s)</span>
                          )}
                        </div>
                        <ChevronRight size={18} className="pd-protocol-card__go" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
        <PortalFooter navigate={navigate} />
      </div>
    </div>
  );
}
