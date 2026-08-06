import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  useFamilia,
  useProntuariosDaFamilia,
  useVisaoDeRede,
  useConcessoesDaFamilia,
  useTiposBeneficio,
} from "@/nucleo/api/hooks";
import { servicoProntuario } from "@/nucleo/api/prontuario";
import { servicoPessoas, servicoFamilias } from "@/nucleo/api/pessoas";
import type { FamilyUpdate, MemberOut, PersonOut, PersonUpdate } from "@/tipos/pessoas";
import {
  useRenda,
  useDomicilio,
  useVulnerabilidades,
  useDemandas,
  type VulnerabilidadeOut,
  type DemandaHabitacional,
} from "@/nucleo/api/servicosFase2";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Abas, type Aba } from "@/ui/Abas";
import { Chip } from "@/ui/Chip";
import { Modal } from "@/ui/Modal";
import { Botao } from "@/ui/Botao";
import { Select } from "@/ui/Select";
import { CampoCPF } from "@/ui/CampoCPF";
import { CampoNIS } from "@/ui/CampoNIS";
import { DocumentoSigiloso } from "@/ui/DocumentoSigiloso";
import { avisar } from "@/ui/Toast";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { apenasDigitos, validarCpf, validarNis } from "@/nucleo/validadoresBr";
import { formatarData } from "@/nucleo/datas";
import { rotuloDe } from "@/i18n/dominios";
import { FAIXA_RENDA, PARENTESCO } from "@/i18n/dominios";
import { FormularioPessoa } from "./FormularioPessoa";
import { esquemaPessoa, type CampoPessoa, type DadosPessoa } from "./esquemaPessoa";
import { CabecalhoFamilia } from "./CabecalhoFamilia";
import { TrilhaFamilia } from "./TrilhaFamilia";
import { montarTrilha, type ItemTimelineProntuario } from "./montarTrilha";
import { AdicionarMembroModal } from "./AdicionarMembroModal";
import { HistoricoBeneficios } from "@/paginas/beneficios/HistoricoBeneficios";
import { registrarTiposBeneficio } from "@/paginas/beneficios/rotulos";

/**
 * Ficha da família (§4.2) — a tela mais importante. Cabeçalho fixo, abas
 * (as sensíveis não renderizam sem permissão) e a Trilha como assinatura visual.
 */
