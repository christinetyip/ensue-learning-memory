#!/usr/bin/env bun
/**
 * Generate Knowledge Graph Visualization
 *
 * Fetches your knowledge base from Ensue and generates an interactive
 * force-directed graph visualization.
 *
 * Usage:
 *   ENSUE_API_KEY=your-key bun run scripts/generate-graph.js
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

// Fetch full content for all entries
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

// Build graph data from keys
function buildGraph(keys, contents = {}) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // Add category nodes
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
        subcategories.add(`${category}/${subcategory}`);
    }

    // Create category nodes
    for (const cat of categories) {
        const id = cat;
        nodes.push({
            id,
            name: cat,
            type: 'category',
            size: 45,
        });
        nodeMap.set(id, nodes.length - 1);
    }

    // Create subcategory nodes and link to categories
    for (const subcat of subcategories) {
        const [category, subcategory] = subcat.split('/');
        const id = subcat;
        nodes.push({
            id,
            name: subcategory,
            type: 'subcategory',
            category: category,
            size: 32,
        });
        nodeMap.set(id, nodes.length - 1);

        links.push({
            source: category,
            target: id,
            type: 'hierarchy',
        });
    }

    // Create concept/tool nodes and link to subcategories
    for (const key of keys) {
        const parts = key.key_name.replace('public/', '').split('/');
        if (parts[parts.length - 1] === '_index') continue;

        const category = parts[0];
        const subcategory = parts[1];
        const name = parts.slice(2).join('/');

        if (!name) continue;

        const subcatId = `${category}/${subcategory}`;
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

        links.push({
            source: subcatId,
            target: id,
            type: 'hierarchy',
        });
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
                links.push({
                    source: a.id,
                    target: b.id,
                    type: 'related',
                });
            }
        }
    }

    return { nodes, links };
}

// Generate HTML
function generateHtml(graph) {
    const conceptCount = graph.nodes.filter(n => n.type === 'concept').length;
    const toolCount = graph.nodes.filter(n => n.type === 'tool').length;
    const diagramCount = graph.nodes.filter(n => n.type === 'diagram').length;
    const total = conceptCount + toolCount + diagramCount;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Graph</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #05051a;
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
        }

        #graph {
            width: 100vw;
            height: 100vh;
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

        .stat {
            text-align: center;
        }

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
            transition: opacity 0.2s ease, transform 0.2s ease;
            transform: translateY(5px);
            max-width: 320px;
            z-index: 200;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.1);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        }

        .tooltip.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .tooltip h3 {
            margin-bottom: 8px;
            font-size: 15px;
            font-weight: 600;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
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

        .tooltip p {
            color: rgba(255, 255, 255, 0.7);
            line-height: 1.6;
            font-weight: 400;
        }

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

        .search-box input::placeholder {
            color: rgba(255, 255, 255, 0.3);
        }

        .search-box input:focus {
            border-color: rgba(129, 140, 248, 0.5);
            box-shadow: 0 0 20px rgba(129, 140, 248, 0.15);
        }

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

        .generated-info a:hover {
            color: rgba(255, 255, 255, 0.7);
        }

        /* Node styles */
        .node-glow {
            filter: url(#glow);
        }

        .node-label {
            font-family: 'Inter', sans-serif;
            fill: rgba(255, 255, 255, 0.9);
            pointer-events: none;
            font-weight: 500;
            font-size: 10px;
        }

        .node-label.category {
            font-size: 13px;
            font-weight: 700;
            fill: #fff;
        }

        .node-label.subcategory {
            font-size: 11px;
            font-weight: 600;
        }

        .link {
            stroke-linecap: round;
        }

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
        }

        .modal-overlay.visible .modal {
            transform: scale(1);
        }

        .modal-header {
            padding: 24px 28px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-header h2 {
            font-size: 1.2rem;
            font-weight: 600;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0;
        }

        .modal-header .type-badge {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            padding: 4px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
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
            max-height: calc(80vh - 80px);
        }

        .modal-content pre {
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
            font-size: 13px;
            line-height: 1.7;
            color: rgba(255, 255, 255, 0.85);
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 0;
        }

        .modal-path {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.3);
            margin-top: 4px;
            font-family: 'SF Mono', monospace;
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>

    <header>
        <h1><span>Knowledge Graph</span></h1>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${total}</div>
                <div class="stat-label">Entries</div>
            </div>
            <div class="stat">
                <div class="stat-value">${conceptCount}</div>
                <div class="stat-label">Concepts</div>
            </div>
            <div class="stat">
                <div class="stat-value">${toolCount}</div>
                <div class="stat-label">Tools</div>
            </div>
        </div>
    </header>

    <div class="search-box">
        <input type="text" id="search" placeholder="Search nodes..." oninput="searchNodes(this.value)">
    </div>

    <div id="graph"></div>
    <div class="tooltip" id="tooltip"></div>

    <!-- Modal for viewing full content -->
    <div class="modal-overlay" id="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div>
                    <h2 id="modal-title">Title</h2>
                    <div class="modal-path" id="modal-path"></div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="type-badge" id="modal-type">concept</span>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
            </div>
            <div class="modal-content">
                <pre id="modal-body"></pre>
            </div>
        </div>
    </div>

    <div class="legend">
        <div class="legend-title">Node Types</div>
        <div class="legend-item">
            <div class="legend-color" style="background: #818cf8; color: #818cf8;"></div>
            <span>Category</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #34d399; color: #34d399;"></div>
            <span>Concept</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #fbbf24; color: #fbbf24;"></div>
            <span>Tool</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #f472b6; color: #f472b6;"></div>
            <span>Diagram</span>
        </div>
    </div>

    <div class="controls">
        <button class="control-btn" onclick="resetView()">Reset View</button>
        <button class="control-btn" onclick="toggleLabels()">Toggle Labels</button>
    </div>

    <div class="generated-info">
        Generated from <a href="https://ensue-network.ai">Ensue</a> • ${new Date().toLocaleDateString()}
    </div>

    <script>
        const graphData = ${JSON.stringify(graph)};

        // Color schemes
        const colors = {
            category: {
                concepts: { main: '#818cf8', glow: 'rgba(129, 140, 248, 0.6)' },
                toolbox: { main: '#c084fc', glow: 'rgba(192, 132, 252, 0.6)' }
            },
            subcategory: {
                computing: { main: '#34d399', glow: 'rgba(52, 211, 153, 0.5)' },
                networking: { main: '#22d3ee', glow: 'rgba(34, 211, 238, 0.5)' },
                'ai-agents': { main: '#f472b6', glow: 'rgba(244, 114, 182, 0.5)' },
                devtools: { main: '#60a5fa', glow: 'rgba(96, 165, 250, 0.5)' },
                knowledge: { main: '#a78bfa', glow: 'rgba(167, 139, 250, 0.5)' },
                security: { main: '#fb7185', glow: 'rgba(251, 113, 133, 0.5)' }
            },
            types: {
                concept: { main: '#34d399', glow: 'rgba(52, 211, 153, 0.4)' },
                tool: { main: '#fbbf24', glow: 'rgba(251, 191, 36, 0.4)' },
                diagram: { main: '#f472b6', glow: 'rgba(244, 114, 182, 0.4)' }
            }
        };

        function getNodeColor(node) {
            if (node.type === 'category') {
                return colors.category[node.name] || { main: '#818cf8', glow: 'rgba(129, 140, 248, 0.5)' };
            }
            if (node.type === 'subcategory') {
                return colors.subcategory[node.name] || { main: '#60a5fa', glow: 'rgba(96, 165, 250, 0.5)' };
            }
            return colors.types[node.type] || colors.types.concept;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        let showLabels = true;

        const svg = d3.select('#graph')
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        // Define gradients and filters
        const defs = svg.append('defs');

        // Glow filter
        const filter = defs.append('filter')
            .attr('id', 'glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');

        filter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');

        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Stronger glow for hover
        const filterHover = defs.append('filter')
            .attr('id', 'glow-hover')
            .attr('x', '-100%')
            .attr('y', '-100%')
            .attr('width', '300%')
            .attr('height', '300%');

        filterHover.append('feGaussianBlur')
            .attr('stdDeviation', '8')
            .attr('result', 'coloredBlur');

        const feMergeHover = filterHover.append('feMerge');
        feMergeHover.append('feMergeNode').attr('in', 'coloredBlur');
        feMergeHover.append('feMergeNode').attr('in', 'SourceGraphic');

        const g = svg.append('g');

        const zoom = d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);
        svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.75));

        // Create force simulation
        const simulation = d3.forceSimulation(graphData.nodes)
            .force('link', d3.forceLink(graphData.links)
                .id(d => d.id)
                .distance(d => d.type === 'related' ? 180 : 100)
                .strength(d => d.type === 'related' ? 0.05 : 0.4))
            .force('charge', d3.forceManyBody()
                .strength(d => d.type === 'category' ? -600 : d.type === 'subcategory' ? -300 : -150))
            .force('center', d3.forceCenter(0, 0))
            .force('collision', d3.forceCollide().radius(d => d.size + 35));

        // Draw links
        const link = g.append('g')
            .selectAll('line')
            .data(graphData.links)
            .join('line')
            .attr('class', 'link')
            .attr('stroke', d => d.type === 'related' ? 'rgba(129, 140, 248, 0.08)' : 'rgba(255, 255, 255, 0.1)')
            .attr('stroke-width', d => d.type === 'related' ? 1 : 1.5);

        // Draw nodes
        const node = g.append('g')
            .selectAll('g')
            .data(graphData.nodes)
            .join('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));

        // Node outer glow
        node.append('circle')
            .attr('r', d => d.size + 4)
            .attr('fill', d => getNodeColor(d).glow)
            .attr('opacity', 0.3)
            .style('filter', 'blur(8px)');

        // Node circles
        node.append('circle')
            .attr('r', d => d.size)
            .attr('fill', d => getNodeColor(d).main)
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .style('filter', 'url(#glow)')
            .on('mouseover', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('r', d.size * 1.15)
                    .style('filter', 'url(#glow-hover)');
                showTooltip(event, d);
            })
            .on('mouseout', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('r', d.size)
                    .style('filter', 'url(#glow)');
                hideTooltip();
            })
            .on('click', focusNode);

        // Node labels
        const labels = node.append('text')
            .attr('class', d => 'node-label ' + d.type)
            .attr('dy', d => d.size + 16)
            .attr('text-anchor', 'middle')
            .text(d => {
                const name = d.name;
                return name.length > 22 ? name.substring(0, 20) + '...' : name;
            });

        // Simulation tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
        });

        // Drag functions
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

        // Tooltip
        function showTooltip(event, d) {
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML =
                '<h3>' + d.name + '</h3>' +
                '<div class="type-badge">' + d.type + '</div>' +
                (d.description ? '<p>' + d.description + '</p>' : '');
            tooltip.style.left = (event.pageX + 20) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
            tooltip.classList.add('visible');
        }

        function hideTooltip() {
            document.getElementById('tooltip').classList.remove('visible');
        }

        // Focus on node (zoom) for category/subcategory nodes
        function focusNode(event, d) {
            // For leaf nodes with content, show modal
            if (d.content && (d.type === 'concept' || d.type === 'tool' || d.type === 'diagram')) {
                openModal(d);
                return;
            }
            // For category/subcategory nodes, zoom
            const scale = 1.8;
            svg.transition()
                .duration(600)
                .ease(d3.easeCubicInOut)
                .call(zoom.transform, d3.zoomIdentity
                    .translate(width / 2 - d.x * scale, height / 2 - d.y * scale)
                    .scale(scale));
        }

        // Modal functions
        function openModal(d) {
            document.getElementById('modal-title').textContent = d.name;
            document.getElementById('modal-path').textContent = d.fullName || '';
            document.getElementById('modal-type').textContent = d.type;
            document.getElementById('modal-body').textContent = d.content || 'No content available';
            document.getElementById('modal-overlay').classList.add('visible');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('modal-overlay').classList.remove('visible');
            document.body.style.overflow = '';
        }

        // Close modal on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });

        // Reset view
        function resetView() {
            svg.transition()
                .duration(600)
                .ease(d3.easeCubicInOut)
                .call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.75));
        }

        // Toggle labels
        function toggleLabels() {
            showLabels = !showLabels;
            labels.transition().duration(300).style('opacity', showLabels ? 1 : 0);
        }

        // Search
        function searchNodes(query) {
            const q = query.toLowerCase().trim();

            node.selectAll('circle')
                .transition()
                .duration(300)
                .attr('opacity', d => {
                    if (!q) return 1;
                    const match = d.name.toLowerCase().includes(q) ||
                                  (d.description && d.description.toLowerCase().includes(q));
                    return match ? 1 : 0.1;
                });

            labels.transition()
                .duration(300)
                .attr('opacity', d => {
                    if (!showLabels) return 0;
                    if (!q) return 1;
                    const match = d.name.toLowerCase().includes(q) ||
                                  (d.description && d.description.toLowerCase().includes(q));
                    return match ? 1 : 0.1;
                });

            link.transition()
                .duration(300)
                .attr('opacity', d => {
                    if (!q) return 1;
                    const sourceMatch = d.source.name.toLowerCase().includes(q);
                    const targetMatch = d.target.name.toLowerCase().includes(q);
                    return (sourceMatch || targetMatch) ? 0.5 : 0.03;
                });
        }

        // Handle resize
        window.addEventListener('resize', () => {
            svg.attr('width', window.innerWidth).attr('height', window.innerHeight);
        });
    </script>
</body>
</html>`;
}

// Main
async function main() {
    try {
        const keys = await fetchAllKeys();
        console.log('Found ' + keys.length + ' entries');

        const contents = await fetchAllContent(keys);
        console.log('Fetched content for ' + Object.keys(contents).length + ' entries');

        const graph = buildGraph(keys, contents);
        console.log('Built graph: ' + graph.nodes.length + ' nodes, ' + graph.links.length + ' links');

        const html = generateHtml(graph);

        const outputPath = join(PLUGIN_ROOT, 'knowledge-graph-modern.html');
        writeFileSync(outputPath, html);

        console.log('✓ Generated: ' + outputPath);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
