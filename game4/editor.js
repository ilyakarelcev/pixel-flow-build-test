import { auth, provider, db, onAuthStateChanged, signInWithPopup, signOut, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, where } from './firebase.js';

const CELL_SIZE = 70;
const CELL_GAP = 8;
const STEP = CELL_SIZE + CELL_GAP;

const paletteObjects = [
    { type: 'block', value: 2 },
    { type: 'box', hp: 1 },
    { type: 'wall' },
    { type: 'frozen_block', value: 8 },
    { type: 'key' },
    { type: 'door' },
    { type: 'stone', activates_zone: 'zone_1' },
    { type: 'mailbox' },
    { type: 'letter' }
];

let appState = {
    gridX: 5,
    gridY: 5,
    moves_limit: 200,
    missions: [], // { type, target_value(opt), amount }
    board_cells: {}, // key: "x,y", value: "zone_id"
    items: [],
    spawn_zones: [
        { id: "zone_1", active: true, base_value: 2 },
        { id: "zone_2", active: false, base_value: 8 }
    ],
    selectedTool: "zone_1", // zone_id
    selectedItemUid: null,
    uidCounter: 1,
    activeLevelId: null
};

let isPainting = false;
let paintMode = 'zone'; // 'zone', 'erase'
let currentDragIsMissionValid = false;

const assetCache = {};
const assetPaths = {
    'box': 'Art/Box.png',
    'stone': 'Art/Stone.png',
    'wall': 'Art/Wall.png',
    'ice': 'Art/Ice.png'
};

async function preloadAssets() {
    const promises = Object.entries(assetPaths).map(([name, path]) => {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => { assetCache[name] = img; resolve(); };
            img.onerror = () => { console.warn("Failed to load", path); resolve(); };
            img.src = path;
        });
    });
    await Promise.all(promises);
}

// DOM Elements
const boardBg = document.getElementById('board-background');
const boardItems = document.getElementById('board-items');
const boardContainer = document.getElementById('board-container');
const zonesPalette = document.getElementById('zones-palette');
const objectsPalette = document.getElementById('objects-palette');
const inspector = document.getElementById('properties-inspector');
const jsonIo = document.getElementById('json-io');

// Initialization
function initEditor() {
    // Fill initial board
    for(let y=0; y<appState.gridY; y++){
        for(let x=0; x<appState.gridX; x++){
            appState.board_cells[`${x},${y}`] = "zone_1";
        }
    }
    
    preloadAssets().then(() => renderAll());
    bindUIEvents();
}

