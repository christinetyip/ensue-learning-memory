#!/bin/bash
# Session start hook - retrieves last session for recall practice

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Get the latest session summary
RESULT=$("$PLUGIN_ROOT/scripts/ensue-api.sh" get_memory '{"key_names": ["private/sessions/_latest"]}' 2>/dev/null)

# Check if we got a valid result with content
if echo "$RESULT" | grep -q '"status":"success"'; then
  # Extract the session content
  SESSION_CONTENT=$(echo "$RESULT" | grep -o '"value":"[^"]*"' | head -1 | sed 's/"value":"//;s/"$//')

  if [ -n "$SESSION_CONTENT" ] && [ "$SESSION_CONTENT" != "null" ]; then
    cat << 'EOF'
## Learning Session Start

I found your last learning session. Before we begin, let's do a quick recall exercise to strengthen retention.

**Instructions for Claude:**
1. Read the session summary below
2. Ask the user 1-2 recall questions based on concepts they learned
3. Let them answer from memory (don't give hints)
4. Gently correct if needed, then proceed with whatever they want to work on

EOF
    echo "**Last Session Summary:**"
    echo ""
    echo "$SESSION_CONTENT" | sed 's/\\n/\n/g'
    echo ""
    echo "---"
    echo ""
  fi
else
  # No previous session or error - that's fine, just start fresh
  echo "<!-- No previous learning session found. Starting fresh. -->"
fi
