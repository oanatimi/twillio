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
    this.minimumLength = 6;
    this.silenceTimeout = 200;
    this.lastEmitTime = 0;
    this.minTimeBetweenEmits = 800; // Increased from 400ms to 700ms
    this.errorCount = 0;
    this.isProcessingFinal = false;
    this.lastTranscriptPlayed = null;

    this.forceCompleted = false;
    this.finalReceived = false;
    this.lastForcedTranscript = null;

    this.createStream();
  }

  createStream() {
    const request = {
      config: {
        encoding: 'MULAW',
        sampleRateHertz: 8000,
        languageCode: 'ro-RO',
        enableAutomaticPunctuation: true,
        useEnhanced: true,
        speechContexts: [{
          phrases: [
            'programare', 'diagnosticare', 'distribuție', 'revizie', 'schimb de direcție',
            'plăcuțe de frână', 'amortizoare', 'ulei motor', 'filtre', 'roți', 'jante',
            'frâne', 'discuri de frână', 'etriere', 'suspensie', 'arc', 'bucșe', 'bujii',
            'baterie', 'curea', 'pompa de apă', 'cremalieria', 'rotule', 'ambreiaj',
            'cutie de viteze', 'am nevoie de', 'vreau să', 'am o problemă cu', 'preț',
            'cât durează', 'când', 'mâine', 'astăzi', 'luni', 'marți', 'miercuri',
            'joi', 'vineri', 'dimineața', 'după-amiaza', 'seara'
          ],
          boost: 20.0
        }],
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
            
            // Enhanced duplicate detection with time window
            const currentTime = Date.now();
            const isDuplicate = this.recentTranscripts.some(recent =>
              recent === cleanTranscript && (currentTime - this.lastEmitTime < 2000) // Increased from 1500ms
            );

            if (isDuplicate && !result.isFinal) {
              // Don't log every duplicate to reduce noise
              return;
            }

            if (result.isFinal) {
              this.finalReceived = true;
              const isSameAsForced = this.forceCompleted &&
                this.lastForcedTranscript &&
                this.isFuzzySimilar(cleanTranscript, this.lastForcedTranscript);

              if (isSameAsForced && (currentTime - this.lastEmitTime) <= 3000) {
                console.log(`[${new Date().toISOString()}] ⚠️ Final ignorat - deja forțat: "${cleanTranscript}"`);
                this.resetCompletionFlags();
                return;
              }

              if (
                cleanTranscript.length >= this.minimumLength &&
                !this.isProcessingFinal &&
                cleanTranscript !== this.recentlyEmittedFinal &&
                !this.forceCompleted
              ) {
                this.isProcessingFinal = true;
                console.log(`[${new Date().toISOString()}] 🟡 Google STT Final:`, cleanTranscript.yellow);
                if (this.trackTranscript(cleanTranscript)) {
                  this.emit('transcription', cleanTranscript);
                }
                this.isProcessingFinal = false;
              }

              this.resetCompletionFlags();
              return;
            } else {
              this.finalReceived = false;
              this.forceCompleted = false;
              this.lastPartial = cleanTranscript;
              
              // Only log partials if they're different from the last one (reduce console noise)
              if (cleanTranscript !== this.lastPartial) {
                console.log(`[${new Date().toISOString()}] 🔸 Google STT Partial:`, transcript.dim);
              }
              
              this.emit('utterance', transcript);
            }
          }
        }
      });

    this.resetSilenceTimer();
  }

  resetCompletionFlags() {
    this.forceCompleted = false;
    this.finalReceived = false;
    this.lastForcedTranscript = null;
  }

  trackTranscript(transcript) {
    const currentTime = Date.now();
    const isSimilar = this.recentTranscripts.some(prev =>
      prev === transcript || this.isFuzzySimilar(prev, transcript)
    );

    // Increased time window from 1500ms to 2000ms
    if (currentTime - this.lastEmitTime < 2000 || isSimilar) {
      console.log(`[${new Date().toISOString()}] ⏰ Duplicate or too early emit blocked`);
      return false;
    }

    this.recentTranscripts.push(transcript);
    if (this.recentTranscripts.length > 3) this.recentTranscripts.shift();

    this.lastPartial = null;
    this.recentlyEmittedFinal = transcript;
    this.lastEmitTime = currentTime;
    return true;
  }

  isFuzzySimilar(a, b) {
    const norm = str => str.toLowerCase().replace(/\s+/g, ' ').trim();
    const aw = norm(a).split(' ');
    const bw = norm(b).split(' ');
    const common = aw.filter(word => bw.includes(word));
    const similarity = common.length / Math.max(aw.length, bw.length);
    return similarity >= 0.85;
  }

  resetSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    const timeout = 800;
    this.silenceTimer = setTimeout(() => {
      if (
        this.lastPartial &&
        this.lastPartial.length >= this.minimumLength &&
        !this.isProcessingFinal &&
        !this.forceCompleted
      ) {
        const trimmed = this.lastPartial.trim();
        const lowerTrimmed = trimmed.toLowerCase();
        const obviouslyIncompletePatterns = [
          'am', 'pot', 'vreau', 'și', 'dar', 'pentru', 'de', 'la', 'cu', 'pe',
          'salut', 'bună', 'bună ziua'
        ];

        const isObviouslyIncomplete = obviouslyIncompletePatterns.includes(lowerTrimmed);
        const wordCount = trimmed.split(' ').length;
        const shouldProcess = wordCount >= 1 && !isObviouslyIncomplete;

        if (!shouldProcess) {
          console.log(`[${new Date().toISOString()}] ⚠️ Timeout - incomplete sau prea scurt: "${trimmed}"`);
          return;
        }

        console.log(`[${new Date().toISOString()}] ⏳ Timeout - procesare: "${trimmed}"`);
        this.isProcessingFinal = true;
        this.forceCompleted = true;
        this.lastForcedTranscript = trimmed;

        if (this.trackTranscript(trimmed)) {
          this.emit('transcription', trimmed);
        }
        this.isProcessingFinal = false;
      }
    }, timeout);
  }

  send(payload) {
    if (!this.recognizeStream || this.recognizeStream.destroyed) {
      console.warn(`[${new Date().toISOString()}] ⚠️ Stream distrus - recreare`);
      this.createStream();
      return;
    }

    try {
      const audioContent = Buffer.from(payload, 'base64');
      this.recognizeStream.write(audioContent);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ❌ Eroare stream:`, err);
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
    this.resetCompletionFlags();
  }
}

module.exports = { TranscriptionService };