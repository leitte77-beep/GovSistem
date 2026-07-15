import { describe, expect, it } from "vitest";
import {
  apenasDigitos,
  formatarCpfParcial,
  mascararCpf,
  mascararNis,
  validarCep,
  validarCpf,
  validarNis,
} from "@/nucleo/validadoresBr";

describe("validarCpf", () => {
  it("aceita CPFs com dígito verificador válido", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("11144477735")).toBe(true);
    expect(validarCpf("390.533.447-05")).toBe(true);
  });

  it("rejeita CPF com DV errado, tamanho errado ou dígitos repetidos", () => {
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("123")).toBe(false);
    expect(validarCpf("")).toBe(false);
    expect(validarCpf(null)).toBe(false);
  });
});

describe("validarNis", () => {
  it("aceita NIS com DV válido", () => {
    expect(validarNis("20883856292")).toBe(true);
    expect(validarNis("12345678900")).toBe(true);
  });

  it("rejeita NIS inválido", () => {
    expect(validarNis("20883856291")).toBe(false);
    expect(validarNis("00000000000")).toBe(false);
    expect(validarNis("123")).toBe(false);
  });
});

describe("validarCep", () => {
  it("valida 8 dígitos", () => {
    expect(validarCep("58000-000")).toBe(true);
    expect(validarCep("58000000")).toBe(true);
    expect(validarCep("5800")).toBe(false);
  });
});

describe("máscaras (LGPD) — iguais ao backend", () => {
  it("mascara CPF como ***.***.***-NN", () => {
    expect(mascararCpf("52998224725")).toBe("***.***.***-25");
    expect(mascararCpf("529")).toBeNull();
  });

  it("mascara NIS mostrando só os 3 últimos", () => {
    expect(mascararNis("20883856292")).toBe("********292");
  });
});

describe("apenasDigitos e máscara progressiva", () => {
  it("remove tudo que não é dígito", () => {
    expect(apenasDigitos("529.982.247-25")).toBe("52998224725");
  });

  it("formata CPF parcial durante a digitação", () => {
    expect(formatarCpfParcial("529")).toBe("529");
    expect(formatarCpfParcial("529982")).toBe("529.982");
    expect(formatarCpfParcial("52998224725")).toBe("529.982.247-25");
  });
});
