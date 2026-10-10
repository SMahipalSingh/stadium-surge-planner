# Stadium Surge Planner (Metro Hacks — Problem Statement PS-05)

> **Metro Operations: The Stadium Surge**  
> A control-room planning and decision-support tool for metro operations controllers during major stadium and festival surges. Generates minute-by-minute tactical action timelines, before-vs-after risk dashboards, and parameter-filled multilingual announcement scripts (English, Hindi, and Gujarati).

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?logo=pwa&logoColor=white)](https://github.com/vite-pwa/vite-plugin-pwa)
[![Chart.js](https://img.shields.io/badge/Chart.js-Bundled-FF6384?logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![Pure JavaScript](https://img.shields.io/badge/Core-Deterministic%20Pure%20JS-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Gemma AI](https://img.shields.io/badge/Local%20AI-Gemma%204%20(Ollama)-4285F4?logo=google&logoColor=white)](https://ollama.com/)

---

## 1. Problem Statement (PS-05)

When 60,000 attendees exit a marquee event (e.g. T20 Final at Narendra Modi Stadium, Navratri Garba, riverfront exhibitions), 24,000+ passengers hit a single metro station within minutes. 

- **The Unmanaged Baseline Risk**: Platform occupancy surges to **241% of safe life-safety capacity** (8,450 people on a 3,500-capacity platform), outside plaza queues exceed **10,800 people** with wait times topping **55 minutes**, creating critical crowd crush hazards.
- **The Solution**: An **offline-first control-room console** that simulates crowd dynamics, executes an iterative greedy planner to deploy extra trains, scale farelines, and meter platform access, producing an explainable **minute-by-minute tactical action timeline** and **multilingual audio scripts**.

---

## 2. Core Features & Architecture

- **Deterministic Numerical Core**:
  - The simulation and greedy planner are pure JavaScript functions in `src/sim` and `src/planner`.
  - **Zero AI in the numeric calculation path** (no stochastic LLMs determining safety limits).
  - Skewed Gamma-family egress arrival curve with discrete minute steps ($t \in [-10, +120]$ min relative to event end).
  - Explicit labeling of every station parameter as an **ASSUMPTION** (NFPA 130 life-safety standards, AFC tap latencies, CBTC signaling floors).

- **Greedy Explainable Planner**:
  - **Rolling Stock Injection**: Deploys reserve trains from depot sidings, compressing headway from 6.0m to 3.0m (+10 extra trains).
  - **Fareline Scaling**: Incrementally expands entry turnstiles up to 100% physical capacity (up to 20 gates = 500 pass/min).
  - **Platform Protection via Concourse Holding**: Meters gate inflow to guarantee platform occupancy never exceeds 90% safe capacity, safely buffering up to 3,000 passengers in the mezzanine holding pen.
  - **External Coordination Alerts**: Automatically flags external police perimeter holding and shuttle bus bridging if physical limits are exhausted.

- **Offline-First PWA (Zero CDN, Zero Web Fonts)**:
  - Bundled via `vite-plugin-pwa` with Workbox service worker precaching.
  - Operates completely in airplane mode without internet connectivity.
  - Native system font stack with tabular numerals (`font-variant-numeric: tabular-nums`).

- **Multilingual Passenger Announcements**:
  - 5 operational phases (Pre-Event Advisory, Surge Start, Concourse Holding, Platform Boarding, Normalization).
  - Parameterized in **English**, **हिन्दी (Hindi)**, and **ગુજરાતી (Gujarati)** with dynamic station variables (`{station}`, `{event}`, `{gates}`, `{headway}`).
  - Single-click clipboard copy (`✓ Copied!`).

- **Local Gemma AI Integration (Strict Fallback)**:
  - Connects to local Gemma 4 runtime via Ollama (`http://localhost:11434`) for plain-language operator justifications.
  - Strict 8-second timeout: if Gemma is unreachable, falls back instantly to reviewed deterministic templates without blank states.

---

## 3. Performance Results Across the 3 Official Presets

| Scenario Preset | Attendance / Metro Crowd | Baseline Platform Load | Planned Platform Load | Max Queue Wait | Red Risk Minutes | Clearance Time |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Large: Cricket Final (Motera)** | 60,000 / 24,000 | 8,450 (241% safe) [RED] | **3,150 (90% safe ceiling)** | 55m $\to$ **6m [GREEN]** | 109m $\to$ **0m (100% Eliminated)** | 01:00 $\to$ **00:49 (-11m)** |
| **Medium: Navratri (GMDC Ground)** | 25,000 / 8,750 | 2,104 (75% safe) [AMBER] | **720 (26% safe) [GREEN]** | 4m $\to$ **0m (No Queue)** | 0m $\to$ **0m (Safe)** | 02:01 $\to$ **01:47 (-14m)** |
| **Small: Riverfront Expo** | 8,000 / 2,400 | 402 (20% safe) [GREEN] | **402 (20% safe) [GREEN]** | 0m (Safe) | 0m (Safe) | 22:07 (On schedule) |

---

## 4. Quickstart Guide

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x

### Installation
```bash
# Clone the repository
git clone https://github.com/SMahipalSingh/stadium-surge-planner.git
cd stadium-surge-planner

# Install dependencies (Vite, Vite-PWA, Chart.js)
npm install
```

### Running Locally
```bash
# Start development server
npm run dev
```
Open **`http://localhost:3000/`** in your browser.

### Headless Verification Tests
```bash
# Verify discrete simulation engine across all 3 presets
npm run test:sim

# Verify greedy planner interventions and before/after metrics
npm run test:planner
```

### Production Build & PWA Testing
```bash
# Build production bundle with offline PWA precaching
npm run build

# Preview offline production build
npm run preview
```

---

## 5. Folder Structure

```
stadium-surge-planner/
├── public/                 # Offline SVG icons, PWA manifests, favicons
├── scripts/
│   ├── test-sim.js         # Node CLI test runner for simulation engine
│   └── test-planner.js     # Node CLI test runner for greedy planner
├── src/
│   ├── ai/                 # Local Gemma AI client (Ollama) with 8s fallback
│   ├── planner/            # Pure JS greedy planner engine & action timelines
│   ├── sim/                # Pure JS discrete simulation & Gamma arrival curve
│   ├── templates/          # Multilingual announcement templates (en/hi/gu)
│   ├── ui/                 # Bundled Chart.js visualizers
│   ├── config.js           # Presets, thresholds, and station assumptions
│   ├── main.js             # Main operations console controller
│   └── style.css           # Control-room operations console design system
├── index.html              # Shell layout with persistent status bar & sidebar
├── package.json
└── vite.config.js          # Vite configuration with offline PWA precache
```

---

## 6. PPP Pitch & Business Model (Judging Criteria)

- **Authority (Metro Corporation)**: Approves life-safety parameters, station constraints, and timetable adjustments.
- **Private Partner**: Maintains software, calibrates pedestrian egress models, and provides event-specific operational plans.
- **Funding**: Funded via per-event crowd management planning fees paid by stadium promoters and tournament organizers, alongside a software license from the transit agency justified by incident risk mitigation and increased farebox capture.
- **Pilot**: 1 station (Motera Narendra Modi Stadium) across a tournament season; compare predicted minute-by-minute arrivals with AFC gate taps to refine pedestrian walking curves.

---

## License

MIT License. Developed for Metro Hacks Hackathon (PS-05).
