import { EmDesenvolvimento } from "@/ui";

export function Agenda() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Agenda e Prazos</h1>
        <p className="text-sm text-slate-500">
          Calendário central de sessões, vencimentos, prazos internos e publicações.
        </p>
      </div>
      <EmDesenvolvimento titulo="Calendário consolidado" />
    </div>
  );
}
