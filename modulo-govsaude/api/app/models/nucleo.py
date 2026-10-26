"""Núcleo: organizações, rede de atenção, identidade, RBAC e governança."""

from __future__ import annotations

import uuid
from datetime import datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    BaixaMixin,
    Base,
    JSONType,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersaoMixin,
    VigenciaMixin,
)
from app.models.enums import (
    CanalNotificacao,
    NivelSigilo,
    SituacaoNotificacao,
    StatusAntivirus,
    StatusJob,
    StatusTermo,
    TipoAnexo,
    TipoOrganizacao,
)


class Organizacao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Tenant do módulo. Espelha a organização da saas-platform."""

    __tablename__ = "organizacoes"

    externo_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(240), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(
        String(30), default=TipoOrganizacao.MUNICIPIO.value, nullable=False
    )
    cnpj_normalizado: Mapped[str | None] = mapped_column(String(18), nullable=True)
    cnpj_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    municipio_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    fuso_horario: Mapped[str] = mapped_column(String(60), default="America/Sao_Paulo", nullable=False)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("externo_id", name="uq_organizacoes_externo"),
        CheckConstraint(
            "tipo IN ('MUNICIPIO','CONSORCIO','ESTADO_REGIONAL','ENTIDADE')",
            name="ck_organizacoes_tipo",
        ),
    )


class EnteConsorciado(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VigenciaMixin,
    VersaoMixin,
):
    __tablename__ = "entes_consorciados"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "municipio_ibge", "vigencia_inicio", name="uq_entes_consorciados"
        ),
        CheckConstraint(
            "situacao IN ('ATIVO','INATIVO','SUSPENSO')",
            name="ck_entes_consorciados_situacao",
        ),
    )

    municipio_ibge: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    cnpj_normalizado: Mapped[str | None] = mapped_column(String(18), nullable=True)
    situacao: Mapped[str] = mapped_column(String(30), default="ATIVO", nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Estabelecimento(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin, VersaoMixin
):
    """UBS/USF, centro de especialidades, policlínica, laboratório, farmácia etc."""

    __tablename__ = "estabelecimentos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "cnes", name="uq_estabelecimentos_cnes"),
        Index("ix_estabelecimentos_tenant_nome", "tenant_id", "nome"),
    )

    cnes: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    cnpj_normalizado: Mapped[str | None] = mapped_column(String(18), nullable=True)
    logradouro: Mapped[str | None] = mapped_column(String(240), nullable=True)
    numero: Mapped[str | None] = mapped_column(String(30), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True)
    municipio_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    cep: Mapped[str | None] = mapped_column(String(8), nullable=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    setores: Mapped[list["Setor"]] = relationship(back_populates="estabelecimento")


class Setor(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin, VersaoMixin):
    __tablename__ = "setores"
    __table_args__ = (
        UniqueConstraint("tenant_id", "estabelecimento_id", "nome", name="uq_setores_nome"),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[str] = mapped_column(String(60), default="ATENDIMENTO", nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    estabelecimento: Mapped[Estabelecimento] = relationship(back_populates="setores")


class Equipe(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    BaixaMixin,
    VigenciaMixin,
    VersaoMixin,
):
    __tablename__ = "equipes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "ine", name="uq_equipes_ine"),
        Index("ix_equipes_tenant_estabelecimento", "tenant_id", "estabelecimento_id"),
        CheckConstraint(
            "tipo IN ('ESF','EAP','ESB','EMULTI','OUTRA')",
            name="ck_equipes_tipo",
        ),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    ine: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Especialidade(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin):
    __tablename__ = "especialidades"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_especialidades_codigo"),
    )

    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    cbo: Mapped[str | None] = mapped_column(String(6), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Profissional(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin, VersaoMixin
):
    __tablename__ = "profissionais"
    __table_args__ = (
        Index("ix_profissionais_tenant_nome", "tenant_id", "nome"),
        Index("ix_profissionais_tenant_nome_busca", "tenant_id", "nome_busca"),
        Index("ix_profissionais_cpf_hash", "tenant_id", "cpf_hash"),
        Index("ix_profissionais_cns_hash", "tenant_id", "cns_hash"),
        Index(
            "uq_profissionais_cpf_hash_ativo",
            "tenant_id",
            "cpf_hash",
            unique=True,
            postgresql_where=text("cpf_hash IS NOT NULL AND baixa_em IS NULL"),
            sqlite_where=text("cpf_hash IS NOT NULL AND baixa_em IS NULL"),
        ),
        Index(
            "uq_profissionais_cns_hash_ativo",
            "tenant_id",
            "cns_hash",
            unique=True,
            postgresql_where=text("cns_hash IS NOT NULL AND baixa_em IS NULL"),
            sqlite_where=text("cns_hash IS NOT NULL AND baixa_em IS NULL"),
        ),
    )

    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    nome_social: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nome_busca: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nome_fonetico: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cpf_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cpf_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    cpf_final: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cns_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cns_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    cbo: Mapped[str | None] = mapped_column(String(6), nullable=True)
    conselho_classe: Mapped[str | None] = mapped_column(String(40), nullable=True)
    registro_conselho: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class VinculoProfissional(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VigenciaMixin, VersaoMixin
):
    __tablename__ = "vinculos_profissionais"
    __table_args__ = (
        Index("ix_vinculos_profissional", "tenant_id", "profissional_id", "vigencia_inicio"),
    )

    profissional_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("equipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cbo: Mapped[str] = mapped_column(String(6), nullable=False)
    carga_horaria_semanal: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Grupo(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "grupos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_grupos_codigo"),
        Index("ix_grupos_tenant_codigo", "tenant_id", "codigo"),
    )

    codigo: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    sistema: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    requer_consentimento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    permissoes: Mapped[list["GrupoPermissao"]] = relationship(
        back_populates="grupo", cascade="all, delete-orphan", lazy="selectin"
    )


class PermissaoGlobal(Base):
    __tablename__ = "permissoes"

    codigo: Mapped[str] = mapped_column(String(80), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(240), nullable=False)
    modulo: Mapped[str] = mapped_column(String(30), default="govsaude", nullable=False)


class GrupoPermissao(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "grupo_permissoes"
    __table_args__ = (
        UniqueConstraint("grupo_id", "permissao_codigo", name="uq_grupo_permissao"),
    )

    grupo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permissao_codigo: Mapped[str] = mapped_column(
        String(80), ForeignKey("permissoes.codigo", ondelete="RESTRICT"), nullable=False
    )

    grupo: Mapped[Grupo] = relationship(back_populates="permissoes")


class Usuario(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "usuarios"
    __table_args__ = (
        UniqueConstraint("tenant_id", "externo_id", name="uq_usuarios_externo"),
        UniqueConstraint("tenant_id", "email", name="uq_usuarios_email"),
        UniqueConstraint("tenant_id", "nome_acesso", name="uq_usuarios_nome_acesso"),
        Index("ix_usuarios_tenant_ativo", "tenant_id", "ativo"),
        Index("ix_usuarios_cpf_hash", "tenant_id", "cpf_hash"),
        Index("ix_usuarios_cns_hash", "tenant_id", "cns_hash"),
        Index(
            "uq_usuarios_cpf_hash_ativo",
            "tenant_id",
            "cpf_hash",
            unique=True,
            postgresql_where=text("cpf_hash IS NOT NULL AND baixa_em IS NULL"),
            sqlite_where=text("cpf_hash IS NOT NULL AND baixa_em IS NULL"),
        ),
        Index(
            "uq_usuarios_cns_hash_ativo",
            "tenant_id",
            "cns_hash",
            unique=True,
            postgresql_where=text("cns_hash IS NOT NULL AND baixa_em IS NULL"),
            sqlite_where=text("cns_hash IS NOT NULL AND baixa_em IS NULL"),
        ),
    )

    externo_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    nome_acesso: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    cpf_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cpf_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    cpf_final: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cns_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cns_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    permissoes_extras: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    permissoes_revogadas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bloqueado_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tentativas_falhas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mfa_ativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    senha_alterada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    senha_expira_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_acesso_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ultima_atividade_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    hora_inicio_permitida: Mapped[time | None] = mapped_column(Time, nullable=True)
    hora_fim_permitida: Mapped[time | None] = mapped_column(Time, nullable=True)
    termo_versao_aceita: Mapped[str | None] = mapped_column(String(40), nullable=True)
    termo_aceito_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    grupos: Mapped[list["UsuarioGrupo"]] = relationship(
        back_populates="usuario", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def is_admin(self) -> bool:
        return any(ug.grupo and ug.grupo.codigo == "ADMIN" for ug in self.grupos)


class HistoricoSenha(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "historico_senhas"
    __table_args__ = (Index("ix_historico_senha_usuario", "tenant_id", "usuario_id"),)

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class UsuarioGrupo(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VigenciaMixin):
    __tablename__ = "usuario_grupos"
    __table_args__ = (
        Index("ix_usuario_grupos_usuario", "tenant_id", "usuario_id"),
        Index("ix_usuario_grupos_escopo", "tenant_id", "estabelecimento_id", "equipe_id"),
    )

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    grupo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("grupos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("equipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    usuario: Mapped[Usuario] = relationship(back_populates="grupos")
    grupo: Mapped[Grupo] = relationship(lazy="selectin")
    estabelecimento: Mapped[Estabelecimento | None] = relationship(lazy="selectin")
    equipe: Mapped[Equipe | None] = relationship(lazy="selectin")
    especialidade: Mapped[Especialidade | None] = relationship(lazy="selectin")


class TermoUso(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "termos_uso"
    __table_args__ = (
        UniqueConstraint("tenant_id", "versao", name="uq_termos_uso_versao"),
    )

    versao: Mapped[str] = mapped_column(String(40), nullable=False)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    conteudo_md: Mapped[str] = mapped_column(Text, nullable=False)
    vigencia_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    obrigatorio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class TermoAceite(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "termos_aceites"
    __table_args__ = (
        UniqueConstraint("tenant_id", "usuario_id", "termo_id", name="uq_termo_aceite"),
    )

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    termo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("termos_uso.id", ondelete="RESTRICT"), nullable=False
    )
    versao: Mapped[str] = mapped_column(String(40), nullable=False)
    situacao: Mapped[str] = mapped_column(
        String(20), default=StatusTermo.ACEITO.value, nullable=False
    )
    ip: Mapped[str | None] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    aceito_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recusado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConfiguracaoTenant(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    ActorMixin,
):
    __tablename__ = "configuracoes_tenant"
    __table_args__ = (
        UniqueConstraint("tenant_id", "chave", "versao", name="uq_config_tenant_versao"),
        Index("ix_config_tenant_chave", "tenant_id", "chave"),
    )

    chave: Mapped[str] = mapped_column(String(120), nullable=False)
    valor: Mapped[dict] = mapped_column(JSONType, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="json", nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    editavel: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class FormularioDinamico(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VigenciaMixin):
    __tablename__ = "formularios_dinamicos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", "versao", name="uq_formulario_codigo_versao"),
    )

    codigo: Mapped[str] = mapped_column(String(80), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    versao: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    schema_json: Mapped[dict] = mapped_column(JSONType, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RespostaFormulario(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "respostas_formulario"
    __table_args__ = (
        Index("ix_respostas_formulario_entidade", "tenant_id", "entidade", "entidade_id"),
    )

    formulario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("formularios_dinamicos.id", ondelete="RESTRICT"), nullable=False
    )
    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    resposta: Mapped[dict] = mapped_column(JSONType, nullable=False)
    versao_formulario: Mapped[int] = mapped_column(Integer, nullable=False)


class Notificacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "notificacoes"
    __table_args__ = (
        Index("ix_notificacoes_destino", "tenant_id", "destinatario_id", "situacao"),
    )

    destinatario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=True, index=True
    )
    grupo_destino: Mapped[str | None] = mapped_column(String(60), nullable=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    entidade: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    canal: Mapped[str] = mapped_column(
        String(20), default=CanalNotificacao.SISTEMA.value, nullable=False
    )
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoNotificacao.NAO_LIDA.value, nullable=False, index=True
    )
    lida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validade_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MensagemInterna(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "mensagens_internas"
    __table_args__ = (Index("ix_mensagens_destino", "tenant_id", "destinatario_id", "lida_em"),)

    remetente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False
    )
    destinatario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assunto: Mapped[str] = mapped_column(String(200), nullable=False)
    conteudo_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    lida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotaProfissional(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "notas_profissionais"
    __table_args__ = (
        Index("ix_notas_prof_entidade", "tenant_id", "entidade", "entidade_id"),
    )

    autor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False
    )
    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    conteudo_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    nivel_sigilo: Mapped[str] = mapped_column(
        String(30), default=NivelSigilo.SIGILOSO.value, nullable=False
    )


class OcorrenciaUnidade(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "ocorrencias_unidade"

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    gravidade: Mapped[str] = mapped_column(String(20), default="MEDIA", nullable=False)
    situacao: Mapped[str] = mapped_column(String(20), default="ABERTA", nullable=False)
    reportada_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class Anexo(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin):
    __tablename__ = "anexos"
    __table_args__ = (Index("ix_anexos_entidade", "tenant_id", "entidade", "entidade_id"),)

    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    chave_objeto: Mapped[str] = mapped_column(String(300), nullable=False, unique=True)
    nome_original: Mapped[str | None] = mapped_column(String(240), nullable=True)
    mime: Mapped[str] = mapped_column(String(120), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default=TipoAnexo.DOCUMENTO.value, nullable=False)
    status_antivirus: Mapped[str] = mapped_column(
        String(20), default=StatusAntivirus.PENDENTE.value, nullable=False
    )
    enviado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class Job(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_tenant_status", "tenant_id", "status", "created_at"),)

    tipo: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=StatusJob.PENDENTE.value, nullable=False, index=True
    )
    progresso: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    parametros: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    resultado_chave: Mapped[str | None] = mapped_column(String(300), nullable=True)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    iniciado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class IdempotencyKey(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("tenant_id", "chave", "endpoint", name="uq_idempotency_chave"),
        Index("ix_idempotency_expira", "expires_at"),
    )

    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    chave: Mapped[str] = mapped_column(String(80), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[dict] = mapped_column(JSONType, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Contador(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "contadores"
    __table_args__ = (
        UniqueConstraint("tenant_id", "escopo", "ano", name="uq_contadores"),
    )

    escopo: Mapped[str] = mapped_column(String(60), nullable=False)
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    valor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


__all__ = [
    "Anexo",
    "ConfiguracaoTenant",
    "Contador",
    "EnteConsorciado",
    "Equipe",
    "Especialidade",
    "Estabelecimento",
    "FormularioDinamico",
    "Grupo",
    "GrupoPermissao",
    "HistoricoSenha",
    "IdempotencyKey",
    "Job",
    "MensagemInterna",
    "NotaProfissional",
    "Notificacao",
    "OcorrenciaUnidade",
    "Organizacao",
    "PermissaoGlobal",
    "Profissional",
    "RespostaFormulario",
    "Setor",
    "TermoAceite",
    "TermoUso",
    "Usuario",
    "UsuarioGrupo",
    "VinculoProfissional",
]
