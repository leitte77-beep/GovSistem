"""Schemas da identidade institucional da organização.

Alimenta o cabeçalho/rodapé dos documentos oficiais (município, endereço, CNPJ,
telefone, site, brasão) sem que cada modelo precise repetir esses dados.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class InstitutionalProfileOut(BaseModel):
    name: str
    slug: str
    cnpj: Optional[str] = None
    state: Optional[str] = None
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_district: Optional[str] = None
    address_city: Optional[str] = None
    address_postal_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    site: Optional[str] = None
    logo_url: Optional[str] = None
    institutional_layout: Optional[dict] = None


class InstitutionalProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    cnpj: Optional[str] = Field(default=None, max_length=18)
    state: Optional[str] = Field(default=None, max_length=2)
    address_street: Optional[str] = Field(default=None, max_length=255)
    address_number: Optional[str] = Field(default=None, max_length=20)
    address_complement: Optional[str] = Field(default=None, max_length=120)
    address_district: Optional[str] = Field(default=None, max_length=120)
    address_city: Optional[str] = Field(default=None, max_length=120)
    address_postal_code: Optional[str] = Field(default=None, max_length=10)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=255)
    site: Optional[str] = Field(default=None, max_length=255)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    institutional_layout: Optional[dict] = None


__all__ = ["InstitutionalProfileOut", "InstitutionalProfileUpdate"]
