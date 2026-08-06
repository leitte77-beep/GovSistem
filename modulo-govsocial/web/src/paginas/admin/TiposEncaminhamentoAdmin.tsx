import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Edit3, Trash2 } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";
import { avisar } from "@/ui/Toast";
import { Botao } from "@/ui/Botao";
import { Chip } from "@/ui/Chip";

interface TipoEncaminhamento {
  id: string;
  code: string;
  nome: string;
  area: string | null;
  source: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
}

const AREAS = [
  "SAUDE",
  "EDUCACAO",
  "CONSELHO_TUTELAR",
  "CADUNICO",
  "INSS_BPC",
  "REDE_SOCIOASSISTENCIAL",
  "TRABALHO_RENDA",
  "JUDICIARIO",
];

export default function TiposEncaminhamentoAdmin() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<TipoEncaminhamento | null>(null);
  const [criando, setCriando] = useState(false);

  const { data = [], isLoading } = useQuery<TipoEncaminhamento[]>({
    queryKey: ["referral-codes-admin"],
    queryFn: () => http.get<TipoEncaminhamento[]>("/referral-codes?ativo="),
  });

  const criarMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      http.post("/referral-codes", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-codes-admin"] });
      avisar.sucesso("Tipo de encaminhamento criado.");
      setCriando(false);
    },
    onError: () => avisar.erro("Erro ao criar tipo de encaminhamento."),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      http.patch(`/referral-codes/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-codes-admin"] });
      avisar.sucesso("Tipo de encaminhamento atualizado.");
      setEditando(null);
    },
    onError: () => avisar.erro("Erro ao atualizar."),
  });

  const desativarMut = useMutation({
    mutationFn: (id: string) => http.delete(`/referral-codes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-codes-admin"] });
      avisar.sucesso("Tipo de encaminhamento desativado.");
    },
    onError: () => avisar.erro("Erro ao desativar."),
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tipos de Encaminhamento</h1>
          <p className="text-sm text-ink-soft mt-1">
            Gerencie os tipos de encaminhamento disponíveis (Saúde, Conselho Tutelar, Psicóloga, etc.)
          </p>
        </div>
        <Botao variante="primario" onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo tipo
        </Botao>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">Carregando...</p>}

      {!isLoading && data.length === 0 && (
        <p className="text-sm text-ink-soft">Nenhum tipo de encaminhamento cadastrado.</p>
      )}

      {data.length > 0 && (
        <div className="overflow-x-auto border rounded-cartao">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Área</th>
                <th className="px-4 py-3 font-semibold">Origem</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-soft/10">
              {data.map((t) => (
                <tr key={t.id} className={t.ativo ? "" : "opacity-50"}>
                  <td className="px-4 py-2 font-medium">{t.nome}</td>
                  <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
                  <td className="px-4 py-2">{t.area || "-"}</td>
                  <td className="px-4 py-2">
                    <Chip cor={t.source === "NACIONAL" ? "beneficio" : "primario"}>
                      {t.source === "NACIONAL" ? "Nacional" : "Local"}
                    </Chip>
                  </td>
                  <td className="px-4 py-2">
                    {t.ativo ? (
                      <span className="text-green-600 text-xs font-medium">Ativo</span>
                    ) : (
                      <span className="text-red-500 text-xs font-medium">Inativo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 flex gap-1">
                    <button
                      onClick={() => setEditando(t)}
                      className="p-1.5 rounded hover:bg-surface-container-low"
                      title="Editar"
                    >
                      <Edit3 className="h-4 w-4 text-ink-soft" />
                    </button>
                    {t.ativo && (
                      <button
                        onClick={() => {
                          if (confirm(`Desativar "${t.nome}"?`)) desativarMut.mutate(t.id);
                        }}
                        className="p-1.5 rounded hover:bg-surface-container-low"
                        title="Desativar"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(criando || editando) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setCriando(false); setEditando(null); }}>
          <div className="w-full max-w-lg rounded-cartao bg-surface p-6 shadow-elevado max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">
              {editando ? "Editar tipo de encaminhamento" : "Novo tipo de encaminhamento"}
            </h2>
            <FormularioEncaminhamento
              inicial={editando}
              aoSalvar={(dados) => {
                if (editando) {
                  editarMut.mutate({ id: editando.id, ...dados });
                } else {
                  criarMut.mutate(dados);
                }
              }}
              aoCancelar={() => { setCriando(false); setEditando(null); }}
              salvando={criarMut.isPending || editarMut.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FormularioEncaminhamento({
  inicial,
  aoSalvar,
  aoCancelar,
  salvando,
}: {
  inicial: TipoEncaminhamento | null;
  aoSalvar: (d: Record<string, unknown>) => void;
  aoCancelar: () => void;
  salvando: boolean;
}) {
  const [code, setCode] = useState(inicial?.code || "");
  const [nome, setNome] = useState(inicial?.nome || "");
  const [area, setArea] = useState(inicial?.area || "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [vigenciaInicio, setVigenciaInicio] = useState(inicial?.vigencia_inicio?.split("T")[0] || new Date().toISOString().split("T")[0]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nome.trim()) return;
    aoSalvar({
      code: code.trim().toUpperCase(),
      nome: nome.trim(),
      area: area || null,
      ativo,
      vigencia_inicio: vigenciaInicio,
    });
  }

  const ehEdicao = !!inicial;

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Código</span>
          <input
            className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={ehEdicao}
            placeholder="Ex: PSICOLOGA"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Área</span>
          <select
            className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">Nenhuma</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Nome</span>
        <input
          className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Encaminhamento para Psicóloga"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Início de vigência</span>
          <input
            type="date"
            className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={vigenciaInicio}
            onChange={(e) => setVigenciaInicio(e.target.value)}
          />
        </label>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Botao variante="secundario" type="button" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao variante="primario" type="submit" carregando={salvando}>
          {ehEdicao ? "Atualizar" : "Criar"}
        </Botao>
      </div>
    </form>
  );
}
