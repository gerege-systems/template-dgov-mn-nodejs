# Contributing · Хувь нэмэр оруулах

Thanks for your interest in improving **Government Template Platform V3.0**! / **Government Template Platform V3.0** (Цахим засаглалыг бүтээх суурь)-ийг сайжруулах сонирхолд тань баярлалаа!

## Getting started · Эхлэх

1. Fork the repo and create a branch from `main`: `git checkout -b feat/short-description`.
2. Set up the stack — see the [README](../README.md) Quick start.
3. Make your change in `backend/` and/or `frontend/`.

## Before opening a PR · PR нээхээс өмнө

**Backend (Go):**
```bash
cd backend
make fmt          # gofmt
make lint         # golangci-lint
make test         # unit tests
make pre-push     # mirror CI (lint + test + swag drift + build)
```

**Frontend (Next.js):**
```bash
cd frontend
npm run lint
npm run build
```

- Keep the **Clean Architecture** boundaries: the business/domain layers must not import the web framework.
- Add tests for new behavior. Update the relevant docs in `backend/docs/` (and the `_MN` counterpart).
- If you change HTTP handler annotations, run `make swag` so `docs/` stays in sync.
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
