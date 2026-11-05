// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* moipDiscovered.js — the streams the bus already carries, as MoIP stream rows.

   Pure: a flow feed's JSON text and config/discovery.json in, rows out. The
   one shape read today is PLUGIN.DANTE's FlowView array (dante/Flows):
   { device, key, id, direction, multicast, address, port, sample_rate,
     encoding, latency_us, peer, channels, slots }. What a flow does not say is
   left empty, never guessed: no redundancy is claimed (a Dante secondary is a
   separate flow), and the bitrate is the audio payload only. */

export function parseFlows(text, shape) {
  let doc;
  try { doc = JSON.parse(text); } catch (_) { return []; }
  if (shape === 'dante-flowview' && Array.isArray(doc)) return doc.filter((f) => f && typeof f === 'object');
  return [];
}

/** The fabric streams among `flows`: rules.directions and rules.multicastOnly choose. */
export function streamsFromFlows(flows, rules = {}) {
  const dirs = new Set((rules.directions || ['tx']).map((d) => String(d).toLowerCase()));
  return flows
    .filter((f) => dirs.has(String(f.direction || '').toLowerCase()))
    .filter((f) => !rules.multicastOnly || f.multicast === true)
    .map((f) => {
      const channels = Array.isArray(f.channels) ? f.channels.filter((c) => c > 0).length : 0;
      const rate = Number(f.sample_rate) || 0;
      const bits = Number(f.encoding) || 0;
      const format = bits && rate ? `L${bits}/${rate % 1000 ? (rate / 1000).toFixed(1) : rate / 1000}k` : '';
      const payload = channels && rate && bits ? Math.round((channels * rate * bits) / 1e5) / 10 : 0;
      return {
        flowId: `${f.device}/${f.key}`,
        name: `${f.device} ${f.key}`,
        device: String(f.device || ''),
        group: f.address ? String(f.address) : '',
        port: Number(f.port) || 0,
        channels,
        format,
        bandwidthMbps: payload,
        redundancy: '',
        status: 'Seen on the network',
        latencyMs: f.latency_us ? f.latency_us / 1000 : null,
      };
    });
}

/** A discovered stream as a row of the block (the model's stream fields only). */
export function streamRow(s) {
  return {
    name: s.name, group: s.group, port: s.port, channels: s.channels, format: s.format,
    bandwidthMbps: s.bandwidthMbps, redundancy: s.redundancy, status: s.status, source: s.flowId,
  };
}
