import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ExternalLink } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Abas, Botao, Campo, Cartao, CartaoCorpo, Chip, ChipStatus, EstadoVazio, Input, Modal, Select, Textarea } from "@/ui";

interface Contrato {
  id: string;
  numero: string;
  processo_id: string;
  objeto: string;
  fornecedor_nome: string | null;
  valor_global: number;
  vigencia_inicio: string;
  vigencia_fim: string;
  gestor_nome: string | null;
  fiscal_nome: string | null;
  status: string;
  dias_para_vencer: number;
  percentual_vigencia_transcorrida: number;
}
interface Saldo {
  valor_global: number;
  valor_empenhado: number;
  valor_liquidado: number;
  valor_pago: number;
  saldo_disponivel: number;
}
interface Aditivo {
  id: string;
  numero: string;
  tipo: string;
  justificativa: string;
  data: string;
}
interface Ocorrencia {
  id: string;
  descricao: string;
  classificacao: string;
  status: string;
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ABAS = [
  { chave: "saldo", rotulo: "Saldo" },
  { chave: "aditivos", rotulo: "Aditivos" },
  { chave: "fiscalizacao", rotulo: "Fiscalização" },
  { chave: "vencimento", rotulo: "Vencimento" },
];

export function ContratoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [aba, setAba] = useState("saldo");
  const { data: contrato, isLoading } = useQuery({
    queryKey: ["contrato", id],
    queryFn: () => api.get<Contrato>(`/contratos/${id}`),
    enabled: !!id,
  });

  if (isLoading || !contrato) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Contrato {contrato.numero}</h1>
            <ChipStatus status={contrato.status} />
          </div>
          <p className="text-sm text-slate-600">{contrato.objeto}</p>
          <p className="text-xs text-slate-400">{contrato.fornecedor_nome}</p>
        </div>
        <Link to={`/processos/${contrato.processo_id}`} className="text-xs font-medium text-brand-700 hover:underline">
          <span className="inline-flex items-center gap-1">
            Ver processo de origem <ExternalLink className="size-3" />
          </span>
        </Link>
      </div>

      <Cartao className="p-4">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{new Date(contrato.vigencia_inicio).toLocaleDateString("pt-BR")}</span>
          <span>{new Date(contrato.vigencia_fim).toLocaleDateString("pt-BR")}</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${contrato.dias_para_vencer <= 30 ? "bg-red-500" : contrato.dias_para_vencer <= 90 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, contrato.percentual_vigencia_transcorrida)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {contrato.percentual_vigencia_transcorrida}% da vigência transcorrida ·{" "}
          {contrato.dias_para_vencer >= 0 ? `vence em ${contrato.dias_para_vencer} dia(s)` : `venceu há ${-contrato.dias_para_vencer} dia(s)`}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-3">
          <p>
            <span className="text-slate-400">Valor global</span>
            <br />
            <strong>{formatarMoeda(contrato.valor_global)}</strong>
          </p>
          <p>
            <span className="text-slate-400">Gestor</span>
            <br />
            <strong>{contrato.gestor_nome ?? "Não definido"}</strong>
          </p>
          <p>
            <span className="text-slate-400">Fiscal</span>
            <br />
            <strong>{contrato.fiscal_nome ?? "Não definido"}</strong>
          </p>
        </div>
      </Cartao>

      <Cartao>
        <Abas itens={ABAS} ativa={aba} aoSelecionar={setAba} />
        <CartaoCorpo>
          {aba === "saldo" && <SecaoSaldo contratoId={contrato.id} />}
          {aba === "aditivos" && <SecaoAditivos contratoId={contrato.id} />}
          {aba === "fiscalizacao" && <SecaoFiscalizacao contratoId={contrato.id} />}
          {aba === "vencimento" && <SecaoVencimento contrato={contrato} />}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}

function SecaoSaldo({ contratoId }: { contratoId: string }) {
  const { data } = useQuery({
    queryKey: ["contrato", contratoId, "saldo"],
    queryFn: () => api.get<Saldo>(`/contratos/${contratoId}/saldo`),
  });
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["Valor global", data.valor_global],
        ["Empenhado", data.valor_empenhado],
        ["Liquidado", data.valor_liquidado],
        ["Saldo disponível", data.saldo_disponivel],
      ].map(([rotulo, valor]) => (
        <div key={rotulo as string} className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{rotulo}</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{formatarMoeda(valor as number)}</p>
        </div>
      ))}
    </div>
  );
}

