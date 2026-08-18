import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  File,
  FileImage,
  FileText,
  FolderOpen,
  History,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { T } from '../theme.js';
import { api, getToken } from '../api.js';
import { useLogado } from './LogadoContext.jsx';
import { PortalHeader } from '../components/PortalChrome.jsx';
import { renderizarMarkdown } from '../utils/markdown.js';
import { htmlParaTexto } from '../utils/htmlParaTexto.js';

const STATUS = {
  ABERTO: { label: 'Solicitação recebida', tone: 'blue', etapa: 1 },
  EM_ANDAMENTO: { label: 'Em análise', tone: 'blue', etapa: 2 },
  PENDENTE: { label: 'Aguardando sua resposta', tone: 'warning', etapa: 2 },
  CONCLUIDO: { label: 'Concluída', tone: 'success', etapa: 3 },
  CANCELADO: { label: 'Cancelada', tone: 'danger', etapa: 3 },
  ARQUIVADO: { label: 'Arquivada', tone: 'neutral', etapa: 3 },
};

const ETAPAS = [
  { nome: 'Recebida', ajuda: 'Protocolo registrado' },
  { nome: 'Em análise', ajuda: 'Setor responsável' },
  { nome: 'Concluída', ajuda: 'Resposta final' },
];

const MAX_MB = 20;
const EXTENSOES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.odt,.ods';

