import { AlertTriangle, Inbox, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status"><LoaderCircle className="giro" size={19}/>{texto}</div>;
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: ReactNode }) {
  return <div className="vazio"><Inbox size={42}/><div className="titulo">{titulo}</div>{texto && <div>{texto}</div>}{acao && <div className="margem-topo">{acao}</div>}</div>;
}

export function ErroEstado({ mensagem, tentar }: { mensagem: string; tentar?: () => void }) {
  return <div className="aviso erro"><AlertTriangle size={20}/><div className="texto"><div className="titulo">Não foi possível carregar</div>{mensagem}</div>{tentar && <button className="botao pequeno" onClick={tentar}>Tentar novamente</button>}</div>;
}

export function Modal({ titulo, children, fechar, largo = false, rodape }: { titulo: string; children: ReactNode; fechar: () => void; largo?: boolean; rodape?: ReactNode }) {
  return <div className="modal-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
    <section className={`modal ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="modal-cabecalho"><h2>{titulo}</h2><button className="botao sutil icone" aria-label="Fechar" onClick={fechar}><X size={19}/></button></header>
      <div className="modal-corpo">{children}</div>
      {rodape && <footer className="modal-rodape">{rodape}</footer>}
    </section>
  </div>;
}

export function Chip({ children, cor = 'cinza' }: { children: ReactNode; cor?: string }) {
  return <span className={`chip ${cor}`}>{children}</span>;
}

export function Paginacao({ pagina, paginas, mudar }: { pagina: number; paginas: number; mudar: (pagina: number) => void }) {
  if (paginas <= 1) return null;
  return <nav className="paginacao" aria-label="Paginação">
    <button className="botao pequeno" disabled={pagina <= 1} onClick={() => mudar(pagina - 1)}>Anterior</button>
    <span>Página <strong>{pagina}</strong> de {paginas}</span>
    <button className="botao pequeno" disabled={pagina >= paginas} onClick={() => mudar(pagina + 1)}>Próxima</button>
  </nav>;
}

