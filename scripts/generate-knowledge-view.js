#!/usr/bin/env bun
/**
 * Generate Combined Knowledge Visualization
 *
 * Creates a single HTML file with both tree and graph views,
 * switchable via tabs.
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
        process.stdout.write('\r  Fetched ' + Math.min(i + batchSize, keyNames.length) + '/' + keyNames.length + ' entries');
    }
    console.log('');
    return contents;
}

// Build tree data
function buildTree(keys, contents) {
    const tree = {
        name: 'Knowledge Base',
        type: 'root',
        icon: '🧠',
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

// Build graph data
function buildGraph(keys, contents) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    const categories = new Set();
    const subcategories = new Set();

    for (const key of keys) {
        const parts = key.key_name.replace('public/', '').split('/');
        if (parts[parts.length - 1] === '_index') continue;

        const category = parts[0];
        const subcategory = parts[1];
        const name = parts.slice(2).join('/');

        if (!name) continue;

        categories.add(category);
        subcategories.add(category + '/' + subcategory);
    }

    for (const cat of categories) {
        nodes.push({ id: cat, name: cat, type: 'category', size: 45 });
        nodeMap.set(cat, nodes.length - 1);
    }

    for (const subcat of subcategories) {
        const [category, subcategory] = subcat.split('/');
        nodes.push({ id: subcat, name: subcategory, type: 'subcategory', category: category, size: 32 });
        nodeMap.set(subcat, nodes.length - 1);
        links.push({ source: category, target: subcat, type: 'hierarchy' });
    }

    for (const key of keys) {
        const parts = key.key_name.replace('public/', '').split('/');
        if (parts[parts.length - 1] === '_index') continue;

        const category = parts[0];
        const subcategory = parts[1];
        const name = parts.slice(2).join('/');

        if (!name) continue;

        const subcatId = category + '/' + subcategory;
        const id = key.key_name;
        const isVisual = name.startsWith('visual-');
        const type = category === 'toolbox' ? 'tool' : isVisual ? 'diagram' : 'concept';

        nodes.push({
            id,
            name: name,
            fullName: key.key_name,
            description: key.description || '',
            content: contents[key.key_name] || '',
            type,
            category: category,
            subcategory: subcategory,
            size: 18,
        });
        nodeMap.set(id, nodes.length - 1);
        links.push({ source: subcatId, target: id, type: 'hierarchy' });
    }

    // Find related concepts
    const conceptNodes = nodes.filter(n => n.type === 'concept' || n.type === 'tool' || n.type === 'diagram');
    for (let i = 0; i < conceptNodes.length; i++) {
        for (let j = i + 1; j < conceptNodes.length; j++) {
            const a = conceptNodes[i];
            const b = conceptNodes[j];
            const aWords = new Set((a.name + ' ' + a.description).toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3));
            const bWords = new Set((b.name + ' ' + b.description).toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3));
            const common = [...aWords].filter(w => bWords.has(w));
            if (common.length >= 2) {
                links.push({ source: a.id, target: b.id, type: 'related' });
            }
        }
    }

    return { nodes, links };
}

function countByType(node, type) {
    let count = 0;
    if (node.type === type) count = 1;
    if (node.children) {
        count += node.children.reduce((sum, child) => sum + countByType(child, type), 0);
    }
    return count;
}

function generateHtml(tree, graph) {
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
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #05051a;
            min-height: 100vh;
            overflow: hidden;
        }

        .bg-gradient {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background:
                radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.05) 0%, transparent 70%);
            pointer-events: none;
            z-index: 0;
        }

        header {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 20px;
            display: flex;
            align-items: center;
            gap: 32px;
            z-index: 100;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        h1 {
            font-size: 1.1rem;
            font-weight: 600;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .tabs {
            display: flex;
            gap: 4px;
            background: rgba(255, 255, 255, 0.03);
            padding: 4px;
            border-radius: 12px;
        }

        .tab {
            padding: 8px 16px;
            border: none;
            background: transparent;
            color: rgba(255, 255, 255, 0.5);
            font-size: 13px;
            font-weight: 500;
            font-family: inherit;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s ease;
        }

        .tab:hover {
            color: rgba(255, 255, 255, 0.8);
        }

        .tab.active {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .stats {
            display: flex;
            gap: 24px;
        }

        .stat { text-align: center; }
        .stat-value {
            font-size: 1.3rem;
            font-weight: 700;
            background: linear-gradient(135deg, #34d399, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .stat-label {
            font-size: 0.6rem;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 2px;
        }

        /* View containers */
        .view {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            z-index: 1;
        }

        .view.active {
            opacity: 1;
            pointer-events: auto;
        }

        /* Tree View Styles */
        #tree-view {
            padding: 100px 60px 60px 60px;
            overflow: auto;
        }

        #tree-view::-webkit-scrollbar { width: 8px; }
        #tree-view::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        #tree-view::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

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

        .node-row:hover { background: rgba(255,255,255,0.04); }
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

        .node-row:hover .node-icon { transform: scale(1.05); }

        .node-icon.root { background: linear-gradient(135deg, #818cf8, #c084fc); box-shadow: 0 4px 20px rgba(129, 140, 248, 0.3); }
        .node-icon.category { background: linear-gradient(135deg, #818cf8, #a78bfa); box-shadow: 0 4px 20px rgba(129, 140, 248, 0.25); }
        .node-icon.subcategory { background: linear-gradient(135deg, #06b6d4, #22d3ee); box-shadow: 0 4px 20px rgba(6, 182, 212, 0.25); }
        .node-icon.concept { background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 4px 20px rgba(16, 185, 129, 0.25); }
        .node-icon.tool { background: linear-gradient(135deg, #f59e0b, #fbbf24); box-shadow: 0 4px 20px rgba(245, 158, 11, 0.25); }
        .node-icon.diagram { background: linear-gradient(135deg, #ec4899, #f472b6); box-shadow: 0 4px 20px rgba(236, 72, 153, 0.25); }

        .node-label { font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; }
        .node-description { font-size: 12px; color: rgba(255,255,255,0.35); margin-left: 8px; }
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

        .level-0 > .node-row .node-label { font-size: 22px; font-weight: 700; }
        .level-1 > .node-row .node-label { font-size: 17px; font-weight: 600; }
        .level-2 > .node-row .node-label { font-size: 15px; font-weight: 600; }

        .level-0 > .node-row .node-icon { width: 40px; height: 40px; font-size: 20px; }
        .level-1 > .node-row .node-icon { width: 36px; height: 36px; font-size: 17px; }

        .level-1 > .children { margin-left: 50px; }
        .level-2 > .children { margin-left: 46px; }

        /* Graph View Styles */
        #graph-view svg {
            width: 100%;
            height: 100%;
        }

        .node-glow { filter: url(#glow); }

        .graph-label {
            font-family: 'Inter', sans-serif;
            fill: rgba(255, 255, 255, 0.9);
            pointer-events: none;
            font-weight: 500;
            font-size: 10px;
        }

        .graph-label.category { font-size: 13px; font-weight: 700; fill: #fff; }
        .graph-label.subcategory { font-size: 11px; font-weight: 600; }

        .link { stroke-linecap: round; }

        /* Shared UI */
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
            transition: all 0.2s ease;
        }

        .search-box input::placeholder { color: rgba(255, 255, 255, 0.3); }
        .search-box input:focus {
            border-color: rgba(129, 140, 248, 0.5);
            box-shadow: 0 0 20px rgba(129, 140, 248, 0.15);
        }

        .legend {
            position: fixed;
            bottom: 28px;
            left: 28px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            border-radius: 16px;
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            z-index: 100;
        }

        .legend-title {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            font-weight: 600;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 12px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
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
        }

        .control-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
            color: #fff;
            transform: translateY(-1px);
        }

        .tooltip {
            position: absolute;
            background: rgba(15, 15, 35, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 18px 22px;
            color: #fff;
            font-size: 13px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            max-width: 320px;
            z-index: 200;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .tooltip.visible { opacity: 1; }
        .tooltip h3 {
            margin-bottom: 8px;
            font-size: 15px;
            font-weight: 600;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .tooltip .type-badge {
            display: inline-block;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            padding: 4px 10px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            margin-bottom: 12px;
        }

        .tooltip p { color: rgba(255, 255, 255, 0.7); line-height: 1.6; }

        .generated-info {
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 11px;
            color: rgba(255, 255, 255, 0.25);
            z-index: 100;
        }

        .generated-info a {
            color: rgba(255, 255, 255, 0.4);
            text-decoration: none;
        }

        .highlight { background: rgba(251, 191, 36, 0.25); border-radius: 4px; padding: 0 2px; }
        .hidden { display: none !important; }

        /* Modal */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(5, 5, 26, 0.9);
            backdrop-filter: blur(10px);
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
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
            width: 90%;
            overflow: hidden;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(99, 102, 241, 0.15);
            transform: scale(0.95);
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
        }

        .modal-overlay.visible .modal { transform: scale(1); }

        .modal-header {
            padding: 24px 28px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .modal-header .node-icon { width: 44px; height: 44px; font-size: 22px; border-radius: 12px; }

        .modal-title { flex: 1; }
        .modal-title h2 {
            font-size: 1.2rem;
            font-weight: 600;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
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

        .modal-close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

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
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>

    <header>
        <h1>Knowledge Base</h1>
        <div class="tabs">
            <button class="tab active" onclick="switchView('tree')">Tree</button>
            <button class="tab" onclick="switchView('graph')">Graph</button>
        </div>
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
        <input type="text" id="search" placeholder="Search..." oninput="handleSearch(this.value)">
    </div>

    <!-- Tree View -->
    <div id="tree-view" class="view active"></div>

    <!-- Graph View -->
    <div id="graph-view" class="view"></div>

    <div class="tooltip" id="tooltip"></div>

    <div class="legend">
        <div class="legend-title">Node Types</div>
        <div class="legend-item"><div class="legend-color" style="background: #818cf8; color: #818cf8;"></div><span>Category</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #34d399; color: #34d399;"></div><span>Concept</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #fbbf24; color: #fbbf24;"></div><span>Tool</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #f472b6; color: #f472b6;"></div><span>Diagram</span></div>
    </div>

    <div class="controls" id="tree-controls">
        <button class="control-btn" onclick="expandAll()">Expand All</button>
        <button class="control-btn" onclick="collapseAll()">Collapse All</button>
    </div>

    <div class="controls" id="graph-controls" style="display: none;">
        <button class="control-btn" onclick="resetGraphView()">Reset View</button>
        <button class="control-btn" onclick="toggleLabels()">Toggle Labels</button>
    </div>

    <div class="generated-info">
        Generated from <a href="https://ensue-network.ai">Ensue</a> &bull; ${new Date().toLocaleDateString()}
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
        const treeData = ${JSON.stringify(tree)};
        const graphData = ${JSON.stringify(graph)};

        let currentView = 'tree';
        let graphInitialized = false;
        let showLabels = true;
        let simulation, svg, g, zoom, node, link, labels;

        const icons = { concept: "📄", tool: "🔧", diagram: "📊" };

        // View switching
        function switchView(view) {
            currentView = view;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.tab[onclick*="' + view + '"]').classList.add('active');

            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(view + '-view').classList.add('active');

            document.getElementById('tree-controls').style.display = view === 'tree' ? 'flex' : 'none';
            document.getElementById('graph-controls').style.display = view === 'graph' ? 'flex' : 'none';

            if (view === 'graph' && !graphInitialized) {
                initGraph();
                graphInitialized = true;
            }

            document.getElementById('search').value = '';
        }

        // Modal
        function showModal(data) {
            document.getElementById('modal-icon').className = 'node-icon ' + data.type;
            document.getElementById('modal-icon').textContent = icons[data.type] || '📄';
            document.getElementById('modal-name').textContent = data.name;
            document.getElementById('modal-path').textContent = data.key || data.fullName || '';
            document.getElementById('modal-description').textContent = data.description || '';
            document.getElementById('modal-description').style.display = data.description ? 'block' : 'none';
            document.getElementById('modal-text').textContent = data.content || 'No content available';
            document.getElementById('modal').classList.add('visible');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('modal').classList.remove('visible');
            document.body.style.overflow = '';
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

        // Tree functions
        function countChildren(node) {
            if (!node.children) return 0;
            return node.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
        }

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

            if (isLeaf && node.content) {
                row.onclick = () => showModal(node);
            }

            div.appendChild(row);

            if (hasChildren) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'children';
                node.children.forEach(child => childrenDiv.appendChild(createNode(child, level + 1)));
                div.appendChild(childrenDiv);
            }

            return div;
        }

        function renderTree() {
            const container = document.getElementById('tree-view');
            container.innerHTML = '';
            container.appendChild(createNode(treeData));
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
                        label.innerHTML = text.slice(0, idx) + '<span class="highlight">' + text.slice(idx, idx + q.length) + '</span>' + text.slice(idx + q.length);
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
            if (q) expandAll();
        }

        // Graph functions
        const colors = {
            category: { concepts: { main: '#818cf8', glow: 'rgba(129, 140, 248, 0.6)' }, toolbox: { main: '#c084fc', glow: 'rgba(192, 132, 252, 0.6)' } },
            subcategory: { computing: { main: '#34d399' }, networking: { main: '#22d3ee' }, 'ai-agents': { main: '#f472b6' }, devtools: { main: '#60a5fa' }, knowledge: { main: '#a78bfa' }, security: { main: '#fb7185' } },
            types: { concept: { main: '#34d399', glow: 'rgba(52, 211, 153, 0.4)' }, tool: { main: '#fbbf24', glow: 'rgba(251, 191, 36, 0.4)' }, diagram: { main: '#f472b6', glow: 'rgba(244, 114, 182, 0.4)' } }
        };

        function getNodeColor(n) {
            if (n.type === 'category') return colors.category[n.name] || { main: '#818cf8', glow: 'rgba(129, 140, 248, 0.5)' };
            if (n.type === 'subcategory') return colors.subcategory[n.name] || { main: '#60a5fa', glow: 'rgba(96, 165, 250, 0.5)' };
            return colors.types[n.type] || colors.types.concept;
        }

        function initGraph() {
            const container = document.getElementById('graph-view');
            const width = window.innerWidth;
            const height = window.innerHeight;

            svg = d3.select('#graph-view').append('svg').attr('width', width).attr('height', height);

            const defs = svg.append('defs');
            const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
            filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
            const feMerge = filter.append('feMerge');
            feMerge.append('feMergeNode').attr('in', 'coloredBlur');
            feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

            const filterHover = defs.append('filter').attr('id', 'glow-hover').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
            filterHover.append('feGaussianBlur').attr('stdDeviation', '8').attr('result', 'coloredBlur');
            const feMergeHover = filterHover.append('feMerge');
            feMergeHover.append('feMergeNode').attr('in', 'coloredBlur');
            feMergeHover.append('feMergeNode').attr('in', 'SourceGraphic');

            g = svg.append('g');

            zoom = d3.zoom().scaleExtent([0.2, 4]).on('zoom', (event) => g.attr('transform', event.transform));
            svg.call(zoom);
            svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.75));

            simulation = d3.forceSimulation(graphData.nodes)
                .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(d => d.type === 'related' ? 180 : 100).strength(d => d.type === 'related' ? 0.05 : 0.4))
                .force('charge', d3.forceManyBody().strength(d => d.type === 'category' ? -600 : d.type === 'subcategory' ? -300 : -150))
                .force('center', d3.forceCenter(0, 0))
                .force('collision', d3.forceCollide().radius(d => d.size + 35));

            link = g.append('g').selectAll('line').data(graphData.links).join('line')
                .attr('class', 'link')
                .attr('stroke', d => d.type === 'related' ? 'rgba(129, 140, 248, 0.08)' : 'rgba(255, 255, 255, 0.1)')
                .attr('stroke-width', d => d.type === 'related' ? 1 : 1.5);

            node = g.append('g').selectAll('g').data(graphData.nodes).join('g').attr('class', 'node')
                .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

            node.append('circle').attr('r', d => d.size + 4).attr('fill', d => getNodeColor(d).glow || 'rgba(129, 140, 248, 0.3)').attr('opacity', 0.3).style('filter', 'blur(8px)');

            node.append('circle').attr('r', d => d.size).attr('fill', d => getNodeColor(d).main)
                .attr('stroke', 'rgba(255, 255, 255, 0.2)').attr('stroke-width', 1.5)
                .style('cursor', 'pointer').style('filter', 'url(#glow)')
                .on('mouseover', function(event, d) {
                    d3.select(this).transition().duration(200).attr('r', d.size * 1.15).style('filter', 'url(#glow-hover)');
                    showTooltip(event, d);
                })
                .on('mouseout', function(event, d) {
                    d3.select(this).transition().duration(200).attr('r', d.size).style('filter', 'url(#glow)');
                    hideTooltip();
                })
                .on('click', handleNodeClick);

            labels = node.append('text').attr('class', d => 'graph-label ' + d.type).attr('dy', d => d.size + 16).attr('text-anchor', 'middle')
                .text(d => d.name.length > 22 ? d.name.substring(0, 20) + '...' : d.name);

            simulation.on('tick', () => {
                link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
                node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
            });
        }

        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        function showTooltip(event, d) {
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML = '<h3>' + d.name + '</h3><div class="type-badge">' + d.type + '</div>' + (d.description ? '<p>' + d.description + '</p>' : '');
            tooltip.style.left = (event.pageX + 20) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
            tooltip.classList.add('visible');
        }

        function hideTooltip() {
            document.getElementById('tooltip').classList.remove('visible');
        }

        function handleNodeClick(event, d) {
            if (d.content && (d.type === 'concept' || d.type === 'tool' || d.type === 'diagram')) {
                showModal(d);
            } else {
                const width = window.innerWidth;
                const height = window.innerHeight;
                const scale = 1.8;
                svg.transition().duration(600).ease(d3.easeCubicInOut)
                    .call(zoom.transform, d3.zoomIdentity.translate(width / 2 - d.x * scale, height / 2 - d.y * scale).scale(scale));
            }
        }

        function resetGraphView() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            svg.transition().duration(600).ease(d3.easeCubicInOut)
                .call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.75));
        }

        function toggleLabels() {
            showLabels = !showLabels;
            labels.transition().duration(300).style('opacity', showLabels ? 1 : 0);
        }

        function searchGraph(query) {
            const q = query.toLowerCase().trim();
            node.selectAll('circle').transition().duration(300).attr('opacity', d => {
                if (!q) return 1;
                const match = d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q));
                return match ? 1 : 0.1;
            });
            labels.transition().duration(300).attr('opacity', d => {
                if (!showLabels) return 0;
                if (!q) return 1;
                const match = d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q));
                return match ? 1 : 0.1;
            });
        }

        function handleSearch(query) {
            if (currentView === 'tree') {
                searchTree(query);
            } else {
                searchGraph(query);
            }
        }

        // Initialize
        renderTree();

        window.addEventListener('resize', () => {
            if (svg) svg.attr('width', window.innerWidth).attr('height', window.innerHeight);
        });
    </script>
</body>
</html>`;
}

async function main() {
    try {
        const keys = await fetchAllKeys();
        console.log('Found ' + keys.length + ' entries');

        const contents = await fetchAllContent(keys);
        console.log('Fetched content for ' + Object.keys(contents).length + ' entries');

        const tree = buildTree(keys, contents);
        const graph = buildGraph(keys, contents);

        console.log('Built tree: ' + countByType(tree, 'concept') + ' concepts, ' + countByType(tree, 'tool') + ' tools, ' + countByType(tree, 'diagram') + ' diagrams');
        console.log('Built graph: ' + graph.nodes.length + ' nodes, ' + graph.links.length + ' links');

        const html = generateHtml(tree, graph);

        const outputPath = join(PLUGIN_ROOT, 'knowledge-view.html');
        writeFileSync(outputPath, html);

        console.log('✓ Generated: ' + outputPath);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
