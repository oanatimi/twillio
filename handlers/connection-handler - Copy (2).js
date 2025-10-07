// handlers/connection-handler.js - COMPLETE with Backend Integration

const axios = require('axios');
const { TranscriptionService } = require('../services/transcription-service.js');
const { ConversationMemory, normalizeText, isTextSimilar } = require('../services/conversation-memory.js');
const { ResponseMatcher } = require('../services/response-matcher.js');
const { TTSService } = require('../services/tts-service.js');
const { GPTService } = require('../services/gpt-service.js');
const { sendAudioUltraFast } = require('../utils/audio-streaming.js');

// Backend configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const VOICE_AGENT_ENDPOINT = `${BACKEND_URL}/api/appointments/quick`;

// Global conversation memory
const conversationMemory = new ConversationMemory();

// Store caller phone numbers
const callersPhone = new Map(); // streamSid -> phone number

// Save appointment to backend
async function saveAppointmentToBackend(appointment, streamSid) {
  try {
    console.log(`💾 Salvare programare în backend...`.cyan);
    
    const phoneNumber = callersPhone.get(streamSid) || '+40000000000';
    
    const payload = {
      phoneNumber: phoneNumber,
      clientName: appointment.clientName || null,
      day: appointment.day,
      time: appointment.time,
      serviceType: appointment.serviceType || 'MECANICA',
      problem: appointment.problem || null,
      plateNumber: appointment.plateNumber || null,
      vehicleMake: appointment.vehicleMake || null,
      vehicleModel: appointment.vehicleModel || null
    };

    console.log(`📤 Payload:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(VOICE_AGENT_ENDPOINT, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    if (response.data.success) {
      console.log(`✅ Programare salvată: ID ${response.data.appointmentId}`.green);
      console.log(`   Client: ${response.data.clientName}`);
      console.log(`   Data: ${response.data.appointmentTime}`);
      return {
        success: true,
        appointmentId: response.data.appointmentId,
        message: response.data.message
      };
    } else {
      console.error(`❌ Backend a respins programarea: ${response.data.message}`.red);
      return { success: false, error: response.data.message };
    }

  } catch (error) {
    if (error.response) {
      console.error(`❌ Backend error ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      console.error(`❌ Nu s-a primit răspuns de la backend:`, error.message);
    } else {
      console.error(`❌ Eroare la trimiterea cererii:`, error.message);
    }
    return { success: false, error: error.message };
  }
}

