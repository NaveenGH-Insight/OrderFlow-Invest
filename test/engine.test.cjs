const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../app/engine');

test('aggregates prices and quantities in execution order', () => {
  const trades = [[1050, 3], [1110, 4], [995, 2], [1010, 8]].map(([price, quantity]) => ({ price, quantity, time: 60000 }));
  assert.deepEqual(E.aggregate(trades), { time: 60000, open: 1050, high: 1110, low: 995, close: 1010, volume: 17 });
});

test('advancing after restoring a saved feed is deterministic and keeps quotes aligned with charts', () => {
  const state = E.createState(1700000000000);
  const restored = JSON.parse(JSON.stringify(state));
  const previous = state.time;
  E.advance(state);
  E.advance(restored);
  assert.deepEqual(restored, state);
  for (const { symbol } of E.instruments) {
    const bars = state.bars[symbol], quote = E.quote(state, symbol);
    assert.equal(bars.length, 120);
    assert.equal(bars.at(-1).time, previous + 60000);
    assert.equal(quote.price, bars.at(-1).close);
    assert.equal(quote.change, quote.price - bars.at(-61).close);
    assert.equal(quote.volume, bars.slice(-60).reduce((sum, bar) => sum + bar.volume, 0));
  }
});

test('buys and partial sells keep cash, average cost, realized P/L, and equity consistent', () => {
  const state = E.createState();
  const first = E.execute(state, 'NOVA', 'buy', 2);
  E.advance(state);
  const second = E.execute(state, 'NOVA', 'buy', 3);
  assert.equal(first.total, first.price * 2);
  assert.equal(state.cash, E.startingCash - first.total - second.total);
  E.advance(state);
  const sold = E.execute(state, 'NOVA', 'sell', 2);
  const totalCost = first.total + second.total;
  const allocated = Math.floor(totalCost * 2 / 5);
  const portfolio = E.portfolio(state);
  assert.equal(state.realized, sold.total - allocated);
  assert.equal(portfolio.holdings[0].cost, totalCost - allocated);
  assert.equal(portfolio.holdings[0].quantity, 3);
  assert.equal(portfolio.equity, E.startingCash + state.realized + portfolio.unrealized);
  const closed = E.execute(state, 'NOVA', 'sell', 3);
  assert.deepEqual(E.portfolio(state).holdings, []);
  assert.equal(state.cash, E.startingCash + state.realized);
  assert.equal(state.realized, closed.total + sold.total - totalCost);
  assert.deepEqual(state.orders.map(o => o.id), [4, 3, 2, 1]);
});

test('bad orders do not change balances, holdings, or history', () => {
  const state = E.createState();
  const before = structuredClone(state);
  assert.throws(() => E.execute(state, 'not a symbol', 'buy', 1), /listed instrument/);
  assert.throws(() => E.execute(state, 'NOVA', 'hold', 1), /Buy or Sell/);
  for (const quantity of [0, -1, 1.5, 10001, NaN, Infinity, '2']) {
    assert.throws(() => E.execute(state, 'NOVA', 'buy', quantity), /whole quantity/);
  }
  assert.throws(() => E.execute(state, 'NOVA', 'buy', 10000), /Not enough/);
  assert.throws(() => E.execute(state, 'NOVA', 'sell', 1), /do not own/);
  assert.deepEqual(state, before);
});
