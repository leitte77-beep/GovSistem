"""Gestão de usuários locais, grupos e escopos."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import date, datetime

from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.br_validators import somente_digitos, validar_cns, validar_cpf
from app.core.encryption import proteger_documento
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import GRUPOS_NACIONAIS, Permissao
from app.core.security import agora, hash_password, hmac_hex, senha_expira_em
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Grupo, HistoricoSenha, Usuario, UsuarioGrupo
from app.schemas.nucleo import UsuarioCreate, UsuarioUpdate
from app.services.auditoria import instantaneo, registrar
from app.services.autenticacao import validar_politica_senha


def _stmt_usuario():
    return select(Usuario).options(
        selectinload(Usuario.grupos)
        .selectinload(UsuarioGrupo.grupo)
        .selectinload(Grupo.permissoes)
    )


async def obter(db: AsyncSession, tenant_id: uuid.UUID, usuario_id: uuid.UUID) -> Usuario:
    usuario = await db.scalar(
        _stmt_usuario().where(Usuario.id == usuario_id, Usuario.tenant_id == tenant_id)
    )
    if usuario is None:
        raise NotFound("Usuário não encontrado.")
    return usuario


async def _grupo(db: AsyncSession, tenant_id: uuid.UUID, codigo: str) -> Grupo:
    if codigo not in GRUPOS_NACIONAIS:
        raise Unprocessable(
            "Grupo inválido.",
            errors=[{"campo": "grupo", "mensagem": "Grupo inexistente.", "codigo_regra": "grupo"}],
        )
    grupo = await db.scalar(
        select(Grupo).where(Grupo.tenant_id == tenant_id, Grupo.codigo == codigo)
    )
    if grupo is None:
        raise Unprocessable("Grupo não encontrado para o tenant.")
    return grupo


async def _aplicar_documentos(usuario: Usuario, cpf: str | None, cns: str | None) -> None:
    if cpf:
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
        usuario.cpf_hash = protegido.hash_busca
        usuario.cpf_cifrado = protegido.cifrado
        usuario.cpf_final = protegido.final
    if cns:
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
        usuario.cns_hash = protegido.hash_busca
        usuario.cns_cifrado = protegido.cifrado


def _aplicar_grupo(
    db: AsyncSession, usuario: Usuario, grupo: Grupo, dados: UsuarioCreate | UsuarioUpdate
) -> UsuarioGrupo:
    vinculo = UsuarioGrupo(
        tenant_id=usuario.tenant_id,
        usuario_id=usuario.id,
        grupo_id=grupo.id,
        estabelecimento_id=dados.estabelecimento_id,
        equipe_id=dados.equipe_id,
        especialidade_id=dados.especialidade_id,
        vigencia_inicio=date.today(),
        ativo=True,
    )
    db.add(vinculo)
    return vinculo


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: UsuarioCreate,
    ator: Usuario,
    cliente: dict,
) -> Usuario:
    email = str(dados.email).lower()
    existente = await db.scalar(
        select(Usuario).where(Usuario.tenant_id == tenant_id, func.lower(Usuario.email) == email)
    )
    if existente:
        raise Conflict("Já existe um usuário com este e-mail neste tenant.", code="email_duplicado")
    grupo = await _grupo(db, tenant_id, dados.grupo)
    if dados.senha:
        erros = validar_politica_senha(dados.senha)
        if erros:
            raise Unprocessable(
                "A senha não atende à política.",
                errors=[
                    {"campo": "senha", "mensagem": e, "codigo_regra": "politica_senha"}
                    for e in erros
                ],
            )
    usuario = Usuario(
        tenant_id=tenant_id,
        externo_id=None,
        nome=dados.nome,
        email=email,
        nome_acesso=(dados.nome_acesso or "").lower() or None,
        telefone=dados.telefone,
        password_hash=hash_password(dados.senha) if dados.senha else None,
        ativo=True,
        senha_alterada_em=agora() if dados.senha else None,
        senha_expira_em=senha_expira_em() if dados.senha else None,
    )
    await _aplicar_documentos(usuario, dados.cpf, dados.cns)
    db.add(usuario)
    await db.flush()
    if usuario.password_hash:
        db.add(
            HistoricoSenha(
                tenant_id=tenant_id,
                usuario_id=usuario.id,
                password_hash=usuario.password_hash,
            )
        )
    _aplicar_grupo(db, usuario, grupo, dados)
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="usuario",
        recurso_id=usuario.id,
        dados_depois=instantaneo(usuario),
        cliente=cliente,
    )
    await db.commit()
    return await obter(db, tenant_id, usuario.id)


async def atualizar(
    db: AsyncSession,
    *,
    usuario: Usuario,
    dados: UsuarioUpdate,
    ator: Usuario,
    if_match: int | None,
    cliente: dict,
) -> Usuario:
    if if_match is not None and int(if_match) != usuario.versao:
        raise Conflict(
            "O usuário foi alterado por outro usuário. Recarregue e tente novamente.",
            code="conflito_versao",
            extra={"versao_atual": usuario.versao},
        )
    antes = instantaneo(usuario)
    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.email is not None:
        email = str(dados.email).lower()
        outro = await db.scalar(
            select(Usuario).where(
                Usuario.tenant_id == usuario.tenant_id,
                func.lower(Usuario.email) == email,
                Usuario.id != usuario.id,
            )
        )
        if outro:
            raise Conflict("E-mail já utilizado por outro usuário.", code="email_duplicado")
        usuario.email = email
    if dados.ativo is not None:
        usuario.ativo = dados.ativo
    if dados.motivo_baixa:
        usuario.baixa_em = agora()
        usuario.baixa_motivo = dados.motivo_baixa
        usuario.baixa_por_id = ator.id
        usuario.ativo = False
    if dados.grupo is not None:
        grupo = await _grupo(db, usuario.tenant_id, dados.grupo)
        # Desativa vínculos automáticos anteriores; preserva escopos específicos.
        for vinculo in list(usuario.grupos):
            if vinculo.estabelecimento_id is None and vinculo.equipe_id is None:
                vinculo.ativo = False
        _aplicar_grupo(db, usuario, grupo, dados)
    usuario.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=usuario.tenant_id,
        recurso="usuario",
        recurso_id=usuario.id,
        dados_antes=antes,
        dados_depois=instantaneo(usuario),
        justificativa=dados.motivo_baixa,
        cliente=cliente,
    )
    await db.commit()
    return await obter(db, usuario.tenant_id, usuario.id)


async def adicionar_vinculo(
    db: AsyncSession,
    *,
    usuario: Usuario,
    codigo_grupo: str,
    estabelecimento_id: uuid.UUID | None,
    equipe_id: uuid.UUID | None,
    especialidade_id: uuid.UUID | None,
    ator: Usuario,
    cliente: dict,
) -> UsuarioGrupo:
    grupo = await _grupo(db, usuario.tenant_id, codigo_grupo)
    vinculo = UsuarioGrupo(
        tenant_id=usuario.tenant_id,
        usuario_id=usuario.id,
        grupo_id=grupo.id,
        estabelecimento_id=estabelecimento_id,
        equipe_id=equipe_id,
        especialidade_id=especialidade_id,
        vigencia_inicio=date.today(),
        ativo=True,
    )
    db.add(vinculo)
    await registrar(
        db,
        acao=AcaoAuditoria.PERMISSAO,
        usuario=ator,
        tenant_id=usuario.tenant_id,
        recurso="usuario_grupo",
        recurso_id=vinculo.id,
        recurso_descricao=f"{usuario.nome} → {codigo_grupo}",
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(vinculo)
    return vinculo


async def revogar_vinculo(
    db: AsyncSession, *, usuario: Usuario, vinculo_id: uuid.UUID, ator: Usuario, cliente: dict
) -> None:
    vinculo = await db.scalar(
        select(UsuarioGrupo).where(
            UsuarioGrupo.id == vinculo_id,
            UsuarioGrupo.usuario_id == usuario.id,
            UsuarioGrupo.tenant_id == usuario.tenant_id,
        )
    )
    if vinculo is None:
        raise NotFound("Vínculo de grupo não encontrado.")
    vinculo.ativo = False
    vinculo.vigencia_fim = date.today()
    await registrar(
        db,
        acao=AcaoAuditoria.PERMISSAO,
        usuario=ator,
        tenant_id=usuario.tenant_id,
        recurso="usuario_grupo",
        recurso_id=vinculo.id,
        detalhe="Vínculo revogado.",
        cliente=cliente,
    )
    await db.commit()


async def revogar_sessoes(db: AsyncSession, usuario: Usuario, ator: Usuario, cliente: dict) -> None:
    usuario.token_version += 1
    await registrar(
        db,
        acao=AcaoAuditoria.LOGOUT,
        usuario=ator,
        tenant_id=usuario.tenant_id,
        recurso="usuario",
        recurso_id=usuario.id,
        detalhe="Sessões revogadas.",
        cliente=cliente,
    )
    await db.commit()


def _decodificar_cursor(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    if not cursor:
        return None
    try:
        dados = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        return datetime.fromisoformat(dados["created_at"]), uuid.UUID(dados["id"])
    except Exception:  # noqa: BLE001
        return None


def _codificar_cursor(created_at, id_) -> str:
    bruto = json.dumps({"created_at": created_at.isoformat(), "id": str(id_)})
    return base64.urlsafe_b64encode(bruto.encode()).decode()


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
) -> tuple[list[Usuario], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Usuario.tenant_id == tenant_id]
    if busca:
        termo = f"%{busca.strip().lower()}%"
        condicoes.append(
            or_(func.lower(Usuario.nome).like(termo), func.lower(Usuario.email).like(termo))
        )
    if ativo is not None:
        condicoes.append(Usuario.ativo.is_(ativo))
    total = await db.scalar(select(func.count()).select_from(Usuario).where(*condicoes)) or 0
    consulta = _stmt_usuario().where(*condicoes).order_by(Usuario.created_at, Usuario.id)
    decodificado = _decodificar_cursor(cursor)
    if decodificado:
        consulta = consulta.where(
            tuple_(Usuario.created_at, Usuario.id) > tuple_(decodificado[0], decodificado[1])
        )
    itens = list((await db.execute(consulta.limit(limite + 1))).scalars().unique().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = _codificar_cursor(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


MENUS = [
    ("dashboard", "Painel", "/", Permissao.DASHBOARD_LER),
    ("usuarios", "Usuários", "/usuarios", Permissao.USUARIO_LER),
    ("grupos", "Grupos e permissões", "/grupos", Permissao.GRUPO_LER),
    ("configuracoes", "Configurações", "/configuracoes", Permissao.CONFIGURACAO_LER),
    ("auditoria", "Auditoria", "/auditoria", Permissao.AUDITORIA_LER),
    ("integracoes", "Integrações", "/integracoes", Permissao.INTEGRACAO_LER),
    ("referencia", "Tabelas de referência", "/referencia", Permissao.REFERENCIA_LER),
]


def menus_para(permissoes: set[str]) -> list[dict]:
    return [
        {"codigo": codigo, "titulo": titulo, "rota": rota, "permissao": permissao.value}
        for codigo, titulo, rota, permissao in MENUS
        if permissao.value in permissoes
    ]


def mascarar_cpf_hash(valor: str | None) -> str | None:
    if not valor:
        return None
    return f"***{valor[-4:]}"


def hash_para_busca_cpf(cpf: str) -> str:
    return hmac_hex(somente_digitos(cpf))
