import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Bell, BellOff, MapPin, Phone, ShieldAlert } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { http } from "@/nucleo/http/clienteHttp";
import {
  usePanicButtonAtivos,
  usePanicButtonHistorico,
} from "@/nucleo/api/hooks";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { Botao } from "@/ui/Botao";
import { Modal } from "@/ui/Modal";
import type {
  PanicButtonListItem,
  PanicButtonHistoryItem,
} from "@/tipos/panicButton";

const CORES_STATUS: Record<string, { bg: string; text: string; border: string }> = {
  ATIVO: { bg: "bg-danger", text: "text-white", border: "border-danger" },
  ATENDIDO: { bg: "bg-warning/20", text: "text-warning", border: "border-warning/40" },
  CANCELADO: { bg: "bg-ink-soft/10", text: "text-ink", border: "border-ink-soft/20" },
  FALSO_ALARME: { bg: "bg-ink-soft/10", text: "text-ink", border: "border-ink-soft/20" },
};

const ROTULO_STATUS: Record<string, string> = {
  ATIVO: "ATIVO",
  ATENDIDO: "Em atendimento",
  CANCELADO: "Cancelado",
  FALSO_ALARME: "Falso alarme",
};

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${h}:${min}`;
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function tempoRelativo(iso: string): string {
  const agora = Date.now();
  const data = new Date(iso).getTime();
  const diffMs = agora - data;
  const segundos = Math.floor(diffMs / 1000);
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (segundos < 60) return "agora mesmo";
  if (minutos === 1) return "há 1 minuto";
  if (minutos < 60) return `há ${minutos} minutos`;
  if (horas === 1) return "há 1 hora";
  if (horas < 24) return `há ${horas} horas`;
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

function SomAlerta({ ativo }: { ativo: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [habilitado, setHabilitado] = useState(true);

  useEffect(() => {
    if (!ativo || !habilitado) return;
    const tentar = () => {
      audioRef.current?.play().catch(() => {});
    };
    tentar();
    const id = setInterval(tentar, 3000);
    return () => clearInterval(id);
  }, [ativo, habilitado]);

  if (ativo) {
    return (
      <div className="flex items-center gap-2">
        <audio
          ref={audioRef}
          src="/sounds/alert.mp3"
          preload="auto"
          loop
        >
          <track kind="captions" />
        </audio>
        <Botao
          variante="texto"
          tamanho="sm"
          onClick={() => setHabilitado(!habilitado)}
          aria-label={habilitado ? "Desativar som" : "Ativar som"}
        >
          {habilitado ? (
            <Bell className="h-5 w-5 text-danger" />
          ) : (
            <BellOff className="h-5 w-5 text-ink-soft" />
          )}
        </Botao>
      </div>
    );
  }
  return null;
}

function CartaoAtivo({
  alerta,
  onAtender,
  onResolver,
  carregando,
}: {
  alerta: PanicButtonListItem;
  onAtender: (id: string) => void;
  onResolver: (id: string) => void;
  carregando: boolean;
}) {
  return (
    <div className="animate-pulse rounded-cartao border-2 border-danger bg-danger/5 p-4 shadow-lg shadow-danger/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-danger" />
            <span className="text-sm font-semibold uppercase tracking-wide text-danger">
              Alerta ativo
            </span>
          </div>
          <p className="mt-1 text-sm text-ink">
            Ativado {tempoRelativo(alerta.activated_at)}
          </p>
          {alerta.location_address && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
              <MapPin className="h-3 w-3" />
              {alerta.location_address}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => onResolver(alerta.id)}
            disabled={carregando}
          >
            Resolver
          </Botao>
          <Botao
            variante="primario"
            tamanho="sm"
            className="bg-danger hover:bg-danger/80"
            onClick={() => onAtender(alerta.id)}
            disabled={carregando}
          >
            <Phone className="mr-1 h-4 w-4" />
            Atender
          </Botao>
        </div>
      </div>
      {alerta.location_lat && alerta.location_lng && (
        <div className="mt-3 h-32 overflow-hidden rounded border border-ink-soft/15">
          <MapContainer
            center={[alerta.location_lat, alerta.location_lng]}
            zoom={15}
            className="h-full w-full"
            dragging={false}
            zoomControl={false}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[alerta.location_lat, alerta.location_lng]}>
              <Popup>{alerta.location_address || "Local do alerta"}</Popup>
            </Marker>
          </MapContainer>
        </div>
      )}
    </div>
  );
}

function ModalResolver({
  alertaId,
  aberto,
  aoFechar,
}: {
  alertaId: string | null;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("ATENDIDO");
  const [notas, setNotas] = useState("");
  const [medidaNumero, setMedidaNumero] = useState("");
  const [medidaValidade, setMedidaValidade] = useState("");

  const mutation = useMutation({
    mutationFn: (body: {
      status: string;
      notes?: string;
      medida_protetiva_numero?: string;
      medida_protetiva_validade?: string;
    }) => http.post(`/panic-button/${alertaId}/resolve`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panic-button"] });
      aoFechar();
    },
  });

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Resolver ocorrência"
      tamanho="md"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="resolve-status" className="mb-1 block text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="resolve-status"
            className="w-full rounded border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ATENDIDO">Atendido</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="FALSO_ALARME">Falso alarme</option>
          </select>
        </div>
        <div>
          <label htmlFor="resolve-obs" className="mb-1 block text-sm font-medium text-ink">
            Observações
          </label>
          <textarea
            id="resolve-obs"
            className="w-full rounded border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="resolve-medida-numero" className="mb-1 block text-sm font-medium text-ink">
            Nº Medida Protetiva
          </label>
          <input
            id="resolve-medida-numero"
            className="w-full rounded border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={medidaNumero}
            onChange={(e) => setMedidaNumero(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="resolve-medida-validade" className="mb-1 block text-sm font-medium text-ink">
            Validade Medida Protetiva
          </label>
          <input
            id="resolve-medida-validade"
            type="date"
            className="w-full rounded border border-ink-soft/20 bg-surface px-3 py-2 text-sm"
            value={medidaValidade}
            onChange={(e) => setMedidaValidade(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={() =>
              mutation.mutate({
                status,
                notes: notas || undefined,
                medida_protetiva_numero: medidaNumero || undefined,
                medida_protetiva_validade: medidaValidade || undefined,
              })
            }
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Salvando..." : "Resolver"}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function HistoricoItem({ h }: { h: PanicButtonHistoryItem }) {
  return (
    <div
      className={`rounded-cartao border p-3 ${
        CORES_STATUS[h.status]?.border || "border-ink-soft/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            CORES_STATUS[h.status]
              ? `${CORES_STATUS[h.status].text} ${CORES_STATUS[h.status].border}`
              : "border-ink-soft/20 text-ink"
          }`}
        >
          {ROTULO_STATUS[h.status] || h.status}
        </span>
        <span className="text-xs text-ink-soft">
          {fmtDataHora(h.activated_at)}
        </span>
      </div>
      {h.notes && (
        <p className="mt-2 text-sm text-ink">{h.notes}</p>
      )}
      {h.medida_protetiva_numero && (
        <p className="mt-1 text-xs text-ink-soft">
          Medida Protetiva: {h.medida_protetiva_numero}
          {h.medida_protetiva_validade &&
            ` (válida até ${fmtData(h.medida_protetiva_validade)})`}
        </p>
      )}
    </div>
  );
}

export default function PanicMonitor() {
  const queryClient = useQueryClient();
  const {
    data: ativos,
    isLoading: carregandoAtivos,
    error: erroAtivos,
  } = usePanicButtonAtivos();
  const {
    data: historico,
    isLoading: carregandoHistorico,
  } = usePanicButtonHistorico(50);

  const [resolverId, setResolverId] = useState<string | null>(null);

  const atenderMutation = useMutation({
    mutationFn: (panicId: string) =>
      http.post(`/panic-button/${panicId}/attend`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panic-button"] });
    },
  });

  const aoAtender = useCallback(
    (id: string) => {
      atenderMutation.mutate(id);
    },
    [atenderMutation],
  );

  const aoResolver = useCallback((id: string) => setResolverId(id), []);

  const temAtivos = Array.isArray(ativos) && ativos.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            Monitor de Botão do Pânico
          </h1>
          <p className="text-sm text-ink-soft">
            Lei Maria da Penha — Monitoramento em tempo real
          </p>
        </div>
        <SomAlerta ativo={temAtivos} />
      </div>

      {temAtivos && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded border-2 border-danger/50 bg-danger/10 px-4 py-3"
        >
          <ShieldAlert className="h-5 w-5 text-danger animate-pulse" />
          <span className="font-semibold text-danger">
            {ativos.length} alerta{ativos.length > 1 ? "s" : ""} ativo
            {ativos.length > 1 ? "s" : ""}!
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-base font-semibold text-ink">
            Alertas ativos
          </h2>
          {carregandoAtivos ? (
            <Skeleton variante="cartao" />
          ) : erroAtivos ? (
            <EstadoErro
              problema={{ status: 500, title: "Erro", type: "about:blank" }}
              aoTentarNovamente={() =>
                queryClient.invalidateQueries({
                  queryKey: ["panic-button", "active"],
                })
              }
            />
          ) : !temAtivos ? (
            <div className="rounded-cartao border border-ink-soft/15 bg-surface p-8 text-center">
              <ShieldAlert className="mx-auto mb-2 h-10 w-10 text-ink-soft" />
              <p className="text-sm text-ink-soft">
                Nenhum alerta ativo no momento
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ativos.map((a) => (
                <CartaoAtivo
                  key={a.id}
                  alerta={a}
                  onAtender={aoAtender}
                  onResolver={aoResolver}
                  carregando={atenderMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold text-ink">
            Últimas ocorrências
          </h2>
          {carregandoHistorico ? (
            <Skeleton variante="tabela" linhas={5} />
          ) : (
            <div className="space-y-2">
              {Array.isArray(historico) && historico.length > 0 ? (
                historico.map((h) => <HistoricoItem key={h.id} h={h} />)
              ) : (
                <div className="rounded-cartao border border-ink-soft/15 bg-surface p-8 text-center">
                  <p className="text-sm text-ink-soft">
                    Nenhuma ocorrência registrada
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ModalResolver
        alertaId={resolverId}
        aberto={!!resolverId}
        aoFechar={() => setResolverId(null)}
      />
    </div>
  );
}
