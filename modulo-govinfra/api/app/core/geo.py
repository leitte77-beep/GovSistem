"""Georreferenciamento: distâncias, validação de coordenadas e geocodificação.

Decisão de arquitetura: o módulo NÃO depende de PostGIS nem de um provedor de
mapas pago. As coordenadas ficam em colunas `latitude`/`longitude` indexadas, e
as consultas de proximidade usam um pré-filtro por caixa (bounding box) seguido
do cálculo de Haversine. Isso funciona em PostgreSQL, em SQLite (testes) e em
qualquer instalação municipal, com precisão mais que suficiente para a escala de
um município.

A geocodificação é sempre AUXILIAR: se o provedor externo estiver fora do ar, o
cadastro continua possível marcando o ponto manualmente no mapa. Nenhuma rota
falha por causa disso.
"""

import logging
import math
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger("govinfra.geo")

RAIO_TERRA_KM = 6371.0088


def coordenada_valida(latitude: float | None, longitude: float | None) -> bool:
    if latitude is None or longitude is None:
        return False
    return -90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0


def distancia_km(
    lat1: float | None, lon1: float | None, lat2: float | None, lon2: float | None
) -> float | None:
    """Distância em linha reta (Haversine).

    Retorna `None` quando falta alguma coordenada — o chamador decide se isso é
    um impedimento ou apenas ausência de informação.
    """
    if not coordenada_valida(lat1, lon1) or not coordenada_valida(lat2, lon2):
        return None
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return round(2 * RAIO_TERRA_KM * math.asin(math.sqrt(a)), 3)


def caixa_ao_redor(latitude: float, longitude: float, raio_km: float) -> tuple[float, float, float, float]:
    """Caixa (lat_min, lat_max, lon_min, lon_max) que contém o círculo de raio informado.

    Usada como pré-filtro indexável antes do Haversine: o banco descarta a
    maioria dos registros com uma comparação simples de intervalo.
    """
    delta_lat = raio_km / 111.32
    cos_lat = math.cos(math.radians(latitude))
    delta_lon = raio_km / (111.32 * cos_lat) if abs(cos_lat) > 1e-9 else 180.0
    return (
        latitude - delta_lat,
        latitude + delta_lat,
        longitude - delta_lon,
        longitude + delta_lon,
    )


@dataclass
class ResultadoGeocodificacao:
    latitude: float
    longitude: float
    endereco_formatado: str
    precisao: str
    provedor: str


async def geocodificar(endereco: str) -> ResultadoGeocodificacao | None:
    """Sugere coordenadas para um endereço.

    Retorna `None` (sem levantar exceção) quando o provedor está desligado,
    indisponível ou não encontrou o endereço. Quem chama trata isso como
    "sem sugestão", nunca como erro que impede o cadastro.
    """
    if settings.GEOCODE_PROVIDER.lower() != "nominatim":
        return None

    consulta = (endereco or "").strip()
    if len(consulta) < 4:
        return None

    try:
        import httpx

        async with httpx.AsyncClient(timeout=settings.GEOCODE_TIMEOUT_SECONDS) as cliente:
            resposta = await cliente.get(
                f"{settings.GEOCODE_BASE_URL.rstrip('/')}/search",
                params={
                    "q": consulta,
                    "format": "jsonv2",
                    "limit": 1,
                    "countrycodes": "br",
                    "addressdetails": 1,
                },
                headers={"User-Agent": settings.GEOCODE_USER_AGENT},
            )
        if resposta.status_code != 200:
            logger.info("Geocodificação indisponível (HTTP %s)", resposta.status_code)
            return None
        dados = resposta.json()
        if not dados:
            return None
        primeiro = dados[0]
        return ResultadoGeocodificacao(
            latitude=float(primeiro["lat"]),
            longitude=float(primeiro["lon"]),
            endereco_formatado=primeiro.get("display_name", consulta),
            precisao=primeiro.get("type") or "aproximada",
            provedor="nominatim",
        )
    except Exception as erro:  # rede fora, timeout, JSON inesperado
        logger.info("Geocodificação falhou (%s) — segue com marcação manual", erro.__class__.__name__)
        return None


def configuracao_mapa() -> dict:
    """Parâmetros do mapa entregues ao frontend.

    Manter isto no backend é o que permite trocar de provedor de mapas sem
    recompilar o frontend: basta alterar as variáveis de ambiente.
    """
    return {
        "url_tiles": settings.MAP_TILE_URL,
        "atribuicao": settings.MAP_TILE_ATTRIBUTION,
        "centro": {"latitude": settings.MAP_DEFAULT_LAT, "longitude": settings.MAP_DEFAULT_LON},
        "zoom": settings.MAP_DEFAULT_ZOOM,
        "geocodificacao_ativa": settings.GEOCODE_PROVIDER.lower() != "none",
    }
