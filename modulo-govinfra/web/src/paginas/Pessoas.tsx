import {
  AlertTriangle, ArrowRight, Building2, Calendar, CheckCircle2, ChevronLeft, Clock,
  ExternalLink, FileText, Hash, History, LayoutGrid, List, MapPin, Package,
  PanelRightClose, Phone, Plus, RotateCw, Search, ShieldCheck, User, UserPlus, X,
  MapPinHouse, AtSign, PencilLine,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { Carregando, Chip, ErroEstado, Modal, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Imovel, Paginado, Pessoa, RegistroAuditoria } from '../types';
import { formatarCpf, formatarDataHora, formatarTelefone } from '../utils';

const POR_PAGINA = 15;

const CHIPS_FILTRO = [
  { chave: '', rotulo: 'Todos' },
  { chave: 'produtor_rural', rotulo: 'Produtores' },
  { chave: 'cidadao', rotulo: 'Cidadãos' },
  { chave: 'pessoa_juridica', rotulo: 'Empresas' },
];

/* ── Componente principal ───────────────────────────────────────────────── */

export function Pessoas() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<Pessoa> | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo] = useState<'cards' | 'tabela'>(() => { try { return localStorage.getItem('govinfra.pessoas.modo') as any || 'cards'; } catch { return 'cards'; } });

  /* busca com sugestões */
  const [sugestoes, setSugestoes] = useState<Pessoa[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* painel lateral */
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [timeline, setTimeline] = useState<RegistroAuditoria[]>([]);
  const [abaPainel, setAbaPainel] = useState<'dados' | 'imoveis' | 'historico'>('dados');

  /* ── API ────────────────────────────────────────────────────────── */

  const carregar = useCallback((pag: number) => {
    setErro('');
    const q = new URLSearchParams({ pagina: String(pag), por_pagina: String(POR_PAGINA) });
    if (termo) q.set('termo', termo);
    if (tipoFiltro) q.set('tipo', tipoFiltro);
    api.get<Paginado<Pessoa>>(`/pessoas?${q.toString()}`).then(setDados).catch((e) => setErro(e.message));
  }, [termo, tipoFiltro]);

  /* efeitos */
  useEffect(() => { carregar(1); }, [carregar]);

  /* sugestões da busca */
  useEffect(() => {
    if (termo.length < 2) { setSugestoes([]); return; }
    const t = setTimeout(() => {
      api.get<{ itens: Pessoa[] }>(`/pessoas?termo=${encodeURIComponent(termo)}&por_pagina=6`)
        .then((r) => setSugestoes(r.itens)).catch(() => setSugestoes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  /* atalho ⌘K */
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); } }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ── Ações ──────────────────────────────────────────────────────── */

  async function abrirPainel(p: Pessoa) {
    setPessoa(p);
    setAbaPainel('dados');
    try {
      const [imoveisResposta, auditResposta] = await Promise.all([
        api.get<{ itens: Imovel[] }>(`/imoveis?pessoa_id=${p.id}&por_pagina=100`),
        api.get<Paginado<RegistroAuditoria>>(`/auditoria?entidade=pessoa&entidade_id=${p.id}&por_pagina=10`).catch(() => ({ itens: [] })),
      ]);
      setImoveis(imoveisResposta.itens);
      setTimeline(auditResposta.itens);
    } catch { setImoveis([]); setTimeline([]); }
  }

  function fecharPainel() { setPessoa(null); }

  async function salvarPessoa(corpo: Record<string, unknown>) {
    setSalvando(true);
    try {
      await api.post('/pessoas', corpo);
      avisar('sucesso', 'Cadastro criado.');
      setCriando(false);
      carregar(pagina);
    } catch (e: any) {
      avisar('erro', e.message);
      if (e.codigo === 'possivel_duplicidade' && e.corpo?.duplicidades) {
        try {
          await api.post('/pessoas', { ...corpo, confirmar_duplicidade: true });
          avisar('sucesso', 'Cadastro criado confirmando duplicidade.');
          setCriando(false);
          carregar(pagina);
        } catch (e2: any) { avisar('erro', e2.message); }
      }
    } finally { setSalvando(false); }
  }

  function salvarModo(m: 'cards' | 'tabela') { setModo(m); try { localStorage.setItem('govinfra.pessoas.modo', m); } catch {/* noop */} }

  const produtos = dados?.itens.filter((p) => p.tipos?.includes('produtor_rural')).length ?? 0;
  const bloqueados = dados?.itens.filter((p) => (p.bloqueios_ativos ?? 0) > 0).length ?? 0;

  return <div>
    {/* Cabeçalho */}
    <div className="pessoas-cabecalho">
      <div>
        <h1>Cadastro Mestre</h1>
        <p>Cidadãos e produtores — base unificada de todos os atendimentos da Secretaria de Infraestrutura</p>
      </div>
      <div className="pessoas-cabecalho-acoes">
        {pode('govinfra.pessoas.criar') && (
          <button className="botao principal" onClick={() => setCriando(true)}><UserPlus size={17}/> Novo cadastro</button>
        )}
      </div>
    </div>

    {/* Stats */}
    {dados && (
      <div className="pessoas-stats">
        <div className="pessoas-stat"><span className="pessoas-stat-numero">{dados.total}</span><span className="pessoas-stat-rotulo">Total de pessoas</span></div>
        <div className="pessoas-stat"><span className="pessoas-stat-numero">{produtos}</span><span className="pessoas-stat-rotulo">Produtores</span></div>
        <div className="pessoas-stat"><span className="pessoas-stat-numero">{bloqueados}</span><span className="pessoas-stat-rotulo">Bloqueados</span></div>
      </div>
    )}

    {/* Busca premium */}
    <div className="pessoas-busca-envolve">
      <div className="pessoas-busca">
        <Search size={20}/>
        <input ref={inputRef} placeholder="Pesquise por nome, CPF, telefone, endereço, bairro ou inscrição do produtor..."
          value={termo} onChange={(e) => setTermo(e.target.value)}
          onFocus={() => { if (termo.length >= 2) setMostrarSugestoes(true); }}
          aria-label="Pesquisar pessoa"/>
        {termo && <button className="pessoas-busca-limpar" onClick={() => setTermo('')} aria-label="Limpar"><X size={15}/></button>}
        <kbd className="pessoas-busca-atalho">⌘K</kbd>
      </div>
      {mostrarSugestoes && termo.length >= 2 && sugestoes.length > 0 && (
        <div className="pessoas-dropdown">
          {sugestoes.map((p) => (
            <button key={p.id} className="pessoas-dropdown-item" onClick={() => { setMostrarSugestoes(false); abrirPainel(p); }}>
              <div className="pessoas-dropdown-topo">
                <span className="pessoas-dropdown-nome"><User size={13}/> {p.nome}</span>
                {p.tipos?.includes('produtor_rural') && <Chip cor="verde">Produtor</Chip>}
                {(p.bloqueios_ativos ?? 0) > 0 && <Chip cor="vermelho">{p.bloqueios_ativos} bloqueio(s)</Chip>}
              </div>
              <div className="pessoas-dropdown-meta">
                {formatarCpf(p.documento)} · {formatarTelefone(p.telefone)} · {p.bairro || '—'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>

    {/* Chips */}
    <div className="pessoas-chips">
      {CHIPS_FILTRO.map((c) => (
        <button key={c.chave} className={`pessoas-chip ${tipoFiltro === c.chave ? 'ativo' : ''}`}
          onClick={() => setTipoFiltro(c.chave)}>{c.rotulo}</button>
      ))}
      <button className={`pessoas-chip ${bloqueados > 0 ? '' : ''}`}
        onClick={() => { /* TODO: filter by bloqueados via backend */ }}>
        <AlertTriangle size={12}/> Bloqueados
      </button>
    </div>

    {/* Toolbar */}
    <div className="pessoas-toolbar">
      <span className="pessoas-contador">{dados?.total ?? '—'} resultado(s)</span>
      <div className="alternador-visualizacao">
        <button className={modo === 'cards' ? 'ativo' : ''} onClick={() => salvarModo('cards')} title="Cards" aria-label="Cards"><LayoutGrid size={15}/></button>
        <button className={modo === 'tabela' ? 'ativo' : ''} onClick={() => salvarModo('tabela')} title="Tabela" aria-label="Tabela"><List size={15}/></button>
      </div>
    </div>

    {/* Load / Error / Empty */}
    {erro && <ErroEstado mensagem={erro} tentar={() => carregar(1)}/>}
    {!dados && !erro && (
      <div className="pessoas-skeleton">
        {[1,2,3,4,5].map((i) => <div key={i} className="pessoas-skeleton-card"><div className="esqueleto" style={{width:'50%',height:16}}/><div className="esqueleto" style={{width:'70%',height:14}}/><div className="esqueleto" style={{width:'40%',height:14}}/></div>)}
      </div>
    )}
    {dados && dados.total === 0 && (
      <Vazio titulo="Nenhuma pessoa cadastrada"
        texto="Cadastre cidadãos e produtores para que possam solicitar caçambas, máquinas e serviços do Porteira Adentro."
        acao={<>
          <button className="botao principal" onClick={() => setCriando(true)}><UserPlus size={16}/> Novo cadastro</button>
          {(termo || tipoFiltro) && <button className="botao" onClick={() => { setTermo(''); setTipoFiltro(''); }}><RotateCw size={14}/> Limpar filtros</button>}
        </>}
      />
    )}

    {/* Conteúdo */}
    {dados && dados.total > 0 && <>
      {modo === 'cards' ? (
        <div className="pessoas-grade">
          {dados.itens.map((p) => (
            <article key={p.id} className="pessoas-card" tabIndex={0} role="button"
              aria-label={p.nome}
              onClick={() => abrirPainel(p)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); abrirPainel(p); } }}>
              <header className="pessoas-card-topo">
                <div className="pessoas-card-avatar">{p.nome[0]?.toUpperCase() || '?'}</div>
                <div className="pessoas-card-info">
                  <strong>{p.nome}</strong>
                  <span>{formatarCpf(p.documento)} · {formatarTelefone(p.telefone)}</span>
                </div>
                <button className="botao sutil icone pequeno" onClick={(e) => { e.stopPropagation(); abrirPainel(p); }} title="Abrir detalhes"><PanelRightClose size={14}/></button>
              </header>
              <div className="pessoas-card-corpo">
                <div className="pessoas-card-linha"><MapPin size={13}/> {p.bairro || 'Sem bairro'}{p.municipio ? `, ${p.municipio}` : ''}</div>
                <div className="pessoas-card-linha"><Phone size={13}/> {formatarTelefone(p.telefone) || 'Sem telefone'}</div>
              </div>
              <footer className="pessoas-card-rodape">
                <div className="pessoas-card-tags">
                  {p.tipos?.map((t) => <Chip key={t} cor="azul">{t.replaceAll('_', ' ')}</Chip>)}
                  {p.situacao === 'ativo' ? <Chip cor="verde">Ativo</Chip> : <Chip cor="vermelho">{p.situacao}</Chip>}
                  {(p.bloqueios_ativos ?? 0) > 0 && <Chip cor="vermelho"><ShieldCheck size={10}/> {p.bloqueios_ativos} bloqueio(s)</Chip>}
                </div>
                <ArrowRight size={14} className="pessoas-card-seta"/>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="tabela-envolve"><table className="tabela tabela-clicavel">
          <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Bairro</th><th>Classificação</th><th>Situação</th><th></th></tr></thead>
          <tbody>{dados.itens.map((p) => (
            <tr key={p.id} onClick={() => abrirPainel(p)}>
              <td><strong>{p.nome}</strong></td>
              <td>{formatarCpf(p.documento)}</td>
              <td>{formatarTelefone(p.telefone)}</td>
              <td>{p.bairro || '—'}</td>
              <td>{(p.tipos || []).map((t) => <Chip key={t} cor="azul">{t.replaceAll('_', ' ')}</Chip>)}</td>
              <td><Chip cor={p.situacao === 'ativo' ? 'verde' : 'vermelho'}>{p.situacao}</Chip></td>
              <td onClick={(e) => { e.stopPropagation(); abrirPainel(p); }}>
                <button className="botao sutil icone pequeno"><PanelRightClose size={14}/></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
    </>}

    {/* Painel lateral */}
    {pessoa && <Painel pessoa={pessoa} imoveis={imoveis} timeline={timeline} aba={abaPainel} setAba={setAbaPainel} fechar={fecharPainel} navegar={navegar}/>}

    {/* Modal de cadastro */}
    {criando && <Modal titulo="Novo cadastro" fechar={() => setCriando(false)} largo
      rodape={<div className="modal-rodape-acoes" style={{ justifyContent: 'space-between' }}>
        <span className="texto-pequeno" style={{ color: 'var(--cinza-400)' }}>* Campos obrigatórios</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="botao" onClick={() => setCriando(false)}>Cancelar</button>
          <button className="botao principal" form="form-pessoa" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar cadastro'}</button>
        </div>
      </div>}>
      <FormPessoaMelhorado salvando={salvando} aoSalvar={salvarPessoa}/>
    </Modal>}
  </div>;
}

/* ── Painel lateral ──────────────────────────────────────────────────────── */

function Painel({ pessoa, imoveis, timeline, aba, setAba, fechar, navegar }: {
  pessoa: Pessoa; imoveis: Imovel[]; timeline: RegistroAuditoria[]; aba: string;
  setAba: (a: 'dados' | 'imoveis' | 'historico') => void; fechar: () => void; navegar: (url: string) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') fechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fechar]);

  return (
    <div className="painel-fundo" onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <aside className="painel-lateral" role="dialog" aria-label={pessoa.nome}>
        <header className="painel-cabecalho">
          <div>
            <div className="painel-cabecalho-avatar">
              <div className="pessoas-card-avatar" style={{width:44,height:44,fontSize:20}}>{pessoa.nome[0]?.toUpperCase() || '?'}</div>
              <div>
                <h2>{pessoa.nome}</h2>
                <span className="painel-protocolo">{pessoa.tipos?.join(', ').replaceAll('_', ' ') || 'Cidadão'}</span>
              </div>
            </div>
          </div>
          <button className="botao sutil icone" onClick={fechar} aria-label="Fechar"><X size={18}/></button>
        </header>

        <nav className="painel-abas">
          <button className={`painel-aba ${aba === 'dados' ? 'ativa' : ''}`} onClick={() => setAba('dados')}>Dados</button>
          <button className={`painel-aba ${aba === 'imoveis' ? 'ativa' : ''}`} onClick={() => setAba('imoveis')}>Imóveis {imoveis.length > 0 && <span className="contador-aba">{imoveis.length}</span>}</button>
          <button className={`painel-aba ${aba === 'historico' ? 'ativa' : ''}`} onClick={() => setAba('historico')}>Histórico</button>
        </nav>

        <div className="painel-corpo">
          {aba === 'dados' && <div className="painel-grade">
            <Info rotulo="CPF" valor={formatarCpf(pessoa.documento)}/>
            <Info rotulo="Telefone" valor={formatarTelefone(pessoa.telefone)}/>
            <Info rotulo="WhatsApp" valor={formatarTelefone(pessoa.whatsapp)}/>
            <Info rotulo="E-mail" valor={pessoa.email || '—'}/>
            <Info rotulo="Endereço" valor={pessoa.logradouro ? `${pessoa.logradouro}, ${pessoa.numero || ''}` : '—'}/>
            <Info rotulo="Bairro" valor={pessoa.bairro || '—'}/>
            <Info rotulo="Município" valor={pessoa.municipio || '—'}/>
            <Info rotulo="Classificação" valor={(pessoa.tipos || []).join(', ').replaceAll('_', ' ') || '—'}/>
            <Info rotulo="Bloqueios ativos" valor={String(pessoa.bloqueios_ativos ?? 0)}/>
            <Info rotulo="Cadastrado em" valor={formatarDataHora(pessoa.created_at)}/>
          </div>}

          {aba === 'imoveis' && <>
            {imoveis.length === 0 && <p className="texto-sutil">Nenhum imóvel vinculado.</p>}
            {imoveis.map((im) => (
              <div key={im.id} className="pessoas-imovel-card">
                <div className="pessoas-imovel-titulo"><Building2 size={14}/> {im.nome || im.codigo}</div>
                <div className="pessoas-imovel-meta"><MapPin size={12}/> {[im.logradouro, im.numero, im.bairro, im.comunidade].filter(Boolean).join(', ') || '—'}</div>
                <div className="pessoas-imovel-meta"><FileText size={12}/> Tipo: {im.tipo} · Área: {im.area_hectares ? `${im.area_hectares} ha` : '—'}</div>
              </div>
            ))}
          </>}

          {aba === 'historico' && <>
            {timeline.length === 0 && <p className="texto-sutil">Nenhum registro de histórico.</p>}
            {timeline.length > 0 && <div className="linha-tempo">
              {timeline.map((r) => (
                <div key={r.id}>
                  <div className="ponto ok"/>
                  <p><strong>{r.acao}</strong> — {r.resultado}{r.detalhe && <span className="texto-sutil">{r.detalhe}</span>}<small>{r.usuario?.nome} · {formatarDataHora(r.criada_em)}</small></p>
                </div>
              ))}
            </div>}
          </>}
        </div>

        <footer className="painel-rodape">
          <button className="botao" onClick={fechar}><ChevronLeft size={15}/> Fechar</button>
          <div className="painel-rodape-acoes">
            {(pessoa.bloqueios_ativos ?? 0) > 0 && <Chip cor="vermelho"><ShieldCheck size={11}/> {pessoa.bloqueios_ativos} bloqueio(s)</Chip>}
            <button className="botao pequeno" onClick={() => navegar(`/govinfra/solicitacoes/nova?pessoa=${pessoa.id}`)}>Nova solicitação</button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="painel-info"><span className="painel-info-rotulo">{rotulo}</span><span className="painel-info-valor">{valor}</span></div>;
}

/* ── Formulário de cadastro premium ─────────────────────────────────────── */

const CLASSIFICACOES = [
  { chave: 'cidadao', rotulo: 'Cidadão' },
  { chave: 'produtor_rural', rotulo: 'Produtor rural' },
  { chave: 'proprietario', rotulo: 'Proprietário' },
  { chave: 'arrendatario', rotulo: 'Arrendatário' },
  { chave: 'pessoa_juridica', rotulo: 'Empresa' },
  { chave: 'representante', rotulo: 'Representante' },
  { chave: 'responsavel_imovel', rotulo: 'Resp. imóvel' },
];

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

function FormPessoaMelhorado({ salvando, aoSalvar }: { salvando: boolean; aoSalvar: (corpo: Record<string, unknown>) => void }) {
  const [form, setForm] = useState<Record<string, any>>({ tipos: ['cidadao'], pessoa_juridica: false });
  const [erroCpf, setErroCpf] = useState('');
  const [cpfValidado, setCpfValidado] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'buscando' | 'ok' | 'erro'>('idle');
  const set = (campo: string, valor: any) => setForm((f) => ({ ...f, [campo]: valor }));

  function mascararCpf(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function mascararCep(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
  }

  function mascararTelefone(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function aoMudarCpf(valor: string) {
    const mascarado = mascararCpf(valor);
    set('documento', mascarado);
    const digitos = mascarado.replace(/\D/g, '');
    if (digitos.length === 11) {
      if (validarCpf(digitos)) { setErroCpf(''); setCpfValidado(true); }
      else { setErroCpf('CPF inválido — confira os dígitos'); setCpfValidado(false); }
    } else { setErroCpf(''); setCpfValidado(false); }
  }

  function aoMudarCep(valor: string) {
    const mascarado = mascararCep(valor);
    set('cep', mascarado);
    const digitos = mascarado.replace(/\D/g, '');
    if (digitos.length === 8) {
      setBuscandoCep(true);
      setCepStatus('buscando');
      // Simula busca — em produção chamaria a API real
      setTimeout(() => {
        setCepStatus('erro'); // O backend real substituiria isto pela resposta
        setBuscandoCep(false);
      }, 1500);
    } else { setCepStatus('idle'); }
  }

  function aoMudarTelefone(valor: string) { set('telefone', mascararTelefone(valor)); }
  function aoMudarWhats(valor: string) { set('whatsapp', mascararTelefone(valor)); }

  function toggleClassificacao(chave: string) {
    const atual = (form.tipos || []) as string[];
    if (atual.includes(chave)) set('tipos', atual.filter((t) => t !== chave));
    else set('tipos', [...atual, chave]);
  }

  return <form id="form-pessoa" onSubmit={(e) => { e.preventDefault(); aoSalvar(form); }}>
    {/* ── Tipo PF/PJ ──────────────────────────────────────── */}
    <div className="cadastro-secao">
      <div className="cadastro-secao-header">
        <div className="cadastro-secao-icone"><User size={20}/></div>
        <div>
          <div className="cadastro-secao-titulo">Tipo de cadastro</div>
          <div className="cadastro-secao-desc">Pessoa física ou jurídica</div>
        </div>
      </div>
      <div className="alternador" role="group">
        <button type="button" className={!form.pessoa_juridica ? 'selecionado' : ''} onClick={() => set('pessoa_juridica', false)}>Pessoa física</button>
        <button type="button" className={form.pessoa_juridica ? 'selecionado' : ''} onClick={() => set('pessoa_juridica', true)}>Pessoa jurídica</button>
      </div>
    </div>

    {/* ── Dados pessoais ───────────────────────────────────── */}
    <div className="cadastro-secao">
      <div className="cadastro-secao-header">
        <div className="cadastro-secao-icone"><User size={20}/></div>
        <div>
          <div className="cadastro-secao-titulo">Dados {form.pessoa_juridica ? 'da empresa' : 'pessoais'}</div>
          <div className="cadastro-secao-desc">Informações de identificação e contato.</div>
        </div>
      </div>
      <div className="cadastro-grade">
        {/* Nome — largura total */}
        <div className="cadastro-campo full">
          <label className="cadastro-label">{form.pessoa_juridica ? 'Razão social' : 'Nome completo'} <span className="cadastro-asterisco">*</span></label>
          <div className="cadastro-input-envolve">
            <User size={16} className="cadastro-input-icone"/>
            <input required className="cadastro-input" value={form.nome || ''} onChange={(e) => set('nome', e.target.value)}
              placeholder={form.pessoa_juridica ? 'Razão social da empresa' : 'Digite o nome completo do cidadão'}/>
          </div>
        </div>

        {form.pessoa_juridica && (
          <div className="cadastro-campo full">
            <label className="cadastro-label">Nome fantasia</label>
            <div className="cadastro-input-envolve">
              <Building2 size={16} className="cadastro-input-icone"/>
              <input className="cadastro-input" value={form.nome_fantasia || ''} onChange={(e) => set('nome_fantasia', e.target.value)} placeholder="Nome fantasia da empresa"/>
            </div>
          </div>
        )}

        {/* CPF / CNPJ + Data */}
        <div className="cadastro-campo">
          <label className="cadastro-label">{form.pessoa_juridica ? 'CNPJ' : 'CPF'} {!form.pessoa_juridica && <span className="cadastro-ajuda">Verificação de duplicidade</span>}</label>
          <div className={`cadastro-input-envolve ${erroCpf ? 'erro' : ''} ${cpfValidado ? 'ok' : ''}`}>
            <Hash size={16} className="cadastro-input-icone"/>
            <input inputMode="numeric" className="cadastro-input" placeholder={form.pessoa_juridica ? '00.000.000/0000-00' : '000.000.000-00'}
              value={form.documento || ''} onChange={(e) => aoMudarCpf(e.target.value)}/>
          </div>
          {erroCpf && <span className="cadastro-feedback erro"><AlertTriangle size={11}/> {erroCpf}</span>}
          {cpfValidado && <span className="cadastro-feedback ok"><CheckCircle2 size={11}/> CPF válido</span>}
        </div>

        <div className="cadastro-campo">
          <label className="cadastro-label">{form.pessoa_juridica ? 'Data de abertura' : 'Data de nascimento'}</label>
          <div className="cadastro-input-envolve">
            <Calendar size={16} className="cadastro-input-icone"/>
            <input type="date" className="cadastro-input" value={form.data_nascimento || ''} onChange={(e) => set('data_nascimento', e.target.value)}/>
          </div>
        </div>

        {/* Telefone + WhatsApp */}
        <div className="cadastro-campo">
          <label className="cadastro-label">Telefone principal</label>
          <div className="cadastro-input-envolve">
            <Phone size={16} className="cadastro-input-icone"/>
            <input inputMode="tel" className="cadastro-input" placeholder="(00) 00000-0000" value={form.telefone || ''} onChange={(e) => aoMudarTelefone(e.target.value)}/>
          </div>
        </div>

        <div className="cadastro-campo">
          <label className="cadastro-label">
            WhatsApp
            <label className="cadastro-whats-check">
              <input type="checkbox" checked={!!form.whatsapp_mesmo_telefone} onChange={(e) => {
                set('whatsapp_mesmo_telefone', e.target.checked);
                if (e.target.checked) set('whatsapp', form.telefone);
              }}/> Mesmo número
            </label>
          </label>
          <div className="cadastro-input-envolve">
            <Phone size={16} className="cadastro-input-icone"/>
            <input inputMode="tel" className="cadastro-input" placeholder="(00) 00000-0000" value={form.whatsapp || ''} onChange={(e) => aoMudarWhats(e.target.value)}
              disabled={!!form.whatsapp_mesmo_telefone}/>
          </div>
        </div>

        {/* E-mail — largura total */}
        <div className="cadastro-campo full">
          <label className="cadastro-label">E-mail</label>
          <div className="cadastro-input-envolve">
            <AtSign size={16} className="cadastro-input-icone"/>
            <input type="email" className="cadastro-input" placeholder="nome@exemplo.com" value={form.email || ''} onChange={(e) => set('email', e.target.value)}/>
          </div>
        </div>
      </div>
    </div>

    {/* ── Classificação ────────────────────────────────────── */}
    <div className="cadastro-secao">
      <div className="cadastro-secao-header">
        <div className="cadastro-secao-icone"><Hash size={20}/></div>
        <div>
          <div className="cadastro-secao-titulo">Classificação</div>
          <div className="cadastro-secao-desc">Vínculos desta pessoa com os serviços municipais.</div>
        </div>
      </div>
      <div className="cadastro-chips">
        {CLASSIFICACOES.map((c) => {
          const selecionado = (form.tipos || []).includes(c.chave);
          return (
            <button type="button" key={c.chave}
              className={`cadastro-chip ${selecionado ? 'ativo' : ''}`}
              onClick={() => toggleClassificacao(c.chave)}>
              {selecionado && <CheckCircle2 size={14}/>} {c.rotulo}
            </button>
          );
        })}
      </div>
    </div>

    {/* ── Endereço ─────────────────────────────────────────── */}
    <div className="cadastro-secao">
      <div className="cadastro-secao-header">
        <div className="cadastro-secao-icone"><MapPin size={20}/></div>
        <div>
          <div className="cadastro-secao-titulo">Endereço</div>
          <div className="cadastro-secao-desc">Localização principal do cidadão ou produtor.</div>
        </div>
      </div>

      {/* Busca por CEP */}
      <div className="cadastro-campo full" style={{ marginBottom: 14 }}>
        <label className="cadastro-label">Pesquisar por CEP</label>
        <div className={`cadastro-input-envolve ${cepStatus === 'buscando' ? 'foco' : ''} ${cepStatus === 'ok' ? 'ok' : ''} ${cepStatus === 'erro' ? 'erro' : ''}`}>
          <Search size={16} className="cadastro-input-icone"/>
          <input inputMode="numeric" className="cadastro-input" placeholder="Digite o CEP (00000-000) para buscar o endereço"
            value={form.cep || ''} onChange={(e) => aoMudarCep(e.target.value)}/>
          {buscandoCep && <div className="cadastro-input-loader"><div className="giro" style={{width:14,height:14,border:'2px solid var(--cinza-300)',borderTopColor:'var(--laranja-600)',borderRadius:'50%'}}/></div>}
        </div>
        {cepStatus === 'buscando' && <span className="cadastro-feedback" style={{color:'var(--cinza-500)'}}>Buscando endereço…</span>}
        {cepStatus === 'erro' && <span className="cadastro-feedback erro"><AlertTriangle size={11}/> CEP não encontrado. Preencha manualmente.</span>}
      </div>

      <div className="cadastro-grade">
        <div className="cadastro-campo">
          <label className="cadastro-label">Logradouro</label>
          <div className="cadastro-input-envolve">
            <MapPin size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.logradouro || ''} onChange={(e) => set('logradouro', e.target.value)} placeholder="Rua, avenida ou estrada"/>
          </div>
        </div>
        <div className="cadastro-campo cadastro-campo-curto">
          <label className="cadastro-label">Número</label>
          <div className="cadastro-input-envolve">
            <Hash size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.numero || ''} onChange={(e) => set('numero', e.target.value)} placeholder="Ex: 150"/>
          </div>
        </div>
        <div className="cadastro-campo">
          <label className="cadastro-label">Bairro</label>
          <div className="cadastro-input-envolve">
            <MapPin size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.bairro || ''} onChange={(e) => set('bairro', e.target.value)} placeholder="Digite o bairro"/>
          </div>
        </div>
        <div className="cadastro-campo">
          <label className="cadastro-label">Complemento</label>
          <div className="cadastro-input-envolve">
            <PencilLine size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.complemento || ''} onChange={(e) => set('complemento', e.target.value)} placeholder="Casa, bloco, lote, apto…"/>
          </div>
        </div>
        <div className="cadastro-campo">
          <label className="cadastro-label">Município</label>
          <div className="cadastro-input-envolve">
            <MapPinHouse size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.municipio || ''} onChange={(e) => set('municipio', e.target.value)} placeholder="Digite o município"/>
          </div>
        </div>
        <div className="cadastro-campo cadastro-campo-curto">
          <label className="cadastro-label">UF</label>
          <select className="cadastro-input cadastro-select" value={form.uf || ''} onChange={(e) => set('uf', e.target.value.toUpperCase())}>
            <option value="">UF</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div className="cadastro-campo full">
          <label className="cadastro-label">Ponto de referência</label>
          <div className="cadastro-input-envolve">
            <MapPin size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.referencia || ''} onChange={(e) => set('referencia', e.target.value)} placeholder="Ex: próximo ao posto de saúde"/>
          </div>
        </div>
      </div>
    </div>

    {/* ── Informações adicionais ───────────────────────────── */}
    <div className="cadastro-secao" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: 0 }}>
      <div className="cadastro-secao-header">
        <div className="cadastro-secao-icone"><PencilLine size={20}/></div>
        <div>
          <div className="cadastro-secao-titulo">Informações adicionais</div>
          <div className="cadastro-secao-desc">Observações internas sobre este cadastro.</div>
        </div>
      </div>
      <div className="cadastro-campo full">
        <label className="cadastro-label">Observações</label>
        <textarea className="cadastro-input cadastro-textarea" rows={4} value={form.observacoes || ''}
          onChange={(e) => set('observacoes', e.target.value)} placeholder="Adicione observações internas importantes sobre este cadastro…"
          maxLength={1000}/>
        <div className="cadastro-contador">{(form.observacoes || '').length} / 1000 caracteres</div>
      </div>
    </div>
  </form>;
}

function validarCpf(n: string): boolean {
  if (!/^\d{11}$/.test(n) || /^(\d)\1{10}$/.test(n)) return false;
  let soma = 0; for (let i = 0; i < 9; i++) soma += Number(n[i]) * (10 - i);
  if (((soma * 10) % 11) % 10 !== Number(n[9])) return false;
  soma = 0; for (let i = 0; i < 10; i++) soma += Number(n[i]) * (11 - i);
  return ((soma * 10) % 11) % 10 === Number(n[10]);
}
