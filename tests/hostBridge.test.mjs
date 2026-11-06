// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* ROAD-3488: the moip_streams block goes in and out over cad.like.audio/host@1
   (vendor/apk-softapp), never '*'; a stream the bus carries (PLUGIN.DANTE's
   dante/Flows FlowView array) becomes a plan row with nothing guessed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { world, hostContract, ORIGIN } from './softappWorld.mjs';
import { MoipStreamModel } from '../js/moipModel.js';
import { parseFlows, streamsFromFlows, streamRow } from '../js/moipDiscovered.js';

const rules = JSON.parse(fs.readFileSync(new URL('../config/discovery.json', import.meta.url)));

function editor(S) {
  const model = new MoipStreamModel();
  const host = S.connectHost({
    editor: 'MoIP Stream Buddy', blockType: 'moip_streams', notice: false,
    onLoad: (block) => model.fromBlock(block),
    onRequest: () => ({ block: model.toBlock(), meta: { name: model.streamPoolName } }),
  });
  return { model, host };
}

test('block round trip: load from the CAD, edit, request answers blockSave with the edit, at our origin', async () => {
  const { S, toParent, fire } = world();
  const { model } = editor(S);
  const sent = new MoipStreamModel('TRUCK-A');
  // an old block (its own streams[]) loads as it was …
  fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: { type: 'moip_streams', streamPoolName: sent.streamPoolName, streams: sent.streams }, meta: { blockName: 'MOIP_A' } });
  assert.equal(model.streamPoolName, 'TRUCK-A');
  assert.equal(model.nextId, 4, 'ids continue after the loaded streams');
  model.updateStream(0, 'port', '5006');
  fire({ protocol: 'cad.like.audio/host@1', type: 'request' });
  const save = toParent.at(-1);
  assert.equal(save.o, ORIGIN);
  assert.equal(save.m.type, 'blockSave');
  assert.equal(save.m.blockType, 'moip_streams');
  // … and goes back as the bench ids it plans, no copy (ROAD-3582)
  assert.deepEqual(save.m.block.systems, ['F-239-69-10-1-5006', 'F-239-69-10-2-5004', 'F-239-100-1-1-20000']);
  assert.equal(save.m.block.streams, undefined);
  assert.equal(save.m.meta.blockName, 'MOIP_A');
  const contract = await hostContract();
  if (contract) for (const { m } of toParent) assert.deepEqual(contract.validateMessage(contract.schema, 'toCad', m), [], m.type);
});

test('the old private APK_LOAD_BLOCK and a foreign origin are ignored', () => {
  const { S, fire } = world();
  const { model } = editor(S);
  fire({ type: 'APK_LOAD_BLOCK', block: { streamPoolName: 'OLD' } });
  fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: { streamPoolName: 'X' } }, { origin: 'http://evil' });
  assert.equal(model.streamPoolName, 'CAMPUS-MOIP-FABRIC');
});

/* Shaped as PLUGIN.DANTE serialises FlowView (flowview.rs; direction lowercase, model.rs). */
const FLOWS = JSON.stringify([
  { device: 'Stagebox', key: 'tx-1', id: 1, direction: 'tx', multicast: true, address: '239.255.10.1', port: 4321,
    sample_rate: 48000, encoding: 24, latency_us: 1000, peer: null, channels: [1, 2, 3, 0], inferred: false, slots: [] },
  { device: 'Stagebox', key: 'tx-2', id: 2, direction: 'tx', multicast: false, address: '10.0.0.9', port: 4322,
    sample_rate: 48000, encoding: 24, latency_us: 1000, peer: 'Desk', channels: [1, 2], inferred: false, slots: [] },
  { device: 'Desk', key: 'rx-4', id: 4, direction: 'rx', multicast: true, address: '239.255.10.1', port: 4321,
    sample_rate: 48000, encoding: 24, latency_us: 1000, peer: 'Stagebox', channels: [1, 2], inferred: true, slots: [] },
]);

test('dante/Flows: only multicast transmit flows are fabric streams; payload is channels x rate x bits', () => {
  const streams = streamsFromFlows(parseFlows(FLOWS, rules.flowFeeds[0].shape), rules);
  assert.equal(streams.length, 1);
  const s = streams[0];
  assert.equal(s.flowId, 'Stagebox/tx-1');
  assert.equal(s.group, '239.255.10.1');
  assert.equal(s.port, 4321);
  assert.equal(s.channels, 3, 'empty slots are not channels');
  assert.equal(s.format, 'L24/48k');
  assert.equal(s.bandwidthMbps, 3.5, '3 x 48000 x 24 = 3.456 Mbit/s payload');
  assert.equal(s.redundancy, '', 'no redundancy is claimed');
});

test('a seen stream joins the plan as the bus gave it, and the plan catches its collision', () => {
  const [s] = streamsFromFlows(parseFlows(FLOWS, 'dante-flowview'), rules);
  const m = new MoipStreamModel();
  const added = m.addSeen(streamRow(s));
  assert.equal(added.id, 4);
  assert.equal(added.redundancy, '');
  assert.equal(added.source, 'Stagebox/tx-1');
  m.addSeen({ ...streamRow(s), source: 'copy' });
  assert.equal(m.checkCollisions().length, 1);
});

test('a broken or unknown feed reads as no flows, never a throw', () => {
  assert.deepEqual(parseFlows('not json', 'dante-flowview'), []);
  assert.deepEqual(parseFlows('[]', 'unknown-shape'), []);
});