function bindUIEvents() {
    // Grid Setup
    document.getElementById('grid-x').addEventListener('change', e => {
        appState.gridX = parseInt(e.target.value) || 2;
        renderBoardGrid();
    });
    document.getElementById('grid-y').addEventListener('change', e => {
        appState.gridY = parseInt(e.target.value) || 2;
        renderBoardGrid();
    });
    document.getElementById('moves-limit').addEventListener('change', e => {
        appState.moves_limit = parseInt(e.target.value) || 1;
    });

    // Drawing Events
    document.addEventListener('contextmenu', e => e.preventDefault());
    
    boardBg.addEventListener('mousedown', e => {
        let cell = e.target.closest('.grid-cell');
        if(!cell) return;
        isPainting = true;
        boardItems.style.pointerEvents = 'none'; // Allow painting through objects
        paintMode = e.button === 2 ? 'erase' : 'zone';
        paintCell(parseInt(cell.dataset.x), parseInt(cell.dataset.y));
    });
    boardBg.addEventListener('mouseover', e => {
        if(!isPainting) return;
        let cell = e.target.closest('.grid-cell');
        if(!cell) return;
        paintCell(parseInt(cell.dataset.x), parseInt(cell.dataset.y));
    });
    document.addEventListener('mouseup', () => { 
        isPainting = false; 
        boardItems.style.pointerEvents = 'auto'; // Restore object interaction
    });

    // Add Zone
    document.getElementById('add-zone-btn').addEventListener('click', () => {
        let newId = `zone_${appState.spawn_zones.length + 1}`;
        appState.spawn_zones.push({ id: newId, active: false, base_value: 2 });
        appState.selectedTool = newId;
        renderZonesPalette();
    });

    // Keyboard Delete
    document.addEventListener('keydown', e => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (appState.selectedItemUid !== null) {
                appState.items = appState.items.filter(i => i.uid !== appState.selectedItemUid);
                appState.selectedItemUid = null;
                renderItems();
                renderInspector();
            }
        }
    });

    // Missions
    const missionsList = document.getElementById('missions-list');
    const missionsContainer = document.getElementById('missions-container');
    
    document.getElementById('add-mission-btn').addEventListener('click', () => {
        appState.missions.push({ type: 'collect_block', amount: 1, target_value: 2 });
        renderMissions();
    });

    // Note: drop is handled only by #missions-drop-zone to avoid double-add

    // I/O
    document.getElementById('generate-json-btn').addEventListener('click', generateJSONUI);
    document.getElementById('load-json-btn').addEventListener('click', loadJSON);

    // Setup board drop zone
    function clearHover() {
        document.querySelectorAll('.grid-cell.drag-hover').forEach(el => el.classList.remove('drag-hover'));
    }

    boardContainer.addEventListener('dragover', e => {
        e.preventDefault();
        let rect = boardItems.getBoundingClientRect();
        let scaleStr = boardContainer.style.transform || 'scale(1)';
        let scale = 1;
        let scaleMatch = scaleStr.match(/scale\(([^)]+)\)/);
        if(scaleMatch) scale = parseFloat(scaleMatch[1]);

        let x = Math.floor((e.clientX - rect.left) / scale / STEP);
        let y = Math.floor((e.clientY - rect.top) / scale / STEP);

        clearHover();
        if (x >= 0 && x < appState.gridX && y >= 0 && y < appState.gridY) {
            let cell = boardBg.querySelector(`.grid-cell[data-x="${x}"][data-y="${y}"]`);
            if (cell) cell.classList.add('drag-hover');
        }
    });

    boardContainer.addEventListener('dragleave', e => clearHover());

    boardContainer.addEventListener('drop', e => {
        e.preventDefault();
        clearHover();
        
        // Check if an existing item is dropped
        let u = e.dataTransfer.getData('text/plain');
        if (u) {
            let uid = parseInt(u);
            let item = appState.items.find(i => i.uid === uid);
            if(item) {
                let rect = boardItems.getBoundingClientRect();
                let scaleStr = boardContainer.style.transform || 'scale(1)';
                let scale = 1;
                let scaleMatch = scaleStr.match(/scale\(([^)]+)\)/);
                if(scaleMatch) scale = parseFloat(scaleMatch[1]);

                let x = Math.floor((e.clientX - rect.left) / scale / STEP);
                let y = Math.floor((e.clientY - rect.top) / scale / STEP);

                if (x >= 0 && x < appState.gridX && y >= 0 && y < appState.gridY) {
                    let key = `${x},${y}`;
                    if (!appState.board_cells[key]) {
                        appState.board_cells[key] = 'zone_1';
                        renderBoardGrid();
                    }

                    if (e.altKey) {
                        appState.items = appState.items.filter(i => i.x !== x || i.y !== y);
                        let newItem = { ...item, uid: appState.uidCounter++, x, y };
                        appState.items.push(newItem);
                        appState.selectedItemUid = newItem.uid;
                    } else {
                        appState.items = appState.items.filter(i => i.x !== x || i.y !== y);
                        item.x = x;
                        item.y = y;
                        appState.selectedItemUid = item.uid;
                    }
                    renderItems();
                    renderInspector();
                }
            }
            return;
        }

        let data = e.dataTransfer.getData('application/json');
        if(!data) return;
        let obj = JSON.parse(data);
        
        // Calculate grid position
        let rect = boardItems.getBoundingClientRect();
        let scaleStr = boardContainer.style.transform || 'scale(1)';
        let scale = 1;
        let scaleMatch = scaleStr.match(/scale\(([^)]+)\)/);
        if(scaleMatch) scale = parseFloat(scaleMatch[1]);

        let x = Math.floor((e.clientX - rect.left) / scale / STEP);
        let y = Math.floor((e.clientY - rect.top) / scale / STEP);

        if (x >= 0 && x < appState.gridX && y >= 0 && y < appState.gridY) {
            let key = `${x},${y}`;
            if (!appState.board_cells[key]) {
                appState.board_cells[key] = 'zone_1';
                renderBoardGrid();
            }

            appState.items = appState.items.filter(i => i.x !== x || i.y !== y);
            let newItem = { ...obj, uid: appState.uidCounter++, x, y };
            appState.items.push(newItem);
            appState.selectedItemUid = newItem.uid;
            appState.selectedTool = null; // deselect paint
            renderZonesPalette();
            renderItems();
            renderInspector();
        }
    });

    // Auth & Saves UI
    document.getElementById('btn-login')?.addEventListener('click', doLogin);
    document.getElementById('btn-logout')?.addEventListener('click', doLogout);
    document.getElementById('btn-save-project')?.addEventListener('click', saveCurrentProject);
    document.getElementById('btn-copy-current')?.addEventListener('click', generateJSONUI);
    document.getElementById('btn-publish')?.addEventListener('click', publishLevel);
    
    // Modal events
    document.getElementById('btn-info')?.addEventListener('click', () => {
        document.getElementById('info-modal').style.display = 'flex';
    });
    document.getElementById('close-info-modal')?.addEventListener('click', () => {
        document.getElementById('info-modal').style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('info-modal');
        if (e.target === modal) modal.style.display = 'none';
    });

    // Drag events for missions highlight (only for valid mission object types)
    document.addEventListener('dragstart', (e) => {
        if (!currentDragIsMissionValid) return;
        const missionsContainerEl = document.getElementById('missions-container');
        if (missionsContainerEl) missionsContainerEl.classList.add('drag-active');
    });

    document.addEventListener('dragend', (e) => {
        currentDragIsMissionValid = false;
        const missionsContainerEl = document.getElementById('missions-container');
        const missionsDropZone = document.getElementById('missions-drop-zone');
        if (missionsContainerEl) missionsContainerEl.classList.remove('drag-active');
        if (missionsDropZone) missionsDropZone.classList.remove('drag-over');
    });

    const missionsDropZone = document.getElementById('missions-drop-zone');
    if (missionsDropZone) {
        missionsDropZone.addEventListener('dragover', (e) => {
            if (!currentDragIsMissionValid) return;
            e.preventDefault();
            missionsDropZone.classList.add('drag-over');
        });

        missionsDropZone.addEventListener('dragleave', () => {
            missionsDropZone.classList.remove('drag-over');
        });

        missionsDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            missionsDropZone.classList.remove('drag-over');

            let data = e.dataTransfer.getData('application/json');
            if(!data) return;
            let obj = JSON.parse(data);

            addMissionFromType(obj.type, obj.value);
        });
    }

    setupAuthListeners();
}

// Rendering
function renderAll() {
    document.getElementById('grid-x').value = appState.gridX;
    document.getElementById('grid-y').value = appState.gridY;
    document.getElementById('moves-limit').value = appState.moves_limit;
    
    renderZonesPalette();
    renderObjectsPalette();
    renderBoardGrid();
    renderItems();
    renderMissions();
    renderInspector();
}

function getMissionIcon(type, val) {
    if (type === 'collect_block') return `Блок ${val}`;
    if (type === 'destroy_box') return '📦 Ящик';
    if (type === 'open_door') return '🚪 Дверь';
    if (type === 'collect_letter') return '✉️ Письмо';
    if (type === 'destroy_stone') return '🪨 Камень';
    return type;
}

const VALID_MISSION_TYPES = { 'block': 'collect_block', 'box': 'destroy_box', 'door': 'open_door', 'letter': 'collect_letter', 'stone': 'destroy_stone' };

