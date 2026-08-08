import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clipboard,
  CreditCard,
  FileText,
  Loader2,
  Search,
  Shield,
  Smartphone,
  Timer,
  UserRound,
} from 'lucide-react';
import { api, getToken } from '../api.js';
import { useLogado } from './LogadoContext.jsx';
import { iniciais, PortalFooter, PortalHeader, SecurityNote } from '../components/PortalChrome.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';

const ICONES_SERVICO = {
  saude: FileText, assistencia: UserRound, educacao: FileText,
  infraestrutura: Shield, tributos: CreditCard, geral: FileText,
};

function maskCPF(v) {
  const s = (v || '').replace(/\D/g, '').slice(0, 11);
  if (s.length <= 3) return s;
  if (s.length <= 6) return `${s.slice(0, 3)}.${s.slice(3)}`;
  if (s.length <= 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`;
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9, 11)}`;
}

function maskTel(v) {
  const s = (v || '').replace(/\D/g, '').slice(0, 11);
  if (s.length <= 2) return s.length ? `(${s}` : '';
  if (s.length <= 7) return `(${s.slice(0, 2)}) ${s.slice(2)}`;
  return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
}

function Jornada({ etapa }) {
  const etapas = ['Serviço', 'Seus dados', 'Confirmação'];
  return (
    <ol className="pd-journey pd-journey--steps" aria-label="Etapas da solicitação">
      {etapas.map((nome, i) => (
        <li key={nome} className={i + 1 <= etapa ? 'is-done' : ''}>{nome}</li>
      ))}
    </ol>
  );
}

function CampoDinamico({ campo, valor, onChange }) {
  const comum = {
    className: 'pd-input',
    value: valor || '',
    onChange: (e) => onChange(campo.id, e.target.value),
    placeholder: campo.placeholder || '',
  };

  return (
    <label className={`pd-field ${campo.tipo === 'texto_longo' ? 'pd-field--full' : ''}`}>
      <span className="pd-field__label">
        {campo.rotulo}{campo.obrigatorio ? ' *' : ''}
        {!campo.obrigatorio && <span className="pd-optional">Opcional</span>}
      </span>
      <span className="pd-input-wrap">
        {campo.tipo === 'texto_longo' ? (
          <>
            <textarea {...comum} rows={3} maxLength={1500} className="pd-input pd-textarea" />
            <span className="pd-input-counter">{(valor || '').length}/1500 caracteres</span>
          </>
        ) : campo.tipo === 'selecao' ? (
          <select
            className="pd-input pd-select"
            value={valor || ''}
            onChange={(e) => onChange(campo.id, e.target.value)}
          >
            <option value="">Selecione…</option>
            {(Array.isArray(campo.opcoes) ? campo.opcoes : []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            {...comum}
            type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : campo.tipo === 'email' ? 'email' : 'text'}
          />
        )}
      </span>
      {campo.ajuda && <span className="pd-form-help">{campo.ajuda}</span>}
    </label>
  );
}

export function NovaSolicitacao({ navigate, servicoId }) {
  const { conta, logout } = useLogado();
  const logado = !!(conta && getToken());

  const [passo, setPasso] = useState(1);
  const [servicos, setServicos] = useState([]);
  const [carregandoServicos, setCarregandoServicos] = useState(true);
  const [servico, setServico] = useState(null);
  const [campos, setCampos] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(null);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [copiado, setCopiado] = useState(false);
  const [orgaos, setOrgaos] = useState([]);
  const [orgaoSlug, setOrgaoSlug] = useState('');

  useEffect(function () {
    api.tenants().then(function (t) {
      var lista = Array.isArray(t) ? t : [];
      setOrgaos(lista);
      // Quem está logado tem órgão definido pela conta (vem de /my/account):
      // pré-selecionar o primeiro da lista aqui só faria o catálogo piscar
      // com serviços de outro município.
      if (lista.length > 0 && !orgaoSlug && !logado) {
        setOrgaoSlug(lista[0].slug);
      } else if (lista.length === 0) {
        // Sem órgão nenhum o efeito dos serviços nunca dispara; encerra o
        // "carregando" para a tela mostrar o estado vazio em vez do spinner.
        setCarregandoServicos(false);
      }
    }).catch(function () { setCarregandoServicos(false); });
  }, []);

  // Depende de orgaoSlug: o slug só existe depois da resposta de /tenants,
  // então o efeito precisa rodar de novo quando ele chega (e a cada troca
  // de órgão). Com deps vazias a tela ficava presa em "Carregando serviços".
  useEffect(() => {
    if (!orgaoSlug) return;
    setCarregandoServicos(true);
    api.servicos(orgaoSlug)
      .then(s => {
        const lista = Array.isArray(s) ? s : [];
        setServicos(lista);
        if (servicoId) {
          const achado = lista.find(x => x.id === servicoId);
          if (achado) selecionarServico(achado);
        }
      })
      .catch(() => setServicos([]))
      .finally(() => setCarregandoServicos(false));
  }, [orgaoSlug, servicoId]);

  // Quem já tem conta não redigita nome/CPF: os dados vêm do cadastro.
  useEffect(() => {
    if (!logado) return;
    api.minhaConta()
      .then(c => {
        setForm(f => ({
          ...f,
          _nome: f._nome || c.nome || '',
          _cpf: f._cpf || c.cpf || '',
          _telefone: f._telefone || c.telefone || '',
          _email: f._email || c.email || '',
        }));
        // A conta pertence a um município, e o protocolo nasce nele. Se o
        // catálogo na tela fosse de outro órgão, o serviço escolhido não
        // existiria no tenant da conta e o envio voltava "Serviço não
        // encontrado".
        if (c.tenant_slug) setOrgaoSlug(c.tenant_slug);
      })
      .catch(() => {});
  }, [logado]);

  const selecionarServico = async (s) => {
    setServico(s);
    setErro('');
    try {
      const detalhe = await api.detalhesServico(s.id);
      setCampos(Array.isArray(detalhe.campos) ? detalhe.campos : []);
    } catch { setCampos([]); }
    setPasso(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const atualizarCampo = (campoId, valor) => setForm(f => ({ ...f, [campoId]: valor }));

  const camposPreenchidos = () => Object.entries(form).filter(([k]) => !k.startsWith('_'));

  // Sem campos próprios, o serviço não coleta nada: o relato livre é o que dá
  // conteúdo ao protocolo, então vira obrigatório.
  const relatoObrigatorio = campos.length === 0;
  const faltaRelato = relatoObrigatorio && !String(form._descricao || '').trim();
  const faltaObrigatorio = campos.some(c => c.obrigatorio && !String(form[c.id] || '').trim());
  const podeEnviar = !loading && !faltaObrigatorio && !faltaRelato && (logado || String(form._nome || '').trim());

  const enviar = async () => {
    setLoading(true); setErro('');
    try {
      const descricao = [
        String(form._descricao || '').trim(),
        ...camposPreenchidos().map(([k, v]) => {
          const campo = campos.find(c => c.id === k);
          return campo ? `${campo.rotulo}: ${v}` : `${k}: ${v}`;
        }),
      ].filter(Boolean).join('\n');
      const camposEnviados = camposPreenchidos().map(([k, v]) => ({ campo_id: k, valor: String(v) }));

      const result = logado
        ? await api.criarSolicitacaoLogado({
            servico_id: servico.id,
            descricao,
            campos: camposEnviados,
            telefone: (form._telefone || '').replace(/\D/g, ''),
            tenant_slug: orgaoSlug,
          })
        : await api.criarSolicitacao({
            nome: form._nome || '',
            cpf: (form._cpf || '').replace(/\D/g, ''),
            telefone: (form._telefone || '').replace(/\D/g, ''),
            email: form._email || '',
            servico_id: servico.id,
            assunto: servico.nome,
            descricao,
            campos: camposEnviados,
            tenant_slug: orgaoSlug,
          });

      setSucesso(result);
      setPasso(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(e.message);
      if (logado && /login|sessão/i.test(e.message)) { logout(); navigate(''); }
    } finally { setLoading(false); }
  };

  const sair = () => { logout(); navigate(''); };
  const cabecalho = (props) => (
    <PortalHeader navigate={navigate} conta={logado ? conta : null} onSair={logado ? sair : undefined} {...props} />
  );

  // O catálogo passa de cem itens: sem filtro por categoria a escolha vira
  // uma rolagem interminável.
  const categorias = React.useMemo(() => {
    const mapa = new Map();
    servicos.forEach(s => {
      const nome = s.categoria_nome || 'Outros serviços';
      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [servicos]);

  const termo = busca.trim().toLowerCase();
  const servicosFiltrados = servicos.filter(s => {
    if (categoria !== 'todas' && (s.categoria_nome || 'Outros serviços') !== categoria) return false;
    if (!termo) return true;
    return [s.nome, s.descricao, s.secretaria_nome, s.categoria_nome]
      .some(v => String(v || '').toLowerCase().includes(termo));
  });

  // ── Passo 3: comprovante ──
  if (sucesso) {
    return (
      <div className="pd-app">
        {cabecalho({})}
        <div className="pd-dash">
          <main className="pd-receipt">
            <div className="pd-receipt__card">
              <span className="pd-receipt__badge"><CheckCircle2 size={30} /></span>
              <h1>Solicitação registrada!</h1>
              <p>Guarde os dados abaixo. Eles permitem consultar o protocolo mesmo sem entrar na conta.</p>

              <div className="pd-receipt__data">
                <div>
                  <small>Número do protocolo</small>
                  <strong>{sucesso.numero}</strong>
                </div>
                {sucesso.senha_acesso && (
                  <div>
                    <small>Código de acesso</small>
                    <strong className="pd-receipt__code">{sucesso.senha_acesso}</strong>
                  </div>
                )}
              </div>

              {sucesso.senha_acesso && (
                <button
                  type="button"
                  className="pd-copy-btn"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(`${sucesso.numero} / ${sucesso.senha_acesso}`); } catch {}
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  }}
                >
                  <Clipboard size={15} /> {copiado ? 'Copiado!' : 'Copiar dados de acesso'}
                </button>
              )}

              <div className="pd-receipt__actions">
                <button className="pd-primary-btn" type="button" onClick={() => navigate(`protocolo/${sucesso.protocolo_id}`)}>
                  Acompanhar solicitação <ArrowRight size={17} />
                </button>
                <button className="pd-secondary-btn" type="button" onClick={() => navigate(logado ? 'meus-protocolos' : '')}>
                  {logado ? 'Ver meus protocolos' : 'Voltar ao início'}
                </button>
              </div>
              <SecurityNote>Enviamos os dados do protocolo para os seus contatos cadastrados.</SecurityNote>
            </div>
          </main>
          <PortalFooter navigate={navigate} />
        </div>
      </div>
    );
  }

  // ── Passo 1: escolher serviço ──
  if (passo === 1) {
    return (
      <div className="pd-app">
        {cabecalho({ back: !logado })}
        <div className="pd-dash">
          <main className="pd-request">
            <section className="pd-request__aside">
              <button className="pd-back" type="button" onClick={() => navigate(logado ? 'meus-protocolos' : '')}>
                <ArrowLeft size={18} /> <span>{logado ? 'Meus protocolos' : 'Voltar ao início'}</span>
              </button>
              <div className="pd-eyebrow">Solicitar atendimento</div>
              <h1>Escolha o serviço desejado.</h1>
              <p>Cada serviço pede as informações necessárias para dar andamento ao pedido. Você acompanha tudo depois em “Meus protocolos”.</p>
              {orgaos.length > 1 && (
                <div className="pd-field" style={{ maxWidth: 360 }}>
                  <span className="pd-field__label">Órgão / Município</span>
                  <span className="pd-input-wrap">
                    <Building2 size={17} aria-hidden="true" />
                    <select
                      className="pd-input pd-input--icon pd-select"
                      value={orgaoSlug}
                      onChange={(e) => setOrgaoSlug(e.target.value)}
                      disabled={logado}
                    >
                      <option value="">Selecione o município…</option>
                      {orgaos.map(o => (
                        <option key={o.id} value={o.slug}>{o.nome || o.slug}</option>
                      ))}
                    </select>
                  </span>
                  {logado && (
                    <span className="pd-field__hint">
                      Sua conta é do órgão acima. Para solicitar em outro município,
                      saia da conta e use a solicitação sem cadastro.
                    </span>
                  )}
                </div>
              )}
              <Jornada etapa={1} />
            </section>

            <section className="pd-request__content">
              <div className="pd-dash-search pd-dash-search--wide">
                <Search size={16} aria-hidden="true" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar serviço por nome ou secretaria"
                  aria-label="Buscar serviço"
                  autoFocus
                />
              </div>

              {categorias.length > 1 && (
                <div className="pd-chips" role="tablist" aria-label="Filtrar por categoria">
                  <button type="button" role="tab" className="pd-chip" aria-selected={categoria === 'todas'} onClick={() => setCategoria('todas')}>
                    Todas <em>{servicos.length}</em>
                  </button>
                  {categorias.map(([nome, total]) => (
                    <button key={nome} type="button" role="tab" className="pd-chip" aria-selected={categoria === nome} onClick={() => setCategoria(nome)}>
                      {nome} <em>{total}</em>
                    </button>
                  ))}
                </div>
              )}

              {!carregandoServicos && servicosFiltrados.length > 0 && (
                <p className="pd-result-count">
                  {servicosFiltrados.length} serviço(s) {termo || categoria !== 'todas' ? 'encontrado(s)' : 'disponíveis'}
                </p>
              )}

              {carregandoServicos ? (
                <div className="pd-dash-loading"><Loader2 size={20} className="pd-spin" /><span>Carregando serviços…</span></div>
              ) : servicosFiltrados.length === 0 ? (
                <div className="pd-empty-state">
                  <span><Search size={22} /></span>
                  <strong>{busca.trim() ? 'Nenhum serviço encontrado' : 'Nenhum serviço disponível'}</strong>
                  <p>{busca.trim() ? 'Tente outro termo de busca.' : 'Assim que a prefeitura publicar os serviços, eles aparecem aqui.'}</p>
                </div>
              ) : (
                <ul className="pd-service-list">
                  {servicosFiltrados.map(s => {
                    const Icone = ICONES_SERVICO[s.categoria] || FileText;
                    return (
                      <li key={s.id}>
                        <button type="button" className="pd-service-card" onClick={() => selecionarServico(s)}>
                          <span className="pd-service-card__icon"><Icone size={20} /></span>
                          <span className="pd-service-card__body">
                            <strong>{s.nome}</strong>
                            {s.descricao && <span className="pd-service-card__desc">{s.descricao}</span>}
                            <span className="pd-service-card__meta">
                              {(s.secretaria_nome || s.categoria_nome) && (
                                <span><Building2 size={13} /> {s.secretaria_nome || s.categoria_nome}</span>
                              )}
                              {s.prazo_estimado_dias && <span><Timer size={13} /> Prazo de {s.prazo_estimado_dias} dias</span>}
                            </span>
                          </span>
                          <ArrowRight size={17} className="pd-service-card__go" aria-hidden="true" />
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

  // ── Passo 2: dados da solicitação ──
  return (
    <div className="pd-app">
      {cabecalho({})}
      <div className="pd-dash">
        <main className="pd-request">
          <section className="pd-request__aside">
            <button className="pd-back" type="button" onClick={() => setPasso(1)}>
              <ArrowLeft size={18} /> <span>Escolher outro serviço</span>
            </button>
            <div className="pd-eyebrow">{servico?.secretaria_nome || 'Solicitação'}</div>
            <h1>{servico?.nome}</h1>
            {servico?.descricao && <p>{servico.descricao}</p>}
            <Jornada etapa={2} />
            {servico?.instrucoes && (
              <div className="pd-instructions">
                <strong>Antes de enviar</strong>
                <p>{servico.instrucoes}</p>
              </div>
            )}
          </section>

          <section className="pd-request__content">
            <div className="pd-register-card">
              <div className="pd-register-card__head">
                <div>
                  <h2>Dados da solicitação</h2>
                  <p>{logado ? 'Confirme seus contatos e descreva o pedido.' : 'Informe seus dados para o atendimento.'}</p>
                </div>
                <span className="pd-step-badge">Passo 2 de 3</span>
              </div>

              <div className="pd-register-form">
                <div className="pd-form-section">
                  <h3 className="pd-form-section__title"><UserRound size={17} /> Solicitante</h3>

                  {logado ? (
                    <>
                      <div className="pd-identity">
                        <span className="pd-avatar" aria-hidden="true">{iniciais(conta?.nome)}</span>
                        <div>
                          <strong>{form._nome || conta?.nome}</strong>
                          <small>{form._email || conta?.email}{form._cpf ? ` · CPF ${maskCPF(form._cpf)}` : ''}</small>
                        </div>
                        <span className="pd-identity__tag">Da sua conta</span>
                      </div>
                      <div className="pd-form-grid">
                        <label className="pd-field pd-field--full">
                          <span className="pd-field__label">
                            Telefone para contato
                            <span className="pd-optional">WhatsApp</span>
                          </span>
                          <span className="pd-input-wrap">
                            <Smartphone size={18} aria-hidden="true" />
                            <input
                              className="pd-input pd-input--icon"
                              value={maskTel(form._telefone)}
                              onChange={(e) => setForm(f => ({ ...f, _telefone: e.target.value }))}
                              placeholder="(00) 00000-0000"
                              inputMode="tel"
                            />
                          </span>
                          <span className="pd-form-help">Usamos este número para avisar sobre o andamento.</span>
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="pd-form-grid">
                      <label className="pd-field pd-field--full">
                        <span className="pd-field__label">Nome completo *</span>
                        <span className="pd-input-wrap">
                          <UserRound size={18} aria-hidden="true" />
                          <input
                            className="pd-input pd-input--icon"
                            value={form._nome || ''}
                            onChange={(e) => setForm(f => ({ ...f, _nome: e.target.value }))}
                            placeholder="Como consta no documento"
                            autoComplete="name"
                          />
                        </span>
                      </label>
                      <label className="pd-field">
                        <span className="pd-field__label">CPF<span className="pd-optional">Opcional</span></span>
                        <span className="pd-input-wrap">
                          <input
                            className="pd-input"
                            value={maskCPF(form._cpf)}
                            onChange={(e) => setForm(f => ({ ...f, _cpf: e.target.value }))}
                            placeholder="000.000.000-00"
                            inputMode="numeric"
                          />
                        </span>
                      </label>
                      <label className="pd-field">
                        <span className="pd-field__label">Telefone<span className="pd-optional">WhatsApp</span></span>
                        <span className="pd-input-wrap">
                          <input
                            className="pd-input"
                            value={maskTel(form._telefone)}
                            onChange={(e) => setForm(f => ({ ...f, _telefone: e.target.value }))}
                            placeholder="(00) 00000-0000"
                            inputMode="tel"
                          />
                        </span>
                      </label>
                      <label className="pd-field pd-field--full">
                        <span className="pd-field__label">E-mail<span className="pd-optional">Opcional</span></span>
                        <span className="pd-input-wrap">
                          <input
                            className="pd-input"
                            type="email"
                            value={form._email || ''}
                            onChange={(e) => setForm(f => ({ ...f, _email: e.target.value }))}
                            placeholder="voce@email.com"
                            autoComplete="email"
                          />
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="pd-form-section">
                  <h3 className="pd-form-section__title"><FileText size={17} /> Informações da solicitação</h3>
                  <div className="pd-form-grid">
                    {campos.map(c => (
                      <CampoDinamico key={c.id} campo={c} valor={form[c.id]} onChange={atualizarCampo} />
                    ))}
                    <label className="pd-field pd-field--full">
                      <span className="pd-field__label">
                        {relatoObrigatorio ? 'Descreva sua solicitação *' : 'Informações adicionais'}
                        {!relatoObrigatorio && <span className="pd-optional">Opcional</span>}
                      </span>
                      <RichTextEditor
                        value={form._descricao || ''}
                        onChange={(html) => setForm(f => ({ ...f, _descricao: html }))}
                        placeholder="Conte o que você precisa, com endereço e detalhes que ajudem o atendimento."
                        minHeight={140}
                      />
                    </label>
                  </div>
                </div>

                {erro && <div className="pd-alert" role="alert"><AlertCircle size={17} /><span>{erro}</span></div>}

                <div className="pd-register-actions">
                  <button className="pd-primary-btn" type="button" onClick={enviar} disabled={!podeEnviar}>
                    {loading ? 'Enviando…' : <>Enviar solicitação <ArrowRight size={17} /></>}
                  </button>
                  <SecurityNote>Seus dados são usados apenas para o atendimento desta solicitação.</SecurityNote>
                </div>
              </div>
            </div>
          </section>
        </main>
        <PortalFooter navigate={navigate} />
      </div>
    </div>
  );
}
