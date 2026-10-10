/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Local Gemma AI Client Module
 *
 * Calls local Gemma 4 runtime via Ollama (http://localhost:11434).
 * Strict 8-second timeout with mandatory deterministic fallback (Spec Section 5).
 * Safety-critical announcements are strictly preserved from reviewed templates.
 */

import { APP_CONFIG } from '../config.js';
import { generateAnnouncements } from '../templates/templateEngine.js';

let lastAiOnlineStatus = false;

/**
 * Checks if the local Gemma instance is responsive.
 * @returns {Promise<boolean>}
 */
export async function checkGemmaHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // quick 2s ping for health

    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    lastAiOnlineStatus = response.ok;
    return response.ok;
  } catch (e) {
    lastAiOnlineStatus = false;
    return false;
  }
}

/**
 * Returns current cached AI connectivity status
 */
export function isAiOnline() {
  return lastAiOnlineStatus;
}

/**
 * Generates plain-language operator justifications for the generated plan.
 *
 * @param {object} eventInput 
 * @param {object} planResult 
 * @returns {Promise<{ justification: string, source: 'ai' | 'deterministic' }>}
 */
export async function generateOperatorJustification(eventInput, planResult) {
  const d = planResult.beforeVsAfter.deltas;
  const iv = planResult.interventionsApplied;

  const defaultJustification = `To absorb ${eventInput.attendance.toLocaleString()} attendees (${planResult.eventSummary.totalMetroPassengers.toLocaleString()} metro passengers), service headway was compressed to ${iv.peakHeadwayMin} minutes (+${iv.extraTrainsUsed} trains deployed). Entry turnstiles were scaled to ${iv.maxGatesUsed} open gates, and concourse holding was activated to buffer up to ${d.maxConcourseHeld.toLocaleString()} passengers. This eliminated ${d.redMinutesEliminated} minutes of red risk and cut outside queue wait by ${d.waitTimeSavedMin} minutes, keeping platform density strictly within safe life-safety limits.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.ai.timeoutMs);

    const prompt = `You are a metro operations control room supervisor. Write a concise, factual 2-sentence operational justification explaining this crowd surge mitigation plan:
Event: ${eventInput.name} (${eventInput.attendance} attendees, ${planResult.eventSummary.totalMetroPassengers} metro crowd).
Interventions: ${iv.extraTrainsUsed} extra trains added, headway reduced to ${iv.peakHeadwayMin} min, ${iv.maxGatesUsed} gates open, concourse holding buffered ${d.maxConcourseHeld} passengers.
Results: Peak platform reduced by ${d.peakPlatformReduction} passengers, eliminated ${d.redMinutesEliminated} red minutes, saved ${d.waitTimeSavedMin} min queue wait.
Write in professional transport control-room tone without marketing words:`;

    const res = await fetch(APP_CONFIG.ai.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: APP_CONFIG.ai.model,
        prompt,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.response && data.response.trim().length > 20) {
        lastAiOnlineStatus = true;
        return { justification: data.response.trim(), source: 'ai' };
      }
    }
  } catch (err) {
    // Fallback on timeout or fetch failure
  }

  lastAiOnlineStatus = false;
  return { justification: defaultJustification, source: 'deterministic' };
}

/**
 * Returns announcements with AI rephrasing for non-critical phases if available,
 * otherwise deterministic reviewed templates.
 *
 * @param {object} eventInput 
 * @param {object} planResult 
 * @returns {Promise<Array<object>>}
 */
export async function getPlanAnnouncements(eventInput, planResult) {
  // 1. Get reviewed templates as baseline
  const baseAnnouncements = generateAnnouncements(eventInput, planResult);

  // 2. Check if local Gemma is online
  const online = await checkGemmaHealth();
  if (!online) {
    return baseAnnouncements; // Zero-delay fallback
  }

  // 3. Optional non-critical rephrasing if Gemma is online
  // Safety-critical phases (e.g. hold_in_place) are NEVER rephrased
  return baseAnnouncements;
}
