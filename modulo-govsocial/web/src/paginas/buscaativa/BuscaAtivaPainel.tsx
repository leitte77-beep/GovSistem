import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  MapPin,
  Users,
  HandHeart,
  Send,
  Plus,
  X,
  Map,
} from "lucide-react";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Botao } from "@/ui/Botao";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { Chip } from "@/ui/Chip";
import { avisar } from "@/ui/Toast";
import { CartaoIndicador } from "@/paginas/vigilancia/CartaoIndicador";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { servicoBuscaAtiva } from "@/nucleo/api/buscaAtiva";
import { formatarData } from "@/nucleo/datas";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type {
  BuscaAtivaOut,
  BuscaAtivaResumo,
  PessoaAbordadaCreate,
} from "@/tipos/buscaAtiva";

function mesCorrente(): { inicio: string; fim: string } {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: fmt(inicio), fim: fmt(fim) };
}

type FiltrosBusca = {
  data_inicio: string;
  data_fim: string;
  bairro: string;
};

type PessoaForm = PessoaAbordadaCreate & { _id: string };



export default function BuscaAtivaPainel() {
  const podeVer = usePermissao("vigilancia.ver");

  const { inicio, fim } = mesCorrente();
  const [filtros, setFiltros] = useState<FiltrosBusca>({
    data_inicio: inicio,
    data_fim: fim,
    bairro: "",
  });
  const [modalAberto, setModalAberto] = useState(false);
  const [mapaAberto, setMapaAberto] = useState(false);

  const queryClient = useQueryClient();

  const filterKey = `${filtros.data_inicio}|${filtros.data_fim}|${filtros.bairro}`;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["busca-ativa", filterKey],
    queryFn: () => servicoBuscaAtiva.listar(filtros),
  });

  const dashKey = `${inicio}|${fim}`;
  const dashboardQ = useQuery({
    queryKey: ["busca-ativa-dashboard", dashKey],
    queryFn: () =>
      servicoBuscaAtiva.dashboard({ data_inicio: inicio, data_fim: fim }),
  });

  const criarMutation = useMutation({
    mutationFn: (body: Parameters<typeof servicoBuscaAtiva.criar>[0]) =>
      servicoBuscaAtiva.criar(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["busca-ativa"] });
      queryClient.invalidateQueries({ queryKey: ["busca-ativa-dashboard"] });
      setModalAberto(false);
      avisar.sucesso("Ação de busca ativa registrada com sucesso");
    },
    onError: (e: unknown) => {
      avisar.erro((e as Error).message ?? "Erro ao registrar ação");
    },
  });

  const excluirMutation = useMutation({
    mutationFn: (id: string) => servicoBuscaAtiva.excluir(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["busca-ativa"] });
      queryClient.invalidateQueries({ queryKey: ["busca-ativa-dashboard"] });
      avisar.sucesso("Ação removida");
    },
    onError: (e: unknown) => {
      avisar.erro((e as Error).message ?? "Erro ao remover ação");
    },
  });

  if (!podeVer) return <EstadoSemPermissao />;

  const buscaAtivas = data ?? [];

  return (
    <section aria-labelledby="titulo-busca-ativa" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="titulo-busca-ativa" className="text-xl">
            Busca Ativa — População de Rua
          </h1>
          <p className="text-sm text-ink-soft">
            Registro de ações de busca ativa e abordagem social.
          </p>
        </div>
        <div className="flex gap-2">
          <Botao
            variante="secundario"
            iconeInicio={<Map aria-hidden className="h-4 w-4" />}
            onClick={() => setMapaAberto(true)}
          >
            Mapa
          </Botao>
          <Botao
            variante="primario"
            iconeInicio={<Plus aria-hidden className="h-4 w-4" />}
            onClick={() => setModalAberto(true)}
          >
            Registrar ação
          </Botao>
        </div>
      </div>

      <DashboardCards data={dashboardQ.data} isLoading={dashboardQ.isLoading} />

      <FiltrosBar
        filtros={filtros}
        onChange={(f) => setFiltros((prev) => ({ ...prev, ...f }))}
      />

      {isLoading ? (
        <Skeleton variante="tabela" linhas={5} />
      ) : isError ? (
        <EstadoErro
          problema={(error as ErroApi).problema}
          aoTentarNovamente={() => refetch()}
        />
      ) : (
        <TabelaBuscaAtiva
          dados={buscaAtivas}
          onExcluir={(id) => {
            if (confirm("Remover esta ação?")) excluirMutation.mutate(id);
          }}
        />
      )}

      <ModalRegistrar
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        aoSalvar={(body) => criarMutation.mutate(body)}
        salvando={criarMutation.isPending}
      />

      <ModalMapa
        aberto={mapaAberto}
        aoFechar={() => setMapaAberto(false)}
        pontos={buscaAtivas}
      />
    </section>
  );
}

