.PHONY: setup lint dev-backend dev-frontend test test-contract test-backend migrate seed

setup:
	yarn install
	cd backend && yarn install
	cd frontend && yarn install
	cd contract-tests && yarn install

# Zero-warning gate, same checks as the pre-commit hook but over the whole repo.
lint:
	yarn prettier --check .
	yarn eslint --max-warnings 0 backend contract-tests
	cd frontend && yarn lint

dev-backend:
	cd backend && PORT=8000 yarn start:dev

dev-frontend:
	cd frontend && yarn dev

test:
	cd backend && yarn test
	cd frontend && yarn test
	cd contract-tests && yarn test

# Black-box HTTP contract suite; boots backend/ on a temp DB.
test-contract:
	cd contract-tests && yarn test

test-backend:
	cd backend && yarn test

migrate:
	cd backend && yarn build && yarn migrate

seed:
	cd backend && yarn build && yarn seed
