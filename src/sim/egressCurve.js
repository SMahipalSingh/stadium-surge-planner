/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Egress Demand Arrival Curve Module
 *
 * Deterministic pure mathematical function.
 * Computes minute-by-minute passenger arrivals at the station entrance.
 *
 * MODEL ASSUMPTION:
 * Egress exhibits a right-skewed distribution (Gamma-family curve):
 * - Slight trickle of early leavers starting at t = -10 min
 * - Whistle/event close at t = 0 min
 * - Surge walking time leads to a sharp arrival peak around t = +12 to +18 min
 * - Long tail tapering off toward t = +60 to +90 min
 * - Rain condition: slows pedestrian walking velocity and spreads egress duration by ~25%
 */

/**
 * Calculates deterministic minute-by-minute passenger arrivals at the metro station.
 * 
 * @param {number} totalMetroPassengers - Total attendees expected to use the metro
 * @param {number} egressSpreadMin - Characteristic spread parameter (default 45 min)
 * @param {string} weather - 'normal' or 'rain' (rain slows walking speed)
 * @param {number} startOffset - Simulation start relative to event end (default -10 min)
 * @param {number} endOffset - Simulation end relative to event end (default 120 min)
 * @returns {Array<{ minuteOffset: number, arrivals: number, cumulativeArrivals: number, probability: number }>}
 */
export function calculateEgressCurve(
  totalMetroPassengers,
  egressSpreadMin = 45,
  weather = 'normal',
  startOffset = -10,
  endOffset = 120
) {
  if (totalMetroPassengers <= 0) {
    const emptyTimeline = [];
    for (let t = startOffset; t <= endOffset; t++) {
      emptyTimeline.push({
        minuteOffset: t,
        arrivals: 0,
        cumulativeArrivals: 0,
        probability: 0
      });
    }
    return emptyTimeline;
  }

  // Weather impact coefficients:
  // Rain increases walking transit time (peak shifted +6 min) and increases dispersion (+25% spread)
  const isRain = weather === 'rain';
  const effectiveSpread = isRain ? egressSpreadMin * 1.25 : egressSpreadMin;
  const peakTimeMinutes = isRain ? 18.0 : 12.0;

  // Gamma distribution parameters:
  // Shape parameter k = 3 gives realistic skewed right stadium outflow
  // Mode of Gamma is (k - 1) * theta.
  // We want mode to align with (peakTimeMinutes - startOffset).
  const k = 3.0;
  const targetMode = peakTimeMinutes - startOffset; // e.g. 12 - (-10) = 22 minutes into simulation
  const theta = targetMode / (k - 1.0); // scale parameter

  const rawWeights = [];
  let totalWeight = 0;

  for (let t = startOffset; t <= endOffset; t++) {
    const tau = t - startOffset; // elapsed minutes from start of simulation (tau >= 0)
    
    // Gamma density kernel: f(tau) = tau^(k-1) * exp(-tau / theta)
    let weight = 0;
    if (tau > 0) {
      weight = Math.pow(tau, k - 1) * Math.exp(-tau / theta);
    }
    
    // Add baseline trickle for early leavers leaving before the final whistle (t in [-10, 0])
    if (t < 0) {
      const earlyLeaverWeight = 0.05 * Math.exp((t) / 4.0);
      weight += earlyLeaverWeight;
    }

    rawWeights.push({ t, weight });
    totalWeight += weight;
  }

  // Normalize probabilities and calculate discrete integer passenger allocations
  let allocatedSum = 0;
  const items = rawWeights.map(item => {
    const prob = totalWeight > 0 ? item.weight / totalWeight : 0;
    const exactCount = prob * totalMetroPassengers;
    const integerCount = Math.floor(exactCount);
    allocatedSum += integerCount;
    return {
      t: item.t,
      prob,
      count: integerCount,
      remainder: exactCount - integerCount
    };
  });

  // Deterministically allocate remaining passengers (due to rounding) to highest fractional remainders
  let discrepancy = Math.round(totalMetroPassengers - allocatedSum);
  if (discrepancy > 0) {
    // Sort descending by fractional remainder
    const sortedIndices = items
      .map((item, idx) => ({ idx, remainder: item.remainder }))
      .sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < discrepancy && i < sortedIndices.length; i++) {
      items[sortedIndices[i].idx].count += 1;
    }
  }

  // Build final structured minute timeline
  let runningTotal = 0;
  return items.map(item => {
    runningTotal += item.count;
    return {
      minuteOffset: item.t,
      arrivals: item.count,
      cumulativeArrivals: runningTotal,
      probability: item.prob
    };
  });
}