export default function FichaFamilia() {
  const { familiaId } = useParams<{ familiaId: string }>();
  const navigate = useNavigate();
  const { tem } = usePermissoes();
  const { lotacoes } = useSessao();
  const [aba, setAba] = useState("trilha");
  const [adicionandoMembro, setAdicionandoMembro] = useState(false);
  const [editandoMembro, setEditandoMembro] = useState<MemberOut | null>(null);
  const [removendoMembro, setRemovendoMembro] = useState<MemberOut | null>(null);
  const [definindoResponsavel, setDefinindoResponsavel] = useState<MemberOut | null>(null);
  const [editandoFamilia, setEditandoFamilia] = useState(false);

  const familiaQ = useFamilia(familiaId);
  const podeLerProntuario = tem("prontuario.ler");

  if (familiaQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variante="cartao" />
        <Skeleton variante="trilha" linhas={4} />
      </div>
    );
  }

  if (familiaQ.isError) {
    return (
      <EstadoErro
        problema={(familiaQ.error as ErroApi).problema}
        aoTentarNovamente={() => familiaQ.refetch()}
      />
    );
  }
  if (!familiaQ.data) return null;

  const familia = familiaQ.data;

  const abas: Aba[] = [
    {
      id: "trilha",
      rotulo: "Trilha",
      conteudo: podeLerProntuario ? (
        <AbaTrilha familyId={familia.id} lotacoes={lotacoes} />
      ) : (
        <EstadoVazio
          titulo="Trilha indisponível"
          descricao="Seu perfil não tem acesso à leitura do prontuário desta família."
        />
      ),
    },
    {
      id: "membros",
      rotulo: "Composição familiar",
      conteudo: (
        <AbaMembros
          familia={familia}
          aoAdicionar={() => setAdicionandoMembro(true)}
          aoEditar={(m) => setEditandoMembro(m)}
          aoRemover={(m) => setRemovendoMembro(m)}
          aoDefinirResponsavel={(m) => setDefinindoResponsavel(m)}
        />
      ),
    },
  ];

  // Abas sensíveis: só entram na lista se o perfil tiver a capacidade (§4.2).
  if (podeLerProntuario) {
    abas.push({
      id: "atendimentos",
      rotulo: "Atendimentos",
      conteudo: (
        <EstadoVazio
          titulo="Registrar atendimento"
          descricao="Registre um novo atendimento desta família. O histórico cronológico dos atendimentos aparece na aba Trilha."
          acao={
            tem("atendimento.registrar")
              ? {
                  rotulo: "Registrar atendimento",
                  aoClicar: () => navigate(`/familias/${familia.id}/atendimento`),
                }
              : undefined
          }
        />
      ),
    });
  }
  if (tem("beneficio.conceder")) {
    abas.push({
      id: "beneficios",
      rotulo: "Benefícios",
      conteudo: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <a href={`/assistencia-social/beneficios?familia=${familia.id}`}>
              <Chip cor="beneficio">Conceder benefício →</Chip>
            </a>
          </div>
          <AbaBeneficios familyId={familia.id} />
        </div>
      ),
    });
  }
  if (tem("encaminhamento.criar")) {
    abas.push({
      id: "encaminhamentos",
      rotulo: "Encaminhamentos",
      conteudo: (
        <EstadoVazio
          titulo="Encaminhamentos"
          descricao="Os encaminhamentos desta família aparecem na aba Trilha. Envios, recebidos e devolutivas são geridos na área Encaminhamentos."
          acao={{ rotulo: "Abrir Encaminhamentos", aoClicar: () => navigate("/encaminhamentos") }}
        />
      ),
    });
  }

  // Fase 2 — novas abas
  abas.push({
    id: "renda",
    rotulo: "Renda",
    conteudo: <AbaRenda familyId={familia.id} />,
  });
  abas.push({
    id: "domicilio",
    rotulo: "Domicílio",
    conteudo: <AbaDomicilio familyId={familia.id} />,
  });
  abas.push({
    id: "vulnerabilidades",
    rotulo: "Vulnerabilidades",
    conteudo: <AbaVulnerabilidades familyId={familia.id} />,
  });
  if (tem("habitacao.gerir")) {
    abas.push({
      id: "habitacao",
      rotulo: "Habitação",
      conteudo: <AbaHabitacao familyId={familia.id} />,
    });
  }

  return (
    <section aria-labelledby="ficha-titulo">
      <CabecalhoFamilia
        familia={familia}
        aoRegistrarAtendimento={() => navigate(`/familias/${familia.id}/atendimento`)}
        aoEditar={() => setEditandoFamilia(true)}
      />
      <h2 id="ficha-titulo" className="apenas-leitor">
        Ficha da família nº {familia.codigo}
      </h2>
      <Abas abas={abas} ativa={aba} aoMudar={setAba} rotulo="Seções da ficha da família" />

      {tem("atendimento.registrar") && (
        <button
          type="button"
          onClick={() => navigate(`/familias/${familia.id}/atendimento`)}
          aria-label="Registrar atendimento"
          title="Registrar atendimento"
          className="nao-imprimir fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-2xl transition-transform hover:scale-110"
        >
          <span aria-hidden="true" className="material-symbols-outlined !text-[28px]">
            add
          </span>
        </button>
      )}

      <AdicionarMembroModal
        aberto={adicionandoMembro}
        aoFechar={() => setAdicionandoMembro(false)}
        familyId={familia.id}
      />

      {editandoMembro && (
        <EditarMembroModal
          membro={editandoMembro}
          aoFechar={() => setEditandoMembro(null)}
          familyId={familia.id}
        />
      )}

      {removendoMembro && (
        <ConfirmarRemocaoMembro
          membro={removendoMembro}
          aoFechar={() => setRemovendoMembro(null)}
          familyId={familia.id}
        />
      )}

      {definindoResponsavel && (
        <ConfirmarTrocaResponsavel
          membro={definindoResponsavel}
          responsavelAtual={familia.responsavel_nome}
          aoFechar={() => setDefinindoResponsavel(null)}
          familyId={familia.id}
        />
      )}

      {editandoFamilia && (
        <EditarFamiliaModal
          familia={familia}
          aoFechar={() => setEditandoFamilia(false)}
        />
      )}
    </section>
  );
}

