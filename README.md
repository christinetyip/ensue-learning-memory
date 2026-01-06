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

### 1. Get an Ensue API Key

Go to https://www.ensue-network.ai/dashboard and create a free account.

### 2. Set the Environment Variable

Add to your `~/.zshrc` or `~/.bashrc`:
```bash
export ENSUE_API_KEY="your-key-here"
```

### 3. Install the Plugin

In Claude Code:
```
/plugin add github:YOUR_USERNAME/ensue-learning-memory
```

Or clone locally and:
```
/plugin add /path/to/ensue-learning-memory
```

## Namespace Structure

```
concepts/             --> Understanding how things work
  computing/          --> Software, programs, architecture
  networking/         --> Networks, protocols, connectivity

toolbox/              --> Tools you've personally used
  _index              --> Index of all your tools
  networking/         --> VPNs, tunnels
  ai-agents/          --> AI tools
  devtools/           --> Development utilities
```

## Usage Examples

### Learning a New Concept

After Claude explains something to you:

```
You: "Want me to save this to Ensue?"
Claude: Shows draft with diagrams, analogies, examples
You: "Yes"
Claude: Saves to concepts/computing/what-is-a-server
```

### Adding a Tool

After you actually use a new tool:

```
You: "Add bun to my toolbox"
Claude: Creates entry with your experience using it
```

### Recalling Knowledge

```
You: "What do I know about ports?"
Claude: Retrieves concepts/networking/ports and shows it

You: "Show my toolbox"
Claude: Lists all tools you've saved
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

## Contributing

This plugin was created to match a specific learning style. Feel free to fork and customize for your own approach!

## License

MIT
