import { useEffect, useState } from "react";
import { http } from "@/nucleo/http/clienteHttp";
import { Input } from "@/ui/Input";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import type { UnidadeResumo } from "@/tipos/api";
import { esquemaTerritorio } from "./wizardModelo";

/**
 * Etapa 2 do wizard — Territórios (§4.10). Define o nome do território e associa
 * uma ou mais unidades (checkboxes). Validação por Zod.
 */
export function PassoTerritorios({
  enviando,
  aoSalvar,
}: {
  enviando: boolean;
  aoSalvar: (data: Record<string, unknown>) => void;
}) {
  const [unidades, setUnidades] = useState<UnidadeResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    http
      .get<UnidadeResumo[]>("/units")
      .then((us) => {
        if (vivo) setUnidades(us.filter((u) => u.is_active));
      })
      .catch(() => {
        if (vivo) setUnidades([]);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function alternar(id: string) {
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function salvar() {
    const r = esquemaTerritorio.safeParse({ nome, unidades: selecionadas });
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    setErro(null);
    aoSalvar({ nome: r.data.nome, unidades: r.data.unidades });
  }

  if (carregando) return <Skeleton variante="cartao" />;

  return (
    <div className="space-y-4">
      <Input
        label="Nome do território"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Território Vila Rica"
      />

      <fieldset className="rounded-input border border-ink-soft/15 p-3">
        <legend className="px-1 text-sm font-semibold text-ink">
          Unidades responsáveis
        </legend>
        {unidades.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Nenhuma unidade cadastrada. Volte à etapa anterior e cadastre as unidades.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {unidades.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={selecionadas.includes(u.id)}
                  onChange={() => alternar(u.id)}
                  className="h-4 w-4 accent-[var(--ga-primary)] focus-visible:outline-focus"
                />
                {u.nome}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {erro && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {erro}
        </p>
      )}

      <div className="flex justify-end border-t border-ink-soft/15 pt-4">
        <Botao onClick={salvar} carregando={enviando} bloqueiaDuploSubmit>
          Salvar território e avançar
        </Botao>
      </div>
    </div>
  );
}
