import { auth, provider, db, signInWithPopup, signOut, collection, doc, setDoc, getDocs, deleteDoc } from './firebase.js';

// --- STATE ---
const state = {
    gridSize: 16,
    colors: [
        { id: 0, hex: "#ff3366" },
        { id: 1, hex: "#3b82f6" },
        { id: 2, hex: "#10b981" },
    ],
    nextColorId: 3,
    blocks: new Map(), // key: "x,y", value: { col: id, hp: int }
    warehouseColumns: [], // Array mapping to UI
    unitMaxAmmo: 20,
    unitColsCount: 3,
};

let currentTool = 'brush'; // 'brush', 'hp', 'picker', 'select'
let selectedColorId = 0;
let selectedBlockPos = null;
let selectedUnitInfo = null; // { colIndex, unitIndex }

let isDrawing = false;
let drawMode = 'draw'; // 'draw' or 'erase' (alt pressed)

let selectedBlocks = []; // array of {x, y}
let marqueeStartCoords = null;
let currentMouseCoords = null;
let isDraggingSelection = false;
let selectionDragVisualOffset = { dx: 0, dy: 0 };
let dragStartCoords = null;

// --- DRAG & DROP STATE ---
let isDraggingUnit = false;
let draggedUnitInfo = null; // { colIndex, unitIndex, data, inserted }
let dragGhostEl = null;

// --- ELEMENTS ---
const elements = {
    canvas: document.getElementById('editor-canvas'),
    ctx: document.getElementById('editor-canvas').getContext('2d'),

    // Board Settings
    gridSizeSlider: document.getElementById('grid-size'),
    gridSizeVal: document.getElementById('grid-size-val'),

    // Tools
    btnBrush: document.getElementById('tool-brush'),
    btnSelect: document.getElementById('tool-select'),
    btnHp: document.getElementById('tool-hp'),
    btnPicker: document.getElementById('tool-picker'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),

    // Palette
    paletteList: document.getElementById('palette-list'),
    newColorInput: document.getElementById('new-color-input'),
    btnAddColor: document.getElementById('btn-add-color'),

    // HP Tool
    hpPanel: document.getElementById('hp-control-panel'),
    hpSlider: document.getElementById('block-hp-slider'),
    hpVal: document.getElementById('block-hp-val'),

    // Units
    unitColsSlider: document.getElementById('unit-cols'),
    unitColsVal: document.getElementById('unit-cols-val'),
    unitMaxAmmoSlider: document.getElementById('unit-max-ammo'),
    unitMaxAmmoVal: document.getElementById('unit-max-ammo-val'),
    btnCreateUnits: document.getElementById('btn-create-units'),
    btnShuffleUnits: document.getElementById('btn-shuffle-units'),
    warehouseContainer: document.getElementById('warehouse-columns'),
    unitAmmoControl: document.getElementById('unit-ammo-control'),
    unitAmmoSlider: document.getElementById('unit-ammo-slider'),
    unitAmmoVal: document.getElementById('unit-ammo-val'),

    // Bottom Out
    jsonOutput: document.getElementById('json-output'),
    btnGenerateJson: document.getElementById('btn-generate-json'),
    btnCopyJson: document.getElementById('btn-copy-json'),

    // Saves
    savesCarousel: document.getElementById('saves-carousel'),
    btnSaveProject: document.getElementById('btn-save-project'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
    userInfo: document.getElementById('user-info'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    loginHint: document.getElementById('login-hint')
};

// --- INITIALIZATION ---
let CELL_SIZE_PX = 32;

function init() {
    bindEvents();
    renderPalette();
    initWarehouseCols();
    resizeCanvas();
    renderCanvas();

    setupAuthListeners();
}

function bindEvents() {
    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Alt' || e.altKey) && currentTool === 'brush') {
            document.body.classList.add('alt-pressed');
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt' || !e.altKey) {
            document.body.classList.remove('alt-pressed');
        }
    });
    window.addEventListener('blur', () => {
        document.body.classList.remove('alt-pressed');
    });

    // Canvas Listeners
    elements.canvas.addEventListener('mousedown', onCanvasMouseDown);
    window.addEventListener('mousemove', onCanvasMouseMove);
    window.addEventListener('mouseup', onCanvasMouseUp);

    elements.canvas.addEventListener('contextmenu', e => e.preventDefault()); // Prevent right click

    // Board Settings
    elements.gridSizeSlider.addEventListener('input', (e) => {
        let oldSize = state.gridSize;
        state.gridSize = parseInt(e.target.value);
        elements.gridSizeVal.textContent = state.gridSize;
        trimBlocks();
        resizeCanvas();
        renderCanvas();
    });

    // Tools
    elements.btnBrush.addEventListener('click', () => setTool('brush'));
    elements.btnSelect.addEventListener('click', () => setTool('select'));
    elements.btnHp.addEventListener('click', () => setTool('hp'));
    elements.btnPicker.addEventListener('click', () => setTool('picker'));

    elements.btnZoomIn.addEventListener('click', () => { CELL_SIZE_PX = Math.min(128, CELL_SIZE_PX + 8); resizeCanvas(); renderCanvas(); });
    elements.btnZoomOut.addEventListener('click', () => { CELL_SIZE_PX = Math.max(8, CELL_SIZE_PX - 8); resizeCanvas(); renderCanvas(); });

    elements.hpSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        elements.hpVal.textContent = val;

        if (currentTool === 'select' && selectedBlocks.length > 0) {
            selectedBlocks.forEach(pos => {
                let b = state.blocks.get(`${pos.x},${pos.y}`);
                if (b) b.hp = val;
            });
            renderCanvas();
            updatePaletteStats();
        } else if (selectedBlockPos) {
            let b = state.blocks.get(`${selectedBlockPos.x},${selectedBlockPos.y}`);
            if (b) {
                b.hp = val;
                renderCanvas();
                updatePaletteStats();
            }
        }
    });

    // Palette
    elements.btnAddColor.addEventListener('click', () => {
        const hex = elements.newColorInput.value;
        const newColor = { id: state.nextColorId++, hex: hex };
        state.colors.push(newColor);
        selectedColorId = newColor.id;
        renderPalette();
    });

    // Make native picker dynamically update the active color!
    elements.newColorInput.addEventListener('input', (e) => {
        const c = state.colors.find(col => col.id === selectedColorId);
        if (c) {
            c.hex = e.target.value;
            renderCanvas();
            renderWarehouse();
            updatePaletteStats();
        }
    });

    // Units
    elements.unitColsSlider.addEventListener('input', (e) => {
        state.unitColsCount = parseInt(e.target.value);
        elements.unitColsVal.textContent = state.unitColsCount;
        initWarehouseCols();
    });

    elements.unitMaxAmmoSlider.addEventListener('input', (e) => {
        state.unitMaxAmmo = parseInt(e.target.value);
        elements.unitMaxAmmoVal.textContent = state.unitMaxAmmo;
    });

    elements.btnCreateUnits.addEventListener('click', createUnits);
    elements.btnShuffleUnits.addEventListener('click', shuffleUnits);

    elements.unitAmmoSlider.addEventListener('input', (e) => {
        elements.unitAmmoVal.textContent = e.target.value;
        if (selectedUnitInfo) {
            const { colIndex, unitIndex } = selectedUnitInfo;
            if (state.warehouseColumns[colIndex] && state.warehouseColumns[colIndex][unitIndex]) {
                state.warehouseColumns[colIndex][unitIndex].ammo = parseInt(e.target.value);
                renderWarehouse();
                updatePaletteStats();
            }
        }
    });

    // JSON
    elements.btnGenerateJson.addEventListener('click', generateJson);
    elements.btnCopyJson.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.jsonOutput.value);
        elements.btnCopyJson.textContent = "Copied!";
        setTimeout(() => elements.btnCopyJson.textContent = "Copy", 2000);
    });

    // Auth & Saves
    elements.btnLogin.addEventListener('click', doLogin);
    elements.btnLogout.addEventListener('click', doLogout);
    elements.btnSaveProject.addEventListener('click', saveCurrentProject);
}

