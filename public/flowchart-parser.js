// flowchart-parser.js
// Client-side code analyzer — generates Mermaid flowcharts without any API calls.

(function (window) {

    // --- Helpers ---

    function sanitize(str) {
        if (!str) return '';
        return str
            .replace(/"/g, "'")
            .replace(/[<>{}|#\[\]]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 38);
    }

    function nodeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '').substring(0, 24) || 'node';
    }

    // Extract the brace-delimited body starting at or after `startPos`
    function extractBody(code, startPos) {
        let i = startPos;
        // Skip to opening brace
        while (i < code.length && code[i] !== '{') i++;
        if (i >= code.length) return '';
        let depth = 0;
        const start = i;
        while (i < code.length) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') { depth--; if (depth === 0) return code.slice(start, i + 1); }
            i++;
        }
        return code.slice(start, Math.min(start + 2000, code.length));
    }

    function analyzeBody(body) {
        return {
            hasIf:      /\bif\s*\(/.test(body),
            hasElse:    /\belse\b/.test(body),
            hasFor:     /\bfor\s*\(/.test(body),
            hasWhile:   /\bwhile\s*\(/.test(body),
            hasSwitch:  /\bswitch\s*\(/.test(body),
            hasTry:     /\btry\s*[{(]/.test(body),
            hasCatch:   /\bcatch\s*\(/.test(body),
            hasReturn:  /\breturn\b/.test(body),
            hasAwait:   /\bawait\b/.test(body),
            hasThrow:   /\bthrow\b/.test(body),
            hasCallback:/\.(forEach|map|filter|reduce|find|then|catch)\s*\(/.test(body),
        };
    }

    // Build a compact in-line flow for a single function/method body
    function buildFunctionFlow(prefix, fn, out) {
        const f = fn.flow;
        const s = `${prefix}_s`;
        const label = sanitize((fn.async ? '⚡ ' : '') + fn.name + '(' + (fn.params ? sanitize(fn.params) : '') + ')');

        out.push(`        ${s}(["${label}"])`);

        let prev = s;

        if (f.hasTry) {
            const t = `${prefix}_try`;
            const c = `${prefix}_catch`;
            out.push(`        ${t}{try block}`);
            out.push(`        ${c}[catch / handle error]`);
            out.push(`        ${prev} --> ${t}`);
            out.push(`        ${t} -->|throws| ${c}`);
            prev = t;
        }

        if (f.hasSwitch) {
            const sw = `${prefix}_sw`;
            out.push(`        ${sw}{switch}`);
            out.push(`        ${sw}_a[case branch]`);
            out.push(`        ${sw}_d[default]`);
            out.push(`        ${prev} --> ${sw}`);
            out.push(`        ${sw} --> ${sw}_a`);
            out.push(`        ${sw} --> ${sw}_d`);
            prev = sw;
        } else if (f.hasFor || f.hasWhile || f.hasCallback) {
            const lp = `${prefix}_loop`;
            const loopLabel = f.hasCallback ? 'iterate / callback' : f.hasFor ? 'for loop' : 'while loop';
            out.push(`        ${lp}[/${loopLabel}/]`);
            out.push(`        ${prev} --> ${lp}`);
            prev = lp;

            if (f.hasIf) {
                const cond = `${prefix}_cond`;
                out.push(`        ${cond}{condition?}`);
                out.push(`        ${cond}_y[process item]`);
                out.push(`        ${cond}_n[skip]`);
                out.push(`        ${lp} --> ${cond}`);
                out.push(`        ${cond} -->|yes| ${cond}_y`);
                out.push(`        ${cond} -->|no| ${cond}_n`);
            }
        } else if (f.hasIf) {
            const cond = `${prefix}_cond`;
            const yt = `${prefix}_yt`;
            const nf = f.hasElse ? `${prefix}_nf` : null;
            out.push(`        ${cond}{condition?}`);
            out.push(`        ${yt}[handle true]`);
            if (nf) out.push(`        ${nf}[handle false]`);
            out.push(`        ${prev} --> ${cond}`);
            out.push(`        ${cond} -->|yes| ${yt}`);
            if (nf) out.push(`        ${cond} -->|no| ${nf}`);
            prev = cond;
        }

        if (f.hasReturn || f.hasThrow) {
            const ret = `${prefix}_ret`;
            out.push(`        ${ret}([${f.hasThrow && !f.hasReturn ? 'throw' : 'return'}])`);
        }
    }

    // --- Language Parsers ---

    // JS / TS / JSX / TSX
    function parseJS(code, filename) {
        const out = ['flowchart TD'];
        const s = sanitize;

        // Imports
        const imports = [];
        const impRe = /^import\s+.+?\s+from\s+['"]([^'"]+)['"]/gm;
        const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
        let m;
        while ((m = impRe.exec(code)) !== null) imports.push(m[1]);
        while ((m = reqRe.exec(code)) !== null) imports.push(m[1]);
        const uniqueImports = [...new Set(imports)].slice(0, 6);

        // Classes
        const classRe = /(?:^|[\n;{}])\s*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+[\w,\s<>]+)?\s*\{/gm;
        const classes = [];
        while ((m = classRe.exec(code)) !== null) {
            const body = extractBody(code, m.index + m[0].length - 1);
            const methods = [];
            const mRe = /\n\s{1,4}(?:(?:public|private|protected|static|async|override|abstract|get|set)\s+)*(\w+)\s*\(([^)]*)\)(?:\s*:\s*[\w<>\[\]|&\s]+)?\s*\{/g;
            let mm;
            while ((mm = mRe.exec(body)) !== null) {
                const skip = ['if','for','while','switch','catch','try','constructor','super'];
                if (!skip.includes(mm[1])) {
                    const mbody = extractBody(body, mm.index);
                    methods.push({
                        name: mm[1],
                        params: mm[2],
                        async: /\basync\b/.test(body.slice(Math.max(0, mm.index - 30), mm.index)),
                        flow: analyzeBody(mbody)
                    });
                }
            }
            // Constructor
            const ctorMatch = body.match(/\bconstructor\s*\(([^)]*)\)/);
            if (ctorMatch) {
                methods.unshift({ name: 'constructor', params: ctorMatch[1], async: false, flow: analyzeBody(extractBody(body, ctorMatch.index || 0)) });
            }
            classes.push({ name: m[1], extends: m[2], methods: methods.slice(0, 10) });
        }

        // Top-level functions (exclude ones inside classes)
        const functions = [];
        const classPositions = classes.map((_, i) => ({ start: code.indexOf('class ' + classes[i].name), len: 2000 }));

        const fnRe = /(?:^|[\n;])\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm;
        const arrowRe = /(?:^|[\n;])\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/gm;

        while ((m = fnRe.exec(code)) !== null) {
            const inClass = classPositions.some(c => m.index > c.start && m.index < c.start + c.len);
            if (!inClass) {
                const body = extractBody(code, m.index);
                functions.push({ name: m[1], params: m[2], async: m[0].includes('async'), flow: analyzeBody(body) });
            }
        }
        while ((m = arrowRe.exec(code)) !== null) {
            const inClass = classPositions.some(c => m.index > c.start && m.index < c.start + c.len);
            if (!inClass) {
                const body = extractBody(code, m.index);
                functions.push({ name: m[1], params: m[3] || '', async: !!(m[2]), flow: analyzeBody(body) });
            }
        }

        // ---- Build diagram ----
        out.push(`    entry(["📄 ${s(filename)}"])`);
        out.push('');

        if (uniqueImports.length > 0) {
            out.push('    subgraph imports["📦 Dependencies"]');
            uniqueImports.forEach((imp, i) => out.push(`        dep${i}["${s(imp)}"]`));
            out.push('    end');
            out.push('    entry --> imports');
            out.push('');
        }

        classes.forEach((cls, ci) => {
            const cid = `cls_${nodeId(cls.name)}`;
            const title = cls.extends ? `class ${s(cls.name)} extends ${s(cls.extends)}` : `class ${s(cls.name)}`;
            if (cls.methods.length === 0) {
                out.push(`    ${cid}[["🏛 ${title}()"]]`);
                out.push(`    entry --> ${cid}`);
            } else {
                out.push(`    subgraph ${cid}["🏛 ${title}"]`);
                cls.methods.forEach((method, mi) => {
                    const mid = `${cid}_m${mi}`;
                    const f = method.flow;
                    if (f.hasTry || f.hasIf || f.hasFor || f.hasWhile || f.hasSwitch || f.hasCallback) {
                        buildFunctionFlow(mid, method, out);
                    } else {
                        const lbl = `${method.async ? '⚡ ' : ''}${s(method.name)}(${s(method.params)})`;
                        out.push(`        ${mid}["${lbl}"]`);
                    }
                });
                out.push('    end');
                out.push(`    entry --> ${cid}`);
            }
            out.push('');
        });

        if (functions.length > 0) {
            out.push('    subgraph fns["🔧 Functions"]');
            functions.slice(0, 12).forEach((fn, fi) => {
                const fid = `fn_${nodeId(fn.name)}_${fi}`;
                const f = fn.flow;
                if (f.hasTry || f.hasIf || f.hasFor || f.hasWhile || f.hasSwitch || f.hasCallback) {
                    buildFunctionFlow(fid, fn, out);
                } else {
                    const lbl = `${fn.async ? '⚡ ' : ''}${s(fn.name)}(${s(fn.params)})`;
                    out.push(`        ${fid}["${lbl}"]`);
                }
            });
            out.push('    end');
            out.push('    entry --> fns');
            out.push('');
        }

        if (classes.length === 0 && functions.length === 0) {
            return buildGenericFlowchart(code, filename);
        }

        return out.join('\n');
    }

    // Python
    function parsePy(code, filename) {
        const out = ['flowchart TD'];
        const s = sanitize;

        const imports = [];
        const impRe = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm;
        let m;
        while ((m = impRe.exec(code)) !== null) imports.push(m[1] || m[2]);

        const classRe = /^class\s+(\w+)(?:\(([^)]*)\))?:/gm;
        const classes = [];
        while ((m = classRe.exec(code)) !== null) {
            const body = code.slice(m.index, m.index + 1500);
            const methodRe = /\n[ \t]+(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\):/g;
            const methods = [];
            let mm;
            while ((mm = methodRe.exec(body)) !== null) {
                const mbody = body.slice(mm.index, mm.index + 400);
                methods.push({ name: mm[1], params: mm[2], async: mm[0].includes('async'), flow: analyzeBody(mbody) });
            }
            classes.push({ name: m[1], inherits: m[2], methods: methods.slice(0, 10) });
        }

        const funcRe = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\):/gm;
        const functions = [];
        const methodNames = new Set(classes.flatMap(c => c.methods.map(mm => mm.name)));
        while ((m = funcRe.exec(code)) !== null) {
            if (!methodNames.has(m[1])) {
                const body = code.slice(m.index, m.index + 600);
                functions.push({ name: m[1], params: m[2], async: m[0].startsWith('async'), flow: analyzeBody(body) });
            }
        }

        out.push(`    entry(["🐍 ${s(filename)}"])`);
        out.push('');

        if (imports.length > 0) {
            out.push('    subgraph deps["📦 Imports"]');
            [...new Set(imports)].slice(0, 6).forEach((imp, i) => out.push(`        dep${i}["${s(imp)}"]`));
            out.push('    end');
            out.push('    entry --> deps');
            out.push('');
        }

        classes.forEach((cls, ci) => {
            const cid = `cls_${nodeId(cls.name)}`;
            const title = cls.inherits ? `class ${s(cls.name)}(${s(cls.inherits)})` : `class ${s(cls.name)}`;
            out.push(`    subgraph ${cid}["🏛 ${title}"]`);
            cls.methods.forEach((method, mi) => {
                const mid = `${cid}_m${mi}`;
                const f = method.flow;
                if (f.hasTry || f.hasIf || f.hasFor || f.hasWhile) {
                    buildFunctionFlow(mid, method, out);
                } else {
                    out.push(`        ${mid}["${method.async ? '⚡ ' : ''}${s(method.name)}(${s(method.params)})"]`);
                }
            });
            out.push('    end');
            out.push(`    entry --> ${cid}`);
            out.push('');
        });

        if (functions.length > 0) {
            out.push('    subgraph fns["🔧 Functions"]');
            functions.slice(0, 12).forEach((fn, fi) => {
                const fid = `fn_${nodeId(fn.name)}_${fi}`;
                const f = fn.flow;
                if (f.hasTry || f.hasIf || f.hasFor || f.hasWhile) {
                    buildFunctionFlow(fid, fn, out);
                } else {
                    out.push(`        ${fid}["${fn.async ? '⚡ ' : ''}${s(fn.name)}(${s(fn.params)})"]`);
                }
            });
            out.push('    end');
            out.push('    entry --> fns');
        }

        if (classes.length === 0 && functions.length === 0) return buildGenericFlowchart(code, filename);
        return out.join('\n');
    }

    // Java
    function parseJava(code, filename) {
        const out = ['flowchart TD'];
        const s = sanitize;

        const classRe = /(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
        let m, cls = { name: filename.replace('.java', ''), extends: null };
        if ((m = classRe.exec(code)) !== null) cls = { name: m[1], extends: m[2] };

        const methodRe = /(?:public|private|protected|static|final|synchronized|native|default)\s+(?:(?:static|final|abstract|synchronized)\s+)*(?:<[\w,\s]+>\s+)?(?:[\w<>\[\]]+\s+)+(\w+)\s*\(([^)]*)\)(?:\s+throws\s+[\w,\s]+)?\s*\{/g;
        const methods = [];
        while ((m = methodRe.exec(code)) !== null) {
            const skip = ['if', 'for', 'while', 'switch', 'catch', 'try'];
            if (!skip.includes(m[1])) {
                const body = extractBody(code, m.index);
                methods.push({ name: m[1], params: m[2], async: false, flow: analyzeBody(body) });
            }
        }

        const title = cls.extends ? `${s(cls.name)} extends ${s(cls.extends)}` : s(cls.name);
        out.push(`    entry(["☕ ${s(filename)}"])`);
        out.push('');

        if (methods.length > 0) {
            out.push(`    subgraph clsMain["🏛 class ${title}"]`);
            methods.slice(0, 12).forEach((fn, fi) => {
                const fid = `mth_${nodeId(fn.name)}_${fi}`;
                const f = fn.flow;
                if (f.hasTry || f.hasIf || f.hasFor || f.hasWhile || f.hasSwitch) {
                    buildFunctionFlow(fid, fn, out);
                } else {
                    out.push(`        ${fid}["${s(fn.name)}(${s(fn.params)})"]`);
                }
            });
            out.push('    end');
            out.push('    entry --> clsMain');
        } else {
            return buildGenericFlowchart(code, filename);
        }

        return out.join('\n');
    }

    // C / C++
    function parseC(code, filename) {
        const out = ['flowchart TD'];
        const s = sanitize;

        // Remove preprocessor / includes for cleaner parse
        const stripped = code.replace(/^#.*/gm, '');
        const funcRe = /^(?:[\w*:~]+\s+)+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?\{/gm;
        const functions = [];
        let m;
        while ((m = funcRe.exec(stripped)) !== null) {
            const skip = ['if', 'for', 'while', 'switch', 'catch', 'else', 'do'];
            if (!skip.includes(m[1]) && m[1] !== '') {
                const body = extractBody(stripped, m.index);
                functions.push({ name: m[1], params: m[2], async: false, flow: analyzeBody(body) });
            }
        }

        out.push(`    entry(["⚙️ ${s(filename)}"])`);
        out.push('');

        // Includes
        const includes = [...code.matchAll(/^#include\s+[<"]([^>"]+)[>"]/gm)].map(x => x[1]).slice(0, 5);
        if (includes.length > 0) {
            out.push('    subgraph incs["📦 Includes"]');
            includes.forEach((inc, i) => out.push(`        inc${i}["${s(inc)}"]`));
            out.push('    end');
            out.push('    entry --> incs');
            out.push('');
        }

        if (functions.length === 0) return buildGenericFlowchart(code, filename);

        out.push('    subgraph fns["🔧 Functions"]');
        functions.slice(0, 12).forEach((fn, fi) => {
            const fid = `fn_${nodeId(fn.name)}_${fi}`;
            const f = fn.flow;
            if (f.hasTry || f.hasIf || f.hasFor || f.hasWhile || f.hasSwitch) {
                buildFunctionFlow(fid, fn, out);
            } else {
                out.push(`        ${fid}["${s(fn.name)}(${s(fn.params)})"]`);
            }
        });
        out.push('    end');
        out.push('    entry --> fns');

        return out.join('\n');
    }

    // Generic fallback
    function buildGenericFlowchart(code, filename) {
        const out = ['flowchart TD'];
        const s = sanitize;
        const lines = code.split('\n').length;
        const words = code.split(/\s+/).filter(Boolean).length;

        out.push(`    entry(["📄 ${s(filename)}"])`);
        out.push(`    meta["${lines} lines · ${words} words"]`);
        out.push('    entry --> meta');

        const anyFn = [...code.matchAll(/(?:function|def|fn\s|func\s)\s+(\w+)/g)].map(x => x[1]);
        if (anyFn.length > 0) {
            [...new Set(anyFn)].slice(0, 8).forEach((name, i) => {
                out.push(`    f${i}["${s(name)}()"]`);
                out.push(`    meta --> f${i}`);
            });
        }

        return out.join('\n');
    }

    // --- Public entry point ---
    function generateMermaidFromCode(code, filename) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        try {
            if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) return parseJS(code, filename);
            if (ext === 'py') return parsePy(code, filename);
            if (ext === 'java') return parseJava(code, filename);
            if (['c', 'cpp', 'cc', 'h', 'hpp'].includes(ext)) return parseC(code, filename);
            return buildGenericFlowchart(code, filename);
        } catch (e) {
            console.warn('[flowchart-parser] Error:', e);
            return buildGenericFlowchart(code, filename);
        }
    }

    window.generateMermaidFromCode = generateMermaidFromCode;

})(window);
