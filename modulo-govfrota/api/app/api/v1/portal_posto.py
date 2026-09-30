"""Portal do posto (Fase 7) — área externa do fornecedor.

Isolamento: toda consulta filtra por `organization_id` E `fornecedor_id`
vindos do token (nunca do frontend). O posto vê seus abastecimentos e
envia a nota fiscal (XML e/ou DANFE) de cada um. Não fatura: o faturamento
é da Prefeitura. Do motorista vê só o nome; nada de dados orçamentários.
"""

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_fornecedor, get_fornecedor_com_senha_definitiva
from app.core.database import get_db
from app.core.security import create_supplier_token, hash_secret, verify_secret
from app.core.timezone import get_tz, now_local, to_display
from app.models.abastecimento import Abastecimento
from app.models.acesso_fornecedor import AcessoFornecedor
from app.models.auth_models import Organization
from app.models.combustivel import Combustivel, Fornecedor
from app.models.motorista import Motorista
from app.models.nota_abastecimento import NotaAbastecimento
from app.models.unidade import Unidade
from app.models.veiculo import Veiculo
from app.services.auditoria import registrar_auditoria
from app.services.notas_abastecimento import ler_arquivo, notas_ativas, receber_nota, resumo_nota

router = APIRouter(prefix="/portal-posto", tags=["portal-posto"])

MAX_FALHAS = 5
BLOQUEIO_MINUTOS = 15

class LoginBody(BaseModel):
    login: str = Field(min_length=1, max_length=60)
    senha: str = Field(min_length=1, max_length=128)


class TrocarSenhaBody(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=128)
    nova_senha: str = Field(min_length=8, max_length=128)


# ── Sessão ───────────────────────────────────────────────────────────────────


