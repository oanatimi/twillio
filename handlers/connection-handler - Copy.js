// handlers/connection-handler.js - FIXED: Better memory retention and context awareness

const { TranscriptionService } = require('../services/transcription-service.js');
const { ConversationMemory, normalizeText, isTextSimilar } = require('../services/conversation-memory.js');
const { ResponseMatcher } = require('../services/response-matcher.js');
const { TTSService } = require('../services/tts-service.js');
const { GPTService } = require('../services/gpt-service.js');
const { sendAudioUltraFast } = require('../utils/audio-streaming.js');

// Global conversation memory
const conversationMemory = new ConversationMemory();

// ENHANCED FALLBACK with proper memory awareness
function getEnhancedFallback(text, conversationHistory, streamSid) {
  const lowerText = text.toLowerCase().trim();
  
  // NEW: Check existing appointments and partial bookings FIRST
  const existingAppointment = conversationMemory.getAppointment(streamSid);
  const partialBooking = conversationMemory.getPartialBooking(streamSid);
  
  // If user already has appointment and asks questions, acknowledge it
  if (existingAppointment) {
    const { day, time } = existingAppointment;
    
    if (lowerText.includes('când') || lowerText.includes('ce oră') || lowerText.includes('program')) {
      return `Aveți programarea confirmată pentru ${day} la ${time}. Vă așteptăm atunci.`;
    }
    
    if (lowerText.includes('da') || lowerText.includes('bine') || lowerText.includes('ok')) {
      return `Perfect! Programarea pentru ${day} la ${time} rămâne confirmată. Vă așteptăm cu drag.`;
    }
    
    // For any other question, acknowledge the appointment
    if (lowerText.includes('direcți') || lowerText.includes('volan')) {
      return `Pentru direcția grea vă verific ${day} la ${time} când veniți.`;
    }
    
    if (lowerText.includes('motor')) {
      return `Pentru problema motorului vă diagnosticez ${day} la ${time}. `;
    }
    
    return `Pentru această problemă vă ajut ${day} la ${time} când veniți. Vă aștept cu drag.`;
  }
  
  // If partial booking exists, try to complete it
  if (partialBooking) {
    if (partialBooking.day && !partialBooking.time) {
      if (lowerText.includes('da') || lowerText.includes('bine') || lowerText.includes('ok')) {
        return `Perfect pentru ${partialBooking.day}! La ce oră vă convine să veniți?`;
      }
    }
    
    if (partialBooking.time && !partialBooking.day) {
      if (lowerText.includes('da') || lowerText.includes('bine') || lowerText.includes('ok')) {
        return `Excelent pentru ${partialBooking.time}! Ce zi vă convine cel mai bine?`;
      }
    }
  }
  
  // Check if service is currently open
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWorkingHour = hour >= 8 && hour < 17;
  const isServiceOpen = isWorkingDay && isWorkingHour;
  
  // PRIORITY 1: "ACUM" requests with correct time logic
  if (lowerText.includes('acum') || lowerText.includes('pot să vin acum') || lowerText.includes('vin acum')) {
    if (isServiceOpen) {
      return "Desigur, veniți acum! Vă așteptăm la service.";
    } else {
      return "Pentru acum suntem închisi, dar vă pot programa pentru următoarea zi lucrătoare. Când vă convine?";
    }
  }
  
  // PRIORITY 2: Steering problems - "merge greu", "volan greu", etc.
  const steeringKeywords = ['merge greu', 'volan greu', 'direcți', 'greu la volan', 'mașina merge greu', 'volanul e greu'];
  if (steeringKeywords.some(keyword => lowerText.includes(keyword))) {
    return "Pentru direcția grea recomand verificarea sistemului de direcție. Cand ati dori sa veniti in service?";
  }
  
  // PRIORITY 3: Context-aware responses based on recent conversation
  const recentMessages = conversationHistory.slice(-4).map(msg => msg.content.toLowerCase()).join(' ');
  
  // If recently discussed steering issues
  if (recentMessages.includes('direcți') || recentMessages.includes('volan') || recentMessages.includes('merge greu')) {
    if (lowerText.includes('cauză') || lowerText.includes('de ce')) {
      return "Direcția grea poate fi de la ulei hidraulic sau cremalierea uzată. Reparație trei sute-cinci sute lei. Cand ati dori sa veniti in service?";
    }
    return "Pentru problemele de direcție va putem ajuta cu drag. Cand ati dori sa veniti in service?";
  }
  
  // If recently discussed motor issues
  if (recentMessages.includes('motor') || recentMessages.includes('sună')) {
    if (lowerText.includes('cauză') || lowerText.includes('de ce')) {
      return "Sunetul motorului poate fi de la distribuție sau ulei vechi. Diagnosticare optzeci-o sută douăzeci lei. Cand ati dori sa veniti in service?";
    }
    return "Pentru problemele de motor recomand diagnosticare. Cand ati dori sa veniti in service?";
  }
  
  // PRIORITY 4: Generic positive responses for confirmations
  if (lowerText.includes('da') || lowerText.includes('bine') || lowerText.includes('ok') || lowerText.includes('perfect')) {
    return "Excelent! La ce oră vă este cel mai convenabil să veniți?";
  }
  
  // PRIORITY 5: Keyword-based fallbacks from current text
  if (lowerText.includes('motor')) {
    return "Pentru problemele de motor recomand diagnosticare. Cand ati dori sa veniti in service?";
  }
  
  if (lowerText.includes('frân')) {
    return "Pentru problemele de frânare vă putem ajuta cu drag. Cand ati dori sa veniti in service?";
  }
  
  if (lowerText.includes('direcți') || lowerText.includes('volan')) {
    return "Pentru problemele de direcție vă putem ajuta cu drag. Cand ati dori sa veniti in service?";
  }
  
  if (lowerText.includes('baterie')) {
    return "Pentru bateria descărcată vă putem ajuta cu drag. Cand ati dori sa veniti in service?";
  }
  
  if (lowerText.includes('preț') || lowerText.includes('cât costă') || lowerText.includes('cost')) {
    return "Cu plăcere să vă informez despre prețuri. Ce problemă aveți la mașină?";
  }
  
  if (lowerText.includes('când') || lowerText.includes('program') || lowerText.includes('oră')) {
    return "Programul nostru este luni-vineri între opt-șaptesprezece. Când vă convine?";
  }
  
  if (lowerText.includes('unde') || lowerText.includes('adres')) {
    return "Ne găsiți pe Strada Dorobanților, numerele optsprezece-douăzeci, Cluj-Napoca.";
  }
  
  // PRIORITY 6: Generic automotive fallback
  return "Pentru această problemă vă ajutăm sigur. Cand ati dori sa veniti in service?";
}

