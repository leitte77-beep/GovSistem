import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { servicoEstoque } from "@/nucleo/api/estoque";
import { servicoBeneficios } from "@/nucleo/api/beneficios";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { Botao } from "@/ui/Botao";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Tabela, type Coluna } from "@/ui/Tabela";
import { Modal } from "@/ui/Modal";
import { avisar } from "@/ui/Toast";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { Chip } from "@/ui/Chip";
import { SlideOver } from "@/ui/SlideOver";
import type { EstoqueListItem, EstoqueCreate, EstoqueMovement } from "@/tipos/estoque";
import type { BenefitTypeOut } from "@/tipos/dominios";
import { Plus, ArrowDownUp, AlertTriangle } from "lucide-react";

function fmt(val: number): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EstoquePainel() {
  const qc = useQueryClient();
  const { unidadeAtual } = useUnidadeAtual();
  const [filtroUnidade] = useState(unidadeAtual?.id ?? "");
  const [modalNovo, setModalNovo] = useState(false);
  const [modalMov, setModalMov] = useState<EstoqueListItem | null>(null);

  const { data: tipos } = useQuery({
    queryKey: ["benefit-types"],
    queryFn: () => servicoBeneficios.tipos(),
  });

  const { data: itens, isLoading, error, refetch } = useQuery({
    queryKey: ["estoque", filtroUnidade],
    queryFn: () => servicoEstoque.listar(filtroUnidade ? { unit_id: filtroUnidade } : undefined),
  });

  const criar = useMutation({
    mutationFn: (c: EstoqueCreate) => servicoEstoque.criar(c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["estoque"] }); setModalNovo(false); avisar.sucesso("Item criado."); },
    onError: () => avisar.erro("Erro ao criar item."),
  });

  const movimentar = useMutation({
    mutationFn: ({ id, corpo }: { id: string; corpo: EstoqueMovement }) => servicoEstoque.movimentar(id, corpo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["estoque"] }); setModalMov(null); avisar.sucesso("Movimentação registrada."); },
    onError: () => avisar.erro("Erro na movimentação."),
  });

  const tipoLabel = (code: string) => tipos?.find((t) => t.code === code)?.nome ?? code;

  const colunas: Coluna<EstoqueListItem>[] = [
    { chave: "tipo", titulo: "Tipo de benefício", render: (i) => <span className="font-medium">{tipoLabel(i.benefit_type_code)}</span> },
    { chave: "unidade", titulo: "Unidade", render: (i) => <span className="text-ink-soft text-sm">{i.unit_nome ?? i.unit_id}</span> },
    {
      chave: "atual", titulo: "Atual", alinhamento: "direita", render: (i) => (
        <span className={i.quantidade_atual <= i.quantidade_minima ? "text-danger font-semibold" : ""}>
          {fmt(i.quantidade_atual)}
          {i.quantidade_atual <= i.quantidade_minima && (
            <Chip cor="danger" className="ml-2"><AlertTriangle className="h-3 w-3" /> Baixo</Chip>
          )}
        </span>
      ),
    },
    { chave: "minimo", titulo: "Mínimo", alinhamento: "direita", render: (i) => <span className="text-ink-soft">{fmt(i.quantidade_minima)}</span> },
    { chave: "medida", titulo: "Medida", render: (i) => i.unidade_medida },
    { chave: "ref", titulo: "Ref. (R$)", alinhamento: "direita", render: (i) => i.valor_unitario_referencia != null ? `R$ ${fmt(i.valor_unitario_referencia)}` : "—" },
    {
      chave: "acoes", titulo: "", render: (i) => (
        <Botao variante="texto" tamanho="sm" onClick={() => setModalMov(i)}>
          <ArrowDownUp className="h-4 w-4" />
        </Botao>
      ),
    },
  ];

  if (error) return <EstadoErro aoTentarNovamente={() => refetch()} />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Estoque</h1>
          <p className="text-sm text-ink-soft">Controle de itens por unidade e tipo de benefício</p>
        </div>
        <Botao variante="primario" onClick={() => setModalNovo(true)}>
          <Plus className="h-4 w-4" /> Novo item
        </Botao>
      </div>

      {isLoading ? (
        <Skeleton variante="cartao" />
      ) : !itens?.length ? (
        <EstadoVazio titulo="Nenhum item no estoque" descricao="Cadastre itens para começar o controle de estoque por unidade." />
      ) : (
        <Tabela
          colunas={colunas}
          dados={itens}
          chaveLinha={(i) => i.id}
          caption="Itens do estoque por unidade"
        />
      )}

      {modalNovo && (
        <ModalEstoqueNovo
          tipos={tipos ?? []}
          unidadePadrao={unidadeAtual?.id}
          onClose={() => setModalNovo(false)}
          onSalvar={(c) => criar.mutate(c)}
          salvando={criar.isPending}
        />
      )}

      {modalMov && (
        <ModalMovimentacao
          item={modalMov}
          tipoLabel={tipoLabel(modalMov.benefit_type_code)}
          onClose={() => setModalMov(null)}
          onSalvar={(c) => movimentar.mutate({ id: modalMov.id, corpo: c })}
          salvando={movimentar.isPending}
        />
      )}
    </div>
  );
}

