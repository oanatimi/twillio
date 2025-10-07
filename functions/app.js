require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { Readable } = require('stream');
const { TranscriptionService } = require('./services/transcription-service.js');
const OpenAI = require('openai');
const openai = new OpenAI();

function getTimestamp() {
  const now = new Date();
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${now.toTimeString().split(' ')[0]}.${ms}`;
}
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => originalLog(`[${getTimestamp()}]`, ...args);
console.error = (...args) => originalError(`[${getTimestamp()}]`, ...args);

const app = ExpressWs(express()).app;
const PORT = parseInt(process.env.PORT || '3000');

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_API_KEY,
});
const voiceId = process.env.ELEVEN_VOICE_ID || 'Fz5f9ouyMrCdFUEJGpA1';
const outputFormat = 'ulaw_8000';

// OPTIMIZED AUDIO: Back to working method but ultra-fast
async function sendAudioOptimized(ws, streamSid, buffer) {
  const CHUNK_SIZE = 160; // Smaller chunks for minimum latency
  
  console.log(`🎵 Sending ${buffer.length} bytes ultra-fast`);
  
  // Send all chunks without any delays
  const promises = [];
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.slice(i, i + CHUNK_SIZE);
    
    if (ws.readyState === ws.OPEN) {
      const promise = new Promise((resolve) => {
        ws.send(JSON.stringify({
          streamSid,
          event: 'media',
          media: {
            payload: chunk.toString('base64'),
          },
        }));
        resolve();
      });
      promises.push(promise);
    }
  }
  
  // Wait for all chunks to be sent
  await Promise.all(promises);
  console.log('✅ Ultra-fast audio transmission completed');
}

app.post('/incoming', (req, res) => {
  console.log('📞 INCOMING CALL'.cyan.bold);
  const response = new VoiceResponse();
  response.connect().stream({ url: `wss://${process.env.SERVER}/connection` });
  res.type('text/xml');
  res.end(response.toString());
});

