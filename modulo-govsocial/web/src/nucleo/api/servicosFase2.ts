/** Hooks e serviços adicionais — Fase 2. */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/nucleo/http/clienteHttp";
import { lerAccessToken } from "@/nucleo/auth/tokenStorage";

// ─── DOMICÍLIO ──────────────────────────────────────

export interface DadosDomicilio {
  id: string; family_id: string;
  tipo_construcao: string | null; abastecimento_agua: string | null;
  iluminacao_eletrica: boolean | null; destino_lixo: string | null;
  escoamento_sanitario: string | null; total_comodos: number | null;
  total_dormitorios: number | null; total_pessoas: number | null;
  total_mulheres_gravidas: number | null; total_idosos: number | null;
}

export const servicoDomicilio = {
  obter: (familyId: string) => http.get<DadosDomicilio>(`/families/${familyId}/domicilio`),
  atualizar: (familyId: string, corpo: Partial<DadosDomicilio>) =>
    http.patch<DadosDomicilio>(`/families/${familyId}/domicilio`, corpo),
};

export function useDomicilio(familyId: string) {
  return useQuery({ queryKey: ["domicilio", familyId], queryFn: () => servicoDomicilio.obter(familyId), enabled: !!familyId });
}

// ─── RENDA ──────────────────────────────────────────

export interface RendaMembro { id: string; person_id: string; tipo: string; valor: number; }
export interface DespesaFamiliar { id: string; tipo: string; valor: number; }
export interface RendaDemonstrativo {
  family_id: string; total_membros: number; renda_familiar_total: number;
  renda_per_capita: number; renda_sem_programas: number;
  renda_sem_programas_per_capita: number; total_despesas: number;
  despesas_per_capita: number; faixa_renda: string;
  rendas: RendaMembro[]; despesas: DespesaFamiliar[];
}

export const servicoRenda = {
  demonstrativo: (familyId: string) => http.get<RendaDemonstrativo>(`/families/${familyId}/renda`),
  adicionarRenda: (personId: string, familyId: string, corpo: { person_id: string; tipo: string; valor: number; data_inicio?: string }) =>
    http.post<RendaMembro>(`/persons/${personId}/renda?family_id=${familyId}`, corpo),
  removerRenda: (personId: string, rendaId: string) => http.delete(`/persons/${personId}/renda/${rendaId}`),
  adicionarDespesa: (familyId: string, corpo: { tipo: string; valor: number }) =>
    http.post<DespesaFamiliar>(`/families/${familyId}/despesas`, corpo),
  removerDespesa: (familyId: string, despesaId: string) => http.delete(`/families/${familyId}/despesas/${despesaId}`),
};

export function useRenda(familyId: string) {
  return useQuery({ queryKey: ["renda", familyId], queryFn: () => servicoRenda.demonstrativo(familyId), enabled: !!familyId });
}

// ─── VULNERABILIDADES ──────────────────────────────

export interface VulnerabilidadeOut { id: string; tipo: string; data_inicio: string; data_saida: string | null; observacoes: string | null; }
export const servicoVulnerabilidades = {
  listar: (familyId: string) => http.get<VulnerabilidadeOut[]>(`/families/${familyId}/vulnerabilidades`),
  adicionar: (familyId: string, corpo: { tipo: string; data_inicio: string; observacoes?: string }) =>
    http.post<VulnerabilidadeOut>(`/families/${familyId}/vulnerabilidades`, corpo),
  encerrar: (familyId: string, vulnId: string, data_saida: string) =>
    http.patch<VulnerabilidadeOut>(`/families/${familyId}/vulnerabilidades/${vulnId}?data_saida=${data_saida}`),
};

export function useVulnerabilidades(familyId: string) {
  return useQuery({ queryKey: ["vulnerabilidades", familyId], queryFn: () => servicoVulnerabilidades.listar(familyId), enabled: !!familyId });
}

