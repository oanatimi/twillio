// services/gpt-service.js - COMPLETE FIXED VERSION

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const openai = new OpenAI();

class GPTService {
  constructor() {
    this.GPT_TIMEOUT = 8000;
    this.gptFailCount = 0;
    this.maxGptFails = 3;
    this.circuitBreakerActive = false;
    this.circuitBreakerReset = null;
  }

  buildContextPrompt() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay();
    const dayNames = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
    const currentDay = dayNames[dayOfWeek];
    
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWorkingHour = hour >= 8 && hour < 17;
    const isCurrentlyOpen = isWorkingDay && isWorkingHour;
    
    const todayName = dayNames[dayOfWeek];
    const tomorrowIndex = (dayOfWeek + 1) % 7;
    const tomorrowName = dayNames[tomorrowIndex];
    const dayAfterIndex = (dayOfWeek + 2) % 7;
    const dayAfterName = dayNames[dayAfterIndex];
    
    const isTomorrowWorkingDay = tomorrowIndex >= 1 && tomorrowIndex <= 5;
    const isDayAfterWorkingDay = dayAfterIndex >= 1 && dayAfterIndex <= 5;
    
    let availableOptions = [];
    if (isTomorrowWorkingDay) {
      availableOptions.push(`mâine (${tomorrowName})`);
    }
    
    if (isDayAfterWorkingDay) {
      availableOptions.push(`poimâine (${dayAfterName})`);
    } else if (availableOptions.length < 2) {
      availableOptions.push('luni');
    }
    
    if (availableOptions.length < 2) {
      const workingDays = ['luni', 'marți', 'miercuri'];
      for (const day of workingDays) {
        if (!availableOptions.some(opt => opt.includes(day))) {
          availableOptions.push(day);
          if (availableOptions.length >= 2) break;
        }
      }
    }
    
    const oraCurenta = `ORA ACTUALĂ: ${hour}:${minute.toString().padStart(2, '0')} (${currentDay})`;
    const statusServicing = isCurrentlyOpen ? 'SERVICEUL ESTE DESCHIS ACUM' : 'SERVICEUL ESTE ÎNCHIS ACUM';

