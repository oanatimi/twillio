// services/conversation-memory.js - ENHANCED: Complete generic conversation memory with auto-appointment detection

class ConversationMemory {
  constructor() {
    this.appointments = new Map(); // streamSid -> appointment details
    this.conversationState = new Map(); // streamSid -> current state
    this.partialBookings = new Map(); // streamSid -> incomplete booking info
    this.conversationContexts = new Map(); // streamSid -> recent conversation history
    this.clientIntentions = new Map(); // NEW: Track client intentions like "coming now"
  }

  // NEW: Auto-detect and save appointments from conversation
  detectAndSaveAppointment(streamSid, text) {
    const lowerText = text.toLowerCase();
    
    // Generic time expressions
    const timeExpressions = {
      'dimineața': 'ora opt',
      'dimineata': 'ora opt', 
      'de dimineață': 'ora opt',
      'de dimineata': 'ora opt',
      'după-amiază': 'ora paisprezece',
      'dupa-amiaza': 'ora paisprezece',
      'seara': 'ora șaisprezece',
      'la ora opt': 'ora opt',
      'la opt': 'ora opt',
      'la nouă': 'ora nouă',
      'la zece': 'ora zece',
      'la unsprezece': 'ora unsprezece',
      'la douăsprezece': 'ora douăsprezece',
      'la treisprezece': 'ora treisprezece',
      'la paisprezece': 'ora paisprezece',
      'la cincisprezece': 'ora cincisprezece',
      'la șaisprezece': 'ora șaisprezece',
      'ora opt': 'ora opt',
      'ora nouă': 'ora nouă',
      'ora zece': 'ora zece',
      'ora unsprezece': 'ora unsprezece',
      'ora douăsprezece': 'ora douăsprezece',
      'opt dimineața': 'ora opt',
      'nouă dimineața': 'ora nouă',
      'zece dimineața': 'ora zece',
      '8:00': 'ora opt',
      '9:00': 'ora nouă',
      '10:00': 'ora zece',
      '11:00': 'ora unsprezece',
      '12:00': 'ora douăsprezece',
      'ora 8': 'ora opt',
      'ora 9': 'ora nouă',
      'ora 10': 'ora zece'
    };
    
    // Generic day expressions  
    const dayExpressions = [
      'mâine', 'maine', 'astăzi', 'astazi', 'azi',
      'luni', 'marți', 'marti', 'miercuri', 'joi', 'vineri',
      'săptămâna viitoare', 'saptamana viitoare',
      'peste o săptămână', 'peste o saptamana',
      'peste două zile', 'peste doua zile',
      'poimâine', 'poimaine'
    ];
    
    // Detect any day mentioned
    let detectedDay = null;
    for (const day of dayExpressions) {
      if (lowerText.includes(day)) {
        detectedDay = day;
        break;
      }
    }
    
    // Detect any time mentioned
    let detectedTime = null;
    for (const [timePhrase, standardTime] of Object.entries(timeExpressions)) {
      if (lowerText.includes(timePhrase)) {
        detectedTime = standardTime;
        break;
      }
    }
    
    // Auto-save appointment if both day and time detected
    if ((detectedDay || detectedTime) && !this.hasAppointment(streamSid)) {
      const isQuestion = lowerText.includes('ce oră') || lowerText.includes('la ce oră') || lowerText.includes('de la ce oră');
      if (isQuestion) {
        console.log('❌ NU salvăm ora implicită din întrebare despre programare.');
        return false;
      }
    }
    // Save partial booking if only day or only time
    if ((detectedDay || detectedTime) && !this.hasAppointment(streamSid)) {
      const partialInfo = {};
      if (detectedDay) partialInfo.day = detectedDay;
      if (detectedTime) partialInfo.time = detectedTime;
      
      this.setPartialBooking(streamSid, partialInfo);
      console.log(`🤖 AUTO-PARTIAL BOOKING: ${JSON.stringify(partialInfo)}`.yellow);
      return true;
    }
    
    return false;
  }

