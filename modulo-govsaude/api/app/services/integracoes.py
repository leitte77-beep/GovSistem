"""Central de integrações — Fase 11 (LEDI/SIAPS, RNDS, BNAFAR).

Fluxo de cada registro (B.12-061)::

    gerar (competência) → PENDENTE → validar → VALIDADO | INVALIDO
    VALIDADO → transmitir → ENVIADO | ACEITO | REJEITADO | ERRO_TRANSITORIO
    ENVIADO → retorno → ACEITO | REJEITADO

A geração varre o domínio da competência e classifica cada registro como
novo, alterado, excluído, já enviado ou rejeitado (B.1-034). Registro alterado
depois do envio gera nova linha ``ALTERACAO`` (B.7-017/018) e a linha anterior
é preservada. Sem manifesto oficial, nada é serializado nem transmitido: o
envio fica ``PENDENTE`` com a mensagem ``PENDENTE_ESPECIFICACAO_OFICIAL``.
"""

from __future__ import annotations

import hashlib
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import (
    somente_digitos,
    validar_cbo,
    validar_cnes,
    validar_cns,
    validar_cpf,
)
from app.core.config import settings
from app.core.encryption import descriptografar
from app.core.errors import AppError, Conflict, NotFound, Unprocessable
from app.integracoes import transporte
from app.integracoes.registro import eh_pendente, obter_adaptador
from app.models.cidadao import Cidadao
from app.models.enums import OperacaoEnvio, SituacaoEnvio
from app.models.imunizacao import AplicacaoVacina, Vacina
from app.models.integracoes import IntegracaoConfiguracao, IntegracaoEnvio, IntegracaoExecucao
from app.models.laboratorio import ExameLaboratorio, ExameSiscan, ItemExame, RequisicaoExame
from app.models.nucleo import Estabelecimento, Organizacao, Profissional
from app.models.odontologia import OdontoAtendimento, OdontoProcedimento
from app.models.prontuario import Atendimento
from app.models.territorio import Domicilio, VisitaDomiciliar
from app.services.auditoria import registrar

S = SituacaoEnvio
PENDENTE_OFICIAL = "PENDENTE_ESPECIFICACAO_OFICIAL"
SISTEMAS_CENTRAL = ("LEDI_APS", "RNDS", "BNAFAR")
TIPOS: dict[str, tuple[str, ...]] = {
    "RNDS": ("aplicacao_vacina", "resultado_exame", "dispensacao"),
    "BNAFAR": ("dispensacao", "movimentacao_estoque"),
    "LEDI_APS": (
        "atendimento_individual",
        "atendimento_odontologico",
        "visita_domiciliar",
        "exame_siscan",
    ),
}
ENVIADOS = {S.ENVIADO.value, S.ACEITO.value}
ABERTOS = {S.PENDENTE.value, S.VALIDADO.value, S.INVALIDO.value, S.ERRO_TRANSITORIO.value}


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _msg(codigo: str, texto: str, campo: str | None = None) -> dict:
    return {"codigo": codigo, "texto": texto, **({"campo": campo} if campo else {})}


async def _fuso(db, tenant_id):
    from app.services.janela_acesso import fuso_do_tenant

    return await fuso_do_tenant(db, tenant_id)


def _intervalo_competencia(competencia: str, tz) -> tuple[datetime, datetime]:
    try:
        ano, mes = int(competencia[:4]), int(competencia[4:])
        inicio = datetime(ano, mes, 1, tzinfo=tz)
    except ValueError as exc:
        raise Unprocessable("Competência no formato AAAAMM.", code="competencia_invalida") from exc
    fim = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    return inicio.astimezone(timezone.utc), fim.astimezone(timezone.utc)


# ── Configuração por tenant (B.7-016, B.7-022) ─────────────────────────────
async def configuracao(db, tenant_id, sistema) -> IntegracaoConfiguracao | None:
    return await db.scalar(
        select(IntegracaoConfiguracao)
        .where(
            IntegracaoConfiguracao.tenant_id == tenant_id,
            IntegracaoConfiguracao.sistema == sistema,
        )
        .order_by(IntegracaoConfiguracao.created_at.desc())
    )


def _config_saida(sistema: str, cfg: IntegracaoConfiguracao | None) -> dict:
    adaptador = obter_adaptador(sistema, cfg.versao_layout if cfg else None)
    return {
        "sistema": sistema,
        "configurado": cfg is not None,
        "ativo": bool(cfg and cfg.ativo),
        "ambiente": cfg.ambiente if cfg else None,
        "versao_layout": cfg.versao_layout if cfg else None,
        "credenciais_ref": cfg.credenciais_ref if cfg else None,
        "parametros": (cfg.parametros or {}) if cfg else {},
        "adaptador": "PENDENTE" if eh_pendente(adaptador) else adaptador.versao,
        "layout_sintetico": (not eh_pendente(adaptador)) and adaptador.manifesto.sintetico,
    }


async def salvar_configuracao(db, tenant_id, sistema, dados, ator, cliente) -> dict:
    _sistema(sistema)
    cfg = await configuracao(db, tenant_id, sistema)
    parametros = dados.parametros.model_dump(exclude_none=True) if dados.parametros else {}
    adaptador = obter_adaptador(sistema, dados.versao_layout)
    if dados.versao_layout and eh_pendente(adaptador):
        raise Unprocessable(
            f"Não há manifesto oficial {sistema} {dados.versao_layout} em especificações.",
            code=PENDENTE_OFICIAL.lower(),
        )
    if dados.ambiente == "PRODUCAO":
        if sistema == "RNDS" and not parametros.get("homologacao_aprovada_em"):
            raise Unprocessable(
                "RNDS exige homologação aprovada antes da produção (informe a data do aceite).",
                code="homologacao_pendente",
            )
        if not eh_pendente(adaptador) and adaptador.manifesto.sintetico:
            raise Unprocessable(
                "Manifesto sintético (de teste) não pode ir para produção.",
                code="layout_sintetico",
            )
    antes = _config_saida(sistema, cfg) if cfg else None
    if cfg is None:
        cfg = IntegracaoConfiguracao(tenant_id=tenant_id, sistema=sistema)
        db.add(cfg)
    cfg.versao_layout = dados.versao_layout
    cfg.ambiente = dados.ambiente
    cfg.ativo = dados.ativo
    cfg.credenciais_ref = dados.credenciais_ref
    cfg.parametros = {
        **{k: v for k, v in (cfg.parametros or {}).items() if k.startswith("_")},
        **parametros,
    }
    await db.flush()
    await registrar(
        db,
        acao="ATUALIZAR" if antes else "CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="integracao_configuracao",
        recurso_id=cfg.id,
        dados_antes=antes,
        dados_depois=_config_saida(sistema, cfg),
        cliente=cliente,
    )
    await db.commit()
    return _config_saida(sistema, cfg)


