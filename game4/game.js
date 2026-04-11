const initialJSON = {
  "level_id": 1,
  "moves_limit": 50,
  "missions": [
    { "type": "collect_block", "target_value": 32, "amount": 2 },
    { "type": "destroy_box", "amount": 5 },
    { "type": "open_door", "amount": 1 }
  ],
  "board_cells": [
    {"x": 0, "y": 0, "zone_id": "zone_1"}, {"x": 1, "y": 0, "zone_id": "zone_1"}, {"x": 2, "y": 0, "zone_id": "zone_1"}, {"x": 3, "y": 0, "zone_id": "zone_1"},
    {"x": 0, "y": 1, "zone_id": "zone_1"}, {"x": 1, "y": 1, "zone_id": "zone_1"}, {"x": 2, "y": 1, "zone_id": "zone_1"}, {"x": 3, "y": 1, "zone_id": "zone_1"},
    {"x": 0, "y": 2, "zone_id": "zone_2"}, {"x": 1, "y": 2, "zone_id": "zone_2"}, {"x": 2, "y": 2, "zone_id": "zone_2"}, {"x": 3, "y": 2, "zone_id": "zone_2"},
    {"x": 0, "y": 3, "zone_id": "zone_2"}, {"x": 1, "y": 3, "zone_id": "zone_2"}, {"x": 2, "y": 3, "zone_id": "zone_2"}, {"x": 3, "y": 3, "zone_id": "zone_2"}
  ],
  "items": [
    { "type": "block", "x": 0, "y": 0, "value": 2 },
    { "type": "block", "x": 0, "y": 2, "value": 2 },
    { "type": "box", "x": 1, "y": 0, "hp": 2 },
    { "type": "box", "x": 1, "y": 3, "hp": 1 },
    { "type": "frozen_block", "x": 2, "y": 1, "value": 8 },
    { "type": "stone", "x": 1, "y": 1, "activates_zone": "zone_2" },
    { "type": "key", "x": 0, "y": 1 },
    { "type": "door", "x": 2, "y": 0, "activates_zone": "zone_2" }
  ],
  "spawn_zones": [
    { "id": "zone_1", "active": true, "base_value": 2 },
    { "id": "zone_2", "active": false, "base_value": 8 }
  ]
};

const sfxMove = new Audio('Когда перебираются персонажи противники.wav');
sfxMove.volume = 0.15;
const sfxMerge = new Audio('553430__kablazik_samples__kb_poppop_0.wav');
sfxMerge.volume = 0.2;
const sfxCollect = new Audio('537061__imafoley__message-pop-sound.wav');
sfxCollect.volume = 0.25;

const CELL_SIZE = 70;
const ITEM_SIZE = 66;
const CELL_GAP = 8;
const STEP = CELL_SIZE + CELL_GAP;
const ITEM_OFFSET = (STEP - ITEM_SIZE) / 2;

let currentLevelIndex = parseInt(localStorage.getItem('swipe_merge_current_level')) || 1;
let currentLevel = null;
let items = [];
let boardCells = new Set();
let missionState = [];
let movesLeft = 0;
let isAnimating = false;
let uidCounter = 0;

let inputQueue = [];
let animSpeed = 5.0; // Slowed down exactly 5x as requested

// DOM Elements
const boardGridEl = document.getElementById('board-background');
const boardItemsEl = document.getElementById('board-items');
const boardContainer = document.getElementById('board-container');
const movesCountEl = document.getElementById('moves-count');
const missionsPanelEl = document.getElementById('missions-panel');
const overlayEl = document.getElementById('game-over-overlay');
const overlayTitle = document.getElementById('game-over-title');
const retryBtn = document.getElementById('retry-btn');
const nextLevelBtn = document.getElementById('next-level-btn');
const levelJsonInput = document.getElementById('level-json-input');
const loadJsonBtn = document.getElementById('load-json-btn');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialOkBtn = document.getElementById('tutorial-ok-btn');
const skipLevelBtn = document.getElementById('skip-level-btn');
const restartLevelBtn = document.getElementById('restart-level-btn');
const tutorialTitle = document.getElementById('tutorial-title');
const tutorialText = document.getElementById('tutorial-text');
const tutorialIcon = document.getElementById('tutorial-icon');
const resetProgressBtn = document.getElementById('reset-progress-btn');
const editorLinkBtn = document.getElementById('editor-link-btn');

