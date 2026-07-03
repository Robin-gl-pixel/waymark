/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // functions/ has its own jest config (server-side tests run against firebase-admin
  // types, not the RN test env). Kept separate so `npm test` at the root doesn't try
  // to compile Cloud Function code against expo's tsconfig base.
  testPathIgnorePatterns: ['/node_modules/', '/functions/'],
  // expo's tsconfig.base sets `jsx: react-native`, which leaves JSX untransformed
  // in ts-jest's output — Node can't parse a raw `<View>`. Override to the classic
  // React runtime so component sources transpile to `React.createElement(...)`, which
  // pairs with the `import React from 'react'` line at the top of every component.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
        },
      },
    ],
  },
};
