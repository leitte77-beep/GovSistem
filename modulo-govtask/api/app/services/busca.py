"""Busca global do GovTask (§48, §131).

No PostgreSQL a consulta combina **duas** estruturas sobre `demandas`, ambas
colunas geradas e indexadas:

- `busca_tsv` (GIN, configuração `portugues_govtask` = unaccent + stemmer):
  resolve acento ("ambulancia" acha "ambulância"), flexão verbal, plural regular,
  relevância por campo e a sintaxe de buscador.
- `busca_texto` (GIN trigrama): resolve o que o stemmer snowball não unifica —
  "obra" não casa "obras", "aquisição" não casa "aquisições" (verificado contra o
  PostgreSQL 16). Também cobre pedaço de palavra, de forma **indexada**.

As duas entram em OR: o que uma não pega, a outra pega. Um `ILIKE '%termo%'` solto
não usaria índice nenhum e degradaria linearmente.

Fora do PostgreSQL (a suíte roda em SQLite) o mesmo contrato é atendido por
`ILIKE` sobre os mesmos campos. O resultado é equivalente; o que muda é o custo,
e em teste o volume é irrelevante.
"""


from sqlalchemy import Select, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.autoridade import Autoridade
from app.models.comentario_demanda import ComentarioDemanda
from app.models.demanda import Demanda
from app.models.protocolo_externo import ProtocoloExterno
from app.models.tarefa import Tarefa
from app.models.user import User
from app.services.demandas import aplicar_escopo

# Configuração criada pela migration `e8f9a0b1c2d3`: portuguesa + unaccent.
CONFIG_FTS = "portugues_govtask"


def _postgres(db: AsyncSession) -> bool:
    return db.bind is not None and db.bind.dialect.name == "postgresql"


def aplicar_busca(stmt: Select, db: AsyncSession, termo: str) -> Select:
    """Aplica o filtro textual a uma consulta de demandas já escopada."""
    termo = (termo or "").strip()
    if not termo:
        return stmt
    if _postgres(db):
        # websearch_to_tsquery aceita a sintaxe que o usuário já conhece de
        # buscadores ("ambulância -usada", "emenda OR convênio") sem estourar
        # erro de sintaxe em entrada livre, ao contrário de to_tsquery.
        consulta = func.websearch_to_tsquery(CONFIG_FTS, termo)
        # O trigrama entra em OR para cobrir o que o stemmer não unifica. O
        # `%` do LIKE é escapado: um termo com `%` não pode virar curinga.
        alvo = "%" + termo.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        return stmt.where(
            text(
                "(demandas.busca_tsv @@ :__fts"
                " OR demandas.busca_texto LIKE :__trgm ESCAPE '\\')"
            ).bindparams(__fts=consulta, __trgm=alvo)
        )
    alvo = f"%{termo}%"
    return stmt.where(
        or_(
            Demanda.numero.ilike(alvo),
            Demanda.titulo.ilike(alvo),
            Demanda.objeto.ilike(alvo),
            Demanda.assunto.ilike(alvo),
            Demanda.resumo_executivo.ilike(alvo),
            Demanda.descricao.ilike(alvo),
            Demanda.programa.ilike(alvo),
            Demanda.orgao_concedente.ilike(alvo),
        )
    )


