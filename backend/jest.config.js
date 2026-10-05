/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { ...require('./tsconfig.json').compilerOptions, rootDir: '.', types: ['node', 'jest'] } },
    ],
  },
  testTimeout: 20000,
};
