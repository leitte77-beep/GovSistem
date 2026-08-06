import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, ErroEstado } from '../componentes/Comuns';
import { useSessao } from '../contexto/SessaoContexto';
import { Crosshair, LocateFixed, MapPin, MapPinned, RotateCw, Search, X } from 'lucide-react';

const FAROL_CENTRO: [number, number] = [-24.0115, -52.3527];
const FAROL_ZOOM = 13;

function salvarPreferencia(chave: string, valor: any) {
  try { localStorage.setItem(`govinfra.mapa.${chave}`, JSON.stringify(valor)); } catch {/* noop */}
}
function carregarPreferencia(chave: string, fallback: any) {
  try { const v = localStorage.getItem(`govinfra.mapa.${chave}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/* ── Tipos ──────────────────────────────────────────────────────────────── */

type Marcador = {
  id: string; camada: string; titulo: string;
  latitude: number; longitude: number; tipo?: string | null;
  comunidade?: string | null; bairro?: string | null;
  area_hectares?: number | null; link?: string | null;
};
type Camada = { chave: string; rotulo: string; cor: string };
type RespostaMapa = {
  configuracao: { url_tiles: string; atribuicao: string; centro: { latitude: number; longitude: number }; zoom: number; geocodificacao_ativa: boolean };
  camadas: Camada[]; total: number; marcadores: Marcador[];
};
type ResultadoBusca = { display_name: string; lat: string; lon: string; type: string };

/* ── Helpers ────────────────────────────────────────────────────────────── */

function marcador(cor: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${cor};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
}

function Centralizar({ centro, zoom }: { centro: [number, number]; zoom?: number }) {
  const mapa = useMap();
  useEffect(() => {
    if (zoom) mapa.setView(centro, zoom);
    else mapa.setView(centro, mapa.getZoom());
  }, [centro, zoom, mapa]);
  return null;
}

/* ── Componente principal ───────────────────────────────────────────────── */

export function MapaPagina() {
  const [dados, setDados] = useState<RespostaMapa | null>(null);
  const [erro, setErro] = useState('');
  const [ativas, setAtivas] = useState<Record<string, boolean>>({});
  const [centro, setCentro] = useState<[number, number]>(() => carregarPreferencia('centro', FAROL_CENTRO));
  const [zoom, setZoom] = useState<number>(() => carregarPreferencia('zoom', FAROL_ZOOM));
  const [municipioAtual, setMunicipioAtual] = useState(() => carregarPreferencia('municipio', 'Farol — PR'));

  /* busca */
  const [termoBusca, setTermoBusca] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<RespostaMapa>('/mapa')
      .then((resposta) => {
        setDados(resposta);
        const ligadas: Record<string, boolean> = {};
        for (const camada of resposta.camadas) ligadas[camada.chave] = true;
        setAtivas(ligadas);
        // Só usa o centro da API se o usuário nunca salvou um centro manual
        const salvo = carregarPreferencia('centro', null);
        if (!salvo) {
          setCentro([resposta.configuracao.centro.latitude, resposta.configuracao.centro.longitude]);
          setZoom(resposta.configuracao.zoom || FAROL_ZOOM);
        }
      })
      .catch((e) => setErro(e.message));
  }, []);

  /* fecha dropdown ao clicar fora */
  useEffect(() => {
    function clicarFora(e: MouseEvent) { if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setMostrarResultados(false); }
    document.addEventListener('mousedown', clicarFora);
    return () => document.removeEventListener('mousedown', clicarFora);
  }, []);

  /* busca com debounce */
  useEffect(() => {
    if (termoBusca.length < 3) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(termoBusca)}&format=json&countrycodes=br&limit=6&accept-language=pt`)
        .then((r) => r.json())
        .then((r: ResultadoBusca[]) => { setResultados(r); setMostrarResultados(true); })
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 400);
    return () => clearTimeout(t);
  }, [termoBusca]);

  function voarPara(lat: number, lon: number, nome: string, z?: number) {
    setCentro([lat, lon]);
    if (z) setZoom(z);
    setMunicipioAtual(nome);
    setMostrarResultados(false);
    setTermoBusca('');
  }

  function centralizarNoMunicipio() {
    const salvo = carregarPreferencia('centroPadrao', FAROL_CENTRO);
    const nome = carregarPreferencia('municipioPadrao', 'Farol — PR');
    voarPara(salvo[0], salvo[1], nome, carregarPreferencia('zoomPadrao', FAROL_ZOOM));
  }

  function salvarComoPadrao() {
    salvarPreferencia('centroPadrao', centro);
    salvarPreferencia('municipioPadrao', municipioAtual);
    salvarPreferencia('zoomPadrao', zoom);
    alert('Localização padrão salva! Ao abrir o mapa, ele centralizará em: ' + municipioAtual);
  }

  function minhaLocalizacao() {
    if (!navigator.geolocation) { alert('Geolocalização não suportada pelo navegador.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => voarPara(pos.coords.latitude, pos.coords.longitude, 'Minha localização', 16),
      () => alert('Permissão de localização negada.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const visiveis = useMemo(() => {
    if (!dados) return [];
    return dados.marcadores.filter((m) => ativas[m.camada] !== false);
  }, [dados, ativas]);

  if (erro) return <ErroEstado mensagem={erro} tentar={() => window.location.reload()}/>;
  if (!dados) return <Carregando texto="Carregando o mapa…"/>;

  return <div>
    <CabecalhoPagina titulo="Mapa dos atendimentos"
      descricao="Visualização geográfica das caçambas, solicitações, propriedades e serviços."/>

    {/* ── Barra de busca ──────────────────────────────────────── */}
    <div className="mapa-busca-envolve" ref={buscaRef}>
      <div className="mapa-busca">
        <Search size={18}/>
        <input placeholder="Pesquise cidade, rua, CEP, bairro, propriedade ou coordenada…"
          value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)}
          onFocus={() => { if (resultados.length > 0) setMostrarResultados(true); }}/>
        {termoBusca && <button className="mapa-busca-limpar" onClick={() => { setTermoBusca(''); setResultados([]); }} aria-label="Limpar"><X size={15}/></button>}
        {buscando && <RotateCw size={14} className="giro" style={{color:'var(--cinza-400)',flexShrink:0}}/>}
      </div>
      {mostrarResultados && resultados.length > 0 && (
        <div className="mapa-busca-resultados">
          {resultados.map((r, i) => (
            <button key={i} className="mapa-busca-item" onClick={() => voarPara(Number(r.lat), Number(r.lon), r.display_name.split(',')[0])}>
              <MapPin size={14}/> <span>{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>

    {/* ── Toolbar ──────────────────────────────────────────────── */}
    <div className="mapa-toolbar">
      <div className="mapa-toolbar-info">
        <MapPinned size={15}/> <strong>{municipioAtual}</strong>
      </div>
      <div className="mapa-toolbar-acoes">
        <button className="botao pequeno" onClick={centralizarNoMunicipio} title="Centralizar no município padrão">
          <LocateFixed size={14}/> Centralizar município
        </button>
        <button className="botao pequeno" onClick={minhaLocalizacao} title="Ir para minha localização">
          <Crosshair size={14}/> Minha localização
        </button>
        <button className="botao pequeno principal" onClick={salvarComoPadrao} title="Salvar localização atual como padrão">
          Salvar como padrão
        </button>
      </div>
    </div>

    {/* ── Camadas ──────────────────────────────────────────────── */}
    <div className="mapa-camadas">
      <span className="mapa-camadas-titulo">Camadas</span>
      <button className={`mapa-camada-chip ${Object.values(ativas).every(Boolean) ? 'ativo' : ''}`}
        onClick={() => { const todas: Record<string, boolean> = {}; dados.camadas.forEach((c) => todas[c.chave] = true); setAtivas(todas); }}>
        Todas
      </button>
      {dados.camadas.map((camada) => (
        <button key={camada.chave}
          className={`mapa-camada-chip ${ativas[camada.chave] !== false ? 'ativo' : ''}`}
          onClick={() => setAtivas((a) => ({ ...a, [camada.chave]: a[camada.chave] === false }))}>
          <i className="mapa-camada-ponto" style={{ background: camada.cor }}/> {camada.rotulo}
        </button>
      ))}
      <button className="mapa-camada-chip"
        onClick={() => { const vazias: Record<string, boolean> = {}; dados.camadas.forEach((c) => vazias[c.chave] = false); setAtivas(vazias); }}>
        Limpar
      </button>
    </div>

    {/* ── Mapa ────────────────────────────────────────────────── */}
    <div className="mapa-container">
      <MapContainer center={centro} zoom={zoom} scrollWheelZoom>
        <TileLayer url={dados.configuracao.url_tiles} attribution={dados.configuracao.atribuicao}/>
        <Centralizar centro={centro} zoom={zoom}/>
        {visiveis.map((pt) => {
          const camada = dados.camadas.find((c) => c.chave === pt.camada);
          return (
            <Marker key={`${pt.camada}-${pt.id}`} position={[pt.latitude, pt.longitude]} icon={marcador(camada?.cor || '#64748b')}>
              <Popup>
                <div className="popup-titulo">{pt.titulo}</div>
                <div className="linha">{camada?.rotulo || pt.camada}</div>
                {pt.bairro && <div className="linha">Bairro: {pt.bairro}</div>}
                {pt.comunidade && <div className="linha">Comunidade: {pt.comunidade}</div>}
                {pt.tipo && <div className="linha">Tipo: {pt.tipo.replaceAll('_', ' ')}</div>}
                {pt.area_hectares != null && <div className="linha">{pt.area_hectares} ha</div>}
                {pt.link && <a href={pt.link}>Ver detalhes</a>}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>

    <div className="mapa-rodape">
      <div className="legenda-mapa">
        {dados.camadas.map((c) => (
          <span key={c.chave}><i className="ponto" style={{ background: c.cor }}/> {c.rotulo}</span>
        ))}
      </div>
      <span>{visiveis.length} de {dados.total} ponto(s) visíveis</span>
    </div>
  </div>;
}
