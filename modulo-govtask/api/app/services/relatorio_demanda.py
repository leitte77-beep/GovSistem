"""Relatório completo da Demanda em PDF (§90) e resumo executivo (§91).

O PDF é gerado no servidor, a partir dos dados já autorizados: imprimir a tela
web traria o menu, o sino e o que o usuário não deveria ver no papel. O layout é
de documento (§141), não captura de interface.
"""

import io
from datetime import datetime, timezone
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

CINZA = colors.HexColor("#4b5563")
BORDA = colors.HexColor("#d1d5db")
FUNDO_CABECALHO = colors.HexColor("#f3f4f6")


def _estilos() -> dict:
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "TituloGov",
            parent=base["Title"],
            fontSize=16,
            leading=20,
            alignment=TA_CENTER,
        ),
        "subtitulo": ParagraphStyle(
            "SubtituloGov",
            parent=base["Normal"],
            fontSize=10,
            leading=13,
            textColor=CINZA,
            alignment=TA_CENTER,
        ),
        "secao": ParagraphStyle(
            "SecaoGov",
            parent=base["Heading2"],
            fontSize=12,
            leading=15,
            spaceBefore=10,
            spaceAfter=4,
        ),
        "corpo": ParagraphStyle(
            "CorpoGov", parent=base["Normal"], fontSize=9, leading=12
        ),
        "rodape": ParagraphStyle(
            "RodapeGov",
            parent=base["Normal"],
            fontSize=7.5,
            leading=9,
            textColor=CINZA,
        ),
    }


def _data(valor) -> str:
    if valor is None:
        return "—"
    if isinstance(valor, datetime):
        return valor.strftime("%d/%m/%Y %H:%M")
    return valor.strftime("%d/%m/%Y")


def _dinheiro(valor) -> str:
    if valor is None:
        return "—"
    texto = f"{Decimal(valor):,.2f}"
    # pt-BR: milhar com ponto, decimal com vírgula.
    return "R$ " + texto.replace(",", "·").replace(".", ",").replace("·", ".")


def _tabela(linhas: list[list[str]], estilos: dict, larguras=None) -> Table:
    dados = [
        [
            Paragraph(str(celula), estilos["corpo"]) if not isinstance(celula, Paragraph) else celula
            for celula in linha
        ]
        for linha in linhas
    ]
    tabela = Table(dados, colWidths=larguras, hAlign="LEFT")
    tabela.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, BORDA),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (0, -1), FUNDO_CABECALHO),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return tabela


def montar_resumo_executivo(dados: dict) -> str:
    """Texto corrido do andamento, montado a partir dos fatos (§91).

    É determinístico de propósito: nada de IA gerando afirmação que ninguém
    conferiu. A camada de IA, quando existir, propõe um texto e alguém aprova.
    """
    d = dados["demanda"]
    partes: list[str] = []
    abertura = f"Demanda {d['numero']} — {d['titulo']}"
    if d.get("data_solicitacao") or d.get("criada_em"):
        abertura += f", iniciada em {d.get('data_solicitacao') or d.get('criada_em')}"
    if d.get("origem_descricao"):
        abertura += f", a partir de: {d['origem_descricao']}"
    elif d.get("origem"):
        abertura += f", com origem em {d['origem']}"
    partes.append(abertura + ".")

    if d.get("autoridade"):
        partes.append(f"Autoridade relacionada: {d['autoridade']}.")
    if d.get("valor_aprovado"):
        partes.append(f"Valor aprovado de {d['valor_aprovado']}.")

    protocolos = dados.get("protocolos") or []
    if protocolos:
        ultimo = protocolos[-1]
        partes.append(
            f"Protocolada em {ultimo['sistema']} sob o nº {ultimo['numero']}, "
            f"atualmente {ultimo['situacao']}."
        )

    abertas = dados.get("tarefas_abertas", 0)
    if abertas:
        partes.append(f"Restam {abertas} tarefa(s) em aberto.")
    if d.get("bloqueada"):
        partes.append(f"Está bloqueada: {d.get('bloqueio_motivo')}.")
    elif d.get("aguardando_terceiro"):
        partes.append(f"Aguarda retorno de {d['aguardando_terceiro']}.")
    if d.get("proxima_acao"):
        partes.append(f"Próxima ação: {d['proxima_acao']}.")
    if d.get("concluida_em"):
        partes.append(
            f"Concluída em {d['concluida_em']}"
            + (f": {d['resultado_final']}." if d.get("resultado_final") else ".")
        )
    return " ".join(partes)