// --- CANVAS & DRAWING ---
function resizeCanvas() {
    elements.canvas.width = state.gridSize * CELL_SIZE_PX;
    elements.canvas.height = state.gridSize * CELL_SIZE_PX;
}

function getGridCoords(e) {
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const x = Math.floor(clickX / CELL_SIZE_PX);
    // Y is inverted (0 is bottom)
    const yPx = elements.canvas.height - clickY;
    const y = Math.floor(yPx / CELL_SIZE_PX);

    if (x >= 0 && x < state.gridSize && y >= 0 && y < state.gridSize) {
        return { x, y };
    }
    return null;
}

function onCanvasMouseDown(e) {
    if (e.button !== 0 && currentTool !== 'picker') return;

    const coords = getGridCoords(e);
    if (!coords) {
        if (currentTool === 'select') {
            selectedBlocks = [];
            renderCanvas();
        }
        return;
    }

    if (currentTool === 'select') {
        let clickedOnSelected = selectedBlocks.find(p => p.x === coords.x && p.y === coords.y);

        // Single block click handling with modifiers
        if (e.shiftKey) {
            if (!clickedOnSelected) selectedBlocks.push({ x: coords.x, y: coords.y });
            isDraggingSelection = false;
        } else if (e.altKey) {
            selectedBlocks = selectedBlocks.filter(p => p.x !== coords.x || p.y !== coords.y);
            isDraggingSelection = false;
        } else {
            // Normal click
            if (clickedOnSelected) {
                isDraggingSelection = true;
                dragStartCoords = coords;
            } else {
                if (state.blocks.has(`${coords.x},${coords.y}`)) {
                    selectedBlocks = [{ x: coords.x, y: coords.y }];
                    isDraggingSelection = true;
                    dragStartCoords = coords;
                } else {
                    selectedBlocks = [];
                    marqueeStartCoords = coords;
                    currentMouseCoords = coords;
                }
            }
        }

        // Setup marquee selection for drag even with modifiers if dragging empty space
        if (!isDraggingSelection) {
            marqueeStartCoords = coords;
            currentMouseCoords = coords;
        }

        renderCanvas();
        return;
    }

    if (currentTool === 'picker') {
        const key = `${coords.x},${coords.y}`;
        const b = state.blocks.get(key);
        if (b) {
            selectedColorId = b.col;
            elements.newColorInput.value = state.colors.find(c => c.id === selectedColorId).hex;
            setTool('brush');
            renderPalette();
        } else {
            const rect = elements.canvas.getBoundingClientRect();
            const px = Math.floor((e.clientX - rect.left) * (elements.canvas.width / rect.width));
            const py = Math.floor((e.clientY - rect.top) * (elements.canvas.height / rect.height));
            const imgData = elements.ctx.getImageData(px, py, 1, 1).data;
            const hex = rgbToHex(imgData[0], imgData[1], imgData[2]);
            let c = state.colors.find(col => col.hex.toLowerCase() === hex.toLowerCase());
            if (c) {
                selectedColorId = c.id;
                elements.newColorInput.value = c.hex;
            }
            setTool('brush');
            renderPalette();
        }
        return;
    }

    if (currentTool === 'hp') {
        selectedBlockPos = coords;
        const b = state.blocks.get(`${coords.x},${coords.y}`);
        if (b) {
            elements.hpPanel.classList.remove('hidden');
            elements.hpSlider.value = b.hp;
            elements.hpVal.textContent = b.hp;
        } else {
            elements.hpPanel.classList.add('hidden');
        }
        renderCanvas();
        return;
    }

    // BRUSH TOOL
    isDrawing = true;
    drawMode = e.altKey ? 'erase' : 'draw';
    applyBrush(coords);
}

