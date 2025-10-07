require('colors');

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

async function recordingService(ttsService, callSid) {
  console.log('📹 recordingService() START');
  console.log(`📞 CallSid: ${callSid}`);
  console.log(`🎙️ Recording enabled: ${process.env.RECORDING_ENABLED}`);
  
  try {
    if (process.env.RECORDING_ENABLED === 'true') {
      console.log('📡 Initializing Twilio client for recording...');
      const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      console.log('🔊 Generating recording notification message...');
      ttsService.generate({partialResponseIndex: null, partialResponse: 'This call will be recorded.'}, 0);
      
      console.log('📹 Creating recording...');
      const startTime = Date.now();
      
      const recording = await client.calls(callSid)
        .recordings
        .create({
          recordingChannels: 'dual'
        });
      
      const recordingTime = Date.now() - startTime;
      console.log(`✅ Recording created in ${recordingTime}ms: ${recording.sid}`.green);
    } else {
      console.log('⏭️ Recording disabled - skipping');
    }
  } catch (err) {
    console.error('❌ Recording service error:', err);
  }
  
  console.log('✅ recordingService() END');
}

module.exports = { recordingService };