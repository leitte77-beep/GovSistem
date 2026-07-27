"use client";
import React, { useCallback } from "react";
import AddressAutocomplete, { AddressData } from "./AddressAutocomplete";

export interface AddressFields {
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

interface AddressFormProps {
  values: AddressFields;
  onChange: (field: string, value: string) => void;
  prefix?: string;
  inputClass?: string;
  labelClass?: string;
  disabled?: boolean;
  title?: string;
}

export default function AddressForm({
  values,
  onChange,
  prefix = "",
  inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm",
  labelClass = "block text-sm font-medium text-gray-700 mb-1",
  disabled = false,
  title = "Endereço",
}: AddressFormProps) {
  const onAddressFound = useCallback(
    (data: AddressData) => {
      const fieldMap: Record<string, string> = {
        address_zip: data.cep || "",
        address_street: data.logradouro || "",
        address_neighborhood: data.bairro || "",
        address_city: data.localidade || "",
        address_state: data.uf || "",
      };
      Object.entries(fieldMap).forEach(([field, value]) => {
        onChange(`${prefix}${field}`, value);
      });
    },
    [onChange, prefix]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange(e.target.name, e.target.value);
  };

  const stateOptions = [
    "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
    "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
  ];

  return (
    <div>
      <h4 className="text-md font-semibold text-gray-800 mb-4">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-1">
          <AddressAutocomplete
            onAddressFound={onAddressFound}
            onCepChange={(value) => onChange(`${prefix}address_zip`, value)}
            cepValue={values.address_zip}
            inputClass={inputClass}
            labelClass={labelClass}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-4">
        <div className="md:col-span-3">
          <label className={labelClass}>Rua</label>
          <input
            name={`${prefix}address_street`}
            value={values.address_street}
            onChange={handleChange}
            className={inputClass}
            placeholder="Logradouro"
            disabled={disabled}
          />
        </div>
        <div className="md:col-span-1">
          <label className={labelClass}>Número</label>
          <input
            name={`${prefix}address_number`}
            value={values.address_number}
            onChange={handleChange}
            className={inputClass}
            placeholder="Nº"
            disabled={disabled}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Complemento</label>
          <input
            name={`${prefix}address_complement`}
            value={values.address_complement}
            onChange={handleChange}
            className={inputClass}
            placeholder="Apto, Bloco, etc"
            disabled={disabled}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Bairro</label>
          <input
            name={`${prefix}address_neighborhood`}
            value={values.address_neighborhood}
            onChange={handleChange}
            className={inputClass}
            placeholder="Bairro"
            disabled={disabled}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Cidade</label>
          <input
            name={`${prefix}address_city`}
            value={values.address_city}
            onChange={handleChange}
            className={inputClass}
            placeholder="Cidade"
            disabled={disabled}
          />
        </div>
        <div className="md:col-span-1">
          <label className={labelClass}>UF</label>
          <select
            name={`${prefix}address_state`}
            value={values.address_state}
            onChange={handleChange}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">UF</option>
            {stateOptions.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