function onCanvasMouseMove(e) {
    if (currentTool === 'select') {
        const coords = getGridCoords(e);
        if (!coords) return;
        if (isDraggingSelection) {
            selectionDragVisualOffset = {
                dx: coords.x - dragStartCoords.x,
                dy: coords.y - dragStartCoords.y
            };
            renderCanvas();
        } else if (marqueeStartCoords) {
            currentMouseCoords = coords;
            renderCanvas();
        }
        return;
    }

    if (!isDrawing) return;
    const coords = getGridCoords(e);
    if (coords) applyBrush(coords);
}

function onCanvasMouseUp(e) {
    if (currentTool === 'select') {
        if (isDraggingSelection) {
            const dx = selectionDragVisualOffset.dx;
            const dy = selectionDragVisualOffset.dy;
            if (dx !== 0 || dy !== 0) {
                let newBlocksObj = [];
                selectedBlocks.forEach(pos => {
                    const key = `${pos.x},${pos.y}`;
                    const b = state.blocks.get(key);
                    if (b) newBlocksObj.push({ oldPos: pos, newPos: { x: pos.x + dx, y: pos.y + dy }, b: b });
                });
                newBlocksObj.forEach(obj => state.blocks.delete(`${obj.oldPos.x},${obj.oldPos.y}`));
                newBlocksObj.forEach(obj => {
                    if (obj.newPos.x >= 0 && obj.newPos.x < state.gridSize && obj.newPos.y >= 0 && obj.newPos.y < state.gridSize) {
                        state.blocks.set(`${obj.newPos.x},${obj.newPos.y}`, obj.b);
                    }
                });
                selectedBlocks = newBlocksObj.map(obj => obj.newPos).filter(p => p.x >= 0 && p.x < state.gridSize && p.y >= 0 && p.y < state.gridSize);
                updatePaletteStats();
            }
            isDraggingSelection = false;
            selectionDragVisualOffset = { dx: 0, dy: 0 };
            renderCanvas();
        } else if (marqueeStartCoords && currentMouseCoords) {
            let minX = Math.min(marqueeStartCoords.x, currentMouseCoords.x);
            let maxX = Math.max(marqueeStartCoords.x, currentMouseCoords.x);
            let minY = Math.min(marqueeStartCoords.y, currentMouseCoords.y);
            let maxY = Math.max(marqueeStartCoords.y, currentMouseCoords.y);
            let newSelection = [];
            state.blocks.forEach((val, key) => {
                const [bx, by] = key.split(',').map(Number);
                if (bx >= minX && bx <= maxX && by >= minY && by <= maxY) {
                    newSelection.push({ x: bx, y: by });
                }
            });

            if (e.shiftKey) {
                newSelection.forEach(np => {
                    if (!selectedBlocks.find(p => p.x === np.x && p.y === np.y)) selectedBlocks.push(np);
                });
            } else if (e.altKey) {
                selectedBlocks = selectedBlocks.filter(p => {
                    return !newSelection.find(np => np.x === p.x && np.y === p.y);
                });
            } else {
                selectedBlocks = newSelection;
            }

            marqueeStartCoords = null;
            currentMouseCoords = null;

            if (selectedBlocks.length > 0) {
                elements.hpPanel.classList.remove('hidden');
            } else {
                elements.hpPanel.classList.add('hidden');
            }

            renderCanvas();
        } else {
            if (selectedBlocks.length > 0 && !e.shiftKey && !e.altKey) {
                elements.hpPanel.classList.remove('hidden');
            }
        }
        return;
    }

    if (isDrawing) {
        isDrawing = false;
        updatePaletteStats();
    }
}

