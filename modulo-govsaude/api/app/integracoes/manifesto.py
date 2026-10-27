"""Adaptador oficial orientado por manifesto (Fase 11, B.12-059/060/061).

Nenhum layout está no código. O artefato oficial (``.thrift``, XSD,
StructureDefinition FHIR, dicionário BNAFAR) fica versionado em
``especificacoes/<SISTEMA>/<versao>/`` junto de um ``manifest.json`` que
descreve, por tipo de registro, o mapeamento do payload canônico do domínio
para os campos do layout. Trocar a versão do layout é trocar o manifesto
(B.12-060), sem alterar o motor.

Formato do manifesto::

    {
      "sistema": "RNDS", "versao_layout": "...", "fonte": "documento oficial",
      "sintetico": false,
      "transporte": {"tipo": "HTTP_JSON" | "ARQUIVO", "metodo": "POST",
                     "caminho": "/...", "protocolo_em": "id",
                     "mensagens_em": "issue", "aceite_imediato": false},
      "registros": {
        "<tipo_registro>": {
          "operacoes": ["INCLUSAO", "ALTERACAO", "EXCLUSAO"],
          "envelope": {...constantes...},
          "campos": [{"destino": "a.b.c", "origem": "cidadao.cns",
                      "obrigatorio": true, "formato": "texto|numero|data|data_hora|booleano",
                      "max": 20, "constante": "...", "rotulo": "CNS do cidadão"}]
        }
      }
    }

``origem`` também aceita os marcadores ``$operacao`` e ``$registro_id``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from app.core.config import settings
from app.integracoes.porta import PendenteEspecificacaoOficialError

FORMATOS = {"texto", "numero", "data", "data_hora", "booleano"}


def diretorio_especificacoes() -> Path:
    if settings.INTEGRACOES_ESPECIFICACOES_DIR:
        return Path(settings.INTEGRACOES_ESPECIFICACOES_DIR)
    return Path(__file__).resolve().parent / "especificacoes"


class ManifestoInvalidoError(ValueError):
    pass


@dataclass
class Manifesto:
    sistema: str
    versao_layout: str
    fonte: str
    sintetico: bool
    transporte: dict
    registros: dict[str, dict]
    caminho: Path | None = None
    avisos: list[str] = field(default_factory=list)


def ler_manifesto(caminho: Path) -> Manifesto:
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestoInvalidoError(f"manifesto ilegível: {exc.__class__.__name__}") from exc
    for chave in ("sistema", "versao_layout", "fonte", "transporte", "registros"):
        if chave not in bruto:
            raise ManifestoInvalidoError(f"campo '{chave}' ausente")
    if bruto["transporte"].get("tipo") not in {"HTTP_JSON", "ARQUIVO"}:
        raise ManifestoInvalidoError("transporte.tipo deve ser HTTP_JSON ou ARQUIVO")
    for tipo, definicao in bruto["registros"].items():
        for campo in definicao.get("campos", []):
            if "destino" not in campo or ("origem" not in campo and "constante" not in campo):
                raise ManifestoInvalidoError(f"{tipo}: campo sem destino/origem")
            if campo.get("formato", "texto") not in FORMATOS:
                raise ManifestoInvalidoError(f"{tipo}.{campo['destino']}: formato inválido")
    return Manifesto(
        sistema=str(bruto["sistema"]),
        versao_layout=str(bruto["versao_layout"]),
        fonte=str(bruto["fonte"]),
        sintetico=bool(bruto.get("sintetico", False)),
        transporte=dict(bruto["transporte"]),
        registros=dict(bruto["registros"]),
        caminho=caminho,
    )


def manifestos_do_sistema(sistema: str) -> dict[str, Path]:
    base = diretorio_especificacoes() / sistema
    if not base.is_dir():
        return {}
    return {p.parent.name: p for p in sorted(base.glob("*/manifest.json"))}


def _ler(origem: str, payload: dict, operacao: str, registro_id: str):
    if origem == "$operacao":
        return operacao
    if origem == "$registro_id":
        return registro_id
    valor = payload
    for parte in origem.split("."):
        if not isinstance(valor, dict):
            return None
        valor = valor.get(parte)
    return valor


def _formatar(valor, formato: str):
    if valor is None:
        return None
    if formato == "data":
        return valor.isoformat() if isinstance(valor, date | datetime) else str(valor)[:10]
    if formato == "data_hora":
        return valor.isoformat() if isinstance(valor, datetime) else str(valor)
    if formato == "numero":
        return float(valor) if not isinstance(valor, int) else valor
    if formato == "booleano":
        return bool(valor)
    return str(valor)


def _gravar(destino: dict, caminho: str, valor) -> None:
    partes = caminho.split(".")
    alvo = destino
    for parte in partes[:-1]:
        alvo = alvo.setdefault(parte, {})
    alvo[partes[-1]] = valor


class AdaptadorManifesto:
    """Implementa a porta oficial a partir do manifesto da versão ativa."""

    def __init__(self, manifesto: Manifesto):
        self.manifesto = manifesto
        self.sistema = manifesto.sistema
        self.versao = manifesto.versao_layout

    @property
    def transporte(self) -> dict:
        return self.manifesto.transporte

    def suporta(self, tipo_registro: str, operacao: str = "INCLUSAO") -> bool:
        definicao = self.manifesto.registros.get(tipo_registro)
        return bool(definicao) and operacao in definicao.get("operacoes", ["INCLUSAO"])

    def validar(self, payload: dict) -> list[dict]:
        tipo = payload.get("tipo_registro")
        operacao = payload.get("operacao", "INCLUSAO")
        definicao = self.manifesto.registros.get(tipo)
        if definicao is None:
            return [
                {
                    "codigo": "TIPO_NAO_PREVISTO_NO_LAYOUT",
                    "texto": f"O layout {self.versao} de {self.sistema} não prevê '{tipo}'.",
                }
            ]
        if operacao not in definicao.get("operacoes", ["INCLUSAO"]):
            return [
                {
                    "codigo": "OPERACAO_NAO_ADMITIDA",
                    "texto": f"{self.sistema} não admite {operacao} para '{tipo}' neste layout.",
                }
            ]
        mensagens = []
        dados = payload.get("dados") or {}
        for campo in definicao.get("campos", []):
            if "constante" in campo:
                continue
            valor = _ler(campo["origem"], dados, operacao, str(payload.get("registro_id")))
            rotulo = campo.get("rotulo") or campo["destino"]
            if valor in (None, "", []):
                if campo.get("obrigatorio"):
                    mensagens.append(
                        {
                            "codigo": "CAMPO_OBRIGATORIO_LAYOUT",
                            "campo": campo["origem"],
                            "texto": f"{rotulo}: obrigatório no layout {self.versao}.",
                        }
                    )
                continue
            if campo.get("max") and len(str(valor)) > int(campo["max"]):
                mensagens.append(
                    {
                        "codigo": "TAMANHO_EXCEDIDO",
                        "campo": campo["origem"],
                        "texto": f"{rotulo}: até {campo['max']} caracteres.",
                    }
                )
            if campo.get("formato") == "numero":
                try:
                    float(valor)
                except (TypeError, ValueError):
                    mensagens.append(
                        {
                            "codigo": "FORMATO_INVALIDO",
                            "campo": campo["origem"],
                            "texto": f"{rotulo}: deve ser numérico.",
                        }
                    )
        return mensagens

    def mapear(self, payload: dict) -> dict:
        tipo = payload["tipo_registro"]
        operacao = payload.get("operacao", "INCLUSAO")
        definicao = self.manifesto.registros.get(tipo)
        if definicao is None:
            raise PendenteEspecificacaoOficialError(f"{self.sistema}:{tipo}")
        saida = json.loads(json.dumps(definicao.get("envelope") or {}))
        dados = payload.get("dados") or {}
        for campo in definicao.get("campos", []):
            if "constante" in campo:
                _gravar(saida, campo["destino"], campo["constante"])
                continue
            valor = _ler(campo["origem"], dados, operacao, str(payload.get("registro_id")))
            if valor in (None, ""):
                continue
            _gravar(saida, campo["destino"], _formatar(valor, campo.get("formato", "texto")))
        return saida

    def serializar(self, payload: dict) -> bytes:
        return json.dumps(
            self.mapear(payload), sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")

    def serializar_lote(self, payloads: list[dict]) -> bytes:
        """Arquivo do lote (JSON Lines) para sistemas de envio por arquivo/centralizador."""
        return b"\n".join(self.serializar(p) for p in payloads) + b"\n"

    async def enviar(self, payload: dict) -> dict:
        raise RuntimeError("Use app.services.integracoes.transmitir (transporte por tenant).")
