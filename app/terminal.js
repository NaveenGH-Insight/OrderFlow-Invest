'use strict';
const E = window.InvestEngine;
const $ = id => document.getElementById(id);
const paths = {
  chart: 'M3 3v18h18M6 15l4-4 4 2 6-7',
  wallet: 'M3 6h17v14H3zM3 6l13-3v3m4 5h-6v4h6',
  receipt: 'M5 3l2 2 2-2 3 2 3-2 2 2 2-2v18l-2-2-2 2-3-2-3 2-2-2-2 2zM8 9h8m-8 4h8',
  layers: 'm2 8 10-5 10 5-10 5zm0 4 10 5 10-5m-20 4 10 5 10-5',
  activity: 'M2 12h5l3-7 4 14 3-7h5',
  shield: 'M12 22c5-3 8-6 8-11V5l-8-3-8 3v6c0 5 3 8 8 11zm-3-10 2 2 4-4',
  search: 'M15 15l5 5m-3-10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
  plus: 'M12 5v14M5 12h14', sort: 'M4 7h15M4 12h10M4 17h5',
  'arrow-right': 'M4 12h15m-6-6 6 6-6 6',
  bookmark: 'M6 4h12v17l-6-4-6 4z', x: 'm6 6 12 12M18 6 6 18',
  chip: 'M6 6h12v12H6zM9 9h6v6H9zm0-6v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3',
  bank: 'm3 8 9-5 9 5zM5 11v6m5-6v6m4-6v6m5-6v6M3 20h18',
  sun: 'M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2m-2 5a5 5 0 1 1-10 0 5 5 0 0 1 10 0z',
  box: 'm3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10',
  truck: 'M3 6h12v11H3zm12 4h4l3 4v3h-7M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm13 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  pause: 'M9 5v14m6-14v14', play: 'm8 5 11 7-11 7z', check: 'm5 12 4 4L19 6'
};
const ico = name => `<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = ico(node.dataset.icon); });
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const axis = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const timestamp = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const money = paise => inr.format(paise / 100);
const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const signedMoney = n => `${n >= 0 ? '+' : '-'}${money(Math.abs(n))}`;
const tone = n => n >= 0 ? 'pos' : 'neg';
const itemFor = symbol => E.instruments.find(item => item.symbol === symbol);
const asset = item => `<span class="asset ${item.color}">${ico(item.icon)}</span>`;
const storageKey = 'orderflow-invest:v1';
let storageWritable = true;
let state = E.createState();
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !itemFor(saved.selected) || !Array.isArray(saved.watch)
      || !Array.isArray(saved.orders) || !saved.positions || !Number.isSafeInteger(saved.cash)
      || !E.instruments.every(item => saved.bars?.[item.symbol]?.length === 120)) {
      throw new Error('Unrecognized saved paper account');
    }
    state = saved;
  }
} catch (error) {
  console.warn(error);
  storageWritable = false;
  $('storage-warning').textContent = 'Could not load the saved account. This session uses a temporary account; the original data will not be overwritten.';
  $('storage-warning').hidden = false;
}
function save() {
  if (!storageWritable) return;
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch (error) {
    console.warn(error);
    $('storage-warning').textContent = 'The current account could not be saved. Recent changes may be lost when you close the app.';
    $('storage-warning').hidden = false;
  }
}
let screen = 'market';
let range = 60;
let sorting = 0;
let paused = false;
let side = 'buy';
let chartBars = [];
let chartIndex = null;
let chartPlot = 0;
let toastTimer;
const descriptions = {
  market: ['Market terminal', 'Explore a simulated market and practice trading without real money.'],
  portfolio: ['Portfolio', 'Track virtual cash, open holdings, and profit or loss.'],
  orders: ['Order history', 'Review the paper trades you have executed.']
};
const benchmarks = [
  ['OF Composite', E.instruments.map(item => item.symbol)],
  ['OF Technology', ['NOVA', 'QUANT']], ['OF Financials', ['ATLAS']],
  ['OF Industrials', ['NORTH', 'HARB']]
];
function say(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function navigate(next) {
  screen = next;
  for (const name of Object.keys(descriptions)) $(`${name}-screen`).hidden = name !== next;
  document.querySelectorAll('[data-screen]').forEach(button => {
    const active = button.dataset.screen === next;
    button.classList.toggle('current', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const [title, description] = descriptions[next];
  $('page-title').textContent = title;
  $('page-description').textContent = description;
  $('crumb').textContent = title;
  render();
  $('page-title').focus();
}
function select(symbol) {
  state.selected = symbol;
  chartIndex = null;
  save();
  if (screen !== 'market') navigate('market');
  else render();
}
function toggleWatch(symbol) {
  const wasAdded = state.watch.includes(symbol);
  state.watch = wasAdded ? state.watch.filter(value => value !== symbol) : [...state.watch, symbol];
  save();
  render();
  if ($('search-dialog').open) renderSearch(symbol);
  say(`${symbol} ${wasAdded ? 'removed from' : 'added to'} your watchlist`);
}
function tile(title, value, detail = '') {
  return `<div class="tile"><div class="tile-title">${title}${ico('activity')}</div><div class="tile-values"><strong>${value}</strong>${detail}</div></div>`;
}
function renderMarket() {
  $('market-tape').innerHTML = benchmarks.map(([name, symbols]) => {
    const components = symbols.map(symbol => {
      const current = E.quote(state, symbol);
      return [current.price / itemFor(symbol).base * 10000, (current.price - current.change) / itemFor(symbol).base * 10000];
    });
    const now = components.reduce((a, b) => a + b[0], 0);
    const old = components.reduce((a, b) => a + b[1], 0);
    const change = (now - old) / old * 100;
    return tile(`${name} · 1h`, number.format(now / components.length), `<span class="${tone(change)}">${pct(change)}</span>`);
  }).join('');
  const watch = $('watch-list');
  const previous = watch.contains(document.activeElement) ? document.activeElement.dataset.symbol : null;
  const scroll = watch.scrollTop;
  const symbols = [...state.watch];
  if (sorting === 1) symbols.sort((a, b) => E.quote(state, b).price - E.quote(state, a).price);
  if (sorting === 2) symbols.sort((a, b) => E.quote(state, b).percent - E.quote(state, a).percent);
  $('watch-count').textContent = `${symbols.length} ${symbols.length === 1 ? 'instrument' : 'instruments'} · ${['List order', 'Highest price', 'Top 1h movers'][sorting]}`;
  $('sort-watch').setAttribute('aria-label', `Change sorting (currently ${['list order', 'highest price', 'top 1h movers'][sorting]})`);
  watch.innerHTML = symbols.map(symbol => {
    const item = itemFor(symbol);
    const current = E.quote(state, symbol);
    const active = symbol === state.selected;
    return `<button type="button" class="watch-row${active ? ' selected' : ''}" data-symbol="${symbol}" aria-pressed="${active}" title="${item.name}">${asset(item)}<span class="watch-name"><strong>${item.name}</strong><small class="symbol">${symbol}</small></span><span class="watch-value"><strong>${money(current.price)}</strong><small class="${tone(current.percent)}">${pct(current.percent)}</small></span></button>`;
  }).join('') || '<p class="empty">Add instruments to track them here.</p>';
  if (previous) watch.querySelector(`[data-symbol="${previous}"]`)?.focus({ preventScroll: true });
  watch.scrollTop = scroll;
  const item = itemFor(state.selected);
  const current = E.quote(state, item.symbol);
  if ($('identity').dataset.symbol !== item.symbol) {
    $('identity').dataset.symbol = item.symbol;
    $('identity').innerHTML = `${asset(item)}<div><h2>${item.name}</h2><p class="identity-meta">${item.symbol} · ${item.sector} · Fictional equity</p></div>`;
  }
  const saved = state.watch.includes(item.symbol);
  const favoriteLabel = `${saved ? 'Remove' : 'Add'} ${item.symbol} ${saved ? 'from' : 'to'} watchlist`;
  $('favorite').setAttribute('aria-pressed', String(saved));
  $('favorite').setAttribute('aria-label', favoriteLabel);
  $('favorite').title = favoriteLabel;
  $('quote-price').textContent = money(current.price);
  $('quote-change').className = `quote-change ${tone(current.change)}`;
  $('quote-change').innerHTML = `${signedMoney(current.change)} (${pct(current.percent)}) <small>Past 1h · simulated</small>`;
  $('stats').innerHTML = [['1h high', money(current.high)], ['1h low', money(current.low)], ['1h volume', number.format(current.volume)]]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  renderChart();
}
function renderChart() {
  const chart = $('chart');
  if (!chart.clientWidth || screen !== 'market') return;
  chartBars = state.bars[state.selected].slice(-range);
  const width = chart.clientWidth, height = chart.clientHeight;
  const plot = width - 63, top = 14, priceBottom = height - 57, volumeBottom = height - 23;
  chartPlot = plot;
  const stride = plot / chartBars.length;
  const volMax = Math.max(...chartBars.map(bar => bar.volume));
  const low = Math.min(...chartBars.map(bar => bar.low)), high = Math.max(...chartBars.map(bar => bar.high));
  const spread = Math.max(100, high - low) * 1.17;
  const ceiling = (high + low + spread) / 2;
  const y = price => top + (ceiling - price) / spread * (priceBottom - top);
  const x = index => stride * (index + 0.5);
  const bodyWidth = Math.max(1, stride * 0.62);
  let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">`;
  for (let i = 0; i < 5; i++) {
    const price = ceiling - spread * i / 4;
    const py = y(price);
    svg += `<path class="grid" d="M0 ${py}H${plot}"/><text x="${plot + 6}" y="${py + 4}">${axis.format(price / 100)}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const px = plot * i / 4;
    const bar = chartBars[Math.round((chartBars.length - 1) * i / 4)];
    svg += `<path class="grid" d="M${px} ${top}V${volumeBottom}"/><text x="${px}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${clock.format(bar.time)}</text>`;
  }
  chartBars.forEach((bar, i) => {
    const cx = x(i), left = cx - bodyWidth / 2, open = y(bar.open), close = y(bar.close);
    const color = bar.close >= bar.open ? 'gain' : 'loss';
    const volume = 26 * bar.volume / volMax;
    svg += `<line class="${color}" x1="${cx}" y1="${y(bar.high)}" x2="${cx}" y2="${y(bar.low)}"/><rect class="${color}" x="${left}" y="${Math.min(open, close)}" width="${bodyWidth}" height="${Math.max(1, Math.abs(open - close))}"/><rect class="${color} vbar" x="${left}" y="${volumeBottom - volume}" width="${bodyWidth}" height="${volume}"/>`;
  });
  const last = chartBars.at(-1), lastY = y(last.close);
  const band = Math.max(16, Math.min(priceBottom - 2, lastY));
  svg += `<path class="last-line" d="M0 ${lastY}H${plot}"/><rect class="last-tag" x="${plot}" y="${band - 8}" width="62" height="16" rx="3"/><text class="tag-text" x="${plot + 31}" y="${band + 4}" text-anchor="middle">${axis.format(last.close / 100)}</text><line id="crosshair" class="crosshair" y1="${top}" y2="${volumeBottom}" visibility="hidden"/></svg>`;
  chart.innerHTML = svg;
  chart.setAttribute('aria-label', `${state.selected} simulated candlestick and volume chart, last ${range} minutes. Latest close ${money(last.close)}.`);
  renderCrosshair();
}
function renderCrosshair() {
  if (!chartBars.length) return;
  const index = chartIndex === null ? chartBars.length - 1 : chartIndex;
  const bar = chartBars[index];
  const cross = $('crosshair');
  if (cross) {
    const x = chartPlot * (index + 0.5) / chartBars.length;
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('visibility', chartIndex === null ? 'hidden' : 'visible');
  }
  $('ohlc').innerHTML = `<span><b>${clock.format(bar.time)} IST</b></span>${[['O', bar.open], ['H', bar.high], ['L', bar.low], ['C', bar.close]].map(([label, value]) => `<span>${label} <b>${money(value)}</b></span>`).join('')}<span>Vol <b>${number.format(bar.volume)}</b></span>`;
}
function table(head, rows, empty) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<div class="table-wrap"><table><thead><tr>${head.map(text => `<th scope="col">${text}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderPortfolio() {
  const portfolio = E.portfolio(state);
  $('portfolio-summary').innerHTML = [
    ['Account equity', portfolio.equity], ['Virtual cash', state.cash],
    ['Unrealized P/L', portfolio.unrealized], ['Realized P/L', state.realized]
  ].map(([label, value], i) => tile(label, i < 2 ? money(value) : `<span class="${tone(value)}">${signedMoney(value)}</span>`)).join('');
  $('holdings').innerHTML = table(['Instrument', 'Shares', 'Avg. cost', 'Simulated price', 'Market value', 'Unrealized P/L'],
    portfolio.holdings.map(h => [`<strong>${h.symbol}</strong> · ${itemFor(h.symbol).name}`, number.format(h.quantity), money(h.cost / h.quantity), money(h.price), money(h.value), `<span class="${tone(h.profit)}">${signedMoney(h.profit)}</span>`]),
    'No holdings yet. Buy a fictional equity in the market terminal to open a paper position.');
}
function renderOrders() {
  $('orders').innerHTML = table(['Order', 'Instrument', 'Side', 'Shares', 'Fill price', 'Amount', 'Simulation time (IST)'],
    state.orders.map(order => [`#${order.id} · Filled`, order.symbol, order.side === 'buy' ? 'Buy' : 'Sell', number.format(order.quantity), money(order.price), money(order.total), timestamp.format(order.time)]),
    'No filled orders yet. Your simulated market orders will appear here.');
}
function render() {
  $('cash-value').textContent = money(state.cash);
  if (screen === 'market') renderMarket();
  if (screen === 'portfolio') renderPortfolio();
  if (screen === 'orders') renderOrders();
  if ($('order-dialog').open) renderTicket();
}
function renderSearch(focusSymbol) {
  const query = $('search-input').value.trim().toLowerCase();
  const results = E.instruments.filter(item => `${item.symbol} ${item.name} ${item.sector}`.toLowerCase().includes(query));
  $('search-results').innerHTML = results.map(item => {
    const watched = state.watch.includes(item.symbol);
    return `<div class="result"><button class="result-main" type="button" data-open-symbol="${item.symbol}">${asset(item)}<span><strong>${item.name}</strong><small>${item.symbol} · ${item.sector}</small></span></button><button type="button" class="icon-button" data-watch-symbol="${item.symbol}" aria-label="${watched ? 'Remove' : 'Add'} ${item.symbol} ${watched ? 'from' : 'to'} watchlist" aria-pressed="${watched}">${ico(watched ? 'check' : 'plus')}</button></div>`;
  }).join('') || '<p class="empty">No instruments match this search.</p>';
  if (focusSymbol) $('search-results').querySelector(`[data-watch-symbol="${focusSymbol}"]`)?.focus();
}
function openSearch() {
  if ($('order-dialog').open || $('search-dialog').open) return;
  $('search-input').value = '';
  renderSearch();
  $('search-dialog').showModal();
  $('search-input').focus();
}
function renderTicket() {
  const { price } = E.quote(state, state.selected);
  const quantity = $('quantity').valueAsNumber;
  const valid = Number.isSafeInteger(quantity) && quantity > 0 && quantity <= E.maxQuantity;
  $('ticket-price').textContent = money(price);
  $('ticket-limit-label').textContent = side === 'buy' ? 'Virtual cash available' : 'Shares owned';
  $('ticket-limit').textContent = side === 'buy' ? money(state.cash) : number.format(state.positions[state.selected]?.quantity ?? 0);
  $('ticket-total').textContent = valid ? money(price * quantity) : '—';
}
function openOrder(nextSide) {
  side = nextSide;
  const verb = side === 'buy' ? 'Buy' : 'Sell';
  $('order-title').textContent = `${verb} ${state.selected}`;
  $('place-order').textContent = `Place simulated ${side}`;
  $('order-error').hidden = true;
  $('quantity').value = '1';
  renderTicket();
  $('order-dialog').showModal();
  $('quantity').select();
}