function applyBrush(coords) {
    const key = `${coords.x},${coords.y}`;
    if (drawMode === 'erase') {
        state.blocks.delete(key);
    } else {
        if (!state.colors.find(c => c.id === selectedColorId)) return;
        state.blocks.set(key, { col: selectedColorId, hp: parseInt(elements.hpSlider.value) });
    }
    renderCanvas();
}

function trimBlocks() {
    let toDelete = [];
    state.blocks.forEach((val, key) => {
        const [x, y] = key.split(',').map(Number);
        if (x >= state.gridSize || y >= state.gridSize) {
            toDelete.push(key);
        }
    });
    toDelete.forEach(k => state.blocks.delete(k));
    updatePaletteStats();
}

function renderCanvas() {
    const ctx = elements.ctx;
    const s = state.gridSize;
    const cs = CELL_SIZE_PX;
    const w = elements.canvas.width;
    const h = elements.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= s; i++) {
        ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(w, i * cs); ctx.stroke();
    }

    // Draw Blocks
    state.blocks.forEach((b, key) => {
        const [x, y] = key.split(',').map(Number);
        const isSelected = selectedBlocks.find(p => p.x === x && p.y === y) !== undefined;
        let drawX = x;
        let drawY = y;

        if (isSelected && currentTool === 'select' && isDraggingSelection) {
            drawX += selectionDragVisualOffset.dx;
            drawY += selectionDragVisualOffset.dy;
        }

        const colDef = state.colors.find(c => c.id === b.col);
        if (!colDef) return;

        // Invert Y
        const ry = s - 1 - drawY;

        // Draw Fill
        ctx.fillStyle = colDef.hex;
        ctx.fillRect(drawX * cs, ry * cs, cs, cs);

        // Selection outline
        if ((selectedBlockPos && selectedBlockPos.x === drawX && selectedBlockPos.y === drawY && currentTool === 'hp') ||
            (isSelected && currentTool === 'select' && !isDraggingSelection)) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.strokeRect(drawX * cs + 1.5, ry * cs + 1.5, cs - 3, cs - 3);
        } else {
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX * cs, ry * cs, cs, cs);
        }

        // Draw HP
        if (b.hp > 1) {
            ctx.fillStyle = getContrastColor(colDef.hex); // white or black
            ctx.font = 'bold 12px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.hp.toString(), drawX * cs + cs / 2, ry * cs + cs / 2 + 1);
        }
    });

    // Draw Marquee Array Selection Box
    if (marqueeStartCoords && currentMouseCoords && currentTool === 'select') {
        let minX = Math.min(marqueeStartCoords.x, currentMouseCoords.x);
        let maxX = Math.max(marqueeStartCoords.x, currentMouseCoords.x);
        let minY = Math.min(marqueeStartCoords.y, currentMouseCoords.y);
        let maxY = Math.max(marqueeStartCoords.y, currentMouseCoords.y);

        const ryMin = s - 1 - maxY; // inverted y
        const ryMax = s - 1 - minY;

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(minX * cs, ryMin * cs, (maxX - minX + 1) * cs, (maxY - minY + 1) * cs);
        ctx.setLineDash([]);
    }
}

// --- TOOLS ---
function setTool(tool) {
    if (currentTool === 'select') {
        selectedBlocks = [];
        marqueeStartCoords = null;
        isDraggingSelection = false;
    }

    if (tool !== 'brush') {
        document.body.classList.remove('alt-pressed');
    }

    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tool-' + tool).classList.add('active');

    if (tool !== 'hp' && tool !== 'select') {
        selectedBlockPos = null;
        elements.hpPanel.classList.add('hidden');
    }

    if (tool === 'select' && selectedBlocks.length > 0) {
        elements.hpPanel.classList.remove('hidden');
    }

    renderCanvas();
}

