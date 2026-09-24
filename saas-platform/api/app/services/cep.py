import httpx
from typing import Optional, TypedDict


class AddressData(TypedDict, total=False):
    cep: str
    logradouro: str
    complemento: str
    bairro: str
    localidade: str
    uf: str
    ibge: str
    ddd: str


VIACEP_URL = "https://viacep.com.br/ws/{cep}/json/"


async def lookup_cep(cep: str) -> Optional[AddressData]:
    digits = "".join(c for c in cep if c.isdigit())
    if len(digits) != 8:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(VIACEP_URL.format(cep=digits))
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("erro"):
                return None
            return data
    except httpx.HTTPError:
        return None
