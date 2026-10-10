/**
 * STADIUM SURGE PLANNER (Metro Operations, PS-05)
 * Configuration & Scenario Presets
 *
 * NOTE FOR JUDGES / OPERATORS:
 * All station capacity, throughput, and rolling-stock parameters below
 * are explicitly designated as ASSUMPTIONS based on standard metro transit
 * benchmarks (NFPA 130 standard, typical AFC gate flow rates, and 6-car metro trains).
 */

export const APP_CONFIG = {
  appTitle: 'Stadium Surge Planner',
  subTitle: 'Metro Operations Control Room (PS-05)',
  version: '1.0.0-step1-2',
  
  // Local AI (Ollama / Gemma 4) endpoint configuration
  ai: {
    endpoint: 'http://localhost:11434/api/generate',
    model: 'gemma4',
    timeoutMs: 8000, // 8-second fallback threshold per spec
    enabled: true
  },

  // Time stepping configuration for simulation
  simulation: {
    startMinuteOffset: -10, // 10 minutes prior to event end
    endMinuteOffset: 120,   // 120 minutes following event end
    timeStepMinutes: 1      // 1-minute discrete intervals (131 total minutes)
  },

  // Risk classification thresholds per spec section 7 & 10
  thresholds: {
    platform: {
      safeMaxRatio: 1.0,    // Red if > 100% of safe platform capacity
      warningRatio: 0.70    // Amber if 70% to 100% of safe platform capacity
                            // Green if < 70%
    },
    outsideQueueWait: {
      warningMinutes: 10,   // Amber if outside queue wait is 10-20 min
      criticalMinutes: 20   // Red if outside queue wait > 20 min
    }
  }
};

/**
 * Default Station Parameter Assumptions
 * Every field is explicitly labeled with an assumption description.
 */
export const DEFAULT_STATION_ASSUMPTIONS = {
  gates_total: {
    value: 16,
    unit: 'gates',
    label: 'Total Entry Turnstiles',
    assumption: 'ASSUMPTION: Physical count of AFC entry fare gates installed at station concourse.'
  },
  gates_open_baseline: {
    value: 8,
    unit: 'gates',
    label: 'Baseline Open Entry Gates',
    assumption: 'ASSUMPTION: Standard off-peak gate deployment before special surge intervention.'
  },
  gate_throughput_per_min: {
    value: 25,
    unit: 'passengers/gate/min',
    label: 'Gate Throughput Rate',
    assumption: 'ASSUMPTION: Practical tap-and-pass speed through contactless gates (approx 2.4 sec/person).'
  },
  platform_capacity_safe: {
    value: 3500,
    unit: 'passengers',
    label: 'Safe Platform Holding Limit',
    assumption: 'ASSUMPTION: Maximum safe crowd capacity under NFPA 130 life-safety guidelines (~1.5 persons/m²).'
  },
  train_capacity: {
    value: 1000,
    unit: 'passengers/train',
    label: 'Nominal Train Capacity',
    assumption: 'ASSUMPTION: Standard 6-coach rake nominal carrying capacity.'
  },
  baseline_headway_min: {
    value: 6.0,
    unit: 'minutes',
    label: 'Baseline Service Headway',
    assumption: 'ASSUMPTION: Regular scheduled timetable interval between arriving trains.'
  },
  min_headway_min: {
    value: 3.0,
    unit: 'minutes',
    label: 'Minimum Technical Headway',
    assumption: 'ASSUMPTION: CBTC signaling technical safety floor on line turnaround and headway.'
  },
  max_extra_trains: {
    value: 8,
    unit: 'trains',
    label: 'Depot Reserve Trains Available',
    assumption: 'ASSUMPTION: Maximum standby train sets stabled at nearest terminal siding/depot.'
  },
  concourse_holding_capacity: {
    value: 2000,
    unit: 'passengers',
    label: 'Concourse Holding Area Limit',
    assumption: 'ASSUMPTION: Intermediate queue reservoir space before fareline/escalators.'
  },
  exit_gates_total: {
    value: 12,
    unit: 'gates',
    label: 'Arrival / Exit Gates',
    assumption: 'ASSUMPTION: Dedicated bi-directional exit turnstiles available for egress flows.'
  },
  through_passenger_ratio: {
    value: 0.20,
    unit: 'fraction (0-1)',
    label: 'Through Passenger Load Ratio',
    assumption: 'ASSUMPTION: 20% of train capacity is already occupied by upstream passengers.'
  },
  load_factor: {
    value: 1.0,
    unit: 'factor',
    label: 'Train Usable Load Factor',
    assumption: 'ASSUMPTION: Available train capacity can be 100% utilized during peak boarding.'
  }
};

