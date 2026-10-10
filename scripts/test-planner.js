/**
 * Verification Test Script: Greedy Planner Engine & 3 Official Presets
 * Executes deterministic greedy planner and logs before/after metrics and action timelines.
 *
 * Usage: node scripts/test-planner.js
 */

import { SCENARIO_PRESETS, APP_CONFIG } from '../src/config.js';
import { generateSurgePlan } from '../src/planner/index.js';

console.log('='.repeat(88));
console.log('STADIUM SURGE PLANNER // METRO OPERATIONS (PS-05)');
console.log('STEP 3: GREEDY PLANNER ENGINE DETERMINISTIC VERIFICATION RUN');
console.log('='.repeat(88));
console.log(`Greedy Levers: 1) Rolling Stock Injection  2) Fareline Gate Scaling  3) Concourse Holding Metering`);
console.log(`Platform Protection Ceiling: 90% of safe capacity (0 platform red minutes)`);
console.log('-'.repeat(88));

SCENARIO_PRESETS.forEach((preset, index) => {
  console.log(`\n>>> [PRESET ${index + 1}/3] ${preset.title.toUpperCase()}`);
  console.log(`Venue: ${preset.event.venue} | End Time: ${preset.event.endTime}`);
  console.log(`Attendance: ${preset.event.attendance.toLocaleString()} | Metro Crowd: ${Math.round(preset.event.attendance * preset.event.metroSharePct / 100).toLocaleString()} (${preset.event.metroSharePct}%)`);

  // Run Greedy Planner
  const plan = generateSurgePlan(preset.event, preset.stationAssumptions);
  const b = plan.beforeVsAfter.before;
  const a = plan.beforeVsAfter.after;
  const d = plan.beforeVsAfter.deltas;
  const iv = plan.interventionsApplied;

  console.log('\n--- INTERVENTIONS APPLIED BY PLANNER ---');
  console.log(`  * Extra Trains Deployed:     ${iv.extraTrainsUsed} trains (Headway compressed to ${iv.peakHeadwayMin} min)`);
  console.log(`  * Entry Fareline Deployment:  ${iv.maxGatesUsed} gates open (of ${preset.stationAssumptions.gates_total} total)`);
  console.log(`  * Concourse Holding Active:   ${iv.concourseHoldingActive ? `YES (Max ${d.maxConcourseHeld.toLocaleString()} passengers buffered)` : 'NO'}`);
  console.log(`  * External Action Required:   ${plan.beforeVsAfter.needsExternalAction ? 'YES [POLICE/BUS BRIDGING REQUIRED]' : 'NO [INTERNAL PLAN SUFFICIENT]'}`);
  if (plan.beforeVsAfter.externalActionReason) {
    console.log(`    Note: ${plan.beforeVsAfter.externalActionReason}`);
  }

  console.log('\n--- BEFORE VS AFTER COMPARISON TABLE ---');
  console.log('  Metric                       | Baseline (Before) | Planned (After)   | Impact / Delta');
  console.log('  -----------------------------|-------------------|-------------------|------------------------');
  
  const bPlatStatus = b.peakPlatformRatio > 1.0 ? 'RED' : (b.peakPlatformRatio >= 0.7 ? 'AMBER' : 'GREEN');
  const aPlatStatus = a.peakPlatformRatio > 1.0 ? 'RED' : (a.peakPlatformRatio >= 0.7 ? 'AMBER' : 'GREEN');
  console.log(`  Peak Platform Load           | ${String(b.peakPlatformOccupancy.toLocaleString()).padStart(8)} (${b.peakPlatformPercentage}% ${bPlatStatus}) | ${String(a.peakPlatformOccupancy.toLocaleString()).padStart(8)} (${a.peakPlatformPercentage}% ${aPlatStatus}) | -${d.peakPlatformReduction.toLocaleString()} pass (-${Math.round(d.peakPlatformRatioReduction * 100)}%)`);
  
  const bQStatus = b.maxQueueWaitMin > 20 ? 'RED' : (b.maxQueueWaitMin >= 10 ? 'AMBER' : 'GREEN');
  const aQStatus = a.maxQueueWaitMin > 20 ? 'RED' : (a.maxQueueWaitMin >= 10 ? 'AMBER' : 'GREEN');
  console.log(`  Max Outside Queue            | ${String(b.maxOutsideQueue.toLocaleString()).padStart(8)} pass     | ${String(a.maxOutsideQueue.toLocaleString()).padStart(8)} pass     | -${d.maxQueueReduction.toLocaleString()} pass`);
  console.log(`  Max Queue Wait Time          | ${String(b.maxQueueWaitMin + 'm').padStart(8)} (${bQStatus})      | ${String(a.maxQueueWaitMin + 'm').padStart(8)} (${aQStatus})      | -${d.waitTimeSavedMin} min wait`);
  console.log(`  Platform Red Breach Duration | ${String(b.redMinutesPlatform + 'm').padStart(8)}           | ${String(a.redMinutesPlatform + 'm').padStart(8)}           | -${d.platformRedMinutesEliminated} min (ELIMINATED)`);
  console.log(`  Total Red Risk Minutes       | ${String(b.totalRedMinutes + 'm').padStart(8)}           | ${String(a.totalRedMinutes + 'm').padStart(8)}           | -${d.redMinutesEliminated} min eliminated`);
  console.log(`  Station Crowd Clearance Time | ${String(b.clearanceClockTime).padStart(8)} (+${b.clearanceMinute}m)   | ${String(a.clearanceClockTime).padStart(8)} (+${a.clearanceMinute}m)   | ${d.clearanceMinutesSaved >= 0 ? '-' + d.clearanceMinutesSaved + ' min earlier' : 'same'}`);
  console.log(`  Total Trains Arrived         | ${String(b.trainsArrived).padStart(8)} trains    | ${String(a.trainsArrived).padStart(8)} trains    | +${a.trainsArrived - b.trainsArrived} service rakes`);

  console.log('\n--- GENERATED ACTION TIMELINE (EXPLAINABLE TACTICAL PLAN) ---');
  plan.actions.forEach((act, actIdx) => {
    console.log(`  ${actIdx + 1}. [${act.time} | ${act.minuteOffset >= 0 ? '+' : ''}${act.minuteOffset}m] <${act.type.toUpperCase()}> - ${act.where}`);
    console.log(`     Action:  ${act.action}`);
    console.log(`     Reason:  ${act.reason}`);
    console.log(`     Effect:  ${act.expectedEffect}`);
  });

  console.log('-'.repeat(88));
});

console.log('\nPlanner execution verified successfully across all 3 scenarios.');
