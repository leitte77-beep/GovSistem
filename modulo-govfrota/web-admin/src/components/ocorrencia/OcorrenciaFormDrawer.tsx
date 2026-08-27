"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { api, Veiculo, VeiculoListItem } from "@/lib/api";
import { Drawer, Label } from "@/components/tanque/Drawer";
import { UploadImagem } from "@/components/tanque/UploadImagem";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { CATEGORIAS_LISTA, GRAVIDADES_LISTA, categoriaRotulo, gravidadeInfo, formatarKm } from "@/lib/ocorrencias";

interface Props {
  aberto: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

export function OcorrenciaFormDrawer({ aberto, onClose, onSalvo }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const [veiculoMenu, setVeiculoMenu] = useState(false);

  const [categoria, setCategoria] = useState("MECANICO");
  const [gravidade, setGravidade] = useState("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [km, setKm] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  useEffect(() => {
    if (!aberto) return;
    api.listVeiculos({ limit: 300, sort_by: "placa", order: "asc" }).then((d) => setVeiculos(d.itens)).catch(() => {});
    setVeiculo(null);
    setBuscaVeiculo("");
    setCategoria("MECANICO");
    setGravidade("MEDIA");
    setDescricao("");
    setKm("");
    setFoto(null);
  }, [aberto]);

