/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'babel-jest',
      {
        // Let babel-jest use our babel.config.cjs
      },
    ],
  },
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '\\.(svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/src/__tests__/fileMock.js',
  },
}

