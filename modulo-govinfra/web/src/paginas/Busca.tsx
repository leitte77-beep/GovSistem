import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, ErroEstado, Vazio } from '../componentes/Comuns';

type Resultado = { categoria: string; resultados: { id: string; rotulo: string; detalhe?: string; link?: string }[] };

export function Busca() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const termoInicial = params.get('termo') || '';
  const [termo, setTermo] = useState(termoInicial);
  const [dados, setDados] = useState<Resultado[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!termoInicial) return;
    api.get<{ categorias: Resultado[] }>(`/busca?termo=${encodeURIComponent(termoInicial)}`)
      .then((r) => setDados(r.categorias))
      .catch((e) => setErro(e.message));
    /* eslint-disable-next-line */
  }, []);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 2) return;
    setDados(null); setErro('');
    api.get<{ categorias: Resultado[] }>(`/busca?termo=${encodeURIComponent(termo.trim())}`)
      .then((r) => setDados(r.categorias))
      .catch((e) => setErro(e.message));
  }

  return <div>
    <CabecalhoPagina titulo="Busca global" descricao="Pessoas, imóveis, protocolos, caçambas, máquinas, veículos e ordens."/>

    <form className="barra-filtros" onSubmit={buscar}>
      <div className="campo-com-icone" style={{ flex: 1 }}><Search size={17}/><input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome, CPF, telefone, protocolo, placa…" autoFocus/></div>
      <button className="botao principal">Buscar</button>
    </form>

    {erro && <ErroEstado mensagem={erro} tentar={() => buscar({ preventDefault: () => undefined } as any)}/>}
    {!dados && !erro && termoInicial && <Carregando texto="Buscando…"/>}
    {dados && dados.length === 0 && <Vazio titulo="Nada encontrado" texto="Tente um termo diferente ou com menos caracteres."/>}
    {dados && dados.length > 0 && dados.map((grupo) => (
      <section className="secao-painel" key={grupo.categoria}>
        <h2>{grupo.categoria}</h2>
        {grupo.resultados.length === 0 && <p className="texto-sutil">Nenhum resultado.</p>}
        {grupo.resultados.map((r) => (
          <button type="button" key={r.id} className="alerta-item info" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => r.link && navegar(r.link)}>
            <div className="texto"><div className="titulo">{r.rotulo}</div>{r.detalhe && <div>{r.detalhe}</div>}</div>
          </button>
        ))}
      </section>
    ))}
  </div>;
}
