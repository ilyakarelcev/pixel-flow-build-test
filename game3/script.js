const CATEGORIES = ['Drawer', 'Flowerpot', 'GardeningGloves', 'GardeningTools', 'Yarn'];

const CATEGORY_IMAGES = {
    Drawer: ['Drawer01', 'Drawer02', 'Drawer03', 'Drawer04', 'Drawer06', 'Drawer07', 'Drawer09'],
    Flowerpot: ['Flowerpot01', 'Flowerpot02', 'Flowerpot03', 'Flowerpot05', 'Flowerpot06', 'Flowerpot08', 'Flowerpot11'],
    GardeningGloves: ['GardeningGloves01', 'GardeningGloves02', 'GardeningGloves03', 'GardeningGloves04', 'GardeningGloves05'],
    GardeningTools: ['GardeningTools01', 'GardeningTools02', 'GardeningTools03', 'GardeningTools04', 'GardeningTools05', 'GardeningTools06', 'GardeningTools07', 'GardeningTools08', 'GardeningTools09', 'GardeningTools10'],
    Yarn: ['Yarn01', 'Yarn02', 'Yarn03', 'Yarn04', 'Yarn05', 'Yarn06', 'Yarn08', 'Yarn11']
};

const DOM_BG_COLORS = {
    Drawer: 'rgba(155, 93, 229, 0.1)',
    Flowerpot: 'rgba(255, 154, 68, 0.1)',
    GardeningGloves: 'rgba(255, 8, 68, 0.1)',
    GardeningTools: 'rgba(0, 198, 255, 0.1)',
    Yarn: 'rgba(17, 153, 142, 0.1)'
};

let grid = Array(5).fill().map(() => Array(5).fill(null));
let inventory = Array(5).fill(null);
let score = 0;
let highScore = localStorage.getItem('mergeBallsHighScore') || 0;

// UI Elements
const gridLayer = document.getElementById('cells-layer');
const ballsLayer = document.getElementById('balls-layer');
const invLayer = document.getElementById('inventory');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const modal = document.getElementById('game-over-modal');
const fxLayer = document.getElementById('fx-layer');

let isAnimating = false;

function init() {
    highScoreEl.innerText = highScore;
    
    // Создаем сетку как подложку
    gridLayer.innerHTML = '';
    for(let r=0; r<5; r++) {
        for(let c=0; c<5; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const catName = CATEGORIES[(r+c)%5];
            cell.style.backgroundColor = DOM_BG_COLORS[catName];
            cell.dataset.r = r;
            cell.dataset.c = c;
            gridLayer.appendChild(cell);
        }
    }
    
    restartGame();
    
    document.getElementById('restart-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
        restartGame();
    });
}

function restartGame() {
    grid = Array(5).fill().map(() => Array(5).fill(null));
    score = 0;
    updateScore(0);
    isAnimating = false;
    
    generateInitialBalls();
    
    for(let i=0; i<5; i++) {
        inventory[i] = { category: getRandomCategory(), level: 1 };
    }
    
    renderGrid();
    renderInventory();
}

function getRandomCategory() {
    return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
}

function generateInitialBalls() {
    let count = 0;
    while(count < 7) {
        let r = Math.floor(Math.random() * 5);
        let c = Math.floor(Math.random() * 5);
        if (!grid[r][c]) {
            let category;
            let attempts = 0;
            do {
                category = getRandomCategory();
                grid[r][c] = { category, level: 1 };
                attempts++;
            } while (attempts < 10 && getGroup(r, c).length >= 3);
            
            count++;
        }
    }
}

function renderGrid() {
    ballsLayer.innerHTML = '';
    for(let r=0; r<5; r++) {
        for(let c=0; c<5; c++) {
            if (grid[r][c]) {
                const b = createBallElement(grid[r][c]);
                b.style.top = `${r * 20}%`;
                b.style.left = `${c * 20}%`;
                b.dataset.r = r;
                b.dataset.c = c;
                ballsLayer.appendChild(b);
            }
        }
    }
}

function createBallElement(data) {
    const b = document.createElement('div');
    b.className = 'ball';
    
    let images = CATEGORY_IMAGES[data.category];
    let imgIdx = data.level - 1;
    if (imgIdx >= images.length) {
        imgIdx = images.length - 1;
    }
    
    const imgElement = document.createElement('img');
    imgElement.src = `Pictures/${data.category}/${images[imgIdx]}.webp`;
    imgElement.className = 'ball-img';
    imgElement.draggable = false;
    
    const levelText = document.createElement('div');
    levelText.className = 'ball-level';
    levelText.innerText = data.level;
    
    b.ondragstart = () => false;
    b.style.userSelect = "none";
    
    b.appendChild(imgElement);
    b.appendChild(levelText);
    return b;
}

function renderInventory() {
    invLayer.innerHTML = '';
    for(let i=0; i<5; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        if (inventory[i]) {
            const b = createBallElement(inventory[i]);
            // Touch & Mouse события для перетаскивания
            b.addEventListener('pointerdown', (e) => startDrag(e, i));
            slot.appendChild(b);
        }
        invLayer.appendChild(slot);
    }
}

// Drag & Drop логика
let draggingBall = null;
let dropTargetCell = null;

function startDrag(e, index) {
    if (isAnimating) return;
    
    const ballData = inventory[index];
    if (!ballData) return;
    
    e.preventDefault(); // Запретить скролл при касании
    
    const dragEl = createBallElement(ballData);
    dragEl.classList.add('dragging');
    document.body.appendChild(dragEl);
    
    draggingBall = { el: dragEl, data: ballData, slotIndex: index };
    
    moveDrag(e.clientX, e.clientY);
    
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
}