const TUTORIALS = {
    'stone': {
        icon: '🪨',
        title: 'Тяжёлый Камень',
        text: 'Этот камень мешает проходу! Но он не вечен: просто соверши слияние (Merge) в соседней клетке, и он рассыплется в прах.'
    },
    'box': {
        icon: '📦',
        title: 'Хрупкий Ящик',
        text: 'Дерево не выдержит энергии слияния! Объединяй блоки рядом с ящиком, чтобы сломать его. Некоторые ящики крепче других и требуют нескольких ударов!'
    },
    'frozen_block': {
        icon: '❄️',
        title: 'Ледяной Плен',
        text: 'Блок вмёрз в плотный лёд и не двигается. Чтобы растопить его, ударь по нему другим блоком точно такого же номинала. Лёд треснет!'
    },
    'key': {
        icon: '🔑🚪',
        title: 'Запертые Секреты',
        text: 'Видишь запертую дверь? Чтобы пройти дальше, тебе нужно доставить Ключ прямо к ней. Ударь ключом по двери, и путь будет открыт!'
    },
    'letter': {
        icon: '✉️📬',
        title: 'Срочная Почта',
        text: 'Письмо должно дойти до адресата! Просто довези его до Почтового Ящика. Это кажется простым, пока на доске не станет слишком тесно!'
    }
};

let tutorialQueue = [];

async function loadLevelFile(index) {
    try {
        const response = await fetch(`levels/level${index}.json`);
        if (!response.ok) {
            if (index === 1) {
                levelJsonInput.value = JSON.stringify(initialJSON, null, 2);
                loadLevel(initialJSON);
                return;
            }
            currentLevelIndex = 1;
            return loadLevelFile(1);
        }
        const levelData = await response.json();
        levelJsonInput.value = JSON.stringify(levelData, null, 2);
        loadLevel(levelData);
        let indEl = document.getElementById('level-indicator');
        if (indEl) indEl.textContent = currentLevelIndex;
    } catch (e) {
        if (index === 1) {
            levelJsonInput.value = JSON.stringify(initialJSON, null, 2);
            loadLevel(initialJSON);
            return;
        }
        currentLevelIndex = 1;
        loadLevelFile(1);
    }
}

function initGame() {
    loadLevelFile(currentLevelIndex);

    // Prevent scrolling entirely on game area
    document.addEventListener('touchmove', e => {
        if (!e.target.closest('#dev-tools')) {
            e.preventDefault();
        }
    }, {passive: false});

    window.addEventListener('keydown', handleKey, {passive: false});
    
    // Global swipe attached to document
    let startX = null, startY = null;
    function inputStart(e) {
        if (e.target.closest('#dev-tools')) return; 
        if (e.type === 'touchstart') {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }
    }
    
    function inputEnd(e) {
        if (startX === null || startY === null) return;
        let endX, endY;
        if (e.type === 'touchend' || e.type === 'touchcancel') {
            endX = e.changedTouches[0].clientX;
            endY = e.changedTouches[0].clientY;
        } else {
            endX = e.clientX;
            endY = e.clientY;
        }
        
        let dx = endX - startX;
        let dy = endY - startY;
        
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
            queueInput(dx > 0 ? 1 : -1, 0);
        } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 30) {
            queueInput(0, dy > 0 ? 1 : -1);
        }
        startX = null; startY = null;
    }

    document.addEventListener('mousedown', inputStart);
    document.addEventListener('mouseup', inputEnd);
    document.addEventListener('touchstart', inputStart, {passive: false});
    document.addEventListener('touchend', inputEnd);

    retryBtn.addEventListener('click', () => {
        loadLevel(JSON.parse(levelJsonInput.value));
    });
    
    if (nextLevelBtn) {
        nextLevelBtn.addEventListener('click', () => {
            currentLevelIndex++;
            localStorage.setItem('swipe_merge_current_level', currentLevelIndex);
            loadLevelFile(currentLevelIndex);
        });
    }

    loadJsonBtn.addEventListener('click', () => {
        try {
            let json = JSON.parse(levelJsonInput.value);
            loadLevel(json);
        } catch(e) {
            alert('Invalid JSON! Check syntax.');
        }
    });

    tutorialOkBtn.addEventListener('click', () => {
        if (tutorialQueue.length > 0) {
            const seenKey = tutorialQueue.shift();
            localStorage.setItem(`tutorial_seen_${seenKey}`, 'true');
        }
        
        if (tutorialQueue.length > 0) {
            displayTutorial(tutorialQueue[0]);
        } else {
            tutorialOverlay.classList.add('hidden');
        }
    });

    skipLevelBtn.addEventListener('click', () => {
        currentLevelIndex++;
        localStorage.setItem('swipe_merge_current_level', currentLevelIndex);
        loadLevelFile(currentLevelIndex);
    });

    restartLevelBtn.addEventListener('click', () => {
        loadLevel(JSON.parse(levelJsonInput.value));
    });

    resetProgressBtn.addEventListener('click', () => {
        if (confirm("Сбросить весь прогресс?")) {
            currentLevelIndex = 1;
            localStorage.setItem('swipe_merge_current_level', 1);
            loadLevelFile(1);
        }
    });

    editorLinkBtn.addEventListener('click', () => {
        window.open('editor.html', '_blank');
    });

    window.addEventListener('resize', fitBoard);
}

