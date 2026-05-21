.PHONY: dev dev-up dev-build test lint migrate migrate-create clean down staging staging-up prod-up deploy-staging deploy-prod

dev:
	docker compose -f infra/docker-compose.yml up

dev-up:
	docker compose -f infra/docker-compose.yml up -d --build

dev-build:
	docker compose -f infra/docker-compose.yml up --build

test:
	@echo "Running API tests..."
	docker compose -f infra/docker-compose.yml run --rm --no-deps api pytest
	@echo "Running worker tests..."
	docker compose -f infra/docker-compose.yml run --rm --no-deps worker pytest
	@echo "Running signer tests..."
	docker compose -f infra/docker-compose.yml run --rm --no-deps signer pytest

test-api:
	docker compose -f infra/docker-compose.yml run --rm --no-deps api pytest

test-worker:
	docker compose -f infra/docker-compose.yml run --rm --no-deps worker pytest

test-signer:
	docker compose -f infra/docker-compose.yml run --rm --no-deps signer pytest

lint:
	cd apps/api && ruff check . && cd ../..
	cd apps/worker && ruff check . && cd ../..
	cd apps/signer && ruff check . && cd ../..
	cd apps/web-admin && npm run lint && cd ../..
	cd apps/web-public && npm run lint && cd ../..

migrate:
	docker compose -f infra/docker-compose.yml exec api alembic upgrade head

migrate-create:
	docker compose -f infra/docker-compose.yml exec api alembic revision --autogenerate -m "$(name)"

build:
	docker compose -f infra/docker-compose.yml build

down:
	docker compose -f infra/docker-compose.yml down

clean:
	docker compose -f infra/docker-compose.yml down -v
	rm -rf apps/api/.coverage apps/api/htmlcov
	rm -rf apps/worker/.coverage apps/worker/htmlcov
	rm -rf apps/signer/.coverage apps/signer/htmlcov

logs:
	docker compose -f infra/docker-compose.yml logs -f

# ── Staging ────────────────────────────────────────────────────────────────────

staging:
	docker compose -p sistemaweb-staging -f infra/docker-compose.staging.yml up

staging-up:
	docker compose -p sistemaweb-staging -f infra/docker-compose.staging.yml up -d --build --remove-orphans

staging-down:
	docker compose -p sistemaweb-staging -f infra/docker-compose.staging.yml down

staging-logs:
	docker compose -p sistemaweb-staging -f infra/docker-compose.staging.yml logs -f

# ── Produção ───────────────────────────────────────────────────────────────────

prod-up:
	docker compose -f infra/docker-compose.prod.yml up -d --build --remove-orphans

prod-down:
	docker compose -f infra/docker-compose.prod.yml down

# ── Deploy manual ──────────────────────────────────────────────────────────────

deploy-staging:
	bash scripts/deploy-staging.sh

deploy-prod:
	bash scripts/deploy-production.sh
