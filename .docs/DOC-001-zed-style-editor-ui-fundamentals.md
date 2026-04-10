---
id: DOC-001
title: Zed-Style Editor UI Fundamentals
project: ticketbook
tags:
  - ux
  - editor
  - architecture
  - desktop
created: '2026-04-09T13:30:00.000Z'
updated: '2026-04-09T13:30:00.000Z'
refs:
  - zed
---

# Zed-Style Editor UI Fundamentals

These notes distill the parts of Zed's UI architecture that matter if you're building an editor-class Mac app in any framework. The key lesson is that "snappy" is mostly a product of state architecture, rendering boundaries, and input design, not the language.

## Core thesis

An editor feels fast when the app treats the window as one coherent interactive system:

- one shell state tree for layout, tabs, sidebars, focus, and commands
- one command system for keyboard shortcuts and UI actions
- one specialized editing surface instead of generic nested widgets
- aggressive virtualization so large lists and panels stay cheap

The design system matters, but it is not the main reason the product feels responsive.

## Layout model

Zed's layout is best understood as a shell made of stable slots:

- center workspace for panes and tabs
- left and right sidebars for navigation and secondary tools
- bottom dock for terminal, output, or contextual panels

That structure matters because it makes layout mutations cheap and predictable. Toggling a sidebar or moving focus between tabs is just a change to the shell model, not a separate navigation flow or a remount-heavy screen transition.

For a similar app, model layout explicitly:

- pane groups
- tab collections
- dock visibility and sizing
- focused item
- active workspace or project context

Keep this as app state, not scattered local component state.

## Editing surface

The editor itself should be a specialized surface, not just a pile of generic text components.

What makes this class of app feel different:

- text rendering is optimized for visible content
- wrapping, folds, inline UI, selections, and cursors are treated as view state
- input and repaint paths are short and predictable

If your editor is central to the product, this is the place to spend architectural effort. A generic form control can work for simple note apps, but editor-style apps usually need a dedicated text surface or a purpose-built editor engine.

## Keyboard-first command system

Zed feels immediate because keyboard handling is not bolted on afterward. Commands are first-class and routed through focus-aware scopes.

Good model:

- define commands once
- bind keyboard shortcuts to commands
- let buttons, menus, palette items, and programmatic triggers all dispatch the same commands
- scope shortcuts by context, such as editor, sidebar, command palette, or workspace shell

This avoids duplicated behavior and makes tabs, docks, and panels behave consistently whether the user clicks or uses the keyboard.

## Virtualize everything large

Performance problems in editor apps usually come from side UI as much as the editor itself.

Virtualize or otherwise cap work for:

- file trees
- search results
- symbol lists
- command menus
- activity feeds
- long tab strips or pane lists

Only compute layout and paint for what is visible or about to become visible. This matters more than micro-optimizing individual components.

## Code organization

A useful mental model is three layers:

1. Runtime and layout primitives
   This handles rendering, events, focus, state propagation, scheduling, and low-level UI building blocks.

2. Reusable app components
   Tabs, menus, buttons, tooltips, list rows, splitters, panels, and other shared pieces.

3. Product shell and features
   Workspace layout, editor panes, docks, project navigation, command palette, terminal, and feature-specific workflows.

The win is separation of concerns:

- the shell owns app structure
- shared components stay reusable
- the editor and heavy surfaces can be optimized without distorting the whole app

## What makes it feel snappy

These are the biggest UX levers:

- actions happen in place instead of navigating away
- focus is explicit and preserved
- tab and sidebar operations are instant state changes
- the app avoids full-tree rerenders for local interactions
- visible content is prioritized over background work
- keyboard paths are as complete as mouse paths

Users describe this as "native" or "fast", but the underlying quality is mostly reduced interaction friction and bounded rendering work.

## Practical guidance for Ticketbook

If Ticketbook grows into a native editor-style Mac app, the durable lessons are:

- keep a single workspace-shell model for tabs, docks, and selection
- treat tasks, plans, docs, terminal sessions, and conversations as primitives within that shell
- build a command registry early and route shortcuts through it
- keep the center pane flexible, but make layout mutations explicit data operations
- use virtualization in any list that can grow beyond a screenful
- preserve focus and selection across sidebar toggles, tab switches, and panel changes
- make the copilot, terminal, and detail panes peers inside the same shell instead of separate app modes

## What not to copy blindly

Do not cargo-cult Zed's implementation details. The lasting ideas are:

- coherent window state
- specialized surfaces for heavy interactions
- keyboard-first actions
- cheap layout changes
- careful rendering boundaries

Those transfer to AppKit, SwiftUI with careful escape hatches, Electron, Tauri, or a custom webview shell. The implementation stack can change. The interaction model is the real asset.
