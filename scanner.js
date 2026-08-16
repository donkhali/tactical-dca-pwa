const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const THREAD_ID = process.env.THREAD_ID;

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !CHAT_ID) {
    console.error("[Telegram Error] Faltan configurar las credenciales en los Secrets de GitHub.");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: CHAT_ID,
    message_thread_id: THREAD_ID,
    text: message,
    parse_mode: "Markdown"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.ok) {
      console.log("[Telegram] Alerta enviada con éxito al hilo.");
    } else {
      console.error("[Telegram Error] No se pudo enviar el mensaje:", result);
    }
  } catch (error) {
    console.error("[Telegram Error] Error de red al enviar la alerta:", error);
  }
}

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
  // Endpoint público alternativo compatible con servidores cloud (GitHub Actions)
  const url = 'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=365&interval=daily';

  console.log(`[Scanner] Descargando histórico de Solana desde CoinGecko (Cloud-Friendly)...`);

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.prices || !Array.isArray(data.prices) || data.prices.length === 0) {
      console.error("[Error] La API no devolvió datos válidos.");
      process.exit(1);
    }

    console.log(`[Scanner] Datos cargados con éxito. Total de registros: ${data.prices.length}`);

    const closes = data.prices.map(item => item[1]);
    const volumes = data.total_volumes.map(item => item[1]);

    const ema200Arr = Indicators.ema(closes, 200);
    const rsiArr = Indicators.rsi(closes, 14);
    const obvArr = Indicators.obv(closes, volumes);
    const obvEmaArr = Indicators.ema(obvArr, 20);

    const currentClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    
    const currentEma = ema200Arr[ema200Arr.length - 1];
    const prevEma = ema200Arr[ema200Arr.length - 2];
    
    const currentRsi = rsiArr[rsiArr.length - 1];

    const prevObv = obvArr[obvArr.length - 2];
    const prevObvEma = obvEmaArr[obvEmaArr.length - 2];
    const currObv = obvArr[obvArr.length - 1];
    const currObvEma = obvEmaArr[obvEmaArr.length - 1];

    const obvCrossover = prevObv <= prevObvEma && currObv > currObvEma;
    const crossedBelowEma = prevClose >= prevEma && currentClose < currentEma;

    const isDowntrend = currentClose < currentEma;
    const condBuyDca = isDowntrend && currentRsi < 30;
    const condSell = obvCrossover;

    console.log(`--- ESTADO ACTUAL SOLANA (SOL/USD) ---`);
    console.log(`Precio: $${currentClose.toFixed(2)} | EMA 200: $${currentEma.toFixed(2)} | RSI: ${currentRsi.toFixed(2)}`);

    let statusMessage = `📊 *Reporte Táctico Solana (SOL)*\n\n`;
    statusMessage += `• Precio: \`$${currentClose.toFixed(2)}\`\n`;
    statusMessage += `• EMA 200: \`$${currentEma.toFixed(2)}\`\n`;
    statusMessage += `• RSI (14): \`${currentRsi.toFixed(2)}\`\n\n`;

    if (crossedBelowEma) {
      statusMessage += `⚠️ *¡ALERTA: CRUCE BAJISTA DE EMA 200 DETECTADO!*`;
      console.log(`⚠️ [ALERTA] ¡CRUCE BAJISTA DE EMA 200!`);
      await sendTelegramAlert(statusMessage);
    } else if (condBuyDca) {
      statusMessage += `🚨 *¡SEÑAL ACTIVA: INICIAR DCA (COMPRAR)!*\nEl precio está bajo la EMA 200 y el RSI se encuentra en sobreventa (<30).`;
      console.log(`🚨 [ALERTA] ¡SEÑAL DE COMPRA DCA ACTIVADA!`);
      await sendTelegramAlert(statusMessage);
    } else if (condSell) {
      statusMessage += `🚨 *¡SEÑAL ACTIVA: VENDER / SALIR!*\nSe ha detectado un cruce alcista en el OBV.`;
      console.log(`🚨 [ALERTA] ¡SEÑAL DE VENTA ACTIVADA!`);
      await sendTelegramAlert(statusMessage);
    } else {
      statusMessage += `⏳ Mercado Neutral. Sin acciones requeridas en este ciclo.`;
      console.log(`⏳ Mercado Neutral.`);
      // await sendTelegramAlert(statusMessage);
    }

  } catch (error) {
    console.error("[Error crítico] Falló la ejecución del script:", error);
    process.exit(1);
  }
};

runScanner();
