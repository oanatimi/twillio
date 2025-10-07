// services/response-matcher.js - FIXED: Better steering problem recognition

const { findQuickResponseWithMemory } = require('./conversation-memory');
const { quickResponses, megaQuickResponses } = require('../data/quick-responses');

class ResponseMatcher {
  constructor(conversationMemory) {
    this.conversationMemory = conversationMemory;
    this.recentResponses = new Map();
    this.fastFallbacks = new Map();
  }

  // Check if we recently gave this response
  isResponseRecent(response, streamSid, timeWindowMs = 10000) {
    const key = `${streamSid}-${response}`;
    const lastTime = this.recentResponses.get(key);
    
    if (lastTime && (Date.now() - lastTime) < timeWindowMs) {
      return true;
    }
    
    // Clean old entries
    for (const [k, time] of this.recentResponses.entries()) {
      if ((Date.now() - time) > timeWindowMs) {
        this.recentResponses.delete(k);
      }
    }
    
    return false;
  }

  // Mark response as recently used
  markResponseAsUsed(response, streamSid) {
    const key = `${streamSid}-${response}`;
    this.recentResponses.set(key, Date.now());
  }

  isNaturalQuestion(text) {
    return /puteți|aveți|vă rog|cum|doriți|se poate|aș putea|mai aveți|este posibil/i.test(text);
  }

  // Helper function to check if service is currently open
  isServiceCurrentlyOpen() {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWorkingHour = hour >= 8 && hour < 17;
    
    return isWorkingDay && isWorkingHour;
  }