function isMissionValidType(objType) {
    return objType in VALID_MISSION_TYPES;
}

function addMissionFromType(objType, val) {
    if (!isMissionValidType(objType)) return;

    let missionType = VALID_MISSION_TYPES[objType];

    appState.missions.push({
        type: missionType,
        amount: 1,
        target_value: val || undefined
    });
    renderMissions();
}

function renderMissions() {
    const list = document.getElementById('missions-list');
    list.innerHTML = '';
    appState.missions.forEach((m, idx) => {
        let el = document.createElement('div');
        el.className = `mission-editor-item ${appState.selectedItemUid === 'mission_' + idx ? 'selected' : ''}`;
        
        let icon = getMissionIcon(m.type, m.target_value);
        el.innerHTML = `
            <div class="mission-editor-icon">${icon}</div>
            <div class="mission-editor-amount">x${m.amount}</div>
            <button class="danger delete-btn">X</button>
        `;
        
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            appState.missions.splice(idx, 1);
            renderMissions();
            if (appState.selectedItemUid === 'mission_'+idx) {
                appState.selectedItemUid = null;
                renderInspector();
            }
        });
        
        el.addEventListener('click', () => {
            appState.selectedItemUid = 'mission_' + idx;
            appState.selectedTool = null;
            renderZonesPalette();
            renderItems();
            renderMissions();
            renderInspector();
        });
        
        list.appendChild(el);
    });
}

function renderZonesPalette() {
    zonesPalette.innerHTML = '';
    appState.spawn_zones.forEach(z => {
        let el = document.createElement('div');
        el.className = `zone-item ${appState.selectedTool === z.id ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="zone-color" style="background: ${getZoneColor(z.id)}"></div>
            <span>${z.id}</span>
        `;
        el.addEventListener('click', () => {
            appState.selectedTool = z.id;
            appState.selectedItemUid = null;
            renderZonesPalette();
            renderInspector(); // to show zone props
        });
        zonesPalette.appendChild(el);
    });
}

function getZoneColor(zoneId) {
    let num = parseInt(zoneId.replace('zone_', ''));
    let colors = ['#3498db', '#9b59b6', '#e67e22', '#2ecc71', '#f1c40f', '#e74c3c'];
    return colors[(num - 1) % colors.length];
}

function renderObjectsPalette() {
    objectsPalette.innerHTML = '';
    paletteObjects.forEach(obj => {
        let el = document.createElement('div');
        el.className = `item palette-object`;
        
        let inner = document.createElement('div');
        inner.className = `item-inner type-${obj.type}`;
        el.appendChild(inner);
        
        if (obj.type === 'block' || obj.type === 'frozen_block') {
            inner.textContent = obj.value;
            inner.setAttribute('data-level', Math.log2(obj.value));
        } else if (obj.type === 'box') {
            inner.setAttribute('data-hp', obj.hp);
        }
        
        // Drag logic
        el.draggable = true;
        el.addEventListener('dragstart', e => {
            currentDragIsMissionValid = isMissionValidType(obj.type);
            e.dataTransfer.setData('application/json', JSON.stringify(obj));
        });

        objectsPalette.appendChild(el);
    });
}

function renderBoardGrid() {
    boardBg.innerHTML = '';
    for(let y=0; y<appState.gridY; y++){
        for(let x=0; x<appState.gridX; x++){
            let key = `${x},${y}`;
            let cell = document.createElement('div');
            cell.className = 'grid-cell';
            
            let zId = appState.board_cells[key];
            if(zId) {
                cell.style.background = getZoneColor(zId);
                cell.style.opacity = '0.5';
                
                // Neighbor checks for rounding
                if (!appState.board_cells[`${x-1},${y}`]) cell.classList.add('is-tl', 'is-bl');
                if (!appState.board_cells[`${x+1},${y}`]) cell.classList.add('is-tr', 'is-br');
                if (!appState.board_cells[`${x},${y-1}`]) cell.classList.add('is-tl', 'is-tr');
                if (!appState.board_cells[`${x},${y+1}`]) cell.classList.add('is-bl', 'is-br');
                // Refining logic: only round if BOTH direct neighbors are missing for true corner
                // Actually the individual class approach is better:
                cell.classList.remove('is-tl', 'is-tr', 'is-bl', 'is-br');
                if (!appState.board_cells[`${x-1},${y}`] && !appState.board_cells[`${x},${y-1}`]) cell.classList.add('is-tl');
                if (!appState.board_cells[`${x+1},${y}`] && !appState.board_cells[`${x},${y-1}`]) cell.classList.add('is-tr');
                if (!appState.board_cells[`${x-1},${y}`] && !appState.board_cells[`${x},${y+1}`]) cell.classList.add('is-bl');
                if (!appState.board_cells[`${x+1},${y}`] && !appState.board_cells[`${x},${y+1}`]) cell.classList.add('is-br');
                
            } else {
                cell.style.background = 'rgba(0,0,0,0.5)';
                cell.style.opacity = '0.2'; // hole
            }
            cell.style.transform = `translate(${x * STEP}px, ${y * STEP}px)`;
            cell.dataset.x = x;
            cell.dataset.y = y;
            boardBg.appendChild(cell);
        }
    }
    const boardPad = 4; // symmetric padding around grid cells
    boardContainer.style.width = `${appState.gridX * STEP - CELL_GAP + boardPad * 2}px`;
    boardContainer.style.height = `${appState.gridY * STEP - CELL_GAP + boardPad * 2}px`;
}

function paintCell(x, y) {
    if (x < 0 || x >= appState.gridX || y < 0 || y >= appState.gridY) return;
    let key = `${x},${y}`;
    if (paintMode === 'erase') {
        delete appState.board_cells[key];
    } else {
        if (!appState.selectedTool) return;
        appState.board_cells[key] = appState.selectedTool;
    }
    renderBoardGrid();
}

