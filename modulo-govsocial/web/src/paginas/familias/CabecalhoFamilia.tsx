import { Link } from "react-router-dom";
import { useState } from "react";
import { Chip } from "@/ui/Chip";
import { Permitido } from "@/nucleo/permissoes/Permitido";
import { downloadPdf } from "@/nucleo/impressao/downloadPdf";
import { avisar } from "@/ui/Toast";
import type { FamilyOut } from "@/tipos/pessoas";

/**
 * <CabecalhoFamilia> — cabeçalho da ficha (§4.2) no layout premium:
 * breadcrumb (família nº > território), nome do responsável com selos,
 * linhas de identificação com ícones Material e ações contextuais por
 * perfil (removidas via <Permitido> quando o usuário não pode agir).
 * NIS já vem mascarado do backend.
 */

function Icone({ nome, className }: { nome: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className ?? ""}`}>
      {nome}
    </span>
  );
}

export function CabecalhoFamilia({
  familia,
  aoRegistrarAtendimento,
  aoEditar,
}: {
  familia: FamilyOut;
  aoRegistrarAtendimento?: () => void;
  aoEditar?: () => void;
}) {
  const membrosAtivos = familia.membros.filter((m) => m.status === "ATIVO");
  const [baixandoProntuario, setBaixandoProntuario] = useState(false);

  async function baixarProntuario() {
    setBaixandoProntuario(true);
    try {
      await downloadPdf(
        `/documentos/prontuario/${familia.id}`,
        `prontuario_${familia.codigo}.pdf`,
      );
      avisar.sucesso("Prontuário baixado com sucesso");
    } catch (e: unknown) {
      avisar.erro(e instanceof Error ? e.message : "Erro ao baixar prontuário");
    } finally {
      setBaixandoProntuario(false);
    }
  }

  const botaoSecundario =
    "flex items-center gap-2 px-md py-sm bg-surface-container-lowest border border-outline/20 rounded-lg text-primary font-label-md text-label-md hover:bg-surface-container-high transition-all";

  return (
    <header className="mb-lg">
      <div className="flex flex-col md:flex-row justify-between items-start gap-md">
        <div className="flex-1 min-w-0">
          <nav
            aria-label="Localização da família"
            className="flex items-center gap-xs text-secondary font-label-sm text-label-sm uppercase tracking-wide mb-xs"
          >
            <span>Família nº {familia.codigo}</span>
            {familia.territorio && (
              <>
                <Icone nome="chevron_right" className="!text-[14px]" />
                <span>{familia.territorio}</span>
              </>
            )}
          </nav>

          <div className="flex flex-wrap items-center gap-sm mb-2">
            <h1 className="font-titulo text-headline-lg text-on-background truncate">
              {familia.responsavel_nome ?? "Sem responsável definido"}
            </h1>
            {familia.beneficiaria_pbf && (
              <span className="bg-primary-fixed/50 text-on-primary-fixed font-label-sm text-[10px] px-2 py-0.5 rounded-full font-bold">
                PBF
              </span>
            )}
            {familia.no_cadunico && (
              <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-[10px] px-2 py-0.5 rounded-full font-bold">
                CADÚNICO{familia.cadunico_atualizado_em ? " ATUALIZADO" : ""}
              </span>
            )}
            {familia.possui_bpc && (
              <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-[10px] px-2 py-0.5 rounded-full font-bold">
                BPC
              </span>
            )}
            {familia.inseguranca_alimentar && (
              <Chip cor="amber">Insegurança alimentar</Chip>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-on-surface-variant font-corpo text-body-sm">
            <div className="flex items-center gap-1">
              <Icone nome="id_card" className="text-primary !text-[18px]" />
              <span>
                {familia.responsavel_nome && "responsável"}
                {familia.nis_responsavel_mascarado && (
                  <>
                    {familia.responsavel_nome && " • "}
                    <span className="fonte-mono">NIS {familia.nis_responsavel_mascarado}</span>
                  </>
                )}
              </span>
            </div>
            {membrosAtivos.length > 0 && (
              <div className="flex items-center gap-1">
                <Icone nome="group" className="text-primary !text-[18px]" />
                <span>
                  {membrosAtivos.length}{" "}
                  {membrosAtivos.length === 1 ? "membro" : "membros"}:{" "}
                  {membrosAtivos
                    .slice(0, 4)
                    .map((m) => m.nome_exibicao)
                    .join(", ")}
                  {membrosAtivos.length > 4 && ` +${membrosAtivos.length - 4}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Permitido capacidade="familia.cadastrar">
            <button type="button" onClick={aoEditar} className={botaoSecundario}>
              <Icone nome="edit" className="!text-[20px]" />
              Editar família
            </button>
          </Permitido>
          <Permitido capacidade="atendimento.registrar">
            <button
              type="button"
              onClick={aoRegistrarAtendimento}
              className="flex items-center gap-2 px-md py-sm bg-primary text-on-primary rounded-lg font-label-md text-label-md shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
            >
              <Icone nome="add_circle" className="!text-[20px]" />
              Registrar atendimento
            </button>
          </Permitido>
          <Permitido capacidade="beneficio.conceder">
            <Link to={`/beneficios?familia=${familia.id}`} className={botaoSecundario}>
              <Icone nome="payments" className="!text-[20px]" />
              Conceder benefício
            </Link>
          </Permitido>
          <Permitido capacidade="encaminhamento.criar">
            <Link to="/encaminhamentos" className={botaoSecundario}>
              <Icone nome="send" className="!text-[20px]" />
              Encaminhar
            </Link>
          </Permitido>
          <Permitido capacidade="prontuario.ler">
            <button
              type="button"
              onClick={baixarProntuario}
              disabled={baixandoProntuario}
              title="Imprimir prontuário"
              aria-label="Imprimir prontuário"
              className="p-2 bg-surface-container-lowest border border-outline/20 rounded-lg text-primary hover:bg-surface-container-high transition-all disabled:opacity-50"
            >
              <Icone nome={baixandoProntuario ? "hourglass_top" : "print"} />
            </button>
          </Permitido>
        </div>
      </div>
    </header>
  );
}
