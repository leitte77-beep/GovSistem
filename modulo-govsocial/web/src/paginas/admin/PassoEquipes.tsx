import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/ui/Input";
import { Botao } from "@/ui/Botao";
import { CampoCPF } from "@/ui/CampoCPF";
import { esquemaProfissional, type FormProfissional } from "./wizardModelo";

/**
 * Etapa 3 do wizard — Equipes e lotações (§4.10). Adiciona profissionais a uma
 * lista (nome obrigatório; CPF validado se informado). CPF é campo de edição
 * (número completo é aceitável aqui, no cadastro).
 */
export function PassoEquipes({
  enviando,
  aoSalvar,
}: {
  enviando: boolean;
  aoSalvar: (data: Record<string, unknown>) => void;
}) {
  const [lista, setLista] = useState<FormProfissional[]>([]);
  const [rascunho, setRascunho] = useState<FormProfissional>({
    nome: "",
    funcao: "",
    cpf: "",
    email: "",
    telefone: "",
  });
  const [erro, setErro] = useState<string | null>(null);

  function adicionar() {
    const r = esquemaProfissional.safeParse(rascunho);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    setLista((l) => [...l, r.data]);
    setRascunho({ nome: "", funcao: "", cpf: "", email: "", telefone: "" });
    setErro(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Nome do profissional"
          value={rascunho.nome}
          onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
        />
        <Input
          label="Função"
          value={rascunho.funcao ?? ""}
          onChange={(e) => setRascunho((r) => ({ ...r, funcao: e.target.value }))}
          placeholder="Ex.: Assistente social"
        />
        <CampoCPF
          label="CPF (opcional)"
          valor={rascunho.cpf ?? ""}
          aoMudar={(v) => setRascunho((r) => ({ ...r, cpf: v }))}
        />
        <Input
          label="E-mail (opcional)"
          type="email"
          value={rascunho.email ?? ""}
          onChange={(e) => setRascunho((r) => ({ ...r, email: e.target.value }))}
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
        Adicionar profissional
      </Botao>

      {lista.length > 0 && (
        <ul className="space-y-2">
          {lista.map((p, i) => (
            <li
              key={`${p.nome}-${i}`}
              className="flex items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-surface p-3"
            >
              <span className="text-sm text-ink">
                <strong>{p.nome}</strong>
                {p.funcao ? ` · ${p.funcao}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setLista((l) => l.filter((_, idx) => idx !== i))}
                aria-label={`Remover ${p.nome}`}
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
          onClick={() => aoSalvar({ professionals: lista })}
          carregando={enviando}
          bloqueiaDuploSubmit
          disabled={lista.length === 0}
        >
          Salvar equipe e avançar
        </Botao>
      </div>
    </div>
  );
}