function renderItems() {
    boardItems.innerHTML = '';
    appState.items.forEach(item => {
        let el = document.createElement('div');
        el.className = `item ${appState.selectedItemUid === item.uid ? 'selected' : ''}`;
        const itemOffset = (CELL_SIZE - 66) / 2; // center 66px item in 70px cell
        el.style.transform = `translate(${item.x * STEP + itemOffset}px, ${item.y * STEP + itemOffset}px)`;
        
        let inner = document.createElement('div');
        inner.className = `item-inner type-${item.type}`;
        el.appendChild(inner);

        if (item.type === 'block' || item.type === 'frozen_block') {
            inner.textContent = item.value;
            inner.setAttribute('data-level', Math.log2(item.value));
        } else if (item.type === 'box') {
            inner.setAttribute('data-hp', item.hp);
        }
        
        // Item clicking
        el.addEventListener('mousedown', e => {
            e.stopPropagation(); // prevent paint
            appState.selectedItemUid = item.uid;
            appState.selectedTool = null;
            renderZonesPalette();
            renderItems();
            renderInspector();
        });

        // Item dragging
        el.draggable = true;
        el.addEventListener('dragstart', e => {
            appState.selectedItemUid = item.uid;
            e.dataTransfer.setData('text/plain', item.uid);
        });

        if (item.activates_zone) {
            let indicator = document.createElement('div');
            indicator.className = 'zone-indicator';
            indicator.style.background = getZoneColor(item.activates_zone);
            el.appendChild(indicator);
        }

        boardItems.appendChild(el);
    });
}

function renderInspector() {
    inspector.innerHTML = '';
    
    // Check if a zone is selected
    if (appState.selectedTool) {
        let zone = appState.spawn_zones.find(z => z.id === appState.selectedTool);
        if (zone) {
            inspector.innerHTML = `<h4>Зона: ${zone.id}</h4>`;

            let html = `
            <div class="hint-box">
                На активных зонах появляются новые блоки с числами после каждого хода. Выключенную зону можно активировать, разрушив привязанный к ней объект (ящик, камень, дверь и др.).
            </div>
            <div class="prop-group">
                <label>Активна сначала:</label>
                <select id="insp-zone-active">
                    <option value="true" ${zone.active ? 'selected' : ''}>Активна</option>
                    <option value="false" ${!zone.active ? 'selected' : ''}>Выключена</option>
                </select>
            </div>
            <div class="prop-group">
                <label>Базовый спавн (2, 4, 8...):</label>
                <input type="number" id="insp-zone-value" value="${zone.base_value}">
            </div>`;
            inspector.insertAdjacentHTML('beforeend', html);
            
            document.getElementById('insp-zone-active').addEventListener('change', e => {
                zone.active = e.target.value === 'true';
            });
            document.getElementById('insp-zone-value').addEventListener('change', e => {
                zone.base_value = parseInt(e.target.value) || 2;
            });
            return;
        }
    }

    // Check if an item is selected
    if (appState.selectedItemUid !== null && typeof appState.selectedItemUid === 'number') {
        let item = appState.items.find(i => i.uid === appState.selectedItemUid);
        if (!item) return;

        inspector.innerHTML = `<h4>Объект: ${item.type}</h4>
            <div style="font-size: 0.8em; opacity: 0.6; margin-bottom: 10px;">Поз: X:${item.x}, Y:${item.y}</div>
        `;

        if (item.type === 'block' || item.type === 'frozen_block') {
            inspector.insertAdjacentHTML('beforeend', `
                <div class="prop-group">
                    <label>Уровень (Log2):</label>
                    <input type="range" id="insp-item-level" min="1" max="11" value="${Math.log2(item.value)}">
                    <span>Значение: <b id="insp-item-value-disp">${item.value}</b></span>
                </div>
            `);
            document.getElementById('insp-item-level').addEventListener('input', e => {
                item.value = Math.pow(2, parseInt(e.target.value));
                document.getElementById('insp-item-value-disp').textContent = item.value;
                renderItems();
            });
        }

        if (item.type === 'box') {
            inspector.insertAdjacentHTML('beforeend', `
                <div class="prop-group">
                    <label>HP (1-3):</label>
                    <input type="range" id="insp-item-hp" min="1" max="3" value="${item.hp}">
                </div>
            `);
            document.getElementById('insp-item-hp').addEventListener('input', e => {
                item.hp = parseInt(e.target.value);
                renderItems();
            });
        }

        if (item.type === 'stone' || item.type === 'door' || item.type === 'box' || item.type === 'frozen_block') {
            let zoneOptions = `<option value="">-- Нет --</option>` + appState.spawn_zones.map(z =>
                `<option value="${z.id}" ${item.activates_zone === z.id ? 'selected' : ''} style="color: ${getZoneColor(z.id)}; font-weight: bold;">${z.id}</option>`
            ).join('');

            inspector.insertAdjacentHTML('beforeend', `
                <div class="hint-box">
                    Когда этот объект будет разрушен, выбранная зона станет активной и начнёт создавать новые блоки.
                </div>
                <div class="prop-group">
                    <label>Активирует зону:</label>
                    <select id="insp-item-zone" class="dark-dropdown">
                        ${zoneOptions}
                    </select>
                </div>
            `);
            document.getElementById('insp-item-zone').addEventListener('change', e => {
                if (e.target.value) {
                    item.activates_zone = e.target.value;
                } else {
                    delete item.activates_zone;
                }
                renderItems();
            });
        }

        let delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.style.marginTop = '20px';
        delBtn.textContent = 'Удалить объект';
        delBtn.addEventListener('click', () => {
            appState.items = appState.items.filter(i => i.uid !== item.uid);
            appState.selectedItemUid = null;
            renderItems();
            renderInspector();
        });
        inspector.appendChild(delBtn);
        return;
    }
    
    // Check if a mission is selected
    if (typeof appState.selectedItemUid === 'string' && appState.selectedItemUid.startsWith('mission_')) {
        let idx = parseInt(appState.selectedItemUid.split('_')[1]);
        let mission = appState.missions[idx];
        if (!mission) return;

        inspector.innerHTML = `<h4>Миссия: ${mission.type}</h4>`;
        
        if (mission.type === 'collect_block') {
            inspector.insertAdjacentHTML('beforeend', `
                <div class="prop-group">
                    <label>Целевое значение:</label>
                    <input type="range" id="insp-mission-val" min="1" max="11" value="${Math.log2(mission.target_value || 2)}">
                    <span>Значение: <b id="insp-msn-val-disp">${mission.target_value}</b></span>
                </div>
            `);
            document.getElementById('insp-mission-val').addEventListener('input', e => {
                mission.target_value = Math.pow(2, parseInt(e.target.value));
                document.getElementById('insp-msn-val-disp').textContent = mission.target_value;
                renderMissions();
            });
        }
        
        inspector.insertAdjacentHTML('beforeend', `
            <div class="prop-group">
                <label>Количество:</label>
                <input type="number" id="insp-mission-amt" min="1" value="${mission.amount}">
            </div>
        `);
        document.getElementById('insp-mission-amt').addEventListener('change', e => {
            mission.amount = parseInt(e.target.value) || 1;
            renderMissions();
        });
        
        return;
    }

    inspector.innerHTML = '<p class="placeholder">Выберите объект или зону</p>';
}