function loadLevel(levelObj) {
    currentLevel = levelObj;
    boardCells.clear();
    let maxCol = 0, maxRow = 0;
    currentLevel.board_cells.forEach(c => {
        boardCells.add(`${c.x},${c.y}`);
        if(c.x > maxCol) maxCol = c.x;
        if(c.y > maxRow) maxRow = c.y;
    });

    boardContainer.dataset.owWidth = `${(maxCol + 1) * STEP}`;
    boardContainer.dataset.owHeight = `${(maxRow + 1) * STEP}`;
    boardContainer.style.width = boardContainer.dataset.owWidth + 'px';
    boardContainer.style.height = boardContainer.dataset.owHeight + 'px';

    uidCounter = 0;
    items = currentLevel.items.map(i => ({...i, uid: uidCounter++}));
    missionState = currentLevel.missions.map(m => ({...m, progress: 0}));
    movesLeft = currentLevel.moves_limit;
    isAnimating = false;
    inputQueue = [];
    animSpeed = 1.0;
    document.documentElement.style.setProperty('--anim-speed', animSpeed);

    currentLevel.spawn_zones = JSON.parse(JSON.stringify(currentLevel.spawn_zones));

    renderBoardGrid();
    boardItemsEl.innerHTML = '';
    items.forEach(i => i.element = null);
    
    updateUI();
    renderItems();
    overlayEl.classList.add('hidden');
    fitBoard();
    checkTutorials(levelObj);
}

function checkTutorials(levelObj) {
    tutorialQueue = [];
    
    // Check for each tutorial type
    if (levelObj.items.some(i => i.type === 'stone') && !localStorage.getItem('tutorial_seen_stone')) {
        tutorialQueue.push('stone');
    }
    if (levelObj.items.some(i => i.type === 'box') && !localStorage.getItem('tutorial_seen_box')) {
        tutorialQueue.push('box');
    }
    if (levelObj.items.some(i => i.type === 'frozen_block') && !localStorage.getItem('tutorial_seen_frozen_block')) {
        tutorialQueue.push('frozen_block');
    }
    if ((levelObj.items.some(i => i.type === 'key') || levelObj.items.some(i => i.type === 'door')) && !localStorage.getItem('tutorial_seen_key')) {
        tutorialQueue.push('key');
    }
    if ((levelObj.items.some(i => i.type === 'letter') || levelObj.items.some(i => i.type === 'mailbox')) && !localStorage.getItem('tutorial_seen_letter')) {
        tutorialQueue.push('letter');
    }

    if (tutorialQueue.length > 0) {
        displayTutorial(tutorialQueue[0]);
    }
}

function displayTutorial(key) {
    const data = TUTORIALS[key];
    if (!data) return;

    tutorialIcon.textContent = data.icon;
    tutorialTitle.textContent = data.title;
    tutorialText.textContent = data.text;
    tutorialOverlay.classList.remove('hidden');
}

function fitBoard() {
    let ow = parseFloat(boardContainer.dataset.owWidth);
    let oh = parseFloat(boardContainer.dataset.owHeight);
    if (!ow || !oh) return;

    let scaler = document.getElementById('board-scaler');
    let maxWid = scaler.clientWidth - 20; 
    let maxHei = scaler.clientHeight - 20; 
    
    let scWid = maxWid / ow;
    let scHei = maxHei / oh;
    let scale = Math.min(1, scWid, scHei);
    
    boardContainer.style.transform = `scale(${scale})`;
}

function queueInput(dx, dy) {
    if (movesLeft <= 0 || checkWin() || overlayEl.classList.contains('hidden') === false) return;
    
    if (isAnimating) {
        if (inputQueue.length < 3) inputQueue.push({dx, dy});
    } else {
        handleSwipe(dx, dy);
    }
}

function validCell(x, y) { return boardCells.has(`${x},${y}`); }
function isMovable(type) { return ['block', 'key', 'letter'].includes(type); }

function buildGrid() {
    let grid = {};
    for (let i of items) {
        if (i.toBeDestroyed) continue;
        if (!grid[i.y]) grid[i.y] = {};
        grid[i.y][i.x] = i;
    }
    return grid;
}

