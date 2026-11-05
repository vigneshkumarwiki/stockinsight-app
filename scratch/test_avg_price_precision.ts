import assert from 'assert';
import { PortfolioEngine } from '../src/engine/portfolioEngine.ts';
import { Holding } from '../src/types/portfolio.ts';
import { StockInsightEvaluation } from '../src/types/engine.ts';

function testAvgBuyPricePrecision() {
  console.log('--- TESTING AVG BUY PRICE PRECISION & ACCOUNTING ---');

  const testPrices = [212.30, 212.31, 212.35, 0.01, 0.0, 150000.55];

  for (const price of testPrices) {
    const holding: Holding = {
      id: `test_${price}`,
      symbol: 'TESTSTOCK',
      companyName: 'Test Stock Limited',
      sector: 'Technology',
      isin: 'INE123A01011',
      quantity: 100,
      averageBuyPrice: price,
      addedAt: new Date().toISOString(),
    };

    const mockEval: StockInsightEvaluation = {
      tradingSymbol: 'TESTSTOCK',
      companyName: 'Test Stock Limited',
      isin: 'INE123A01011',
      instrumentKey: 'NSE_EQ|INE123A01011',
      sector: 'INDUSTRIAL',
      sectorName: 'Technology',
      instrumentType: 'EQUITY',
      dataSource: 'DEMO',
      fundamentalStatus: 'LIVE',
      integrity: { status: 'PASSED', flags: [], message: 'OK' },
      fundamentalBuckets: {} as any,
      technicalBuckets: {} as any,
      fundamentalScore: 30,
      technicalScore: 30,
      coreScore: 60,
      zone: 'FAVORABLE',
      zoneReason: 'Healthy',
      fundamentalFactors: [],
      technicalFactors: [],
      safety: { fundamentalFloorFailed: false, promoterPledgeHigh: false, accountingDiscrepancy: false, circuitLocked: false, lowLiquidity: false, flags: [] },
      execution: { status: 'READY_TO_BUY', ltp: 250.00, stopLoss: 230, maxEntry: 255, target: 290, minimumRR: 2.0, bidAskSpreadPct: 0.05, highSlippageRisk: false, antiStopCompressionApplied: false, distanceToMaxEntryPct: 0, twentyDayTurnoverCr: 50 },
      priceStructure: {} as any,
      horizons: {} as any,
      netChange: 1.0,
      netChangePct: 0.4,
      evaluatedAt: new Date().toISOString(),
    };

    const evalMap = new Map<string, StockInsightEvaluation>([['TESTSTOCK', mockEval]]);
    const { items, analytics } = PortfolioEngine.analyze([holding], evalMap);

    const item = items[0];
    const expectedInvested = 100 * price;
    const expectedPnl = 100 * 250.00 - expectedInvested;

    assert.strictEqual(item.holding.averageBuyPrice, price, `Holding price ${price} matches exactly`);
    assert.strictEqual(item.investedValue, expectedInvested, `Invested value matches for ${price}`);
    assert.strictEqual(item.pnl, expectedPnl, `P&L matches for ${price}`);
    console.log(`✓ Price ₹${price.toFixed(2)}: Invested=₹${item.investedValue.toFixed(2)}, P&L=₹${item.pnl?.toFixed(2)}`);
  }

  console.log('\nALL MONETARY PRECISION TESTS PASSED!');
}

testAvgBuyPricePrecision();
