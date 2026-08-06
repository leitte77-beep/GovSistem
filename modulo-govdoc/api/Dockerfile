FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq-dev \
    build-essential \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN mkdir -p /app/storage /backups \
    && chmod +x /app/entrypoint.sh \
    && groupadd -r govdoc && useradd -r -g govdoc -d /app -s /sbin/nologin govdoc \
    && chown -R govdoc:govdoc /app /backups

USER govdoc

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
