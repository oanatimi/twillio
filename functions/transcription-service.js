require('colors');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const speech = require('@google-cloud/speech');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();

    const keyPath = path.join(__dirname, './oaza.json');
    this.client = new speech.SpeechClient({
      keyFilename: keyPath,
    });

    this.recognizeStream = null;
    this.silenceTimer = null;
    this.lastPartial = null;
    this.recentlyEmittedFinal = null;
    this.recentTranscripts = [];
    this.minimumLength = 8; // Increased from 5
    this.silenceTimeout = 1200; // Increased from 600ms to allow complete sentences
    this.lastEmitTime = 0;
    this.minTimeBetweenEmits = 800; // Increased from 150ms to prevent duplicates
    this.errorCount = 0;
    this.isProcessingFinal = false; // NEW: Prevent overlapping finals

    this.createStream();
  }

  createStream() {
    const request = {
      config: {
        encoding: 'MULAW',
        sampleRateHertz: 8000,
        languageCode: 'ro-RO',
        enableAutomaticPunctuation: true, // CHANGED: Enable punctuation for better sentence detection
        useEnhanced: true, // CHANGED: Use enhanced model for better accuracy
        speechContexts: [
          { phrases: ['programare', 'diagnosticare', 'distribuție', 'revizie', 'cât costă', 'cât timp', 'schimb de direcție', 'plăcuțe de frână'], boost: 15.0 }
        ],
        audioChannelCount: 1,
        enableSeparateRecognitionPerChannel: false,
        maxAlternatives: 1,
        profanityFilter: false,
      },
      interimResults: true,
      singleUtterance: false,
    };

    this.recognizeStream = this.client
      .streamingRecognize(request)
      .on('error', (err) => {
        console.error(`[${new Date().toISOString()}] ❌ Google STT stream error:`, err.message);
        const backoffTime = Math.min(300 * Math.pow(1.3, this.errorCount || 0), 2000);
        this.errorCount = (this.errorCount || 0) + 1;
        setTimeout(() => {
          this.errorCount = 0;
          this.createStream();
        }, backoffTime);
      })
      .on('data', (data) => {
        if (data.results[0] && data.results[0].alternatives[0]) {
          const result = data.results[0];
          const transcript = result.alternatives[0].transcript;

          if (transcript && transcript.length > 2) {
            this.resetSilenceTimer();

            const cleanTranscript = transcript.trim();
            
            // IMPROVED: Better duplicate detection
            const isDuplicate = this.recentTranscripts.some(recent => 
              recent === cleanTranscript || 
              cleanTranscript.includes(recent) || 
              recent.includes(cleanTranscript)
            );
            
            if (isDuplicate && !result.isFinal) {
              console.log(`[${new Date().toISOString()}] ⚠️ Transcript duplicat ignorat: "${cleanTranscript}"`);
              return;
            }

            if (result.isFinal) {
              if (cleanTranscript.length >= this.minimumLength && !this.isProcessingFinal) {
                this.isProcessingFinal = true;
                console.log(`[${new Date().toISOString()}] 🟡 Google STT Final:`, cleanTranscript.yellow);
                if (this.trackTranscript(cleanTranscript)) {
                  this.emit('transcription', cleanTranscript);
                }
                this.isProcessingFinal = false;
              }
              return;
            } else {
              this.lastPartial = cleanTranscript;
              console.log(`[${new Date().toISOString()}] 🔸 Google STT Partial:`, transcript.dim);
              this.emit('utterance', transcript);

              // IMPROVED: More conservative completion detection
              if (this.seemsComplete(cleanTranscript) && !this.isProcessingFinal) {
                const snapshot = cleanTranscript;
                setTimeout(() => {
                  if (this.lastPartial === snapshot && 
                      snapshot.length >= this.minimumLength && 
                      !this.isProcessingFinal) {
                    this.isProcessingFinal = true;
                    console.log(`[${new Date().toISOString()}] 🟠 Finalizare inteligentă:`, snapshot.yellow);
                    if (this.trackTranscript(snapshot)) {
                      this.emit('transcription', snapshot);
                    }
                    this.isProcessingFinal = false;
                  } else {
                    console.log(`[${new Date().toISOString()}] ⏩ Ignorat final parțial depășit:`, snapshot.grey);
                  }
                }, 500); // Increased delay
              }
            }
          }
        }
      });

    this.resetSilenceTimer();
  }

  seemsComplete(text) {
    const lowerText = text.toLowerCase().trim();
    
    // IMPROVED: More specific patterns and longer minimum length
    const completePatterns = [
      /cât costă .+ (distribuție|frână|plăcuțe|diagnost|amortizoare|ulei|schimb de direcție)$/,
      /cât timp durează .+$/,
      /unde sunteți localizați$/,
      /când sunteți deschisi$/,
      /ce program de lucru aveți$/,
      /am nevoie de o programare pentru .+$/,
      /vreau să fac o programare pentru .+$/,
      /^(mulțumesc mult|mulțumesc frumos|cu plăcere|la revedere|bună ziua|salut|bună seara)$/,
      /^(da|nu|ok|bine|perfect)$/,
    ];
    
    // CHANGED: Require longer text and better patterns
    return completePatterns.some(pattern => pattern.test(lowerText)) && text.length > 12;
  }

  trackTranscript(transcript) {
    const currentTime = Date.now();
    if (currentTime - this.lastEmitTime < this.minTimeBetweenEmits) {
      console.log(`[${new Date().toISOString()}] ⏰ Prea devreme pentru emit (${currentTime - this.lastEmitTime}ms)`);
      return false;
    }
    
    // IMPROVED: Better tracking with size limit
    this.recentTranscripts.push(transcript);
    if (this.recentTranscripts.length > 3) { // Keep more history
      this.recentTranscripts.shift();
    }
    
    this.lastPartial = null;
    this.recentlyEmittedFinal = transcript;
    this.lastEmitTime = currentTime;
    return true;
  }

  resetSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.lastPartial && 
          this.lastPartial.length >= this.minimumLength && 
          !this.isProcessingFinal) {
        const trimmed = this.lastPartial.trim();
        console.log(`[${new Date().toISOString()}] ⏳ Pauză detectată – forțez finalizarea streamului`);
        this.isProcessingFinal = true;
        if (this.trackTranscript(trimmed)) {
          this.emit('transcription', trimmed);
        }
        this.isProcessingFinal = false;
      }
    }, this.silenceTimeout);
  }

  send(payload) {
    if (!this.recognizeStream || this.recognizeStream.destroyed) {
      console.warn(`[${new Date().toISOString()}] ⚠️ Attempted to write to destroyed recognizeStream`);
      this.createStream();
      return;
    }

    try {
      const audioContent = Buffer.from(payload, 'base64');
      this.recognizeStream.write(audioContent);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ❌ Error writing to recognizeStream:`, err);
      this.createStream();
    }
  }

  stop() {
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.lastPartial = null;
    this.recentTranscripts = [];
    this.isProcessingFinal = false;
  }
}

module.exports = { TranscriptionService };