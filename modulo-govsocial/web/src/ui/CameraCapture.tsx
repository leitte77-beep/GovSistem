import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Botao } from "./Botao";

type EstadoCamera = "solicitando" | "ativo" | "erro";

interface CameraCaptureProps {
  aoCapturar: (base64: string) => void;
}

export function CameraCapture({ aoCapturar }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<EstadoCamera>("solicitando");
  const [erro, setErro] = useState<string>("");
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);

  const iniciarCamera = useCallback(async () => {
    setEstado("solicitando");
    setErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEstado("ativo");
    } catch {
      setEstado("erro");
      setErro("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    }
  }, []);

  useEffect(() => {
    iniciarCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [iniciarCamera]);

  const capturar = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    setFotoBase64(base64);
    aoCapturar(base64);
  }, [aoCapturar]);

  if (estado === "solicitando") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-surface-container-highest/50 bg-surface p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-secondary">Solicitando permissão da câmera…</p>
      </div>
    );
  }

  if (estado === "erro") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-warning/30 bg-warning/5 p-8">
        <CameraOff className="h-8 w-8 text-warning" />
        <p className="text-sm text-center text-secondary max-w-xs">{erro}</p>
        <Botao variante="secundario" onClick={iniciarCamera}>
          Tentar novamente
        </Botao>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative overflow-hidden rounded-xl bg-black w-full max-w-sm aspect-[4/3]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {fotoBase64 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-sm font-medium">Foto capturada</span>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-2">
        <Botao variante="primario" onClick={capturar}>
          <Camera className="h-4 w-4 mr-1" />
          Capturar
        </Botao>
        <Botao variante="secundario" onClick={iniciarCamera}>
          Reiniciar câmera
        </Botao>
      </div>
    </div>
  );
}
