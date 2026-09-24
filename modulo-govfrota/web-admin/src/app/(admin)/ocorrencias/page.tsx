"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  ImageOff,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  SearchX,
  Users,
  X,
} from "lucide-react";
import {
  MotoristaListItem,
  Ocorrencia,
  Paginado,
  VeiculoListItem,
  api,
} from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { MenuAcoes, type MenuAcao } from "@/components/veiculo/MenuAcoes";
import { FotoAnexo } from "@/components/abastecimento/FotoAnexo";
import { OcorrenciaFormDrawer } from "@/components/ocorrencia/OcorrenciaFormDrawer";
import { BadgeCategoria, BadgeGravidade, BadgeOrigem, BadgeStatus } from "@/components/ocorrencia/Badges";
import { ModalResolver } from "@/components/ocorrencia/ModalResolver";
import { CATEGORIAS_LISTA, GRAVIDADES_LISTA, STATUS_LISTA, categoriaRotulo, formatarDataHora, gravidadeInfo } from "@/lib/ocorrencias";

const LIMITES = [20, 50, 100];

interface Filtros {
  veiculo_id: string;
  gravidade: string;
  categoria: string;
  motorista_id: string;
  origem: string;
  com_foto: string;
  status: string;
}

const FILTROS_VAZIO: Filtros = { veiculo_id: "", gravidade: "", categoria: "", motorista_id: "", origem: "", com_foto: "", status: "" };

const ORIGEM_OPCOES = [
  { valor: "APP_MOTORISTA", rotulo: "Motorista" },
  { valor: "ADMIN", rotulo: "Administrativo" },
];

