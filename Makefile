.PHONY: setup dev-backend dev-frontend test test-contract migrate seed

setup:
	cd backend && yarn install
	cd frontend && yarn install
	cd contract-tests && yarn install

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

migrate:
	cd backend && yarn build && yarn migrate

seed:
	cd backend && yarn build && yarn seed
