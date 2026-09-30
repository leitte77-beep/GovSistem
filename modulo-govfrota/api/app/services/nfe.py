"""Leitura do XML da NF-e (modelo 55, layout 4.00).

Aceita o XML autorizado (`nfeProc`, com protocolo) ou só a `NFe`. Usa
defusedxml: o arquivo vem de terceiros e não pode expandir entidades.
"""

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation

from defusedxml import ElementTree as ET
from defusedxml.common import DefusedXmlException

NS = "{http://www.portalfiscal.inf.br/nfe}"


class NFeInvalida(ValueError):
    pass


@dataclass
class ItemNFe:
    numero: int
    codigo: str | None
    descricao: str
    codigo_anp: str | None
    unidade: str | None
    quantidade: Decimal
    valor_unitario: Decimal
    valor_total: Decimal


@dataclass
class NFe:
    chave: str
    numero: str
    serie: str | None
    emissao: datetime | None
    emitente_cnpj: str | None
    emitente_nome: str | None
    destinatario_cnpj: str | None
    destinatario_nome: str | None
    valor_total: Decimal
    autorizada: bool
    protocolo: str | None
    itens: list[ItemNFe] = field(default_factory=list)

    def para_json(self) -> dict:
        d = asdict(self)
        d["emissao"] = self.emissao.isoformat() if self.emissao else None
        for k in ("valor_total",):
            d[k] = str(d[k])
        for it in d["itens"]:
            for k in ("quantidade", "valor_unitario", "valor_total"):
                it[k] = str(it[k])
        return d


def so_digitos(v: str | None) -> str:
    return re.sub(r"\D", "", v or "")


def _txt(el, caminho: str) -> str | None:
    if el is None:
        return None
    alvo = el.find("/".join(NS + p for p in caminho.split("/")))
    return alvo.text.strip() if alvo is not None and alvo.text else None


def _dec(v: str | None, campo: str) -> Decimal:
    try:
        return Decimal(v or "0")
    except InvalidOperation:
        raise NFeInvalida(f"Valor inválido em {campo}.")


def ler_nfe(conteudo: bytes, aceitar_nfce: bool = False) -> NFe:
    """Lê NF-e (modelo 55); com `aceitar_nfce`, também a NFC-e (65) emitida na bomba."""
    try:
        raiz = ET.fromstring(conteudo)
    except DefusedXmlException:
        raise NFeInvalida("XML recusado por conter construções não permitidas.")
    except ET.ParseError:
        raise NFeInvalida("Arquivo não é um XML válido.")

    if raiz.tag == NS + "nfeProc":
        nfe_el = raiz.find(NS + "NFe")
        prot = raiz.find(f"{NS}protNFe/{NS}infProt")
    elif raiz.tag == NS + "NFe":
        nfe_el, prot = raiz, None
    else:
        raise NFeInvalida("O XML não é de uma NF-e (esperado nfeProc ou NFe do portal fiscal).")
    inf = nfe_el.find(NS + "infNFe") if nfe_el is not None else None
    if inf is None:
        raise NFeInvalida("NF-e sem o bloco infNFe.")

    chave = so_digitos((inf.get("Id") or "").removeprefix("NFe"))
    if len(chave) != 44:
        raise NFeInvalida("Chave de acesso ausente ou inválida.")
    if _txt(inf, "ide/mod") not in ((None, "55", "65") if aceitar_nfce else (None, "55")):
        raise NFeInvalida("Só a NF-e modelo 55 é aceita." if not aceitar_nfce else "Só NF-e (55) ou NFC-e (65) são aceitas.")

    emissao = None
    if dh := _txt(inf, "ide/dhEmi"):
        try:
            emissao = datetime.fromisoformat(dh)
        except ValueError:
            emissao = None

    itens = []
    for det in inf.findall(NS + "det"):
        prod = det.find(NS + "prod")
        if prod is None:
            continue
        itens.append(
            ItemNFe(
                numero=int(det.get("nItem") or len(itens) + 1),
                codigo=_txt(prod, "cProd"),
                descricao=_txt(prod, "xProd") or "",
                codigo_anp=_txt(prod, "comb/cProdANP"),
                unidade=_txt(prod, "uCom"),
                quantidade=_dec(_txt(prod, "qCom"), "qCom"),
                valor_unitario=_dec(_txt(prod, "vUnCom"), "vUnCom"),
                valor_total=_dec(_txt(prod, "vProd"), "vProd"),
            )
        )

    status_prot = _txt(prot, "cStat") if prot is not None else None
    return NFe(
        chave=chave,
        numero=_txt(inf, "ide/nNF") or "",
        serie=_txt(inf, "ide/serie"),
        emissao=emissao,
        emitente_cnpj=so_digitos(_txt(inf, "emit/CNPJ")) or None,
        emitente_nome=_txt(inf, "emit/xNome"),
        destinatario_cnpj=so_digitos(_txt(inf, "dest/CNPJ")) or None,
        destinatario_nome=_txt(inf, "dest/xNome"),
        valor_total=_dec(_txt(inf, "total/ICMSTot/vNF"), "vNF"),
        # 100 = autorizada; 150 = autorizada fora do prazo.
        autorizada=status_prot in ("100", "150"),
        protocolo=_txt(prot, "nProt") if prot is not None else None,
        itens=itens,
    )
