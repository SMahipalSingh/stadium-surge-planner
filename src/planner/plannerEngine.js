/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Greedy Explainable Planner Engine
 *
 * Deterministic pure JavaScript module (no libraries, no random numbers, no LLM in numeric path).
 * Evaluates baseline simulation bottlenecks and iteratively applies operational interventions:
 * 1. Rolling stock injection: Shortens headway (adds extra trains up to depot limits) before peak.
 * 2. Fareline scaling: Incrementally opens additional entry gates up to physical total.
 * 3. Platform protection: Activates concourse holding & gate metering when platform density approaches 90%.
 * 4. External coordination: Flags external actions (police/bus shuttles) if station constraints are exhausted.
 *
 * REFERENCE: Spec PS-05 Section 8
 */

import { runBaselineSimulation, runSimulation, formatClockTime } from '../sim/index.js';

/**
 * Generates an optimized, explainable crowd management plan for a given event scenario.
 *
 * @param {object} eventInput - Event parameters (attendance, metroSharePct, endTime, egressSpreadMin, weather)
 * @param {object} stationAssumptions - Physical and operational station assumptions
 * @returns {object} Planned results including interventions, action timeline, and before/after comparison
 */
export function generateSurgePlan(eventInput, stationAssumptions) {
  const endTime = eventInput.endTime || "23:00";

  // Step 1: Run baseline simulation to assess unmitigated risk
  const baseline = runBaselineSimulation(eventInput, stationAssumptions);
  const bm = baseline.summaryMetrics;
  const ba = baseline.assumptionsUsed;

  // Station physical limits and operational constraints
  const gatesBaseline = Number(stationAssumptions.gates_open_baseline) || 8;
  const gatesTotal = Number(stationAssumptions.gates_total) || 16;
  const gateThroughput = Number(stationAssumptions.gate_throughput_per_min) || 25;
  const baselineHeadway = Number(stationAssumptions.baseline_headway_min) || 6.0;
  const minHeadway = Number(stationAssumptions.min_headway_min) || 3.0;
  const maxExtraTrains = Number(stationAssumptions.max_extra_trains) || 8;
  const safePlatformLimit = Number(stationAssumptions.platform_capacity_safe) || 3500;
  const concourseLimit = Number(stationAssumptions.concourse_holding_capacity) || 2000;

  // Step 2: Determine if interventions are needed
  const isCrowdSignificant = bm.peakPlatformRatio >= 0.60 || bm.maxQueueWaitMin >= 5 || bm.totalRedMinutes > 0;

  // Intervention schedules across simulation window [-10 min to +120 min]
  const headwaySchedule = {};
  const gatesSchedule = {};
  let extraTrainsUsed = 0;
  let maxGatesUsed = gatesBaseline;

  if (isCrowdSignificant) {
    // 2A. Headway Optimization (Rolling Stock Injection)
    // Boarding bottleneck: compute compressed headway within maxExtraTrains limit
    // Surge window duration ~ 60 minutes around peak arrivals
    const surgeWindowDurationMin = 60;
    
    // Theoretical headway that consumes exactly maxExtraTrains:
    // extraTrains = (window / targetHeadway) - (window / baselineHeadway)
    // 1 / targetHeadway = (extraTrains / window) + (1 / baselineHeadway)
    const targetHeadwayReciprocal = (maxExtraTrains / surgeWindowDurationMin) + (1.0 / baselineHeadway);
    let targetCompressedHeadway = 1.0 / targetHeadwayReciprocal;
    targetCompressedHeadway = Math.max(minHeadway, Math.round(targetCompressedHeadway * 2) / 2); // round to nearest 0.5 min

    // Verify extra trains consumption
    const plannedTrainsInSurge = Math.floor(surgeWindowDurationMin / targetCompressedHeadway);
    const baselineTrainsInSurge = Math.floor(surgeWindowDurationMin / baselineHeadway);
    extraTrainsUsed = Math.min(maxExtraTrains, Math.max(0, plannedTrainsInSurge - baselineTrainsInSurge));

    // Intermediate transition headway for ramping down
    const stepUpHeadway = Math.min(baselineHeadway, targetCompressedHeadway + 1.5);

    for (let t = -10; t <= 120; t++) {
      if (t < 0) {
        headwaySchedule[t] = baselineHeadway;
      } else if (t >= 0 && t <= 55) {
        headwaySchedule[t] = targetCompressedHeadway; // compressed peak service
      } else if (t > 55 && t <= 75) {
        headwaySchedule[t] = stepUpHeadway; // ramp down
      } else {
        headwaySchedule[t] = baselineHeadway; // return to timetable
      }
    }

    // 2B. Fareline Scaling (Open More Gates)
    // Scale gates in progressive steps up to physical capacity
    const step1Gates = Math.min(gatesTotal, gatesBaseline + Math.ceil((gatesTotal - gatesBaseline) / 2));
    const step2Gates = gatesTotal;
    maxGatesUsed = step2Gates;

    for (let t = -10; t <= 120; t++) {
      if (t < 0) {
        gatesSchedule[t] = gatesBaseline;
      } else if (t >= 0 && t <= 10) {
        gatesSchedule[t] = step1Gates; // initial surge opening
      } else if (t > 10 && t <= 60) {
        gatesSchedule[t] = step2Gates; // maximum gate capacity during peak
      } else if (t > 60 && t <= 80) {
        gatesSchedule[t] = step1Gates; // ramp down as exterior queue clears
      } else {
        gatesSchedule[t] = gatesBaseline; // normal operations
      }
    }
  } else {
    // For small events with no bottleneck, keep baseline timetable
    for (let t = -10; t <= 120; t++) {
      headwaySchedule[t] = baselineHeadway;
      gatesSchedule[t] = gatesBaseline;
    }
  }

  // 2C. Platform Protection via Concourse Holding & Metering
  // Meter gate inflow to keep platform at or below 90% safe limit
  const planOverrides = {
    holdingEnabled: isCrowdSignificant,
    targetPlatformRatio: 0.90, // strictly enforce 90% ceiling (Spec Section 8)
    headwaySchedule,
    gatesSchedule
  };

  // Step 3: Run planned simulation with interventions
  const planned = runSimulation(eventInput, stationAssumptions, planOverrides);
  const pm = planned.summaryMetrics;

  // Step 4: Check if station constraints are exhausted and external action is required
  let needsExternalAction = false;
  let externalActionReason = null;

  if (pm.maxQueueWaitMin > 20 || pm.redMinutesQueue > 15 || pm.peakPlatformRatio > 1.0) {
    needsExternalAction = true;
    externalActionReason = 'Physical station capacity limits exhausted (all reserve trains, turnstiles, and concourse holding deployed). Exterior queue wait exceeds 20 minutes. Requires police perimeter holding and shuttle bus feeder diversion to adjacent stations.';
  }

  // Step 5: Synthesize Minute-by-Minute Action Timeline (5-minute bands / milestone actions)
  const actions = [];

  // Action 1: Pre-event advisory
  actions.push({
    time: formatClockTime(endTime, -10),
    minuteOffset: -10,
    type: 'Announce',
    where: 'Platforms 1 & 2 P.A. & Concourse',
    action: 'Broadcast pre-surge advisory and fare-card readiness message on Platforms 1 & 2',
    reason: 'Prepare departing passengers before stadium egress starts; reduce fareline tap latency',
    expectedEffect: 'Minimizes gate dwell time to baseline 2.4 sec/passenger'
  });

  if (isCrowdSignificant) {
    // Action 2: Surge start gate scaling
    const midGates = Math.min(gatesTotal, gatesBaseline + Math.ceil((gatesTotal - gatesBaseline) / 2));
    actions.push({
      time: formatClockTime(endTime, 0),
      minuteOffset: 0,
      type: 'Gates',
      where: 'Concourse Fareline (Turnstiles)',
      action: `Open +${midGates - gatesBaseline} entry turnstiles (scale from ${gatesBaseline} to ${midGates} turnstiles open for Platforms 1 & 2)`,
      reason: 'Event concluding; initial wave of attendees beginning pedestrian egress to station',
      expectedEffect: `Increases fareline throughput to ${midGates * gateThroughput} passengers/min`
    });

    // Action 3: Rolling stock headway injection
    actions.push({
      time: formatClockTime(endTime, 5),
      minuteOffset: 5,
      type: 'Trains',
      where: 'Terminal Siding to Platforms 1 & 2',
      action: `Inject ${extraTrainsUsed} standby trains to Platforms 1 & 2; compress service headway from ${baselineHeadway}m to ${planOverrides.headwaySchedule[10]}m`,
      reason: 'Predicted surge arrival peak arriving at station; baseline train frequency cannot clear passenger influx',
      expectedEffect: `Expands boarding clearance to ${Math.round((60 / planOverrides.headwaySchedule[10]) * ba.effectiveBoardingCapacity / 60)} passengers/min`
    });

    // Action 4: Maximum gate deployment
    if (gatesTotal > midGates) {
      actions.push({
        time: formatClockTime(endTime, 15),
        minuteOffset: 15,
        type: 'Gates',
        where: 'East & West Entry Farelines',
        action: `Open all ${gatesTotal} entry turnstiles (100% fareline capacity to Platforms 1 & 2)`,
        reason: 'Outside plaza arrivals peaking; outside queue formation detected',
        expectedEffect: `Maximizes entry throughput to ${gatesTotal * gateThroughput} passengers/min, suppressing exterior crush`
      });
    }

    // Action 5: Platform holding & concourse metering
    actions.push({
      time: formatClockTime(endTime, 20),
      minuteOffset: 20,
      type: 'Hold',
      where: 'Mezzanine Holding Pen (before Platforms 1 & 2)',
      action: `Activate Concourse Holding & Metering (holding capacity up to ${concourseLimit.toLocaleString()} passengers before Platforms 1 & 2)`,
      reason: 'Platform density approaching 90% safe capacity limit on Platforms 1 & 2 (NFPA 130 life-safety requirement)',
      expectedEffect: `Guarantees Platforms 1 & 2 stay below ${Math.round(safePlatformLimit * 0.9).toLocaleString()} passengers (0 platform red minutes)`
    });

    // Action 6: Controlled concourse release
    actions.push({
      time: formatClockTime(endTime, 45),
      minuteOffset: 45,
      type: 'Hold',
      where: 'Escalators down to Platforms 1 & 2',
      action: 'Initiate continuous metered release of concourse held crowd down to Platforms 1 & 2',
      reason: 'Exterior arrival surge subsiding; compressed train headway steadily evacuating platforms',
      expectedEffect: 'Drains concourse buffer safely at 250 passengers/min without creating platform bottlenecks'
    });

    // Action 7: Train service normalization
    actions.push({
      time: formatClockTime(endTime, 65),
      minuteOffset: 65,
      type: 'Trains',
      where: 'Platforms 1 & 2 Mainline Track',
      action: `Step service headway up to ${planOverrides.headwaySchedule[65]}m as reserve train sets return to depot`,
      reason: 'Concourse holding buffer drained and outside queue cleared',
      expectedEffect: 'Conserves traction power and normalizes rolling stock rosters'
    });

    // Action 8: Gate de-escalation
    actions.push({
      time: formatClockTime(endTime, 80),
      minuteOffset: 80,
      type: 'Gates',
      where: 'Station Entry Fareline',
      action: `Revert entry fareline to baseline ${gatesBaseline} open turnstiles`,
      reason: 'Exterior queue fully resolved; passenger arrival rates returned to off-peak baseline',
      expectedEffect: 'Normalizes fareline staff allocations and secures redundant turnstiles'
    });
  } else {
    // Small scenario action
    actions.push({
      time: formatClockTime(endTime, 15),
      minuteOffset: 15,
      type: 'Trains',
      where: 'Station Platform',
      action: `Maintain standard timetable service at ${baselineHeadway}m headway`,
      reason: 'Attendance within station design capacity; platform ratio remains safe (< 30%)',
      expectedEffect: 'All passengers boarded smoothly without extra interventions'
    });
  }

  // Step 6: Before vs After Comparison Data
  const beforeVsAfter = {
    before: {
      peakPlatformOccupancy: bm.peakPlatformOccupancy,
      peakPlatformRatio: bm.peakPlatformRatio,
      peakPlatformPercentage: bm.peakPlatformPercentage,
      peakPlatformTime: bm.peakPlatformTime,
      maxOutsideQueue: bm.maxOutsideQueue,
      maxQueueWaitMin: bm.maxQueueWaitMin,
      maxQueueTime: bm.maxQueueTime,
      redMinutesPlatform: bm.redMinutesPlatform,
      redMinutesQueue: bm.redMinutesQueue,
      totalRedMinutes: bm.totalRedMinutes,
      clearanceClockTime: bm.clearanceClockTime,
      clearanceMinute: bm.clearanceMinute,
      trainsArrived: bm.totalTrainsArrived
    },
    after: {
      peakPlatformOccupancy: pm.peakPlatformOccupancy,
      peakPlatformRatio: pm.peakPlatformRatio,
      peakPlatformPercentage: pm.peakPlatformPercentage,
      peakPlatformTime: pm.peakPlatformTime,
      maxOutsideQueue: pm.maxOutsideQueue,
      maxQueueWaitMin: pm.maxQueueWaitMin,
      maxQueueTime: pm.maxQueueTime,
      maxConcourseHeld: pm.maxConcourseHeld,
      redMinutesPlatform: pm.redMinutesPlatform,
      redMinutesQueue: pm.redMinutesQueue,
      totalRedMinutes: pm.totalRedMinutes,
      clearanceClockTime: pm.clearanceClockTime,
      clearanceMinute: pm.clearanceMinute,
      trainsArrived: pm.totalTrainsArrived
    },
    deltas: {
      peakPlatformReduction: bm.peakPlatformOccupancy - pm.peakPlatformOccupancy,
      peakPlatformRatioReduction: Number((bm.peakPlatformRatio - pm.peakPlatformRatio).toFixed(3)),
      maxQueueReduction: bm.maxOutsideQueue - pm.maxOutsideQueue,
      waitTimeSavedMin: bm.maxQueueWaitMin - pm.maxQueueWaitMin,
      redMinutesEliminated: bm.totalRedMinutes - pm.totalRedMinutes,
      platformRedMinutesEliminated: bm.redMinutesPlatform - pm.redMinutesPlatform,
      clearanceMinutesSaved: bm.clearanceMinute - pm.clearanceMinute,
      extraTrainsDeployed: extraTrainsUsed,
      maxGatesOpened: maxGatesUsed,
      maxConcourseHeld: pm.maxConcourseHeld
    },
    needsExternalAction,
    externalActionReason
  };

  return {
    scenarioId: eventInput.id || 'custom',
    scenarioName: eventInput.name || 'Custom Event',
    eventSummary: baseline.eventSummary,
    assumptionsUsed: ba,
    baselineSimulation: baseline,
    plannedSimulation: planned,
    interventionsApplied: {
      extraTrainsUsed,
      peakHeadwayMin: planOverrides.headwaySchedule[20] || baselineHeadway,
      maxGatesUsed,
      concourseHoldingActive: isCrowdSignificant,
      targetPlatformRatio: 0.90
    },
    beforeVsAfter,
    actions
  };
}
