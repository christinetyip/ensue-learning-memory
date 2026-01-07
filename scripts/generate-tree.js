#!/usr/bin/env bun
/**
 * Generate Knowledge Tree Visualization
 *
 * Fetches your knowledge base from Ensue and generates an interactive HTML visualization.
 * Click any entry to see its full content.
 *
 * Usage:
 *   ENSUE_API_KEY=your-key bun run scripts/generate-tree.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

function getApiKey() {
    if (process.env.ENSUE_API_KEY) {
        return process.env.ENSUE_API_KEY;
    }
    const keyFile = join(PLUGIN_ROOT, '.ensue-key');
    if (existsSync(keyFile)) {
        return readFileSync(keyFile, 'utf-8').trim();
    }
    console.error('Error: ENSUE_API_KEY not set.');
    process.exit(1);
}

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

async function fetchAllKeys() {
    console.log('Fetching keys from Ensue...');
    const result = await ensueApi('list_keys', { prefix: 'public/', limit: 500 });
    return result?.keys || [];
}

async function fetchAllContent(keys) {
    console.log('Fetching content for all entries...');
    const keyNames = keys.map(k => k.key_name).filter(k => !k.endsWith('/_index'));

    // Fetch in batches of 10
    const batchSize = 10;
    const contents = {};

    for (let i = 0; i < keyNames.length; i += batchSize) {
        const batch = keyNames.slice(i, i + batchSize);
        const result = await ensueApi('get_memory', { key_names: batch });

        if (result?.results) {
            for (const item of result.results) {
                if (item.value) {
                    contents[item.key_name] = item.value;
                }
            }
        }

        // Progress indicator
        process.stdout.write(`\r  Fetched ${Math.min(i + batchSize, keyNames.length)}/${keyNames.length} entries`);
    }
    console.log('');

    return contents;
}

function buildTree(keys, contents) {
    const tree = {
        name: 'Knowledge Tree',
        type: 'root',
        icon: '🌳',
        children: []
    };

    const groups = {};

    for (const key of keys) {
        const parts = key.key_name.replace('public/', '').split('/');
        if (parts[parts.length - 1] === '_index') continue;

        const category = parts[0];
        const subcategory = parts[1];
        const name = parts.slice(2).join('/');

        if (!name) continue;

        if (!groups[category]) groups[category] = {};
        if (!groups[category][subcategory]) groups[category][subcategory] = [];

        groups[category][subcategory].push({
            name,
            key: key.key_name,
            description: key.description || '',
            content: contents[key.key_name] || '',
            type: category === 'toolbox' ? 'tool' :
                  name.startsWith('visual-') ? 'diagram' : 'concept',
        });
    }

    const categoryIcons = { concepts: '💡', toolbox: '🧰' };
    const subcategoryIcons = {
        computing: '💻', networking: '🌐', 'ai-agents': '🤖',
        devtools: '🛠️', knowledge: '📚', security: '🔒', databases: '🗄️', learning: '📖',
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

        categoryNode.children.sort((a, b) => a.name.localeCompare(b.name));
        tree.children.push(categoryNode);
    }

    tree.children.sort((a, b) => {
        if (a.name === 'concepts') return -1;
        if (b.name === 'concepts') return 1;
        return a.name.localeCompare(b.name);
    });

    return tree;
}

function countByType(node, type) {
    let count = 0;
    if (node.type === type) count = 1;
    if (node.children) {
        count += node.children.reduce((sum, child) => sum + countByType(child, type), 0);
    }
    return count;
}

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
    <title>Knowledge Base</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #05051a;
            min-height: 100vh;
            overflow: hidden;
        }

        /* Animated gradient background */
        .bg-gradient {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background:
                radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.05) 0%, transparent 70%);
            pointer-events: none;
            z-index: 0;
        }

        .container {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: 1;
        }

        header {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 16px 32px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 20px;
            display: flex;
            align-items: center;
            gap: 40px;
            z-index: 100;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        h1 {
            color: #fff;
            font-size: 1.1rem;
            font-weight: 600;
            letter-spacing: -0.02em;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        h1 span {
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .stats {
            display: flex;
            gap: 28px;
        }

        .stat { text-align: center; }
        .stat-value {
            font-size: 1.4rem;
            font-weight: 700;
            background: linear-gradient(135deg, #34d399, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .stat-label {
            font-size: 0.65rem;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 2px;
        }

        #tree-container {
            flex: 1;
            overflow: auto;
            padding: 120px 60px 60px 60px;
        }

        #tree-container::-webkit-scrollbar {
            width: 8px;
        }
        #tree-container::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.02);
        }
        #tree-container::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
        }
        #tree-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.15);
        }

        .branch { margin-left: 0; }

        .node-row {
            display: flex;
            align-items: center;
            padding: 8px 14px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            gap: 12px;
            margin: 2px 0;
        }

        .node-row:hover {
            background: rgba(255,255,255,0.04);
        }
        .node-row.leaf:hover {
            background: rgba(52, 211, 153, 0.08);
            box-shadow: 0 0 20px rgba(52, 211, 153, 0.1);
        }

        .node-icon {
            width: 32px; height: 32px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.2s ease;
        }

        .node-row:hover .node-icon {
            transform: scale(1.05);
        }

        .node-icon.root { background: linear-gradient(135deg, #818cf8, #c084fc); box-shadow: 0 4px 20px rgba(129, 140, 248, 0.3); }
        .node-icon.category { background: linear-gradient(135deg, #818cf8, #a78bfa); box-shadow: 0 4px 20px rgba(129, 140, 248, 0.25); }
        .node-icon.subcategory { background: linear-gradient(135deg, #06b6d4, #22d3ee); box-shadow: 0 4px 20px rgba(6, 182, 212, 0.25); }
        .node-icon.concept { background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 4px 20px rgba(16, 185, 129, 0.25); }
        .node-icon.tool { background: linear-gradient(135deg, #f59e0b, #fbbf24); box-shadow: 0 4px 20px rgba(245, 158, 11, 0.25); }
        .node-icon.diagram { background: linear-gradient(135deg, #ec4899, #f472b6); box-shadow: 0 4px 20px rgba(236, 72, 153, 0.25); }

        .node-label { font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; letter-spacing: -0.01em; }
        .node-description { font-size: 12px; color: rgba(255,255,255,0.35); margin-left: 8px; font-weight: 400; }
        .node-count {
            font-size: 10px;
            color: rgba(255,255,255,0.3);
            margin-left: auto;
            padding: 4px 10px;
            background: rgba(255,255,255,0.04);
            border-radius: 20px;
        }

        .children {
            margin-left: 44px;
            border-left: 1px solid rgba(255,255,255,0.06);
            padding-left: 24px;
        }

        .toggle {
            width: 20px; height: 20px; border-radius: 6px;
            background: rgba(255,255,255,0.06);
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; color: rgba(255,255,255,0.4);
            flex-shrink: 0; transition: all 0.2s ease;
        }
        .toggle:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
        .toggle.expanded { transform: rotate(90deg); }
        .leaf .toggle { visibility: hidden; }

        .level-0 > .node-row .node-label { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
        .level-1 > .node-row .node-label { font-size: 17px; font-weight: 600; }
        .level-2 > .node-row .node-label { font-size: 15px; font-weight: 600; }
        .level-3 > .node-row .node-label { font-size: 14px; font-weight: 500; }

        .level-0 > .node-row .node-icon { width: 40px; height: 40px; font-size: 20px; }
        .level-1 > .node-row .node-icon { width: 36px; height: 36px; font-size: 17px; }

        .level-1 > .children { margin-left: 50px; }
        .level-2 > .children { margin-left: 46px; }

        .legend {
            position: fixed;
            bottom: 28px;
            left: 28px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 16px;
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            z-index: 100;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        .legend-title {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            margin-bottom: 4px;
            font-weight: 600;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 12px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
            font-weight: 400;
        }
        .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            box-shadow: 0 0 10px currentColor;
        }

        .controls {
            position: fixed;
            bottom: 28px;
            right: 28px;
            display: flex;
            gap: 12px;
            z-index: 100;
        }
        .control-btn {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.7);
            padding: 12px 20px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            font-family: inherit;
            transition: all 0.2s ease;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        }
        .control-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
            color: #fff;
            transform: translateY(-1px);
        }

        .search-box {
            position: fixed;
            top: 100px;
            left: 28px;
            z-index: 100;
        }
        .search-box input {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #fff;
            padding: 14px 20px;
            border-radius: 14px;
            font-size: 13px;
            font-family: inherit;
            width: 260px;
            outline: none;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            transition: all 0.2s ease;
        }
        .search-box input::placeholder { color: rgba(255, 255, 255, 0.3); }
        .search-box input:focus {
            border-color: rgba(129, 140, 248, 0.5);
            box-shadow: 0 0 20px rgba(129, 140, 248, 0.15);
        }

        .highlight {
            background: rgba(251, 191, 36, 0.25);
            border-radius: 4px;
            padding: 0 2px;
        }
        .hidden { display: none !important; }

        .generated-info {
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 11px;
            color: rgba(255, 255, 255, 0.25);
            z-index: 100;
            font-weight: 400;
        }
        .generated-info a {
            color: rgba(255, 255, 255, 0.4);
            text-decoration: none;
            transition: color 0.2s;
        }
        .generated-info a:hover { color: rgba(255, 255, 255, 0.7); }

        /* Modal styles */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(5, 5, 26, 0.9);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
            padding: 40px;
        }
        .modal-overlay.visible {
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 1;
        }

        .modal {
            background: rgba(15, 15, 35, 0.98);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            max-width: 700px;
            max-height: 80vh;
            width: 100%;
            overflow: hidden;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(99, 102, 241, 0.15);
            transform: scale(0.95);
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
        }
        .modal-overlay.visible .modal {
            transform: scale(1);
        }

        .modal-header {
            padding: 24px 28px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .modal-header .node-icon {
            width: 44px; height: 44px; font-size: 22px;
            border-radius: 12px;
        }

        .modal-title {
            flex: 1;
        }

        .modal-title h2 {
            font-size: 1.2rem;
            font-weight: 600;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0;
        }

        .modal-title .modal-path {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.3);
            margin-top: 6px;
            font-family: 'JetBrains Mono', monospace;
        }

        .modal-close {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.6);
            width: 36px;
            height: 36px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
        .modal-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .modal-content {
            padding: 28px;
            overflow-y: auto;
            flex: 1;
        }

        .modal-content pre {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            line-height: 1.7;
            color: rgba(255, 255, 255, 0.85);
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 0;
        }

        .modal-description {
            background: rgba(52, 211, 153, 0.08);
            border-left: 3px solid #34d399;
            padding: 14px 18px;
            margin-bottom: 24px;
            border-radius: 0 12px 12px 0;
            color: rgba(255, 255, 255, 0.75);
            font-size: 14px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>

    <div class="container">
        <header>
            <h1><span>Knowledge Base</span></h1>
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Entries</div>
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
            <input type="text" id="search" placeholder="Search nodes..." oninput="searchTree(this.value)">
        </div>

        <div id="tree-container"></div>
    </div>

    <div class="legend">
        <div class="legend-title">Node Types</div>
        <div class="legend-item"><div class="legend-color" style="background: #818cf8; color: #818cf8;"></div><span>Category</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #22d3ee; color: #22d3ee;"></div><span>Subcategory</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #34d399; color: #34d399;"></div><span>Concept</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #fbbf24; color: #fbbf24;"></div><span>Tool</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #f472b6; color: #f472b6;"></div><span>Diagram</span></div>
    </div>

    <div class="controls">
        <button class="control-btn" onclick="expandAll()">Expand All</button>
        <button class="control-btn" onclick="collapseAll()">Collapse All</button>
    </div>

    <div class="generated-info">
        Generated from <a href="https://ensue-network.ai">Ensue</a> • ${new Date().toLocaleDateString()}
    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div class="node-icon" id="modal-icon"></div>
                <div class="modal-title">
                    <h2 id="modal-name"></h2>
                    <div class="modal-path" id="modal-path"></div>
                </div>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-content">
                <div class="modal-description" id="modal-description"></div>
                <pre id="modal-text"></pre>
            </div>
        </div>
    </div>

    <script>
        const data = ${JSON.stringify(tree)};

        const icons = { concept: "📄", tool: "🔧", diagram: "📊" };

        function countChildren(node) {
            if (!node.children) return 0;
            return node.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
        }

        function showModal(node) {
            const modal = document.getElementById('modal');
            const iconEl = document.getElementById('modal-icon');
            const nameEl = document.getElementById('modal-name');
            const pathEl = document.getElementById('modal-path');
            const descEl = document.getElementById('modal-description');
            const textEl = document.getElementById('modal-text');

            iconEl.className = 'node-icon ' + node.type;
            iconEl.textContent = icons[node.type] || '📄';
            nameEl.textContent = node.name;
            pathEl.textContent = node.key || '';
            descEl.textContent = node.description || '';
            descEl.style.display = node.description ? 'block' : 'none';
            textEl.textContent = node.content || 'No content available';

            modal.classList.add('visible');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('modal').classList.remove('visible');
            document.body.style.overflow = '';
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        function createNode(node, level = 0) {
            const div = document.createElement('div');
            div.className = 'branch level-' + level;
            div.dataset.name = node.name.toLowerCase();

            const hasChildren = node.children && node.children.length > 0;
            const isLeaf = !hasChildren;

            const row = document.createElement('div');
            row.className = 'node-row' + (isLeaf ? ' leaf' : '');

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
            iconDiv.className = 'node-icon ' + node.type;
            iconDiv.textContent = node.icon || icons[node.type] || '📄';
            row.appendChild(iconDiv);

            const label = document.createElement('span');
            label.className = 'node-label';
            label.textContent = node.name;
            row.appendChild(label);

            if (node.description && isLeaf) {
                const desc = document.createElement('span');
                desc.className = 'node-description';
                desc.textContent = '— ' + node.description;
                row.appendChild(desc);
            }

            if (hasChildren) {
                const count = document.createElement('span');
                count.className = 'node-count';
                count.textContent = countChildren(node) + ' items';
                row.appendChild(count);
            }

            // Click handler for leaf nodes
            if (isLeaf && node.content) {
                row.onclick = () => showModal(node);
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

async function main() {
    try {
        const keys = await fetchAllKeys();
        console.log('Found ' + keys.length + ' entries');

        const contents = await fetchAllContent(keys);

        const tree = buildTree(keys, contents);
        const html = generateHtml(tree);

        const outputPath = join(PLUGIN_ROOT, 'knowledge-base.html');
        writeFileSync(outputPath, html);

        console.log('✓ Generated: ' + outputPath);
        console.log('  - ' + countByType(tree, 'concept') + ' concepts');
        console.log('  - ' + countByType(tree, 'tool') + ' tools');
        console.log('  - ' + countByType(tree, 'diagram') + ' diagrams');
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
