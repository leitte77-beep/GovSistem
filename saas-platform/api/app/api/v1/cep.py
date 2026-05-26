from fastapi import APIRouter, HTTPException

from app.services.cep import lookup_cep

router = APIRouter(prefix="/cep", tags=["cep"])


@router.get("/{cep}")
async def get_address_by_cep(cep: str):
    result = await lookup_cep(cep)
    if result is None:
        raise HTTPException(status_code=404, detail="CEP não encontrado")
    return {
        "cep": result.get("cep", ""),
        "logradouro": result.get("logradouro", ""),
        "complemento": result.get("complemento", ""),
        "bairro": result.get("bairro", ""),
        "localidade": result.get("localidade", ""),
        "uf": result.get("uf", ""),
        "ibge": result.get("ibge", ""),
        "ddd": result.get("ddd", ""),
    }