def _sistema(sistema: str) -> None:
    if sistema not in SISTEMAS_CENTRAL:
        raise NotFound("Sistema de integração não encontrado.")


# ── Fontes do domínio: registros da competência ────────────────────────────
async def _raiz_aplicacao(db, item: AplicacaoVacina) -> tuple[uuid.UUID, int]:
    profundidade, atual = 0, item
    while atual.retifica_de_id:
        anterior = await db.get(AplicacaoVacina, atual.retifica_de_id)
        if anterior is None:
            break
        atual, profundidade = anterior, profundidade + 1
    return atual.id, profundidade * 1000 + item.versao


async def _registros(db, tenant_id, tipo, ini, fim) -> list[dict]:
    """Cada registro: chave, versão, ativo (False = exclusão), unidade e cidadão."""
    saida = []
    if tipo == "aplicacao_vacina":
        for a in (
            await db.scalars(
                select(AplicacaoVacina).where(
                    AplicacaoVacina.tenant_id == tenant_id,
                    AplicacaoVacina.origem == "LOCAL",
                    AplicacaoVacina.aplicada_em >= ini,
                    AplicacaoVacina.aplicada_em < fim,
                )
            )
        ).all():
            if a.situacao == "RETIFICADA":
                continue  # a versão nova (retifica_de) representa o registro
            chave, versao = await _raiz_aplicacao(db, a)
            saida.append(
                _r(chave, versao, a.situacao == "ATIVA", a.estabelecimento_id, a.cidadao_id, a.id)
            )
    elif tipo == "resultado_exame":
        linhas = await db.execute(
            select(ItemExame, RequisicaoExame)
            .join(RequisicaoExame, RequisicaoExame.id == ItemExame.requisicao_id)
            .where(
                ItemExame.tenant_id == tenant_id,
                ItemExame.liberado_em >= ini,
                ItemExame.liberado_em < fim,
            )
        )
        for i, req in linhas.all():
            saida.append(
                _r(
                    i.id,
                    i.resultado_versao,
                    i.situacao in {"LIBERADO", "ENTREGUE"},
                    req.estabelecimento_coleta_id,
                    i.cidadao_id,
                    i.id,
                )
            )
    elif tipo == "dispensacao":
        from app.models.estoque import Dispensacao, LocalEstoque

        linhas = await db.execute(
            select(Dispensacao, LocalEstoque.estabelecimento_id)
            .join(LocalEstoque, LocalEstoque.id == Dispensacao.local_id)
            .where(
                Dispensacao.tenant_id == tenant_id,
                Dispensacao.created_at >= ini,
                Dispensacao.created_at < fim,
            )
        )
        for d, estab in linhas.all():
            saida.append(_r(d.id, d.versao, d.estornada_em is None, estab, d.cidadao_id, d.id))
    elif tipo == "movimentacao_estoque":
        from app.models.estoque import LocalEstoque, Movimentacao

        linhas = await db.execute(
            select(Movimentacao, LocalEstoque.estabelecimento_id)
            .join(LocalEstoque, LocalEstoque.id == Movimentacao.local_id)
            .where(
                Movimentacao.tenant_id == tenant_id,
                Movimentacao.ocorrido_em >= ini,
                Movimentacao.ocorrido_em < fim,
                Movimentacao.tipo != "DISPENSACAO",
            )
        )
        for m, estab in linhas.all():
            saida.append(_r(m.id, 1, True, estab, None, m.id))
    elif tipo == "atendimento_individual":
        for a in (
            await db.scalars(
                select(Atendimento).where(
                    Atendimento.tenant_id == tenant_id,
                    Atendimento.finalizado_em >= ini,
                    Atendimento.finalizado_em < fim,
                )
            )
        ).all():
            if a.status in {"ENCERRADO", "RETIFICADO"}:
                saida.append(_r(a.id, a.versao, True, a.estabelecimento_id, a.cidadao_id, a.id))
    elif tipo == "atendimento_odontologico":
        for a in (
            await db.scalars(
                select(OdontoAtendimento).where(
                    OdontoAtendimento.tenant_id == tenant_id,
                    OdontoAtendimento.finalizado_em >= ini,
                    OdontoAtendimento.finalizado_em < fim,
                )
            )
        ).all():
            saida.append(
                _r(
                    a.id,
                    a.versao,
                    a.situacao == "FINALIZADO",
                    a.estabelecimento_id,
                    a.cidadao_id,
                    a.id,
                )
            )
    elif tipo == "visita_domiciliar":
        for v in (
            await db.scalars(
                select(VisitaDomiciliar).where(
                    VisitaDomiciliar.tenant_id == tenant_id,
                    VisitaDomiciliar.realizada_em >= ini,
                    VisitaDomiciliar.realizada_em < fim,
                )
            )
        ).all():
            saida.append(_r(v.id, v.versao, True, None, v.cidadao_id, v.id))
    elif tipo == "exame_siscan":
        for e in (
            await db.scalars(
                select(ExameSiscan).where(
                    ExameSiscan.tenant_id == tenant_id,
                    ExameSiscan.coletado_em >= ini,
                    ExameSiscan.coletado_em < fim,
                )
            )
        ).all():
            saida.append(_r(e.id, e.versao, True, e.estabelecimento_id, e.cidadao_id, e.id))
    return saida


def _r(chave, versao, ativo, estab, cidadao, fonte_id) -> dict:
    return {
        "chave": chave,
        "versao": versao,
        "ativo": ativo,
        "estabelecimento_id": estab,
        "cidadao_id": cidadao,
        "fonte_id": fonte_id,
    }


