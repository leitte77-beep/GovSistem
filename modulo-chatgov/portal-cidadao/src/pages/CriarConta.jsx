import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  IdCard,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { api } from '../api.js';
import { useLogado } from './LogadoContext.jsx';
import { PortalHeader, SecurityNote } from '../components/PortalChrome.jsx';

const formatarCpf = (valor) => valor.replace(/\D/g, '').slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

const formatarTelefone = (valor) => {
  const digits = valor.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};

function Field({ label, optional, icon: Icon, full = false, children }) {
  return (
    <label className={`pd-field ${full ? 'pd-field--full' : ''}`}>
      <span className="pd-field__label">
        {label}
        {optional && <span className="pd-optional">Opcional</span>}
      </span>
      <span className="pd-input-wrap">
        {Icon && <Icon size={18} aria-hidden="true" />}
        {children}
      </span>
    </label>
  );
}

export function CriarConta({ navigate }) {
  const { login } = useLogado();
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [orgaos, setOrgaos] = useState([]);
  const [orgaoSlug, setOrgaoSlug] = useState('');

  // A conta nasce vinculada a um município: sem escolher aqui, o cadastro
  // caía sempre no primeiro órgão da base e depois nenhum serviço do
  // município do cidadão aparecia como disponível para ele.
  useEffect(() => {
    api.tenants()
      .then(t => {
        const lista = Array.isArray(t) ? t : [];
        setOrgaos(lista);
        if (lista.length === 1) setOrgaoSlug(lista[0].slug);
      })
      .catch(() => {});
  }, []);

  const forcaSenha = useMemo(() => {
    if (!senha) return 0;
    let score = senha.length >= 6 ? 1 : 0;
    if (senha.length >= 9) score += 1;
    if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) score += 1;
    if (/\d|[^\w\s]/.test(senha)) score += 1;
    return Math.min(score, 4);
  }, [senha]);

  const criar = async (e) => {
    e.preventDefault();
    setErro('');
    if (senha !== confirmarSenha) { setErro('As senhas não coincidem. Confira os dois campos.'); return; }
    if (senha.length < 6) { setErro('Crie uma senha com pelo menos 6 caracteres.'); return; }
    setLoading(true);
    try {
      // O cadastro cria a conta e já devolve a sessão: não precisa abrir
      // protocolo nem fazer login numa segunda chamada.
      const data = await api.registrar({
        nome: nome.trim(),
        // Sem máscara: é assim que a solicitação grava, e o casamento do
        // cidadão por CPF/telefone compara o valor cru.
        cpf: cpf.replace(/\D/g, '') || undefined,
        telefone: telefone.replace(/\D/g, '') || undefined,
        email: email.trim(),
        senha,
        tenant: orgaoSlug || undefined,
      });

      if (data.token) {
        login(data.token, {
          nome: data.nome || nome,
          email: data.email || email.trim(),
          conta_id: data.conta_id,
          tenant_slug: data.tenant_slug,
          tenant_nome: data.tenant_nome,
        });
        navigate('meus-protocolos');
      } else navigate('');
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="pd-app">
      <PortalHeader navigate={navigate} back />
      <main className="pd-register">
        <div className="pd-register__main">
          <section className="pd-register-copy">
            <div className="pd-eyebrow">Conta do cidadão</div>
            <h1>Todos os seus protocolos, em um único acesso.</h1>
            <p>Crie sua conta para encontrar solicitações com facilidade e receber atualizações durante o atendimento.</p>
            <ul className="pd-benefits">
              <li><span className="pd-benefits__icon"><Check size={16} /></span><span>Acompanhe todos os protocolos em uma só lista</span></li>
              <li><span className="pd-benefits__icon"><Check size={16} /></span><span>Consulte mensagens, documentos e movimentações</span></li>
              <li><span className="pd-benefits__icon"><Check size={16} /></span><span>Seus dados permanecem protegidos</span></li>
            </ul>
          </section>

          <section className="pd-register-card" aria-labelledby="pd-register-title">
            <div className="pd-register-card__head">
              <div>
                <h2 id="pd-register-title">Criar minha conta</h2>
                <p>Leva menos de dois minutos.</p>
              </div>
              <span className="pd-step-badge">Cadastro seguro</span>
            </div>

            <form className="pd-register-form" onSubmit={criar}>
              <div className="pd-form-section">
                <h3 className="pd-form-section__title"><UserRound size={17} /> Identificação</h3>
                <div className="pd-form-grid">
                  {orgaos.length > 1 && (
                    <Field label="Órgão / Município" icon={Building2} full>
                      <select
                        className="pd-input pd-input--icon pd-select"
                        value={orgaoSlug}
                        onChange={(e) => setOrgaoSlug(e.target.value)}
                        required
                      >
                        <option value="">Selecione o município…</option>
                        {orgaos.map(o => (
                          <option key={o.id} value={o.slug}>{o.nome || o.slug}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Nome completo" icon={UserRound} full>
                    <input className="pd-input pd-input--icon" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como consta no documento" autoComplete="name" required autoFocus />
                  </Field>
                  <Field label="CPF" icon={IdCard} optional>
                    <input className="pd-input pd-input--icon" value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
                  </Field>
                  <Field label="Telefone" icon={Smartphone} optional>
                    <input className="pd-input pd-input--icon" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                  </Field>
                </div>
              </div>

              <div className="pd-form-section">
                <h3 className="pd-form-section__title"><ShieldCheck size={17} /> Acesso à conta</h3>
                <div className="pd-form-grid">
                  <Field label="E-mail" icon={Mail} full>
                    <input className="pd-input pd-input--icon" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" required />
                  </Field>
                  <Field label="Senha">
                    <input className="pd-input" type={mostrarSenha ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete="new-password" required minLength={6} />
                    <button className="pd-password-toggle" type="button" onClick={() => setMostrarSenha(v => !v)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                      {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </Field>
                  <Field label="Confirmar senha">
                    <input className="pd-input" type={mostrarConfirmacao ? 'text' : 'password'} value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} placeholder="Repita a senha" autoComplete="new-password" required minLength={6} />
                    <button className="pd-password-toggle" type="button" onClick={() => setMostrarConfirmacao(v => !v)} aria-label={mostrarConfirmacao ? 'Ocultar confirmação' : 'Mostrar confirmação'}>
                      {mostrarConfirmacao ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </Field>
                </div>
                <div className="pd-password-meter" data-score={forcaSenha} aria-label={`Força da senha: ${forcaSenha} de 4`}>
                  <span /><span /><span /><span />
                </div>
                <p className="pd-form-help">Uma senha mais longa, com letras e números, protege melhor sua conta.</p>
              </div>

              {erro && <div className="pd-alert" role="alert"><AlertCircle size={17} /><span>{erro}</span></div>}

              <div className="pd-register-actions">
                <button className="pd-primary-btn" type="submit" disabled={loading || !nome.trim() || !email.trim() || senha.length < 6 || !confirmarSenha || (orgaos.length > 1 && !orgaoSlug)}>
                  {loading ? 'Criando sua conta…' : <>Criar conta e continuar <ArrowRight size={17} /></>}
                </button>
                <SecurityNote>Ao continuar, você concorda com o uso dos dados para prestação do serviço público.</SecurityNote>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