@router.post("/login")
async def login(body: LoginBody, request: Request, db: AsyncSession = Depends(get_db)):
    """Login do posto com bloqueio temporário após tentativas erradas."""
    info = get_client_info(request)
    acesso = await db.scalar(select(AcessoFornecedor).where(AcessoFornecedor.login_normalized == body.login.strip().lower()))
    if acesso is None:
        raise HTTPException(status_code=401, detail="Login ou senha inválidos.")
    agora = datetime.now(timezone.utc)
    if acesso.bloqueado:
        raise HTTPException(status_code=403, detail="Acesso bloqueado. Procure o setor de frota da Prefeitura.")
    ate = acesso.locked_until
    if ate is not None and ate.tzinfo is None:
        ate = ate.replace(tzinfo=timezone.utc)
    if ate is not None and ate > agora:
        minutos = int((ate - agora).total_seconds() // 60) + 1
        raise HTTPException(status_code=429, detail=f"Muitas tentativas. Tente novamente em {minutos} min.")

    posto = await db.scalar(
        select(Fornecedor).where(
            Fornecedor.id == acesso.fornecedor_id, Fornecedor.deleted_at.is_(None), Fornecedor.ativo.is_(True)
        )
    )
    if posto is None or not verify_secret(body.senha, acesso.senha_hash):
        acesso.falhas_login += 1
        if acesso.falhas_login >= MAX_FALHAS:
            acesso.locked_until = agora + timedelta(minutes=BLOQUEIO_MINUTOS)
            acesso.falhas_login = 0
            await registrar_auditoria(
                db, organization_id=acesso.organization_id, acao="portal_posto.bloqueio_tentativas",
                entidade="acesso_fornecedor", entidade_id=acesso.id, ip_address=info.get("ip_address"),
            )
        await db.commit()
        raise HTTPException(status_code=401, detail="Login ou senha inválidos.")

    acesso.falhas_login = 0
    acesso.locked_until = None
    acesso.ultimo_acesso = agora
    await registrar_auditoria(
        db, organization_id=acesso.organization_id, acao="portal_posto.login", entidade="acesso_fornecedor",
        entidade_id=acesso.id, ip_address=info.get("ip_address"),
    )
    await db.commit()
    return {
        "access_token": create_supplier_token(acesso.id, acesso.fornecedor_id, acesso.organization_id, acesso.credential_version),
        "deve_trocar_senha": acesso.deve_trocar_senha,
    }


@router.post("/trocar-senha")
async def trocar_senha(
    body: TrocarSenhaBody, request: Request,
    acesso: AcessoFornecedor = Depends(get_current_fornecedor), db: AsyncSession = Depends(get_db),
):
    if not verify_secret(body.senha_atual, acesso.senha_hash):
        raise HTTPException(status_code=422, detail="Senha atual incorreta.")
    if body.nova_senha == body.senha_atual:
        raise HTTPException(status_code=422, detail="A nova senha deve ser diferente da atual.")
    if body.nova_senha.isdigit() or body.nova_senha.isalpha():
        raise HTTPException(status_code=422, detail="Use letras e números na nova senha.")
    acesso.senha_hash = hash_secret(body.nova_senha)
    acesso.deve_trocar_senha = False
    acesso.credential_version += 1
    await registrar_auditoria(
        db, organization_id=acesso.organization_id, acao="portal_posto.trocar_senha", entidade="acesso_fornecedor",
        entidade_id=acesso.id, ip_address=get_client_info(request).get("ip_address"),
    )
    await db.commit()
    # Sessão nova com a versão atualizada da credencial.
    return {"access_token": create_supplier_token(acesso.id, acesso.fornecedor_id, acesso.organization_id, acesso.credential_version)}


@router.get("/me")
async def me(acesso: AcessoFornecedor = Depends(get_current_fornecedor), db: AsyncSession = Depends(get_db)):
    posto = await db.get(Fornecedor, acesso.fornecedor_id)
    org = await db.get(Organization, acesso.organization_id)
    return {
        "nome": acesso.nome,
        "login": acesso.login,
        "deve_trocar_senha": acesso.deve_trocar_senha,
        "posto": posto.nome_fantasia or posto.razao_social,
        "posto_cnpj": posto.cpf_cnpj,
        "prefeitura": org.name if org else None,
    }


# ── Consultas (sempre presas ao posto do token) ──────────────────────────────


def _limites(inicio: date, fim: date):
    tz = get_tz()
    return (datetime.combine(inicio, datetime.min.time(), tzinfo=tz), datetime.combine(fim, datetime.max.time(), tzinfo=tz))


def _base_abastecimentos(acesso: AcessoFornecedor):
    return [
        Abastecimento.organization_id == acesso.organization_id,
        Abastecimento.fornecedor_id == acesso.fornecedor_id,
        Abastecimento.modalidade == "POSTO_CREDENCIADO",
        Abastecimento.status == "CONFIRMADO",
        Abastecimento.deleted_at.is_(None),
    ]


def _periodo(inicio: date | None, fim: date | None) -> tuple[date, date]:
    hoje = now_local().date()
    inicio = inicio or hoje.replace(day=1)
    fim = fim or hoje
    if fim < inicio:
        raise HTTPException(status_code=422, detail="O fim do período é anterior ao início.")
    return inicio, fim


@router.get("/painel")
async def painel(
    inicio: date | None = None, fim: date | None = None,
    acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva), db: AsyncSession = Depends(get_db),
):
    di, df = _periodo(inicio, fim)
    ini, fim_dt = _limites(di, df)
    base = _base_abastecimentos(acesso)
    no_periodo = [*base, Abastecimento.data_abastecimento >= ini, Abastecimento.data_abastecimento <= fim_dt]
    linhas = (
        await db.execute(
            select(Abastecimento.id, Abastecimento.data_abastecimento, Abastecimento.quantidade_litros, Abastecimento.custo_total, Unidade.nome)
            .outerjoin(Unidade, Unidade.id == Abastecimento.unidade_id)
            .where(*no_periodo)
        )
    ).all()
    diario: dict[date, list[float]] = defaultdict(lambda: [0.0, 0.0])
    por_sec: dict[str, list[float]] = defaultdict(lambda: [0, 0.0])
    for _, quando, l, v, sec in linhas:
        acc = diario[to_display(quando).date()]
        acc[0] += float(l or 0)
        acc[1] += float(v or 0)
        ps = por_sec[sec or "Sem secretaria"]
        ps[0] += 1
        ps[1] += float(v or 0)

    # Pendência de nota: todo o histórico, não só o período.
    com_nota = select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.ativo.is_(True))
    pend = (
        await db.execute(
            select(sa_func.count(Abastecimento.id), sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0))
            .where(*base, Abastecimento.id.notin_(com_nota))
        )
    ).one()
    notas = await notas_ativas(db, [r[0] for r in linhas])
    com_aviso = sum(1 for n in notas.values() if n.get("NFE_XML") is not None and n["NFE_XML"].avisos)
    return {
        "periodo": {"inicio": di.isoformat(), "fim": df.isoformat()},
        "abastecimentos": len(linhas),
        "litros": round(sum(float(r[2] or 0) for r in linhas), 2),
        "valor": round(sum(float(r[3] or 0) for r in linhas), 2),
        "diario": [{"dia": d.isoformat(), "litros": round(l, 2), "valor": round(v, 2)} for d, (l, v) in sorted(diario.items())],
        "por_secretaria": sorted(
            ({"secretaria": k, "abastecimentos": int(c), "valor": round(v, 2)} for k, (c, v) in por_sec.items()),
            key=lambda x: -x["valor"],
        ),
        "notas": {
            "pendentes": int(pend[0] or 0),
            "valor_pendente": float(pend[1] or 0),
            "enviadas_no_periodo": len(notas),
            "com_aviso": com_aviso,
        },
    }


@router.get("/secretarias")
async def secretarias(acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva), db: AsyncSession = Depends(get_db)):
    """Secretarias que abasteceram neste posto."""
    linhas = (
        await db.execute(
            select(Unidade.id, Unidade.nome)
            .where(Unidade.id.in_(select(Abastecimento.unidade_id).where(*_base_abastecimentos(acesso))))
            .order_by(Unidade.nome)
        )
    ).all()
    return [{"id": str(i), "nome": n} for i, n in linhas]


