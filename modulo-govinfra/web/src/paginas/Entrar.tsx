import { ArrowUpRight, HardHat, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ErroApi, URL_GOVSISTEM } from '../api/cliente';
import { useSessao } from '../contexto/SessaoContexto';

export function Entrar() {
  const { dados, entrar, loginSaasDev } = useSessao();
  const navegar = useNavigate();
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(''); const [enviando, setEnviando] = useState(false);
  if (dados) return <Navigate to="/govinfra/dashboard" replace/>;

  // Produção: o acesso é feito pela plataforma GovSistem (login único).
  if (!loginSaasDev) {
    return <main className="tela-login">
      <section className="caixa-login">
        <div className="marca-login"><HardHat size={34}/><span>Gov<span className="destaque">Infra</span></span></div>
        <h1>Bem-vindo</h1><p className="subtitulo">O acesso à gestão de infraestrutura é feito pelo GovSistem.</p>
        <a className="botao principal largura-total" href={URL_GOVSISTEM}>Entrar pelo GovSistem <ArrowUpRight size={17}/></a>
        <p className="rodape-login">Acesso restrito a usuários autorizados. As ações são registradas para auditoria.</p>
      </section>
    </main>;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setEnviando(true);
    try { await entrar(email, senha); navegar('/govinfra/dashboard'); }
    catch (e) { setErro(e instanceof ErroApi ? e.message : (e instanceof Error ? e.message : 'Não foi possível conectar ao GovInfra.')); }
    finally { setEnviando(false); }
  }
  return <main className="tela-login">
    <section className="caixa-login">
      <div className="marca-login"><HardHat size={34}/><span>Gov<span className="destaque">Infra</span></span></div>
      <h1>Bem-vindo</h1><p className="subtitulo">Acesse com a sua conta do GovSistem (ambiente de desenvolvimento).</p>
      {erro && <div className="aviso erro" role="alert">{erro}</div>}
      <form onSubmit={enviar}>
        <div className="campo"><label htmlFor="email">E-mail institucional</label><div className="campo-com-icone"><Mail size={18}/><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@prefeitura.gov.br"/></div></div>
        <div className="campo"><label htmlFor="senha">Senha</label><div className="campo-com-icone"><LockKeyhole size={18}/><input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></div></div>
        <button className="botao principal largura-total" disabled={enviando}>{enviando && <LoaderCircle className="giro" size={17}/>}Entrar</button>
      </form>
      <p className="rodape-login">Acesso restrito a usuários autorizados. As ações são registradas para auditoria.</p>
    </section>
  </main>;
}