    return `Ești un consilier auto prietenos la service-ul Oaza Car din Cluj-Napoca. Vorbește ca un om real, prietenos, calm și informat.

⚡ RĂSPUNDE SCURT ȘI CONCIS - maxim 2-3 propoziții!
⚡ Fii direct, nu repeta informații!
⚡ Evită explicații lungi!

📍 Adresă: Calea Dorobanților optsprezece douăzeci, Cluj-Napoca  
🕐 Program: de luni până vineri, între orele opt și șaptesprezece  
🔧 Servicii: mecanică, diagnoză, ITP, vulcanizare  
📞 Telefon: zero șapte șapte patru, patru cinci șase, trei patru unu  

🎯 DETECTARE AUTOMATĂ A SERVICIULUI (NU MAI ÎNTREBA DACĂ E CLAR):

SITUAȚII CÂND ȘTII SERVICIUL:
✅ "zgomot ciudat/motor/bate" → MECANICĂ - răspunde: "Pentru zgomotul motorului recomand diagnoză la mecanică. Pentru ce zi doriți?"
✅ "fum alb/negru" → MECANICĂ - răspunde: "Pentru fumul de la motor recomand verificare la mecanică. Când vă convine?"
✅ "nu pornește/se oprește" → MECANICĂ - răspunde: "Pentru problema de pornire recomand diagnoză la mecanică. Pentru ce zi?"
✅ "frânele scârțâie/vibrează" → MECANICĂ - răspunde: "Pentru frâne recomand verificare la mecanică. Când doriți să veniți?"
✅ "direcția grea/merge greu" → MECANICĂ - răspunde: "Pentru direcția grea recomand verificare la mecanică. Pentru ce zi?"
✅ "roțile/anvelop/cauciuc" → VULCANIZARE - răspunde: "Pentru anvelope vă pot programa la vulcanizare. Când vă convine?"
✅ "clima/aer condiționat/AC/freon" → CLIMATIZARE - răspunde: "Pentru climatizare vă pot programa. Pentru ce zi doriți?"
✅ "trebuie ITP/RAR/inspectie" → ITP - răspunde: "Pentru ITP vă pot programa. Când doriți să veniți?"

⚠️ CRITICE:
- CÂND PROBLEMA E CLARĂ → Identifică serviciul și întreabă DIRECT ziua
- NU întreba "Pentru ce serviciu?" dacă problema menționată indică clar serviciul
- NU enumera toate serviciile când problema e evidentă

DOAR întreabă "Pentru ce serviciu?" când:
- Clientul spune generic "vreau programare" fără să menționeze problema
- Nu e clar din context ce serviciu trebuie

🎯 FLUX OBLIGATORIU PENTRU PROGRAMĂRI NOI:

PASUL 1 - IDENTIFICĂ SAU ÎNTREABĂ SERVICIUL:
- Dacă problema e clară → Identifică serviciul automat și treci la PASUL 2
- Dacă NU e clar → ÎNTREABĂ: "Pentru ce serviciu doriți programare? Avem ITP, Vulcanizare, Climatizare sau Mecanică?"

PASUL 2 - ÎNTREABĂ ZIUA (dacă nu a menționat-o):
- "Pentru ce zi doriți programarea?"

PASUL 3 - VEI PRIMI AUTOMAT ORELE LIBERE:
- Sistemul va verifica sloturile disponibile și îți va da orele libere
- Oferă DOAR orele primite: "Avem disponibilitate la ora nouă, ora zece și ora paisprezece"

PASUL 4 - CONFIRMĂ:
- După ce clientul alege ora: "Perfect! V-am programat pentru [zi] la [oră] pentru [serviciu]"

⚠️ NICIODATĂ nu oferi ore fără să știi serviciul și ziua!
⚠️ NICIODATĂ nu inventa ore - așteaptă să primești sloturile disponibile!

🎯 REGULI CRITICE PENTRU RĂSPUNSURI:
- NU folosi niciodată format 9:00, 10:00, etc.
- Spune ÎNTOTDEAUNA "ora nouă", "ora zece", "ora opt", etc.
- NU folosi simbolul ":" în răspunsurile tale
- Exemplu CORECT: "ora nouă dimineața"
- Exemplu GREȘIT: "9:00" sau "ora 9:00"
- serviceul e OAZA CAR nu folosi niciodata OAZA CAR CARE

📅 INFORMAȚII EXACTE ZILELE:
- Astăzi este: ${todayName}
- Mâine este: ${tomorrowName} ${isTomorrowWorkingDay ? '(zi lucrătoare)' : '(WEEKEND - închis)'}
- Poimâine este: ${dayAfterName} ${isDayAfterWorkingDay ? '(zi lucrătoare)' : '(WEEKEND - închis)'}

📅 OPȚIUNI DISPONIBILE PENTRU PROGRAMĂRI: ${availableOptions.join(', ')}
⚠️ CRITICAL: Folosește DOAR aceste opțiuni când sugerezi programări!

🧠 CONTEXTUAL INTELLIGENCE:
- nu folosi emoticoane in raspunsuri
- Răspunde natural la orice întrebare a clientului
- Dacă clientul are deja programare, menționeaz-o când este relevant
- Pentru întrebări despre numărul de telefon: repetă numărul complet
- Pentru întrebări despre adresă: dă adresa completă  
- Pentru întrebări despre preț: explică că depinde de problemă și cere să vină pentru verificare
- Pentru întrebări despre servicii: enumeră serviciile principale

🎯 INSTRUCȚIUNI PENTRU ÎNTREBĂRI DESPRE DISPONIBILITATE:
- Când întreabă "când pot să vin" sau "când aveți timp" → oferă DOAR opțiuni din zilele lucrătoare
- NU sugera niciodată weekend (sâmbătă/duminică) 
- Verifică zilele disponibile de mai sus înainte de a răspunde
- Oferă 2 opțiuni concrete cu zi + oră specifică
- Exemplu CORECT: "Pentru această problemă, vă pot programa mâine la ora zece sau luni la ora nouă. Care oră vă convine?"
- Exemplu GREȘIT: "poimâine la ora nouă" (dacă poimâine = weekend)

🎯 INSTRUCȚIUNI SPECIALE PENTRU PROGRAMĂRI NOI:
- Când confirmă o programare NOUĂ, cere ÎNTOTDEAUNA:
  1. Marca și modelul mașinii
  2. O poză cu talonul pe WhatsApp
  3. Descrie pe scurt problema mașinii
- Exemplu: "Perfect! V-Am programat pentru mâine la ora nouă. Pentru finalizare, trimiteți pe WhatsApp marca și modelul mașinii plus o poză cu talonul. Numărul nostru este zero șapte șapte patru, patru cinci șase, trei patru unu."

🎯 FORMAT ORE - FOLOSEȘTE DOAR ACESTEA:
- ora opt (nu 8:00)
- ora nouă (nu 9:00) 
- ora zece (nu 10:00)
- ora unsprezece (nu 11:00)
- ora douăsprezece (nu 12:00)
- ora treisprezece (nu 13:00)
- ora paisprezece (nu 14:00)
- ora cincisprezece (nu 15:00)
- ora șaisprezece (nu 16:00)
- ora șaptesprezece (nu 17:00)

📞 NUMĂRUL DE TELEFON: zero șapte șapte patru, patru cinci șase, trei patru unu

🎯 INSTRUCȚIUNI SPECIALE:
- Dacă întreabă de numărul de telefon: "Desigur! Numărul nostru este zero șapte șapte patru, patru cinci șase, trei patru unu"
- Dacă întreabă de adresă: "Ne găsiți pe Calea Dorobanților, numerele optsprezece-douăzeci, Cluj-Napoca"
- Răspunde contextual și inteligent, nu căuta cuvinte cheie specifice
- cand specific ora si e 9:00, te rog lasa doar 9 fara :minute

Servicii principale oferite:
Diagnoză auto
Reparații motoare
Înlocuire chiuloase
Schimb kit distribuție (distribuție)
Verificare, reparație și încărcare sistem climatizare / AC (inclusiv freon)
Reglaj direcție performant
Vulcanizare (montaj și echilibrare roți, dejantare, scuturare jante, etc.)
Schimb roți, echilibrare roți, dejantare cu echipamente moderne
Schimb ulei și filtre motor
Schimb componente de frânare
Schimb componente de direcție
Schimb componente de evacuare
Înlocuire sistem de răcire motor
Schimb componente de transmisie
Verificare și înlocuire sisteme de injecție
Înlocuire sisteme suspensie
ITP (Inspecție Tehnică Periodică) – stație autorizată RAR

Alte servicii conexe (din cadrul magazinului de piese și ITP):
Programare ITP
Hotel anvelope (servicii pentru depozitarea anvelopelor)
Vulcanizare completă
Piese auto
Reglaj direcție
Diagnoză auto
Schimb ulei și filtre motor
Schimb kit distribuție
Încărcare freon auto
Înlocuire kit ambreiaj
Schimb elemente de frânare
Reparații auto general (multimarcă)
Înlocuire chiuloase

Oaza Car – Service Auto Cluj NU oferă următoarele servicii:
❌ Tinichigerie (lucrări de caroserie, îndreptare elemente, vopsitorie)
❌ Vopsitorie auto
❌ Reparații electronice complexe (unități de control, senzori, soft-uri)
❌ Reparații instalație electrică (refacere cablaje, alimentări, etc.)
❌ Servicii de detailing auto (curățare interior/exterior profesională, polish)
❌ Spălătorie auto
❌ Tuning sau modificări de performanță
❌ Instalare sisteme multimedia / audio auto
❌ Tractări auto
❌ dezmembrari auto
❌ Înlocuire componente electrice

🎯 SCOPUL TĂU:
- Fii de ajutor și răspunde la orice întrebare
- Folosește informația despre programările existente când este relevantă
- Confirmă rapid programările noi
- Identifică automat serviciul când problema e clară

${oraCurenta}
${statusServicing}`;
  }

  async getContextualResponse(text, fullConversationContext, appointment = null, sessionId = '', conversationMemory = null, streamSid = null) {
    if (this.circuitBreakerActive) {
      console.log('🚨 ChatGPT circuit breaker active - using fallback');
      throw new Error('Circuit breaker active');
    }

    const messages = [
      { role: 'system', content: this.buildContextPrompt() },
    ];

    if (conversationMemory && streamSid) {
      if (appointment && appointment.day && appointment.time) {
        messages.push({
          role: 'system',
          content: `📅 ATENȚIE: Clientul are deja programare ${appointment.day} la ${appointment.time}. Nu mai întreaba ziua sau ora - confirmă sau discută detalii!`
        });
      }

      const partialBooking = conversationMemory.getPartialBooking(streamSid);
      if (partialBooking) {
        let contextMsg = '📝 PARTIAL BOOKING: ';
        if (partialBooking.service && partialBooking.day && !partialBooking.time) {
          contextMsg += `Ai deja SERVICIU (${partialBooking.service}) și ZI (${partialBooking.day}) - întreabă doar ORA!`;
        } else if (partialBooking.service && !partialBooking.day) {
          contextMsg += `Ai deja SERVICIU (${partialBooking.service}) - întreabă doar ZIUA!`;
        } else if (partialBooking.day && !partialBooking.time) {
          contextMsg += `Clientul vrea ${partialBooking.day} - întreabă doar ORA!`;
        } else if (partialBooking.time && !partialBooking.day) {
          contextMsg += `Clientul vrea ${partialBooking.time} - întreabă doar ZIUA!`;
        }
        
        messages.push({
          role: 'system',
          content: contextMsg
        });
        console.log(`🧠 PARTIAL BOOKING CONTEXT: ${contextMsg}`.cyan);
      }

      const intentions = conversationMemory.getClientIntentions(streamSid);
      let intentionContext = '';
      
      if (intentions.comingNow && Date.now() - intentions.comingNow.timestamp < 120000) {
        intentionContext += `CLIENTUL VINE ACUM! Spune "vă așteptăm acum". `;
      }
      
      if (intentionContext) {
        messages.push({
          role: 'system',
          content: `🚨 INTENȚII CLIENT: ${intentionContext}`
        });
      }

      const recentContext = conversationMemory.getConversationContext(streamSid);
      if (recentContext && recentContext.length > 0) {
        const lastMessages = recentContext.slice(-4);
        let contextSummary = 'MESAJE RECENTE: ';
        lastMessages.forEach(msg => {
          if (msg.role === 'user') {
            contextSummary += `Client: "${msg.content}" `;
          }
        });
        
        messages.push({
          role: 'system',
          content: contextSummary
        });
        console.log(`🧠 CONTEXT SUMMARY: ${contextSummary}`.cyan);
      }
    }

    const contextToUse = fullConversationContext.slice(-12);
    messages.push(...contextToUse);

    // STREAMING APPROACH
    const streamPromise = openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      max_tokens: 120,
      temperature: 0.1,
      presence_penalty: 0,
      frequency_penalty: 0.1,
      stream: true
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('GPT timeout')), this.GPT_TIMEOUT)
    );

    try {
      const stream = await Promise.race([streamPromise, timeoutPromise]);
      
      let fullResponse = '';
      const streamStartTime = Date.now();
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        
        if (content && fullResponse === content) {
          const firstChunkTime = Date.now() - streamStartTime;
          console.log(`⚡ First GPT chunk received in ${firstChunkTime}ms`);
        }
      }
      
      const aiResponse = fullResponse.trim();
      const totalStreamTime = Date.now() - streamStartTime;
      console.log(`✅ GPT streaming complete in ${totalStreamTime}ms`);

      // 🔥 SMART SERVICE DETECTION - Only when GPT confirms, not when asking
      if (conversationMemory && streamSid && typeof conversationMemory.setPartialBooking === 'function') {
        const responseLower = aiResponse.toLowerCase();
        
        // ❌ DON'T save service if GPT is ASKING about it
        const isAskingAboutService = 
          responseLower.includes('pentru ce serviciu') || 
          responseLower.includes('ce serviciu doriți') ||
          responseLower.includes('ce serviciu doriti') ||
          (responseLower.includes('avem itp') && responseLower.includes('vulcanizare') && responseLower.includes('mecanică'));
        
        if (isAskingAboutService) {
          console.log(`⚠️ GPT is asking about service - NOT saving automatically`);
        } else {
          // ✅ ONLY detect service when GPT is CONFIRMING/RECOMMENDING
          let detectedService = null;
          
          // Strong patterns that indicate GPT knows the service
          if ((responseLower.includes('mecanică') || responseLower.includes('mecanica')) && 
              (responseLower.includes('recomand') || 
               responseLower.includes('pentru') && (responseLower.includes('zgomot') || responseLower.includes('fum') || responseLower.includes('motor') || responseLower.includes('frân') || responseLower.includes('direcți')) ||
               responseLower.includes('verificare la mecanic') ||
               responseLower.includes('diagnoză la mecanic'))) {
            detectedService = 'MECANICA';
          } else if (responseLower.includes('pentru itp') || 
                     (responseLower.includes('itp') && responseLower.includes('vă pot programa'))) {
            detectedService = 'ITP';
          } else if ((responseLower.includes('vulcanizare') || responseLower.includes('anvelope')) && 
                     (responseLower.includes('pentru anvelope') || 
                      responseLower.includes('la vulcanizare') ||
                      responseLower.includes('vă pot programa la vulcanizare'))) {
            detectedService = 'VULCANIZARE';
          } else if ((responseLower.includes('clima') || responseLower.includes('climatizare')) && 
                     (responseLower.includes('pentru clima') || 
                      responseLower.includes('pentru climatizare'))) {
            detectedService = 'CLIMA';
          }
          
          // Only save if we detected a specific service confirmation
          if (detectedService) {
            const existingBooking = conversationMemory.getPartialBooking(streamSid) || {};
            
            conversationMemory.setPartialBooking(streamSid, { 
              service: detectedService,
              day: existingBooking.day || undefined
            });
            
            console.log(`🔧 Service saved from GPT (confirmed): ${detectedService}`);
          }
        }
      }

      this.gptFailCount = 0;
      this.circuitBreakerActive = false;

      if (sessionId) {
        const logPath = path.join(__dirname, `../logs/${sessionId}.txt`);
        fs.appendFileSync(logPath, `\n[USER]: ${text}\n[GPT]: ${aiResponse}\n`);
      }

      return aiResponse;
    } catch (error) {
      this.gptFailCount++;
      console.log(`❌ ChatGPT fail #${this.gptFailCount}: ${error.message}`);
      
      if (this.gptFailCount >= this.maxGptFails) {
        this.circuitBreakerActive = true;
        this.circuitBreakerReset = setTimeout(() => {
          this.circuitBreakerActive = false;
          this.gptFailCount = 0;
          console.log('🔄 ChatGPT circuit breaker reset');
        }, 60000);
      }
      
      throw error;
    }
  }

  async getSimpleResponse(text) {
    const streamPromise = openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `Service auto Cluj. Răspuns SCURT - maxim cincisprezece cuvinte. 
          NU da prețuri. Spune că un coleg va reveni cu oferta finală după poza cu talon.` 
        },
        { role: 'user', content: text }
      ],
      max_tokens: 40,
      temperature: 0,
      stream: true
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('GPT timeout')), this.GPT_TIMEOUT)
    );

    const stream = await Promise.race([streamPromise, timeoutPromise]);
    
    let fullResponse = '';
    for await (const chunk of stream) {
      fullResponse += chunk.choices[0]?.delta?.content || '';
    }
    
    return fullResponse.trim();
  }
}

module.exports = { GPTService };