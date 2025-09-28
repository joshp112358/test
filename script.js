/**
 * MNIST Live Tester - JavaScript
 * 
 * This script handles:
 * - Canvas drawing functionality (mouse and touch)
 * - Image preprocessing for MNIST model
 * - TensorFlow.js model loading and prediction
 * - UI updates and speech synthesis
 * 
 * Author: Generated from single-file HTML
 * Dependencies: TensorFlow.js
 */

// ===== DOM ELEMENT REFERENCES =====
// Get references to all the DOM elements we'll need
const canvas = document.getElementById('board');           // Main drawing canvas
const ctx = canvas.getContext('2d');                      // 2D drawing context
const thumb = document.getElementById('thumb');            // Preview thumbnail canvas
const tctx = thumb.getContext('2d');                      // Thumbnail drawing context
const probsEl = document.getElementById('probs');         // Prediction results container
const topline = document.getElementById('topline');       // Main prediction display
const statusEl = document.getElementById('status');       // Status text element
const modelNameEl = document.getElementById('modelName'); // Model name display

// ===== DRAWING STATE VARIABLES =====
// Configuration for drawing strokes
const stroke = { 
  color: '#fff',    // White ink color
  size: 22,         // Brush size in pixels
  cap: 'round',     // Round line caps
  join: 'round'     // Round line joins
};

// Drawing state tracking
let drawing = false;    // Whether user is currently drawing
let last = null;        // Last mouse/touch position
let strokes = [];       // Array of completed stroke paths
let path = [];          // Current stroke being drawn

// ===== CANVAS DRAWING FUNCTIONS =====

/**
 * Reset the canvas to a black background
 * This prepares the canvas for new drawings
 */
function resetCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draw a line segment between two points
 * @param {Object} p0 - Starting point {x, y}
 * @param {Object} p1 - Ending point {x, y}
 */
function drawPathSegment(p0, p1) {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = stroke.cap;
  ctx.lineJoin = stroke.join;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}

/**
 * Start a new drawing stroke
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function startDraw(x, y) {
  drawing = true;
  last = {x, y};
  path = [{x, y}];
}

/**
 * Continue drawing the current stroke
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function moveDraw(x, y) {
  if (!drawing) return;
  
  const p = {x, y};
  drawPathSegment(last, p);
  last = p;
  path.push(p);
}

/**
 * End the current drawing stroke
 * Saves the completed stroke and updates the preview
 */
function endDraw() {
  if (!drawing) return;
  
  drawing = false;
  
  // Only save strokes that have more than one point
  if (path.length > 1) {
    strokes.push(path);
  }
  
  path = [];
  preview(); // Update the 28x28 preview
}

/**
 * Redraw all saved strokes on the canvas
 * Used for undo functionality
 */
function redrawAll() {
  resetCanvas();
  
  // Redraw each stroke by connecting all its points
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      drawPathSegment(stroke[i-1], stroke[i]);
    }
  }
}

// ===== EVENT LISTENERS =====

// Mouse event handlers
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  startDraw(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener('mousemove', (e) => {
  if (!drawing) return;
  const rect = canvas.getBoundingClientRect();
  moveDraw(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener('mouseup', endDraw);

// Touch event handlers for mobile devices
canvas.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  startDraw(touch.clientX - rect.left, touch.clientY - rect.top);
  e.preventDefault(); // Prevent scrolling
}, {passive: false});

canvas.addEventListener('touchmove', (e) => {
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  moveDraw(touch.clientX - rect.left, touch.clientY - rect.top);
  e.preventDefault(); // Prevent scrolling
}, {passive: false});

canvas.addEventListener('touchend', endDraw);

// Button event handlers
document.getElementById('clearBtn').addEventListener('click', () => {
  strokes = [];
  resetCanvas();
  preview();
});

document.getElementById('undoBtn').addEventListener('click', () => {
  strokes.pop(); // Remove the last stroke
  redrawAll();
  preview();
});

document.getElementById('predictBtn').addEventListener('click', predict);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'Enter':
      predict();
      break;
    case 'c':
    case 'C':
      strokes = [];
      resetCanvas();
      preview();
      break;
    case 'z':
    case 'Z':
      strokes.pop();
      redrawAll();
      preview();
      break;
  }
});

// ===== IMAGE PREPROCESSING =====

/**
 * Convert the canvas drawing to a 28x28 pixel image
 * This matches the input format expected by MNIST models
 * @returns {HTMLCanvasElement} 28x28 canvas with the processed image
 */
function get28x28() {
  // Get the current canvas image data
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const {data, width, height} = src;
  
  // Find the bounding box of all drawn pixels
  let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4; // RGBA pixel index
      const v = data[i]; // Red channel (sufficient for grayscale)
      
      if (v > 10) { // Threshold to detect ink
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  // If nothing was drawn, return a blank 28x28 canvas
  if (!found) {
    const out = document.createElement('canvas');
    out.width = 28;
    out.height = 28;
    const octx = out.getContext('2d');
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, 28, 28);
    return out;
  }
  
  // Calculate bounding box dimensions
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  
  // Create a square bounding box with padding
  const size = Math.max(bw, bh);
  const pad = Math.round(size * 0.20); // 20% padding
  const boxSize = size + pad * 2;
  
  // Create intermediate canvas with the cropped and padded image
  const box = document.createElement('canvas');
  box.width = boxSize;
  box.height = boxSize;
  const bctx = box.getContext('2d');
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, boxSize, boxSize);
  bctx.drawImage(canvas, minX - pad, minY - pad, boxSize, boxSize, 0, 0, boxSize, boxSize);
  
  // Resize to 28x28 using nearest-neighbor to preserve sharp edges
  const out = document.createElement('canvas');
  out.width = 28;
  out.height = 28;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false; // Nearest-neighbor scaling
  octx.drawImage(box, 0, 0, 28, 28);
  
  return out;
}

