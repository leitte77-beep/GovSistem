import { z } from "zod";
import { validarCep } from "@/nucleo/validadoresBr";
import { esquemaPessoa } from "./esquemaPessoa";

/**
 * Esquemas Zod que espelham as validações do backend (people.py):
 * CPF/NIS com DV real, CEP com 8 dígitos, nome obrigatório. Uma única fonte de
 * verdade para o formulário (React Hook Form) e testes.
 */

const cepOpcional = z
  .string()
  .optional()
  .refine((v) => !v || validarCep(v), { message: "CEP inválido" });

/** Responsável familiar cadastrado junto com a família. */
export const esquemaResponsavel = esquemaPessoa;

export const esquemaFamilia = z.object({
  // Endereço
  cep: cepOpcional,
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  municipio: z.string().trim().optional(),
  uf: z.string().trim().length(2, "UF").optional().or(z.literal("")),
  ponto_referencia: z.string().trim().optional(),
  telefone_contato: z.string().trim().optional(),
  situacao_rua: z.boolean().default(false),
  data_cadastramento: z.string().optional(),
  // Despesas
  despesa_aluguel: z.number().min(0).optional().or(z.literal("")),
  despesa_transporte: z.number().min(0).optional().or(z.literal("")),
  despesa_alimentacao: z.number().min(0).optional().or(z.literal("")),
  despesa_medicamentos: z.number().min(0).optional().or(z.literal("")),
  despesa_outros: z.number().min(0).optional().or(z.literal("")),
  // Situação
  faixa_renda: z.string().optional(),
  no_cadunico: z.boolean().default(false),
  beneficiaria_pbf: z.boolean().default(false),
  possui_bpc: z.boolean().default(false),
  inseguranca_alimentar: z.boolean().default(false),
  // Responsável (embutido)
  responsavel: esquemaResponsavel,
});

export type DadosFamilia = z.infer<typeof esquemaFamilia>;
export type DadosResponsavel = z.infer<typeof esquemaResponsavel>;
