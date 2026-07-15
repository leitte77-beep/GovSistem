import { useState } from "react";
import { Modal } from "@/ui/Modal";
import { Botao } from "@/ui/Botao";
import { Input } from "@/ui/Input";
import { formatarData } from "@/nucleo/datas";
import type { DuplicateCandidate } from "@/tipos/pessoas";

/**
 * Modal de possível duplicata (§4.1): mostra candidatos semelhantes ANTES de
 * criar. O usuário pode "usar existente" ou "criar mesmo assim" — este último
 * exige justificativa (fica registrado; o backend audita a criação).
 */
export function ModalDuplicata({
  candidatos,
  aoFechar,
  aoUsarExistente,
  aoCriarMesmoAssim,
}: {
  candidatos: DuplicateCandidate[];
  aoFechar: () => void;
  aoUsarExistente: (id: string) => void;
  aoCriarMesmoAssim: (justificativa: string) => void;
}) {
  const [justificativa, setJustificativa] = useState("");
  const [tentouCriar, setTentouCriar] = useState(false);
  const justificativaValida = justificativa.trim().length >= 5;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Encontramos pessoas semelhantes"
      descricao="Antes de criar, verifique se o responsável já está cadastrado — evita duplicidade no CadÚnico e na rede."
      tamanho="lg"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar e revisar
          </Botao>
          <Botao
            variante="perigo"
            onClick={() => {
              setTentouCriar(true);
              if (justificativaValida) aoCriarMesmoAssim(justificativa.trim());
            }}
          >
            Criar mesmo assim
          </Botao>
        </>
      }
    >
      <ul className="mb-4 space-y-2">
        {candidatos.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-input border border-ink-soft/20 p-3"
          >
            <div>
              <span className="font-semibold text-ink">{c.nome_exibicao}</span>
              <div className="flex flex-wrap gap-3 text-xs text-ink-soft">
                {c.cpf_mascarado && <span className="fonte-mono">{c.cpf_mascarado}</span>}
                {c.data_nascimento && <span>Nasc.: {formatarData(c.data_nascimento)}</span>}
              </div>
            </div>
            <Botao variante="secundario" tamanho="sm" onClick={() => aoUsarExistente(c.id)}>
              Usar esta pessoa
            </Botao>
          </li>
        ))}
      </ul>

      <Input
        label="Justificativa para criar assim mesmo"
        dica="Obrigatória (mínimo 5 caracteres). Ex.: homônimo confirmado com documento."
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        erro={
          tentouCriar && !justificativaValida
            ? "Informe uma justificativa com pelo menos 5 caracteres."
            : undefined
        }
      />
    </Modal>
  );
}