# ── Geração por competência (B.1-034, B.7-017/018) ─────────────────────────
async def _ultimo_envio(db, tenant_id, sistema, tipo, chave) -> IntegracaoEnvio | None:
    return await db.scalar(
        select(IntegracaoEnvio)
        .where(
            IntegracaoEnvio.tenant_id == tenant_id,
            IntegracaoEnvio.sistema == sistema,
            IntegracaoEnvio.tipo_registro == tipo,
            IntegracaoEnvio.registro_id == chave,
            IntegracaoEnvio.situacao != S.CANCELADO.value,
        )
        .order_by(IntegracaoEnvio.created_at.desc())
    )


async def _ja_aceito(db, tenant_id, sistema, tipo, chave) -> bool:
    return bool(
        await db.scalar(
            select(func.count())
            .select_from(IntegracaoEnvio)
            .where(
                IntegracaoEnvio.tenant_id == tenant_id,
                IntegracaoEnvio.sistema == sistema,
                IntegracaoEnvio.tipo_registro == tipo,
                IntegracaoEnvio.registro_id == chave,
                IntegracaoEnvio.situacao.in_(ENVIADOS),
            )
        )
    )


async def gerar(db, tenant_id, sistema: str, competencia: str) -> dict:
    _sistema(sistema)
    ini, fim = _intervalo_competencia(competencia, await _fuso(db, tenant_id))
    contagem: Counter = Counter()
    agora = _agora()
    for tipo in TIPOS[sistema]:
        for reg in await _registros(db, tenant_id, tipo, ini, fim):
            ultimo = await _ultimo_envio(db, tenant_id, sistema, tipo, reg["chave"])
            enviado_antes = await _ja_aceito(db, tenant_id, sistema, tipo, reg["chave"])
            if ultimo is None:
                if not reg["ativo"]:
                    continue
                operacao, rotulo = OperacaoEnvio.INCLUSAO.value, "novos"
            elif ultimo.versao_registro == reg["versao"] and (
                reg["ativo"] or ultimo.operacao == OperacaoEnvio.EXCLUSAO.value
            ):
                contagem[
                    "ja_enviados"
                    if ultimo.situacao in ENVIADOS
                    else "rejeitados"
                    if ultimo.situacao in {S.REJEITADO.value, S.INVALIDO.value}
                    else "em_fila"
                ] += 1
                continue
            else:
                if not reg["ativo"]:
                    operacao, rotulo = OperacaoEnvio.EXCLUSAO.value, "exclusoes"
                    if not enviado_antes:
                        # Nunca chegou ao sistema oficial: basta cancelar o pendente.
                        if ultimo.situacao in ABERTOS | {S.REJEITADO.value}:
                            ultimo.situacao = S.CANCELADO.value
                            ultimo.mensagens = [
                                _msg("REGISTRO_EXCLUIDO", "Registro excluído antes do envio.")
                            ]
                            contagem["cancelados"] += 1
                        continue
                elif enviado_antes:
                    operacao, rotulo = OperacaoEnvio.ALTERACAO.value, "alterados"
                else:
                    operacao, rotulo = OperacaoEnvio.INCLUSAO.value, "alterados"
                if ultimo.situacao in ABERTOS | {S.REJEITADO.value}:
                    ultimo.situacao = S.CANCELADO.value
                    ultimo.mensagens = (ultimo.mensagens or []) + [
                        _msg("SUBSTITUIDO", "Substituído por versão mais recente do registro.")
                    ]
            novo = IntegracaoEnvio(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                created_at=agora,
                sistema=sistema,
                tipo_registro=tipo,
                registro_id=reg["chave"],
                versao_registro=reg["versao"],
                operacao=operacao,
                situacao=S.PENDENTE.value,
                competencia=competencia,
                estabelecimento_id=reg["estabelecimento_id"],
                cidadao_id=reg["cidadao_id"],
                mensagens=[{"codigo": "FONTE", "texto": str(reg["fonte_id"])}],
            )
            db.add(novo)
            if ultimo is not None and ultimo.situacao == S.CANCELADO.value:
                ultimo.substituido_por_id = novo.id
            contagem[rotulo] += 1
    await db.flush()
    return dict(contagem)


# ── Payload canônico e validação prévia (B.1-035, B.7-020) ────────────────
def _fonte_id(envio: IntegracaoEnvio) -> uuid.UUID:
    for m in envio.mensagens or []:
        if m.get("codigo") == "FONTE":
            return uuid.UUID(m["texto"])
    return envio.registro_id


async def _cidadao(db, cidadao_id, erros) -> dict | None:
    c = await db.get(Cidadao, cidadao_id) if cidadao_id else None
    if c is None:
        return None
    cpf = somente_digitos(descriptografar(c.cpf_cifrado)) or None
    cns = somente_digitos(descriptografar(c.cns_cifrado)) or None
    if cpf and not validar_cpf(cpf):
        erros.append(
            _msg("CPF_INVALIDO", "CPF do cidadão inválido; corrija o cadastro.", "cidadao.cpf")
        )
    if cns and not validar_cns(cns):
        erros.append(
            _msg("CNS_INVALIDO", "CNS do cidadão inválido; corrija o cadastro.", "cidadao.cns")
        )
    if not cpf and not cns:
        erros.append(
            _msg(
                "SEM_IDENTIFICADOR", "Cidadão sem CPF nem CNS: complete o cadastro.", "cidadao.cpf"
            )
        )
    if not c.data_nascimento:
        erros.append(
            _msg("SEM_NASCIMENTO", "Cidadão sem data de nascimento.", "cidadao.data_nascimento")
        )
    return {
        "cpf": cpf,
        "cns": cns,
        "nome": c.nome,
        "data_nascimento": c.data_nascimento,
        "sexo": c.sexo,
    }


async def _estabelecimento(db, estab_id, erros) -> dict | None:
    e = await db.get(Estabelecimento, estab_id) if estab_id else None
    if e is None:
        erros.append(_msg("SEM_UNIDADE", "Registro sem unidade de saúde.", "estabelecimento.cnes"))
        return None
    if not validar_cnes(e.cnes):
        erros.append(
            _msg("CNES_INVALIDO", f"CNES da unidade {e.nome} inválido.", "estabelecimento.cnes")
        )
    return {"cnes": e.cnes, "nome": e.nome}


