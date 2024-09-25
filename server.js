const express = require('express');
const WebSocket = require('ws');
const axios = require('axios'); // For making HTTP requests

const app = express();
const port = 3000;
const spectrometerIP = '192.168.0.100'; // IP address of the spectrometer in AP mode

app.use(express.static('public'));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server is listening on port ${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Fetch data from the spectrometer periodically
  setInterval(async () => {
    try {
      const response = await axios.get(`http://${spectrometerIP}/data/data.json`); // Adapt to your spectrometer's API endpoint
      const sample = response.data; // Process data as needed

      // console.log('Fetched data from spectrometer:', JSON.stringify(sample.d));

      // Send data to WebSocket clients
      ws.send(JSON.stringify(sample));
    } catch (error) {
      console.error('Error fetching data from spectrometer:', error);
    }
  }, 500); // Adjust interval as needed

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});