  // Track conversation context for context-aware responses
  addToConversationContext(streamSid, role, content) {
    if (!this.conversationContexts.has(streamSid)) {
      this.conversationContexts.set(streamSid, []);
    }
    
    const context = this.conversationContexts.get(streamSid);
    context.push({ role, content, timestamp: Date.now() });
    
    // Keep only last 8 messages (4 exchanges)
    if (context.length > 8) {
      context.splice(0, context.length - 8);
    }
    
    this.conversationContexts.set(streamSid, context);
    
    // NEW: Track specific client intentions
    this.trackClientIntentions(streamSid, role, content);
    
    // NEW: Auto-detect appointments from any message
    if (role === 'user' || role === 'assistant') {
      this.detectAndSaveAppointment(streamSid, content);
    }
  }

  // NEW: Track important client intentions
  trackClientIntentions(streamSid, role, content) {
    if (role !== 'user') return;
    
    const lowerContent = content.toLowerCase();
    const intentions = this.clientIntentions.get(streamSid) || {};
    
    // Track "coming now" intentions
    if (lowerContent.includes('acum') || lowerContent.includes('vin acum') || lowerContent.includes('să vin acum')) {
      intentions.comingNow = {
        confirmed: true,
        timestamp: Date.now(),
        originalText: content
      };
      console.log(`🧠 INTENTION TRACKED: Client wants to come NOW`.cyan);
    }
    
    // Track car problems mentioned
    if (lowerContent.includes('problemă') || lowerContent.includes('nu mai') || lowerContent.includes('merge greu')) {
      intentions.hasProblem = {
        confirmed: true,
        timestamp: Date.now(),
        problem: content
      };
      console.log(`🧠 PROBLEM TRACKED: ${content}`.cyan);
    }
    
    // Track when they ask about specific services
    if (lowerContent.includes('cât costă') || lowerContent.includes('preț')) {
      intentions.askingPrice = {
        confirmed: true,
        timestamp: Date.now(),
        service: content
      };
    }
    
    this.clientIntentions.set(streamSid, intentions);
  }

  // NEW: Get client intentions
  getClientIntentions(streamSid) {
    return this.clientIntentions.get(streamSid) || {};
  }

  // NEW: Check if client said they're coming now (within last 2 minutes)
  isClientComingNow(streamSid) {
    const intentions = this.getClientIntentions(streamSid);
    if (intentions.comingNow && intentions.comingNow.confirmed) {
      const timeDiff = Date.now() - intentions.comingNow.timestamp;
      return timeDiff < 120000; // 2 minutes
    }
    return false;
  }

  // Get conversation context
  getConversationContext(streamSid) {
    return this.conversationContexts.get(streamSid) || [];
  }

  // Track confirmed appointments (both day AND time required)
  setAppointment(streamSid, day, time, service) {
    this.appointments.set(streamSid, {
      day: day,
      time: time,
      service: service,
      confirmed: true,
      timestamp: Date.now()
    });
    
    // Clear partial booking when full appointment is set
    this.partialBookings.delete(streamSid);
    
    console.log(`📅 APPOINTMENT SAVED: ${day} at ${time} for ${service}`.green);
  }

  // Track partial booking info (day OR time, but not both)
  setPartialBooking(streamSid, info) {
    const existing = this.partialBookings.get(streamSid) || {};
    const updated = { ...existing, ...info, timestamp: Date.now() };
    this.partialBookings.set(streamSid, updated);
    
    console.log(`📝 PARTIAL BOOKING: ${JSON.stringify(updated)}`.yellow);
    
    // If we now have both day and time, create full appointment
    if (updated.day && updated.time) {
      this.setAppointment(streamSid, updated.day, updated.time, updated.service || 'servicii auto');
      return true; // Indicates booking is now complete
    }
    
    return false; // Still incomplete
  }

