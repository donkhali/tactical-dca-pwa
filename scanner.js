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
  const symbol = 'SOLUSDT';
  const interval = '4h';
  let allCandles = [];
  
  // 4 horas en milisegundos = 4 * 60 * 60 * 1000 = 14,400,000 ms por vela.
  // 1000 velas de 4h = 1000 * 14,400,000 = 14,400,000,000 ms por petición.
  const limitPerRequest = 1000;
  const totalRequests = 5; // 5 peticiones * 1000 velas = 5,000 velas objetivo
  
  let endTime = Date.now();

  console.log(`[Scanner] Descargando histórico de ${symbol} (${interval}) - Objetivo: 5,000 velas...`);

  for (let i = 0; i < totalRequests; i++) {
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limitPerRequest}&endTime=${endTime}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      // Añadimos al inicio del arreglo para mantener el orden cronológico antiguo -> reciente
      allCandles = data.concat(allCandles);
      
      // Actualizamos el endTime al timestamp de apertura de la primera vela recibida menos 1ms
      endTime = data[0][0] - 1;
    } catch (error) {
      console.error("[Error] Falló la descarga de datos de Binance:", error);
      process.exit(1);
    }
  }

  console.log(`[Scanner] Velas totales cargadas con éxito: ${allCandles.length}`);

  if (allCandles.length < 200) {
    console.error("[Error] No hay suficientes velas para calcular los indicadores.");
    process.exit(1);
  }

  const closes = allCandles.map(c => parseFloat(c[4]));
  const volumes = allCandles.map(c => parseFloat(c[5]));

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

  console.log(`--- ESTADO ACTUAL SOLANA (SOLUSDT) ---`);
  console.log(`Precio: $${currentClose.toFixed(2)} | EMA 200: $${currentEma.toFixed(2)} | RSI: ${currentRsi.toFixed(2)}`);

  if (condBuyDca) {
    console.log(`🚨 [ALERTA] ¡SEÑAL DE COMPRA DCA ACTIVADA PARA SOLANA!`);
  } else if (condSell) {
    console.log(`🚨 [ALERTA] ¡SEÑAL DE VENTA ACTIVADA PARA SOLANA!`);
  } else {
    console.log(`⏳ Mercado Neutral. Sin acciones requeridas.`);
  }
};

runScanner();