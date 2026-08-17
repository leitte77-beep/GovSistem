// Testes para as funções de saudação e utilitários do PainelOperacional
// Execute: npx vitest run src/__tests__/painel-operacional.test.js

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock do localStorage para o módulo theme
beforeAll(() => {
  global.localStorage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
});

describe('Greeting and utility functions', () => {
  let getSaudacao, getPrimeiroNome, formataTempo, formataEsperaCurta, formataDataExtenso;

  beforeAll(async () => {
    const mod = await import('../components/PainelOperacional.jsx');
    getSaudacao = mod.getSaudacao;
    getPrimeiroNome = mod.getPrimeiroNome;
    formataTempo = mod.formataTempo;
    formataEsperaCurta = mod.formataEsperaCurta;
    formataDataExtenso = mod.formataDataExtenso;
  });

  describe('getSaudacao', () => {
    it('retorna "Bom dia" entre 05:00 e 11:59', () => {
      expect(getSaudacao(new Date(2026, 6, 22, 8, 30))).toBe('Bom dia');
      expect(getSaudacao(new Date(2026, 6, 22, 5, 0))).toBe('Bom dia');
      expect(getSaudacao(new Date(2026, 6, 22, 11, 59))).toBe('Bom dia');
    });

    it('retorna "Boa tarde" entre 12:00 e 17:59', () => {
      expect(getSaudacao(new Date(2026, 6, 22, 14, 0))).toBe('Boa tarde');
      expect(getSaudacao(new Date(2026, 6, 22, 12, 0))).toBe('Boa tarde');
      expect(getSaudacao(new Date(2026, 6, 22, 17, 59))).toBe('Boa tarde');
    });

    it('retorna "Boa noite" entre 18:00 e 04:59', () => {
      expect(getSaudacao(new Date(2026, 6, 22, 20, 0))).toBe('Boa noite');
      expect(getSaudacao(new Date(2026, 6, 22, 2, 0))).toBe('Boa noite');
      expect(getSaudacao(new Date(2026, 6, 22, 18, 0))).toBe('Boa noite');
      expect(getSaudacao(new Date(2026, 6, 22, 4, 59))).toBe('Boa noite');
    });

    it('cobre as 24 horas exatamente nas 3 faixas', () => {
      const faixas = { 'Bom dia': 0, 'Boa tarde': 0, 'Boa noite': 0 };
      for (let h = 0; h < 24; h++) {
        faixas[getSaudacao(new Date(2026, 6, 22, h, 0))]++;
      }
      expect(faixas['Bom dia']).toBe(7);
      expect(faixas['Boa tarde']).toBe(6);
      expect(faixas['Boa noite']).toBe(11);
    });
  });

  describe('getPrimeiroNome', () => {
    it('retorna o primeiro nome', () => {
      expect(getPrimeiroNome('Alisson Leite')).toBe('Alisson');
      expect(getPrimeiroNome('João Silva Santos')).toBe('João');
      expect(getPrimeiroNome('Maria')).toBe('Maria');
    });

    it('retorna vazio para nome nulo/vazio', () => {
      expect(getPrimeiroNome(null)).toBe('');
      expect(getPrimeiroNome(undefined)).toBe('');
      expect(getPrimeiroNome('')).toBe('');
      expect(getPrimeiroNome('  ')).toBe('');
    });

    it('respeita acentos e maiusculas', () => {
      expect(getPrimeiroNome('João da Silva')).toBe('João');
      expect(getPrimeiroNome('JOSÉ Santos')).toBe('JOSÉ');
    });
  });

  describe('formataTempo', () => {
    it('retorna "—" para zero, nulo ou negativo', () => {
      expect(formataTempo(0)).toBe('—');
      expect(formataTempo(null)).toBe('—');
      expect(formataTempo(undefined)).toBe('—');
    });

    it('formata segundos', () => {
      expect(formataTempo(30)).toBe('30s');
      expect(formataTempo(59)).toBe('59s');
    });

    it('formata minutos e segundos', () => {
      expect(formataTempo(60)).toBe('1m 0s');
      expect(formataTempo(90)).toBe('1m 30s');
      expect(formataTempo(125)).toBe('2m 5s');
    });

    it('formata horas e minutos', () => {
      expect(formataTempo(3600)).toBe('1h 0m');
      expect(formataTempo(3665)).toBe('1h 1m');
    });

    it('formata dias e horas (>= 24h)', () => {
      expect(formataTempo(86400)).toBe('1d 0h');
      expect(formataTempo(90000)).toBe('1d 1h');
      expect(formataTempo(172800)).toBe('2d 0h');
    });
  });

  describe('formataEsperaCurta', () => {
    it('retorna "agora" para zero ou nulo', () => {
      expect(formataEsperaCurta(0)).toBe('agora');
      expect(formataEsperaCurta(null)).toBe('agora');
    });

    it('formata com prefixo +', () => {
      expect(formataEsperaCurta(30)).toBe('+30s');
      expect(formataEsperaCurta(120)).toBe('+2m');
      expect(formataEsperaCurta(3600)).toBe('+1h 0m');
    });

    it('formata dias (>= 24h)', () => {
      expect(formataEsperaCurta(86400)).toBe('+1d 0h');
      expect(formataEsperaCurta(90000)).toBe('+1d 1h');
      expect(formataEsperaCurta(7 * 86400 + 3600)).toBe('+7d 1h');
    });

    it('cenario BUG 1: 30 dias de espera nao quebra o formatador', () => {
      expect(formataEsperaCurta(30 * 86400)).toBe('+30d 0h');
      expect(formataEsperaCurta(33 * 86400 + 15 * 3600)).toBe('+33d 15h');
    });
  });

  describe('formataDataExtenso', () => {
    it('formata data corretamente em portugues', () => {
      // 22 de Julho de 2026 = Quarta-feira
      const data = new Date(2026, 6, 22);
      const result = formataDataExtenso(data);
      expect(result).toContain('Quarta-feira');
      expect(result).toContain('22');
      expect(result).toContain('Julho');
      expect(result).toContain('2026');
    });
  });
});
