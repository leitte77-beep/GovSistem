import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Edit3, Trash2 } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";
import { avisar } from "@/ui/Toast";
import { Botao } from "@/ui/Botao";
import { Chip } from "@/ui/Chip";

interface TipoBeneficio {
  id: string;
  code: string;
  nome: string;
  source: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
  categoria: string | null;
  unidade_medida: string | null;
  exige_parecer: boolean;
  periodicidade_max_dias: number | null;
}

const CATEGORIAS = ["ALIMENTACAO", "NATALIDADE", "FUNERAL", "HABITACAO", "EDUCACAO", "SAUDE", "TRANSFERENCIA", "DOCUMENTACAO", "ENXOVAL", "OUTRA"];
const UNIDADES = ["UNIDADE", "CESTA", "KIT", "KG", "LITRO", "METRO", "PASSAGEM"];

export default function TiposBeneficioAdmin() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<TipoBeneficio | null>(null);
  const [criando, setCriando] = useState(false);

  const { data = [], isLoading } = useQuery<TipoBeneficio[]>({
    queryKey: ["benefit-types-admin"],
    queryFn: () => http.get<TipoBeneficio[]>("/benefit-types?ativo="),
  });

  const criarMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      http.post("/benefit-types", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["benefit-types-admin"] });
      avisar.sucesso("Tipo de benefício criado.");
      setCriando(false);
    },
    onError: () => avisar.erro("Erro ao criar tipo de benefício."),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      http.patch(`/benefit-types/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["benefit-types-admin"] });
      avisar.sucesso("Tipo de benefício atualizado.");
      setEditando(null);
    },
    onError: () => avisar.erro("Erro ao atualizar."),
  });

  const desativarMut = useMutation({
    mutationFn: (id: string) => http.delete(`/benefit-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["benefit-types-admin"] });
      avisar.sucesso("Tipo de benefício desativado.");
    },
    onError: () => avisar.erro("Erro ao desativar."),
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tipos de Benefício</h1>
          <p className="text-sm text-ink-soft mt-1">
            Gerencie os tipos de benefício disponíveis para concessão (vale-gás, cesta básica, etc.)
          </p>
        </div>
        <Botao variante="primario" onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo tipo
        </Botao>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">Carregando...</p>}

      {!isLoading && data.length === 0 && (
        <p className="text-sm text-ink-soft">Nenhum tipo de benefício cadastrado.</p>
      )}

      {data.length > 0 && (
        <div className="overflow-x-auto border rounded-cartao">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Parecer</th>
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
                  <td className="px-4 py-2">{t.categoria || "-"}</td>
                  <td className="px-4 py-2">{t.unidade_medida || "-"}</td>
                  <td className="px-4 py-2">{t.exige_parecer ? "Sim" : "Não"}</td>
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
        <button type="button" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 cursor-pointer" onClick={() => { setCriando(false); setEditando(null); }}>
          <div className="w-full max-w-lg rounded-cartao bg-surface p-6 shadow-elevado max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">
              {editando ? "Editar tipo de benefício" : "Novo tipo de benefício"}
            </h2>
            <FormularioBeneficio
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
        </button>
      )}
    </div>
  );
}

function FormularioBeneficio({
  inicial,
  aoSalvar,
  aoCancelar,
  salvando,
}: {
  inicial: TipoBeneficio | null;
  aoSalvar: (d: Record<string, unknown>) => void;
  aoCancelar: () => void;
  salvando: boolean;
}) {
  const [code, setCode] = useState(inicial?.code || "");
  const [nome, setNome] = useState(inicial?.nome || "");
  const [categoria, setCategoria] = useState(inicial?.categoria || "");
  const [unidadeMedida, setUnidadeMedida] = useState(inicial?.unidade_medida || "UNIDADE");
  const [exigeParecer, setExigeParecer] = useState(inicial?.exige_parecer ?? false);
  const [periodicidade, setPeriodicidade] = useState(inicial?.periodicidade_max_dias?.toString() || "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [vigenciaInicio, setVigenciaInicio] = useState(inicial?.vigencia_inicio?.split("T")[0] || new Date().toISOString().split("T")[0]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nome.trim()) return;
    aoSalvar({
      code: code.trim().toUpperCase(),
      nome: nome.trim(),
      categoria: categoria || null,
      unidade_medida: unidadeMedida || null,
      exige_parecer: exigeParecer,
      periodicidade_max_dias: periodicidade ? parseInt(periodicidade) : null,
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
            placeholder="Ex: VALE_GAS"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Unidade</span>
          <select
            className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={unidadeMedida}
            onChange={(e) => setUnidadeMedida(e.target.value)}
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{u}</option>
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
          placeholder="Ex: Vale-Gás / Auxílio-gás de cozinha"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Categoria</span>
          <select
            className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">Nenhuma</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Limite de dias (anti-duplicidade)</span>
          <input
            type="number"
            className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={periodicidade}
            onChange={(e) => setPeriodicidade(e.target.value)}
            placeholder="Ex: 30"
            min="0"
          />
        </label>
      </div>

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
        <div className="flex items-end gap-4 pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={exigeParecer} onChange={(e) => setExigeParecer(e.target.checked)} />
            Exige parecer
          </label>
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
