SHELL := /bin/bash
.DEFAULT_GOAL := help
ifndef COMPOSE
COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; \
	elif command -v docker-compose >/dev/null 2>&1; then echo docker-compose; \
	elif command -v podman >/dev/null 2>&1; then echo "podman compose"; fi)
endif
ifndef PNPM
PNPM := $(shell command -v pnpm >/dev/null 2>&1 && echo pnpm || echo "corepack pnpm")
endif

DC := $(COMPOSE) -f infra/docker-compose.yml
STAMP := node_modules/.install-stamp

.PHONY: help install up down reset seed chaos check measure client logs check-env

help:
	@echo "make up      start Synapse, wait for health, seed data"
	@echo "make chaos   run the chaos bot against #big and #medium (ARGS=\"--intensity high\")"
	@echo "make check   compare the running client's timeline with Synapse"
	@echo "make down    stop Synapse (data is kept)"
	@echo "make reset   wipe all Synapse data and start again"
	@echo "make client  run the client on http://localhost:5173"
	@echo "make measure scroll fps and heap measurements against the running client"
	@echo "make logs    follow Synapse logs"

check-env:
	@if [ -z "$(COMPOSE)" ]; then echo "Docker (with compose) is required." >&2; exit 1; fi
	@node -e 'if (+process.versions.node.split(".")[0] < 20) { console.error("Node 20+ is required, found " + process.version); process.exit(1) }'

$(STAMP): package.json tools/package.json client/package.json $(wildcard pnpm-lock.yaml)
	$(PNPM) install
	@touch $@

install: check-env $(STAMP)

up: install
	$(DC) up -d
	$(PNPM) wait
	$(PNPM) seed

down: check-env
	$(DC) down

reset: check-env
	$(DC) down -v
	$(MAKE) up

seed: install
	$(PNPM) seed
chaos: install
	$(PNPM) chaos $(ARGS)

check: install
	$(PNPM) check

measure: install
	$(PNPM) --filter tools measure

client: install
	$(PNPM) --filter chat-client dev

logs: check-env
	$(DC) logs -f synapse