function moveDrag(x, y) {
    if (!draggingBall) return;
    draggingBall.el.style.left = x + 'px';
    draggingBall.el.style.top = y + 'px';
}

function onDragMove(e) {
    moveDrag(e.clientX, e.clientY);
    checkHoverCell(e.clientX, e.clientY);
}

function checkHoverCell(x, y) {
    const el = document.elementFromPoint(x, y);
    
    document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
    dropTargetCell = null;
    
    if (el && el.classList.contains('cell')) {
        const r = parseInt(el.dataset.r);
        const c = parseInt(el.dataset.c);
        if (!grid[r][c]) {
            el.classList.add('highlight');
            dropTargetCell = {r, c};
        }
    }
}

async function onDragEnd(e) {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    
    if (!draggingBall) return;
    
    const { data, slotIndex } = draggingBall;
    draggingBall.el.remove();
    draggingBall = null;

    document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
    
    if (dropTargetCell) {
        let r = dropTargetCell.r;
        let c = dropTargetCell.c;
        dropTargetCell = null;
        
        await placeBall(r, c, data, slotIndex);
    }
}

async function placeBall(r, c, data, slotIndex) {
    isAnimating = true;
    grid[r][c] = data;
    
    inventory[slotIndex] = { category: getRandomCategory(), level: 1 };
    renderInventory();
    renderGrid();
    
    await sleep(50); 
    
    await executeMergeChain(r, c);
    
    isAnimating = false;
}

function getCellCategoryName(r, c) {
    return CATEGORIES[(r+c)%5];
}

function calculateScore(groupSize, level, category, group) {
    let base = 0;
    if (groupSize === 3) base = 10;
    else if (groupSize === 4) base = 25;
    else if (groupSize === 5) base = 50;
    else if (groupSize === 6) base = 80;
    else if (groupSize >= 7) base = 80 + (groupSize - 6) * 40;
    
    let points = base * level;
    
    let bonus = 0;
    for(let pos of group) {
        if (getCellCategoryName(pos.r, pos.c) === category) {
            bonus += 1;
        }
    }
    
    return points + bonus;
}

function updateScore(points) {
    score += points;
    scoreEl.innerText = score;
    if (score > highScore) {
        highScore = score;
        highScoreEl.innerText = highScore;
        localStorage.setItem('mergeBallsHighScore', highScore);
    }
}

function getGroup(r, c) {
    const startBall = grid[r][c];
    if (!startBall) return [];
    
    const category = startBall.category;
    const level = startBall.level;
    
    let visited = new Set();
    let queue = [{r, c}];
    let group = [];
    
    while(queue.length > 0) {
        let curr = queue.shift();
        let key = `${curr.r},${curr.c}`;
        
        if (!visited.has(key)) {
            visited.add(key);
            group.push(curr);
            
            let dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            for(let d of dirs) {
                let nr = curr.r + d[0];
                let nc = curr.c + d[1];
                if (nr>=0 && nr<5 && nc>=0 && nc<5) {
                    if (grid[nr][nc] && grid[nr][nc].category === category && grid[nr][nc].level === level) {
                        queue.push({r: nr, c: nc});
                    }
                }
            }
        }
    }
    return group;
}

async function executeMergeChain(r, c) {
    let group = getGroup(r, c);
    if (group.length < 3) {
        checkGameOver();
        return;
    }
    
    let data = grid[r][c];
    let points = calculateScore(group.length, data.level, data.category, group);
    updateScore(points);
    showFloatingScore(points, r, c);
    
    // Анимация слияния
    let domMatrix = Array(5).fill().map(()=>Array(5).fill(null));
    for(let el of ballsLayer.children) {
        let tr = parseInt(el.dataset.r);
        let tc = parseInt(el.dataset.c);
        if(!isNaN(tr) && !isNaN(tc)) domMatrix[tr][tc] = el;
    }
    
    for(let pos of group) {
        if (pos.r !== r || pos.c !== c) {
            let el = domMatrix[pos.r][pos.c];
            if (el) {
                el.classList.add('merging');
                el.style.top = `${r * 20}%`;
                el.style.left = `${c * 20}%`;
            }
        }
    }
    
    await sleep(350);
    
    for(let pos of group) {
        if (pos.r !== r || pos.c !== c) {
            grid[pos.r][pos.c] = null;
        }
    }
    grid[r][c] = { category: data.category, level: data.level + 1 };
    
    renderGrid();
    
    // Анимация появления нового шарика
    Array.from(ballsLayer.children).forEach(el => {
        if (parseInt(el.dataset.r) === r && parseInt(el.dataset.c) === c) {
            el.classList.add('popping');
        }
    });

    await sleep(400);   
    
    // Рекурсивно проверяем следующее слияние (Цепная реакция)
    await executeMergeChain(r, c);
}

function showFloatingScore(pts, r, c) {
    const floatEl = document.createElement('div');
    floatEl.className = 'floating-score';
    floatEl.innerText = `+${pts}`;
    
    const containerRect = gridLayer.getBoundingClientRect();
    const cellW = containerRect.width / 5;
    const cellH = containerRect.height / 5;
    
    floatEl.style.left = `${containerRect.left + c * cellW + cellW / 2}px`;
    floatEl.style.top = `${containerRect.top + r * cellH + cellH / 2}px`;
    
    fxLayer.appendChild(floatEl);
    setTimeout(() => {
        floatEl.remove();
    }, 1000);
}

function checkGameOver() {
    let emptyCount = 0;
    for(let r=0; r<5; r++) {
        for(let c=0; c<5; c++) {
            if (!grid[r][c]) emptyCount++;
        }
    }
    
    // Если пустых ячеек нет, игра окончена
    if (emptyCount === 0) {
        finalScoreEl.innerText = score;
        modal.classList.remove('hidden');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', init);
