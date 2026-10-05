/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  globalSetup: '<rootDir>/src/globalSetup.ts',
  globalTeardown: '<rootDir>/src/globalTeardown.ts',
  testTimeout: 20000,
};
