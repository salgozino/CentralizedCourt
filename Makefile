VENV := backend/.venv
PY := $(VENV)/bin/python

.PHONY: setup dev-backend dev-frontend test migrate build lint seed e2e

setup:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r backend/requirements.txt
	cd frontend && yarn install

dev-backend:
	cd backend && .venv/bin/python manage.py runserver 8000

dev-frontend:
	cd frontend && yarn dev

test:
	cd backend && .venv/bin/python -m pytest
	cd frontend && yarn test

migrate:
	cd backend && .venv/bin/python manage.py migrate

seed:
	cd backend && .venv/bin/python manage.py seed

build:
	cd frontend && yarn build

lint:
	cd frontend && yarn lint

e2e:
	cd frontend && yarn e2e