// ─── QUESTIONÁRIOS ─────────────────────────────────

export interface QuestaoItem { id: string; enunciado: string; tipo: string; obrigatorio: boolean; opcoes: any; ordem?: number; }
export interface QuestionarioOut { id: string; nome: string; descricao: string | null; created_at: string; questoes: QuestaoItem[]; }
export interface RespostaDetalhe { id: string; questionario_id: string; questionario_nome: string; data_preenchimento: string; respostas: { questao_id: string; enunciado: string; valor: string | null }[]; }

export const servicoQuestionarios = {
  listar: () => http.get<QuestionarioOut[]>("/questionarios"),
  obter: (id: string) => http.get<QuestionarioOut>(`/questionarios/${id}`),
  criar: (corpo: any) => http.post<QuestionarioOut>("/questionarios", corpo),
  atualizar: (id: string, corpo: any) => http.patch<QuestionarioOut>(`/questionarios/${id}`, corpo),
  responder: (familyId: string, corpo: any) => http.post(`/families/${familyId}/questionarios/responder`, corpo),
  historico: (familyId: string) => http.get<RespostaDetalhe[]>(`/families/${familyId}/questionarios`),
};

export function useQuestionarios() {
  return useQuery({ queryKey: ["questionarios"], queryFn: () => servicoQuestionarios.listar() });
}

// ─── HABITACIONAL ──────────────────────────────────

export interface ProgramaHabitacional { id: string; nome: string; esfera: string; criterios: any; ativo: boolean; }
export interface DemandaHabitacional { id: string; family_id: string; tipo_demanda: string; status: string; pontuacao: number | null; programa?: ProgramaHabitacional; }
export const servicoHabitacional = {
  listarProgramas: (esfera?: string) => http.get<ProgramaHabitacional[]>(`/programas-habitacionais${esfera ? `?esfera=${esfera}` : ""}`),
  criarPrograma: (corpo: any) => http.post<ProgramaHabitacional>("/programas-habitacionais", corpo),
  listarDemandas: (params?: string) => http.get<DemandaHabitacional[]>(`/demandas-habitacionais${params ? `?${params}` : ""}`),
  criarDemanda: (corpo: any) => http.post<DemandaHabitacional>("/demandas-habitacionais", corpo),
  classificar: (programaId?: string) => http.get<any[]>(`/demandas-habitacionais/classificacao${programaId ? `?programa_id=${programaId}` : ""}`),
};

export function useProgramasHabitacionais(esfera?: string) {
  return useQuery({ queryKey: ["programas-habitacionais", esfera], queryFn: () => servicoHabitacional.listarProgramas(esfera) });
}

export function useDemandas(familyId?: string) {
  return useQuery({ queryKey: ["demandas", familyId], queryFn: () => servicoHabitacional.listarDemandas(familyId ? `family_id=${familyId}` : ""), enabled: !!familyId });
}

// ─── NOTIFICAÇÕES ──────────────────────────────────

export interface NotificacaoOut {
  id: string; titulo: string; mensagem: string | null;
  tipo: NotificacaoTipo; lida: boolean; link: string | null;
  role_alvo: string | null; created_at: string;
}

export type NotificacaoTipo =
  | "ENCAMINHAMENTO"
  | "AGENDA"
  | "BENEFICIO"
  | "PRAZO"
  | "ALERTA"
  | "SISTEMA";

export const TIPO_NOTIFICACAO_ICONE: Record<NotificacaoTipo, string> = {
  ENCAMINHAMENTO: "forward",
  AGENDA: "calendar_today",
  BENEFICIO: "volunteer_activism",
  PRAZO: "schedule",
  ALERTA: "warning",
  SISTEMA: "settings",
};

export const TIPO_NOTIFICACAO_COR: Record<NotificacaoTipo, string> = {
  ENCAMINHAMENTO: "text-blue-600 bg-blue-50",
  AGENDA: "text-green-600 bg-green-50",
  BENEFICIO: "text-purple-600 bg-purple-50",
  PRAZO: "text-amber-600 bg-amber-50",
  ALERTA: "text-red-600 bg-red-50",
  SISTEMA: "text-slate-600 bg-slate-50",
};

