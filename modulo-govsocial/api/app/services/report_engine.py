"""Engine de execucao de relatorios customizaveis (Fases 3.17-3.18).

Suporta:
- Execucao de SQL parametrizado com filtros
- Agrupamento com totais e porcentagens
- Ordenacao multidirecional
- Exportacao: PDF (WeasyPrint HTML), CSV, Excel (openpyxl), JSON
"""

import csv
import io
import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("govsocial.reports")

DICIONARIO_DADOS: dict[str, dict] = {
    "families": {"label": "Famílias", "campos": {
        "id": "ID", "codigo_familiar": "Código Familiar", "nis_responsavel": "NIS Responsável",
        "nome_responsavel": "Responsável Familiar", "data_cadastro": "Data Cadastro",
        "situacao": "Situação", "bairro": "Bairro", "logradouro": "Logradouro",
    }},
    "persons": {"label": "Pessoas", "campos": {
        "id": "ID", "nome": "Nome", "nome_social": "Nome Social", "cpf": "CPF",
        "nis": "NIS", "data_nascimento": "Data Nascimento", "sexo": "Sexo",
        "escolaridade": "Escolaridade", "tipo_deficiencia": "Deficiência",
    }},
    "attendances": {"label": "Atendimentos", "campos": {
        "id": "ID", "data_atendimento": "Data", "tipo": "Tipo",
        "service_type_code": "Serviço", "unit_id": "Unidade",
    }},
    "benefit_concessions": {"label": "Benefícios", "campos": {
        "id": "ID", "benefit_type_code": "Tipo Benefício", "status": "Status",
        "data_solicitacao": "Data Solicitação", "quantidade_autorizada": "Qtd Autorizada",
        "valor_total": "Valor Total", "unit_id": "Unidade",
    }},
    "units": {"label": "Unidades", "campos": {
        "id": "ID", "nome": "Nome", "tipo": "Tipo", "cnpj": "CNPJ",
    }},
    "encaminhamentos": {"label": "Encaminhamentos", "campos": {
        "id": "ID", "tipo": "Tipo", "status": "Status", "data_criacao": "Data",
        "unidade_origem_id": "Origem", "unidade_destino": "Destino",
    }},
    "acoes_coletivas": {"label": "Grupos/SCFV", "campos": {
        "id": "ID", "nome": "Nome", "tipo": "Tipo", "vagas_total": "Vagas Total",
        "vagas_disponiveis": "Vagas Disponíveis",
    }},
    "acolhimentos": {"label": "Acolhimentos", "campos": {
        "id": "ID", "tipo": "Tipo", "status": "Status", "data_inicio": "Início",
        "data_fim": "Fim", "publico": "Público",
    }},
    "ivs_calculos": {"label": "IVS", "campos": {
        "id": "ID", "family_id": "Família", "pontuacao": "Pontuação",
        "nivel": "Nível", "data_calculo": "Data Cálculo",
    }},
}


def _serializar(v: Any) -> str:
    if v is None: return ""
    if isinstance(v, (datetime, date)): return v.isoformat()
    if isinstance(v, (UUID, Decimal)): return str(v)
    if isinstance(v, bool): return "Sim" if v else "Não"
    return str(v)


def _aplicar_filtros(sql: str, filtros: list[dict], params: dict) -> str:
    where_clauses = []
    for i, f in enumerate(filtros):
        valor = params.get(f"filtro_{f['campo']}")
        if valor is None and f.get("obrigatorio"):
            valor = f.get("valor_padrao", "")
        if valor is not None and valor != "":
            if f.get("tipo") == "data":
                where_clauses.append(f"({f['campo']}::date = :fdata_{i})")
                params[f"fdata_{i}"] = valor
            elif f.get("tipo") == "texto":
                where_clauses.append(f"({f['campo']}::text ILIKE :ftext_{i})")
                params[f"ftext_{i}"] = f"%{valor}%"
            elif f.get("tipo") == "numero":
                where_clauses.append(f"({f['campo']}::numeric = :fnum_{i})")
                params[f"fnum_{i}"] = float(valor)
            else:
                where_clauses.append(f"({f['campo']} = :f_{i})")
                params[f"f_{i}"] = valor
    if where_clauses:
        if "WHERE" in sql.upper():
            sql += " AND " + " AND ".join(where_clauses)
        else:
            sql += " WHERE " + " AND ".join(where_clauses)
    return sql


def _aplicar_ordenacao(sql: str, ordenacao: list[dict]) -> str:
    if not ordenacao: return sql
    clauses = [f"{o['campo']} {o['direcao'].upper()}" for o in ordenacao]
    order_prefix = "ORDER BY "
    if "ORDER BY" in sql.upper():
        return sql
    return f"{sql} ORDER BY {', '.join(clauses)}"


