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
const sfxBoxDamage = new Audio('553430__kablazik_samples__kb_poppop_0.wav');
sfxBoxDamage.volume = 0.4;
const sfxDoorOpen = new Audio('Coin_Result.wav');
sfxDoorOpen.volume = 0.4;
const sfxStoneBreak = new Audio('553430__kablazik_samples__kb_poppop_0.wav');
sfxStoneBreak.volume = 0.5;
sfxStoneBreak.playbackRate = 0.8; // Lower pitch for stone

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
const helpBtn = document.getElementById('help-btn');

let lastTriggeredTutorial = null;

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
            // Show help button if we have a current tutorial for this level
            if (lastTriggeredTutorial) {
                helpBtn.classList.remove('hidden');
            }
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

    helpBtn.addEventListener('click', () => {
        if (lastTriggeredTutorial) {
            displayTutorial(lastTriggeredTutorial);
            helpBtn.classList.add('hidden');
        }
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
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', fitBoard);
    }
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
    
    lastTriggeredTutorial = null;
    helpBtn.classList.add('hidden');
    
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

    lastTriggeredTutorial = key;
    tutorialIcon.textContent = data.icon;
    tutorialTitle.textContent = data.title;
    tutorialText.textContent = data.text;
    tutorialOverlay.classList.remove('hidden');
    helpBtn.classList.add('hidden'); // Hide help while tutorial is open
}

