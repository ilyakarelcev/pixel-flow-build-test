const appLayout = document.getElementById('game-container');
const startupPanel = document.getElementById('startup');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const btnLoadRelative = document.getElementById('btnLoadRelative');

let levelData = null;
let blocks = [];
let warehouseColumns = [];
let activeUnits = [];
let gameColors = [];
let gridConfig = { x: 20, y: 20, cellSize: 20 };

let lastTime = performance.now();
let animFrameId = null;

// File loading
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => parseAsset(e.target.result);
    reader.readAsText(file);
});

btnLoadRelative.addEventListener('click', async () => {
    try {
        const res = await fetch('../Assets/LevelData/Level_Backpack.asset');
        if (!res.ok) throw new Error('Cannot fetch Level_Backpack.asset. Are you running a local server? Error: ' + res.statusText);
        const text = await res.text();
        parseAsset(text);
    } catch (err) {
        alert(err.message + '\n\nPlease use the "Upload .asset" button instead if no local web server is active.');
    }
});

function parseAsset(text) {
    try {
        // Extract JsonData from the YAML
        const match = text.match(/JsonData:\s*"(.*?)"[\s\r\n]*$/s);
        if (!match) {
            throw new Error('JsonData block not found in asset.');
        }

        let rawString = match[1];
        // Clean up YAML string folding across lines
        rawString = rawString.replace(/\r?\n\s*/g, '');
        // Clean up escaped formatting
        rawString = rawString.replace(/\\n/g, '');
        rawString = rawString.replace(/\\"/g, '"');

        const data = JSON.parse(rawString);
        startLevel(data);
    } catch (e) {
        console.error(e);
        alert('Failed to parse asset file: ' + e.message);
    }
}

function startLevel(data) {
    levelData = data;
    startupPanel.classList.add('hidden');
    appLayout.classList.remove('hidden');

    gridConfig.x = data.GridSize.x;
    gridConfig.y = data.GridSize.y;

    // Convert colors
    gameColors = data.Colors.map(c => `rgba(${c.r}, ${c.g}, ${c.b}, 1.0)`);
    // fallback colors if there's an issue with loading
    if (gameColors.length === 0) {
        gameColors = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#8338ec', '#ff006e', '#fb5607', '#ffbe0b'];
    }

    // Set up blocks (deep copy because we modify HP)
    blocks = data.Blocks.map(b => ({
        ...b,
        HP: parseInt(b.HP),
        Size: { ...b.Size },
        Pos: { ...b.Pos }
    }));

    // Setup warehouse
    warehouseColumns = data.WarehouseColumns.map(col => ({
        Units: col.Units.map(u => ({ ...u }))
    }));

    activeUnits = [];

    resizeCanvas();
    renderWarehouse();
    updateStats();

    if (animFrameId) cancelAnimationFrame(animFrameId);
    lastTime = performance.now();
    gameLoop(lastTime);
}

function resizeCanvas() {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();

    // Fit grid inside canvas with some padding
    const padding = 20;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const cellW = availW / gridConfig.x;
    const cellH = availH / gridConfig.y;
    gridConfig.cellSize = Math.floor(Math.min(cellW, cellH));

    canvas.width = gridConfig.cellSize * gridConfig.x;
    canvas.height = gridConfig.cellSize * gridConfig.y;
}

window.addEventListener('resize', () => {
    if (levelData) resizeCanvas();
});

function renderWarehouse() {
    const container = document.getElementById('warehouse-columns');
    container.innerHTML = '';

    warehouseColumns.forEach((col, colIdx) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'warehouse-col';

        // we show max 5 units from top
        const visibleUnits = col.Units.slice(0, 5);

        visibleUnits.forEach((u, displayIdx) => {
            const uDiv = document.createElement('div');
            uDiv.className = 'wh-unit';
            uDiv.innerText = u.Ammo;
            uDiv.style.backgroundColor = gameColors[u.Col] || '#888';
            if (displayIdx === 0) {
                // top item is clickable
                uDiv.style.border = '2px solid white';
                uDiv.onclick = () => spawnUnit(colIdx);
            } else {
                uDiv.style.opacity = '0.6';
                uDiv.style.transform = 'scale(0.8)';
            }
            colDiv.appendChild(uDiv);
        });

        // if there are more, show indicator
        if (col.Units.length > 5) {
            const moreLabel = document.createElement('div');
            moreLabel.style.color = 'white';
            moreLabel.style.fontSize = '12px';
            moreLabel.style.marginTop = '4px';
            moreLabel.innerText = `+${col.Units.length - 5}`;
            colDiv.appendChild(moreLabel);
        }

        container.appendChild(colDiv);
    });
}

function spawnUnit(colIdx) {
    const colList = warehouseColumns[colIdx].Units;
    if (colList.length === 0) return;

    const unitData = colList.shift();

    // Create an active unit object
    // Spawn it at the bottom-center of the grid
    activeUnits.push({
        id: Math.random().toString(),
        Col: unitData.Col,
        Ammo: unitData.Ammo,
        // Start pos
        x: gridConfig.x / 2 - 0.5,
        y: -1, // entering from below
        targetBlock: null,
        shootCooldown: 0
    });

    renderWarehouse();
    updateStats();
}

// Game Logic constants
const UNIT_SPEED = 4.0; // grid cells per second
const SHOOT_INTERVAL = 0.2; // seconds

