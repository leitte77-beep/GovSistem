"""Testes do modulo de interpretacao e diagramacao automatica (gazette)."""
# ruff: noqa: E501  (fixtures reproduzem documentos oficiais reais)

import pytest

from app.services.gazette import (
    build_toc_entry,
    parse_document,
    render_document,
    verify_integrity,
)
from app.services.gazette.ai_classifier import (
    ClassificationInput,
    ClassificationResult,
    ClassifiedBlock,
    DocumentStructureClassifier,
    refine_with_ai,
)
from app.services.gazette.types import BlockSource, BlockType

DECRETO = """DECRETOS

DECRETO Nº 2710/2026

SÚMULA: DECLARA A NULIDADE DOS LOTES 18, 19, 42, 55, 61 E 96 NO PREGÃO ELETRÔNICO Nº 23/2026 E DÁ OUTRAS PROVIDÊNCIAS.

O PREFEITO DO MUNICÍPIO DE FAROL, ESTADO DO PARANÁ, NO USO DAS ATRIBUIÇÕES QUE LHE CONFERE A LEI ORGÂNICA MUNICIPAL,

CONSIDERANDO o Comunicado Interno encaminhado pelo Departamento de Tecnologia da Informação;

CONSIDERANDO a reavaliação técnica das necessidades administrativas;

DECRETA:

Art. 1º - Fica declarada a nulidade dos Lotes 18, 19, 42, 55, 61 e 96.

Art. 2º - Ficam sem efeito os atos subsequentes.

Paço Municipal “José Semiguem”
Farol, 13 de julho de 2026.

OCLÉCIO DE FREITAS MENESES
Prefeito Municipal"""

PORTARIA = """PORTARIA Nº 145/2026

SÚMULA: CONCEDE FÉRIAS REGULAMENTARES À SERVIDORA MUNICIPAL.

O PREFEITO DO MUNICÍPIO DE FAROL, ESTADO DO PARANÁ, NO USO DE SUAS ATRIBUIÇÕES LEGAIS,

RESOLVE:

Art. 1º - Conceder 30 (trinta) dias de férias à servidora MARIA DA SILVA, matrícula 1234.

Art. 2º - Esta Portaria entra em vigor na data de sua publicação.

Farol, 10 de julho de 2026.

OCLÉCIO DE FREITAS MENESES
Prefeito Municipal"""

COMPRAS = """LICITAÇÕES

TERMO DE ADJUDICAÇÃO, HOMOLOGAÇÃO E RATIFICAÇÃO
DE INEXIGIBILIDADE DE LICITAÇÃO

PROCESSO ADMINISTRATIVO Nº 87/2026

Torna-se pública a ratificação do processo de inexigibilidade de licitação para contratação da empresa abaixo.

AUTO POSTO FAROL LTDA - CNPJ 12.345.678/0001-90

Item\tUnid.\tQtd.\tDescrição\tValor Unitário\tValor Total
1\tUN\t10\tServiço de manutenção\tR$ 150,00\tR$ 1.500,00
2\tUN\t5\tPeças de reposição\tR$ 200,00\tR$ 1.000,00

VALOR TOTAL: R$ 2.500,00

Farol, 12 de julho de 2026.

OCLÉCIO DE FREITAS MENESES
Prefeito Municipal"""

EXTRATO = """EXTRATO DE TERMO ADITIVO Nº 2/2026

CONTRATO Nº 45/2025

Contratante: MUNICÍPIO DE FAROL
Beneficiário: EMPRESA DE SERVIÇOS GERAIS LTDA
Objeto: Prorrogação do prazo de vigência do contrato original.
Fundamentação Legal: Art. 107 da Lei nº 14.133/2021.
Vigência: 12 (doze) meses a partir de 01/08/2026.
Pagamento: Conforme cronograma físico-financeiro.
Data da Assinatura: 10/07/2026"""

RESCISAO = """RESCISÃO CONTRATUAL

EXTRATO DE RESCISÃO DO CONTRATO Nº 12/2025

Partícipes: MUNICÍPIO DE FAROL e EMPRESA XYZ LTDA
Objeto: Rescisão amigável do contrato de prestação de serviços.
Data de rescisão: 30/06/2026

Farol, 01 de julho de 2026.

OCLÉCIO DE FREITAS MENESES
Prefeito Municipal"""

