/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // functions/ has its own jest config (server-side tests run against firebase-admin
  // types, not the RN test env). Kept separate so `npm test` at the root doesn't try
  // to compile Cloud Function code against expo's tsconfig base.
  testPathIgnorePatterns: ['/node_modules/', '/functions/'],
};
