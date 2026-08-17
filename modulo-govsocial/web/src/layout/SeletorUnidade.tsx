import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { textos } from "@/i18n/textos";

/**
 * Seletor de unidade — contexto global de tudo (§3). A escolha é persistida.
 */
export function SeletorUnidade() {
  const { unidades, unidadeAtual, definirUnidade, carregando } = useUnidadeAtual();

  if (carregando) {
    return <span className="text-sm text-ink-soft">Carregando unidades…</span>;
  }

  if (unidades.length === 0) {
    return <span className="text-sm text-ink-soft">Nenhuma unidade</span>;
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink-soft">
      <span className="font-semibold whitespace-nowrap">{textos.seletorUnidade.rotulo}:</span>
      <select
        aria-label={textos.seletorUnidade.aria}
        value={unidadeAtual?.id ?? ""}
        onChange={(e) => definirUnidade(e.target.value)}
        className="min-h-[40px] rounded-xl border border-outline-variant bg-surface-container-low/50 px-3 py-2 text-ink font-medium focus-visible:outline-focus"
      >
        {!unidadeAtual && <option value="" disabled>Selecione uma unidade</option>}
        {unidades.map((u) => (
          <option key={u.id} value={u.id} className="text-ink">
            {u.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
