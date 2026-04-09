---
id: TKTB-025
title: Agent handoff and interaction
status: backlog
tags:
  - ideas
created: '2026-04-03T22:28:31.700Z'
updated: '2026-04-09T03:16:28.315Z'
---

I want the ability to kick off tickets or plans or just things from within the app to an agent. Now that could be kicking it off to a coding agent in a terminal. Or maybe run it headlessly in the background. Ideally also includes just a CLI command that we can paste into a terminal. So something like "Claud" and then the ticket number and maybe some prompt. The theme here really is the app and the coding agent should seamlessly interact. Now the other thing I was thinking is it would be nice if I could just render the coding agent in the app. So potentially we just render a terminal window. I'm not sure if we can do this in a web app, so maybe we have to move all of this to a desktop app.

A few ideas here:

- button to start working on a specific ticket
- kick off all open tickets
- button to brainstorm plan with an agent
- get feedback on a ticket/plan

## @ mentions — rich context in chat

Add the ability to reference ticketbook primitives (tickets, plans) as rich context in the copilot chat using `@` mentions.

### Command menu behavior
- Typing `@` opens a command menu (popover) showing primitives
- Searchable by both primitive ID (e.g. `TKTB-025`) and title
- Max 5 results shown at a time
- **Category filtering:** typing `@plans` + Tab/Enter narrows results to just plans; `@tickets` + Tab/Enter narrows to just tickets. Without a category prefix, search across all primitives.

### Quick-add buttons
- Tickets and plans should have an "Add to chat" button in their detail views
- Clicking it adds the primitive as rich context to the active copilot conversation

### Rich context
- When a primitive is mentioned, its full content (frontmatter + body) should be injected as context into the chat message so the agent has the complete picture
