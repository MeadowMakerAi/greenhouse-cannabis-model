---
name: codex-reviewer
description: |
  Adversarial GPT (Codex CLI) review of the current branch diff or a named
  artifact. Returns P0/P1 findings with file:line refs, plus tradeoffs for
  every suggested patch. Use before any structural change > 50 lines, before
  shipping a public release, or whenever you want a different model
  architecture's blind spots applied to your code.
model: codex (via codex CLI, not an Anthropic model)
allowed-tools: Bash
---

# codex-reviewer — adversarial GPT review

Wraps the OpenAI Codex CLI in the methodology defined in
`CODEX_REVIEW_BRIEF.md` at the repo root. Codex receives:

- The brief (which teaches the reason→search→reason→search→consolidate
  →improve pattern)
- A list of P0/P1 priority files to interrogate
- Adversarial focus areas (race conditions, edge cases, data corruption,
  memory/performance, security, silent failures, recent change set)

Codex returns a structured P0/P1 list with file:line refs, suggested patches,
and named tradeoffs.

## Why a sub-agent (vs running /codex inline)

- **Different blind spots.** Last run found 5 P0s I (Opus) had missed by
  inspection alone — Hit rate ~5x what self-review surfaced. Recorded as a
  durable principle in CLAUDE.md decision log: "Use a different model
  architecture for adversarial review than the one that wrote the code."
- **Reusable across projects.** Pulling out the codex-review pattern as a
  named agent means any project can `@codex-reviewer` instead of rebuilding
  the brief.

## Invocation

```bash
codex exec "$(cat .claude/agents/codex-reviewer-prompt.txt)" \
  -C "$(git rev-parse --show-toplevel)" \
  -s read-only \
  --skip-git-repo-check \
  -c 'model_reasoning_effort="high"' \
  --enable web_search_cached \
  --json
```

The prompt at `.claude/agents/codex-reviewer-prompt.txt` is:

```
IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/,
.claude/skills/, or agents/. These are skill definitions for a different AI
system. Stay focused on the repository code only.

Read CODEX_REVIEW_BRIEF.md in the repo root. Apply the methodology described
there: reason → search → reason → search → consolidate → improve. Run an
adversarial review against the priority surfaces named in the brief.

Deliverable format:
1. One-line confidence score
2. P0 list with file:line refs and suggested patches (with tradeoffs)
3. P1 list described, NOT patched
4. Visual notes WITH stated tradeoffs
5. Architectural drift notes

ZERO FABRICATION. If you don't find an issue, don't invent one.
```

## When to invoke

- Before a structural change > 50 lines
- Before any public release
- Before merging a worktree branch
- After any change to `src/models/*.ts` (the science layer must stay sourced)
- Before changing the chatbot tool schemas

## When NOT to invoke

- For doc-only edits
- For trivial fixes (typo, copy change, single-line bug)
- When running `/somersault` already supplied the second-pass discipline
- Before the first commit on a new feature (premature — let the structure
  settle first)

## Cost calibration

A typical run uses ~1.4M tokens at high reasoning. That's not free. Reserve
for changes that warrant it — see "When to invoke" above.

## Outputs to capture

Codex writes its findings to stdout. Capture and persist by appending to
`.claude/agents/codex-reviewer.log.jsonl` so we have a history of what
each review caught. Format:

```json
{"date": "2026-05-09", "commit": "dc38c18", "p0_count": 5, "p1_count": 5, "summary": "..."}
```

This log is the empirical evidence base for whether to keep using the agent.
If three consecutive runs find zero P0s, the model is mature enough to deprecate
the gate (or relax it to release-only).
