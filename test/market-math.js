// Pure market mathematics and technical indicators

export function calculateSMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const slice = prices.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return Number((sum / period).toFixed(2));
}

export function calculateRSI(prices, period = 14) {
  if (!prices || prices.length <= period) return 50; // default neutral if not enough data
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return Number(rsi.toFixed(1));
}

export function determineTechnicalTrend(currentPrice, sma20, sma50, rsi) {
  if (!currentPrice || !sma20 || !sma50) return 'Neutral';
  
  const above20 = currentPrice > sma20;
  const above50 = currentPrice > sma50;
  
  if (above20 && above50 && rsi >= 45 && rsi <= 75) {
    return 'Bullish';
  } else if (!above20 && !above50 && (rsi < 48 || rsi > 75)) {
    return 'Bearish';
  } else if (above20 && above50 && rsi > 75) {
    return 'Bullish'; // strong momentum though slightly overbought
  } else if (!above20 && !above50) {
    return 'Bearish';
  }
  return 'Neutral';
}

export function calculateInvestment({
  amount,
  isMonthlySIP,
  years,
  expectedReturnPercent,
  inflationPercent = 0,
  taxRatePercent = 0,
}) {
  const annualReturn = expectedReturnPercent / 100;
  const annualInflation = inflationPercent / 100;
  const taxRate = taxRatePercent / 100;
  
  let totalInvested = 0;
  let finalValue = 0;
  const timeline = []; // yearly points
  
  if (isMonthlySIP) {
    const monthlyRate = annualReturn / 12;
    const totalMonths = years * 12;
    totalInvested = amount * totalMonths;
    
    // Formula for annuity due: P * [((1+r)^n - 1) / r] * (1+r)
    if (monthlyRate === 0) {
      finalValue = totalInvested;
    } else {
      finalValue = amount * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate);
    }
    
    // Calculate year by year for chart
    for (let y = 1; y <= years; y++) {
      const months = y * 12;
      const investedY = amount * months;
      const valueY = monthlyRate === 0 ? investedY : amount * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
      const realValueY = valueY / Math.pow(1 + annualInflation, y);
      const gainY = Math.max(0, valueY - investedY);
      const taxedValueY = investedY + gainY * (1 - taxRate);
      timeline.push({
        year: y,
        invested: Math.round(investedY),
        nominalValue: Math.round(valueY),
        realValue: Math.round(realValueY),
        taxedValue: Math.round(taxedValueY),
      });
    }
  } else {
    // Lump sum: P * (1 + r)^years
    totalInvested = amount;
    finalValue = amount * Math.pow(1 + annualReturn, years);
    
    for (let y = 1; y <= years; y++) {
      const investedY = amount;
      const valueY = amount * Math.pow(1 + annualReturn, y);
      const realValueY = valueY / Math.pow(1 + annualInflation, y);
      const gainY = Math.max(0, valueY - investedY);
      const taxedValueY = investedY + gainY * (1 - taxRate);
      timeline.push({
        year: y,
        invested: Math.round(investedY),
        nominalValue: Math.round(valueY),
        realValue: Math.round(realValueY),
        taxedValue: Math.round(taxedValueY),
      });
    }
  }
  
  const gain = Math.max(0, finalValue - totalInvested);
  const realValue = finalValue / Math.pow(1 + annualInflation, years);
  const valueAfterTax = totalInvested + gain * (1 - taxRate);
  
  return {
    totalInvested: Math.round(totalInvested),
    finalValue: Math.round(finalValue),
    gain: Math.round(gain),
    realValue: Math.round(realValue),
    valueAfterTax: Math.round(valueAfterTax),
    timeline,
  };
}
