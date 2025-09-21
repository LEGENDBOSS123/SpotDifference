const upload = document.getElementById('upload');
const imagesDiv = document.getElementById('images');
const statusDiv = document.getElementById('status');
const incorrectGuessesDiv = document.getElementById('incorrectGuesses');
const revealAllButton = document.getElementById('revealAll');

let gameState = {
    regions: [],
    remaining: 0,
    contexts: {},
    incorrectGuesses: 0
};

upload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
        generateDifferenceGame(img);
    };
});


async function generateDifferenceGame(img) {
    imagesDiv.innerHTML = '';
    updateStatus('Generating differences...');

    const maxDim = 800;
    let width = img.width;
    let height = img.height;
    if (width > height) {
        if (width > maxDim) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
        }
    } else {
        if (height > maxDim) {
            width = Math.round(width * maxDim / height);
            height = maxDim;
        }
    }

    const canvasOrig = document.createElement('canvas');
    const ctxOrig = canvasOrig.getContext('2d');
    canvasOrig.width = width;
    canvasOrig.height = height;
    ctxOrig.drawImage(img, 0, 0, width, height);
    imagesDiv.appendChild(canvasOrig);

    const canvasModified = document.createElement('canvas');
    const ctxModified = canvasModified.getContext('2d');
    canvasModified.width = width;
    canvasModified.height = height;
    ctxModified.drawImage(canvasOrig, 0, 0, width, height);
    imagesDiv.appendChild(canvasModified);

    const imageData = ctxOrig.getImageData(0, 0, width, height);
    const edgeData = applySobel(imageData);

    const regions = findRegions(edgeData, width, height);

    const numDifferences = 5;
    const shuffledRegions = regions.sort(() => 0.5 - Math.random());
    const selectedRegions = shuffledRegions.slice(0, numDifferences);

    const modificationFunctions = [applyRemoval, applyFlip, applyColorShift];
    for (let i = 0; i < selectedRegions.length; i++) {
        const region = selectedRegions[i];
        const modFn = modificationFunctions[i % modificationFunctions.length];
        modFn(canvasOrig, canvasModified, region);
        // applyColorShift(canvasOrig, canvasModified, region);
    }

    gameState.regions = selectedRegions.map(r => ({ ...r, found: false }));
    gameState.remaining = selectedRegions.length;
    gameState.contexts = { orig: ctxOrig, modified: ctxModified };
    gameState.incorrectGuesses = 0;

    updateStatus();
    if (gameState.remaining == 0) {
        statusDiv.textContent = 'No differences could be generated, please try another image.';
    }
    canvasModified.addEventListener('click', handleCanvasClick);
    canvasOrig.addEventListener('click', handleCanvasClick);
    revealAllButton.classList.remove('disabled');
}


function handleCanvasClick(event) {
    if (gameState.remaining === 0) return;

    const rect = event.target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    let foundDifference = false;

    for (const region of gameState.regions) {
        if (!region.found) {
            const { bbox } = region;
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;

            const distance = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2));
            const tolerance = (bbox.width + bbox.height) / 3;
            if (distance < tolerance) {
                region.found = true;
                gameState.remaining--;
                foundDifference = true;

                drawCircle(gameState.contexts.orig, bbox);
                drawCircle(gameState.contexts.modified, bbox);

                updateStatus();
                break;
            }
        }
    }

    if (!foundDifference) {
        gameState.incorrectGuesses++;
        updateStatus();
    }
}

function revealAll() {
    for (const region of gameState.regions) {
        if (!region.found) {
            region.found = true;
            gameState.remaining--;
            drawCircle(gameState.contexts.orig, region.bbox);
            drawCircle(gameState.contexts.modified, region.bbox);
        }
    }
    updateStatus();
}

revealAllButton.addEventListener('click', revealAll);


function updateStatus(overrideMessage = '') {
    if (overrideMessage) {
        statusDiv.textContent = overrideMessage;
        return;
    }

    if (gameState.remaining > 0) {
        statusDiv.textContent = `${gameState.remaining} difference(s) to go!`;
    } else {
        statusDiv.textContent = `Congratulations, you found them all! Choose another image to play again!`;
        confetti();
        revealAllButton.classList.add('disabled');
    }

    incorrectGuessesDiv.textContent = `Incorrect Clicks: ${gameState.incorrectGuesses}`;
}


function drawCircle(ctx, bbox) {
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const radius = Math.max(bbox.width, bbox.height) / 2 + 10;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.stroke();
}