async def _profissional(db, prof_id, erros, obrigatorio=True) -> dict | None:
    p = await db.get(Profissional, prof_id) if prof_id else None
    if p is None:
        if obrigatorio:
            erros.append(
                _msg(
                    "SEM_PROFISSIONAL", "Registro sem profissional responsável.", "profissional.cns"
                )
            )
        return None
    cns = somente_digitos(descriptografar(p.cns_cifrado)) or None
    if not cns or not validar_cns(cns):
        erros.append(
            _msg(
                "CNS_PROFISSIONAL",
                f"CNS do profissional {p.nome} ausente ou inválido.",
                "profissional.cns",
            )
        )
    if not p.cbo or not validar_cbo(p.cbo):
        erros.append(
            _msg(
                "CBO_PROFISSIONAL",
                f"CBO do profissional {p.nome} ausente ou inválido.",
                "profissional.cbo",
            )
        )
    return {"cns": cns, "cbo": p.cbo, "nome": p.nome}


async def canonico(db, envio: IntegracaoEnvio) -> tuple[dict | None, list[dict]]:
    """Dados do domínio no formato interno (o manifesto mapeia para o layout)."""
    erros: list[dict] = []
    fonte = _fonte_id(envio)
    tipo = envio.tipo_registro
    dados: dict = {"registro_id": str(envio.registro_id), "versao": envio.versao_registro}
    if tipo == "aplicacao_vacina":
        a = await db.get(AplicacaoVacina, fonte)
        if a is None:
            return None, []
        vacina = await db.get(Vacina, a.vacina_id)
        from app.models.estoque import Lote

        lote = await db.get(Lote, a.lote_id) if a.lote_id else None
        if not vacina.codigo_referencia:
            erros.append(
                _msg(
                    "VACINA_SEM_CODIGO",
                    f"Vacina {vacina.nome} sem código de referência oficial.",
                    "vacina.codigo",
                )
            )
        if lote is None:
            erros.append(_msg("SEM_LOTE", "Aplicação sem lote.", "lote.numero"))
        dados.update(
            vacina={
                "codigo": vacina.codigo_referencia,
                "nome": vacina.nome,
                "fabricante": vacina.fabricante,
            },
            lote={
                "numero": lote.numero if lote else None,
                "validade": lote.validade if lote else None,
            },
            dose=a.dose,
            estrategia=a.estrategia,
            aplicada_em=a.aplicada_em,
            via=vacina.via,
        )
        dados["profissional"] = await _profissional(db, a.profissional_id, erros)
    elif tipo == "resultado_exame":
        item = await db.get(ItemExame, fonte)
        if item is None:
            return None, []
        exame = await db.get(ExameLaboratorio, item.exame_id)
        if not exame.procedimento_sigtap:
            erros.append(
                _msg(
                    "EXAME_SEM_SIGTAP",
                    f"Exame {exame.codigo} sem procedimento SIGTAP.",
                    "exame.procedimento",
                )
            )
        dados.update(
            exame={
                "codigo": exame.codigo,
                "nome": exame.nome,
                "procedimento": exame.procedimento_sigtap,
                "metodo": exame.metodo,
            },
            material=item.material,
            coletado_em=item.coletado_em,
            liberado_em=item.liberado_em,
            resultados=item.avaliacao,
            texto=item.texto_livre,
            assinatura=item.assinatura_hash,
            sigiloso=item.sigiloso,
        )
    elif tipo == "dispensacao":
        from app.models.estoque import Dispensacao, Lote, Produto

        d = await db.get(Dispensacao, fonte)
        if d is None:
            return None, []
        itens = []
        for i in d.itens or []:
            prod = (
                await db.get(Produto, uuid.UUID(str(i.get("produto_id"))))
                if i.get("produto_id")
                else None
            )
            lote = (
                await db.get(Lote, uuid.UUID(str(i.get("lote_id")))) if i.get("lote_id") else None
            )
            if prod is not None and not prod.catmat:
                erros.append(
                    _msg(
                        "PRODUTO_SEM_CATMAT",
                        f"Produto {prod.nome} sem código CATMAT.",
                        "itens.catmat",
                    )
                )
            itens.append(
                {
                    "catmat": prod.catmat if prod else None,
                    "lote": lote.numero if lote else None,
                    "validade": lote.validade if lote else None,
                    "quantidade": i.get("quantidade"),
                }
            )
        dados.update(itens=itens, dispensada_em=d.created_at)
    elif tipo == "movimentacao_estoque":
        from app.models.estoque import Lote, Movimentacao, Produto

        m = await db.get(Movimentacao, fonte)
        if m is None:
            return None, []
        prod = await db.get(Produto, m.produto_id)
        lote = await db.get(Lote, m.lote_id)
        if not prod.catmat:
            erros.append(
                _msg(
                    "PRODUTO_SEM_CATMAT",
                    f"Produto {prod.nome} sem código CATMAT.",
                    "produto.catmat",
                )
            )
        dados.update(
            tipo=m.tipo,
            produto={"catmat": prod.catmat, "nome": prod.nome},
            lote={"numero": lote.numero, "validade": lote.validade},
            quantidade=float(m.quantidade),
            ocorrida_em=m.ocorrido_em,
            documento=m.documento,
        )
    elif tipo in {"atendimento_individual", "atendimento_odontologico"}:
        modelo = Atendimento if tipo == "atendimento_individual" else OdontoAtendimento
        a = await db.get(modelo, fonte)
        if a is None:
            return None, []
        dados.update(tipo=a.tipo, iniciado_em=a.iniciado_em, finalizado_em=a.finalizado_em)
        dados["profissional"] = await _profissional(db, a.profissional_id, erros)
        if tipo == "atendimento_odontologico":
            procs = (
                await db.scalars(
                    select(OdontoProcedimento).where(
                        OdontoProcedimento.atendimento_id == a.id,
                        OdontoProcedimento.situacao == "REALIZADO",
                    )
                )
            ).all()
            dados["procedimentos"] = [
                {
                    "codigo": p.procedimento_sigtap,
                    "dente": p.dente,
                    "faces": p.faces,
                    "quantidade": p.quantidade,
                }
                for p in procs
            ]
    elif tipo == "visita_domiciliar":
        v = await db.get(VisitaDomiciliar, fonte)
        if v is None:
            return None, []
        dom = await db.get(Domicilio, v.domicilio_id)
        dados.update(
            realizada_em=v.realizada_em,
            turno=v.turno,
            motivos=v.motivos,
            desfecho=v.desfecho,
            domicilio={
                "cep": dom.cep if dom else None,
                "municipio_ibge": dom.municipio_ibge if dom else None,
            },
        )
        dados["profissional"] = await _profissional(db, v.profissional_id, erros)
    elif tipo == "exame_siscan":
        e = await db.get(ExameSiscan, fonte)
        if e is None:
            return None, []
        dados.update(
            tipo=e.tipo,
            coletado_em=e.coletado_em,
            requisicao=e.dados_requisicao,
            resultado=e.dados_resultado,
            resultado_em=e.resultado_em,
        )
        dados["profissional"] = await _profissional(db, e.profissional_id, erros, obrigatorio=False)
    if envio.cidadao_id:
        dados["cidadao"] = await _cidadao(db, envio.cidadao_id, erros)
    if envio.estabelecimento_id or tipo != "visita_domiciliar":
        dados["estabelecimento"] = await _estabelecimento(db, envio.estabelecimento_id, erros)
    org = await db.get(Organizacao, envio.tenant_id)
    dados["municipio_ibge"] = getattr(org, "municipio_ibge", None)
    return dados, erros