WORD_HTML = """
<html xmlns:o="urn:schemas-microsoft-com:office:office">
<head><style>p.MsoNormal { margin: 0 }</style></head>
<body>
<p class="MsoNormal" style="mso-margin-top-alt:auto">DECRETO Nº 99/2026</p>
<p class="MsoNormal">SÚMULA: ABRE CRÉDITO ADICIONAL SUPLEMENTAR.</p>
<script>alert('xss')</script>
<p onclick="hack()">O PREFEITO DO MUNICÍPIO DE FAROL, NO USO DE SUAS ATRIBUIÇÕES,</p>
<p>DECRETA:</p>
<p>Art. 1º - Fica aberto crédito adicional de <b>R$ 50.000,00</b>.</p>
<table border="1"><tbody>
<tr><td>Dotação</td><td>Valor</td></tr>
<tr><td>3.3.90.39</td><td>R$ 50.000,00</td></tr>
</tbody></table>
<p>Farol, 13 de julho de 2026.</p>
<p>OCLÉCIO DE FREITAS MENESES</p>
<p>Prefeito Municipal</p>
</body></html>
"""


def _types(document):
    return [b.type for b in document.iter_blocks()]


# ------------------------------------------------------------------
# Teste 1 — Decreto
# ------------------------------------------------------------------
class TestDecreto:
    def setup_method(self):
        self.doc = parse_document(plain_text=DECRETO)
        self.types = _types(self.doc)

    def test_estrutura_completa(self):
        assert self.types[:4] == [
            BlockType.CATEGORY,
            BlockType.DOCUMENT_TITLE,
            BlockType.SUMMARY,
            BlockType.PREAMBLE,
        ]
        assert self.types.count(BlockType.CONSIDERATION) == 2
        assert BlockType.COMMAND in self.types
        assert self.types.count(BlockType.ARTICLE) == 2
        assert BlockType.LOCATION in self.types
        assert BlockType.DATE in self.types
        assert BlockType.SIGNATURE_NAME in self.types
        assert BlockType.SIGNATURE_ROLE in self.types

    def test_tipo_e_template(self):
        assert self.doc.document_type == "decree"
        assert self.doc.template == "normative-act"
        assert self.doc.category == "DECRETOS"
        assert self.doc.title == "DECRETO Nº 2710/2026"

    def test_texto_original_preservado(self):
        artigo = next(
            b for b in self.doc.iter_blocks() if b.type == BlockType.ARTICLE
        )
        assert artigo.original_text == (
            "Art. 1º - Fica declarada a nulidade dos Lotes 18, 19, 42, 55, 61 e 96."
        )
        assert artigo.metadata["number"] == "1"

    def test_renderizacao_e_classes(self):
        html = render_document(self.doc)
        for cls in (
            "gazette-category", "gazette-document-title", "gazette-summary",
            "gazette-preamble", "gazette-consideration", "gazette-command",
            "gazette-article", "gazette-closing", "gazette-signature",
        ):
            assert cls in html

    def test_integridade_e_sumario(self):
        html = render_document(self.doc)
        assert verify_integrity(self.doc, html).ok
        toc = build_toc_entry(self.doc)
        assert toc.category == "DECRETOS"
        assert toc.table_of_contents_title == "DECRETO Nº 2710/2026"
        assert toc.anchor_id == "decreto-no-2710-2026"


# ------------------------------------------------------------------
# Teste 2 — Portaria
# ------------------------------------------------------------------
class TestPortaria:
    def setup_method(self):
        self.doc = parse_document(plain_text=PORTARIA)
        self.types = _types(self.doc)

    def test_estrutura(self):
        assert BlockType.DOCUMENT_TITLE in self.types
        assert BlockType.SUMMARY in self.types
        assert BlockType.COMMAND in self.types
        assert self.types.count(BlockType.ARTICLE) == 2
        assert BlockType.SIGNATURE_NAME in self.types
        assert BlockType.SIGNATURE_ROLE in self.types

    def test_tipo(self):
        assert self.doc.document_type == "ordinance"
        assert self.doc.template == "normative-act"