async def busca_global(
    db: AsyncSession, user: User, permissoes: set[str], termo: str, limite: int = 10
) -> dict:
    """Pesquisa em demandas, tarefas, protocolos, autoridades e comentários.

    Toda seção passa pelo escopo das demandas: tarefa, protocolo e comentário só
    aparecem se a demanda dona deles for visível a quem pesquisa. Autoridade é
    cadastro administrativo e se limita ao tenant.
    """
    termo = (termo or "").strip()
    if len(termo) < 2:
        return {
            "termo": termo,
            "demandas": [],
            "tarefas": [],
            "protocolos": [],
            "autoridades": [],
            "comentarios": [],
        }

    alvo = f"%{termo}%"
    visiveis = aplicar_escopo(
        select(Demanda.id), user, permissoes, incluir_arquivadas=True
    ).scalar_subquery()

    demandas_stmt = aplicar_busca(
        aplicar_escopo(select(Demanda), user, permissoes, incluir_arquivadas=True),
        db,
        termo,
    ).order_by(Demanda.ultima_movimentacao_em.desc()).limit(limite)
    demandas = (await db.execute(demandas_stmt)).scalars().all()

    tarefas = (
        (
            await db.execute(
                select(Tarefa)
                .where(
                    Tarefa.demanda_id.in_(visiveis),
                    Tarefa.deleted_at.is_(None),
                    or_(Tarefa.titulo.ilike(alvo), Tarefa.descricao.ilike(alvo)),
                )
                .order_by(Tarefa.created_at.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )

    protocolos = (
        (
            await db.execute(
                select(ProtocoloExterno)
                .where(
                    ProtocoloExterno.demanda_id.in_(visiveis),
                    ProtocoloExterno.deleted_at.is_(None),
                    or_(
                        ProtocoloExterno.numero.ilike(alvo),
                        ProtocoloExterno.sistema.ilike(alvo),
                        ProtocoloExterno.orgao.ilike(alvo),
                    ),
                )
                .order_by(ProtocoloExterno.data_protocolo.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )

    autoridades = (
        (
            await db.execute(
                select(Autoridade)
                .where(
                    Autoridade.organization_id == user.organization_id,
                    Autoridade.deleted_at.is_(None),
                    or_(
                        Autoridade.nome.ilike(alvo),
                        Autoridade.instituicao.ilike(alvo),
                        Autoridade.cargo.ilike(alvo),
                    ),
                )
                .order_by(Autoridade.nome)
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )

    comentarios = (
        (
            await db.execute(
                select(ComentarioDemanda)
                .where(
                    ComentarioDemanda.demanda_id.in_(visiveis),
                    ComentarioDemanda.deleted_at.is_(None),
                    ComentarioDemanda.texto.ilike(alvo),
                )
                .order_by(ComentarioDemanda.created_at.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )

    return {
        "termo": termo,
        "demandas": [
            {
                "id": str(d.id),
                "numero": d.numero,
                "titulo": d.titulo,
                "status": d.status.rotulo if d.status else None,
                "prioridade": d.prioridade,
                "prazo_final": d.prazo_final,
                "atrasada": d.atrasada,
            }
            for d in demandas
        ],
        "tarefas": [
            {
                "id": str(t.id),
                "demanda_id": str(t.demanda_id) if t.demanda_id else None,
                "titulo": t.titulo,
                "status": t.status,
            }
            for t in tarefas
        ],
        "protocolos": [
            {
                "id": str(p.id),
                "demanda_id": str(p.demanda_id),
                "sistema": p.sistema,
                "numero": p.numero,
                "situacao": p.situacao,
            }
            for p in protocolos
        ],
        "autoridades": [
            {
                "id": str(a.id),
                "nome": a.nome,
                "cargo": a.cargo,
                "instituicao": a.instituicao,
            }
            for a in autoridades
        ],
        "comentarios": [
            {
                "id": str(c.id),
                "demanda_id": str(c.demanda_id),
                # Trecho curto: a busca mostra onde está, não o comentário todo.
                "trecho": c.texto[:200],
                "criado_em": c.created_at,
            }
            for c in comentarios
        ],
    }


async def sugerir(
    db: AsyncSession, user: User, permissoes: set[str], termo: str, limite: int = 8
) -> list[dict]:
    """Autocomplete do command palette (§115): número e título apenas."""
    termo = (termo or "").strip()
    if len(termo) < 2:
        return []
    stmt = aplicar_busca(
        aplicar_escopo(
            select(Demanda.id, Demanda.numero, Demanda.titulo),
            user,
            permissoes,
            incluir_arquivadas=True,
        ),
        db,
        termo,
    ).limit(limite)
    return [
        {"id": str(i), "numero": numero, "titulo": titulo}
        for i, numero, titulo in (await db.execute(stmt)).all()
    ]