  // Get partial booking info
  getPartialBooking(streamSid) {
    return this.partialBookings.get(streamSid);
  }

  // Check if appointment already exists
  hasAppointment(streamSid) {
    return this.appointments.has(streamSid);
  }

  // Check if partial booking exists
  hasPartialBooking(streamSid) {
    return this.partialBookings.has(streamSid);
  }

  // Get current appointment
  getAppointment(streamSid) {
    return this.appointments.get(streamSid);
  }

  // Clear appointment and partial bookings
  clearAppointment(streamSid) {
    this.appointments.delete(streamSid);
    this.partialBookings.delete(streamSid);
    this.conversationState.delete(streamSid);
    this.conversationContexts.delete(streamSid);
    this.clientIntentions.delete(streamSid); // Clear intentions too
  }

  // Update conversation state
  setState(streamSid, state) {
    this.conversationState.set(streamSid, state);
  }

  getState(streamSid) {
    return this.conversationState.get(streamSid) || 'initial';
  }
}

// UNIVERSAL TEXT NORMALIZER - handles all Romanian diacritics and common variations
function normalizeText(text) {
  return text.toLowerCase()
    .trim()
    // Romanian diacritics
    .replace(/[țţ]/g, 't')
    .replace(/[ăâ]/g, 'a') 
    .replace(/[îâ]/g, 'i')
    .replace(/[șş]/g, 's')
    .replace(/[ă]/g, 'a')
    // Common word variations that Google STT creates
    .replace(/direcția/g, 'directie')
    .replace(/direcție/g, 'directie')
    .replace(/mașinii/g, 'masina')
    .replace(/mașina/g, 'masina')
    .replace(/cauciucuri/g, 'cauciuc')
    .replace(/anvelope/g, 'anvelope')
    .replace(/roțile/g, 'roti')
    .replace(/roți/g, 'roti')
    // Time variations
    .replace(/dimineața/g, 'dimineata')
    .replace(/după-amiază/g, 'dupa-amiaza')
    .replace(/după-amiaza/g, 'dupa-amiaza')
    // Remove extra spaces and punctuation
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ');
}

// ENHANCED SIMILARITY CHECK - works for any Romanian text
function isTextSimilar(text1, text2, threshold = 0.85) {
  if (!text1 || !text2) return false;
  
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Word-based similarity for longer phrases
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  const commonWords = words1.filter(w => words2.includes(w));
  const similarity = commonWords.length / Math.max(words1.length, words2.length);
  
  // Also check length similarity to avoid false positives
  const lengthSimilar = Math.abs(words1.length - words2.length) <= 1;
  
  return similarity >= threshold && lengthSimilar;
}

// NEW: Generic availability response generator
function generateAvailabilityResponse() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  
  // Working day (Mon-Fri) and still open
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour < 17) {
    return `Puteți veni astăzi până la ora șaptesprezece sau mâine de la ora opt. Când vă convine?`;
  }
  
  // Friday after hours
  if (dayOfWeek === 5 && hour >= 17) {
    return `Puteți veni luni de la ora opt dimineața. Când vă convine să programați?`;
  }
  
  // Weekend
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    return `Puteți veni luni de la ora opt dimineața. Weekendul suntem închisi. Când programați?`;
  }
  
  // After hours on working days (Tue-Thu after 17:00)
  return `Puteți veni mâine de la ora opt dimineața. Când vă convine să programați?`;
}