// ENHANCED FALLBACK with proper memory awareness
function getEnhancedFallback(text, conversationHistory, streamSid) {
  const lowerText = text.toLowerCase().trim();
  
  const existingAppointment = conversationMemory.getAppointment(streamSid);
  const partialBooking = conversationMemory.getPartialBooking(streamSid);
  
  if (existingAppointment) {
    const { day, time } = existingAppointment;
    
    if (lowerText.includes('când') || lowerText.includes('ce oră') || lowerText.includes('program')) {
      return `Aveți programarea confirmată pentru ${day} la ${time}. Vă așteptăm atunci.`;
    }
    
    if (lowerText.includes('da') || lowerText.includes('bine') || lowerText.includes('ok')) {
      return `Perfect! Programarea pentru ${day} la ${time} rămâne confirmată. Vă așteptăm cu drag.`;
    }
    
    if (lowerText.includes('direcți') || lowerText.includes('volan')) {
      return `Pentru direcția grea vă verific ${day} la ${time} când veniți.`;
    }
    
    if (lowerText.includes('motor')) {
      return `Pentru problema motorului vă diagnosticez ${day} la ${time}.`;
    }
    
    return `Pentru această problemă vă ajut ${day} la ${time} când veniți. Vă aștept cu drag.`;
  }
  
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
  
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWorkingHour = hour >= 8 && hour < 17;
  const isServiceOpen = isWorkingDay && isWorkingHour;
  
  if (lowerText.includes('acum') || lowerText.includes('pot să vin acum') || lowerText.includes('vin acum')) {
    if (isServiceOpen) {
      return "Desigur, veniți acum! Vă așteptăm la service.";
    } else {
      return "Pentru acum suntem închisi, dar vă pot programa pentru următoarea zi lucrătoare. Când vă convine?";
    }
  }
  
  const steeringKeywords = ['merge greu', 'volan greu', 'direcți', 'greu la volan', 'mașina merge greu', 'volanul e greu'];
  if (steeringKeywords.some(keyword => lowerText.includes(keyword))) {
    return "Pentru direcția grea recomand verificarea sistemului de direcție. Când ați dori să veniți în service?";
  }
  
  const recentMessages = conversationHistory.slice(-4).map(msg => msg.content.toLowerCase()).join(' ');
  
  if (recentMessages.includes('direcți') || recentMessages.includes('volan') || recentMessages.includes('merge greu')) {
    if (lowerText.includes('cauză') || lowerText.includes('de ce')) {
      return "Direcția grea poate fi de la ulei hidraulic sau cremalierea uzată. Reparație trei sute-cinci sute lei. Când ați dori să veniți în service?";
    }
    return "Pentru problemele de direcție vă putem ajuta cu drag. Când ați dori să veniți în service?";
  }
  
  if (recentMessages.includes('motor') || recentMessages.includes('sună')) {
    if (lowerText.includes('cauză') || lowerText.includes('de ce')) {
      return "Sunetul motorului poate fi de la distribuție sau ulei vechi. Diagnosticare optzeci-o sută douăzeci lei. Când ați dori să veniți în service?";
    }
    return "Pentru problemele de motor recomand diagnosticare. Când ați dori să veniți în service?";
  }
  
  if (lowerText.includes('da') || lowerText.includes('bine') || lowerText.includes('ok') || lowerText.includes('perfect')) {
    return "Excelent! La ce oră vă este cel mai convenabil să veniți?";
  }
  
  if (lowerText.includes('motor')) {
    return "Pentru problemele de motor recomand diagnosticare. Când ați dori să veniți în service?";
  }
  
  if (lowerText.includes('frân')) {
    return "Pentru problemele de frânare vă putem ajuta cu drag. Când ați dori să veniți în service?";
  }
  
  if (lowerText.includes('direcți') || lowerText.includes('volan')) {
    return "Pentru problemele de direcție vă putem ajuta cu drag. Când ați dori să veniți în service?";
  }
  
  if (lowerText.includes('baterie')) {
    return "Pentru bateria descărcată vă putem ajuta cu drag. Când ați dori să veniți în service?";
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
  
  return "Pentru această problemă vă ajutăm sigur. Când ați dori să veniți în service?";
}
// La începutul connection-handler.js, după BACKEND_URL

// Check available slots for a specific day and service
async function checkAvailableSlots(day, serviceType = 'MECANICA') {
  try {
    console.log(`🔍 Checking availability for ${day} - ${serviceType}`.cyan);
    
    // Parse day to date
    const targetDate = parseDayToDate(day);
    const fromStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const toStr = targetDate.plusDays(1).toISOString().split('T')[0];
    
    const url = `${BACKEND_URL}/api/appointments?service=${serviceType}&from=${fromStr}&to=${toStr}`;
    console.log(`📡 Request: ${url}`);
    
    const response = await axios.get(url, { timeout: 3000 });
    const appointments = response.data || [];
    
    console.log(`📊 Found ${appointments.length} existing appointments`);
    
    // Generate all possible slots (8-17, every 30 min)
    const allSlots = [];
    for (let hour = 8; hour < 17; hour++) {
      allSlots.push(`${hour}:00`);
      allSlots.push(`${hour}:30`);
    }
    
    // Filter out occupied slots
    const occupiedSlots = appointments.map(appt => {
      const startTime = new Date(appt.startAt);
      return `${startTime.getHours()}:${startTime.getMinutes().toString().padStart(2, '0')}`;
    });
    
    const availableSlots = allSlots.filter(slot => !occupiedSlots.includes(slot));
    
    // Convert to Romanian format
    const availableInRomanian = availableSlots.slice(0, 5).map(slot => {
      const [hour] = slot.split(':');
      return convertHourToRomanian(parseInt(hour));
    });
    
    console.log(`✅ Available slots: ${availableInRomanian.join(', ')}`.green);
    
    return {
      hasAvailability: availableSlots.length > 0,
      slots: availableInRomanian,
      count: availableSlots.length
    };
    
  } catch (error) {
    console.error(`❌ Error checking availability:`, error.message);
    return {
      hasAvailability: true, // Assume disponibil în caz de eroare
      slots: ['ora nouă', 'ora zece', 'ora unsprezece'],
      count: 3
    };
  }
}

// Helper: Parse day string to LocalDate
function parseDayToDate(day) {
  if (!day) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  const today = new Date();
  const normalized = day.toLowerCase().trim();
  
  switch (normalized) {
    case 'astăzi':
    case 'astazi':
    case 'azi':
      return today;
    
    case 'mâine':
    case 'maine':
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow;
    
    case 'poimâine':
    case 'poimaine':
      const dayAfter = new Date(today);
      dayAfter.setDate(today.getDate() + 2);
      return dayAfter;
    
    case 'luni':
      return getNextDayOfWeek(today, 1);
    case 'marți':
    case 'marti':
      return getNextDayOfWeek(today, 2);
    case 'miercuri':
      return getNextDayOfWeek(today, 3);
    case 'joi':
      return getNextDayOfWeek(today, 4);
    case 'vineri':
      return getNextDayOfWeek(today, 5);
    
    default:
      const tomorrow2 = new Date(today);
      tomorrow2.setDate(today.getDate() + 1);
      return tomorrow2;
  }
}

function getNextDayOfWeek(from, targetDay) {
  const result = new Date(from);
  const currentDay = from.getDay() || 7; // Sunday = 0 → 7
  let daysToAdd = targetDay - currentDay;
  
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }
  
  result.setDate(from.getDate() + daysToAdd);
  return result;
}