  const veiculosFiltrados = useMemo(() => {
    const q = buscaVeiculo.trim().toLowerCase();
    if (!q) return veiculos;
    return veiculos.filter((v) =>
      [v.placa, v.marca, v.modelo].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [veiculos, buscaVeiculo]);

  function selecionarVeiculo(v: VeiculoListItem) {
    setBuscaVeiculo(`${v.placa}${v.modelo ? ` — ${[v.marca, v.modelo].filter(Boolean).join(" ")}` : ""}`);
    setVeiculoMenu(false);
    api.getVeiculo(v.id).then((full) => {
      setVeiculo(full);
      setKm(String(full.usa_horimetro ? full.horimetro_atual ?? "" : full.quilometragem_atual ?? ""));
    }).catch(() => toast.error("Falha ao carregar veículo."));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!veiculo) return toast.error("Selecione um veículo.");
    if (descricao.trim().length < 3) return toast.error("Descreva o problema.");

    setSalvando(true);
    try {
      let fotoUrl: string | null = null;
      if (foto) {
        toast.loading("Enviando foto...", { id: "env-foto" });
        try {
          const r = await api.upload(foto);
          fotoUrl = r.url;
        } catch {
          toast.error("Não foi possível enviar a foto. Tente novamente.");
          return;
        } finally {
          toast.dismiss("env-foto");
        }
      }
      await api.createOcorrencia({
        veiculo_id: veiculo.id,
        categoria,
        descricao,
        gravidade,
        quilometragem: km === "" ? undefined : Number(km),
        foto_url: fotoUrl,
        origem: "ADMIN",
      });
      toast.success("Problema registrado.");
      onSalvo();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer
      aberto={aberto}
      onClose={onClose}
      titulo="Nova ocorrência"
      largura="max-w-2xl"
      rodape={
        <button type="submit" form="form-ocorrencia" className="btn btn-primary" disabled={salvando}>
          {salvando ? <><Loader2 size={16} className="animate-spin" /> Registrando…</> : "Registrar ocorrência"}
        </button>
      }
    >
      <form id="form-ocorrencia" className="space-y-6" onSubmit={enviar}>
        <section className="space-y-3">
          <h3 className="text-label font-semibold text-text-title">Veículo *</h3>
          <div className="relative">
            <input
              value={buscaVeiculo}
              onChange={(e) => { setBuscaVeiculo(e.target.value); setVeiculoMenu(true); }}
              onFocus={() => setVeiculoMenu(true)}
              onBlur={() => setTimeout(() => setVeiculoMenu(false), 150)}
              placeholder="Buscar por placa, marca ou modelo…"
              className="input"
              autoComplete="off"
            />
            {veiculoMenu && veiculosFiltrados.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-card border border-surface-border bg-white shadow-elevated">
                {veiculosFiltrados.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onMouseDown={() => selecionarVeiculo(v)}
                    className="flex w-full items-center gap-3 border-b border-surface-border px-3 py-2 text-left last:border-0 hover:bg-surface-bg"
                  >
                    <FotoVeiculo src={v.foto_url} className="h-9 w-12 flex-shrink-0 rounded-btn" />
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium text-text-title">{v.placa}</div>
                      <div className="truncate text-meta text-text-subtle">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</div>
                    </div>
                    <div className="text-meta text-text-subtle">{v.usa_horimetro ? formatarKm(v.horimetro_atual, true) : formatarKm(v.quilometragem_atual)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {veiculo && (
            <div className="rounded-card border border-[#1D4ED8]/20 bg-[#EFF4FF] p-3">
              <div className="flex items-center gap-3">
                <FotoVeiculo src={veiculo.foto_url} className="h-12 w-16 rounded-btn" />
                <div className="min-w-0">
                  <div className="text-body font-semibold text-text-title">{veiculo.placa}</div>
                  <div className="text-body-sm text-text-body">{veiculo.marca} {veiculo.modelo}</div>
                  <div className="mt-1 text-meta text-text-subtle">
                    {veiculo.usa_horimetro ? "Horímetro" : "KM"}: <strong className="tabular-nums">{veiculo.usa_horimetro ? formatarKm(veiculo.horimetro_atual, true) : formatarKm(veiculo.quilometragem_atual)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-label font-semibold text-text-title">Problema</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label texto="Categoria *">
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIAS_LISTA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </Label>
            <Label texto="Gravidade *">
              <select className="input" value={gravidade} onChange={(e) => setGravidade(e.target.value)}>
                {GRAVIDADES_LISTA.map((g) => <option key={g} value={g}>{gravidadeInfo(g).rotulo}</option>)}
              </select>
            </Label>
          </div>
          <Label texto="Descrição do problema *">
            <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="input" placeholder="Descreva o problema encontrado" />
          </Label>
          <Label texto={veiculo?.usa_horimetro ? "Horímetro atual" : "KM atual"}>
            <input type="number" step={veiculo?.usa_horimetro ? "0.1" : "1"} min="0" value={km} onChange={(e) => setKm(e.target.value)} className="input" disabled={!veiculo} />
          </Label>
        </section>

        <section className="space-y-3">
          <h3 className="text-label font-semibold text-text-title">Fotos <span className="font-normal text-text-subtle">(opcional)</span></h3>
          <UploadImagem onMudar={(file) => setFoto(file)} alt="Foto da ocorrência" nomeArquivo="Foto" />
        </section>

        <section className="rounded-card border border-[#1D4ED8]/20 bg-[#F8FBFF] p-4">
          <h3 className="mb-2 text-label font-semibold text-text-title">Resumo</h3>
          <dl className="space-y-1 text-body-sm">
            <ResumoItem rotulo="Veículo" valor={veiculo ? `${veiculo.placa} · ${[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}` : "—"} />
            <ResumoItem rotulo="Categoria" valor={categoriaRotulo(categoria)} />
            <ResumoItem rotulo="Gravidade" valor={gravidadeInfo(gravidade).rotulo} />
            <ResumoItem rotulo="Descrição" valor={descricao || "—"} />
            <ResumoItem rotulo="KM/Horímetro" valor={km ? formatarKm(Number(km), veiculo?.usa_horimetro) : "—"} />
            <ResumoItem rotulo="Foto" valor={foto ? "Anexada" : "Sem foto"} />
          </dl>
        </section>
      </form>
    </Drawer>
  );
}

function ResumoItem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-surface-border/60 py-1 last:border-0">
      <dt className="text-text-subtle">{rotulo}</dt>
      <dd className="text-right font-medium text-text-title">{valor}</dd>
    </div>
  );
}