app.ws('/connection', (ws) => {
  console.log('🔌 NEW CONNECTION!'.rainbow.bold);
  let streamSid = null;
  const transcriber = new TranscriptionService();
  let lastTranscript = null;
  let isProcessing = false;
  let processingQueue = [];
  let conversationHistory = [];
  let lastProcessedTime = 0; // NEW: Track when we last processed

  // IMPROVED: Better queue processing with deduplication
  function processTranscriptionQueue() {
    if (processingQueue.length === 0 || isProcessing) return;
    
    // IMPROVED: Filter out duplicates and very similar transcripts
    const uniqueQueue = [];
    const seen = new Set();
    
    for (const transcript of processingQueue) {
      const normalized = transcript.toLowerCase().trim();
      if (!seen.has(normalized) && 
          !uniqueQueue.some(existing => 
            existing.toLowerCase().includes(normalized) || 
            normalized.includes(existing.toLowerCase())
          )) {
        uniqueQueue.push(transcript);
        seen.add(normalized);
      }
    }
    
    if (uniqueQueue.length === 0) {
      processingQueue = [];
      return;
    }
    
    // Take the longest/most complete transcript
    const latestTranscript = uniqueQueue.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );
    
    const queueLength = processingQueue.length;
    processingQueue = []; // Clear entire queue
    
    console.log(`📋 Procesez ultimul transcript din ${queueLength} în coadă: "${latestTranscript}"`);
    processTranscription(latestTranscript);
  }

  async function processTranscription(text) {
    const clean = text.trim();
    const currentTime = Date.now();

    // IMPROVED: Better duplicate detection
    if (isProcessing || 
        clean === lastTranscript || 
        clean.length < 5 ||
        (currentTime - lastProcessedTime < 1000)) { // Minimum 1 second between processing
      console.log(`⚠️ Ignor transcript: prea scurt, duplicat sau prea devreme (${currentTime - lastProcessedTime}ms)`);
      return;
    }

    isProcessing = true;
    lastTranscript = clean;
    lastProcessedTime = currentTime;
    console.log(`🎤 User: "${clean}"`);

    // IMPROVED ROMANIAN RECEPTIONIST - Better context handling
    const systemPrompt = `Ești receptioner la OAZA CAR CARE Cluj-Napoca.

IMPORTANT - CONTEXT MEMORY:
Ține minte în conversație următoarele informații:
- Serviciul menționat de client (ex: distribuție, plăcuțe de frână, schimb de direcție)
- Ziua cerută pentru programare (ex: luni, mâine)
- Ora solicitată (ex: ora zece)

Folosește aceste informații ca să răspunzi natural și logic. Dacă userul spune doar „da" sau „luni", presupune că răspunde la întrebarea anterioară.

SERVICII ȘI PREȚURI (scrie cu litere):
- Diagnosticare: optzeci - o sută douăzeci lei
- Distribuție revizie: două sute cincizeci - patru sute lei  
- Distribuție schimb complet: șase sute - o mie două sute lei
- Schimb de direcție: trei sute - cinci sute lei
- Plăcuțe frână: două sute - patru sute lei
- Ulei și filtre: optzeci - o sută cincizeci lei
- Amortizoare: trei sute - șase sute lei bucata

PROGRAM: luni - vineri, opt - șaptesprezece (închis weekendul)  
ADRESA: Strada Dorobanților optsprezece - douăzeci, Cluj-Napoca

RĂSPUNSURI PROFESIONALE DAR SCURTE:
- Pentru prețuri → Dă prețul și întreabă când dorește să vină
- Pentru program → Explică programul
- Pentru locație → Dă adresa
- Pentru programări → Întreabă ce serviciu și când

DACĂ CLIENTUL RĂSPUNDE CU "da", "luni", "la ora zece" sau ceva scurt, folosește contextul anterior pentru a continua logic.

DACĂ ÎNTREBAREA NU ARE LEGĂTURĂ CU SERVICE-UL AUTO:
Răspunde politicos: „Ne pare rău, dar nu oferim astfel de informații."

Păstrează răspunsurile la 1-2 propoziții maxim și termină cu punct.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-4), // Keep more context
      { role: 'user', content: clean }
    ];

    try {
      const startTime = Date.now();
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 80, // Slightly increased for complete responses
        temperature: 0.2,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        // REMOVED stop parameter to avoid truncation
      });

      const aiResponse = completion.choices[0].message.content.trim();
      const gptTime = Date.now() - startTime;
      
      if (aiResponse && aiResponse !== lastTranscript && aiResponse !== lastTranscript) {
        console.log(`🤖 GPT (${gptTime}ms): "${aiResponse}"`);

        // IMPROVED: Better conversation history management
        conversationHistory.push(
          { role: 'user', content: clean },
          { role: 'assistant', content: aiResponse }
        );

        // Keep last 4 messages (2 exchanges)
        if (conversationHistory.length > 4) {
          conversationHistory = conversationHistory.slice(-4);
        }

        // FASTEST TTS POSSIBLE: Use Turbo model and minimal settings
        const ttsStartTime = Date.now();
        console.log('🚀 Starting TURBO TTS...');
        
        const response = await elevenlabs.textToSpeech.convert(voiceId, {
          text: aiResponse,
          modelId: 'eleven_turbo_v2_5', // FASTEST MODEL
          outputFormat,
          voiceSettings: {
            stability: 0.2, // Slightly higher for clarity
            similarityBoost: 0.4, // Slightly higher for consistency
            use_speaker_boost: false,
            style: 0,
          },
          optimize_streaming_latency: 4, // Maximum optimization
        });

        // Process audio as fast as possible
        const chunks = [];
        for await (const chunk of Readable.from(response)) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const ttsTime = Date.now() - ttsStartTime;
        console.log(`🎵 TTS completed in ${ttsTime}ms - sending immediately`);

        // Send with optimized chunking
        await sendAudioOptimized(ws, streamSid, buffer);
        
        const totalTime = Date.now() - startTime;
        console.log(`⚡ Complete response time: ${totalTime}ms`);
      }
    } catch (err) {
      console.error(`❌ GPT/TTS error:`, err);
    } finally {
      isProcessing = false;
      // IMPROVED: Add delay before processing next item
      setTimeout(() => {
        processTranscriptionQueue();
      }, 500); // Wait 500ms before processing next
    }
  }

  transcriber.on('transcription', async (text) => {
    // IMPROVED: Check if this transcript is significantly different from recent ones
    const isSignificantlyDifferent = !processingQueue.some(existing => 
      existing.toLowerCase().includes(text.toLowerCase()) ||
      text.toLowerCase().includes(existing.toLowerCase())
    );
    
    if (isSignificantlyDifferent) {
      processingQueue.push(text);
      console.log(`📥 Transcript adăugat în coadă: "${text}" (${processingQueue.length} în coadă)`);
      
      // Process with small delay to allow for more complete transcripts
      setTimeout(() => {
        processTranscriptionQueue();
      }, 200);
    } else {
      console.log(`🔄 Transcript similar ignorat: "${text}"`);
    }
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.event) {
        case 'start':
          console.log('🎬 STREAM START!'.rainbow);
          streamSid = message.start.streamSid;

          // TURBO greeting for maximum speed
          console.log('🚀 Starting TURBO greeting...');
          const greetingResponse = await elevenlabs.textToSpeech.convert(voiceId, {
            text: 'Bună ziua! Cu ce vă pot ajuta?',
            modelId: 'eleven_turbo_v2_5', // FASTEST MODEL  
            outputFormat,
            voiceSettings: {
              stability: 0.2,
              similarityBoost: 0.4,
              use_speaker_boost: false,
              style: 0,
            },
            optimize_streaming_latency: 4,
          });

          const gChunks = [];
          for await (const chunk of Readable.from(greetingResponse)) {
            gChunks.push(chunk);
          }
          const gBuffer = Buffer.concat(gChunks);
          
          await sendAudioOptimized(ws, streamSid, gBuffer);
          break;

        case 'media':
          transcriber.send(message.media.payload);
          break;

        case 'stop':
          transcriber.stop();
          break;
      }
    } catch (err) {
      console.error('❌ Message processing error:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Connection closed');
    transcriber.stop();
    lastTranscript = null;
    processingQueue = [];
    conversationHistory = [];
    isProcessing = false;
  });

  ws.on('error', (err) => console.error('❌ WebSocket error:', err));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Webhook: https://${process.env.SERVER}/incoming`);
});