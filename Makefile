VENV := backend/.venv
PY := $(VENV)/bin/python

.PHONY: setup dev-backend dev-frontend test test-contract migrate

setup:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r backend/requirements.txt
	cd frontend && yarn install
	cd contract-tests && yarn install
	cd backend-nest && yarn install

dev-backend:
	cd backend && .venv/bin/python manage.py runserver 8000

dev-frontend:
	cd frontend && yarn dev

test:
	cd backend && .venv/bin/python -m pytest
	cd frontend && yarn test

# Black-box HTTP contract suite; CONTRACT_BACKEND=django (default) or nest.
test-contract:
	cd contract-tests && yarn test

migrate:
	cd backend && .venv/bin/python manage.py migrate
