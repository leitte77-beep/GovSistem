import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  FileSearch,
  Hash,
  LogIn,
  Mail,
  Plus,
  UserRound,
} from 'lucide-react';
import { api, setToken } from '../api.js';
import { useLogado } from './LogadoContext.jsx';
import { PortalFooter, PortalHeader, SecurityNote } from '../components/PortalChrome.jsx';

function Field({ label, icon: Icon, children }) {
  return (
    <label className="pd-field">
      <span className="pd-field__label">{label}</span>
      <span className="pd-input-wrap">
        {Icon && <Icon size={18} aria-hidden="true" />}
        {children}
      </span>
    </label>
  );
}

function ErrorMessage({ children }) {
  if (!children) return null;
  return <div className="pd-alert" role="alert"><AlertCircle size={17} /> <span>{children}</span></div>;
}

export function Home({ navigate }) {
  const { conta, login } = useLogado();
  const [tab, setTab] = useState(conta ? 'consulta' : 'consulta');
  const [numero, setNumero] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('protocolo') || ''; }
    catch { return ''; }
  });
  const [senha, setSenha] = useState('');
  const [mostrarCodigo, setMostrarCodigo] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const consultar = async (e) => {
    e.preventDefault();
    if (!numero.trim() || !senha.trim()) return;
    setLoading(true); setErro('');
    try {
      const data = await api.acessar(numero.trim(), senha.trim());
      setToken(data.token);
      navigate(`protocolo/${data.protocolo_id}`);
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  const fazerLogin = async (e) => {
    e.preventDefault();
    setLoadingLogin(true); setErroLogin('');
    try {
      const data = await api.login(emailLogin.trim(), senhaLogin);
      login(data.token, {
        nome: data.nome,
        email: data.email,
        conta_id: data.conta_id,
        tenant_slug: data.tenant_slug,
        tenant_nome: data.tenant_nome,
      });
      navigate('meus-protocolos');
    } catch (e) { setErroLogin(e.message); }
    finally { setLoadingLogin(false); }
  };

  return (
    <div className="pd-app">
      <PortalHeader navigate={navigate} />
      <div className="pd-home">
        <main className="pd-home__main">
          <section className="pd-hero" aria-labelledby="pd-home-title">
            <div className="pd-eyebrow">Serviços públicos digitais</div>
            <h1 id="pd-home-title">Seu pedido público, <em>sempre à vista.</em></h1>
            <p className="pd-hero__lead">
              Abra solicitações, acompanhe cada movimentação e converse com o atendimento em um só lugar.
            </p>
            <ol className="pd-journey" aria-label="Etapas do atendimento">
              <li>Solicitação</li>
              <li>Acompanhamento</li>
              <li>Conclusão</li>
            </ol>
          </section>

          <section className="pd-access-card" aria-label="Acesso ao protocolo digital">
            <div className="pd-tabs" role="tablist" aria-label="Forma de acesso">
              <button className="pd-tab" type="button" role="tab" aria-selected={tab === 'consulta'} onClick={() => setTab('consulta')}>
                Consultar protocolo
              </button>
              <button className="pd-tab" type="button" role="tab" aria-selected={tab === 'conta'} onClick={() => setTab('conta')}>
                Minha conta
              </button>
            </div>

            {tab === 'consulta' ? (
              <div className="pd-panel" role="tabpanel">
                <div className="pd-panel__head">
                  <span className="pd-panel__icon"><FileSearch size={21} /></span>
                  <h2>Acompanhe uma solicitação</h2>
                  <p>Use os dados informados no comprovante do protocolo.</p>
                </div>
                <form onSubmit={consultar}>
                  <Field label="Número do protocolo" icon={Hash}>
                    <input className="pd-input pd-input--icon" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 2026-08-000001" autoFocus autoComplete="off" required />
                  </Field>
                  <Field label="Código de acesso">
                    <input className="pd-input" type={mostrarCodigo ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite o código recebido" aria-invalid={!!erro} required />
                    <button className="pd-password-toggle" type="button" onClick={() => setMostrarCodigo(v => !v)} aria-label={mostrarCodigo ? 'Ocultar código' : 'Mostrar código'}>
                      {mostrarCodigo ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </Field>
                  <ErrorMessage>{erro}</ErrorMessage>
                  <button className="pd-primary-btn" type="submit" disabled={loading || !numero.trim() || !senha.trim()}>
                    {loading ? 'Consultando…' : <>Consultar agora <ArrowRight size={17} /></>}
                  </button>
                </form>
                <div className="pd-card-divider">ou</div>
                <button className="pd-secondary-btn" type="button" onClick={() => navigate('nova-solicitacao')}>
                  <Plus size={17} /> Abrir nova solicitação
                </button>
                <SecurityNote />
              </div>
            ) : (
              <div className="pd-panel" role="tabpanel">
                <div className="pd-panel__head">
                  <span className="pd-panel__icon"><UserRound size={21} /></span>
                  <h2>{conta ? `Olá, ${conta.nome?.split(' ')[0]}` : 'Acesse sua conta'}</h2>
                  <p>{conta ? 'Seus protocolos estão organizados e prontos para consulta.' : 'Veja todas as solicitações vinculadas ao seu cadastro.'}</p>
                </div>
                {conta ? (
                  <button className="pd-primary-btn" type="button" onClick={() => navigate('meus-protocolos')}>
                    Ver meus protocolos <ArrowRight size={17} />
                  </button>
                ) : (
                  <form onSubmit={fazerLogin}>
                    <Field label="E-mail" icon={Mail}>
                      <input className="pd-input pd-input--icon" type="email" value={emailLogin} onChange={(e) => setEmailLogin(e.target.value)} placeholder="voce@email.com" autoComplete="email" required />
                    </Field>
                    <Field label="Senha">
                      <input className="pd-input" type={mostrarSenha ? 'text' : 'password'} value={senhaLogin} onChange={(e) => setSenhaLogin(e.target.value)} placeholder="Digite sua senha" autoComplete="current-password" aria-invalid={!!erroLogin} required />
                      <button className="pd-password-toggle" type="button" onClick={() => setMostrarSenha(v => !v)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                        {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </Field>
                    <div style={{ textAlign: 'right', margin: '-10px 0 12px' }}>
                      <button
                        type="button"
                        onClick={() => navigate('recuperar-senha')}
                        style={{
                          background: 'none', border: 'none', color: 'var(--pd-muted)', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                          textDecoration: 'underline', textUnderlineOffset: 2,
                        }}
                        onMouseEnter={(e) => { e.target.style.color = 'var(--pd-blue)'; }}
                        onMouseLeave={(e) => { e.target.style.color = 'var(--pd-muted)'; }}
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <ErrorMessage>{erroLogin}</ErrorMessage>
                    <button className="pd-primary-btn" type="submit" disabled={loadingLogin || !emailLogin || !senhaLogin}>
                      {loadingLogin ? 'Entrando…' : <><LogIn size={17} /> Entrar na minha conta</>}
                    </button>
                    <div className="pd-card-divider">primeiro acesso?</div>
                    <button className="pd-secondary-btn" type="button" onClick={() => navigate('criar-conta')}>
                      Criar minha conta <ArrowRight size={17} />
                    </button>
                  </form>
                )}
                <SecurityNote />
              </div>
            )}
          </section>
        </main>
        <PortalFooter navigate={navigate} />
      </div>
    </div>
  );
}