def _payload(envio: IntegracaoEnvio, dados: dict) -> dict:
    return {
        "tipo_registro": envio.tipo_registro,
        "operacao": envio.operacao,
        "registro_id": str(envio.registro_id),
        "dados": dados,
    }


async def validar(db, tenant_id, sistema, limite: int | None = None) -> dict:
    cfg = await configuracao(db, tenant_id, sistema)
    adaptador = obter_adaptador(sistema, cfg.versao_layout if cfg else None)
    contagem: Counter = Counter()
    pendentes = (
        await db.scalars(
            select(IntegracaoEnvio)
            .where(
                IntegracaoEnvio.tenant_id == tenant_id,
                IntegracaoEnvio.sistema == sistema,
                IntegracaoEnvio.situacao == S.PENDENTE.value,
            )
            .order_by(IntegracaoEnvio.created_at)
            .limit(limite or settings.INTEGRACOES_LOTE_MAXIMO)
        )
    ).all()
    for envio in pendentes:
        await _validar_um(db, envio, adaptador, contagem)
    await db.flush()
    return dict(contagem)


async def _validar_um(db, envio, adaptador, contagem) -> None:
    fonte = [m for m in envio.mensagens or [] if m.get("codigo") == "FONTE"]
    dados, erros = await canonico(db, envio)
    if dados is None:
        envio.situacao = S.CANCELADO.value
        envio.mensagens = fonte + [
            _msg("REGISTRO_INEXISTENTE", "Registro de origem não existe mais.")
        ]
        contagem["cancelados"] += 1
        return
    if eh_pendente(adaptador):
        envio.mensagens = fonte + adaptador.validar({}) + erros
        contagem["aguardando_especificacao"] += 1
        return
    payload = _payload(envio, dados)
    erros = erros + adaptador.validar(payload)
    if erros:
        envio.situacao = S.INVALIDO.value
        envio.mensagens = fonte + erros
        contagem["invalidos"] += 1
        return
    envio.situacao = S.VALIDADO.value
    envio.payload_hash = hashlib.sha256(adaptador.serializar(payload)).hexdigest()
    envio.mensagens = fonte + [_msg("VALIDADO", f"Conforme layout {adaptador.versao}.")]
    contagem["validados"] += 1


# ── Transmissão (B.7-016/019/022, B.4-030/033) ─────────────────────────────
def _prazo(tentativas: int) -> datetime:
    return _agora() + timedelta(minutes=min(2**tentativas, 24 * 60))


def _ler(corpo: dict | None, caminho: str | None):
    valor = corpo
    for parte in (caminho or "").split("."):
        if not parte:
            continue
        if not isinstance(valor, dict):
            return None
        valor = valor.get(parte)
    return valor


async def transmitir(db, tenant_id, sistema, limite: int | None = None) -> dict:
    cfg = await configuracao(db, tenant_id, sistema)
    adaptador = obter_adaptador(sistema, cfg.versao_layout if cfg else None)
    contagem: Counter = Counter()
    if eh_pendente(adaptador) or cfg is None or not cfg.ativo:
        return {
            "transmitidos": 0,
            "motivo": PENDENTE_OFICIAL if eh_pendente(adaptador) else "SEM_CONFIGURACAO_ATIVA",
        }
    if adaptador.transporte["tipo"] == "ARQUIVO":
        return {"transmitidos": 0, "motivo": "ENVIO_POR_ARQUIVO (gere o lote)"}
    url_base = (cfg.parametros or {}).get("url_base")
    if not url_base:
        return {"transmitidos": 0, "motivo": "SEM_URL_BASE"}
    try:
        credencial = transporte.resolver_credencial(cfg.credenciais_ref)
    except transporte.CredencialAusenteError as exc:
        return {"transmitidos": 0, "motivo": f"CREDENCIAL: {exc}"}
    agora = _agora()
    envios = (
        await db.scalars(
            select(IntegracaoEnvio)
            .where(
                IntegracaoEnvio.tenant_id == tenant_id,
                IntegracaoEnvio.sistema == sistema,
                IntegracaoEnvio.situacao.in_([S.VALIDADO.value, S.ERRO_TRANSITORIO.value]),
            )
            .order_by(IntegracaoEnvio.created_at)
            .limit(limite or settings.INTEGRACOES_LOTE_MAXIMO)
        )
    ).all()
    t = adaptador.transporte
    for envio in envios:
        if envio.situacao == S.ERRO_TRANSITORIO.value and (
            envio.proxima_tentativa_em and _utc(envio.proxima_tentativa_em) > agora
        ):
            continue
        dados, erros = await canonico(db, envio)
        if dados is None or erros:
            envio.situacao = S.INVALIDO.value if dados else S.CANCELADO.value
            envio.mensagens = erros or [
                _msg("REGISTRO_INEXISTENTE", "Registro de origem não existe mais.")
            ]
            continue
        corpo = adaptador.serializar(_payload(envio, dados))
        envio.payload_hash = hashlib.sha256(corpo).hexdigest()
        envio.tentativas += 1
        envio.situacao = S.ENVIANDO.value
        try:
            r = await transporte.enviar_http(
                url_base.rstrip("/") + t.get("caminho", ""),
                t.get("metodo", "POST"),
                corpo,
                credencial=credencial,
                chave=f"{envio.id}:{envio.payload_hash[:16]}",
            )
        except Exception as exc:  # noqa: BLE001 - rede/timeout é transitório
            _transitorio(envio, f"{exc.__class__.__name__}")
            contagem["erros_transitorios"] += 1
            continue
        if r.status >= 500 or r.status == 429:
            _transitorio(envio, f"HTTP {r.status}")
            contagem["erros_transitorios"] += 1
        elif r.status >= 400:
            envio.situacao = S.REJEITADO.value
            envio.mensagens = _mensagens_retorno(r.corpo, t) or [
                _msg("REJEITADO", f"HTTP {r.status}: {r.texto[:300]}")
            ]
            contagem["rejeitados"] += 1
        else:
            envio.protocolo = str(_ler(r.corpo, t.get("protocolo_em")) or "") or None
            envio.enviado_em = _agora()
            envio.erro_transitorio = None
            if t.get("aceite_imediato"):
                envio.situacao = S.ACEITO.value
                envio.aceito_em = envio.enviado_em
            else:
                envio.situacao = S.ENVIADO.value
            envio.mensagens = [_msg("TRANSMITIDO", f"Protocolo {envio.protocolo or '-'}.")]
            contagem["transmitidos"] += 1
    await db.flush()
    return dict(contagem)


