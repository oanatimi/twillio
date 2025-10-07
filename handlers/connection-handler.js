// handlers/connection-handler.js - COMPLETE with Backend Integration + FIXES

const axios = require('axios');
const { TranscriptionService } = require('../services/transcription-service.js');
const { ConversationMemory, normalizeText, isTextSimilar } = require('../services/conversation-memory.js');
const { ResponseMatcher } = require('../services/response-matcher.js');
const { TTSService } = require('../services/tts-service.js');
const { GPTService } = require('../services/gpt-service.js');
const { sendAudioUltraFast } = require('../utils/audio-streaming.js');

// La începutul fișierului, după SERVICE_ID_MAP:

const SERVICE_TO_RESOURCE = {
  ITP: process.env.RESOURCE_ITP || 'ITP 1',
  VULCANIZARE: process.env.RESOURCE_VULCANIZARE || 'Vulcanizare 1',
  CLIMA: process.env.RESOURCE_CLIMA || 'Clima 1',
  MECANICA: process.env.RESOURCE_MECANICA || 'Mecanica 1'
};
// Backend configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const SERVICE_ID_MAP = {
  ITP: process.env.AVAILABLE_SERVICE_ID_ITP || '1',
  VULCANIZARE: process.env.AVAILABLE_SERVICE_ID_VULCANIZARE || '2',
  CLIMA: process.env.AVAILABLE_SERVICE_ID_CLIMA || '3',
  MECANICA: process.env.AVAILABLE_SERVICE_ID_MECANICA || '4'
};

const COUNTY_TO_CODE = {
  'B': 'B', 'BUCURESTI': 'B', 'BUCUREȘTI': 'B',
  'ALBA': 'AB', 'ARAD': 'AR', 'ARGES': 'AG', 'ARGEȘ': 'AG',
  'BACAU': 'BC', 'BACĂU': 'BC', 'BOTOSANI': 'BT', 'BOTOȘANI': 'BT',
  'BRASOV': 'BV', 'BRAȘOV': 'BV', 'BRAILA': 'BR', 'BRĂILA': 'BR',
  'BISTRITA': 'BN', 'BISTRIȚA': 'BN', 'BIHOR': 'BH',
  'BUZAU': 'BZ', 'BUZĂU': 'BZ', 'CALARASI': 'CL', 'CĂLĂRAȘI': 'CL',
  'CARAS-SEVERIN': 'CS', 'CARAȘ-SEVERIN': 'CS',
  'CLUJ': 'CJ', 'CONSTANTA': 'CT', 'CONSTANȚA': 'CT',
  'COVASNA': 'CV', 'DAMBOVITA': 'DB', 'DÂMBOVIȚA': 'DB',
  'DOLJ': 'DJ', 'GALATI': 'GL', 'GALAȚI': 'GL',
  'GIURGIU': 'GR', 'GORJ': 'GJ', 'HARGHITA': 'HR', 'HARGHIȚA': 'HR',
  'HUNEDOARA': 'HD', 'IALOMITA': 'IL', 'IALOMIȚA': 'IL',
  'IASI': 'IS', 'IAȘI': 'IS', 'ILFOV': 'IF',
  'MARAMURES': 'MM', 'MARAMUREȘ': 'MM', 'MEHEDINTI': 'MH', 'MEHEDINȚI': 'MH',
  'MURES': 'MS', 'MUREȘ': 'MS', 'NEAMT': 'NT', 'NEAMȚ': 'NT',
  'OLT': 'OT', 'PRAHOVA': 'PH', 'SALAJ': 'SJ', 'SĂLAJ': 'SJ',
  'SATU-MARE': 'SM', 'SATU MARE': 'SM',
  'SIBIU': 'SB', 'SUCEAVA': 'SV', 'TELEORMAN': 'TR',
  'TIMIS': 'TM', 'TIMIȘ': 'TM', 'TULCEA': 'TL',
  'VALCEA': 'VL', 'VÂLCEA': 'VL', 'VASLUI': 'VS', 'VRANCEA': 'VN'
};

const KNOWN_MAKES = new Set([
  'DACIA', 'RENAULT', 'FORD', 'OPEL', 'VW', 'VOLKSWAGEN', 'AUDI', 'BMW', 'MERCEDES',
  'SKODA', 'SEAT', 'TOYOTA', 'HONDA', 'HYUNDAI', 'KIA', 'MAZDA', 'NISSAN', 'VOLVO',
  'PEUGEOT', 'CITROEN', 'FIAT', 'JEEP', 'SUZUKI', 'MITSUBISHI', 'SUBARU', 'LEXUS',
  'PORSCHE', 'LAND', 'ROVER', 'MINI', 'ALFA', 'ROMEO', 'CHEVROLET', 'CHRYSLER'
]);

const DEFAULT_RESOURCE = process.env.DEFAULT_APPOINTMENT_RESOURCE || 'Mecanica 1';

