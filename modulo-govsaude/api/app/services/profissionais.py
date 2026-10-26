"""Profissionais, documentos protegidos, vínculos e especialidades.

Atende B.1-011 (histórico de vínculo/lotação por vigência), B.12-006 e
B.12-016 (escopo de procedimentos). CPF/CNS nunca saem em claro nos DTOs.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import somente_digitos, validar_cns, validar_cpf
from app.core.encryption import proteger_documento
from app.core.errors import Conflict, PermissionDenied, Unprocessable
from app.core.fonetica import nome_fonetico as chave_fonetica
from app.core.fonetica import normalizar_busca
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import (
    Equipe,
    Profissional,
    Usuario,
    VinculoProfissional,
)
from app.models.rede import ProfissionalEspecialidade
from app.schemas.rede import (
    BaixaRequest,
    ProfissionalCreate,
    ProfissionalEspecialidadeCreate,
    ProfissionalUpdate,
    VinculoProfissionalCreate,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import (
    aplicar_cursor,
    codificar,
    decodificar,  # noqa: F401  (reexport de apoio)
)
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
    obter_equipe,
    obter_especialidade,
    obter_estabelecimento,
    obter_profissional,
    serializar_profissional,
    validar_cbo_contra_referencia,
    validar_vigencia,
)


def _aplicar_documentos(
    registro: Profissional, cpf: str | None, cns: str | None
) -> None:
    if cpf is not None:
        if not validar_cpf(cpf):
            raise Unprocessable(
                "CPF inválido.",
                errors=[
                    {
                        "campo": "cpf",
                        "mensagem": "Dígito verificador inválido.",
                        "codigo_regra": "cpf",
                    }
                ],
            )
        protegido = proteger_documento(somente_digitos(cpf))
        registro.cpf_hash = protegido.hash_busca
        registro.cpf_cifrado = protegido.cifrado
        registro.cpf_final = protegido.final
    if cns is not None:
        if not validar_cns(cns):
            raise Unprocessable(
                "CNS inválido.",
                errors=[
                    {
                        "campo": "cns",
                        "mensagem": "Dígito verificador inválido.",
                        "codigo_regra": "cns",
                    }
                ],
            )
        protegido = proteger_documento(somente_digitos(cns))
        registro.cns_hash = protegido.hash_busca
        registro.cns_cifrado = protegido.cifrado


def _atualizar_busca(registro: Profissional) -> None:
    registro.nome_busca = normalizar_busca(registro.nome)
    registro.nome_fonetico = chave_fonetica(registro.nome)


async def _garantir_documentos_unicos(
    db: AsyncSession, tenant_id: uuid.UUID, registro: Profissional
) -> None:
    if registro.cpf_hash:
        outro = await db.scalar(
            select(Profissional.id).where(
                Profissional.tenant_id == tenant_id,
                Profissional.cpf_hash == registro.cpf_hash,
                Profissional.baixa_em.is_(None),
                Profissional.id != registro.id,
            )
        )
        if outro:
            raise Conflict("CPF já cadastrado para outro profissional.", code="cpf_duplicado")
    if registro.cns_hash:
        outro = await db.scalar(
            select(Profissional.id).where(
                Profissional.tenant_id == tenant_id,
                Profissional.cns_hash == registro.cns_hash,
                Profissional.baixa_em.is_(None),
                Profissional.id != registro.id,
            )
        )
        if outro:
            raise Conflict("CNS já cadastrado para outro profissional.", code="cns_duplicado")


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: ProfissionalCreate,
    ator: Usuario,
    cliente: dict,
) -> Profissional:
    estabelecimento = await obter_estabelecimento(
        db, tenant_id, dados.estabelecimento_id
    )
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.PROFISSIONAL_GERENCIAR, estabelecimento.id
    )
    equipe = None
    if dados.equipe_id:
        equipe = await obter_equipe(db, tenant_id, dados.equipe_id)
        if equipe.estabelecimento_id != estabelecimento.id:
            raise Unprocessable(
                "A equipe não pertence ao estabelecimento informado.",
                errors=[
                    {
                        "campo": "equipe_id",
                        "mensagem": "Selecione uma equipe da mesma unidade.",
                        "codigo_regra": "equipe_estabelecimento",
                    }
                ],
            )
    await validar_cbo_contra_referencia(db, dados.cbo)
    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    registro = Profissional(
        tenant_id=tenant_id,
        nome=dados.nome.strip(),
        nome_social=(dados.nome_social or "").strip() or None,
        cbo=somente_digitos(dados.cbo),
        conselho_classe=dados.conselho_classe,
        registro_conselho=dados.registro_conselho,
        email=(dados.email or "").strip().lower() or None,
        telefone=dados.telefone,
        ativo=True,
        versao=1,
    )
    _aplicar_documentos(registro, dados.cpf, dados.cns)
    _atualizar_busca(registro)
    await _garantir_documentos_unicos(db, tenant_id, registro)
    db.add(registro)
    await db.flush()
    vinculo = VinculoProfissional(
        tenant_id=tenant_id,
        profissional_id=registro.id,
        estabelecimento_id=estabelecimento.id,
        equipe_id=equipe.id if equipe else None,
        cbo=somente_digitos(dados.cbo),
        carga_horaria_semanal=dados.carga_horaria_semanal,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        versao=1,
    )
    db.add(vinculo)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento.id,
        recurso="vinculo_profissional",
        recurso_id=vinculo.id,
        dados_depois=instantaneo(vinculo),
        cliente=cliente,
    )
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento.id,
        recurso="profissional",
        recurso_id=registro.id,
        dados_depois=serializar_profissional(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    limite: int = 50,
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
    estabelecimento_id: uuid.UUID | None = None,
) -> tuple[list[Profissional], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Profissional.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.PROFISSIONAL_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        sub = select(VinculoProfissional.profissional_id).where(
            VinculoProfissional.tenant_id == tenant_id,
            VinculoProfissional.estabelecimento_id.in_(permitidos),
            or_(
                VinculoProfissional.vigencia_fim.is_(None),
                VinculoProfissional.vigencia_fim >= date.today(),
            ),
        )
        condicoes.append(Profissional.id.in_(sub))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(db,
            usuario, Permissao.PROFISSIONAL_LER, estabelecimento_id
        )
        sub = select(VinculoProfissional.profissional_id).where(
            VinculoProfissional.tenant_id == tenant_id,
            VinculoProfissional.estabelecimento_id == estabelecimento_id,
            or_(
                VinculoProfissional.vigencia_fim.is_(None),
                VinculoProfissional.vigencia_fim >= date.today(),
            ),
        )
        condicoes.append(Profissional.id.in_(sub))
    if busca:
        termo_normalizado = normalizar_busca(busca)
        termo_fonetico = chave_fonetica(busca)
        condicoes.append(
            or_(
                Profissional.nome_busca.like(f"%{termo_normalizado}%"),
                Profissional.nome_fonetico.like(f"%{termo_fonetico}%"),
            )
        )
    if ativo is not None:
        condicoes.append(Profissional.ativo.is_(ativo))
    total = (
        await db.scalar(select(func.count()).select_from(Profissional).where(*condicoes))
        or 0
    )
    consulta = (
        select(Profissional)
        .where(*condicoes)
        .order_by(Profissional.created_at, Profissional.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Profissional, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


def _tem_vinculo_no_escopo(
    db: AsyncSession, tenant_id: uuid.UUID, profissional_id: uuid.UUID, permitidos: set[uuid.UUID]
):
    return select(VinculoProfissional.id).where(
        VinculoProfissional.tenant_id == tenant_id,
        VinculoProfissional.profissional_id == profissional_id,
        VinculoProfissional.estabelecimento_id.in_(permitidos),
        or_(
            VinculoProfissional.vigencia_fim.is_(None),
            VinculoProfissional.vigencia_fim >= date.today(),
        ),
    ).limit(1)


async def obter_com_escopo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
    permissao: Permissao = Permissao.PROFISSIONAL_LER,
) -> Profissional:
    registro = await obter_profissional(db, tenant_id, profissional_id)
    permitidos = escopos_estabelecimento(usuario, permissao)
    if permitidos is not None:
        encontrado = await db.scalar(
            _tem_vinculo_no_escopo(db, tenant_id, registro.id, permitidos)
        )
        if not encontrado:
            raise PermissionDenied("Profissional fora do seu escopo de estabelecimentos.")
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
    dados: ProfissionalUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Profissional:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, profissional_id, Permissao.PROFISSIONAL_GERENCIAR
    )
    conferir_versao(registro.versao, versao)
    antes = serializar_profissional(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.nome_social is not None:
        registro.nome_social = dados.nome_social.strip() or None
    if dados.cbo is not None:
        if dados.cbo:
            await validar_cbo_contra_referencia(db, dados.cbo)
            registro.cbo = somente_digitos(dados.cbo)
        else:
            registro.cbo = None
    for campo in ("conselho_classe", "registro_conselho", "telefone"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.email is not None:
        registro.email = dados.email.strip().lower() or None
    if dados.cpf is not None or dados.cns is not None:
        _aplicar_documentos(registro, dados.cpf, dados.cns)
        await _garantir_documentos_unicos(db, tenant_id, registro)
    _atualizar_busca(registro)
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="profissional",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=serializar_profissional(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> Profissional:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, profissional_id, Permissao.PROFISSIONAL_GERENCIAR
    )
    if registro.baixa_em is not None:
        return registro
    antes = serializar_profissional(registro)
    registro.baixa_em = dados.data or agora()
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.ativo = False
    registro.versao += 1
    hoje = dados.data.date() if dados.data else date.today()
    abertos = (
        await db.execute(
            select(VinculoProfissional).where(
                VinculoProfissional.tenant_id == tenant_id,
                VinculoProfissional.profissional_id == registro.id,
                VinculoProfissional.vigencia_fim.is_(None),
            )
        )
    ).scalars().all()
    for vinculo in abertos:
        vinculo.vigencia_fim = max(hoje, vinculo.vigencia_inicio)
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="profissional",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=serializar_profissional(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_vinculos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
    incluir_encerrados: bool = True,
) -> tuple[list[VinculoProfissional], str | None, int]:
    await obter_com_escopo(db, tenant_id, usuario, profissional_id)
    limite = min(max(limite, 1), 100)
    condicoes = [
        VinculoProfissional.tenant_id == tenant_id,
        VinculoProfissional.profissional_id == profissional_id,
    ]
    if not incluir_encerrados:
        condicoes.append(VinculoProfissional.vigencia_fim.is_(None))
    total = (
        await db.scalar(
            select(func.count()).select_from(VinculoProfissional).where(*condicoes)
        )
        or 0
    )
    consulta = (
        select(VinculoProfissional)
        .where(*condicoes)
        .order_by(VinculoProfissional.vigencia_inicio.desc(), VinculoProfissional.id)
        .limit(limite + 1)
    )
    posicao = decodificar(cursor)
    if posicao:
        consulta = consulta.where(
            VinculoProfissional.created_at < posicao[0]
        )
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_vinculo(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
    dados: VinculoProfissionalCreate,
    ator: Usuario,
    cliente: dict,
) -> VinculoProfissional:
    profissional = await obter_com_escopo(
        db, tenant_id, usuario, profissional_id, Permissao.PROFISSIONAL_GERENCIAR
    )
    estabelecimento = await obter_estabelecimento(
        db, tenant_id, dados.estabelecimento_id
    )
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.PROFISSIONAL_GERENCIAR, estabelecimento.id
    )
    equipe: Equipe | None = None
    if dados.equipe_id:
        equipe = await obter_equipe(db, tenant_id, dados.equipe_id)
        if equipe.estabelecimento_id != estabelecimento.id:
            raise Unprocessable(
                "A equipe não pertence ao estabelecimento informado.",
                errors=[
                    {
                        "campo": "equipe_id",
                        "mensagem": "Selecione uma equipe da mesma unidade.",
                        "codigo_regra": "equipe_estabelecimento",
                    }
                ],
            )
    await validar_cbo_contra_referencia(db, dados.cbo)
    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    filtros = [
        VinculoProfissional.tenant_id == tenant_id,
        VinculoProfissional.profissional_id == profissional.id,
        VinculoProfissional.estabelecimento_id == estabelecimento.id,
        VinculoProfissional.vigencia_fim.is_(None),
    ]
    if dados.equipe_id:
        filtros.append(VinculoProfissional.equipe_id == dados.equipe_id)
    else:
        filtros.append(VinculoProfissional.equipe_id.is_(None))
    anteriores = (
        await db.execute(
            select(VinculoProfissional)
            .where(*filtros)
            .order_by(VinculoProfissional.vigencia_inicio.desc())
        )
    ).scalars().all()
    for anterior in anteriores:
        if inicio <= anterior.vigencia_inicio:
            raise Conflict(
                "O novo vínculo deve começar depois do vínculo anterior.",
                code="vigencia_vinculo_invalida",
                extra={"vinculo_atual": str(anterior.id)},
            )
        antes = instantaneo(anterior)
        anterior.vigencia_fim = inicio - timedelta(days=1)
        anterior.versao += 1
        await registrar(
            db,
            acao=AcaoAuditoria.ATUALIZAR,
            usuario=ator,
            tenant_id=tenant_id,
            estabelecimento_id=estabelecimento.id,
            recurso="vinculo_profissional",
            recurso_id=anterior.id,
            detalhe="Vínculo anterior encerrado para preservar o histórico.",
            dados_antes=antes,
            dados_depois=instantaneo(anterior),
            cliente=cliente,
        )
    registro = VinculoProfissional(
        tenant_id=tenant_id,
        profissional_id=profissional.id,
        estabelecimento_id=estabelecimento.id,
        equipe_id=equipe.id if equipe else None,
        cbo=somente_digitos(dados.cbo),
        carga_horaria_semanal=dados.carga_horaria_semanal,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento.id,
        recurso="vinculo_profissional",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_vinculos_por_equipe(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    equipe_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[VinculoProfissional], str | None, int]:
    equipe = await obter_equipe(db, tenant_id, equipe_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.EQUIPE_LER, equipe.estabelecimento_id
    )
    limite = min(max(limite, 1), 100)
    condicoes = [
        VinculoProfissional.tenant_id == tenant_id,
        VinculoProfissional.equipe_id == equipe_id,
    ]
    total = (
        await db.scalar(
            select(func.count()).select_from(VinculoProfissional).where(*condicoes)
        )
        or 0
    )
    consulta = (
        select(VinculoProfissional)
        .where(*condicoes)
        .order_by(VinculoProfissional.vigencia_inicio.desc(), VinculoProfissional.id)
        .limit(limite + 1)
    )
    posicao = decodificar(cursor)
    if posicao:
        consulta = consulta.where(VinculoProfissional.created_at < posicao[0])
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def listar_especialidades(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
) -> list[ProfissionalEspecialidade]:
    await obter_com_escopo(db, tenant_id, usuario, profissional_id)
    return list(
        (
            await db.execute(
                select(ProfissionalEspecialidade)
                .where(
                    ProfissionalEspecialidade.tenant_id == tenant_id,
                    ProfissionalEspecialidade.profissional_id == profissional_id,
                )
                .order_by(ProfissionalEspecialidade.vigencia_inicio.desc())
            )
        )
        .scalars()
        .all()
    )


async def adicionar_especialidade(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    profissional_id: uuid.UUID,
    dados: ProfissionalEspecialidadeCreate,
    ator: Usuario,
    cliente: dict,
) -> ProfissionalEspecialidade:
    profissional = await obter_com_escopo(
        db, tenant_id, usuario, profissional_id, Permissao.PROFISSIONAL_GERENCIAR
    )
    especialidade = await obter_especialidade(db, tenant_id, dados.especialidade_id)
    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    existente = await db.scalar(
        select(ProfissionalEspecialidade).where(
            ProfissionalEspecialidade.tenant_id == tenant_id,
            ProfissionalEspecialidade.profissional_id == profissional.id,
            ProfissionalEspecialidade.especialidade_id == especialidade.id,
            ProfissionalEspecialidade.vigencia_inicio == inicio,
        )
    )
    if existente:
        raise Conflict("Especialidade já vinculada nesta data.", code="especialidade_duplicada")
    registro = ProfissionalEspecialidade(
        tenant_id=tenant_id,
        profissional_id=profissional.id,
        especialidade_id=especialidade.id,
        principal=dados.principal,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="profissional_especialidade",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


def para_saida(registro: Profissional) -> dict:
    return serializar_profissional(registro)
