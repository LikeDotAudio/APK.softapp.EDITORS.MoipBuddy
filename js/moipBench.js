// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* THE STREAM PLAN ON THE BENCH (IFC-CORE-DELTAS network-discovery-4/7).

   A planned media stream lives once, in the BIM bench document (DATABASE.server.BIM
   bim/network.py) as a system of kind 'stream': GET /api/bim/bench/systems,
   PUT / DELETE /api/bim/bench/systems/<id>. Its IFC is an IfcDistributionCircuit
   (APK_MediaStream: MulticastGroup, UdpPort, Format, Channels, BandwidthMbps,
   Redundancy) with its sender and receiver ports grouped.

     stream row {name, group, port, channels, format, bandwidthMbps, redundancy}
       <->  {kind:'stream', name, group, port, channels, format, bandwidth_mbps, redundancy, transport?}

   It is a PLAN: the status column, IS-05 activations and IS-07 events stay NMOS
   and the bus; NMOS IS-05 still routes. A stream the bench holds keeps its VLAN
   (parent) and its sender / receiver members. A row with no multicast group or
   port is not a plan yet and is not sent.

   THE CAD BLOCK KEEPS ONLY IDS (ROAD-3582). A moip_streams block is
   {type, id, streamPoolName, systems: [stream ids]} — never a private
   streams[] copy (contracts BimSystemsRefSchema). An old block that still
   carries streams[] stays readable (readBlock); Save & Return moves its rows
   onto the bench and keeps their ids. */

export function bimApi() {
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search || '').get('bim');
    if (fromUrl) return fromUrl.replace(/\/$/, '');
  } catch (_) { /* no location under node */ }
  return (globalThis.APK_BIM_API || '/api/bim').replace(/\/$/, '');
}

const MULTICAST = /^(22[4-9]|23\d)\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^ff[0-9a-f]{2}:/i;
const key = (group, port) => `${String(group).toLowerCase()}:${Number(port)}`;
export const streamId = (group, port) => `F-${String(group).replace(/[^0-9A-Za-z]+/g, '-')}-${Number(port)}`;