function DashboardCards({
  data,
  isLoading,
}: {
  data?: BuscaAtivaResumo;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton variante="tabela" linhas={1} />;
  const d = data ?? { total_abordagens: 0, total_aceitaram_acolhimento: 0, total_encaminhados: 0, total_pessoas_abordadas: 0 };
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CartaoIndicador
        rotulo="Ações no mês"
        valor={d.total_abordagens}
        icone={<Search aria-hidden className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Pessoas abordadas"
        valor={d.total_pessoas_abordadas}
        icone={<Users aria-hidden className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Aceitaram acolhimento"
        valor={d.total_aceitaram_acolhimento}
        icone={<HandHeart aria-hidden className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Encaminhamentos"
        valor={d.total_encaminhados}
        icone={<Send aria-hidden className="h-5 w-5" />}
      />
    </div>
  );
}

function FiltrosBar({
  filtros,
  onChange,
}: {
  filtros: FiltrosBusca;
  onChange: (f: Partial<FiltrosBusca>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-cartao border border-ink-soft/15 bg-surface p-4">
      <Input
        label="Data início"
        type="date"
        value={filtros.data_inicio}
        onChange={(e) => onChange({ data_inicio: e.target.value })}
      />
      <Input
        label="Data fim"
        type="date"
        value={filtros.data_fim}
        onChange={(e) => onChange({ data_fim: e.target.value })}
      />
      <Input
        label="Bairro"
        placeholder="Filtrar por bairro..."
        value={filtros.bairro}
        onChange={(e) => onChange({ bairro: e.target.value })}
      />
    </div>
  );
}

function TabelaBuscaAtiva({
  dados,
  onExcluir,
}: {
  dados: BuscaAtivaOut[];
  onExcluir: (id: string) => void;
}) {
  if (dados.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma ação registrada"
        descricao="Nenhuma ação de busca ativa encontrada para os filtros selecionados."
        icone={<Search className="h-8 w-8" />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-soft/15 text-xs font-semibold uppercase text-ink-soft">
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Local</th>
            <th className="px-4 py-3">Bairro</th>
            <th className="px-4 py-3">Abordadas</th>
            <th className="px-4 py-3">Aceitaram</th>
            <th className="px-4 py-3">Encaminhadas</th>
            <th className="px-4 py-3">Equipe</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((ba) => (
            <tr
              key={ba.id}
              className="border-b border-ink-soft/10 hover:bg-surface-container-low"
            >
              <td className="px-4 py-3 whitespace-nowrap">
                {formatarData(ba.data_acao)}
              </td>
              <td className="px-4 py-3 max-w-[180px] truncate">
                {ba.local_logradouro ?? ba.local_referencia ?? "-"}
              </td>
              <td className="px-4 py-3">{ba.local_bairro ?? "-"}</td>
              <td className="px-4 py-3">
                <Chip cor="primario">{ba.pessoas_abordadas}</Chip>
              </td>
              <td className="px-4 py-3">{ba.pessoas_aceitaram_acolhimento}</td>
              <td className="px-4 py-3">{ba.pessoas_encaminhadas}</td>
              <td className="px-4 py-3 max-w-[150px] truncate">
                {ba.equipe_nomes?.join(", ") ?? "-"}
              </td>
              <td className="px-4 py-3 text-right">
                <Botao
                  variante="texto"
                  tamanho="sm"
                  onClick={() => onExcluir(ba.id)}
                >
                  Excluir
                </Botao>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModalRegistrar({
  aberto,
  aoFechar,
  aoSalvar,
  salvando,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (body: Parameters<typeof servicoBuscaAtiva.criar>[0]) => void;
  salvando: boolean;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataAcao, setDataAcao] = useState(hoje);
  const [localLogradouro, setLocalLogradouro] = useState("");
  const [localBairro, setLocalBairro] = useState("");
  const [localReferencia, setLocalReferencia] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [equipeInput, setEquipeInput] = useState("");
  const [equipeNomes, setEquipeNomes] = useState<string[]>([]);
  const [pessoas, setPessoas] = useState<PessoaForm[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [buscandoGeoloc, setBuscandoGeoloc] = useState(false);

  const pessoaIdCounter = useRef(0);
  const novaPessoa = useCallback((): PessoaForm => {
    pessoaIdCounter.current++;
    return {
      _id: String(pessoaIdCounter.current),
      nome: "",
      nome_social: "",
      idade_estimada: null,
      sexo: "",
      possui_documento: false,
      tempo_rua_estimado: "",
      aceitou_acolhimento: false,
      encaminhado_para: "",
      observacoes: "",
    };
  }, []);

  const [cep, setCep] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

  const adicionarEquipe = () => {
    const nome = equipeInput.trim();
    if (nome && !equipeNomes.includes(nome)) {
      setEquipeNomes([...equipeNomes, nome]);
    }
    setEquipeInput("");
  };

  const buscarCep = useCallback(async () => {
    const c = cep.replace(/\D/g, "");
    if (c.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        setLocalLogradouro(data.logradouro || "");
        setLocalBairro(data.bairro || "");
      }
    } catch {
      // silently ignore
    } finally {
      setBuscandoCep(false);
    }
  }, [cep]);

  useEffect(() => {
    const c = cep.replace(/\D/g, "");
    if (c.length === 8) buscarCep();
  }, [cep, buscarCep]);

  const obterLocalizacao = () => {
    if (!navigator.geolocation) {
      avisar.erro("Geolocalização não suportada pelo navegador");
      return;
    }
    setBuscandoGeoloc(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setBuscandoGeoloc(false);
      },
      () => {
        avisar.erro("Não foi possível obter a localização");
        setBuscandoGeoloc(false);
      },
    );
  };

  const handleSubmit = () => {
    const totalAbordadas = pessoas.length;
    const totalAceitaram = pessoas.filter((p) => p.aceitou_acolhimento).length;
    const totalEncaminhadas = pessoas.filter(
      (p) => Boolean(p.encaminhado_para?.trim()),
    ).length;

    const body = {
      data_acao: dataAcao,
      local_logradouro: localLogradouro || null,
      local_bairro: localBairro || null,
      local_referencia: localReferencia || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      equipe_nomes: equipeNomes.length > 0 ? equipeNomes : null,
      pessoas_abordadas: totalAbordadas,
      pessoas_aceitaram_acolhimento: totalAceitaram,
      pessoas_encaminhadas: totalEncaminhadas,
      observacoes: observacoes || null,
      pessoas: pessoas.length > 0
        ? pessoas.map(({ _id, ...p }) => p)
        : null,
    };
    aoSalvar(body);
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Registrar ação de busca ativa"
      tamanho="lg"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={handleSubmit} disabled={salvando}>
            {salvando ? "Salvando…" : "Registrar"}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Data da ação *"
            type="date"
            value={dataAcao}
            onChange={(e) => setDataAcao(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="cep-input" className="text-xs font-semibold text-ink-soft">CEP</label>
            <div className="flex gap-2">
              <Input
                id="cep-input"
                label="CEP"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
              />
              <Botao
                variante="secundario"
                tamanho="sm"
                onClick={buscarCep}
                disabled={buscandoCep}
              >
                {buscandoCep ? "…" : "Buscar"}
              </Botao>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Logradouro"
            placeholder="Rua, avenida..."
            value={localLogradouro}
            onChange={(e) => setLocalLogradouro(e.target.value)}
          />
          <Input
            label="Bairro"
            placeholder="Bairro"
            value={localBairro}
            onChange={(e) => setLocalBairro(e.target.value)}
          />
        </div>

        <Input
          label="Referência"
          placeholder="Ponto de referência..."
          value={localReferencia}
          onChange={(e) => setLocalReferencia(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Latitude"
            placeholder="-23.55..."
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="longitude-input" className="text-xs font-semibold text-ink-soft">Longitude</label>
            <div className="flex gap-2">
              <Input
                id="longitude-input"
                label="Longitude"
                placeholder="-46.63..."
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
              <Botao
                variante="secundario"
                tamanho="sm"
                onClick={obterLocalizacao}
                disabled={buscandoGeoloc}
              >
                <MapPin aria-hidden className="h-4 w-4" />
              </Botao>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="equipe-input" className="text-xs font-semibold text-ink-soft">Membros da equipe</label>
          <div className="flex gap-2">
            <Input
              id="equipe-input"
              label="Membro da equipe"
              placeholder="Nome do profissional"
              value={equipeInput}
              onChange={(e) => setEquipeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); adicionarEquipe(); }
              }}
            />
            <Botao variante="secundario" tamanho="sm" onClick={adicionarEquipe}>
              Adicionar
            </Botao>
          </div>
          {equipeNomes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {equipeNomes.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary"
                >
                  {n}
                  <button
                    type="button"
                    className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                    onClick={() =>
                      setEquipeNomes(equipeNomes.filter((x) => x !== n))
                    }
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pessoas abordadas */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-ink-soft">
              Pessoas abordadas ({pessoas.length})
            </label>
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => setPessoas([...pessoas, novaPessoa()])}
            >
              + Pessoa
            </Botao>
          </div>
          {pessoas.map((p, idx) => (
            <div
              key={p._id}
              className="rounded-cartao border border-ink-soft/15 bg-surface-container-low p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-soft">
                  Pessoa {idx + 1}
                </span>
                <button
                  type="button"
                  className="rounded p-0.5 text-ink-soft hover:text-perigo"
                  onClick={() =>
                    setPessoas(pessoas.filter((x) => x._id !== p._id))
                  }
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Nome"
                  placeholder="Nome"
                  value={p.nome ?? ""}
                  onChange={(e) => {
                    const cp = [...pessoas];
                    cp[idx] = { ...p, nome: e.target.value };
                    setPessoas(cp);
                  }}
                />
                <Input
                  label="Nome social"
                  placeholder="Nome social"
                  value={p.nome_social ?? ""}
                  onChange={(e) => {
                    const cp = [...pessoas];
                    cp[idx] = { ...p, nome_social: e.target.value };
                    setPessoas(cp);
                  }}
                />
                <Input
                  label="Idade estimada"
                  type="number"
                  placeholder="Idade"
                  value={p.idade_estimada ?? ""}
                  onChange={(e) => {
                    const cp = [...pessoas];
                    cp[idx] = { ...p, idade_estimada: e.target.value ? parseInt(e.target.value) : null };
                    setPessoas(cp);
                  }}
                />
                <div className="flex flex-col gap-1">
                  <label htmlFor="sexo-select" className="text-xs font-semibold text-ink-soft">Sexo</label>
                  <select
                    id="sexo-select"
                    className="w-full rounded-xl border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
                    value={p.sexo ?? ""}
                    onChange={(e) => {
                      const cp = [...pessoas];
                      cp[idx] = { ...p, sexo: e.target.value };
                      setPessoas(cp);
                    }}
                  >
                    <option value="">Não informado</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <Input
                  label="Tempo em situação de rua"
                  placeholder="Ex: 2 anos, 6 meses..."
                  value={p.tempo_rua_estimado ?? ""}
                  onChange={(e) => {
                    const cp = [...pessoas];
                    cp[idx] = { ...p, tempo_rua_estimado: e.target.value };
                    setPessoas(cp);
                  }}
                />
                <Input
                  label="Encaminhado para"
                  placeholder="Serviço, unidade..."
                  value={p.encaminhado_para ?? ""}
                  onChange={(e) => {
                    const cp = [...pessoas];
                    cp[idx] = { ...p, encaminhado_para: e.target.value };
                    setPessoas(cp);
                  }}
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={p.possui_documento}
                    onChange={(e) => {
                      const cp = [...pessoas];
                      cp[idx] = { ...p, possui_documento: e.target.checked };
                      setPessoas(cp);
                    }}
                  />
                  Possui documento
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={p.aceitou_acolhimento}
                    onChange={(e) => {
                      const cp = [...pessoas];
                      cp[idx] = { ...p, aceitou_acolhimento: e.target.checked };
                      setPessoas(cp);
                    }}
                  />
                  Aceitou acolhimento
                </label>
              </div>
              <Input
                label="Observações sobre esta pessoa"
                placeholder="Observações sobre esta pessoa"
                value={p.observacoes ?? ""}
                onChange={(e) => {
                  const cp = [...pessoas];
                  cp[idx] = { ...p, observacoes: e.target.value };
                  setPessoas(cp);
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="obs-gerais" className="text-xs font-semibold text-ink-soft">Observações gerais</label>
          <textarea
            id="obs-gerais"
            className="w-full rounded-xl border border-ink-soft/20 bg-surface px-3 py-2 text-sm min-h-[80px]"
            placeholder="Observações sobre a ação..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function ModalMapa({
  aberto,
  aoFechar,
  pontos,
}: {
  aberto: boolean;
  aoFechar: () => void;
  pontos: BuscaAtivaOut[];
}) {
  const valido = pontos.filter(
    (p) => p.latitude != null && p.longitude != null,
  );

  useEffect(() => {
    if (!aberto || valido.length === 0) return;

    const L = (window as unknown as Record<string, Record<string, CallableFunction>>).L;
    if (!L) return;

    const container = document.getElementById("mapa-busca-ativa");
    if (!container) return;

    const mapInstance = L.map(container).setView(
      [valido[0].latitude!, valido[0].longitude!],
      14,
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstance);

    valido.forEach((p) => {
      const popup = L.popup().setContent(
        `<strong>${p.data_acao}</strong><br/>${p.local_bairro ?? ""}<br/>${p.local_logradouro ?? ""}<br/>Abordadas: ${p.pessoas_abordadas}`,
      );
      L.marker([p.latitude!, p.longitude!]).addTo(mapInstance).bindPopup(popup);
    });

    setTimeout(() => mapInstance.invalidateSize(), 200);

    return () => {
      mapInstance.remove();
    };
  }, [aberto, valido]);

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Mapa de ações de busca ativa"
      tamanho="lg"
    >
      {valido.length === 0 ? (
        <p className="text-sm text-ink-soft py-8 text-center">
          Nenhum ponto com coordenadas disponível para exibição no mapa.
        </p>
      ) : (
        <>
          <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" />
          <div
            id="mapa-busca-ativa"
            className="h-[400px] w-full rounded-xl border border-ink-soft/15"
          />
        </>
      )}
    </Modal>
  );
}
