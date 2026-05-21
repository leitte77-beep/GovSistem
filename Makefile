.PHONY: dev dev-up dev-build test lint migrate migrate-create clean down

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
