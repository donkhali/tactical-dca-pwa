const symbol = 'SOLUSDT';
  const interval = '4h';
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`;

  console.log(`[Scanner] Descargando histórico optimizado de ${symbol} (${interval}) desde Binance...`);

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.error("[Error] La API de Binance no devolvió datos.");
      process.exit(1);
    }

    allCandles = data;
    console.log(`[Scanner] Velas totales cargadas con éxito: ${allCandles.length}`);
