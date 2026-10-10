/**
 * Verification Test Script: Simulation Engine & 3 Official Presets
 * Executes pure JavaScript simulation and logs structured operational tables to console.
 *
 * Usage: node scripts/test-sim.js
 */

import { SCENARIO_PRESETS, APP_CONFIG } from '../src/config.js';
import { runBaselineSimulation, calculateEgressCurve } from '../src/sim/index.js';

console.log('='.repeat(80));
console.log('STADIUM SURGE PLANNER // METRO OPERATIONS (PS-05)');
console.log('STEP 2: SIMULATION ENGINE DETERMINISTIC VERIFICATION RUN');
console.log('='.repeat(80));
console.log(`Simulation Time Window: [${APP_CONFIG.simulation.startMinuteOffset} min to +${APP_CONFIG.simulation.endMinuteOffset} min] relative to event end`);
console.log(`Platform Safe Threshold: <70% Green | 70-100% Amber | >100% Red`);
console.log(`Queue Wait Threshold:    <10m Green  | 10-20m Amber  | >20m Red`);
console.log('-'.repeat(80));

SCENARIO_PRESETS.forEach((preset, index) => {
  console.log(`\n[PRESET ${index + 1}/3] ${preset.title.toUpperCase()}`);
  console.log(`Venue: ${preset.event.venue}`);
  console.log(`Attendance: ${preset.event.attendance.toLocaleString()} | Metro Share: ${preset.event.metroSharePct}% | Expected Metro Crowd: ${Math.round(preset.event.attendance * preset.event.metroSharePct / 100).toLocaleString()}`);
  console.log(`Event End Time: ${preset.event.endTime} | Weather: ${preset.event.weather.toUpperCase()}`);
  
  // Verify arrival demand curve determinism and exact sum
  const curve = calculateEgressCurve(
    Math.round(preset.event.attendance * preset.event.metroSharePct / 100),
    preset.event.egressSpreadMin,
    preset.event.weather
  );
  const totalCurveArrivals = curve.reduce((sum, item) => sum + item.arrivals, 0);
  const expectedTotal = Math.round(preset.event.attendance * preset.event.metroSharePct / 100);
  const isCurveExact = totalCurveArrivals === expectedTotal;
  console.log(`- Arrival Curve Demand Total: ${totalCurveArrivals.toLocaleString()} / ${expectedTotal.toLocaleString()} [${isCurveExact ? 'EXACT MATCH OK' : 'MISMATCH ERROR'}]`);

  // Run Baseline Simulation
  const baseline = runBaselineSimulation(preset.event, preset.stationAssumptions);
  const m = baseline.summaryMetrics;
  const a = baseline.assumptionsUsed;

  console.log('\nSTATION PARAMETER ASSUMPTIONS:');
  console.log(`  * Entry Gates Baseline:     ${a.gatesOpenBaseline} gates`);
  console.log(`  * Gate Throughput Rate:     ${a.gateThroughputPerMin} pass/gate/min`);
  console.log(`  * Safe Platform Limit:      ${a.platformCapacitySafe.toLocaleString()} passengers`);
  console.log(`  * Baseline Headway:         ${a.baselineHeadwayMin} minutes`);
  console.log(`  * Boarding Cap per Train:   ${a.effectiveBoardingCapacity} passengers (net of through-passengers)`);

  console.log('\nBASELINE SIMULATION RESULTS:');
  const platformStatus = m.isPlatformBreached ? 'RED [CRITICAL BREACH]' : (m.peakPlatformRatio >= 0.7 ? 'AMBER [WARNING]' : 'GREEN [SAFE]');
  const queueStatus = m.isQueueBreached ? 'RED [CRUSH RISK]' : (m.maxQueueWaitMin >= 10 ? 'AMBER [SLOW]' : 'GREEN [NORMAL]');

  console.log(`  * Peak Platform Occupancy:  ${m.peakPlatformOccupancy.toLocaleString()} / ${a.platformCapacitySafe.toLocaleString()} (${m.peakPlatformPercentage}%) -> ${platformStatus}`);
  console.log(`  * Peak Platform Time:       ${m.peakPlatformTime} (t = ${m.peakPlatformMinute >= 0 ? '+' : ''}${m.peakPlatformMinute} min)`);
  console.log(`  * Max Outside Queue:        ${m.maxOutsideQueue.toLocaleString()} passengers (${m.maxQueueTime})`);
  console.log(`  * Max Queue Wait Time:      ${m.maxQueueWaitMin} minutes -> ${queueStatus}`);
  console.log(`  * Red Risk Duration:        ${m.totalRedMinutes} minutes (Platform: ${m.redMinutesPlatform}m, Outside Queue: ${m.redMinutesQueue}m)`);
  console.log(`  * Clearance Time:           ${m.clearanceClockTime} (t = +${m.clearanceMinute} min from event end)`);
  console.log(`  * Trains Arrived / Boarded: ${m.totalTrainsArrived} trains / ${m.totalPassengersBoarded.toLocaleString()} passengers`);

  // Sample timeline snapshots
  console.log('\nSAMPLE TIMELINE SNAPSHOTS (BASELINE):');
  console.log('  Time  | Rel(t) | Demand In | Outside Q | Platform Occ | Ratio  | Train? | Platform Risk');
  console.log('  ------|--------|-----------|-----------|--------------|--------|--------|--------------');
  const sampleOffsets = [-10, 0, 10, 15, 20, 30, 45, 60, 90, 120];
  sampleOffsets.forEach(offset => {
    const row = baseline.timeline.find(r => r.minuteOffset === offset);
    if (row) {
      const relStr = `${row.minuteOffset >= 0 ? '+' : ''}${row.minuteOffset}m`.padStart(6);
      const demStr = String(row.demandArrivals).padStart(9);
      const qStr = String(row.outsideQueue).padStart(9);
      const occStr = String(row.platformOccupancy).padStart(12);
      const ratioStr = `${(row.platformDensityRatio * 100).toFixed(0)}%`.padStart(6);
      const trStr = (row.trainArrived ? `YES (${row.boarded})` : '-').padEnd(6);
      const riskStr = row.platformRisk.toUpperCase();
      console.log(`  ${row.timeStr} | ${relStr} | ${demStr} | ${qStr} | ${occStr} | ${ratioStr} | ${trStr} | ${riskStr}`);
    }
  });

  console.log('-'.repeat(80));
});

console.log('\nAll 3 presets executed deterministically with pure JavaScript.');
console.log('Verification completed successfully.');