document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.screen)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
['search-open', 'watch-add', 'watch-browse'].forEach(id => $(id).addEventListener('click', openSearch));
$('cash-link').addEventListener('click', () => navigate('portfolio'));
$('search-input').addEventListener('input', () => renderSearch());
$('search-results').addEventListener('click', event => {
  const open = event.target.closest('[data-open-symbol]');
  const watch = event.target.closest('[data-watch-symbol]');
  if (open) { $('search-dialog').close(); select(open.dataset.openSymbol); }
  if (watch) toggleWatch(watch.dataset.watchSymbol);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
});
$('watch-list').addEventListener('click', event => {
  const row = event.target.closest('[data-symbol]');
  if (row) select(row.dataset.symbol);
});
$('sort-watch').addEventListener('click', () => { sorting = (sorting + 1) % 3; renderMarket(); });
$('favorite').addEventListener('click', () => toggleWatch(state.selected));
$('ranges').addEventListener('click', event => {
  const button = event.target.closest('[data-range]');
  if (!button) return;
  range = Number(button.dataset.range);
  chartIndex = null;
  $('ranges').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  renderChart();
});
$('chart').addEventListener('pointermove', event => {
  if (!chartPlot) return;
  const x = event.clientX - $('chart').getBoundingClientRect().left;
  chartIndex = x >= 0 && x < chartPlot ? Math.floor(x / chartPlot * chartBars.length) : null;
  renderCrosshair();
});
$('chart').addEventListener('pointerleave', () => { chartIndex = null; renderCrosshair(); });
new ResizeObserver(renderChart).observe($('chart'));
$('feed-toggle').addEventListener('click', () => {
  paused = !paused;
  $('feed-toggle').setAttribute('aria-pressed', String(paused));
  $('feed-toggle').querySelector('strong').textContent = paused ? 'Simulation paused' : 'Simulation running';
  $('feed-toggle').querySelector('i').innerHTML = ico(paused ? 'play' : 'pause');
});
$('buy-open').addEventListener('click', () => openOrder('buy'));
$('sell-open').addEventListener('click', () => openOrder('sell'));
$('quantity').addEventListener('input', () => { $('order-error').hidden = true; renderTicket(); });
$('order-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const order = E.execute(state, state.selected, side, $('quantity').valueAsNumber);
    save();
    $('order-dialog').close();
    render();
    say(`${order.side === 'buy' ? 'Bought' : 'Sold'} ${order.quantity} ${order.symbol} at ${money(order.price)} per share`);
  } catch (error) {
    $('order-error').textContent = error.message;
    $('order-error').hidden = false;
  }
});
render();
setInterval(() => {
  if (!paused) { E.advance(state); save(); render(); }
}, 7000);