/**
 * Update the 28x28 preview thumbnail
 * Shows the user what the model will actually see
 */
function preview() {
  const processedCanvas = get28x28();
  
  // Scale up the 28x28 image to fit the thumbnail (4x scaling)
  tctx.imageSmoothingEnabled = false;
  tctx.fillStyle = '#000';
  tctx.fillRect(0, 0, thumb.width, thumb.height);
  tctx.drawImage(processedCanvas, 0, 0, processedCanvas.width, processedCanvas.height, 
                 0, 0, thumb.width, thumb.height);
}

// ===== TENSORFLOW.JS MODEL HANDLING =====

let model = null; // Will hold the loaded TensorFlow.js model

/**
 * Load the MNIST model from the /model directory
 * Expects model.json and associated weight files
 */
async function loadModel() {
  try {
    model = await tf.loadLayersModel('./model/model.json');
    const modelName = model?.name || 'mnist-cnn';
    modelNameEl.textContent = modelName;
    statusEl.innerHTML = `Model: <span id="modelName">${modelName}</span>`;
    console.log('Model loaded successfully:', modelName);
  } catch (err) {
    modelNameEl.textContent = 'Not found (place model at /model/model.json)';
    console.error('Failed to load model:', err);
  }
}

// ===== SPEECH SYNTHESIS =====

/**
 * Speak the predicted digit using the Web Speech API
 * @param {string|number} text - The text/number to speak
 */
function speak(text) {
  try {
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Cancel any ongoing speech and speak the new text
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  } catch (error) {
    // Silently fail if speech synthesis is not available
    console.warn('Speech synthesis not available:', error);
  }
}

// ===== PREDICTION LOGIC =====

/**
 * Run prediction on the current drawing
 * Processes the image and displays results with confidence bars
 */
async function predict() {
  // Update the preview first
  preview();
  
  // Check if model is loaded
  if (!model) {
    topline.textContent = '–';
    statusEl.textContent = 'Model not loaded. Place it at /model/model.json';
    return;
  }
  
  // Get the processed 28x28 image
  const processedCanvas = get28x28();
  
  // Create a temporary canvas to extract image data
  const tmp = document.createElement('canvas');
  tmp.width = 28;
  tmp.height = 28;
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.drawImage(processedCanvas, 0, 0);
  const imageData = tmpCtx.getImageData(0, 0, 28, 28);
  
  // Prepare input tensor for the model
  const input = tf.tidy(() => {
    // Convert RGBA image data to grayscale values [0,1]
    const buffer = new Float32Array(28 * 28);
    
    for (let i = 0; i < 28 * 28; i++) {
      const r = imageData.data[i * 4 + 0];     // Red channel
      const g = imageData.data[i * 4 + 1];     // Green channel
      const b = imageData.data[i * 4 + 2];     // Blue channel
      const a = imageData.data[i * 4 + 3] / 255; // Alpha channel (normalized)
      
      // Convert to grayscale using standard luminance formula
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255 * a;
      buffer[i] = gray; // Value between 0 and 1
    }
    
    // Create tensor with shape [batch_size, height, width, channels]
    const tensor = tf.tensor(buffer, [1, 28, 28, 1]);
    return tensor;
  });
  
  // Run the model prediction
  const logits = model.predict(input);
  const probabilities = (await logits.data()).slice();
  
  // Clean up tensors to prevent memory leaks
  tf.dispose([logits, input]);
  
  // Process results
  const results = [...probabilities]
    .map((probability, digit) => ({digit, probability}))
    .sort((a, b) => b.probability - a.probability); // Sort by confidence
  
  const topResults = results.slice(0, 5); // Get top 5 predictions
  const prediction = topResults[0].digit;
  
  // Update UI with results
  topline.textContent = String(prediction);
  statusEl.textContent = `Top-1 confidence: ${(topResults[0].probability * 100).toFixed(1)}%`;
  
  // Speak the prediction
  speak(prediction);
  
  // Render confidence bars for all digits (0-9)
  probsEl.innerHTML = '';
  for (const {digit, probability} of results) {
    // Create row container
    const row = document.createElement('div');
    row.className = 'row';
    
    // Digit label
    const label = document.createElement('div');
    label.textContent = digit;
    label.style.minWidth = '18px';
    label.style.textAlign = 'center';
    
    // Progress meter container
    const meter = document.createElement('div');
    meter.className = 'meter';
    
    // Progress bar
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = `${(probability * 100).toFixed(1)}%`;
    
    // Percentage text
    const percentageText = document.createElement('div');
    percentageText.className = 'pred';
    percentageText.textContent = `${(probability * 100).toFixed(1)}%`;
    
    // Assemble the row
    meter.appendChild(bar);
    row.append(label, meter, percentageText);
    probsEl.appendChild(row);
  }
}

// ===== INITIALIZATION =====

/**
 * Initialize the application
 * Called when the page loads
 */
function init() {
  console.log('Initializing MNIST Live Tester...');
  
  // Set up the canvas
  resetCanvas();
  
  // Create initial preview
  preview();
  
  // Load the TensorFlow.js model
  loadModel();
  
  console.log('Initialization complete');
}

// Start the application when the page loads
document.addEventListener('DOMContentLoaded', init);

// Also run init immediately in case DOMContentLoaded has already fired
if (document.readyState === 'loading') {
  // Document is still loading, wait for DOMContentLoaded
} else {
  // Document has already loaded
  init();
}
