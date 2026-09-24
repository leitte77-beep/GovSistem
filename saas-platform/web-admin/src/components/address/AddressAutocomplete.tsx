"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

export interface AddressData {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
}

interface AddressAutocompleteProps {
  onAddressFound: (data: AddressData) => void;
  onCepChange?: (value: string) => void;
  cepValue?: string;
  inputClass?: string;
  labelClass?: string;
  disabled?: boolean;
}

export default function AddressAutocomplete({
  onAddressFound,
  onCepChange,
  cepValue = "",
  inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm",
  labelClass = "block text-sm font-medium text-gray-700 mb-1",
  disabled = false,
}: AddressAutocompleteProps) {
  const [cep, setCep] = useState(cepValue);
  const [loading, setLoading] = useState(false);
  const lastLookupRef = useRef("");

  useEffect(() => {
    setCep(cepValue);
  }, [cepValue]);

  const lookupCep = useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    if (lastLookupRef.current === digits) return;

    lastLookupRef.current = digits;
    setLoading(true);
    try {
      const data = await api<AddressData>(`/cep/${digits}`);
      if (data && data.uf) {
        onAddressFound(data);
        const nextCep = data.cep || value;
        setCep(nextCep);
        onCepChange?.(nextCep);
        toast.success("Endereço preenchido automaticamente!");
      } else {
        lastLookupRef.current = "";
        toast.error("CEP não encontrado");
      }
    } catch (err: any) {
      lastLookupRef.current = "";
      if (err.message?.includes("404")) {
        toast.error("CEP não encontrado");
      } else {
        toast.error("Erro ao buscar CEP");
      }
    } finally {
      setLoading(false);
    }
  }, [onAddressFound, onCepChange]);

  const handleCepBlur = useCallback(() => {
    void lookupCep(cep);
  }, [cep, lookupCep]);

  useEffect(() => {
    if (cepValue.replace(/\D/g, "").length === 8) {
      void lookupCep(cepValue);
    }
  }, [cepValue, lookupCep]);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length > 8) return;
    const masked = raw.replace(/^(\d{5})(\d{0,3})/, "$1-$2");
    setCep(masked);
    onCepChange?.(masked);
    if (raw.length < 8) {
      lastLookupRef.current = "";
      return;
    }
    void lookupCep(masked);
  };

  return (
    <div className="relative">
      <label className={labelClass}>
        CEP
        <span className="text-xs text-gray-400 ml-1">(digite ou clique na lupa para buscar)</span>
      </label>
      <div className="relative">
        <input
          type="text"
          value={cep}
          onChange={handleCepChange}
          onBlur={handleCepBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookupCep(cep);
            }
          }}
          placeholder="00000-000"
          maxLength={9}
          disabled={disabled || loading}
          className={`${inputClass} pr-10 ${loading ? "opacity-70" : ""}`}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void lookupCep(cep)}
          disabled={disabled || loading}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 disabled:cursor-not-allowed"
          aria-label="Buscar CEP"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin text-gray-400" />
          ) : (
            <Search size={16} className="text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
}
