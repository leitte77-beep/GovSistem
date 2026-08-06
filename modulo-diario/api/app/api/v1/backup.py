import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.auth import require_roles
from app.core.config import settings
from app.models.user import User

router = APIRouter(
    tags=["backup"], dependencies=[Depends(require_roles("ADMIN"))]
)

def _get_backup_dir() -> Path:
    p = Path(settings.STORAGE_LOCAL_PATH) / "backups"
    p.mkdir(parents=True, exist_ok=True)
    return p

def _get_uploads_dir() -> Path:
    p = Path(settings.STORAGE_LOCAL_PATH)
    p.mkdir(parents=True, exist_ok=True)
    return p

DB_HOST = settings.POSTGRES_HOST
DB_PORT = settings.POSTGRES_PORT
DB_NAME = settings.POSTGRES_DB
DB_USER = settings.POSTGRES_USER
DB_PASS = settings.POSTGRES_PASSWORD.get_secret_value()

ENV = {"PGPASSWORD": DB_PASS, "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}


def _run(cmd: list[str], cwd: str | None = None) -> str:
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=600, env=ENV, cwd=cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command {' '.join(cmd)} failed (exit={result.returncode}): "
            f"{result.stderr or result.stdout}"
        )
    return result.stdout


def _run_backup() -> dict:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"backup_{ts}.tar.gz"
    backup_path = _get_backup_dir() / backup_name

    tmpdir = tempfile.mkdtemp()
    try:
        db_dump_path = os.path.join(tmpdir, "db.dump")
        _run([
            "pg_dump", "-Fc", "--clean", "--if-exists",
            "-h", DB_HOST, "-p", str(DB_PORT),
            "-U", DB_USER, "-d", DB_NAME,
            "-f", db_dump_path,
        ])

        uploads_tar = os.path.join(tmpdir, "uploads.tar.gz")
        u = _get_uploads_dir()
        if u.exists() and any(u.iterdir()):
            _run(["tar", "-czf", uploads_tar,
                  "--exclude", "backups",
                  "-C", str(u.parent), u.name])
        else:
            _run(["tar", "-czf", uploads_tar, "--files-from", "/dev/null"])

        with tarfile.open(backup_path, "w:gz") as tar:
            tar.add(db_dump_path, arcname="db.dump")
            if os.path.exists(uploads_tar):
                tar.add(uploads_tar, arcname="uploads.tar.gz")

    except RuntimeError as e:
        raise RuntimeError(str(e))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    size_bytes = backup_path.stat().st_size
    return {
        "filename": backup_name,
        "size_bytes": size_bytes,
        "created_at": ts,
        "message": "Backup criado com sucesso",
    }


@router.post("/backup")
async def create_backup(_: User = Depends(require_roles("ADMIN"))):
    try:
        return _run_backup()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backup/download/{filename}")
async def download_backup(
    filename: str,
    _: User = Depends(require_roles("ADMIN")),
):
    file_path = _get_backup_dir() / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo de backup não encontrado")
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/gzip",
    )


@router.get("/backup/files")
async def list_backups(_: User = Depends(require_roles("ADMIN"))):
    files = []
    for f in sorted(_get_backup_dir().iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.is_file() and f.suffix == ".gz":
            stat = f.stat()
            files.append({
                "filename": f.name,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    return files


@router.post("/backup/restore")
async def restore_backup(
    file: UploadFile,
    _: User = Depends(require_roles("ADMIN")),
):
    if not file.filename or not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Formato inválido. Envie um arquivo .tar.gz")

    tmpdir = tempfile.mkdtemp()
    try:
        backup_path = os.path.join(tmpdir, "restore.tar.gz")
        content = await file.read()
        with open(backup_path, "wb") as f:
            f.write(content)

        with tarfile.open(backup_path, "r:gz") as tar:
            tar.extractall(path=tmpdir)

        db_dump = os.path.join(tmpdir, "db.dump")
        if not os.path.exists(db_dump):
            raise HTTPException(status_code=400, detail="Backup inválido: db.dump não encontrado")

        _run([
            "pg_restore", "--clean", "--if-exists", "--no-owner",
            "-h", DB_HOST, "-p", str(DB_PORT),
            "-U", DB_USER, "-d", DB_NAME,
            db_dump,
        ])

        uploads_tar = os.path.join(tmpdir, "uploads.tar.gz")
        if os.path.exists(uploads_tar):
            _run(["tar", "-xzf", uploads_tar, "-C", "/"])

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
        await file.close()

    return {"message": "Backup restaurado com sucesso"}


@router.post("/backup/restore/{filename}")
async def restore_backup_from_server(
    filename: str,
    _: User = Depends(require_roles("ADMIN")),
):
    backup_path = _get_backup_dir() / filename
    if not backup_path.exists() or not backup_path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo de backup não encontrado")

    tmpdir = tempfile.mkdtemp()
    try:
        with tarfile.open(backup_path, "r:gz") as tar:
            tar.extractall(path=tmpdir)

        db_dump = os.path.join(tmpdir, "db.dump")
        if not os.path.exists(db_dump):
            raise HTTPException(status_code=400, detail="Backup inválido: db.dump não encontrado")

        _run([
            "pg_restore", "--clean", "--if-exists", "--no-owner",
            "-h", DB_HOST, "-p", str(DB_PORT),
            "-U", DB_USER, "-d", DB_NAME,
            db_dump,
        ])

        uploads_tar = os.path.join(tmpdir, "uploads.tar.gz")
        if os.path.exists(uploads_tar):
            _run(["tar", "-xzf", uploads_tar, "-C", "/"])

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    return {"message": "Backup restaurado com sucesso"}


@router.delete("/backup/files/{filename}")
async def delete_backup(
    filename: str,
    _: User = Depends(require_roles("ADMIN")),
):
    file_path = _get_backup_dir() / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo de backup não encontrado")
    file_path.unlink()
    return {"message": "Backup excluído com sucesso"}
