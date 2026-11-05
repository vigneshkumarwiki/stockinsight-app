# STOCKINSIGHT — Master Project Blueprint & Architecture

---

## 1. Executive Vision & Core Philosophy

**STOCKINSIGHT** is an autonomous quantitative stock evaluation and execution-guard system engineered to operate **100% natively on the Upstox API**. 

It eliminates all external dependencies (Yahoo Finance, web scraping, third-party quote vendors, or manually fabricated datasets) by directly consuming Upstox's Market Quotes, Historical Daily Candles, and the dedicated **Fundamentals Suite** (`/v2/fundamentals/:isin/*`).

### The Quantitative Formula
$$\mathbf{\text{Core Score (0–100)}} = \mathbf{\text{Fundamental Score (0–50)}} + \mathbf{\text{Technical Score (0–50)}}$$

* **Fundamental Score (0–50):** Answers **WHAT to buy** (Cash-Flow Realism, Capital Efficiency, Solvency, Relative Valuation, and Sustainable Growth).
* **Technical Score (0–50):** Answers **WHEN to buy** (Regime Alignment, Institutional Accumulation Volume, Trend Stacking, Momentum Velocities).
* **Execution Layer (Decoupled):** Enforces **HOW MUCH to pay & WHERE to stop** (Dynamic ATR/Swing Stops, Risk-to-Reward Corridors, Pullback Max Entry Math, Liquidity & Circuit Guards).

---

## 2. Upstox-Native End-to-End Data Pipeline

All data flows strictly through official Upstox REST endpoints authenticated via a non-expiring **Analytics Token**:

```text
                                UPSTOX REST API
                                (Analytics Token)
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ↓                               ↓                               ↓
   MARKET DATA                 HISTORICAL CANDLES               FUNDAMENTALS SUITE
  (/market-quote/quotes)     (/historical-candle/day/...)      (/fundamentals/:isin/*)
  • Live LTP                 • 350-Day Daily OHLCV             • /profile
  • Upper / Lower Circuits   • Volume History                  • /key-ratios
  • Bid-Ask Spread           • 52W High & Low                  • /income-statement
                             • ATR-14, MA/EMA Series           • /balance-sheet
                                                               • /cash-flow
                                                               • /share-holdings
                                                               • /corporate-actions
                                        │
                                        ↓
                               SAFE NUMERIC PARSER
                   • Reject "", "N/A", "-", null -> NULL
                   • CRITICAL: NEVER convert missing to 0.0
                   • Loss-Making (EPS<=0 or BV<=0) -> Award 0 pts
                                        │
                                        ↓
                                 DATA NORMALIZER
                   • ISIN Instrument Key Mapping
                   • Sector Routing: Industrial | Bank | NBFC
                                        │
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
           FUNDAMENTAL ENGINE                       TECHNICAL ENGINE
             (0 – 50 Points)                         (0 – 50 Points)
                    └───────────────────┬───────────────────┘
                                        ↓
                                   CORE SCORE
                                    (0 – 100)
                                        │
                                        ↓
                            INSTITUTIONAL SAFETY GATES
             • Cash Divergence Kill-Switch (CFO_3Y <= 0 -> Cap HOLD)
             • Cyclical Peak Guard (Low P/E + High CAGR -> Trailing Stop)
             • Promoter Pledge Gate (> 20% Pledged -> -10 pts)
             • Quarterly Earnings Shock (Net Profit YoY < -40% -> Cap HOLD)
             • Fundamental Floor (Core >= 68 & Fund < 25 -> Cap HOLD)
                                        │
                                        ↓
                                 DECISION ENGINE
                     (FAVORABLE >= 68 | HOLD 39-67 | CAUTION 0-38)
                           (Anti-Flicker Hysteresis: < 66)
                                        │
                                        ↓
                                 EXECUTION LAYER
                   • Turnover Guard: 20-Day Avg Turnover >= ₹5 Cr
                   • Circuit Guard: Price within 0.5% of Bands
                   • Stop = min(Swing Low 10, LTP - 2 * ATR 14)
                   • Max Entry = (Target + R_min * Stop) / (1 + R_min)
                                        │
                                        ↓
                          TERMINAL UI (Tailwind CSS)
```

---

## 3. The Four Breakthrough Institutional Guards

STOCKINSIGHT resolves the four major blind spots of traditional retail screening models:

### 1. Cash Divergence Kill-Switch (Accrual Accounting Trap)
* **The Problem:** Companies book paper revenues that never convert into bankable cash (e.g. Satyam, Cox & Kings, Sintex).
* **The Gate:** Compares cumulative 3-year Net Profit against cumulative 3-year Operating Cash Flow ($\text{CFO}$) from `/cash-flow`:
  $$\text{If } \sum_{i=1}^{3} \text{PAT}_i > 0 \quad \text{and} \quad \sum_{i=1}^{3} \text{CFO}_i \le 0 \implies \mathbf{\text{RED\_FLAG\_CASH\_DIVERGENCE}}$$
  * Automatic penalty: $-10\text{ points}$.
  * Immediate hard-cap: Cannot receive `FAVORABLE` status under any circumstance.

### 2. Bank / NBFC Provisioning Integrity (Credit Cost Trap)
* **The Problem:** Lenders suppress provisions to artificially inflate current earnings before bad loans trigger an insolvency crisis (e.g. Yes Bank, DHFL).
* **The Gate:** Tracks implicit provisions from `/income-statement` ($\text{Operating Profit} - \text{PBT}$). If provisions surge $> 40\%$ YoY without proportional loan-asset growth, credit-cost points drop to $0$.

### 3. Cyclical Peak Guard (P/E Inversion Trap)
* **The Problem:** Commodity/metal companies look cheapest ($P/E \approx 4\text{ to } 6$) at the cyclical top when commodity prices and profits are temporarily inflated. Retail buyers buy the "cheap P/E" right before a 60% cyclical drawdown.
* **The Gate:** Detects cyclical sectors (`Metals`, `Commodities`, `Sugar`, `Shipping`) via `/profile`. If stock $\text{P/E} < 0.5 \times \text{Sector P/E}$ while $3\text{Y Profit CAGR} > 35\%$:
  * Flags: $\mathbf{\text{CYCLICAL\_PEAK\_RISK}}$.
  * Locks trailing stop strictly to the 10-day swing low (zero leeway for technical breakdown).

### 4. Volume Accumulation Filter (Institutional vs. Retail Breakout)
* **The Problem:** False breakouts occurring on declining volume, where institutions offload into retail breakout buying.
* **The Gate:** Calculates the 20-day Accumulation Ratio:
  $$\text{Accumulation Ratio} = \frac{\sum \text{Volume of Up-Days}}{\sum \text{Volume of Down-Days}}$$
  * Full $8\text{ pts}$ only if ratio $> 1.25$ AND breakout volume $\ge 1.2 \times \text{SMA}_{20}(\text{Volume})$.
  * If price rises on shrinking volume $\implies$ drops to $2\text{ pts}$ (distribution divergence).

---

## 4. Full Scoring Engine Specifications (100 Points Total)

### A. Fundamental Engine (50 Points Total)

#### 1. Industrial / Non-Financial Model (50 pts)
*For IT, FMCG, Manufacturing, Auto, Pharma, Energy, Metals, Chemicals*

| Metric | Points | Upstox Source Endpoint | Scoring Criteria |
| :--- | :---: | :--- | :--- |
| **Cash Flow Conversion** | 6 pts | `/cash-flow` & `/income-statement` | $6\text{ pts}$ if $\text{CFO}/\text{EBITDA} \ge 0.70$; $3\text{ pts}$ if $0.50\text{--}0.69$; $0\text{ pts}$ if $<0.50$ or $\text{CFO}<0$. |
| **P/E vs Sector** | 5 pts | `/key-ratios` | $5\text{ pts}$ if $\le 0.8\times$; $3\text{ pts}$ if $0.8\text{--}1.1\times$; $1\text{ pt}$ if $>1.1\times$; $0\text{ pts}$ if $\le 0$. |
| **P/B vs Sector** | 5 pts | `/key-ratios` | $5\text{ pts}$ if $\le 0.8\times$; $3\text{ pts}$ if $0.8\text{--}1.2\times$; $0\text{ pts}$ if $\le 0$. |
| **EV / EBITDA** | 5 pts | `/key-ratios` | $5\text{ pts}$ if $\le \text{Sector}$; $3\text{ pts}$ if $1.0\text{--}1.3\times$; $1\text{ pt}$ if $>1.3\times$. |
| **ROE (%)** | 6 pts | `/key-ratios` | $6\text{ pts}$ if $\ge 20\%$; $4\text{ pts}$ if $15\text{--}20\%$; $2\text{ pts}$ if $10\text{--}15\%$; $0\text{ pts}$ if $<10\%$. |
| **ROCE (%)** | 6 pts | `/key-ratios` | $6\text{ pts}$ if $\ge 22\%$; $4\text{ pts}$ if $16\text{--}22\%$; $2\text{ pts}$ if $10\text{--}16\%$; $0\text{ pts}$ if $<10\%$. |
| **3Y Net Profit CAGR**| 6 pts | `/income-statement` | **Option B State Partition:**<br>• *Compounding ($P_{T-3}>0, P_T>0$):* $6\text{ pts}$ if $\ge 20\%$; $4\text{ pts}$ if $12\text{--}20\%$; $2\text{ pts}$ if $6\text{--}12\%$; $0\text{ pts}$ if $<6\%$.<br>• *Turnaround ($P_{T-3}\le 0, P_T>0$):* $4\text{ pts}$.<br>• *Loss Reduction ($P_{T-3}<0, P_T<0, P_T>P_{T-3}$):* $2\text{ pts}$.<br>• *Breakeven / Loss Expansion / Collapse / Zero / Missing:* $0\text{ pts}$. |
| **Debt-to-Equity** | 6 pts | `/balance-sheet` | $6\text{ pts}$ if $\le 0.3$; $4\text{ pts}$ if $0.3\text{--}0.7$; $2\text{ pts}$ if $0.7\text{--}1.2$; $0\text{ pts}$ if $>1.2$. |
| **Total** | **50 pts** | | |

