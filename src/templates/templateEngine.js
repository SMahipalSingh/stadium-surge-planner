/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Multilingual Announcement Template Engine
 *
 * Deterministic template variable substitution.
 * Guaranteed offline fallback when local Gemma AI is unavailable.
 */

import announcementsData from './announcements.json';

/**
 * Generates parameter-filled announcement scripts across English, Hindi, and Gujarati.
 *
 * @param {object} eventInput - Event details (name, venue, etc.)
 * @param {object} planResult - Generated plan results (interventions, deltas)
 * @returns {Array<object>} List of rendered announcements per phase
 */
export function generateAnnouncements(eventInput, planResult) {
  const stationName = eventInput.venue || 'Stadium Station';
  const eventName = eventInput.name || 'Special Event';
  const venueName = eventInput.venue || 'Stadium Grounds';

  const iv = planResult.interventionsApplied || {};
  const gates = iv.maxGatesUsed || 16;
  const headway = iv.peakHeadwayMin || 3.0;
  const waitMinutes = Math.max(3, Math.min(6, Math.ceil(headway)));

  const variables = {
    '{station}': stationName,
    '{event}': eventName,
    '{venue}': venueName,
    '{gates}': String(gates),
    '{headway}': String(headway),
    '{waitMinutes}': String(waitMinutes),
    '{platform}': 'Platforms 1 & 2'
  };

  function interpolate(text) {
    if (!text) return '';
    let result = text;
    for (const [key, val] of Object.entries(variables)) {
      result = result.replaceAll(key, val);
    }
    return result;
  }

  return announcementsData.phases.map(phase => {
    return {
      id: phase.id,
      phaseName: phase.phaseName,
      trigger: phase.trigger,
      isCritical: phase.isCritical,
      source: 'template', // 'template' | 'ai-rephrased'
      en: interpolate(phase.templates.en),
      hi: interpolate(phase.templates.hi),
      gu: interpolate(phase.templates.gu)
    };
  });
}
