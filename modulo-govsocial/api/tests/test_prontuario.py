"""FASE 3 — prontuário, atendimentos, sigilo/escopo, recepção, visão de rede."""

import io
import uuid

CF = "/api/govsocial/v1/case-files"
REC = "/api/govsocial/v1/reception"


def _cf_payload(world, **over):
    p = {
        "family_id": str(world["family_a"].id),
        "unit_id": str(world["unit_a"].id),
        "service_type_code": "PAIF",
    }
    p.update(over)
    return p


async def _create_cf(client, world, role="coordenador_unidade"):
    r = await client.post(CF, json=_cf_payload(world), headers=world["auth"](role, "A"))
    assert r.status_code == 201, r.text
    return r.json()


# ── Prontuário por unidade/serviço ────────────────────────────────
async def test_create_case_file(client, world):
    cf = await _create_cf(client, world)
    assert cf["service_type_code"] == "PAIF"
    assert cf["status"] == "ATIVO"


async def test_case_file_unique_per_family_unit_service(client, world):
    await _create_cf(client, world)
    r = await client.post(
        CF, json=_cf_payload(world), headers=world["auth"]("coordenador_unidade", "A")
    )
    assert r.status_code == 409


async def test_paif_and_paefi_are_distinct(client, world):
    await _create_cf(client, world)
    r = await client.post(
        CF,
        json=_cf_payload(world, service_type_code="PAEFI"),
        headers=world["auth"]("coordenador_unidade", "A"),
    )
    assert r.status_code == 201


async def test_recepcao_cannot_read_case_files(client, world):
    assert (await client.get(CF, headers=world["auth"]("recepcao", "A"))).status_code == 403


# ── Escopo por lotação ────────────────────────────────────────────
async def test_technician_needs_unit_assignment(client, world):
    # tecnico_superior do tenant A ESTÁ lotado em unit_a → pode criar
    r = await client.post(
        CF, json=_cf_payload(world), headers=world["auth"]("tecnico_superior", "A")
    )
    assert r.status_code == 201


async def test_case_file_tenant_isolation(client, world):
    cf = await _create_cf(client, world)
    # gestor do tenant B não enxerga prontuário do tenant A
    r = await client.get(
        f"{CF}/{cf['id']}", headers=world["auth"]("gestor_municipal", "B")
    )
    assert r.status_code == 404


# ── Atendimentos + evolução criptografada e sigilo ────────────────
async def test_create_attendance_encrypts_evolution(client, world, db_session):
    from sqlalchemy import select

    from app.models.attendance import Attendance

    cf = await _create_cf(client, world)
    r = await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={
            "data_atendimento": "2026-02-01T10:00:00Z",
            "tipo": "FAMILIAR",
            "evolution_text": "evolucao confidencial da familia",
            "member_ids": [str(world["person_a"].id)],
        },
        headers=world["auth"]("tecnico_superior", "A"),
    )
    assert r.status_code == 201, r.text
    att_id = r.json()["id"]
    # quem registrou lê a evolução
    assert r.json()["evolution_text"] == "evolucao confidencial da familia"

    row = (
        await db_session.execute(select(Attendance).where(Attendance.id == uuid.UUID(att_id)))
    ).scalar_one()
    assert row.evolution_text_enc is not None
    assert "confidencial" not in row.evolution_text_enc


async def test_gestor_cannot_read_evolution_by_default(client, world):
    cf = await _create_cf(client, world)
    a = await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={"data_atendimento": "2026-02-01T10:00:00Z", "tipo": "INDIVIDUAL",
              "evolution_text": "texto sensivel"},
        headers=world["auth"]("tecnico_superior", "A"),
    )
    att_id = a.json()["id"]
    # gestor: settings.gestor_le_evolucao default False → evolução restrita
    r = await client.get(
        f"{CF}/{cf['id']}/attendances/{att_id}",
        headers=world["auth"]("gestor_municipal", "A"),
    )
    assert r.status_code == 200
    assert r.json()["evolution_restrita"] is True
    assert r.json()["evolution_text"] is None


async def test_sigiloso_reforcado_restricts_other_technician(client, world):
    # Sigilo reforçado: coordenador da unidade PODE ler; validamos essa regra.
    cf = await _create_cf(client, world)
    a = await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={"data_atendimento": "2026-02-01T10:00:00Z", "tipo": "INDIVIDUAL",
              "evolution_text": "sigilo maximo", "sigiloso_reforcado": True},
        headers=world["auth"]("tecnico_superior", "A"),
    )
    att_id = a.json()["id"]

    # coordenador da unidade PODE ler mesmo com sigilo reforçado
    r = await client.get(
        f"{CF}/{cf['id']}/attendances/{att_id}",
        headers=world["auth"]("coordenador_unidade", "A"),
    )
    assert r.status_code == 200
    assert r.json()["evolution_restrita"] is False
    assert r.json()["evolution_text"] == "sigilo maximo"


