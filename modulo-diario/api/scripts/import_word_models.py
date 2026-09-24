"""Import the supplied Word models as separate drafts, without changing active versions."""
import argparse
import asyncio
import hashlib
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.database import async_session, engine
from app.document_model.word_template import convert
from app.document_model.service import create_model, create_new_version
from app.models.document_model import DocumentModel

CATALOG = [
    ("PORTARIA EXONERAÇÃO.docx", "exoneracao", "Exoneração", {
        "258/2025": "numero_ano", "ERICO LUIZ DE OLIVEIRA CALDEIRA": "nome_servidor",
        "6003456": "matricula", "ENGENHEIRO CIVIL": "cargo", "1146": "numero_protocolo",
        "02/12/2025": "data_protocolo", "01 de janeiro de 2026": "data_inicio_extenso",
        "29 de dezembro de 2025": "data_ato_extenso", "a pedido": "modalidade_exoneracao",
        "efetivo": "regime_provimento",
    }),
    ("PORTARIA FERIAS.docx", "ferias", "Férias", {
        "261/2025": "numero_ano", "ROSELI APARECIDA MENDES": "nome_servidor",
        "1724015": "matricula", "ZELADOR": "cargo", "30(trinta)": "dias_com_extenso",
        "16/03/2024": "inicio_aquisitivo", "15/03/2025": "fim_aquisitivo",
        "01/01/2026": "inicio_gozo", "30/01/2026": "fim_gozo",
        "29 de dezembro de 2025": "data_ato_extenso",
    }),
    ("PORTARIA DE NOMEAÇÃO.docx", "nomeacao", "Nomeação", {
        "206/2026": "numero_ano", "JOÃO MARCOS BUENO CORDEIRO": "nome_servidor",
        "117.***.939-**": "cpf", "ASSESSOR VIII": "cargo",
        "SECRETARIA DE ADMINISTRAÇÃO E PLANEJAMENTO": "secretaria",
        "CC-10-Z": "simbolo", "17 de agosto de 2026": "data_inicio_extenso",
        "14 de agosto de 2026": "data_ato_extenso",
    }),
    # O aviso é publicado como quadro: o .docx inteiro é uma tabela.
    ("AVISO DE DISPENSA.docx", "aviso-dispensa", "Aviso de Dispensa", {
        "125/2026": "numero_processo", "47/2026": "numero_procedimento",
        "dispensa por limite (art. 75, II)": "modalidade",
        "Locação, montagem e desmontagem de pavilhão móvel tipo galpão, "
        "medindo 10m x 65m e serviços afins.": "objeto",
        "R$ 60.000,00": "valor_total_estimado",
        "Recursos próprios livres": "fonte_recurso",
        "Tradicional (Contrato)": "caracteristica",
        "Menor preço": "criterio_julgamento", "por item": "adjudicacao",
        "Eletrônico (via email)": "metodo_realizacao",
        "08h55": "hora_abertura", "11/09/2026": "data_abertura",
        "03 de setembro de 2026": "data_ato_extenso",
        "DOUGLAS JOSE LAQUIAS": "nome_responsavel",
        "SECRETARIO DE ADMINISTRAÇÃO E PLANEJAMENTO": "cargo_responsavel",
    }, {"document_type": "licitacao",
        "document_title": "AVISO DE DISPENSA DE LICITAÇÃO Nº {{numero_procedimento}}"}),
    ("homologação dispensa.docx", "homologacao-dispensa",
     "Homologação de Dispensa", {
        "124/2026": "numero_processo", "46/2026": "numero_dispensa",
        "art. 75, II": "fundamento_legal",
        "DIRCEU BATISTA RIBEIRO SERVICOS LTDA": "empresa",
        "ROD PR 090 / KM 143 / RANCHO LETS GO - SE / ASSAÍ / PR / CEP 86220-000":
            "endereco_empresa",
        "43.250.710/0001-82": "cnpj_empresa",
        "Prestação de serviços de mini fazendinha (exposição com mini animais) "
        "durante a realização da Feira Agropecuária e Industrial de Farol "
        "(EXPOFAR). Sendo: 01 Cabrito Zebu, 01 Carneiro das Montanhas, 01 casal "
        "Mini Horse, 01 casal Mini Burro, Mini Jumento, 02 casais Mini Boi, 01 "
        "casal Mini Cabra, num total de 13 (treze) animais. Para os dias 18 a 20 "
        "de setembro de 2026.": "objeto",
        # O mesmo valor aparece em três formas; vence sempre a mais longa.
        "7.000,00": "valor_unitario", "R$ 7.000,00": "valor_total",
        "R$7.000,00 (Sete Mil Reais)": "valor_total_extenso",
        "03 de setembro de 2026": "data_ato_extenso",
        "OCLECIO DE FREITAS MENESES": "nome_autoridade",
        "Prefeito Municipal": "cargo_autoridade",
     }, {"document_type": "licitacao",
         "document_title": "TERMO DE ADJUDICAÇÃO, HOMOLOGAÇÃO E RATIFICAÇÃO "
                           "DE DISPENSA DE LICITAÇÃO Nº {{numero_dispensa}}"}),
]


async def main(root, org):
    engine.echo = False
    async with async_session() as db:
        for entry in CATALOG:
            filename, slug, label, replacements = entry[:4]
            options = entry[4] if len(entry) > 4 else {}
            path = root / filename
            cfg = convert(path, replacements, label, **options)
            # Um valor do catálogo que não casa com o texto do .docx não vira
            # campo — e o modelo sairia com o dado da referência fixo no lugar
            # de um marcador. Falha silenciosa: avisar é obrigatório.
            missing = sorted(set(replacements.values()) - {f.key for f in cfg.fields})
            if missing:
                print(f"  ATENÇÃO — {label}: não encontrei no documento o texto de "
                      f"{', '.join(missing)}; esses campos ficaram fixos.")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            cfg.description += f" SHA256: {digest}"
            existing = (await db.execute(select(DocumentModel).where(
                DocumentModel.organization_id == org, DocumentModel.slug == "word-" + slug,
                DocumentModel.deleted_at.is_(None),
            ))).scalar_one_or_none()
            if existing and any(v.config_hash == cfg.canonical_hash() for v in existing.versions):
                print(label, "já importado")
                continue
            if existing:
                await create_new_version(db, existing.id, cfg, change_reason="Atualização da referência Word")
            else:
                await create_model(db, organization_id=org, slug="word-" + slug,
                                   name=label + " — Word original", config=cfg)
            print(label, len(cfg.sections), "parágrafos", len(cfg.fields), "campos")
        await db.commit()
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--organization", required=True, type=uuid.UUID)
    args = parser.parse_args()
    asyncio.run(main(args.root, args.organization))