@router.get("/abastecimentos")
async def abastecimentos(
    inicio: date | None = None, fim: date | None = None, unidade_id: uuid.UUID | None = None,
    nota: str | None = None, skip: int = 0, limit: int = 200, response: Response = None,  # type: ignore[assignment]
    acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva), db: AsyncSession = Depends(get_db),
):
    """`nota=PENDENTE` traz todo o histórico sem nota (ignora o período)."""
    cond = [*_base_abastecimentos(acesso)]
    com_nota = select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.ativo.is_(True))
    if nota == "PENDENTE":
        cond.append(Abastecimento.id.notin_(com_nota))
    else:
        di, df = _periodo(inicio, fim)
        ini, fim_dt = _limites(di, df)
        cond += [Abastecimento.data_abastecimento >= ini, Abastecimento.data_abastecimento <= fim_dt]
        if nota == "ENVIADA":
            cond.append(Abastecimento.id.in_(com_nota))
    if unidade_id:
        cond.append(Abastecimento.unidade_id == unidade_id)
    total = await db.scalar(select(sa_func.count(Abastecimento.id)).where(*cond))
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))
    linhas = (
        await db.execute(
            select(
                Abastecimento, Veiculo.placa, Veiculo.marca, Veiculo.modelo, Motorista.nome, Combustivel.nome, Unidade.nome,
            )
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .outerjoin(Motorista, Motorista.id == Abastecimento.motorista_id)
            .join(Combustivel, Combustivel.id == Abastecimento.combustivel_id)
            .outerjoin(Unidade, Unidade.id == Abastecimento.unidade_id)
            .where(*cond)
            .order_by(Abastecimento.data_abastecimento.desc())
            .offset(skip).limit(min(limit, 500))
        )
    ).all()
    notas = await notas_ativas(db, [r[0].id for r in linhas])
    # Do motorista só o nome (quem abasteceu no balcão) — nada de CPF/CNH.
    return [
        {
            "id": str(a.id),
            "data": to_display(a.data_abastecimento).isoformat(),
            "placa": placa,
            "marca": marca,
            "modelo": modelo,
            "motorista": motorista,
            "combustivel": comb,
            "secretaria": unid,
            "litros": float(a.quantidade_litros),
            "preco_litro": float(a.preco_litro) if a.preco_litro is not None else None,
            "valor": float(a.custo_total) if a.custo_total is not None else None,
            "nota": resumo_nota(notas.get(a.id)),
        }
        for a, placa, marca, modelo, motorista, comb, unid in linhas
    ]


async def _abast_do_posto(db: AsyncSession, acesso: AcessoFornecedor, abastecimento_id: uuid.UUID) -> Abastecimento:
    abast = await db.scalar(select(Abastecimento).where(Abastecimento.id == abastecimento_id, *_base_abastecimentos(acesso)))
    if abast is None:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado.")
    return abast


@router.post("/abastecimentos/{abastecimento_id}/nota", status_code=201)
async def enviar_nota(
    abastecimento_id: uuid.UUID,
    arquivos: list[UploadFile] = File(...),
    acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva),
    db: AsyncSession = Depends(get_db),
):
    """XML e/ou PDF (DANFE) da nota do abastecimento. O tipo é reconhecido pelo conteúdo."""
    if not 1 <= len(arquivos) <= 2:
        raise HTTPException(status_code=422, detail="Envie o XML e/ou o PDF da nota (até 2 arquivos).")
    abast = await _abast_do_posto(db, acesso, abastecimento_id)
    tipos = set()
    for arq in arquivos:
        conteudo = await arq.read()
        tipo = "DANFE" if conteudo.startswith(b"%PDF") else "NFE_XML"
        if tipo in tipos:
            raise HTTPException(status_code=422, detail="Envie no máximo um XML e um PDF.")
        tipos.add(tipo)
        await receber_nota(db, abast, tipo, (arq.filename or "nota")[:255], conteudo, acesso=acesso)
    await db.commit()
    return resumo_nota((await notas_ativas(db, [abast.id])).get(abast.id))


@router.get("/abastecimentos/{abastecimento_id}/nota/{nota_id}/arquivo")
async def baixar_nota(
    abastecimento_id: uuid.UUID, nota_id: uuid.UUID,
    acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva), db: AsyncSession = Depends(get_db),
):
    abast = await _abast_do_posto(db, acesso, abastecimento_id)
    nota = await db.scalar(select(NotaAbastecimento).where(NotaAbastecimento.id == nota_id, NotaAbastecimento.abastecimento_id == abast.id))
    if nota is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    conteudo, mime = await ler_arquivo(db, nota)
    return Response(
        content=conteudo, media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{nota.nome_arquivo.replace(chr(34), "")}"', "X-Content-Type-Options": "nosniff"},
    )
