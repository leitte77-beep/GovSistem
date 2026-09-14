"""Configuração validada de um modelo documental (Incremento 2).

Um modelo documental define, para uma finalidade de ato, os **textos fixos**
(estrutura institucional) e os **campos variáveis** que precisam ser
preenchidos (ex.: nome do servidor, número de dias, datas). A IA produz apenas
**dados estruturados**; o preenchimento determinístico (renderização) acontece
aqui, inserindo os textos fixos sem que a IA os reescreva.

Invariantes de segurança:
  * ``extra="forbid"`` em toda a config — nenhuma chave desconhecida entra.
  * Não há código/expressões: só marcadores ``{{campo}}`` declarados e
    condicionais declarativas (``when_field == when_value``).
  * Nenhum marcador pode referenciar campo não declarado.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Ciclo de vida do modelo documental.
DM_STATUS_DRAFT = "draft"
DM_STATUS_IN_APPROVAL = "in_approval"
DM_STATUS_ACTIVE = "active"
DM_STATUS_INACTIVE = "inactive"
DM_STATUS_ARCHIVED = "archived"

# Campo válido para escolha de tipo de ato/escopo.
SCOPE_DOCUMENT_TYPES = {
    "decreto",
    "portaria",
    "lei",
    "edital",
    "oficio",
    "resolucao",
    "outro",
}

MARKER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")
_MARKER_KEY = re.compile(r"^[a-z0-9_]+$")


class FieldType(str, Enum):
    TEXT = "text"
    DATE = "date"
    INTEGER = "integer"
    DECIMAL = "decimal"
    MONEY = "money"
    SELECT = "select"
    REFERENCE = "reference"  # referência a cadastro/documento (valida-se depois)


class SectionKind(str, Enum):
    HEADING = "heading"
    PREAMBLE = "preamble"
    COMMAND = "command"
    PARAGRAPH = "paragraph"
    ARTICLE = "article"
    PARAGRAPH_ITEM = "paragraph_item"
    INCISO = "inciso"
    ALINEA = "alinea"
    QUOTE = "quote"
    SIGNATURE_BLOCK = "signature_block"
    ATTACHMENT_REFERENCE = "attachment_reference"


# kinds cujo conteúdo de redação é livre (permite variar entre minutas); os
# demais são considerados textos fixos/estruturais e devem render iguais.
FREE_TEXT_KINDS = {
    SectionKind.PARAGRAPH,
    SectionKind.PREAMBLE,
    SectionKind.QUOTE,
}

# Kinds de sub-bloco permitidos dentro de um artigo.
_ARTICLE_CHILDREN = {
    SectionKind.PARAGRAPH_ITEM,
    SectionKind.INCISO,
    SectionKind.ALINEA,
}
# Kinds que não podem ser raiz.
_NON_ROOT = {SectionKind.PARAGRAPH_ITEM, SectionKind.INCISO, SectionKind.ALINEA}


class Condition(BaseModel):
    """Condicional declarativa ``campo == valor``."""

    model_config = ConfigDict(extra="forbid")

    field: str
    value: str


class DocumentField(BaseModel):
    """Schema de um campo variável preenchível."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: FieldType = FieldType.TEXT
    required: bool = False
    options: list[str] = Field(default_factory=list)
    help: str = ""
    # Validações por tipo.
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    regex: Optional[str] = None  # pattern para texto
    # Obrigatoriedade condicional (ex.: só se outro campo = valor).
    required_when: list[Condition] = Field(default_factory=list)

    @field_validator("key")
    @classmethod
    def _valid_key(cls, v: str) -> str:
        if not _MARKER_KEY.match(v):
            raise ValueError(f"Chave de campo inválida: {v!r} (use [a-z0-9_])")
        return v

    @model_validator(mode="after")
    def _validate(self) -> "DocumentField":
        if self.type == FieldType.SELECT and not self.options:
            raise ValueError(f"Campo select {self.key} precisa de options.")
        for c in self.required_when:
            if c.field == self.key:
                raise ValueError("required_when não pode referenciar o próprio campo.")
        return self


