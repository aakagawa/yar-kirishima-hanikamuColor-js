const canvas = document.getElementById('canvas');
let gl = canvas.getContext('webgl2');

if (!gl) {
  alert('WebGL not supported, falling back on experimental-webgl');
  gl = canvas.getContext('experimental-webgl');
}

if (!gl) {
  alert('Your browser does not support WebGL');
}

// Vertex shader for 180-degree rotation
const vertexShaderSourceMode1 = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    // Apply 180-degree rotation by flipping both x and y coordinates
    gl_Position = vec4(-a_position.x, -a_position.y, 0, 1); // Rotate 180 degrees
    v_texCoord = vec2(a_texCoord.x, a_texCoord.y); // Keep the texture coordinates as is
  }
`;


// Vertex shader program with 90-degree counterclockwise rotation
const vertexShaderSourceMode2 = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    // Apply 90-degree counterclockwise rotation
    gl_Position = vec4(-a_position.y, a_position.x, 0, 1); // Rotate 90 degrees counterclockwise
    v_texCoord = vec2(a_texCoord.x, a_texCoord.y); // Keep the texture coordinates as is    
  }
`;

// Fragment shader program
const fragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform float u_hueShift; // New uniform for hue shift

  // Function to convert RGB to HSV
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  // Function to convert HSV back to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec4 imageColor = texture2D(u_image, v_texCoord);

    // Convert RGB to HSV
    vec3 hsv = rgb2hsv(imageColor.rgb);

    // Shift hue
    hsv.x = mod(hsv.x + u_hueShift, 1.0);

    // Convert back to RGB
    vec3 rgb = hsv2rgb(hsv);

    gl_FragColor = vec4(rgb, imageColor.a);
  }