function AbaTrilha({ familyId, lotacoes }: { familyId: string; lotacoes: string[] }) {
  const prontuariosQ = useProntuariosDaFamilia(familyId);
  const prontuarios = useMemo(() => prontuariosQ.data ?? [], [prontuariosQ.data]);
  const redeQ = useVisaoDeRede(familyId);

  // Uma família pode ter VÁRIOS prontuários (inclusive na mesma unidade, ex.:
  // PAIF e ABORDAGEM). Buscamos a timeline de todos e anotamos cada evento com
  // o case_file_id de origem — a revelação da evolução usa o prontuário certo.
  const timelinesQ = useQueries({
    queries: prontuarios.map((cf) => ({
      queryKey: ["timeline", cf.id],
      queryFn: () => servicoProntuario.timeline(cf.id),
      staleTime: 15_000,
    })),
  });

  const carregandoTimelines = timelinesQ.some((q) => q.isLoading);

  const itensTimeline = useMemo(() => {
    const itens: ItemTimelineProntuario[] = [];
    timelinesQ.forEach((q, i) => {
      const caseFileId = prontuarios[i]?.id;
      if (!q.data || !caseFileId) return;
      for (const t of q.data) itens.push({ ...t, case_file_id: caseFileId });
    });
    return itens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prontuarios, ...timelinesQ.map((q) => q.data)]);

  const meses = useMemo(
    () => montarTrilha(itensTimeline, redeQ.data ?? [], new Set(lotacoes)),
    [itensTimeline, redeQ.data, lotacoes],
  );

  if (prontuariosQ.isLoading || carregandoTimelines) {
    return <Skeleton variante="trilha" linhas={4} />;
  }
  if (prontuariosQ.isError) {
    return (
      <EstadoErro
        problema={(prontuariosQ.error as ErroApi).problema}
        aoTentarNovamente={() => prontuariosQ.refetch()}
      />
    );
  }
  if (meses.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum evento na trilha ainda"
        descricao="Os atendimentos, benefícios e encaminhamentos aparecerão aqui em ordem cronológica."
      />
    );
  }
  return <TrilhaFamilia meses={meses} />;
}

function AbaBeneficios({ familyId }: { familyId: string }) {
  const tiposQ = useTiposBeneficio();
  const concessoesQ = useConcessoesDaFamilia(familyId);
  useMemo(() => {
    if (tiposQ.data) registrarTiposBeneficio(tiposQ.data);
  }, [tiposQ.data]);
  return (
    <HistoricoBeneficios
      concessoes={concessoesQ.data ?? []}
      carregando={concessoesQ.isLoading}
    />
  );
}