def _transitorio(envio, erro: str) -> None:
    envio.situacao = S.ERRO_TRANSITORIO.value
    envio.erro_transitorio = erro
    envio.proxima_tentativa_em = _prazo(envio.tentativas)


def _mensagens_retorno(corpo, t) -> list[dict]:
    bruto = _ler(corpo, t.get("mensagens_em"))
    if not bruto:
        return []
    itens = bruto if isinstance(bruto, list) else [bruto]
    return [
        _msg("RETORNO_OFICIAL", str(i.get("diagnostics") or i.get("texto") or i)[:500])
        if isinstance(i, dict)
        else _msg("RETORNO_OFICIAL", str(i)[:500])
        for i in itens
    ]


# ── Lote por arquivo (B.1-033) e retornos (B.4-032) ────────────────────────
async def gerar_lote(db, tenant_id, sistema, competencia, ator, cliente) -> tuple[str, bytes]:
    _sistema(sistema)
    cfg = await configuracao(db, tenant_id, sistema)
    adaptador = obter_adaptador(sistema, cfg.versao_layout if cfg else None)
    if eh_pendente(adaptador):
        raise Conflict(
            f"Layout oficial de {sistema} não carregado; nada é exportado.", code=PENDENTE_OFICIAL
        )
    envios = (
        await db.scalars(
            select(IntegracaoEnvio)
            .where(
                IntegracaoEnvio.tenant_id == tenant_id,
                IntegracaoEnvio.sistema == sistema,
                IntegracaoEnvio.competencia == competencia,
                IntegracaoEnvio.situacao == S.VALIDADO.value,
            )
            .order_by(IntegracaoEnvio.created_at)
        )
    ).all()
    if not envios:
        raise NotFound("Não há registros validados nesta competência.")
    lote_id = f"{sistema}-{competencia}-{uuid.uuid4().hex[:8]}"
    payloads = []
    for envio in envios:
        dados, _ = await canonico(db, envio)
        payloads.append(_payload(envio, dados))
        envio.situacao = S.ENVIADO.value
        envio.lote_id = lote_id
        envio.enviado_em = _agora()
    conteudo = adaptador.serializar_lote(payloads)
    await registrar(
        db,
        acao="EXPORTAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="integracao_lote",
        detalhe=f"{lote_id}: {len(envios)} registros",
        cliente=cliente,
    )
    await db.commit()
    return lote_id, conteudo


async def registrar_retornos(db, tenant_id, sistema, itens, ator, cliente) -> dict:
    """Retorno oficial por protocolo, lote+registro ou id do envio."""
    _sistema(sistema)
    contagem: Counter = Counter()
    nao_encontrados = []
    for item in itens:
        filtros = [IntegracaoEnvio.tenant_id == tenant_id, IntegracaoEnvio.sistema == sistema]
        if item.envio_id:
            filtros.append(IntegracaoEnvio.id == item.envio_id)
        elif item.protocolo:
            filtros.append(IntegracaoEnvio.protocolo == item.protocolo)
        else:
            filtros += [
                IntegracaoEnvio.lote_id == item.lote_id,
                IntegracaoEnvio.registro_id == item.registro_id,
            ]
        envio = await db.scalar(
            select(IntegracaoEnvio).where(*filtros).order_by(IntegracaoEnvio.created_at.desc())
        )
        if envio is None or envio.situacao not in {
            S.ENVIADO.value,
            S.ACEITO.value,
            S.REJEITADO.value,
        }:
            nao_encontrados.append(item.envio_id or item.protocolo or str(item.registro_id))
            continue
        envio.situacao = item.situacao
        envio.protocolo = item.protocolo or envio.protocolo
        if item.situacao == S.ACEITO.value:
            envio.aceito_em = _agora()
        envio.mensagens = [
            _msg(m.codigo or "RETORNO_OFICIAL", m.texto, m.campo) for m in item.mensagens
        ] or [_msg("RETORNO_OFICIAL", item.situacao)]
        contagem[item.situacao.lower()] += 1
    await registrar(
        db,
        acao="INTEGRACAO",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="integracao_retorno",
        detalhe=f"{sistema}: {dict(contagem)}",
        cliente=cliente,
    )
    await db.commit()
    return {**contagem, "nao_encontrados": nao_encontrados}


