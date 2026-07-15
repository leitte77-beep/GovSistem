import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/ui/Input";
import { Select, type OpcaoSelect } from "@/ui/Select";
import { Checkbox } from "@/ui/Checkbox";
import { Botao } from "@/ui/Botao";
import { CampoCPF } from "@/ui/CampoCPF";
import { CampoNIS } from "@/ui/CampoNIS";
import { avisar } from "@/ui/Toast";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { FormularioPessoa } from "./FormularioPessoa";
import {
  buscarCep,
  servicoFamilias,
  servicoPessoas,
  servicoLocalidades,
  type Estado,
  type Municipio,
} from "@/nucleo/api/pessoas";
import { queryClient } from "@/nucleo/query/queryClient";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { formatarCepParcial, apenasDigitos } from "@/nucleo/validadoresBr";
import { FAIXA_RENDA } from "@/i18n/dominios";
import type { DuplicateCandidate } from "@/tipos/pessoas";
import { esquemaFamilia, type DadosFamilia } from "./esquemaFamilia";
import { ModalDuplicata } from "./ModalDuplicata";

/**
 * Cadastro de família + responsável (§4 do prompt).
 * Fluxo de duplicata ANTES de criar: cria a pessoa responsável primeiro; se o
 * backend retornar candidatos (created=false), abrimos o modal para o usuário
 * decidir "usar existente" ou "criar mesmo assim" (com justificativa). Só então
 * a família é criada e o responsável vinculado.
 */
