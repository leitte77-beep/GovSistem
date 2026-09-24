"""Remove dos modelos as linhas de tabela com dados do documento-exemplo.

Modelos aprendidos por IA guardaram linhas concretas do ato de referência
(itens, marcas, valores e fornecedores de OUTRO processo). Como o modelo insere
seus textos fixos em toda minuta, essas linhas eram publicadas no Diário como
se fossem do novo ato. O aprendizado já não as aceita mais
(``learning._rows_without_sample_data``); este script trata os modelos que
foram criados antes disso.

Nada é sobrescrito: cada modelo afetado ganha uma NOVA versão em rascunho, sem
as linhas; a versão anterior continua no histórico. Use ``--apply`` para
gravar — sem ele, apenas relata.
"""

import argparse
import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session, engine
from app.document_model.schemas import DocumentModelConfig, extract_markers
from app.document_model.service import create_new_version
from app.models.document_model import DocumentModel

REASON = "Remoção de linhas com dados do documento de referência"


def _is_sample_row(row) -> bool:
    return not any(extract_markers(str(cell)) for cell in row or [])


def _strip(config: dict) -> tuple[dict, int]:
    """Devolve a config sem linhas de exemplo e quantas foram removidas."""
    removed = 0

    def walk(sections):
        nonlocal removed
        for section in sections or []:
            rows = section.get("table_rows") or []
            if rows:
                kept = [row for row in rows if not _is_sample_row(row)]
                removed += len(rows) - len(kept)
                section["table_rows"] = kept
            walk(section.get("children"))

    walk(config.get("sections"))
    return config, removed


async def main(org: uuid.UUID, apply: bool) -> None:
    engine.echo = False
    async with async_session() as db:
        models = (await db.execute(
            select(DocumentModel)
            .options(selectinload(DocumentModel.versions))
            .where(DocumentModel.organization_id == org,
                   DocumentModel.deleted_at.is_(None))
        )).scalars().all()

        for model in models:
            versions = sorted(model.versions, key=lambda v: v.version_number)
            if not versions:
                continue
            latest = versions[-1]
            config, removed = _strip(dict(latest.config_json or {}))
            if not removed:
                continue
            print(f"{model.name}: {removed} linha(s) de exemplo na versão "
                  f"{latest.version_number}")
            if not apply:
                continue
            await create_new_version(
                db, model.id, DocumentModelConfig.model_validate(config),
                layout=latest.layout_json, change_reason=REASON,
            )
            print(f"  → nova versão em rascunho, sem os dados de exemplo")
        if apply:
            await db.commit()
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--organization", required=True, type=uuid.UUID)
    parser.add_argument("--apply", action="store_true",
                        help="grava as novas versões (sem isso, só relata)")
    args = parser.parse_args()
    asyncio.run(main(args.organization, args.apply))
