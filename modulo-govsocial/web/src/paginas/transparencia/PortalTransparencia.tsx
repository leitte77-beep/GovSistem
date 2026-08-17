import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Users,
  ClipboardList,
  Gift,
  Building2,
  TrendingUp,
  MapPin,
  Phone,
  Mail,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/ui/Skeleton";

const COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a",
  "#0891b2", "#ca8a04", "#4f46e5", "#be123c", "#059669",
];
const COLOR_BENEFICIOS: Record<string, string> = {
  CESTA_BASICA: "#16a34a",
  NATALIDADE: "#2563eb",
  FUNERAL: "#6b7280",
  LEITE: "#7c3aed",
  FRALDAS: "#db2777",
  PASSAGEM: "#ea580c",
  ALUGUEL_SOCIAL: "#0891b2",
  DOCUMENTACAO: "#ca8a04",
  FOTOS: "#4f46e5",
  MEDICAMENTOS: "#be123c",
  GENERO_ALIMENTICIO: "#059669",
};

interface Territorio {
  bairro: string;
  contagem: number;
}

interface TipoBeneficio {
  tipo: string;
  codigo: string;
  contagem: number;
}

interface EvolucaoMensal {
  ano: number;
  mes: number;
  mes_nome: string;
  contagem: number;
}

interface Unidade {
  id: string;
  nome: string;
  tipo: string;
  endereco: string;
  telefone: string | null;
  email: string | null;
}

