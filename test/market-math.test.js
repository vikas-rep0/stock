import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSMA, calculateRSI, determineTechnicalTrend, calculateInvestment } from './market-math.js';

test('calculateSMA computes moving average correctly', () => {
  const prices = [10, 20, 30, 40, 50];
  const sma3 = calculateSMA(prices, 3);
  // (30 + 40 + 50) / 3 = 40
  assert.equal(sma3, 40);
  
  assert.equal(calculateSMA([10, 20], 5), null);
});

test('calculateRSI computes reasonable 14-day RSI', () => {
  // Rising series
  const risingPrices = [100, 102, 104, 105, 107, 109, 112, 115, 118, 120, 122, 125, 127, 130, 133, 136];
  const rsiRising = calculateRSI(risingPrices, 14);
  assert.ok(rsiRising > 70, `RSI should be overbought (>70), got ${rsiRising}`);

  // Falling series
  const fallingPrices = [136, 133, 130, 127, 125, 122, 120, 118, 115, 112, 109, 107, 105, 104, 102, 100];
  const rsiFalling = calculateRSI(fallingPrices, 14);
  assert.ok(rsiFalling < 30, `RSI should be oversold (<30), got ${rsiFalling}`);
});

test('determineTechnicalTrend returns Bullish, Bearish, or Neutral correctly', () => {
  // Price above 20 and 50 DMA with healthy RSI
  assert.equal(determineTechnicalTrend(150, 140, 130, 60), 'Bullish');
  
  // Price below 20 and 50 DMA
  assert.equal(determineTechnicalTrend(120, 140, 130, 40), 'Bearish');
  
  // Mixed
  assert.equal(determineTechnicalTrend(135, 140, 130, 50), 'Neutral');
});

test('calculateInvestment computes lump-sum compounding and real value', () => {
  // $10,000 for 10 years at 10%
  const result = calculateInvestment({
    amount: 10000,
    isMonthlySIP: false,
    years: 10,
    expectedReturnPercent: 10,
    inflationPercent: 4,
    taxRatePercent: 15,
  });

  assert.equal(result.totalInvested, 10000);
  // 10000 * 1.10^10 = 25937
  assert.ok(result.finalValue >= 25900 && result.finalValue <= 26000);
  assert.ok(result.gain > 15000);
  // Real value should be lower than nominal because of inflation
  assert.ok(result.realValue < result.finalValue);
  // Value after tax should be lower than final nominal value
  assert.ok(result.valueAfterTax < result.finalValue);
  assert.equal(result.timeline.length, 10);
});

test('calculateInvestment computes monthly SIP compounding', () => {
  // $1,000 per month for 5 years at 12%
  const result = calculateInvestment({
    amount: 1000,
    isMonthlySIP: true,
    years: 5,
    expectedReturnPercent: 12,
    inflationPercent: 5,
    taxRatePercent: 10,
  });

  assert.equal(result.totalInvested, 60000); // 1000 * 60
  // Monthly SIP 1000 for 5 years at 12% is approx ~82,486
  assert.ok(result.finalValue > 80000 && result.finalValue < 85000);
  assert.ok(result.gain > 20000);
  assert.equal(result.timeline.length, 5);
});