// --- PALETTE ---
function renderPalette() {
    elements.paletteList.innerHTML = '';

    // Calculate required ammo / HP differential per color
    let hpStats = {};
    let ammoStats = {};
    state.colors.forEach(c => { hpStats[c.id] = 0; ammoStats[c.id] = 0; });

    state.blocks.forEach(b => { if (hpStats[b.col] !== undefined) hpStats[b.col] += b.hp; });
    state.warehouseColumns.forEach(col => {
        col.forEach(u => {
            if (ammoStats[u.col] !== undefined) ammoStats[u.col] += u.ammo;
        });
    });

    state.colors.forEach(color => {
        const diff = ammoStats[color.id] - hpStats[color.id];
        let diffStr = diff > 0 ? `+${diff}` : String(diff);
        let diffClass = diff > 0 ? 'diff-positive' : (diff < 0 ? 'diff-negative' : 'diff-zero');

        const el = document.createElement('div');
        el.className = `palette-item ${color.id === selectedColorId ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="palette-color-preview" style="background-color: ${color.hex}"></div>
            <div class="palette-info">
                <span>ID ${color.id}</span>
                <span class="palette-diff ${diffClass}">${diffStr}</span>
            </div>
            <button class="btn-delete-color material-icons-rounded">delete</button>
        `;

        el.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-color')) {
                deleteColor(color.id);
            } else {
                selectedColorId = color.id;
                elements.newColorInput.value = color.hex;
                renderPalette();
            }
        });

        elements.paletteList.appendChild(el);
    });
}

function updatePaletteStats() {
    renderPalette();
}

function deleteColor(colorId) {
    state.colors = state.colors.filter(c => c.id !== colorId);

    // Delete blocks
    let toDelete = [];
    state.blocks.forEach((val, key) => { if (val.col === colorId) toDelete.push(key); });
    toDelete.forEach(k => state.blocks.delete(k));

    // Delete units
    state.warehouseColumns.forEach(col => {
        for (let i = col.length - 1; i >= 0; i--) {
            if (col[i].col === colorId) col.splice(i, 1);
        }
    });

    if (selectedColorId === colorId) selectedColorId = state.colors[0] ? state.colors[0].id : null;

    renderCanvas();
    renderWarehouse();
    updatePaletteStats();
}

// --- UNITS WAREHOUSE ---
function initWarehouseCols() {
    // preserve old units if possible
    let allUnits = [];
    state.warehouseColumns.forEach(col => allUnits.push(...col));

    state.warehouseColumns = Array.from({ length: state.unitColsCount }, () => []);

    // re-distribute old units into new columns count
    let colIdx = 0;
    allUnits.forEach(u => {
        state.warehouseColumns[colIdx].push(u);
        colIdx = (colIdx + 1) % state.unitColsCount;
    });

    renderWarehouse();
}

function createUnits() {
    // Recreates based on required HP per color
    let hpStats = {};
    state.colors.forEach(c => hpStats[c.id] = 0);
    state.blocks.forEach(b => { if (hpStats[b.col] !== undefined) hpStats[b.col] += b.hp; });

    state.warehouseColumns = Array.from({ length: state.unitColsCount }, () => []);

    let allNewUnits = [];
    let unitIdCounter = 0;

    state.colors.forEach(c => {
        let totalHp = hpStats[c.id];
        while (totalHp > 0) {
            let ammo = Math.min(state.unitMaxAmmo, totalHp);
            allNewUnits.push({ id: `u_${unitIdCounter++}`, col: c.id, ammo: ammo });
            totalHp -= ammo;
        }
    });

    // distribute them
    let colIdx = 0;
    allNewUnits.forEach(u => {
        state.warehouseColumns[colIdx].push(u);
        colIdx = (colIdx + 1) % state.unitColsCount;
    });

    renderWarehouse();
    updatePaletteStats();
}

function shuffleUnits() {
    let allUnits = [];
    state.warehouseColumns.forEach(col => allUnits.push(...col));

    // Fisher-Yates
    for (let i = allUnits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allUnits[i], allUnits[j]] = [allUnits[j], allUnits[i]];
    }

    state.warehouseColumns = Array.from({ length: state.unitColsCount }, () => []);
    let colIdx = 0;
    allUnits.forEach(u => {
        state.warehouseColumns[colIdx].push(u);
        colIdx = (colIdx + 1) % state.unitColsCount;
    });

    renderWarehouse();
}

