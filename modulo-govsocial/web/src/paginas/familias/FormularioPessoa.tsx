import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Checkbox } from "@/ui/Checkbox";
import {
  ESCOLARIDADE,
  ESTADO_CIVIL,
  RACA_COR,
  SEXO,
  SITUACAO_MERCADO,
  TIPO_DEFICIENCIA,
} from "@/i18n/dominios";
import type { CampoPessoa } from "./esquemaPessoa";

/**
 * Campos cadastrais de uma pessoa, compartilhados por cadastro de família,
 * adição de membro e edição de membro — assim as três telas nunca divergem.
 *
 * `registrar` é injetado pelo chamador para que o formulário funcione tanto com
 * um form plano (edição) quanto aninhado sob "responsavel." (cadastro), sem que
 * este componente precise conhecer o caminho.
 */
export type OpcoesCampo = { valueAsNumber?: boolean };

export type FormularioPessoaProps = {
  registrar: (campo: CampoPessoa, opcoes?: OpcoesCampo) => UseFormRegisterReturn;
  erros?: Partial<Record<CampoPessoa, { message?: string }>>;
  /** CPF/NIS: editáveis no cadastro, mascarados na edição (LGPD). */
  identificacao?: ReactNode;
};

export function FormularioPessoa({
  registrar,
  erros,
  identificacao,
}: FormularioPessoaProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="md:col-span-2">
        <Input
          label="Nome civil"
          obrigatorio
          erro={erros?.nome_civil?.message}
          className="p-3"
          {...registrar("nome_civil")}
        />
      </div>
      <div className="md:col-span-2">
        <Input
          label="Nome social"
          dica="Se preenchido, tem precedência de exibição em toda a interface."
          className="p-3"
          {...registrar("nome_social")}
        />
      </div>

      {identificacao}

      <Input
        label="Data de nascimento"
        type="date"
        className="p-3"
        {...registrar("data_nascimento")}
      />
      <Select
        label="Sexo"
        opcoes={SEXO}
        placeholder="Selecione"
        className="p-3"
        {...registrar("sexo")}
      />
      <Select
        label="Raça/Cor"
        opcoes={[{ valor: "", rotulo: "Não informado" }, ...RACA_COR]}
        placeholder="Selecione"
        className="p-3"
        {...registrar("raca_cor")}
      />
      <Select
        label="Estado civil"
        opcoes={[{ valor: "", rotulo: "Não informado" }, ...ESTADO_CIVIL]}
        placeholder="Selecione"
        className="p-3"
        {...registrar("estado_civil")}
      />
      <Select
        label="Escolaridade"
        opcoes={[{ valor: "", rotulo: "Não informado" }, ...ESCOLARIDADE]}
        placeholder="Selecione"
        className="p-3"
        {...registrar("escolaridade")}
      />
      <Input
        label="Ocupação"
        placeholder="Profissão ou ocupação principal"
        className="p-3"
        {...registrar("ocupacao")}
      />
      <Select
        label="Situação no mercado de trabalho"
        opcoes={[{ valor: "", rotulo: "Não informado" }, ...SITUACAO_MERCADO]}
        placeholder="Selecione"
        className="p-3"
        {...registrar("situacao_mercado_trabalho")}
      />
      <Input
        label="Renda mensal (R$)"
        type="number"
        step="0.01"
        min="0"
        placeholder="0,00"
        erro={erros?.renda_mensal?.message}
        className="p-3"
        {...registrar("renda_mensal", { valueAsNumber: true })}
      />
      <div className="flex gap-6 md:col-span-2">
        <Checkbox label="Frequenta escola" {...registrar("frequenta_escola")} />
        <Checkbox label="Gestante" {...registrar("gestante")} />
        <Checkbox label="Amamentando" {...registrar("amamentando")} />
      </div>
      <Select
        label="Tipo de deficiência"
        opcoes={[{ valor: "", rotulo: "Nenhuma" }, ...TIPO_DEFICIENCIA.filter((o) => o.valor !== "NENHUMA")]}
        placeholder="Nenhuma"
        className="p-3"
        {...registrar("tipo_deficiencia")}
      />
    </div>
  );
}
