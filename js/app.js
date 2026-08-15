document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', fetchMarketData);
  }

  fetchMarketData();
});

async function fetchMarketData() {
  const signalBox = document.getElementById('signalDisplay');
  signalBox.className = "signal-box signal-neutral";
  signalBox.innerText = "DESCARGANDO DATOS DE SOLANA...";

  // Endpoint alternativo público de Binance optimizado para evitar bloqueos CORS en navegadores
  const url = 'https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1d&limit=250';

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No hay datos disponibles");
    }

    const closes = data.map(candle => parseFloat(candle[4]));
    const volumes = data.map(candle => parseFloat(candle[5]));

    runStrategy(closes, volumes);
  } catch (error) {
    console.error("Error al obtener datos:", error);
    signalBox.innerText = "ERROR DE RED. INTENTA DE NUEVO";
  }
}

function runStrategy(closes, volumes) {
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

  document.getElementById('currentPrice').innerText = `$${currentClose.toFixed(2)}`;
  document.getElementById('currentEma').innerText = `$${currentEma.toFixed(2)}`;
  document.getElementById('currentRsi').innerText = currentRsi.toFixed(2);
  
  const signalBox = document.getElementById('signalDisplay');
  
  if (condBuyDca) {
    signalBox.className = "signal-box signal-dca";
    signalBox.innerText = "🚨 SEÑAL ACTIVA: INICIAR DCA (COMPRAR)";
  } else if (condSell) {
    signalBox.className = "signal-box signal-sell";
    signalBox.innerText = "🚨 SEÑAL ACTIVA: VENDER / SALIR";
  } else {
    signalBox.className = "signal-box signal-neutral";
    signalBox.innerText = "⏳ MERCADO NEUTRAL (ESPERANDO CONDICIONES)";
  }
}
