import { Bell, CheckCheck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { Carregando, Chip, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import { formatarData, rotulo } from '../utils';

export function Notificacoes() {
  const avisar = useAviso(); const [dados, setDados] = useState<any>(); const [chave, setChave] = useState(0);
  useEffect(() => { api.get('/notificacoes?por_pagina=100').then(setDados).catch((e) => avisar(e.message, 'erro')); }, [chave]);
  async function todas() { await api.post('/notificacoes/marcar-todas'); avisar('Notificações marcadas como lidas.'); setChave((v) => v + 1); }
  async function ler(i: any) { if (i.estado === 'lida') return; await api.post(`/notificacoes/${i.id}/estado`, { estado: 'lida' }); setChave((v) => v + 1); }
  const itens = dados?.itens || dados || [];
  return <><div className="cabecalho-pagina"><div><h1>Notificações</h1><p className="subtitulo">Avisos do acervo e ações que precisam da sua atenção.</p></div><button className="botao" onClick={todas}><CheckCheck size={17}/> Marcar todas como lidas</button></div>{!dados ? <Carregando/> : !itens.length ? <Vazio titulo="Você não tem notificações"/> : <div className="pilha">{itens.map((i: any) => <button className={`notificacao ${i.estado === 'nao_lida' ? 'nao-lida' : ''}`} key={i.id} onClick={() => ler(i)}><Bell size={20}/><span><strong>{i.titulo}</strong><small>{i.corpo || i.mensagem}</small><em>{formatarData(i.criado_em, true)}</em></span>{i.estado === 'nao_lida' && <Chip cor="azul">Nova</Chip>}</button>)}</div>}</>;
}

export function Perfil() {
  const { dados } = useSessao();
  return <><div className="cabecalho-pagina"><div><h1>Meu perfil</h1><p className="subtitulo">Dados da conta e segurança de acesso.</p></div></div><div className="grade col-2"><section className="cartao"><div className="cartao-titulo"><UserRound size={20}/> Dados do usuário</div><div className="definicoes"><div><div className="rotulo">Nome</div><div className="valor">{dados?.usuario.nome}</div></div><div><div className="rotulo">E-mail</div><div className="valor">{dados?.usuario.email}</div></div><div><div className="rotulo">Perfil</div><div className="valor">{rotulo(dados?.usuario.perfil)}</div></div><div><div className="rotulo">Cargo</div><div className="valor">{dados?.usuario.cargo || 'Não informado'}</div></div><div><div className="rotulo">Instituição</div><div className="valor">{dados?.instituicao.nome}</div></div><div><div className="rotulo">Último acesso</div><div className="valor">{formatarData(dados?.usuario.ultimo_acesso, true)}</div></div></div></section><section className="cartao"><div className="cartao-titulo"><UserRound size={20}/> Segurança de acesso</div><p className="texto-secundario">Seu login e sua senha são gerenciados pela plataforma <strong>GovSistem</strong>. Para trocar a senha ou recuperar o acesso, use o GovSistem.</p></section></div></>;
}

