# UI – ECG Research Console

The UI project is a React + TypeScript single-page app (Vite 7, React 19, TanStack Query) for laboratory operators to manage Fitbit ECG enrollment, verification, analytics, and continuous monitoring flows.

## Features
- Participant roster with alias mapping and enrollment progress tracking.
- Guided 30-second enrollment wizard with metadata/tags/notes capture.
- Verification control panel with threshold sweep, comparison table, and attempt labeling.
- Analytics dashboard aggregating FAR/FRR estimates from logged attempts.
- Continuous monitor visualizing rolling window scores and pass/fail rates.

## Tech Stack
| Area | Implementation |
|------|----------------|
| Build tooling | Vite + SWC, TypeScript strict mode |
| State/data | React hooks + TanStack Query (Fitbit session APIs) |
| Styling | `App.css`, CSS modules, Recharts visualizations |
| Testing | Vitest + Testing Library (unit), Playwright (smoke E2E) |

## Prerequisites
- Node.js 20+ (ensures compatibility with Vite/Playwright toolchain)
- npm 10+ or pnpm/yarn equivalent
- Running backend API (default at `http://localhost:5104`)

## Environment
Copy `.env.local` and set the API origin if it differs from the default:

```bash
cp .env.local.example .env.local  # if you maintain a template
echo VITE_API_BASE_URL=http://localhost:5104 > .env.local
```

The Axios client reads `VITE_API_BASE_URL`; when absent, it falls back to `http://localhost:5104`.

## Install & Run
```bash
cd UI
npm install
npm run dev          # launches Vite dev server on http://127.0.0.1:5173
npm run build        # type-check + production bundle
npm run preview      # serves the built app locally
```

## Automated Tests
| Command | Description |
|---------|-------------|
| `npm run test:unit` | Runs Vitest suites (hooks/components) with jsdom + jest-dom, generates V8 coverage. |
| `npm run test:unit:watch` | Interactive watch mode while developing unit tests. |
| `npm run test:e2e` | Launches Vite, then executes Playwright Chromium smoke tests (`tests/e2e/smoke.spec.ts`). |

### Current Coverage
- **Unit suites**: `useLocalStorage` hook persistence and `VerificationPanel` interaction flow.
- **E2E smoke**: Confirms SPA shell renders and tab navigation works while intercepting backend calls.

## Folder Guide
| Path | Purpose |
|------|---------|
| `src/api/client.ts` | Axios wrapper normalizing field names and signal quality heuristics. |
| `src/components/*` | Feature-focused React components (ParticipantsTab, EnrollmentWizard, VerificationPanel, ContinuousMonitor, AnalyticsTab). |
| `src/hooks/useLocalStorage.ts` | Shared hook for alias persistence. |
| `src/types.ts` | Shared DTO definitions matching backend payloads. |
| `tests/e2e/*` | Playwright smoke tests and fixtures. |
| `vite.config.ts` | Vite build config plus Vitest options (globals, jsdom env, coverage thresholds). |

## Documentation & References
- Backend contract: see root `README.md` and `docs/ECG_AUTH.md` for endpoint expectations.
- UI behaviour: inline comments in `App.tsx` describe tab orchestration and TanStack Query usage.
- Testing setup: `src/setupTests.ts` seeds jest-dom matchers for Vitest, while `playwright.config.ts` documents how the e2e environment is started.

Keep this README synced with future changes (new tabs, data sources, or test commands). Update the commands/coverage targets whenever the CI process evolves.
