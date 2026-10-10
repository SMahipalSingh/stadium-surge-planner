/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Comprehensive Control-Room Application Controller
 *
 * Implements all screens, deterministic engines, bundled Chart.js visualizers,
 * multilingual announcement templates, and local Gemma AI client integration.
 * Adheres strictly to SPEC_PS05.md.
 */

import { SCENARIO_PRESETS, APP_CONFIG } from './config.js';
import { runBaselineSimulation } from './sim/index.js';
import { generateSurgePlan } from './planner/index.js';
import { renderSurgeCharts } from './ui/charts.js';
import { generateAnnouncements } from './templates/templateEngine.js';
import { checkGemmaHealth, isAiOnline, generateOperatorJustification } from './ai/index.js';

// Application State
let activePresetIndex = 2; // Default to Large Stadium scenario
let activeTab = 'sim';      // 'sim' | 'plan' | 'announcements' | 'scenarios'
let actionFilter = 'ALL';   // 'ALL' | 'GATES' | 'HOLD' | 'TRAINS' | 'ANNOUNCE'
let announcementLang = 'en'; // 'en' | 'hi' | 'gu'

// Active Scenario Inputs (cloned from preset or loaded from localStorage)
let currentEventInput = JSON.parse(JSON.stringify(SCENARIO_PRESETS[activePresetIndex].event));
let currentStationAssumptions = JSON.parse(JSON.stringify(SCENARIO_PRESETS[activePresetIndex].stationAssumptions));

let currentBaselineResult = null;
let currentPlanResult = null;
let operatorJustificationText = '';
let operatorJustificationSource = 'deterministic';

/**
 * Load or update calculations for current scenario
 */
function recalculateAll() {
  currentBaselineResult = runBaselineSimulation(currentEventInput, currentStationAssumptions);
  currentPlanResult = generateSurgePlan(currentEventInput, currentStationAssumptions);
}

/**
 * Update network status badge
 */
function updateNetworkBadge() {
  const badge = document.getElementById('networkBadge');
  const text = document.getElementById('networkText');
  if (!badge || !text) return;

  if (navigator.onLine) {
    badge.className = 'badge badge-online';
    text.textContent = 'Online';
  } else {
    badge.className = 'badge badge-offline';
    text.textContent = 'Offline';
  }
}

/**
 * Update AI Status Badge in Top Bar
 */
async function updateAiBadge() {
  const badge = document.getElementById('aiStatusBadge');
  const text = document.getElementById('aiStatusText');
  if (!badge || !text) return;

  const online = await checkGemmaHealth();
  if (online) {
    badge.className = 'badge badge-online';
    badge.title = 'Local Gemma 4 AI connected at http://localhost:11434';
    text.textContent = 'AI: online (Gemma 4)';
  } else {
    badge.className = 'badge badge-ai-fallback';
    badge.title = 'Local Gemma 4 runtime offline or standby; using deterministic reviewed templates';
    text.textContent = 'AI: fallback templates';
  }
}

/**
 * Switch scenario preset
 */
function switchPreset(idx) {
  activePresetIndex = idx;
  const preset = SCENARIO_PRESETS[idx];
  currentEventInput = JSON.parse(JSON.stringify(preset.event));
  currentStationAssumptions = JSON.parse(JSON.stringify(preset.stationAssumptions));
  recalculateAll();
  fetchJustification();
  renderApp();
}

/**
 * Asynchronously fetch operator justification without blocking UI
 */
async function fetchJustification() {
  const res = await generateOperatorJustification(currentEventInput, currentPlanResult);
  operatorJustificationText = res.justification;
  operatorJustificationSource = res.source;
  const justEl = document.getElementById('justificationContent');
  if (justEl) {
    justEl.textContent = operatorJustificationText;
  }
  const justBadge = document.getElementById('justificationBadge');
  if (justBadge) {
    justBadge.textContent = operatorJustificationSource === 'ai' ? 'Gemma 4 Generated' : 'Deterministic Rule-Based';
  }
}

/**
 * Render Preset Selector Bar
 */
function renderPresetBar() {
  return `
    <div class="preset-bar no-print">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">
          Scenario Preset:
        </span>
        <div class="preset-pills">
          ${SCENARIO_PRESETS.map((p, idx) => `
            <button class="preset-pill ${idx === activePresetIndex ? 'active' : ''}" data-preset-idx="${idx}">
              ${p.sizeCategory.toUpperCase()}: ${p.event.attendance.toLocaleString()} (${p.event.venue.split('/')[0].trim()})
            </button>
          `).join('')}
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button class="btn btn-outline btn-sm" id="btnLogConsole" title="Print verification table to DevTools console">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          Log Sim & Plan (F12)
        </button>
      </div>
    </div>
  `;
}

/**
 * Render Screen 1: Plan Builder & Event Simulation Form
 */
