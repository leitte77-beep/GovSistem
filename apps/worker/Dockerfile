FROM python:3.14-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt


FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/root/.local/bin:$PATH

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-xlib-2.0-0 \
        libffi-dev \
        shared-mime-info \
        libcairo2 \
        && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /root/.local /root/.local
COPY . .

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD celery -A app.worker inspect ping || exit 1

CMD celery -A app.worker worker --loglevel=info --concurrency=${WORKER_CONCURRENCY:-4}
