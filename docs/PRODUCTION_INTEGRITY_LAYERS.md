# STOCKINSIGHT — 5 Mandatory Production Integrity Layers

This document details the exact mathematical formulas, threshold limits, and architectural enforcement rules for the **5 Production Integrity Layers** implemented in the STOCKINSIGHT engine.

---

## Layer 1: Data Integrity & Cross-Statement Forensic Auditor

The `DataAuditor` runs mandatory pre-flight checks on financial statements before fundamental metrics are scored.

### 1. Balance Sheet Equality Check
$$\Delta_{\text{BS}} = \frac{|\text{Total Assets} - (\text{Total Liabilities} + \text{Total Shareholders Equity})|}{\text{Total Assets}}$$
* **Threshold:** $\Delta_{\text{BS}} \le 0.001$ ($0.1\%$ rounding tolerance).
* **Breach Enforcement:**
  * Sets `bsBalanced = false`.
  * Sets `integrity.status = 'QUARANTINED'`.
  * Reasons logged: `DATA_QUARANTINED_UNBALANCED_BS`.
  * Execution corridor immediately locked with `REJECT_DATA_QUARANTINED`.

### 2. Cash Flow Reconciliation Check
Verifies that Profit Before Tax (PBT) reported in the Profit & Loss statement reconciles with the starting PBT line item in the Cash Flow operating statement:
$$\Delta_{\text{PBT}} = \frac{|\text{PBT}_{\text{CF}} - \text{PBT}_{\text{P\&L}}|}{\text{PBT}_{\text{P\&L}}}$$
* **Threshold:** $\Delta_{\text{PBT}} \le 0.10$ ($10\%$ tolerance).
* **Breach Enforcement:** Sets `cashFlowReconciled = false` and logs discrepancy reason.

### 3. Filing Freshness Guard
Tracks reporting age from the latest statement period string (e.g. `Jun 2026`):
$$\text{Freshness (days)} = \text{Date}_{\text{Now}} - \text{Date}_{\text{FilingEnd}}$$
* **Threshold:** $\text{Freshness} \le 180\text{ days}$.
* **Breach Enforcement:** If $> 180\text{ days}$, sets `staleFiling = true` and `status = 'STALE_FILING'`.

### 4. Capital Jump Anomaly Guard
Compares current equity share capital against previous fiscal year share capital:
$$\Delta_{\text{Equity}} = \frac{|\text{Equity}_{\text{Current}} - \text{Equity}_{\text{Prior}}|}{\text{Equity}_{\text{Prior}}}$$
* **Threshold:** $\Delta_{\text{Equity}} \le 50\%$.
* **Breach Enforcement:** If equity shifted $> 50\%$ without a documented corporate action (Bonus, Split, Rights), flags `capitalAnomaly = true` and sets `status = 'HOLD_PENDING_AUDIT'`.

---

## Layer 2: Fundamental Collinearity Controls & Sub-caps

To eliminate multi-collinearity and score runaway from correlated ratios, hard sub-caps are applied across metric families:

### Sub-cap Ceilings (Total Max: 50 Points)
1. **Valuation Sub-cap:** $\le 12\text{ Points}$
   * **Equity Multiples Sub-cap:** $\text{P/E} + \text{P/B} \le 7\text{ Points}$
   * **Enterprise Multiples Sub-cap:** $\text{EV/EBITDA} \le 5\text{ Points}$
2. **Capital Efficiency Sub-cap:** $\text{ROE} + \text{ROCE} \text{ (or ROA for banks)} \le 12\text{ Points}$
3. **Cash Quality Sub-cap:** $\text{CFO/EBITDA} \le 6\text{ Points}$
4. **Growth & Solvency Sub-cap:** $\text{CAGR} + \text{D/E} + \text{OPM} \le 20\text{ Points}$

### Accrual Trap Dominance Penalty
$$\text{If } (\text{Valuation Bucket} \ge 8 \lor \text{CAGR Score} \ge 5) \land \text{CFO} \le 0 \implies \mathbf{\text{Deduct 5 Points}}$$
Penalizes aggressive paper valuations unsupported by hard operational cash flow.

---

## Layer 3: Orthogonal Technical Buckets & Volume Veto

The Technical Engine is strictly grouped into 3 orthogonal factor families totaling **50 Points**:

### 1. Trend & Macro Regime Bucket (Max 20 Points)
* **200-EMA Macro Regime (10 pts):** Price $\ge$ rising 200-EMA ($10\text{ pts}$); Price $\ge$ flat 200-EMA ($6\text{ pts}$); Price $<$ 200-EMA ($0\text{ pts}$).
* **100-DMA Intermediate Trend (5 pts):** Price $\ge$ 100-DMA ($5\text{ pts}$); else $0\text{ pts}$.
* **Moving Average Stack (5 pts):** $50\text{-DMA} > 100\text{-DMA} > 200\text{-EMA}$ ($5\text{ pts}$); else $0\text{ pts}$.

