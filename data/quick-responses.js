// data/quick-responses.js - FIXED: Single require declaration and generic availability

const { getCurrentDayInfo, getNextWorkingDay } = require('../utils/scheduling');

// Helper function to check if service is currently open
function isServiceCurrentlyOpen() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  
  const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWorkingHour = hour >= 8 && hour < 17;
  
  return isWorkingDay && isWorkingHour;
}

// ENHANCED CACHED RESPONSES - Added steering problems and "acum" logic
const quickResponses = {
  // NEW: "ACUM" responses - use function to check dynamically
  'acum': function() {
    return isServiceCurrentlyOpen() 
      ? 'Desigur, veniți acum! Vă așteptăm la service.'
      : 'Pentru acum suntem închisi, dar vă pot programa pentru următoarea zi lucrătoare. Când vă convine?';
  },
  
  'pot să vin acum': function() {
    return isServiceCurrentlyOpen()
      ? 'Desigur, veniți acum! Vă așteptăm cu drag.'
      : 'Pentru acum suntem închisi, dar vă pot programa pentru următoarea zi lucrătoare. Când vă convine?';
  },
    
  'vin acum': function() {
    return isServiceCurrentlyOpen()
      ? 'Perfect, vă așteptăm acum la service!'
      : 'Pentru acum suntem închisi, dar vă pot programa pentru următoarea zi lucrătoare. Când vă convine?';
  },

  'merge greu': 'Pentru direcția grea recomandăm verificarea sistemului de direcție. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'mașina merge greu': 'Pentru direcția grea recomandăm verificarea sistemului de direcție. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'volanul e greu': 'Pentru volanul greu recomandăm verificarea direcției și uleiului hidraulic. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'volan greu': 'Pentru volanul greu recomandăm verificarea direcției și uleiului hidraulic. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'greu la volan': 'Pentru volanul greu recomandăm verificarea sistemului de direcție. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'merge greu la direcție': 'Pentru direcția grea recomandăm verificarea sistemului de direcție. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'direcția merge greu': 'Pentru direcția grea recomandăm verificarea sistemului de direcție. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'e greu volanul': 'Pentru volanul greu recomandăm verificarea direcției și uleiului hidraulic. Oferta exactă se face după poza cu talonul. Când doriți să veniți?',
  'roți': 'Pentru roți sau anvelope, putem face o ofertă personalizată după o poză cu talonul. Când vă este convenabil să veniți?',
  'roțile': 'Pentru roți sau anvelope, putem face o ofertă personalizată după o poză cu talonul. Când vă este convenabil să veniți?',
  'anvelope': 'Pentru anvelope, oferta depinde de dimensiuni. Trimiteți o poză cu talonul și revenim cu o ofertă. Cand ati dori sa veniti in service?',
  'cauciucuri': 'Pentru cauciucuri, oferta se face după mărimea din talon. Ne trimiteți o poză? Când doriți să veniți?',
  'schimb de direcție': 'Pentru schimbul de direcție, putem face o ofertă după ce primim o poză cu talonul. Când vă programați?',
  'schimb direcție': 'Pentru schimbul sistemului de direcție, avem nevoie de o poză cu talonul pentru ofertă. Cand ati dori sa veniti in service?',
  'direcție': 'Pentru reparația sistemului de direcție, ne puteți trimite o poză cu talonul și vă facem o ofertă. Cand ati dori sa veniti in service?',
  'plăcuțe': 'Pentru plăcuțele de frână, facem ofertă după poză cu talonul ca să știm ce model aveți. Cand ati dori sa veniti in service?',
  'plăcuțe frână': 'Pentru schimbul plăcuțelor de frână, trimiteți o poză cu talonul și revenim cu ofertă. Cand ati dori sa veniti in service?',
  'frâne': 'Pentru sistemul de frânare, ne puteți trimite o poză cu talonul pentru ofertă. Când doriți să veniți?',
  'ulei': 'Pentru schimbul de ulei, oferta se face în funcție de motorizare. Ne puteți trimite o poză cu talonul? Cand ati dori sa veniti in service?',
  'schimb ulei': 'Pentru schimbul complet de ulei, ne ajută o poză cu talonul pentru a vă face o ofertă exactă. Când vă programați?',
  'distribuție': 'Pentru sistemul de distribuție, oferta diferă în funcție de motor. Trimiteți o poză cu talonul și revenim cu detalii. Cand ati dori sa veniti in service?',
  'amortizoare': 'Pentru amortizoare, avem nevoie de o poză cu talonul pentru a vă face o ofertă corectă. Când ați dori să veniți?',
  'diagnosticare': 'Pentru diagnosticare computerizată, vă putem face o ofertă după ce vedem datele mașinii. Trimiteți o poză cu talonul. Când doriți să veniți?',
  'diagnostic': 'Un diagnostic complet necesită informații din talon. Trimiteți-ne o poză și revenim cu oferta. Cand ati dori sa veniti in service?',
  'care e prețul': 'Oferta se stabilește după ce vedem modelul mașinii. Ne puteți trimite o poză cu talonul? Când ați vrea să veniți?',
  'cât costă': 'Prețul depinde de modelul mașinii. Trimiteți o poză cu talonul și revenim cu oferta. Cand ati dori sa veniti in service?',

  // ROȚI ȘI ANVELOPE
  'roți': 'Pentru anvelope noi, prețul depinde de mărimea roților dumneavoastră. Când ați dori să veniți pentru o ofertă personalizată?',
  'roțile': 'Pentru schimbul anvelopelor, prețul variază în funcție de mărime și marcă. Când vă este convenabil să veniți?',
  'anvelope': 'Pentru anvelope noi, prețul depinde de mărimea și calitatea dorită. Când ați dori să discutăm opțiunile?',
  'cauciucuri': 'Pentru cauciucuri noi, prețul variază după mărimea roților. Când vă convine să veniți pentru o consultație?',

  // SISTEMUL DE DIRECȚIE - Original responses
  'schimb de direcție': 'Un schimb de direcție costă între trei sute și cinci sute de lei. Când ați dori să programați lucrarea?',
  'schimb direcție': 'Pentru schimbul sistemului de direcție, costul este între trei sute și cinci sute de lei. Cand ati dori sa veniti in service?',
  'direcție': 'Pentru reparația sistemului de direcție, costul variază între trei sute și cinci sute de lei. Cand ati dori sa veniti in service?',

  // SISTEMUL DE FRÂNARE
  'plăcuțe': 'Plăcuțele de frână costă între două sute și patru sute de lei, plus montajul. Când doriți să le schimbați?',
  'plăcuțe frână': 'Pentru schimbul plăcuțelor de frână, costul total este între două sute și patru sute de lei. Cand ati dori sa veniti in service?',
  'frâne': 'Pentru sistemul de frânare, costul variază între două sute și șase sute de lei. Cand ati dori sa veniti in service?',

  // MOTOR ȘI ULEI
  'ulei': 'Schimbul de ulei costă între optzeci și o sută cincizeci de lei, cu totul inclus. Când vă este convenabil?',
  'schimb ulei': 'Pentru schimbul complet de ulei motor, costul este între optzeci și o sută cincizeci de lei. Cand ati dori sa veniti in service?',

  // DISTRIBUȚIE
  'distribuție': 'Pentru sistemul de distribuție, costul variază între două sute cincizeci și o mie două sute de lei. Cand ati dori sa veniti in service?',

  // SUSPENSIE ȘI AMORTIZOARE
  'amortizoare': 'Amortizoarele costă între trei sute și șase sute de lei per bucată, plus montajul. Cand ati dori sa veniti in service?',

  // DIAGNOSTICARE ȘI SERVICII
  'diagnosticare': 'Diagnosticarea computerizată costă între optzeci și o sută douăzeci de lei. Când ați dori să veniți?',
  'diagnostic': 'Un diagnostic complet costă între optzeci și o sută douăzeci de lei. Când vă este convenabil?',

  // ÎNTREBĂRI GENERALE
  'care e prețul': 'Cu plăcere să vă informez despre prețuri. Ce anume la mașină vă interesează să reparați?',
  'cât costă': 'Desigur, vă pot spune costurile. Pentru ce serviciu auto aveți nevoie în mod special?',

  // ENHANCED SCHEDULING RESPONSES
  'mâine': getCurrentDayInfo().day === 'vineri' ? 
    'Mâine este sâmbătă și suntem închisi. Vă pot programa pentru luni. La ce oră vă convine?' :
    getCurrentDayInfo().day === 'sâmbătă' ? 
    'Mâine este duminică și suntem închisi. Vă pot programa pentru luni. La ce oră vă convine?' :
    'Perfect, mâine avem disponibilitate completă. La ce oră vă este cel mai convenabil să veniți?',
  
  'astăzi': !getCurrentDayInfo().isWorkingDay ? 
    `Astăzi este ${getCurrentDayInfo().day} și suntem închisi. Vă pot programa pentru ${getNextWorkingDay()}. La ce oră vă convine?` :
    getCurrentDayInfo().hour >= 17 ?
    'Pentru astăzi suntem închisi, dar vă pot programa pentru mâine. La ce oră vă convine?' :
    'Pentru astăzi, mai suntem disponibili până la ora șaptesprezece. La ce oră ați putea veni?',
  
  'luni': 'Luni avem program complet de la ora opt dimineața. La ce oră vă este convenabil să programați?',
  'marți': 'Marți suntem disponibili de la ora opt dimineața până seara. La ce oră ați dori să veniți?',
  'miercuri': 'Miercuri avem disponibilitate de la prima oră. La ce oră vă convine cel mai bine?',
  'joi': 'Joi suntem deschisi cu programul complet. La ce oră ați dori să vă programați?',
  'vineri': 'Vineri avem program de la ora opt dimineața. La ce oră vă este convenabil?',
  'sâmbătă': 'Sâmbăta suntem închisi. Vă pot programa pentru luni sau în cursul săptămânii. Ce zi și oră vă convine?',
  'duminică': 'Duminica suntem închisi. Vă pot programa pentru luni sau în cursul săptămânii. Ce zi și oră vă convine?',

  'pot să vin mâine': 'Perfect pentru mâine! La ce oră vă este cel mai convenabil să veniți?',
  'pot să vin astăzi': getCurrentDayInfo().hour >= 17 ? 
    'Pentru astăzi suntem închisi, dar mâine se poate. La ce oră vă convine?' :
    'Perfect pentru astăzi! La ce oră puteți veni până la ora șaptesprezece?',
  'pot să vin luni': 'Excelent pentru luni! La ce oră vă programați?',
  'pot să vin marți': 'Perfect pentru marți! La ce oră vă este convenabil?',
  'pot să vin miercuri': 'Minunat pentru miercuri! La ce oră vă convine?',
  'pot să vin joi': 'Excelent pentru joi! La ce oră ați dori să veniți?',
  'pot să vin vineri': 'Perfect pentru vineri! La ce oră vă programez?',
  // PROGRAM ȘI LOCAȚIE
  'program': 'Suntem deschisi de luni până vineri, de la ora opt dimineața până la ora șaptesprezece seara.',
  'când sunteți deschis': 'Suntem deschisi de luni până vineri, de la ora opt dimineața până la ora șaptesprezece.',
  'unde sunteți': 'Ne găsiți pe Strada Dorobanților, numerele optsprezece-douăzeci, în Cluj-Napoca.',
  'adresa': 'Adresa noastră completă este pe Strada Dorobanților, numerele optsprezece-douăzeci, Cluj-Napoca.',
  'unde': 'Ne găsiți pe Strada Dorobanților, numerele optsprezece-douăzeci, În Cluj-Napoca.',

  // CONFIRMATIONS
  'da': 'Excelent! La ce oră vă este cel mai convenabil să veniți?',
  'nu': 'Înțeleg perfect. Cu altceva vă pot ajuta în privința mașinii dumneavoastră?',
  'ok': 'Perfect! La ce oră ați dori să programați?',
  'bine': 'Minunat! La ce oră vă convine cel mai bine?',
  'mulțumesc': 'Cu multă plăcere să vă ajut oricând. Vă așteptăm la OAZA CAR Cluj-Napoca.',
  'la revedere': 'La revedere și vă așteptăm cu drag pentru programarea dumneavoastră.',
};