function handleKey(e) {
    if (e.target.closest('#dev-tools')) return;

    let dx = 0, dy = 0;
    if (['ArrowUp', 'w', 'W'].includes(e.key)) dy = -1;
    else if (['ArrowDown', 's', 'S'].includes(e.key)) dy = 1;
    else if (['ArrowLeft', 'a', 'A'].includes(e.key)) dx = -1;
    else if (['ArrowRight', 'd', 'D'].includes(e.key)) dx = 1;
    
    if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        queueInput(dx, dy);
    }
}

function handleSwipe(dx, dy, fromQueue = false) {
    if (movesLeft <= 0) return;

    // Dynamic Speed: if there are pending inputs, speed up by 3x
    animSpeed = inputQueue.length > 0 ? 0.33 : 1.0;
    document.documentElement.style.setProperty('--anim-speed', animSpeed);

    // Clean up any running animations from previous turn
    items.forEach(i => {
        if (i._popTimer) {
            clearTimeout(i._popTimer);
            i._popTimer = null;
        }
        i._popAnimating = false;
        if (i.element) {
            i.element.style.transition = 'none';
            i.element.style.transform = `translate(${i.x * STEP + ITEM_OFFSET}px, ${i.y * STEP + ITEM_OFFSET}px)`;
            i.element.style.opacity = '';
            i.element.style.filter = '';
            i.element.style.boxShadow = '';
            i.element.style.zIndex = '';
        }
    });
    void boardItemsEl.offsetWidth; // Force reflow to apply instant reset

    // Save original positions before simulation
    let origPos = {};
    items.forEach(i => { origPos[i.uid] = { x: i.x, y: i.y }; });

    let { moved, merges } = simulateMove(dx, dy);
    if (!moved && merges.length === 0) {
        if (fromQueue) setTimeout(flushInputQueue, 0);
        return;
    }

    sfxMove.currentTime = 0;
    sfxMove.play().catch(e => {});

    isAnimating = true;

    // Constant speed: duration proportional to distance traveled
    const MS_PER_CELL = 80 * animSpeed;
    let maxDuration = 0;

    items.forEach(item => {
        let orig = origPos[item.uid];
        if (!orig || !item.element) return;
        let dist = Math.abs(item.x - orig.x) + Math.abs(item.y - orig.y);
        if (dist > 0) {
            let dur = dist * MS_PER_CELL;
            if (dur > maxDuration) maxDuration = dur;
            item.element.style.transition = `transform ${dur}ms linear`;
            // Absorbed blocks render behind the surviving block
            if (item.mergeDestroyed) {
                item.element.style.zIndex = '5';
            }
        }
    });

    renderPositions();

    let waitTime = maxDuration + 30;
    let popTime = 350 * animSpeed;

    setTimeout(() => {
        // Reset inline transitions so CSS defaults apply for post-effects
        items.forEach(i => {
            if (i.element) {
                i.element.style.transition = '';
                i.element.style.zIndex = '';
            }
        });

        applyPostMoveEffects(merges);
        updateVisualLevels();
        collectMissionBlocks();
        removeDestroyedDOM();

        if (merges.length > 0) {
            sfxMerge.currentTime = 0;
            sfxMerge.play().catch(e => {});
        }

        // JS-driven merge-pop: scale up with glow, then back
        items.forEach(i => {
             if (i.merged && i.element && !i.toBeDestroyed) {
                 let x = i.x * STEP + ITEM_OFFSET, y = i.y * STEP + ITEM_OFFSET;
                 i.element.className = `item type-${i.type}`;
                 if (i.type === 'block' || i.type === 'frozen_block') {
                     i.element.textContent = i.value;
                     i.element.setAttribute('data-level', Math.log2(i.value));
                 }
                 i.element.style.transition = `transform calc(0.15s * var(--anim-speed)) cubic-bezier(0.175, 0.885, 0.32, 1.275), filter calc(0.15s * var(--anim-speed)), box-shadow calc(0.15s * var(--anim-speed))`;
                 i.element.style.transform = `translate(${x}px, ${y}px) scale(1.25)`;
                 i.element.style.filter = 'brightness(1.6)';
                 i.element.style.boxShadow = '0 0 30px rgba(255,255,255,0.9)';
                 i.element.style.zIndex = '20';

                 setTimeout(() => {
                     if (!i.element) return;
                     i.element.style.transition = `transform calc(0.15s * var(--anim-speed)) ease-out, filter calc(0.15s * var(--anim-speed)), box-shadow calc(0.15s * var(--anim-speed))`;
                     i.element.style.transform = `translate(${x}px, ${y}px)`;
                     i.element.style.filter = '';
                     i.element.style.boxShadow = '';
                     i.element.style.zIndex = '';
                 }, 150 * animSpeed);
             }
        });

        setTimeout(() => {
            items = items.filter(i => !i.toBeDestroyed);
            items.forEach(i => { i.merged = false; });

            spawnNewBlocks();
            renderItems();

            movesLeft--;
            updateUI();

            if (checkWin()) {
                showGameOver(true);
                inputQueue = [];
            } else if (movesLeft <= 0 || checkDeadlock()) {
                showGameOver(false);
                inputQueue = [];
            } else {
                isAnimating = false;
                flushInputQueue();
            }
        }, popTime);
    }, waitTime);
}