  // INSTANT RESPONSE FINDER - Enhanced with better time logic
  findQuickResponse(text, streamSid) {
    const cleaned = text.toLowerCase().trim();
    
    // FIRST: Check memory-based responses (appointments, etc.)
    const memoryResponse = findQuickResponseWithMemory(text, streamSid, this.conversationMemory);
    if (memoryResponse) {
      if (this.isResponseRecent(memoryResponse, streamSid)) {
        console.log(`⚠️ Blocked duplicate response: "${memoryResponse}"`);
        return null;
      }
      
      if (this.isNaturalQuestion(cleaned)) {
        console.log('🧠 Natural question detected - letting GPT handle');
        return null;
      }

      this.markResponseAsUsed(memoryResponse, streamSid);
      return memoryResponse;
    }
    
    // NEW: Dynamic "acum" responses based on current time
    if (cleaned === 'acum' || cleaned === 'pot să vin acum' || cleaned === 'vin acum') {
      const response = this.isServiceCurrentlyOpen()
        ? 'Desigur, veniți acum! Vă așteptăm la service.'
        : 'Pentru acum suntem închisi, dar vă pot programa pentru următoarea zi lucrătoare. Când vă convine?';
      
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    
    // NEW: Enhanced steering problem detection
    const steeringPatterns = [
      'merge greu', 'mașina merge greu', 'volanul e greu', 'volan greu', 
      'greu la volan', 'merge greu la direcție', 'direcția merge greu', 
      'e greu volanul', 'nu merge bine direcția', 'direcția nu merge bine'
    ];
    
    for (const pattern of steeringPatterns) {
      if (cleaned.includes(pattern) || cleaned === pattern) {
        const response = 'Pentru direcția grea recomand verificarea sistemului de direcție. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?';
        if (!this.isResponseRecent(response, streamSid)) {
          this.markResponseAsUsed(response, streamSid);
          return response;
        }
        return null;
      }
    }
    
    // Exact match first
    if (quickResponses[cleaned]) {
      const response = quickResponses[cleaned];
      if (this.isResponseRecent(response, streamSid)) {
        console.log(`⚠️ Blocked duplicate cached response for: "${cleaned}"`);
        return null;
      }
      this.markResponseAsUsed(response, streamSid);
      return response;
    }
    
    // SMART TIME VALIDATION for hour requests
    const hourMatch = cleaned.match(/ora (\d+)|(\d+):00/);
    if (hourMatch) {
      const hour = parseInt(hourMatch[1] || hourMatch[2]);
      // Valid working hours check could go here
    }
    
    // WEEKEND/DAY VALIDATION
    if (['sâmbătă', 'sâmbăta', 'sambata'].some(day => cleaned.includes(day))) {
      const response = quickResponses['sâmbătă'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    if (['duminică', 'duminica'].some(day => cleaned.includes(day))) {
      const response = quickResponses['duminică'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
      
    if (cleaned === 'astăzi') {
      const response = quickResponses['astăzi'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    
    // Service price questions
    if (cleaned.includes('cât costă') && cleaned.includes('schimb de direcție')) {
      const response = quickResponses['schimb de direcție'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    if (cleaned.includes('cât costă') && cleaned.includes('direcție')) {
      const response = quickResponses['direcție'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    
    // Time-specific questions
    if (cleaned.includes('de la ce oră') || cleaned.includes('program')) {
      const response = quickResponses['de la ce oră'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    if (cleaned.includes('unde') && (cleaned.includes('sunteți') || cleaned.includes('găsesc'))) {
      const response = quickResponses['unde sunteți'];
      if (!this.isResponseRecent(response, streamSid)) {
        this.markResponseAsUsed(response, streamSid);
        return response;
      }
      return null;
    }
    
    // Careful partial matching for longer keys only
    for (const [key, response] of Object.entries(quickResponses)) {
      if (key.length > 5 && cleaned === key) {
        if (!this.isResponseRecent(response, streamSid)) {
          this.markResponseAsUsed(response, streamSid);
          return response;
        }
        return null;
      }
    }
    
    return null;
  }

  // Check mega quick responses
  findMegaResponse(text, streamSid) {
    const cleaned = text.toLowerCase().trim();
    const megaResponse = megaQuickResponses[cleaned];
    
    if (megaResponse) {
      // Check for similar scheduling responses for "mâine" related queries
      if (cleaned.includes('mâine') && cleaned.includes('poate')) {
        const schedulingResponses = [
          'Perfect, mâine avem disponibilitate completă',
          'Perfect pentru mâine! La ce oră',
          'Excelent pentru mâine! Când'
        ];
        
        for (const schedResponse of schedulingResponses) {
          if (this.isResponseRecent(schedResponse, streamSid, 15000)) {
            console.log(`🔄 Mega response blocked - recently gave similar scheduling response`);
            return null;
          }
        }
      }
      
      // Track mega response usage
      if (typeof megaResponse === 'string') {
        this.markResponseAsUsed(megaResponse, streamSid);
      }
      
      return typeof megaResponse === 'function' ? megaResponse() : megaResponse;
    }
    
    return null;
  }

  // SMART PATTERN MATCHING for automotive problems
  findPatternMatch(text) {
    const lowerClean = text.toLowerCase();
    
    // NEW: Enhanced steering problems pattern matching
    if ((lowerClean.includes('merge') && lowerClean.includes('greu')) || 
        (lowerClean.includes('volan') && lowerClean.includes('greu')) ||
        (lowerClean.includes('direcți') && lowerClean.includes('greu')) ||
        (lowerClean.includes('sistemul') && lowerClean.includes('direcți'))) {
      return {
        response: 'Pentru direcția grea recomand verificarea sistemului de direcție. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Steering difficulty issue'
      };
    }
    
    // Engine sound problems
    if (lowerClean.includes('sună') && lowerClean.includes('motor')) {
      return {
        response: 'Pentru zgomotul motorului recomand diagnosticare computerizată. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Motor sound issue'
      };
    }
	
    if (lowerClean.includes('dezmembrari') || lowerClean.includes('dezmembrări') || lowerClean.includes('dezmembrat')) {
      return {
        type: 'dezmembrari',
        response: 'Noi suntem service auto, nu centru de dezmembrări. Aveți o problemă la mașină? Vă putem ajuta.'
      };
    }
    
    // Brake noise problems
    if (lowerClean.includes('frân') && (lowerClean.includes('scârț') || lowerClean.includes('zgomot'))) {
      return {
        response: 'Pentru zgomotul frânelor recomand schimbul plăcuțelor. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Brake noise issue'
      };
    }
    
    // Engine starting problems
    if ((lowerClean.includes('nu pornește') || lowerClean.includes('nu mai pornește')) && lowerClean.includes('motor')) {
      return {
        response: 'Pentru motorul care nu pornește recomand diagnosticare. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Engine starting issue'
      };
    }

    // Battery problems
    if (lowerClean.includes('baterie') && (lowerClean.includes('descărcat') || lowerClean.includes('nu mai'))) {
      return {
        response: 'Pentru bateria descărcată,ar trebui sa veniti in service?',
        type: 'Battery issue'
      };
    }

    // Suspension problems  
    if ((lowerClean.includes('suspensie') || lowerClean.includes('amortizor')) && lowerClean.includes('stricat')) {
      return {
        response: 'Pentru probleme suspensie recomand verificarea amortizorilor. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Suspension issue'
      };
    }

    // Oil problems
    if (lowerClean.includes('ulei') && (lowerClean.includes('schimb') || lowerClean.includes('vechi'))) {
      return {
        response: 'Pentru schimbul de ulei motor, va putem face o oferta.Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Oil change'
      };
    }

    // Tire problems
    if ((lowerClean.includes('roți') || lowerClean.includes('anvelope') || lowerClean.includes('cauciuc')) && 
        (lowerClean.includes('schimb') || lowerClean.includes('noi') || lowerClean.includes('uzat'))) {
      return {
        response: 'Pentru anvelope, prețul depinde de mărimea roților. Ati dori o ofertă?',
        type: 'Tire replacement'
      };
    }

    return null;
  }

  // SMART FALLBACK based on keywords and context
  getSmartFallback(text, fullConversationContext) {
    const lowerClean = text.toLowerCase();
    
    // Check recent context for topic-related discussion
    const recentContext = fullConversationContext.slice(-6).map(msg => msg.content.toLowerCase()).join(' ');
    
    // NEW: Steering-related fallbacks
    if (recentContext.includes('direcț') || recentContext.includes('volan') || recentContext.includes('merge greu')) {
      if (lowerClean.includes('cauză') || lowerClean.includes('de ce') || lowerClean.includes('greu')) {
        return "Direcția grea poate fi de la ulei hidraulic sau cremalieria uzată. Reparație trei sute-cinci sute lei. Cand ati dori sa veniti in service?";
      } else {
        return "Pentru problemele de direcție ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
      }
    }
    
    // Context-aware fallbacks based on recent conversation
    if (recentContext.includes('motor') || recentContext.includes('sună')) {
      if (lowerClean.includes('sunet') || lowerClean.includes('cauză') || lowerClean.includes('zgomot')) {
        return "Sunetul motorului poate fi de la distribuție sau ulei vechi. DAti dori sa veniti la noi in service sa vedem exact cauza problemei?";
      } else {
        return "Pentru problemele de motor recomand diagnosticare computerizată. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
      }
    } 
    
    if (recentContext.includes('frân')) {
      if (lowerClean.includes('cauză') || lowerClean.includes('de ce') || lowerClean.includes('zgomot')) {
        return "Zgomotul frânelor poate fi de la plăcuțe uzate sau discuri.Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
      } else {
        return "Pentru problemele de frânare Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
      }
    }

    // Keyword-based fallbacks from current text
    if (lowerClean.includes('direcț') || lowerClean.includes('volan') || lowerClean.includes('merge greu')) {
      return "Pentru problemele de direcție Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
    }
    
    if (lowerClean.includes('motor')) {
      return "Pentru problemele de motor recomand diagnosticare. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
    } 
    
    if (lowerClean.includes('frân')) {
      return "Pentru problemele de frânare Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
    }

    if (lowerClean.includes('baterie')) {
      return "Pentru bateria descărcată, Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
    }

    if (lowerClean.includes('suspensie') || lowerClean.includes('amortizor')) {
      return "Pentru probleme suspensie recomand verificarea amortizorilor. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
    }

    if (lowerClean.includes('ulei')) {
      return "pentru Schimbul de ulei Ati dori sa veniti la noi in service sa vedem exact cauza problemei?";
    }

    if (lowerClean.includes('roți') || lowerClean.includes('anvelope') || lowerClean.includes('cauciuc')) {
      return "Pentru anvelope noi, prețul depinde de mărimea roților. Când ați dori să veniți pentru o ofertă?";
    }

    // Time/scheduling related
    if (lowerClean.includes('când') || lowerClean.includes('program') || lowerClean.includes('oră')) {
      return "Programul nostru este luni-vineri între opt-șaptesprezece. Când vă convine cel mai bine?";
    }

    // Price related
    if (lowerClean.includes('cât') || lowerClean.includes('preț') || lowerClean.includes('cost')) {
      return "Cu plăcere să vă informez despre prețuri. Ce anume la mașină vă interesează să reparați?";
    }

    // Location related
    if (lowerClean.includes('unde') || lowerClean.includes('adres') || lowerClean.includes('locație')) {
      return "Ne găsiți pe Strada Dorobanților, numerele optsprezece-douăzeci, în Cluj-Napoca.";
    }

    // Generic fallback
    return "Pentru această problemă recomand diagnosticare. Costa intre optzeci si o suta douazeci de lei. Cand ati dori sa veniti in service?";
  }

  // Advanced pattern matching with multiple keywords
  findAdvancedPattern(text) {
    const lowerClean = text.toLowerCase();
    
    // Multiple symptom patterns
    const patterns = [
      {
        keywords: ['motor', 'zgomot', 'bate'],
        response: 'Pentru bătaia motorului recomand diagnosticare urgentă. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Engine knocking'
      },
      {
        keywords: ['frână', 'vibrează', 'tremură'],
        response: 'Pentru vibrația frânelor recomand verificarea discurilor. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Brake vibration'
      },
      {
        keywords: ['motor', 'se oprește', 'mers'],
        response: 'Pentru oprirea motorului în mers recomand diagnosticare urgentă. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Engine stalling'
      },
      {
        keywords: ['volanul', 'tremură', 'vibrează'],
        response: 'Pentru vibrația volanului poate fi echilibrare roți sau direcție. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Steering vibration'
      },
      {
        keywords: ['mașina', 'trage', 'dreaptă', 'stânga'],
        response: 'Pentru tracțiunea mașinii recomand verificarea direcției și roților. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Car pulling'
      },
      // NEW: Enhanced steering patterns
      {
        keywords: ['merge', 'greu', 'direcți'],
        response: 'Pentru direcția grea recomand verificarea sistemului de direcție. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Steering difficulty'
      },
      {
        keywords: ['volan', 'greu'],
        response: 'Pentru volanul greu recomand verificarea direcției și uleiului hidraulic. Ati dori sa veniti la noi in service sa vedem exact cauza problemei?',
        type: 'Heavy steering'
      },
      {
        keywords: ["dezmembrari", "dezmembrat", "piese second", "demontat", "volan dezmembrari"],
        response: "Noi nu suntem dezmembrări. Suntem service auto. Cu ce problemă doriți să vă ajutăm?",
        type: 'dezmembrari'
      }
    ];

    for (const pattern of patterns) {
      if (pattern.keywords.every(keyword => lowerClean.includes(keyword))) {
        return {
          response: pattern.response,
          type: pattern.type
        };
      }
    }

    return null;
  }
}

module.exports = { ResponseMatcher };