---

#### 2. Commercial Bank Model (50 pts)
*Blocked: EV/EBITDA, ROCE, OPM, Corporate D/E, Industrial CFO.*

| Metric | Points | Upstox Source Endpoint | Scoring Criteria |
| :--- | :---: | :--- | :--- |
| **P/E vs Sector** | 7 pts | `/key-ratios` | Relative valuation against Nifty Bank / Private Bank index. |
| **P/B vs Sector** | 7 pts | `/key-ratios` | Key valuation anchor for financial institutions. |
| **Return on Assets (ROA)**| 10 pts | `/key-ratios` | **Primary efficiency measure:** $\ge 1.4\% \implies 10\text{ pts}$; $1.0\text{--}1.4\% \implies 6\text{ pts}$; $<1.0\% \implies 2\text{ pts}$. |
| **3Y Net Profit CAGR** | 10 pts | `/income-statement` | **Option B State Partition:**<br>• *Compounding ($P_{T-3}>0, P_T>0$):* $10\text{ pts}$ if $\ge 18\%$; $6\text{ pts}$ if $10\text{--}18\%$; $0\text{ pts}$ if $<10\%$.<br>• *Turnaround ($P_{T-3}\le 0, P_T>0$):* $6\text{ pts}$.<br>• *Loss Reduction ($P_{T-3}<0, P_T<0, P_T>P_{T-3}$):* $3\text{ pts}$.<br>• *Breakeven / Loss Expansion / Collapse / Zero / Missing:* $0\text{ pts}$. |
| **Credit Cost Discipline** | 10 pts | `/income-statement` | $10\text{ pts}$ if provision growth $\le 40\%$; $0\text{ pts}$ if provision spike $>40\%$. |
| **Total** | **50 pts** | | |

---

#### 3. NBFC / Housing Finance (HFC) Model (50 pts)
*Blocked: ROCE, Corporate D/E, EV/EBITDA.*

| Metric | Points | Upstox Source Endpoint | Scoring Criteria |
| :--- | :---: | :--- | :--- |
| **P/E vs Sector** | 7 pts | `/key-ratios` | Relative valuation vs NBFC peers. |
| **P/B vs Sector** | 7 pts | `/key-ratios` | Book valuation multiple. |
| **Return on Assets (ROA)**| 9 pts | `/key-ratios` | $\ge 2.5\% \implies 9\text{ pts}$; $1.8\text{--}2.5\% \implies 5\text{ pts}$; $<1.8\% \implies 2\text{ pts}$. |
| **Return on Equity (ROE)**| 9 pts | `/key-ratios` | $\ge 16\% \implies 9\text{ pts}$; $12\text{--}16\% \implies 5\text{ pts}$; $<12\% \implies 2\text{ pts}$. |
| **Cost-to-Income / OPM** | 5 pts | `/income-statement` | Operational cost efficiency. |
| **3Y Net Profit CAGR** | 7 pts | `/income-statement` | Compounding earnings growth durability. |
| **Credit Provisioning** | 6 pts | `/income-statement` | Provision surge control relative to AUM expansion. |
| **Total** | **50 pts** | | |

---

### B. Technical Momentum & Volume Engine (50 Points Total)

Calculated natively from Upstox Historical Daily OHLCV candles (350 bars minimum), structured into three orthogonal buckets:

#### 1. Trend & Macro Regime Bucket (Max 20 pts)
| Technical Indicator | Points | Mathematical Definition | Scoring Logic |
| :--- | :---: | :--- | :--- |
| **200-EMA Macro Trend** | 10 pts | $\text{LTP} \ge \text{EMA}_{200}$ & $\Delta\text{EMA}_{20\text{D}} > 0$ | $10\text{ pts}$ if above rising 200 EMA; $6\text{ pts}$ if above flat/declining 200 EMA; $0\text{ pts}$ if below. |
| **100-DMA Intermediate** | 5 pts | $\text{LTP} \ge \text{SMA}_{100}$ | $5\text{ pts}$ if above; $0\text{ pts}$ if below. |
| **Moving Average Stack** | 5 pts | $\text{SMA}_{50} > \text{SMA}_{100} > \text{EMA}_{200}$ | $5\text{ pts}$ if aligned in full bull stack; $0\text{ pts}$ otherwise. |

#### 2. Momentum & Mean Reversion Bucket (Max 15 pts)
| Technical Indicator | Points | Mathematical Definition | Scoring Logic |
| :--- | :---: | :--- | :--- |
| **RSI (14) Momentum Band** | 10 pts | 14-period standard RSI | $10\text{ pts}$ if $50.0 \le \text{RSI} \le 68.0$; $6\text{ pts}$ if $68.0 < \text{RSI} \le 75.0$; $3\text{ pts}$ if $40.0 \le \text{RSI} < 50.0$; $0\text{ pts}$ if $\text{RSI} > 75.0$ (overbought exhaustion) or $\text{RSI} < 40.0$ (bearish breakdown). |
| **20-Day Rate of Change (ROC)** | 5 pts | $[(\text{LTP} - \text{LTP}_{-20}) / \text{LTP}_{-20}] \times 100$ | $5\text{ pts}$ if $\text{ROC} > 5.0\%$; $3\text{ pts}$ if $0.0\% < \text{ROC} \le 5.0\%$; $0\text{ pts}$ if $\text{ROC} \le 0.0\%$. |

#### 3. Volume Confirmation Bucket (Max 15 pts)
| Technical Indicator | Points | Mathematical Definition | Scoring Logic |
| :--- | :---: | :--- | :--- |
| **Volume Accumulation Ratio** | 8 pts | $\sum \text{Vol}_{\text{Up}} / \sum \text{Vol}_{\text{Down}}$ (20 sessions) | • *$\text{MAX\_ACCUMULATION}$ ($\text{Down Vol}=0, \text{Up Vol}>0$):* $8\text{ pts}$ (`100% Up-Day Volume`).<br>• *Ratio $\ge 1.25$:* $8\text{ pts}$.<br>• *Ratio $1.00\text{--}1.24$:* $5\text{ pts}$.<br>• *Ratio $< 1.00$:* $2\text{ pts}$ (distribution divergence).<br>• *$\text{ZERO\_VOLUME}$ ($\text{Down Vol}=0, \text{Up Vol}=0$):* $0\text{ pts}$ (`No volume recorded`).<br>• *Missing / Insufficient History:* $0\text{ pts}$. |
| **Breakout Volume Surge** | 7 pts | $\text{Bar Vol} / \text{SMA}_{20}(\text{Volume})$ | $7\text{ pts}$ if $\ge 1.50\times$ SMA; $4\text{ pts}$ if $1.20\text{--}1.49\times$; $2\text{ pts}$ if $1.00\text{--}1.19\times$; $0\text{ pts}$ if $< 1.00\times$. |

#### Volume Veto Enforcement
$$\text{If } \text{Volume Confirmation Bucket} < 5\text{ pts} \implies \text{Total Technical Score is hard-capped at } 35\text{ pts}$$
*Prevents false technical breakouts on low or distribution volume from achieving high scores.*

| Bucket | Points Allocation |
| :--- | :---: |
| Trend & Macro Regime | 20 pts |
| Momentum & Mean Reversion | 15 pts |
| Volume Confirmation | 15 pts |
| **Total Technical Engine** | **50 pts** |

---

## 5. Decision Zones, Floor & Hysteresis Rules

### Decision Zones
* **$68\text{--}100 \implies$ FAVORABLE** (High probability structural confluence).
* **$39\text{--}67 \implies$ HOLD** (Wait for structural improvement or consolidation).
* **$0\text{--}38 \implies$ CAUTION** (Weak fundamentals or bearish technical regime).

