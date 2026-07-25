# Contributing · Хувь нэмэр оруулах

Thanks for your interest in improving **Government Template Platform V3.0**! / **Government Template Platform V3.0** (Цахим засаглалыг бүтээх суурь)-ийг сайжруулах сонирхолд тань баярлалаа!

## Getting started · Эхлэх

1. Fork the repo and create a branch from `main`: `git checkout -b feat/short-description`.
2. Set up the stack — see the [README](../README.md) Quick start.
3. Make your change in `backend/` and/or `frontend/`.

## Before opening a PR · PR нээхээс өмнө

**Backend (Node.js · TypeScript):**
```bash
cd backend
npm run fmt       # prettier --write
npm run lint      # eslint --max-warnings 0 (type-aware)
npm test          # unit tests (vitest)
npm run pre-push  # mirror CI: fmt + lint + typecheck + test + openapi drift + build + ESM smoke
```

**Frontend (Vite · React):**
```bash
cd frontend
npm run lint
npm test
npm run build     # build + lint + typecheck (what CI runs)
```

- Keep the **Clean Architecture** boundaries: the business/domain layers must not import the web framework.
- Add tests for new behavior. Update the relevant docs in `backend/docs/` (and the `_MN` counterpart).
- If you add or change a route or DTO, run `npm run openapi` and commit
  `backend/docs/openapi.json` — CI fails on drift.
- Relative imports must carry the `.js` extension (the package is ESM).
- Follow the existing code style and the bilingual comment/doc convention.

## Commit messages · Commit мессеж

Use clear, imperative messages (Conventional Commits encouraged):
`feat(auth): add passkey login`, `fix(cors): …`, `docs: …`, `test: …`.

## Pull requests · PR

- Keep PRs focused and small where possible.
- Fill in the PR template; link any related issue.
- All CI checks must pass.

## Reporting bugs / requesting features

Open an issue using the templates under `.github/ISSUE_TEMPLATE/`. For security
issues, **do not** open a public issue — see [SECURITY.md](../SECURITY.md).

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