function convertHourToRomanian(hour) {
  const hours = {
    8: 'ora opt',
    9: 'ora nouă',
    10: 'ora zece',
    11: 'ora unsprezece',
    12: 'ora douăsprezece',
    13: 'ora treisprezece',
    14: 'ora paisprezece',
    15: 'ora cincisprezece',
    16: 'ora șaisprezece'
  };
  return hours[hour] || `ora ${hour}`;
}

// Check available slots
async function checkAvailableSlots(day, serviceType = 'MECANICA') {
  try {
    console.log(`Checking availability: ${day} - ${serviceType}`);
    
    const targetDate = parseDayToDate(day);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayNum = String(targetDate.getDate()).padStart(2, '0');
    const fromStr = `${year}-${month}-${dayNum}`;
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const toYear = nextDay.getFullYear();
    const toMonth = String(nextDay.getMonth() + 1).padStart(2, '0');
    const toDay = String(nextDay.getDate()).padStart(2, '0');
    const toStr = `${toYear}-${toMonth}-${toDay}`;
    
    const url = `${BACKEND_URL}/api/appointments?service=${serviceType}&from=${fromStr}&to=${toStr}`;
    console.log(`Request: ${url}`);
    
    const response = await axios.get(url, { timeout: 3000 });
    const appointments = response.data || [];
    
    console.log(`Found ${appointments.length} appointments`);
    
    // All possible slots (8-17, every hour)
    const allSlots = [];
    for (let hour = 8; hour < 17; hour++) {
      allSlots.push(hour);
    }
    
    // Occupied hours
    const occupiedHours = appointments.map(appt => {
      const startTime = new Date(appt.startAt);
      return startTime.getHours();
    });
    
    const availableHours = allSlots.filter(hour => !occupiedHours.includes(hour));
    
    // Convert to Romanian
    const availableInRomanian = availableHours.map(hour => convertHourToRomanian(hour));
    
    console.log(`Available: ${availableInRomanian.join(', ')}`);
    
    return {
      hasAvailability: availableHours.length > 0,
      slots: availableInRomanian,
      count: availableHours.length
    };
    
  } catch (error) {
    console.error(`Error checking availability:`, error.message);
    return {
      hasAvailability: true,
      slots: ['ora nouă', 'ora zece', 'ora unsprezece'],
      count: 3
    };
  }
}

