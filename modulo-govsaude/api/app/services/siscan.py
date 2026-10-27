"""Regras de domínio da Fase 10 — SISCAN (B.5-001…014, B.5-016…018).

Os formulários de requisição e resultado (colo do útero e mama) são modelos
versionados do tenant; ativar uma versão exige a fonte normativa e encerra a
anterior (B.5-018). Nenhum layout do SISCAN está codificado: o motor valida
obrigatoriedade, tipo e opções a partir do modelo ativo.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.autorizacao import escopo_permite, tem_permissao
from app.core.errors import Conflict, NotFound, PermissionDenied, Unprocessable
from app.core.permissoes import Permissao
from app.models.cidadao import Cidadao
from app.models.laboratorio import ExameSiscan, ModeloSiscan
from app.models.nucleo import Estabelecimento, Profissional
from app.schemas.laboratorio import (
    ModeloSiscanCreate,
    SiscanCreate,
    SiscanResultado,
    SiscanSituacao,
)
from app.services.auditoria import registrar
from app.services.laboratorio import _hash

# Transições manuais permitidas; RESULTADO entra pelo endpoint de resultado.
TRANSICOES = {
    "COLETADO": {"REQUISITADO"},
    "ENVIADO": {"COLETADO"},
    "COMUNICADO": {"RESULTADO"},
    "EM_SEGUIMENTO": {"RESULTADO", "COMUNICADO"},
    "ENCERRADO": {"RESULTADO", "COMUNICADO", "EM_SEGUIMENTO"},
}
PRAZO_PADRAO_DIAS = 30


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


async def _auditar(db, ator, tenant_id, acao, recurso, recurso_id, cliente, **extra) -> None:
    await registrar(
        db,
        acao=acao,
        usuario=ator,
        tenant_id=tenant_id,
        recurso=recurso,
        recurso_id=recurso_id,
        cliente=cliente,
        **extra,
    )


async def _um(db, modelo, tenant_id, item_id, texto):
    item = await db.scalar(
        select(modelo).where(modelo.id == item_id, modelo.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound(texto)
    return item


# ── Modelos (B.5-005/018) ──────────────────────────────────────────────────
async def criar_modelo(db, tenant_id, dados: ModeloSiscanCreate, ator, cliente) -> ModeloSiscan:
    ultima = await db.scalar(
        select(func.max(ModeloSiscan.numero_versao)).where(
            ModeloSiscan.tenant_id == tenant_id, ModeloSiscan.tipo == dados.tipo
        )
    )
    item = ModeloSiscan(
        tenant_id=tenant_id,
        numero_versao=(ultima or 0) + 1,
        ativo=False,
        **dados.model_dump(exclude={"campos_requisicao", "campos_resultado"}),
        campos_requisicao=[c.model_dump() for c in dados.campos_requisicao],
        campos_resultado=[c.model_dump() for c in dados.campos_resultado],
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "modelo_siscan",
        item.id,
        cliente,
        dados_depois={"tipo": item.tipo, "versao": item.numero_versao},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def ativar_modelo(db, tenant_id, modelo_id, fonte, ator, cliente) -> ModeloSiscan:
    item = await _um(db, ModeloSiscan, tenant_id, modelo_id, "Modelo não encontrado.")
    fonte = fonte or item.fonte_normativa
    if not fonte or len(fonte.strip()) < 5:
        raise Unprocessable(
            "Informe a fonte normativa (manual/layout SISCAN vigente) para ativar.",
            code="fonte_normativa_obrigatoria",
        )
    for anterior in (
        await db.scalars(
            select(ModeloSiscan).where(
                ModeloSiscan.tenant_id == tenant_id,
                ModeloSiscan.tipo == item.tipo,
                ModeloSiscan.ativo.is_(True),
                ModeloSiscan.id != item.id,
            )
        )
    ).all():
        anterior.ativo = False
        anterior.versao += 1
    item.fonte_normativa = fonte
    item.ativo = True
    item.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "modelo_siscan",
        item.id,
        cliente,
        detalhe="ativacao",
        dados_depois={"fonte": fonte},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_modelos(db, tenant_id, tipo=None) -> list[ModeloSiscan]:
    filtros = [ModeloSiscan.tenant_id == tenant_id]
    if tipo:
        filtros.append(ModeloSiscan.tipo == tipo)
    return list(
        (
            await db.scalars(
                select(ModeloSiscan)
                .where(*filtros)
                .order_by(ModeloSiscan.tipo, ModeloSiscan.numero_versao)
            )
        ).all()
    )


def validar_formulario(campos: list[dict], dados: dict) -> dict:
    por_codigo = {c["codigo"]: c for c in campos}
    erros = []
    for chave in dados:
        if chave not in por_codigo:
            erros.append({"campo": chave, "erro": "campo inexistente no modelo"})
    for c in campos:
        valor = dados.get(c["codigo"])
        if valor in (None, "", []):
            if c.get("obrigatorio"):
                erros.append({"campo": c["codigo"], "erro": "obrigatório"})
            continue
        tipo = c.get("tipo", "TEXTO")
        if tipo == "OPCAO" and valor not in (c.get("opcoes") or []):
            erros.append({"campo": c["codigo"], "erro": "opção inválida"})
        elif tipo == "NUMERICO" and not isinstance(valor, int | float):
            erros.append({"campo": c["codigo"], "erro": "numérico"})
        elif tipo == "BOOLEANO" and not isinstance(valor, bool):
            erros.append({"campo": c["codigo"], "erro": "booleano"})
        elif tipo == "DATA":
            try:
                date.fromisoformat(str(valor))
            except ValueError:
                erros.append({"campo": c["codigo"], "erro": "data AAAA-MM-DD"})
    if erros:
        raise Unprocessable(
            "Formulário não confere com o modelo vigente.", code="formulario_invalido", errors=erros
        )
    return dados


async def _modelo_ativo(db, tenant_id, tipo) -> ModeloSiscan:
    modelo = await db.scalar(
        select(ModeloSiscan).where(
            ModeloSiscan.tenant_id == tenant_id,
            ModeloSiscan.tipo == tipo,
            ModeloSiscan.ativo.is_(True),
        )
    )
    if modelo is None:
        raise Unprocessable(
            f"Não há modelo {tipo} ativo. Carregue o layout vigente do SISCAN.",
            code="modelo_siscan_inativo",
        )
    return modelo


# ── Requisição e ciclo (B.5-001…004, B.5-011) ──────────────────────────────
def _ve(ator, item: ExameSiscan) -> bool:
    return escopo_permite(
        ator, Permissao.LABORATORIO_LER, estabelecimento_id=item.estabelecimento_id
    )


async def _exame(db, tenant_id, exame_id, ator) -> ExameSiscan:
    item = await _um(db, ExameSiscan, tenant_id, exame_id, "Exame SISCAN não encontrado.")
    if not _ve(ator, item):
        raise NotFound("Exame SISCAN não encontrado.")
    return item


async def requisitar(db, tenant_id, dados: SiscanCreate, ator, cliente) -> ExameSiscan:
    cidadao = await _um(db, Cidadao, tenant_id, dados.cidadao_id, "Cidadão não encontrado.")
    await _um(db, Estabelecimento, tenant_id, dados.estabelecimento_id, "Unidade não encontrada.")
    if not escopo_permite(
        ator, Permissao.EXAME_SOLICITAR, estabelecimento_id=dados.estabelecimento_id
    ):
        raise PermissionDenied("Sem permissão para requisitar exames nesta unidade.")
    if dados.profissional_id:
        await _um(
            db, Profissional, tenant_id, dados.profissional_id, "Profissional não encontrado."
        )
    modelo = await _modelo_ativo(db, tenant_id, dados.tipo)
    validar_formulario(modelo.campos_requisicao, dados.dados)
    if dados.coletado_em and _utc(dados.coletado_em) > _agora() + timedelta(minutes=5):
        raise Unprocessable("Data de coleta no futuro.", code="coleta_futura")
    item = ExameSiscan(
        tenant_id=tenant_id,
        tipo=dados.tipo,
        modelo_id=modelo.id,
        cidadao_id=cidadao.id,
        estabelecimento_id=dados.estabelecimento_id,
        profissional_id=dados.profissional_id,
        especialidade=dados.especialidade,
        material=dados.material,
        coletado_em=dados.coletado_em,
        informacoes_clinicas=dados.informacoes_clinicas,
        dados_requisicao=dados.dados,
        situacao="COLETADO" if dados.coletado_em else "REQUISITADO",
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "exame_siscan",
        item.id,
        cliente,
        dados_depois={"tipo": item.tipo, "modelo_versao": modelo.numero_versao},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def mudar_situacao(
    db, tenant_id, exame_id, dados: SiscanSituacao, ator, cliente
) -> ExameSiscan:
    item = await _exame(db, tenant_id, exame_id, ator)
    if not escopo_permite(
        ator, Permissao.EXAME_SOLICITAR, estabelecimento_id=item.estabelecimento_id
    ) and not escopo_permite(
        ator, Permissao.LABORATORIO_COLETAR, estabelecimento_id=item.estabelecimento_id
    ):
        raise PermissionDenied("Sem permissão nesta unidade.")
    if item.situacao not in TRANSICOES[dados.situacao]:
        raise Conflict(
            f"Transição {item.situacao} → {dados.situacao} não permitida.",
            code="transicao_invalida",
        )
    agora = _agora()
    if dados.situacao == "COLETADO":
        item.coletado_em = dados.coletado_em or agora
    elif dados.situacao == "ENVIADO":
        item.enviado_em = agora
        item.prestador = dados.prestador or item.prestador
    elif dados.situacao == "COMUNICADO":
        item.comunicado_em = agora
        item.comunicado_meio = dados.meio
    if dados.seguimento:
        item.seguimento = dados.seguimento
    if dados.proximo_exame_em:
        item.proximo_exame_em = dados.proximo_exame_em
    antes = item.situacao
    item.situacao = dados.situacao
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "exame_siscan",
        item.id,
        cliente,
        dados_antes={"situacao": antes},
        dados_depois={"situacao": item.situacao},
    )
    await db.commit()
    await db.refresh(item)
    return item


# ── Resultado e assinatura (B.5-006…010, B.5-016) ──────────────────────────
def _alterado(modelo: ModeloSiscan, dados: dict) -> bool:
    for campo, valores in (modelo.valores_alterados or {}).items():
        v = dados.get(campo)
        if v is not None and (v in valores or str(v) in valores):
            return True
    return False


def _somar_meses(d: date, meses: int) -> date:
    m = d.month - 1 + meses
    ano, mes = d.year + m // 12, m % 12 + 1
    for dia in (d.day, 30, 29, 28):
        try:
            return date(ano, mes, dia)
        except ValueError:
            continue
    return date(ano, mes, 28)


async def registrar_resultado(
    db, tenant_id, exame_id, dados: SiscanResultado, ator, cliente
) -> ExameSiscan:
    item = await _exame(db, tenant_id, exame_id, ator)
    if not escopo_permite(
        ator, Permissao.LABORATORIO_RESULTADO, estabelecimento_id=item.estabelecimento_id
    ):
        raise PermissionDenied("Sem permissão para registrar resultado.")
    if item.assinado_em:
        raise Conflict("Resultado assinado não pode ser alterado.", code="ja_assinado")
    if item.situacao not in {"COLETADO", "ENVIADO", "RESULTADO"}:
        raise Conflict("Exame sem coleta registrada.", code="situacao_invalida")
    modelo = await db.get(ModeloSiscan, item.modelo_id)
    validar_formulario(modelo.campos_resultado, dados.dados)
    item.dados_resultado = dados.dados
    item.prestador = dados.prestador or item.prestador
    item.resultado_em = _agora()
    item.resultado_alterado = _alterado(modelo, dados.dados)
    if dados.proximo_exame_em:
        item.proximo_exame_em = dados.proximo_exame_em
    elif not item.resultado_alterado and modelo.intervalo_rastreamento_meses:
        base = _utc(item.coletado_em or item.resultado_em).date()
        item.proximo_exame_em = _somar_meses(base, modelo.intervalo_rastreamento_meses)
    item.situacao = "RESULTADO"
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "exame_siscan",
        item.id,
        cliente,
        detalhe="resultado",
        dados_depois={"alterado": item.resultado_alterado},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def assinar(db, tenant_id, exame_id, ator, cliente) -> ExameSiscan:
    item = await _exame(db, tenant_id, exame_id, ator)
    if not escopo_permite(
        ator, Permissao.LABORATORIO_LIBERAR, estabelecimento_id=item.estabelecimento_id
    ):
        raise PermissionDenied("Sem permissão para assinar o laudo.")
    if item.dados_resultado is None:
        raise Conflict("Sem resultado para assinar.", code="sem_resultado")
    if item.assinado_em:
        raise Conflict("Laudo já assinado.", code="ja_assinado")
    agora = _agora()
    item.assinado_em = agora
    item.assinado_por_id = ator.id
    item.assinatura_hash = _hash(
        json.dumps(
            {
                "id": str(item.id),
                "resultado": item.dados_resultado,
                "autor": str(ator.id),
                "em": agora.isoformat(),
            },
            sort_keys=True,
            ensure_ascii=False,
        )
    )
    item.versao += 1
    await _auditar(db, ator, tenant_id, "ASSINAR", "exame_siscan", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


async def guia_html(db, tenant_id, exame_id, ator, cliente) -> str:
    """B.5-005 — guia no modelo equivalente (campos do modelo vigente da requisição)."""
    from app.services.exportacao import html_tabela

    item = await _exame(db, tenant_id, exame_id, ator)
    modelo = await db.get(ModeloSiscan, item.modelo_id)
    cidadao = await db.get(Cidadao, item.cidadao_id)
    unidade = await db.get(Estabelecimento, item.estabelecimento_id)
    linhas = [
        {"campo": "Paciente", "valor": cidadao.nome_social or cidadao.nome},
        {"campo": "Nascimento", "valor": cidadao.data_nascimento},
        {"campo": "Unidade", "valor": f"{unidade.cnes} — {unidade.nome}"},
        {"campo": "Especialidade", "valor": item.especialidade},
        {"campo": "Material", "valor": item.material},
        {"campo": "Coleta", "valor": item.coletado_em},
        {"campo": "Informações clínicas", "valor": item.informacoes_clinicas},
    ] + [
        {"campo": c["nome"], "valor": item.dados_requisicao.get(c["codigo"])}
        for c in modelo.campos_requisicao
    ]
    if item.dados_resultado:
        linhas += [
            {"campo": f"Resultado — {c['nome']}", "valor": item.dados_resultado.get(c["codigo"])}
            for c in modelo.campos_resultado
        ]
    await _auditar(
        db, ator, tenant_id, "IMPRIMIR", "exame_siscan", item.id, cliente, detalhe="guia"
    )
    await db.commit()
    return html_tabela(
        f"{modelo.nome} (modelo v{modelo.numero_versao})",
        [("campo", "Campo"), ("valor", "Valor")],
        linhas,
        rodape=(
            f"Fonte: {modelo.fonte_normativa}. "
            + (f"Assinatura eletrônica {item.assinatura_hash}." if item.assinatura_hash else "")
        ),
    )


# ── Histórico, busca ativa, produção e relatórios (B.5-012/013/014/017) ────
async def historico(
    db, tenant_id, cidadao_id, ator, cliente, *, tipo=None, situacao=None, inicio=None, fim=None
):
    await _um(db, Cidadao, tenant_id, cidadao_id, "Cidadão não encontrado.")
    filtros = [ExameSiscan.tenant_id == tenant_id, ExameSiscan.cidadao_id == cidadao_id]
    if tipo:
        filtros.append(ExameSiscan.tipo == tipo)
    if situacao:
        filtros.append(ExameSiscan.situacao == situacao)
    itens = [
        i
        for i in (
            await db.scalars(
                select(ExameSiscan).where(*filtros).order_by(ExameSiscan.created_at.desc())
            )
        ).all()
        if _ve(ator, i)
        and (inicio is None or _utc(i.created_at).date() >= inicio)
        and (fim is None or _utc(i.created_at).date() <= fim)
    ]
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "cidadao",
        cidadao_id,
        cliente,
        finalidade="historico_siscan",
    )
    await db.commit()
    proximo = min((i.proximo_exame_em for i in itens if i.proximo_exame_em), default=None)
    return {"exames": itens, "proximo_exame_em": proximo}


async def busca_ativa(db, tenant_id, ator, cliente, estabelecimento_id=None) -> dict:
    """B.5-013 — atraso de resultado, alterado sem seguimento e rastreamento vencido."""
    if not tem_permissao(ator, Permissao.SISCAN_ACOMPANHAR):
        raise PermissionDenied("Busca ativa do SISCAN é restrita.")
    filtros = [ExameSiscan.tenant_id == tenant_id, ExameSiscan.situacao != "ENCERRADO"]
    if estabelecimento_id:
        filtros.append(ExameSiscan.estabelecimento_id == estabelecimento_id)
    modelos = {m.id: m for m in await listar_modelos(db, tenant_id)}
    agora = _agora()
    saida = defaultdict(list)
    ultimos: dict[tuple, ExameSiscan] = {}
    for item in (await db.scalars(select(ExameSiscan).where(*filtros))).all():
        if not escopo_permite(
            ator, Permissao.SISCAN_ACOMPANHAR, estabelecimento_id=item.estabelecimento_id
        ):
            continue
        base = {
            "exame_id": item.id,
            "cidadao_id": item.cidadao_id,
            "tipo": item.tipo,
            "situacao": item.situacao,
        }
        prazo = modelos[item.modelo_id].prazo_resultado_dias or PRAZO_PADRAO_DIAS
        referencia = _utc(item.coletado_em or item.created_at)
        if item.situacao in {"COLETADO", "ENVIADO"} and agora - referencia > timedelta(days=prazo):
            saida["resultado_atrasado"].append(
                {**base, "dias": (agora - referencia).days, "prazo_dias": prazo}
            )
        if item.resultado_alterado and item.situacao in {"RESULTADO", "COMUNICADO"}:
            saida["alterado_sem_seguimento"].append(base)
        chave = (item.cidadao_id, item.tipo)
        if chave not in ultimos or item.created_at > ultimos[chave].created_at:
            ultimos[chave] = item
    for item in ultimos.values():
        if item.proximo_exame_em and item.proximo_exame_em < agora.date():
            saida["rastreamento_vencido"].append(
                {
                    "exame_id": item.id,
                    "cidadao_id": item.cidadao_id,
                    "tipo": item.tipo,
                    "previsto_em": item.proximo_exame_em,
                }
            )
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "busca_ativa_siscan",
        None,
        cliente,
        finalidade="busca_ativa_siscan",
    )
    await db.commit()
    return {
        k: saida.get(k, [])
        for k in ("resultado_atrasado", "alterado_sem_seguimento", "rastreamento_vencido")
    }


async def producao_coletas(db, tenant_id, competencia: str, ator) -> dict:
    """B.5-014 — coletas por procedimento SIGTAP do modelo (arquivo BPA: Fase 13)."""
    try:
        ano, mes = (int(x) for x in competencia.split("-"))
        inicio = datetime(ano, mes, 1, tzinfo=timezone.utc)
    except ValueError as exc:
        raise Unprocessable("Competência no formato AAAA-MM.", code="competencia_invalida") from exc
    fim = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    modelos = {m.id: m for m in await listar_modelos(db, tenant_id)}
    grupos: dict[tuple, int] = defaultdict(int)
    inconsistencias = []
    for item in (
        await db.scalars(
            select(ExameSiscan).where(
                ExameSiscan.tenant_id == tenant_id,
                ExameSiscan.coletado_em >= inicio,
                ExameSiscan.coletado_em < fim,
            )
        )
    ).all():
        if not _ve(ator, item) and not escopo_permite(
            ator, Permissao.FATURAMENTO_LER, estabelecimento_id=item.estabelecimento_id
        ):
            continue
        proc = modelos[item.modelo_id].procedimento_coleta_sigtap
        if not proc:
            inconsistencias.append({"exame_id": item.id, "erro": "SEM_PROCEDIMENTO_SIGTAP"})
            continue
        grupos[(str(item.estabelecimento_id), proc)] += 1
    return {
        "competencia": competencia,
        "linhas": [
            {"estabelecimento_id": e, "procedimento": p, "quantidade": q}
            for (e, p), q in sorted(grupos.items())
        ],
        "inconsistencias": inconsistencias,
        "exportacao_bpa": "Fase 13 (regras SIGTAP e layout BPA)",
    }


async def relatorio(
    db, tenant_id, inicio: date, fim: date, *, ator, agrupar_por: str, tipo=None
) -> dict:
    """B.5-017 — por unidade, profissional, resultado, faixa etária, território ou mês."""
    from app.services.relatorios import _chave_tempo, _faixa, _intervalo, _linhas

    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    filtros = [
        ExameSiscan.tenant_id == tenant_id,
        ExameSiscan.created_at >= ini,
        ExameSiscan.created_at < fim_,
    ]
    if tipo:
        filtros.append(ExameSiscan.tipo == tipo)
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for item in (await db.scalars(select(ExameSiscan).where(*filtros))).all():
        if not _ve(ator, item):
            continue
        if agrupar_por == "estabelecimento":
            chave = str(item.estabelecimento_id)
        elif agrupar_por == "profissional":
            chave = str(item.profissional_id or item.criado_por_id)
        elif agrupar_por == "resultado":
            chave = (
                "SEM_RESULTADO"
                if item.dados_resultado is None
                else ("ALTERADO" if item.resultado_alterado else "SEM_ALTERACAO")
            )
        elif agrupar_por in {"faixa_etaria", "territorio"}:
            c = await db.get(Cidadao, item.cidadao_id)
            if agrupar_por == "faixa_etaria":
                chave = _faixa(c.data_nascimento if c else None, _utc(item.created_at).date())
            else:
                chave = await _territorio(db, tenant_id, c)
        else:
            chave = await _chave_tempo(db, tenant_id, item.created_at)
        a = acumulado[chave]
        a["requisicoes"] += 1
        a["com_resultado"] += item.dados_resultado is not None
        a["alterados"] += bool(item.resultado_alterado)
    metricas = ["requisicoes", "com_resultado", "alterados"]
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }


async def _territorio(db, tenant_id, cidadao) -> str:
    """Território do domicílio atual da família do cidadão (vínculos vigentes)."""
    from app.models.territorio import Domicilio, FamiliaDomicilio, FamiliaMembro

    if cidadao is None:
        return "SEM_TERRITORIO"
    territorio = await db.scalar(
        select(Domicilio.territorio_id)
        .join(FamiliaDomicilio, FamiliaDomicilio.domicilio_id == Domicilio.id)
        .join(FamiliaMembro, FamiliaMembro.familia_id == FamiliaDomicilio.familia_id)
        .where(
            FamiliaMembro.tenant_id == tenant_id,
            FamiliaMembro.cidadao_id == cidadao.id,
            FamiliaMembro.vigencia_fim.is_(None),
            FamiliaDomicilio.vigencia_fim.is_(None),
        )
        .limit(1)
    )
    return str(territorio) if territorio else "SEM_TERRITORIO"