/** Is the row a plan the bench takes (a multicast group and a UDP port)? */
export function isPlan(s) {
  const port = Number(s?.port);
  return MULTICAST.test(String(s?.group || '')) && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** The bench ids of the rows that are plans (a draft row with no group:port has none yet). */
export function systemIdsOf(streams = []) {
  const out = [];
  for (const s of streams) {
    if (!isPlan(s)) continue;
    const id = s.benchId || streamId(s.group, s.port);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** A moip_streams block, either shape: {streamPoolName, systems} (ids, today) or {streamPoolName, streams} (old). */
export function readBlock(block = {}) {
  const out = { streamPoolName: typeof block.streamPoolName === 'string' && block.streamPoolName ? block.streamPoolName : null, systems: null, streams: null };
  if (Array.isArray(block.systems)) out.systems = block.systems.filter(id => typeof id === 'string' && id);
  else if (Array.isArray(block.streams)) out.streams = JSON.parse(JSON.stringify(block.streams));
  return out;
}

/** The bench streams a block's ids name, in the block's order; `missing` = ids the bench lacks. */
export function scopeOf(items = [], ids = []) {
  const byId = new Map(items.filter(s => s.kind === 'stream').map(s => [s.id, s]));
  return { items: ids.filter(id => byId.has(id)).map(id => byId.get(id)), missing: ids.filter(id => !byId.has(id)) };
}

/** The bench's stream systems → the editor's rows (ids numbered here; status is not the plan's). */
export function systemsToStreams(items) {
  return items.filter(s => s.kind === 'stream').map((s, i) => {
    const row = { id: i + 1, name: s.name || '', group: s.group, port: s.port };
    if (s.channels !== undefined) row.channels = s.channels;
    if (s.format !== undefined) row.format = s.format;
    if (s.bandwidth_mbps !== undefined) row.bandwidthMbps = s.bandwidth_mbps;
    if (s.redundancy !== undefined) row.redundancy = s.redundancy;
    if (s.transport !== undefined) row.transport = s.transport;
    row.benchId = s.id;
    row.guid = s.guid;
    return row;
  });
}

/** The editor's rows → the PUTs and DELETEs that make them the bench's stream plan.
    `owned` (the ids this block planned when loaded) limits the DELETEs to this block's own streams;
    without it every bench stream the rows do not hold is removed (the whole-plan view). */
export function streamsToSystems(streams, existing = [], owned = null) {
  const byId = new Map(existing.filter(s => s.kind === 'stream').map(s => [s.id, s]));
  const byKey = new Map(existing.filter(s => s.kind === 'stream').map(s => [key(s.group, s.port), s]));
  const puts = [];
  const skipped = [];
  for (const s of streams) {
    if (!isPlan(s)) { skipped.push(s); continue; }
    const old = byId.get(s.benchId) || byKey.get(key(s.group, s.port));
    const row = {
      id: old?.id || streamId(s.group, s.port), kind: 'stream', name: s.name || undefined,
      group: String(s.group), port: Number(s.port),
      channels: Number.isInteger(Number(s.channels)) && Number(s.channels) > 0 ? Number(s.channels) : undefined,
      format: s.format || undefined,
      bandwidth_mbps: Number(s.bandwidthMbps) > 0 ? Number(s.bandwidthMbps) : undefined,
      redundancy: s.redundancy || undefined,
      transport: s.transport || old?.transport || undefined,
      parent: old?.parent, members: old?.members,
    };
    puts.push(JSON.parse(JSON.stringify(row)));
  }
  const keep = new Set(puts.map(p => p.id));
  if (keep.size !== puts.length) throw Object.assign(new Error('two rows plan the same group:port'), { code: 'bad_input' });
  const mine = owned ? new Set(owned) : null;
  const deletes = existing.filter(s => s.kind === 'stream' && !keep.has(s.id) && (!mine || mine.has(s.id))).map(s => s.id);
  return { puts, deletes, skipped };
}

async function answer(res, what) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${what}: ${body.error || res.status}`);
    err.status = res.status;
    err.code = res.status === 401 || res.status === 403 ? 'http_forbidden' : res.status === 404 ? 'http_not_found'
      : res.status >= 500 ? 'http_server_error' : 'bad_input';
    throw err;
  }
  return body;
}

export async function loadSystems({ api = bimApi(), fetchImpl = globalThis.fetch } = {}) {
  return (await answer(await fetchImpl(`${api}/bench/systems`), 'read the bench plan')).items || [];
}

/** Write the rows as the bench's stream plan; answers {items, skipped}. */
export async function saveStreams(streams, { api = bimApi(), fetchImpl = globalThis.fetch, owned = null } = {}) {
  const { puts, deletes, skipped } = streamsToSystems(streams, await loadSystems({ api, fetchImpl }), owned);
  for (const row of puts) {
    const { id, ...body } = row;
    await answer(await fetchImpl(`${api}/bench/systems/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), `plan ${row.name || id}`);
  }
  for (const id of deletes) {
    await answer(await fetchImpl(`${api}/bench/systems/${encodeURIComponent(id)}`, { method: 'DELETE' }), `remove ${id}`);
  }
  return { items: await loadSystems({ api, fetchImpl }), skipped };
}

/** The site model as IFC4X3 (GET /api/bim/site.ifc). */
export async function exportSiteIfc({ api = bimApi(), fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${api}/site.ifc`);
  if (!res.ok) throw Object.assign(new Error(`site.ifc: ${res.status}`), { status: res.status, code: res.status === 404 ? 'http_not_found' : 'http_server_error' });
  return res.text();
}

/** Save & Return's last step: into the CAD; standalone, Save Model (ROAD-3583) — the block (.json) and its
    .ifc twin, the bench's site model (GET /api/bim/site.ifc: the plan the block's ids name), both or neither.
    → 'host' | 'download' | 'directory', or '' (the problem is on screen; a cancelled picker says nothing). */
export async function saveWithSiteTwin(S, host, block, meta, { api = bimApi(), fetchImpl = globalThis.fetch, onRetry } = {}) {
  if (host.embedded || typeof S.saveModel !== 'function') return host.save(block, meta);
  const r = await S.saveModel(block, { name: meta.filename, toIfc: () => exportSiteIfc({ api, fetchImpl }) });
  if (!r.ok && !r.cancelled) S.showProblem(r.problem || 'save_failed', { onRetry });
  return r.ok ? r.via : '';
}
