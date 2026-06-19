.PHONY: dev dev-up dev-build test lint migrate migrate-create clean down staging staging-up prod-up deploy-staging deploy-prod
.PHONY: chatgov-up chatgov-down chatgov-build chatgov-dev

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
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" != "master" ] && [ "$$BRANCH" != "main" ]; then \
		echo "ERRO: Você está na branch '$$BRANCH'. Produção só pode ser atualizada a partir de 'master' ou 'main'."; \
		echo "Use: make deploy-prod  (ou bash scripts/deploy-production.sh)"; \
		exit 1; \
	fi
	docker compose -f infra/docker-compose.prod.yml up -d --build --remove-orphans

prod-down:
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" != "master" ] && [ "$$BRANCH" != "main" ]; then \
		echo "ERRO: Você está na branch '$$BRANCH'."; \
		echo "Produção só pode ser gerenciada a partir de 'master' ou 'main'."; \
		exit 1; \
	fi
	docker compose -f infra/docker-compose.prod.yml down

# ── Deploy manual ──────────────────────────────────────────────────────────────

deploy-staging:
	bash scripts/deploy-staging.sh

deploy-prod:
	bash scripts/deploy-production.sh

# ── ChatGov ─────────────────────────────────────────────────────────────────────

chatgov-up:
	docker compose -f modulo-chatgov/docker-compose.yml up -d --build

chatgov-down:
	docker compose -f modulo-chatgov/docker-compose.yml down

chatgov-build:
	docker compose -f modulo-chatgov/docker-compose.yml build

chatgov-dev:
	cd modulo-chatgov/backend && npm install && node src/migrations/run.js && node src/index.js

# ── GovAvalia ───────────────────────────────────────────────────────────────────

govavalia-up:
	docker compose -f infra/docker-compose.yml up -d --build govavalia

govavalia-down:
	docker compose -f infra/docker-compose.yml rm -sf govavalia

govavalia-build:
	docker compose -f infra/docker-compose.yml build govavalia

govavalia-logs:
	docker compose -f infra/docker-compose.yml logs -f govavalia

govavalia-dev:
	cd modulo-govavalia && npm install && npm run migrate && npm start

govavalia-migrate:
	docker compose -f infra/docker-compose.yml exec govavalia node scripts/migrate.js