### Fundamental Floor Gate
$$\text{If } \text{Core Score} \ge 68 \quad \text{AND} \quad \text{Fundamental Score} < 25 \implies \mathbf{\text{HOLD / SPECULATIVE\_MOMENTUM}}$$
*Prevents technical momentum runners with deteriorating balance sheets from being marked as Favorable.*

### Anti-Flicker Hysteresis
* **Upgrade to `FAVORABLE`:** Requires $\text{Core Score} \ge 68$.
* **Downgrade from `FAVORABLE`:** Occurs only when $\text{Core Score} < 66$.

---

## 6. Decoupled Execution Layer (Corridors & Hard Guards)

Analytical scoring answers **qualification**. The Execution Layer answers **execution safety**.

### 1. Hard Liquidity Guard
$$\text{20-Day Average Turnover (₹ Cr)} = \frac{\sum_{i=1}^{20} (\text{Close}_i \times \text{Volume}_i)}{20 \times 10^7} \ge 5.0\text{ Cr}$$
* If turnover $< ₹5\text{ Cr} \implies$ Terminate with **`REJECT_LOW_LIQUIDITY`**.

### 2. Circuit Proximity Guard
* If $\text{LTP} \ge \text{Upper Circuit} \times 0.995$ or $\text{LTP} \le \text{Lower Circuit} \times 1.005 \implies$ Terminate with **`REJECT_CIRCUIT_LOCKED`**.

### 3. Dynamic Structural Stop Loss
$$\text{Stop Loss} = \min(\text{Swing Low}_{10\text{ bars}}, \text{LTP} - 2 \times \text{ATR}_{14})$$
*Stops are anchored to market volatility and price structure, never arbitrarily adjusted.*

### 4. Pullback Max Entry Corridor Equation
Enforces mandatory Risk-to-Reward ($R_{\min} = 1.5$ for Swing; $R_{\min} = 2.0$ for Balanced & Long-Term):

$$\mathbf{\text{Max Entry}} = \frac{\text{Target} + (R_{\min} \times \text{Stop})}{1 + R_{\min}}$$

* **If $\text{LTP} \le \text{Max Entry}$:** Status is **`READY_TO_BUY`**.
* **If $\text{LTP} > \text{Max Entry}$:** Status is **`EXTENDED_WAIT_FOR_PULLBACK`** (displays exact permissible limit entry price).

---

## 7. UI / UX Design Specifications (Tailwind CSS)

The frontend is modeled after modern high-density financial terminals (TradingView & Bloomberg Terminal style):

* **Color Palette (Dark Terminal):**
  * Background: Slate/Carbon (`bg-[#0B0F19]`, `bg-[#111827]`)
  * Card Surfaces & Panels: (`bg-[#182234]`, `border-[#1E293B]`)
  * Favorable / Green: Institutional Emerald (`text-[#10B981]`, `bg-[#10B981]/10`)
  * Caution / Red: Ruby Rose (`text-[#F43F5E]`, `bg-[#F43F5E]/10`)
  * Warnings / Amber: Gold Amber (`text-[#F59E0B]`, `bg-[#F59E0B]/10`)
* **Typography:**
  * System Font: Inter / Geist Sans for clean readability.
  * Number Formatting: **`font-mono tabular-nums`** across all prices, ratios, and percentages to completely eliminate number-flicker on live updates.
* **Core Score Visualizer:**
  * Circular radial gauge or split horizontal progress bar displaying **Fundamental (0–50) + Technical (0–50) = Core (0–100)**.
* **Execution Status Badges:**
  * Animated pulsing badge for `READY_TO_BUY` (green).
  * High-visibility banner for `EXTENDED_WAIT_FOR_PULLBACK` displaying distance to Max Entry.
  * Crimson alert pill for `RED_FLAG_CASH_DIVERGENCE` and `RED_FLAG_PROMOTER_PLEDGE`.

---

## 8. Automated Regression Benchmark Suite

Every release is audited against live Upstox responses for representative benchmark symbols:

1. **`INE002A01018` (RELIANCE):** High-market-cap Industrial benchmark (validates EV/EBITDA, OPM, Debt-to-Equity, 3Y CAGR, 200-EMA).
2. **`INE467B01029` (TCS):** Cash-rich IT benchmark (validates CFO/EBITDA $>0.8$, zero-debt scoring, ROCE $>40\%$).
3. **`INE040A01034` (HDFCBANK):** Tier-1 Commercial Bank benchmark (validates ROA, ROE, P/B vs Sector, Credit Cost stability).
4. **`INE296A01024` (BAJFINANCE):** High-growth NBFC benchmark (validates ROA $>4\%$, ROE $>20\%$, and loan-spread sustainability).