async def executar_relatorio(db: AsyncSession, config: dict, filtros_params: dict) -> list[dict]:
    """Executa um relatorio e retorna os dados como lista de dicionarios."""
    fonte = config["fonte_dados"]
    sql = fonte.get("sql", "")
    if not sql:
        raise ValueError("Fonte de dados sem SQL definido")

    params = dict(filtros_params)
    if config.get("filtros"):
        sql = _aplicar_filtros(sql, config["filtros"], params)
    if config.get("ordenacao"):
        sql = _aplicar_ordenacao(sql, config["ordenacao"])

    logger.debug("Executando relatorio: %s", sql[:200])
    result = await db.execute(sa_text(sql), params)
    rows = result.mappings().all()
    return [{k: _serializar(v) for k, v in row.items()} for row in rows]


def agrupar_dados(dados: list[dict], agrupamentos: list[dict]) -> list[dict]:
    """Aplica agrupamentos com totais e porcentagens."""
    if not agrupamentos or not dados:
        return dados

    campo = agrupamentos[0]["campo"]
    mostrar_totais = agrupamentos[0].get("mostrar_totais", False)
    mostrar_porcentagem = agrupamentos[0].get("mostrar_porcentagem", False)
    total = len(dados)

    grupos: dict[str, list[dict]] = {}
    for d in dados:
        chave = str(d.get(campo, ""))
        grupos.setdefault(chave, []).append(d)

    resultado = []
    for chave, itens in sorted(grupos.items()):
        if mostrar_totais:
            resultado.append({campo: chave, "_tipo": "grupo", "_count": len(itens),
                            "_pct": round(len(itens) / total * 100, 1) if total > 0 and mostrar_porcentagem else None})
        resultado.extend(itens)

    if mostrar_totais:
        resultado.append({"_tipo": "total_geral", "_count": total})
    return resultado


def exportar_csv(dados: list[dict], colunas: list[dict]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([c["titulo"] for c in colunas])
    for d in dados:
        writer.writerow([d.get(c["campo"], "") for c in colunas])
    return output.getvalue().encode("utf-8-sig")


def exportar_excel(dados: list[dict], colunas: list[dict], titulo: str) -> bytes:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
        wb = Workbook()
        ws = wb.active
        ws.title = titulo[:31]
        header_fill = PatternFill(start_color="1a56db", end_color="1a56db", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF")
        for col_idx, c in enumerate(colunas, 1):
            cell = ws.cell(row=1, column=col_idx, value=c["titulo"])
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
        for row_idx, d in enumerate(dados, 2):
            for col_idx, c in enumerate(colunas, 1):
                ws.cell(row=row_idx, column=col_idx, value=d.get(c["campo"], ""))
        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()
    except ImportError:
        return exportar_csv(dados, colunas)


def gerar_html(dados: list[dict], colunas: list[dict], config: dict, titulo: str) -> str:
    layout = config.get("layout", {})
    zebrado = layout.get("zebrado", True)
    orientacao = layout.get("orientacao", "retrato")
    col_css = " ".join(f"{c.get('largura', 'auto')}" for c in colunas)

    linhas = ""
    for i, d in enumerate(dados):
        bg = "#f9fafb" if zebrado and i % 2 == 0 else "white"
        celulas = "".join(f'<td style="padding:6px 8px;text-align:{c.get("alinhamento","left")}">{d.get(c["campo"],"")}</td>' for c in colunas)
        linhas += f'<tr style="background:{bg}">{celulas}</tr>'

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{titulo}</title>
<style>body{{font-family:Arial,sans-serif;font-size:12px;margin:20px}}h1{{font-size:16px;margin-bottom:8px}}
table{{width:100%;border-collapse:collapse}}th{{background:#1a56db;color:white;padding:8px;text-align:left}}
</style></head><body><h1>{titulo}</h1><table><thead><tr>{
''.join(f'<th>{c["titulo"]}</th>' for c in colunas)
}</tr></thead><tbody>{linhas}</tbody></table>
<p style="margin-top:12px;color:#6b7280;font-size:10px">Gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")} — Total: {len(dados)} registros</p>
</body></html>"""


def exportar_pdf(dados: list[dict], colunas: list[dict], config: dict, titulo: str) -> bytes:
    """Gera PDF via WeasyPrint. Retorna bytes do PDF."""
    html = gerar_html(dados, colunas, config, titulo)
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except ImportError:
        logger.warning("WeasyPrint indisponivel — exportando HTML em vez de PDF")
        return html.encode("utf-8")
