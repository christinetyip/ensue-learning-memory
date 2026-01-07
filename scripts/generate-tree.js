#!/usr/bin/env bun
/**
 * Generate Knowledge Tree Visualization
 *
 * Fetches your knowledge base from Ensue and generates an interactive HTML visualization.
 *
 * Usage:
 *   ENSUE_API_KEY=your-key bun run scripts/generate-tree.js
 *
 * Or if you have .ensue-key file:
 *   bun run scripts/generate-tree.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

// Get API key from env or file
function getApiKey() {
    if (process.env.ENSUE_API_KEY) {
        return process.env.ENSUE_API_KEY;
    }
    const keyFile = join(PLUGIN_ROOT, '.ensue-key');
    if (existsSync(keyFile)) {
        return readFileSync(keyFile, 'utf-8').trim();
    }
    console.error('Error: ENSUE_API_KEY not set.');
    console.error('Either set the environment variable or create a .ensue-key file.');
    console.error('Get your key at: https://www.ensue-network.ai/dashboard');
    process.exit(1);
}

// Call Ensue API
async function ensueApi(method, args = {}) {
    const apiKey = getApiKey();
    const response = await fetch('https://api.ensue-network.ai/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: method, arguments: args },
            id: 1,
        }),
    });

    // Get response text and handle potential "data: " prefix (SSE format)
    let text = await response.text();
    if (text.startsWith('data: ')) {
        text = text.replace(/^data: /, '');
    }

    const data = JSON.parse(text);
    if (data.error) {
        throw new Error(data.error.message);
    }
    return data.result?.structuredContent;
}

// Fetch all keys from Ensue
async function fetchAllKeys() {
    console.log('Fetching keys from Ensue...');
    const result = await ensueApi('list_keys', { prefix: 'public/', limit: 500 });
    return result?.keys || [];
}

// Build tree structure from flat key list
function buildTree(keys) {
    const tree = {
        name: 'Knowledge Tree',
        type: 'root',
        icon: '🌳',
        children: []
    };

    // Group keys by path
    const groups = {};

    for (const key of keys) {
        const parts = key.key_name.replace('public/', '').split('/');

        // Skip _index files
        if (parts[parts.length - 1] === '_index') continue;

        const category = parts[0]; // concepts or toolbox
        const subcategory = parts[1]; // computing, networking, ai-agents, etc.
        const name = parts.slice(2).join('/'); // the actual entry name

        if (!name) continue;

        if (!groups[category]) groups[category] = {};
        if (!groups[category][subcategory]) groups[category][subcategory] = [];

        groups[category][subcategory].push({
            name,
            description: key.description || '',
            type: category === 'toolbox' ? 'tool' :
                  name.startsWith('visual-') ? 'diagram' : 'concept',
        });
    }

    // Build tree structure
    const categoryIcons = {
        concepts: '💡',
        toolbox: '🧰',
    };

    const subcategoryIcons = {
        computing: '💻',
        networking: '🌐',
        'ai-agents': '🤖',
        devtools: '🛠️',
        knowledge: '📚',
        security: '🔒',
        databases: '🗄️',
        learning: '📖',
    };

    for (const [category, subcategories] of Object.entries(groups)) {
        const categoryNode = {
            name: category,
            type: 'category',
            icon: categoryIcons[category] || '📁',
            children: [],
        };

        for (const [subcategory, items] of Object.entries(subcategories)) {
            const subcategoryNode = {
                name: subcategory,
                type: 'subcategory',
                icon: subcategoryIcons[subcategory] || '📂',
                children: items.sort((a, b) => a.name.localeCompare(b.name)),
            };
            categoryNode.children.push(subcategoryNode);
        }

        // Sort subcategories
        categoryNode.children.sort((a, b) => a.name.localeCompare(b.name));
        tree.children.push(categoryNode);
    }

    // Sort categories (concepts first, then toolbox)
    tree.children.sort((a, b) => {
        if (a.name === 'concepts') return -1;
        if (b.name === 'concepts') return 1;
        return a.name.localeCompare(b.name);
    });

    return tree;
}

// Count total entries
function countEntries(node) {
    if (!node.children) return 1;
    return node.children.reduce((sum, child) => sum + countEntries(child), 0);
}

// Count by type
function countByType(node, type) {
    let count = 0;
    if (node.type === type) count = 1;
    if (node.children) {
        count += node.children.reduce((sum, child) => sum + countByType(child, type), 0);
    }
    return count;
}

// Generate HTML
function generateHtml(tree) {
    const totalConcepts = countByType(tree, 'concept');
    const totalTools = countByType(tree, 'tool');
    const totalDiagrams = countByType(tree, 'diagram');
    const total = totalConcepts + totalTools + totalDiagrams;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Tree</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
        }

        .container {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        header {
            padding: 20px 40px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        h1 {
            color: #fff;
            font-size: 1.5rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .stats {
            display: flex;
            gap: 30px;
        }

        .stat {
            text-align: center;
        }

        .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #4ade80;
        }

        .stat-label {
            font-size: 0.7rem;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        #tree-container {
            flex: 1;
            overflow: auto;
            padding: 40px;
        }

        .tree {
            display: flex;
            flex-direction: column;
            gap: 0;
        }

        .branch {
            margin-left: 0;
        }

        .node-row {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
            gap: 10px;
        }

        .node-row:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .node-icon {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            flex-shrink: 0;
        }

        .node-icon.root { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
        .node-icon.category { background: linear-gradient(135deg, #3b82f6, #60a5fa); }
        .node-icon.subcategory { background: linear-gradient(135deg, #06b6d4, #22d3ee); }
        .node-icon.concept { background: linear-gradient(135deg, #10b981, #34d399); }
        .node-icon.tool { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
        .node-icon.diagram { background: linear-gradient(135deg, #ec4899, #f472b6); }

        .node-label {
            font-size: 14px;
            color: #fff;
            font-weight: 500;
        }

        .node-description {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.4);
            margin-left: 8px;
        }

        .node-count {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.3);
            margin-left: auto;
            padding-right: 10px;
        }

        .children {
            margin-left: 38px;
            border-left: 2px solid rgba(255, 255, 255, 0.1);
            padding-left: 20px;
        }

        .toggle {
            width: 18px;
            height: 18px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.6);
            flex-shrink: 0;
            transition: all 0.2s;
        }

        .toggle:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .toggle.expanded {
            transform: rotate(90deg);
        }

        .leaf .toggle {
            visibility: hidden;
        }

        .level-0 .node-label { font-size: 20px; font-weight: 700; }
        .level-1 .node-label { font-size: 16px; font-weight: 600; }
        .level-2 .node-label { font-size: 15px; font-weight: 600; }
        .level-3 .node-label { font-size: 14px; font-weight: 400; }

        .level-0 .node-icon { width: 36px; height: 36px; font-size: 18px; }
        .level-1 .node-icon { width: 32px; height: 32px; font-size: 16px; }
        .level-2 .node-icon { width: 28px; height: 28px; font-size: 14px; }

        .level-1 > .children { margin-left: 44px; }
        .level-2 > .children { margin-left: 40px; }

        .legend {
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .legend-title {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 10px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 12px;
        }

        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 4px;
        }

        .controls {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
        }

        .control-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }

        .control-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .search-box {
            position: fixed;
            top: 80px;
            left: 40px;
            display: flex;
            gap: 8px;
        }

        .search-box input {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 14px;
            width: 250px;
            outline: none;
        }

        .search-box input::placeholder {
            color: rgba(255, 255, 255, 0.4);
        }

        .search-box input:focus {
            border-color: rgba(255, 255, 255, 0.4);
        }

        .highlight {
            background: rgba(251, 191, 36, 0.3);
            border-radius: 3px;
        }

        .hidden {
            display: none !important;
        }

        .generated-info {
            position: fixed;
            bottom: 20px;
            left: 20px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.3);
        }

        .generated-info a {
            color: rgba(255, 255, 255, 0.5);
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🌳 Knowledge Tree</h1>
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${totalConcepts}</div>
                    <div class="stat-label">Concepts</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${totalTools}</div>
                    <div class="stat-label">Tools</div>
                </div>
            </div>
        </header>

        <div class="search-box">
            <input type="text" id="search" placeholder="Search..." oninput="searchTree(this.value)">
        </div>

        <div id="tree-container"></div>
    </div>

    <div class="legend">
        <div class="legend-title">Legend</div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, #3b82f6, #60a5fa);"></div>
            <span>Category</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, #06b6d4, #22d3ee);"></div>
            <span>Subcategory</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, #10b981, #34d399);"></div>
            <span>Concept</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, #f59e0b, #fbbf24);"></div>
            <span>Tool</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, #ec4899, #f472b6);"></div>
            <span>Diagram</span>
        </div>
    </div>

    <div class="controls">
        <button class="control-btn" onclick="expandAll()">Expand All</button>
        <button class="control-btn" onclick="collapseAll()">Collapse All</button>
    </div>

    <div class="generated-info">
        Generated from <a href="https://ensue-network.ai">Ensue</a> • ${new Date().toLocaleDateString()}
    </div>

    <script>
        const data = ${JSON.stringify(tree, null, 2)};

        const icons = {
            concept: "📄",
            tool: "🔧",
            diagram: "📊"
        };

        function countChildren(node) {
            if (!node.children) return 0;
            return node.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
        }

        function createNode(node, level = 0) {
            const div = document.createElement('div');
            div.className = \`branch level-\${level}\`;
            div.dataset.name = node.name.toLowerCase();

            const hasChildren = node.children && node.children.length > 0;
            const isLeaf = !hasChildren;

            const row = document.createElement('div');
            row.className = \`node-row \${isLeaf ? 'leaf' : ''}\`;

            const toggle = document.createElement('div');
            toggle.className = 'toggle expanded';
            toggle.innerHTML = '▶';
            if (hasChildren) {
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    const children = div.querySelector('.children');
                    if (children) {
                        children.classList.toggle('hidden');
                        toggle.classList.toggle('expanded');
                    }
                };
            }
            row.appendChild(toggle);

            const iconDiv = document.createElement('div');
            iconDiv.className = \`node-icon \${node.type}\`;
            iconDiv.textContent = node.icon || icons[node.type] || '📄';
            row.appendChild(iconDiv);

            const label = document.createElement('span');
            label.className = 'node-label';
            label.textContent = node.name;
            row.appendChild(label);

            if (node.description && isLeaf) {
                const desc = document.createElement('span');
                desc.className = 'node-description';
                desc.textContent = \`— \${node.description}\`;
                row.appendChild(desc);
            }

            if (hasChildren) {
                const count = document.createElement('span');
                count.className = 'node-count';
                count.textContent = \`\${countChildren(node)} items\`;
                row.appendChild(count);
            }

            div.appendChild(row);

            if (hasChildren) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'children';
                node.children.forEach(child => {
                    childrenDiv.appendChild(createNode(child, level + 1));
                });
                div.appendChild(childrenDiv);
            }

            return div;
        }

        function renderTree() {
            const container = document.getElementById('tree-container');
            container.innerHTML = '';
            const tree = document.createElement('div');
            tree.className = 'tree';
            tree.appendChild(createNode(data));
            container.appendChild(tree);
        }

        function expandAll() {
            document.querySelectorAll('.children').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.toggle').forEach(el => el.classList.add('expanded'));
        }

        function collapseAll() {
            document.querySelectorAll('.level-2 .children, .level-3 .children').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.level-2 .toggle, .level-3 .toggle').forEach(el => el.classList.remove('expanded'));
        }

        function searchTree(query) {
            const q = query.toLowerCase().trim();
            document.querySelectorAll('.branch').forEach(branch => {
                const name = branch.dataset.name;
                if (!q) {
                    branch.classList.remove('hidden');
                    branch.querySelector('.node-label').innerHTML = branch.querySelector('.node-label').textContent;
                } else if (name.includes(q)) {
                    branch.classList.remove('hidden');
                    const label = branch.querySelector('.node-label');
                    const text = label.textContent;
                    const idx = text.toLowerCase().indexOf(q);
                    if (idx >= 0) {
                        label.innerHTML = text.slice(0, idx) +
                            '<span class="highlight">' + text.slice(idx, idx + q.length) + '</span>' +
                            text.slice(idx + q.length);
                    }
                    let parent = branch.parentElement;
                    while (parent) {
                        if (parent.classList.contains('branch')) parent.classList.remove('hidden');
                        if (parent.classList.contains('children')) parent.classList.remove('hidden');
                        parent = parent.parentElement;
                    }
                } else {
                    branch.classList.add('hidden');
                }
            });
            if (q) {
                document.querySelectorAll('.children').forEach(el => el.classList.remove('hidden'));
                document.querySelectorAll('.toggle').forEach(el => el.classList.add('expanded'));
            }
        }

        renderTree();
    </script>
</body>
</html>`;
}

// Main
async function main() {
    try {
        const keys = await fetchAllKeys();
        console.log(`Found ${keys.length} entries`);

        const tree = buildTree(keys);
        const html = generateHtml(tree);

        const outputPath = join(PLUGIN_ROOT, 'knowledge-base.html');
        writeFileSync(outputPath, html);

        console.log(`✓ Generated: ${outputPath}`);
        console.log(`  - ${countByType(tree, 'concept')} concepts`);
        console.log(`  - ${countByType(tree, 'tool')} tools`);
        console.log(`  - ${countByType(tree, 'diagram')} diagrams`);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
