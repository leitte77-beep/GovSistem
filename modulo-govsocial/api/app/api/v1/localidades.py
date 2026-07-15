import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/localidades", tags=["localidades"])

IBGE_BASE = "https://servicodados.ibge.gov.br/api/v1/localidades"


async def _ibge_get(path: str) -> list[dict]:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{IBGE_BASE}{path}", timeout=10.0)
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return []


@router.get("/estados")
async def listar_estados():
    """Lista todos os estados brasileiros (IBGE)."""
    dados = await _ibge_get("/estados?orderBy=nome")
    if not dados:
        raise HTTPException(status_code=502, detail="Serviço IBGE indisponível")
    return [
        {"sigla": e["sigla"], "nome": e["nome"], "id": e["id"]}
        for e in dados
    ]


@router.get("/estados/{uf}/municipios")
async def listar_municipios(uf: str):
    """Lista municípios de um estado (IBGE)."""
    dados = await _ibge_get(f"/estados/{uf.upper()}/municipios?orderBy=nome")
    if not dados:
        raise HTTPException(status_code=404, detail="UF não encontrada ou serviço indisponível")
    return [
        {"id": m["id"], "nome": m["nome"]}
        for m in dados
    ]
