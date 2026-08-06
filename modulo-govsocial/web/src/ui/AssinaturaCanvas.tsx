import { useImperativeHandle, useRef, forwardRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Botao } from "./Botao";

/**
 * <AssinaturaCanvas> — assinatura na tela (opcional) para a entrega do benefício
 * (§4.4). Usa pointer events (funciona com mouse, toque e caneta). Exponibiliza
 * `estaVazia()` e `paraDataUrl()` via ref. Acessível: tem rótulo, instrução e
 * botão de limpar; a assinatura é opcional, então não bloqueia teclado.
 */
export type AssinaturaCanvasRef = {
  estaVazia: () => boolean;
  paraDataUrl: () => string | null;
  limpar: () => void;
};

export const AssinaturaCanvas = forwardRef<AssinaturaCanvasRef, { label?: string }>(
  function AssinaturaCanvas({ label = "Assinatura do recebedor (opcional)" }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const desenhando = useRef(false);
    const [temTraco, setTemTraco] = useState(false);

    function ctx() {
      return canvasRef.current?.getContext("2d") ?? null;
    }

    function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
      const c = ctx();
      if (!c) return;
      desenhando.current = true;
      canvasRef.current?.setPointerCapture(e.pointerId);
      const p = ponto(e);
      c.beginPath();
      c.moveTo(p.x, p.y);
    }

    function mover(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!desenhando.current) return;
      const c = ctx();
      if (!c) return;
      const p = ponto(e);
      c.lineWidth = 2;
      c.lineCap = "round";
      c.strokeStyle = "#20302D";
      c.lineTo(p.x, p.y);
      c.stroke();
      if (!temTraco) setTemTraco(true);
    }

    function fim() {
      desenhando.current = false;
    }

    function limpar() {
      const canvas = canvasRef.current;
      const c = ctx();
      if (canvas && c) c.clearRect(0, 0, canvas.width, canvas.height);
      setTemTraco(false);
    }

    useImperativeHandle(ref, () => ({
      estaVazia: () => !temTraco,
      paraDataUrl: () => (temTraco ? canvasRef.current?.toDataURL("image/png") ?? null : null),
      limpar,
    }));

    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <p className="text-xs text-ink-soft">
          Assine com o dedo, caneta ou mouse. A assinatura é opcional.
        </p>
        <canvas
          ref={canvasRef}
          width={480}
          height={140}
          role="img"
          aria-label="Área de assinatura"
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fim}
          onPointerLeave={fim}
          className="w-full touch-none rounded-input border border-ink-soft/30 bg-surface"
        />
        <div>
          <Botao
            variante="texto"
            tamanho="sm"
            onClick={limpar}
            iconeInicio={<Eraser className="h-4 w-4" aria-hidden />}
          >
            Limpar assinatura
          </Botao>
        </div>
      </div>
    );
  },
);
