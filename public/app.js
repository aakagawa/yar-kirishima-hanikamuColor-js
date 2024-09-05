const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
  alert('WebGL not supported, falling back on experimental-webgl');
  gl = canvas.getContext('experimental-webgl');
}

if (!gl) {
  alert('Your browser does not support WebGL');
}

// Vertex shader program with 90-degree counterclockwise rotation
const vertexShaderSource = `
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

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
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

const program = createProgram(gl, vertexShader, fragmentShader);
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
  0, 1,  // Top-left corner
  1, 1,  // Top-right corner
  0, 0,  // Bottom-left corner
  1, 0,  // Bottom-right corner
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
gl.clearColor(1.0, 1.0, 1.0, 1.0); // Set clear color to white (RGBA)

let imageTexture;
let currentData = null;
let targetData = null;
let interpolationSpeed = 0.01; // Adjust this value for interpolation speed

// Load and create texture from an image
const image = new Image();
image.src = './assets/hanikamu_02.png'; // Path to your preloaded image
image.onload = () => {
  const canvasTmp = document.createElement('canvas');
  const ctxTmp = canvasTmp.getContext('2d');

  const width = 1200;
  const height = 1800;
  canvasTmp.width = width;
  canvasTmp.height = height;
  ctxTmp.drawImage(image, 0, 0, width, height);

  const imageData = ctxTmp.getImageData(0, 0, width, height);

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
  const ws = new WebSocket('ws://192.168.0.101:3000'); // Use your server's local IP address

  ws.onmessage = (event) => {
    const responseData = JSON.parse(event.data);
    targetData = resampleData(responseData.d, 5100); // Resample the real-time data
    if (!currentData) currentData = targetData.slice(); // Initialize current data on the first run
  };

  // Continuous interpolation
  function continuousInterpolation() {
    if (currentData && targetData) {
      const interpolatedData = currentData.map((value, index) => {
        return value + (targetData[index] - value) * interpolationSpeed;
      });

      updateImage(interpolatedData, imageData);

      // Update currentData towards targetData
      currentData = interpolatedData.slice();
    }

    requestAnimationFrame(continuousInterpolation);
  }

  continuousInterpolation(); // Start continuous interpolation
};

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
function updateImage(data, imageData) {
  const width = 1200;
  const height = 1800;
  const rowsPerSample = height / data.length; // Each sample should correspond to about 1.54 rows

  // Normalize the intensity values to range [0, 1]
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const normalizedData = data.map(value => (value - minValue) / (maxValue - minValue));

  const stretchedImageData = new Uint8Array(width * height * 4); // Array to hold stretched image data (RGBA for each pixel)

  for (let y = 0; y < data.length; y++) {
    const value = normalizedData[y];
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

  console.log('Stretched image texture updated');

  drawScene();
}

let startTime = Date.now();

function updateHueShift() {
  // Calculate time elapsed in minutes
  const elapsedTime = (Date.now() - startTime) / (1000 * 60); // Time in minutes
  const hueShift = (elapsedTime / 1) % 1.0; // 360 degrees over 12 minutes

  const hueShiftLocation = gl.getUniformLocation(program, 'u_hueShift');
  gl.uniform1f(hueShiftLocation, hueShift);

  drawScene();

  // Continue updating the hue shift
  requestAnimationFrame(updateHueShift);
}

// Start the hue shift animation
updateHueShift();

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
