"""Importa como modelo TODO .docx de uma pasta, sem catálogo manual.

Para cada arquivo: a IA aponta quais trechos são dados daquele caso concreto
(``word_autofields``) e o conversor determinístico reproduz o documento com
esses trechos virando ``{{campos}}`` (``word_template``). A forma vem do Word;
a IA só diz o que é variável — e nada que ela invente entra, porque todo trecho
é conferido contra o texto do documento.

Idempotente: o SHA256 do arquivo é gravado na descrição do modelo; rodar de
novo ignora o que não mudou. Modelos entram sempre como RASCUNHO, para o
administrador conferir antes de ativar.

    python scripts/import_word_folder.py modelos/ --organization <uuid>
    python scripts/import_word_folder.py modelos/ --organization <uuid> --apply
"""

import argparse
import asyncio
import hashlib
import re
import unicodedata
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.document_model.word_autofields import propose_fields
from app.document_model.word_template import convert
from app.document_model.service import create_model, create_new_version
from app.models.document_model import DocumentModel
from app.services.ai import config_store

SLUG_PREFIX = "word-"


def slugify(name: str) -> str:
    folded = unicodedata.normalize("NFD", name.casefold())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", folded)).strip("-") or "modelo"


def label_from(path: Path) -> str:
    return re.sub(r"\s+", " ", path.stem.replace("_", " ")).strip().title()


async def load_models(db, org: uuid.UUID) -> list[DocumentModel]:
    return list((await db.execute(
        select(DocumentModel)
        .options(selectinload(DocumentModel.versions))
        .where(DocumentModel.organization_id == org,
               DocumentModel.deleted_at.is_(None))
    )).scalars().all())


def model_with_digest(models: list[DocumentModel], digest: str):
    """Modelo que já foi importado deste mesmo arquivo, em qualquer slug.

    A identidade do modelo é o CONTEÚDO do .docx, não o nome do arquivo: assim
    renomear o arquivo não cria um modelo duplicado, e os modelos importados
    antes (com slug escolhido à mão) são reconhecidos.
    """
    for model in models:
        for version in model.versions or []:
            if digest in ((version.config_json or {}).get("description") or ""):
                return model
    return None


async def process(db, org: uuid.UUID, path: Path, api_key: str, apply: bool,
                  models: list[DocumentModel]) -> None:
    label = label_from(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    slug = SLUG_PREFIX + slugify(path.stem)

    already = model_with_digest(models, digest)
    if already is not None:
        print(f"{label}: inalterado desde a última importação ({already.name})")
        return
    existing = next((m for m in models if m.slug == slug), None)

    replacements, meta = await propose_fields(path, api_key)
    config = convert(
        path, replacements, meta["purpose"],
        document_type=meta["document_type"], document_title=meta["document_title"],
    )
    config.description += f" SHA256: {digest}"

    print(f"{label}: {len(config.sections)} blocos, "
          f"{len(config.fields)} campos (IA propôs {meta['proposed']}, "
          f"{meta['accepted']} confirmados no documento)")
    for snippet, key in list(replacements.items())[:40]:
        print(f"    {key:<28} ← {snippet[:60]!r}")
    if not apply:
        return

    if existing:
        await create_new_version(db, existing.id, config,
                                 change_reason=f"Reimportação de {path.name}")
        print("  → nova versão em rascunho")
    else:
        await create_model(db, organization_id=org, slug=slug,
                           name=f"{label} — Word original", config=config)
        print("  → modelo criado em rascunho")


async def main(folder: Path, org: uuid.UUID, apply: bool) -> None:
    from app.core.database import async_session, engine

    engine.echo = False
    files = sorted(p for p in folder.glob("*.docx") if not p.name.startswith("~$"))
    if not files:
        print(f"Nenhum .docx em {folder}")
        return
    legacy = sorted(folder.glob("*.doc"))
    for old in legacy:
        print(f"{old.name}: formato antigo do Word — salve como .docx para importar")

    async with async_session() as db:
        api_key = await config_store.get_active_key(db, org)
        models = await load_models(db, org)
        for path in files:
            try:
                await process(db, org, path, api_key, apply, models)
            except Exception as exc:  # noqa: BLE001 - um arquivo ruim não para os demais
                print(f"{path.name}: FALHOU — {exc}")
        if apply:
            await db.commit()
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    parser.add_argument("--organization", required=True, type=uuid.UUID)
    parser.add_argument("--apply", action="store_true",
                        help="grava os modelos (sem isso, só mostra o que faria)")
    args = parser.parse_args()
    asyncio.run(main(args.folder, args.organization, args.apply))