function flushInputQueue() {
    if (inputQueue.length > 0 && !isAnimating && movesLeft > 0 && !checkWin() && overlayEl.classList.contains('hidden')) {
        let dir = inputQueue.shift();
        handleSwipe(dir.dx, dir.dy, true);
    }
}

function simulateMove(dx, dy) {
    let turnMoved = false;
    let mergesThisTurn = [];
    let grid = buildGrid();
    
    let movables = items.filter(i => isMovable(i.type));
    movables.sort((a,b) => dx !== 0 ? (b.x - a.x) * dx : (b.y - a.y) * dy);
    
    for (let item of movables) {
        if (item.toBeDestroyed) continue;
        
        let cx = item.x;
        let cy = item.y;
        let interacted = false;
        
        while (true) {
            let nx = cx + dx;
            let ny = cy + dy;
            if (!validCell(nx, ny)) break;
            
            let nextItem = grid[ny] ? grid[ny][nx] : null;
            if (nextItem) {
                if (item.type === 'block' && nextItem.type === 'block' && item.value === nextItem.value && !item.merged && !nextItem.merged) {
                    nextItem.nextValue = item.value * 2;
                    nextItem.merged = true;
                    item.toBeDestroyed = true;
                    item.mergeDestroyed = true;
                    grid[item.y][item.x] = null;
                    item.x = nx; item.y = ny;
                    mergesThisTurn.push({x: nx, y: ny});
                    turnMoved = true;
                    interacted = true;
                } else if (item.type === 'key' && nextItem.type === 'door') {
                    item.toBeDestroyed = true;
                    nextItem.toBeDestroyed = true;
                    nextItem.flyToMission = 'open_door';
                    grid[item.y][item.x] = null;
                    grid[ny][nx] = null;
                    item.x = nx; item.y = ny; 
                    trackMission('open_door');
                    if (nextItem.activates_zone) {
                        activateZone(nextItem.activates_zone);
                    }
                    turnMoved = true;
                    interacted = true;

                } else if (item.type === 'letter' && nextItem.type === 'mailbox') {
                    item.toBeDestroyed = true;
                    item.flyToMission = 'collect_letter';
                    grid[item.y][item.x] = null;
                    item.x = nx; item.y = ny; 
                    trackMission('collect_letter');
                    turnMoved = true;
                    interacted = true;
                } else if (item.type === 'block' && nextItem.type === 'frozen_block' && item.value === nextItem.value) {
                    // Defrost: flying block stops adjacent, frozen block becomes regular
                    // Neither merges this turn (per GDD)
                    nextItem.type = 'block';
                    nextItem.merged = true;
                    item.merged = true;
                    turnMoved = true;
                    if (nextItem.activates_zone) {
                        activateZone(nextItem.activates_zone);
                    }
                }
                break;
            } else {
                cx = nx; cy = ny;
            }
        }
        
        if (!interacted && !item.toBeDestroyed && (cx !== item.x || cy !== item.y)) {
            grid[item.y][item.x] = null;
            item.x = cx; item.y = cy;
            if (!grid[cy]) grid[cy] = {};
            grid[cy][cx] = item;
            turnMoved = true;
        }
    }
    
    return { moved: turnMoved, merges: mergesThisTurn };
}

function applyPostMoveEffects(mergesThisTurn) {
    let grid = buildGrid();
    mergesThisTurn.forEach(m => {
        let adjs = [ {x: m.x+1, y: m.y}, {x: m.x-1, y: m.y}, {x: m.x, y: m.y+1}, {x: m.x, y: m.y-1} ];
        adjs.forEach(pos => {
            let adj = grid[pos.y] ? grid[pos.y][pos.x] : null;
            if (adj && adj.type === 'box') {
                adj.hp -= 1;
                if(adj.element) adj.element.setAttribute('data-hp', adj.hp);
                if (adj.hp <= 0) {
                    adj.toBeDestroyed = true;
                    adj.flyToMission = 'destroy_box';
                    grid[pos.y][pos.x] = null;
                    trackMission('destroy_box');
                    if (adj.activates_zone) {
                        activateZone(adj.activates_zone);
                    }
                }
            } else if (adj && adj.type === 'stone') {
                adj.toBeDestroyed = true;
                adj.destroyedByMerge = true;
                adj.flyToMission = 'destroy_stone'; // Set mission fly target
                grid[pos.y][pos.x] = null;
                trackMission('destroy_stone'); // Increment mission progress
                if (adj.activates_zone) {
                    activateZone(adj.activates_zone);
                }
            }
        });
    });
}