// ENHANCED MEGA QUICK RESPONSES - Better steering problem recognition
const megaQuickResponses = {
  // Common follow-up questions
  'mai am o întrebare': 'Cu siguranță, cu ce vă pot ajuta în continuare?',
  'mai am o întreb': 'Cu siguranță, cu ce vă pot ajuta în continuare?',
  'încă o întrebare': 'Desigur, sunt aici să vă ajut. Cu ce vă pot fi util?',
  
  // Day + time combinations
  'mâine la zece': 'Perfect! Programarea pentru mâine la ora zece este confirmată cu succes. Vă așteptăm.',
  'mâine la nouă': 'Excelent! Programarea pentru mâine la ora nouă este confirmată. Vă așteptăm cu drag.',
  'mâine la opt': 'Minunat! Programarea pentru mâine la ora opt dimineața este confirmată.',
  
  // "Se poate" responses  
  'se poate': 'Perfect! La ce oră vă convine cel mai bine să veniți?',
  'da se poate': 'Excelent! La ce oră ați dori să programați?',
  'mâine se poate': 'Perfect pentru mâine! La ce oră vă este convenabil să veniți?',
  'astăzi se poate': getCurrentDayInfo().hour >= 17 ? 
    'Pentru astăzi suntem închisi, dar mâine se poate. La ce oră vă convine?' :
    'Perfect pentru astăzi! La ce oră puteți veni până la ora șaptesprezece?',
  
  /// Automotive problems – fără prețuri
  'motorul sună ciudat': 'Pentru zgomotul motorului recomandăm diagnosticare computerizată. Oferta exactă se face după o poză cu talonul. Când doriți să veniți?',
  'motorul îmi sună': 'Zgomotul motorului indică posibil o problemă la distribuție sau ulei. Trimiteți o poză cu talonul și vă facem o ofertă. Cand ati dori sa veniti in service?',
  'sună ciudat motorul': 'Zgomotul ciudat poate fi de la distribuție sau piese uzate. Oferta se face după poză cu talonul. Cand ati dori sa veniti in service?',

  // Context-aware follow-ups
  'dar din ce cauză poate să fie sunetul': 'Sunetul poate fi de la distribuție, ulei vechi sau uzură piese. Trimiteți o poză cu talonul și revenim cu ofertă. Cand ati dori sa veniti in service?',
  'de ce poate să fie sunetul': 'Poate fi de la ulei vechi, distribuție sau uzură. Oferta exactă se face după talon. Cand ati dori sa veniti in service?',

  // Time-related questions
  'și cât durează': 'Durata depinde de intervenție. Un coleg vă oferă detalii după ce trimiteți o poză cu talonul. Când doriți să veniți?',
  'cât timp': 'Timpul variază în funcție de lucrare. Trimiteți o poză cu talonul și revenim cu estimare. Cand ati dori sa veniti in service?',

  // Service questions
  'ce servicii': 'Oferim reparații motor, frâne, direcție, diagnoză, anvelope și multe altele. Ce problemă aveți?',
  'ce faceți': 'Suntem service auto complet – reparații, diagnoză, mentenanță. Trimiteți o poză cu talonul pentru ofertă personalizată. Când doriți să veniți?',

  // Final polite responses
  'nu, mulțumesc': 'În regulă, vă așteptăm oricând aveți nevoie. O zi frumoasă!',
  'nu mai am întrebări': 'Cu drag! Dacă mai aveți nevoie, suntem aici. O zi excelentă!',
  'gata, mulțumesc': 'Cu mare plăcere! Vă așteptăm oricând la service.'

};

module.exports = { quickResponses, megaQuickResponses };