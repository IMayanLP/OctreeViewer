const svgNS = "http://www.w3.org/2000/svg";

// ---------- Parsing ----------
function sanitizeInput(str) {
    return str.replace(/[^(BW]/g, '');
}

function parseTree(str, maxLevel) {
    let pos = 0;
    const hasLimit = maxLevel !== null && !Number.isNaN(maxLevel);

    function parseNode(depth) {
        if (pos >= str.length) {
            throw new Error(`String incompleta: faltam caracteres a partir da posição ${pos}.`);
        }
        const ch = str[pos];
        pos++;

        if (ch === '(') {
            // Mesma regra do Aux: um nó só tem filhos se depth < maxLevel.
            // Se já está no maxLevel, o '(' não foi subdividido e é, na
            // prática, uma folha (half-leaf) — não consome mais caracteres.
            if (hasLimit && depth >= maxLevel) {
                return { type: 'half', char: '(', children: [], isLeafHalf: true };
            }
            const node = { type: 'half', char: '(', children: [], expanded: depth === 0 };
            for (let i = 0; i < 8; i++) {
                node.children.push(parseNode(depth + 1));
            }
            return node;
        }
        if (ch === 'B' || ch === 'W') {
            return { type: ch === 'B' ? 'black' : 'white', char: ch, children: [] };
        }
        throw new Error(`Caractere inválido "${ch}" na posição ${pos - 1}. Use apenas B, W ou (.`);
    }

    const root = parseNode(0);
    if (pos !== str.length) {
        throw new Error(`Sobraram ${str.length - pos} caractere(s) não utilizados no final da string.`);
    }
    return root;
}

// ---------- Layout ----------
function layoutTree(root) {
    let leafIndex = 0;
    let maxDepth = 0;
    let leafCount = 0;
    let halfCount = 0;
    let halfLeafCount = 0;
    let collapsedCount = 0;

    function assign(node, depth) {
        maxDepth = Math.max(maxDepth, depth);
        node.depth = depth;
        const isCollapsedHalf = node.children.length > 0 && !node.expanded;
        if (node.children.length === 0 || isCollapsedHalf) {
            node.x = leafIndex;
            leafIndex++;
            if (isCollapsedHalf) {
                collapsedCount++;
            } else {
                leafCount++;
                if (node.isLeafHalf) halfLeafCount++;
            }
        } else {
            halfCount++;
            node.children.forEach(c => assign(c, depth + 1));
            const xs = node.children.map(c => c.x);
            node.x = (xs[0] + xs[xs.length - 1]) / 2;
        }
    }

    assign(root, 0);
    return { leafSlots: leafIndex, maxDepth, leafCount, halfCount, halfLeafCount, collapsedCount };
}

// ---------- Rendering ----------
function renderTree(root, info) {
    const svg = document.getElementById('treeSvg');
    svg.innerHTML = '';

    const HSPACING = 46;
    const VSPACING = 80;
    const RADIUS = 14;
    const MARGIN = 36;

    const width = Math.max(info.leafSlots * HSPACING + MARGIN * 2, 200);
    const height = (info.maxDepth + 1) * VSPACING + MARGIN * 2;

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    function coords(node) {
        return {
            cx: MARGIN + node.x * HSPACING,
            cy: MARGIN + node.depth * VSPACING
        };
    }

    function drawEdges(node) {
        const isCollapsedHalf = node.children.length > 0 && !node.expanded;
        if (isCollapsedHalf) return;
        const p = coords(node);
        node.children.forEach(child => {
            const c = coords(child);
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', p.cx);
            line.setAttribute('y1', p.cy);
            line.setAttribute('x2', c.cx);
            line.setAttribute('y2', c.cy);
            line.setAttribute('class', 'edge');
            svg.appendChild(line);
            drawEdges(child);
        });
    }
    drawEdges(root);

    function countSubtreeNodes(node) {
        let count = 0;
        (function walk(n) {
            n.children.forEach(c => { count++; walk(c); });
        })(node);
        return count;
    }

    function drawNode(node) {
        const { cx, cy } = coords(node);
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'node-group');

        if (node.type === 'half') {
            const bg = document.createElementNS(svgNS, 'circle');
            bg.setAttribute('cx', cx);
            bg.setAttribute('cy', cy);
            bg.setAttribute('r', RADIUS);
            bg.setAttribute('class', 'node-circle node-white-fill');
            g.appendChild(bg);

            const half = document.createElementNS(svgNS, 'path');
            half.setAttribute('d', `M ${cx} ${cy - RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${cx} ${cy + RADIUS} Z`);
            half.setAttribute('class', 'node-half-black');
            g.appendChild(half);

            const outline = document.createElementNS(svgNS, 'circle');
            outline.setAttribute('cx', cx);
            outline.setAttribute('cy', cy);
            outline.setAttribute('r', RADIUS);
            outline.setAttribute('class', node.isLeafHalf ? 'node-outline node-outline-leaf' : 'node-outline');
            g.appendChild(outline);

            // Nó Half com filhos reais: badge de expandir/colapsar
            if (node.children.length > 0) {
                const badgeR = 7;
                const bx = cx + RADIUS * 0.72;
                const by = cy + RADIUS * 0.72;

                const badgeCircle = document.createElementNS(svgNS, 'circle');
                badgeCircle.setAttribute('cx', bx);
                badgeCircle.setAttribute('cy', by);
                badgeCircle.setAttribute('r', badgeR);
                badgeCircle.setAttribute('class', 'node-badge-circle');

                const badgeText = document.createElementNS(svgNS, 'text');
                badgeText.setAttribute('x', bx);
                badgeText.setAttribute('y', by + 0.5);
                badgeText.setAttribute('class', 'node-badge-text');
                badgeText.textContent = node.expanded ? '−' : '+';

                const badgeGroup = document.createElementNS(svgNS, 'g');
                badgeGroup.appendChild(badgeCircle);
                badgeGroup.appendChild(badgeText);
                badgeGroup.addEventListener('click', ev => {
                    ev.stopPropagation();
                    node.expanded = !node.expanded;
                    rerender();
                });
                g.appendChild(badgeGroup);
            }
        } else {
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', RADIUS);
            circle.setAttribute('class', `node-circle ${node.type === 'black' ? 'node-black-fill' : 'node-white-fill'}`);
            g.appendChild(circle);
        }

        const title = document.createElementNS(svgNS, 'title');
        let label = node.isLeafHalf ? `${node.char} (half-leaf, maxLevel atingido)` : node.char;
        if (node.children.length > 0 && !node.expanded) {
            label += ` — colapsado (${countSubtreeNodes(node)} nós ocultos)`;
        }
        title.textContent = `${label}  (nível ${node.depth})`;
        g.appendChild(title);

        svg.appendChild(g);
        if (node.expanded || node.children.length === 0) {
            node.children.forEach(drawNode);
        }
    }
    drawNode(root);
}