function trackMission(type, params={}) {
    missionState.forEach(m => {
        if (m.type === type) {
            if (type === 'collect_block' && m.target_value === params.value) m.progress++;
            else if (type !== 'collect_block') m.progress++;
        }
    });
}

function collectMissionBlocks() {
    let collectMissions = missionState.filter(m => m.type === 'collect_block' && m.progress < m.amount);
    collectMissions.forEach(m => {
        let blocks = items.filter(i => i.type === 'block' && i.value === m.target_value && !i.toBeDestroyed);
        blocks.forEach(b => {
             b.toBeDestroyed = true;
             b.flyToMission = 'collect_block';
             b.missionParams = { value: b.value };
             trackMission('collect_block', {value: b.value});
        });
    });
}

function activateZone(zoneId) {
    let z = currentLevel.spawn_zones.find(zone => zone.id === zoneId);
    if (z) z.active = true;
}

function spawnNewBlocks() {
    let actZones = currentLevel.spawn_zones.filter(z => z.active);
    let activeZoneIds = new Set(actZones.map(z => z.id));
    
    let grid = buildGrid();
    let empty = [];
    
    currentLevel.board_cells.forEach(c => {
        if (c.zone_id && activeZoneIds.has(c.zone_id)) {
            if (!(grid[c.y] && grid[c.y][c.x])) {
                let z = actZones.find(zone => zone.id === c.zone_id);
                empty.push({ zone: z, x: c.x, y: c.y });
            }
        }
    });

    if (empty.length > 0) {
        let choice = empty[Math.floor(Math.random() * empty.length)];
        let val = Math.random() < 0.9 ? choice.zone.base_value : choice.zone.base_value * 2;
        let nb = { uid: uidCounter++, type: 'block', x: choice.x, y: choice.y, value: val, isNew: true };
        items.push(nb);
        return nb;
    }
    return null;
}

function checkWin() {
    return missionState.every(m => m.progress >= m.amount);
}

function checkDeadlock() {
    let actZones = currentLevel.spawn_zones.filter(z => z.active);
    let activeZoneIds = new Set(actZones.map(z => z.id));
    
    let grid = buildGrid();
    let hasEmpty = false;
    
    for (let c of currentLevel.board_cells) {
        if (c.zone_id && activeZoneIds.has(c.zone_id)) {
            if (!(grid[c.y] && grid[c.y][c.x])) {
                hasEmpty = true; 
                break;
            }
        }
    }
    
    if (hasEmpty) return false;

    const dirs = [ {x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0} ];
    for (let d of dirs) {
        if (checkSlidePossible(d.x, d.y)) return false; 
    }
    return true; 
}

function checkSlidePossible(dx, dy) {
    let grid = buildGrid();
    let movables = items.filter(i => isMovable(i.type));
    for (let item of movables) {
        let nx = item.x + dx;
        let ny = item.y + dy;
        if (validCell(nx, ny)) {
            let nextItem = grid[ny] ? grid[ny][nx] : null;
            if (!nextItem) return true;
            if (item.type === 'block' && nextItem.type === 'block' && item.value === nextItem.value) return true;
            if (item.type === 'block' && nextItem.type === 'frozen_block' && item.value === nextItem.value) return true;
            if (item.type === 'key' && nextItem.type === 'door') return true;

            if (item.type === 'letter' && nextItem.type === 'mailbox') return true;
        }
    }
    return false;
}

function showGameOver(isWin) {
    overlayTitle.textContent = isWin ? "УРОВЕНЬ ПРОЙДЕН!" : "УРОВЕНЬ ПРОВАЛЕН";
    overlayTitle.style.color = isWin ? "#4cd137" : "#e84118";
    if (nextLevelBtn) {
        nextLevelBtn.style.display = isWin ? 'inline-block' : 'none';
        if (isWin) {
            localStorage.setItem('swipe_merge_current_level', currentLevelIndex + 1);
        }
    }
    overlayEl.classList.remove('hidden');
    isAnimating = false;
}

