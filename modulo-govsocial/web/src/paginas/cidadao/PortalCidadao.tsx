import { useState } from "react";
import { Calendar, Gift, ArrowRightCircle, LogIn, UserCheck } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";
import { Skeleton } from "@/ui/Skeleton";

interface CidadaoDados {
  nome: string;
  nome_social: string | null;
  familia_codigo: number | null;
  bairro: string | null;
}

interface AgendamentoItem {
  id: string;
  data: string;
  horario: string;
  unidade: string;
  servico: string;
  status: string;
}

interface BeneficioItem {
  id: string;
  tipo: string;
  status: string;
  data_solicitacao: string | null;
  data_entrega: string | null;
  valor: number | null;
}

interface EncaminhamentoItem {
  id: string;
  tipo: string;
  destino: string;
  data: string;
  status: string;
}

const STATUS_BENEFICIO: Record<string, string> = {
  SOLICITADO: "Solicitado",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  NEGADO: "Negado",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const STATUS_COR: Record<string, string> = {
  SOLICITADO: "bg-yellow-100 text-yellow-800",
  EM_ANALISE: "bg-blue-100 text-blue-800",
  APROVADO: "bg-green-100 text-green-800",
  ENTREGUE: "bg-green-100 text-green-800",
  NEGADO: "bg-red-100 text-red-800",
  CANCELADO: "bg-gray-100 text-gray-600",
};

export default function PortalCidadao() {
  const [cpf, setCpf] = useState("");
  const [dataNasc, setDataNasc] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [dados, setDados] = useState<CidadaoDados | null>(null);
  const [aba, setAba] = useState<"agenda" | "beneficios" | "encaminhamentos">("agenda");
  const [agendamentos, setAgendamentos] = useState<AgendamentoItem[]>([]);
  const [beneficios, setBeneficios] = useState<BeneficioItem[]>([]);
  const [encaminhamentos, setEncaminhamentos] = useState<EncaminhamentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [erroDados, setErroDados] = useState("");

  const login = async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setErro("CPF deve ter 11 dígitos.");
      return;
    }
    if (!dataNasc) {
      setErro("Informe a data de nascimento.");
      return;
    }
    setErro("");
    setLoading(true);
    try {
      const res = await http.post<{ token: string; dados: CidadaoDados }>("/cidadao/login", {
        cpf: cleanCpf,
        data_nascimento: dataNasc,
      });
      setDados(res.dados);
      setAutenticado(true);
      await carregarDados(cleanCpf);
    } catch (e: unknown) {
      const err = e as { body?: { detail?: string } };
      setErro(err?.body?.detail || "Erro ao autenticar. Verifique seus dados.");
    }
    setLoading(false);
  };

  const carregarDados = async (cpfValue: string) => {
    const cleanCpf = cpfValue.replace(/\D/g, "");
    setErroDados("");
    let falhas = 0;
    try {
      const [ag, ben, enc] = await Promise.all([
        http.get<AgendamentoItem[]>(`/cidadao/agendamentos?cpf=${cleanCpf}&data_nascimento=${dataNasc}`).catch(() => { falhas++; return []; }),
        http.get<BeneficioItem[]>(`/cidadao/beneficios?cpf=${cleanCpf}&data_nascimento=${dataNasc}`).catch(() => { falhas++; return []; }),
        http.get<EncaminhamentoItem[]>(`/cidadao/encaminhamentos?cpf=${cleanCpf}&data_nascimento=${dataNasc}`).catch(() => { falhas++; return []; }),
      ]);
      setAgendamentos(ag);
      setBeneficios(ben);
      setEncaminhamentos(enc);
      if (falhas === 3) {
        setErroDados("Não foi possível carregar seus dados. Tente novamente mais tarde.");
      }
    } catch {
      setErroDados("Não foi possível carregar seus dados. Tente novamente mais tarde.");
    }
  };

  const formatarData = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
    } catch {
      return d;
    }
  };

  if (loading) return <Skeleton variante="cartao" className="max-w-md mx-auto mt-20" />;

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-premium p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center">
              <UserCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-ink">Portal do Cidadão</h1>
            <p className="text-sm text-ink-soft">Consulte seus agendamentos, benefícios e encaminhamentos</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="cpf" className="block text-sm font-medium text-ink mb-1">CPF</label>
              <input
                id="cpf"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full border rounded-input px-3 py-2.5 text-sm bg-surface"
                onKeyDown={e => e.key === "Enter" && login()}
              />
            </div>
            <div>
              <label htmlFor="nasc" className="block text-sm font-medium text-ink mb-1">Data de Nascimento</label>
              <input
                id="nasc"
                type="date"
                value={dataNasc}
                onChange={e => setDataNasc(e.target.value)}
                className="w-full border rounded-input px-3 py-2.5 text-sm bg-surface"
                onKeyDown={e => e.key === "Enter" && login()}
              />
            </div>
            {erro && (
              <div className="bg-error-container text-on-error-container text-sm p-3 rounded-lg" role="alert">
                {erro}
              </div>
            )}
            <button
              onClick={login}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-surface-container-lowest rounded-2xl shadow-premium p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-ink">
                Olá, {dados?.nome_social || dados?.nome}
              </h1>
              {dados?.nome_social && (
                <p className="text-sm text-ink-soft">{dados.nome}</p>
              )}
              <p className="text-xs text-ink-soft mt-1">
                {dados?.familia_codigo && <>Família #{dados.familia_codigo}</>}
                {dados?.bairro && <> · {dados.bairro}</>}
              </p>
            </div>
            <button
              onClick={() => { setAutenticado(false); setDados(null); }}
              className="text-sm text-primary hover:underline"
            >
              Sair
            </button>
          </div>
        </div>

        {erroDados && (
          <div className="bg-error-container text-on-error-container text-sm p-3 rounded-lg" role="alert">
            {erroDados}
          </div>
        )}

        <div className="flex gap-2 border-b border-outline-variant pb-0">
          {[
            { key: "agenda", label: "Agenda", icon: Calendar },
            { key: "beneficios", label: "Benefícios", icon: Gift },
            { key: "encaminhamentos", label: "Encaminhamentos", icon: ArrowRightCircle },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAba(key as typeof aba)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                aba === key
                  ? "text-primary border-b-2 border-primary bg-primary-soft/50"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {aba === "agenda" && (
          <div className="space-y-3">
            {agendamentos.length === 0 ? (
              <div className="text-center py-12 text-ink-soft">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum agendamento encontrado</p>
              </div>
            ) : (
              agendamentos.map(a => (
                <div key={a.id} className="bg-surface-container-lowest rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{a.servico}</p>
                    <p className="text-sm text-ink-soft">{a.unidade}</p>
                    <p className="text-xs text-ink-soft mt-1">
                      {formatarData(a.data)} às {a.horario}
                    </p>
                  </div>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    {a.status === "CONFIRMADO" ? "Confirmado" : "Agendado"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {aba === "beneficios" && (
          <div className="space-y-3">
            {beneficios.length === 0 ? (
              <div className="text-center py-12 text-ink-soft">
                <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum benefício encontrado</p>
              </div>
            ) : (
              beneficios.map(b => (
                <div key={b.id} className="bg-surface-container-lowest rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{b.tipo}</p>
                    <p className="text-xs text-ink-soft">
                      {b.data_solicitacao && `Solicitado em ${formatarData(b.data_solicitacao)}`}
                      {b.data_entrega && ` · Entregue em ${formatarData(b.data_entrega)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    {b.valor != null && b.valor > 0 && (
                      <p className="font-bold text-ink">R$ {b.valor.toFixed(2)}</p>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COR[b.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_BENEFICIO[b.status] || b.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {aba === "encaminhamentos" && (
          <div className="space-y-3">
            {encaminhamentos.length === 0 ? (
              <div className="text-center py-12 text-ink-soft">
                <ArrowRightCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum encaminhamento encontrado</p>
              </div>
            ) : (
              encaminhamentos.map(e => (
                <div key={e.id} className="bg-surface-container-lowest rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{e.tipo}</p>
                    <p className="text-sm text-ink-soft">{e.destino}</p>
                    <p className="text-xs text-ink-soft mt-1">{formatarData(e.data)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COR[e.status] || "bg-gray-100 text-gray-600"}`}>
                    {e.status === "ACEITO" ? "Aceito" : e.status === "RECUSADO" ? "Recusado" : "Pendente"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
