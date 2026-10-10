/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Bundled Chart.js Visualizations (Offline, No CDN)
 *
 * Renders high-density control-room graphs comparing Baseline vs Planned:
 * 1. Platform Occupancy vs Safe Life-Safety Threshold (with breach zone shading)
 * 2. Outside Queue Volume over Time
 *
 * REFERENCE: Spec PS-05 Section 9 & 10
 */

import { Chart, registerables } from 'chart.js';

// Register Chart.js components locally
Chart.register(...registerables);

let platformChartInstance = null;
let queueChartInstance = null;

/**
 * Renders or updates both operational surge comparison charts.
 *
 * @param {HTMLCanvasElement} platformCanvas 
 * @param {HTMLCanvasElement} queueCanvas 
 * @param {Array<object>} baselineTimeline 
 * @param {Array<object>} plannedTimeline 
 * @param {number} safePlatformCapacity 
 */
export function renderSurgeCharts(
  platformCanvas,
  queueCanvas,
  baselineTimeline,
  plannedTimeline,
  safePlatformCapacity = 3500
) {
  if (!platformCanvas || !queueCanvas) return;

  // Destroy previous instances to avoid canvas memory leaks
  if (platformChartInstance) {
    platformChartInstance.destroy();
    platformChartInstance = null;
  }
  if (queueChartInstance) {
    queueChartInstance.destroy();
    queueChartInstance = null;
  }

  // Downsample to 2-minute or 5-minute ticks for clean control-room readability
  const sampledIndices = [];
  for (let i = 0; i < baselineTimeline.length; i += 3) {
    sampledIndices.push(i);
  }
  if (!sampledIndices.includes(baselineTimeline.length - 1)) {
    sampledIndices.push(baselineTimeline.length - 1);
  }

  const labels = sampledIndices.map(idx => baselineTimeline[idx].timeStr);
  const baselinePlatformData = sampledIndices.map(idx => baselineTimeline[idx].platformOccupancy);
  const plannedPlatformData = sampledIndices.map(idx => plannedTimeline[idx].platformOccupancy);
  const safeLineData = sampledIndices.map(() => safePlatformCapacity);

  const baselineQueueData = sampledIndices.map(idx => baselineTimeline[idx].outsideQueue);
  const plannedQueueData = sampledIndices.map(idx => plannedTimeline[idx].outsideQueue);

  // Chart Common Options (Section 10 Design Rules: minimal gridlines, tabular numerals)
  const commonScales = {
    x: {
      grid: {
        color: '#E2E8F0',
        tickColor: '#E2E8F0'
      },
      ticks: {
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 11
        },
        color: '#52606D',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 12
      }
    },
    y: {
      grid: {
        color: '#F1F3F5'
      },
      ticks: {
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 11
        },
        color: '#52606D'
      }
    }
  };

  // 1. Platform Density Chart
  platformChartInstance = new Chart(platformCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Planned Platform Load',
          data: plannedPlatformData,
          borderColor: '#0F4C81', // deep metro blue accent
          backgroundColor: 'rgba(15, 76, 129, 0.08)',
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2
        },
        {
          label: 'Baseline (Unmanaged)',
          data: baselinePlatformData,
          borderColor: '#94A3B8', // muted grey
          borderWidth: 1.8,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          tension: 0.2
        },
        {
          label: `Safe Limit (${safePlatformCapacity.toLocaleString()})`,
          data: safeLineData,
          borderColor: '#DC2626', // red threshold
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            font: { size: 11, weight: '600' },
            color: '#1F2933',
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: '#1F2933',
          titleFont: { size: 12, weight: '700' },
          bodyFont: { size: 11 },
          padding: 8,
          cornerRadius: 4
        }
      },
      scales: commonScales
    }
  });

  // 2. Outside Queue Chart
  queueChartInstance = new Chart(queueCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Planned Outside Queue',
          data: plannedQueueData,
          borderColor: '#0F4C81',
          backgroundColor: 'rgba(15, 76, 129, 0.1)',
          borderWidth: 2.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2
        },
        {
          label: 'Baseline Outside Queue',
          data: baselineQueueData,
          borderColor: '#94A3B8',
          borderWidth: 1.8,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            font: { size: 11, weight: '600' },
            color: '#1F2933',
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: '#1F2933',
          titleFont: { size: 12, weight: '700' },
          bodyFont: { size: 11 },
          padding: 8,
          cornerRadius: 4
        }
      },
      scales: commonScales
    }
  });
}
