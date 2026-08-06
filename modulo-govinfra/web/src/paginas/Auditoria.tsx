import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Paginacao, Vazio } from '../componentes/Comuns';
import { useSessao } from '../contexto/SessaoContexto';
import type { Paginado, RegistroAuditoria } from '../types';
import { formatarDataHora } from '../utils';

export function Auditoria() {
  const { pode } = useSessao();
  const [dados, setDados] = useState<Paginado<RegistroAuditoria> | null>(null);
  const [erro, setErro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState('');
  const [entidade, setEntidade] = useState('');

  function carregar(paginaAtual = pagina) {
    setErro('');
    const parametros = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '20' });
    if (acao) parametros.set('acao', acao);
    if (entidade) parametros.set('entidade', entidade);
    api.get<Paginado<RegistroAuditoria>>(`/auditoria?${parametros.toString()}`)
      .then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); /* eslint-disable-next-line */ }, []);

  if (!pode('govinfra.auditoria.visualizar')) {
    return <div className="aviso erro"><ShieldCheck size={20}/><div className="texto"><div className="titulo">Acesso restrito</div>Seu perfil não permite consultar a trilha de auditoria.</div></div>;
  }

  return <div>
    <CabecalhoPagina titulo="Auditoria" descricao="Histórico completo e imutável das operações do módulo."/>

    <div className="barra-filtros">
      <input value={acao} onChange={(e) => { setAcao(e.target.value); carregar(1); }} placeholder="Ação (ex.: aprovar, bloquear)…"/>
      <input value={entidade} onChange={(e) => { setEntidade(e.target.value); carregar(1); }} placeholder="Entidade (ex.: pessoa)…"/>
    </div>

    {erro && <ErroEstado mensagem={erro} tentar={() => carregar()}/>}
    {!dados && !erro && <Carregando/>}
    {dados && dados.total === 0 && <Vazio titulo="Nenhum registro de auditoria"/>}
    {dados && dados.total > 0 && <>
      <div className="tabela-envolve"><table className="tabela">
        <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Descrição</th><th>Resultado</th></tr></thead>
        <tbody>{dados.itens.map((r) => (
          <tr key={r.id}>
            <td>{formatarDataHora(r.criada_em)}</td>
            <td>{r.usuario?.nome || '—'}</td>
            <td><Chip cor="cinza">{r.acao}</Chip></td>
            <td>{r.entidade || '—'}</td>
            <td>{r.entidade_descricao || '—'}</td>
            <td><Chip cor={r.resultado === 'sucesso' ? 'verde' : r.resultado === 'negado' ? 'vermelho' : 'amarelo'}>{r.resultado}</Chip></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
    </>}
  </div>;
}
