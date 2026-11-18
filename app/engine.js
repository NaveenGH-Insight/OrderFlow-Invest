(function () {
  'use strict';
  const instruments = [
    { symbol: 'NOVA', name: 'Nova Technologies', sector: 'Technology', base: 184800, color: 'violet', icon: 'chip' },
    { symbol: 'ATLAS', name: 'Atlas Commercial Bank', sector: 'Financials', base: 127240, color: 'blue', icon: 'bank' },
    { symbol: 'SOLA', name: 'Solara Renewables', sector: 'Clean energy', base: 43150, color: 'gold', icon: 'sun' },
    { symbol: 'MERID', name: 'Meridian Consumer', sector: 'Consumer goods', base: 86275, color: 'rose', icon: 'box' },
    { symbol: 'NORTH', name: 'Northstar Logistics', sector: 'Industrials', base: 59460, color: 'mint', icon: 'truck' },
    { symbol: 'VERDE', name: 'Verde Health', sector: 'Healthcare', base: 103220, color: 'green', icon: 'cross' },
    { symbol: 'HARB', name: 'Harbor Infrastructure', sector: 'Industrials', base: 69240, color: 'blue', icon: 'bank' },
    { symbol: 'QUANT', name: 'Quanta Networks', sector: 'Technology', base: 213290, color: 'violet', icon: 'chip' }
  ];
  const startingCash = 10000000;
  const maxQuantity = 10000;
  const barsKept = 120;
  const minute = 60000;

  function aggregate(trades) {
    const prices = trades.map(trade => trade.price);
    return {
      time: trades[0].time, open: prices[0], high: Math.max(...prices),
      low: Math.min(...prices), close: prices.at(-1),
      volume: trades.reduce((total, trade) => total + trade.quantity, 0)
    };
  }

  function nextRandom(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function appendBar(state, instrument, time) {
    const series = state.bars[instrument.symbol];
    let price = series.at(-1)?.close ?? instrument.base;
    const phase = ((time - state.epoch) / minute) / 8;
    const index = instruments.indexOf(instrument);
    const wave = Math.sin(phase + index * 1.7);
    const drift = [0.00024, -0.00012, 0.00015, -0.00011, 0.00015, -0.00021, 0.00012, 0.00019][index];
    const trades = Array.from({ length: 6 }, () => {
      const step = (nextRandom(state) - 0.5) * 0.0032 + wave * 0.00039 + drift;
      price = Math.max(100, Math.round(price * (1 + step)));
      return { price, quantity: 5 + Math.floor(nextRandom(state) * 340), time };
    });
    series.push(aggregate(trades));
    if (series.length > barsKept) series.shift();
  }

  function createState(now = Date.now()) {
    const time = Math.floor(now / minute) * minute;
    const state = {
      version: 1, epoch: time, time, seed: 835127, cash: startingCash, realized: 0,
      selected: 'NOVA', watch: instruments.slice(0, 6).map(item => item.symbol),
      positions: {}, orders: [], bars: Object.fromEntries(instruments.map(item => [item.symbol, []]))
    };
    for (let offset = barsKept - 1; offset >= 0; offset--) {
      for (const item of instruments) appendBar(state, item, time - offset * minute);
    }
    return state;
  }

  function advance(state) {
    state.time += minute;
    for (const item of instruments) appendBar(state, item, state.time);
  }

  function quote(state, symbol) {
    const series = state.bars[symbol];
    const last = series.at(-1);
    const reference = series.at(-61).close;
    const recent = series.slice(-60);
    return {
      price: last.close, change: last.close - reference,
      percent: (last.close - reference) / reference * 100,
      high: Math.max(...recent.map(bar => bar.high)), low: Math.min(...recent.map(bar => bar.low)),
      volume: recent.reduce((total, bar) => total + bar.volume, 0)
    };
  }

  function execute(state, symbol, side, quantity) {
    if (!instruments.some(item => item.symbol === symbol)) throw new Error('Choose a listed instrument.');
    if (side !== 'buy' && side !== 'sell') throw new Error('Choose Buy or Sell.');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      throw new Error('Enter a whole quantity from 1 to 10,000 shares.');
    }
    const { price } = quote(state, symbol);
    const total = price * quantity;
    const position = state.positions[symbol] ?? { quantity: 0, cost: 0 };
    let realized = 0;
    if (side === 'buy') {
      if (total > state.cash) throw new Error('Not enough virtual cash for this order.');
      state.cash -= total;
      state.positions[symbol] = { quantity: position.quantity + quantity, cost: position.cost + total };
    } else {
      if (quantity > position.quantity) throw new Error('You do not own that many shares.');
      const cost = Number(BigInt(position.cost) * BigInt(quantity) / BigInt(position.quantity));
      realized = total - cost;
      state.cash += total;
      state.realized += realized;
      if (quantity === position.quantity) delete state.positions[symbol];
      else state.positions[symbol] = { quantity: position.quantity - quantity, cost: position.cost - cost };
    }
    const order = { id: state.orders.length + 1, symbol, side, quantity, price, total, time: state.time };
    state.orders.unshift(order);
    return order;
  }

  function portfolio(state) {
    const holdings = Object.entries(state.positions).map(([symbol, position]) => {
      const price = quote(state, symbol).price;
      const value = price * position.quantity;
      return { symbol, ...position, price, value, profit: value - position.cost };
    });
    const value = holdings.reduce((sum, item) => sum + item.value, 0);
    const unrealized = holdings.reduce((sum, item) => sum + item.profit, 0);
    return { holdings, value, unrealized, equity: state.cash + value };
  }

  const api = { instruments, startingCash, maxQuantity, aggregate, createState, advance, quote, execute, portfolio };
  if (typeof module !== 'undefined') module.exports = api;
  else window.InvestEngine = api;
})();
