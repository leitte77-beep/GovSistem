import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/cep", tags=["cep"])

VIA_CEP_BASE = "https://viacep.com.br/ws"


async def _viacep_get(path: str) -> dict | None:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{VIA_CEP_BASE}{path}", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict) and "erro" not in data:
                    return data
                if isinstance(data, list):
                    return {"resultados": data}
    except Exception:
        pass
    return None


@router.get("/{cep}")
async def consultar_cep(cep: str):
    """Consulta endereço pelo CEP (proxy ViaCEP)."""
    cep_limpo = "".join(c for c in cep if c.isdigit())
    if len(cep_limpo) != 8:
        raise HTTPException(status_code=400, detail="CEP deve ter 8 dígitos")
    dados = await _viacep_get(f"/{cep_limpo}/json/")
    if not dados:
        raise HTTPException(status_code=404, detail="CEP não encontrado")
    return dados


@router.get("/pesquisar")
async def pesquisar_cep(
    uf: str = Query(..., min_length=2, max_length=2, description="Sigla UF (ex: SP)"),
    cidade: str = Query(..., min_length=3, description="Nome da cidade"),
    logradouro: str = Query(..., min_length=3, description="Nome do logradouro"),
):
    """Pesquisa CEP por UF + cidade + logradouro (proxy ViaCEP)."""
    dados = await _viacep_get(f"/{uf.upper()}/{cidade}/{logradouro}/json/")
    if not dados:
        raise HTTPException(status_code=404, detail="Nenhum CEP encontrado")
    return dados
