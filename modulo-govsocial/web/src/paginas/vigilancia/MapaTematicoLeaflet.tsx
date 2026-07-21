import { useEffect, useMemo, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2, Layers } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";

interface MapDataPoint {
  lat: number;
  lng: number;
  label: string;
  tipo: "familia" | "unidade" | "equipamento";
  id: string;
  nivel_vulnerabilidade?: string;
}

interface MapFilters {
  sexo?: string;
  idade_min?: number;
  idade_max?: number;
  deficiencia?: string;
  programa_social?: string;
}

const VULNERABILIDADE_CORES: Record<string, string> = {
  ALTA: "#dc2626",
  MEDIA: "#f59e0b",
  BAIXA: "#22c55e",
};

function HeatmapLayer({ pontos, visivel }: { pontos: MapDataPoint[]; visivel: boolean }) {
  if (!visivel || pontos.length === 0) return null;
  return (
    <>
      {pontos.map((p, i) => {
        const cor = p.nivel_vulnerabilidade
          ? VULNERABILIDADE_CORES[p.nivel_vulnerabilidade] || "#3b82f6"
          : "#3b82f6";
        return (
          <CircleMarker
            key={`heat-${p.id}-${i}`}
            center={[p.lat, p.lng]}
            radius={12}
            pathOptions={{ color: cor, fillColor: cor, fillOpacity: 0.35, weight: 0 }}
          >
            <Popup>
              <div className="text-sm">
                <strong>{p.label}</strong>
                {p.nivel_vulnerabilidade && (
                  <span className="ml-1 text-xs" style={{ color: cor }}>
                    ({p.nivel_vulnerabilidade})
                  </span>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function FullScreenToggle() {
  const [full, setFull] = useState(false);
  const map = useMap();
  return (
    <button onClick={() => { setFull(!full); setTimeout(() => map.invalidateSize(), 100); }}
      className="absolute top-2 right-2 z-[1000] rounded bg-white p-2 shadow-md hover:bg-gray-100"
      style={{ zIndex: 1000 }} title={full ? "Sair tela cheia" : "Tela cheia"}>
      {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}

function LegendaVulnerabilidade() {
  return (
    <div className="absolute top-3 left-3 z-[1000] bg-white rounded shadow-md p-2 text-xs space-y-1" style={{ zIndex: 1000 }}>
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: VULNERABILIDADE_CORES.ALTA }} /> Alta</div>
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: VULNERABILIDADE_CORES.MEDIA }} /> Média</div>
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: VULNERABILIDADE_CORES.BAIXA }} /> Baixa</div>
    </div>
  );
}

export default function MapaTematicoLeaflet() {
  const { unidadeAtual } = useUnidadeAtual();
  const [pontos, setPontos] = useState<MapDataPoint[]>([]);
  const [camada, setCamada] = useState<"pontos" | "calor">("pontos");
  const [satelite, setSatelite] = useState(false);
  const [filtros, setFiltros] = useState<MapFilters>({});
  const [fullScreen, setFullScreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await http.get<MapDataPoint[]>("/dashboard/map-data");
      setPontos(data);
    } catch {
      setErro("Não foi possível carregar os dados do mapa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, unidadeAtual?.id, filtros]);

  const centro: [number, number] = useMemo(() =>
    pontos.length > 0
      ? [pontos.reduce((s, p) => s + p.lat, 0) / pontos.length, pontos.reduce((s, p) => s + p.lng, 0) / pontos.length]
      : [-15.7801, -47.9292],
  [pontos]);

  const marcadores = useMemo(() => pontos.filter((p) => p.tipo === "unidade" || p.tipo === "equipamento"), [pontos]);
  const familiasGeolocalizadas = useMemo(() => pontos.filter((p) => p.tipo === "familia"), [pontos]);

  if (loading) return <Skeleton variante="cartao" className="h-[500px]" />;
  if (erro) return <EstadoErro problema={{ type: "about:blank", title: "Erro ao carregar mapa", status: 500, detail: erro }} aoTentarNovamente={carregar} />;

  return (
    <div className={`relative ${fullScreen ? "fixed inset-0 z-50" : "h-[500px]"}`}>
      <MapContainer center={centro} zoom={13} className="h-full w-full rounded-cartao" scrollWheelZoom>
        <TileLayer
          attribution={satelite ? "Esri" : "© OpenStreetMap"}
          url={satelite
            ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
        />
        <HeatmapLayer pontos={familiasGeolocalizadas} visivel={camada === "calor"} />
        {camada === "pontos" && marcadores.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]}>
            <Popup>{m.label}</Popup>
          </Marker>
        ))}
        <FullScreenToggle />
      </MapContainer>
      {camada === "calor" && <LegendaVulnerabilidade />}
      <div className="absolute bottom-3 left-3 z-[1000] flex gap-2" style={{ zIndex: 1000 }}>
        <button onClick={() => setCamada(camada === "pontos" ? "calor" : "pontos")}
          className="rounded bg-white px-3 py-1.5 text-sm shadow-md hover:bg-gray-100 flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" /> {camada === "pontos" ? "Mapa de calor" : "Pontos"}
        </button>
        <button onClick={() => setSatelite(!satelite)}
          className={`rounded px-3 py-1.5 text-sm shadow-md flex items-center gap-1 ${satelite ? "bg-primary text-white" : "bg-white hover:bg-gray-100"}`}>
          Satélite
        </button>
        <button onClick={() => setFullScreen(!fullScreen)}
          className="rounded bg-white px-3 py-1.5 text-sm shadow-md hover:bg-gray-100">
          {fullScreen ? "Sair tela cheia" : "Tela cheia"}
        </button>
      </div>
      <div className="absolute top-3 right-12 z-[1000] bg-white rounded shadow-md p-3 text-xs space-y-2 w-48" style={{ zIndex: 1000 }}>
        <h4 className="font-semibold">Filtros</h4>
        <select className="w-full rounded border px-2 py-1" onChange={(e) => setFiltros({ ...filtros, sexo: e.target.value || undefined })}>
          <option value="">Sexo (todos)</option>
          <option value="F">Feminino</option>
          <option value="M">Masculino</option>
        </select>
        <select className="w-full rounded border px-2 py-1" onChange={(e) => setFiltros({ ...filtros, deficiencia: e.target.value || undefined })}>
          <option value="">Deficiência (todas)</option>
          <option value="FISICA">Física</option>
          <option value="INTELECTUAL">Intelectual</option>
          <option value="VISUAL">Visual</option>
          <option value="AUDITIVA">Auditiva</option>
        </select>
      </div>
    </div>
  );
}
