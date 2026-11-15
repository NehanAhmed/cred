import tseslint from 'typescript-eslint';

/**
 * @cred/mongo-storage is the Mongoose implementation of core's storage
 * contracts: it owns database models and adapters only. HTTP, auth-token,
 * mail and OAuth concerns belong to apps/api or @cred/core, so importing
 * their libraries here is an error.
 */
const outOfScopeLibraries = [
  'express',
  'passport',
  'passport-google-oauth20',
  'passport-github2',
  'nodemailer',
  'express-rate-limit',
  'helmet',
  'cors',
  'cookie-parser',
  'jsonwebtoken',
  'bcryptjs',
];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Mongoose documents are typed by the host application's schema, which
      // the adapter does not know about, so `Model<any>` is intentional.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: outOfScopeLibraries.map((lib) => ({
            group: [lib, `${lib}/*`],
            message: `@cred/mongo-storage only implements database storage; "${lib}" belongs in apps/api or @cred/core.`,
          })),
        },
      ],
    },
  },
);
