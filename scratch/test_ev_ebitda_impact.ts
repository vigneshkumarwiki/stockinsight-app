import { FundamentalEngine } from '../src/engine/fundamentalEngine';
import { FundamentalCalculations } from '../src/engine/calculators/fundamental';

function testEvEbitdaScoring() {
  const baseCalcs: FundamentalCalculations = {
    pe: 22.8,
    sectorPe: 28.5,
    pb: 3.1,
    sectorPb: 3.8,
    evEbitda: 11.9,
    sectorEvEbitda: 15.4,
    roe: 14.9,
    roce: 19.5,
    roa: 10.2,
    opmPct: 13.9,
    netProfitCagr3YPct: 21.0,
    debtToEquity: 0.37,
    cfoToEbitdaRatio: 0.846,
    cumulativeCfo3Y: 3960,
    cumulativePat3Y: 2718,
    latestQuarterlyPatYoYPct: 16.5,
    provisionGrowthPct: null,
  };

  const scoreNormal = FundamentalEngine.scoreIndustrial({ ...baseCalcs, evEbitda: 11.9 });
  const scoreExtreme668 = FundamentalEngine.scoreIndustrial({ ...baseCalcs, evEbitda: 668.6 });
  const scoreExtreme5000 = FundamentalEngine.scoreIndustrial({ ...baseCalcs, evEbitda: 5000.0 });
  const scoreNull = FundamentalEngine.scoreIndustrial({ ...baseCalcs, evEbitda: null });

  console.log('=== FUNDAMENTAL SCORING IMPACT TEST ===');
  console.log('Normal (11.9x): Total =', scoreNormal.totalScore, '| EV Factor =', scoreNormal.factors.find(f => f.name === 'EV / EBITDA')?.score, '| Valuation Bucket =', scoreNormal.buckets.valuationBucket);
  console.log('Extreme (668.6x): Total =', scoreExtreme668.totalScore, '| EV Factor =', scoreExtreme668.factors.find(f => f.name === 'EV / EBITDA')?.score, '| Valuation Bucket =', scoreExtreme668.buckets.valuationBucket);
  console.log('Extreme (5000x): Total =', scoreExtreme5000.totalScore, '| EV Factor =', scoreExtreme5000.factors.find(f => f.name === 'EV / EBITDA')?.score, '| Valuation Bucket =', scoreExtreme5000.buckets.valuationBucket);
  console.log('Missing (null): Total =', scoreNull.totalScore, '| EV Factor =', scoreNull.factors.find(f => f.name === 'EV / EBITDA')?.score, '| Valuation Bucket =', scoreNull.buckets.valuationBucket);
}

testEvEbitdaScoring();