function convertHourToRomanian(hour) {
  const hours = {
    8: 'ora opt', 9: 'ora nouă', 10: 'ora zece',
    11: 'ora unsprezece', 12: 'ora douăsprezece',
    13: 'ora treisprezece', 14: 'ora paisprezece',
    15: 'ora cincisprezece', 16: 'ora șaisprezece'
  };
  return hours[hour] || `ora ${hour}`;
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
  let conversationHistory = [];
  let fullConversationContext = [];
  let recentlyProcessed = new Map();
  const RECENT_WINDOW = 3000;

  function processTranscriptionQueue() {
    if (processingQueue.length === 0 || isProcessing) return;
    
    const latestTranscript = processingQueue[processingQueue.length - 1];
    processingQueue = [];
    
    console.log(`⚡ INSTANT procesare: "${latestTranscript}"`);
    processTranscription(latestTranscript);
  }

  async function processTranscription(text) {
  const clean = text.trim();
  const currentTime = Date.now();

  if (clean.length > 200) {
    console.log(`Skipping too long transcript`);
    isProcessing = false;
    setImmediate(() => processTranscriptionQueue());
    return;
  }

  if (clean.includes('stă bine') || clean.includes('începe vii') || clean.includes('ochi să')) {
    console.log(`Skipping nonsense transcript`);
    isProcessing = false;
    setImmediate(() => processTranscriptionQueue());
    return;
  }

  // Late duplicate detection
  if (lastTranscript && lastTranscript.length > 5) {
    const normalizedLast = normalizeText(lastTranscript);
    const normalizedCurrent = normalizeText(clean);
    
    if (normalizedCurrent.includes(normalizedLast) && clean.length > lastTranscript.length) {
      const timeSinceLast = currentTime - lastProcessedTime;
      
      if (timeSinceLast < 30000) {
        console.log(`Late duplicate detected`);
        
        let newPart = clean;
        const lastWords = lastTranscript.split(' ');
        for (let i = lastWords.length; i > 0; i--) {
          const partialLast = lastWords.slice(0, i).join(' ');
          if (clean.toLowerCase().includes(partialLast.toLowerCase())) {
            newPart = clean.substring(clean.toLowerCase().indexOf(partialLast.toLowerCase()) + partialLast.length).trim();
            break;
          }
        }
        
        if (newPart.length > 3 && newPart !== clean) {
          console.log(`Processing only NEW part: "${newPart}"`);
          isProcessing = false;
          return processTranscription(newPart);
        } else if (newPart !== clean) {
          console.log(`New part too short, skipping`);
          isProcessing = false;
          setImmediate(() => processTranscriptionQueue());
          return;
        }
      }
    }
  }

  for (const [recentText, recentTime] of recentlyProcessed.entries()) {
    if (isTextSimilar(recentText, clean, 0.75) && (currentTime - recentTime) < 10000) {
      console.log(`Skipping similar recent`);
      return;
    }
  }

  for (const [text, time] of recentlyProcessed.entries()) {
    if (currentTime - time > 10000) {
      recentlyProcessed.delete(text);
    }
  }

  const normalizedCurrent = normalizeText(clean);
  const normalizedLast = normalizeText(lastTranscript || '');
  
  const isExactDuplicate = lastTranscript === clean && (currentTime - lastProcessedTime < 2000);
  const isNormalizedDuplicate = normalizedCurrent === normalizedLast && (currentTime - lastProcessedTime < 5000);
  const isFuzzyDuplicate = isTextSimilar(lastTranscript, clean, 0.85) && (currentTime - lastProcessedTime < 10000);
  
  const shortConfirmations = ['da', 'nu', 'ok', 'bine', 'perfect', 'desigur'];
  const isShortConfirmation = shortConfirmations.includes(clean.toLowerCase());
  const minLength = isShortConfirmation ? 2 : 3;

  if (isProcessing || clean.length < minLength || isNormalizedDuplicate || isExactDuplicate || isFuzzyDuplicate) {
    return;
  }

  isProcessing = true;
  lastTranscript = clean;
  lastProcessedTime = currentTime;
  recentlyProcessed.set(clean, currentTime);
  
  console.log(`User: "${clean}"`);

  conversationMemory.addToConversationContext(streamSid, 'user', clean);
  fullConversationContext.push({ role: 'user', content: clean });
  
  if (fullConversationContext.length > 16) {
    fullConversationContext = fullConversationContext.slice(-16);
  }

  const startTime = Date.now();
  
  const quickCheckPromise = (async () => {
    const memoryResponse = conversationMemory.findQuickResponseWithMemory ? 
      conversationMemory.findQuickResponseWithMemory(clean, streamSid, conversationMemory) : null;
    
    if (memoryResponse) {
      return { type: 'memory', response: memoryResponse, time: Date.now() - startTime };
    }

    const quickResponse = responseMatcher.findQuickResponse(clean, streamSid);
    if (quickResponse) {
      return { type: 'quick', response: quickResponse, time: Date.now() - startTime };
    }

    const megaResponse = responseMatcher.findMegaResponse(clean, streamSid);
    if (megaResponse) {
      return { type: 'mega', response: megaResponse, time: Date.now() - startTime };
    }

    const patternMatch = responseMatcher.findPatternMatch(clean);
    if (patternMatch) {
      return { type: 'pattern', response: patternMatch.response, time: Date.now() - startTime };
    }

    return null;
  })();

  const gptPromise = gptService.getContextualResponse(
    clean,
    fullConversationContext,
    conversationMemory.getAppointment(streamSid),
    streamSid,
    conversationMemory,
    streamSid
  ).then(response => ({
    type: 'gpt',
    response: response,
    time: Date.now() - startTime
  })).catch(err => {
    console.log(`GPT parallel call failed: ${err.message}`);
    return null;
  });

  try {
    const results = await Promise.allSettled([quickCheckPromise, gptPromise]);
    
    const quickResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const gptResult = results[1].status === 'fulfilled' ? results[1].value : null;

    let finalResponse = null;
    let responseType = null;

    if (quickResult) {
      finalResponse = quickResult.response;
      responseType = quickResult.type;
      console.log(`${responseType.toUpperCase()} HIT (${quickResult.time}ms): "${finalResponse}"`);
    }
    else if (gptResult && gptResult.response) {
  finalResponse = gptResult.response;
  responseType = 'gpt';
  
  const partialBooking = conversationMemory.getPartialBooking(streamSid);
  
  // 🎯 CRITICAL CHECK: Avem serviciu și zi? → Check availability
  if (partialBooking && partialBooking.service && partialBooking.day && !partialBooking.time) {
    console.log(`🔍 Checking availability: ${partialBooking.day} - ${partialBooking.service}`);
    
    const availability = await checkAvailableSlots(partialBooking.day, partialBooking.service);
    
    if (availability.hasAvailability && availability.slots.length > 0) {
      const slotsText = availability.slots.slice(0, 3).join(', ');
      
      // 🎯 OVERRIDE GPT response cu orele reale
      finalResponse = `Pentru ${partialBooking.day} la ${partialBooking.service} avem disponibilitate la ${slotsText}. Care oră vă convine?`;
      console.log(`✅ Oferim sloturile reale: ${slotsText}`.green);
      
    } else {
      finalResponse = `Din păcate pentru ${partialBooking.day} nu mai avem locuri libere la ${partialBooking.service}. Putem programa pentru altă zi?`;
      console.log(`❌ Niciun slot disponibil`.red);
    }
  }
  // 🎯 Avem serviciu dar nu zi? → Ask for day
  else if (partialBooking && partialBooking.service && !partialBooking.day) {
    console.log(`📅 Avem serviciu (${partialBooking.service}), întreb pentru zi`);
    // Lasă GPT să întrebe ziua
  }
  // 🎯 Nu avem serviciu? → GPT ar trebui să întrebe
  else if (!partialBooking || !partialBooking.service) {
    console.log(`❓ Nu știm serviciul - GPT trebuie să întrebe`);
    // Verifică dacă GPT întreabă despre serviciu
    if (!finalResponse.toLowerCase().includes('serviciu') && 
        !finalResponse.toLowerCase().includes('itp') &&
        !finalResponse.toLowerCase().includes('vulcanizare') &&
        !finalResponse.toLowerCase().includes('mecanică')) {
      
      // FORȚEAZĂ întrebarea despre serviciu
      finalResponse = "Pentru ce serviciu doriți programare? Avem ITP, Vulcanizare, Climatizare sau Mecanică?";
      console.log(`🔧 Forced service question`.yellow);
    }
  }
  
  console.log(`🤖 GPT-4 (${gptResult.time}ms): "${finalResponse}"`);
}
    else {
      finalResponse = getEnhancedFallback(clean, conversationHistory, streamSid);
      responseType = 'fallback';
      console.log(`ENHANCED FALLBACK (${Date.now() - startTime}ms): "${finalResponse}"`);
    }

    conversationMemory.addToConversationContext(streamSid, 'assistant', finalResponse);
    
    const appointment = conversationMemory.getAppointment(streamSid);
    
    // Save to backend when appointment is complete
    if (appointment && appointment.confirmed && !appointment.savedToBackend) {
      console.log(`Appointment complete - saving to backend...`);
      
      const backendResult = await saveAppointmentToBackend({
        day: appointment.day,
        time: appointment.time,
        serviceType: appointment.service || 'MECANICA',
        problem: appointment.problem,
        clientName: appointment.clientName,
        plateNumber: appointment.plateNumber,
        vehicleMake: appointment.vehicleMake,
        vehicleModel: appointment.vehicleModel
      }, streamSid);
      
      if (backendResult.success) {
        appointment.savedToBackend = true;
        appointment.backendId = backendResult.appointmentId;
        console.log(`Programare salvată cu succes!`);
      } else {
        console.log(`Programare nu s-a salvat în backend: ${backendResult.error}`);
      }
    }
    
    const context = appointment ? ` [${appointment.day} ${appointment.time}]` : '';
    
    conversationHistory.push(
      { role: 'user', content: clean },
      { role: 'assistant', content: finalResponse + context }
    );
    
    fullConversationContext.push({ role: 'assistant', content: finalResponse });
    
    if (conversationHistory.length > 4) {
      conversationHistory = conversationHistory.slice(-4);
    }

    const ttsType = responseType === 'gpt' ? 'ULTRA' : 'INSTANT';
    await ttsService.sendResponse(ws, streamSid, finalResponse, ttsType, startTime);

  } catch (error) {
    console.error(`Processing error: ${error.message}`);
    
    const emergencyFallback = getEnhancedFallback(clean, conversationHistory, streamSid);
    console.log(`EMERGENCY FALLBACK: "${emergencyFallback}"`);
    
    conversationMemory.addToConversationContext(streamSid, 'assistant', emergencyFallback);
    fullConversationContext.push({ role: 'assistant', content: emergencyFallback });
    
    await ttsService.sendResponse(ws, streamSid, emergencyFallback, 'ULTRA', startTime);
  }

  isProcessing = false;
  setImmediate(() => processTranscriptionQueue());
}
  transcriber.on('transcription', async (text) => {
    processingQueue.push(text);
    console.log(`📥 Queue: "${text}"`);
    setImmediate(() => processTranscriptionQueue());
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.event) {
      case 'start':
        console.log('🎬 START!'.rainbow);
		 console.log('📦 Start message:', JSON.stringify(message.start, null, 2));
        streamSid = message.start.streamSid;
        
        // ✅ CORECT: Extrage numărul real de telefon
        const from = message.start.customParameters?.From ||  // Număr real
                     message.start.caller ||                   // Număr real (fallback 1)
                     message.start.from ||                     // Număr real (fallback 2)
                     '+40000000000';                           // Default
        
        // Normalizează numărul (elimină CallSid dacă a ajuns cumva)
        const normalizedPhone = from.startsWith('CA') && from.length > 20 
          ? '+40000000000'  // Este CallSid, nu număr
          : from;
        
        callersPhone.set(streamSid, normalizedPhone);
        console.log(`📞 Caller phone: ${normalizedPhone}`.cyan);

        const greetingBuffer = await ttsService.generateGreeting();
        await sendAudioUltraFast(ws, streamSid, greetingBuffer);
        break;

        case 'media':
          transcriber.send(message.media.payload);
          break;

        case 'stop':
          transcriber.stop();
          callersPhone.delete(streamSid);
          break;
      }
    } catch (err) {
      console.error('❌ Message error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Closed');
    transcriber.stop();
    lastTranscript = null;
    processingQueue = [];
    conversationHistory = [];
    fullConversationContext = [];
    recentlyProcessed.clear();
    isProcessing = false;
    conversationMemory.clearAppointment(streamSid);
    callersPhone.delete(streamSid);
  });

  ws.on('error', (err) => console.error('❌ WS error:', err.message));
}

module.exports = { createConnectionHandler };