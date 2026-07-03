/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts'],
  // The rules test suite spins up its own initializeTestEnvironment and expects
  // a Firestore emulator on localhost:8080 (default). Serial execution avoids
  // cross-suite data collisions in the shared emulator project.
  maxWorkers: 1,
  testTimeout: 30000,
};
