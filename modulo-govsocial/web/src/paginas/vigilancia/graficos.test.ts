import { describe, expect, it } from "vitest";
import {
  beneficiosParaDonut,
  calcularFatiasDonut,
  faixaRendaParaDonut,
  normalizarBarras,
  percentualInteiro,
  projetarMapa,
  rotuloFaixaRenda,
  rotuloMesCurto,
  serieAtendimentosParaBarras,
} from "@/paginas/vigilancia/graficos";
import type { MapItem, TimeSeriesItem } from "@/tipos/dashboard";

describe("calcularFatiasDonut", () => {
  it("calcula percentuais e offsets acumulados", () => {
    const { total, fatias } = calcularFatiasDonut([
      { rotulo: "A", valor: 30 },
      { rotulo: "B", valor: 10 },
    ]);
    expect(total).toBe(40);
    expect(fatias[0].percentual).toBe(75);
    expect(fatias[0].inicio).toBe(0);
    expect(fatias[1].percentual).toBe(25);
    expect(fatias[1].inicio).toBe(75);
  });

  it("trata total zero sem divisão por zero", () => {
    const { total, fatias } = calcularFatiasDonut([{ rotulo: "A", valor: 0 }]);
    expect(total).toBe(0);
    expect(fatias[0].percentual).toBe(0);
  });

  it("ignora valores negativos (tratados como zero)", () => {
    const { total } = calcularFatiasDonut([{ rotulo: "A", valor: -5 }]);
    expect(total).toBe(0);
  });
});

describe("percentualInteiro", () => {
  it("arredonda o percentual", () => {
    expect(percentualInteiro(1, 3)).toBe(33);
    expect(percentualInteiro(2, 3)).toBe(67);
  });

  it("retorna 0 quando total é zero", () => {
    expect(percentualInteiro(5, 0)).toBe(0);
  });
});

describe("normalizarBarras", () => {
  it("normaliza pela maior barra", () => {
    const { maximo, barras } = normalizarBarras([
      { rotulo: "jan", valor: 50 },
      { rotulo: "fev", valor: 100 },
    ]);
    expect(maximo).toBe(100);
    expect(barras[0].fracao).toBe(0.5);
    expect(barras[1].fracao).toBe(1);
  });

  it("evita divisão por zero quando todas as barras são zero", () => {
    const { barras } = normalizarBarras([{ rotulo: "jan", valor: 0 }]);
    expect(barras[0].fracao).toBe(0);
  });
});

describe("conversões de série/benefícios/renda", () => {
  it("serieAtendimentosParaBarras usa mês curto e atendimentos", () => {
    const serie: TimeSeriesItem[] = [
      { ano: 2026, mes: 6, atendimentos: 120, beneficios: 30 },
    ];
    expect(serieAtendimentosParaBarras(serie)).toEqual([{ rotulo: "jun", valor: 120 }]);
  });

  it("beneficiosParaDonut mapeia total de concessões", () => {
    expect(
      beneficiosParaDonut([
        { tipo_beneficio: "Cesta básica", total_concessoes: 48, valor_total: 6720 },
      ]),
    ).toEqual([{ rotulo: "Cesta básica", valor: 48 }]);
  });

  it("faixaRendaParaDonut traduz os códigos", () => {
    expect(faixaRendaParaDonut([{ faixa: "EXTREMA_POBREZA", total: 512 }])).toEqual([
      { rotulo: "Extrema pobreza", valor: 512 },
    ]);
  });

  it("rotuloMesCurto e rotuloFaixaRenda têm fallback", () => {
    expect(rotuloMesCurto(1)).toBe("jan");
    expect(rotuloFaixaRenda("DESCONHECIDA")).toBe("DESCONHECIDA");
  });
});

describe("projetarMapa", () => {
  const itens: MapItem[] = [
    {
      territorio: "Norte",
      bairro: "N",
      total_familias: 100,
      centroide_lat: -7.0,
      centroide_lng: -34.9,
    },
    {
      territorio: "Sul",
      bairro: "S",
      total_familias: 50,
      centroide_lat: -7.2,
      centroide_lng: -34.8,
    },
  ];

  it("projeta dentro dos limites e inverte a latitude (norte no topo)", () => {
    const pontos = projetarMapa(itens, 320, 220);
    expect(pontos).toHaveLength(2);
    const norte = pontos.find((p) => p.item.territorio === "Norte")!;
    const sul = pontos.find((p) => p.item.territorio === "Sul")!;
    // Latitude maior (mais ao norte) → y menor (mais no topo).
    expect(norte.y).toBeLessThan(sul.y);
    // Raio proporcional ao total de famílias.
    expect(norte.raio).toBeGreaterThan(sul.raio);
    for (const p of pontos) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(320);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(220);
    }
  });

  it("descarta itens sem coordenadas", () => {
    const semCoord: MapItem[] = [
      { territorio: "X", bairro: "X", total_familias: 10, centroide_lat: null, centroide_lng: null },
    ];
    expect(projetarMapa(semCoord, 320, 220)).toEqual([]);
  });

  it("centraliza um único ponto", () => {
    const pontos = projetarMapa([itens[0]], 320, 220);
    expect(pontos[0].x).toBe(160);
    expect(pontos[0].y).toBe(110);
  });
});
