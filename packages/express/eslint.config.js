import tseslint from 'typescript-eslint';

/**
 * @cred/express is the Express transport adapter: it owns routing, request
 * parsing, cookies, redirects, rate limiting, and HTTP error mapping. Storage,
 * mail, Passport strategies, and auth business logic belong to @cred/core or
 * the dedicated adapter packages, so importing them here is an error.
 */
const outOfScopeLibraries = [
  'mongoose',
  'passport',
  'passport-google-oauth20',
  'passport-github2',
  'nodemailer',
  'bcryptjs',
  'jsonwebtoken',
  'helmet',
  'cors',
  '@cred/mongo-storage',
  '@cred/smtp',
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
          patterns: outOfScopeLibraries.map((lib) => ({
            group: [lib, `${lib}/*`],
            message: `@cred/express only implements the Express transport; "${lib}" belongs in @cred/core or a dedicated adapter package.`,
          })),
        },
      ],
    },
  },
);
