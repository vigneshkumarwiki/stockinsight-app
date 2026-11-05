# STOCKINSIGHT 📈⚡
### Autonomous Quantitative Stock Evaluation & Execution-Guard System
#### 100% Native Upstox REST API Integration • Zero External Data Dependencies

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38bdf8.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-100%2F100_Passed-10b981.svg)](./src/tests/runTests.ts)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

---

## 1. Overview & Core Mandate

**STOCKINSIGHT** is an institutional-grade quantitative stock evaluation and execution-guard system. It operates **100% natively on the Upstox API**, eliminating all dependencies on third-party quote scrapers, Yahoo Finance, or unverified feeds.

### The Quantitative Core Formula
$$\mathbf{\text{Core Score (0–100)}} = \mathbf{\text{Fundamental Score (0–50)}} + \mathbf{\text{Technical Score (0–50)}}$$

* **Fundamental Score (0–50):** Answers **WHAT to buy** (Forensic Accounting, Collinearity-Capped Valuation, Capital Efficiency, Solvency, Real Cash Flow).
* **Technical Score (0–50):** Answers **WHEN to buy** (Orthogonal Regimes, Macro Moving Average Alignment, Wilder's RSI, Institutional Volume Accumulation).
* **Execution Layer (Decoupled):** Enforces **HOW MUCH to pay & WHERE to stop** (Dynamic Volatility Stops, Pullback Max Entry limits, Anti-Stop Compression, Bid-Ask Slippage Filters).

---

## 2. The 5 Mandatory Production Integrity Layers

STOCKINSIGHT strictly enforces 5 mathematical integrity layers across every stock evaluation:

```
┌────────────────────────────────────────────────────────────────────────┐
│               LAYER 1: DATA INTEGRITY FORENSIC AUDITOR                 │
│  • Balance Sheet Equality: |Assets - (Liabilities + Equity)| <= 0.1%   │
│  • Cash Flow Reconciliation: PBT(CF) vs PBT(P&L) within 10%            │
│  • Filing Freshness: <= 180 Days (Stale Filing Alert if exceeded)      │
│  • Capital Anomaly: Share capital shift > 50% without Corporate Action │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        ↓                                                       ↓
┌───────────────────────────────────────┐   ┌───────────────────────────────────────┐
│     LAYER 2: FUNDAMENTAL SUB-CAPS     │   │     LAYER 3: ORTHOGONAL TECHNICAL     │
│  • Valuation Bucket <= 12 Points      │   │  • Trend & Macro Regime: Max 20 Pts   │
│    - Equity Multiples <= 7 Pts        │   │    (200-EMA 10, 100-DMA 5, Stack 5)   │
│    - Enterprise (EV/EBITDA) <= 5 Pts  │   │  • Momentum & Mean Rev: Max 15 Pts    │
│  • Capital Efficiency <= 12 Points    │   │    (RSI-14 10 Pts, 20D ROC 5 Pts)     │
│  • Cash Quality <= 6 Points           │   │  • Volume Confirmation: Max 15 Pts    │
│  • Growth & Solvency <= 20 Points     │   │    (Accumulation 8, Breakout 7)       │
│  • Accrual Trap Penalty: -5 Points    │   │  • Volume Veto: If Volume < 5 Pts     │
│    (High P/E or CAGR with zero cash)  │   │    => Technical Score Capped at 35    │
└───────────────────┬───────────────────┘   └───────────────────┬───────────────────┘
                    └───────────────────┬───────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────┐
│                 LAYER 4: ANTI-GAMING EXECUTION GUARDS                  │
│  • Dynamic Structural Stop: Anchored to 10-bar Swing Low              │
│  • Anti-Stop Compression Floor: Distance must be >= 1.5 * ATR_14       │
│  • Bid-Ask Spread Filter: (Ask - Bid) / LTP > 0.40% => High Slippage   │
│  • Pullback Max Entry Limit: MaxEntry = (Target + R*Stop) / (1 + R)    │
│  • Turnover Guard (>= ₹5 Cr) & Circuit Band Guard (within 0.5%)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│            LAYER 5: CONTINUOUS MATHEMATICAL RECONCILIATION             │
│  • Fundamental Score + Technical Score === Core Score (0 - 100)        │
│  • Tested against RELIANCE, TCS, HDFCBANK, BAJFINANCE benchmarks       │
│  • 100 / 100 Unit & Integration Tests Passing                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Project Directory Structure

```text
D:\App_Test\Stock_App\
├── docs/                                  # Comprehensive System Documentation
│   ├── STOCKINSIGHT_COMPLETE_PROJECT_BLUEPRINT.md  # Master Architecture & Specs
│   ├── PRODUCTION_INTEGRITY_LAYERS.md     # Mathematical Formulas for Layers 1-5
│   └── WALKTHROUGH.md                     # Verification & Test Execution Report
├── src/
│   ├── api/
│   │   ├── benchmarkData.ts               # Institutional Fixtures (Reliance, TCS, HDFC, Bajaj)
│   │   └── upstoxClient.ts                # Native Upstox v2 REST Client
│   ├── components/
│   │   ├── DataIntegrityBanner.tsx        # Layer 1 Forensic Audit UI Component
│   │   ├── ExecutionCard.tsx              # Layer 4 Risk Corridor & Slippage Card
│   │   ├── FactorTable.tsx                # Layer 2 Sub-caps & Layer 3 Technical Buckets
│   │   ├── SafetyAlerts.tsx               # Institutional Kill-Switches & Warnings
│   │   ├── ScoreGauge.tsx                 # Dual-Axis Score Visualizer
│   │   └── TerminalHeader.tsx             # Quote Bar, Token Modal & Symbol Switcher
│   ├── engine/
│   │   ├── calculators/
│   │   │   ├── fundamental.ts             # CFO/EBITDA, CAGR, OPM, D/E, Provisions
│   │   │   └── technical.ts               # EMA200, SMA100, RSI14, ATR14, Volume Accumulation
│   │   ├── dataAuditor.ts                 # Layer 1 Forensic Auditor
│   │   ├── decisionEngine.ts              # Zones (FAVORABLE, HOLD, CAUTION), Floor & Hysteresis
│   │   ├── executionEngine.ts             # Layer 4 Anti-Stop Compression & Corridor Math
│   │   ├── fundamentalEngine.ts           # Layer 2 Sector Evaluator & Collinearity Sub-caps
│   │   ├── index.ts                       # StockInsightPipeline Master Orchestrator
│   │   ├── normalizer.ts                  # Sector Router (Industrial, Bank, NBFC)
│   │   ├── safeParser.ts                  # Null-Safe Parser (Zero-Coercion Ban)
│   │   ├── safetyGates.ts                 # Cash Divergence, Cyclical Peak & Pledge Gates
│   │   └── technicalEngine.ts             # Layer 3 Orthogonal Buckets & Volume Veto
│   ├── tests/
│   │   └── runTests.ts                    # 100-Test Automated Regression Suite
│   ├── types/
│   │   ├── engine.ts                      # DataIntegrityAudit, Buckets, ExecutionCorridor
│   │   └── upstox.ts                      # Upstox v2 Official REST Response Types
│   ├── App.tsx                            # Dark Financial Terminal Layout
│   └── main.tsx                           # Application Entry Point
├── package.json                           # Dependencies & Scripts
├── tsconfig.json                          # TypeScript Project References
└── vite.config.ts                         # Vite Bundler with Tailwind CSS v4 Plugin
```

---

## 4. Quick Start & Execution Commands

### Prerequisites
* **Node.js:** v18+ (tested on Node v24.17.0)
* **npm:** v9+ (tested on npm 11.13.0)

### 1. Run Automated Test Suite (100 Tests)
```bash
npm test
```
*Executes all 100 assertions via `tsx src/tests/runTests.ts` covering all 5 Production Integrity Layers.*

### 2. Launch Developer Terminal (Vite)
```bash
npm run dev
```
*Starts local development server at `http://localhost:5173` with instant Hot Module Replacement (HMR).*

### 3. Production Build
```bash
npm run build
```
*Compiles TypeScript type checks (`tsc -b`) and bundles production assets via Vite in under 1 second.*

---

## 5. Live Upstox Analytics Token Setup

1. Launch the application (`npm run dev`).
2. Click **"Connect Upstox"** in the top navigation bar.
3. Paste your authorized Upstox **Analytics Token**.
4. The terminal will immediately transition from cached benchmark data to real-time live market quotes and fundamental financial statements.

---

## 6. Mathematical Verification Matrix

| Metric | Target | Verified Value |
|---|---|---|
| Core Score Reconciliation | $\text{Fund} + \text{Tech} = \text{Core}$ | Exact sum ($|\Delta| < 0.001$) |
| Balance Sheet Equality | $|\text{Assets} - (\text{Liab} + \text{Equity})| \le 0.1\%$ | Enforced ($0.00\%$ discrepancy) |
| Valuation Sub-cap | $\le 12\text{ pts}$ | Enforced |
| Capital Efficiency Sub-cap | $\le 12\text{ pts}$ | Enforced |
| Technical Volume Veto | If Vol $< 5 \implies \text{Score} \le 35$ | Enforced |
| Anti-Stop Compression Floor | Distance $\ge 1.5 \times \text{ATR}_{14}$ | Enforced |
| Bid-Ask Spread Filter | Spread $> 0.40\% \implies \text{High Slippage}$ | Enforced |

---

## 7. Documentation Index

Detailed architectural documents are located in the [`docs/`](./docs) folder:
* [`docs/STOCKINSIGHT_COMPLETE_PROJECT_BLUEPRINT.md`](./docs/STOCKINSIGHT_COMPLETE_PROJECT_BLUEPRINT.md)
* [`docs/PRODUCTION_INTEGRITY_LAYERS.md`](./docs/PRODUCTION_INTEGRITY_LAYERS.md)
* [`docs/WALKTHROUGH.md`](./docs/WALKTHROUGH.md)
