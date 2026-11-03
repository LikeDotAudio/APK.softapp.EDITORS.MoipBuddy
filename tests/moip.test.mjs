import test from 'node:test';
import assert from 'node:assert/strict';
import { MoipStreamModel } from '../js/moipApp.js';

test('MoipStreamModel manages multicast stream allocations', () => {
  const m = new MoipStreamModel();
  assert.equal(m.streams.length, 3);

  m.addStream({ name: 'AES67-AUX', group: '239.69.10.4', port: 5004, channels: 2, format: 'L24/48k', status: 'Active' });
  assert.equal(m.streams.length, 4);

  m.removeStream(1);
  assert.equal(m.streams.length, 3);
  assert.equal(m.streams.some(s => s.id === 1), false);
});