// I/O
function copyToClipboard(text) {
    if (!text) return;
    
    // Attempt modern API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyFeedback();
        }).catch(err => {
            console.error("Clipboard API failed, trying fallback", err);
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // Ensure it's not visible
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
            showCopyFeedback();
        }
    } catch (err) {
        console.error('Fallback copy failed', err);
        alert("Unable to copy to clipboard. Please copy manually from the JSON field.");
    }
}

function showSaveFeedback(id) {
    // We find the button by the id we passed to overwriteSave
    const cards = document.querySelectorAll('.save-card');
    let targetBtn = null;
    
    // Find the 'Save' button inside the card that matches this id
    cards.forEach(card => {
        const saveBtn = card.querySelector(`button[onclick*="window.overwriteSave('${id}')"]`);
        if (saveBtn) targetBtn = saveBtn;
    });

    if (targetBtn) {
        const originalText = targetBtn.innerText;
        targetBtn.innerText = "Saved! ✓";
        targetBtn.style.background = "#059669";
        targetBtn.style.fontWeight = "bold";
        setTimeout(() => {
            targetBtn.innerText = originalText;
            targetBtn.style.background = "";
            targetBtn.style.fontWeight = "";
        }, 2000);
    }
}

function showCopyFeedback() {
    // Show a small toast or visual change
    const btn = document.getElementById('btn-copy-current');
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = "✅ Copied!";
        btn.style.background = "#2ecc71";
        btn.style.borderColor = "#27ae60";
        btn.style.color = "#fff";
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = "";
            btn.style.borderColor = "";
            btn.style.color = "";
        }, 2000);
    }
}

function generateJSONUI() {
    let text = generateJSONString();
    jsonIo.value = text;
    copyToClipboard(text);
}

function generateJSONString() {
    // Collect board cells
    let outCells = [];
    for(let y=0; y<appState.gridY; y++){
        for(let x=0; x<appState.gridX; x++){
            let key = `${x},${y}`;
            if (appState.board_cells[key]) {
                outCells.push({ x, y, zone_id: appState.board_cells[key] });
            }
        }
    }

    // Map items (remove uid)
    let outItems = appState.items.map(i => {
        let o = {...i};
        delete o.uid;
        return o;
    });

    let jsonObj = {
        level_id: Date.now() % 10000,
        moves_limit: appState.moves_limit,
        missions: appState.missions,
        board_cells: outCells,
        items: outItems,
        spawn_zones: appState.spawn_zones
    };

    return JSON.stringify(jsonObj, null, 2);
}

function loadJSON() {
    try {
        let json = JSON.parse(jsonIo.value);
        
        appState.moves_limit = json.moves_limit || 25;
        appState.missions = json.missions || [];
        appState.spawn_zones = json.spawn_zones || [];
        
        appState.board_cells = {};
        let maxX = 0, maxY = 0;
        (json.board_cells || []).forEach(c => {
            appState.board_cells[`${c.x},${c.y}`] = c.zone_id;
            if(c.x > maxX) maxX = c.x;
            if(c.y > maxY) maxY = c.y;
        });
        
        appState.gridX = Math.max(2, maxX + 1);
        appState.gridY = Math.max(2, maxY + 1);
        
        appState.uidCounter = 1;
        appState.items = (json.items || []).map(i => ({...i, uid: appState.uidCounter++}));
        
        appState.selectedTool = appState.spawn_zones[0] ? appState.spawn_zones[0].id : null;
        appState.selectedItemUid = null;
        
        renderAll();
    } catch(e) {
        alert("Invalid JSON");
    }
}

// Firebase & Cloud Saves logic
let firebaseUser = null;

function setupAuthListeners() {
    onAuthStateChanged(auth, (user) => {
        firebaseUser = user;
        const loginBtn = document.getElementById('btn-login');
        const userInfo = document.getElementById('user-info');
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const loginHint = document.getElementById('login-hint');
        const publishBtn = document.getElementById('btn-publish');

        if (user) {
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            if (userAvatar) userAvatar.src = user.photoURL || '';
            if (userName) userName.textContent = user.displayName || 'Пользователь';
            if (loginHint) loginHint.style.display = 'none';
            if (publishBtn) publishBtn.style.display = 'block';
            loadSaves();
        } else {
            loginBtn.style.display = 'block';
            userInfo.style.display = 'none';
            if (loginHint) loginHint.style.display = 'block';
            if (publishBtn) publishBtn.style.display = 'none';
            document.getElementById('saves-carousel').innerHTML = `
                <div class="save-card create-new" id="btn-save-project">
                    <span class="plus-icon">+</span>
                    <h3 class="card-title">Сохранить<br>Проект</h3>
                </div>
            `;
        }
    });
}