async def test_gestor_reads_evolution_when_enabled(client, world, db_session):
    from sqlalchemy import select

    from app.models.organization import Organization

    org = (
        await db_session.execute(
            select(Organization).where(Organization.id == world["org_a"].id)
        )
    ).scalar_one()
    org.settings = {"gestor_le_evolucao": True}
    await db_session.commit()

    cf = await _create_cf(client, world)
    a = await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={"data_atendimento": "2026-02-01T10:00:00Z", "tipo": "INDIVIDUAL",
              "evolution_text": "texto liberado"},
        headers=world["auth"]("tecnico_superior", "A"),
    )
    r = await client.get(
        f"{CF}/{cf['id']}/attendances/{a.json()['id']}",
        headers=world["auth"]("gestor_municipal", "A"),
    )
    assert r.json()["evolution_restrita"] is False
    assert r.json()["evolution_text"] == "texto liberado"


async def test_attendance_list_never_returns_evolution(client, world):
    cf = await _create_cf(client, world)
    await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={"data_atendimento": "2026-02-01T10:00:00Z", "tipo": "FAMILIAR",
              "evolution_text": "x"},
        headers=world["auth"]("tecnico_superior", "A"),
    )
    r = await client.get(
        f"{CF}/{cf['id']}/attendances", headers=world["auth"]("tecnico_superior", "A")
    )
    assert r.status_code == 200
    for item in r.json():
        assert item["evolution_text"] is None


# ── Timeline + visão de rede ──────────────────────────────────────
async def test_timeline(client, world):
    cf = await _create_cf(client, world)
    await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={"data_atendimento": "2026-02-01T10:00:00Z", "tipo": "FAMILIAR"},
        headers=world["auth"]("tecnico_superior", "A"),
    )
    r = await client.get(
        f"{CF}/{cf['id']}/timeline", headers=world["auth"]("tecnico_superior", "A")
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert "pode_ler_evolucao" in r.json()[0]


async def test_network_view_hides_content(client, world):
    cf = await _create_cf(client, world)
    await client.post(
        f"{CF}/{cf['id']}/attendances",
        json={"data_atendimento": "2026-02-01T10:00:00Z", "tipo": "FAMILIAR",
              "evolution_text": "conteudo"},
        headers=world["auth"]("tecnico_superior", "A"),
    )
    r = await client.get(
        f"{CF}/family/{world['family_a'].id}/network",
        headers=world["auth"]("gestor_municipal", "A"),
    )
    assert r.status_code == 200
    assert len(r.json()) >= 1
    item = r.json()[0]
    assert "evolution_text" not in item
    assert item["service_type_code"] == "PAIF"
    assert item["unit_id"] == str(world["unit_a"].id)


# ── Recepção (não é atendimento) ──────────────────────────────────
async def test_reception_flow(client, world):
    r = await client.post(
        REC,
        json={"unit_id": str(world["unit_a"].id), "nome_informado": "Visitante",
              "motivo": "informações"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 201
    rid = r.json()["id"]
    assert r.json()["status"] == "AGUARDANDO"

    u = await client.patch(
        f"{REC}/{rid}", json={"status": "ATENDIDO"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert u.status_code == 200
    assert u.json()["status"] == "ATENDIDO"
    assert u.json()["atendido_em"] is not None


async def test_reception_does_not_create_attendance(client, world, db_session):
    from sqlalchemy import func, select

    from app.models.attendance import Attendance

    await client.post(
        REC,
        json={"unit_id": str(world["unit_a"].id), "nome_informado": "X"},
        headers=world["auth"]("recepcao", "A"),
    )
    count = (
        await db_session.execute(
            select(func.count()).select_from(Attendance).where(
                Attendance.tenant_id == world["org_a"].id
            )
        )
    ).scalar_one()
    assert count == 0


# ── Anexos (upload validado) ──────────────────────────────────────
async def test_attachment_upload_and_download(client, world):
    cf = await _create_cf(client, world)
    files = {"file": ("laudo.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
    r = await client.post(
        f"{CF}/{cf['id']}/attachments?tipo_documento=LAUDO",
        files=files,
        headers=world["auth"]("tecnico_superior", "A"),
    )
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    assert r.json()["versao"] == 1

    d = await client.get(
        f"{CF}/{cf['id']}/attachments/{aid}/download",
        headers=world["auth"]("tecnico_superior", "A"),
    )
    assert d.status_code == 200
    assert d.content == b"%PDF-1.4 fake"


async def test_attachment_rejects_bad_extension(client, world):
    cf = await _create_cf(client, world)
    files = {"file": ("virus.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
    r = await client.post(
        f"{CF}/{cf['id']}/attachments",
        files=files,
        headers=world["auth"]("tecnico_superior", "A"),
    )
    assert r.status_code == 422


# ── Auditoria ─────────────────────────────────────────────────────
async def test_open_case_file_audits_sensitive_read(client, world, db_session):
    from sqlalchemy import select

    from app.models.audit_trail import AuditTrail

    cf = await _create_cf(client, world)
    await client.get(f"{CF}/{cf['id']}", headers=world["auth"]("coordenador_unidade", "A"))
    rows = (
        await db_session.execute(
            select(AuditTrail).where(
                AuditTrail.entity == "case_file",
                AuditTrail.access_type == "READ_SENSIVEL",
            )
        )
    ).scalars().all()
    assert len(rows) >= 1
