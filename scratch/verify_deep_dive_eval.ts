import { StockInsightPipeline } from '../src/engine/index.ts';
import { UpstoxClient } from '../src/api/upstoxClient.ts';

async function main() {
  const client = new UpstoxClient();
  const symbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE', 'GOLDBEES', 'ARE&M'];
  
  for (const s of symbols) {
    const stockData = await client.getEvaluationData(s);
    const evalResult = StockInsightPipeline.evaluate(stockData);
    console.log(`[PASS] ${s} -> CoreScore: ${evalResult.coreScore.toFixed(1)}, Zone: ${evalResult.zone}, LTP: ₹${evalResult.execution.ltp}, E1: ₹${evalResult.priceStructure.entries.e1?.price?.toFixed(1) ?? 'N/A'}, S1: ₹${evalResult.priceStructure.stops?.s1?.price?.toFixed(1) ?? 'N/A'}, T1: ₹${evalResult.priceStructure.targets.t1?.price?.toFixed(1) ?? 'N/A'}`);
  }
  console.log('\nALL 6 SYMBOLS EVALUATED CLEANLY THROUGH END-TO-END PIPELINE!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