function SecaoAditivos({ contratoId }: { contratoId: string }) {
  const queryClient = useQueryClient();
  const podeGerenciar = usePermissao("govcompras.contratos.gerenciar");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ numero: "", tipo: "prazo", justificativa: "", data: new Date().toISOString().slice(0, 10) });

  const { data } = useQuery({
    queryKey: ["contrato", contratoId, "aditivos"],
    queryFn: () => api.get<Aditivo[]>(`/contratos/${contratoId}/aditivos`),
  });

  const criar = useMutation({
    mutationFn: () => api.post(`/contratos/${contratoId}/aditivos`, form),
    onSuccess: () => {
      toast.success("Aditivo registrado.");
      setModalAberto(false);
      queryClient.invalidateQueries({ queryKey: ["contrato", contratoId, "aditivos"] });
    },
  });

  return (
    <div className="space-y-3">
      {!data?.length ? (
        <EstadoVazio titulo="Nenhum aditivo registrado" />
      ) : (
        <ul className="space-y-2">
          {data.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">Aditivo {a.numero}</p>
                <Chip cor="neutro">{a.tipo}</Chip>
              </div>
              <p className="text-xs text-slate-500">{a.justificativa}</p>
            </li>
          ))}
        </ul>
      )}
      {podeGerenciar && (
        <Botao tamanho="sm" variante="secundario" onClick={() => setModalAberto(true)}>
          Novo aditivo
        </Botao>
      )}
      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo="Novo termo aditivo"
        rodape={
          <Botao onClick={() => criar.mutate()} carregando={criar.isPending} disabled={!form.numero || !form.justificativa}>
            Registrar
          </Botao>
        }
      >
        <div className="space-y-3">
          <Campo rotulo="Número">
            <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="prazo">Prazo</option>
              <option value="valor">Valor</option>
              <option value="quantitativo">Quantitativo</option>
              <option value="acrescimo">Acréscimo</option>
              <option value="supressao">Supressão</option>
              <option value="outros">Outros</option>
            </Select>
          </Campo>
          <Campo rotulo="Justificativa" obrigatorio>
            <Textarea value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} />
          </Campo>
        </div>
      </Modal>
    </div>
  );
}

function SecaoFiscalizacao({ contratoId }: { contratoId: string }) {
  const queryClient = useQueryClient();
  const podeRegistrar = usePermissao("govcompras.fiscalizacao.registrar");
  const [texto, setTexto] = useState("");
  const [classificacao, setClassificacao] = useState("informativa");

  const { data } = useQuery({
    queryKey: ["contrato", contratoId, "ocorrencias"],
    queryFn: () => api.get<Ocorrencia[]>(`/contratos/${contratoId}/ocorrencias`),
  });

  const registrar = useMutation({
    mutationFn: () => api.post(`/contratos/${contratoId}/ocorrencias`, { descricao: texto, classificacao }),
    onSuccess: () => {
      toast.success("Ocorrência registrada.");
      setTexto("");
      queryClient.invalidateQueries({ queryKey: ["contrato", contratoId, "ocorrencias"] });
    },
  });

  const corClassificacao: Record<string, "neutro" | "amarelo" | "laranja" | "vermelho"> = {
    informativa: "neutro",
    atencao: "amarelo",
    irregularidade: "laranja",
    grave: "vermelho",
  };

  return (
    <div className="space-y-3">
      {!data?.length ? (
        <EstadoVazio titulo="Nenhuma ocorrência registrada" />
      ) : (
        <ul className="space-y-2">
          {data.map((o) => (
            <li key={o.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Chip cor={corClassificacao[o.classificacao] ?? "neutro"}>{o.classificacao}</Chip>
                <Chip cor={o.status === "resolvida" ? "verde" : "amarelo"}>{o.status}</Chip>
              </div>
              <p className="mt-1 text-sm text-slate-700">{o.descricao}</p>
            </li>
          ))}
        </ul>
      )}
      {podeRegistrar && (
        <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
          <Select value={classificacao} onChange={(e) => setClassificacao(e.target.value)}>
            <option value="informativa">Informativa</option>
            <option value="atencao">Atenção</option>
            <option value="irregularidade">Irregularidade</option>
            <option value="grave">Grave</option>
          </Select>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Descreva a ocorrência de fiscalização" />
          <Botao tamanho="sm" onClick={() => registrar.mutate()} carregando={registrar.isPending} disabled={!texto.trim()}>
            Registrar ocorrência
          </Botao>
        </div>
      )}
    </div>
  );
}

function SecaoVencimento({ contrato }: { contrato: Contrato }) {
  const navegar = useNavigate();
  const podeGerenciar = usePermissao("govcompras.contratos.gerenciar");
  const decidir = useMutation({
    mutationFn: (decisao: string) => api.post<{ processo_sucessor_id?: string; mensagem?: string }>(`/contratos/${contrato.id}/decisao-vencimento`, { decisao }),
    onSuccess: (dados) => {
      if (dados.processo_sucessor_id) {
        toast.success("Processo sucessor criado.");
        navegar(`/processos/${dados.processo_sucessor_id}`);
      } else {
        toast.success(dados.mensagem ?? "Decisão registrada.");
      }
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        Este contrato {contrato.dias_para_vencer >= 0 ? `vence em ${contrato.dias_para_vencer} dias` : `venceu há ${-contrato.dias_para_vencer} dias`}. O
        que será feito?
      </p>
      {podeGerenciar && contrato.status === "vigente" && (
        <div className="flex flex-wrap gap-2">
          <Botao tamanho="sm" onClick={() => decidir.mutate("nova_contratacao")} carregando={decidir.isPending}>
            Nova contratação
          </Botao>
          <Botao tamanho="sm" variante="secundario" onClick={() => decidir.mutate("prorrogacao")}>
            Prorrogação
          </Botao>
          <Botao tamanho="sm" variante="perigo" onClick={() => decidir.mutate("encerramento")}>
            Encerramento
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => decidir.mutate("analisar_depois")}>
            Analisar depois
          </Botao>
        </div>
      )}
    </div>
  );
}
