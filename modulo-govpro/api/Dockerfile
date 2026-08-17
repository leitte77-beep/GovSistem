FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq-dev \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN mkdir -p /app/uploads

RUN chmod +x /app/entrypoint.sh

RUN groupadd -r govpro && useradd -r -g govpro -d /app -s /sbin/nologin govpro \
    && chown -R govpro:govpro /app

USER govpro

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
