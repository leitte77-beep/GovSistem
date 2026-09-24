import { useSessao } from '../contexto/SessaoContexto';
import { CabecalhoPagina } from '../componentes/Comuns';
import { formatarData } from '../utils';

export function Perfil() {
  const { dados } = useSessao();
  if (!dados) return null;
  return <div>
    <CabecalhoPagina titulo="Meu perfil" descricao="Dados da sua sessão no GovInfra."/>
    <div className="detalhe-grade">
      <div className="detalhe-campo"><div className="rotulo">Nome</div><div className="valor">{dados.usuario.nome}</div></div>
      <div className="detalhe-campo"><div className="rotulo">E-mail</div><div className="valor">{dados.usuario.email}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Perfil</div><div className="valor">{dados.usuario.perfil_rotulo}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Matrícula</div><div className="valor">{dados.usuario.matricula || '—'}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Cargo</div><div className="valor">{dados.usuario.cargo || '—'}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Organização</div><div className="valor">{dados.organizacao.nome}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Município</div><div className="valor">{dados.municipio.nome} — {dados.municipio.uf}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Versão do módulo</div><div className="valor">{dados.modulo.versao}</div></div>
    </div>
    <section className="secao-painel"><h2>Permissões ({dados.permissoes.length})</h2>
      <div className="legenda-mapa">{dados.permissoes.map((p) => <span key={p}><i className="ponto" style={{ background: 'var(--verde-700)' }}/>{p}</span>)}</div>
    </section>
  </div>;
}