export default function OcorrenciasPage() {
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("occurrence.manage");
  const podeConverter = hasPermission("maintenance.manage");

  const [dados, setDados] = useState<Paginado<Ocorrencia> | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaEfetiva, setBuscaEfetiva] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIO);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limit, setLimit] = useState(20);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [resolver, setResolver] = useState<Ocorrencia | null>(null);

  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaListItem[]>([]);

  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => {
      setBuscaEfetiva(busca);
      setPagina(1);
    }, 350);
    return () => {
      if (buscaTimer.current) clearTimeout(buscaTimer.current);
    };
  }, [busca]);

  useEffect(() => {
    api.listVeiculos({ limit: 300, sort_by: "placa", order: "asc" }).then((d) => setVeiculos(d.itens)).catch(() => {});
    api.listMotoristas({ limit: 300, sort_by: "nome", order: "asc" }).then((d) => setMotoristas(d.itens)).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    try {
      const skip = (pagina - 1) * limit;
      setDados(
        await api.listOcorrencias({
          search: buscaEfetiva || undefined,
          veiculo_id: filtros.veiculo_id || undefined,
          gravidade: filtros.gravidade || undefined,
          categoria: filtros.categoria || undefined,
          motorista_id: filtros.motorista_id || undefined,
          origem: filtros.origem || undefined,
          status: filtros.status || undefined,
          com_foto: filtros.com_foto === "" ? undefined : filtros.com_foto === "true",
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          sort_by: "created_at",
          order: "desc",
          skip,
          limit,
        })
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [buscaEfetiva, filtros, dataInicio, dataFim, pagina, limit]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function aplicarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  }

  function limparFiltros() {
    setBusca("");
    setBuscaEfetiva("");
    setDataInicio("");
    setDataFim("");
    setFiltros(FILTROS_VAZIO);
    setPagina(1);
  }

  const total = dados?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const inicio = total === 0 ? 0 : (pagina - 1) * limit + 1;
  const fim = Math.min(pagina * limit, total);

  const temFiltroAtivo =
    !!buscaEfetiva || !!dataInicio || !!dataFim ||
    !!filtros.veiculo_id || !!filtros.gravidade || !!filtros.categoria ||
    !!filtros.motorista_id || !!filtros.origem || !!filtros.com_foto || !!filtros.status;

  const chips: { chave: string; label: string }[] = useMemo(() => {
    const c: { chave: string; label: string }[] = [];
    if (buscaEfetiva) c.push({ chave: "busca", label: `Busca: ${buscaEfetiva}` });
    if (filtros.status) c.push({ chave: "status", label: `Status: ${STATUS_LISTA.find((s) => s.valor === filtros.status)?.rotulo ?? filtros.status}` });
    if (filtros.veiculo_id) c.push({ chave: "veiculo_id", label: `Veículo: ${veiculos.find((v) => v.id === filtros.veiculo_id)?.placa ?? "—"}` });
    if (filtros.gravidade) c.push({ chave: "gravidade", label: `Gravidade: ${gravidadeInfo(filtros.gravidade).rotulo}` });
    if (filtros.categoria) c.push({ chave: "categoria", label: `Categoria: ${categoriaRotulo(filtros.categoria)}` });
    if (filtros.motorista_id) c.push({ chave: "motorista_id", label: `Motorista: ${motoristas.find((m) => m.id === filtros.motorista_id)?.nome ?? "—"}` });
    if (filtros.origem) c.push({ chave: "origem", label: `Origem: ${ORIGEM_OPCOES.find((o) => o.valor === filtros.origem)?.rotulo ?? filtros.origem}` });
    if (filtros.com_foto) c.push({ chave: "com_foto", label: filtros.com_foto === "true" ? "Com foto" : "Sem foto" });
    return c;
  }, [buscaEfetiva, filtros, veiculos, motoristas]);

  function removerChip(chave: string) {
    if (chave === "busca") { setBusca(""); setBuscaEfetiva(""); }
    else setFiltros((f) => ({ ...f, [chave]: "" }));
    setPagina(1);
  }

  async function converter(o: Ocorrencia) {
    if (!confirm("Converter esta ocorrência em manutenção corretiva? A foto permanece vinculada.")) return;
    try {
      await api.converterEmManutencao(o.id);
      toast.success("Convertida em manutenção corretiva.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const acoes = useCallback(
    (o: Ocorrencia): MenuAcao[] => {
      const lista: MenuAcao[] = [
        { key: "ver", label: "Ver ocorrência", icon: <Eye size={15} />, href: `/ocorrencias/${o.id}` },
      ];
      if (podeGerir && o.status !== "RESOLVIDA" && !o.manutencao_id) {
        lista.push({ key: "resolver", label: "Resolver", icon: <Pencil size={15} />, onClick: () => setResolver(o) });
      }
      if (podeConverter && !o.manutencao_id && o.status !== "RESOLVIDA") {
        lista.push({ key: "converter", label: "Converter em manutenção", icon: <WrenchIcon />, onClick: () => converter(o) });
      }
      return lista;
    },
    [podeGerir, podeConverter]
  );

  return (
    <RequirePermission perms="vehicle.view">
      <OcorrenciaFormDrawer
        aberto={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        onSalvo={carregar}
      />
      {resolver && (
        <ModalResolver
          ocorrencia={resolver}
          onClose={() => setResolver(null)}
          onSalvo={() => { setResolver(null); carregar(); }}
        />
      )}

      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-background">Ocorrências / Problemas</h1>
            <p className="mt-1 text-[15px] text-on-surface-variant">
              Problemas informados pelos motoristas ou pelo escritório, com fotos e histórico.
            </p>
          </div>
          {podeGerir && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-secondary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-secondary/30"
              onClick={() => setDrawerAberto(true)}
            >
              <Plus size={18} /> Nova ocorrência
            </button>
          )}
        </div>

        {/* Barra de busca + status + filtros */}
        <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card p-2 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input
                placeholder="Buscar por veículo ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-xl border-none bg-transparent py-3 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-0"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_LISTA.map((s) => (
                <button
                  key={s.valor || "todas"}
                  onClick={() => { aplicarFiltro("status", s.valor); }}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${filtros.status === s.valor ? "bg-secondary text-white" : "text-on-surface-variant hover:bg-surface-container-low"}`}
                >
                  {s.rotulo}
                </button>
              ))}
              <button
                onClick={() => setMostrarFiltros((m) => !m)}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 hover:bg-surface-container-low"
              >
                <SlidersHorizontal size={18} className="text-on-surface-variant" />
                Filtros
                <ChevronDown size={14} className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
                {chips.length > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] text-white">{chips.length}</span>
                )}
              </button>
            </div>
          </div>

          {mostrarFiltros && (
            <div className="border-t border-outline-variant/30 pt-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Label texto="Veículo">
                  <select className="input" value={filtros.veiculo_id} onChange={(e) => aplicarFiltro("veiculo_id", e.target.value)}>
                    <option value="">Todos</option>
                    {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {[v.marca, v.modelo].filter(Boolean).join(" ")}</option>)}
                  </select>
                </Label>
                <Label texto="Gravidade">
                  <select className="input" value={filtros.gravidade} onChange={(e) => aplicarFiltro("gravidade", e.target.value)}>
                    <option value="">Todas</option>
                    {GRAVIDADES_LISTA.map((g) => <option key={g} value={g}>{gravidadeInfo(g).rotulo}</option>)}
                  </select>
                </Label>
                <Label texto="Categoria">
                  <select className="input" value={filtros.categoria} onChange={(e) => aplicarFiltro("categoria", e.target.value)}>
                    <option value="">Todas</option>
                    {CATEGORIAS_LISTA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </Label>
                <Label texto="Motorista">
                  <select className="input" value={filtros.motorista_id} onChange={(e) => aplicarFiltro("motorista_id", e.target.value)}>
                    <option value="">Todos</option>
                    {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </Label>
                <Label texto="Origem">
                  <select className="input" value={filtros.origem} onChange={(e) => aplicarFiltro("origem", e.target.value)}>
                    <option value="">Todas</option>
                    {ORIGEM_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                </Label>
                <Label texto="Foto">
                  <select className="input" value={filtros.com_foto} onChange={(e) => aplicarFiltro("com_foto", e.target.value)}>
                    <option value="">Todas</option>
                    <option value="true">Com foto</option>
                    <option value="false">Sem foto</option>
                  </select>
                </Label>
                <Label texto="De">
                  <input type="date" className="input" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setPagina(1); }} />
                </Label>
                <Label texto="Até">
                  <input type="date" className="input" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setPagina(1); }} />
                </Label>
              </div>
            </div>
          )}
        </div>

        {/* Chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-meta font-medium text-[#1D5BD6]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
            <button className="text-meta font-medium text-[#1D5BD6] hover:underline" onClick={limparFiltros}>Limpar filtros</button>
          </div>
        )}

        {/* Estados vazios */}
        {dados && total === 0 && !temFiltroAtivo && (
          <VazioOcorrencia
            titulo="Nenhuma ocorrência registrada"
            descricao="Problemas informados pelos motoristas ou pelo escritório aparecerão aqui."
            acao={podeGerir ? { label: "Registrar ocorrência", onClick: () => setDrawerAberto(true) } : undefined}
          />
        )}
        {dados && total === 0 && temFiltroAtivo && (
          <VazioOcorrencia
            titulo="Nenhum resultado encontrado"
            descricao="Não há ocorrências correspondentes aos filtros selecionados."
            acao={{ label: "Limpar filtros", onClick: limparFiltros, secundario: true }}
          />
        )}

        {/* Lista */}
        {dados && total > 0 && (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm">
            <ul className="divide-y divide-outline-variant/20">
              {dados.itens.map((o) => (
                <CardOcorrencia key={o.id} o={o} acoes={acoes(o)} />
              ))}
            </ul>

            {/* Paginação */}
            <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant/30 bg-surface-container-lowest/50 px-6 py-4 text-sm font-medium text-on-surface-variant sm:flex-row">
              <span>Mostrando {inicio}-{fim} de {total} ocorrência{total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs">Linhas por página:</span>
                  <div className="relative">
                    <select
                      value={limit}
                      onChange={(e) => { setLimit(Number(e.target.value)); setPagina(1); }}
                      className="cursor-pointer appearance-none rounded-lg border border-outline-variant/40 bg-surface-card py-1.5 pl-3 pr-8 text-sm text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/50"
                    >
                      {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primeira"><ChevronsLeft size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Anterior"><ChevronLeft size={18} /></button>
                  <span className="px-2 font-semibold text-on-surface">{pagina} / {totalPaginas}</span>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Próxima"><ChevronRight size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última"><ChevronsRight size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

function CardOcorrencia({ o, acoes }: { o: Ocorrencia; acoes: MenuAcao[] }) {
  const registradoPor = o.origem === "APP_MOTORISTA" ? o.motorista_nome : o.motorista_nome ?? "Escritório";
  return (
    <li className="flex items-start gap-4 p-4 transition-colors hover:bg-surface-container-lowest group">
      <Link href={`/ocorrencias/${o.id}`} className="flex-shrink-0">
        {o.foto_url ? (
          <FotoAnexo url={o.foto_url} alt="Foto da ocorrência" className="h-14 w-14 rounded-lg" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-outline-variant/40 bg-surface-bg text-on-surface-variant/50">
            <ImageOff size={20} />
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/ocorrencias/${o.id}`} className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-on-surface group-hover:text-secondary transition-colors">{o.veiculo_placa ?? "—"}</span>
          <span className="text-sm text-on-surface-variant">{[o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" ") || "—"}</span>
          <BadgeCategoria categoria={o.categoria} />
          <BadgeGravidade gravidade={o.gravidade} />
          <BadgeStatus status={o.status} />
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-on-surface">{o.descricao}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-on-surface-variant">
          <span className="inline-flex items-center gap-1"><Users size={13} /> {registradoPor || "—"}</span>
          <span>{formatarDataHora(o.created_at || o.data_ocorrencia)}</span>
          <BadgeOrigem origem={o.origem} />
        </div>
      </div>
      <div className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <MenuAcoes acoes={acoes} />
      </div>
    </li>
  );
}

function VazioOcorrencia({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: { label: string; onClick: () => void; secundario?: boolean } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card px-6 py-14 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-[#1D4ED8]">
        {acao && !acao.secundario ? <AlertTriangle size={24} /> : <SearchX size={24} />}
      </div>
      <h2 className="text-h3 text-on-surface">{titulo}</h2>
      <p className="max-w-md text-sm text-on-surface-variant">{descricao}</p>
      {acao && (
        <button onClick={acao.onClick} className={`mt-3 ${acao.secundario ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}`}>
          <Plus size={14} /> {acao.label}
        </button>
      )}
    </div>
  );
}

function WrenchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function Label({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="text-meta text-on-surface-variant">
      <span className="block text-xs font-semibold uppercase tracking-wide">{texto}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
