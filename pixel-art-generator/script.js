document.addEventListener('DOMContentLoaded', () => {
    const uploadInput = document.getElementById('image-upload');
    const gridSizeInput = document.getElementById('grid-size');
    const blurAmountInput = document.getElementById('blur-amount');
    const offsetXInput = document.getElementById('offset-x');
    const offsetYInput = document.getElementById('offset-y');
    const distanceMetricInput = document.getElementById('distance-metric');
    const sampleMethodInput = document.getElementById('sample-method');
    const downloadBtn = document.getElementById('download-btn');
    const gridColorInput = document.getElementById('grid-color');
    const gridAlphaInput = document.getElementById('grid-alpha');
    const gridVisibleInput = document.getElementById('grid-visible');
    const sortPaletteBtn = document.getElementById('sort-palette-btn');

    const gridSizeVal = document.getElementById('grid-size-val');
    const blurAmountVal = document.getElementById('blur-amount-val');
    const offsetXVal = document.getElementById('offset-x-val');
    const offsetYVal = document.getElementById('offset-y-val');
    const gridAlphaVal = document.getElementById('grid-alpha-val');
    const paletteCountVal = document.getElementById('palette-count');
    const resultResolutionVal = document.getElementById('result-resolution');

    const origCanvas = document.getElementById('original-canvas');
    const resCanvas = document.getElementById('result-canvas');
    const origEmpty = document.getElementById('original-empty');
    const resEmpty = document.getElementById('result-empty');
    const paletteContainer = document.getElementById('palette-container');
    const markersContainer = document.getElementById('markers-container');

    const ctxOrig = origCanvas.getContext('2d');
    const ctxRes = resCanvas.getContext('2d');

    const cleanCanvas = document.createElement('canvas');
    const ctxClean = cleanCanvas.getContext('2d', { willReadFrequently: true });

    let loadedImage = null;
    let timeoutId = null;

    // State variables
    let blockColors = []; // [{cx, cy, r, g, b, bx, by}]
    let samplePoints = []; // [{ id, x, y, r, g, b }]
    let currentPalette = []; // [[r,g,b]]
    let nextMarkerId = 0;

    // Sort logic
    const sortModes = ['hsv', 'luma', 'rgb'];
    const sortNames = ['Сортировка: HSV', 'Сортировка: Яркость', 'Сортировка: Спектр (RGB)'];
    let currentSortIndex = 0;

    // Interaction
    let draggingMarkerId = null;

    let processingWidth = 0;
    let processingHeight = 0;

    function loadImageFromFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                loadedImage = img;
                origCanvas.style.display = 'block';
                resCanvas.style.display = 'block';
                origEmpty.style.display = 'none';
                resEmpty.style.display = 'none';

                // Calculate size based on maxDimension
                const maxDimension = 800;
                let width = loadedImage.width;
                let height = loadedImage.height;

                if (width > maxDimension || height > maxDimension) {
                    const ratio = Math.min(maxDimension / width, maxDimension / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                processingWidth = width;
                processingHeight = height;

                origCanvas.width = width;
                origCanvas.height = height;
                resCanvas.width = width;
                resCanvas.height = height;

                markersContainer.style.display = 'block';

                updateCleanCanvas();

                // Add 1 default point in the center
                samplePoints = [];
                nextMarkerId = 0;
                addSamplePoint(Math.floor(width / 2), Math.floor(height / 2));

                debounceProcess(true);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    uploadInput.addEventListener('change', (e) => {
        loadImageFromFile(e.target.files[0]);
    });

    document.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                loadImageFromFile(file);
                break;
            }
        }
    });

    // Inputs
    gridSizeInput.addEventListener('input', (e) => {
        gridSizeVal.textContent = e.target.value + 'px';
        if (loadedImage) drawGridOverlay();
        debounceProcess(true); // Recalculate blocks
    });

    blurAmountInput.addEventListener('input', (e) => {
        blurAmountVal.textContent = e.target.value + 'px';
        if (loadedImage) {
            updateCleanCanvas();
            // Need to retake colors for all sample points from blurred image
            samplePoints.forEach(pt => {
                const c = getPixelColor(pt.x, pt.y);
                pt.r = c[0]; pt.g = c[1]; pt.b = c[2];
            });
            currentPalette = samplePoints.map(p => [p.r, p.g, p.b]);
            updatePaletteUI();
            drawGridOverlay();
        }
        debounceProcess(true); // Recalculate extracted blocks
    });

    offsetXInput.addEventListener('input', (e) => {
        offsetXVal.textContent = e.target.value + 'px';
        if (loadedImage) drawGridOverlay();
        debounceProcess(true); // Recalculate blocks
    });

    offsetYInput.addEventListener('input', (e) => {
        offsetYVal.textContent = e.target.value + 'px';
        if (loadedImage) drawGridOverlay();
        debounceProcess(true); // Recalculate blocks
    });

    distanceMetricInput.addEventListener('change', () => {
        debounceProcess(false);
    });

    sampleMethodInput.addEventListener('change', () => {
        debounceProcess(true);
    });

    sortPaletteBtn.addEventListener('click', () => {
        currentSortIndex = (currentSortIndex + 1) % sortModes.length;
        sortPaletteBtn.textContent = sortNames[currentSortIndex];
        updatePaletteUI();
    });

    downloadBtn.addEventListener('click', () => {
        if (!loadedImage || blockColors.length === 0) return;

        const resW = parseInt(gridSizeInput.value);
        const size = processingWidth / resW;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        blockColors.forEach(bc => {
            if (bc.bx < minX) minX = bc.bx;
            if (bc.by < minY) minY = bc.by;
            if (bc.bx > maxX) maxX = bc.bx;
            if (bc.by > maxY) maxY = bc.by;
        });

        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        if (w <= 0 || h <= 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        const imgData = tempCtx.createImageData(w, h);

        blockColors.forEach(bc => {
            const finalColor = findClosestPaletteColor(bc.r, bc.g, bc.b);
            const x = bc.bx - minX;
            const y = bc.by - minY;
            const idx = (y * w + x) * 4;
            imgData.data[idx] = finalColor[0];
            imgData.data[idx + 1] = finalColor[1];
            imgData.data[idx + 2] = finalColor[2];
            imgData.data[idx + 3] = 255;
        });
        tempCtx.putImageData(imgData, 0, 0);

        const a = document.createElement('a');
        a.href = tempCanvas.toDataURL('image/png');
        a.download = `pixel-art-${w}x${h}.png`;
        a.click();
    });

    const gridColorTrigger = document.getElementById('grid-color-trigger');
    const gridPickerPopover = document.getElementById('grid-picker-popover');
    const gridColorPreview = document.getElementById('grid-color-preview');

    gridColorTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = gridPickerPopover.style.display === 'block';
        gridPickerPopover.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (gridPickerPopover && !gridPickerPopover.contains(e.target) && e.target !== gridColorTrigger) {
            gridPickerPopover.style.display = 'none';
        }
    });

    gridColorInput.addEventListener('input', (e) => {
        gridColorPreview.style.backgroundColor = e.target.value;
        if (!loadedImage) return;
        drawGridOverlay();
    });

    gridAlphaInput.addEventListener('input', (e) => {
        gridAlphaVal.textContent = parseFloat(e.target.value).toFixed(2);
        if (!loadedImage) return;
        drawGridOverlay();
    });

    gridVisibleInput.addEventListener('change', () => {
        if (!loadedImage) return;
        drawGridOverlay();
    });

    origCanvas.addEventListener('mousedown', (e) => {
        if (!loadedImage) return;

        const rect = origCanvas.getBoundingClientRect();
        const scaleX = origCanvas.width / rect.width;
        const scaleY = origCanvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (x < 0 || x >= processingWidth || y < 0 || y >= processingHeight) return;

        // Check if clicked near an existing marker
        const hitRadius = 24 * scaleX;
        let clickedMarkerId = null;
        let minDist = Infinity;

        for (let i = 0; i < samplePoints.length; i++) {
            const p = samplePoints[i];
            const dist = Math.hypot(p.x - x, p.y - y);
            if (dist <= hitRadius && dist < minDist) {
                minDist = dist;
                clickedMarkerId = p.id;
            }
        }

        if (clickedMarkerId !== null) {
            if (e.altKey) {
                // Delete with Alt
                const idx = samplePoints.findIndex(p => p.id === clickedMarkerId);
                if (idx !== -1) {
                    samplePoints.splice(idx, 1);
                    currentPalette = samplePoints.map(p => [p.r, p.g, p.b]);
                    renderMarkers();
                    debounceProcess(false);
                }
            } else {
                draggingMarkerId = clickedMarkerId;
            }
        } else if (!e.altKey) {
            const pt = addSamplePoint(x, y);
            draggingMarkerId = pt.id;
        }
    });

    origCanvas.addEventListener('mousemove', (e) => {
        if (!loadedImage || draggingMarkerId === null) return;

        const rect = origCanvas.getBoundingClientRect();
        const scaleX = origCanvas.width / rect.width;
        const scaleY = origCanvas.height / rect.height;

        let x = Math.floor((e.clientX - rect.left) * scaleX);
        let y = Math.floor((e.clientY - rect.top) * scaleY);
        x = Math.max(0, Math.min(processingWidth - 1, x));
        y = Math.max(0, Math.min(processingHeight - 1, y));

        const pt = samplePoints.find(p => p.id === draggingMarkerId);
        if (pt) {
            pt.x = x; pt.y = y;
            const c = getPixelColor(x, y);
            pt.r = c[0]; pt.g = c[1]; pt.b = c[2];
            currentPalette = samplePoints.map(p => [p.r, p.g, p.b]);
            renderMarkers();
            renderResult(false);
        }
    });

    window.addEventListener('mouseup', () => {
        if (draggingMarkerId !== null) {
            draggingMarkerId = null;
        }
    });

    function getPixelColor(x, y) {
        const pixelData = ctxClean.getImageData(x, y, 1, 1).data;
        return [pixelData[0], pixelData[1], pixelData[2]];
    }

    function addSamplePoint(x, y) {
        const c = getPixelColor(x, y);
        const pt = { id: nextMarkerId++, x, y, r: c[0], g: c[1], b: c[2] };
        samplePoints.push(pt);
        currentPalette = samplePoints.map(p => [p.r, p.g, p.b]);
        renderMarkers();
        debounceProcess(false);
        return pt;
    }

    function updateCleanCanvas() {
        cleanCanvas.width = processingWidth;
        cleanCanvas.height = processingHeight;
        ctxClean.filter = `blur(${blurAmountInput.value}px)`;
        ctxClean.drawImage(loadedImage, 0, 0, processingWidth, processingHeight);
        ctxClean.filter = 'none';
    }

    function renderMarkers() {
        markersContainer.innerHTML = '';
        const rect = origCanvas.getBoundingClientRect();
        // Calculate the drawing scale between CSS pixels and Canvas native pixels
        const scaleX = rect.width / origCanvas.width;
        const scaleY = rect.height / origCanvas.height;

        samplePoints.forEach((pt) => {
            const el = document.createElement('div');
            el.className = 'sample-marker';
            el.style.left = (pt.x * scaleX) + 'px';
            el.style.top = (pt.y * scaleY) + 'px';
            el.style.backgroundColor = `rgb(${pt.r}, ${pt.g}, ${pt.b})`;
            markersContainer.appendChild(el);
        });
    }

    function debounceProcess(recalculateBlocks) {
        if (!loadedImage) return;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            runPipeline(recalculateBlocks);
        }, 150);
    }

    function runPipeline(recalculateBlocks) {
        if (!loadedImage) return;

        if (recalculateBlocks) {
            extractBlockColors();
        }

        renderResult();
    }

    // Step 1: Extract colors for the grid center points
    function extractBlockColors() {
        // Render raw image first to read data
        ctxOrig.drawImage(loadedImage, 0, 0, processingWidth, processingHeight);
        const imageData = ctxOrig.getImageData(0, 0, processingWidth, processingHeight).data;

        const method = sampleMethodInput.value;
        const resWidth = parseInt(gridSizeInput.value);
        const size = processingWidth / resWidth;
        const offsetX = parseInt(offsetXInput.value);
        const offsetY = parseInt(offsetYInput.value);

        // Let's create a generous bound for grid iterating
        const minBx = Math.floor(-offsetX / size) - 1;
        const minBy = Math.floor(-offsetY / size) - 1;
        const maxBx = Math.ceil((processingWidth - offsetX) / size) + 1;
        const maxBy = Math.ceil((processingHeight - offsetY) / size) + 1;

        blockColors = [];

        for (let by = minBy; by < maxBy; by++) {
            for (let bx = minBx; bx < maxBx; bx++) {
                const gX = offsetX + bx * size;
                const gY = offsetY + by * size;

                if (method === 'center') {
                    let cx = Math.floor(gX + size / 2);
                    let cy = Math.floor(gY + size / 2);
                    if (cx >= 0 && cy >= 0 && cx < processingWidth && cy < processingHeight) {
                        const idx = (cy * processingWidth + cx) * 4;
                        blockColors.push({
                            bx: bx, by: by,
                            r: imageData[idx], g: imageData[idx + 1], b: imageData[idx + 2]
                        });
                    }
                } else {
                    const startX = Math.max(0, Math.floor(gX));
                    const startY = Math.max(0, Math.floor(gY));
                    const endX = Math.min(processingWidth, Math.floor(gX + size));
                    const endY = Math.min(processingHeight, Math.floor(gY + size));

                    if (startX >= processingWidth || startY >= processingHeight || endX <= 0 || endY <= 0) continue;

                    if (method === 'average') {
                        let r = 0, g = 0, b = 0, cnt = 0;
                        for (let yy = startY; yy < endY; yy++) {
                            for (let xx = startX; xx < endX; xx++) {
                                const idx = (yy * processingWidth + xx) * 4;
                                r += imageData[idx]; g += imageData[idx + 1]; b += imageData[idx + 2];
                                cnt++;
                            }
                        }
                        if (cnt > 0) {
                            blockColors.push({ bx, by, r: Math.round(r / cnt), g: Math.round(g / cnt), b: Math.round(b / cnt) });
                        }
                    } else if (method === 'dominant') {
                        const map = new Map();
                        let maxCnt = 0;
                        let domR = 0, domG = 0, domB = 0;
                        for (let yy = startY; yy < endY; yy++) {
                            for (let xx = startX; xx < endX; xx++) {
                                const idx = (yy * processingWidth + xx) * 4;
                                const tr = imageData[idx], tg = imageData[idx + 1], tb = imageData[idx + 2];
                                // Group similar pixels to reduce noise
                                const key = (Math.round(tr / 4) << 16) | (Math.round(tg / 4) << 8) | Math.round(tb / 4);
                                const cnt = (map.get(key) || 0) + 1;
                                map.set(key, cnt);
                                if (cnt > maxCnt) {
                                    maxCnt = cnt;
                                    domR = tr; domG = tg; domB = tb;
                                }
                            }
                        }
                        if (maxCnt > 0) {
                            blockColors.push({ bx, by, r: domR, g: domG, b: domB });
                        }
                    }
                }
            }
        }
    }



    // closest match 
    function findClosestPaletteColor(r, g, b) {
        if (currentPalette.length === 0) return [0, 0, 0];
        let minDist = Infinity;
        let best = currentPalette[0];

        for (let i = 0; i < currentPalette.length; i++) {
            const pr = currentPalette[i][0];
            const pg = currentPalette[i][1];
            const pb = currentPalette[i][2];
            const dist = getColorDistance(r, g, b, pr, pg, pb, distanceMetricInput.value);

            if (dist < minDist) {
                minDist = dist;
                best = currentPalette[i];
            }
        }
        return best;
    }

    // Render step
    function renderResult(isPreview = false) {
        if (isPreview && previewColor) {
            currentPalette.push(previewColor);
        }

        const resWidth = parseInt(gridSizeInput.value);
        const size = processingWidth / resWidth;
        const offsetX = parseInt(offsetXInput.value);
        const offsetY = parseInt(offsetYInput.value);

        // Map blocks to closest palette color
        const resultImageData = new ImageData(processingWidth, processingHeight);
        const outData = resultImageData.data;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let i = 0; i < blockColors.length; i++) {
            const bc = blockColors[i];

            if (bc.bx < minX) minX = bc.bx;
            if (bc.by < minY) minY = bc.by;
            if (bc.bx > maxX) maxX = bc.bx;
            if (bc.by > maxY) maxY = bc.by;

            const finalColor = findClosestPaletteColor(bc.r, bc.g, bc.b);

            const startX = Math.floor(offsetX + bc.bx * size);
            const startY = Math.floor(offsetY + bc.by * size);
            const endX = Math.floor(offsetX + (bc.bx + 1) * size);
            const endY = Math.floor(offsetY + (bc.by + 1) * size);

            for (let y = Math.max(0, startY); y < Math.min(processingHeight, endY); y++) {
                for (let x = Math.max(0, startX); x < Math.min(processingWidth, endX); x++) {
                    const idx = (y * processingWidth + x) * 4;
                    outData[idx] = finalColor[0];
                    outData[idx + 1] = finalColor[1];
                    outData[idx + 2] = finalColor[2];
                    outData[idx + 3] = 255;
                }
            }
        }

        ctxRes.putImageData(resultImageData, 0, 0);

        if (isPreview && previewColor) {
            currentPalette.pop();
        }

        updatePaletteUI();
        drawGridOverlay();

        const resW = maxX - minX + 1;
        const resH = maxY - minY + 1;

        if (blockColors.length > 0 && resW > 0 && resH > 0) {
            resultResolutionVal.style.display = 'inline-block';
            resultResolutionVal.textContent = `${resW} × ${resH} px`;
        } else {
            resultResolutionVal.style.display = 'none';
        }
    }

    function drawGridOverlay() {
        if (!loadedImage) return;

        // Reset to raw image
        ctxOrig.drawImage(cleanCanvas, 0, 0, processingWidth, processingHeight);

        if (!gridVisibleInput.checked) return;

        const resWidth = parseInt(gridSizeInput.value);
        const size = processingWidth / resWidth;
        const offsetX = parseInt(offsetXInput.value);
        const offsetY = parseInt(offsetYInput.value);
        const alpha = parseFloat(gridAlphaInput.value);

        ctxOrig.strokeStyle = gridColorInput.value;
        ctxOrig.globalAlpha = alpha;
        ctxOrig.lineWidth = 2;

        ctxOrig.beginPath();
        // vertical lines
        let startX = offsetX % size;
        if (startX < 0) startX += size;
        // Adjust for floating point edge cases
        for (let x = startX; x <= processingWidth + size; x += size) {
            if (x >= 0 && x <= processingWidth) {
                ctxOrig.moveTo(Math.floor(x) + 0.5, 0);
                ctxOrig.lineTo(Math.floor(x) + 0.5, processingHeight);
            }
        }

        // horizontal lines
        let startY = offsetY % size;
        if (startY < 0) startY += size;
        for (let y = startY; y <= processingHeight + size; y += size) {
            if (y >= 0 && y <= processingHeight) {
                ctxOrig.moveTo(0, Math.floor(y) + 0.5);
                ctxOrig.lineTo(processingWidth, Math.floor(y) + 0.5);
            }
        }
        ctxOrig.stroke();
        ctxOrig.globalAlpha = 1.0;
    }

    // UI functions
    function updatePaletteUI() {
        paletteCountVal.textContent = currentPalette.length;

        paletteContainer.innerHTML = '';
        if (currentPalette.length === 0) {
            paletteContainer.innerHTML = '<div class="empty-palette">Нет цветов</div>';
            return;
        }

        const sortedPalette = [...currentPalette].sort((a, b) => {
            if (sortModes[currentSortIndex] === 'hsv') {
                const hsvA = rgbToHsv(a[0], a[1], a[2]);
                const hsvB = rgbToHsv(b[0], b[1], b[2]);
                const hueA = Math.round(hsvA.h * 24);
                const hueB = Math.round(hsvB.h * 24);
                if (hueA !== hueB) return hueA - hueB;
                if (Math.abs(hsvA.v - hsvB.v) > 0.1) return hsvB.v - hsvA.v;
                return hsvB.s - hsvA.s;
            } else if (sortModes[currentSortIndex] === 'luma') {
                const lumaA = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
                const lumaB = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
                return lumaB - lumaA;
            } else { // rgb
                const valA = (a[0] << 16) | (a[1] << 8) | a[2];
                const valB = (b[0] << 16) | (b[1] << 8) | b[2];
                return valB - valA;
            }
        });

        for (let i = 0; i < sortedPalette.length; i++) {
            const color = sortedPalette[i];
            const hex = rgbToHex(color[0], color[1], color[2]);
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = hex;

            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = hex;

            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'swatch-delete';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = "Удалить цвет";

            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                // Find and remove from main currentPalette array
                const index = currentPalette.findIndex(c => c[0] === color[0] && c[1] === color[1] && c[2] === color[2]);
                // Also remove marker
                const markerIdx = samplePoints.findIndex(p => p.r === color[0] && p.g === color[1] && p.b === color[2]);
                if (markerIdx !== -1) {
                    samplePoints.splice(markerIdx, 1);
                }
                if (index !== -1) {
                    currentPalette.splice(index, 1);
                }
                renderMarkers();
                renderResult();
            };

            swatch.appendChild(tooltip);
            swatch.appendChild(deleteBtn);
            paletteContainer.appendChild(swatch);
        }
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, v };
    }

    function getColorDistance(r1, g1, b1, r2, g2, b2, metric) {
        if (metric === 'rgb') {
            const dr = r1 - r2; const dg = g1 - g2; const db = b1 - b2;
            return dr * dr + dg * dg + db * db;
        } else if (metric === 'hsv') {
            const hsv1 = rgbToHsv(r1, g1, b1);
            const hsv2 = rgbToHsv(r2, g2, b2);

            let dh = Math.abs(hsv1.h - hsv2.h);
            if (dh > 0.5) dh = 1 - dh; // wrap around cylinder

            const ds = hsv1.s - hsv2.s;
            const dv = hsv1.v - hsv2.v;

            // Weight Hue heavily only if color is saturated (hue of greys is meaningless)
            const weight = Math.sqrt(hsv1.s * hsv2.s);
            // Empirically scaled weights to roughly match standard distance magnitude
            return dh * dh * Math.max(weight, 0.1) * 400 + ds * ds * 100 + dv * dv * 100;
        } else {
            // perceptual
            const dr = r1 - r2; const dg = g1 - g2; const db = b1 - b2;
            return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        }
    }
});
