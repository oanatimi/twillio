// services/tts-service.js - Text-to-Speech service

const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { Readable } = require('stream');
const { sendAudioUltraFast } = require('../utils/audio-streaming');

class TTSService {
  constructor() {
    this.elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVEN_API_KEY,
    });
    this.voiceId = process.env.ELEVEN_VOICE_ID || 'Fz5f9ouyMrCdFUEJGpA1';
    this.outputFormat = 'ulaw_8000';
  }

  // FASTEST TTS for instant responses
  async generateInstantAudio(text, type = 'INSTANT') {
    const ttsStartTime = Date.now();
    console.log(`⚡ ${type} TTS start...`);
    
    const response = await this.elevenlabs.textToSpeech.convert(this.voiceId, {
      text: text,
      modelId: 'eleven_turbo_v2_5',
      outputFormat: this.outputFormat,
      voiceSettings: {
        stability: type === 'MEGA' ? 0 : 0.05,
        similarityBoost: type === 'MEGA' ? 0 : 0.1,
        use_speaker_boost: false,
        style: 0,
      },
      optimize_streaming_latency: 4,
    });

    const chunks = [];
    for await (const chunk of Readable.from(response)) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    const ttsTime = Date.now() - ttsStartTime;
    console.log(`⚡ TTS complete ${ttsTime}ms - audio size: ${buffer.length} bytes`);

    return { buffer, ttsTime };
  }

  // ULTRA-FAST TTS for GPT responses
  async generateUltraAudio(text) {
    const ttsStartTime = Date.now();
    console.log('⚡ ULTRA TTS start...');
    
    const response = await this.elevenlabs.textToSpeech.convert(this.voiceId, {
    text: text,
    modelId: 'eleven_turbo_v2_5',
    outputFormat: this.outputFormat,
    voiceSettings: {
      stability: 0,           // Era deja 0 - OK
      similarityBoost: 0,     // Era deja 0 - OK
      use_speaker_boost: false,
      style: 0,
    },
    optimize_streaming_latency: 4,
    previous_text: "", // NEW: ajută la streaming mai rapid
    next_text: ""      // NEW: ajută la streaming mai rapid
  });

    const chunks = [];
    for await (const chunk of Readable.from(response)) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    const ttsTime = Date.now() - ttsStartTime;
    console.log(`⚡ TTS complete ${ttsTime}ms - audio size: ${buffer.length} bytes`);

    return { buffer, ttsTime };
  }

  // Send audio to client
  async sendResponse(ws, streamSid, text, type = 'INSTANT', startTime) {
    const audioType = type === 'ULTRA' ? 'generateUltraAudio' : 'generateInstantAudio';
    const { buffer, ttsTime } = await this[audioType](text, type);

    await sendAudioUltraFast(ws, streamSid, buffer);
    
    const totalTime = Date.now() - startTime;
    console.log(`🚀 ${type} TOTAL: ${totalTime}ms`);

    return totalTime;
  }

  // Generate greeting audio
  async generateGreeting() {
    console.log('⚡ Turbo greeting...');
    const response = await this.elevenlabs.textToSpeech.convert(this.voiceId, {
      text: 'Bună ziua! Sunt agentul virtual Oaza, cu ce va pot ajuta astazi',
      modelId: 'eleven_turbo_v2_5',
      outputFormat: this.outputFormat,
      voiceSettings: {
        stability: 0.05,
        similarityBoost: 0.1,
        use_speaker_boost: false,
        style: 0,
      },
      optimize_streaming_latency: 4,
    });

    const chunks = [];
    for await (const chunk of Readable.from(response)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

module.exports = { TTSService };