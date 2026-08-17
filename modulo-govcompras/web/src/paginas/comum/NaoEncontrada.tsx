import { Link } from "react-router-dom";
import { CompassIcon } from "lucide-react";
import { Botao } from "@/ui";

export function NaoEncontrada() {
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center text-center">
      <CompassIcon className="mb-3 size-10 text-slate-300" />
      <h1 className="text-lg font-semibold text-slate-900">Página não encontrada</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        O endereço acessado não existe no GovCompras. Volte para o painel principal.
      </p>
      <Link to="/" className="mt-4">
        <Botao>Voltar ao início</Botao>
      </Link>
    </div>
  );
}