### 2. Momentum & Mean Reversion Bucket (Max 15 Points)
* **RSI (14) Momentum Band (10 pts):**
  * Sweet spot ($50 \le \text{RSI} \le 68$): $10\text{ pts}$
  * Strong acceleration ($68 < \text{RSI} \le 75$): $6\text{ pts}$
  * Neutral pullback ($40 \le \text{RSI} < 50$): $3\text{ pts}$
  * Exhaustion ($>75$) or Breakdown ($<40$): $0\text{ pts}$
* **20-Day Rate of Change - ROC (5 pts):**
  * Velocity $> 5\%$: $5\text{ pts}$
  * Velocity $0\% < \text{ROC} \le 5\%$: $3\text{ pts}$
  * Negative: $0\text{ pts}$

### 3. Volume Confirmation Bucket (Max 15 Points)
* **Up/Down Volume Accumulation Ratio (8 pts):** Ratio $\ge 1.25$ ($8\text{ pts}$); $1.0 \le \text{Ratio} < 1.25$ ($5\text{ pts}$); Ratio $< 1.0$ ($2\text{ pts}$).
* **Breakout Volume Surge vs 20-Day SMA (7 pts):** $\ge 1.50\times$ ($7\text{ pts}$); $1.20\times\text{--}1.50\times$ ($4\text{ pts}$); $1.00\times\text{--}1.20\times$ ($2\text{ pts}$); $<1.00\times$ ($0\text{ pts}$).

### The Volume Veto Rule
$$\text{If } \mathbf{\text{Volume Confirmation Bucket}} < 5 / 15\text{ Points} \implies \mathbf{\text{Total Technical Score}} \le \mathbf{35 / 50}$$
Guarantees that unconfirmed retail breakouts on declining or distribution volume can never qualify as high-confidence trends.

---

## Layer 4: Anti-Gaming Execution Guards

The Decoupled Execution Layer prevents order execution traps:

### 1. Dynamic Stop Loss with Anti-Stop Compression Floor
* **Primary Structural Anchor:** 10-bar Swing Low ($\text{SwingLow}_{10}$).
* **Anti-Stop Compression Floor:**
  $$\text{Stop Distance} = \text{LTP} - \text{StopLoss} \ge 1.5 \times \text{ATR}_{14}$$
  $$\text{If } (\text{LTP} - \text{StopLoss}) < 1.5 \times \text{ATR}_{14} \implies \text{StopLoss} = \text{LTP} - 1.5 \times \text{ATR}_{14} \land \mathbf{\text{antiStopCompressionApplied = true}}$$
  Eliminates tight stops that get victimized by normal intra-day noise or market maker liquidity sweeps.

### 2. Bid-Ask Spread & Slippage Filter
$$\text{Spread \%} = \frac{\text{Best Ask} - \text{Best Bid}}{\text{LTP}} \times 100$$
* **Guardrail:** If $\text{Spread \%} > 0.40\% \implies \mathbf{\text{highSlippageRisk = true}}$.
* Market orders prohibited; passive limit orders strictly required.

### 3. Execution Guardrail State Machine
* `isQuarantined` $\implies$ **`REJECT_DATA_QUARANTINED`**
* $\text{Turnover}_{20\text{D}} < ₹5.0\text{ Cr}$ $\implies$ **`REJECT_LOW_LIQUIDITY`**
* $\text{LTP} \ge 0.995 \times \text{Circuit}_{\text{Upper}} \lor \text{LTP} \le 1.005 \times \text{Circuit}_{\text{Lower}}$ $\implies$ **`REJECT_CIRCUIT_LOCKED`**
* $\text{LTP} > \text{MaxEntry}$ $\implies$ **`EXTENDED_WAIT_FOR_PULLBACK`**
* Else $\implies$ **`READY_TO_BUY`**

---

## Layer 5: Benchmark Normalization & Mathematical Reconciliation

### Mathematical Identity
$$\mathbf{\sum \text{Fundamental Factors}} + \mathbf{\sum \text{Technical Factors}} \equiv \mathbf{\text{Core Score}} \in [0, 100]$$

### Institutional Benchmarks
* **RELIANCE (`INE002A01018`):** Industrial conglomerate benchmark.
* **TCS (`INE467B01029`):** Cash-rich zero-debt IT services benchmark.
* **HDFCBANK (`INE040A01034`):** Tier-1 Commercial Bank benchmark (ROA/ROE/Provisioning).
* **BAJFINANCE (`INE296A01024`):** High-growth NBFC benchmark.
