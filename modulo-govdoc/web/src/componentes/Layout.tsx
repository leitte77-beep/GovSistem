import {
  Archive, Bell, Building2, ChevronDown, ClipboardList, DatabaseBackup, FileClock, FileHeart,
  Files, FolderOpen, Gauge, Heart, LogOut, Menu, Search, Settings, Share2, Trash2, Upload, Users, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { useSessao } from '../contexto/SessaoContexto';
import { iniciais } from '../utils';

const grupos = [
  { titulo: 'Documentos', itens: [
    ['/painel', 'Painel', Gauge], ['/arquivos', 'Meus arquivos', FolderOpen], ['/documentos', 'Todos os documentos', Files],
    ['/recentes', 'Recentes', FileClock], ['/favoritos', 'Favoritos', Heart], ['/compartilhados', 'Compartilhados', Share2], ['/lixeira', 'Lixeira', Trash2],
  ]},
  { titulo: 'Gestão', itens: [
    ['/recebimentos', 'Recebimentos', Archive], ['/auditoria', 'Auditoria', ClipboardList], ['/administracao', 'Administração', Settings], ['/backups', 'Backups', DatabaseBackup],
  ]},
] as const;

export function Layout() {
  const { dados, sair } = useSessao();
  const [menu, setMenu] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [termo, setTermo] = useState('');
  const navegar = useNavigate();

  useEffect(() => {
    api.get<any>('/notificacoes?por_pagina=1&apenas_nao_lidas=true').then((r) => setNaoLidas(r.total || 0)).catch(() => undefined);
  }, []);

  function buscar(e: React.FormEvent) { e.preventDefault(); if (termo.trim()) navegar(`/documentos?termo=${encodeURIComponent(termo.trim())}`); }
  async function encerrar() { await sair(); navegar('/entrar'); }

  return <div className="app">
    <a href="#conteudo" className="pular-para-conteudo">Pular para o conteúdo</a>
    <header className="topo">
      <button className="botao-topo abre-menu" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu size={21}/></button>
      <Link className="marca" to="/painel"><FileHeart size={25}/><span className="texto">Gov<span className="destaque">Doc</span></span></Link>
      <form className="busca" role="search" onSubmit={buscar}><Search size={18}/><input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar documentos, códigos ou conteúdo…" aria-label="Buscar no GovDoc"/></form>
      <div className="acoes">
        <Link to="/notificacoes" className="botao-topo" aria-label={`Notificações: ${naoLidas} não lidas`} style={{ position: 'relative' }}><Bell size={20}/>{naoLidas > 0 && <span className="selo-contador">{naoLidas > 99 ? '99+' : naoLidas}</span>}</Link>
        <button className="botao-topo usuario-topo" onClick={() => setPerfil(!perfil)}><span className="avatar">{iniciais(dados?.usuario.nome)}</span><span className="nome-usuario">{dados?.usuario.nome.split(' ')[0]}</span><ChevronDown size={15}/></button>
        {perfil && <div className="menu-perfil">
          <div className="menu-perfil-info"><strong>{dados?.usuario.nome}</strong><span>{dados?.usuario.email}</span></div>
          <Link to="/perfil" onClick={() => setPerfil(false)}><Users size={17}/> Meu perfil</Link>
          <button onClick={encerrar}><LogOut size={17}/> Sair</button>
        </div>}
      </div>
    </header>
    <aside className={`lateral ${menu ? 'aberta' : ''}`} aria-label="Navegação principal">
      <div className="lateral-mobile"><strong>Menu</strong><button className="botao sutil icone" onClick={() => setMenu(false)}><X size={20}/></button></div>
      <Link className="botao principal botao-enviar" to="/arquivos?enviar=1" onClick={() => setMenu(false)}><Upload size={18}/> Enviar documento</Link>
      {grupos.map((grupo) => <div className="grupo" key={grupo.titulo}><div className="grupo-titulo">{grupo.titulo}</div>{grupo.itens.map(([url, texto, Icone]) => {
        if ((url === '/administracao' || url === '/backups') && !dados?.usuario.perfil.startsWith('admin')) return null;
        return <NavLink className={({ isActive }) => `item-menu ${isActive ? 'ativo' : ''}`} to={url} key={url} onClick={() => setMenu(false)}><Icone size={18}/>{texto}</NavLink>;
      })}</div>)}
      <div className="instituicao-lateral"><Building2 size={18}/><div><strong>{dados?.instituicao.nome}</strong><span>{dados?.usuario.perfil.replaceAll('_', ' ')}</span></div></div>
    </aside>
    {menu && <div className="fundo-escuro" onClick={() => setMenu(false)}/>} 
    <main className="conteudo" id="conteudo"><Outlet/></main>
  </div>;
}