function renderBoardGrid() {
    boardGridEl.innerHTML = '';
    const lookup = new Set(currentLevel.board_cells.map(c => `${c.x},${c.y}`));
    
    currentLevel.board_cells.forEach(c => {
        let el = document.createElement('div');
        el.className = 'grid-cell';
        
        // Neighbor checks for rounding
        if (!lookup.has(`${c.x-1},${c.y}`) && !lookup.has(`${c.x},${c.y-1}`)) el.classList.add('is-tl');
        if (!lookup.has(`${c.x+1},${c.y}`) && !lookup.has(`${c.x},${c.y-1}`)) el.classList.add('is-tr');
        if (!lookup.has(`${c.x-1},${c.y}`) && !lookup.has(`${c.x},${c.y+1}`)) el.classList.add('is-bl');
        if (!lookup.has(`${c.x+1},${c.y}`) && !lookup.has(`${c.x},${c.y+1}`)) el.classList.add('is-br');
        
        el.style.transform = `translate(${c.x * STEP}px, ${c.y * STEP}px)`;
        boardGridEl.appendChild(el);
    });
}

function renderItems() {
    items.forEach(item => {
        if (!item.element) {
            let el = document.createElement('div');
            el.className = `item type-${item.type}`;
            let x = item.x * STEP + ITEM_OFFSET, y = item.y * STEP + ITEM_OFFSET;

            item.element = el;

            if (item.isNew) {
                // Pop-in: start at scale(0), then animate to scale(1)
                // Using synchronous reflow trick instead of rAF to avoid race conditions
                el.style.transform = `translate(${x}px, ${y}px) scale(0)`;
                el.style.opacity = '0';
                boardItemsEl.appendChild(el);

                void el.offsetWidth; // Force browser to commit initial state

                el.style.transition = `transform calc(0.3s * var(--anim-speed)) cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity calc(0.3s * var(--anim-speed))`;
                el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
                el.style.opacity = '1';

                item._popAnimating = true;
                item._popTimer = setTimeout(() => {
                    item._popAnimating = false;
                    item._popTimer = null;
                    el.style.transition = '';
                    el.style.transform = `translate(${x}px, ${y}px)`;
                    el.style.opacity = '';
                }, 350 * animSpeed);
                item.isNew = false;
            } else {
                el.style.transform = `translate(${x}px, ${y}px)`;
                boardItemsEl.appendChild(el);
            }
        }

        let el = item.element;
        el.className = `item type-${item.type}`;

        if (item.type === 'block' || item.type === 'frozen_block') {
            el.textContent = item.value;
            let p2 = Math.log2(item.value);
            el.setAttribute('data-level', p2);
        } else {
            el.textContent = "";
        }

        if (item.type === 'box') el.setAttribute('data-hp', item.hp);
    });

    renderPositions();
}

function renderPositions() {
    items.forEach(item => {
        let el = item.element;
        if (!el || item._popAnimating) return;
        el.style.transform = `translate(${item.x * STEP + ITEM_OFFSET}px, ${item.y * STEP + ITEM_OFFSET}px)`;
    });
}

function updateVisualLevels() {
    items.forEach(item => {
        if (item.nextValue) {
            item.value = item.nextValue;
            delete item.nextValue;
        }
        let el = item.element;
        if (!el) return;
        if (item.type === 'block' || item.type === 'frozen_block') {
            el.textContent = item.value;
            el.setAttribute('data-level', Math.log2(item.value));
        }
    });
}

function findMissionUI(type, targetValue) {
    let uis = document.querySelectorAll('.mission-item');
    for (let i = 0; i < uis.length; i++) {
        if (uis[i].dataset.missionType === type) {
            if (type === 'collect_block') {
                if (parseInt(uis[i].dataset.target) === targetValue) return uis[i];
            } else {
                return uis[i];
            }
        }
    }
    return null;
}

function flyToUI(el, targetUI, cb) {
    let clone = el.cloneNode(true);
    let startRect = el.getBoundingClientRect();
    let endRect = targetUI.getBoundingClientRect();
    
    clone.style.position = 'fixed';
    clone.style.left = startRect.left + 'px';
    clone.style.top = startRect.top + 'px';
    clone.style.width = startRect.width + 'px';
    clone.style.height = startRect.height + 'px';
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.zIndex = '9999';
    clone.style.transition = `left calc(0.4s * var(--anim-speed)) linear, top calc(0.4s * var(--anim-speed)) cubic-bezier(0.5, -0.5, 0.8, 1), transform calc(0.4s * var(--anim-speed)) ease-in, opacity calc(0.4s * var(--anim-speed)) ease-in`;
    
    document.body.appendChild(clone);
    el.style.opacity = '0';
    el.style.display = 'none';
    
    void clone.offsetWidth;
    
    let tX = endRect.left + endRect.width/2 - startRect.width/2;
    let tY = endRect.top + endRect.height/2 - startRect.height/2;
    clone.style.left = tX + 'px';
    clone.style.top = tY + 'px';
    clone.style.transform = 'scale(0.2) rotate(15deg)';
    clone.style.opacity = '0.5';
    
    setTimeout(() => {
        clone.remove();
        if (cb) cb();
    }, 450 * animSpeed);
}

