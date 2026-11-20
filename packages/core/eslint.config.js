import tseslint from 'typescript-eslint';

/**
 * @cred-kit/core is framework-agnostic: all external concerns (HTTP, DB, mail,
 * OAuth strategies) are injected as adapters (see src/types/deps.types.ts).
 * Adapter-specific libraries must therefore never be imported here.
 */
const adapterLibraries = [
  'express',
  'mongoose',
  'passport',
  'passport-google-oauth20',
  'passport-github2',
  'nodemailer',
  'express-rate-limit',
  'helmet',
  'cors',
  'cookie-parser',
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
      'no-restricted-imports': [
        'error',
        {
          patterns: adapterLibraries.map((lib) => ({
            group: [lib, `${lib}/*`],
            message: `@cred-kit/core is framework-agnostic; "${lib}" belongs in an adapter package (apps/api or a future @cred-kit/express / @cred-kit/storage adapter), not in core.`,
          })),
        },
      ],
    },
  },
);
