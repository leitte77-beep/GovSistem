"""Visualização de documentos no navegador.

PDF e imagem vão direto. Documentos do Office (.doc/.docx/.odt/.xls/.xlsx/
.ods) são convertidos para PDF pelo LibreOffice na primeira visualização e o
PDF fica guardado ao lado do original (`<arquivo>.visualizar.pdf`): a segunda
abertura é instantânea. O original nunca é alterado.
"""

import asyncio
import shutil
import tempfile
from pathlib import Path

CONVERSIVEIS = {".doc", ".docx", ".odt", ".rtf", ".xls", ".xlsx", ".ods"}
DIRETOS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"}
TEMPO_MAXIMO = 90  # segundos por conversão

_trava = asyncio.Semaphore(2)  # LibreOffice é pesado: no máximo 2 por vez


def suportado(nome: str) -> bool:
    ext = Path(nome).suffix.lower()
    return ext in CONVERSIVEIS or ext in DIRETOS


def precisa_converter(nome: str) -> bool:
    return Path(nome).suffix.lower() in CONVERSIVEIS


async def pdf_de(original: Path) -> Path:
    """Caminho do PDF de visualização, convertendo se ainda não existir."""
    destino = original.with_name(original.name + ".visualizar.pdf")
    if destino.exists() and destino.stat().st_size > 0:
        return destino
    async with _trava:
        if destino.exists() and destino.stat().st_size > 0:
            return destino
        with tempfile.TemporaryDirectory(prefix="gt-lo-") as tmp:
            # Perfil do LibreOffice descartável: conversões simultâneas não
            # disputam o mesmo diretório de usuário.
            processo = await asyncio.create_subprocess_exec(
                "soffice",
                f"-env:UserInstallation=file://{tmp}/perfil",
                "--headless",
                "--norestore",
                "--convert-to",
                "pdf",
                "--outdir",
                tmp,
                str(original),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
                env={"HOME": tmp, "PATH": "/usr/bin:/bin"},
            )
            try:
                await asyncio.wait_for(processo.wait(), timeout=TEMPO_MAXIMO)
            except asyncio.TimeoutError:
                processo.kill()
                raise RuntimeError("A conversão demorou demais.")
            gerados = list(Path(tmp).glob("*.pdf"))
            if not gerados:
                raise RuntimeError("Não foi possível converter o documento.")
            shutil.move(str(gerados[0]), destino)
    return destino