function AbaMembros({
  familia,
  aoAdicionar,
  aoEditar,
  aoRemover,
  aoDefinirResponsavel,
}: {
  familia: import("@/tipos/pessoas").FamilyOut;
  aoAdicionar: () => void;
  aoEditar: (m: MemberOut) => void;
  aoRemover: (m: MemberOut) => void;
  aoDefinirResponsavel: (m: MemberOut) => void;
}) {
  const ativos = familia.membros.filter((m) => m.status === "ATIVO");
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={aoAdicionar}
          className="inline-flex items-center gap-1.5 rounded-input bg-primary text-white px-3 py-2 text-sm font-semibold hover:bg-primary-dark transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Adicionar membro
        </button>
      </div>
      {ativos.length === 0 ? (
        <p className="text-sm text-ink-soft text-center py-4">
          Nenhum membro cadastrado. Adicione o responsável e os demais membros.
        </p>
      ) : (
        <ul className="space-y-2">
          {ativos.map((m) => (
            <li
              key={m.membership_id}
              className="flex items-center justify-between gap-3 rounded-cartao border border-ink-soft/15 bg-surface p-3 group hover:bg-primary/5 hover:border-primary/20 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-ink">{m.nome_exibicao}</span>
                <div className="flex flex-wrap gap-2 text-xs text-ink-soft">
                  <span>{rotuloDe(PARENTESCO, m.parentesco)}</span>
                  <span>desde {formatarData(m.data_entrada)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {m.is_responsavel && <Chip cor="primario">Responsável</Chip>}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                  {!m.is_responsavel && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); aoDefinirResponsavel(m); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-outline hover:text-primary transition-colors"
                      title={`Definir ${m.nome_exibicao} como responsável`}
                    >
                      <span className="material-symbols-outlined !text-[18px]">star</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); aoEditar(m); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-outline hover:text-primary transition-colors"
                    title="Editar membro"
                  >
                    <span className="material-symbols-outlined !text-[18px]">edit</span>
                  </button>
                  {!m.is_responsavel && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); aoRemover(m); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-outline hover:text-red-500 transition-colors"
                      title="Remover membro"
                    >
                      <span className="material-symbols-outlined !text-[18px]">person_remove</span>
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── FASE 2 — Novas abas ──────────────────────────

function AbaRenda({ familyId }: { familyId: string }) {
  const { data, isLoading, isError } = useRenda(familyId);
  if (isLoading) return <Skeleton variante="texto" />;
  if (isError || !data) return <EstadoVazio titulo="Renda não disponível" descricao="Cadastre as rendas dos membros da família." />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded border p-3"><div className="text-xs text-gray-500">Total Membros</div><div className="text-lg font-bold">{data.total_membros}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-gray-500">Renda Total</div><div className="text-lg font-bold">R$ {data.renda_familiar_total.toFixed(2)}</div></div>
        <div className="rounded border p-3 bg-blue-50 border-blue-300"><div className="text-xs text-gray-500">Renda Per Capita</div><div className="text-lg font-bold text-blue-700">R$ {data.renda_per_capita.toFixed(2)}</div></div>
      </div>
      <div className="text-sm">
        <span className="font-medium">Faixa:</span> {data.faixa_renda} |
        <span className="font-medium ml-2">Despesas:</span> R$ {data.total_despesas.toFixed(2)}
      </div>
    </div>
  );
}

function AbaDomicilio({ familyId }: { familyId: string }) {
  const { data, isLoading } = useDomicilio(familyId);
  if (isLoading) return <Skeleton variante="texto" />;
  if (!data) return <EstadoVazio titulo="Domicílio não cadastrado" descricao="Preencha os dados de infraestrutura do domicílio." />;
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div><span className="text-gray-500">Construção:</span> {data.tipo_construcao || "-"}</div>
      <div><span className="text-gray-500">Água:</span> {data.abastecimento_agua || "-"}</div>
      <div><span className="text-gray-500">Luz:</span> {data.iluminacao_eletrica ? "Sim" : "Não"}</div>
      <div><span className="text-gray-500">Lixo:</span> {data.destino_lixo || "-"}</div>
      <div><span className="text-gray-500">Esgoto:</span> {data.escoamento_sanitario || "-"}</div>
      <div><span className="text-gray-500">Cômodos:</span> {data.total_comodos ?? "-"}</div>
      <div><span className="text-gray-500">Dormitórios:</span> {data.total_dormitorios ?? "-"}</div>
      <div><span className="text-gray-500">Pessoas:</span> {data.total_pessoas ?? "-"}</div>
    </div>
  );
}

function AbaVulnerabilidades({ familyId }: { familyId: string }) {
  const { data, isLoading } = useVulnerabilidades(familyId);
  if (isLoading) return <Skeleton variante="texto" />;
  if (!data || data.length === 0) return <EstadoVazio titulo="Sem vulnerabilidades registradas" descricao="Registre situações de vulnerabilidade identificadas." />;
  return (
    <div className="space-y-2">
      {data.map((v: VulnerabilidadeOut) => (
        <div key={v.id} className="border rounded p-2 text-sm">
          <div className="font-medium">{v.tipo}</div>
          <div className="text-xs text-gray-500">Início: {new Date(v.data_inicio).toLocaleDateString("pt-BR")}{v.data_saida ? ` | Saída: ${new Date(v.data_saida).toLocaleDateString("pt-BR")}` : " | Em andamento"}</div>
          {v.observacoes && <div className="text-xs mt-1">{v.observacoes}</div>}
        </div>
      ))}
    </div>
  );
}

function AbaHabitacao({ familyId }: { familyId: string }) {
  const { data, isLoading } = useDemandas(familyId);
  if (isLoading) return <Skeleton variante="texto" />;
  if (!data || data.length === 0) return <EstadoVazio titulo="Sem demandas habitacionais" descricao="Registre demandas de habitação para esta família." />;
  return (
    <div className="space-y-2">
      {data.map((d: DemandaHabitacional) => (
        <div key={d.id} className="border rounded p-2 text-sm flex justify-between">
          <div>
            <div className="font-medium">{d.tipo_demanda}</div>
            <div className="text-xs text-gray-500">{d.programa?.nome || "Sem programa"} | {d.status}</div>
          </div>
          {d.pontuacao != null && <div className="font-bold text-blue-600">{d.pontuacao} pts</div>}
        </div>
      ))}
    </div>
  );
}

type CamposFamilia = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  ponto_referencia: string;
  telefone_contato: string;
  faixa_renda: string;
  despesa_aluguel: string;
  despesa_transporte: string;
  despesa_alimentacao: string;
  despesa_medicamentos: string;
  despesa_outros: string;
  beneficiaria_pbf: boolean;
  possui_bpc: boolean;
  inseguranca_alimentar: boolean;
  no_cadunico: boolean;
};

const DESPESAS = [
  "despesa_aluguel",
  "despesa_transporte",
  "despesa_alimentacao",
  "despesa_medicamentos",
  "despesa_outros",
] as const;

function paraFormularioFamilia(f: import("@/tipos/pessoas").FamilyOut): CamposFamilia {
  return {
    logradouro: f.logradouro ?? "",
    numero: f.numero ?? "",
    complemento: f.complemento ?? "",
    bairro: f.bairro ?? "",
    municipio: f.municipio ?? "",
    uf: f.uf ?? "",
    cep: f.cep ?? "",
    ponto_referencia: f.ponto_referencia ?? "",
    telefone_contato: f.telefone_contato ?? "",
    faixa_renda: f.faixa_renda ?? "",
    despesa_aluguel: f.despesa_aluguel?.toString() ?? "",
    despesa_transporte: f.despesa_transporte?.toString() ?? "",
    despesa_alimentacao: f.despesa_alimentacao?.toString() ?? "",
    despesa_medicamentos: f.despesa_medicamentos?.toString() ?? "",
    despesa_outros: f.despesa_outros?.toString() ?? "",
    beneficiaria_pbf: f.beneficiaria_pbf,
    possui_bpc: f.possui_bpc,
    inseguranca_alimentar: f.inseguranca_alimentar,
    no_cadunico: f.no_cadunico,
  };
}

/** Campo de texto do formulário de família. Precisa viver fora do componente:
 *  declarado no corpo, viraria um tipo novo a cada render e o React remontaria
 *  o input a cada tecla, fazendo o campo perder o foco. */
function CampoFamilia({
  label,
  campo,
  valor,
  aoMudar,
  tipo = "text",
  placeholder,
}: {
  label: string;
  campo: keyof CamposFamilia;
  valor: string;
  aoMudar: (campo: keyof CamposFamilia, valor: string) => void;
  tipo?: string;
  placeholder?: string;
}) {
  const id = `familia-${campo}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-bold text-ink-soft uppercase tracking-wide mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(campo, e.target.value)}
        placeholder={placeholder}
        className="block w-full px-4 py-2.5 bg-surface-container-low border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-sm outline-none"
      />
    </div>
  );
}

function ToggleFamilia({
  label,
  campo,
  valor,
  aoMudar,
}: {
  label: string;
  campo: keyof CamposFamilia;
  valor: boolean;
  aoMudar: (campo: keyof CamposFamilia, valor: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between px-4 py-3 bg-surface-container-low rounded-xl cursor-pointer">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="relative">
        <input
          type="checkbox"
          checked={valor}
          onChange={(e) => aoMudar(campo, e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-outline/30 rounded-full peer-checked:bg-primary transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-5 transition-transform" />
      </div>
    </label>
  );
}

const FAIXAS = [
  { valor: "", rotulo: "Não informado" },
  ...FAIXA_RENDA.filter((f) => f.valor !== "NAO_INFORMADO"),
];

function EditarFamiliaModal({
  familia,
  aoFechar,
}: {
  familia: import("@/tipos/pessoas").FamilyOut;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const iniciais = useMemo(() => paraFormularioFamilia(familia), [familia]);
  const [campos, setCampos] = useState<CamposFamilia>(iniciais);

  const atualizar = useMutation({
    mutationFn: (corpo: FamilyUpdate) => servicoFamilias.atualizar(familia.id, corpo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familia.id] });
      void queryClient.invalidateQueries({ queryKey: ["familias"] });
      avisar.sucesso("Família atualizada.");
      aoFechar();
    },
  });

  const setCampo = useCallback((campo: keyof CamposFamilia, valor: string | boolean) => {
    setCampos((p) => ({ ...p, [campo]: valor }));
  }, []);

  function salvar() {
    // Só o que mudou entra no PATCH; campo esvaziado vira null explícito, para
    // que apagar um telefone/complemento de fato apague no backend.
    const corpo: Record<string, unknown> = {};
    for (const chave of Object.keys(campos) as (keyof CamposFamilia)[]) {
      const atual = campos[chave];
      if (atual === iniciais[chave]) continue;
      if (typeof atual === "boolean") {
        corpo[chave] = atual;
      } else if (atual.trim() === "") {
        corpo[chave] = null;
      } else if ((DESPESAS as readonly string[]).includes(chave)) {
        const n = parseFloat(atual);
        corpo[chave] = Number.isNaN(n) ? null : n;
      } else {
        corpo[chave] = atual;
      }
    }
    if (Object.keys(corpo).length === 0) {
      aoFechar();
      return;
    }
    atualizar.mutate(corpo as FamilyUpdate);
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Editar família nº ${familia.codigo}`}
      tamanho="lg"
      rodape={
        <>
          <Botao variante="secundario" type="button" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            type="button"
            carregando={atualizar.isPending}
            onClick={salvar}
          >
            Salvar alterações
          </Botao>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        <fieldset>
          <legend className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-3">
            Endereço
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <CampoFamilia label="Logradouro" campo="logradouro" valor={campos.logradouro} aoMudar={setCampo} placeholder="Rua, Avenida..." />
            </div>
            <CampoFamilia label="Número" campo="numero" valor={campos.numero} aoMudar={setCampo} placeholder="123" />
            <CampoFamilia label="Complemento" campo="complemento" valor={campos.complemento} aoMudar={setCampo} placeholder="Apto, Bloco..." />
            <CampoFamilia label="Bairro" campo="bairro" valor={campos.bairro} aoMudar={setCampo} />
            <CampoFamilia label="Município" campo="municipio" valor={campos.municipio} aoMudar={setCampo} />
            <CampoFamilia label="UF" campo="uf" valor={campos.uf} aoMudar={setCampo} placeholder="SP" />
            <CampoFamilia label="CEP" campo="cep" valor={campos.cep} aoMudar={setCampo} placeholder="00000-000" />
            <div className="col-span-2">
              <CampoFamilia label="Ponto de referência" campo="ponto_referencia" valor={campos.ponto_referencia} aoMudar={setCampo} placeholder="Próximo a..." />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-3">
            Contato
          </legend>
          <CampoFamilia label="Telefone" campo="telefone_contato" valor={campos.telefone_contato} aoMudar={setCampo} placeholder="(00) 00000-0000" />
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-3">
            Situação socioeconômica
          </legend>
          <div>
            <label
              htmlFor="familia-faixa-renda"
              className="block text-xs font-bold text-ink-soft uppercase tracking-wide mb-1.5"
            >
              Faixa de renda
            </label>
            <select
              id="familia-faixa-renda"
              value={campos.faixa_renda}
              onChange={(e) => setCampo("faixa_renda", e.target.value)}
              className="block w-full px-4 py-2.5 bg-surface-container-low border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-sm outline-none"
            >
              {FAIXAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-3">
            Despesas mensais (R$)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <CampoFamilia label="Aluguel" campo="despesa_aluguel" valor={campos.despesa_aluguel} aoMudar={setCampo} tipo="number" placeholder="0.00" />
            <CampoFamilia label="Transporte" campo="despesa_transporte" valor={campos.despesa_transporte} aoMudar={setCampo} tipo="number" placeholder="0.00" />
            <CampoFamilia label="Alimentação" campo="despesa_alimentacao" valor={campos.despesa_alimentacao} aoMudar={setCampo} tipo="number" placeholder="0.00" />
            <CampoFamilia label="Medicamentos" campo="despesa_medicamentos" valor={campos.despesa_medicamentos} aoMudar={setCampo} tipo="number" placeholder="0.00" />
            <div className="col-span-2">
              <CampoFamilia label="Outros" campo="despesa_outros" valor={campos.despesa_outros} aoMudar={setCampo} tipo="number" placeholder="0.00" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-3">
            Programas e situações
          </legend>
          <div className="space-y-2">
            <ToggleFamilia label="Beneficiária do Bolsa Família (PBF)" campo="beneficiaria_pbf" valor={campos.beneficiaria_pbf} aoMudar={setCampo} />
            <ToggleFamilia label="Possui BPC na família" campo="possui_bpc" valor={campos.possui_bpc} aoMudar={setCampo} />
            <ToggleFamilia label="Insegurança alimentar" campo="inseguranca_alimentar" valor={campos.inseguranca_alimentar} aoMudar={setCampo} />
            <ToggleFamilia label="Inscrita no CadÚnico" campo="no_cadunico" valor={campos.no_cadunico} aoMudar={setCampo} />
          </div>
        </fieldset>

        {atualizar.isError && (
          <p role="alert" className="text-xs font-semibold text-danger">
            {atualizar.error instanceof ErroApi
              ? atualizar.error.message
              : "Erro ao salvar."}
          </p>
        )}
      </div>
    </Modal>
  );
}


// ─── Modais de membro ─────────────────────────────

/** Campos da pessoa que o formulário registra (CPF/NIS são controlados à parte). */
const CAMPOS_PESSOA: CampoPessoa[] = [
  "nome_civil",
  "nome_social",
  "data_nascimento",
  "sexo",
  "raca_cor",
  "estado_civil",
  "escolaridade",
  "ocupacao",
  "frequenta_escola",
  "situacao_mercado_trabalho",
  "gestante",
  "amamentando",
  "renda_mensal",
  "tipo_deficiencia",
];

function paraFormulario(p: PersonOut): DadosPessoa {
  return {
    nome_civil: p.nome_civil,
    nome_social: p.nome_social ?? "",
    data_nascimento: p.data_nascimento ?? "",
    sexo: p.sexo ?? "",
    raca_cor: p.raca_cor ?? "",
    estado_civil: p.estado_civil ?? "",
    escolaridade: p.escolaridade ?? "",
    ocupacao: p.ocupacao ?? "",
    frequenta_escola: p.frequenta_escola ?? false,
    situacao_mercado_trabalho: p.situacao_mercado_trabalho ?? "",
    gestante: p.gestante ?? false,
    amamentando: p.amamentando ?? false,
    renda_mensal: p.renda_mensal ?? undefined,
    tipo_deficiencia: p.tipo_deficiencia ?? "",
  };
}

/** Só os campos tocados viram PATCH; "" vira null explícito para poder limpar. */
function montarPatchPessoa(
  dados: DadosPessoa,
  sujos: Partial<Record<CampoPessoa, unknown>>,
): PersonUpdate {
  const corpo: Record<string, unknown> = {};
  for (const campo of CAMPOS_PESSOA) {
    if (!sujos[campo]) continue;
    const v = dados[campo];
    corpo[campo] = v === "" || v === undefined ? null : v;
  }
  return corpo as PersonUpdate;
}

function EditarMembroModal({
  membro,
  aoFechar,
  familyId,
}: {
  membro: MemberOut;
  aoFechar: () => void;
  familyId: string;
}) {
  const pessoaQ = useQuery({
    queryKey: ["pessoa", membro.person_id],
    queryFn: () => servicoPessoas.obter(membro.person_id),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Editar ${membro.nome_exibicao}`}
      descricao="Dados cadastrais da pessoa e vínculo com a família."
      tamanho="lg"
    >
      {pessoaQ.isLoading && <Skeleton variante="texto" />}
      {pessoaQ.isError && (
        <EstadoErro
          problema={(pessoaQ.error as ErroApi).problema}
          aoTentarNovamente={() => pessoaQ.refetch()}
        />
      )}
      {pessoaQ.data && (
        <FormularioEdicaoMembro
          pessoa={pessoaQ.data}
          membro={membro}
          familyId={familyId}
          aoFechar={aoFechar}
        />
      )}
    </Modal>
  );
}

/** Separado para montar só depois que a pessoa chegou — assim o React Hook Form
 *  inicializa já com os valores atuais em vez de campos vazios. */
function FormularioEdicaoMembro({
  pessoa,
  membro,
  familyId,
  aoFechar,
}: {
  pessoa: PersonOut;
  membro: MemberOut;
  familyId: string;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [cpf, setCpf] = useState("");
  const [nis, setNis] = useState("");
  const [editandoCpf, setEditandoCpf] = useState(false);
  const [editandoNis, setEditandoNis] = useState(false);
  const [parentesco, setParentesco] = useState(membro.parentesco ?? "");

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<DadosPessoa>({
    resolver: zodResolver(esquemaPessoa),
    defaultValues: paraFormulario(pessoa),
  });

  const salvar = useMutation({
    mutationFn: async (dados: DadosPessoa) => {
      const corpo = montarPatchPessoa(dados, dirtyFields);
      if (editandoCpf) corpo.cpf = apenasDigitos(cpf) || null;
      if (editandoNis) corpo.nis = apenasDigitos(nis) || null;
      if (Object.keys(corpo).length > 0) {
        await servicoPessoas.atualizar(pessoa.id, corpo);
      }
      if ((membro.parentesco ?? "") !== parentesco) {
        await servicoFamilias.atualizarMembro(familyId, membro.person_id, {
          parentesco: parentesco || null,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familyId] });
      void queryClient.invalidateQueries({ queryKey: ["pessoa", pessoa.id] });
      avisar.sucesso("Dados atualizados.");
      aoFechar();
    },
    onError: (e) => {
      avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível salvar.");
    },
  });

  const cpfInvalido = editandoCpf && cpf.length > 0 && !validarCpf(cpf);
  const nisInvalido = editandoNis && nis.length > 0 && !validarNis(nis);

  return (
    <form onSubmit={handleSubmit((d) => salvar.mutate(d))} noValidate>
      <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
        <FormularioPessoa
          registrar={(campo, opcoes) => register(campo, opcoes)}
          erros={errors}
          identificacao={
            <>
              <DocumentoSigiloso
                label="CPF"
                mascarado={pessoa.cpf_mascarado}
                editando={editandoCpf}
                aoAlternar={(v) => {
                  setEditandoCpf(v);
                  if (!v) setCpf("");
                }}
              >
                <CampoCPF label="Novo CPF" valor={cpf} aoMudar={setCpf} />
              </DocumentoSigiloso>
              <DocumentoSigiloso
                label="NIS"
                mascarado={pessoa.nis_mascarado}
                editando={editandoNis}
                aoAlternar={(v) => {
                  setEditandoNis(v);
                  if (!v) setNis("");
                }}
              >
                <CampoNIS label="Novo NIS" valor={nis} aoMudar={setNis} />
              </DocumentoSigiloso>
            </>
          }
        />

        <fieldset className="border-t border-ink-soft/15 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Vínculo com a família
          </legend>
          <div className="mt-3">
            <Select
              label="Parentesco"
              opcoes={
                membro.is_responsavel
                  ? PARENTESCO
                  : [
                      { valor: "", rotulo: "Não informado" },
                      ...PARENTESCO.filter((p) => p.valor !== "RESPONSAVEL"),
                    ]
              }
              value={parentesco}
              onChange={(e) => setParentesco(e.target.value)}
              disabled={membro.is_responsavel}
              className="p-3"
            />
            {membro.is_responsavel && (
              <p className="mt-1 text-xs text-ink-soft">
                Para mudar, defina outro membro como responsável na composição
                familiar.
              </p>
            )}
          </div>
        </fieldset>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-ink-soft/15 pt-4">
        <Botao variante="secundario" type="button" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao
          variante="primario"
          type="submit"
          carregando={salvar.isPending}
          disabled={cpfInvalido || nisInvalido}
        >
          Salvar
        </Botao>
      </div>
    </form>
  );
}

function ConfirmarRemocaoMembro({
  membro,
  aoFechar,
  familyId,
}: {
  membro: MemberOut;
  aoFechar: () => void;
  familyId: string;
}) {
  const queryClient = useQueryClient();

  const remover = useMutation({
    mutationFn: () => servicoFamilias.removerMembro(familyId, membro.person_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familyId] });
      void queryClient.invalidateQueries({ queryKey: ["familias"] });
      aoFechar();
    },
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Remover membro"
      tamanho="sm"
      rodape={
        <>
          <Botao variante="secundario" type="button" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            type="button"
            carregando={remover.isPending}
            onClick={() => remover.mutate()}
          >
            Remover
          </Botao>
        </>
      }
    >
      <p className="text-sm text-ink-soft">
        Tem certeza que deseja remover{" "}
        <strong className="text-ink">{membro.nome_exibicao}</strong> da família?
        Esta ação não exclui a pessoa do sistema.
      </p>
      {remover.isError && (
        <p role="alert" className="mt-3 text-xs font-semibold text-danger">
          {remover.error instanceof ErroApi ? remover.error.message : "Erro ao remover."}
        </p>
      )}
    </Modal>
  );
}

function ConfirmarTrocaResponsavel({
  membro,
  responsavelAtual,
  aoFechar,
  familyId,
}: {
  membro: MemberOut;
  responsavelAtual: string | null;
  aoFechar: () => void;
  familyId: string;
}) {
  const queryClient = useQueryClient();

  const definir = useMutation({
    mutationFn: () => servicoFamilias.definirResponsavel(familyId, membro.person_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familyId] });
      void queryClient.invalidateQueries({ queryKey: ["familias"] });
      avisar.sucesso(`${membro.nome_exibicao} agora é o responsável familiar.`);
      aoFechar();
    },
    onError: (e) => {
      avisar.erro(
        e instanceof ErroApi ? e.message : "Não foi possível trocar o responsável.",
      );
    },
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Definir responsável familiar"
      tamanho="sm"
      rodape={
        <>
          <Botao variante="secundario" type="button" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            type="button"
            carregando={definir.isPending}
            onClick={() => definir.mutate()}
          >
            Definir como responsável
          </Botao>
        </>
      }
    >
      <p className="text-sm text-ink-soft">
        <strong className="text-ink">{membro.nome_exibicao}</strong> passa a ser o
        responsável familiar
        {responsavelAtual ? (
          <>
            {" "}
            no lugar de <strong className="text-ink">{responsavelAtual}</strong>
          </>
        ) : null}
        . O NIS da família passa a ser o desta pessoa.
      </p>
      {responsavelAtual && (
        <p className="mt-3 text-xs text-ink-soft">
          O parentesco é declarado em relação ao responsável, então o de{" "}
          {responsavelAtual} ficará em branco — informe o novo parentesco pela
          edição do membro.
        </p>
      )}
    </Modal>
  );
}