# ------------------------------------------------------------------
# Teste 3 — Processo de compras
# ------------------------------------------------------------------
class TestProcessoCompras:
    def setup_method(self):
        self.doc = parse_document(plain_text=COMPRAS)
        self.types = _types(self.doc)

    def test_titulo_em_duas_linhas(self):
        titulo = next(
            b for b in self.doc.iter_blocks() if b.type == BlockType.DOCUMENT_TITLE
        )
        assert "\n" in titulo.original_text  # apresentacao preservada
        toc = build_toc_entry(self.doc)
        assert toc.table_of_contents_title == (
            "TERMO DE ADJUDICAÇÃO, HOMOLOGAÇÃO E RATIFICAÇÃO "
            "DE INEXIGIBILIDADE DE LICITAÇÃO"
        )

    def test_empresa_tabela_valor_assinatura(self):
        assert BlockType.COMPANY_INFORMATION in self.types
        assert BlockType.TABLE in self.types
        assert BlockType.TOTAL_VALUE in self.types
        assert BlockType.SIGNATURE_NAME in self.types

    def test_tabela_reconstruida_do_texto(self):
        tabela = next(
            b for b in self.doc.iter_blocks() if b.type == BlockType.TABLE
        )
        assert "R$ 1.500,00" in tabela.original_text
        assert "<table" in tabela.metadata["html"]

    def test_template(self):
        assert self.doc.document_type == "adjudication"
        assert self.doc.template == "procurement"

    def test_integridade(self):
        html = render_document(self.doc)
        assert verify_integrity(self.doc, html).ok


# ------------------------------------------------------------------
# Teste 4 — Extrato em campos
# ------------------------------------------------------------------
class TestExtrato:
    def setup_method(self):
        self.doc = parse_document(plain_text=EXTRATO)
        self.fields = [
            b for b in self.doc.iter_blocks() if b.type == BlockType.FIELD
        ]

    def test_campos(self):
        labels = {f.metadata["label"] for f in self.fields}
        assert {
            "Contratante", "Beneficiário", "Objeto",
            "Fundamentação Legal", "Vigência", "Pagamento", "Data da Assinatura",
        } <= labels

    def test_valores_dos_campos(self):
        contratante = next(
            f for f in self.fields if f.metadata["label"] == "Contratante"
        )
        assert contratante.metadata["value"] == "MUNICÍPIO DE FAROL"

    def test_tipo_e_template(self):
        assert self.doc.document_type == "amendment_extract"
        assert self.doc.template == "extract-fields"

    def test_renderizacao_rotulo_negrito(self):
        html = render_document(self.doc)
        assert '<p class="gazette-field"><strong>Contratante:</strong>' in html


# ------------------------------------------------------------------
# Teste 5 — Rescisao em quadro
# ------------------------------------------------------------------
class TestRescisao:
    def setup_method(self):
        self.doc = parse_document(plain_text=RESCISAO)
        self.types = _types(self.doc)

    def test_estrutura(self):
        assert BlockType.DOCUMENT_TITLE in self.types
        labels = {
            b.metadata.get("label")
            for b in self.doc.iter_blocks()
            if b.type == BlockType.FIELD
        }
        assert {"Partícipes", "Objeto", "Data de rescisão"} <= labels
        assert BlockType.DATE in self.types
        assert BlockType.SIGNATURE_NAME in self.types

    def test_template_quadro(self):
        assert self.doc.document_type == "termination_extract"
        assert self.doc.template == "admin-board"


# ------------------------------------------------------------------
# Teste 6 — Conteudo desconhecido
# ------------------------------------------------------------------
class TestConteudoDesconhecido:
    def setup_method(self):
        self.texto = (
            "Comunicamos aos interessados que o expediente da repartição "
            "será alterado.\n\nO atendimento ao público ocorrerá das 8h às 13h.\n\n"
            "Mais informações pelo telefone 44 3559-1122."
        )
        self.doc = parse_document(plain_text=self.texto)

    def test_nenhum_trecho_descartado(self):
        blocos = " ".join(
            b.original_text for b in self.doc.iter_blocks()
        )
        for palavra in ("Comunicamos", "expediente", "8h", "3559-1122"):
            assert palavra in blocos

    def test_template_generico_e_aviso(self):
        assert self.doc.template == "generic"
        assert any("Título" in w for w in self.doc.warnings)
        html = render_document(self.doc)
        assert verify_integrity(self.doc, html).ok


