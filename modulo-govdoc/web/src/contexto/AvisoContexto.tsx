import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Tipo = 'sucesso' | 'erro' | 'info';
type Item = { id: number; texto: string; tipo: Tipo };
const Contexto = createContext<(texto: string, tipo?: Tipo) => void>(() => undefined);

export function ProvedorAviso({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<Item[]>([]);
  const avisar = useCallback((texto: string, tipo: Tipo = 'sucesso') => {
    const id = Date.now() + Math.random();
    setItens((atuais) => [...atuais, { id, texto, tipo }]);
    window.setTimeout(() => setItens((atuais) => atuais.filter((item) => item.id !== id)), 5000);
  }, []);
  const valor = useMemo(() => avisar, [avisar]);
  return <Contexto.Provider value={valor}>
    {children}
    <div className="avisos-flutuantes" aria-live="polite">
      {itens.map((item) => <div className={`aviso-flutuante ${item.tipo}`} key={item.id}>
        {item.tipo === 'sucesso' ? <CheckCircle2 size={18}/> : item.tipo === 'erro' ? <AlertCircle size={18}/> : <Info size={18}/>}
        <span>{item.texto}</span>
        <button aria-label="Fechar aviso" onClick={() => setItens((atuais) => atuais.filter((atual) => atual.id !== item.id))}><X size={16}/></button>
      </div>)}
    </div>
  </Contexto.Provider>;
}

export const useAviso = () => useContext(Contexto);

