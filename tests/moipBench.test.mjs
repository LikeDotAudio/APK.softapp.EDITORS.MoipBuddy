// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MoipStreamModel } from '../js/moipModel.js';
import { streamsToSystems, systemsToStreams, saveStreams, isPlan, exportSiteIfc, loadSystems, readBlock, scopeOf, systemIdsOf } from '../js/moipBench.js';

// The stream plan on the bench (network-discovery-4/7): rows round-trip through /api/bim/bench/systems
// as kind 'stream' (an IfcDistributionCircuit in the IFC), members and VLAN kept, collisions still checked.

const GUID = /^[0-3][0-9A-Za-z_$]{21}$/;

function bench(initial = []) {
  const rows = new Map(initial.map(r => [r.id, r]));
  const calls = [];
  const guid = (id) => `1${id.replace(/[^0-9A-Za-z]/g, '').padEnd(21, 'y').slice(0, 21)}`;
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => 'ISO-10303-21;' });
    const m = url.match(/\/bench\/systems(?:\/(.+))?$/);
    if (!m) return ok({});
    const id = m[1] && decodeURIComponent(m[1]);
    if (init.method === 'PUT') { rows.set(id, { id, ...JSON.parse(init.body) }); return ok(rows.get(id)); }
    if (init.method === 'DELETE') { rows.delete(id); return ok({ deleted: id }); }
    return ok({ items: [...rows.values()].map(r => ({ ...r, guid: guid(r.id) })) });
  };
  return { impl, rows, calls };
}

test('a stream row is a plan only with a multicast group and a port', () => {
  assert.equal(isPlan({ group: '239.69.10.1', port: 5004 }), true);
  assert.equal(isPlan({ group: '10.1.1.1', port: 5004 }), false);
  assert.equal(isPlan({ group: '239.69.10.1' }), false);
  assert.equal(isPlan({ group: 'ff3e::1', port: 5004 }), true);
});

test('the model\'s streams round-trip through the bench; status stays the bus\'s', async () => {
  const model = new MoipStreamModel();
  const b = bench();
  const { items, skipped } = await saveStreams(model.streams, { api: '/api/bim', fetchImpl: b.impl });
  assert.deepEqual(skipped, []);
  const back = systemsToStreams(items);
  assert.equal(back.length, model.streams.length);
  for (const [i, s] of model.streams.entries()) {
    for (const k of ['name', 'group', 'port', 'channels', 'format', 'bandwidthMbps', 'redundancy']) assert.deepEqual(back[i][k], s[k], k);
    assert.equal(back[i].status, undefined);
    assert.match(back[i].guid, GUID);
  }
  assert.deepEqual(JSON.parse(b.calls.find(c => c.method === 'PUT').body),
    { kind: 'stream', name: 'DANTE-CH1-8', group: '239.69.10.1', port: 5004, channels: 8, format: 'L24/48k', bandwidth_mbps: 6.5, redundancy: 'Hitless ST 2022-7' });
});

test('checkCollisions runs on the bench-backed list', () => {
  const model = new MoipStreamModel();
  model.streams = systemsToStreams([
    { id: 'F1', kind: 'stream', name: 'A', group: '239.1.1.1', port: 5004 },
    { id: 'F2', kind: 'stream', name: 'B', group: '239.1.1.1', port: 5004 },
    { id: 'F3', kind: 'stream', name: 'C', group: '239.1.1.2', port: 5004 },
  ]);
  assert.deepEqual(model.checkCollisions().map(s => s.name), ['B']);
});

test('a planned stream keeps its VLAN and its senders / receivers; a dropped row is deleted', async () => {
  const b = bench([
    { id: 'F1', kind: 'stream', name: 'old', group: '239.69.10.1', port: 5004, parent: 'V10', transport: 'ST2110-30',
      members: [{ ref: 'U3', pin: 'U3:N1', role: 'sender' }] },
    { id: 'F9', kind: 'stream', group: '239.9.9.9', port: 5004 },
  ]);
  await saveStreams([{ id: 1, name: 'ST2110-30-MAIN', group: '239.69.10.1', port: 5004, channels: 2 }], { api: '/api/bim', fetchImpl: b.impl });
  assert.deepEqual(b.rows.get('F1'), { id: 'F1', kind: 'stream', name: 'ST2110-30-MAIN', group: '239.69.10.1', port: 5004, channels: 2,
    transport: 'ST2110-30', parent: 'V10', members: [{ ref: 'U3', pin: 'U3:N1', role: 'sender' }] });
  assert.equal(b.rows.has('F9'), false);
  assert.throws(() => streamsToSystems([{ group: '239.1.1.1', port: 1 }, { group: '239.1.1.1', port: 1 }]), /same group:port/);
});

test('Export IFC is GET /api/bim/site.ifc', async () => {
  const b = bench();
  await exportSiteIfc({ api: '/api/bim', fetchImpl: b.impl });
  assert.equal(b.calls[0].url, '/api/bim/site.ifc');
});

test('an old block migrates: rows onto the bench, the block keeps their ids, the ids read the rows back; collisions still checked', async () => {
  const b = bench([{ id: 'F-other', kind: 'stream', group: '239.9.9.9', port: 5004 }]);
  const old = new MoipStreamModel();
  old.fromBlock({ type: 'moip_streams', streamPoolName: 'OLD', streams: new MoipStreamModel().streams });
  await saveStreams(old.streams, { api: '/api/bim', fetchImpl: b.impl, owned: [] });
  assert.ok(b.rows.has('F-other'), 'a stream another pool plans is never removed by this block');
  const block = old.toBlock();
  const fresh = new MoipStreamModel();
  fresh.fromBlock(block);
  const { items, missing } = scopeOf(await loadSystems({ api: '/api/bim', fetchImpl: b.impl }), fresh.systems);
  assert.deepEqual(missing, []);
  fresh.streams = systemsToStreams(items);
  assert.deepEqual(fresh.streams.map(s => [s.name, s.group, s.port, s.channels]), old.streams.map(s => [s.name, s.group, s.port, s.channels]));
  assert.deepEqual(systemIdsOf(fresh.streams), block.systems);
  fresh.addStream({ name: 'DUP', group: fresh.streams[0].group, port: fresh.streams[0].port });
  assert.equal(fresh.checkCollisions().length, 1, 'checkCollisions runs on the bench-backed list');
});

test('owned limits the deletes; readBlock reads both shapes; a draft row has no id', () => {
  const existing = [{ id: 'F-a', kind: 'stream', group: '239.1.1.1', port: 1 }, { id: 'F-b', kind: 'stream', group: '239.1.1.2', port: 1 }];
  assert.deepEqual(streamsToSystems([], existing, ['F-a']).deletes, ['F-a']);
  assert.deepEqual(streamsToSystems([], existing).deletes, ['F-a', 'F-b']);
  assert.deepEqual(readBlock({ streamPoolName: 'P', systems: ['F-a'] }), { streamPoolName: 'P', systems: ['F-a'], streams: null });
  assert.equal(readBlock({ streams: [{ group: 'x' }] }).streams.length, 1);
  assert.deepEqual(systemIdsOf([{ name: 'draft' }, { group: '239.1.1.1', port: 1, benchId: 'F-a' }]), ['F-a']);
});