def gerar_pdf(dados: dict, organizacao: str, gerado_por: str) -> bytes:
    """Monta o PDF do relatório a partir do dicionário já autorizado."""
    estilos = _estilos()
    buffer = io.BytesIO()
    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Relatório da demanda {dados['demanda']['numero']}",
        author=organizacao,
    )
    d = dados["demanda"]
    fluxo = []

    # ── Capa ──────────────────────────────────────────────
    fluxo += [
        Paragraph(organizacao, estilos["subtitulo"]),
        Spacer(1, 6 * mm),
        Paragraph("RELATÓRIO DE DEMANDA", estilos["titulo"]),
        Paragraph(d["numero"], estilos["titulo"]),
        Spacer(1, 4 * mm),
        Paragraph(d["titulo"], estilos["subtitulo"]),
        Spacer(1, 10 * mm),
        _tabela(
            [
                ["Situação", d.get("status") or "—"],
                ["Prioridade", d.get("prioridade") or "—"],
                ["Progresso", f"{d.get('progresso', 0)}%"],
                ["Responsável geral", d.get("responsavel_geral") or "—"],
                ["Setor atual", d.get("setor_atual") or "—"],
                ["Prazo final", d.get("prazo_final") or "—"],
                ["Última movimentação", d.get("ultima_movimentacao") or "—"],
            ],
            estilos,
            larguras=[45 * mm, None],
        ),
        Spacer(1, 8 * mm),
        Paragraph("Resumo executivo", estilos["secao"]),
        Paragraph(dados["resumo_executivo"], estilos["corpo"]),
        PageBreak(),
    ]

    # ── Dados da demanda ──────────────────────────────────
    fluxo += [
        Paragraph("1. Dados da demanda", estilos["secao"]),
        _tabela(
            [
                ["Tipo", d.get("tipo") or "—"],
                ["Categoria", d.get("categoria") or "—"],
                ["Objeto", d.get("objeto") or "—"],
                ["Descrição", d.get("descricao") or "—"],
                ["Origem", d.get("origem") or "—"],
                ["Descrição da origem", d.get("origem_descricao") or "—"],
                ["Autoridade", d.get("autoridade") or "—"],
                ["Solicitante", d.get("solicitante") or "—"],
                ["Data da solicitação", d.get("data_solicitacao") or "—"],
                ["Confidencialidade", d.get("confidencialidade") or "—"],
                ["Tags", ", ".join(d.get("tags") or []) or "—"],
            ],
            estilos,
            larguras=[45 * mm, None],
        ),
        Spacer(1, 4 * mm),
    ]

    # ── Participantes ─────────────────────────────────────
    fluxo.append(Paragraph("2. Participantes", estilos["secao"]))
    participantes = dados.get("participantes") or []
    if participantes:
        fluxo.append(
            _tabela(
                [["Papel", "Pessoa", "Setor"]]
                + [
                    [p.get("papel") or "—", p.get("nome") or "—", p.get("setor") or "—"]
                    for p in participantes
                ],
                estilos,
            )
        )
    else:
        fluxo.append(Paragraph("Nenhum participante além dos responsáveis.", estilos["corpo"]))

    # ── Financeiro ────────────────────────────────────────
    fluxo += [Spacer(1, 4 * mm), Paragraph("3. Financeiro", estilos["secao"])]
    f = dados.get("financeiro") or {}
    fluxo.append(
        _tabela(
            [
                ["Valor previsto", f.get("valor_previsto") or "—"],
                ["Valor aprovado", f.get("valor_aprovado") or "—"],
                ["Contrapartida", f.get("valor_contrapartida") or "—"],
                ["Valor licitado", f.get("valor_licitado") or "—"],
                ["Valor contratado", f.get("valor_contratado") or "—"],
                ["Empenhado", f.get("valor_empenhado") or "—"],
                ["Liquidado", f.get("valor_liquidado") or "—"],
                ["Pago", f.get("valor_pago") or "—"],
                ["Saldo", f.get("saldo") or "—"],
                ["Fonte do recurso", f.get("fonte_recurso") or "—"],
                ["Órgão concedente", f.get("orgao_concedente") or "—"],
            ],
            estilos,
            larguras=[45 * mm, None],
        )
    )

    # ── Tarefas ───────────────────────────────────────────
    fluxo += [Spacer(1, 4 * mm), Paragraph("4. Tarefas", estilos["secao"])]
    tarefas = dados.get("tarefas") or []
    if tarefas:
        fluxo.append(
            _tabela(
                [["Tarefa", "Responsável", "Situação", "Prazo"]]
                + [
                    [
                        t.get("titulo") or "—",
                        t.get("responsavel") or "—",
                        t.get("status") or "—",
                        t.get("prazo") or "—",
                    ]
                    for t in tarefas
                ],
                estilos,
                larguras=[None, 35 * mm, 28 * mm, 25 * mm],
            )
        )
    else:
        fluxo.append(Paragraph("Nenhuma tarefa registrada.", estilos["corpo"]))

    # ── Checklists ────────────────────────────────────────
    checklists = dados.get("checklists") or []
    if checklists:
        fluxo += [Spacer(1, 4 * mm), Paragraph("5. Checklists", estilos["secao"])]
        for checklist in checklists:
            bloco = [
                Paragraph(
                    f"<b>{checklist['titulo']}</b> — "
                    f"{checklist['concluidos']} de {checklist['total']} completos",
                    estilos["corpo"],
                ),
                _tabela(
                    [["Item", "Situação", "Concluído por"]]
                    + [
                        [
                            i.get("descricao") or "—",
                            "Concluído" if i.get("concluido_em") else "Pendente",
                            i.get("concluido_por") or "—",
                        ]
                        for i in checklist.get("itens", [])
                    ],
                    estilos,
                    larguras=[None, 25 * mm, 35 * mm],
                ),
                Spacer(1, 3 * mm),
            ]
            fluxo.append(KeepTogether(bloco))

    # ── Documentos ────────────────────────────────────────
    fluxo += [Spacer(1, 4 * mm), Paragraph("6. Documentos", estilos["secao"])]
    documentos = dados.get("documentos") or []
    if documentos:
        fluxo.append(
            _tabela(
                [["Documento", "Versão", "Pasta", "Enviado em", "Hash (SHA-256)"]]
                + [
                    [
                        doc.get("nome") or "—",
                        str(doc.get("versao") or "—"),
                        doc.get("pasta") or "—",
                        doc.get("enviado_em") or "—",
                        Paragraph(
                            f"<font size=6>{(doc.get('hash') or '—')[:32]}…</font>",
                            estilos["corpo"],
                        ),
                    ]
                    for doc in documentos
                ],
                estilos,
                larguras=[None, 14 * mm, 25 * mm, 25 * mm, 32 * mm],
            )
        )
    else:
        fluxo.append(Paragraph("Nenhum documento anexado.", estilos["corpo"]))

    # ── Protocolos ────────────────────────────────────────
    fluxo += [Spacer(1, 4 * mm), Paragraph("7. Protocolos externos", estilos["secao"])]
    protocolos = dados.get("protocolos") or []
    if protocolos:
        fluxo.append(
            _tabela(
                [["Sistema", "Número", "Órgão", "Data", "Situação"]]
                + [
                    [
                        p.get("sistema") or "—",
                        p.get("numero") or "—",
                        p.get("orgao") or "—",
                        p.get("data") or "—",
                        p.get("situacao") or "—",
                    ]
                    for p in protocolos
                ],
                estilos,
            )
        )
    else:
        fluxo.append(Paragraph("Nenhum protocolo registrado.", estilos["corpo"]))

    # ── Timeline ──────────────────────────────────────────
    fluxo += [
        PageBreak(),
        Paragraph("8. Histórico completo", estilos["secao"]),
        Paragraph(
            "Registro cronológico e imutável. Correções aparecem como novos "
            "eventos, nunca como alteração do que já foi registrado.",
            estilos["corpo"],
        ),
        Spacer(1, 3 * mm),
    ]
    eventos = dados.get("timeline") or []
    if eventos:
        fluxo.append(
            _tabela(
                [["Quando", "Quem", "O que aconteceu"]]
                + [
                    [e.get("quando") or "—", e.get("ator") or "Sistema", e.get("descricao") or "—"]
                    for e in eventos
                ],
                estilos,
                larguras=[30 * mm, 35 * mm, None],
            )
        )
    else:
        fluxo.append(Paragraph("Sem eventos registrados.", estilos["corpo"]))

    # ── Encerramento ──────────────────────────────────────
    if d.get("concluida_em"):
        fluxo += [
            Spacer(1, 5 * mm),
            Paragraph("9. Termo de conclusão", estilos["secao"]),
            _tabela(
                [
                    ["Concluída em", d.get("concluida_em") or "—"],
                    ["Resultado", d.get("resultado_final") or "—"],
                    ["Valor executado", f.get("valor_executado") or "—"],
                    ["Observações", d.get("observacoes") or "—"],
                ],
                estilos,
                larguras=[45 * mm, None],
            ),
        ]

    emitido = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")

    def rodape(canvas, doc_atual):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(CINZA)
        canvas.drawString(
            18 * mm,
            10 * mm,
            f"{organizacao} · GovTask · emitido em {emitido} por {gerado_por}",
        )
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"pág. {doc_atual.page}")
        canvas.restoreState()

    documento.build(fluxo, onFirstPage=rodape, onLaterPages=rodape)
    return buffer.getvalue()
