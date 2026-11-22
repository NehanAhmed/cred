# Cred demo

A scratch Express host for `@cred-kit/express`. It exists to show how the router is mounted; it is
not a production application.

## Run

1. Copy `.env.example` to `.env.local` and fill in the MongoDB, JWT, URL, and SMTP values.
2. Start the demo in watch mode:

   ```bash
   pnpm --filter demo dev
   ```

   Or build and run it:

   ```bash
   pnpm --filter demo build
   pnpm --filter demo start
   ```

The API is mounted at `http://localhost:5000/api` by default. Change `PORT` in `.env.local` to use
a different port.

`.env.local` is ignored by git. Keep real credentials out of source and out of version control.
