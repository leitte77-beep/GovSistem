"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Gauge, Plus, Repeat } from "lucide-react";
import { api, SimamMedidores, Veiculo } from "@/lib/api";
import { Label, Modal } from "@/components/tanque/Drawer";
import { useAuth } from "@/lib/auth";

const TIPO = { 1: "Hodômetro", 2: "Horímetro", 3: "Não usa" } as Record<number, string>;

function data(d: string | null) {
  return d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "—";
}

/** Medidores físicos do veículo (SIM-AM): troca de aparelho e km/horas declarados. */
export function MedidoresVeiculo({ veiculo, onMudou }: { veiculo: Veiculo; onMudou: () => void }) {
  const { hasPermission } = useAuth();
  const pode = hasPermission("vehicle.manage");
  const [dados, setDados] = useState<SimamMedidores | null>(null);
  const [modal, setModal] = useState<"troca" | "declarar" | null>(null);

  const carregar = useCallback(() => {
    api.simamMedidores(veiculo.id).then(setDados).catch((e) => toast.error((e as Error).message));
  }, [veiculo.id]);
  useEffect(carregar, [carregar]);

  if (!dados) return <p className="animate-pulse text-text-subtle">Carregando…</p>;
  const unidade = dados.tipo_medidor === 2 ? "h" : "km";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body-sm font-semibold text-text-title">Medidores ({TIPO[dados.tipo_medidor]})</h3>
          {pode && dados.tipo_medidor !== 3 && (
            <span className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setModal("declarar")}>
                <Plus size={14} /> Declarar {unidade} com defeito
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal("troca")}>
                <Repeat size={14} /> Trocar medidor
              </button>
            </span>
          )}
        </div>
        <p className="mb-3 text-meta text-text-subtle">
          O número do medidor só muda na troca física do aparelho. As leituras mensais enviadas ao TCE
          vêm dos abastecimentos.
        </p>
        {dados.tipo_medidor === 3 ? (
          <p className="text-body-sm text-text-subtle">Veículo informado ao TCE como sem hodômetro/horímetro.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {dados.medidores.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
                <span className="flex items-center gap-2">
                  <Gauge size={16} className="text-text-subtle" />
                  <strong>Nº {m.sequencial}</strong>
                  <span className="text-text-subtle">
                    {m.sequencial === 1 && !m.motivo ? "aparelho original" : `instalado em ${data(m.data_inicio)} (leitura ${Number(m.leitura_inicial).toLocaleString("pt-BR")})`}
                  </span>
                </span>
                <span className="text-meta text-text-subtle">
                  {m.data_fim ? `retirado em ${data(m.data_fim)} com ${Number(m.leitura_final).toLocaleString("pt-BR")} ${unidade}` : "em uso"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dados.declaradas.length > 0 && (
        <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
          <h3 className="mb-2 text-body-sm font-semibold text-text-title">Medições declaradas</h3>
          <ul className="divide-y divide-outline-variant/20">
            {dados.declaradas.map((d) => (
              <li key={d.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm ${d.cancelada ? "opacity-50 line-through" : ""}`}>
                <span>
                  {data(d.data_referencia)} · <strong>{Number(d.quantidade).toLocaleString("pt-BR")} {unidade}</strong> no medidor nº {d.medidor_sequencial}
                  <span className="block text-meta text-text-subtle">{d.justificativa}</span>
                </span>
                <span className="flex gap-3 text-meta">
                  <button className="text-primary hover:underline" onClick={() => api.abrirAnexo({ url: d.anexo_url })}>Documento</button>
                  {pode && !d.cancelada && (
                    <button
                      className="text-[#BA1A1A] hover:underline"
                      onClick={async () => {
                        const motivo = window.prompt("Motivo do cancelamento:");
                        if (!motivo || motivo.trim().length < 5) return;
                        try {
                          await api.simamCancelarDeclaracao(d.id, motivo.trim());
                          carregar();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modal && (
        <ModalMedidor
          tipo={modal}
          unidade={unidade}
          veiculo={veiculo}
          onClose={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); onMudou(); }}
        />
      )}
    </div>
  );
}

function ModalMedidor({ tipo, unidade, veiculo, onClose, onSalvo }: {
  tipo: "troca" | "declarar"; unidade: string; veiculo: Veiculo; onClose: () => void; onSalvo: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = unidade === "h" ? Number(veiculo.horimetro_atual || 0) : veiculo.quilometragem_atual;
  const [f, setF] = useState({ data: hoje, antigo: String(atual || ""), novo: "0", quantidade: "", texto: "" });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const troca = tipo === "troca";
  const valido = f.texto.trim().length >= 5 && (troca ? f.antigo !== "" && f.novo !== "" : Number(f.quantidade) > 0 && !!arquivo);

  async function salvar() {
    setSalvando(true);
    try {
      const anexo_id = arquivo ? (await api.upload(arquivo)).id : undefined;
      if (troca) {
        await api.simamTrocarMedidor(veiculo.id, {
          data_troca: f.data, leitura_final_antigo: f.antigo, leitura_inicial_novo: f.novo, motivo: f.texto.trim(), anexo_id,
        });
        toast.success("Medidor trocado.");
      } else {
        await api.simamDeclararMedicao(veiculo.id, {
          data_referencia: f.data, quantidade: f.quantidade, justificativa: f.texto.trim(), anexo_id,
        });
        toast.success("Medição declarada.");
      }
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const input = (k: keyof typeof f, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="input" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} {...props} />
  );

  return (
    <Modal
      aberto
      onClose={onClose}
      titulo={troca ? "Trocar hodômetro/horímetro" : `Declarar ${unidade} com medidor danificado`}
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={salvando || !valido} onClick={salvar}>
            {salvando ? "Salvando…" : "Confirmar"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-body-sm">
        <p className="text-meta text-text-subtle">
          {troca
            ? "Registre só na troca física do aparelho: o SIM-AM passa a usar um novo número de medidor."
            : `Km/horas rodados enquanto o medidor estava parado. O TCE exige documento firmado pelos responsáveis.`}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label texto={troca ? "Data da troca *" : "Data de referência *"}>{input("data", { type: "date" })}</Label>
          {troca ? (<>
            <Label texto={`Última leitura do aparelho retirado (${unidade}) *`}>{input("antigo", { type: "number", min: 0, step: "0.1" })}</Label>
            <Label texto={`Leitura inicial do aparelho novo (${unidade}) *`}>{input("novo", { type: "number", min: 0, step: "0.1" })}</Label>
          </>) : (
            <Label texto={`Quantidade (${unidade}) *`}>{input("quantidade", { type: "number", min: 0, step: "0.1" })}</Label>
          )}
        </div>
        <Label texto={troca ? "Motivo *" : "Justificativa (vai ao TCE) *"}>
          <textarea rows={2} maxLength={250} className="input" value={f.texto} onChange={(e) => setF((x) => ({ ...x, texto: e.target.value }))} />
        </Label>
        <Label texto={troca ? "Documento (nota da oficina, laudo)" : "Documento firmado *"}>
          <input type="file" accept="application/pdf,image/*" className="input" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </Label>
      </div>
    </Modal>
  );
}