// NEW: Generic question type detection algorithm
function detectQuestionType(text) {
  const lowerText = text.toLowerCase();
  
  // Generic intention detection - not specific word combinations
  const questionPatterns = {
    // Client asks about AVAILABILITY (when they CAN come) - generic pattern
    availability: /\b(când.*pot|când.*putea|când.*aș putea|când.*să|în ce zi|ce zi|când.*aduc|când.*vin)\b/i,
    
    // Client asks about CAUSES (why something happens)
    cause: /\b(din ce|de ce|care.*cauza|cauza|ce provoacă|motivul)\b/i,
    
    // Client asks about PRICE (how much it costs)
    price: /\b(cât costă|preț|cost|tarif|suma|bani)\b/i,
    
    // Client asks about DURATION (how long it takes)
    duration: /\b(cât durează|cât timp|durata|ore|minute|mult timp)\b/i,
    
    // Client asks about PROCEDURE (how something is done)
    how: /\b(cum|în ce fel|procedura|se face|funcționează)\b/i,
    
    // Client asks about GENERAL SCHEDULE/PROGRAM
    when: /\b(când|ce oră|program|deschis)\b/i,
    
    // Client asks about LOCATION
    where: /\b(unde|adresa|locația|găsesc|găsiți)\b/i,
    
    // Client asks about SERVICES
    what: /\b(ce.*servicii|ce faceți|ce.*reparați|ce probleme|ce oferiți)\b/i,
    
    // Client asks about POSSIBILITY
    can: /\b(puteți|se poate|posibilitatea|posibil)\b/i
  };
  
  // Check which question type matches
  for (const [type, pattern] of Object.entries(questionPatterns)) {
    if (pattern.test(lowerText)) {
      return type;
    }
  }
  
  // If starts with question word, it's a general question
  if (/^(ce|cum|când|unde|de ce|cât|care|pot|se poate)/i.test(lowerText.trim())) {
    return 'general_question';
  }
  
  return null;
}

