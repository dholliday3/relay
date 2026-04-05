---
id: TKTB-046
title: Agent feedback loop and validation workflow
status: open
created: '2026-04-05T06:30:00.000Z'
updated: '2026-04-05T06:30:00.000Z'
---

Want a better agent feedback loop where when an agent implements a ticket, there's a clean way to surface the status of the ticket better.

## Feedback status

Add a distinct `feedback` status (between in-progress and done) so the human knows to validate. The workflow becomes:

`open` → `in-progress` → `feedback` → `done`

## Agent debrief on completion

When an agent moves a ticket to `feedback`, it should provide clear, concise context of:
- What was implemented
- Any concerns or caveats
- What needs to be validated (manual testing, visual review, edge cases)

This goes in the agent notes section (already exists via `<!-- agent-notes -->` marker).

## Confidence interval

Include a confidence level (e.g. `high`, `medium`, `low`) so the human gets a good feel for what they can blindly trust vs. what needs closer review. This could be a frontmatter field like `confidence: high`.

## Custom instructions for auto-resolution

Allow project-specific or human-specific custom instructions that define when to skip feedback and go straight to done. Examples:
- "For very small changes that have full test coverage, just move to done"
- "For changes that can't be fully covered by tests, or might need visual testing, use feedback needed"
- "For UI changes, always use feedback"

These could live in the ticketbook config (`.tickets/.config.yaml`) as `agentRules` or similar.

## Agent skill integration

Correlate this to the existing ticketbook MCP tools so that whatever coding agent is being used has instructions on how to interact with tickets. The MCP tool descriptions should include:
- When to move to `feedback` vs `done`
- How to write the debrief
- How to set the confidence level
- Reference to any custom agent rules from config

Should probably include agent instructions with each ticket response to ensure the skill gets used every turn — i.e., when listing or reading a ticket, append a reminder of the workflow expectations.