function formatarData(iso, comHora = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function formatarTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function diasRestantes(prazo) {
  if (!prazo) return null;
  const d = new Date(prazo);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

const protocoloDaUrl = () => window.location.hash.replace(/^#\/?/, '').split('/')[1];

function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="pd-empty-state">
      <span><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function FileIcon({ mime }) {
  if ((mime || '').includes('pdf')) return <FileText size={21} />;
  if ((mime || '').startsWith('image/')) return <FileImage size={21} />;
  return <File size={21} />;
}

export function ConsultaProtocolo({ navigate }) {
  const { conta, logout } = useLogado();
  // Quem chegou pelo painel volta para a lista; quem usou código de acesso
  // volta para a tela de consulta.
  const logado = !!(conta && getToken());
  const voltar = () => navigate(logado ? 'meus-protocolos' : '');
  const sair = () => { logout(); navigate(''); };
  const cabecalho = <PortalHeader navigate={navigate} conta={logado ? conta : null} onSair={logado ? sair : undefined} />;

  const [proto, setProto] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [novaMsg, setNovaMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aba, setAba] = useState('andamento');
  const [enviandoDoc, setEnviandoDoc] = useState(false);
  const [erroDoc, setErroDoc] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [baixando, setBaixando] = useState('');
  const fimRef = useRef(null);
  const inputArquivo = useRef(null);

  const carregar = React.useCallback(() => {
    const id = protocoloDaUrl();
    if (!id || !getToken()) { setErro('Sua sessão de consulta expirou.'); setLoading(false); return; }
    Promise.all([
      api.detalhesProtocolo(id).catch(() => null),
      api.mensagensProtocolo(id).catch(() => []),
      api.documentosProtocolo(id).catch(() => []),
      api.timelineProtocolo(id).catch(() => []),
    ]).then(([p, m, d, t]) => {
      if (!p) { setErro('Sua sessão de consulta expirou.'); return; }
      setProto(p);
      setMsgs(Array.isArray(m) ? m : []);
      setDocs(Array.isArray(d) ? d : []);
      setTimeline(Array.isArray(t) ? t : []);
    }).catch(e => setErro(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const enviarMsg = async () => {
    if (!novaMsg.trim() || enviando) return;
    setEnviando(true); setErro('');
    try {
      const m = await api.enviarMensagem(protocoloDaUrl(), novaMsg.trim());
      setMsgs(prev => [...prev, m]);
      setNovaMsg('');
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (e) { setErro(e.message); }
    finally { setEnviando(false); }
  };

  const handlePaste = (e) => {
    const html = e.clipboardData?.getData?.('text/html');
    if (!html) return;
    const textoLimpo = htmlParaTexto(html);
    if (!textoLimpo) return;
    e.preventDefault();
    const el = e.target;
    const start = el.selectionStart ?? novaMsg.length;
    const end = el.selectionEnd ?? novaMsg.length;
    setNovaMsg(el.value.slice(0, start) + textoLimpo + el.value.slice(end));
    const pos = start + textoLimpo.length;
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = pos; });
  };

  const baixar = async (doc) => {
    setErroDoc(''); setBaixando(doc.id);
    try { await api.baixarDocumento(protocoloDaUrl(), doc.id, doc.nome_amigavel); }
    catch (e) { setErroDoc(e.message); }
    finally { setBaixando(''); }
  };

  const enviarArquivos = async (lista) => {
    const arquivos = Array.from(lista || []);
    if (!arquivos.length) return;
    setErroDoc(''); setAviso(''); setEnviandoDoc(true);
    const falhas = [];
    for (const arquivo of arquivos) {
      if (arquivo.size > MAX_MB * 1024 * 1024) { falhas.push(`${arquivo.name} (maior que ${MAX_MB} MB)`); continue; }
      try { await api.enviarDocumento(protocoloDaUrl(), arquivo); }
      catch (e) { falhas.push(`${arquivo.name} — ${e.message}`); }
    }
    setEnviandoDoc(false);
    if (inputArquivo.current) inputArquivo.current.value = '';
    if (falhas.length) setErroDoc(falhas.join(' · '));
    if (falhas.length < arquivos.length) {
      setAviso('Documento enviado. O setor responsável fará a análise.');
      carregar();
    }
  };

  if (loading) return (
    <div className="pd-app">{cabecalho}
      <main className="pd-query-shell"><div className="pd-query-loading"><RefreshCw className="pd-spin" size={24} /><span>Carregando seu protocolo…</span></div></main>
    </div>
  );

  if (erro && !proto) return (
    <div className="pd-app">{cabecalho}
      <main className="pd-query-shell">
        <section className="pd-query-error">
          <span><LockKeyhole size={25} /></span>
          <h1>{erro}</h1>
          <p>{logado
            ? 'Não foi possível abrir este protocolo. Volte para a lista e tente novamente.'
            : 'Informe novamente o número do protocolo e o código de acesso para continuar.'}</p>
          <button className="pd-primary-btn" type="button" onClick={voltar}>
            {logado ? 'Voltar aos meus protocolos' : 'Consultar novamente'} <ArrowRight size={17} />
          </button>
        </section>
      </main>
    </div>
  );

  const situacao = STATUS[proto?.status] || { label: proto?.status || 'Em acompanhamento', tone: 'neutral', etapa: 1 };
  const dias = diasRestantes(proto?.prazo_em);
  const concluido = ['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'].includes(proto?.status);
  const tabs = [
    { id: 'andamento', nome: 'Andamento', icon: History },
    { id: 'mensagens', nome: 'Mensagens', count: msgs.length, icon: MessageSquare },
    { id: 'documentos', nome: 'Documentos', count: docs.length, icon: FolderOpen },
  ];

  return (
    <div className="pd-app">
      {cabecalho}
      <main className="pd-query-shell">
        <div className="pd-query-toolbar">
          <button type="button" className="pd-back" onClick={voltar}>
            <ArrowLeft size={18} /> {logado ? 'Meus protocolos' : 'Consultar outro protocolo'}
          </button>
          <span><ShieldCheck size={15} /> Consulta protegida</span>
        </div>

        <section className="pd-query-hero">
          <div className="pd-query-hero__main">
            <div className="pd-query-kicker">
              <span>Protocolo</span>
              <strong>{proto.numero}</strong>
            </div>
            <span className={`pd-status pd-status--${situacao.tone}`}>{situacao.label}</span>
            <h1>{proto.assunto || 'Solicitação'}</h1>
            {proto.descricao && <p>{proto.descricao}</p>}
          </div>

          <div className="pd-progress" aria-label={`Situação atual: ${situacao.label}`}>
            {ETAPAS.map((etapa, index) => {
              const alcancada = situacao.etapa >= index + 1;
              const atual = situacao.etapa === index + 1;
              return (
                <div className={`pd-progress__step ${alcancada ? 'is-reached' : ''} ${atual ? 'is-current' : ''}`} key={etapa.nome}>
                  <div className="pd-progress__line" />
                  <span className="pd-progress__dot">{alcancada ? <Check size={15} /> : index + 1}</span>
                  <div><strong>{etapa.nome}</strong><small>{etapa.ajuda}</small></div>
                </div>
              );
            })}
          </div>

          <div className="pd-query-facts">
            <div><span><FileText size={16} /> Serviço</span><strong>{proto.servico_nome || 'Não informado'}</strong></div>
            <div><span><Building2 size={16} /> Setor responsável</span><strong>{proto.setor_atual_nome || 'Em definição'}</strong></div>
            <div><span><CalendarDays size={16} /> Aberto em</span><strong>{formatarData(proto.aberto_em)}</strong></div>
            <div><span><Clock3 size={16} /> Prazo previsto</span><strong>{proto.prazo_em ? formatarData(proto.prazo_em, false) : 'Sem prazo definido'}</strong></div>
          </div>
        </section>

        {proto.pendencias?.length > 0 && (
          <section className="pd-pending-card">
            <div className="pd-pending-card__head"><AlertCircle size={20} /><div><strong>Precisamos de você</strong><span>Envie o que foi solicitado para o atendimento continuar.</span></div></div>
            <div className="pd-pending-list">
              {proto.pendencias.map((p, i) => <div key={i}><strong>{p.titulo}</strong>{p.descricao && <p>{p.descricao}</p>}{p.prazo_em && <small>Responder até {formatarData(p.prazo_em, false)}</small>}</div>)}
            </div>
            <button type="button" onClick={() => setAba('documentos')}>Enviar documento <ArrowRight size={16} /></button>
          </section>
        )}

        {aviso && <div className="pd-query-notice pd-query-notice--success" role="status"><CheckCircle2 size={18} /> {aviso}</div>}
        {erro && <div className="pd-query-notice pd-query-notice--danger" role="alert"><AlertCircle size={18} /> {erro}</div>}

        <div className="pd-query-layout">
          <section className="pd-workspace">
            <div className="pd-workspace-tabs" role="tablist" aria-label="Informações do protocolo">
              {tabs.map(({ id, nome, count, icon: Icon }) => (
                <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>
                  <Icon size={17} /><span>{nome}</span>{count > 0 && <em>{count}</em>}
                </button>
              ))}
            </div>

            <div className="pd-workspace-body" role="tabpanel">
              {aba === 'andamento' && (timeline.length === 0 ? (
                <EmptyState icon={History} title="Aguardando a primeira movimentação" text="As atualizações do setor responsável aparecerão aqui em ordem cronológica." />
              ) : (
                <div className="pd-timeline">
                  {timeline.map((item, index) => (
                    <article key={item.id || index} className={index === timeline.length - 1 ? 'is-latest' : ''}>
                      <span className="pd-timeline__marker" />
                      <div className="pd-timeline__content">
                        {index === timeline.length - 1 && <small className="pd-timeline__latest">Atualização mais recente</small>}
                        <h3>{item.titulo}</h3>
                        {item.descricao && <p>{item.descricao}</p>}
                        <time>{formatarData(item.data)}</time>
                      </div>
                    </article>
                  ))}
                </div>
              ))}

              {aba === 'mensagens' && (
                <div className="pd-messages">
                  <div className="pd-message-list">
                    {!msgs.length ? <EmptyState icon={MessageSquare} title="Nenhuma mensagem ainda" text="Use o campo abaixo para falar diretamente com o setor responsável." /> : msgs.map(m => {
                      const prefeitura = m.direcao === 'saida';
                      return <div key={m.id} className={`pd-message ${prefeitura ? 'is-service' : 'is-citizen'}`}>
                        <div>{renderizarMarkdown(m.conteudo)}</div><small>{prefeitura ? 'Atendimento' : 'Você'} · {formatarData(m.criado_em)}</small>
                      </div>;
                    })}
                    <div ref={fimRef} />
                  </div>
                  <div className="pd-message-composer">
                    <textarea value={novaMsg} onChange={(e) => setNovaMsg(e.target.value)} onPaste={handlePaste} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMsg(); } }} placeholder="Escreva uma mensagem para o atendimento…" rows={2} />
                    <button type="button" onClick={enviarMsg} disabled={enviando || !novaMsg.trim()} aria-label="Enviar mensagem">{enviando ? <RefreshCw className="pd-spin" size={19} /> : <Send size={19} />}</button>
                  </div>
                  <p className="pd-composer-help">Enter envia · Shift + Enter cria uma nova linha</p>
                </div>
              )}

              {aba === 'documentos' && (
                <div className="pd-documents">
                  {erroDoc && <div className="pd-query-notice pd-query-notice--danger" role="alert"><AlertCircle size={18} /> {erroDoc}</div>}
                  <div className={`pd-upload ${arrastando ? 'is-dragging' : ''}`} role="button" tabIndex={0} onClick={() => !enviandoDoc && inputArquivo.current?.click()} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !enviandoDoc) inputArquivo.current?.click(); }} onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={(e) => { e.preventDefault(); setArrastando(false); enviarArquivos(e.dataTransfer.files); }}>
                    <input ref={inputArquivo} type="file" multiple accept={EXTENSOES} onChange={(e) => enviarArquivos(e.target.files)} hidden />
                    <span>{enviandoDoc ? <RefreshCw className="pd-spin" size={23} /> : <UploadCloud size={23} />}</span>
                    <div><strong>{enviandoDoc ? 'Enviando documento…' : 'Envie documentos para o atendimento'}</strong><p>Arraste aqui ou clique para escolher · até {MAX_MB} MB</p></div>
                  </div>
                  {!docs.length ? <EmptyState icon={FolderOpen} title="Nenhum documento disponível" text="Arquivos enviados ou liberados pelo atendimento aparecerão nesta área." /> : (
                    <div className="pd-document-list">
                      {docs.map(doc => <article key={doc.id}>
                        <span className="pd-document-icon"><FileIcon mime={doc.mime_type} /></span>
                        <div><strong>{doc.nome_amigavel}</strong><small>{[formatarTamanho(doc.tamanho_bytes), formatarData(doc.criado_em, false)].filter(Boolean).join(' · ')}</small></div>
                        <button type="button" onClick={() => baixar(doc)} disabled={baixando === doc.id}>{baixando === doc.id ? <RefreshCw className="pd-spin" size={17} /> : <Download size={17} />}<span>{baixando === doc.id ? 'Baixando' : 'Baixar'}</span></button>
                      </article>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="pd-query-aside">
            <section className="pd-next-step">
              <span className={`pd-next-step__icon pd-next-step__icon--${situacao.tone}`}>{concluido ? <CheckCircle2 size={21} /> : <Clock3 size={21} />}</span>
              <small>Situação atual</small>
              <h2>{situacao.label}</h2>
              <p>{proto.status === 'PENDENTE' ? 'Confira as pendências e envie os dados solicitados.' : concluido ? 'O atendimento foi encerrado. Consulte o histórico e os documentos.' : 'O setor responsável está acompanhando sua solicitação.'}</p>
            </section>

            {!concluido && dias !== null && (
              <section className={`pd-deadline ${dias < 0 ? 'is-late' : ''}`}>
                <div><Clock3 size={18} /><strong>{dias < 0 ? 'Prazo ultrapassado' : dias === 0 ? 'Prazo termina hoje' : `${dias} ${dias === 1 ? 'dia restante' : 'dias restantes'}`}</strong></div>
                <p>{dias < 0 ? 'A solicitação continua em análise pelo setor responsável.' : `Previsão atual: ${formatarData(proto.prazo_em, false)}.`}</p>
              </section>
            )}

            <section className="pd-query-security">
              <LockKeyhole size={18} />
              <div><strong>Proteja seu acesso</strong><p>Não compartilhe o código deste protocolo. Ele permite visualizar mensagens e documentos.</p></div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
