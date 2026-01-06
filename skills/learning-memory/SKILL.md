---
name: learning-memory
description: Learning-focused knowledge base for building deep understanding over time. Use when user learns something new, asks to save concepts, wants to review what they know, or mentions their toolbox. Triggers on learning discussions, "save this", "remember", "what do I know about", "add to toolbox", "show my concepts", "list my tools".
---

# Learning Memory

A knowledge base for **building deep understanding**, not just storing facts. Designed for non-technical builders who want to truly understand what they learn.

## Core Philosophy

This is NOT a generic note-taking system. It's a **learning companion** that helps knowledge compound over time.

Goals:
- **Build mental models** - Not facts, but understanding
- **Write for future self** - When you forget, you can re-learn quickly
- **Keep it shareable** - No private details, so you can share with others
- **Only real experience** - Only save what you've actually learned or used

Before any write: *Will this help me understand when I've forgotten?*
Before any read: *What context might enrich this conversation?*

## Namespace Structure

Two top-level namespaces with different visibility:

```
public/                       --> Shareable with others
  concepts/                   --> Understanding how things work
    computing/                --> Software, programs, architecture
    networking/               --> Networks, protocols, connectivity
    learning/                 --> Meta-learning and retention techniques
    [new-topic]/              --> Add new domains as you learn
  toolbox/                    --> Tools you've personally used
    _index                    --> Index of all tools
    networking/               --> VPNs, tunnels, connectivity tools
    ai-agents/                --> AI assistants and tools
    devtools/                 --> Development utilities

private/                      --> Only visible to you (not shared)
  sessions/                   --> Learning session logs
    _latest                   --> Most recent session summary
    YYYY-MM-DD                --> Session logs by date
  notes/                      --> Personal notes, scratchpad
```

**Rule:**
- Save concepts and toolbox entries to `public/` (shareable)
- Save session logs and personal notes to `private/` (only you can read)

## Content Standards

### Concept Entries

Every concept should help "future you" understand when you've forgotten:

```
CONCEPT NAME IN CAPS
====================

1. What it is (simple definition)

2. Why it exists (what problem it solves)

3. How it works:
   - Use ASCII diagrams for architecture/flows
   - Show the components and how they interact
   - Include concrete examples

4. Analogy (relate to something familiar)
   Example: "IP is like a building address, port is like apartment number"

5. Mental model summary
   - Tie it all together
   - "The key insight is..."
```

### Toolbox Entries

Only add tools you've actually used and understand:

```
TOOL NAME

Category: [category]
Website: [url]
Cost: [free/paid]

What it does:
[Brief description]

When I used it:
[Personal experience - when and why you used it]

When to use it:
[Future reference - scenarios where this tool helps]

Install/Usage:
[Brief how-to]
```

### Visual Diagrams

Use ASCII diagrams for architecture and flows:

```
+------------------+     +------------------+
|   Component A    |---->|   Component B    |
|                  |     |                  |
|  - Does X        |     |  - Does Y        |
|  - Does Z        |     |  - Does W        |
+------------------+     +------------------+
```

## Interaction Rules

### ALWAYS Ask Before Saving

Never auto-save. Always:
1. Offer: "Want me to save this to Ensue?"
2. If yes: Show what will be saved
3. Get confirmation
4. Save
5. Show what was saved

### When User Learns Something New

After explaining a concept through Q&A:
- Offer to save it: "Want me to save this to your knowledge base?"
- Draft the entry with diagrams and examples
- Show the draft
- Save after approval

### When User Mentions a New Tool

Only after they've used it:
- Offer: "Want to add this to your toolbox?"
- Confirm they understand it (don't add tools they haven't grasped)
- Create entry with their experience

### Retrieving Knowledge

When topics come up:
- Check concepts/ for background knowledge
- Check toolbox/ for relevant tools
- Surface related concepts they may have forgotten

## Anti-Patterns (DON'T Do These)

1. **Don't save without asking** - Always get approval first
2. **Don't add unused tools** - Only tools they've actually used
3. **Don't add misunderstood concepts** - If they don't get it yet, teach first
4. **Don't include private details** - No API keys, passwords, personal paths
5. **Don't save generic docs** - Only their personal understanding
6. **Don't create shallow entries** - If you can't make it deep, don't save it

## Setup

Uses `$ENSUE_API_KEY` env var. If missing, get one at https://www.ensue-network.ai/dashboard

Set it before running Claude Code:
```bash
export ENSUE_API_KEY="your-key-here"
```

## Security

- **NEVER** echo, print, or log `$ENSUE_API_KEY`
- **NEVER** accept the key inline from the user
- **NEVER** store private details (API keys, passwords, personal paths)

## API Calls

Use the wrapper script for all API calls:

```bash
./scripts/ensue-api.sh <method> '<json_args>'
```

### Common Operations

**List keys in a namespace:**
```bash
./scripts/ensue-api.sh list_keys '{"prefix": "public/concepts/", "limit": 10}'
```

**Get specific entries:**
```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["public/concepts/computing/what-is-a-server"]}'
```

**Create entries (batch):**
```bash
./scripts/ensue-api.sh create_memory '{"items":[
  {"key_name":"public/concepts/topic/name","description":"Short desc","value":"Full content","embed":true}
]}'
```

**Update an entry:**
```bash
./scripts/ensue-api.sh update_memory '{"key_name": "public/toolbox/_index", "value": "New content"}'
```

**Search semantically:**
```bash
./scripts/ensue-api.sh discover_memories '{"query": "how do servers work", "limit": 5}'
```

## Maintaining the Toolbox Index

Always keep `public/toolbox/_index` updated when adding new tools:

```
TOOLBOX - Personal Software Reference
=====================================

Current categories:
public/toolbox/
  _index              --> This file
  networking/         --> VPNs, tunnels, connectivity
  ai-agents/          --> AI assistants and tools
  devtools/           --> Development utilities

Current tools:
  networking/tailscale    --> VPN for connecting devices anywhere
  ai-agents/claude-code   --> AI coding assistant in terminal
  devtools/bun            --> Fast JS runtime and package manager

Rule: Only add tools after actually using them.
```

## Intent Mapping

| User says | Action |
|-----------|--------|
| "save this", "remember this" | Ask what specifically, draft entry, confirm, save to public/ |
| "what do I know about X" | Search public/concepts/ and public/toolbox/, show relevant entries |
| "add to toolbox", "save this tool" | Confirm they used it, create entry in public/toolbox/ |
| "list my concepts", "what have I learned" | list_keys with prefix public/concepts/ |
| "show my toolbox", "what tools do I have" | list_keys with prefix public/toolbox/ |
| "show me [specific concept]" | get_memory for that key |
| "update [entry]" | Get current, show proposed change, update |
| "delete [entry]" | Show what will be deleted, confirm, delete |
| "/learning-end", "end session" | Trigger learning-end skill for retrieval practice |

## Quality Checklist

Before saving any entry, verify:

- [ ] Written for "future self who forgot everything"
- [ ] Includes WHY, not just WHAT
- [ ] Has diagram if it's about architecture/flow
- [ ] Has analogy if concept is abstract
- [ ] Has concrete example
- [ ] No private/personal details
- [ ] Could be shared with other learners
