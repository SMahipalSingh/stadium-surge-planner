/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Discrete Minute Simulation Engine
 *
 * Deterministic pure JavaScript module (no libraries, no random numbers, no AI).
 * Simulates minute-by-minute crowd ingress, gate queuing, platform occupancy,
 * and train boarding for metro stations during major event surges.
 *
 * REFERENCE: Spec PS-05 Section 7
 */

import { calculateEgressCurve } from './egressCurve.js';
import { APP_CONFIG } from '../config.js';

/**
 * Formats 24-hour clock time given a base "HH:MM" and a relative minute offset.
 * Example: ("23:00", -10) -> "22:50", ("23:00", 75) -> "00:15"
 *
 * @param {string} baseTime - Base 24h time in "HH:MM" format
 * @param {number} minuteOffset - Offset in minutes (positive or negative)
 * @returns {string} 24h formatted "HH:MM" string
 */
export function formatClockTime(baseTime = "23:00", minuteOffset = 0) {
  const parts = baseTime.split(':');
  const baseHours = parseInt(parts[0], 10) || 0;
  const baseMinutes = parseInt(parts[1], 10) || 0;

  const totalMinutes = (baseHours * 60 + baseMinutes + minuteOffset) % 1440;
  const positiveMinutes = totalMinutes < 0 ? totalMinutes + 1440 : totalMinutes;

  const hours = Math.floor(positiveMinutes / 60);
  const minutes = positiveMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Runs a deterministic minute-by-minute surge simulation.
 *
 * @param {object} eventInput - Event parameters (attendance, metroSharePct, endTime, egressSpreadMin, weather)
 * @param {object} stationAssumptions - Station physical and operational assumptions
 * @param {object} [planOverrides={}] - Optional planned intervention schedule overrides (headway, gates, holding)
 * @returns {object} Full simulation result including timeline and key performance metrics
 */
export function runSimulation(eventInput, stationAssumptions, planOverrides = {}) {
  const startOffset = APP_CONFIG.simulation.startMinuteOffset; // -10
  const endOffset = APP_CONFIG.simulation.endMinuteOffset;     // +120
  const endTime = eventInput.endTime || "23:00";

  // Calculate total passengers expected to use the metro
  const metroSharePct = Number(eventInput.metroSharePct) || 35;
  const totalMetroPassengers = Math.round((eventInput.attendance || 0) * (metroSharePct / 100));

  // 1. Calculate deterministic arrival demand curve
  const egressTimeline = calculateEgressCurve(
    totalMetroPassengers,
    eventInput.egressSpreadMin || 45,
    eventInput.weather || 'normal',
    startOffset,
    endOffset
  );

  // Map arrivals by minuteOffset for rapid lookup
  const arrivalsByMinute = new Map();
  egressTimeline.forEach(item => {
    arrivalsByMinute.set(item.minuteOffset, item.arrivals);
  });

  // Extract station assumptions (with safe fallbacks)
  const gatesOpenBaseline = Number(stationAssumptions.gates_open_baseline) || 8;
  const gateThroughputPerMin = Number(stationAssumptions.gate_throughput_per_min) || 25;
  const platformCapacitySafe = Number(stationAssumptions.platform_capacity_safe) || 3500;
  const trainCapacity = Number(stationAssumptions.train_capacity) || 1000;
  const baselineHeadwayMin = Number(stationAssumptions.baseline_headway_min) || 6.0;
  const throughPassengerRatio = stationAssumptions.through_passenger_ratio !== undefined 
    ? Number(stationAssumptions.through_passenger_ratio) 
    : 0.20;
  const loadFactor = Number(stationAssumptions.load_factor) || 1.0;

  // Boarding capacity per train considering through-passengers
  const effectiveBoardingCapacity = Math.round(trainCapacity * (1.0 - throughPassengerRatio) * loadFactor);

  // Simulation state variables
  let outsideQueue = 0;
  let concourseHeld = 0;
  let platformOccupancy = 0;
  let totalBoarded = 0;
  let totalTrainsArrived = 0;

  // Train arrival tracking: accumulator triggers train arrival when reaching headway
  let trainTimeAccumulator = baselineHeadwayMin; // First train ready at t = startOffset

  const timeline = [];

  let peakPlatformOccupancy = 0;
  let peakPlatformTime = formatClockTime(endTime, startOffset);
  let peakPlatformMinute = startOffset;
  let maxOutsideQueue = 0;
  let maxQueueWaitMin = 0;
  let maxQueueTime = formatClockTime(endTime, startOffset);
  let maxConcourseHeld = 0;

  let redMinutesPlatform = 0;
  let redMinutesQueue = 0;
  let totalRedMinutes = 0;
  let totalAmberMinutes = 0;
  let totalGreenMinutes = 0;

  for (let t = startOffset; t <= endOffset; t++) {
    const timeStr = formatClockTime(endTime, t);
    const demandArrivals = arrivalsByMinute.get(t) || 0;

    // Check for plan interventions at minute t (if supplied by planner)
    const activeGatesOpen = (planOverrides.gatesSchedule && planOverrides.gatesSchedule[t] !== undefined)
      ? planOverrides.gatesSchedule[t]
      : gatesOpenBaseline;

    const currentHeadway = (planOverrides.headwaySchedule && planOverrides.headwaySchedule[t] !== undefined)
      ? planOverrides.headwaySchedule[t]
      : baselineHeadwayMin;

    const holdRatePerMin = (planOverrides.holdingSchedule && planOverrides.holdingSchedule[t] !== undefined)
      ? planOverrides.holdingSchedule[t]
      : 0; // Number of passengers to hold in concourse instead of releasing to platform

    // 2. Outside Queue & Gate Inflow
    const totalOutsideWaiting = outsideQueue + demandArrivals;
    const gateCapacityThisMinute = activeGatesOpen * gateThroughputPerMin;

    // Check if concourse holding is active to protect platform safe capacity
    const isHoldingActive = Boolean(planOverrides.holdingEnabled);
    const targetPlatformRatio = planOverrides.targetPlatformRatio !== undefined 
      ? Number(planOverrides.targetPlatformRatio) 
      : 0.90;
    const safePlatformCap = Math.round(platformCapacitySafe * targetPlatformRatio);
    const concourseHoldingMax = Number(stationAssumptions.concourse_holding_capacity) || 2000;

    let concourseToPlatform = 0;
    let gateInflow = 0;

    if (isHoldingActive) {
      // Room currently available on platform before exceeding safe target ratio
      const roomOnPlatform = Math.max(0, safePlatformCap - platformOccupancy);

      // Prioritize releasing previously held concourse passengers onto platform
      const maxReleaseRate = 250; // controlled release rate through concourse barriers per min
      const concourseRelease = Math.min(concourseHeld, roomOnPlatform, maxReleaseRate);
      concourseHeld -= concourseRelease;
      concourseToPlatform += concourseRelease;

      const remainingRoomOnPlatform = Math.max(0, roomOnPlatform - concourseRelease);

      // Desired gate inflow to clear outside crowd
      const potentialGateInflow = Math.min(totalOutsideWaiting, gateCapacityThisMinute);

      // Portion of gate inflow that can go directly to platform
      const admittedDirectToPlatform = Math.min(potentialGateInflow, remainingRoomOnPlatform);
      concourseToPlatform += admittedDirectToPlatform;

      // Excess gate inflow that must be held in concourse
      const excessInflow = potentialGateInflow - admittedDirectToPlatform;
      const roomInConcourse = Math.max(0, concourseHoldingMax - concourseHeld);
      const heldInConcourse = Math.min(excessInflow, roomInConcourse);
      concourseHeld += heldInConcourse;

      // Gate metering: if concourse is also full, turnstiles hold remaining passengers outside
      const actualGateInflow = admittedDirectToPlatform + heldInConcourse;
      gateInflow = actualGateInflow;
      outsideQueue = totalOutsideWaiting - actualGateInflow;
    } else {
      // Baseline behavior: all gate inflow flows directly to platform (or static holdRatePerMin)
      gateInflow = Math.min(totalOutsideWaiting, gateCapacityThisMinute);
      outsideQueue = totalOutsideWaiting - gateInflow;

      if (holdRatePerMin > 0) {
        const holdAmount = Math.min(gateInflow, holdRatePerMin);
        concourseHeld += holdAmount;
        concourseToPlatform = gateInflow - holdAmount;
      } else if (concourseHeld > 0) {
        const releaseRate = 150;
        const released = Math.min(concourseHeld, releaseRate);
        concourseHeld -= released;
        concourseToPlatform = gateInflow + released;
      } else {
        concourseToPlatform = gateInflow;
      }
    }

    // Inflow arrives at platform
    platformOccupancy += concourseToPlatform;

    // 4. Train Arrival & Boarding
    trainTimeAccumulator += 1.0;
    let trainArrived = false;
    let boardedThisMinute = 0;

    // Check if train arrives at this minute
    if (trainTimeAccumulator >= currentHeadway - 0.0001) {
      trainArrived = true;
      totalTrainsArrived += 1;
      trainTimeAccumulator -= currentHeadway;

      // Passengers board arriving train
      boardedThisMinute = Math.min(platformOccupancy, effectiveBoardingCapacity);
      platformOccupancy -= boardedThisMinute;
      totalBoarded += boardedThisMinute;
    }

    // 5. Metrics & Risk Classification
    const platformDensityRatio = platformCapacitySafe > 0 
      ? platformOccupancy / platformCapacitySafe 
      : 0;

    // Platform risk level (Spec Section 7):
    // Green (< 70%), Amber (70-100%), Red (> 100%)
    let platformRisk = 'green';
    if (platformDensityRatio > APP_CONFIG.thresholds.platform.safeMaxRatio) {
      platformRisk = 'red';
      redMinutesPlatform += 1;
    } else if (platformDensityRatio >= APP_CONFIG.thresholds.platform.warningRatio) {
      platformRisk = 'amber';
    }

    // Outside queue wait time estimate in minutes
    const queueWaitTimeMin = gateCapacityThisMinute > 0 
      ? Math.ceil(outsideQueue / gateCapacityThisMinute) 
      : 0;

    // Queue risk level (Spec Section 7 & 10):
    // Green (< 10 min), Amber (10-20 min), Red (> 20 min)
    let queueRisk = 'green';
    if (queueWaitTimeMin > APP_CONFIG.thresholds.outsideQueueWait.criticalMinutes) {
      queueRisk = 'red';
      redMinutesQueue += 1;
    } else if (queueWaitTimeMin >= APP_CONFIG.thresholds.outsideQueueWait.warningMinutes) {
      queueRisk = 'amber';
    }

    // Overall combined risk
    let overallRisk = 'green';
    if (platformRisk === 'red' || queueRisk === 'red') {
      overallRisk = 'red';
      totalRedMinutes += 1;
    } else if (platformRisk === 'amber' || queueRisk === 'amber') {
      overallRisk = 'amber';
      totalAmberMinutes += 1;
    } else {
      totalGreenMinutes += 1;
    }

    // Peak tracking
    if (platformOccupancy > peakPlatformOccupancy) {
      peakPlatformOccupancy = platformOccupancy;
      peakPlatformTime = timeStr;
      peakPlatformMinute = t;
    }

    if (outsideQueue > maxOutsideQueue) {
      maxOutsideQueue = outsideQueue;
      maxQueueTime = timeStr;
    }

    if (queueWaitTimeMin > maxQueueWaitMin) {
      maxQueueWaitMin = queueWaitTimeMin;
    }

    if (concourseHeld > maxConcourseHeld) {
      maxConcourseHeld = concourseHeld;
    }

    timeline.push({
      minuteOffset: t,
      timeStr,
      demandArrivals,
      outsideQueue,
      gateCapacity: gateCapacityThisMinute,
      gateInflow,
      concourseHeld,
      concourseToPlatform,
      platformOccupancy,
      trainArrived,
      headwayMin: currentHeadway,
      gatesOpen: activeGatesOpen,
      boarded: boardedThisMinute,
      platformCapacitySafe,
      platformDensityRatio: Number(platformDensityRatio.toFixed(3)),
      platformRisk,
      queueWaitTimeMin,
      queueRisk,
      overallRisk
    });
  }

  // Calculate crowd clearance time (when queue clears and platform drops to <= 200 passengers)
  let clearanceMinute = endOffset;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const step = timeline[i];
    if (step.outsideQueue > 20 || step.platformOccupancy > 200) {
      clearanceMinute = Math.min(endOffset, step.minuteOffset + 1);
      break;
    }
  }
  const clearanceClockTime = formatClockTime(endTime, clearanceMinute);

  const peakPlatformRatio = platformCapacitySafe > 0 
    ? Number((peakPlatformOccupancy / platformCapacitySafe).toFixed(3)) 
    : 0;

  return {
    scenarioId: eventInput.id || 'custom',
    scenarioName: eventInput.name || 'Custom Event',
    eventSummary: {
      attendance: eventInput.attendance,
      metroSharePct,
      totalMetroPassengers,
      endTime,
      weather: eventInput.weather || 'normal'
    },
    assumptionsUsed: {
      gatesOpenBaseline,
      gateThroughputPerMin,
      platformCapacitySafe,
      trainCapacity,
      baselineHeadwayMin,
      throughPassengerRatio,
      effectiveBoardingCapacity
    },
    summaryMetrics: {
      peakPlatformOccupancy,
      peakPlatformRatio,
      peakPlatformPercentage: Math.round(peakPlatformRatio * 100),
      peakPlatformTime,
      peakPlatformMinute,
      maxOutsideQueue,
      maxQueueWaitMin,
      maxQueueTime,
      maxConcourseHeld,
      redMinutesPlatform,
      redMinutesQueue,
      totalRedMinutes,
      totalAmberMinutes,
      totalGreenMinutes,
      totalTrainsArrived,
      totalPassengersBoarded: totalBoarded,
      clearanceMinute,
      clearanceMinutesFromEventEnd: clearanceMinute,
      clearanceClockTime,
      isPlatformBreached: redMinutesPlatform > 0,
      isQueueBreached: redMinutesQueue > 0
    },
    timeline
  };
}

/**
 * Convenience wrapper: runs baseline simulation without interventions
 * 
 * @param {object} eventInput 
 * @param {object} stationAssumptions 
 * @returns {object} Baseline simulation result
 */
export function runBaselineSimulation(eventInput, stationAssumptions) {
  return runSimulation(eventInput, stationAssumptions, {});
}