function createStoneParticles(el) {
    let rect = el.getBoundingClientRect();
    let container = document.body;
    for (let i = 0; i < 8; i++) {
        let p = document.createElement('div');
        p.textContent = "🪨";
        p.style.position = 'fixed';
        p.style.left = (rect.left + rect.width / 2 - 10) + 'px';
        p.style.top = (rect.top + rect.height / 2 - 10) + 'px';
        p.style.fontSize = '20px';
        p.style.pointerEvents = 'none';
        p.style.zIndex = '9999';
        p.style.transition = `transform calc(0.5s * var(--anim-speed)) ease-out, opacity calc(0.5s * var(--anim-speed)) ease-out`;
        
        let tx = (Math.random() - 0.5) * 100;
        let ty = (Math.random() - 0.5) * 100 - 50;
        let rot = (Math.random() - 0.5) * 360;
        
        container.appendChild(p);
        
        void p.offsetWidth;
        
        p.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(0.5)`;
        p.style.opacity = '0';
        
        setTimeout(() => p.remove(), 500 * animSpeed);
    }
}

function destroyWithScale(el, item) {
    let x = item.x * STEP + ITEM_OFFSET, y = item.y * STEP + ITEM_OFFSET;
    el.style.transition = `transform calc(0.25s * var(--anim-speed)) ease-in, opacity calc(0.25s * var(--anim-speed)) ease-in`;
    el.style.transform = `translate(${x}px, ${y}px) scale(0)`;
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    setTimeout(() => el.remove(), 300 * animSpeed);
}

function removeDestroyedDOM() {
    items.forEach(item => {
        if (item.toBeDestroyed && item.element) {
            if (item.flyToMission) {
                let targetUI = findMissionUI(item.flyToMission, item.missionParams?.value);
                if (targetUI) {
                    flyToUI(item.element, targetUI, () => {
                        item.element.remove();
                        sfxCollect.currentTime = 0;
                        sfxCollect.play().catch(e => {});
                        targetUI.classList.remove('shake-ui');
                        void targetUI.offsetWidth;
                        targetUI.classList.add('shake-ui');
                    });
                } else {
                    destroyWithScale(item.element, item);
                }
            } else if (item.mergeDestroyed) {
                item.element.remove();
            } else {
                if (item.destroyedByMerge && item.type === 'stone') {
                    createStoneParticles(item.element);
                }
                destroyWithScale(item.element, item);
            }
        }
    });
}

function updateUI() {
    movesCountEl.textContent = movesLeft;
    
    missionsPanelEl.innerHTML = '';
    missionState.forEach(m => {
        let el = document.createElement('div');
        el.className = 'mission-item';
        el.dataset.missionType = m.type;
        if(m.type === 'collect_block') el.dataset.target = m.target_value;
        
        let icon = '';
        if (m.type === 'collect_block') {
            let p2 = Math.log2(m.target_value);
            icon = `<div class="mission-icon-container"><div class="item type-block" data-level="${p2}" style="position:relative; width:45px; height:45px; border-radius:8px; font-size:1.3rem; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display:flex; justify-content:center; align-items:center;">${m.target_value}</div></div>`;
        }
        else if (m.type === 'destroy_box') {
            icon = `<div class="mission-icon-container"><div style="width:45px; height:45px; background: url('Art/Box.png') center/cover no-repeat; border-radius:8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div></div>`;
        }
        else if (m.type === 'open_door') {
            icon = `<div class="mission-icon-container"><div style="font-size: 35px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); display:flex; justify-content:center; align-items:center; line-height:1;">🚪</div></div>`;
        }
        else if (m.type === 'collect_letter') {
            icon = `<div class="mission-icon-container"><div style="font-size: 35px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); display:flex; justify-content:center; align-items:center; line-height:1;">✉️</div></div>`;
        }
        else if (m.type === 'destroy_stone') {
            icon = `<div class="mission-icon-container"><div style="font-size: 35px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); display:flex; justify-content:center; align-items:center; line-height:1;">🪨</div></div>`;
        }
        
        let isDone = m.progress >= m.amount;
        el.innerHTML = `
            <div class="mission-icon" style="margin-bottom: 5px;">${icon}</div>
            <div class="mission-progress ${isDone ? 'mission-done' : ''}" style="font-size: 1.4rem;">${m.progress} / ${m.amount}</div>
        `;
        missionsPanelEl.appendChild(el);
    });
}

window.onload = initGame;