function fitBoard() {
    let ow = parseFloat(boardContainer.dataset.owWidth);
    let oh = parseFloat(boardContainer.dataset.owHeight);
    if (!ow || !oh) return;

    let scaler = document.getElementById('board-scaler');
    
    // Calculate total reserved height from UI elements above the board
    const topStuff = document.getElementById('top-panel-container');
    const header = document.querySelector('header');
    
    // Get actual heights of header and top panel
    const headerHeight = header ? header.offsetHeight : 0;
    const topPanelHeight = topStuff ? topStuff.offsetHeight : 0;
    
    // Base spacing between elements
    const spacing = 40; 
    const topReserved = headerHeight + topPanelHeight + spacing;
    
    // Available dimensions - ensure we use the dynamic viewport height
    let realAvailableWidth = (scaler && scaler.clientWidth > 0) ? scaler.clientWidth : window.innerWidth;
    let availableWidth = realAvailableWidth - 30; // 15px padding on each side
    // Use visualViewport if available (better on mobile with dynamic address bar)
    let vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    let availableHeight = vh - topReserved - 20; // 20px bottom safety margin
    
    let scWid = availableWidth / ow;
    let scHei = availableHeight / oh;
    
    // Calculate scale and ensure it doesn't exceed 1.0
    let scale = Math.min(1.0, scWid, scHei);
    
    // Use top-left origin and manually center — flex centering doesn't work with transform scale
    boardContainer.style.transformOrigin = '0 0';
    boardContainer.style.transform = `scale(${scale})`;

    // Center the scaled board within the available width
    let boardVisualWidth = ow * scale;
    let marginLeft = Math.max(0, (realAvailableWidth - boardVisualWidth) / 2);
    boardContainer.style.marginLeft = marginLeft + 'px';

    // Sync HUD row width with board width
    const hudRow = document.getElementById('hud-row');
    const movesBox = document.getElementById('moves-container');
    if (hudRow && movesBox) {
        
        // Ensure hud-row matches the visual width of the board
        hudRow.style.width = boardVisualWidth + 'px';
        hudRow.style.minWidth = '0'; 
        
        if (missionsPanelEl) {
            missionsPanelEl.style.flex = "1";
            missionsPanelEl.style.minWidth = "0";
        }
    }
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
            i.element.style.transform = `translate3d(${i.x * STEP + ITEM_OFFSET}px, ${i.y * STEP + ITEM_OFFSET}px, 0)`;
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

        items.forEach(i => {
            if (i.iceShatter) {
                createIceShatterEffect(i.x, i.y);
                i.iceShatter = false;
            }
            if (i.isDoorOpening) {
                createDoorParticles(i.x, i.y);
                sfxDoorOpen.currentTime = 0;
                if (sfxDoorOpen.paused) sfxDoorOpen.play().catch(e => {});
                if (i.element) {
                    const inner = i.element.querySelector('.item-inner');
                    if (inner) {
                        inner.classList.remove('door-open-shake');
                        void inner.offsetWidth;
                        inner.classList.add('door-open-shake');
                    }
                }
                i.isDoorOpening = false;
            }
            if (i.isKeyOpening) {
                if (i.element) {
                    const inner = i.element.querySelector('.item-inner');
                    if (inner) {
                        inner.classList.remove('key-unlock-spin');
                        void inner.offsetWidth;
                        inner.classList.add('key-unlock-spin');
                    }
                }
                i.isKeyOpening = false;
            }
        });

        applyPostMoveEffects(merges);
        updateVisualLevels();
        collectMissionBlocks();
        
        movesLeft--;
        updateUI(); // Update UI BEFORE removeDestroyedDOM so fly-to targets exist
        
        removeDestroyedDOM();

        if (merges.length > 0) {
            sfxMerge.currentTime = 0;
            sfxMerge.play().catch(e => {});
        }

        // Filter out items that were just marked for destruction
        items = items.filter(i => !i.toBeDestroyed);

        spawnNewBlocks();
        renderItems();

        // JS-driven merge-pop: scale up with glow, then back
        // We start this at the same time as new block spawning for a more dynamic board
        items.forEach(i => {
            if (i.merged && i.element && !i.toBeDestroyed) {
                let x = i.x * STEP + ITEM_OFFSET, y = i.y * STEP + ITEM_OFFSET;
                const inner = i.element.querySelector('.item-inner');
                if (inner) {
                    if (i.type === 'block' || i.type === 'frozen_block') {
                        inner.textContent = i.value;
                        inner.setAttribute('data-level', Math.log2(i.value));
                    }
                }
                // More intense, faster pop effect
                i.element.style.transition = `transform calc(0.1s * var(--anim-speed)) cubic-bezier(0.175, 0.885, 0.32, 1.275), filter calc(0.1s * var(--anim-speed)), box-shadow calc(0.1s * var(--anim-speed))`;
                i.element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.35)`;
                i.element.style.filter = 'brightness(1.8) saturate(1.2)';
                i.element.style.boxShadow = '0 0 40px rgba(255,255,255,0.9)';
                i.element.style.zIndex = '100';

                setTimeout(() => {
                    if (!i.element) return;
                    i.element.style.transition = `transform calc(0.15s * var(--anim-speed)) ease-out, filter calc(0.15s * var(--anim-speed)), box-shadow calc(0.15s * var(--anim-speed))`;
                    i.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                    i.element.style.filter = '';
                    i.element.style.boxShadow = '';
                    i.element.style.zIndex = '';
                }, 100 * animSpeed);
            }
        });

        setTimeout(() => {
            items.forEach(i => { i.merged = false; }); // Reset flags after animation triggers

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
        }, 250 * animSpeed);
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
                    item.isKeyOpening = true;
                    nextItem.toBeDestroyed = true;
                    nextItem.isDoorOpening = true;
                    nextItem.flyToMission = 'open_door';
                    grid[item.y][item.x] = null;
                    // grid[ny][nx] = null; // keep door as obstacle for the rest of this turn
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
                    // Immediate Merge: flying block hits frozen block, results in value*2 block
                    nextItem.nextValue = item.value * 2;
                    nextItem.type = 'block'; 
                    nextItem.merged = true;
                    nextItem.iceShatter = true;
                    item.toBeDestroyed = true;
                    item.mergeDestroyed = true;
                    grid[item.y][item.x] = null;
                    item.x = nx; item.y = ny;
                    mergesThisTurn.push({x: nx, y: ny});
                    turnMoved = true;
                    interacted = true;
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
                } else {
                    // Box Hit Effects
                    if (adj.element) {
                        const inner = adj.element.querySelector('.item-inner');
                        if (inner) {
                            inner.classList.remove('shake-item');
                            void inner.offsetWidth;
                            inner.classList.add('shake-item');
                        }
                        createBoxParticles(adj.x, adj.y);
                    }
                    sfxBoxDamage.currentTime = 0;
                    sfxBoxDamage.play().catch(e => {});
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
    // Find the first matching mission that is not yet completed
    const matchingMission = missionState.find(m => {
        if (m.progress >= m.amount) return false;
        if (m.type !== type) return false;
        if (type === 'collect_block') {
            return m.target_value === params.value;
        }
        return true;
    });

    if (matchingMission) {
        matchingMission.progress++;
    }
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
    if (!currentLevel || !currentLevel.board_cells || currentLevel.board_cells.length === 0) return;
    
    const lookup = new Set(currentLevel.board_cells.map(c => `${c.x},${c.y}`));
    
    currentLevel.board_cells.forEach(c => {
        const hasL = lookup.has(`${c.x-1},${c.y}`);
        const hasR = lookup.has(`${c.x+1},${c.y}`);
        const hasU = lookup.has(`${c.x},${c.y-1}`);
        const hasD = lookup.has(`${c.x},${c.y+1}`);

        // Generator for building perfectly tiled straight-edged blocks
        const createTile = (className, pad, radius, zIndex, offsetY = 0) => {
            let el = document.createElement('div');
            el.className = className;
            
            let left = c.x * STEP;
            let top = c.y * STEP;
            // Add 1px safety overlap to right and bottom neighbors to prevent scaler anti-aliasing gaps
            let width = STEP + (hasR ? 1 : 0);
            let height = STEP + (hasD ? 1 : 0);
            
            if (!hasL) { left -= pad; width += pad; }
            if (!hasR) { width += pad; }
            if (!hasU) { top -= pad; height += pad; }
            if (!hasD) { height += pad; }
            
            // Round corners only on true outer extreme edges
            let brTL = (!hasU && !hasL) ? radius : 0;
            let brTR = (!hasU && !hasR) ? radius : 0;
            let brBL = (!hasD && !hasL) ? radius : 0;
            let brBR = (!hasD && !hasR) ? radius : 0;
            
            el.style.width = `${width}px`;
            el.style.height = `${height}px`;
            el.style.borderRadius = `${brTL}px ${brTR}px ${brBR}px ${brBL}px`;
            el.style.transform = `translate3d(${left}px, ${top + offsetY}px, 0)`;
            el.style.zIndex = zIndex;
            boardGridEl.appendChild(el);
        };

        // Reduced paddings (-30%) and slightly adjusted corner radiuses
        createTile('grid-shadow', 14, 26, 5, 8); // Shifted down 8px
        createTile('grid-border', 14, 26, 10, 0);
        createTile('grid-base', 8, 20, 20, 0);

        let slot = document.createElement('div');
        slot.className = 'grid-slot';
        slot.style.transform = `translate3d(${c.x * STEP + 4}px, ${c.y * STEP + 4}px, 0)`;
        slot.style.zIndex = 30;
        boardGridEl.appendChild(slot);
    });

    // Generate Perfect Concave Inner Corners (Fillets)
    let minX = Math.min(...currentLevel.board_cells.map(c => c.x));
    let maxX = Math.max(...currentLevel.board_cells.map(c => c.x));
    let minY = Math.min(...currentLevel.board_cells.map(c => c.y));
    let maxY = Math.max(...currentLevel.board_cells.map(c => c.y));

    const createInnerFillet = (layer, facing, ix, iy, r) => {
        if (r <= 0) return;
        let wrap = document.createElement('div');
        let zIndex = layer === 'shadow' ? 5 : (layer === 'border' ? 10 : 20);
        wrap.style.position = 'absolute';
        wrap.style.overflow = 'hidden';
        
        let left = ix;
        let top = iy;
        if (facing === 'TL') { left -= r; top -= r; }
        if (facing === 'TR') { top -= r; }
        if (facing === 'BL') { left -= r; }
        
        let circle = document.createElement('div');
        circle.style.position = 'absolute';
        circle.style.width = `${r * 2}px`;
        circle.style.height = `${r * 2}px`;
        circle.style.borderRadius = '50%';
        
        let color = '';
        if (layer === 'shadow') color = '#4C607E';
        if (layer === 'border') color = '#7A93B9';
        if (layer === 'base') color = '#A4B1D3';
        circle.style.boxShadow = `0 0 0 50px ${color}`;

        if (facing === 'TL') { circle.style.left = `-${r}px`; circle.style.top = `-${r}px`; }
        if (facing === 'TR') { circle.style.left = `0px`; circle.style.top = `-${r}px`; }
        if (facing === 'BL') { circle.style.left = `-${r}px`; circle.style.top = `0px`; }
        if (facing === 'BR') { circle.style.left = `0px`; circle.style.top = `0px`; }

        wrap.style.width = `${r + 1}px`;
        wrap.style.height = `${r + 1}px`;
        if (facing === 'TL') {
            wrap.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        } else if (facing === 'TR') {
            wrap.style.transform = `translate3d(${left - 1}px, ${top}px, 0)`;
            circle.style.left = `1px`;
        } else if (facing === 'BL') {
            wrap.style.transform = `translate3d(${left}px, ${top - 1}px, 0)`;
            circle.style.top = `1px`;
        } else if (facing === 'BR') {
            wrap.style.transform = `translate3d(${left - 1}px, ${top - 1}px, 0)`;
            circle.style.left = `1px`;
            circle.style.top = `1px`;
        }

        wrap.style.zIndex = zIndex;
        wrap.appendChild(circle);
        boardGridEl.appendChild(wrap);
    };

    for (let vx = minX; vx <= maxX + 1; vx++) {
        for (let vy = minY; vy <= maxY + 1; vy++) {
            let qTL = lookup.has(`${vx-1},${vy-1}`);
            let qTR = lookup.has(`${vx},${vy-1}`);
            let qBL = lookup.has(`${vx-1},${vy}`);
            let qBR = lookup.has(`${vx},${vy}`);

            let makeFillets = (facing, signX, signY) => {
                let ixBase = vx * STEP + signX * 8;
                let iyBase = vy * STEP + signY * 8;
                createInnerFillet('base', facing, ixBase, iyBase, 12);
                
                let ixBorder = vx * STEP + signX * 14;
                let iyBorder = vy * STEP + signY * 14;
                createInnerFillet('border', facing, ixBorder, iyBorder, 6);
                
                createInnerFillet('shadow', facing, ixBorder, iyBorder + 8, 6);
            };

            if (!qTL && qTR && qBL) makeFillets('TL', -1, -1);
            if (!qTR && qTL && qBR) makeFillets('TR', 1, -1);
            if (!qBL && qTL && qBR) makeFillets('BL', -1, 1);
            if (!qBR && qTR && qBL) makeFillets('BR', 1, 1);
        }
    }
}

function renderItems() {
    items.forEach(item => {
        if (!item.element) {
            let el = document.createElement('div');
            el.className = `item`;
            let x = item.x * STEP + ITEM_OFFSET, y = item.y * STEP + ITEM_OFFSET;
            
            let inner = document.createElement('div');
            inner.className = `item-inner type-${item.type}`;
            el.appendChild(inner);

            item.element = el;

            if (item.isNew) {
                el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(0)`;
                el.style.opacity = '0';
                boardItemsEl.appendChild(el);

                void el.offsetWidth;

                el.style.transition = `transform calc(0.25s * var(--anim-speed)) cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity calc(0.25s * var(--anim-speed))`;
                el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1)`;
                el.style.opacity = '1';

                item._popAnimating = true;
                item._popTimer = setTimeout(() => {
                    item._popAnimating = false;
                    item._popTimer = null;
                    el.style.transition = '';
                    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                    el.style.opacity = '';
                }, 250 * animSpeed);
                item.isNew = false;
            } else {
                el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                boardItemsEl.appendChild(el);
            }
        }

        let el = item.element;
        let inner = el.querySelector('.item-inner');
        if (inner) {
            inner.className = `item-inner type-${item.type}`;

            if (item.type === 'block' || item.type === 'frozen_block') {
                inner.textContent = item.value;
                let p2 = Math.log2(item.value);
                inner.setAttribute('data-level', p2);
            } else {
                inner.textContent = "";
            }

            if (item.type === 'box') {
                inner.setAttribute('data-hp', item.hp);
            }
        }
    });

    renderPositions();
}

function renderPositions() {
    items.forEach(item => {
        let el = item.element;
        if (!el || item._popAnimating) return;
        el.style.transform = `translate3d(${item.x * STEP + ITEM_OFFSET}px, ${item.y * STEP + ITEM_OFFSET}px, 0)`;
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
        let inner = el.querySelector('.item-inner');
        if (inner) {
            inner.className = `item-inner type-${item.type}`;
            if (item.type === 'block' || item.type === 'frozen_block') {
                inner.textContent = item.value;
                inner.setAttribute('data-level', Math.log2(item.value));
            }
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

function flyToUI(el, targetUI, cb, delay = 0) {
    if (delay > 0) {
        setTimeout(() => flyToUI(el, targetUI, cb, 0), delay);
        return;
    }
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
    for (let i = 0; i < 16; i++) {
        let p = document.createElement('div');
        // Use a mix of emoji and colored fragments for richness
        if (Math.random() > 0.5) {
            p.textContent = "🪨";
            p.style.fontSize = (10 + Math.random() * 20) + 'px';
        } else {
            p.style.width = (8 + Math.random() * 12) + 'px';
            p.style.height = (8 + Math.random() * 12) + 'px';
            p.style.background = '#808080';
            p.style.borderRadius = '2px';
            p.style.border = '1px solid #555';
        }
        
        p.style.position = 'fixed';
        p.style.left = (rect.left + rect.width / 2) + 'px';
        p.style.top = (rect.top + rect.height / 2) + 'px';
        p.style.pointerEvents = 'none';
        p.style.zIndex = '9999';
        
        let tx = (Math.random() - 0.5) * 120; // Reduced from 200
        let ty = (Math.random() - 1.0) * 100; // Reduced from 150
        let rot = (Math.random() - 0.5) * 1080;
        
        p.style.transition = `transform calc(0.6s * var(--anim-speed)) cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity calc(0.6s * var(--anim-speed)) ease-out`;
        
        container.appendChild(p);
        
        void p.offsetWidth;
        
        p.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(0)`;
        p.style.opacity = '0';
        
        setTimeout(() => p.remove(), 600 * animSpeed);
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

function animateStoneShatter(item) {
    if (!item.element) return;
    sfxStoneBreak.currentTime = 0;
    sfxStoneBreak.play().catch(e => {});
    createStoneParticles(item.element);
    
    // Special jump and scale out animation for stones
    const inner = item.element.querySelector('.item-inner');
    if (inner) {
        inner.style.transition = `transform calc(0.4s * var(--anim-speed)) cubic-bezier(0.34, 1.56, 0.64, 1), opacity calc(0.3s * var(--anim-speed)) ease-in`;
        inner.style.transform = `translateY(-40px) scale(0) rotate(15deg)`;
        inner.style.opacity = '0';
    }
    setTimeout(() => item.element?.remove(), 400 * animSpeed);
}

function removeDestroyedDOM() {
    items.forEach(item => {
        if (item.toBeDestroyed && item.element) {
            if (item.flyToMission) {
                let targetUI = findMissionUI(item.flyToMission, item.missionParams?.value);
                if (targetUI) {
                    let delay = (item.type === 'door') ? 400 * animSpeed : 0;
                    if (item.type === 'stone') {
                        sfxStoneBreak.currentTime = 0;
                        sfxStoneBreak.play().catch(e => {});
                        createStoneParticles(item.element);
                    }
                    flyToUI(item.element, targetUI, () => {
                        item.element.remove();
                        sfxCollect.currentTime = 0;
                        sfxCollect.play().catch(e => {});
                        targetUI.classList.remove('shake-ui');
                        void targetUI.offsetWidth;
                        targetUI.classList.add('shake-ui');
                    }, delay);
                } else {
                    if (item.type === 'stone') {
                        animateStoneShatter(item);
                    } else {
                        destroyWithScale(item.element, item);
                    }
                }
            } else if (item.mergeDestroyed) {
                item.element.remove();
            } else {
                if (item.type === 'stone') {
                    animateStoneShatter(item);
                } else {
                    destroyWithScale(item.element, item);
                }
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
            icon = `<div class="mission-icon-container"><div class="item" style="position:relative; width:45px; height:45px; z-index: 1;"><div class="item-inner type-block" data-level="${p2}" style="width:100%; height:100%; border-radius:8px; font-size:1.3rem; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display:flex; justify-content:center; align-items:center; border: none;">${m.target_value}</div></div></div>`;
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
        let checkmarkClass = 'mission-checkmark';
        if (isDone && !m.doneAnimated) {
            checkmarkClass += ' animate';
            m.doneAnimated = true;
        }
        
        el.innerHTML = `
            <div class="mission-icon">${icon}</div>
            <div class="mission-progress ${isDone ? 'mission-done' : ''}">
                ${isDone ? `<span class="${checkmarkClass}">✅</span>` : m.progress + ' / ' + m.amount}
            </div>
        `;
        missionsPanelEl.appendChild(el);
    });
}

function createIceShatterEffect(x, y) {
    const centerX = x * STEP + STEP / 2;
    const centerY = y * STEP + STEP / 2;

    for (let i = 0; i < 12; i++) {
        const shard = document.createElement('div');
        shard.className = 'ice-shard';
        
        // Randomize shard properties for a rich aesthetic
        const angle = Math.random() * Math.PI * 2;
        const velocity = 100 + Math.random() * 200;
        const dx = Math.cos(angle) * velocity;
        const dy = Math.sin(angle) * velocity;
        const rot = (Math.random() - 0.5) * 1080;
        const size = 12 + Math.random() * 18;
        
        shard.style.width = `${size}px`;
        shard.style.height = `${size}px`;
        shard.style.setProperty('--dx', `${dx}px`);
        shard.style.setProperty('--dy', `${dy}px`);
        shard.style.setProperty('--rot', `${rot}deg`);
        
        // Initial position (center of the ice cell)
        shard.style.left = `${centerX - size / 2}px`;
        shard.style.top = `${centerY - size / 2}px`;
        
        boardItemsEl.appendChild(shard);
        
        // Remove after animation finishes
        setTimeout(() => {
            shard.remove();
        }, 1000 * animSpeed);
    }
}

function createBoxParticles(gx, gy) {
    const centerX = gx * STEP + STEP / 2;
    const centerY = gy * STEP + STEP / 2;

    for (let i = 0; i < 8; i++) {
        const shard = document.createElement('div');
        shard.className = 'wood-shard';
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 80 + Math.random() * 150;
        const dx = Math.cos(angle) * velocity;
        const dy = Math.sin(angle) * velocity;
        const rot = (Math.random() - 0.5) * 720;
        
        shard.style.setProperty('--dx', `${dx}px`);
        shard.style.setProperty('--dy', `${dy}px`);
        shard.style.setProperty('--rot', `${rot}deg`);
        
        shard.style.left = `${centerX - 6}px`;
        shard.style.top = `${centerY - 6}px`;
        
        boardItemsEl.appendChild(shard);
        setTimeout(() => shard.remove(), 700 * animSpeed);
    }
}
function createDoorParticles(gx, gy) {
    const centerX = gx * STEP + STEP / 2;
    const centerY = gy * STEP + STEP / 2;

    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'door-particle';
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 60 + Math.random() * 120; // Reduced from 100-350
        const dx = Math.cos(angle) * velocity;
        const dy = Math.sin(angle) * velocity;
        const rot = (Math.random() - 0.5) * 1080;
        const size = 12 + Math.random() * 18; // Slightly smaller too
        
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.setProperty('--dx', `${dx}px`);
        p.style.setProperty('--dy', `${dy}px`);
        p.style.setProperty('--rot', `${rot}deg`);
        
        p.style.left = `${centerX - size / 2}px`;
        p.style.top = `${centerY - size / 2}px`;
        
        boardItemsEl.appendChild(p);
        setTimeout(() => p.remove(), 800 * animSpeed);
    }
}

window.onload = initGame;