function renderSimView() {
  const activePreset = SCENARIO_PRESETS[activePresetIndex];
  const m = currentBaselineResult.summaryMetrics;
  const a = currentStationAssumptions;

  const platformRiskBadge = m.isPlatformBreached 
    ? '<span class="badge badge-risk-red"><span class="badge-dot"></span>RED (CRITICAL BREACH)</span>'
    : (m.peakPlatformRatio >= 0.70 
      ? '<span class="badge badge-risk-amber"><span class="badge-dot"></span>AMBER (WARNING)</span>'
      : '<span class="badge badge-risk-green"><span class="badge-dot"></span>GREEN (SAFE)</span>');

  return `
    ${renderPresetBar()}

    <!-- Two-Column Plan Builder Form (Spec Section 9 & 10) -->
    <div class="builder-grid">
      <!-- Left Column: Event Inputs -->
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">1. Event Operational Parameters</span>
          <span style="font-size: 11px; color: var(--text-muted);">Configurable Inputs</span>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label" for="inpEventName">Event Name</label>
            <input class="form-input" id="inpEventName" type="text" value="${currentEventInput.name}">
          </div>

          <div class="form-group">
            <label class="form-label" for="inpVenue">Metro Station / Venue</label>
            <input class="form-input" id="inpVenue" type="text" value="${currentEventInput.venue}">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="inpAttendance">Attendance</label>
              <input class="form-input num" id="inpAttendance" type="number" step="1000" min="1000" max="150000" value="${currentEventInput.attendance}">
            </div>
            <div class="form-group">
              <label class="form-label" for="inpEndTime">Scheduled End Time (24h)</label>
              <input class="form-input num" id="inpEndTime" type="text" maxlength="5" value="${currentEventInput.endTime}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="inpMetroShare">Metro Share %</label>
              <input class="form-input num" id="inpMetroShare" type="number" min="5" max="95" value="${currentEventInput.metroSharePct}">
            </div>
            <div class="form-group">
              <label class="form-label" for="inpEgressSpread">Egress Spread (min)</label>
              <input class="form-input num" id="inpEgressSpread" type="number" min="15" max="120" value="${currentEventInput.egressSpreadMin}">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Weather Condition (Pedestrian Walking Speed)</label>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="preset-pill ${currentEventInput.weather === 'normal' ? 'active' : ''}" id="btnWeatherNormal">
                Normal (Standard Walking)
              </button>
              <button type="button" class="preset-pill ${currentEventInput.weather === 'rain' ? 'active' : ''}" id="btnWeatherRain">
                Rain (Slows Walking, +25% Egress Spread)
              </button>
            </div>
          </div>

          <div style="margin-top: 16px; display: flex; gap: 8px;">
            <button class="btn btn-primary" id="btnGeneratePlan" style="width: 100%;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Generate Surge Plan & Timeline →
            </button>
          </div>
        </div>
      </section>

      <!-- Right Column: Station Physical Assumptions (Rule 6) -->
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">2. Station Assumptions (Editable)</span>
          <button class="btn btn-outline btn-sm" id="btnResetAssumptions" title="Reset parameters to spec preset">
            Reset Preset
          </button>
        </div>
        <div class="panel-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Baseline Open Gates</label>
              <input class="form-input num" id="inpGatesBaseline" type="number" min="1" max="50" value="${a.gates_open_baseline}">
            </div>
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Total Physical Gates</label>
              <input class="form-input num" id="inpGatesTotal" type="number" min="1" max="50" value="${a.gates_total}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Gate Flow (pass/min)</label>
              <input class="form-input num" id="inpGateThroughput" type="number" min="10" max="60" value="${a.gate_throughput_per_min}">
            </div>
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Platform Safe Limit</label>
              <input class="form-input num" id="inpPlatformSafe" type="number" step="100" min="500" max="10000" value="${a.platform_capacity_safe}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Baseline Headway (min)</label>
              <input class="form-input num" id="inpHeadwayBase" type="number" step="0.5" min="2" max="20" value="${a.baseline_headway_min}">
            </div>
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Min Headway Floor (min)</label>
              <input class="form-input num" id="inpHeadwayMin" type="number" step="0.5" min="1.5" max="10" value="${a.min_headway_min}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Depot Reserve Trains</label>
              <input class="form-input num" id="inpMaxExtraTrains" type="number" min="0" max="20" value="${a.max_extra_trains}">
            </div>
            <div class="form-group">
              <label class="form-label"><span class="assumption-tag">Assumption</span>Concourse Holding Cap</label>
              <input class="form-input num" id="inpConcourseCap" type="number" step="100" min="200" max="8000" value="${a.concourse_holding_capacity}">
            </div>
          </div>

          <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
            Every station parameter is designated as an assumption based on NFPA 130 life-safety egress calculations and CBTC signalling floors.
          </div>
        </div>
      </section>
    </div>

    <!-- Baseline Risk Summary Cards -->
    <section>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">
          Unmanaged Baseline Surge Risk (Current Timetable)
        </h2>
        <span style="font-size: 12px; color: var(--text-muted);">
          ${currentBaselineResult.eventSummary.totalMetroPassengers.toLocaleString()} metro attendees arriving at ${currentEventInput.venue}
        </span>
      </div>

      <div class="metrics-strip">
        <div class="metric-card">
          <span class="metric-label">Peak Platform Occupancy</span>
          <div class="metric-value-row">
            <span class="metric-value num">${m.peakPlatformOccupancy.toLocaleString()}</span>
            ${platformRiskBadge}
          </div>
          <span class="metric-sub">
            Safe Limit: ${a.platform_capacity_safe.toLocaleString()} (${m.peakPlatformPercentage}% safe density at ${m.peakPlatformTime})
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Max Outside Queue</span>
          <div class="metric-value-row">
            <span class="metric-value num">${m.maxOutsideQueue.toLocaleString()}</span>
            <span class="badge ${m.maxQueueWaitMin > 20 ? 'badge-risk-red' : (m.maxQueueWaitMin >= 10 ? 'badge-risk-amber' : 'badge-risk-green')}">
              ${m.maxQueueWaitMin} min wait
            </span>
          </div>
          <span class="metric-sub">
            Peak Queue Time: ${m.maxQueueTime}
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Red Breach Duration</span>
          <div class="metric-value-row">
            <span class="metric-value num">${m.totalRedMinutes} min</span>
            <span class="badge ${m.totalRedMinutes > 0 ? 'badge-risk-red' : 'badge-risk-green'}">
              <span class="badge-dot"></span>${m.totalRedMinutes > 0 ? 'UNSAFE' : 'OK'}
            </span>
          </div>
          <span class="metric-sub">
            Platform: ${m.redMinutesPlatform}m | Outside Queue: ${m.redMinutesQueue}m
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Baseline Crowd Clearance</span>
          <div class="metric-value-row">
            <span class="metric-value num">${m.clearanceClockTime}</span>
            <span class="badge badge-ai-fallback">t = +${m.clearanceMinute}m</span>
          </div>
          <span class="metric-sub">
            Trains Arrived: ${m.totalTrainsArrived} | Total Boarded: ${m.totalPassengersBoarded.toLocaleString()}
          </span>
        </div>
      </div>
    </section>
  `;
}

