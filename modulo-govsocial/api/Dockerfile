FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq-dev \
    build-essential \
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libffi-dev \
    libcairo2 \
    libgdk-pixbuf-xlib-2.0-0 \
    libgdk-pixbuf2.0-common \
    shared-mime-info \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN mkdir -p /app/uploads

RUN chmod +x /app/entrypoint.sh

RUN groupadd -r govsocial && useradd -r -g govsocial -d /app -s /sbin/nologin govsocial \
    && chown -R govsocial:govsocial /app

USER govsocial

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
