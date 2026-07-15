import { useState } from "react";
import { Modal } from "@/ui/Modal";
import { Botao } from "@/ui/Botao";
import { Input } from "@/ui/Input";
import type { CampoNormalizado } from "./rmaModelo";

/**
 * Ajuste manual de um número do RMA (§4.8). Exige justificativa obrigatória
 * (fica marcado como "ajustado" no espelho). O backend recusa (422) se o RMA
 * já estiver fechado — defesa em profundidade.
 */
export function ModalAjuste({
  aberto,
  blocoRotulo,
  campo,
  enviando,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean;
  blocoRotulo: string;
  campo: CampoNormalizado | null;
  enviando: boolean;
  aoFechar: () => void;
  aoConfirmar: (valorAjustado: number, justificativa: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Reinicia o formulário quando o campo muda.
  const chave = campo ? `${campo.campo}` : "vazio";
  const [chaveAtual, setChaveAtual] = useState(chave);
  if (chave !== chaveAtual) {
    setChaveAtual(chave);
    setValor(campo ? String(campo.valor) : "");
    setJustificativa("");
    setErro(null);
  }

  if (!campo) return null;

  function confirmar() {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      setErro("Informe um número inteiro igual ou maior que zero.");
      return;
    }
    if (justificativa.trim().length < 5) {
      setErro("A justificativa é obrigatória (mínimo de 5 caracteres).");
      return;
    }
    setErro(null);
    aoConfirmar(n, justificativa.trim());
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={`Ajustar ${campo.codigo}`}
      descricao={`${blocoRotulo} · ${campo.rotulo}`}
      rodape={
        <>
          <Botao variante="texto" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={confirmar} carregando={enviando} bloqueiaDuploSubmit>
            Salvar ajuste
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Valor calculado pelo sistema:{" "}
          <span className="fonte-mono font-semibold text-ink">{campo.valor}</span>
        </p>
        <Input
          label="Valor ajustado"
          type="number"
          min={0}
          inputMode="numeric"
          mono
          obrigatorio
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="ajuste-justificativa" className="text-sm font-semibold text-ink">
            Justificativa
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          </label>
          <textarea
            id="ajuste-justificativa"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={3}
            aria-required
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? "ajuste-erro" : undefined}
            className="rounded-input border border-ink-soft/30 bg-surface px-3 py-2 text-ink focus:border-primary focus-visible:outline-focus"
            placeholder="Explique o motivo do ajuste (ex.: duplicidade no registro de origem)."
          />
        </div>
        {erro && (
          <p id="ajuste-erro" role="alert" className="text-sm font-semibold text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
