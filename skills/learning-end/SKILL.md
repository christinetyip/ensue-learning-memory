---
name: learning-end
description: End a learning session with retrieval practice and save session summary. Use when user says "/learning-end" or "end learning session" or "wrap up session".
user_invocable: true
---

# End Learning Session

This skill wraps up a learning session with retrieval practice to strengthen retention.

## Process

### Step 1: Identify Key Concepts

Review the conversation and identify 3-5 core mental models or concepts the user learned. Not everything discussed - just the key insights that matter.

Example:
- "Apps are just UI - real work happens on servers"
- "Ports are like apartment numbers on a building (IP address)"
- "Package managers download other people's code automatically"

### Step 2: Retrieval Practice

Quiz the user on each concept. Ask them to explain in their own words:

> "Before we wrap up, let's do a quick recall exercise."
>
> "Can you explain: What's the difference between a thin client and thick client?"

- Let them answer from memory
- Don't give hints
- Gently correct if needed
- Move to next concept

### Step 3: Note Recall Performance

Mentally track how well they recalled each concept:
- **Strong**: Explained correctly without help
- **Weak**: Needed prompting or partial answer
- **Needed help**: Couldn't recall, had to re-explain

### Step 4: Identify Hooks for Next Session

Note any:
- Open questions they asked
- Curiosities to explore
- Logical next topics to build on

### Step 5: Save Session Summary

Save to `private/sessions/_latest` using this format:

```
SESSION: [Today's date YYYY-MM-DD]
===================

Key concepts learned:
- [concept 1]: [one-line summary]
- [concept 2]: [one-line summary]
- [concept 3]: [one-line summary]

How they connect:
+-------------+       +-------------+       +-------------+
| [concept 1] |------>| [concept 2] |------>| [concept 3] |
+-------------+       +-------------+       +-------------+
        \                                         /
         \------> [key insight connecting them] <-/

Visual diagrams to review:
- public/concepts/[topic]/visual-[name]
- public/concepts/[topic]/visual-[name]

Recall performance:
- [concept]: [strong/weak/needed help]

Hooks for next session:
- [open question or curiosity]
- [next topic to build on]

New entries saved:
- public/concepts/computing/xyz
- public/toolbox/devtools/abc
```

### Creating the "How they connect" diagram

Create a simple ASCII diagram showing:
1. Main concepts as boxes
2. Arrows showing relationships
3. Key insight that ties them together

Example:
```
How they connect:

[Phone/App]              [Gateway :18789]              [Claude API]
     |                         |                            |
     |   Tailscale VPN         |      HTTPS :443            |
     v                         v                            v
+---------+  finds laptop  +----------+  sends request  +--------+
| Client  |--------------->| Gateway  |---------------->| Server |
| (UI)    |                | (routes) |                 | (work) |
+---------+                +----------+                 +--------+

Key insight: VPN solves FINDING, Gateway solves ROUTING, Server does WORK
```

### Step 6: Offer to Save Concepts

If there were concepts discussed that aren't yet in Ensue:

> "We covered some new concepts today. Want me to save any of these to your knowledge base?"

- Show what would be saved
- Get confirmation
- Save to `public/concepts/` namespace

## API Commands

**Update session summary:**
```bash
./scripts/ensue-api.sh update_memory '{"key_name": "private/sessions/_latest", "value": "[session content]"}'
```

If `private/sessions/_latest` doesn't exist yet, create it:
```bash
./scripts/ensue-api.sh create_memory '{"items":[{"key_name":"private/sessions/_latest","description":"Most recent learning session","value":"[content]","embed":true}]}'
```

**Save dated session log (optional):**
```bash
./scripts/ensue-api.sh create_memory '{"items":[{"key_name":"private/sessions/2025-01-06","description":"Learning session 2025-01-06","value":"[content]","embed":true}]}'
```

## Example Interaction

```
User: /learning-end

Claude: Let's wrap up with a quick recall exercise.

**Question 1:** What does a gateway do and why is it useful?

User: It's like a single entry point that receives requests from different apps like WhatsApp and Telegram, handles auth, and routes them to the right place.

Claude: Perfect! You got the core idea.

**Question 2:** When you run `bun install`, where does it check first before downloading?

User: The local cache... I think at ~/.bun/install/cache/

Claude: Exactly right.

Great session! Your recall was strong on both concepts.

**Hooks for next time:**
- You still have Clawdbot onboarding to finish
- You wondered about file system structure - we could explore that

I've saved the session summary. Want me to save any of today's concepts to your public knowledge base?
```