const conversationMemory = new ConversationMemory();
const requiredSlots = new Map();
const callersPhone = new Map();
function parseTimeToken(text, offered = []) {
  const s = (text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  // Ex: "la 11", "am 11", "ora 11", "11", "11:00", "11 fix", "unsprezece", "noua"
  // 1) formate numerice
  const m = s.match(/\b(?:ora|la|pe|am)?\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (m) {
    let hh = parseInt(m[1], 10);
    let mm = m[2] ? parseInt(m[2], 10) : 0;
    if (hh >= 0 && hh <= 23) {
      // dacă ai sloturi oferite, validează-le (ex: 8, 10, 11)
      if (offered.length) {
        const ok = offered.some(slot => {
          const [H, M = '00'] = slot.split(':');
          return parseInt(H, 10) === hh && parseInt(M, 10) === mm;
        }) || offered.some(slot => parseInt(slot, 10) === hh);
        if (!ok) return null;
      }
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  // 2) cuvinte (romană, fără diacritice)
  const wordToHour = {
    'opt':8, 'noua':9, 'noua':9, 'zece':10, 'unsprezece':11, 'doisprezece':12,
    'una':13, 'doua':14, 'trei':15, 'patru':16, 'cinci':17, 'sase':18, 'sapte':19
  };
  for (const [w,h] of Object.entries(wordToHour)) {
    if (s.includes(w)) {
      if (offered.length && !offered.some(slot => parseInt(slot, 10) === h)) return null;
      return `${String(h).padStart(2,'0')}:00`;
    }
  }
  return null;
}

// Funcție nouă - detectează dacă user vrea să facă programare
function detectsBookingIntent(text) {
  const bookingKeywords = [
    /\b(vreau|doresc|aș vrea|aș dori|pot|putem|se poate)\s+(o\s+)?(programare|sa vin|sa ajung|sa trec)/i,
    /\b(program(are|ez)|rezerv)/i,
    /\bfac\s+o\s+programare\b/i,
    /\bcand\s+(pot|putem|puteti|ati putea)/i,
    /\b(maine|luni|marti|miercuri|joi|vineri|azi|astazi)\s+(pot|vin|ajung|ma programez)/i,
    /\b(la ce ora|ce ore aveti|aveti liber)/i
  ];
  
  return bookingKeywords.some(pattern => pattern.test(text));
}

// Funcție nouă - detectează întrebări tehnice/informative
function isInformationalQuery(text) {
  const questionPatterns = [
  /\b(ce|care|cum|de ce|cat|cât|cati|câți)\b.*\b(să fac|sa fac|fac|problema|cauza|costa|preț|pret|verifica)/i,
  /\bnu știu\b.*\b(ce|cum|de ce|cauza)/i,
  /\bce\s+(să|sa|pot|trebuie|ar trebui)/i,
  /\bcum\s+(pot|se|să|sa)/i,
  /\b(motorul|mașina|masina|directia|direcția|frâne|frane|suspensie).*(scoate|face|merge|problema|greu|nu mai|scârțâie|trage)\b/i,
  /\b(am|are|este)\s+(o\s+)?(problema|defect|defectiune|defecțiune)\b/i  // "am o problemă la..."
];
  
  return questionPatterns.some(pattern => pattern.test(text));
}

function normalizeCountyWordToCode(word) {
  if (!word) return null;
  const up = word.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return COUNTY_TO_CODE[up] || null;
}

function extractNameSmart(text) {
  const t = (text||'').trim();
  
  // Pattern explicit: "sunt X", "mă cheamă X"
  const p1 = t.match(/\b(?:sunt|ma cheama|mă cheamă|numele(?:\s+meu)?\s+e|numele(?:\s+meu)?\s+este)\s+([A-ZĂÂÎȘȚ][^\d,.;!?]{1,60})$/i);
  if (p1) return p1[1].trim();
  
  // Pattern implicit: doar numele (2-4 cuvinte cu majusculă)
  const p2 = t.match(/^([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})$/);
  if (p2) return p2[1].trim();
  
  return null;
}

function extractPlateSmart(text) {
  if (!text) return null;
  
  const raw = text.toUpperCase().replace(/[-.]/g,' ').replace(/\s+/g,' ').trim();
  if (raw.length < 6) return null;
  
  // Mapare fonetică pentru litere dictate
  const phoneticMap = {
    'UN': 'N', 'DOI': 'D', 'TREI': 'T', 'UNU': 'N',
    'BE': 'B', 'CE': 'C', 'DE': 'D', 'E': 'E', 'EF': 'F',
    'GE': 'G', 'HA': 'H', 'I': 'I', 'JE': 'J', 'KA': 'K',
    'EL': 'L', 'EM': 'M', 'EN': 'N', 'O': 'O', 'PE': 'P',
    'KU': 'Q', 'ER': 'R', 'ES': 'S', 'TE': 'T', 'U': 'U',
    'VE': 'V', 'DUBLU': 'W', 'VU': 'W', 'ICS': 'X', 'Y': 'Y',
    'ZED': 'Z', 'ZET': 'Z', 'UNDER': 'N', 'DELTA': 'D'
  };
  
  // Încearcă pattern compact mai întâi
  const compact = raw.replace(/\s/g,'');
  let m = compact.match(/\b([A-Z]{1,2}\d{2,3}[A-Z]{3})\b/);
  if (m) {
    const result = m[1];
    const letters = result.slice(-3);
    const suspiciousPatterns = ['AZI', 'ETE', 'AZT', 'UNA', 'DOI'];
    if (!suspiciousPatterns.includes(letters)) {
      return result;
    }
  }

  // Tokenizare și reconstrucție inteligentă
  const tokens = raw.split(' ');
  
  for (let i = 0; i < tokens.length; i++) {
    const code = normalizeCountyWordToCode(tokens[i]);
    
    if (code) {
      // Am găsit județul
      const digits = tokens[i+1] && tokens[i+1].match(/^\d{2,3}$/) ? tokens[i+1] : null;
      
      if (digits) {
        // Colectăm următoarele 3+ litere (pot fi dictate fonetic)
        const letters = [];
        
        for (let k = 2; k <= 6 && i+k < tokens.length; k++) {
          const token = tokens[i+k];
          
          // Verifică dacă e literă directă
          if (/^[A-Z]$/.test(token)) {
            letters.push(token);
          }
          // Verifică dacă e grup de litere
          else if (/^[A-Z]{2,3}$/.test(token)) {
            letters.push(...token.split(''));
            break;
          }
          // Verifică dacă e cuvânt fonetic
          else if (phoneticMap[token]) {
            letters.push(phoneticMap[token]);
          }
          // Verifică pattern special "18" = "NDE" (speech recognition error)
          else if (token === '18') {
            letters.push('N', 'D', 'E');
            break;
          }
        }
        
        if (letters.length >= 3) {
          const plate = code + digits + letters.slice(0, 3).join('');
          console.log(`✅ Placă reconstruită: ${plate} din "${raw}"`);
          return plate;
        }
      }
    }
  }

  // Pattern cu spații între litere
  m = raw.match(/\b([A-Z]{1,2})\s+(\d{2,3})\s+([A-Z])\s*([A-Z])\s*([A-Z])\b/);
  if (m) {
    return m[1] + m[2] + m[3] + m[4] + m[5];
  }

  return null;
}

function getSlots(streamSid) { 
  if (!requiredSlots.has(streamSid)) requiredSlots.set(streamSid, {}); 
  return requiredSlots.get(streamSid); 
}

function setSlot(streamSid, key, value) { 
  const s = getSlots(streamSid); 
  if (value) s[key] = value; 
  requiredSlots.set(streamSid, s); 
}

function extractPhone(text) {
  const m = (text || '').replace(/\s+/g, '').match(/(\+?4?0?\d{9,12})/);
  return m ? m[1] : null;
}

function parseService(text) {
  const t = (text || '').toLowerCase();
  
  // Verifică în ordine de la cel mai specific la cel mai generic
  if (/\bmecanica?\b|\bmecanic\b|\brevizie\b|\bdistributie\b|\bfr[aâ]n/.test(t)) return 'MECANICA';
  if (/\bitp\b/.test(t)) return 'ITP';
  if (/\bvulcanizare\b|\banvelope\b|\broti\b|\bjante\b|\bcauciuc/.test(t)) return 'VULCANIZARE';
  if (/\bclima\b|\bclimatizare\b|\bfreon\b|\b\s+ac\s+\b/.test(t)) return 'CLIMA';
  
  return null;
}

function parseDayToken(text) {
  const s = (text || '').toLowerCase().trim();

  // ISO direct?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const has = (needle) => s.includes(needle);
  const today = new Date();
  const mkISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const nextDow = (from, targetDow) => {
    const res = new Date(from);
    const cur = from.getDay() || 7;
    let add = targetDow - cur;
    if (add <= 0) add += 7;
    res.setDate(from.getDate() + add);
    return res;
  };

  // relative
  if (has('azi') || has('astăzi') || has('astazi')) return mkISO(today);

  if (has('mâine') || has('maine')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return mkISO(d);
  }

  if (has('poimâine') || has('poimaine')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return mkISO(d);
  }

  // zile săptămână — acceptă “luni”, “marți”, etc. oriunde în frază
  if (has('luni')) return mkISO(nextDow(today, 1));
  if (has('marți') || has('marti')) return mkISO(nextDow(today, 2));
  if (has('miercuri')) return mkISO(nextDow(today, 3));
  if (has('joi')) return mkISO(nextDow(today, 4));
  if (has('vineri')) return mkISO(nextDow(today, 5));

  return null;
}


function romanianHourToHHmm(timeText) {
  const map = {
    'ora opt': '08:00', 'ora nouă': '09:00', 'ora noua': '09:00',
    'ora zece': '10:00', 'ora unsprezece': '11:00',
    'ora douăsprezece': '12:00', 'ora douasprezece': '12:00',
    'ora treisprezece': '13:00', 'ora paisprezece': '14:00',
    'ora cincisprezece': '15:00', 'ora șaisprezece': '16:00',
    'ora saisprezece': '16:00'
  };

  const clean = (timeText || '').toLowerCase().trim();

  // Verifică mai întâi expresiile complete românești
  for (const [key, value] of Object.entries(map)) {
    if (clean.includes(key)) return value;
  }
  
  // NOU: Procesează formatul numeric (ex. '11', '8')
  const m2 = clean.match(/\b(\d{1,2})\b/);
  if (m2) {
    const hh = parseInt(m2[1], 10);
    if (hh >= 8 && hh <= 16) {
      return String(hh).padStart(2, '0') + ':00';
    }
  }

  // Apoi verifică formatul numeric DOAR dacă e clar (10:00, 14:30)
  const m = clean.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    const hh = String(Math.min(17, Math.max(8, parseInt(m[1], 10)))).padStart(2,'0');
    const mm = m[2];
    return `${hh}:${mm}`;
  }

  return null;
}

function dayTokenToDateISO(dayToken) {
  if (!dayToken) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayToken)) return dayToken;
  return parseDayToken(dayToken);
}

function nextMissingPrompt(streamSid) {
  const s = getSlots(streamSid);
  
  if (!s.phoneNumber) {
    return { field: 'phoneNumber', prompt: 'Care este numărul de telefon la care vă putem contacta?' };
  }
  
  if (!s.clientName) {
    return { field: 'clientName', prompt: 'Vă rog numele complet pentru programare.' };
  }
  
  // Verificăm că avem ATÂT placă CÂT ȘI marcă/model
  if (!s.plateNumber) {
    return { field: 'plateNumber', prompt: 'Îmi spuneți numărul de înmatriculare?' };
  }
  
  // Chiar dacă avem placă, trebuie să avem și marca/model
  if (!s.vehicleMake || !s.vehicleModel) {
    return { field: 'vehicleMakeModel', prompt: 'Ce marcă și model este mașina?' };
  }
  
  return null;
}

function getNextDayOfWeek(from, targetDay) {
  const result = new Date(from);
  const currentDay = from.getDay() || 7;
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd <= 0) daysToAdd += 7;
  result.setDate(from.getDate() + daysToAdd);
  return result;
}