# ── Execução (manual e automática) e monitoramento (B.7-022/023) ───────────
async def executar(db, tenant_id, sistema, competencia, origem="MANUAL") -> dict:
    _sistema(sistema)
    exec_ = IntegracaoExecucao(
        tenant_id=tenant_id,
        sistema=sistema,
        competencia=competencia,
        origem=origem,
        iniciada_em=_agora(),
    )
    db.add(exec_)
    try:
        resumo = {
            "geracao": await gerar(db, tenant_id, sistema, competencia),
            "validacao": await validar(db, tenant_id, sistema),
            "transmissao": await transmitir(db, tenant_id, sistema),
        }
        exec_.resumo = _json(resumo)
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001 - registra a falha para o painel
        await db.rollback()
        exec_ = IntegracaoExecucao(
            tenant_id=tenant_id,
            sistema=sistema,
            competencia=competencia,
            origem=origem,
            iniciada_em=_agora(),
            falhou=True,
            erro=exc.__class__.__name__,
        )
        db.add(exec_)
        resumo = {"erro": exc.__class__.__name__}
    exec_.finalizada_em = _agora()
    await db.commit()
    return {"execucao_id": exec_.id, **resumo}


def _json(v):
    if isinstance(v, dict):
        return {k: _json(x) for k, x in v.items()}
    return v