function ModalEstoqueNovo({
  tipos, unidadePadrao, onClose, onSalvar, salvando,
}: {
  tipos: BenefitTypeOut[];
  unidadePadrao?: string;
  onClose: () => void;
  onSalvar: (c: EstoqueCreate) => void;
  salvando: boolean;
}) {
  const [form, setForm] = useState<EstoqueCreate>({
    unit_id: unidadePadrao ?? "",
    benefit_type_code: "",
    quantidade_inicial: 0,
    quantidade_minima: 0,
    unidade_medida: "UNIDADE",
    valor_unitario_referencia: null,
  });

  return (
    <SlideOver aberto={true} aoFechar={onClose} titulo="Novo item de estoque">
      <div className="space-y-4">
        <Select
          label="Tipo de benefício"
          value={form.benefit_type_code}
          onChange={(e) => setForm({ ...form, benefit_type_code: e.target.value })}
          opcoes={tipos.map((t) => ({ valor: t.code, rotulo: t.nome }))}
        />
        <Input label="Quantidade inicial" type="number" value={String(form.quantidade_inicial)} onChange={(e) => setForm({ ...form, quantidade_inicial: Number(e.target.value) || 0 })} />
        <Input label="Quantidade mínima (alerta)" type="number" value={String(form.quantidade_minima)} onChange={(e) => setForm({ ...form, quantidade_minima: Number(e.target.value) || 0 })} />
        <Input label="Unidade de medida" value={form.unidade_medida ?? ""} onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })} />
        <Input label="Valor unitário de referência (R$)" type="number" value={form.valor_unitario_referencia != null ? String(form.valor_unitario_referencia) : ""} onChange={(e) => setForm({ ...form, valor_unitario_referencia: e.target.value ? Number(e.target.value) : null })} />
        <div className="flex gap-3 pt-2">
          <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" onClick={() => onSalvar(form)} carregando={salvando}>Salvar</Botao>
        </div>
      </div>
    </SlideOver>
  );
}

function ModalMovimentacao({
  item, tipoLabel, onClose, onSalvar, salvando,
}: {
  item: EstoqueListItem;
  tipoLabel: string;
  onClose: () => void;
  onSalvar: (c: EstoqueMovement) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [quantidade, setQuantidade] = useState(1);
  const [obs, setObs] = useState("");

  const valor = tipo === "entrada" ? quantidade : -Math.abs(quantidade);
  const insuficiente = tipo === "saida" && quantidade > item.quantidade_atual;

  return (
    <Modal aberto={true} aoFechar={onClose} titulo="Movimentar estoque">
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          {tipoLabel} — Atual: <strong>{fmt(item.quantidade_atual)}</strong> {item.unidade_medida}
        </p>
        <div className="flex gap-2">
          <Botao variante={tipo === "entrada" ? "primario" : "secundario"} onClick={() => setTipo("entrada")}>Entrada</Botao>
          <Botao variante={tipo === "saida" ? "perigo" : "secundario"} onClick={() => setTipo("saida")}>Saída</Botao>
        </div>
        <Input label="Quantidade" type="number" value={String(quantidade)} onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 0))} />
        <Input label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
        {insuficiente && (
          <p className="text-sm text-danger">Saldo insuficiente! Disponível: {fmt(item.quantidade_atual)}</p>
        )}
        <div className="flex gap-3 pt-2">
          <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" onClick={() => onSalvar({ quantidade: valor, observacao: obs || null })} carregando={salvando} disabled={insuficiente}>
            Confirmar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