function createConnectionHandler(ws) {
  console.log('🔌 NEW CONNECTION!'.rainbow.bold);
  
  let streamSid = null;
  const transcriber = new TranscriptionService();
  const responseMatcher = new ResponseMatcher(conversationMemory);
  const ttsService = new TTSService();
  const gptService = new GPTService();
  
  let lastTranscript = null;
  let lastProcessedTime = 0;
  let isProcessing = false;
  let processingQueue = [];
  let conversationHistory = []; // For quick responses (4 messages)
  let fullConversationContext = []; // For GPT (10 messages - optimized)
  
  // ENHANCED: Track recently processed transcripts to prevent late duplicates
  let recentlyProcessed = new Map(); // Track recently processed transcripts
  const RECENT_WINDOW = 3000; // 3 seconds window - optimized

  // LIGHTNING FAST: Process immediately, no delays
  function processTranscriptionQueue() {
    if (processingQueue.length === 0 || isProcessing) return;
    
    const latestTranscript = processingQueue[processingQueue.length - 1];
    processingQueue = []; // Clear queue immediately
    
    console.log(`⚡ INSTANT procesare: "${latestTranscript}"`);
    processTranscription(latestTranscript);
  }

  async function processTranscription(text) {
    const clean = text.trim();
    const currentTime = Date.now();

    // Skip fraze prea lungi care probabil sunt greșit transcriere
    if (clean.length > 200) {
      console.log(`⚠️ Skipping too long transcript: "${clean.substring(0, 50)}..."`);
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    }

    // Skip fraze cu prea multe repetari sau nonsens
    if (clean.includes('stă bine') || clean.includes('începe vii') || clean.includes('ochi să')) {
      console.log(`⚠️ Skipping nonsense transcript: "${clean}"`);
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    }

    // ENHANCED: Check for recent similar processing to prevent late STT finals
    for (const [recentText, recentTime] of recentlyProcessed.entries()) {
      if (isTextSimilar(recentText, clean, 0.8) && (currentTime - recentTime) < RECENT_WINDOW) {
        console.log(`⚠️ Skipping late duplicate: "${clean}" ≈ "${recentText}" (${currentTime - recentTime}ms ago)`);
        return;
      }
    }

    // Clean old entries from recentlyProcessed
    for (const [text, time] of recentlyProcessed.entries()) {
      if (currentTime - time > RECENT_WINDOW) {
        recentlyProcessed.delete(text);
      }
    }

    // UNIVERSAL DUPLICATE DETECTION - works for any Romanian text variations
    const normalizedCurrent = normalizeText(clean);
    const normalizedLast = normalizeText(lastTranscript || '');
    
    // IMPROVED: Check multiple types of duplicates
    const isExactDuplicate = lastTranscript === clean && (Date.now() - lastProcessedTime < 1000);
    const isNormalizedDuplicate = normalizedCurrent === normalizedLast && (Date.now() - lastProcessedTime < 3000);
    const isFuzzyDuplicate = isTextSimilar(lastTranscript, clean, 0.85) && (Date.now() - lastProcessedTime < 5000);
    
    // SPECIAL: Allow short confirmations (da, nu, ok)
    const shortConfirmations = ['da', 'nu', 'ok'];
    const isShortConfirmation = shortConfirmations.includes(clean.toLowerCase());
    const minLength = isShortConfirmation ? 2 : 3;

    // DUPLICATE CHECKS WITH DETAILED LOGGING
    if (isProcessing) {
      console.log(`⏳ Still processing previous: "${lastTranscript}"`);
      return;
    }

    if (clean.length < minLength) {
      console.log(`⚠️ Too short: "${clean}"`);
      return;
    }

    if (isNormalizedDuplicate) {
      console.log(`⚠️ Normalized duplicate: "${clean}" ≈ "${lastTranscript}" (${normalizedCurrent})`);
      return;
    }

    if (isExactDuplicate) {
      console.log(`⚠️ Exact duplicate: "${clean}"`);
      return;
    }

    if (isFuzzyDuplicate) {
      console.log(`⚠️ Fuzzy duplicate: "${clean}" ≈ "${lastTranscript}"`);
      return;
    }

    // PROCESS THE UNIQUE TRANSCRIPT
    isProcessing = true;
    lastTranscript = clean;
    lastProcessedTime = currentTime;
    
    // ENHANCED: Track this transcript as recently processed
    recentlyProcessed.set(clean, currentTime);
    
    console.log(`🎤 User: "${clean}"`);

    // CRITICAL: Always update conversation memory FIRST
    conversationMemory.addToConversationContext(streamSid, 'user', clean);

    // ADD to full conversation context (for GPT)
    fullConversationContext.push({ role: 'user', content: clean });
    
    // Keep context manageable - last 8 exchanges (16 messages) for better memory
    if (fullConversationContext.length > 16) {
      fullConversationContext = fullConversationContext.slice(-16);
    }

    // PRIORITY 1: CHECK MEMORY-BASED RESPONSES FIRST (enhanced with streamSid)
    const memoryResponse = conversationMemory.findQuickResponseWithMemory ? 
      conversationMemory.findQuickResponseWithMemory(clean, streamSid, conversationMemory) : null;
    
    if (memoryResponse) {
      console.log(`🧠 MEMORY RESPONSE (0ms): "${memoryResponse}"`);
      
      conversationMemory.addToConversationContext(streamSid, 'assistant', memoryResponse);
      
      // Add to BOTH contexts
      const appointment = conversationMemory.getAppointment(streamSid);
      const context = appointment ? ` [📅 ${appointment.day} ${appointment.time}]` : '';
      
      conversationHistory.push(
        { role: 'user', content: clean },
        { role: 'assistant', content: memoryResponse + context }
      );
      fullConversationContext.push({ role: 'assistant', content: memoryResponse });
      
      if (conversationHistory.length > 4) {
        conversationHistory = conversationHistory.slice(-4);
      }

      await ttsService.sendResponse(ws, streamSid, memoryResponse, 'INSTANT', currentTime);
      
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    }

    // PRIORITY 2: CHECK FOR INSTANT RESPONSE
    const quickResponse = responseMatcher.findQuickResponse(clean, streamSid);
    if (quickResponse) {
      console.log(`⚡ INSTANT CACHE HIT (0ms): "${quickResponse}"`);
      
      conversationMemory.addToConversationContext(streamSid, 'assistant', quickResponse);
      
      // Add to BOTH contexts
      const appointment = conversationMemory.getAppointment(streamSid);
      const context = appointment ? ` [📅 ${appointment.day} ${appointment.time}]` : '';
      
      conversationHistory.push(
        { role: 'user', content: clean },
        { role: 'assistant', content: quickResponse + context }
      );
      fullConversationContext.push({ role: 'assistant', content: quickResponse });
      
      if (conversationHistory.length > 4) {
        conversationHistory = conversationHistory.slice(-4);
      }

      await ttsService.sendResponse(ws, streamSid, quickResponse, 'INSTANT', currentTime);
      
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    }

    // PRIORITY 3: CHECK MEGA QUICK RESPONSES
    const megaResponse = responseMatcher.findMegaResponse(clean, streamSid);
    if (megaResponse) {
      console.log(`🚀 MEGA CACHE HIT (0ms): "${megaResponse}"`);
      
      conversationMemory.addToConversationContext(streamSid, 'assistant', megaResponse);
      
      // Add to BOTH contexts
      conversationHistory.push(
        { role: 'user', content: clean },
        { role: 'assistant', content: megaResponse }
      );
      fullConversationContext.push({ role: 'assistant', content: megaResponse });
      
      if (conversationHistory.length > 4) {
        conversationHistory = conversationHistory.slice(-4);
      }

      await ttsService.sendResponse(ws, streamSid, megaResponse, 'MEGA', currentTime);
      
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    }

    // PRIORITY 4: SMART PATTERN MATCHING
    const patternMatch = responseMatcher.findPatternMatch(clean);
    if (patternMatch) {
      console.log(`🎯 PATTERN MATCH (0ms): ${patternMatch.type}`);
      
      conversationMemory.addToConversationContext(streamSid, 'assistant', patternMatch.response);
      
      // Add to contexts
      fullConversationContext.push({ role: 'assistant', content: patternMatch.response });
      
      await handleInstantResponse(patternMatch.response, clean, currentTime);
      return;
    }

    // PRIORITY 5: FALLBACK TO GPT-3.5 (last resort)
    console.log('🤖 Using GPT-3.5 as final fallback...');

    try {
      const startTime = Date.now();
      const appointment = conversationMemory.getAppointment(streamSid);

      // NEW: Pass conversation memory to GPT for context awareness
      const aiResponse = await gptService.getContextualResponse(
        clean, 
        fullConversationContext, 
        appointment, 
        streamSid, 
        conversationMemory, 
        streamSid
      );
      const gptTime = Date.now() - startTime;
      
      if (aiResponse && aiResponse.length > 2) {
        console.log(`🤖 GPT-3.5 FAST (${gptTime}ms): "${aiResponse}"`);
        
        conversationMemory.addToConversationContext(streamSid, 'assistant', aiResponse);
        
        // Add to BOTH contexts
        conversationHistory.push(
          { role: 'user', content: clean },
          { role: 'assistant', content: aiResponse }
        );
        fullConversationContext.push({ role: 'assistant', content: aiResponse });
        
        if (conversationHistory.length > 4) {
          conversationHistory = conversationHistory.slice(-4);
        }

        await handleInstantResponse(aiResponse, clean, currentTime);
      } else {
        throw new Error('Empty response');
      }
      
    } catch (err) {
      console.log(`❌ GPT failed (${err.message}) - using ENHANCED fallback`);
      
      // ENHANCED FALLBACK with memory awareness
      const fallbackResponse = getEnhancedFallback(clean, conversationHistory, streamSid);
      
      console.log(`🔄 ENHANCED FALLBACK (0ms): "${fallbackResponse}"`);
      
      conversationMemory.addToConversationContext(streamSid, 'assistant', fallbackResponse);
      
      // Add to contexts
      fullConversationContext.push({ role: 'assistant', content: fallbackResponse });
      
      await handleInstantResponse(fallbackResponse, clean, currentTime);
    }
  }

  // Helper function for instant responses
  async function handleInstantResponse(responseText, userText, startTime) {
    // ENHANCED: Track as recently processed to prevent late duplicates
    recentlyProcessed.set(userText, Date.now());
    
    conversationHistory.push(
      { role: 'user', content: userText },
      { role: 'assistant', content: responseText }
    );
    if (conversationHistory.length > 4) {
      conversationHistory = conversationHistory.slice(-4);
    }

    await ttsService.sendResponse(ws, streamSid, responseText, 'ULTRA', startTime);
    
    isProcessing = false;
    setImmediate(() => processTranscriptionQueue());
  }

  // Handle transcription events
  transcriber.on('transcription', async (text) => {
    // Add to queue immediately, no filtering
    processingQueue.push(text);
    console.log(`📥 Queue: "${text}"`);
    
    // Process immediately
    setImmediate(() => processTranscriptionQueue());
  });

  // Handle WebSocket messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.event) {
        case 'start':
          console.log('🎬 START!'.rainbow);
          streamSid = message.start.streamSid;

          // FASTEST greeting possible
          const greetingBuffer = await ttsService.generateGreeting();
          await sendAudioUltraFast(ws, streamSid, greetingBuffer);
          break;

        case 'media':
          transcriber.send(message.media.payload);
          break;

        case 'stop':
          transcriber.stop();
          break;
      }
    } catch (err) {
      console.error('❌ Message error:', err.message);
    }
  });

  // Handle connection close
  ws.on('close', () => {
    console.log('🔌 Closed');
    transcriber.stop();
    lastTranscript = null;
    processingQueue = [];
    conversationHistory = [];
    fullConversationContext = []; // Clear full context
    recentlyProcessed.clear(); // Clear recent tracking
    isProcessing = false;
    conversationMemory.clearAppointment(streamSid);
  });

  // Handle WebSocket errors
  ws.on('error', (err) => console.error('❌ WS error:', err.message));
}

module.exports = { createConnectionHandler };