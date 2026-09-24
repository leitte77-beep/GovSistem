"""Busca global (item 49).

Tolerante a maiúsculas/minúsculas, acentos, pontuação de CPF e formatação de
telefone. A tolerância vem das colunas `busca` — gravadas já normalizadas no
cadastro — e não de funções caras aplicadas em tempo de consulta.
"""

import re
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import apenas_digitos, normalizar_placa, sem_acento
from app.models.cacambas import Cacamba, SolicitacaoCacamba
from app.models.frota import Maquina, Veiculo
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import OrdemServico, SolicitacaoServico

LIMITE_POR_CATEGORIA = 8


def _protocolo(termo: str) -> int | None:
    """Extrai o número do protocolo de formatos como 2026/000123, 123 ou OS 2026/00045."""
    numeros = re.findall(r"\d+", termo)
    if not numeros:
        return None
    return int(numeros[-1])


async def buscar(
    db: AsyncSession, organizacao_id: uuid.UUID, termo: str, limite: int = LIMITE_POR_CATEGORIA
) -> list[dict]:
    """Resultados agrupados por categoria."""
    termo = (termo or "").strip()
    if len(termo) < 2:
        return []

    normalizado = sem_acento(termo)
    digitos = apenas_digitos(termo)
    placa = normalizar_placa(termo)
    numero = _protocolo(termo)
    padrao = f"%{normalizado}%"

    grupos: list[dict] = []

    # ── Pessoas ─────────────────────────────────────────────────────────────
    condicoes_pessoa = [Pessoa.busca.ilike(padrao)]
    if digitos:
        condicoes_pessoa.append(Pessoa.documento.like(f"%{digitos}%"))
        condicoes_pessoa.append(Pessoa.telefone.like(f"%{digitos}%"))
        condicoes_pessoa.append(Pessoa.whatsapp.like(f"%{digitos}%"))

    pessoas = list(
        (
            await db.execute(
                select(Pessoa)
                .where(
                    Pessoa.organizacao_id == organizacao_id,
                    Pessoa.deleted_at.is_(None),
                    or_(*condicoes_pessoa),
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if pessoas:
        grupos.append(
            {
                "categoria": "Pessoas",
                "rota": "/pessoas",
                "itens": [
                    {
                        "id": str(p.id),
                        "titulo": p.nome,
                        "subtitulo": " · ".join(
                            filter(None, [p.bairro, p.municipio, p.situacao])
                        ),
                        "link": f"/pessoas/{p.id}",
                    }
                    for p in pessoas
                ],
            }
        )

    # ── Imóveis e propriedades ──────────────────────────────────────────────
    imoveis = list(
        (
            await db.execute(
                select(Imovel)
                .where(
                    Imovel.organizacao_id == organizacao_id,
                    Imovel.deleted_at.is_(None),
                    or_(
                        Imovel.busca.ilike(padrao),
                        Imovel.codigo.ilike(f"%{termo}%"),
                        Imovel.matricula.ilike(f"%{termo}%"),
                    ),
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if imoveis:
        grupos.append(
            {
                "categoria": "Imóveis e propriedades",
                "rota": "/imoveis",
                "itens": [
                    {
                        "id": str(i.id),
                        "titulo": i.nome or i.codigo,
                        "subtitulo": " · ".join(
                            filter(None, [i.logradouro, i.bairro or i.comunidade, i.tipo])
                        ),
                        "link": f"/imoveis/{i.id}",
                    }
                    for i in imoveis
                ],
            }
        )

    # ── Solicitações de caçamba ─────────────────────────────────────────────
    condicoes_solic = [SolicitacaoCacamba.protocolo_formatado.ilike(f"%{termo}%")]
    if numero:
        condicoes_solic.append(SolicitacaoCacamba.protocolo == numero)

    solicitacoes = list(
        (
            await db.execute(
                select(SolicitacaoCacamba)
                .where(
                    SolicitacaoCacamba.organizacao_id == organizacao_id,
                    SolicitacaoCacamba.deleted_at.is_(None),
                    or_(*condicoes_solic),
                )
                .order_by(SolicitacaoCacamba.created_at.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if solicitacoes:
        grupos.append(
            {
                "categoria": "Solicitações de caçamba",
                "rota": "/solicitacoes",
                "itens": [
                    {
                        "id": str(s.id),
                        "titulo": f"Protocolo {s.protocolo_formatado}",
                        "subtitulo": " · ".join(
                            filter(None, [s.logradouro, s.bairro, s.situacao.replace("_", " ")])
                        ),
                        "link": f"/solicitacoes/{s.id}",
                    }
                    for s in solicitacoes
                ],
            }
        )

    # ── Solicitações do Porteira Adentro ────────────────────────────────────
    condicoes_servico = [SolicitacaoServico.protocolo_formatado.ilike(f"%{termo}%")]
    if numero:
        condicoes_servico.append(SolicitacaoServico.protocolo == numero)

    servicos = list(
        (
            await db.execute(
                select(SolicitacaoServico)
                .where(
                    SolicitacaoServico.organizacao_id == organizacao_id,
                    SolicitacaoServico.deleted_at.is_(None),
                    or_(*condicoes_servico),
                )
                .order_by(SolicitacaoServico.created_at.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if servicos:
        grupos.append(
            {
                "categoria": "Solicitações do Porteira Adentro",
                "rota": "/porteira-adentro",
                "itens": [
                    {
                        "id": str(s.id),
                        "titulo": f"Protocolo {s.protocolo_formatado}",
                        "subtitulo": s.situacao.replace("_", " "),
                        "link": f"/porteira-adentro/{s.id}",
                    }
                    for s in servicos
                ],
            }
        )

    # ── Ordens de serviço ───────────────────────────────────────────────────
    condicoes_ordem = [OrdemServico.numero_formatado.ilike(f"%{termo}%")]
    if numero:
        condicoes_ordem.append(OrdemServico.numero == numero)

    ordens = list(
        (
            await db.execute(
                select(OrdemServico)
                .where(
                    OrdemServico.organizacao_id == organizacao_id,
                    OrdemServico.deleted_at.is_(None),
                    or_(*condicoes_ordem),
                )
                .order_by(OrdemServico.created_at.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if ordens:
        grupos.append(
            {
                "categoria": "Ordens de serviço",
                "rota": "/ordens",
                "itens": [
                    {
                        "id": str(o.id),
                        "titulo": o.numero_formatado,
                        "subtitulo": (
                            f"{o.data_prevista.strftime('%d/%m/%Y')} · "
                            f"{o.situacao.replace('_', ' ')}"
                        ),
                        "link": f"/ordens/{o.id}",
                    }
                    for o in ordens
                ],
            }
        )

    # ── Caçambas ────────────────────────────────────────────────────────────
    cacambas = list(
        (
            await db.execute(
                select(Cacamba)
                .where(
                    Cacamba.organizacao_id == organizacao_id,
                    Cacamba.deleted_at.is_(None),
                    or_(
                        Cacamba.codigo.ilike(f"%{termo}%"),
                        Cacamba.patrimonio.ilike(f"%{termo}%"),
                        Cacamba.identificacao_visual.ilike(f"%{termo}%"),
                    ),
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if cacambas:
        grupos.append(
            {
                "categoria": "Caçambas",
                "rota": "/cacambas",
                "itens": [
                    {
                        "id": str(c.id),
                        "titulo": f"Caçamba {c.codigo}",
                        "subtitulo": c.situacao.replace("_", " "),
                        "link": f"/cacambas/{c.id}",
                    }
                    for c in cacambas
                ],
            }
        )

    # ── Máquinas ────────────────────────────────────────────────────────────
    maquinas = list(
        (
            await db.execute(
                select(Maquina)
                .where(
                    Maquina.organizacao_id == organizacao_id,
                    Maquina.deleted_at.is_(None),
                    or_(
                        Maquina.codigo.ilike(f"%{termo}%"),
                        Maquina.patrimonio.ilike(f"%{termo}%"),
                        Maquina.nome.ilike(f"%{termo}%"),
                        Maquina.placa == placa if placa else Maquina.codigo.ilike(f"%{termo}%"),
                    ),
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if maquinas:
        grupos.append(
            {
                "categoria": "Máquinas e equipamentos",
                "rota": "/maquinas",
                "itens": [
                    {
                        "id": str(m.id),
                        "titulo": f"{m.codigo} — {m.nome}",
                        "subtitulo": m.situacao.replace("_", " "),
                        "link": f"/maquinas/{m.id}",
                    }
                    for m in maquinas
                ],
            }
        )

    # ── Veículos ────────────────────────────────────────────────────────────
    condicoes_veiculo = [
        Veiculo.codigo.ilike(f"%{termo}%"),
        Veiculo.nome.ilike(f"%{termo}%"),
        Veiculo.patrimonio.ilike(f"%{termo}%"),
    ]
    if placa:
        condicoes_veiculo.append(Veiculo.placa.like(f"%{placa}%"))

    veiculos = list(
        (
            await db.execute(
                select(Veiculo)
                .where(
                    Veiculo.organizacao_id == organizacao_id,
                    Veiculo.deleted_at.is_(None),
                    or_(*condicoes_veiculo),
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if veiculos:
        grupos.append(
            {
                "categoria": "Caminhões e veículos",
                "rota": "/veiculos",
                "itens": [
                    {
                        "id": str(v.id),
                        "titulo": f"{v.placa} — {v.nome}",
                        "subtitulo": v.situacao.replace("_", " "),
                        "link": f"/veiculos/{v.id}",
                    }
                    for v in veiculos
                ],
            }
        )

    # ── Operadores e motoristas ─────────────────────────────────────────────
    servidores = list(
        (
            await db.execute(
                select(User)
                .where(
                    User.organizacao_id == organizacao_id,
                    User.deleted_at.is_(None),
                    or_(
                        User.nome.ilike(f"%{termo}%"),
                        User.matricula.ilike(f"%{termo}%"),
                        User.email.ilike(f"%{termo}%"),
                    ),
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    if servidores:
        grupos.append(
            {
                "categoria": "Servidores",
                "rota": "/operadores",
                "itens": [
                    {
                        "id": str(u.id),
                        "titulo": u.nome,
                        "subtitulo": u.perfil.replace("_", " "),
                        "link": f"/operadores/{u.id}",
                    }
                    for u in servidores
                ],
            }
        )

    return grupos
