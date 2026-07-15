import { z } from "zod";
import { validarCpf, validarNis } from "@/nucleo/validadoresBr";

/**
 * Esquema Zod de uma pessoa (espelha PersonCreate/PersonUpdate do backend).
 * Fonte única para o cadastro de família, a adição de membro e a edição de
 * membro — os três telas precisam do mesmo conjunto de campos.
 */

export const cpfOpcional = z
  .string()
  .optional()
  .refine((v) => !v || validarCpf(v), { message: "CPF inválido" });

export const nisOpcional = z
  .string()
  .optional()
  .refine((v) => !v || validarNis(v), { message: "NIS inválido" });

export const esquemaPessoa = z.object({
  nome_civil: z.string().trim().min(2, "Informe o nome civil"),
  nome_social: z.string().trim().optional(),
  cpf: cpfOpcional,
  nis: nisOpcional,
  data_nascimento: z.string().optional(),
  sexo: z.string().optional(),
  raca_cor: z.string().optional(),
  estado_civil: z.string().optional(),
  escolaridade: z.string().optional(),
  ocupacao: z.string().optional(),
  frequenta_escola: z.boolean().nullish(),
  situacao_mercado_trabalho: z.string().optional(),
  gestante: z.boolean().nullish(),
  amamentando: z.boolean().nullish(),
  // register(valueAsNumber) devolve NaN com o campo vazio, e z.number() recusa
  // NaN com uma mensagem incompreensível — normalizamos para "não informado".
  renda_mensal: z.preprocess(
    (v) =>
      v === "" || v === null || (typeof v === "number" && Number.isNaN(v))
        ? undefined
        : v,
    z.number().min(0, "A renda não pode ser negativa").optional(),
  ),
  tipo_deficiencia: z.string().optional(),
});

export type DadosPessoa = z.infer<typeof esquemaPessoa>;

/** Campos que o <FormularioPessoa> registra (CPF/NIS são controlados à parte). */
export type CampoPessoa = Exclude<keyof DadosPessoa, "cpf" | "nis">;