// NEW: Generate contextual answer based on question type and topic
function generateContextualAnswer(questionType, text, isComingNow = false) {
  const lowerText = text.toLowerCase();
  
  // Detect topic from text
  let topic = 'general';
  if (/direcți|volan|merge greu|greu.*volan|greu.*direcț/i.test(lowerText)) topic = 'steering';
  else if (/motor|nu pornește|sună|trage|nu.*trage|pornire/i.test(lowerText)) topic = 'engine';
  else if (/frân|scârț|oprire|frâne/i.test(lowerText)) topic = 'brakes';
  else if (/roți|anvelope|cauciuc|pneuri/i.test(lowerText)) topic = 'tires';
  else if (/baterie|nu mai pornește|descărcat/i.test(lowerText)) topic = 'battery';
  else if (/ulei|schimb.*ulei|ulei.*motor/i.test(lowerText)) topic = 'oil';
  else if (/suspensie|amortizor|arc/i.test(lowerText)) topic = 'suspension';
  
  const timeContext = isComingNow ? 'când ajungeți acum' : 'Cand ati dori sa veniti in service?';
  const actionContext = isComingNow ? 'Vă așteptăm acum' : 'Cand ati dori sa veniti in service?';
  
  // Generate answer based on question type and topic
  switch (questionType) {
    case 'cause':
      switch (topic) {
        case 'steering':
          return `Direcția grea poate fi de la ulei hidraulic scăzut, cremalierea uzată sau pompa de direcție defectă. Vă verific exact ${timeContext}.`;
        case 'engine':
          return `Motorul poate avea probleme de la baterie descărcată, bujii uzate, filtru de aer înfundat sau sistem de alimentare. Vă diagnosticez ${timeContext}.`;
        case 'brakes':
          return `Frânele pot scârțâi de la plăcuțe uzate, discuri deteriorate sau lipsă lichid de frână. Vă verific ${timeContext}.`;
        case 'battery':
          return `Bateria se poate descărca de la alternator defect, consum mare sau vechime. Vă testez ${timeContext}.`;
        case 'oil':
          return `Uleiul se murdărește de la uzura motorului și combustia incompletă. Vă verific ${timeContext}.`;
        default:
          return `Pot fi mai multe cauze diferite. Vă verific exact problema ${timeContext}.`;
      }
      
    case 'price':
      switch (topic) {
        case 'steering':
          return `Pentru direcție  depinde de problemă. Vă dau prețul exact ${timeContext}.`;
        case 'engine':
          return `Reparația depinde de problemă. ${actionContext}.`;
        case 'brakes':
          return ` depinde de ce trebuie schimbat. ${actionContext}.`;
        case 'oil':
          return `Schimbul de ulei costă optzeci-o sută cincizeci lei cu totul inclus. ${actionContext}.`;
        case 'tires':
          return `Prețul anvelopelor depinde de mărime și marcă. Vă fac ofertă ${timeContext}.`;
        default:
          return `Vă dau prețul exact ${timeContext} după verificare.`;
      }
      
    case 'duration':
      switch (topic) {
        case 'steering':
          return `Direcția durează două-patru ore de lucru, depinde de complexitate. Vă spun exact ${timeContext}.`;
        case 'engine':
          return `Diagnosticarea durează treizeci-patruzeci de minute. Reparația poate dura ore sau zile. ${actionContext}.`;
        case 'brakes':
          return `Frânele durează una-două ore pentru schimb plăcuțe. ${actionContext}.`;
        case 'oil':
          return `Schimbul de ulei durează treizeci de minute. ${actionContext}.`;
        default:
          return `Vă spun durata exactă ${timeContext} după verificare.`;
      }
      
    case 'how':
      switch (topic) {
        case 'steering':
          return `Verificăm presiunea uleiului hidraulic, cremalierea și pompă. Vă explic procedura ${timeContext}.`;
        case 'engine':
          return `Facem diagnosticare computerizată pentru identificarea exactă a problemei. ${actionContext}.`;
        case 'brakes':
          return `Verificăm plăcuțele, discurile și lichidul de frână. ${actionContext}.`;
        default:
          return `Vă explic toată procedura ${timeContext}.`;
      }
      
    case 'availability':
      // NEW: Generic availability response - adapts to current time/day
      return generateAvailabilityResponse();
      
    case 'when':
      return isComingNow ? 
        `Pentru acum vă așteptăm, suntem deschisi până la ora șaptesprezece.` : 
        `Suntem deschisi luni-vineri opt-șaptesprezece. Când vă convine să programați?`;
        
    case 'where':
      return `Ne găsiți pe Strada Dorobanților optsprezece-douăzeci, Cluj-Napoca.`;
      
    case 'what':
      return `Oferim diagnosticare computerizată, reparații motor, direcție, frâne, suspensie, schimb ulei și anvelope. Ce problemă aveți?`;
      
    case 'can':
    case 'is_possible':
      return isComingNow ? 
        `Desigur, vă așteptăm acum la service. Suntem deschisi.` : 
        `Desigur, vă putem ajuta cu orice problemă auto. Cand ati dori sa veniti in service??`;
        
    case 'general_question':
      return isComingNow ? 
        `Vă răspund la toate întrebările ${timeContext}.` : 
        `Cu plăcere să vă răspund la orice întrebare. ${actionContext}?`;
        
    default:
      return null;
  }
}

// FIXED: Weekend checker with correct logic for Romanian auto service
function isWeekend(day) {
  const now = new Date();
  const today = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Check if "mâine" is weekend
  if (day === 'mâine') {
    const tomorrow = (today + 1) % 7;
    return tomorrow === 0 || tomorrow === 6; // Sunday or Saturday
  }
  
  // Check specific days
  if (day === 'sâmbătă' || day === 'sambata' || day === 'duminică' || day === 'duminica') {
    return true;
  }
  
  return false;
}

// FIXED: Get next working day with correct logic
function getNextWorkingDay() {
  const now = new Date();
  const today = now.getDay();
  
  if (today === 5) return 'luni'; // Friday -> Monday
  if (today === 6 || today === 0) return 'luni'; // Weekend -> Monday
  
  const days = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const tomorrow = (today + 1) % 7;
  
  if (tomorrow === 6 || tomorrow === 0) return 'luni'; // If tomorrow is weekend
  
  return days[tomorrow];
}

