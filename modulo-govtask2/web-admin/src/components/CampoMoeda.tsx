"use client";

/**
 * Campo de dinheiro em padrão brasileiro.
 *
 * Mostra `1.234.567,89` e entrega ao formulário o valor cru `1234567.89`, que é
 * o que a API entende. A digitação é lida como centavos: teclar `134000` vira
 * `1.340,00`. Assim não fica dúvida se o ponto é milhar ou decimal.
 */

const LIMITE_DIGITOS = 15;

function paraExibicao(valor: string): string {
  const digitos = valor
    ? Math.round(Number(valor) * 100)
        .toString()
        .replace(/^0+/, "")
    : "";
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CampoMoeda({
  id,
  valor,
  aoMudar,
  className = "campo",
  placeholder = "0,00",
  autoFocus,
}: {
  id?: string;
  /** Valor cru, com ponto decimal (ex.: "134000.00") ou vazio. */
  valor: string;
  /** Recebe o valor cru correspondente (ou vazio). */
  aoMudar: (valor: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted">
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`${className} text-right`}
        style={{ paddingLeft: "2.5rem" }}
        placeholder={placeholder}
        value={paraExibicao(valor)}
        autoFocus={autoFocus}
        onChange={(e) => {
          const digitos = e.target.value
            .replace(/\D/g, "")
            .replace(/^0+/, "")
            .slice(0, LIMITE_DIGITOS);
          aoMudar(digitos ? (Number(digitos) / 100).toFixed(2) : "");
        }}
      />
    </div>
  );
}
