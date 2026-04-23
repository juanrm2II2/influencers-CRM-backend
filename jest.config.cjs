/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/server.ts', '!src/**/index.ts'],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 60,
      statements: 60,
    },
  },
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
