import { auth, provider, db, signInWithPopup, signOut, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy } from './firebase.js';

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
    keys: new Map(), // key: "x,y", value: { w: 1, h: 1 }
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
let selectedKeys = []; // array of {x, y}
let marqueeStartCoords = null;
let currentMouseCoords = null;
let isDraggingSelection = false;
let selectionDragVisualOffset = { dx: 0, dy: 0 };
let dragStartCoords = null;

// --- DRAG & DROP STATE ---
let isDraggingUnit = false;
let draggedUnitInfo = null; // { colIndex, unitIndex, data, inserted }
let dragGhostEl = null;

// --- LINK MODE STATE ---
let isLinkModeActive = false;
let isLinking = false;
let linkStartUnit = null; // { colIndex, unitIndex, data, el }
let linkCurrentLine = null; // SVG line element

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
    btnPicker: document.getElementById('tool-picker'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnFit: document.getElementById('btn-fit'),
    btnToggleGrid: document.getElementById('btn-toggle-grid-slider'),
    gridSliderPopup: document.getElementById('grid-slider-popup'),
    gridSizeValBtn: document.getElementById('grid-size-val-btn'),

    // Palette
    paletteList: document.querySelector('.palette-list'),
    newColorInput: document.querySelector('.hidden-color-input'),
    btnAddColor: document.querySelector('.btn-add-color-trigger'),
    palettePanel: document.querySelector('.compact-palette-panel'),
    btnExpandPalette: document.querySelector('.btn-palette-expand'),

    // HP Tool / Key Tool
    hpPanel: document.getElementById('hp-control-panel'),
    blockHpContainer: document.getElementById('block-hp-container'),
    hpSlider: document.getElementById('block-hp-slider'),
    hpVal: document.getElementById('block-hp-val'),
    keySizeContainer: document.getElementById('key-size-container'),
    keyWSlider: document.getElementById('key-w-slider'),
    keyWVal: document.getElementById('key-w-val'),
    keyHSlider: document.getElementById('key-h-slider'),
    keyHVal: document.getElementById('key-h-val'),

    // Units
    unitColsSlider: document.getElementById('unit-cols'),
    unitColsVal: document.getElementById('unit-cols-val'),
    unitMaxAmmoSlider: document.getElementById('unit-max-ammo'),
    unitMaxAmmoVal: document.getElementById('unit-max-ammo-val'),
    btnCreateUnits: document.getElementById('btn-create-units'),
    btnShuffleUnits: document.getElementById('btn-shuffle-units'),
    btnLinkMode: document.getElementById('btn-link-mode'),
    warehouseContainer: document.getElementById('warehouse-columns'),
    linksSvg: document.getElementById('links-svg'),
    unitAmmoControl: document.getElementById('unit-ammo-control'),
    unitAmmoSlider: document.getElementById('unit-ammo-slider'),
    unitAmmoVal: document.getElementById('unit-ammo-val'),
    unitIsHidden: document.getElementById('unit-is-hidden'),
    unitIsBarnLock: document.getElementById('unit-is-barn-lock'),
    unitLinksControl: document.getElementById('unit-links-control'),
    unitLinksList: document.getElementById('unit-links-list'),

    // Bottom Out
    jsonOutput: document.getElementById('json-output'),
    btnGenerateJson: document.getElementById('btn-generate-json'),
    btnCopyJson: document.getElementById('btn-copy-json'),
    btnLoadJson: document.getElementById('btn-load-json'),
    btnExpandJson: document.getElementById('btn-expand-json'),

    // Saves
    savesCarousel: document.getElementById('saves-carousel'),
    btnSaveProject: document.getElementById('btn-save-project'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
    userInfo: document.getElementById('user-info'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    loginHint: document.getElementById('login-hint'),
    cursorFollower: document.getElementById('cursor-follower')
};

// --- INITIALIZATION ---
let CELL_SIZE_PX = 32;

function init() {
    bindEvents();
    renderPalette();
    initWarehouseCols();
    fitCanvas();
    renderCanvas();

    setupAuthListeners();
    setTool('brush'); // Set initial classes
}

function bindEvents() {
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if ((e.key === 'Alt' || e.altKey) && currentTool === 'brush') {
            document.body.classList.add('alt-pressed');
        }
        if (e.code === 'KeyI') {
            setTool('picker');
        }
        if (e.code === 'KeyB') {
            setTool('brush');
        }
        if (e.code === 'KeyW') {
            setTool('select');
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
    window.addEventListener('mousemove', (e) => {
        onCanvasMouseMove(e);
        updateCursorFollower(e);
    });
    window.addEventListener('mouseup', onCanvasMouseUp);
    window.addEventListener('resize', fitCanvas);

    elements.canvas.addEventListener('contextmenu', e => e.preventDefault()); // Prevent right click

    // Board Settings
    elements.gridSizeSlider.addEventListener('input', (e) => {
        state.gridSize = parseInt(e.target.value);
        elements.gridSizeVal.textContent = state.gridSize;
        elements.gridSizeValBtn.textContent = state.gridSize;
        trimBlocks();
        fitCanvas();
        renderCanvas();
    });

    elements.btnToggleGrid.addEventListener('click', () => {
        elements.gridSliderPopup.classList.toggle('show');
    });

    // Close grid popup when clicking outside
    window.addEventListener('mousedown', (e) => {
        if (elements.gridSliderPopup.classList.contains('show') && 
            !elements.gridSliderPopup.contains(e.target) && 
            !elements.btnToggleGrid.contains(e.target)) {
            elements.gridSliderPopup.classList.remove('show');
        }
    });

    // Tools
    elements.btnBrush.addEventListener('click', () => setTool('brush'));
    elements.btnSelect.addEventListener('click', () => setTool('select'));
    elements.btnPicker.addEventListener('click', () => setTool('picker'));

    elements.btnZoomIn.addEventListener('click', () => { CELL_SIZE_PX = Math.min(256, CELL_SIZE_PX + 1.6); resizeCanvas(); renderCanvas(); });
    elements.btnZoomOut.addEventListener('click', () => { CELL_SIZE_PX = Math.max(4, CELL_SIZE_PX - 1.6); resizeCanvas(); renderCanvas(); });
    elements.btnFit.addEventListener('click', fitCanvas);

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

    elements.keyWSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        elements.keyWVal.textContent = val;
        if (currentTool === 'select' && selectedKeys.length > 0) {
            selectedKeys.forEach(pos => {
                let k = state.keys.get(`${pos.x},${pos.y}`);
                if (k) k.w = val;
            });
            renderCanvas();
        }
    });

    elements.keyHSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        elements.keyHVal.textContent = val;
        if (currentTool === 'select' && selectedKeys.length > 0) {
            selectedKeys.forEach(pos => {
                let k = state.keys.get(`${pos.x},${pos.y}`);
                if (k) k.h = val;
            });
            renderCanvas();
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

    elements.btnExpandPalette.addEventListener('click', () => {
        elements.palettePanel.classList.toggle('expanded');
    });

    // Make native picker dynamically update the active color!
    elements.newColorInput.addEventListener('input', (e) => {
        const c = state.colors.find(col => col.id === selectedColorId);
        if (c) {
            c.hex = e.target.value;
            renderCanvas();
            renderWarehouse();
            updatePaletteStats();
            updateCursorFollowerColor();
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
    elements.btnLinkMode.addEventListener('click', () => {
        isLinkModeActive = !isLinkModeActive;
        elements.btnLinkMode.classList.toggle('primary', isLinkModeActive);
        elements.btnLinkMode.classList.toggle('outline', !isLinkModeActive);
        document.body.style.cursor = isLinkModeActive ? 'crosshair' : 'default';
        renderWarehouse();
    });

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

    elements.unitIsHidden.addEventListener('change', (e) => {
        if (selectedUnitInfo) {
            const { colIndex, unitIndex } = selectedUnitInfo;
            if (state.warehouseColumns[colIndex] && state.warehouseColumns[colIndex][unitIndex]) {
                state.warehouseColumns[colIndex][unitIndex].IsHidden = e.target.checked;
                renderWarehouse();
            }
        }
    });

    elements.unitIsBarnLock.addEventListener('change', (e) => {
        if (selectedUnitInfo) {
            const { colIndex, unitIndex } = selectedUnitInfo;
            if (state.warehouseColumns[colIndex] && state.warehouseColumns[colIndex][unitIndex]) {
                state.warehouseColumns[colIndex][unitIndex].IsBarnLock = e.target.checked;
                renderWarehouse();
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
    elements.btnLoadJson.addEventListener('click', () => {
        try {
            const dataStr = elements.jsonOutput.value;
            if (!dataStr.trim()) return;
            loadFromJsonString(dataStr);
        } catch (e) {
            console.error("Load JSON from input error", e);
            alert("Failed to parse JSON. Please check if the format is correct.");
        }
    });

    // Auth & Saves
    elements.btnLogin.addEventListener('click', doLogin);
    elements.btnLogout.addEventListener('click', doLogout);
    elements.btnSaveProject.addEventListener('click', saveCurrentProject);

    elements.btnExpandJson.addEventListener('click', () => {
        elements.jsonOutput.classList.toggle('expanded');
        const icon = elements.btnExpandJson.querySelector('.material-icons');
        if (elements.jsonOutput.classList.contains('expanded')) {
            icon.textContent = 'compress';
        } else {
            icon.textContent = 'expand';
        }
    });
}

// --- CANVAS & DRAWING ---
function resizeCanvas() {
    elements.canvas.width = state.gridSize * CELL_SIZE_PX;
    elements.canvas.height = state.gridSize * CELL_SIZE_PX;
}

function fitCanvas() {
    const wrapper = elements.canvas.parentElement;
    if (!wrapper) return;

    const padding = 48; // Space around the canvas
    const availW = wrapper.clientWidth - padding;
    const availH = wrapper.clientHeight - padding;

    CELL_SIZE_PX = Math.min(availW, availH) / state.gridSize;
    resizeCanvas();
    renderCanvas();
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
    const isRightClick = e.button === 2;
    if (e.button !== 0 && !isRightClick && currentTool !== 'picker') return;

    const coords = getGridCoords(e);
    if (!coords) {
        if (currentTool === 'select' && !isRightClick) {
            selectedBlocks = [];
            renderCanvas();
        }
        return;
    }

    if (currentTool === 'select' && !isRightClick) {
        let clickedOnSelectedBlock = selectedBlocks.find(p => p.x === coords.x && p.y === coords.y);
        let clickedOnSelectedKey = selectedKeys.find(p => p.x === coords.x && p.y === coords.y);

        if (e.shiftKey || e.altKey) {
            // Modifiers always toggle/marquee
            if (state.blocks.has(`${coords.x},${coords.y}`) || state.keys.has(`${coords.x},${coords.y}`)) {
                // If it's a block/key, toggle it immediately
                if (e.shiftKey) {
                    if (!clickedOnSelectedBlock && state.blocks.has(`${coords.x},${coords.y}`)) selectedBlocks.push({ x: coords.x, y: coords.y });
                    if (!clickedOnSelectedKey && state.keys.has(`${coords.x},${coords.y}`)) selectedKeys.push({ x: coords.x, y: coords.y });
                } else if (e.altKey) {
                    selectedBlocks = selectedBlocks.filter(p => p.x !== coords.x || p.y !== coords.y);
                    selectedKeys = selectedKeys.filter(p => p.x !== coords.x || p.y !== coords.y);
                }
            }
            // Also start marquee in case they drag
            marqueeStartCoords = coords;
            currentMouseCoords = coords;
            isDraggingSelection = false;
        } else {
            // Normal click
            if (clickedOnSelectedBlock || clickedOnSelectedKey) {
                isDraggingSelection = true;
                dragStartCoords = coords;
            } else {
                if (state.blocks.has(`${coords.x},${coords.y}`)) {
                    selectedBlocks = [{ x: coords.x, y: coords.y }];
                    selectedKeys = [];
                    isDraggingSelection = true;
                    dragStartCoords = coords;
                } else if (state.keys.has(`${coords.x},${coords.y}`)) {
                    selectedKeys = [{ x: coords.x, y: coords.y }];
                    selectedBlocks = [];
                    isDraggingSelection = true;
                    dragStartCoords = coords;
                } else {
                    selectedBlocks = [];
                    selectedKeys = [];
                    marqueeStartCoords = coords;
                    currentMouseCoords = coords;
                }
            }
        }

        showControlPanels();
        renderCanvas();
        return;
    }

    if (currentTool === 'picker') {
        const keyStr = `${coords.x},${coords.y}`;
        const b = state.blocks.get(keyStr);
        const k = state.keys.get(keyStr);

        if (b) {
            selectedColorId = b.col;
            elements.newColorInput.value = state.colors.find(c => c.id === selectedColorId).hex;
            setTool('brush');
            renderPalette();
        } else if (k) {
            selectedColorId = 'key';
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

    // BRUSH TOOL (or RMB in any non-picker tool)
    isDrawing = true;
    drawMode = (e.altKey || isRightClick) ? 'erase' : 'draw';
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

                let newKeysObj = [];
                selectedKeys.forEach(pos => {
                    const key = `${pos.x},${pos.y}`;
                    const k = state.keys.get(key);
                    if (k) newKeysObj.push({ oldPos: pos, newPos: { x: pos.x + dx, y: pos.y + dy }, k: k });
                });
                newKeysObj.forEach(obj => state.keys.delete(`${obj.oldPos.x},${obj.oldPos.y}`));
                newKeysObj.forEach(obj => {
                    if (obj.newPos.x >= 0 && obj.newPos.x < state.gridSize && obj.newPos.y >= 0 && obj.newPos.y < state.gridSize) {
                        state.keys.set(`${obj.newPos.x},${obj.newPos.y}`, obj.k);
                    }
                });
                selectedKeys = newKeysObj.map(obj => obj.newPos).filter(p => p.x >= 0 && p.x < state.gridSize && p.y >= 0 && p.y < state.gridSize);

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
            let newKeysSelection = [];
            state.blocks.forEach((val, key) => {
                const [bx, by] = key.split(',').map(Number);
                if (bx >= minX && bx <= maxX && by >= minY && by <= maxY) {
                    newSelection.push({ x: bx, y: by });
                }
            });
            state.keys.forEach((val, key) => {
                const [kx, ky] = key.split(',').map(Number);
                if (kx >= minX && kx <= maxX && ky >= minY && ky <= maxY) {
                    newKeysSelection.push({ x: kx, y: ky });
                }
            });

            if (e.shiftKey) {
                newSelection.forEach(np => {
                    if (!selectedBlocks.find(p => p.x === np.x && p.y === np.y)) selectedBlocks.push(np);
                });
                newKeysSelection.forEach(np => {
                    if (!selectedKeys.find(p => p.x === np.x && p.y === np.y)) selectedKeys.push(np);
                });
            } else if (e.altKey) {
                selectedBlocks = selectedBlocks.filter(p => {
                    return !newSelection.find(np => np.x === p.x && p.y === np.y);
                });
                selectedKeys = selectedKeys.filter(p => {
                    return !newKeysSelection.find(np => np.x === p.x && p.y === np.y);
                });
            } else {
                selectedBlocks = newSelection;
                selectedKeys = newKeysSelection;
            }

            marqueeStartCoords = null;
            currentMouseCoords = null;

            showControlPanels();
            renderCanvas();
        } else {
            showControlPanels();
        }
        return;
    }

    if (isDrawing) {
        isDrawing = false;
        updatePaletteStats();
    }
    showControlPanels();
}

function showControlPanels() {
    if (selectedBlocks.length > 0 || selectedKeys.length > 0) {
        elements.hpPanel.classList.remove('hidden');
        if (selectedKeys.length > 0) {
            elements.blockHpContainer.classList.add('hidden');
            elements.keySizeContainer.classList.remove('hidden');
            let k = state.keys.get(`${selectedKeys[0].x},${selectedKeys[0].y}`);
            if (k) {
                elements.keyWSlider.value = k.w;
                elements.keyWVal.textContent = k.w;
                elements.keyHSlider.value = k.h;
                elements.keyHVal.textContent = k.h;
            }
        } else {
            elements.keySizeContainer.classList.add('hidden');
            elements.blockHpContainer.classList.remove('hidden');
            // Update HP slider if needed
            let b = state.blocks.get(`${selectedBlocks[0].x},${selectedBlocks[0].y}`);
            if (b) {
                elements.hpSlider.value = b.hp;
                elements.hpVal.textContent = b.hp;
            }
        }
    } else {
        elements.hpPanel.classList.add('hidden');
    }
}

function applyBrush(coords) {
    const keyStr = `${coords.x},${coords.y}`;
    if (drawMode === 'erase') {
        state.blocks.delete(keyStr);
        state.keys.delete(keyStr);
    } else {
        if (selectedColorId === 'key') {
            if (!state.keys.has(keyStr)) {
                state.keys.set(keyStr, { w: 1, h: 1 });
                // Optional: state.blocks.delete(keyStr); if we want keys to override blocks
            }
        } else {
            if (!state.colors.find(c => c.id === selectedColorId)) return;
            state.blocks.set(keyStr, { col: selectedColorId, hp: parseInt(elements.hpSlider.value) });
            // Optional: state.keys.delete(keyStr); if blocks override keys
        }
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

    let toDeleteKeys = [];
    state.keys.forEach((val, key) => {
        const [x, y] = key.split(',').map(Number);
        if (x >= state.gridSize || y >= state.gridSize) {
            toDeleteKeys.push(key);
        }
    });
    toDeleteKeys.forEach(k => state.keys.delete(k));

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
    const drawBlock = (b, key, isSelected) => {
        const [x, y] = key.split(',').map(Number);
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
    };

    // First draw unselected, then selected to ensure selected blocks overlap perfectly
    state.blocks.forEach((b, key) => {
        const [x, y] = key.split(',').map(Number);
        const isSelected = selectedBlocks.find(p => p.x === x && p.y === y) !== undefined;
        if (!isSelected) drawBlock(b, key, isSelected);
    });

    state.blocks.forEach((b, key) => {
        const [x, y] = key.split(',').map(Number);
        const isSelected = selectedBlocks.find(p => p.x === x && p.y === y) !== undefined;
        if (isSelected) drawBlock(b, key, isSelected);
    });

    // Draw Keys
    const drawKeyObj = (k, keyStr, isSelected) => {
        const [x, y] = keyStr.split(',').map(Number);
        let drawX = x;
        let drawY = y;

        if (isSelected && currentTool === 'select' && isDraggingSelection) {
            drawX += selectionDragVisualOffset.dx;
            drawY += selectionDragVisualOffset.dy;
        }

        const pxX = drawX * cs;
        // Invert Y: anchor is at (drawY). It spans from (drawY) upwards to (drawY + h - 1).
        // The top pixel equivalent is (s - 1 - (drawY + k.h - 1)) * cs
        const pxY = (s - 1 - (drawY + Math.max(1, k.h) - 1)) * cs;
        const widthPx = Math.max(1, k.w) * cs;
        const heightPx = Math.max(1, k.h) * cs;

        ctx.fillStyle = 'rgba(251, 191, 36, 0.3)'; // Tint for the key background
        ctx.fillRect(pxX, pxY, widthPx, heightPx);

        if (isSelected && currentTool === 'select' && !isDraggingSelection) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.strokeRect(pxX + 1.5, pxY + 1.5, widthPx - 3, heightPx - 3);
        } else {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(pxX + 1, pxY + 1, widthPx - 2, heightPx - 2);
            ctx.setLineDash([]);
        }

        ctx.font = `${Math.min(widthPx, heightPx) * 0.5}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("🗝️", pxX + widthPx / 2, pxY + heightPx / 2);
    };

    state.keys.forEach((k, keyStr) => {
        const [x, y] = keyStr.split(',').map(Number);
        const isSelected = selectedKeys.find(p => p.x === x && p.y === y) !== undefined;
        if (!isSelected) drawKeyObj(k, keyStr, isSelected);
    });

    state.keys.forEach((k, keyStr) => {
        const [x, y] = keyStr.split(',').map(Number);
        const isSelected = selectedKeys.find(p => p.x === x && p.y === y) !== undefined;
        if (isSelected) drawKeyObj(k, keyStr, isSelected);
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
    currentTool = tool;
    
    // UI Updates
    elements.btnBrush.classList.toggle('active', tool === 'brush');
    elements.btnSelect.classList.toggle('active', tool === 'select');
    elements.btnPicker.classList.toggle('active', tool === 'picker');
    document.body.classList.toggle('brush-tool', tool === 'brush');

    // Cursor handling
    if (tool === 'picker') {
        document.body.style.cursor = 'crosshair';
    } else if (tool === 'brush') {
        document.body.style.cursor = 'crosshair';
        updateCursorFollowerColor();
    } else {
        document.body.style.cursor = 'default';
    }

    if (tool !== 'select') {
        selectedBlocks = [];
        selectedKeys = [];
        marqueeStartCoords = null;
        currentMouseCoords = null;
        isDraggingSelection = false;
        showControlPanels();
    }

    if (tool !== 'brush') {
        document.body.classList.remove('alt-pressed');
    }

    renderCanvas();
}

function updateCursorFollower(e) {
    if (elements.cursorFollower) {
        elements.cursorFollower.style.left = e.clientX + 'px';
        elements.cursorFollower.style.top = e.clientY + 'px';
    }
}

function updateCursorFollowerColor() {
    if (!elements.cursorFollower) return;
    if (selectedColorId === 'key') {
        elements.cursorFollower.style.backgroundColor = 'rgba(251, 191, 36, 0.8)';
    } else {
        const c = state.colors.find(col => col.id === selectedColorId);
        if (c) {
            elements.cursorFollower.style.backgroundColor = c.hex;
        }
    }
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
        el.title = `Color ID: ${color.id}`;
        el.innerHTML = `
            <div class="palette-color-preview" style="background-color: ${color.hex}"></div>
            <div class="palette-info">
                <span>HP Diff: <b class="${diffClass}">${diffStr}</b></span>
                <button class="btn-delete-color material-icons-rounded">delete</button>
            </div>
        `;

        el.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-color')) {
                deleteColor(color.id);
            } else {
                selectedColorId = color.id;
                elements.newColorInput.value = color.hex;
                renderPalette();
                updateCursorFollowerColor();
            }
        });

        el.addEventListener('dblclick', (e) => {
            selectedColorId = color.id;
            elements.newColorInput.value = color.hex;
            
            const rect = el.getBoundingClientRect();
            elements.newColorInput.style.left = `${rect.right + 10}px`;
            elements.newColorInput.style.top = `${rect.top}px`;
            
            elements.newColorInput.click();
            renderPalette();
        });

        elements.paletteList.appendChild(el);
    });

    // Draw keys palette item
    let isBarnLockCount = 0;
    state.warehouseColumns.forEach(col => col.forEach(u => { if (u.IsBarnLock) isBarnLockCount++; }));
    let keysCount = state.keys.size;
    let locksDiff = isBarnLockCount - keysCount;
    let locksDiffStr = locksDiff > 0 ? `+${locksDiff}` : String(locksDiff);
    let locksDiffClass = locksDiff > 0 ? 'diff-positive' : (locksDiff < 0 ? 'diff-negative' : 'diff-zero');

    const keyEl = document.createElement('div');
    keyEl.className = `palette-item ${selectedColorId === 'key' ? 'selected' : ''}`;
    keyEl.title = "Keys Tool";
    keyEl.innerHTML = `
        <div class="palette-color-preview" style="background-color: rgba(251, 191, 36, 0.5); border-radius: 4px; display: flex; align-items: center; justify-content: center; position: relative;">
          <span style="font-size: 14px;">🗝️</span>
        </div>
        <div class="palette-info">
            <span>Keys Diff: <b class="${locksDiffClass}">${locksDiffStr}</b></span>
            <button class="btn-delete-color material-icons-rounded" style="visibility:hidden">delete</button>
        </div>
    `;
    keyEl.addEventListener('click', () => {
        selectedColorId = 'key';
        renderPalette();
        updateCursorFollowerColor();
    });
    elements.paletteList.appendChild(keyEl);
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
            allNewUnits.push({ id: `u_${unitIdCounter++}`, col: c.id, ammo: ammo, Lnk: [], IsHidden: false, IsBarnLock: false });
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
            
            if (unitData.IsBarnLock) {
                unitEl.classList.add('is-barn-lock');
                unitEl.innerHTML = '<img src="Lock_icon.png" style="width: 24px; height: 24px; object-fit: contain; pointer-events: none; user-select: none;" alt="lock"/>';
            } else {
                unitEl.textContent = unitData.ammo;
            }

            if (unitData.IsHidden) {
                unitEl.classList.add('is-hidden');
            }

            unitEl.dataset.colIndex = colIndex;
            unitEl.dataset.unitIndex = unitIndex;
            unitEl.dataset.id = unitData.id;

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
    
    // Draw Links Overlay
    drawLinks();
}

function updateGhostPosition(cx, cy) {
    if (!dragGhostEl) return;
    dragGhostEl.style.left = (cx - 18) + 'px';
    dragGhostEl.style.top = (cy - 18) + 'px';
}

function onUnitPointerDown(e, colIndex, unitIndex, unitData, unitEl) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    
    if (isLinkModeActive) {
        if (!unitData.Lnk) unitData.Lnk = [];
        if (unitData.Lnk.length >= 2) return; // Limit to 2 links
        
        isLinking = true;
        linkStartUnit = { colIndex, unitIndex, data: unitData, el: unitEl };
        
        const uDef = state.colors.find(c => c.id === unitData.col);
        const uHex = uDef ? uDef.hex : '#fbbf24';

        linkCurrentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        linkCurrentLine.setAttribute('stroke', uHex);
        linkCurrentLine.setAttribute('stroke-width', '4');
        linkCurrentLine.setAttribute('stroke-dasharray', '5,5');
        elements.linksSvg.appendChild(linkCurrentLine);
        
        updateLinkLine(e.clientX, e.clientY);
        
        document.addEventListener('pointermove', onLinkPointerMove);
        document.addEventListener('pointerup', onLinkPointerUp);
        return;
    }
    
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
        elements.unitIsHidden.checked = draggedUnitInfo.data.IsHidden || false;
        elements.unitIsBarnLock.checked = draggedUnitInfo.data.IsBarnLock || false;
        updateUnitLinksPanel();
    } else {
        selectedUnitInfo = {
            colIndex: draggedUnitInfo.colIndex,
            unitIndex: draggedUnitInfo.unitIndex
        };
        elements.unitAmmoControl.classList.remove('hidden');
        elements.unitAmmoSlider.value = draggedUnitInfo.data.ammo;
        elements.unitAmmoVal.textContent = draggedUnitInfo.data.ammo;
        elements.unitIsHidden.checked = draggedUnitInfo.data.IsHidden || false;
        elements.unitIsBarnLock.checked = draggedUnitInfo.data.IsBarnLock || false;
        updatePaletteStats(); // Also update counts across columns in case we need
        updateUnitLinksPanel();
    }
    
    draggedUnitInfo = null;
    renderWarehouse();
}

// --- LINK MODE DRAWING ---
function updateLinkLine(x, y) {
    if (!linkCurrentLine || !linkStartUnit || !linkStartUnit.el) return;
    const svgRect = elements.linksSvg.getBoundingClientRect();
    const startRect = linkStartUnit.el.getBoundingClientRect();
    const startX = startRect.left + startRect.width / 2 - svgRect.left;
    const startY = startRect.top + startRect.height / 2 - svgRect.top;
    
    const endX = x - svgRect.left;
    const endY = y - svgRect.top;
    
    linkCurrentLine.setAttribute('x1', startX);
    linkCurrentLine.setAttribute('y1', startY);
    linkCurrentLine.setAttribute('x2', endX);
    linkCurrentLine.setAttribute('y2', endY);
}

function onLinkPointerMove(e) {
    if (!isLinking) return;
    updateLinkLine(e.clientX, e.clientY);
}

function onLinkPointerUp(e) {
    if (!isLinking) return;
    isLinking = false;
    
    if (linkCurrentLine) {
        linkCurrentLine.remove();
        linkCurrentLine = null;
    }
    
    document.removeEventListener('pointermove', onLinkPointerMove);
    document.removeEventListener('pointerup', onLinkPointerUp);
    
    const elementBehind = document.elementFromPoint(e.clientX, e.clientY);
    const targetEl = elementBehind ? elementBehind.closest('.unit-circle') : null;
    
    if (targetEl && targetEl !== linkStartUnit.el) {
        const tCol = parseInt(targetEl.dataset.colIndex);
        const tUnit = parseInt(targetEl.dataset.unitIndex);
        const targetUnitData = state.warehouseColumns[tCol][tUnit];
        
        const existing = linkStartUnit.data.Lnk.includes(targetUnitData.id);
        if (!existing && linkStartUnit.data.Lnk.length < 2 && targetUnitData.Lnk.length < 2) {
            linkStartUnit.data.Lnk.push(targetUnitData.id);
            targetUnitData.Lnk.push(linkStartUnit.data.id);
            renderWarehouse();
            
            if (selectedUnitInfo && selectedUnitInfo.colIndex === linkStartUnit.colIndex && selectedUnitInfo.unitIndex === linkStartUnit.unitIndex) {
                updateUnitLinksPanel();
            }
        }
    }
    
    linkStartUnit = null;
}

function drawLinks() {
    elements.linksSvg.innerHTML = '';
    const svgRect = elements.linksSvg.getBoundingClientRect();
    if (svgRect.width === 0) return; // Not visible yet
    
    // Cache positions and colors
    const posMap = new Map();
    document.querySelectorAll('.unit-circle').forEach(el => {
        const id = el.dataset.id;
        const colIdx = parseInt(el.dataset.colIndex);
        const unitIdx = parseInt(el.dataset.unitIndex);
        const uData = state.warehouseColumns[colIdx][unitIdx];
        const uDef = state.colors.find(c => c.id === uData.col);
        const uHex = uDef ? uDef.hex : '#ffffff';

        const r = el.getBoundingClientRect();
        posMap.set(id, {
            x: r.left + r.width / 2 - svgRect.left,
            y: r.top + r.height / 2 - svgRect.top,
            color: uHex
        });
    });

    const drawnPairs = new Set();

    state.warehouseColumns.forEach((colData, colIndex) => {
        colData.forEach((unitData, unitIndex) => {
            if (!unitData.Lnk || unitData.Lnk.length === 0) return;
            const startNode = posMap.get(unitData.id);
            if (!startNode) return;
            
            unitData.Lnk.forEach(targetId => {
                const pairKey = [unitData.id, targetId].sort().join('-');
                if (drawnPairs.has(pairKey)) return;
                drawnPairs.add(pairKey);

                const endNode = posMap.get(targetId);
                if (!endNode) return; // Target deleted
                
                const midX = (startNode.x + endNode.x) / 2;
                const midY = (startNode.y + endNode.y) / 2;

                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', startNode.x);
                line1.setAttribute('y1', startNode.y);
                line1.setAttribute('x2', midX);
                line1.setAttribute('y2', midY);
                line1.setAttribute('stroke', startNode.color);
                line1.setAttribute('stroke-width', '4');
                elements.linksSvg.appendChild(line1);

                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', midX);
                line2.setAttribute('y1', midY);
                line2.setAttribute('x2', endNode.x);
                line2.setAttribute('y2', endNode.y);
                line2.setAttribute('stroke', endNode.color);
                line2.setAttribute('stroke-width', '4');
                elements.linksSvg.appendChild(line2);
            });
        });
    });
}

function updateUnitLinksPanel() {
    elements.unitLinksList.innerHTML = '';
    
    if (!selectedUnitInfo) return;
    const { colIndex, unitIndex } = selectedUnitInfo;
    const unit = state.warehouseColumns[colIndex][unitIndex];
    if (!unit || !unit.Lnk) return;
    
    unit.Lnk.forEach((targetId) => {
        let targetCol = -1, targetRow = -1;
        for (let c = 0; c < state.warehouseColumns.length; c++) {
            const rowIdx = state.warehouseColumns[c].findIndex(u => u.id === targetId);
            if (rowIdx !== -1) {
                targetCol = c;
                targetRow = rowIdx;
                break;
            }
        }

        const badge = document.createElement('div');
        badge.className = 'link-badge';
        badge.innerHTML = `Col: ${targetCol}, Row: ${targetRow} <i class="material-icons" style="font-size:14px; cursor:pointer;" title="Remove">close</i>`;
        
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '4px';
        badge.style.background = 'rgba(255,255,255,0.1)';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.fontSize = '0.8rem';
        
        badge.querySelector('i').addEventListener('click', () => {
            unit.Lnk = unit.Lnk.filter(id => id !== targetId);
            if (targetCol !== -1 && targetRow !== -1) {
                const targetU = state.warehouseColumns[targetCol][targetRow];
                targetU.Lnk = targetU.Lnk.filter(id => id !== unit.id);
            }
            updateUnitLinksPanel();
            renderWarehouse();
        });
        
        elements.unitLinksList.appendChild(badge);
    });
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

    // Process keys map into array
    let keysArr = [];
    state.keys.forEach((val, key) => {
        const [x, y] = key.split(',').map(Number);
        keysArr.push({
            "Pos": { "x": x, "y": y },
            "Size": { "x": val.w, "y": val.h }
        });
    });

    let idToCoords = {};
    state.warehouseColumns.forEach((colData, cIdx) => {
        colData.forEach((u, uIdx) => {
            idToCoords[u.id] = { x: cIdx, y: uIdx };
        });
    });

    let wbArr = [];
    state.warehouseColumns.forEach((colData, xIdx) => {
        let Units = [];
        colData.forEach((u, yIdx) => {
            let mappedLnk = [];
            if (u.Lnk) {
                u.Lnk.forEach(targetId => {
                    if (idToCoords[targetId]) mappedLnk.push(idToCoords[targetId]);
                });
            }

            Units.push({
                "Col": u.col,
                "Ammo": u.ammo,
                "IsHidden": u.IsHidden || false,
                "IsBarnLock": u.IsBarnLock || false,
                "Lnk": mappedLnk // Include links
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
        Keys: keysArr,
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

        const q = query(collection(db, `users/${firebaseUser.uid}/projects`), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
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
        loadFromJsonString(decoded);
    } catch (e) {
        console.error("Load JSON error", e);
        alert("Failed to parse or load JSON.");
    }
};

function loadFromJsonString(jsonString) {
    const data = JSON.parse(jsonString);

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

    // Keys
    state.keys = new Map();
    if (data.Keys) {
        data.Keys.forEach(k => {
            state.keys.set(`${k.Pos.x},${k.Pos.y}`, { w: k.Size?.x || 1, h: k.Size?.y || 1 });
        });
    }

    // 4. Warehouse Columns
    let unitIdCounter = 0;
    state.warehouseColumns = [];
    if (data.WarehouseColumns) {
        data.WarehouseColumns.forEach((colData) => {
            let col = [];
            if (colData.Units) {
                colData.Units.forEach(u => {
                    col.push({ 
                        id: `u_${unitIdCounter++}`,
                        col: u.Col, 
                        ammo: u.Ammo || 1, 
                        IsHidden: u.IsHidden || false, 
                        IsBarnLock: u.IsBarnLock || false, 
                        _tmpLnk: u.Lnk || [] 
                    });
                });
            }
            state.warehouseColumns.push(col);
        });

        // Map _tmpLnk to IDs
        state.warehouseColumns.forEach((colData, cIdx) => {
            colData.forEach((u) => {
                let idLnk = [];
                u._tmpLnk.forEach(pos => {
                    if (state.warehouseColumns[pos.x] && state.warehouseColumns[pos.x][pos.y]) {
                        idLnk.push(state.warehouseColumns[pos.x][pos.y].id);
                    }
                });
                u.Lnk = idLnk;
                delete u._tmpLnk;
            });
        });

        state.unitColsCount = Math.max(1, state.warehouseColumns.length);
        elements.unitColsSlider.value = state.unitColsCount;
        elements.unitColsVal.textContent = state.unitColsCount;
    }

    // Clean UI state
    selectedBlocks = [];
    selectedKeys = [];
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
}

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