`;

// Compile shaders
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSourceMode1);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

// Link shaders into a program
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

let program = createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);

// Set up position and texture coordinate buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

const positions = [
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
];

gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);

const texCoords = [
  0, 1,
  1, 1,
  0, 0,
  1, 0,
];

gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(positionLocation);
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
gl.enableVertexAttribArray(texCoordLocation);
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

// Set the WebGL viewport to match the canvas size
gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
gl.clearColor(0.0, 0.0, 0.0, 0.0); // Set clear color to white (RGBA)

let imageTexture;
let imageData;
let axisSwapped = false;
let currentData = null;
let targetData = null;

let maxValue = 16000;
let mode1StartIndex = 120;
let mode1IndexRange = 200;
let mode2StartIndex = 140;
let mode2IndexRange = 180;
let dataResolution = 1920;
let interpolationSpeed = 0.01;

let steepness = 4;  // Controls the curve steepness; larger values make it sharper
let midpointDay = 0.6; 
let midpointNight = 0.3;

// Load and create texture from an image
const image = new Image();
image.src = './assets/hanikamu_01.png'; // Path to your preloaded image
image.onload = () => {
  const canvasTmp = document.createElement('canvas');
  const ctxTmp = canvasTmp.getContext('2d');

  const width = 2560;
  const height = 1280;
  canvasTmp.width = width;
  canvasTmp.height = height;
  ctxTmp.drawImage(image, 0, 0, width, height);

  imageData = ctxTmp.getImageData(0, 0, width, height);

  // Create and bind texture
  imageTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  console.log('Image texture loaded');

  drawScene();
  // WebSocket connection
  const ws = new WebSocket('ws://127.0.0.1:3030'); // Use your server's local IP address
  
  ws.onmessage = (event) => {
    const responseData = JSON.parse(event.data);
    
    let startIndex, indexRange;
  
    if (axisSwapped) {
      startIndex = mode2StartIndex;
      indexRange = mode2IndexRange;
    } else {
      startIndex = mode1StartIndex;
      indexRange = mode1IndexRange;
    }
  
    const endIndex = startIndex + indexRange;
    const trimmedData = responseData.d.slice(startIndex, endIndex);

    const maxValueForData = 100000;

    const biasedTrimmedData = trimmedData.map(value => {
        // Normalize the value first between 0 and 1
        const normalizedValue = value / maxValueForData;

        // Apply sigmoid-like function
        const biasedValue = 1 / (1 + Math.exp(-steepness * (normalizedValue - midpoint)));

        // Scale back up to the original value range
        return biasedValue * maxValueForData;
    });
    
    targetData = resampleData(biasedTrimmedData, dataResolution); // Adjust dataResolution if needed
    if (!currentData) currentData = targetData.slice(); // Initialize current data on the first run
  };

    // SSE connection to spectro_relay
  // const eventSource = new EventSource(
  //   'https://spectro-relay-5447580157.asia-northeast1.run.app/stream'
  // );

  ws.onmessage = (event) => {
    const responseData = JSON.parse(event.data);

    let startIndex, indexRange;

    if (axisSwapped) {
      startIndex = mode2StartIndex;
      indexRange = mode2IndexRange;
    } else {
      startIndex = mode1StartIndex;
      indexRange = mode1IndexRange;
    }

    const endIndex = startIndex + indexRange;
    const trimmedData = responseData.d.slice(startIndex, endIndex);

    const maxValueForData = 100000;

    const activeMidpoint = getCurrentMidpoint(); // Get the current midpoint based on time of day
    const biasedTrimmedData = trimmedData.map(value => {
      // Normalize the value first between 0 and 1
      const normalizedValue = value / maxValueForData;

      // Apply sigmoid-like function (use current midpoint based on time of day)
      const biasedValue = 1 / (1 + Math.exp(-steepness * (normalizedValue - activeMidpoint)));

      // Scale back up to the original value range
      return biasedValue * maxValueForData;
    });

    targetData = resampleData(biasedTrimmedData, dataResolution);
    if (!currentData) currentData = targetData.slice();
  };

  ws.onerror = () => {
    console.warn('SSE connection error / reconnecting...');
  };

  // Continuous interpolation
  function continuousInterpolation() {

    const now = performance.now();
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    const instantFPS = 1000 / dt;
    fps = 0.9 * fps + 0.1 * instantFPS; // Smoothed FPS

    if (currentData && targetData) {
      const interpolatedData = currentData.map((value, index) => {
        return value + (targetData[index] - value) * interpolationSpeed;
      });

      updateImage(interpolatedData, imageData, axisSwapped);

      // Update currentData towards targetData
      currentData = interpolatedData.slice();
    }

    requestAnimationFrame(continuousInterpolation);
  }

  continuousInterpolation(); // Start continuous interpolation
};

// Function to toggle axis every minute
function checkAxisSwap() {
  const currentHour = new Date().getHours();
  axisSwapped = currentHour % 2 === 0; // Even hour mode 2, odd hour mode 1
  program = reloadProgram(axisSwapped);  // Swap the axis by reloading shaders

  // Update the image with the current data and swap status (axisSwapped)
  if (currentData) {
    updateImage(currentData, imageData, axisSwapped);
  }

  requestAnimationFrame(checkAxisSwap);
}

// // Start axis swap check
checkAxisSwap();

// Function to check and apply midpoint mode
function getCurrentMidpoint() {
  const now = new Date();
  const timeInHours = now.getHours() + now.getMinutes() / 60;

  // 5:30 <= time < 17:30 => day
  return (timeInHours >= 5.5 && timeInHours < 17.5)
    ? midpointDay
    : midpointNight;
}

// Function to resample data using linear interpolation
function resampleData(data, targetLength) {
  const resampledData = new Array(targetLength);
  const factor = (data.length - 1) / (targetLength - 1);
  for (let i = 0; i < targetLength; i++) {
    const pos = i * factor;
    const low = Math.floor(pos);
    const high = Math.ceil(pos);
    const weight = pos - low;
    resampledData[i] = (1 - weight) * data[low] + weight * data[high];
  }
  return resampledData;
}

// Function to update the image based on data
function updateImage(data, imageData, isRotated) {
  const width = 2560;
  const height = 1280;

  const processedData = isRotated ? data.slice().reverse() : data;
  const rowsPerSample = height / data.length; // Each sample should correspond to about 1.54 rows

  const stretchedImageData = new Uint8Array(width * height * 4); // Array to hold stretched image data (RGBA for each pixel)

  for (let y = 0; y < processedData.length; y++) {
    const value = processedData[y] / maxValue; // Absolute value 
    const startRow = Math.floor(y * rowsPerSample); 
    const endRow = Math.floor((y + 1) * rowsPerSample);
    const rowWidth = Math.floor(width * value);

    for (let row = startRow; row < endRow; row++) {
      for (let x = 0; x < rowWidth; x++) {
        const srcIndex = (row * width + Math.floor(x / value)) * 4;
        const destIndex = (row * width + x) * 4;
        stretchedImageData[destIndex] = imageData.data[srcIndex];
        stretchedImageData[destIndex + 1] = imageData.data[srcIndex + 1];
        stretchedImageData[destIndex + 2] = imageData.data[srcIndex + 2];
        stretchedImageData[destIndex + 3] = imageData.data[srcIndex + 3];
      }
    }
  }

  if (!imageTexture) {
    imageTexture = gl.createTexture();
  }

  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, stretchedImageData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  drawScene();
}

let startTime = Date.now();

function updateHueShift() {
  // Calculate time elapsed in minutes
  const elapsedTime = (Date.now() - startTime) / 60000;
  const hueShift = (elapsedTime / 12) % 1.0;

  const hueShiftLocation = gl.getUniformLocation(program, 'u_hueShift');
  gl.uniform1f(hueShiftLocation, hueShift);

  drawScene();

  // Continue updating the hue shift
  requestAnimationFrame(updateHueShift);
}

// Start the hue shift animation
updateHueShift();

// Function to reload the program based on axis orientation
function reloadProgram(isRotated) {
  // Delete the current program
  gl.deleteProgram(program);

  // Compile shaders depending on the orientation
  const vertexShaderSource = isRotated ? vertexShaderSourceMode2 : vertexShaderSourceMode1;
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  
  // Create and link the new program
  const newProgram = createProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(newProgram);

  // Rebind buffers and attributes
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(gl.getAttribLocation(newProgram, 'a_position'), 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(gl.getAttribLocation(newProgram, 'a_position'));

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(gl.getAttribLocation(newProgram, 'a_texCoord'), 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(gl.getAttribLocation(newProgram, 'a_texCoord'));

  return newProgram;
}

// Function to draw the scene
function drawScene() {
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Initial draw
drawScene();

//-----------------------------------------------------
// GUI SYSTEM
//-----------------------------------------------------

let guiVisible = false;
let selectedParam = 0;
const NUM_PARAMS = 10;

/* FPS read-out (exponentially smoothed) */
let fps = 0.0;
let lastFrameTime = performance.now();

let textEntryActive = false;
let textEntryString = "";

const guiElement = document.getElementById("gui");

//-----------------------------------------------------
// PARAMETER ACCESS
//-----------------------------------------------------

const paramNames = [
"maxValue",
"mode1StartIndex",
"mode1IndexRange",
"mode2StartIndex",
"mode2IndexRange",
"dataResolution",
"interpolationSpeed",
"steepness",
"midpointDay",
"midpointNight"
];

const paramFormats = [
  v => v.toFixed(0), // maxValue
  v => v.toFixed(0), // mode1StartIndex
  v => v.toFixed(0), // mode1IndexRange
  v => v.toFixed(0), // mode2StartIndex
  v => v.toFixed(0), // mode2IndexRange
  v => v.toFixed(0), // dataResolution
  v => v.toFixed(3), // interpolationSpeed
  v => v.toFixed(1), // steepness
  v => v.toFixed(2), // midpointDay
  v => v.toFixed(2)  // midpointNight
];

function getParameterValue(i){
  switch(i){
    case 0:return maxValue;
    case 1:return mode1StartIndex;
    case 2:return mode1IndexRange;
    case 3:return mode2StartIndex;
    case 4:return mode2IndexRange;
    case 5:return dataResolution;
    case 6:return interpolationSpeed;
    case 7:return steepness;
    case 8:return midpointDay;
    case 9:return midpointNight;
  }
}

function setParameterValue(i,v){
  switch(i){
    case 0:maxValue=v;break;
    case 1:mode1StartIndex=v;break;
    case 2:mode1IndexRange=v;break;
    case 3:mode2StartIndex=v;break;
    case 4:mode2IndexRange=v;break;
    case 5:dataResolution=v;break;
    case 6:interpolationSpeed=v;break;
    case 7:steepness=v;break;
    case 8:midpointDay=v;break;
    case 9:midpointNight=v;break;

  }
}

//-----------------------------------------------------
// KEYBOARD INPUT
//-----------------------------------------------------

document.addEventListener("keydown", e => {

  if(e.shiftKey && e.key === "D"){
    loadDefaultSettings();
    return;
  }

  if(textEntryActive){
    handleTypingMode(e);
    return;
  }

  handleRegularGUI(e);
});

function handleRegularGUI(e){
  if(e.key === "g"){
    guiVisible = !guiVisible;
    if(!guiVisible) hideGUI();
    return;
  }

  if(!guiVisible) return;
  switch(e.key){
    case "ArrowUp":
      selectedParam = (selectedParam - 1 + NUM_PARAMS) % NUM_PARAMS;
      break;
    case "ArrowDown":
      selectedParam = (selectedParam + 1) % NUM_PARAMS;
      break;
    case "ArrowRight":
      adjustParameter(+1);
      break;
    case "ArrowLeft":
      adjustParameter(-1);
      break;
    case "Enter":
      textEntryActive = true;
      textEntryString = "";
      break;
  }
}

function handleTypingMode(e){
  if(e.key === "Enter"){
    commitTyping();
    return;
  }
  if(e.key === "Escape"){
    textEntryActive = false;
    textEntryString = "";
    return;
  }
  if(e.key === "Backspace"){
    textEntryString = textEntryString.slice(0,-1);
    return;
  }
  if(/[\d.\-]/.test(e.key)){
    textEntryString += e.key;
  }
}

function commitTyping(){

  const v = parseFloat(textEntryString);

  if(!isNaN(v)){
    setParameterValue(selectedParam,v);
  }

  textEntryActive = false;
  textEntryString = "";

  saveSettings();
}

//-----------------------------------------------------
// ARROW ADJUSTMENT
//-----------------------------------------------------

function adjustParameter(d){
  switch(selectedParam){

    case 0:maxValue += d*500;break;
    case 1:mode1StartIndex += d*10;break;
    case 2:mode1IndexRange += d*10;break;
    case 3:mode2StartIndex += d*10;break;
    case 4:mode2IndexRange += d*10;break;
    case 5:dataResolution += d*1;break;
    case 6:interpolationSpeed += d*0.005;break;
    case 7:steepness += d*1;break;
    case 8:midpointDay += d*0.05;break;
    case 9:midpointNight += d*0.05;break;

  }

  saveSettings();
}

// SETTINGS STORAGE

const STORAGE_KEY = "spectrometerVisualizerSettings";

function saveSettings(){
  const settings = {
    maxValue,
    mode1StartIndex,
    mode1IndexRange,
    mode2StartIndex,
    mode2IndexRange,
    dataResolution,
    interpolationSpeed,
    steepness,
    midpointDay,
    midpointNight,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings(){

  const s = JSON.parse(localStorage.getItem(STORAGE_KEY));

  if(!s){
    loadDefaultSettings();
    return;
  }

  maxValue = s.maxValue ?? 16000;
  mode1StartIndex = s.mode1StartIndex ?? 120;
  mode1IndexRange = s.mode1IndexRange ?? 200;
  mode2StartIndex = s.mode2StartIndex ?? 140;
  mode2IndexRange = s.mode2IndexRange ?? 180;
  dataResolution = s.dataResolution ?? 1920;
  interpolationSpeed = s.interpolationSpeed ?? 0.01;
  steepness = s.steepness ?? 4;
  midpointDay = s.midpointDay ?? 0.6;
  midpointNight = s.midpointNight ?? 0.3;

}

function loadDefaultSettings(){

  maxValue = 16000;
  mode1StartIndex = 120;
  mode1IndexRange = 200;
  mode2StartIndex = 140;
  mode2IndexRange = 180;
  dataResolution = 1920;
  interpolationSpeed = 0.01;
  steepness = 4;
  midpointDay = 0.6;
  midpointNight = 0.3;

  saveSettings();
}

window.addEventListener("load", loadSettings);
window.addEventListener("beforeunload", saveSettings);

// GUI DISPLAY
function displayGUI(){

  if(!guiVisible){
    requestAnimationFrame(displayGUI);
    return;
  }

  const paramHTML = paramNames.map((name,i)=>{
    const value = getParameterValue(i);
    const hi = i===selectedParam ? 'style="color:white"' : '';
    const txt = `${name}: ${paramFormats[i](value)}`;
    const typ = (textEntryActive && i===selectedParam)
      ? ` [${textEntryString}]`
      : "";

    return `<div ${hi}>${txt}${typ}</div>`;
  }).join("");

  const fpsHTML = `<div style="color:white">fps: ${fps.toFixed(1)}</div>`;

  guiElement.innerHTML = fpsHTML + paramHTML;
  requestAnimationFrame(displayGUI);
}

requestAnimationFrame(displayGUI);

function hideGUI(){
  guiElement.innerHTML = "";
}

// CURSOR HIDE
let cursorTimeout;

function hideCursor() {
  document.body.style.cursor = 'none';
}

function showCursor() {
  document.body.style.cursor = 'default';
  clearTimeout(cursorTimeout);
  cursorTimeout = setTimeout(hideCursor, 5000);
}

document.addEventListener('mousemove', showCursor);
cursorTimeout = setTimeout(hideCursor, 5000);