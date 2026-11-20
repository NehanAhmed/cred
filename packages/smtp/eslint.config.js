import tseslint from 'typescript-eslint';

/**
 * @cred-kit/smtp is the Nodemailer implementation of core's `EmailAdapter`
 * contract: it owns SMTP transport concerns only. HTTP, database, OAuth and
 * token libraries belong to apps/api or @cred-kit/core, so importing them here is
 * an error.
 */
const outOfScopeLibraries = [
  'express',
  'mongoose',
  'passport',
  'passport-google-oauth20',
  'passport-github2',
  'jsonwebtoken',
  'bcryptjs',
  'express-rate-limit',
  'helmet',
  'cors',
  'cookie-parser'
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
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: outOfScopeLibraries.map((lib) => ({
            group: [lib, `${lib}/*`],
            message: `@cred-kit/smtp only implements email delivery; "${lib}" belongs in apps/api or @cred-kit/core.`
          }))
        }
      ]
    }
  }
);
