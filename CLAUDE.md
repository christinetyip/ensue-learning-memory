# Ensue Learning Memory

A customized Ensue memory plugin focused on **building deep understanding**, not just storing notes.

## What This Plugin Does

This plugin connects Claude Code to your Ensue knowledge base with a learning-focused approach:

- **concepts/** - Store understanding of how things work (computing, networking, etc.)
- **toolbox/** - Track tools you've actually used and understand

## Key Principles

1. **Ask before saving** - Never auto-save, always get approval
2. **Only real experience** - Don't save tools you haven't used
3. **Write for future self** - Include diagrams, analogies, examples
4. **Keep it shareable** - No private details

## Quick Start

Set your API key:
```bash
export ENSUE_API_KEY="your-key-here"
```

Get a key at https://www.ensue-network.ai/dashboard

## Usage

After learning something through conversation:
- Claude will offer: "Want me to save this to Ensue?"
- You approve, it saves with full context

To recall:
- "What do I know about servers?"
- "Show my toolbox"
- "List my networking concepts"

## API Script

All API calls use: `./scripts/ensue-api.sh <method> '<json_args>'`