export const servicoNotificacoes = {
  listar: (naoLidas?: boolean) => http.get<NotificacaoOut[]>(`/notifications${naoLidas ? "?nao_lidas=true" : ""}`),
  contar: () => http.get<{ total: number }>("/notifications/count"),
  marcarLida: (id: string) => http.post(`/notifications/${id}/read`),
  marcarTodas: () => http.post("/notifications/read-all"),
};

export function useNotificacoes() {
  return useQuery({ queryKey: ["notificacoes"], queryFn: () => servicoNotificacoes.listar(), refetchInterval: 30_000 });
}

export function useContagemNotificacoes() {
  return useQuery({
    queryKey: ["notificacoes", "count"],
    queryFn: () => servicoNotificacoes.contar(),
    refetchInterval: 30_000,
  });
}

// ─── IMPORTAÇÕES SICON/SIBEC ───────────────────────

export const servicoImportacao = {
  uploadSicon: (file: File) => { const fd = new FormData(); fd.append("file", file); return http.post("/sicon/import", fd); },
  uploadSibec: (file: File) => { const fd = new FormData(); fd.append("file", file); return http.post("/sibec/import", fd); },
  jobsSicon: () => http.get<any[]>("/sicon/jobs"),
  jobsSibec: () => http.get<any[]>("/sibec/jobs"),
  siconFamilia: (familyId: string) => http.get<any>(`/sicon/family/${familyId}`),
  sibecFamilia: (familyId: string) => http.get<any>(`/sibec/family/${familyId}`),
};

// ─── EXPORTADOR ────────────────────────────────────

export const servicoExportador = {
  listar: () => http.get<any[]>("/data-exports"),
  executar: (id: string, params?: Record<string, string>) => http.postBlob(`/data-exports/${id}/execute`, params || {}),
};

// ─── LIMITES BENEFÍCIO ─────────────────────────────

export const servicoLimites = {
  listar: (code?: string) => http.get<any[]>(`/limites-beneficio${code ? `?benefit_type_code=${code}` : ""}`),
  criar: (corpo: any) => http.post<any>("/limites-beneficio", corpo),
  verificar: (familyId: string, code: string, valor: number) =>
    http.get<any>(`/beneficios/verificar-limite?family_id=${familyId}&benefit_type_code=${code}&valor=${valor}`),
};

// ─── QUICK FAMILY ──────────────────────────────────

export const servicoFamiliaRapida = {
  criar: (corpo: { nome_responsavel: string; cpf_responsavel?: string; nis_responsavel?: string; bairro: string; membros: { nome: string; parentesco: string }[] }) =>
    http.post("/families/quick", corpo),
};

// ─── CADÚNICO CONSULTA ─────────────────────────────

export interface CadUnicoPessoa {
  id: string;
  nome_civil: string;
  nome_social: string | null;
  data_nascimento: string | null;
  sexo: string;
  mae: string | null;
}

export interface CadUnicoFamilia {
  id: string;
  codigo: number;
  responsavel_nome: string | null;
  faixa_renda: string | null;
  beneficiaria_pbf: boolean;
  possui_bpc: boolean;
  no_cadunico: boolean;
  cadunico_atualizado_em: string | null;
  parentesco: string | null;
  endereco: {
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    cep: string | null;
    municipio: string | null;
    uf: string | null;
  } | null;
}

export interface CadUnicoConsultaResult {
  fonte: string;
  encontrado: boolean;
  pessoa: CadUnicoPessoa;
  familia: CadUnicoFamilia | null;
}

