import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, ErroEstado, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import type { Notificacao, Paginado } from '../types';
import { formatarDataHora } from '../utils';

export function Notificacoes() {
  const { avisar } = useAviso();
  const [dados, setDados] = useState<Paginado<Notificacao> | null>(null);
  const [erro, setErro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);

  function carregar(paginaAtual = pagina) {
    setErro('');
    const parametros = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '20' });
    if (apenasNaoLidas) parametros.set('apenas_nao_lidas', 'true');
    api.get<Paginado<Notificacao>>(`/notificacoes?${parametros.toString()}`)
      .then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); /* eslint-disable-next-line */ }, []);

  async function marcarLidas() {
    try {
      await api.post('/notificacoes/marcar-lidas', null);
      avisar('sucesso', 'Notificações marcadas como lidas.');
      carregar(1);
    } catch (e: any) { avisar('erro', e.message); }
  }

  return <div>
    <CabecalhoPagina
      titulo="Notificações"
      descricao="Avisos internos sobre solicitações, retiradas, vistorias, documentos e estoque."
      acoes={<button className="botao" onClick={marcarLidas}>Marcar todas como lidas</button>}
    />

    <div className="barra-filtros">
      <label className="camada-toggle"><input type="checkbox" checked={apenasNaoLidas} onChange={(e) => { setApenasNaoLidas(e.target.checked); carregar(1); }}/> Somente não lidas</label>
    </div>

    {erro && <ErroEstado mensagem={erro} tentar={() => carregar()}/>}
    {!dados && !erro && <Carregando/>}
    {dados && dados.total === 0 && <Vazio titulo="Nenhuma notificação"/>}
    {dados && dados.total > 0 && <>
      <div className="lista-alertas">
        {dados.itens.map((n) => (
          <div key={n.id} className={`alerta-item ${n.situacao === 'nao_lida' ? 'info' : ''}`}>
            <Bell size={18}/>
            <div className="texto">
              <div className="titulo">{n.titulo} {n.situacao === 'nao_lida' && <span className="chip azul">nova</span>}</div>
              <div>{n.mensagem}</div>
              <div className="texto-sutil">{formatarDataHora(n.criada_em)}</div>
              {n.link && <a className="botao pequeno margem-topo" href={n.link}>Abrir</a>}
            </div>
          </div>
        ))}
      </div>
      <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
    </>}
  </div>;
}