// FIXED: Enhanced user intention detection with scheduling intent fix
function detectUserIntention(text) {
  const cleaned = text.toLowerCase().trim();
  
  // Simple day detection
  let detectedDay = null;
  if (cleaned.includes('mâine') || cleaned.includes('maine')) detectedDay = 'mâine';
  else if (cleaned.includes('astăzi') || cleaned.includes('astazi') || cleaned.includes('azi')) detectedDay = 'astăzi';
  else if (cleaned.includes('luni')) detectedDay = 'luni';
  else if (cleaned.includes('marți') || cleaned.includes('marti')) detectedDay = 'marți';
  else if (cleaned.includes('miercuri')) detectedDay = 'miercuri';
  else if (cleaned.includes('joi')) detectedDay = 'joi';
  else if (cleaned.includes('vineri')) detectedDay = 'vineri';
  
  // Simple time detection
  let detectedTime = null;
  if (cleaned.includes('9:00') || cleaned.includes('nouă')) detectedTime = 'ora nouă';
  else if (cleaned.includes('10:00') || cleaned.includes('zece')) detectedTime = 'ora zece';
  else if (cleaned.includes('8:00') || cleaned.includes('opt')) detectedTime = 'ora opt';
  else if (cleaned.includes('11:00') || cleaned.includes('unsprezece')) detectedTime = 'ora unsprezece';
  
  // Simple scheduling intent detection
  const hasSchedulingIntent = cleaned.includes('programare') || cleaned.includes('nevoie');
  
  return {
    day: detectedDay,
    time: detectedTime,
    hasSchedulingIntent: hasSchedulingIntent,
    originalText: text
  };
}
// FIXED: Smart weekend checker with correct logic
function isWeekendDay(day) {
  const now = new Date();
  const today = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  if (day === 'mâine') {
    const tomorrow = (today + 1) % 7;
    return tomorrow === 0 || tomorrow === 6; // Sunday or Saturday
  }
  
  if (day === 'poimâine') {
    const dayAfterTomorrow = (today + 2) % 7;
    return dayAfterTomorrow === 0 || dayAfterTomorrow === 6;
  }
  
  if (day === 'astăzi') {
    return today === 0 || today === 6;
  }
  
  // Weekend explicit
  return ['sâmbătă', 'sambata', 'duminică', 'duminica'].includes(day);
}

// FIXED: Get next working day with proper logic
function getNextWorkingDay(fromDay = null) {
  const now = new Date();
  let currentDay = now.getDay();
  
  // Dacă e pentru o zi specifică, calculează de la acea zi
  if (fromDay === 'mâine') currentDay = (currentDay + 1) % 7;
  if (fromDay === 'poimâine') currentDay = (currentDay + 2) % 7;
  if (fromDay === 'astăzi') currentDay = now.getDay();
  
  // Găsește următoarea zi lucrătoare
  while (currentDay === 0 || currentDay === 6) { // Skip weekend
    currentDay = (currentDay + 1) % 7;
  }
  
  const days = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  return days[currentDay];
}

// ENHANCED: Main memory-based response function with WEEKEND FIX

