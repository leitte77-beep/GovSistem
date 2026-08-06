from pydantic import BaseModel, Field


class AIFormatRequest(BaseModel):
    content: str = Field(..., description="Texto ou HTML bruto a ser interpretado")
    act_type: str | None = Field(None, description="Tipo de ato, se disponível")
    title: str | None = Field(None, description="Título da matéria, se disponível")
    summary: str | None = Field(None, description="Súmula, se disponível")


class AIFormatResponse(BaseModel):
    structured_html: str
    model: str
    notes: list[str] = Field(default_factory=list)
