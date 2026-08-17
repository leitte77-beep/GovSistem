import { EmDesenvolvimento } from "@/ui";

export function Pca() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Plano de Contratações Anual (PCA)</h1>
        <p className="text-sm text-slate-500">
          Demandas previstas por secretaria, com transformação direta em solicitação.
        </p>
      </div>
      <EmDesenvolvimento titulo="Módulo de PCA" />
    </div>
  );
}