function renderWarehouse(isDraggingPass = false) {
    elements.warehouseContainer.innerHTML = '';

    state.warehouseColumns.forEach((colData, colIndex) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'warehouse-col';
        colDiv.dataset.colIndex = colIndex;

        colData.forEach((unitData, unitIndex) => {
            const uDef = state.colors.find(c => c.id === unitData.col);
            const uHex = uDef ? uDef.hex : '#333';

            const unitEl = document.createElement('div');
            unitEl.className = 'unit-circle';
            unitEl.style.backgroundColor = uHex;
            unitEl.textContent = unitData.ammo;

            unitEl.dataset.colIndex = colIndex;
            unitEl.dataset.unitIndex = unitIndex;

            if (!isDraggingPass && selectedUnitInfo && selectedUnitInfo.colIndex === colIndex && selectedUnitInfo.unitIndex === unitIndex) {
                unitEl.classList.add('selected-unit');
            }

            if (isDraggingPass && draggedUnitInfo && draggedUnitInfo.colIndex === colIndex && draggedUnitInfo.unitIndex === unitIndex) {
                unitEl.style.opacity = '0.3';
            }

            // Click vs pointerdown needs to be handled carefully. We'll use pointerdown to trigger drag, and if they release without moving, it's a click.
            unitEl.addEventListener('pointerdown', (e) => {
                onUnitPointerDown(e, colIndex, unitIndex, unitData, unitEl);
            });

            colDiv.appendChild(unitEl);
        });

        elements.warehouseContainer.appendChild(colDiv);
    });
}

function updateGhostPosition(cx, cy) {
    if (!dragGhostEl) return;
    dragGhostEl.style.left = (cx - 18) + 'px';
    dragGhostEl.style.top = (cy - 18) + 'px';
}

function onUnitPointerDown(e, colIndex, unitIndex, unitData, unitEl) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    
    isDraggingUnit = true;
    draggedUnitInfo = {
        colIndex,
        unitIndex,
        data: unitData,
        inserted: true,
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false
    };
    
    dragGhostEl = unitEl.cloneNode(true);
    dragGhostEl.classList.add('unit-drag');
    dragGhostEl.style.position = 'fixed';
    dragGhostEl.style.pointerEvents = 'none';
    dragGhostEl.style.zIndex = '9999';
    dragGhostEl.style.margin = '0';
    document.body.appendChild(dragGhostEl);
    
    updateGhostPosition(e.clientX, e.clientY);
    
    document.addEventListener('pointermove', onUnitPointerMove);
    document.addEventListener('pointerup', onUnitPointerUp);
    
    renderWarehouse(true);
}

function onUnitPointerMove(e) {
    if (!isDraggingUnit) return;
    
    // Check if enough distance to consider moving
    if (!draggedUnitInfo.hasMoved) {
        const dx = e.clientX - draggedUnitInfo.startX;
        const dy = e.clientY - draggedUnitInfo.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            draggedUnitInfo.hasMoved = true;
        } else {
            return;
        }
    }

    updateGhostPosition(e.clientX, e.clientY);
    
    const cols = document.querySelectorAll('.warehouse-col');
    if (cols.length === 0) return;
    
    let closestColIdx = 0;
    let minHDist = Infinity;
    
    cols.forEach((colEl, idx) => {
        const rect = colEl.getBoundingClientRect();
        const centerColX = rect.left + rect.width / 2;
        const dist = Math.abs(e.clientX - centerColX);
        if (dist < minHDist) {
            minHDist = dist;
            closestColIdx = idx;
        }
    });
    
    const targetColEl = cols[closestColIdx];
    const rect = targetColEl.getBoundingClientRect();
    
    const offsetY = e.clientY - rect.top - 4; // 4px padding
    let targetRowIdx = Math.floor(offsetY / 40); // 36px unit + 4px gap
    
    let colLen = state.warehouseColumns[closestColIdx].length;
    if (draggedUnitInfo.colIndex === closestColIdx) {
        colLen -= 1; 
    }
    
    if (targetRowIdx < 0) targetRowIdx = 0;
    if (targetRowIdx > colLen) targetRowIdx = colLen;
    
    if (draggedUnitInfo.colIndex !== closestColIdx || draggedUnitInfo.unitIndex !== targetRowIdx) {
        if (draggedUnitInfo.inserted) {
            state.warehouseColumns[draggedUnitInfo.colIndex].splice(draggedUnitInfo.unitIndex, 1);
        }
        
        state.warehouseColumns[closestColIdx].splice(targetRowIdx, 0, draggedUnitInfo.data);
        
        draggedUnitInfo.colIndex = closestColIdx;
        draggedUnitInfo.unitIndex = targetRowIdx;
        draggedUnitInfo.inserted = true;
        
        renderWarehouse(true);
    }
}