def competencias_abertas(hoje: date, quantidade: int) -> list[str]:
    saida, d = [], hoje.replace(day=1)
    for _ in range(max(1, quantidade)):
        saida.append(d.strftime("%Y%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return saida


async def executar_automaticas(db: AsyncSession) -> dict:
    """Tarefa periódica: só tenants com transmissão automática e período vencido."""
    feitos = 0
    configs = (
        await db.scalars(
            select(IntegracaoConfiguracao).where(IntegracaoConfiguracao.ativo.is_(True))
        )
    ).all()
    for cfg in configs:
        p = cfg.parametros or {}
        if cfg.sistema not in SISTEMAS_CENTRAL or not p.get("transmissao_automatica"):
            continue
        ultima = await db.scalar(
            select(func.max(IntegracaoExecucao.iniciada_em)).where(
                IntegracaoExecucao.tenant_id == cfg.tenant_id,
                IntegracaoExecucao.sistema == cfg.sistema,
                IntegracaoExecucao.origem == "AUTOMATICA",
            )
        )
        periodo = timedelta(minutes=int(p.get("periodicidade_minutos") or 1440))
        if ultima and _agora() - _utc(ultima) < periodo:
            continue
        hoje = datetime.now(await _fuso(db, cfg.tenant_id)).date()
        for comp in competencias_abertas(hoje, int(p.get("competencias_abertas") or 2)):
            await executar(db, cfg.tenant_id, cfg.sistema, comp, origem="AUTOMATICA")
        feitos += 1
    return {"configuracoes_executadas": feitos}


async def painel(db, tenant_id) -> dict:
    sistemas = []
    for sistema in SISTEMAS_CENTRAL:
        cfg = await configuracao(db, tenant_id, sistema)
        info = _config_saida(sistema, cfg)
        contagem = dict(
            (
                await db.execute(
                    select(IntegracaoEnvio.situacao, func.count())
                    .where(
                        IntegracaoEnvio.tenant_id == tenant_id, IntegracaoEnvio.sistema == sistema
                    )
                    .group_by(IntegracaoEnvio.situacao)
                )
            ).all()
        )
        ultima = await db.scalar(
            select(IntegracaoExecucao)
            .where(IntegracaoExecucao.tenant_id == tenant_id, IntegracaoExecucao.sistema == sistema)
            .order_by(IntegracaoExecucao.iniciada_em.desc())
        )
        repetidos = await db.scalar(
            select(func.count())
            .select_from(IntegracaoEnvio)
            .where(
                IntegracaoEnvio.tenant_id == tenant_id,
                IntegracaoEnvio.sistema == sistema,
                IntegracaoEnvio.situacao == S.ERRO_TRANSITORIO.value,
                IntegracaoEnvio.tentativas >= settings.INTEGRACOES_MAX_TENTATIVAS,
            )
        )
        alertas = []
        if info["adaptador"] == "PENDENTE":
            alertas.append(
                _msg(PENDENTE_OFICIAL, "Layout oficial não carregado: nada é transmitido.")
            )
        if not info["ativo"]:
            alertas.append(
                _msg("CONFIGURACAO_INATIVA", "Integração sem configuração ativa no tenant.")
            )
        if contagem.get(S.INVALIDO.value):
            alertas.append(
                _msg(
                    "FILA_DE_CORRECAO",
                    f"{contagem[S.INVALIDO.value]} registro(s) aguardam correção.",
                )
            )
        if contagem.get(S.REJEITADO.value):
            alertas.append(
                _msg(
                    "REJEICOES",
                    f"{contagem[S.REJEITADO.value]} registro(s) rejeitados pelo sistema oficial.",
                )
            )
        if repetidos:
            alertas.append(
                _msg(
                    "FALHA_REPETIDA",
                    f"{repetidos} envio(s) com {settings.INTEGRACOES_MAX_TENTATIVAS}+ "
                    "tentativas sem sucesso.",
                )
            )
        if ultima and ultima.falhou:
            alertas.append(_msg("EXECUCAO_FALHOU", f"Última execução falhou: {ultima.erro}."))
        sistemas.append(
            {
                **info,
                "situacoes": contagem,
                "ultima_execucao": {
                    "em": ultima.iniciada_em,
                    "origem": ultima.origem,
                    "falhou": ultima.falhou,
                    "resumo": ultima.resumo,
                }
                if ultima
                else None,
                "alertas": alertas,
            }
        )
    return {"sistemas": sistemas}


# ── Consultas e correção ───────────────────────────────────────────────────
def envio_saida(e: IntegracaoEnvio) -> dict:
    return {
        "id": e.id,
        "sistema": e.sistema,
        "tipo_registro": e.tipo_registro,
        "registro_id": e.registro_id,
        "versao_registro": e.versao_registro,
        "operacao": e.operacao,
        "situacao": e.situacao,
        "competencia": e.competencia,
        "tentativas": e.tentativas,
        "protocolo": e.protocolo,
        "lote_id": e.lote_id,
        "estabelecimento_id": e.estabelecimento_id,
        "cidadao_id": e.cidadao_id,
        "mensagens": [m for m in (e.mensagens or []) if m.get("codigo") != "FONTE"],
        "erro_transitorio": e.erro_transitorio,
        "proxima_tentativa_em": e.proxima_tentativa_em,
        "enviado_em": e.enviado_em,
        "aceito_em": e.aceito_em,
        "substituido_por_id": e.substituido_por_id,
        "created_at": e.created_at,
    }


async def listar_envios(
    db,
    tenant_id,
    *,
    sistema=None,
    situacao=None,
    competencia=None,
    tipo=None,
    cidadao_id=None,
    estabelecimento_id=None,
    limite=200,
) -> list[dict]:
    filtros = [IntegracaoEnvio.tenant_id == tenant_id]
    for coluna, valor in (
        (IntegracaoEnvio.sistema, sistema),
        (IntegracaoEnvio.situacao, situacao),
        (IntegracaoEnvio.competencia, competencia),
        (IntegracaoEnvio.tipo_registro, tipo),
        (IntegracaoEnvio.cidadao_id, cidadao_id),
        (IntegracaoEnvio.estabelecimento_id, estabelecimento_id),
    ):
        if valor:
            filtros.append(coluna == valor)
    return [
        envio_saida(e)
        for e in (
            await db.scalars(
                select(IntegracaoEnvio)
                .where(*filtros)
                .order_by(IntegracaoEnvio.created_at.desc())
                .limit(limite)
            )
        ).all()
    ]


async def inconsistencias(db, tenant_id, *, sistema=None, motivo=None, **filtros) -> list[dict]:
    """B.7-021 — uma linha por mensagem de inconsistência/rejeição."""
    linhas = []
    for situacao in (S.INVALIDO.value, S.REJEITADO.value):
        for e in await listar_envios(
            db, tenant_id, sistema=sistema, situacao=situacao, limite=5000, **filtros
        ):
            for m in e["mensagens"]:
                if motivo and m.get("codigo") != motivo:
                    continue
                linhas.append(
                    {
                        "envio_id": e["id"],
                        "sistema": e["sistema"],
                        "tipo_registro": e["tipo_registro"],
                        "situacao": e["situacao"],
                        "competencia": e["competencia"],
                        "estabelecimento_id": e["estabelecimento_id"],
                        "cidadao_id": e["cidadao_id"],
                        "motivo": m.get("codigo"),
                        "campo": m.get("campo"),
                        "texto": m.get("texto"),
                    }
                )
    return linhas


async def historico_registro(db, tenant_id, tipo, registro_id) -> list[dict]:
    return [
        envio_saida(e)
        for e in (
            await db.scalars(
                select(IntegracaoEnvio)
                .where(
                    IntegracaoEnvio.tenant_id == tenant_id,
                    IntegracaoEnvio.tipo_registro == tipo,
                    IntegracaoEnvio.registro_id == registro_id,
                )
                .order_by(IntegracaoEnvio.created_at)
            )
        ).all()
    ]


async def _envio(db, tenant_id, envio_id) -> IntegracaoEnvio:
    e = await db.scalar(
        select(IntegracaoEnvio).where(
            IntegracaoEnvio.tenant_id == tenant_id, IntegracaoEnvio.id == envio_id
        )
    )
    if e is None:
        raise NotFound("Envio não encontrado.")
    return e


async def reprocessar(db, tenant_id, envio_id, ator, cliente) -> dict:
    """Após corrigir o cadastro: volta a PENDENTE e revalida na hora (B.1-035)."""
    e = await _envio(db, tenant_id, envio_id)
    if e.situacao not in {S.INVALIDO.value, S.REJEITADO.value, S.ERRO_TRANSITORIO.value}:
        raise Conflict(
            f"Envio em situação {e.situacao} não pode ser reprocessado.", code="situacao_invalida"
        )
    e.situacao = S.PENDENTE.value
    e.proxima_tentativa_em = None
    cfg = await configuracao(db, tenant_id, e.sistema)
    await _validar_um(
        db, e, obter_adaptador(e.sistema, cfg.versao_layout if cfg else None), Counter()
    )
    await registrar(
        db,
        acao="INTEGRACAO",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="integracao_envio",
        recurso_id=e.id,
        detalhe=f"reprocessar → {e.situacao}",
        cliente=cliente,
    )
    await db.commit()
    return envio_saida(e)


async def cancelar(db, tenant_id, envio_id, motivo, ator, cliente) -> dict:
    e = await _envio(db, tenant_id, envio_id)
    if e.situacao in ENVIADOS | {S.CANCELADO.value}:
        raise Conflict("Envio já transmitido ou cancelado.", code="situacao_invalida")
    e.situacao = S.CANCELADO.value
    e.mensagens = (e.mensagens or []) + [_msg("CANCELADO", motivo)]
    await registrar(
        db,
        acao="INTEGRACAO",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="integracao_envio",
        recurso_id=e.id,
        detalhe="cancelado",
        justificativa=motivo,
        cliente=cliente,
    )
    await db.commit()
    return envio_saida(e)


async def resumo_competencia(db, tenant_id, sistema, competencia) -> dict:
    """B.1-034 — situação dos registros da competência (exportações múltiplas)."""
    linhas = (
        await db.execute(
            select(
                IntegracaoEnvio.tipo_registro,
                IntegracaoEnvio.operacao,
                IntegracaoEnvio.situacao,
                func.count(),
            )
            .where(
                IntegracaoEnvio.tenant_id == tenant_id,
                IntegracaoEnvio.sistema == sistema,
                IntegracaoEnvio.competencia == competencia,
            )
            .group_by(
                IntegracaoEnvio.tipo_registro, IntegracaoEnvio.operacao, IntegracaoEnvio.situacao
            )
        )
    ).all()
    por_tipo: dict = defaultdict(lambda: defaultdict(int))
    for tipo, operacao, situacao, n in linhas:
        por_tipo[tipo][f"{operacao}:{situacao}"] += n
    return {
        "sistema": sistema,
        "competencia": competencia,
        "tipos": {k: dict(v) for k, v in por_tipo.items()},
    }
