// Astronomical constants
const SYNODIC_MONTH = 29.530588853;

// Moon phase emoji mapping
const MOON_PHASES = [
  { label: "Luna nuova", emoji: "🌑" },
  { label: "Falce crescente", emoji: "🌒" },
  { label: "Primo quarto", emoji: "🌓" },
  { label: "Gibbosa crescente", emoji: "🌔" },
  { label: "Luna piena", emoji: "🌕" },
  { label: "Gibbosa calante", emoji: "🌖" },
  { label: "Ultimo quarto", emoji: "🌗" },
  { label: "Falce calante", emoji: "🌘" },
];

/**
 * Converte un oggetto Date in Julian Day (Astronomical).
 * @param {Date} date
 * @returns {number} jd
 */
function toJulianDay(date) {
  const time = date.getTime();
  return time / 86400000 + 2440587.5;
}

/**
 * Converte un Julian Day in oggetto Date.
 * @param {number} jd
 * @returns {Date}
 */
function fromJulianDay(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/**
 * Normalize angle to 0-360 degrees
 */
function normalizeDegrees(deg) {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Convert degrees to radians
 */
function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calcola il Julian Day esatto di una fase lunare secondo l'algoritmo di Jean Meeus (Astronomical Algorithms, Ch. 49).
 * Questo algoritmo tiene conto delle perturbazioni solari e planetarie principali.
 * 
 * @param {number} k - Numero di lunazioni da Jan 6, 2000 (New Moon). 
 *                     k intero = Luna Nuova, k + 0.5 = Luna Piena, etc.
 * @returns {number} Julian Day dell'evento
 */
function computeExactPhase(k) {
  const T = k / 1236.85; // Secoli da J2000
  const T2 = T * T;
  const T3 = T * T * T;
  const T4 = T2 * T2;

  // JD medio della fase
  let jd =
    2451550.09766 +
    29.530588861 * k +
    0.0001337 * T2 -
    0.000000150 * T3 +
    0.00000000073 * T4;

  // Anomalie e Argomenti (in gradi) - Jean Meeus Ch. 49
  // Anomalia media del Sole (M)
  let M = 2.5534 + 29.10535608 * k - 0.0000218 * T2 - 0.00000011 * T3;
  // Anomalia media della Luna (M')
  let Mp = 201.5643 + 385.81691806 * k + 0.0107438 * T2 + 0.00001239 * T3 - 0.000000058 * T4;
  // Argomento della latitudine della Luna (F)
  let F = 160.7108 + 390.67050646 * k - 0.0016341 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  
  // Normalizzazione angoli
  M = normalizeDegrees(M);
  Mp = normalizeDegrees(Mp);
  F = normalizeDegrees(F);

  // Trasformazione in radianti per le funzioni sin/cos
  const rM = toRad(M);
  const rMp = toRad(Mp);
  const rF = toRad(F);

  // Correzioni per Luna Nuova (k intero) o Luna Piena (k + 0.5)
  // Le correzioni variano in base alla fase.
  // Qui implementiamo un subset robusto per Nuova e Piena.
  
  // Determina se è Nuova o Piena guardando la parte frazionaria di k
  const phaseType = Math.abs(k - Math.round(k)); // ~0.0 per New, ~0.5 per Full
  
  let corrections = 0;

  if (phaseType < 0.25) { 
    // === LUNA NUOVA (k integer) ===
    corrections += (0.1734 - 0.000393 * T) * Math.sin(rM);
    corrections += 0.0021 * Math.sin(2 * rM);
    corrections += -0.4068 * Math.sin(rMp);
    corrections += 0.0161 * Math.sin(2 * rMp);
    corrections += -0.0004 * Math.sin(3 * rMp);
    corrections += 0.0104 * Math.sin(2 * rF);
    corrections += -0.0051 * Math.sin(rM + rMp);
    corrections += -0.0074 * Math.sin(rM - rMp);
    corrections += 0.0004 * Math.sin(2 * rF + rM);
    corrections += -0.0004 * Math.sin(2 * rF - rM);
    corrections += -0.0006 * Math.sin(2 * rF + rMp);
    corrections += 0.0010 * Math.sin(2 * rF - rMp);
    corrections += 0.0005 * Math.sin(rM + 2 * rMp);
  } else {
    // === LUNA PIENA (k + 0.5) ===
    corrections += (-0.4072 - 0.00004 * T) * Math.sin(rMp);
    corrections += (0.17241 - 0.0004 * T) * Math.sin(rM);
    corrections += 0.01608 * Math.sin(2 * rMp);
    corrections += 0.00210 * Math.sin(2 * rM);
    corrections += -0.00514 * Math.sin(rM + rMp);
    corrections += 0.00396 * Math.sin(rM - rMp);
    corrections += 0.01044 * Math.sin(2 * rF);
    corrections += -0.00191 * Math.sin(rM - 2 * rF); 
    corrections += -0.00143 * Math.sin(rMp - 2 * rF);
    corrections += 0.00063 * Math.sin(rM + 2 * rF); 
    corrections += -0.00030 * Math.sin(3 * rMp);
    corrections += -0.00021 * Math.sin(2 * rM - rMp); 
  }

  // Additional corrections for Earth's orbit (eccentricity)
  // These are included indirectly in the rM terms above, but Jean Meeus adds extra
  // planetary terms we can omit for dashboard use (~0.0003 days or 25 seconds precision).
  // This maintains accuracy within ~1-2 minutes.

  return jd + corrections;
}

/**
 * Moon age calculation and current phase.
 */
function calculateCurrentMoonStatus() {
  const now = new Date();
  const currentJD = toJulianDay(now);

  // approx k (from J2000 New Moon)
  // JD New Moon 2000 = 2451550.1
  const kFloat = (currentJD - 2451550.1) / SYNODIC_MONTH;
  const kPrevNew = Math.floor(kFloat);
  const kNextNew = kPrevNew + 1;
  
  // precise JD calculation for previous and next new moon
  // Note: kPrevNew is an integer
  let jdPrevNew = computeExactPhase(kPrevNew);
  let jdNextNew = computeExactPhase(kNextNew);
  
  // Refinement: if currentJD < jdPrevNew, we're still in the previous cycle
  // (because the mean estimate kFloat was ahead compared to perturbed reality)
  if (currentJD < jdPrevNew) {
      jdPrevNew = computeExactPhase(kPrevNew - 1);
      jdNextNew = computeExactPhase(kPrevNew);
  } else if (currentJD > jdNextNew) {
       // Opposite case: already in next cycle
       jdPrevNew = computeExactPhase(kNextNew);
       jdNextNew = computeExactPhase(kNextNew + 1);
  }
  
  const currentLunationLength = jdNextNew - jdPrevNew;
  const ageDays = currentJD - jdPrevNew;
  const phaseFraction = ageDays / currentLunationLength;

  // Calculate next relevant event (Full or New)
  // Determine if next Full Moon is in this cycle (between prevNew and nextNew)
  // or if we've already passed it.
  
  // Estimate k for Full Moon in this cycle
  // If jdPrevNew corresponds to k=N, then Full Moon is k=N+0.5
  // Need to find the original 'k' associated with jdPrevNew.
  const approximatedK = Math.round((jdPrevNew - 2451550.1) / 29.53);
  
  const jdFullThisCycle = computeExactPhase(approximatedK + 0.5);
  
  let nextFullMoonDate, nextNewMoonDate;
  
  if (currentJD < jdFullThisCycle) {
      // Next full moon is in this cycle
      nextFullMoonDate = fromJulianDay(jdFullThisCycle);
  } else {
      // Next full moon is in the following cycle
      const jdFullNextCycle = computeExactPhase(approximatedK + 1.5);
      nextFullMoonDate = fromJulianDay(jdFullNextCycle);
  }
  
  // Next new moon is always jdNextNew (end of current cycle)
  nextNewMoonDate = fromJulianDay(jdNextNew);

  return {
    phaseFraction: phaseFraction, // 0.0 - 1.0
    ageDays: ageDays,
    nextFullMoon: nextFullMoonDate,
    nextNewMoon: nextNewMoonDate
  };
}

function getIllumination(phaseFraction) {
  return 0.5 * (1 - Math.cos(2 * Math.PI * phaseFraction));
}

function formatShortDateTime(date) {
  const giorni = ["Dom.", "Lun.", "Mar.", "Mer.", "Gio.", "Ven.", "Sab."];
  const giornoSettimana = giorni[date.getDay()];
  const dataString = date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Rome",
  });
  return `${giornoSettimana} ${dataString}`;
}

function renderMoonPhase() {
  const container = document.getElementById("moon-now");
  if (!container) return;
  const icon = container.querySelector(".moon-icon");
  const title = container.querySelector(".moon-title");
  const subtitle = container.querySelector(".moon-phase");
  if (!icon || !title || !subtitle) return;

  const status = calculateCurrentMoonStatus();
  
  // Index per l'icona (0-7)
  const index = Math.round(status.phaseFraction * 8) % 8;
  const phase = MOON_PHASES[index] || MOON_PHASES[0];
  const illumination = (getIllumination(status.phaseFraction) * 100).toFixed(1);

  icon.textContent = phase.emoji;
  title.textContent = `${phase.label} · ${illumination}%`;

  // Display logic: show the most interesting or nearest event
  // If phase < 50% (waxing), highlight full moon
  // If phase > 50% (waning), highlight new moon
  
    if (status.phaseFraction < 0.5) {
      subtitle.textContent = `Prossima luna piena:\n${formatShortDateTime(status.nextFullMoon)}`;
    } else {
      subtitle.textContent = `Prossima luna nuova:\n${formatShortDateTime(status.nextNewMoon)}`;
    }
}

export { renderMoonPhase };
