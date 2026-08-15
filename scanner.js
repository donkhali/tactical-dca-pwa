const fetch = require('node-fetch');

const Indicators = {
  ema(data, period) {
    const k = 2 / (period + 1);
    let emaArray = [];
    let prevEma = data[0];
    emaArray.push(prevEma);
    
    for (let i = 1; i < data.length; i++) {
      let currentEma = (data[i] * k) + (prevEma * (1 - k));
      emaArray.push(currentEma);
      prevEma = currentEma;
    }
    return emaArray;
  },

  rsi(closes, period = 14) {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      let change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    let rsiArray = new Array(period).fill(50);

    for (let i = period + 1; i < closes.length; i++) {
      let change = closes[i] - closes[i - 1];
      let gain = change > 0 ? change : 0;
      let loss = change < 0 ? -change : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsiArray.push(100);
      } else {
        let rs = avgGain / avgLoss;
        rsiArray.push(100 - (100 / (1 + rs)));
      }
    }
    return rsiArray;
  },

  obv(closes, volumes) {
    let obvArray = [0];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obvArray.push(obvArray[i - 1] + volumes[i]);
      } else if (closes[i] < closes[i - 1]) {
        obvArray.push(obvArray[i - 1] - volumes[i]);
      } else {
        obvArray.push(obvArray[i - 1]);
      }
    }
    return obvArray;
  }
};

const runScanner = async () => {
  // CoinGecko provee el histórico completo de Solana con suficientes días para la EMA 200
  const url = 'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=365&interval=daily';

  console.log(`[Scanner] Descargando datos históricos de Solana desde CoinGecko...`);

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.prices || data.prices.length === 0) {
      console.error("[Error] No se obtuvieron datos de la API de CoinGecko.");
      process.exit(1);
    }

    // Extraer cierres y volúmenes limpios
    const closes = data.prices.map(item => item[1]);
    const volumes = data.total_volumes.map(item => item[1]);

    console.log(`[Scanner] Registros totales cargados con éxito: ${closes.length}`);

    if (closes.length < 200) {
      console.error("[Error] Se requieren al menos 200 registros para calcular la EMA.");
      process.exit(1);
    }

    const ema200Arr = Indicators.ema(closes, 200);
    const rsiArr = Indicators.rsi(closes, 14);
    const obvArr = Indicators.obv(closes, volumes);
    const obvEmaArr = Indicators.ema(obvArr, 20);

    const currentClose = closes[closes.length - 1];
    const currentEma = ema200Arr[ema200Arr.length - 1];
    const currentRsi = rsiArr[rsiArr.length - 1];

    const prevObv = obvArr[obvArr.length - 2];
    const prevObvEma = obvEmaArr[obvEmaArr.length - 2];
    const currObv = obvArr[obvArr.length - 1];
    const currObvEma = obvEmaArr[obvEmaArr.length - 1];

    const obvCrossover = prevObv <= prevObvEma && currObv > currObvEma;

    const isDowntrend = currentClose < currentEma;
    const condBuyDca = isDowntrend && currentRsi < 30;
    const condSell = obvCrossover;

    console.log(`--- ESTADO ACTUAL SOLANA (SOL/USD) ---`);
    console.log(`Precio: $${currentClose.toFixed(2)} | EMA 200: $${currentEma.toFixed(2)} | RSI: ${currentRsi.toFixed(2)}`);

    if (condBuyDca) {
      console.log(`🚨 [ALERTA] ¡SEÑAL DE COMPRA DCA ACTIVADA PARA SOLANA!`);
    } else if (condSell) {
      console.log(`🚨 [ALERTA] ¡SEÑAL DE VENTA ACTIVADA PARA SOLANA!`);
    } else {
      console.log(`⏳ Mercado Neutral. Sin acciones requeridas.`);
    }

  } catch (error) {
    console.error("[Error crítico] Falló la ejecución del script:", error);
    process.exit(1);
  }
};

runScanner();
