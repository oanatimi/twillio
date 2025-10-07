// utils/audio-streaming.js - Audio streaming utilities

// FASTEST POSSIBLE: Streaming audio in real-time chunks
async function sendAudioUltraFast(ws, streamSid, buffer) {
  const CHUNK_SIZE = 240; // Optimal chunk size for speed
  
  console.log(`🎵 Streaming ${buffer.length} bytes in real-time`);
  
  // Send chunks immediately without waiting
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.slice(i, i + CHUNK_SIZE);
    
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        streamSid,
        event: 'media',
        media: {
          payload: chunk.toString('base64'),
        },
      }));
      
      // MICRO delay only for WebSocket buffer management
      if (i % (CHUNK_SIZE * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }
  
  console.log('⚡ Real-time audio streaming completed');
}

module.exports = { sendAudioUltraFast };