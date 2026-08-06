import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Botao } from "@/ui/Botao";
import { esquemaUnidade, TIPOS_UNIDADE, type FormUnidade } from "./wizardModelo";

/**
 * Etapa 1 do wizard — Unidades (§4.10). Adiciona unidades a uma lista e envia
 * todas de uma vez. Validação de cada linha por Zod (esquemaUnidade).
 */
export function PassoUnidades({
  enviando,
  aoSalvar,
}: {
  enviando: boolean;
  aoSalvar: (data: Record<string, unknown>) => void;
}) {
  const [lista, setLista] = useState<FormUnidade[]>([]);
  const [rascunho, setRascunho] = useState<FormUnidade>({
    tipo: "CRAS",
    nome: "",
    bairro: "",
    municipio: "",
    uf: "",
  });
  const [erro, setErro] = useState<string | null>(null);

  function adicionar() {
    const r = esquemaUnidade.safeParse(rascunho);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    setLista((l) => [...l, r.data]);
    setRascunho({ tipo: "CRAS", nome: "", bairro: "", municipio: "", uf: "" });
    setErro(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Tipo"
          value={rascunho.tipo}
          onChange={(e) => setRascunho((r) => ({ ...r, tipo: e.target.value }))}
          opcoes={TIPOS_UNIDADE.map((t) => ({ valor: t.valor, rotulo: t.rotulo }))}
        />
        <Input
          label="Nome da unidade"
          value={rascunho.nome}
          onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
          placeholder="Ex.: CRAS Norte"
        />
        <Input
          label="Bairro"
          value={rascunho.bairro ?? ""}
          onChange={(e) => setRascunho((r) => ({ ...r, bairro: e.target.value }))}
        />
        <Input
          label="UF"
          maxLength={2}
          value={rascunho.uf ?? ""}
          onChange={(e) => setRascunho((r) => ({ ...r, uf: e.target.value.toUpperCase() }))}
        />
      </div>
      {erro && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {erro}
        </p>
      )}
      <Botao
        variante="secundario"
        iconeInicio={<Plus aria-hidden className="h-4 w-4" />}
        onClick={adicionar}
      >
        Adicionar unidade
      </Botao>

      {lista.length > 0 && (
        <ul className="space-y-2">
          {lista.map((u, i) => (
            <li
              key={`${u.nome}-${i}`}
              className="flex items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-surface p-3"
            >
              <span className="text-sm text-ink">
                <strong>{u.nome}</strong> · {u.tipo}
                {u.bairro ? ` · ${u.bairro}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setLista((l) => l.filter((_, idx) => idx !== i))}
                aria-label={`Remover ${u.nome}`}
                className="rounded p-1 text-ink-soft hover:text-danger focus-visible:outline-focus"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end border-t border-ink-soft/15 pt-4">
        <Botao
          onClick={() => aoSalvar({ unidades: lista })}
          carregando={enviando}
          bloqueiaDuploSubmit
          disabled={lista.length === 0}
        >
          Salvar unidades e avançar
        </Botao>
      </div>
    </div>
  );
}