function applySobel(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const edgeData = new ImageData(width, height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const val = gray[(y + ky) * width + (x + kx)];
                    gx += val * gxKernel[(ky + 1) * 3 + (kx + 1)];
                    gy += val * gyKernel[(ky + 1) * 3 + (kx + 1)];
                }
            }
            const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
            const idx = (y * width + x) * 4;
            edgeData.data[idx] = edgeData.data[idx + 1] = edgeData.data[idx + 2] = mag;
            edgeData.data[idx + 3] = 255;
        }
    }
    return edgeData;
}

function findRegions(edgeData, width, height) {
    const regions = [];
    const visited = new Uint8Array(width * height);
    const maxAttempts = 3000;
    for (let i = 0; i < maxAttempts && regions.length < 50; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        if (visited[y * width + x] === 0) {
            const region = floodFill(edgeData, width, height, x, y, visited);
            if (region) regions.push(region);
        }
    }
    return regions;
}

function floodFill(edgeData, width, height, startX, startY, visited) {
    const stack = [[startX, startY]];
    const data = edgeData.data;
    if (data[(startY * width + startX) * 4] > 125) return null;
    const pixelsInRegion = [];
    let minX = width, minY = height, maxX = -1, maxY = -1;
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const index = y * width + x;
        if (visited[index] === 1 || data[index * 4] > 50) continue;
        visited[index] = 1;
        pixelsInRegion.push({ x, y });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (pixelsInRegion.length < 500 || pixelsInRegion.length > 1000) return null;
    return { pixels: pixelsInRegion, bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

function applyRemoval(canvasOrig, canvasModified, region) {
    const ctx = canvasModified.getContext('2d');
    const { bbox } = region;
    let sourceX = bbox.x + bbox.width;
    if (sourceX + bbox.width > canvasModified.width) sourceX = bbox.x - bbox.width;
    ctx.drawImage(canvasOrig, sourceX, bbox.y, bbox.width, bbox.height, bbox.x, bbox.y, bbox.width, bbox.height);
}

function applyColorShift(canvasOrig, canvasModified, region) {
    const ctx = canvasModified.getContext('2d');
    const { bbox, pixels } = region;
    const imageData = ctx.getImageData(bbox.x, bbox.y, bbox.width, bbox.height);
    const data = imageData.data;
    var rng = [Math.floor(Math.random() * 51), Math.floor(Math.random() * 51), Math.floor(Math.random() * 51)];
    for (const pixel of pixels) {
        const index = ((pixel.y - bbox.y) * bbox.width + (pixel.x - bbox.x)) * 4;
        data[index] = Math.min(255, data[index] + rng[0] * 1);
        data[index + 1] = Math.max(0, data[index + 1] - rng[1] * 1);
        data[index + 2] = Math.max(0, data[index + 2] - rng[2] * 1);
    }
    ctx.putImageData(imageData, bbox.x, bbox.y);
}

function applyFlip(canvasOrig, canvasModified, region) {
    const ctx = canvasModified.getContext('2d');
    const { bbox } = region;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = bbox.width;
    tempCanvas.height = bbox.height;
    tempCtx.drawImage(canvasOrig, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);
    ctx.clearRect(bbox.x, bbox.y, bbox.width, bbox.height);
    ctx.save();
    ctx.translate(bbox.x + bbox.width, bbox.y);
    ctx.scale(-1, 1);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
}

function confetti() {
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b'];
    const numberOfPieces = 100;

    for (let i = 0; i < numberOfPieces; i++) {
        const piece = document.createElement('div');
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomSize = Math.floor(Math.random() * 10) + 5;
        const randomLeft = Math.random() * 100;
        const randomDelay = Math.random() * 2;
        const randomDuration = Math.random() * 4 + 2;

        piece.style.backgroundColor = randomColor;
        piece.style.left = `${randomLeft}vw`;
        piece.style.top = `-20px`;
        piece.style.setProperty('--size', `${randomSize}px`);
        piece.style.setProperty('--delay', `${randomDelay}s`);
        piece.style.setProperty('--duration', `${randomDuration}s`);

        if (Math.random() < 0.5) {
            piece.style.borderRadius = '50%';
        } else {
            piece.style.borderRadius = '2px';
        }

        piece.className = 'confetti-piece';
        document.body.appendChild(piece);

        piece.addEventListener('animationend', () => {
            piece.remove();
        });
    }
}