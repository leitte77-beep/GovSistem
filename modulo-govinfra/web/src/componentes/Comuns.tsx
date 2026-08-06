import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Info, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

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

/** Cartão clicável usado nos painéis resumidos. */
export function Cartao({ titulo, valor, icone, cor, aoClicar, subtitulo, destaque, ajuda }: {
  titulo: string; valor: ReactNode; icone?: ReactNode; cor?: string; aoClicar?: () => void; subtitulo?: string; destaque?: boolean; ajuda?: string;
}) {
  return (
    <button className={`cartao-indicador ${cor || ''} ${aoClicar ? 'clicavel' : ''}`} onClick={aoClicar} disabled={!aoClicar} title={ajuda}>
      {icone && <span className="cartao-icone" aria-hidden="true">{icone}</span>}
      <span className="cartao-valor">{valor}</span>
      <span className="cartao-titulo">{titulo}</span>
      {subtitulo && <span className="cartao-subtitulo">{subtitulo}</span>}
      {destaque && <span className="cartao-selo">Requer atenção</span>}
      {ajuda && <span className="cartao-ajuda" aria-label={ajuda}><Info size={13}/></span>}
    </button>
  );
}

/** Cabeçalho padrão de página com título, descrição e ações. */
export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <header className="cabecalho-pagina">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="acoes-pagina">{acoes}</div>}
    </header>
  );
}

/** Painel lateral (drawer) que desliza da direita. */
export function Drawer({ titulo, children, aberto, fechar, voltar, acoes }: {
  titulo: string;
  children: ReactNode;
  aberto: boolean;
  fechar: () => void;
  voltar?: () => void;
  acoes?: ReactNode;
}) {
  useEffect(() => {
    if (aberto) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="drawer-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="drawer-cabecalho">
          <div className="drawer-cabecalho-esq">
            {voltar && <button className="botao sutil icone" onClick={voltar}><ChevronLeft size={18} /></button>}
            <h2>{titulo}</h2>
          </div>
          <div className="drawer-cabecalho-dir">
            {acoes}
            <button className="botao sutil icone" aria-label="Fechar" onClick={fechar}><X size={19} /></button>
          </div>
        </header>
        <div className="drawer-corpo">{children}</div>
      </aside>
    </div>
  );
}

/** Esqueleto (skeleton) para carregamento. */
export function Esqueleto({ linhas = 3, altura = 16 }: { linhas?: number; altura?: number }) {
  return (
    <div className="pilha" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="esqueleto" style={{ height: `${altura}px`, width: `${80 + Math.random() * 20}%` }} />
      ))}
    </div>
  );
}
