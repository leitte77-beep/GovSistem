"""Optimistic-locking helpers for matter content (Fase 2).

The client sends ``If-Match: "<version>-<etag>"`` (or a bare version) on write
operations. If the current persisted version differs, the server answers 409 so
the client reloads instead of silently doing last-write-wins.
"""

from fastapi import HTTPException, Request

from app.models.matter import Matter


def current_etag(matter: Matter) -> str:
    """ETag reflecting the current persisted revision of a matter."""
    return f'"{matter.version}-{str(matter.updated_at or "")}"'


def parse_if_match(request: Request) -> int | None:
    """Extract the expected version from the If-Match header, if present.

    Accepted forms:
      * ``If-Match: "13-..."``  (full ETag)   -> 13
      * ``If-Match: 13``                      -> 13
      * ``If-Match: W/"13-..."``              -> 13
    Returns None when the header is absent.
    """
    header = request.headers.get("if-match")
    if not header:
        return None
    value = header.strip()
    if value.startswith("W/") or value.startswith("w/"):
        value = value[2:]
    value = value.strip().strip('"')
    for part in value.split("-"):
        part = part.strip()
        if part.isdigit():
            return int(part)
    return None


def require_no_conflict(request: Request, matter: Matter) -> None:
    """Raise 409 when the client's expected version differs from the current one.

    Only enforced when the client actually sends If-Match (optional upgrade).
    """
    expected = parse_if_match(request)
    if expected is None:
        return
    current = getattr(matter, "version", 1)
    if expected != current:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Conflito de edição: a matéria mudou desde a última leitura "
                f"(esperava v{expected}, atual v{current}). Recarregue e tente novamente."
            ),
        )
