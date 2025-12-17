# AGENTS Instructions

Important: We use fish for shell

Before committing changes, contributors must ensure the code builds, lints and passes tests.

Run the following commands and confirm they exit without errors:

- `pnpm tsc`
- `pnpm lint`
- `pnpm test`

## Utilities

Codex can query CI status for a GitHub pull request using
`getPullRequestBuildStatus` located at `src/lib/github/getPrStatus.ts`.
Provide the GitHub repo owner, repo name, PR number and an access token.