export const servicoCadUnico = {
  consultarPorCPF: (cpf: string) =>
    http.get<CadUnicoConsultaResult>(`/cadunico/consulta/cpf?cpf=${cpf.replace(/\D/g, "")}`),
  consultarPorNIS: (nis: string) =>
    http.get<CadUnicoConsultaResult>(`/cadunico/consulta/nis?nis=${nis.replace(/\D/g, "")}`),
};

// ─── CHAT INTERNO ──────────────────────────────────

export interface ChatMessageIn {
  type: "message" | "presence" | "typing";
  user_id: string;
  user_name: string;
  text?: string;
  status?: string;
  timestamp: string;
}

export interface MensagemChat {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

export interface SalaChat {
  id: string;
  nome: string;
}

function buildWsUrl(tenantId: string, token: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/ws/chat/${tenantId}?token=${encodeURIComponent(token)}`;
}

export function useChat(tenantId: string | null, userId: string | null, userName: string | null) {
  const [conectado, setConectado] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [digitando, setDigitando] = useState<string | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconectarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativasRef = useRef(0);
  const abertoRef = useRef(false);
  const naoLidasRef = useRef(0);
  const digitandoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  abertoRef.current = aberto;

  const conectar = useCallback(() => {
    const token = lerAccessToken();
    if (!token || !tenantId || !userId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(buildWsUrl(tenantId, token));
    wsRef.current = ws;

    ws.onopen = () => {
      setConectado(true);
      tentativasRef.current = 0;
    };

    ws.onclose = () => {
      setConectado(false);
      wsRef.current = null;
      agendarReconexao();
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data: ChatMessageIn = JSON.parse(event.data);
        if (data.type === "message" && data.text) {
          const msg: MensagemChat = {
            id: crypto.randomUUID(),
            userId: data.user_id,
            userName: data.user_name,
            text: data.text,
            timestamp: data.timestamp,
          };
          setMensagens((prev) => [...prev, msg]);
          if (!abertoRef.current && data.user_id !== userId) {
            naoLidasRef.current += 1;
            setNaoLidas(naoLidasRef.current);
          }
        } else if (data.type === "presence") {
          setOnline((prev) => {
            if (data.status === "online" && data.user_id && !prev.includes(data.user_id)) {
              return [...prev, data.user_id];
            }
            if (data.status === "offline" && data.user_id) {
              return prev.filter((id) => id !== data.user_id);
            }
            return prev;
          });
        } else if (data.type === "typing" && data.user_id !== userId) {
          setDigitando(data.user_name);
          if (digitandoTimerRef.current) clearTimeout(digitandoTimerRef.current);
          digitandoTimerRef.current = setTimeout(() => setDigitando(null), 3000);
        }
      } catch {
        /* mensagem malformada */
      }
    };
  }, [tenantId, userId]);

  const agendarReconexao = useCallback(() => {
    if (reconectarRef.current) clearTimeout(reconectarRef.current);
    const atraso = Math.min(1000 * 2 ** tentativasRef.current, 30_000);
    tentativasRef.current += 1;
    reconectarRef.current = setTimeout(() => {
      conectar();
    }, atraso);
  }, [conectar]);

  useEffect(() => {
    if (!tenantId || !userId) return;
    conectar();
    return () => {
      if (reconectarRef.current) clearTimeout(reconectarRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [tenantId, userId, conectar]);

  const enviarMensagem = useCallback((texto: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !texto.trim() || !userId || !userName) return;
    ws.send(JSON.stringify({ type: "message", text: texto.trim() }));
  }, [userId, userName]);

  const enviarDigitando = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "typing" }));
  }, []);

  const abrirChat = useCallback(() => {
    setAberto(true);
    naoLidasRef.current = 0;
    setNaoLidas(0);
  }, []);

  const fecharChat = useCallback(() => {
    setAberto(false);
  }, []);

  return {
    conectado,
    mensagens,
    digitando,
    online,
    aberto,
    naoLidas,
    enviarMensagem,
    enviarDigitando,
    abrirChat,
    fecharChat,
  };
}
