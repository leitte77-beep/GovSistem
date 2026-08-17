import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ExternalLink } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, EstadoErro, Input } from "@/ui";
import { ErroApi } from "@/nucleo/http/erroApi";

interface Contrato {
  id: string;
  numero: string;
  valor_global: number;
  vigencia_inicio: string;
  vigencia_fim: string;
  status: string;
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AbaContrato({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeGerenciar = usePermissao("govcompras.contratos.gerenciar");

  const { data: contrato, isLoading } = useQuery({
    queryKey: ["processo", processoId, "contrato"],
    queryFn: () => api.get<Contrato | null>(`/processos/${processoId}/contrato`),
  });

  const [form, setForm] = useState({
    vigencia_inicio: new Date().toISOString().slice(0, 10),
    vigencia_fim: "",
  });
  const [erro, setErro] = useState<string | null>(null);

  const gerar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/gerar-contrato`, form),
    onSuccess: () => {
      toast.success("Contrato gerado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["processo", processoId] });
    },
    onError: (e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível gerar o contrato."),
  });

  if (isLoading) return <p className="text-xs text-slate-400">Carregando…</p>;

  if (contrato) {
    return (
      <Cartao>
        <CartaoCabecalho titulo={`Contrato ${contrato.numero}`} />
        <CartaoCorpo className="space-y-2">
          <p className="text-sm text-slate-700">Valor global: {formatarMoeda(contrato.valor_global)}</p>
          <p className="text-sm text-slate-700">
            Vigência: {new Date(contrato.vigencia_inicio).toLocaleDateString("pt-BR")} a{" "}
            {new Date(contrato.vigencia_fim).toLocaleDateString("pt-BR")}
          </p>
          <Link to={`/contratos/${contrato.id}`}>
            <Botao tamanho="sm" variante="secundario" icone={<ExternalLink className="size-3.5" />}>
              Abrir gestão contratual completa
            </Botao>
          </Link>
        </CartaoCorpo>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Gerar contrato"
        descricao="Disponível após a homologação do processo (seção 44-45)"
      />
      <CartaoCorpo className="space-y-3">
        {erro && <EstadoErro mensagem={erro} />}
        <Campo rotulo="Início da vigência" obrigatorio>
          <Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} />
        </Campo>
        <Campo rotulo="Fim da vigência" obrigatorio>
          <Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} />
        </Campo>
        {podeGerenciar && (
          <Botao onClick={() => gerar.mutate()} carregando={gerar.isPending} disabled={!form.vigencia_fim}>
            Gerar contrato
          </Botao>
        )}
      </CartaoCorpo>
    </Cartao>
  );
}
