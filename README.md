# Ensue Learning Memory

A learning-focused knowledge base plugin for Claude Code, built on [Ensue Memory Network](https://ensue.dev).

## Who This Is For

Non-technical builders (vibecoding, no-code, learning to code) who want to:
- **Deeply understand** what they learn, not just store facts
- **Build mental models** that compound over time
- **Remember** concepts when they forget (and share with others)
- **Track tools** they've actually used

## Philosophy

This is NOT a generic note-taking system. It's a learning companion.

- **Write for future self** - When you forget, you can re-learn quickly
- **Only real experience** - Only save what you've learned or used
- **Keep it shareable** - No private details, share your knowledge

## Installation

### 1. Choose Your API Key

**Option A: Create your own knowledge base**
Get your own API key at https://www.ensue-network.ai/dashboard (you get one for free after logging in).

**Option B: Browse Christine's knowledge base (read-only)**
Use this guest key to explore an existing knowledge base with computing/networking concepts:
```
lmn_ccc3096db3584a2b9d356384c0bfbe24
```

### 2. Set the Environment Variable

Add to your `~/.zshrc` or `~/.bashrc`:
```bash
export ENSUE_API_KEY="your-key-here"
```

### 3. Install the Plugin

In Claude Code:
```
/plugin add github:christinetyip/ensue-learning-memory
```

Or clone locally and:
```
/plugin add /path/to/ensue-learning-memory
```

## Namespace Structure

```
public/                   --> Shareable with others
  concepts/               --> Understanding how things work
    computing/            --> Software, programs, architecture
    networking/           --> Networks, protocols, connectivity
  toolbox/                --> Tools you've personally used
    _index                --> Index of all your tools
    networking/           --> VPNs, tunnels
    ai-agents/            --> AI tools
    devtools/             --> Development utilities

private/                  --> Only visible to you
  sessions/               --> Learning session logs
    _latest               --> Most recent session summary
```

**Visibility:** Set regex patterns in Ensue dashboard to control access. `public/*` can be shared, `private/*` is yours only.

## Learning Session Features

### Session Start (Automatic)

When you start Claude Code, a hook automatically:
1. Checks for your last learning session
2. Asks 1-2 recall questions to strengthen retention
3. Then proceeds with whatever you want to work on

### Session End (Command)

When you're done learning, run:
```
/learning-end
```

This triggers:
1. Identifies key concepts from the session
2. Quizzes you on each (retrieval practice)
3. Saves session summary to `private/sessions/_latest`
4. Offers to save new concepts to `public/concepts/`

## Usage Examples

### Learning a New Concept

After Claude explains something to you:

```
Claude: "Want me to save this to Ensue?"
Claude: Shows draft with diagrams, analogies, examples
You: "Yes"
Claude: Saves to public/concepts/computing/what-is-a-server
```

### Adding a Tool

After you actually use a new tool:

```
You: "Add bun to my toolbox"
Claude: Creates entry with your experience using it
Claude: Saves to public/toolbox/devtools/bun
```

### Recalling Knowledge

```
You: "What do I know about ports?"
Claude: Retrieves public/concepts/networking/ports and shows it

You: "Show my toolbox"
Claude: Lists all tools in public/toolbox/
```

### Ending a Learning Session

```
You: /learning-end

Claude: Let's wrap up with recall practice.
        Q: What's the difference between thin and thick clients?

You: Thin clients are mostly UI, thick clients do real work locally...

Claude: Perfect! Session saved. See you next time.
```

## Content Style

Every concept includes:
1. **What it is** - Simple definition
2. **Why it exists** - What problem it solves
3. **How it works** - With ASCII diagrams
4. **Analogy** - Relate to something familiar
5. **Example** - Concrete use case
6. **Mental model** - The key insight

Example:
```
WHAT IS A SERVER
================

A SERVER is just a computer that provides a service to other computers.
The word describes its ROLE, not its hardware.

Your laptop can be a server.
A $50 Raspberry Pi can be a server.

If your laptop runs software that LISTENS for connections and SERVES
responses, you have a server.

Analogy: A restaurant kitchen. It waits for orders (requests) and
serves food (responses).
```

## Knowledge Tree Visualization

Generate an interactive HTML visualization of your knowledge base:

```bash
# Make sure ENSUE_API_KEY is set, then run:
bun run scripts/generate-tree.js

# Opens knowledge-base.html in your browser
open knowledge-base.html
```

Features:
- Interactive tree view of all your concepts and tools
- Search/filter functionality
- Collapsible branches
- Color-coded by type (concept, tool, diagram)

Run this whenever you want to update your visualization after adding new knowledge.

## Contributing

This plugin was created to match a specific learning style. Feel free to fork and customize for your own approach!

## License

MIT