function doLogin() {
    if(signInWithPopup) {
        signInWithPopup(auth, provider).catch(err => {
            console.error(err);
            if (err.code === 'auth/popup-blocked') {
                alert("Поп-ап заблокирован браузером. Пожалуйста, разрешите всплывающие окна для работы с Google.");
            } else if (err.code === 'auth/operation-not-allowed') {
                alert("Google вход не включен в консоли Firebase.");
            } else {
                alert("Ошибка входа: " + err.message);
            }
        });
    }
}
function doLogout() {
    if(signOut) signOut(auth).catch(err => {
        console.error(err);
        alert("Ошибка выхода.");
    });
}

async function saveCurrentProject() {
    if (!firebaseUser) {
        alert("Войдите, чтобы сохранять проекты!");
        return;
    }

    const snap = generateSnapshot();
    const now = Date.now();
    const projData = {
        userId: firebaseUser.uid,
        name: `Уровень ${new Date().toLocaleString()}`,
        createdAt: now,
        timestamp: now,
        image: snap,
        json: generateJSONString(),
        projectType: "swipe_merge_level"
    };

    try {
        const levelsCol = collection(db, `users/${firebaseUser.uid}/levels`);
        const docRef = doc(levelsCol);
        await setDoc(docRef, projData);
        appState.activeLevelId = docRef.id;
        alert("Проект успешно сохранен в облаке! ☁️");
        loadSaves(); 
    } catch (err) {
        console.error("Save error:", err);
        alert("Ошибка при сохранении.");
    }
}

function getBlockColors(level) {
    const palette = {
        1: { bg: ['#ffffff', '#f1f2f6'], text: '#4a2e15' },
        2: { bg: ['#fff200', '#feca57'], text: '#4a2e15' },
        3: { bg: ['#fab1a0', '#ff8d1e'], text: '#ffffff' },
        4: { bg: ['#ff7675', '#d63031'], text: '#ffffff' },
        5: { bg: ['#fda7df', '#f368e0'], text: '#ffffff' },
        6: { bg: ['#c56cf0', '#8c7ae6'], text: '#ffffff' },
        7: { bg: ['#f9ca24', '#f0932b'], text: '#4a2e15' },
        8: { bg: ['#ff9f43', '#ff6b6b'], text: '#ffffff' },
        9: { bg: ['#badc58', '#6ab04c'], text: '#ffffff' },
        10: { bg: ['#a29bfe', '#6c5ce7'], text: '#ffffff' },
        11: { bg: ['#ff0844', '#ffb199'], text: '#ffffff' }
    };
    return palette[level] || { bg: ['#333', '#000'], text: '#fff' };
}

function generateSnapshot() {
    const pSize = 40; // larger for better quality
    const margin = 10;
    const width = appState.gridX * pSize + margin * 2;
    const height = appState.gridY * pSize + margin * 2;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#141a21';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Slots (Background)
    for(let y=0; y<appState.gridY; y++) {
        for(let x=0; x<appState.gridX; x++) {
            const px = margin + x * pSize;
            const py = margin + y * pSize;
            const key = `${x},${y}`;
            
            // Draw slot
            ctx.fillStyle = '#1e252f';
            ctx.beginPath();
            ctx.roundRect(px + 2, py + 2, pSize - 4, pSize - 4, 8);
            ctx.fill();

            // Draw Zone highlight if present
            const zoneId = appState.board_cells[key];
            if (zoneId) {
                ctx.fillStyle = getZoneColor(zoneId);
                ctx.globalAlpha = 0.2;
                ctx.beginPath();
                ctx.roundRect(px + 2, py + 2, pSize - 4, pSize - 4, 8);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        }
    }

    // Draw Items
    appState.items.forEach(item => {
        const px = margin + item.x * pSize;
        const py = margin + item.y * pSize;
        const drawRect = (color, r) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(px + 4, py + 4, pSize - 8, pSize - 8, r || 8);
            ctx.fill();
        };

        if (item.type === 'block' || item.type === 'frozen_block') {
            const level = Math.log2(item.value);
            const colors = getBlockColors(level);
            
            // Gradient
            const grad = ctx.createLinearGradient(px, py, px, py + pSize);
            grad.addColorStop(0, colors.bg[0]);
            grad.addColorStop(1, colors.bg[1]);
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(px + 4, py + 4, pSize - 8, pSize - 8, 8);
            ctx.fill();

            // Text
            ctx.fillStyle = colors.text;
            ctx.font = `bold ${Math.floor(pSize * 0.4)}px Outfit, Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.value, px + pSize/2, py + pSize/2);

            if (item.type === 'frozen_block' && assetCache['ice']) {
                ctx.drawImage(assetCache['ice'], px - 2, py - 2, pSize + 4, pSize + 4);
            }
        } 
        else if (item.type === 'box' && assetCache['box']) {
            ctx.drawImage(assetCache['box'], px + 4, py + 4, pSize - 8, pSize - 8);
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.floor(pSize * 0.3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(`H:${item.hp}`, px + pSize/2, py + pSize * 0.85);
        }
        else if (item.type === 'stone' && assetCache['stone']) {
            ctx.drawImage(assetCache['stone'], px + 4, py + 4, pSize - 8, pSize - 8);
        }
        else if (item.type === 'wall' && assetCache['wall']) {
            ctx.drawImage(assetCache['wall'], px+1, py+1, pSize-2, pSize-2);
        }
        else {
            // Emojis
            const emojis = { 'key': '🔑', 'door': '🚪', 'mailbox': '📫', 'letter': '✉️' };
            const emoji = emojis[item.type] || '?';
            ctx.font = `${Math.floor(pSize * 0.7)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, px + pSize/2, py + pSize/2);
        }
    });

    return canvas.toDataURL("image/png");
}