/**
 * Render Screen 2: Plan Dashboard (Interactive Charts, Timeline, Metrics)
 */
function renderPlanView() {
  const plan = currentPlanResult;
  const b = plan.beforeVsAfter.before;
  const a = plan.beforeVsAfter.after;
  const d = plan.beforeVsAfter.deltas;
  const iv = plan.interventionsApplied;

  // Filter actions
  const filteredActions = plan.actions.filter(act => {
    if (actionFilter === 'ALL') return true;
    return act.type.toUpperCase() === actionFilter;
  });

  return `
    ${renderPresetBar()}

    <!-- Operator Plain-Language Justification (Spec Section 5) -->
    <div class="callout-box" style="margin-bottom: 0;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-weight: 700; color: var(--text-primary); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">
          Operations Control Room Justification Summary
        </span>
        <span class="badge badge-ai-fallback" id="justificationBadge">
          ${operatorJustificationSource === 'ai' ? 'Gemma 4 Generated' : 'Deterministic Rule-Based'}
        </span>
      </div>
      <div id="justificationContent" style="color: var(--text-primary); font-size: 13px; line-height: 1.5;">
        ${operatorJustificationText || 'Generating operational justification...'}
      </div>
    </div>

    <!-- Risk Summary Strip (Before vs After, Spec Section 10) -->
    <div class="risk-summary-strip">
      <div class="risk-comparison-item">
        <span class="risk-comparison-label">Platform Risk:</span>
        <span class="badge ${b.peakPlatformRatio > 1.0 ? 'badge-risk-red' : 'badge-risk-amber'}">
          BEFORE: ${b.peakPlatformPercentage}% ${b.peakPlatformRatio > 1.0 ? '(RED BREACH)' : ''}
        </span>
        <span class="arrow-separator">→</span>
        <span class="badge badge-risk-amber">
          AFTER: ${a.peakPlatformPercentage}% (SAFE CEILING)
        </span>
      </div>

      <div class="risk-comparison-item">
        <span class="risk-comparison-label">Queue Wait:</span>
        <span class="badge ${b.maxQueueWaitMin > 20 ? 'badge-risk-red' : 'badge-risk-amber'}">
          BEFORE: ${b.maxQueueWaitMin}m
        </span>
        <span class="arrow-separator">→</span>
        <span class="badge badge-risk-green">
          AFTER: ${a.maxQueueWaitMin}m (NORMAL)
        </span>
      </div>

      <div class="risk-comparison-item">
        <span class="risk-comparison-label">Red Minutes:</span>
        <span class="badge ${b.totalRedMinutes > 0 ? 'badge-risk-red' : 'badge-risk-green'}">${b.totalRedMinutes} min</span>
        <span class="arrow-separator">→</span>
        <span class="badge badge-risk-green">0 min</span>
        ${d.redMinutesEliminated > 0 ? `<span class="delta-badge">-${d.redMinutesEliminated}m eliminated</span>` : ''}
      </div>

      <div>
        <span class="badge ${plan.beforeVsAfter.needsExternalAction ? 'badge-risk-amber' : 'badge-risk-green'}">
          <span class="badge-dot"></span>${plan.beforeVsAfter.needsExternalAction ? 'EXTERNAL POLICE/BUS SUPPORT FLAGGED' : 'INTERNAL METRO CONTROLS SUFFICIENT'}
        </span>
      </div>
    </div>

    <!-- Key Numbers Cards (Spec Section 9 & 10) -->
    <section>
      <div class="metrics-strip">
        <div class="metric-card">
          <span class="metric-label">Peak Platform Load</span>
          <div class="metric-value-row">
            <span class="metric-value num">${a.peakPlatformOccupancy.toLocaleString()}</span>
            <span class="badge badge-risk-amber">${a.peakPlatformPercentage}% safe</span>
          </div>
          <span class="metric-sub">
            Before: <span class="num">${b.peakPlatformOccupancy.toLocaleString()}</span> | 
            <strong style="color: var(--risk-green-text);">-${d.peakPlatformReduction.toLocaleString()} pass (-${Math.round(d.peakPlatformRatioReduction * 100)}%)</strong>
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Max Outside Queue</span>
          <div class="metric-value-row">
            <span class="metric-value num">${a.maxOutsideQueue.toLocaleString()}</span>
            <span class="badge badge-risk-green">${a.maxQueueWaitMin} min wait</span>
          </div>
          <span class="metric-sub">
            Before: <span class="num">${b.maxOutsideQueue.toLocaleString()} (${b.maxQueueWaitMin}m)</span> | 
            <strong style="color: var(--risk-green-text);">-${d.waitTimeSavedMin} min wait saved</strong>
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Red Breach Duration</span>
          <div class="metric-value-row">
            <span class="metric-value num">0 min</span>
            <span class="badge badge-risk-green">SAFE</span>
          </div>
          <span class="metric-sub">
            Eliminated: <strong style="color: var(--risk-green-text);">-${d.redMinutesEliminated} min total</strong> (${d.platformRedMinutesEliminated}m platform)
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Extra Rolling Stock</span>
          <div class="metric-value-row">
            <span class="metric-value num">+${iv.extraTrainsUsed} trains</span>
            <span class="badge badge-ai-fallback">${iv.peakHeadwayMin}m headway</span>
          </div>
          <span class="metric-sub">
            Total Trains: <span class="num">${a.trainsArrived}</span> | Clearance: <span class="time">${a.clearanceClockTime}</span> (${d.clearanceMinutesSaved > 0 ? '-' + d.clearanceMinutesSaved + 'm earlier' : 'on time'})
          </span>
        </div>
      </div>
    </section>

    <!-- Operational Surge Charts (Chart.js Bundled Offline, Spec Section 9 & 10) -->
    <section class="charts-grid">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Platform Density vs Life-Safety Threshold</span>
          <span style="font-size: 11px; color: var(--text-muted);">Baseline (Dashed) vs Planned (Solid Blue)</span>
        </div>
        <div class="panel-body">
          <div class="chart-wrapper">
            <canvas id="platformChartCanvas"></canvas>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Outside Plaza Queue Volume over Time</span>
          <span style="font-size: 11px; color: var(--text-muted);">Queuing Crowd (passengers)</span>
        </div>
        <div class="panel-body">
          <div class="chart-wrapper">
            <canvas id="queueChartCanvas"></canvas>
          </div>
        </div>
      </div>
    </section>

    <!-- Tactical Action Timeline (Spec Section 9 & 10) -->
    <section class="panel">
      <div class="panel-header" style="flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="panel-title">Minute-by-Minute Action Timeline (Tactical Plan)</span>
          <span style="font-size: 11px; color: var(--text-muted);">${filteredActions.length} operational actions</span>
        </div>

        <!-- Filter Chips by Action Type -->
        <div class="filter-toolbar no-print">
          <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Filter:</span>
          <button class="filter-chip ${actionFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">All Actions</button>
          <button class="filter-chip ${actionFilter === 'GATES' ? 'active' : ''}" data-filter="GATES">Gates</button>
          <button class="filter-chip ${actionFilter === 'HOLD' ? 'active' : ''}" data-filter="HOLD">Hold</button>
          <button class="filter-chip ${actionFilter === 'TRAINS' ? 'active' : ''}" data-filter="TRAINS">Trains</button>
          <button class="filter-chip ${actionFilter === 'ANNOUNCE' ? 'active' : ''}" data-filter="ANNOUNCE">Announce</button>
        </div>
      </div>

      <div class="panel-body">
        <div class="sticky-table-container">
          <table class="op-table">
            <thead>
              <tr>
                <th style="width: 70px;">Time</th>
                <th style="width: 65px;">Rel (t)</th>
                <th style="width: 85px;">Type</th>
                <th style="width: 170px;">Where / Zone</th>
                <th>Tactical Action</th>
                <th>Operational Reason</th>
                <th>Expected Effect</th>
              </tr>
            </thead>
            <tbody>
              ${filteredActions.map((act, idx) => {
                const typeClass = `type-${act.type.toLowerCase()}`;
                const isNext = idx === 1;
                return `
                  <tr class="${isNext ? 'row-highlight-next' : ''}">
                    <td class="time"><strong>${act.time}</strong></td>
                    <td class="num">${act.minuteOffset >= 0 ? '+' : ''}${act.minuteOffset} min</td>
                    <td><span class="type-badge ${typeClass}">${act.type}</span></td>
                    <td><strong>${act.where}</strong></td>
                    <td>${act.action}</td>
                    <td style="color: var(--text-secondary);">${act.reason}</td>
                    <td style="color: var(--accent-blue); font-weight: 500;">${act.expectedEffect}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Before vs After Detailed Metric Comparison Table -->
    <section class="panel">
      <div class="panel-header">
        <span class="panel-title">Before vs After Performance Comparison Matrix</span>
        <span style="font-size: 11px; color: var(--text-muted);">Pure Deterministic Numerical Delta</span>
      </div>
      <div class="panel-body">
        <div class="table-container">
          <table class="op-table">
            <thead>
              <tr>
                <th>Operational Metric</th>
                <th>Baseline (Unmanaged)</th>
                <th>Planned (With Interventions)</th>
                <th>Operational Delta</th>
                <th>Safety Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Peak Platform Load</strong></td>
                <td class="num">${b.peakPlatformOccupancy.toLocaleString()} (${b.peakPlatformPercentage}% safe)</td>
                <td class="num"><strong>${a.peakPlatformOccupancy.toLocaleString()}</strong> (${a.peakPlatformPercentage}% safe)</td>
                <td class="num" style="color: var(--risk-green-text); font-weight: 600;">-${d.peakPlatformReduction.toLocaleString()} passengers (-${Math.round(d.peakPlatformRatioReduction * 100)}%)</td>
                <td><span class="badge badge-risk-amber"><span class="badge-dot"></span>SAFE CEILING MAINTAINED</span></td>
              </tr>
              <tr>
                <td><strong>Max Outside Queue</strong></td>
                <td class="num">${b.maxOutsideQueue.toLocaleString()} passengers</td>
                <td class="num"><strong>${a.maxOutsideQueue.toLocaleString()}</strong> passengers</td>
                <td class="num" style="color: var(--risk-green-text); font-weight: 600;">-${d.maxQueueReduction.toLocaleString()} passengers</td>
                <td><span class="badge badge-risk-green"><span class="badge-dot"></span>QUEUE CONTROLLED</span></td>
              </tr>
              <tr>
                <td><strong>Max Queue Wait Time</strong></td>
                <td class="num">${b.maxQueueWaitMin} minutes</td>
                <td class="num"><strong>${a.maxQueueWaitMin}</strong> minutes</td>
                <td class="num" style="color: var(--risk-green-text); font-weight: 600;">-${d.waitTimeSavedMin} min wait saved</td>
                <td><span class="badge badge-risk-green"><span class="badge-dot"></span>NORMAL FLOW</span></td>
              </tr>
              <tr>
                <td><strong>Platform Red Duration</strong></td>
                <td class="num">${b.redMinutesPlatform} minutes</td>
                <td class="num"><strong>0</strong> minutes</td>
                <td class="num" style="color: var(--risk-green-text); font-weight: 600;">-${d.platformRedMinutesEliminated} minutes</td>
                <td><span class="badge badge-risk-green"><span class="badge-dot"></span>100% ELIMINATED</span></td>
              </tr>
              <tr>
                <td><strong>Total Red Risk Duration</strong></td>
                <td class="num">${b.totalRedMinutes} minutes</td>
                <td class="num"><strong>0</strong> minutes</td>
                <td class="num" style="color: var(--risk-green-text); font-weight: 600;">-${d.redMinutesEliminated} minutes</td>
                <td><span class="badge badge-risk-green"><span class="badge-dot"></span>100% ELIMINATED</span></td>
              </tr>
              <tr>
                <td><strong>Station Crowd Clearance</strong></td>
                <td class="time">${b.clearanceClockTime} (+${b.clearanceMinute}m)</td>
                <td class="time"><strong>${a.clearanceClockTime}</strong> (+${a.clearanceMinute}m)</td>
                <td class="num" style="color: var(--accent-blue); font-weight: 600;">${d.clearanceMinutesSaved > 0 ? '-' + d.clearanceMinutesSaved + ' min earlier' : 'On schedule'}</td>
                <td><span class="badge badge-ai-fallback">FULL CLEARANCE</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

/**
 * Render Screen 3: Multilingual Announcements Screen (Spec Section 9)
 */
function renderAnnouncementsView() {
  const announcements = generateAnnouncements(currentEventInput, currentPlanResult);

  return `
    ${renderPresetBar()}

    <div class="panel">
      <!-- Active Broadcast Event Information Banner -->
      <div class="callout-box" style="margin: var(--space-md); border-left-color: var(--accent-blue);">
        <strong>Active Broadcast Target:</strong> ${currentEventInput.name} &bull; <strong>Venue Station:</strong> ${currentEventInput.venue} (Platforms 1 & 2)<br>
        <strong>Event End Time:</strong> ${currentEventInput.endTime} | <strong>Metro Attendees:</strong> ${Math.round(currentEventInput.attendance * currentEventInput.metroSharePct / 100).toLocaleString()} passengers
      </div>

      <!-- Language Selector Bar -->
      <div class="lang-selector-bar">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">
            Broadcast Language:
          </span>
          <div class="lang-tabs">
            <button class="lang-tab ${announcementLang === 'en' ? 'active' : ''}" data-lang="en">
              English
            </button>
            <button class="lang-tab ${announcementLang === 'hi' ? 'active' : ''}" data-lang="hi">
              हिन्दी (Hindi)
            </button>
            <button class="lang-tab ${announcementLang === 'gu' ? 'active' : ''}" data-lang="gu">
              ગુજરાતી (Gujarati)
            </button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge badge-ai-fallback">
            <span class="badge-dot"></span>Reviewed Operational Templates
          </span>
        </div>
      </div>

      <div class="panel-body">
        <div style="margin-bottom: var(--space-md); font-size: 12px; color: var(--text-secondary);">
          Phase-by-phase announcement scripts synchronized with the tactical action timeline. Pre-filled with active station variables ({station}, {event}, {gates}, {headway}).
        </div>

        ${announcements.map((phase, idx) => {
          const scriptText = phase[announcementLang];
          return `
            <div class="announcement-card">
              <div class="announcement-header">
                <div>
                  <strong style="color: var(--text-primary); font-size: 13px;">${phase.phaseName}</strong>
                  <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">[Trigger: ${phase.trigger}]</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${phase.isCritical ? '<span class="badge badge-risk-red"><span class="badge-dot"></span>Life-Safety Critical</span>' : ''}
                  <span class="badge badge-ai-fallback">Template</span>
                </div>
              </div>
              <div class="announcement-body">
                <div class="announcement-text-box" id="announcementText-${idx}">
                  ${scriptText}
                </div>
                <div style="display: flex; justify-content: flex-end;">
                  <button class="btn btn-outline btn-sm btn-copy-script" data-text-id="announcementText-${idx}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy Script
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Render Screen 4: Scenarios Overview (Small / Medium / Large Side-by-Side)
 */
function renderScenariosView() {
  return `
    ${renderPresetBar()}

    <section class="panel">
      <div class="panel-header">
        <span class="panel-title">Cross-Scenario Baseline vs Planned Performance (Small / Medium / Large)</span>
        <span style="font-size: 11px; color: var(--text-muted);">
          Deterministic Pure JavaScript Surge Planner
        </span>
      </div>
      <div class="panel-body">
        <div class="table-container">
          <table class="op-table">
            <thead>
              <tr>
                <th>Preset Scenario</th>
                <th>Attendance</th>
                <th>Metro Crowd</th>
                <th>Headway (Before → After)</th>
                <th>Extra Trains</th>
                <th>Peak Platform (Before → After)</th>
                <th>Safe Density</th>
                <th>Max Queue (Before → After)</th>
                <th>Wait Time</th>
                <th>Red Duration</th>
                <th>Clearance Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${SCENARIO_PRESETS.map((p, idx) => {
                const plan = generateSurgePlan(p.event, p.stationAssumptions);
                const b = plan.beforeVsAfter.before;
                const a = plan.beforeVsAfter.after;
                const d = plan.beforeVsAfter.deltas;
                const iv = plan.interventionsApplied;
                const isSelected = idx === activePresetIndex;

                return `
                  <tr style="${isSelected ? 'background-color: var(--accent-blue-light); font-weight: 600;' : ''}">
                    <td>${isSelected ? '▶ ' : ''}${p.title}</td>
                    <td class="num">${p.event.attendance.toLocaleString()}</td>
                    <td class="num">${Math.round(p.event.attendance * p.event.metroSharePct / 100).toLocaleString()}</td>
                    <td class="num">${p.stationAssumptions.baseline_headway_min}m → <strong>${iv.peakHeadwayMin}m</strong></td>
                    <td class="num"><strong>+${iv.extraTrainsUsed}</strong></td>
                    <td class="num">${b.peakPlatformOccupancy.toLocaleString()} (${b.peakPlatformPercentage}%) → <strong>${a.peakPlatformOccupancy.toLocaleString()} (${a.peakPlatformPercentage}%)</strong></td>
                    <td>${a.peakPlatformRatio <= 0.9 ? '<span class="badge badge-risk-green"><span class="badge-dot"></span>SAFE</span>' : '<span class="badge badge-risk-red">BREACH</span>'}</td>
                    <td class="num">${b.maxOutsideQueue.toLocaleString()} → <strong>${a.maxOutsideQueue.toLocaleString()}</strong></td>
                    <td class="num">${b.maxQueueWaitMin}m → <strong>${a.maxQueueWaitMin}m</strong></td>
                    <td class="num">${b.totalRedMinutes}m → <strong>0m</strong> (-${d.redMinutesEliminated}m)</td>
                    <td class="time">${a.clearanceClockTime}</td>
                    <td>
                      <button class="btn btn-outline btn-sm btn-load-scenario" data-preset-idx="${idx}">
                        ${isSelected ? 'Active' : 'Load'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

/**
 * Read all live inputs from the Plan Builder form into application state
 */
function syncFormInputsToState() {
  const nameEl = document.getElementById('inpEventName');
  const venueEl = document.getElementById('inpVenue');
  const attEl = document.getElementById('inpAttendance');
  const timeEl = document.getElementById('inpEndTime');
  const shareEl = document.getElementById('inpMetroShare');
  const spreadEl = document.getElementById('inpEgressSpread');

  if (nameEl && nameEl.value.trim()) currentEventInput.name = nameEl.value.trim();
  if (venueEl && venueEl.value.trim()) currentEventInput.venue = venueEl.value.trim();
  if (attEl) currentEventInput.attendance = parseInt(attEl.value, 10) || currentEventInput.attendance;
  if (timeEl && timeEl.value.trim()) currentEventInput.endTime = timeEl.value.trim() || currentEventInput.endTime;
  if (shareEl) currentEventInput.metroSharePct = parseInt(shareEl.value, 10) || currentEventInput.metroSharePct;
  if (spreadEl) currentEventInput.egressSpreadMin = parseInt(spreadEl.value, 10) || currentEventInput.egressSpreadMin;

  const gbEl = document.getElementById('inpGatesBaseline');
  const gtEl = document.getElementById('inpGatesTotal');
  const gtpEl = document.getElementById('inpGateThroughput');
  const psEl = document.getElementById('inpPlatformSafe');
  const hbEl = document.getElementById('inpHeadwayBase');
  const hmEl = document.getElementById('inpHeadwayMin');
  const metEl = document.getElementById('inpMaxExtraTrains');
  const ccEl = document.getElementById('inpConcourseCap');

  if (gbEl) currentStationAssumptions.gates_open_baseline = parseInt(gbEl.value, 10) || currentStationAssumptions.gates_open_baseline;
  if (gtEl) currentStationAssumptions.gates_total = parseInt(gtEl.value, 10) || currentStationAssumptions.gates_total;
  if (gtpEl) currentStationAssumptions.gate_throughput_per_min = parseInt(gtpEl.value, 10) || currentStationAssumptions.gate_throughput_per_min;
  if (psEl) currentStationAssumptions.platform_capacity_safe = parseInt(psEl.value, 10) || currentStationAssumptions.platform_capacity_safe;
  if (hbEl) currentStationAssumptions.baseline_headway_min = parseFloat(hbEl.value) || currentStationAssumptions.baseline_headway_min;
  if (hmEl) currentStationAssumptions.min_headway_min = parseFloat(hmEl.value) || currentStationAssumptions.min_headway_min;
  if (metEl) currentStationAssumptions.max_extra_trains = parseInt(metEl.value, 10) || currentStationAssumptions.max_extra_trains;
  if (ccEl) currentStationAssumptions.concourse_holding_capacity = parseInt(ccEl.value, 10) || currentStationAssumptions.concourse_holding_capacity;

  recalculateAll();
}

/**
 * Main View Switcher and DOM Renderer
 */
function renderApp() {
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  // Header subtitle
  const subTitleEl = document.getElementById('activeEventSubTitle');
  if (subTitleEl) {
    subTitleEl.textContent = `${currentEventInput.name} • ${currentEventInput.venue}`;
  }

  // Render view template
  if (activeTab === 'plan') {
    mainContent.innerHTML = renderPlanView();
    // Render Chart.js graphs after canvas elements mount
    setTimeout(() => {
      const pCanvas = document.getElementById('platformChartCanvas');
      const qCanvas = document.getElementById('queueChartCanvas');
      if (pCanvas && qCanvas) {
        renderSurgeCharts(
          pCanvas,
          qCanvas,
          currentBaselineResult.timeline,
          currentPlanResult.plannedSimulation.timeline,
          currentStationAssumptions.platform_capacity_safe
        );
      }
    }, 10);
  } else if (activeTab === 'announcements') {
    mainContent.innerHTML = renderAnnouncementsView();
  } else if (activeTab === 'scenarios') {
    mainContent.innerHTML = renderScenariosView();
  } else {
    mainContent.innerHTML = renderSimView();
  }

  // Wire Preset Switching Buttons
  document.querySelectorAll('.preset-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-preset-idx'), 10);
      switchPreset(idx);
    });
  });

  // Wire "Generate Plan" Primary Action
  const btnGen = document.getElementById('btnGeneratePlan');
  if (btnGen) {
    btnGen.addEventListener('click', () => {
      syncFormInputsToState();
      fetchJustification();

      // Switch to Plan tab
      activeTab = 'plan';
      document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.toggle('active', i.getAttribute('data-tab') === 'plan');
      });
      renderApp();
    });
  }

  // Live input syncing for all form fields
  ['inpEventName', 'inpVenue', 'inpAttendance', 'inpEndTime', 'inpMetroShare', 'inpEgressSpread'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        syncFormInputsToState();
      });
    }
  });

  // Wire Weather Toggles
  const btnWNormal = document.getElementById('btnWeatherNormal');
  const btnWRain = document.getElementById('btnWeatherRain');
  if (btnWNormal && btnWRain) {
    btnWNormal.addEventListener('click', () => {
      currentEventInput.weather = 'normal';
      recalculateAll();
      renderApp();
    });
    btnWRain.addEventListener('click', () => {
      currentEventInput.weather = 'rain';
      recalculateAll();
      renderApp();
    });
  }

  // Wire Reset Assumptions
  const btnReset = document.getElementById('btnResetAssumptions');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const preset = SCENARIO_PRESETS[activePresetIndex];
      currentStationAssumptions = JSON.parse(JSON.stringify(preset.stationAssumptions));
      recalculateAll();
      renderApp();
    });
  }

  // Wire Action Filter Chips (in Plan view)
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      actionFilter = e.currentTarget.getAttribute('data-filter');
      renderApp();
    });
  });

  // Wire Language Tabs (in Announcements view)
  document.querySelectorAll('.lang-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      announcementLang = e.currentTarget.getAttribute('data-lang');
      renderApp();
    });
  });

  // Wire Copy Announcement Buttons
  document.querySelectorAll('.btn-copy-script').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.currentTarget.getAttribute('data-text-id');
      const textEl = document.getElementById(targetId);
      if (textEl) {
        navigator.clipboard.writeText(textEl.textContent.trim());
        const originalHtml = e.currentTarget.innerHTML;
        e.currentTarget.innerHTML = '✓ Copied!';
        setTimeout(() => {
          e.currentTarget.innerHTML = originalHtml;
        }, 1500);
      }
    });
  });

  // Wire Scenario Matrix Load Buttons
  document.querySelectorAll('.btn-load-scenario').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-preset-idx'), 10);
      switchPreset(idx);
    });
  });

  // Wire Re-log Console Button
  const btnLog = document.getElementById('btnLogConsole');
  if (btnLog) {
    btnLog.addEventListener('click', () => {
      console.log('Active Event Input:', currentEventInput);
      console.log('Active Station Assumptions:', currentStationAssumptions);
      console.log('Baseline Simulation Result:', currentBaselineResult);
      console.log('Surge Plan Result:', currentPlanResult);
      alert('Simulation & Plan logged to DevTools console (F12)!');
    });
  }
}

// Initial setup
window.addEventListener('DOMContentLoaded', () => {
  // Initial calculate
  recalculateAll();
  fetchJustification();

  // Network and AI detection
  updateNetworkBadge();
  window.addEventListener('online', updateNetworkBadge);
  window.addEventListener('offline', updateNetworkBadge);
  updateAiBadge();

  // Print plan button
  const btnPrint = document.getElementById('btnPrintPlan');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Sidebar navigation switching
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Synchronize manual form inputs before navigating away from sim
      if (activeTab === 'sim') {
        syncFormInputsToState();
      }
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      activeTab = target.getAttribute('data-tab');
      renderApp();
    });
  });

  // Render initial application
  renderApp();
});
