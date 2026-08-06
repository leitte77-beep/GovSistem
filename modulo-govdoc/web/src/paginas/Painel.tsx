import { AlertTriangle, ArrowRight, DatabaseBackup, FileCheck2, FileText, FolderOpen, HardDrive, Link2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ErroApi } from '../api/cliente';
import { Carregando, Chip, ErroEstado, Vazio } from '../componentes/Comuns';
import type { Painel as PainelTipo } from '../types';
import { formatarBytes, formatarData, rotulo } from '../utils';

export function Painel() {
  const [dados, setDados] = useState<PainelTipo>(); const [erro, setErro] = useState(''); const [chave, setChave] = useState(0);
  useEffect(() => { api.get<PainelTipo>('/painel').then(setDados).catch((e) => setErro(e instanceof ErroApi ? e.message : 'Falha de conexão.')); }, [chave]);
  if (!dados && !erro) return <Carregando texto="Preparando seu painel…"/>;
  if (erro) return <ErroEstado mensagem={erro} tentar={() => { setErro(''); setChave((v) => v + 1); }}/>;
  const t = dados!.totais; const a = dados!.armazenamento;
  const usado = Number(a.usado_bytes ?? a.total_usado_bytes ?? 0); const limite = Number(a.limite_bytes ?? a.limite_armazenamento_bytes ?? 0);
  const percentual = limite ? Math.min(100, Math.round(usado / limite * 100)) : Number(a.percentual ?? 0);
  return <>
    <div className="cabecalho-pagina"><div><h1>Visão geral</h1><p className="subtitulo">Acompanhe documentos, pendências e o uso do acervo.</p></div><div className="barra-acoes"><Link className="botao" to="/arquivos"><FolderOpen size={17}/> Abrir arquivos</Link><Link className="botao principal" to="/arquivos?enviar=1"><Upload size={17}/> Enviar documento</Link></div></div>
    <section className="grade col-4" aria-label="Indicadores">
      <div className="indicador"><div className="rotulo">Documentos</div><div className="valor">{t.documentos?.toLocaleString('pt-BR')}</div><div className="apoio">em {t.pastas} pastas</div></div>
      <div className="indicador ok"><div className="rotulo">Novos no período</div><div className="valor">{t.enviados_periodo}</div><div className="apoio">últimos 30 dias</div></div>
      <div className={`indicador ${t.aguardando_aprovacao ? 'alerta' : ''}`}><div className="rotulo">Aguardando análise</div><div className="valor">{t.aguardando_aprovacao}</div><div className="apoio">revisão ou aprovação</div></div>
      <div className={`indicador ${t.vencidos ? 'perigo' : 'ok'}`}><div className="rotulo">Vencidos</div><div className="valor">{t.vencidos}</div><div className="apoio">{t.vencendo} vencem em 30 dias</div></div>
    </section>
    <div className="grade col-2 margem-topo">
      <section className="cartao"><div className="cartao-titulo"><FileText size={19}/> Documentos recentes <Link className="espaco texto-pequeno" to="/recentes">Ver todos</Link></div>
        {dados!.documentos_recentes.length ? <div className="lista-simples">{dados!.documentos_recentes.map((doc) => <Link to={`/documentos/${doc.id}`} key={doc.id}><FileCheck2 size={20}/><span><strong>{doc.nome}</strong><small>{doc.codigo} · Atualizado {formatarData(doc.atualizado_em, true)}</small></span><ArrowRight size={16}/></Link>)}</div> : <Vazio titulo="Nenhum documento recente" texto="Os documentos enviados aparecerão aqui."/>}
      </section>
      <section className="cartao"><div className="cartao-titulo"><HardDrive size={19}/> Armazenamento</div>
        <div className="entre"><div><div className="numero-destaque">{formatarBytes(usado)}</div><span className="texto-secundario">de {limite ? formatarBytes(limite) : 'cota não definida'}</span></div><Chip cor={percentual >= 90 ? 'vermelho' : percentual >= 75 ? 'amarelo' : 'verde'}>{percentual}% usado</Chip></div>
        <div className="progresso margem-topo"><div className={`barra ${percentual >= 90 ? 'perigo' : percentual >= 75 ? 'alerta' : ''}`} style={{ width: `${percentual}%` }}/></div>
        <div className="mini-indicadores"><span><Link2 size={17}/><strong>{t.links_ativos}</strong> links ativos</span><span><AlertTriangle size={17}/><strong>{t.recebimentos_pendentes}</strong> recebimentos</span><span><DatabaseBackup size={17}/><strong>{dados!.backups.falhas}</strong> falhas de backup</span></div>
      </section>
      <section className="cartao"><div className="cartao-titulo">Mais acessados</div>{dados!.mais_acessados.length ? <ol className="ranking">{dados!.mais_acessados.map((doc) => <li key={doc.id}><Link to={`/documentos/${doc.id}`}>{doc.nome}</Link><span>{doc.acessos} acessos</span></li>)}</ol> : <Vazio titulo="Sem dados de acesso"/>}</section>
      <section className="cartao"><div className="cartao-titulo">Atividade recente</div>{dados!.atividades.length ? <div className="linha-tempo">{dados!.atividades.slice(0, 6).map((item, i) => <div key={i}><span className={`ponto ${item.resultado === 'sucesso' ? 'ok' : ''}`}/><p><strong>{item.usuario || 'Sistema'}</strong> · {rotulo(item.acao)}<small>{item.recurso || '—'} · {formatarData(item.quando, true)}</small></p></div>)}</div> : <Vazio titulo="Nenhuma atividade registrada"/>}</section>
    </div>
  </>;
}