async function loadSaves() {
    if (!firebaseUser || !db) return;
    const savesCarousel = document.getElementById('saves-carousel');
    if (!savesCarousel) return;

    try {
        // Remove old cards (keep Create New)
        const cards = savesCarousel.querySelectorAll('.save-card:not(.create-new)');
        cards.forEach(c => c.remove());

        const q = query(collection(db, `users/${firebaseUser.uid}/levels`));
        const querySnapshot = await getDocs(q);

        // Sort client-side: by createdAt desc, fallback to timestamp for old docs
        const sortedDocs = [];
        querySnapshot.forEach(d => sortedDocs.push(d));
        sortedDocs.sort((a, b) => {
            const aTime = a.data().createdAt || a.data().timestamp || 0;
            const bTime = b.data().createdAt || b.data().timestamp || 0;
            return bTime - aTime;
        });

        sortedDocs.forEach((docSnap) => {
            const data = docSnap.data();
            if(data.projectType !== "swipe_merge_level") return;

            const isActive = appState.activeLevelId === docSnap.id;
            const isPublished = !!data.publishedId;
            const card = document.createElement('div');
            card.className = `save-card ${isActive ? 'active' : ''} ${isPublished ? 'published' : ''}`;

            const publishBtnHtml = isPublished
                ? `<button class="unpublish-btn" onclick="event.stopPropagation(); window.unpublishFromCard('${docSnap.id}', '${data.publishedId}')" title="Снять публикацию">Снять 🌍</button>`
                : `<button class="publish-btn" onclick="event.stopPropagation(); window.publishFromCard('${docSnap.id}')" title="Опубликовать">Опубл. 🚀</button>`;

            card.innerHTML = `
                ${isPublished ? '<div class="published-badge">🌍 Опубликован</div>' : ''}
                <div class="card-header">${data.name || 'Level'}</div>
                <div class="card-preview">
                    <img src="${data.image}" alt="Level preview" />
                </div>
                <div class="save-controls">
                    <button class="primary" onclick="event.stopPropagation(); window.openJson('${btoa(encodeURIComponent(data.json))}', '${docSnap.id}')">Open</button>
                    <button class="secondary" onclick="event.stopPropagation(); window.overwriteSave('${docSnap.id}')">Save</button>
                    <button class="danger" onclick="event.stopPropagation(); window.delSave('${docSnap.id}')">Del</button>
                </div>
                <div class="save-controls">
                    ${publishBtnHtml}
                    <button class="copy-btn" title="Copy JSON" onclick="event.stopPropagation(); window.copySavedJson('${btoa(encodeURIComponent(data.json))}')">📋</button>
                </div>
            `;
            savesCarousel.appendChild(card);
        });
    } catch (err) {
        console.error("Load saves error", err);
    }
}

function clearSaves() {
    const savesCarousel = document.getElementById('saves-carousel');
    if (!savesCarousel) return;
    const cards = savesCarousel.querySelectorAll('.save-card:not(.create-new)');
    cards.forEach(c => c.remove());
}

window.openJson = function (b64json, id) {
    try {
        const decoded = decodeURIComponent(atob(b64json));
        jsonIo.value = decoded;
        
        if (id) {
            appState.activeLevelId = id;
        }

        let json = JSON.parse(decoded);
        appState.moves_limit = json.moves_limit || 25;
        appState.missions = json.missions || [];
        appState.spawn_zones = json.spawn_zones || [];
        
        appState.board_cells = {};
        let maxX = 0, maxY = 0;
        (json.board_cells || []).forEach(c => {
            appState.board_cells[`${c.x},${c.y}`] = c.zone_id;
            if(c.x > maxX) maxX = c.x;
            if(c.y > maxY) maxY = c.y;
        });
        
        appState.gridX = Math.max(2, maxX + 1);
        appState.gridY = Math.max(2, maxY + 1);
        
        appState.uidCounter = 1;
        appState.items = (json.items || []).map(i => ({...i, uid: appState.uidCounter++}));
        
        appState.selectedTool = appState.spawn_zones[0] ? appState.spawn_zones[0].id : null;
        appState.selectedItemUid = null;
        
        renderAll();
        loadSaves(); // refresh cards to update active highlight
    } catch (e) {
        console.error("Load JSON error", e);
        alert("Failed to parse or load JSON from cloud!");
    }
};

