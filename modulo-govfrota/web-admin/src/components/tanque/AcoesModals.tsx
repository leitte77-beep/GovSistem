"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, Tanque, TIPOS_SAIDA_SIMAM } from "@/lib/api";
import { Label, Modal } from "@/components/tanque/Drawer";

function useJustificativa() {
  const [justificativa, setJustificativa] = useState("");
  return { justificativa, setJustificativa, valida: justificativa.trim().length >= 5 };
}

// ── Ajuste de estoque (positivo/negativo) ──────────────────────────────────

export function AjusteModal({
  aberto,
  onClose,
  tanque,
  positivo,
  onConcluido,
}: {
  aberto: boolean;
  onClose: () => void;
  tanque: Tanque;
  positivo: boolean;
  onConcluido: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const { justificativa, setJustificativa, valida } = useJustificativa();

  useEffect(() => {
    if (aberto) {
      setQuantidade("");
      setJustificativa("");
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const atual = Number(tanque.estoque_atual);
  const novo = atual + (positivo ? 1 : -1) * (Number(quantidade) || 0);

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo={positivo ? "Ajuste positivo de estoque" : "Ajuste negativo de estoque"}
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={salvando || !Number(quantidade) || !valida}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.ajustarEstoque(tanque.id, quantidade, positivo, justificativa.trim());
                toast.success("Ajuste registrado.");
                onConcluido();
                onClose();
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Salvando…" : "Registrar ajuste"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-body-sm">
        <div className="rounded-btn bg-surface-bg px-3 py-2">
          <div className="flex justify-between text-meta text-text-subtle"><span>Estoque atual</span><span>{atual.toLocaleString("pt-BR")} L</span></div>
          <div className="flex justify-between text-meta text-text-subtle"><span>Ajuste</span><span className={positivo ? "text-[#067647]" : "text-[#B42318]"}>{positivo ? "+" : "−"}{Number(quantidade || 0).toLocaleString("pt-BR")} L</span></div>
          <div className="flex justify-between font-medium text-text-title"><span>Novo estoque</span><span>{novo.toLocaleString("pt-BR")} L</span></div>
        </div>
        <Label texto="Quantidade (L) *">
          <input autoFocus type="number" step="0.01" min={0} className="input" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        </Label>
        <Label texto="Justificativa *">
          <textarea rows={3} className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Motivo do ajuste" />
        </Label>
      </div>
    </Modal>
  );
}

// ── Conferência de estoque (inventário) ────────────────────────────────────

export function InventarioModal({
  aberto,
  onClose,
  tanque,
  onConcluido,
}: {
  aberto: boolean;
  onClose: () => void;
  tanque: Tanque;
  onConcluido: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [fisico, setFisico] = useState("");
  const [resultado, setResultado] = useState<{ id: string; sistema: number; fisico: number; diferenca: number } | null>(null);
  const { justificativa, setJustificativa, valida } = useJustificativa();
  // Falta no inventário vira saída extraordinária do SIM-AM (motivo obrigatório).
  const [motivoFalta, setMotivoFalta] = useState("1");

  useEffect(() => {
    if (aberto) {
      setFisico("");
      setResultado(null);
      setJustificativa("");
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const sistema = Number(tanque.estoque_atual);
  const diferenca = (Number(fisico) || 0) - sistema;

  async function conferir() {
    setSalvando(true);
    try {
      const inv = await api.registrarInventario({
        tanque_id: tanque.id,
        estoque_fisico: fisico,
        data_conferencia: new Date().toISOString().slice(0, 10),
        observacao: "Conferência física de estoque",
      });
      setResultado({
        id: inv.id,
        sistema: Number(inv.estoque_sistema),
        fisico: Number(inv.estoque_fisico),
        diferenca: Number(inv.diferenca),
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function aplicar() {
    if (!resultado) return;
    setSalvando(true);
    try {
      await api.aplicarInventario(
        resultado.id,
        justificativa.trim() || "Diferença confirmada em inventário físico.",
        resultado.diferenca < 0 ? { tipo_saida_simam: Number(motivoFalta) } : undefined,
      );
      toast.success("Ajuste de inventário aplicado.");
      onConcluido();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo="Conferência de estoque"
      rodape={
        resultado ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setResultado(null)} disabled={salvando}>Voltar</button>
            <button type="button" className="btn btn-primary" disabled={salvando || !valida} onClick={aplicar}>
              {salvando ? "Aplicando…" : "Aplicar ajuste"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={salvando || !(Number(fisico) >= 0)} onClick={conferir}>
              {salvando ? "Conferindo…" : "Conferir"}
            </button>
          </>
        )
      }
    >
      {!resultado ? (
        <div className="space-y-3 text-body-sm">
          <div className="flex justify-between rounded-btn bg-surface-bg px-3 py-2 text-meta text-text-subtle">
            <span>Estoque no sistema</span><span className="font-medium text-text-body">{sistema.toLocaleString("pt-BR")} L</span>
          </div>
          <Label texto="Quantidade física (L) *">
            <input autoFocus type="number" step="0.01" min={0} className="input" value={fisico} onChange={(e) => setFisico(e.target.value)} />
          </Label>
          <div className="flex justify-between rounded-btn bg-surface-bg px-3 py-2 text-meta text-text-subtle">
            <span>Diferença</span>
            <span className={`font-medium ${diferenca > 0 ? "text-[#067647]" : diferenca < 0 ? "text-[#B42318]" : "text-text-body"}`}>
              {diferenca > 0 ? "+" : ""}{diferenca.toLocaleString("pt-BR")} L
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-body-sm">
          <div className="rounded-btn border border-surface-border bg-[#EFF6FF] px-3 py-2">
            <p className="text-meta text-[#1D4ED8]">Foi encontrada uma diferença de {resultado.diferenca > 0 ? "+" : ""}{resultado.diferenca.toLocaleString("pt-BR")} L.</p>
            <p className="text-meta text-text-subtle">Deseja registrar o ajuste? O estoque só será alterado após a confirmação.</p>
          </div>
          {resultado.diferenca < 0 && (
            <Label texto="Motivo da falta (SIM-AM) *">
              <select className="input" value={motivoFalta} onChange={(e) => setMotivoFalta(e.target.value)}>
                {TIPOS_SAIDA_SIMAM.filter((t) => [1, 2, 3, 99].includes(t.codigo)).map((t) => (
                  <option key={t.codigo} value={t.codigo}>{t.nome}</option>
                ))}
              </select>
            </Label>
          )}
          <Label texto="Justificativa *">
            <textarea rows={3} className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Justificativa da diferença" />
          </Label>
        </div>
      )}
    </Modal>
  );
}

// ── Saída extraordinária (SIM-AM) ──────────────────────────────────────────

export function SaidaExtraModal({
  aberto,
  onClose,
  tanque,
  onConcluido,
}: {
  aberto: boolean;
  onClose: () => void;
  tanque: Tanque;
  onConcluido: () => void;
}) {
  const vazio = {
    tipo_saida: "4", data_saida: new Date().toISOString().slice(0, 10), quantidade: "", responsavel_cpf: "",
    nota_explicativa: "", recebedor_nome: "", recebedor_cpf_cnpj: "", convenio_numero: "", convenio_ano: "", convenio_objeto: "",
  };
  const [form, setForm] = useState(vazio);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setForm(vazio);
      setArquivo(null);
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const tipo = TIPOS_SAIDA_SIMAM.find((t) => String(t.codigo) === form.tipo_saida);
  const convenio = form.tipo_saida === "6";
  const campo = (k: keyof typeof vazio) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "input",
  });

  async function salvar() {
    setSalvando(true);
    try {
      const anexo_id = arquivo ? (await api.upload(arquivo)).id : undefined;
      await api.simamCriarSaida({
        tanque_id: tanque.id,
        tipo_saida: Number(form.tipo_saida),
        data_saida: form.data_saida,
        quantidade: form.quantidade,
        responsavel_cpf: form.responsavel_cpf || undefined,
        nota_explicativa: form.nota_explicativa || undefined,
        anexo_id,
        ...(convenio
          ? {
              recebedor_nome: form.recebedor_nome, recebedor_cpf_cnpj: form.recebedor_cpf_cnpj,
              convenio_numero: form.convenio_numero, convenio_ano: Number(form.convenio_ano) || undefined,
              convenio_objeto: form.convenio_objeto,
            }
          : {}),
      });
      toast.success("Saída registrada — estoque atualizado.");
      onConcluido();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo="Saída extraordinária"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={salvando || !(Number(form.quantidade) > 0)} onClick={salvar}>
            {salvando ? "Registrando…" : "Registrar saída"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-body-sm">
        <p className="text-meta text-text-subtle">
          Combustível que saiu do tanque sem ser abastecimento de veículo: perdas, oficina, obras, convênio.
          Vai para o SIM-AM (SaidaExtraCombustivel).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label texto="Tipo *">
            <select {...campo("tipo_saida")}>
              {TIPOS_SAIDA_SIMAM.map((t) => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
            </select>
          </Label>
          <Label texto="Data *">
            <input type="date" {...campo("data_saida")} />
          </Label>
          <Label texto="Quantidade (L) *">
            <input type="number" step="0.001" min={0} {...campo("quantidade")} />
          </Label>
          <Label texto="CPF do responsável">
            <input inputMode="numeric" maxLength={14} placeholder="Vazio = o de Configurações" {...campo("responsavel_cpf")} />
          </Label>
          {convenio && (<>
            <Label texto="Entidade recebedora *"><input maxLength={150} {...campo("recebedor_nome")} /></Label>
            <Label texto="CPF/CNPJ do recebedor *"><input inputMode="numeric" maxLength={18} {...campo("recebedor_cpf_cnpj")} /></Label>
            <Label texto="Convênio nº *"><input maxLength={20} {...campo("convenio_numero")} /></Label>
            <Label texto="Ano do convênio *"><input inputMode="numeric" maxLength={4} {...campo("convenio_ano")} /></Label>
            <Label texto="Objeto do convênio *"><input maxLength={250} {...campo("convenio_objeto")} /></Label>
          </>)}
        </div>
        <Label texto={`Nota explicativa${tipo?.semNota ? "" : " *"}`}>
          <textarea rows={2} maxLength={250} {...campo("nota_explicativa")} placeholder="O que aconteceu" />
        </Label>
        <Label texto="Documento (boletim, laudo, termo)">
          <input type="file" accept="application/pdf,image/*" className="input" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </Label>
      </div>
    </Modal>
  );
}

// ── Transferência entre tanques ────────────────────────────────────────────

export function TransferenciaModal({
  aberto,
  onClose,
  tanque,
  tanques,
  onConcluido,
}: {
  aberto: boolean;
  onClose: () => void;
  tanque: Tanque;
  tanques: Tanque[];
  onConcluido: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [destinoId, setDestinoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const { justificativa, setJustificativa, valida } = useJustificativa();

  useEffect(() => {
    if (aberto) {
      setDestinoId("");
      setQuantidade("");
      setJustificativa("");
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const destinos = tanques.filter((t) => t.id !== tanque.id && t.combustivel_id === tanque.combustivel_id);
  const destino = tanques.find((t) => t.id === destinoId);
  const disponivelOrigem = Number(tanque.estoque_atual);
  const capacidadeDestino = destino ? Math.max(Number(destino.capacidade_maxima) - Number(destino.estoque_atual), 0) : 0;

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo="Transferir combustível"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={salvando || !destinoId || !Number(quantidade) || !valida}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.transferirEstoque({
                  tanque_origem_id: tanque.id,
                  tanque_destino_id: destinoId,
                  quantidade,
                  justificativa: justificativa.trim(),
                });
                toast.success("Transferência realizada.");
                onConcluido();
                onClose();
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Transferindo…" : "Transferir"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-body-sm">
        <div className="rounded-btn bg-surface-bg px-3 py-2 text-meta text-text-subtle">
          Origem: <span className="font-medium text-text-title">{tanque.nome}</span> · disponível <span className="font-medium">{disponivelOrigem.toLocaleString("pt-BR")} L</span>
        </div>
        <Label texto="Tanque destino *">
          <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">Selecione…</option>
            {destinos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Label>
        {destino && (
          <div className="text-meta text-text-subtle">
            Capacidade disponível no destino: <span className="font-medium text-text-body">{capacidadeDestino.toLocaleString("pt-BR")} L</span>
          </div>
        )}
        <Label texto="Quantidade (L) *">
          <input autoFocus type="number" step="0.01" min={0} max={disponivelOrigem} className="input" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        </Label>
        {Number(quantidade) > disponivelOrigem && <p className="text-meta text-[#BA1A1A]">Quantidade maior que o saldo disponível na origem.</p>}
        {destino && Number(quantidade) > capacidadeDestino && <p className="text-meta text-[#BA1A1A]">A transferência excede a capacidade disponível no destino.</p>}
        <Label texto="Justificativa *">
          <textarea rows={3} className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Motivo da transferência" />
        </Label>
      </div>
    </Modal>
  );
}

// ── Cancelamento de entrada ────────────────────────────────────────────────

export function CancelarEntradaModal({
  aberto,
  onClose,
  entradaId,
  entradaRef,
  onConcluido,
}: {
  aberto: boolean;
  onClose: () => void;
  entradaId: string;
  entradaRef: string;
  onConcluido: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const { justificativa, setJustificativa, valida } = useJustificativa();

  useEffect(() => {
    if (aberto) {
      setJustificativa("");
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo="Cancelar entrada"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Voltar</button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={salvando || !valida}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.cancelarEntrada(entradaId, justificativa.trim());
                toast.success("Entrada cancelada e estoque estornado.");
                onConcluido();
                onClose();
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Cancelando…" : "Cancelar entrada"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-body-sm">
        <p className="text-meta text-text-subtle">
          A entrada <strong className="text-text-title">{entradaRef}</strong> será cancelada e o volume será estornado do estoque do tanque.
        </p>
        <Label texto="Justificativa *">
          <textarea rows={3} className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Motivo do cancelamento" />
        </Label>
      </div>
    </Modal>
  );
}