# ------------------------------------------------------------------
# Teste 7 — Integridade detecta alteracao
# ------------------------------------------------------------------
class TestIntegridade:
    def test_alteracao_de_numero_detectada(self):
        doc = parse_document(plain_text=DECRETO)
        artigo = next(
            b for b in doc.iter_blocks() if b.type == BlockType.ARTICLE
        )
        # Altera propositalmente um numero no bloco classificado.
        artigo.original_text = artigo.original_text.replace("96", "97")
        html = render_document(doc)
        report = verify_integrity(doc, html)
        assert not report.ok
        assert "96." in report.missing
        assert "97." in report.added

    def test_remocao_de_bloco_detectada(self):
        doc = parse_document(plain_text=DECRETO)
        doc.blocks = [b for b in doc.blocks if b.type != BlockType.ARTICLE]
        html = render_document(doc)
        assert not verify_integrity(doc, html).ok


# ------------------------------------------------------------------
# Teste 8 — Colagem do Word
# ------------------------------------------------------------------
class TestColagemWord:
    def setup_method(self):
        self.doc = parse_document(source_html=WORD_HTML)
        self.types = _types(self.doc)

    def test_tags_inseguras_removidas(self):
        assert "<script" not in (self.doc.source_html or "")
        assert "onclick" not in (self.doc.source_html or "")
        html = render_document(self.doc)
        assert "<script" not in html
        assert "alert(" not in html

    def test_estrutura_reconhecida(self):
        assert BlockType.DOCUMENT_TITLE in self.types
        assert BlockType.SUMMARY in self.types
        assert BlockType.COMMAND in self.types
        assert BlockType.ARTICLE in self.types
        assert BlockType.SIGNATURE_NAME in self.types

    def test_tabela_do_word_preservada(self):
        tabela = next(
            b for b in self.doc.iter_blocks() if b.type == BlockType.TABLE
        )
        assert tabela.source == BlockSource.HTML
        assert "3.3.90.39" in tabela.original_text
        html = render_document(self.doc)
        assert "gazette-table" in html
        assert "R$ 50.000,00" in html

    def test_conteudo_preservado(self):
        artigo = next(
            b for b in self.doc.iter_blocks() if b.type == BlockType.ARTICLE
        )
        assert "R$ 50.000,00" in artigo.original_text


# ------------------------------------------------------------------
# Teste 9 — Continuidade (blocos em varias linhas)
# ------------------------------------------------------------------
class TestContinuidade:
    def test_sumula_em_varias_linhas(self):
        texto = (
            "PORTARIA Nº 10/2026\n\n"
            "SÚMULA: dispõe sobre a concessão de diárias\n"
            "e dá outras providências correlatas\n"
            "no âmbito do Poder Executivo.\n\n"
            "RESOLVE:\n\n"
            "Art. 1º - Ficam aprovadas as diárias."
        )
        doc = parse_document(plain_text=texto)
        sumula = next(
            b for b in doc.iter_blocks() if b.type == BlockType.SUMMARY
        )
        assert "diárias" in sumula.original_text
        assert "Poder Executivo." in sumula.original_text

    def test_artigo_em_varias_linhas(self):
        texto = (
            "PORTARIA Nº 11/2026\n\n"
            "RESOLVE:\n\n"
            "Art. 1º - Fica autorizada a contratação\n"
            "de pessoal por prazo determinado,\n"
            "nos termos da legislação vigente."
        )
        doc = parse_document(plain_text=texto)
        artigo = next(
            b for b in doc.iter_blocks() if b.type == BlockType.ARTICLE
        )
        assert artigo.original_text.endswith("vigente.")

    def test_titulo_em_varias_linhas(self):
        doc = parse_document(plain_text=COMPRAS)
        titulo = next(
            b for b in doc.iter_blocks() if b.type == BlockType.DOCUMENT_TITLE
        )
        assert titulo.original_text.count("\n") == 1

    def test_incisos_e_alineas_aninhados(self):
        texto = (
            "DECRETO Nº 5/2026\n\n"
            "DECRETA:\n\n"
            "Art. 1º - Ficam definidos os seguintes critérios:\n"
            "I - primeiro critério;\n"
            "II - segundo critério:\n"
            "a) primeira alínea;\n"
            "b) segunda alínea.\n\n"
            "§ 1º - As exceções serão avaliadas."
        )
        doc = parse_document(plain_text=texto)
        artigo = next(
            b for b in doc.iter_blocks() if b.type == BlockType.ARTICLE
        )
        filhos = [c.type for c in artigo.children]
        assert BlockType.SUBSECTION in filhos
        assert BlockType.PARAGRAPH in filhos
        inciso2 = [c for c in artigo.children if c.type == BlockType.SUBSECTION][-1]
        assert [c.type for c in inciso2.children] == [
            BlockType.LETTER_ITEM, BlockType.LETTER_ITEM,
        ]


