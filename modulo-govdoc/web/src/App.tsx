import { Navigate, Route, Routes } from 'react-router-dom';
import { Carregando } from './componentes/Comuns';
import { Layout } from './componentes/Layout';
import { useSessao } from './contexto/SessaoContexto';
import { Entrar } from './paginas/Entrar';
import { Painel } from './paginas/Painel';
import { Arquivos } from './paginas/Arquivos';
import { Documentos } from './paginas/Documentos';
import { DocumentoDetalhe } from './paginas/DocumentoDetalhe';
import { Auditoria, Backups, Compartilhados, Lixeira, Recebimentos } from './paginas/Gestao';
import { Administracao } from './paginas/Administracao';
import { Notificacoes, Perfil } from './paginas/Conta';
import { AcessoPublico, EnvioPublico } from './paginas/Publico';

function Protegido() { const { dados, carregando } = useSessao(); if (carregando) return <Carregando texto="Validando sua sessão…"/>; return dados ? <Layout/> : <Navigate to="/entrar" replace/>; }

export default function App() {
  return <Routes>
    <Route path="/entrar" element={<Entrar/>}/>
    <Route path="/acesso-externo/:token" element={<AcessoPublico/>}/>
    <Route path="/envio-externo/:token" element={<EnvioPublico/>}/>
    <Route element={<Protegido/>}>
      <Route path="/painel" element={<Painel/>}/><Route path="/arquivos" element={<Arquivos/>}/><Route path="/documentos" element={<Documentos/>}/><Route path="/documentos/:id" element={<DocumentoDetalhe/>}/>
      <Route path="/recentes" element={<Documentos modo="recentes"/>}/><Route path="/favoritos" element={<Documentos modo="favoritos"/>}/><Route path="/compartilhados" element={<Compartilhados/>}/><Route path="/lixeira" element={<Lixeira/>}/>
      <Route path="/recebimentos" element={<Recebimentos/>}/><Route path="/auditoria" element={<Auditoria/>}/><Route path="/administracao" element={<Administracao/>}/><Route path="/backups" element={<Backups/>}/>
      <Route path="/notificacoes" element={<Notificacoes/>}/><Route path="/perfil" element={<Perfil/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/painel" replace/>}/>
  </Routes>;
}
