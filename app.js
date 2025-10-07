require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Import our modules
const { setupTimestamp } = require('./utils/timestamp');
const { sendAudioUltraFast } = require('./utils/audio-streaming');
const { createConnectionHandler } = require('./handlers/connection-handler');

// Setup timestamp logging
setupTimestamp();

const app = ExpressWs(express()).app;
const PORT = parseInt(process.env.PORT || '3000');

// Incoming call webhook
app.post('/incoming', (req, res) => {
  console.log('📞 INCOMING CALL'.cyan.bold);
  const response = new VoiceResponse();
  response.connect().stream({ url: `wss://${process.env.SERVER}/connection` });
  res.type('text/xml');
  res.end(response.toString());
});

// WebSocket connection handler
app.ws('/connection', createConnectionHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Webhook: https://${process.env.SERVER}/incoming`);
});