class SignatureEntrySpec(BaseModel):
    """Uma entrada da área de assinatura (nome pode conter marcador).

    ``authority_id``/``credential_id`` guardam a proveniência (registro de
    autoridades e certificado de assinatura) sem alterar o snapshot de
    nome/cargo. ``position`` define a posição visual da entrada.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = ""  # ex.: "{{servidor}}"
    role: str = ""
    organ: str = ""
    location: str = ""
    date: str = ""
    authority_id: Optional[uuid.UUID] = None
    credential_id: Optional[uuid.UUID] = None
    position: str = "center"

    @field_validator("position")
    @classmethod
    def _valid_position(cls, v: str) -> str:
        v = (v or "center").lower()
        if v not in {"left", "center", "right"}:
            raise ValueError("position de assinatura deve ser left, center ou right.")
        return v


class SectionSpec(BaseModel):
    """Nó de estrutura do documento.

    ``text`` carrega o texto fixo + marcadores opcionais ``{{campo}}``. Um bloco
    com ``when_field``/``when_value`` só entra quando values[when_field] ==
    when_value. ``children`` aninha sub-blocos (artigos → §/incisos/alíneas).
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    kind: SectionKind
    text: str = ""
    number: Optional[str] = None
    suffix: Optional[str] = None
    level: int = 1
    alignment: str = "center"
    when_field: Optional[str] = None
    when_value: Optional[str] = None
    # Classificação de conteúdo (proteção da padronização):
    #   fixed_text: texto fixo — deve permanecer idêntico entre minutas.
    #   locked: protegido — a IA não pode reescrever/alterar.
    #   ai_generated: redação que a IA pode gerar/completar.
    fixed_text: bool = False
    locked: bool = False
    ai_generated: bool = False
    entries: list[SignatureEntrySpec] = Field(default_factory=list)
    children: list["SectionSpec"] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _valid_id(cls, v: str) -> str:
        if not _MARKER_KEY.match(v):
            raise ValueError(f"id de seção inválido: {v!r}")
        return v

    @model_validator(mode="after")
    def _validate_kind(self) -> "SectionSpec":
        if self.kind == SectionKind.SIGNATURE_BLOCK and not self.entries:
            raise ValueError("signature_block precisa de ao menos uma entrada.")
        if self.kind == SectionKind.HEADING and not (1 <= self.level <= 6):
            raise ValueError("level de heading deve estar entre 1 e 6.")
        return self


# Permitir auto-referência recursiva do modelo.
SectionSpec.model_rebuild()


class DocumentModelConfig(BaseModel):
    """Configuração completa e validada de uma versão de modelo documental."""

    model_config = ConfigDict(extra="forbid")

    purpose: str = Field(min_length=1, max_length=200)
    description: str = ""
    scope_document_type: str = "outro"
    document_title: str = ""  # pode conter {{campo}}
    summary: str = ""  # ementa; pode conter {{campo}}
    fields: list[DocumentField] = Field(default_factory=list)
    sections: list[SectionSpec] = Field(default_factory=list)

    @field_validator("scope_document_type")
    @classmethod
    def _valid_scope(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in SCOPE_DOCUMENT_TYPES:
            raise ValueError(f"Escopo de tipo de ato inválido: {v}")
        return v

    def field_keys(self) -> set[str]:
        return {f.key for f in self.fields}

    def _iter_all_texts(self):
        def walk(sections: list[SectionSpec]):
            for s in sections:
                for value in (s.text, s.number, s.suffix):
                    if value:
                        yield value
                if s.kind == SectionKind.SIGNATURE_BLOCK:
                    for e in s.entries:
                        for value in (e.name, e.role, e.organ, e.location, e.date):
                            if value:
                                yield value
                yield from walk(s.children)

        return walk(self.sections)

    @model_validator(mode="after")
    def _validate_model(self) -> "DocumentModelConfig":
        keys = self.field_keys()
        if len(keys) != len(self.fields):
            raise ValueError("Chaves de campos duplicadas no modelo.")

        # Chaves usadas em required_when / when_* devem existir.
        known = keys
        for f in self.fields:
            for c in f.required_when:
                if c.field not in known:
                    raise ValueError(f"required_when referencia campo inexistente: {c.field}")

        # Marcadores devem apontar para campos declarados.
        for text_value in self._iter_all_texts():
            for field_name in _markers(text_value):
                if field_name not in known:
                    raise ValueError(f"Marcador {{{{{field_name}}}}} sem campo declarado.")
        for head in (self.document_title, self.summary):
            for field_name in _markers(head):
                if field_name not in known:
                    raise ValueError(f"Marcador {{{{{field_name}}}}} sem campo declarado.")

        # Estrutura: raiz não pode ser sub-bloco; filhos de artigo limitados.
        self._check_tree(self.sections, is_root=True)
        for s in self.sections:
            if s.when_field is not None and s.when_field not in known:
                raise ValueError(f"when_field de {s.id} não é um campo declarado.")
        return self

    def _check_tree(self, sections: list[SectionSpec], *, is_root: bool) -> None:
        for s in sections:
            if is_root and s.kind in _NON_ROOT:
                raise ValueError(f"Bloco raiz não pode ser {s.kind.value}: {s.id}")
            if s.kind == SectionKind.ARTICLE:
                for child in s.children:
                    if child.kind not in _ARTICLE_CHILDREN:
                        raise ValueError(f"Artigo {s.id} não pode conter bloco {child.kind.value}.")
                self._check_tree(s.children, is_root=False)
            elif s.children:
                raise ValueError(f"Bloco {s.kind.value} ({s.id}) não aceita filhos.")

    def canonical_json(self) -> str:
        import json

        return json.dumps(json.loads(self.model_dump_json()), sort_keys=True, ensure_ascii=False)

    def canonical_hash(self) -> str:
        """Hash canônico da config (fidelidade do modelo, não do render)."""
        return hashlib.sha256(self.canonical_json().encode("utf-8")).hexdigest()


def _markers(text_value: Optional[str]) -> list[str]:
    if not text_value:
        return []
    return MARKER_RE.findall(text_value)


def extract_markers(text_value: Optional[str]) -> list[str]:
    return _markers(text_value)


def new_document_id() -> str:
    return uuid.uuid4().hex
