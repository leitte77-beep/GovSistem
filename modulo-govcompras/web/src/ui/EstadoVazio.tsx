import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EstadoVazio({
  titulo,
  descricao,
  icone,
  acao,
}: {
  titulo: string;
  descricao?: string;
  icone?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="mb-1 rounded-full bg-slate-100 p-3 text-slate-400">{icone ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      {descricao && <p className="max-w-sm text-xs text-slate-500">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function EstadoErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {mensagem}
    </div>
  );
}

export function EstadoSemPermissao() {
  return (
    <EstadoVazio
      titulo="Você não tem permissão para ver esta página"
      descricao="Se isso não parece certo, procure o administrador do GovCompras."
    />
  );
}

export function EmDesenvolvimento({ titulo }: { titulo: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mt-1 text-xs text-slate-500">Funcionalidade prevista para próxima fase.</p>
    </div>
  );
}
