import { UpstoxClient } from '../src/api/upstoxClient';
import { FundamentalsDatabase } from '../src/data/fundamentalsDatabase';
import { FundamentalCalculator } from '../src/engine/calculators/fundamental';
import { FundamentalEngine } from '../src/engine/fundamentalEngine';
import { StockInsightPipeline } from '../src/engine';
import { SearchService } from '../src/api/searchService';

async function auditArem() {
  console.log('=== ARE&M EV/EBITDA AUDIT ===\n');

  const inst = SearchService.getInstrumentBySymbol('ARE&M');
  console.log('1. SearchService Instrument:', inst);

  const funds = FundamentalsDatabase.getFundamentals('ARE&M', inst?.isin, inst?.name, inst?.sector);
  console.log('2. FundamentalsDatabase Profile:', funds.profile.data);
  console.log('3. FundamentalsDatabase Key Ratios:', funds.keyRatios.data);

  const client = new UpstoxClient();
  const evalData = await client.getEvaluationData('ARE&M');
  console.log('4. EvalData Key Ratios:', evalData.keyRatios.data);

  const evalResult = StockInsightPipeline.evaluate(evalData, 'ARE&M');
  console.log('5. Evaluation Result Fundamental Factors:');
  evalResult.fundamentalFactors.forEach(f => {
    console.log(`   - ${f.name} [${f.bucket}]: raw=${f.rawValue}, score=${f.score}/${f.weight}, expl=${f.explanation}`);
  });

  console.log('\n6. Fundamental Buckets:', evalResult.fundamentalBuckets);
  console.log('7. Fundamental Total Score:', evalResult.fundamentalScore);
}

auditArem().catch(console.error);