// ---------- Controller ----------
let currentRoot = null;

function updateStats(info) {
    const statsMsg = document.getElementById('statsMsg');
    statsMsg.textContent = `Profundidade visível: ${info.maxDepth} · Folhas: ${info.leafCount} (${info.halfLeafCount} half-leaf) · Nós "Half" internos: ${info.halfCount} · Colapsados: ${info.collapsedCount}`;
}

function rerender() {
    if (!currentRoot) return;
    const info = layoutTree(currentRoot);
    renderTree(currentRoot, info);
    updateStats(info);
}

function walkTree(node, fn) {
    fn(node);
    node.children.forEach(c => walkTree(c, fn));
}

function handleRender() {
    const rawInput = document.getElementById('treeInput').value;
    const input = sanitizeInput(rawInput);
    const errorMsg = document.getElementById('errorMsg');
    const statsMsg = document.getElementById('statsMsg');
    errorMsg.textContent = '';

    if (!input) {
        errorMsg.textContent = 'Digite uma string de entrada.';
        document.getElementById('treeSvg').innerHTML = '';
        statsMsg.textContent = '';
        currentRoot = null;
        return;
    }

    try {
        const maxLevelRaw = document.getElementById('maxLevelInput').value;
        const maxLevel = maxLevelRaw === '' ? null : parseInt(maxLevelRaw, 10);
        const root = parseTree(input, maxLevel);
        currentRoot = root;
        rerender();
    } catch (e) {
        errorMsg.textContent = e.message;
        document.getElementById('treeSvg').innerHTML = '';
        statsMsg.textContent = '';
        currentRoot = null;
    }
}

document.getElementById('renderBtn').addEventListener('click', handleRender);
document.getElementById('treeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRender();
});
document.getElementById('maxLevelInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRender();
});
document.getElementById('expandAllBtn').addEventListener('click', () => {
    if (!currentRoot) return;
    walkTree(currentRoot, n => { if (n.children.length > 0) n.expanded = true; });
    rerender();
});
document.getElementById('collapseAllBtn').addEventListener('click', () => {
    if (!currentRoot) return;
    walkTree(currentRoot, n => { if (n.children.length > 0) n.expanded = false; });
    currentRoot.expanded = true; // mantém a raiz visível
    rerender();
});

// Exemplo inicial
document.getElementById('treeInput').value = '(B(BBBBBBWWWBWWWB';
document.getElementById('maxLevelInput').value = '3';
handleRender();