# ------------------------------------------------------------------
# IA — validacao rigorosa do fallback
# ------------------------------------------------------------------
class _FakeClassifier(DocumentStructureClassifier):
    def __init__(self, result: ClassificationResult):
        self.result = result
        self.received: ClassificationInput | None = None

    async def classify(self, payload: ClassificationInput) -> ClassificationResult:
        self.received = payload
        return self.result


class TestClassificadorIA:
    @pytest.mark.asyncio
    async def test_ia_nao_pode_alterar_texto(self):
        doc = parse_document(
            plain_text="Texto livre sem estrutura conhecida qualquer."
        )
        alvo = next(iter(doc.iter_blocks()))
        fake = _FakeClassifier(
            ClassificationResult(
                blocks=[
                    ClassifiedBlock(
                        id=alvo.id,
                        type="notice",
                        original_text="TEXTO ALTERADO PELA IA",
                        confidence=0.9,
                    )
                ]
            )
        )
        refined = await refine_with_ai(doc, classifier=fake)
        bloco = next(iter(refined.iter_blocks()))
        assert bloco.source != BlockSource.AI  # resposta rejeitada
        assert bloco.original_text == "Texto livre sem estrutura conhecida qualquer."

    @pytest.mark.asyncio
    async def test_ia_classificacao_valida_aplicada(self):
        doc = parse_document(
            plain_text="Comunicado importante sobre o expediente municipal."
        )
        alvo = next(iter(doc.iter_blocks()))
        fake = _FakeClassifier(
            ClassificationResult(
                blocks=[
                    ClassifiedBlock(
                        id=alvo.id,
                        type="notice",
                        original_text=alvo.original_text,
                        confidence=0.88,
                    )
                ]
            )
        )
        refined = await refine_with_ai(doc, classifier=fake)
        bloco = next(iter(refined.iter_blocks()))
        assert bloco.type == BlockType.NOTICE
        assert bloco.source == BlockSource.AI
        assert bloco.confidence == 0.88

    @pytest.mark.asyncio
    async def test_ia_somente_blocos_ambiguos(self):
        doc = parse_document(plain_text=DECRETO)
        fake = _FakeClassifier(ClassificationResult())
        await refine_with_ai(doc, classifier=fake)
        # Decreto totalmente classificado por regras: IA nao e chamada.
        assert fake.received is None

    @pytest.mark.asyncio
    async def test_ia_unknown_rejeitado(self):
        doc = parse_document(plain_text="Linha genérica de conteúdo qualquer.")
        alvo = next(iter(doc.iter_blocks()))
        fake = _FakeClassifier(
            ClassificationResult(
                blocks=[
                    ClassifiedBlock(
                        id=alvo.id,
                        type="unknown",
                        original_text=alvo.original_text,
                        confidence=0.3,
                    )
                ]
            )
        )
        refined = await refine_with_ai(doc, classifier=fake)
        bloco = next(iter(refined.iter_blocks()))
        assert bloco.source == BlockSource.FALLBACK