function onUnitPointerUp(e) {
    if (!isDraggingUnit) return;
    isDraggingUnit = false;
    
    if (dragGhostEl) {
        dragGhostEl.remove();
        dragGhostEl = null;
    }
    
    document.removeEventListener('pointermove', onUnitPointerMove);
    document.removeEventListener('pointerup', onUnitPointerUp);
    
    // If we didn't move it, treat it as a click
    if (!draggedUnitInfo.hasMoved) {
        selectedUnitInfo = { colIndex: draggedUnitInfo.colIndex, unitIndex: draggedUnitInfo.unitIndex };
        elements.unitAmmoControl.classList.remove('hidden');
        elements.unitAmmoSlider.value = draggedUnitInfo.data.ammo;
        elements.unitAmmoVal.textContent = draggedUnitInfo.data.ammo;
    } else {
        selectedUnitInfo = {
            colIndex: draggedUnitInfo.colIndex,
            unitIndex: draggedUnitInfo.unitIndex
        };
        elements.unitAmmoControl.classList.remove('hidden');
        elements.unitAmmoSlider.value = draggedUnitInfo.data.ammo;
        elements.unitAmmoVal.textContent = draggedUnitInfo.data.ammo;
        updatePaletteStats(); // Also update counts across columns in case we need
    }
    
    draggedUnitInfo = null;
    renderWarehouse();
}

// --- JSON GENERATOR ---
function generateJson() {
    const jsonStr = buildJSONString();
    elements.jsonOutput.value = jsonStr;
}

function buildJSONString() {
    // Prepare exact required format
    // {"GridSize":{"x":16,"y":16},"Colors":[...],"Blocks":[...],"Keys":[],"WarehouseColumns":[]}

    // Process blocks map into array
    let blocksArr = [];
    state.blocks.forEach((val, key) => {
        const [x, y] = key.split(',').map(Number);
        blocksArr.push({
            "Pos": { "x": x, "y": y },
            "Size": { "x": 1, "y": 1 },
            "Col": val.col,
            "HP": val.hp,
            "IsHidden": false
        });
    });

    let wbArr = [];
    state.warehouseColumns.forEach((colData, xIdx) => {
        let Units = [];
        colData.forEach((u, yIdx) => {
            Units.push({
                "Col": u.col,
                "Ammo": u.ammo,
                "IsHidden": false,
                "IsBarnLock": false,
                "Lnk": [] // Future dependencies 
            });
        });
        wbArr.push({ "Units": Units });
    });

    // Must map custom color object into pure array of RGBA strings or mapped IDs as requested?
    // User requested "массив объектов RGBA. Индекс элемента (0,1,2) является ID цвета".
    // Let's remap Colors array completely, then update ID references in blocks and units to match index.

    // Prepare final color array exactly as RGBA (prompt: "Массив объектов RGBA"). 
    // We have hex. Convert to {r,g,b,a}.
    let finalColors = [];
    let idMapping = {}; // oldId -> newId

    state.colors.forEach((c, idx) => {
        idMapping[c.id] = idx;
        const rgb = hexToRgb(c.hex);
        finalColors.push({ r: rgb.r, g: rgb.g, b: rgb.b, a: 255 });
    });

    // Remap IDs
    blocksArr.forEach(b => b.Col = idMapping[b.Col]);
    wbArr.forEach(col => {
        col.Units.forEach(u => u.Col = idMapping[u.Col]);
    });

    const outObj = {
        GridSize: { x: state.gridSize, y: state.gridSize },
        Colors: finalColors,
        Blocks: blocksArr,
        Keys: [],
        WarehouseColumns: wbArr
    };

    return JSON.stringify(outObj, null, 2);
}

// --- HELPERS ---
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}
function rgbToHex(r, g, b) {
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}
function getContrastColor(hex) {
    const rgb = hexToRgb(hex);
    // YIQ equation from YIQ ratio
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

// --- FIREBASE (Basic Mock / Hooks) ---
let firebaseUser = null;

function setupAuthListeners() {
    // Assuming auth state listener exported or simulated via firebase.js
    auth.onAuthStateChanged(user => {
        if (user) {
            firebaseUser = user;
            elements.btnLogin.classList.add('hidden');
            elements.userInfo.classList.remove('hidden');
            elements.userName.textContent = user.displayName;
            elements.userAvatar.src = user.photoURL || '';
            elements.loginHint.style.display = 'none';
            loadSaves();
        } else {
            firebaseUser = null;
            elements.btnLogin.classList.remove('hidden');
            elements.userInfo.classList.add('hidden');
            elements.loginHint.style.display = 'block';
            clearSaves();
        }
    });
}

function doLogin() {
    signInWithPopup(auth, provider).catch(err => console.error(err));
}
function doLogout() {
    signOut(auth).catch(err => console.error(err));
}

async function saveCurrentProject() {
    if (!firebaseUser) {
        alert("Please login first to save!");
        return;
    }

    const snap = elements.canvas.toDataURL("image/webp", 0.5);
    const projData = {
        userId: firebaseUser.uid,
        name: `Level ${new Date().toLocaleString()}`,
        timestamp: Date.now(),
        image: snap,
        json: buildJSONString()
    };

    const docRef = doc(collection(db, `users/${firebaseUser.uid}/projects`));
    try {
        await setDoc(docRef, projData);
        alert("Project saved successfully!");
        loadSaves(); // refresh cards
    } catch (err) {
        // Fallback or log if rules prevent it
        console.error("Save error: check Firestore rules", err);
        alert("Failed to save. Check your Firestore rules!");
    }
}

async function loadSaves() {
    if (!firebaseUser) return;
    try {
        // Remove old cards (keep Create New)
        const cards = elements.savesCarousel.querySelectorAll('.save-card:not(.create-new)');
        cards.forEach(c => c.remove());

        const querySnapshot = await getDocs(collection(db, `users/${firebaseUser.uid}/projects`));
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();

            const card = document.createElement('div');
            card.className = 'save-card';
            card.innerHTML = `
                <img class="save-img-preview" src="${data.image}" alt="Save Preview">
                <div class="save-controls">
                    <button class="btn primary" onclick="event.stopPropagation(); window.openJson('${btoa(encodeURIComponent(data.json))}')">Open</button>
                    <button class="btn secondary" style="background:#059669; border-color:#059669; color:#fff;" onclick="event.stopPropagation(); window.overwriteSave('${docSnap.id}')">Save</button>
                    <button class="btn secondary" style="background:#ef4444; border-color:#ef4444; color:#fff;" onclick="event.stopPropagation(); window.delSave('${docSnap.id}')">Del</button>
                </div>
            `;
            elements.savesCarousel.appendChild(card);
        });
    } catch (err) {
        console.error("Load saves error", err);
    }
}

