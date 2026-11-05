import { UpstoxClient } from '../src/api/upstoxClient';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { ExecutionEngine } from '../src/engine/executionEngine';
import { PriceStructureEngine } from '../src/engine/priceStructureEngine';
import { StockInsightPipeline } from '../src/engine';

async function traceStopLossMath() {
  const client = new UpstoxClient();
  const tmcvData = await client.getEvaluationData('TMCV');
  const evaluation = StockInsightPipeline.evaluate(tmcvData, 'TMCV');

  console.log('=== TMCV STOP LOSS TRACE ===');
  console.log('LTP:', evaluation.execution.ltp);
  console.log('ATR14 (from techCalcs):', evaluation.technicalFactors?.atr14 || evaluation.priceStructure?.metadata?.atr14);
  console.log('Swing Low 10:', evaluation.priceStructure?.metadata?.swingLow10);
  console.log('Swing Low 20:', evaluation.priceStructure?.metadata?.swingLow20);
  console.log('52W Low:', evaluation.priceStructure?.metadata?.low52W);
  console.log('SMA 50:', evaluation.priceStructure?.metadata?.sma50);
  console.log('SMA 100:', evaluation.priceStructure?.metadata?.sma100);
  console.log('EMA 200:', evaluation.priceStructure?.metadata?.ema200);

  console.log('\n1. EXECUTION CORRIDOR STOP LOSS:');
  console.log('evaluation.execution.stopLoss:', evaluation.execution.stopLoss);
  console.log('Formatted in UI: ₹' + evaluation.execution.stopLoss.toFixed(1));
  console.log('Formula:');
  console.log('  minAllowedStopDistance = 1.5 * atr14 =', 1.5 * (evaluation.priceStructure?.metadata?.atr14 || 0));
  console.log('  atrStop = ltp - 2 * atr14 =', evaluation.execution.ltp - 2 * (evaluation.priceStructure?.metadata?.atr14 || 0));
  console.log('  ltp - minAllowedStopDistance =', evaluation.execution.ltp - 1.5 * (evaluation.priceStructure?.metadata?.atr14 || 0));

  console.log('\n2. PRICE STRUCTURE PROTECTIVE STOP LOSS:');
  console.log('evaluation.priceStructure.stopLoss:', evaluation.priceStructure?.stopLoss);
  console.log('Formatted in UI: ₹' + evaluation.priceStructure?.stopLoss?.price.toFixed(1));
  console.log('E1:', evaluation.priceStructure?.entries.e1);
  console.log('E2:', evaluation.priceStructure?.entries.e2);
  console.log('E3:', evaluation.priceStructure?.entries.e3);

  // Let's also check if there is another stock where 739.7 and 731.1 was observed
  // Let's test different ATR / swing low values
  const ltp = 780.0;
  // If ATR = 26.87:
  // 1.5 * 26.87 = 40.305 -> 780 - 40.305 = 739.695 ≈ 739.7!
  // If deepest support is E1 = 744.53, rawStop = 744.53 - 0.5 * 26.87 = 744.53 - 13.435 = 731.095 ≈ 731.1!
  console.log('\n3. MATHEMATICAL RECONSTRUCTION OF OBSERVED VALUES (₹739.7 vs ₹731.1):');
  const targetAtr = (780.0 - 739.7) / 1.5;
  console.log('Implied ATR for Execution Stop ₹739.7 at LTP ₹780:', targetAtr);
  const impliedDeepestSupport = 731.1 + 0.5 * targetAtr;
  console.log('Implied Deepest Support for Protective Stop ₹731.1 with 0.5*ATR buffer:', impliedDeepestSupport);
}

traceStopLossMath().catch(console.error);