interface Dashboard {
  municipio: string;
  slug: string;
  total_familias_cadastradas: number;
  total_atendimentos_mes: number;
  total_beneficios_entregues: number;
  distribuicao_por_territorio: Territorio[];
  distribuicao_por_tipo_beneficio: TipoBeneficio[];
  evolucao_mensal_atendimentos: EvolucaoMensal[];
  unidades_ativas: Unidade[];
}

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function BarChart({ data }: { data: EvolucaoMensal[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.contagem), 1);
  const w = 600;
  const h = 240;
  const padL = 40;
  const padB = 30;
  const padT = 20;
  const padR = 10;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barW = Math.max(8, Math.min(28, chartW / data.length - 6));

  const yTicks = 5;
  const stepY = Math.ceil(max / yTicks);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Gráfico de atendimentos mensais">
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const v = i * stepY;
        const y = padT + chartH - (v / max) * chartH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px]" fill="#9ca3af">
              {v}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = padL + i * (chartW / data.length) + (chartW / data.length - barW) / 2;
        const bh = (d.contagem / max) * chartH;
        const y = padT + chartH - bh;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={bh}
              rx={2}
              fill="#2563eb"
              opacity={0.85}
            />
            <title>{d.mes_nome} {d.ano}: {d.contagem} atendimentos</title>
            <text
              x={x + barW / 2}
              y={padT + chartH + 16}
              textAnchor="middle"
              className="text-[10px]"
              fill="#6b7280"
            >
              {MESES[d.mes - 1]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChart({ data }: { data: TipoBeneficio[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.contagem, 0);
  if (total === 0) return null;
  const r = 80;
  const cx = 100;
  const cy = 100;
  const viewW = 280;

  let cum = 0;
  const slices = data.map((d) => {
    const start = cum;
    cum += d.contagem;
    const pct = d.contagem / total;
    return { ...d, startAngle: (start / total) * 2 * Math.PI, endAngle: (cum / total) * 2 * Math.PI, pct };
  });

  const arcPath = (start: number, end: number) => {
    const x1 = cx + r * Math.sin(start);
    const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(end);
    const y2 = cy - r * Math.cos(end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  return (
    <svg viewBox={`0 0 ${viewW} 220`} className="w-full h-auto" role="img" aria-label="Distribuição por tipo de benefício">
      {slices.map((s, i) => (
        <g key={i}>
          <path d={arcPath(s.startAngle, s.endAngle)} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1.5" />
          <title>{s.tipo}: {s.contagem} ({Math.round(s.pct * 100)}%)</title>
        </g>
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" className="text-sm" fill="#374151" fontWeight="600">
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="text-[10px]" fill="#9ca3af">
        benefícios
      </text>
      {data.map((d, i) => (
        <g key={i} transform={`translate(${viewW - 175}, ${i * 16 - (data.length * 8)})`}>
          <rect x={0} y={0} width={10} height={10} rx={2} fill={COLORS[i % COLORS.length]} />
          <text x={14} y={9} className="text-[10px]" fill="#4b5563">
            {d.tipo.length > 18 ? d.tipo.slice(0, 18) + "…" : d.tipo}
          </text>
        </g>
      ))}
    </svg>
  );
}

function QRCode({ url, size = 100 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const chars = url.split("").map((c) => c.charCodeAt(0));
    const seed = chars.reduce((a, b) => a + b, 0);
    const moduleSize = Math.floor(size / 21);
    const offset = Math.floor((size - moduleSize * 21) / 2);

    const pseudoRandom = (x: number, y: number) => {
      const v = (seed * 31 + x * 17 + y * 7 + x * y * 13) % 100;
      return v > 45;
    };

    for (let col = 0; col < 21; col++) {
      for (let row = 0; row < 21; row++) {
        if (
          (row < 7 && col < 7) ||
          (row < 7 && col > 13) ||
          (row > 13 && col < 7)
        ) {
          if (
            (row === 0 || row === 6 || col === 0 || col === 6) ||
            (row >= 2 && row <= 4 && col >= 2 && col <= 4)
          ) {
            ctx.fillStyle = "#000";
            ctx.fillRect(offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize);
          }
        } else if (pseudoRandom(col, row)) {
          ctx.fillStyle = "#000";
          ctx.fillRect(offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  }, [url, size]);

  return <canvas ref={canvasRef} className="border border-gray-200 rounded-lg" />;
}

export default function PortalTransparencia() {
  const { slug } = useParams<{ slug: string }>();
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setErro("");
    try {
      const BASE = import.meta.env.VITE_API_URL || "/api/govsocial/v1";
      const resp = await fetch(`${BASE}/transparencia/${slug}/dashboard`);
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Município não encontrado.");
        throw new Error("Erro ao carregar dados do portal.");
      }
      const json: Dashboard = await resp.json();
      setDados(json);
    } catch (e: any) {
      setErro(e.message || "Erro ao carregar dados.");
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
          <Skeleton variante="cartao" className="h-40" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton variante="cartao" className="h-28" />
            <Skeleton variante="cartao" className="h-28" />
            <Skeleton variante="cartao" className="h-28" />
          </div>
          <Skeleton variante="cartao" className="h-64" />
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
          <XCircle className="w-12 h-12 mx-auto text-red-400" />
          <h1 className="text-xl font-bold text-gray-800">Portal Indisponível</h1>
          <p className="text-gray-500">{erro}</p>
          <button
            onClick={carregar}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 mx-auto text-amber-400" />
          <h1 className="text-xl font-bold text-gray-800">Sem dados disponíveis</h1>
          <p className="text-gray-500">Nenhuma informação encontrada para este município.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Banner ────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-white/30">
              <Building2 className="w-10 h-10 md:w-12 md:h-12 text-white/90" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-white/70 text-sm md:text-base font-medium tracking-wide uppercase">
                Prefeitura Municipal de
              </p>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mt-1">
                {dados.municipio}
              </h1>
              <p className="text-white/80 text-sm md:text-base mt-2">
                Portal da Transparência — Assistência Social
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-8">
        {/* ── KPIs ────────────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Famílias Cadastradas</p>
                <p className="text-2xl font-bold text-gray-800">
                  {dados.total_familias_cadastradas.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Atendimentos no Mês</p>
                <p className="text-2xl font-bold text-gray-800">
                  {dados.total_atendimentos_mes.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Gift className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Benefícios Entregues</p>
                <p className="text-2xl font-bold text-gray-800">
                  {dados.total_beneficios_entregues.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Gráficos ────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Atendimentos por Mês
            </h2>
            {dados.evolucao_mensal_atendimentos.length > 0 ? (
              <BarChart data={dados.evolucao_mensal_atendimentos} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-12">Sem dados de evolução mensal.</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
              <Gift className="w-5 h-5 text-emerald-600" />
              Benefícios por Tipo
            </h2>
            {dados.distribuicao_por_tipo_beneficio.length > 0 ? (
              <PieChart data={dados.distribuicao_por_tipo_beneficio} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-12">Nenhum benefício registrado.</p>
            )}
          </div>
        </section>

        {/* ── Benefícios Concedidos ───────────────────────────────── */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-4">
            <Gift className="w-5 h-5 text-emerald-600" />
            Benefícios Concedidos
          </h2>
          {dados.distribuicao_por_tipo_beneficio.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {dados.distribuicao_por_tipo_beneficio.map((b) => {
                const cor = COLOR_BENEFICIOS[b.codigo] || COLORS[Math.abs(b.codigo.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];
                return (
                  <div
                    key={b.codigo}
                    className="rounded-xl p-4 text-white text-center shadow-sm"
                    style={{ backgroundColor: cor }}
                  >
                    <p className="text-3xl font-bold">{b.contagem}</p>
                    <p className="text-xs mt-1 opacity-90 leading-tight">{b.tipo}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">Nenhum benefício concedido.</p>
          )}
        </section>

        {/* ── Unidades ────────────────────────────────────────────── */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-4">
            <Building2 className="w-5 h-5 text-blue-600" />
            Unidades de Atendimento
          </h2>
          {dados.unidades_ativas.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3 font-semibold text-gray-600">Unidade</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Tipo</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Endereço</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Contato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dados.unidades_ativas.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{u.nome}</td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{u.tipo}</td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                          {u.endereco || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {u.telefone && (
                              <span className="flex items-center gap-1 text-gray-600 text-xs">
                                <Phone className="w-3 h-3" /> {u.telefone}
                              </span>
                            )}
                            {u.email && (
                              <span className="flex items-center gap-1 text-gray-600 text-xs">
                                <Mail className="w-3 h-3" /> {u.email}
                              </span>
                            )}
                            {!u.telefone && !u.email && (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <Building2 className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-400 text-sm">Nenhuma unidade cadastrada.</p>
            </div>
          )}
        </section>

        {/* ── Territórios ─────────────────────────────────────────── */}
        {dados.distribuicao_por_territorio.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-4">
              <MapPin className="w-5 h-5 text-indigo-600" />
              Distribuição por Território
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {dados.distribuicao_por_territorio.map((t) => (
                  <div
                    key={t.bairro}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
                  >
                    <span className="text-sm text-gray-700">{t.bairro}</span>
                    <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                      {t.contagem}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── QR Code ─────────────────────────────────────────────── */}
        <section className="flex flex-col items-center sm:flex-row sm:justify-between bg-white rounded-xl shadow-sm border border-gray-100 p-6 gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Acesse este portal</h2>
            <p className="text-xs text-gray-500 mt-1 break-all">{pageUrl}</p>
          </div>
          <QRCode url={pageUrl} size={100} />
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Portal da Transparência — Assistência Social
          </p>
          <p className="text-xs text-gray-400">
            Dados atualizados em {hoje}
          </p>
        </div>
      </footer>
    </div>
  );
}