function findQuickResponseWithMemory(text, streamSid, memory) {
  const cleaned = text.toLowerCase().trim();
  
  const existingAppointment = memory.getAppointment(streamSid);
  const partialBooking = memory.getPartialBooking(streamSid);
  
  const userIntent = detectUserIntention(text);
  console.log(`🧠 INTENT DETECTED:`, userIntent);
  
  // HANDLE ONLY THE MOST BASIC SCHEDULING SCENARIOS
  
  // 1. Pure scheduling request with both day and time
  if (userIntent.hasSchedulingIntent && userIntent.day && userIntent.time && !existingAppointment) {
    // Weekend check
    if (isWeekendDay(userIntent.day)) {
      const nextWorkingDay = getNextWorkingDay(userIntent.day);
      return `${userIntent.day.charAt(0).toUpperCase() + userIntent.day.slice(1)} este weekend și suntem închisi. Vă pot programa pentru ${nextWorkingDay}. La ce oră vă convine?`;
    }
    
    // Create appointment
    memory.setAppointment(streamSid, userIntent.day, userIntent.time, 'servicii auto');
    return `Excelent! Programarea pentru ${userIntent.day} la ${userIntent.time} este confirmată cu succes!`;
  }
  
  // 2. Partial booking - only day, ask for time
  if (userIntent.hasSchedulingIntent && userIntent.day && !userIntent.time && !existingAppointment && !partialBooking) {
    if (isWeekendDay(userIntent.day)) {
      const nextWorkingDay = getNextWorkingDay(userIntent.day);
      return `${userIntent.day.charAt(0).toUpperCase() + userIntent.day.slice(1)} este weekend și suntem închisi. Vă pot programa pentru ${nextWorkingDay}. La ce oră vă convine?`;
    }
    
    memory.setPartialBooking(streamSid, { day: userIntent.day, service: 'servicii auto' });
    return `Perfect pentru ${userIntent.day}! La ce oră vă este cel mai convenabil să veniți?`;
  }
  
  // 3. Complete partial booking when user gives time
  if (partialBooking && partialBooking.day && !partialBooking.time && userIntent.time) {
    const isComplete = memory.setPartialBooking(streamSid, { time: userIntent.time });
    if (isComplete) {
      return `Excelent! Programarea pentru ${partialBooking.day} la ${userIntent.time} este confirmată cu succes!`;
    }
  }
  
  // 4. Simple confirmations for partial bookings
  if (partialBooking && (cleaned === 'da' || cleaned === 'ok' || cleaned === 'bine' || cleaned === 'perfect')) {
    if (partialBooking.day && !partialBooking.time) {
      return `Perfect pentru ${partialBooking.day}! La ce oră vă este convenabil să veniți?`;
    }
    if (partialBooking.time && !partialBooking.day) {
      return `Perfect pentru ${partialBooking.time}! Ce zi vă convine cel mai bine?`;
    }
  }
  
  // EVERYTHING ELSE GOES TO GPT - including:
  // - Questions about phone numbers, addresses, prices, services
  // - Complex requests that mention scheduling but ask other things too
  // - Conversations when appointment already exists
  // - Any other type of question or conversation
  
  console.log(`🎯 LETTING GPT HANDLE EVERYTHING ELSE`.cyan);
  return null; // Let GPT handle with full context
}
class BookingMemory {
  constructor() {
    this.reset();
  }

  reset() {
    this.service = null;
    this.time = null;
    this.day = null;
    this.implicitDay = null; // ex: „mâine" menționat în răspunsul GPT
    this.timestamp = null;
  }

  hasEnoughInfo() {
    return this.service && this.time && (this.day || this.implicitDay);
  }

  registerService(service) {
    this.service = service;
    this.timestamp = Date.now();
  }

  registerTime(time) {
    this.time = time;
    this.timestamp = Date.now();
  }

  registerDay(day) {
    this.day = day;
    this.timestamp = Date.now();
  }

  registerImplicitDay(day) {
    this.implicitDay = day;
  }

  shouldAskForDay() {
    return !this.day && !this.implicitDay;
  }

  debug() {
    return {
      service: this.service,
      time: this.time,
      day: this.day,
      implicitDay: this.implicitDay,
      timestamp: this.timestamp,
    };
  }
}

const bookingMemory = new BookingMemory();

module.exports = { 
  ConversationMemory, 
  findQuickResponseWithMemory, 
  normalizeText, 
  isTextSimilar,
  bookingMemory, 
  detectUserIntention, 
  isWeekendDay, 
  getNextWorkingDay 
};