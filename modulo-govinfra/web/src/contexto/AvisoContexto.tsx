import { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type Aviso = { id: number; tipo: 'sucesso' | 'erro' | 'info'; texto: string };

type Valor = {
  avisar: (tipo: Aviso['tipo'], texto: string) => void;
};

const Contexto = createContext<Valor | null>(null);

export function ProvedorAviso({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const avisar = useCallback((tipo: Aviso['tipo'], texto: string) => {
    const id = Date.now() + Math.random();
    setAvisos((atual) => [...atual, { id, tipo, texto }]);
    setTimeout(() => {
      setAvisos((atual) => atual.filter((a) => a.id !== id));
    }, 6000);
  }, []);

  return (
    <Contexto.Provider value={{ avisar }}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((aviso) => (
          <div key={aviso.id} className={`aviso-toast ${aviso.tipo}`} role="status">
            {aviso.tipo === 'sucesso' ? <CheckCircle2 size={18}/> : aviso.tipo === 'erro' ? <AlertTriangle size={18}/> : <Info size={18}/>}
            <span>{aviso.texto}</span>
            <button className="botao sutil icone" aria-label="Fechar aviso" onClick={() => setAvisos((a) => a.filter((x) => x.id !== aviso.id))}><X size={15}/></button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAviso() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useAviso deve estar dentro do ProvedorAviso');
  return valor;
}
