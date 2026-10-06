# Lumiara WhatsApp Sales Agent

Private engineering repository for Lumiara Group's multilingual B2B WhatsApp sales agent.

## Current status

The modular agent in `src/` runs in **shadow mode**. It evaluates customer messages and records proposed actions, but does not send WhatsApp messages. This is intentional while historical conversations are used for regression testing.

The last supplied single-file production snapshot is stored in `legacy/production-snapshot-v5.1.5.js` for reference and rollback analysis. It must not be deployed automatically from this repository.

## Architecture

- `src/understanding.js` — structured interpretation of the buyer's latest message.
- `src/language.js` — persistent language selection and language validation.
- `src/project-state.js` — separate football, hoodie and yoga projects per customer.
- `src/policy.js` — pricing boundaries, approved actions and human handoff rules.
- `src/reply-guard.js` — blocks wrong-language replies, invented amounts and unsupported totals.
- `src/orchestrator.js` — coordinates understanding, state, policy and response generation.
- `src/shadow-worker.js` — Cloudflare Worker entry point for no-send evaluation.
- `tests/core.test.js` — deterministic regression tests.

## Safety rules

1. Never commit Meta, Cloudflare, WhatsApp or Sales OS credentials.
2. Never report a catalog as delivered only because Meta accepted the send request.
3. Keep `sent`, `delivered`, `read` and `failed` as separate message states.
4. Do not route the production webhook to the shadow Worker.
5. Require reviewed historical-message tests before enabling automatic replies.

## Local verification

```bash
npm test
```

Baseline: 50 deterministic tests must pass. Production activation additionally requires reviewed tests against at least 100 anonymized real customer messages.

## Cloudflare setup

Copy `wrangler.example.jsonc` to `wrangler.jsonc`, insert only non-secret resource identifiers, and add secrets with Cloudflare's secret manager. Do not place real secret values in configuration files or GitHub.

## Deployment policy

The first deployment target is a separate shadow Worker. Production deployment remains manual until catalog delivery receipts, multilingual replies, pricing logic and human handoff all pass end-to-end verification.

