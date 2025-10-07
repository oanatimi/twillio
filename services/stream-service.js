const EventEmitter = require('events');
const uuid = require('uuid');

// Timestampuri pentru debugging
function getTimestamp() {
  const now = new Date();
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${now.toTimeString().split(' ')[0]}.${ms}`;
}

const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  originalLog(`[${getTimestamp()}]`, ...args);
};

console.error = function(...args) {
  originalError(`[${getTimestamp()}]`, ...args);
};

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    console.log('🏗️ StreamService constructor START');
    
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.streamSid = '';
    
    console.log('✅ StreamService constructor END');
  }

  setStreamSid (streamSid) {
    console.log(`📝 Setting StreamSid: ${streamSid}`);
    this.streamSid = streamSid;
  }

  buffer (index, audio) {
    console.log(`📦 StreamService.buffer() START - Index: ${index}`);
    
    // Escape hatch for intro message, which doesn't have an index
    if(index === null) {
      console.log('🎯 Sending intro message directly (no index)');
      this.sendAudio(audio);
    } else if(index === this.expectedAudioIndex) {
      console.log(`✅ Audio index ${index} matches expected ${this.expectedAudioIndex}`);
      this.sendAudio(audio);
      this.expectedAudioIndex++;

      // Process any buffered audio that's now in sequence
      while(Object.prototype.hasOwnProperty.call(this.audioBuffer, this.expectedAudioIndex)) {
        console.log(`🔄 Processing buffered audio for index ${this.expectedAudioIndex}`);
        const bufferedAudio = this.audioBuffer[this.expectedAudioIndex];
        this.sendAudio(bufferedAudio);
        delete this.audioBuffer[this.expectedAudioIndex];
        this.expectedAudioIndex++;
      }
    } else {
      console.log(`⏳ Audio index ${index} buffered (expecting ${this.expectedAudioIndex})`);
      this.audioBuffer[index] = audio;
    }
    
    console.log('✅ StreamService.buffer() END');
  }

  sendAudio (audio) {
    console.log('📡 StreamService.sendAudio() START');
    const startTime = Date.now();
    
    const base64Payload = audio.toString('base64');
    console.log(`📤 Sending audio to Twilio (${base64Payload.length} base64 chars)`);

    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: base64Payload,
        },
      })
    );

    const audioSentTime = Date.now() - startTime;
    console.log(`⚡ Audio sent to Twilio in ${audioSentTime}ms`);

    // Create mark for tracking when audio completes
    const markLabel = uuid.v4();
    console.log(`🏷️ Creating mark: ${markLabel}`);

    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: {
          name: markLabel
        }
      })
    );

    const totalTime = Date.now() - startTime;
    console.log(`📡 Mark sent in ${totalTime}ms total`);

    this.emit('audiosent', markLabel);
    console.log('✅ StreamService.sendAudio() END');
  }
}

module.exports = {StreamService};