window.overwriteSave = async function (id) {
    if (!firebaseUser) return;

    appState.activeLevelId = id;
    const snap = generateSnapshot();
    const jsonStr = generateJSONString();
    const projData = {
        userId: firebaseUser.uid,
        timestamp: Date.now(),
        image: snap,
        json: jsonStr,
        projectType: "swipe_merge_level"
    };
    try {
        await setDoc(doc(db, `users/${firebaseUser.uid}/levels`, id), projData, { merge: true });

        // If this save is published, sync the published version too
        const q = query(collection(db, `users/${firebaseUser.uid}/levels`), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        let publishedId = null;
        querySnapshot.forEach((docSnap) => {
            if (docSnap.id === id) {
                publishedId = docSnap.data().publishedId || null;
            }
        });
        if (publishedId) {
            await setDoc(doc(db, "community_levels", publishedId), {
                timestamp: Date.now(),
                image: snap,
                json: jsonStr,
            }, { merge: true });
        }

        showSaveFeedback(id);
        loadSaves();
    } catch (e) {
        console.error(e);
        alert("Failed to overwrite. Check console.");
    }
};

window.delSave = async function (id) {
    if (!firebaseUser) return;
    if (!confirm("Удалить этот проект из облака навсегда?")) return;

    try {
        // Check if published, and delete publication too
        const q = query(collection(db, `users/${firebaseUser.uid}/levels`), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        let publishedId = null;
        querySnapshot.forEach((docSnap) => {
            if (docSnap.id === id) {
                publishedId = docSnap.data().publishedId || null;
            }
        });
        if (publishedId) {
            await deleteDoc(doc(db, "community_levels", publishedId));
        }

        await deleteDoc(doc(db, `users/${firebaseUser.uid}/levels`, id));
        if (appState.activeLevelId === id) appState.activeLevelId = null;
        alert("Проект удален.");
        loadSaves();
    } catch (e) {
        console.error("Delete error", e);
        alert("Ошибка при удалении.");
    }
};

// Publish: always tied to a save. Saves first if needed, then publishes.
async function publishLevel() {
    if (!firebaseUser) {
        alert("Войдите, чтобы публиковать!");
        return;
    }

    // Save first (to existing slot or create new)
    let saveId = appState.activeLevelId;
    const snap = generateSnapshot();
    const jsonStr = generateJSONString();

    try {
        const levelsCol = collection(db, `users/${firebaseUser.uid}/levels`);

        if (!saveId) {
            // Create new save
            const now = Date.now();
            const docRef = doc(levelsCol);
            saveId = docRef.id;
            await setDoc(docRef, {
                userId: firebaseUser.uid,
                name: `Уровень ${new Date().toLocaleString()}`,
                createdAt: now,
                timestamp: now,
                image: snap,
                json: jsonStr,
                projectType: "swipe_merge_level"
            });
            appState.activeLevelId = saveId;
        } else {
            // Overwrite existing save
            await setDoc(doc(db, `users/${firebaseUser.uid}/levels`, saveId), {
                timestamp: Date.now(),
                image: snap,
                json: jsonStr,
                projectType: "swipe_merge_level"
            }, { merge: true });
        }

        // Now publish (or update existing publication)
        await doPublish(saveId, snap, jsonStr);
        loadSaves();
    } catch (err) {
        console.error("Publish error:", err);
        alert("Ошибка публикации.");
    }
}

async function doPublish(saveId, snap, jsonStr) {
    // Read the save to check if it already has a publishedId
    const savesCarousel = document.getElementById('saves-carousel');
    const saveDocRef = doc(db, `users/${firebaseUser.uid}/levels`, saveId);

    // Get existing publishedId from save data if available
    let publishedId = null;
    const q = query(collection(db, `users/${firebaseUser.uid}/levels`), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnap) => {
        if (docSnap.id === saveId) {
            publishedId = docSnap.data().publishedId || null;
        }
    });

    const levelName = prompt("Введите название уровня для публикации:", `Уровень ${Math.floor(Math.random() * 1000)}`) || "Безымянный уровень";

    const pubData = {
        authorId: firebaseUser.uid,
        authorName: firebaseUser.displayName || "Аноним",
        authorAvatar: firebaseUser.photoURL || "",
        name: levelName,
        timestamp: Date.now(),
        image: snap,
        json: jsonStr,
        likes: 0
    };

    if (publishedId) {
        // Update existing publication
        await setDoc(doc(db, "community_levels", publishedId), pubData, { merge: true });
    } else {
        // Create new publication
        const pubDocRef = doc(collection(db, "community_levels"));
        publishedId = pubDocRef.id;
        await setDoc(pubDocRef, pubData);
    }

    // Store publishedId back to the save
    await setDoc(saveDocRef, { publishedId }, { merge: true });

    alert("Уровень опубликован и доступен в «Уровни Сообщества»! 🚀");
}

window.publishFromCard = async function (saveId) {
    if (!firebaseUser) return;
    try {
        const snap = generateSnapshot();
        const jsonStr = generateJSONString();

        // Update the save data first
        await setDoc(doc(db, `users/${firebaseUser.uid}/levels`, saveId), {
            timestamp: Date.now(),
            image: snap,
            json: jsonStr,
        }, { merge: true });

        await doPublish(saveId, snap, jsonStr);
        loadSaves();
    } catch (err) {
        console.error("Publish from card error:", err);
        alert("Ошибка публикации.");
    }
};

window.unpublishFromCard = async function (saveId, publishedId) {
    if (!firebaseUser) return;
    if (!confirm("Снять уровень с публикации? Он исчезнет из списка сообщества.")) return;

    try {
        // Delete from community_levels
        await deleteDoc(doc(db, "community_levels", publishedId));
        // Remove publishedId from save
        await setDoc(doc(db, `users/${firebaseUser.uid}/levels`, saveId), { publishedId: null }, { merge: true });
        alert("Публикация отменена.");
        loadSaves();
    } catch (err) {
        console.error("Unpublish error:", err);
        alert("Ошибка при отмене публикации.");
    }
};

window.copySavedJson = function (b64json) {
    try {
        const decoded = decodeURIComponent(atob(b64json));
        copyToClipboard(decoded);
    } catch (e) {
        console.error("Copy JSON error", e);
    }
};

// Cleanup utility: remove old published levels that aren't linked to any save
window.cleanupOldPublished = async function () {
    if (!firebaseUser || !db) {
        console.log("Сначала войдите в аккаунт.");
        return;
    }

    try {
        // 1. Get all user's saves and collect their publishedIds
        const savesQ = query(collection(db, `users/${firebaseUser.uid}/levels`));
        const savesSnap = await getDocs(savesQ);
        const linkedIds = new Set();
        savesSnap.forEach(d => {
            const pid = d.data().publishedId;
            if (pid) linkedIds.add(pid);
        });

        // 2. Get all community_levels by this user
        const pubQ = query(collection(db, "community_levels"), where("authorId", "==", firebaseUser.uid));
        const pubSnap = await getDocs(pubQ);

        const orphaned = [];
        pubSnap.forEach(d => {
            if (!linkedIds.has(d.id)) {
                orphaned.push({ id: d.id, name: d.data().name });
            }
        });

        if (orphaned.length === 0) {
            console.log("Нет старых публикаций для удаления.");
            return;
        }

        console.log(`Найдено ${orphaned.length} старых публикаций:`);
        orphaned.forEach((o, i) => console.log(`  ${i + 1}. "${o.name}" (${o.id})`));

        if (!confirm(`Удалить ${orphaned.length} старых публикаций, не привязанных к сохранениям?\n\n${orphaned.map(o => o.name).join('\n')}`)) {
            return;
        }

        for (const o of orphaned) {
            await deleteDoc(doc(db, "community_levels", o.id));
            console.log(`  Удалено: "${o.name}"`);
        }
        console.log("Готово! Все старые публикации удалены.");
    } catch (err) {
        console.error("Cleanup error:", err);
    }
};

// Run
initEditor();
