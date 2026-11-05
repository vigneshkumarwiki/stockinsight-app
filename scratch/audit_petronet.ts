import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { FundamentalCalculator } from '../src/engine/calculators/fundamental';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { FUNDAMENTALS_MASTER } from '../src/data/fundamentalsDatabase';

async function auditPetronet() {
  const client = new UpstoxClient();
  const raw = await client.getEvaluationData('PETRONET', 'INE347G01014');
  const evalData = StockInsightPipeline.evaluate(raw, 'PETRONET');

  console.log('--- PETRONET RAW KEY RATIOS ---');
  console.log(raw.keyRatios.data);

  console.log('--- PETRONET INCOME STATEMENT ---');
  console.log(raw.annualIncome.data.income_statement);

  console.log('--- PETRONET BALANCE SHEET ---');
  console.log(raw.balanceSheet.data);

  console.log('--- PETRONET CASH FLOW ---');
  console.log(raw.cashFlow.data);

  console.log('--- PETRONET FUNDAMENTAL CALCULATIONS ---');
  const fundCalcs = FundamentalCalculator.compute(
    raw.keyRatios,
    raw.annualIncome,
    raw.quarterlyIncome,
    raw.balanceSheet,
    raw.cashFlow
  );
  console.log(fundCalcs);

  console.log('--- PETRONET FUNDAMENTAL FACTORS ---');
  console.log(evalData.fundamentalFactors);

  console.log('--- PETRONET TECHNICAL FACTORS ---');
  console.log(evalData.technicalFactors);

  console.log('--- PETRONET SCORES ---');
  console.log({
    fundamentalScore: evalData.fundamentalScore,
    technicalScore: evalData.technicalScore,
    coreScore: evalData.coreScore,
    zone: evalData.zone,
    zoneReason: evalData.zoneReason,
  });
}

auditPetronet();
