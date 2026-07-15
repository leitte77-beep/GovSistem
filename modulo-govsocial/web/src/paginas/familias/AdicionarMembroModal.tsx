import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { Modal } from "@/ui/Modal";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Botao } from "@/ui/Botao";
import { CampoCPF } from "@/ui/CampoCPF";
import { CampoNIS } from "@/ui/CampoNIS";
import { avisar } from "@/ui/Toast";
import { servicoPessoas, servicoFamilias } from "@/nucleo/api/pessoas";
import { queryClient } from "@/nucleo/query/queryClient";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { apenasDigitos } from "@/nucleo/validadoresBr";
import { PARENTESCO } from "@/i18n/dominios";
import type { PersonListItem } from "@/tipos/pessoas";
import { FormularioPessoa } from "./FormularioPessoa";
import { esquemaPessoa, type DadosPessoa } from "./esquemaPessoa";

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  familyId: string;
};

export function AdicionarMembroModal({ aberto, aoFechar, familyId }: Props) {
  const [modo, setModo] = useState<"buscar" | "criar">("buscar");
  const [parentesco, setParentesco] = useState("FILHO");

  const parentescoSemResponsavel = PARENTESCO.filter(
    (p) => p.valor !== "RESPONSAVEL",
  );

  function limparEFechar() {
    setModo("buscar");
    setParentesco("FILHO");
    aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={limparEFechar}
      titulo="Adicionar membro à família"
      tamanho="lg"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
              modo === "buscar"
                ? "bg-primary text-white"
                : "bg-surface-container-low text-ink-soft hover:text-ink"
            }`}
            onClick={() => setModo("buscar")}
          >
            <Search className="inline h-3.5 w-3.5 mr-1" aria-hidden />
            Buscar pessoa
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
              modo === "criar"
                ? "bg-primary text-white"
                : "bg-surface-container-low text-ink-soft hover:text-ink"
            }`}
            onClick={() => setModo("criar")}
          >
            <UserPlus className="inline h-3.5 w-3.5 mr-1" aria-hidden />
            Nova pessoa
          </button>
        </div>

        <Select
          label="Parentesco"
          opcoes={parentescoSemResponsavel}
          value={parentesco}
          onChange={(e) => setParentesco(e.target.value)}
          className="p-3"
        />

        {modo === "buscar" ? (
          <VincularExistente
            familyId={familyId}
            parentesco={parentesco}
            aoConcluir={limparEFechar}
          />
        ) : (
          <CriarEVincular
            familyId={familyId}
            parentesco={parentesco}
            aoConcluir={limparEFechar}
          />
        )}
      </div>
    </Modal>
  );
}

function VincularExistente({
  familyId,
  parentesco,
  aoConcluir,
}: {
  familyId: string;
  parentesco: string;
  aoConcluir: () => void;
}) {
  const [busca, setBusca] = useState("");

  const buscaQ = useQuery({
    queryKey: ["buscar-pessoas", busca],
    queryFn: () => servicoPessoas.listar(busca),
    enabled: busca.length >= 2,
  });

  const vincular = useMutation({
    mutationFn: (personId: string) =>
      servicoFamilias.adicionarMembro(familyId, { person_id: personId, parentesco }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familyId] });
      void queryClient.invalidateQueries({ queryKey: ["familias"] });
      avisar.sucesso("Membro adicionado à família.");
      aoConcluir();
    },
    onError: (e) => {
      avisar.erro(e instanceof ErroApi ? e.message : "Erro ao vincular membro.");
    },
  });

  return (
    <div className="space-y-3">
      <Input
        label="Buscar por nome"
        placeholder="Digite ao menos 2 caracteres"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="p-3"
      />
      {buscaQ.isLoading && <p className="text-xs text-ink-soft">Buscando...</p>}
      {buscaQ.data && buscaQ.data.length === 0 && busca.length >= 2 && (
        <p className="text-sm text-ink-soft">
          Nenhuma pessoa encontrada. Use "Nova pessoa" para cadastrar.
        </p>
      )}
      {buscaQ.data && buscaQ.data.length > 0 && (
        <ul className="max-h-48 overflow-y-auto border rounded-input divide-y divide-ink-soft/10">
          {buscaQ.data.map((p: PersonListItem) => (
            <li
              key={p.id}
              className="flex items-center justify-between px-3 py-2 hover:bg-surface-container-low"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.nome_exibicao}</p>
                <p className="text-xs text-ink-soft">
                  {p.cpf_mascarado && `CPF ${p.cpf_mascarado}`}
                  {p.data_nascimento &&
                    ` • Nasc. ${new Date(p.data_nascimento).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              <Botao
                variante="primario"
                tamanho="sm"
                onClick={() => vincular.mutate(p.id)}
                carregando={vincular.isPending}
              >
                Vincular
              </Botao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CriarEVincular({
  familyId,
  parentesco,
  aoConcluir,
}: {
  familyId: string;
  parentesco: string;
  aoConcluir: () => void;
}) {
  const [cpf, setCpf] = useState("");
  const [nis, setNis] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DadosPessoa>({
    resolver: zodResolver(esquemaPessoa),
    defaultValues: { nome_civil: "" },
  });

  const criar = useMutation({
    mutationFn: async (dados: DadosPessoa) => {
      const resultado = await servicoPessoas.criar({
        ...dados,
        nome_social: dados.nome_social || null,
        cpf: apenasDigitos(cpf) || null,
        nis: apenasDigitos(nis) || null,
        data_nascimento: dados.data_nascimento || null,
        sexo: dados.sexo || null,
        raca_cor: dados.raca_cor || null,
        estado_civil: dados.estado_civil || null,
        escolaridade: dados.escolaridade || null,
        ocupacao: dados.ocupacao || null,
        situacao_mercado_trabalho: dados.situacao_mercado_trabalho || null,
        tipo_deficiencia: dados.tipo_deficiencia || null,
        renda_mensal: dados.renda_mensal ?? null,
        family_id: familyId,
        parentesco,
        confirmar_duplicata: true,
      });
      return resultado;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familyId] });
      void queryClient.invalidateQueries({ queryKey: ["familias"] });
      avisar.sucesso("Pessoa cadastrada e vinculada à família.");
      aoConcluir();
    },
    onError: (e) => {
      avisar.erro(e instanceof ErroApi ? e.message : "Erro ao cadastrar.");
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => criar.mutate(d))} noValidate>
      <div className="max-h-[55vh] overflow-y-auto pr-1">
        <FormularioPessoa
          registrar={(campo, opcoes) => register(campo, opcoes)}
          erros={errors}
          identificacao={
            <>
              <CampoCPF valor={cpf} aoMudar={setCpf} />
              <CampoNIS valor={nis} aoMudar={setNis} />
            </>
          }
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Botao variante="primario" type="submit" carregando={criar.isPending}>
          Cadastrar e vincular
        </Botao>
      </div>
    </form>
  );
}
