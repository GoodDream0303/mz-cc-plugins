# HUD oversized image results implementation plan

> **For agentic workers:** Execute inline using superpowers:executing-plans and test-driven-development; one independent final review.

**Goal:** Read tool lifecycle from large image results without buffering images or showing a permanent warning for valid image records.

**Architecture:** Keep SessionReader's normal fast path. On overflow, use an incremental bounded JSON string filter to omit inline image_url data, then apply the existing parsed record.

**Tech Stack:** TypeScript, native Node filesystem/StringDecoder, node:test; Node20+; no runtime dependencies.

**Spec:** docs/superpowers/specs/2026-11-12-hud-oversized-images-design.md

## Global constraints

- Keep the existing 2 MiB bound on retained record text and ordinary error handling.
- Preserve JSON validation, session identity, executor metadata, and privacy boundaries.
- Use the existing isolated feat/codex-hud worktree; preserve unrelated untracked files.
- Do not publish, reinstall, operate other hosts, or modify Codex.

## Review focus

- Discarded invalid JSON escapes must not create valid fabricated lifecycle records.
- Read/chunk boundaries, including an unfinished image, must retain parser state correctly.
- Literal text containing image_url and quoted delimiters must not be mistaken for image properties.
- Errors, pending executor IDs, identity mismatches, and subsequent telemetry must remain authoritative.
- Non-image overflow and many small values must remain bounded and recover at the next newline.

### Task 1: Bound and project large image records

**Files:** Create codex-hud/src/image-record.ts; modify codex-hud/src/reader.ts; test codex-hud/test/reader-images.test.mjs and codex-hud/test/image-record.test.mjs; regenerate affected dist; update codex-hud/docs/validation.md.

**Interfaces:** Internal ImageRecord(limit: number), write(chunk: string): void, finish(): string | undefined, failed: boolean. SessionReader external interface is unchanged.

- [x] Add real-file synthetic regressions: four-image completion, partial append with failure header, pending executor/poll completion, malformed image escapes, unchanged non-image limits, identity and replacement recovery.
- [x] Run node --test --test-concurrency=1 test/reader-images.test.mjs against existing dist and observe lifecycle/warning failures.
- [x] Implement ImageRecord's bounded projection and reader overflow/reset integration.
- [x] Build and run reader-images plus reader/agent tests; all pass.
- [x] Replay the affected transcript read-only and emit only warnings/status counts, never body text.
- [x] Run npm test -- --test-concurrency=1; all tests pass. Record exact evidence in validation.md. Final: 378/378, zero failures/cancellations/skips.
- [x] Obtain one independent review; fix important findings with RED/GREEN and affected checks/full suite as appropriate.
- [x] Keep the verified fix on feat/codex-hud as one local change-related commit; publication remains a separate request.