function parseDayToDate(day) {
  if (!day) { 
    const t = new Date(); 
    t.setDate(t.getDate()+1); 
    return t; 
  }
  const today = new Date();
  const normalized = day.toLowerCase().trim();
  switch (normalized) {
    case 'astăzi': case 'astazi': case 'azi': return today;
    case 'mâine': case 'maine': { 
      const d=new Date(today); 
      d.setDate(today.getDate()+1); 
      return d; 
    }
    case 'poimâine': case 'poimaine': { 
      const d=new Date(today); 
      d.setDate(today.getDate()+2); 
      return d; 
    }
    case 'luni': return getNextDayOfWeek(today, 1);
    case 'marți': case 'marti': return getNextDayOfWeek(today, 2);
    case 'miercuri': return getNextDayOfWeek(today, 3);
    case 'joi': return getNextDayOfWeek(today, 4);
    case 'vineri': return getNextDayOfWeek(today, 5);
    default: { 
      const d=new Date(today); 
      d.setDate(today.getDate()+1); 
      return d; 
    }
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

async function checkAvailableSlots(day, serviceType = 'MECANICA') {
  try {
    console.log(`Checking availability: ${day} - ${serviceType}`);
    const targetDate = parseDayToDate(day);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const fromStr = `${y}-${m}-${d}`;
    
    const nextDay = new Date(targetDate); 
    nextDay.setDate(nextDay.getDate() + 1);
    const y2 = nextDay.getFullYear(); 
    const m2 = String(nextDay.getMonth() + 1).padStart(2, '0'); 
    const d2 = String(nextDay.getDate()).padStart(2, '0');
    const toStr = `${y2}-${m2}-${d2}`;

    // Folosește resursa specifică serviciului
    const resource = SERVICE_TO_RESOURCE[serviceType];
    const url = `${BACKEND_URL}/api/appointments?resource=${encodeURIComponent(resource)}&from=${fromStr}&to=${toStr}`;
    
    console.log(`🔍 Verificare pe resursa: ${resource}`);
    console.log(`📡 GET ${url}`);
    
    const response = await axios.get(url, { timeout: 3000 });
    const appointments = response.data || [];
    
    console.log(`📅 ${appointments.length} programări pe ${resource}`);

    const allHours = [];
    for (let hour = 8; hour < 17; hour++) allHours.push(hour);

    const occupiedHours = appointments.map(appt => new Date(appt.startAt).getHours());
    const availableHours = allHours.filter(h => !occupiedHours.includes(h));
    const availableInRo = availableHours.map(convertHourToRomanian);

    return { 
      hasAvailability: availableInRo.length > 0, 
      slots: availableInRo, 
      count: availableInRo.length 
    };
  } catch (e) {
    console.error(`Error checking availability: ${e.message}`);
    return { 
      hasAvailability: true, 
      slots: ['ora nouă', 'ora zece', 'ora unsprezece'], 
      count: 3 
    };
  }
}

async function saveAppointmentToBackend(appointment, streamSid) {
  try {
    console.log(`Salvare programare in backend`);

    const svc = (appointment.serviceType || appointment.service || 'MECANICA').toUpperCase();
    const availableServiceId = SERVICE_ID_MAP[svc];
    if (!availableServiceId) {
      throw new Error(`Lipseste AVAILABLE_SERVICE_ID_${svc} in .env`);
    }
    
    // Folosește resursa specifică serviciului
    const resource = SERVICE_TO_RESOURCE[svc];
    if (!resource) {
      throw new Error(`Lipseste RESOURCE_${svc} in .env`);
    }

    const dateISO = dayTokenToDateISO(appointment.day);
    let hhmm = romanianHourToHHmm(appointment.time);

    if (!hhmm) {
      const apptMem = conversationMemory.getAppointment(streamSid) || {};
      hhmm = romanianHourToHHmm(apptMem.time);
    }

    if (!dateISO || !hhmm) {
      return { success: false, error: 'missing_time_or_day' };
    }

    const startAt = `${dateISO}T${hhmm}:00`;

    const s = getSlots(streamSid);
    const clientDTO = appointment.clientId ? null : {
      fullName: s.clientName || appointment.clientName || 'Client Oaza',
      phone: s.phoneNumber || appointment.phoneNumber || callersPhone.get(streamSid) || '0000000000',
      email: null, address: null, city: null, county: null, country: null
    };
    
    const vehicleDTO = appointment.vehicleId ? null : {
      plateNumber: s.plateNumber || null,
      make: s.vehicleMake || null,
      model: s.vehicleModel || null,
      year: null,
      itpExpiry: null
    };

    // Validare: dacă backend cere obligatoriu marca/model
    if (!appointment.vehicleId && (!vehicleDTO.make || !vehicleDTO.model)) {
      console.error('❌ Lipsesc marca/model pentru vehicul');
      return { success: false, error: 'missing_vehicle_details' };
    }

    const payload = {
      clientId: appointment.clientId || null,
      client: clientDTO,
      vehicleId: appointment.vehicleId || null,
      vehicle: vehicleDTO,
      availableServiceId: Number(availableServiceId),
      startAt,
      endAt: null,
      resource: resource  // Folosește resursa corectă pentru serviciu
    };

    const endpoint = `${BACKEND_URL}/api/appointments/quick`;
    console.log(`POST ${endpoint}`);
    console.log(`Resursa: ${resource} pentru serviciul ${svc}`);
    console.log(JSON.stringify(payload, null, 2));

    const response = await axios.post(endpoint, payload, { 
      headers: { 'Content-Type': 'application/json' }, 
      timeout: 10000 
    });

    const appt = response.data;
    if (appt && appt.id) {
      console.log(`Programare creata #${appt.id}`);
      return { success: true, appointmentId: appt.id, message: 'OK', data: appt };
    } else {
      console.error(`Raspuns backend fara id`);
      return { success: false, error: 'Raspuns backend invalid' };
    }
  } catch (error) {
    if (error.response) {
      console.error(`Backend ${error.response.status}:`, error.response.data);
      return { success: false, error: JSON.stringify(error.response.data) };
    }
    console.error(`Eroare request: ${error.message}`);
    return { success: false, error: error.message };
  }
}
function getEnhancedFallback(text, conversationHistory, streamSid) {
  return "Va pot ajuta cu programarea. Ce problema are masina si cand ati dori sa veniti?";
}

// Mapare simptome -> categorie serviciu (+ subserviciu unde are sens)
function extractServiceFromTextND(cleanND = '') {
  const rules = [
    // VULCANIZARE / REGLAJ DIRECȚIE
    {
      serviceType: 'VULCANIZARE',
      subService: 'REGLAJ_DIRECTIE',
      // trage stanga/dreapta, vibrații volan, geometrie, direcție, anvelope, roți, echilibrare
      pattern: /\b(directie|geometrie|trage|vibreaza|vibratii|volan|anvelop|roti|roata|echilibrare)\b/
    },
    // MECANICA
    {
      serviceType: 'MECANICA',
      subService: null,
      pattern: /\b(motor|ambreiaj|distributie|planetara|suspensie|amortizoare|frane|injector|turbo|alternator|rulment|radiator|pompa|ulei|biele|injectie|culbutor)\b/
    },
    // CLIMA / AER CONDIȚIONAT
    {
      serviceType: 'CLIMA',
      subService: null,
      pattern: /\b(clima|aer\s*conditionat|freon|compresor|ventilator|miroase|miros|evaporator)\b/
    },
    // ITP
    {
      serviceType: 'ITP',
      subService: null,
      pattern: /\b(itp|inspectie\s*tehnica|rar)\b/
    },
  ];

  for (const r of rules) {
    if (r.pattern.test(cleanND)) {
      return { serviceType: r.serviceType, subService: r.subService, confidence: 0.9 };
    }
  }
  return null; // nimic clar
}


function createConnectionHandler(ws) {
  console.log('NEW CONNECTION!');
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

  function processTranscriptionQueue() {
    if (processingQueue.length === 0 || isProcessing) return;
    const latestTranscript = processingQueue[processingQueue.length - 1];
    processingQueue = [];
    console.log(`INSTANT procesare: "${latestTranscript}"`);
    processTranscription(latestTranscript);
  }

function stripDiacritics(s='') {
 return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
 }

async function processTranscription(text) {
  const clean = text.trim();
  const cleanND = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const currentTime = Date.now();

  if (clean.length > 200 || clean.includes('sta bine') || clean.includes('incepe vii')) {
    isProcessing = false; 
    setImmediate(() => processTranscriptionQueue()); 
    return;
  }

  // Duplicate detection
  if (lastTranscript && lastTranscript.length > 5) {
    const normalizedLast = normalizeText(lastTranscript);
    const normalizedCurrent = normalizeText(clean);
    
    if (normalizedCurrent.includes(normalizedLast) && clean.length > lastTranscript.length) {
      const timeSinceLast = currentTime - lastProcessedTime;
      if (timeSinceLast < 30000) {
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
          isProcessing = false;
          return processTranscription(newPart);
        } else {
          isProcessing = false; 
          setImmediate(() => processTranscriptionQueue()); 
          return;
        }
      }
    }
  }

  for (const [recentText, recentTime] of recentlyProcessed.entries()) {
    if (isTextSimilar(recentText, clean, 0.75) && (currentTime - recentTime) < 10000) {
      return;
    }
  }
  
  for (const [textKey, time] of recentlyProcessed.entries()) {
    if (currentTime - time > 10000) recentlyProcessed.delete(textKey);
  }

  const normalizedCurrent = normalizeText(clean);
  const normalizedLast = normalizeText(lastTranscript || '');
  const isExactDuplicate = lastTranscript === clean && (currentTime - lastProcessedTime < 2000);
  const isNormalizedDuplicate = normalizedCurrent === normalizedLast && (currentTime - lastProcessedTime < 5000);
  const isFuzzyDuplicate = isTextSimilar(lastTranscript, clean, 0.85) && (currentTime - lastProcessedTime < 10000);

  const shortConfirmations = ['da', 'nu', 'ok', 'bine', 'perfect', 'desigur'];
  const isShortConfirmation = shortConfirmations.includes(clean.toLowerCase());
  const minLength = isShortConfirmation ? 2 : 3;

  if (isProcessing || clean.length < minLength || isNormalizedDuplicate || isExactDuplicate || isFuzzyDuplicate) return;

  isProcessing = true;
  lastTranscript = clean;
  lastProcessedTime = currentTime;
  recentlyProcessed.set(clean, currentTime);

  console.log(`User: "${clean}"`);
  conversationMemory.addToConversationContext(streamSid, 'user', clean);
  fullConversationContext.push({ role: 'user', content: clean });
  if (fullConversationContext.length > 16) fullConversationContext = fullConversationContext.slice(-16);

  // ===== DETECTARE STARE BOOKING =====
  const state = conversationMemory.getState(streamSid);
  const existingBooking = conversationMemory.getPartialBooking(streamSid);
  const existingAppointment = conversationMemory.getAppointment(streamSid);
  
  // Dacă suntem deja în booking flow (ask_day, ask_time etc), continuăm cu logica existentă
  const isInBookingFlow = (state && state.startsWith('ask_')) || 
                          existingBooking?.service || 
                          existingBooking?.day || 
                          existingBooking?.time ||
                          existingAppointment?.confirmed;

  // ===== DACĂ NU SUNTEM ÎN BOOKING FLOW → LASĂ GPT SĂ DECIDĂ =====
  if (!isInBookingFlow) {
    console.log(`🤖 Nu suntem în booking flow → GPT decide ce face`);
    
    try {
      const appointment = conversationMemory.getAppointment(streamSid);
      const gptResponse = await gptService.getContextualResponse(
        clean,
        fullConversationContext,
        appointment,
        '',
        conversationMemory,
        streamSid
      );
      
      console.log(`🤖 GPT răspunde: "${gptResponse}"`);
      conversationMemory.addToConversationContext(streamSid, 'assistant', gptResponse);
      fullConversationContext.push({ role: 'assistant', content: gptResponse });
	  
	   const gptLower = gptResponse.toLowerCase();
	      // 🆕 DETECTEAZĂ SERVICIUL DIN CONTEXTUL CONVERSAȚIEI
    if (gptLower.includes('mecanică') || gptLower.includes('mecanica') || 
        gptLower.includes('verificare') || gptLower.includes('motor') ||
        gptLower.includes('diagnoza') || gptLower.includes('reparatie')) {
      const existingPB = conversationMemory.getPartialBooking(streamSid) || {};
      if (!existingPB.service) {
        conversationMemory.setPartialBooking(streamSid, { ...existingPB, service: 'MECANICA' });
        console.log(`🔧 Serviciu detectat din GPT: MECANICA`);
      }
    } else if (gptLower.includes('itp')) {
      const existingPB = conversationMemory.getPartialBooking(streamSid) || {};
      if (!existingPB.service) {
        conversationMemory.setPartialBooking(streamSid, { ...existingPB, service: 'ITP' });
        console.log(`🔧 Serviciu detectat din GPT: ITP`);
      }
    } else if (gptLower.includes('vulcanizare') || gptLower.includes('anvelope') || 
               gptLower.includes('roti') || gptLower.includes('jante')) {
      const existingPB = conversationMemory.getPartialBooking(streamSid) || {};
      if (!existingPB.service) {
        conversationMemory.setPartialBooking(streamSid, { ...existingPB, service: 'VULCANIZARE' });
        console.log(`🔧 Serviciu detectat din GPT: VULCANIZARE`);
      }
    } else if (gptLower.includes('clima') || gptLower.includes('climatizare') || 
               gptLower.includes('aer conditionat')) {
      const existingPB = conversationMemory.getPartialBooking(streamSid) || {};
      if (!existingPB.service) {
        conversationMemory.setPartialBooking(streamSid, { ...existingPB, service: 'CLIMA' });
        console.log(`🔧 Serviciu detectat din GPT: CLIMA`);
      }
    }
      
      // 🔥 VERIFICĂ DACĂ GPT A ÎNCEPUT PROCESUL DE BOOKING
      // Dacă GPT întreabă "Pentru ce serviciu?" sau "Ce zi?", setează state
     
      
      if (gptLower.includes('pentru ce serviciu') || gptLower.includes('ce serviciu')) {
        conversationMemory.setState(streamSid, 'ask_service');
        console.log(`🎯 GPT a început booking → state: ask_service`);
      } else if (gptLower.includes('ce zi') || gptLower.includes('pentru ce zi')) {
        conversationMemory.setState(streamSid, 'ask_day');
        console.log(`🎯 GPT a început booking → state: ask_day`);
      } else if (gptLower.includes('ce ora') || gptLower.includes('la ce ora')) {
        conversationMemory.setState(streamSid, 'ask_time');
        console.log(`🎯 GPT a început booking → state: ask_time`);
      }
      
      await ttsService.sendResponse(ws, streamSid, gptResponse, 'INSTANT', Date.now());
      
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    } catch (error) {
      console.error(`Eroare GPT: ${error.message}`);
      // Fallback dacă GPT eșuează
      const fallback = "Va pot ajuta cu orice întrebare despre service-ul nostru. Cu ce va pot ajuta?";
      console.log(`🤖 BOT (fallback): "${fallback}"`);
      conversationMemory.addToConversationContext(streamSid, 'assistant', fallback);
      await ttsService.sendResponse(ws, streamSid, fallback, 'INSTANT', Date.now());
      isProcessing = false;
      setImmediate(() => processTranscriptionQueue());
      return;
    }
  }

  // ===== CONTINUĂ CU FLOW-UL DE BOOKING EXISTENT =====
  console.log(`📋 Suntem în booking flow → continuăm cu logica existentă`);

  // Passive slot capture
  const s = getSlots(streamSid);

  if (!s.phoneNumber) {
    const ph = extractPhone(clean);
    if (ph) setSlot(streamSid, 'phoneNumber', ph);
  }

  if (!s.clientName) {
    const nm = extractNameSmart(clean);
    if (nm) setSlot(streamSid, 'clientName', nm);
  }

  if (!s.plateNumber) {
    const plate = extractPlateSmart(clean);
    if (plate) {
      setSlot(streamSid, 'plateNumber', plate);
      console.log(`📋 Placă detectată pasiv: ${plate}`);
    }
  }

  if ((!s.vehicleMake || !s.vehicleModel)) {
    const words = clean.split(/\s+/).filter(Boolean);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toUpperCase();
      if (KNOWN_MAKES.has(word) && i + 1 < words.length) {
        const make = word;
        const model = words.slice(i + 1, i + 3).join(' ');
        
        setSlot(streamSid, 'vehicleMake', make);
        setSlot(streamSid, 'vehicleModel', model);
        console.log(`🚗 Vehicul detectat pasiv: ${make} ${model}`);
        break;
      }
    }
  }

  // Booking slot collection
  const pb0 = conversationMemory.getPartialBooking(streamSid) || {};

  if (!pb0.service) {
    const svc = parseService(clean);
    if (svc) {
      conversationMemory.setPartialBooking(streamSid, { ...pb0, service: svc }); 
      console.log(`Serviciu detectat: ${svc} - BLOCAT`);
    }
  } else {
    console.log(`Serviciu deja setat: ${pb0.service} - nu mai detect altele`);
  }

  // Detectare ZI
  const pb1 = conversationMemory.getPartialBooking(streamSid) || {};

  if (pb1.service && !pb1.day) {
    const d = parseDayToken(clean);
    
    if (d) {
      const wasAskedForDay = state === 'ask_day';
      
      if (wasAskedForDay) {
        conversationMemory.setPartialBooking(streamSid, { ...pb1, day: d });
        console.log(`Zi detectată: ${d} - BLOCAT`);
      } else {
        console.log(`Zi menționată spontan: ${d} - verific disponibilitate`);
        const availability = await checkAvailableSlots(d, pb1.service);
        
        if (availability.hasAvailability && availability.slots.length > 0) {
          const slotsText = availability.slots.slice(0, 3).join(', ');
          const response = `Pentru ${d} la ${pb1.service} avem disponibilitate la ${slotsText}. Care ora va convine?`;
          console.log(`🤖 BOT: "${response}"`);
          conversationMemory.setPartialBooking(streamSid, { ...pb1, day: d });
          conversationMemory.setState(streamSid, 'ask_time');
          conversationMemory.addToConversationContext(streamSid, 'assistant', response);
          await ttsService.sendResponse(ws, streamSid, response, 'INSTANT', Date.now());
          isProcessing = false;
          setImmediate(() => processTranscriptionQueue());
          return;
        } else {
          const response = `Din pacate pentru ${d} nu mai avem locuri libere la ${pb1.service}. Puteti alege alta zi?`;
          console.log(`🤖 BOT: "${response}"`);
          conversationMemory.setState(streamSid, 'ask_day');
          conversationMemory.addToConversationContext(streamSid, 'assistant', response);
          await ttsService.sendResponse(ws, streamSid, response, 'INSTANT', Date.now());
          isProcessing = false;
          setImmediate(() => processTranscriptionQueue());
          return;
        }
      }
    }
  } else if (pb1.day) {
    console.log(`Zi deja setată: ${pb1.day} - nu mai detect alta`);
  }

  // Detectare ORA
  const pb2 = conversationMemory.getPartialBooking(streamSid) || {};
  if (pb2.service && pb2.day && !pb2.time) {
    const h = romanianHourToHHmm(clean);
    if (h) {
      conversationMemory.setPartialBooking(streamSid, { ...pb2, time: h });
      console.log(`Ora detectată: ${h} - BLOCAT`);
    }
  } else if (pb2.time) {
    console.log(`Ora deja setată: ${pb2.time} - nu mai detect alta`);
  }

  // Handle ask_* states
  if (state && state.startsWith('ask_')) {
    const awaiting = state.replace('ask_', '');
    
    if (awaiting === 'phoneNumber') {
      const p = extractPhone(clean);
      if (p) setSlot(streamSid, 'phoneNumber', p);
    } 
    else if (awaiting === 'clientName') {
      let name = extractNameSmart(clean);
      
      if (!name && clean.length > 2) {
        if (!/^\d+$/.test(clean)) {
          const suspiciousPatterns = [
            /\b(initial|initial|luni|marti|miercuri|cluj|bucuresti)\b/i,
            /\d{2,}/,
            /^[a-z\s]+$/i,
          ];
          
          const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(clean));
          
          if (isSuspicious) {
            const ask = 'Nu am inteles bine numele. Va rog repetati clar numele si prenumele.';
            console.log(`🤖 BOT: "${ask}"`);
            conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
            await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
            isProcessing = false;
            setImmediate(() => processTranscriptionQueue());
            return;
          }
          
          name = clean.trim();
        }
      }
      
      if (name) {
        setSlot(streamSid, 'clientName', name);
        console.log(`Nume acceptat: ${name}`);
      } else {
        const ask = 'Nu am inteles numele. Va rog spuneti numele complet.';
        console.log(`🤖 BOT: "${ask}"`);
        conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
        await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
        isProcessing = false;
        setImmediate(() => processTranscriptionQueue());
        return;
      }
    }
    else if (awaiting === 'vehicleMakeModel') {
      const words = clean.split(/\s+/).filter(Boolean);
      
      const containsPlatePattern = /\b(cluj|bucuresti|timis|constanta|iasi)\s+\d{2,3}\b/i.test(clean);
      if (containsPlatePattern) {
        const ask = 'Ati mentionat o placa de inmatriculare. Va rog spuneti doar marca si modelul masinii, de exemplu: Dacia Logan.';
        console.log(`🤖 BOT: "${ask}"`);
        conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
        await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
        isProcessing = false;
        setImmediate(() => processTranscriptionQueue());
        return;
      }
      
      let foundMake = null;
      let foundModel = null;
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i].toUpperCase();
        if (KNOWN_MAKES.has(word)) {
          foundMake = word;
          if (i + 1 < words.length) {
            foundModel = words.slice(i + 1).join(' ');
          }
          break;
        }
      }
      
      if (!foundMake && words.length >= 2) {
        const firstWord = words[0].toUpperCase();
        
        const isCountyCode = normalizeCountyWordToCode(firstWord) !== null;
        if (isCountyCode) {
          const ask = 'Am inteles o placa de inmatriculare. Va rog spuneti marca si modelul, de exemplu: Ford Focus.';
          console.log(`🤖 BOT: "${ask}"`);
          conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
          await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
          isProcessing = false;
          setImmediate(() => processTranscriptionQueue());
          return;
        }
        
        foundMake = firstWord;
        foundModel = words.slice(1).join(' ');
      }
      
      if (foundMake && foundModel && foundModel.length > 2) {
        setSlot(streamSid, 'vehicleMake', foundMake);
        setSlot(streamSid, 'vehicleModel', foundModel);
        console.log(`✅ Vehicul: ${foundMake} ${foundModel}`);
      } else {
        const ask = 'Nu am inteles. Spuneti marca si modelul masinii, de exemplu: Dacia Logan sau Volkswagen Golf.';
        console.log(`🤖 BOT: "${ask}"`);
        conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
        await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
        isProcessing = false;
        setImmediate(() => processTranscriptionQueue());
        return;
      }
    }
    else if (awaiting === 'plateNumber') {
      const plate = extractPlateSmart(clean);
      if (plate) {
        setSlot(streamSid, 'plateNumber', plate);
        console.log(`✅ Placă: ${plate}`);
      } else {
        const ask = 'Nu am inteles placa. Va rog dictati judetul, numarul si cele trei litere.';
        console.log(`🤖 BOT: "${ask}"`);
        conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
        await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
        isProcessing = false;
        setImmediate(() => processTranscriptionQueue());
        return;
      }
    }
  }

  // Get final values
  const pb = conversationMemory.getPartialBooking(streamSid) || {};
  const apptExisting = conversationMemory.getAppointment(streamSid) || {};

  const detectedService = parseService(clean);
  const detectedDayISO = parseDayToken(clean);
  const detectedHHmm = romanianHourToHHmm(clean);

  const finalService = pb.service || detectedService || apptExisting.service || null;
  const finalDay = pb.day || detectedDayISO || apptExisting.day || null;
  const finalTime = pb.time || detectedHHmm || apptExisting.time || null;

  if (detectedService || detectedDayISO || detectedHHmm) {
    conversationMemory.setPartialBooking(streamSid, {
      service: finalService || undefined,
      day: finalDay || undefined,
      time: finalTime || undefined
    });
  }

  // Ask for missing service
  if (!finalService) {
    const ask = 'Pentru ce serviciu doriti programare? Avem ITP, Vulcanizare, Climatizare sau Mecanica.';
    console.log(`🤖 BOT: "${ask}"`);
    conversationMemory.setState(streamSid, 'ask_service');
    conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
    await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
    isProcessing = false; 
    setImmediate(() => processTranscriptionQueue()); 
    return;
  }

  // Ask for missing day
  if (!finalDay) {
    const ask = 'Pentru ce zi doriti programarea?';
    console.log(`🤖 BOT: "${ask}"`);
    conversationMemory.setState(streamSid, 'ask_day');
    conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
    await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
    isProcessing = false; 
    setImmediate(() => processTranscriptionQueue()); 
    return;
  }

  // Ask for missing time with real availability
  if (!finalTime) {
    const availability = await checkAvailableSlots(finalDay, finalService);
    if (availability.hasAvailability && availability.slots.length > 0) {
      const slotsText = availability.slots.slice(0, 3).join(', ');
      const ask = `Pentru ${finalDay} la ${finalService} avem disponibilitate la ${slotsText}. Care ora va convine?`;
      console.log(`🤖 BOT: "${ask}"`);
      conversationMemory.setState(streamSid, 'ask_time');
      conversationMemory.addToConversationContext(streamSid, 'assistant', ask);
      await ttsService.sendResponse(ws, streamSid, ask, 'INSTANT', Date.now());
    } else {
      const msg = `Din pacate pentru ${finalDay} nu mai avem locuri libere la ${finalService}. Putem programa pentru alta zi?`;
      console.log(`🤖 BOT: "${msg}"`);
      conversationMemory.addToConversationContext(streamSid, 'assistant', msg);
      await ttsService.sendResponse(ws, streamSid, msg, 'INSTANT', Date.now());
    }
    isProcessing = false; 
    setImmediate(() => processTranscriptionQueue()); 
    return;
  }

  // Check client/vehicle slots BEFORE saving
  const nxt = nextMissingPrompt(streamSid);
  if (nxt) {
    console.log(`Lipseste ${nxt.field}`);
    console.log(`🤖 BOT: "${nxt.prompt}"`);
    conversationMemory.setState(streamSid, `ask_${nxt.field}`);
    conversationMemory.addToConversationContext(streamSid, 'assistant', nxt.prompt);
    await ttsService.sendResponse(ws, streamSid, nxt.prompt, 'INSTANT', Date.now());
    isProcessing = false; 
    setImmediate(() => processTranscriptionQueue()); 
    return;
  }

  // Check if already saved
  const existingAppt = conversationMemory.getAppointment(streamSid);
  if (existingAppt && existingAppt.savedToBackend) {
    console.log(`Deja am programare salvata #${existingAppt.backendId} - ignor noi cereri`);
    const msg = `Programarea dumneavoastra pentru ${existingAppt.day} la ${existingAppt.time} este deja confirmata!`;
    console.log(`🤖 BOT: "${msg}"`);
    conversationMemory.addToConversationContext(streamSid, 'assistant', msg);
    await ttsService.sendResponse(ws, streamSid, msg, 'INSTANT', Date.now());
    isProcessing = false;
    setImmediate(() => processTranscriptionQueue());
    return;
  }

  // ALL SLOTS COMPLETE
  console.log(`Toate sloturile complete`);
  const alreadySaved = conversationMemory.getAppointment(streamSid)?.savedToBackend;

  if (alreadySaved) {
    console.log(`Deja salvat`);
    const finalResponse = `Programarea dumneavoastra este confirmata pentru ${finalDay} la ${finalTime}. Va asteptam!`;
    console.log(`🤖 BOT: "${finalResponse}"`);
    conversationMemory.addToConversationContext(streamSid, 'assistant', finalResponse);
    await ttsService.sendResponse(ws, streamSid, finalResponse, 'INSTANT', Date.now());
    isProcessing = false;
    setImmediate(() => processTranscriptionQueue());
    return;
  }

  // SAVE TO BACKEND
  console.log(`Salvez programarea`);
  const saveResult = await saveAppointmentToBackend({
    day: finalDay,
    time: finalTime,
    serviceType: finalService
  }, streamSid);

  let finalResponse = '';
  let ttsType = 'INSTANT';

  if (saveResult.success) {
    conversationMemory.setAppointment(streamSid, finalDay, finalTime, finalService);
    const appt = conversationMemory.getAppointment(streamSid);
    if (appt) {
      appt.confirmed = true;
      appt.savedToBackend = true;
      appt.backendId = saveResult.appointmentId;
    }
    
    finalResponse = `Perfect! V-am programat pentru ${finalDay} la ${finalTime} pentru ${finalService}. Va asteptam cu drag!`;
    console.log(`🤖 BOT: "${finalResponse}"`);
    ttsType = 'ULTRA';
  } else if (saveResult.error && saveResult.error.includes('Interval ocupat')) {
    console.error(`❌ Interval ocupat - reofertez alte ore`);
    
    conversationMemory.setPartialBooking(streamSid, { 
      service: finalService, 
      day: finalDay 
    });
    
    const newAvailability = await checkAvailableSlots(finalDay, finalService);
    if (newAvailability.hasAvailability && newAvailability.slots.length > 0) {
      const slotsText = newAvailability.slots.slice(0, 3).join(', ');
      finalResponse = `Din pacate ora ${finalTime} tocmai s-a ocupat. Mai avem disponibil la ${slotsText}. Care ora preferati?`;
      conversationMemory.setState(streamSid, 'ask_time');
    } else {
      finalResponse = `Din pacate pentru ${finalDay} nu mai avem locuri libere. Putem programa pentru alta zi?`;
      conversationMemory.setPartialBooking(streamSid, { service: finalService });
      conversationMemory.setState(streamSid, 'ask_day');
    }
    console.log(`🤖 BOT: "${finalResponse}"`);
    ttsType = 'INSTANT';
  } else {
    console.error(`Salvare esuata: ${saveResult.error}`);
    finalResponse = `Nu am reusit sa salvez programarea. Va rog sunati mai tarziu.`;
    console.log(`🤖 BOT: "${finalResponse}"`);
    ttsType = 'INSTANT';
  }

  conversationMemory.addToConversationContext(streamSid, 'assistant', finalResponse);
  conversationHistory.push({ role: 'user', content: clean }, { role: 'assistant', content: finalResponse });
  fullConversationContext.push({ role: 'assistant', content: finalResponse });
  if (conversationHistory.length > 4) conversationHistory = conversationHistory.slice(-4);

  await ttsService.sendResponse(ws, streamSid, finalResponse, ttsType, Date.now());

  isProcessing = false;
  setImmediate(() => processTranscriptionQueue());
}


  
  transcriber.on('transcription', async (text) => {
    processingQueue.push(text);
    console.log(`Queue: "${text}"`);
    setImmediate(() => processTranscriptionQueue());
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      switch (message.event) {
        case 'start':
          console.log('START!');
          streamSid = message.start.streamSid;

          const from = message.start.customParameters?.From || message.start.caller || message.start.from || '+40000000000';
          const normalizedPhone = from.startsWith('CA') && from.length > 20 ? '+40000000000' : from;
          callersPhone.set(streamSid, normalizedPhone);

          const s = getSlots(streamSid);
          if (!s.phoneNumber) setSlot(streamSid, 'phoneNumber', normalizedPhone);

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
      console.error('Message error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('Closed');
    transcriber.stop();
    lastTranscript = null;
    processingQueue = [];
    conversationHistory = [];
    fullConversationContext = [];
    recentlyProcessed.clear();
    isProcessing = false;
    conversationMemory.clearAppointment(streamSid);
    callersPhone.delete(streamSid);
    requiredSlots.delete(streamSid);
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
}

module.exports = { createConnectionHandler };