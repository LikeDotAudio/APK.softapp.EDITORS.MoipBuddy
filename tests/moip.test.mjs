import test from 'node:test';
import assert from 'node:assert/strict';
import { MoipStreamModel } from '../js/moipModel.js';

test('MoipStreamModel manages multicast stream allocations', () => {
  const m = new MoipStreamModel();
  assert.equal(m.streams.length, 3);

  m.addStream({ name: 'AES67-AUX', group: '239.69.10.4', port: 5004, channels: 2, format: 'L24/48k', status: 'Active' });
  assert.equal(m.streams.length, 4);

  m.removeStream(1);
  assert.equal(m.streams.length, 3);
  assert.equal(m.streams.some(s => s.id === 1), false);
});

test('MoipStreamModel detects collisions and serializes block schema', () => {
  const m = new MoipStreamModel('BROADCAST-FABRIC');
  assert.equal(m.checkCollisions().length, 0);

  // Add colliding stream on same IP and port
  m.addStream({ name: 'COLLIDING-STREAM', group: '239.69.10.1', port: 5004 });
  assert.equal(m.checkCollisions().length, 1);

  const block = m.toBlock();
  assert.equal(block.type, 'moip_streams');
  assert.equal(block.streamPoolName, 'BROADCAST-FABRIC');
  assert.equal(block.streams, undefined, 'no private copy of the plan (ROAD-3582)');
  assert.deepEqual(block.systems, ['F-239-69-10-1-5004', 'F-239-69-10-2-5004', 'F-239-100-1-1-20000'], 'one id per group:port');

  const restored = new MoipStreamModel();
  restored.fromBlock(block);
  assert.equal(restored.streamPoolName, 'BROADCAST-FABRIC');
  assert.deepEqual(restored.systems, block.systems);
  assert.equal(restored.streams.length, 0, 'the rows come from the bench (MoipApp.loadScope)');

  const old = new MoipStreamModel();
  old.fromBlock({ type: 'moip_streams', streamPoolName: 'OLD', streams: m.streams });
  assert.equal(old.legacy, true);
  assert.equal(old.streams.length, 4, 'an old block with streams[] still loads');
  assert.equal(old.nextId, 5);
});