function clearSaves() {
    const cards = elements.savesCarousel.querySelectorAll('.save-card:not(.create-new)');
    cards.forEach(c => c.remove());
}

// Global hooks for dynamic UI
window.openJson = function (b64json) {
    try {
        const decoded = decodeURIComponent(atob(b64json));
        elements.jsonOutput.value = decoded;
        const data = JSON.parse(decoded);

        // 1. Grid Size
        state.gridSize = data.GridSize.x || 16;
        elements.gridSizeSlider.value = state.gridSize;
        elements.gridSizeVal.textContent = state.gridSize;

        // 2. Colors
        if (data.Colors) {
            state.colors = data.Colors.map((c, i) => ({ id: i, hex: rgbToHex(c.r, c.g, c.b) }));
            state.nextColorId = state.colors.length > 0 ? state.colors.length : 1;
        }

        // 3. Blocks
        state.blocks = new Map();
        if (data.Blocks) {
            data.Blocks.forEach(b => {
                state.blocks.set(`${b.Pos.x},${b.Pos.y}`, { col: b.Col, hp: b.HP || 1 });
            });
        }

        // 4. Warehouse Columns
        state.warehouseColumns = [];
        if (data.WarehouseColumns) {
            data.WarehouseColumns.forEach((colData) => {
                let col = [];
                if (colData.Units) {
                    colData.Units.forEach(u => {
                        col.push({ col: u.Col, ammo: u.Ammo || 1 });
                    });
                }
                state.warehouseColumns.push(col);
            });
            state.unitColsCount = Math.max(1, state.warehouseColumns.length);
            elements.unitColsSlider.value = state.unitColsCount;
            elements.unitColsVal.textContent = state.unitColsCount;
        }

        // Clean UI state
        selectedBlocks = [];
        selectedBlockPos = null;
        selectedUnitInfo = null;
        isDraggingSelection = false;
        marqueeStartCoords = null;
        elements.hpPanel.classList.add('hidden');
        elements.unitAmmoControl.classList.add('hidden');

        if (state.colors.length > 0) {
            selectedColorId = state.colors[0].id;
            elements.newColorInput.value = state.colors[0].hex;
        }

        // Render everything
        resizeCanvas();
        renderCanvas();
        renderWarehouse();
        renderPalette();

        alert("Project loaded successfully!");
    } catch (e) {
        console.error("Load JSON error", e);
        alert("Failed to parse or load JSON.");
    }
};

window.overwriteSave = async function (id) {
    if (!firebaseUser) return;
    if (confirm("Overwrite this save with current project?")) {
        const snap = elements.canvas.toDataURL("image/webp", 0.5);
        const projData = {
            userId: firebaseUser.uid,
            timestamp: Date.now(),
            image: snap,
            json: buildJSONString()
        };
        try {
            await setDoc(doc(db, `users/${firebaseUser.uid}/projects`, id), projData, { merge: true });
            alert("Project overwritten successfully!");
            loadSaves();
        } catch (e) {
            console.error(e);
            alert("Failed to overwrite. Check console.");
        }
    }
};

window.delSave = async function (id) {
    if (!firebaseUser) return;
    if (confirm("Delete this save?")) {
        try {
            await deleteDoc(doc(db, `users/${firebaseUser.uid}/projects`, id));
            loadSaves();
        } catch (e) { console.error(e); }
    }
};

// Start
init();

