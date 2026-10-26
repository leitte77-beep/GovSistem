"""Consulta de CEP na base oficial importada; sem base, fica pendente."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import somente_digitos, validar_cep
from app.core.errors import Unprocessable
from app.models.referencia import Cep

STATUS_PENDENTE = "PENDENTE_ESPECIFICACAO_OFICIAL"


async def consultar(db: AsyncSession, cep: str) -> dict:
    if not validar_cep(cep):
        raise Unprocessable("CEP inválido.", code="cep")
    numero = somente_digitos(cep)
    registro = await db.get(Cep, numero)
    if registro is None or not registro.ativo:
        return {
            "status": STATUS_PENDENTE,
            "cep": numero,
            "mensagem": (
                "Base oficial de CEP não importada. Consulte "
                "docs/pendencias-oficiais.md."
            ),
        }
    return {
        "status": "ENCONTRADO",
        "cep": numero,
        "logradouro": registro.logradouro,
        "bairro": registro.bairro,
        "municipio_ibge": registro.municipio_ibge,
        "uf": registro.uf,
        "mensagem": None,
    }