/**
 * 3 Official Scenario Presets (Spec Section 6)
 * - Small: 8,000 attendance (Riverfront / Convention Centre)
 * - Medium: 25,000 attendance (Navratri Ground / Arena)
 * - Large: 60,000 attendance (Cricket Stadium)
 */
export const SCENARIO_PRESETS = [
  {
    id: 'small_riverfront',
    sizeCategory: 'small',
    title: 'Small: Riverfront Expo & Cultural Fest',
    event: {
      name: 'Sabarmati Riverfront Cultural Expo',
      venue: 'Riverfront West / Event Grounds Station',
      attendance: 8000,
      endTime: '21:30',
      metroSharePct: 30, // 2,400 metro passengers
      egressSpreadMin: 40,
      weather: 'normal' // 'normal' | 'rain'
    },
    stationAssumptions: {
      gates_total: 10,
      gates_open_baseline: 6,
      gate_throughput_per_min: 25,
      platform_capacity_safe: 2000,
      train_capacity: 1000,
      baseline_headway_min: 8.0,
      min_headway_min: 4.0,
      max_extra_trains: 4,
      concourse_holding_capacity: 1200,
      exit_gates_total: 8,
      through_passenger_ratio: 0.20,
      load_factor: 1.0
    }
  },
  {
    id: 'medium_navratri',
    sizeCategory: 'medium',
    title: 'Medium: Navratri Maha Garba Festival',
    event: {
      name: 'GMDC Ground Maha Navratri Garba',
      venue: 'University / GMDC Ground Station',
      attendance: 25000,
      endTime: '01:00',
      metroSharePct: 35, // 8,750 metro passengers
      egressSpreadMin: 50,
      weather: 'normal'
    },
    stationAssumptions: {
      gates_total: 14,
      gates_open_baseline: 7,
      gate_throughput_per_min: 25,
      platform_capacity_safe: 2800,
      train_capacity: 1000,
      baseline_headway_min: 6.0,
      min_headway_min: 3.5,
      max_extra_trains: 6,
      concourse_holding_capacity: 1800,
      exit_gates_total: 10,
      through_passenger_ratio: 0.20,
      load_factor: 1.0
    }
  },
  {
    id: 'large_stadium',
    sizeCategory: 'large',
    title: 'Large: Cricket Championship Final (Stadium)',
    event: {
      name: 'T20 International Final - India Match',
      venue: 'Motera Narendra Modi Stadium Station',
      attendance: 60000,
      endTime: '23:00',
      metroSharePct: 40, // 24,000 metro passengers
      egressSpreadMin: 45,
      weather: 'normal'
    },
    stationAssumptions: {
      gates_total: 20,
      gates_open_baseline: 8,
      gate_throughput_per_min: 25,
      platform_capacity_safe: 3500,
      train_capacity: 1000,
      baseline_headway_min: 6.0,
      min_headway_min: 3.0,
      max_extra_trains: 10,
      concourse_holding_capacity: 3000,
      exit_gates_total: 16,
      through_passenger_ratio: 0.20,
      load_factor: 1.0
    }
  }
];
