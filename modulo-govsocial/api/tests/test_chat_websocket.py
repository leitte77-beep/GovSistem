"""WebSocket do chat interno: a sala é sempre o tenant do usuário autenticado.

Cobre a correção de uma vulnerabilidade em que `/ws/chat/{tenant_id}` só
validava o JWT, mas nunca comparava o tenant do usuário com o `{tenant_id}`
da URL — permitindo que qualquer usuário autenticado se conectasse na sala
de outro município.
"""
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import create_app


def _client(db_session):
    app = create_app()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


class TestChatWebSocketTenant:
    def test_conecta_com_tenant_de_outro_usuario_e_rejeitado(self, world, db_session):
        token = create_access_token(
            world["users"][("A", "gestor_municipal")].id,
            ["gestor_municipal"],
            organization_id=world["org_a"].id,
        )
        tc = _client(db_session)
        with pytest.raises(WebSocketDisconnect) as exc:
            with tc.websocket_connect(
                f"/ws/chat/{world['org_b'].id}", headers={"authorization": f"Bearer {token}"}
            ):
                pass
        assert exc.value.code == 4003

    def test_conecta_com_proprio_tenant_passa_da_checagem_de_tenant(self, world, db_session):
        token = create_access_token(
            world["users"][("A", "gestor_municipal")].id,
            ["gestor_municipal"],
            organization_id=world["org_a"].id,
        )
        tc = _client(db_session)
        # Redis indisponível no ambiente de teste — a conexão ainda é
        # fechada, mas com um código diferente de 4003, o que prova que
        # passou da checagem de tenant.
        with pytest.raises(WebSocketDisconnect) as exc:
            with tc.websocket_connect(
                f"/ws/chat/{world['org_a'].id}", headers={"authorization": f"Bearer {token}"}
            ):
                pass
        assert exc.value.code != 4003

    def test_token_sem_tenant_correspondente_e_rejeitado_mesmo_com_id_valido(
        self, world, db_session
    ):
        token = create_access_token(
            world["users"][("B", "gestor_municipal")].id,
            ["gestor_municipal"],
            organization_id=world["org_b"].id,
        )
        tc = _client(db_session)
        with pytest.raises(WebSocketDisconnect) as exc:
            with tc.websocket_connect(
                f"/ws/chat/{world['org_a'].id}", headers={"authorization": f"Bearer {token}"}
            ):
                pass
        assert exc.value.code == 4003