function gameLoop(time) {
    const dt = (time - lastTime) / 1000.0;
    lastTime = time;

    update(dt);
    draw();

    animFrameId = requestAnimationFrame(gameLoop);
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function getCenter(block) {
    // block pos (x,y) is bottom-left in some coordinates?
    // Let's assume standard grid (0,0) is top-left or bottom-left. 
    // Usually in games 0,0 is bottom-left, but canvas is top-left.
    return {
        x: block.Pos.x + block.Size.x / 2.0,
        y: block.Pos.y + block.Size.y / 2.0
    };
}

function update(dt) {
    // Units logic
    for (let i = activeUnits.length - 1; i >= 0; i--) {
        const u = activeUnits[i];

        // Ensure target is valid
        if (u.targetBlock && (!blocks.includes(u.targetBlock) || u.targetBlock.HP <= 0)) {
            u.targetBlock = null;
        }

        // Find target
        if (!u.targetBlock) {
            let bestDist = Infinity;
            let bestBlock = null;

            for (let b of blocks) {
                if (b.Col === u.Col && b.HP > 0) {
                    const center = getCenter(b);
                    const d = distance(u.x, u.y, center.x, center.y);
                    if (d < bestDist) {
                        bestDist = d;
                        bestBlock = b;
                    }
                }
            }

            if (bestBlock) {
                u.targetBlock = bestBlock;
            } else {
                // no target of same color left! unit wanders or destroyed?
                // Let's just destroy it
                activeUnits.splice(i, 1);
                updateStats();
                continue;
            }
        }

        // Move to target
        if (u.targetBlock) {
            const targetPos = getCenter(u.targetBlock);
            const dx = targetPos.x - u.x;
            const dy = targetPos.y - u.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // If close enough, stop to attack
            // let's say attack range is 1.5 cells
            let reachRange = 1.0;

            if (dist > reachRange) {
                const moveDist = UNIT_SPEED * dt;
                if (moveDist >= dist - reachRange) {
                    u.x += (dx / dist) * (dist - reachRange);
                    u.y += (dy / dist) * (dist - reachRange);
                } else {
                    u.x += (dx / dist) * moveDist;
                    u.y += (dy / dist) * moveDist;
                }
            } else {
                // Attack!
                u.shootCooldown -= dt;
                if (u.shootCooldown <= 0) {
                    u.shootCooldown = SHOOT_INTERVAL;
                    u.Ammo -= 1;
                    u.targetBlock.HP -= 1;

                    // handle block death
                    if (u.targetBlock.HP <= 0) {
                        const bIdx = blocks.indexOf(u.targetBlock);
                        if (bIdx > -1) blocks.splice(bIdx, 1);
                        u.targetBlock = null;
                        updateStats();
                    }

                    // handle ammo empty
                    if (u.Ammo <= 0) {
                        activeUnits.splice(i, 1);
                        updateStats();
                        break; // exit this unit's loop
                    }
                }
            }
        }
    }

    checkWinCondition();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = gridConfig.cellSize;

    // Optional Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= gridConfig.x; x++) {
        ctx.beginPath(); ctx.moveTo(x * s, 0); ctx.lineTo(x * s, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= gridConfig.y; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * s); ctx.lineTo(canvas.width, y * s); ctx.stroke();
    }

    // Helper: translate grid Y from bottom-left to top-left if needed
    // The asset says Pos: {x: 4, y: 24}. Max Y is 25.
    // If Y=0 is bottom, then screenY = (gridConfig.y - y - sizeY) * s
    function getScreenY(gridY, sizeY = 0) {
        return (gridConfig.y - gridY - sizeY) * s;
    }

    // Draw blocks
    blocks.forEach(b => {
        const sx = b.Pos.x * s;
        // Invert Y for drawing so Y=0 is bottom
        const sy = getScreenY(b.Pos.y, b.Size.y);
        const w = b.Size.x * s;
        const h = b.Size.y * s;

        // Block color
        ctx.fillStyle = gameColors[b.Col] || '#fff';
        ctx.beginPath();
        ctx.roundRect(sx + 1, sy + 1, w - 2, h - 2, 4);
        ctx.fill();

        // 3D/Glass effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(sx + 1, sy + 1, w - 2, h / 3);

        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // HP Text
        ctx.fillStyle = 'black';
        ctx.font = `bold ${s * 0.5}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.HP, sx + w / 2, sy + h / 2);

        ctx.fillStyle = 'white';
        ctx.fillText(b.HP, sx + w / 2 - 1, sy + h / 2 - 1);
    });

    // Draw active units
    activeUnits.forEach(u => {
        const sx = u.x * s;
        const sy = getScreenY(u.y, 1) + s / 2; // draw around center

        ctx.fillStyle = gameColors[u.Col] || '#fff';
        ctx.beginPath();
        ctx.arc(sx, sy, s * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = `bold ${s * 0.4}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // text shadow
        ctx.shadowColor = 'rgba(0,0,0,1)';
        ctx.shadowBlur = 3;
        ctx.fillText(u.Ammo, sx, sy);
        ctx.shadowBlur = 0; // reset
    });
}

function updateStats() {
    document.getElementById('stat-blocks').innerText = blocks.length;
    document.getElementById('stat-units').innerText = activeUnits.length;
}

function checkWinCondition() {
    if (!levelData) return;
    const msg = document.getElementById('game-messages');

    if (blocks.length === 0) {
        msg.innerText = "Level Complete! Wait, wow!";
        return;
    }

    // Check if player has units left
    let totalUnitsLeft = activeUnits.length;
    warehouseColumns.forEach(c => totalUnitsLeft += c.Units.length);

    if (totalUnitsLeft === 0 && blocks.length > 0) {
        // Technically, you just lost
        msg.innerText = "Out of Units! Failed to destroy all blocks.";
    } else {
        msg.innerText = "";
    }
}
