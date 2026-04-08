// CodeNeura — script.js
// Premium AI Code Visualizer

document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // DOM REFS
    // ============================================================
    const body = document.body;
    const themeToggleBtn  = document.getElementById('theme-toggle-btn');
    const folderUploadInput = document.getElementById('folder-upload-input');
    const importBtn       = document.getElementById('import-folder-btn-wrapper');

    // Explorer
    const explorerEmpty   = document.getElementById('explorer-empty');
    const fileTreeEl      = document.getElementById('file-tree');
    const projectStats    = document.getElementById('project-stats');
    const statFiles       = document.getElementById('stat-files');
    const statLines       = document.getElementById('stat-lines');
    const statLangs       = document.getElementById('stat-langs');
    const langBarContainer= document.getElementById('lang-bar-container');
    const langBar         = document.getElementById('lang-bar');
    const langLegend      = document.getElementById('lang-legend');
    const projectBadge    = document.getElementById('project-loaded-badge');
    const projectNameBadge= document.getElementById('project-name-badge');

    // Code panel
    const codeEmpty       = document.getElementById('code-empty');
    const codeContent     = document.getElementById('code-content');
    const codeFileName    = document.getElementById('code-file-name');
    const codeToolbar     = document.getElementById('code-toolbar-actions');
    const copyCodeBtn     = document.getElementById('copy-code-btn');

    // Flowchart panel
    const flowchartEmpty  = document.getElementById('flowchart-empty');
    const flowchartDiagram= document.getElementById('flowchart-diagram');
    const flowchartFileName=document.getElementById('flowchart-file-name');
    const flowchartToolbar= document.getElementById('flowchart-toolbar-actions');
    const exportSvgBtn    = document.getElementById('export-svg-btn');

    // Analysis panel
    const analysisEmpty   = document.getElementById('analysis-empty');
    const analysisTabs    = document.getElementById('analysis-tabs');
    const analysisContent = document.getElementById('analysis-content');
    const tabMetrics      = document.getElementById('tab-metrics');
    const tabInsights     = document.getElementById('tab-insights');
    const tabDeps         = document.getElementById('tab-deps');

    // Search
    const searchTrigger   = document.getElementById('search-trigger');
    const searchModal     = document.getElementById('search-modal');
    const searchBackdrop  = document.getElementById('search-backdrop');
    const searchInput     = document.getElementById('search-input');
    const searchResults   = document.getElementById('search-results');

    // State
    const fileMap = new Map();          // path → File
    const aiCache = new Map();          // path → cached AI analysis result
    let currentFile = null;
    let currentCode = '';
    let searchFocusIndex = -1;

    // ============================================================
    // THEME
    // ============================================================
    const applyTheme = (t) => t === 'light' ? body.classList.add('light-theme') : body.classList.remove('light-theme');
    themeToggleBtn.addEventListener('click', () => {
        const next = body.classList.toggle('light-theme') ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        // Re-initialize mermaid theme
        mermaid.initialize({ startOnLoad: false, theme: next === 'light' ? 'default' : 'dark', flowchart: { curve: 'basis', useMaxWidth: true }, securityLevel: 'loose' });
    });
    const saved = localStorage.getItem('theme');
    applyTheme(saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    // ============================================================
    // SPLIT.JS (desktop only)
    // ============================================================
    if (window.innerWidth > 768) {
        Split(['#left-panel', '#right-wrapper'], { sizes: [28, 72], minSize: [220, 400], gutterSize: 8 });
        Split(['#code-and-flowchart-panels', '#analysis-panel'], { direction: 'vertical', sizes: [62, 38], minSize: [100, 100], gutterSize: 8 });
        Split(['#code-panel', '#flowchart-panel'], { sizes: [50, 50], minSize: [180, 180], gutterSize: 8 });
    }

    // ============================================================
    // TOAST
    // ============================================================
    function showToast(msg, type = 'info', duration = 2800) {
        const container = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
        t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
        container.appendChild(t);
        setTimeout(() => {
            t.classList.add('hiding');
            setTimeout(() => t.remove(), 300);
        }, duration);
    }

    // ============================================================
    // SEARCH MODAL
    // ============================================================
    function openSearch() {
        searchModal.classList.remove('hidden');
        searchInput.value = '';
        renderSearchResults('');
        setTimeout(() => searchInput.focus(), 50);
    }
    function closeSearch() { searchModal.classList.add('hidden'); }

    searchTrigger.addEventListener('click', openSearch);
    searchBackdrop.addEventListener('click', closeSearch);

    searchInput.addEventListener('input', () => {
        searchFocusIndex = -1;
        renderSearchResults(searchInput.value.trim().toLowerCase());
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = searchResults.querySelectorAll('.search-result-item');
        if (e.key === 'ArrowDown') { e.preventDefault(); searchFocusIndex = Math.min(searchFocusIndex + 1, items.length - 1); updateSearchFocus(items); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); searchFocusIndex = Math.max(searchFocusIndex - 1, 0); updateSearchFocus(items); }
        else if (e.key === 'Enter') {
            const focused = searchResults.querySelector('.search-result-item.focused');
            if (focused) { focused.click(); }
        }
    });

    function updateSearchFocus(items) {
        items.forEach((it, i) => it.classList.toggle('focused', i === searchFocusIndex));
        if (searchFocusIndex >= 0) items[searchFocusIndex]?.scrollIntoView({ block: 'nearest' });
    }

    function renderSearchResults(query) {
        searchResults.innerHTML = '';
        if (fileMap.size === 0) {
            searchResults.innerHTML = '<div class="search-result-empty">Import a project first</div>';
            return;
        }
        const matches = [...fileMap.entries()]
            .filter(([path]) => !query || path.toLowerCase().includes(query))
            .slice(0, 20);

        if (matches.length === 0) {
            searchResults.innerHTML = '<div class="search-result-empty">No files found</div>';
            return;
        }

        matches.forEach(([path, file]) => {
            const parts = path.split('/');
            const name = parts.pop();
            const dir = parts.join('/');
            const ext = name.split('.').pop().toLowerCase();
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <span class="lang-dot lang-${ext}" style="flex-shrink:0;width:8px;height:8px;border-radius:50%;display:inline-block"></span>
                <div style="min-width:0;flex:1">
                    <div class="file-name">${name}</div>
                    <div class="file-path">${dir || '/'}</div>
                </div>`;
            item.addEventListener('click', () => {
                closeSearch();
                displayFileContent(file);
            });
            searchResults.appendChild(item);
        });
    }

    // ============================================================
    // KEYBOARD SHORTCUTS
    // ============================================================
    document.addEventListener('keydown', (e) => {
        const cmd = e.metaKey || e.ctrlKey;
        if (cmd && e.key === 'k') { e.preventDefault(); openSearch(); }
        if (e.key === 'Escape') {
            if (!searchModal.classList.contains('hidden')) closeSearch();
        }
    });

    // ============================================================
    // FILE IMPORT
    // ============================================================
    folderUploadInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        fileMap.clear();
        explorerEmpty.style.display = 'none';
        fileTreeEl.classList.remove('hidden');
        fileTreeEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px">Loading…</div>';

        const root = buildFileTree(files);
        await computeProjectStats(files);
        renderFileTree(root, fileTreeEl);

        // Show badge
        projectBadge.classList.remove('hidden');
        projectNameBadge.textContent = root.name;
    });

    // ============================================================
    // LANGUAGE CONFIG
    // ============================================================
    const LANG_COLORS = {
        js: '#f7df1e', ts: '#3178c6', jsx: '#61dafb', tsx: '#3178c6',
        py: '#3572a5', java: '#b07219', cpp: '#f34b7d', c: '#555',
        html: '#e34c26', css: '#563d7c', scss: '#c6538c', json: '#9ca3af',
        md: '#083fa1', rs: '#dea584', go: '#00add8', rb: '#701516',
        php: '#4f5d95', kt: '#7f52ff', swift: '#f05138', dart: '#00b4ab',
        vue: '#42b883', svelte: '#ff3e00',
    };
    const LANG_LABELS = { js:'JavaScript', ts:'TypeScript', jsx:'React JSX', tsx:'React TSX', py:'Python', java:'Java', cpp:'C++', c:'C', html:'HTML', css:'CSS', json:'JSON', md:'Markdown', rs:'Rust', go:'Go', rb:'Ruby' };
    const TEXT_EXTENSIONS = new Set(['js','ts','jsx','tsx','py','java','cpp','c','h','hpp','html','css','scss','less','json','md','txt','yml','yaml','xml','sh','bash','sql','rb','go','rs','php','kt','swift','dart','vue','svelte','toml','ini','env','gitignore']);

    function getLangColor(ext) { return LANG_COLORS[ext] || '#64748b'; }
    function getLangClass(ext) { return `lang-${ext}`; }
    function isTextFile(name) { const e = name.split('.').pop().toLowerCase(); return TEXT_EXTENSIONS.has(e); }

    function getPrismLang(filename) {
        const e = filename.split('.').pop().toLowerCase();
        const map = { js:'javascript', ts:'typescript', jsx:'jsx', tsx:'tsx', py:'python', java:'java', cpp:'cpp', c:'c', html:'markup', css:'css', json:'json', md:'markdown', rs:'rust', go:'go', rb:'ruby', sh:'bash', yml:'yaml', yaml:'yaml', xml:'markup' };
        return map[e] || 'plaintext';
    }

    // ============================================================
    // FILE TREE BUILDER
    // ============================================================
    function buildFileTree(files) {
        const rootName = files[0].webkitRelativePath.split('/')[0];
        const root = { name: rootName, type: 'folder', children: [], path: rootName };
        const nodeMap = new Map([[rootName, root]]);

        for (const file of files) {
            fileMap.set(file.webkitRelativePath, file);
            const parts = file.webkitRelativePath.split('/');
            let cur = root;
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                const isFile = i === parts.length - 1;
                const fullPath = parts.slice(0, i + 1).join('/');
                let node = nodeMap.get(fullPath);
                if (!node) {
                    node = { name: part, type: isFile ? 'file' : 'folder', children: [], path: fullPath, file: isFile ? file : null };
                    cur.children.push(node);
                    nodeMap.set(fullPath, node);
                }
                cur = node;
            }
        }
        // Sort: folders first, then files, alphabetically
        const sortNode = (n) => {
            n.children.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            n.children.forEach(c => { if (c.type === 'folder') sortNode(c); });
        };
        sortNode(root);
        return root;
    }

    // ============================================================
    // FILE TREE RENDERER
    // ============================================================
    function renderFileTree(node, container) {
        container.innerHTML = '';
        node.children.forEach(child => renderTreeNode(child, container, 0));
    }

    function renderTreeNode(node, container, depth) {
        const item = document.createElement('div');
        item.className = 'tree-item';

        const row = document.createElement('div');
        row.className = 'tree-item-row';
        row.style.paddingLeft = `${8 + depth * 14}px`;

        if (node.type === 'folder') {
            const arrow = document.createElement('span');
            arrow.className = 'tree-arrow';
            arrow.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;
            const icon = document.createElement('span');
            icon.className = 'tree-icon';
            icon.textContent = '📁';
            const name = document.createElement('span');
            name.className = 'tree-folder-name';
            name.textContent = node.name;
            const badge = document.createElement('span');
            badge.className = 'tree-badge';
            badge.textContent = countFiles(node);
            row.append(arrow, icon, name, badge);

            const children = document.createElement('div');
            children.className = 'tree-children';
            node.children.forEach(c => renderTreeNode(c, children, depth + 1));

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = children.classList.toggle('open');
                arrow.classList.toggle('open', open);
                icon.textContent = open ? '📂' : '📁';
            });

            item.appendChild(row);
            item.appendChild(children);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'tree-arrow-spacer';
            const ext = node.name.split('.').pop().toLowerCase();
            const dot = document.createElement('span');
            dot.className = `lang-dot lang-${ext}`;
            dot.style.cssText = `background:${getLangColor(ext)};flex-shrink:0;`;
            const name = document.createElement('span');
            name.className = 'tree-name';
            name.textContent = node.name;

            row.append(spacer, dot, name);
            row.dataset.filePath = node.path;

            row.addEventListener('click', () => {
                document.querySelectorAll('.tree-item-row.selected').forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');
                if (node.file) displayFileContent(node.file);
            });

            item.appendChild(row);
        }

        container.appendChild(item);
    }

    function countFiles(node) {
        if (node.type === 'file') return 1;
        return node.children.reduce((s, c) => s + countFiles(c), 0);
    }

    // ============================================================
    // PROJECT STATS
    // ============================================================
    async function computeProjectStats(files) {
        const textFiles = [...files].filter(f => isTextFile(f.name));
        statFiles.textContent = files.length.toLocaleString();

        // Language breakdown
        const langCount = {};
        let totalLines = 0;

        const sample = textFiles.slice(0, 60);
        await Promise.all(sample.map(async (f) => {
            const ext = f.name.split('.').pop().toLowerCase();
            langCount[ext] = (langCount[ext] || 0) + 1;
            try {
                const text = await f.text();
                totalLines += text.split('\n').length;
            } catch(e) {}
        }));
        // Estimate for the rest
        totalLines = Math.round(totalLines * (textFiles.length / Math.max(sample.length, 1)));

        statLines.textContent = (totalLines > 1000 ? (totalLines/1000).toFixed(1) + 'k' : totalLines.toLocaleString());

        const sorted = Object.entries(langCount).sort((a,b) => b[1]-a[1]);
        const topLangs = sorted.slice(0, 3).map(([e]) => (LANG_LABELS[e] || e.toUpperCase())).join(', ');
        statLangs.textContent = topLangs || '—';

        projectStats.classList.remove('hidden');

        // Lang bar
        const total = sorted.reduce((s, [,v]) => s + v, 0);
        langBar.innerHTML = '';
        langLegend.innerHTML = '';
        sorted.slice(0, 6).forEach(([ext, count]) => {
            const pct = (count / total * 100).toFixed(1);
            const seg = document.createElement('div');
            seg.className = 'lang-bar-segment';
            seg.style.width = pct + '%';
            seg.style.background = getLangColor(ext);
            seg.title = `${ext} — ${pct}%`;
            langBar.appendChild(seg);

            const li = document.createElement('div');
            li.className = 'lang-legend-item';
            li.innerHTML = `<span class="lang-legend-dot" style="background:${getLangColor(ext)}"></span><span>${LANG_LABELS[ext] || ext.toUpperCase()} ${pct}%</span>`;
            langLegend.appendChild(li);
        });
        langBarContainer.classList.remove('hidden');
    }

    // ============================================================
    // CODE METRICS
    // ============================================================
    function computeMetrics(code, filename) {
        const lines = code.split('\n');
        const total = lines.length;
        const blank = lines.filter(l => !l.trim()).length;
        const comment = lines.filter(l => /^\s*(\/\/|\/\*|\*|#|<!--|"""|''')/.test(l)).length;
        const codeLn = total - blank - comment;

        const decisions = (code.match(/\b(if|else\s+if|for|while|switch|case|catch|\?\s|\&\&|\|\|)/g) || []).length;
        const complexity = 1 + decisions;
        const longLines = lines.filter(l => l.length > 100).length;
        const maxLine = Math.max(...lines.map(l => l.length));
        const avgLine = Math.round(lines.reduce((s,l) => s + l.length, 0) / total);
        const functions = (code.match(/\b(?:function\s+\w+|def\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(|(?:public|private|protected|static)\s+\w+\s*\()/g) || []).length;
        const classes = (code.match(/\bclass\s+\w+/g) || []).length;

        let score = 100;
        score -= Math.min(35, (complexity - 1) * 1.5);
        score -= Math.min(15, (longLines / total) * 100 * 0.5);
        score += Math.min(8, (comment / total) * 50);
        score = Math.max(0, Math.min(100, Math.round(score)));

        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

        return { total, codeLn, blank, comment, complexity, maxLine, avgLine, functions, classes, score, grade };
    }

    function renderMetricsTab(metrics) {
        const maxVal = metrics.total;
        const codePct = Math.round(metrics.codeLn / maxVal * 100);
        const commentPct = Math.round(metrics.comment / maxVal * 100);
        const blankPct = Math.round(metrics.blank / maxVal * 100);
        const complexPct = Math.min(100, Math.round((metrics.complexity - 1) / 30 * 100));

        tabMetrics.innerHTML = `
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-card-value">${metrics.total.toLocaleString()}</div>
                    <div class="metric-card-label">Total Lines</div>
                </div>
                <div class="metric-card" style="align-items:center;justify-content:center">
                    <div class="grade-circle grade-${metrics.grade}">${metrics.grade}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-card-value">${metrics.functions}</div>
                    <div class="metric-card-label">Functions</div>
                </div>
                <div class="metric-card">
                    <div class="metric-card-value">${metrics.classes}</div>
                    <div class="metric-card-label">Classes</div>
                </div>
            </div>

            <div class="loc-breakdown">
                <h4>Lines of Code Breakdown</h4>
                <div class="loc-row">
                    <span class="loc-label">Code</span>
                    <div class="loc-bar-wrap"><div class="loc-bar-fill loc-code" style="width:${codePct}%"></div></div>
                    <span class="loc-value">${metrics.codeLn}</span>
                </div>
                <div class="loc-row">
                    <span class="loc-label">Comments</span>
                    <div class="loc-bar-wrap"><div class="loc-bar-fill loc-comment" style="width:${commentPct}%"></div></div>
                    <span class="loc-value">${metrics.comment}</span>
                </div>
                <div class="loc-row">
                    <span class="loc-label">Blank</span>
                    <div class="loc-bar-wrap"><div class="loc-bar-fill loc-blank" style="width:${blankPct}%"></div></div>
                    <span class="loc-value">${metrics.blank}</span>
                </div>
            </div>

            <div class="complexity-bar">
                <h4>Cyclomatic Complexity — <span style="color:var(--text)">${metrics.complexity}</span></h4>
                <div class="complexity-track">
                    <div class="complexity-thumb" style="left:${Math.min(95, Math.max(5, complexPct))}%"></div>
                </div>
                <div class="complexity-labels"><span>Simple</span><span>Complex</span></div>
            </div>

            <div class="metrics-grid" style="margin-bottom:0">
                <div class="metric-card">
                    <div class="metric-card-value">${metrics.maxLine}</div>
                    <div class="metric-card-label">Max Line Length</div>
                </div>
                <div class="metric-card">
                    <div class="metric-card-value">${metrics.avgLine}</div>
                    <div class="metric-card-label">Avg Line Length</div>
                </div>
            </div>`;
    }

    // ============================================================
    // AI INSIGHTS TAB
    // ============================================================
    function renderAIResult(area, data) {
        const esc = (s) => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
        area.innerHTML = `<div class="ai-result">
            <div class="ai-result-section">
                <h4>Summary</h4>
                <p>${esc(data.summary || '—')}</p>
            </div>
            ${data.purpose ? `<div class="ai-result-section"><h4>Purpose</h4><p>${esc(data.purpose)}</p></div>` : ''}
            ${data.keyInsights?.length ? `<div class="ai-result-section"><h4>Key Insights</h4><ul>${data.keyInsights.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
            ${data.suggestions?.length ? `<div class="ai-result-section"><h4>Suggestions</h4><ul>${data.suggestions.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
            ${data.patterns?.length ? `<div class="ai-result-section"><h4>Patterns Used</h4><ul>${data.patterns.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
        </div>`;
    }

    function renderInsightsTab(code, filename, cacheKey) {
        const cached = aiCache.get(cacheKey);

        tabInsights.innerHTML = `
            <button class="ai-generate-btn" id="run-ai-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                ${cached ? 'Regenerate AI Insights' : 'Generate AI Insights'}
            </button>
            <div id="ai-result-area" style="font-size:13px">
                ${cached
                    ? '<span style="font-size:11px;color:var(--accent-green);margin-bottom:8px;display:block">✓ Cached result — click Regenerate to refresh</span>'
                    : '<span style="color:var(--text-muted)">Click the button to get AI-powered insights using Gemini (results are cached per file).</span>'
                }
            </div>`;

        const area = document.getElementById('ai-result-area');

        // Show cached result immediately
        if (cached) renderAIResult(area, cached);

        document.getElementById('run-ai-btn').addEventListener('click', async function() {
            this.disabled = true;
            this.innerHTML = `<div class="loader" style="width:16px;height:16px;margin:0"></div> Analyzing with Gemini…`;
            area.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Sending request…</span>';

            // Send only first 2500 chars — backend also caps, but be explicit
            const snippet = code.length > 2500
                ? code.substring(0, 2000) + '\n…\n' + code.substring(code.length - 500)
                : code;

            try {
                const res = await fetch('/api/ai-analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: snippet, filename })
                });

                let errorText = 'Request failed';
                if (!res.ok) {
                    try { errorText = (await res.json()).error || errorText; } catch(_) {}
                    throw new Error(errorText);
                }

                const data = await res.json();
                if (!data || typeof data !== 'object') throw new Error('Empty response from AI');

                aiCache.set(cacheKey, data);   // ← cache result, no re-requests on revisit
                renderAIResult(area, data);

                this.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Regenerate`;
                this.disabled = false;
                showToast('AI insights ready', 'success');
            } catch (err) {
                area.innerHTML = `<div style="color:var(--accent-red);font-size:13px;padding:8px;border:1px solid rgba(239,68,68,0.3);border-radius:6px;background:rgba(239,68,68,0.06)">
                    <strong>Error:</strong> ${err.message}
                </div>`;
                this.innerHTML = '↺ Retry';
                this.disabled = false;
            }
        });
    }

    // ============================================================
    // DEPENDENCIES TAB
    // ============================================================
    function renderDepsTab(code, filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const deps = [];

        // JS/TS imports
        const impRe = /^import\s+.+?\s+from\s+['"]([^'"]+)['"]/gm;
        const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
        // Python
        const pyImp = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm;
        // Java
        const javaImp = /^import\s+([\w.]+);/gm;
        // C/C++
        const cInc = /^#include\s+[<"]([^>"]+)[>"]/gm;

        let m;
        if (['js','ts','jsx','tsx','mjs'].includes(ext)) {
            while ((m = impRe.exec(code)) !== null) deps.push({ name: m[1], type: m[1].startsWith('.') ? 'local' : 'package' });
            while ((m = reqRe.exec(code)) !== null) deps.push({ name: m[1], type: m[1].startsWith('.') ? 'local' : 'package' });
        } else if (ext === 'py') {
            while ((m = pyImp.exec(code)) !== null) deps.push({ name: m[1] || m[2], type: 'module' });
        } else if (ext === 'java') {
            while ((m = javaImp.exec(code)) !== null) deps.push({ name: m[1], type: 'import' });
        } else if (['c','cpp','h','hpp'].includes(ext)) {
            while ((m = cInc.exec(code)) !== null) deps.push({ name: m[1], type: m[0].includes('<') ? 'system' : 'local' });
        }

        const unique = [...new Map(deps.map(d => [d.name, d])).values()];

        if (unique.length === 0) {
            tabDeps.innerHTML = '<div class="no-data">No imports / dependencies detected.</div>';
            return;
        }

        const typeIcon = { package: '📦', local: '📄', module: '🐍', import: '☕', system: '⚙️' };
        tabDeps.innerHTML = `<div class="dep-list">${unique.map(d => `
            <div class="dep-item">
                <span class="dep-icon">${typeIcon[d.type] || '📦'}</span>
                <span class="dep-name">${d.name}</span>
                <span class="dep-type">${d.type}</span>
            </div>`).join('')}</div>`;
    }

    // ============================================================
    // TAB SWITCHING
    // ============================================================
    analysisTabs?.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const tab = btn.dataset.tab;
        analysisTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(`tab-${tab}`)?.classList.add('active');
    });

    // ============================================================
    // COPY CODE
    // ============================================================
    copyCodeBtn?.addEventListener('click', async () => {
        if (!currentCode) return;
        try {
            await navigator.clipboard.writeText(currentCode);
            showToast('Code copied to clipboard', 'success');
        } catch {
            showToast('Copy failed — check browser permissions', 'error');
        }
    });

    // ============================================================
    // EXPORT SVG
    // ============================================================
    exportSvgBtn?.addEventListener('click', () => {
        const svg = flowchartDiagram.querySelector('svg');
        if (!svg) { showToast('No diagram to export', 'error'); return; }
        const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${currentFile?.name || 'flowchart'}-diagram.svg`;
        a.click();
        showToast('Diagram exported as SVG', 'success');
    });

    // ============================================================
    // MERMAID RENDER
    // ============================================================
    async function renderMermaid(container, syntax) {
        container.innerHTML = '';
        try {
            const id = 'mermaid_' + Date.now();
            const { svg } = await mermaid.render(id, syntax);
            container.innerHTML = svg;
        } catch (err) {
            console.error('Mermaid error:', err);
            container.innerHTML = `<p class="flowchart-error">Could not render diagram.<br><small>${err.message?.substring(0,120)}</small></p>`;
        }
    }

    // ============================================================
    // DISPLAY FILE CONTENT
    // ============================================================
    async function displayFileContent(file) {
        currentFile = file;
        const content = await file.text();
        currentCode = content;
        const lang = getPrismLang(file.name);

        // ---- Code Panel ----
        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.className = `language-${lang}`;
        codeEl.textContent = content;
        pre.appendChild(codeEl);

        codeContent.innerHTML = '';
        codeContent.appendChild(pre);
        codeContent.classList.remove('hidden');
        codeEmpty.style.display = 'none';
        codeFileName.textContent = file.name;
        codeToolbar.style.display = 'flex';
        Prism.highlightElement(codeEl);

        // ---- Flowchart Panel ----
        flowchartEmpty.style.display = 'none';
        flowchartDiagram.classList.remove('hidden');
        flowchartDiagram.innerHTML = '<div class="flowchart-loading"><div class="loader"></div><span>Generating diagram…</span></div>';
        flowchartFileName.textContent = `Flowchart — ${file.name}`;
        flowchartToolbar.style.display = 'flex';

        const syntax = window.generateMermaidFromCode(content, file.name);
        await renderMermaid(flowchartDiagram, syntax);

        // ---- Analysis Panel ----
        analysisEmpty.style.display = 'none';
        analysisContent.classList.remove('hidden');
        analysisTabs.classList.remove('hidden');

        // Reset to metrics tab
        analysisTabs.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tabMetrics.classList.add('active');

        const metrics = computeMetrics(content, file.name);
        renderMetricsTab(metrics);
        renderInsightsTab(content, file.name, file.webkitRelativePath || file.name);
        renderDepsTab(content, file.name);
    }

    // ============================================================
    // BACK TO TOP
    // ============================================================
    document.querySelector('.back-to-top')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

});