export default function FamiliaFormulario() {
  const navigate = useNavigate();
  const podeCadastrar = usePermissao("familia.cadastrar");
  const [cpf, setCpf] = useState("");
  const [nis, setNis] = useState("");
  const [duplicatas, setDuplicatas] = useState<DuplicateCandidate[] | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [ufSelecionada, setUfSelecionada] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DadosFamilia>({
    resolver: zodResolver(esquemaFamilia),
    defaultValues: {
      no_cadunico: false,
      beneficiaria_pbf: false,
      possui_bpc: false,
      inseguranca_alimentar: false,
      situacao_rua: false,
      responsavel: { nome_civil: "" },
    },
  });

  const ufAtual = watch("uf");

  const { data: estados = [] } = useQuery({
    queryKey: ["estados"],
    queryFn: () => servicoLocalidades.estados(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: municipios = [] } = useQuery({
    queryKey: ["municipios", ufSelecionada],
    queryFn: () => servicoLocalidades.municipios(ufSelecionada),
    enabled: ufSelecionada.length === 2,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const opcoesUf: OpcaoSelect[] = estados.map((e: Estado) => ({
    valor: e.sigla,
    rotulo: e.sigla,
  }));

  const opcoesMunicipio: OpcaoSelect[] = municipios.map((m: Municipio) => ({
    valor: m.nome,
    rotulo: m.nome,
  }));

  const aoMudarUf = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const uf = e.target.value;
      setUfSelecionada(uf);
      setValue("uf", uf);
      setValue("municipio", "");
    },
    [setValue],
  );

  useEffect(() => {
    if (ufAtual && ufAtual !== ufSelecionada) {
      setUfSelecionada(ufAtual);
    }
  }, [ufAtual, ufSelecionada]);

  const criacao = useMutation({
    mutationFn: async (dados: DadosFamilia & { confirmarDuplicata?: boolean }) => {
      // 1) cria/localiza o responsável (com detecção de duplicata no backend)
      const resultado = await servicoPessoas.criar({
        nome_civil: dados.responsavel.nome_civil,
        nome_social: dados.responsavel.nome_social || null,
        cpf: cpf || null,
        nis: nis || null,
        data_nascimento: dados.responsavel.data_nascimento || null,
        sexo: dados.responsavel.sexo || null,
        raca_cor: dados.responsavel.raca_cor || null,
        estado_civil: dados.responsavel.estado_civil || null,
        escolaridade: dados.responsavel.escolaridade || null,
        ocupacao: dados.responsavel.ocupacao || null,
        frequenta_escola: dados.responsavel.frequenta_escola ?? null,
        situacao_mercado_trabalho: dados.responsavel.situacao_mercado_trabalho || null,
        gestante: dados.responsavel.gestante ?? null,
        amamentando: dados.responsavel.amamentando ?? null,
        renda_mensal: dados.responsavel.renda_mensal || null,
        tipo_deficiencia: dados.responsavel.tipo_deficiencia || null,
        confirmar_duplicata: dados.confirmarDuplicata ?? false,
      });
      if (!resultado.created) {
        return { duplicatas: resultado.duplicates };
      }
      // 2) cria a família
      const familia = await servicoFamilias.criar({
        cep: apenasDigitos(dados.cep) || null,
        logradouro: dados.logradouro || null,
        numero: dados.numero || null,
        complemento: dados.complemento || null,
        bairro: dados.bairro || null,
        municipio: dados.municipio || null,
        uf: dados.uf || null,
        ponto_referencia: dados.ponto_referencia || null,
        telefone_contato: dados.telefone_contato || null,
        situacao_rua: dados.situacao_rua,
        data_cadastramento: dados.data_cadastramento || null,
        despesa_aluguel: dados.despesa_aluguel || null,
        despesa_transporte: dados.despesa_transporte || null,
        despesa_alimentacao: dados.despesa_alimentacao || null,
        despesa_medicamentos: dados.despesa_medicamentos || null,
        despesa_outros: dados.despesa_outros || null,
        faixa_renda: dados.faixa_renda || null,
        no_cadunico: dados.no_cadunico,
        beneficiaria_pbf: dados.beneficiaria_pbf,
        possui_bpc: dados.possui_bpc,
        inseguranca_alimentar: dados.inseguranca_alimentar,
        nis_responsavel: nis || null,
      });
      // 3) vincula o responsável recém-criado
      if (resultado.person) {
        await servicoFamilias.adicionarMembro(familia.id, {
          person_id: resultado.person.id,
          parentesco: "RESPONSAVEL",
          definir_responsavel: true,
        });
      }
      return { familia };
    },
    onSuccess: (r) => {
      if ("duplicatas" in r && r.duplicatas) {
        setDuplicatas(r.duplicatas);
        return;
      }
      if ("familia" in r && r.familia) {
        void queryClient.invalidateQueries({ queryKey: ["familias"] });
        avisar.sucesso(`Família nº ${r.familia.codigo} cadastrada.`);
        navigate(`/familias/${r.familia.id}`);
      }
    },
    onError: (e) => {
      const msg = e instanceof ErroApi ? e.message : "Não foi possível cadastrar.";
      avisar.erro(msg);
    },
  });

  if (!podeCadastrar) return <EstadoSemPermissao />;

  async function preencherPorCep(valor: string) {
    setValue("cep", formatarCepParcial(valor));
    const d = apenasDigitos(valor);
    if (d.length !== 8) return;
    setBuscandoCep(true);
    const end = await buscarCep(d);
    setBuscandoCep(false);
    if (end) {
      setValue("logradouro", end.logradouro);
      setValue("bairro", end.bairro);
      setValue("municipio", end.localidade);
      const sigla = end.uf.toUpperCase();
      setValue("uf", sigla);
      setUfSelecionada(sigla);
    } else {
      avisar.info("CEP não encontrado. Preencha o endereço manualmente.");
    }
  }

  function aoConfirmarCriarMesmoAssim() {
    setDuplicatas(null);
    handleSubmit((dados) => criacao.mutate({ ...dados, confirmarDuplicata: true }))();
  }

  function aoUsarExistente(id: string) {
    setDuplicatas(null);
    // A pessoa já existe: leva à busca por ela para vincular/abrir a ficha.
    navigate(`/familias?q=${encodeURIComponent(id)}`);
    avisar.info("Selecione a família da pessoa existente para vincular.");
  }

  return (
    <section aria-labelledby="titulo-form" className="mx-auto max-w-5xl space-y-8 pb-12">
      <div className="mb-8">
        <h1 id="titulo-form" className="text-2xl font-bold text-ink">
          Cadastrar nova família
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Informe o responsável familiar e o endereço. Você poderá adicionar os
          demais membros depois de criar a família.
        </p>
      </div>

      <form
        className="space-y-8"
        onSubmit={handleSubmit((dados) => criacao.mutate(dados))}
        noValidate
      >
        <div className="bg-surface rounded-cartao shadow-um border border-ink-soft/15 overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-low border-b border-ink-soft/10">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
              Responsável familiar
            </h3>
          </div>
          <div className="p-6">
            <FormularioPessoa
              registrar={(campo, opcoes) => register(`responsavel.${campo}`, opcoes)}
              erros={errors.responsavel}
              identificacao={
                <>
                  <CampoCPF valor={cpf} aoMudar={setCpf} />
                  <CampoNIS valor={nis} aoMudar={setNis} />
                </>
              }
            />
          </div>
        </div>

        <div className="bg-surface rounded-cartao shadow-um border border-ink-soft/15 overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-low border-b border-ink-soft/10">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Endereço</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Input
                label="CEP"
                mono
                inputMode="numeric"
                placeholder="00000-000"
                erro={errors.cep?.message}
                className="p-3"
                {...register("cep")}
                onChange={(e) => preencherPorCep(e.target.value)}
              />
              {buscandoCep && (
                <span className="inline-flex items-center gap-1 text-xs text-ink-soft mt-1" aria-live="polite">
                  <Search className="h-3 w-3 animate-pulse" aria-hidden /> buscando…
                </span>
              )}
            </div>
            <div className="md:col-span-2">
              <Input label="Logradouro" className="p-3" {...register("logradouro")} />
            </div>
            <div>
              <Input label="Número" className="p-3" {...register("numero")} />
            </div>
            <div>
              <Input label="Complemento" className="p-3" {...register("complemento")} />
            </div>
            <div>
              <Input label="Bairro" className="p-3" {...register("bairro")} />
            </div>
            <div>
              <Select
                label="UF"
                opcoes={opcoesUf}
                placeholder="UF"
                erro={errors.uf?.message}
                className="p-3"
                {...register("uf")}
                onChange={aoMudarUf}
              />
            </div>
            <div className="md:col-span-2">
              <Select
                label="Município"
                opcoes={opcoesMunicipio}
                placeholder={ufSelecionada ? "Selecione o município" : "Selecione a UF primeiro"}
                erro={errors.municipio?.message}
                className="p-3"
                disabled={!ufSelecionada || opcoesMunicipio.length === 0}
                {...register("municipio")}
              />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-cartao shadow-um border border-ink-soft/15 overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-low border-b border-ink-soft/10">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
              Dados complementares (CadÚnico)
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Input
                label="Ponto de referência"
                placeholder="Ex: Próximo à igreja matriz"
                className="p-3"
                {...register("ponto_referencia")}
              />
            </div>
            <div>
              <Input
                label="Telefone para contato"
                placeholder="(00) 00000-0000"
                inputMode="tel"
                className="p-3"
                {...register("telefone_contato")}
              />
            </div>
            <div>
              <Input
                label="Data de cadastramento"
                type="date"
                className="p-3"
                {...register("data_cadastramento")}
              />
            </div>
            <div className="md:col-span-2">
              <Checkbox label="Família em situação de rua" {...register("situacao_rua")} />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-cartao shadow-um border border-ink-soft/15 overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-low border-b border-ink-soft/10">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
              Despesas familiares (R$)
            </h3>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Input
                label="Aluguel"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="p-3"
                {...register("despesa_aluguel", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Input
                label="Transporte"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="p-3"
                {...register("despesa_transporte", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Input
                label="Alimentação"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="p-3"
                {...register("despesa_alimentacao", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Input
                label="Medicamentos"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="p-3"
                {...register("despesa_medicamentos", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Input
                label="Outros"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="p-3"
                {...register("despesa_outros", { valueAsNumber: true })}
              />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-cartao shadow-um border border-ink-soft/15 overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-low border-b border-ink-soft/10">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
              Situação socioeconômica
            </h3>
          </div>
          <div className="p-6 space-y-6">
            <Select
              label="Faixa de renda familiar per capita"
              opcoes={FAIXA_RENDA}
              placeholder="Selecione"
              className="p-3"
              {...register("faixa_renda")}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Checkbox label="Inscrita no CadÚnico" {...register("no_cadunico")} />
              <Checkbox label="Beneficiária do Bolsa Família" {...register("beneficiaria_pbf")} />
              <Checkbox label="Possui BPC na família" {...register("possui_bpc")} />
              <Checkbox label="Em insegurança alimentar" {...register("inseguranca_alimentar")} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <Botao variante="secundario" type="button" onClick={() => navigate(-1)}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            type="submit"
            carregando={criacao.isPending}
            className="shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform"
          >
            Cadastrar família
          </Botao>
        </div>
      </form>

      {duplicatas && (
        <ModalDuplicata
          candidatos={duplicatas}
          aoFechar={() => setDuplicatas(null)}
          aoUsarExistente={aoUsarExistente}
          aoCriarMesmoAssim={aoConfirmarCriarMesmoAssim}
        />
      )}
    </section>
  );
}
