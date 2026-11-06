// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { MoipStreamModel } from './moipModel.js';
import { parseFlows, streamsFromFlows, streamRow } from './moipDiscovered.js';
import { loadSystems, saveStreams, systemsToStreams, exportSiteIfc, scopeOf } from './moipBench.js';

const esc = (s) => window.APKSoftapp.esc(s);
const REDUNDANCY = ['', 'Hitless ST 2022-7', 'Single Flow', 'Dante Secondary'];

export { MoipStreamModel };

export class MoipApp {
  constructor() {
    this.model = new MoipStreamModel();
    /* The CAD link: cad.like.audio/host@1 through vendor/apk-softapp. Same
       origin only; standalone, Save downloads the block as .json. */
    this.host = window.APKSoftapp.connectHost({
      editor: 'MoIP Stream Buddy',
      blockType: 'moip_streams',
      onLoad: (b, m) => this.handleBlockLoaded(b, m),
      onRequest: () => ({ block: this.model.toBlock(), meta: { name: this.model.streamPoolName } }),
    });

    this.seenStreams = [];
    this.tableHost = document.getElementById('streams-table');
    this.svgContainer = document.getElementById('pipeline-svg');
    window.APKSoftapp.describe({
      name: 'MoIP Stream Buddy',
      does: 'Plans the multicast media streams of one pool (group, port, channels, format, bitrate, redundancy) and flags collisions.',
      inputs: [
        { name: 'MoIP stream block', from: 'the CAD block this editor was opened on (host@1 load)', kind: 'cad' },
        { name: 'Block file', from: '.json picked with Open Block', kind: 'file' },
        { name: 'Media devices', from: 'APKSoftapp.discovered() on the bus, kinds from config/discovery.json', kind: 'bus' },
        { name: 'Streams on the bus', from: 'each config/discovery.json flowFeed', kind: 'bus', topic: 'System/Protocols/<proto>/<path> (e.g. dante/Flows)' },
        { name: 'The bench plan', from: 'DATABASE.server.BIM GET /api/bim/bench/systems on ⇩ From bench (each stream with its IfcGlobalId)' },
      ],
      outputs: [
        { name: 'MoIP stream block', to: 'the CAD drawing on Save & Return (after the rows are planned on the bench), or a .json download standalone: {streamPoolName, systems: [bench stream ids]}, no copy of the plan', kind: 'cad' },
        { name: 'Live edits', to: 'the CAD after every change (blockChanged)', kind: 'cad' },
        { name: 'The bench plan', to: 'DATABASE.server.BIM bench systems on ⇧ To bench: each stream an IfcDistributionCircuit' },
        { name: 'Site model', to: 'a site.ifc download on ⬇ Export IFC (GET /api/bim/site.ifc)', kind: 'file' },
      ],
      controls: [
        { name: '+ Add MoIP Stream', how: 'adds a planned stream' },
        { name: 'Stream table', how: 'edit name, multicast group, UDP port, channels, format, bitrate, redundancy; the row × deletes it' },
        { name: 'Add (seen streams)', how: 'takes a stream the bus carries into the plan' },
        { name: '⚡ Discovered', how: 'show / hide the bus panel' },
        { name: 'Stream Pool Name', how: 'the pool name saved in the block' },
        { name: 'Save & Return / ✕', how: 'plan the rows on the bench, then save the block (their bench ids) into the CAD (or download) / close the editor' },
        { name: '⇩ From bench / ⇧ To bench', how: 'read the planned streams from the BIM bench / plan these there (rows without a multicast group and port stay here)' },
        { name: '⬇ Export IFC', how: 'download the site model (site.ifc)' },
      ],
      problems: ['bad_json', 'bad_input', 'file_unreadable', 'bus_missing', 'http_not_found', 'config_invalid', 'not_in_cad', 'http_forbidden', 'http_server_error'],
    });
    this.initControls();
    this.render();
    this.autoConnect();
  }

  changed() {
    this.host.changed(this.model.toBlock());
  }

  /* What the bus already carries: the media devices (config/discovery.json
     kinds) and the streams their plugins publish (flowFeeds, e.g. dante/Flows).
     Add takes a seen stream into the plan; nothing is copied until asked. */
  async autoConnect() {
    const status = document.getElementById('net-status');
    const fail = (why) => { if (status) { status.setAttribute('data-apk-state', 'dead'); status.textContent = why; } };
    let rules;
    try {
      const cfg = await window.APKSoftapp.discoveredConfig(new URL('../config/discovery.json', import.meta.url), { required: true });
      if (cfg.problem) throw Object.assign(new Error(cfg.why), { problem: cfg.problem });
      rules = cfg;
    } catch (err) {
      fail(`Could not read config/discovery.json (${err.message}).`);
      window.APKSoftapp.showProblem(err.problem || err, {
        subject: 'config/discovery.json',
        fix: ['config/discovery.json sits beside index.html in EDITORS.MoipBuddy; it names the media device kinds and the flow feeds to read.'],
        onRetry: () => this.autoConnect(),
      });
      return;
    }
    this.rules = rules;
    this.flowTable();
    const devices = document.getElementById('net-table');
    if (devices) {
      this.network = await window.APKSoftapp.discoveredPanel(devices, {
        status, id: 'moip-devices', config: rules,
        empty: 'No media device on the bus yet.',
      });
    }
    const S = window.APKSoftapp;
    const C = S.contracts();
    const link = C ? await S.bus() : null;
    if (!C || !link) return;
    const flows = {};
    const draw = () => {
      this.seenStreams = Object.values(flows).flat();
      this.seenTable?.setRows(this.seenStreams);
      this.renderTelemetry();
    };
    for (const feed of rules.flowFeeds || []) {
      let topic;
      try { topic = C.Topics.protocols.topic({ proto: feed.proto, path: feed.path }); } catch (err) {
        S.showProblem('config_invalid', {
          subject: 'config/discovery.json flowFeeds',
          detail: `${JSON.stringify(feed)}: ${err.message}`,
          fix: ['Each flowFeeds entry needs a proto and a path array, e.g. { "proto": "dante", "path": ["Flows"], "shape": "dante-flowview" }; then reload.'],
        });
        continue;
      }
      let warned = false;   // one card per feed per outage, not one per message
      link.subscribe(topic, (t, text) => {
        let readable = true;
        if (text) { try { JSON.parse(text); } catch (_) { readable = false; } }
        if (!readable && !warned) {
          warned = true;
          S.showProblem('bad_json', {
            subject: `${feed.proto} flow feed`,
            detail: `${topic} carried something that is not JSON, so its streams are not shown`,
            fix: [`Check the ${feed.proto} plugin that publishes ${topic} is running and current (DockTor).`],
          });
        } else if (readable) warned = false;
        flows[topic] = streamsFromFlows(parseFlows(text, feed.shape), rules);
        draw();
      });
    }
  }

  flowTable() {
    const host = document.getElementById('flow-table');
    if (!host || !window.APKTable) return;
    this.seenTable = window.APKTable.create(host, {
      id: 'moip-seen-streams', editable: false,
      empty: 'No stream on the bus yet (a plugin publishes them: config/discovery.json flowFeeds).',
      searchPlaceholder: 'device, group',
      columns: [
        { key: 'name', label: 'Flow' },
        { key: 'group', label: 'Multicast Group IP', mono: true },
        { key: 'port', label: 'UDP Port', type: 'number' },
        { key: 'channels', label: 'Chs', type: 'number' },
        { key: 'format', label: 'Format' },
        { key: 'bandwidthMbps', label: 'Payload (Mbps)', type: 'number' },
        { key: 'inPlan', label: 'In plan', render: (v, row) => this.addButton(row) },
      ],
      rows: [],
    });
  }

  addButton(row) {
    const inPlan = this.model.streams.some((s) => s.source === row.flowId);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'apk-table-btn';
    b.textContent = inPlan ? 'In plan' : 'Add';
    b.disabled = inPlan;
    b.onclick = () => {
      this.model.addSeen(streamRow(row));
      this.render();
      this.seenTable?.setRows(this.seenStreams);
      this.changed();
    };
    return b;
  }

  /** ⇩ From bench: the bench's planned streams replace the table; the collision check runs on them. */
  async fromBench() {
    try {
      this.model.streams = systemsToStreams(await loadSystems());
      this.model.nextId = this.model.streams.length + 1;
      this.owned = this.model.streams.map((s) => s.benchId);
      this.model.legacy = false;
      this.render();
      this.changed();
      return this.model.streams;
    } catch (err) {
      window.APKSoftapp.showProblem(err, { subject: 'the bench plan', fix: ['The plan is the BIM bench (DATABASE.server.BIM, /api/bim): check it is running in DockTor.'], onRetry: () => this.fromBench() });
      return null;
    }
  }

  /** The streams a block names, read from the bench (a block keeps only ids, ROAD-3582). */
  async loadScope() {
    const ids = this.model.systems || [];
    try {
      const { items, missing } = scopeOf(await loadSystems(), ids);
      this.model.streams = systemsToStreams(items);
      this.model.nextId = this.model.streams.length + 1;
      this.owned = this.model.streams.map((s) => s.benchId);
      this.render();
      if (missing.length) {
        window.APKSoftapp.showProblem('http_not_found', {
          subject: 'the bench plan', detail: `This block names ${missing.join(', ')}, which the bench does not hold.`,
          fix: ['Someone removed them from the bench plan; add the streams again and Save & Return, or ⇩ From bench for the whole plan.'],
        });
      }
      return this.model.streams;
    } catch (err) {
      window.APKSoftapp.showProblem(err, { subject: 'the bench plan', detail: `This block names ${ids.join(', ') || 'no streams'} on the BIM bench.`, fix: ['The plan is the BIM bench (DATABASE.server.BIM, /api/bim): check it is running in DockTor.'], onRetry: () => this.loadScope() });
      return null;
    }
  }

  /** ⇧ To bench: these streams become the bench's stream plan (and so IfcDistributionCircuits).
      Only streams this block planned when it was loaded are ever removed (`owned`). */
  async toBench() {
    try {
      const { items, skipped } = await saveStreams(this.model.streams, { owned: this.owned || [] });
      const kept = skipped;
      const mine = this.model.streams.filter((s) => !skipped.includes(s)).map((s) => `${String(s.group).toLowerCase()}:${Number(s.port)}`);
      const planned = items.filter((r) => r.kind === 'stream' && mine.includes(`${String(r.group).toLowerCase()}:${Number(r.port)}`));
      this.owned = planned.map((r) => r.id);
      this.model.legacy = false;
      this.model.streams = [...systemsToStreams(planned), ...kept];
      this.model.nextId = this.model.streams.length + 1;
      this.model.streams.forEach((s, i) => { s.id = i + 1; });
      this.render();
      return items;
    } catch (err) {
      window.APKSoftapp.showProblem(err, { subject: 'plan on the bench', fix: ['A planned stream has a multicast group (239.x.x.x) and a UDP port, once per group:port.'], onRetry: () => this.toBench() });
      return null;
    }
  }

  /** ⬇ Export IFC: the site model as an .ifc download (no IFC parser in the page). */
  async exportIfc() {
    try {
      const text = await exportSiteIfc();
      const url = URL.createObjectURL(new Blob([text], { type: 'model/step' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'site.ifc' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return text;
    } catch (err) {
      window.APKSoftapp.showProblem(err, { subject: 'site.ifc', onRetry: () => this.exportIfc() });
      return null;
    }
  }

  /** A block names bench ids (read them from the bench); an old one carries its rows (kept as they are
      until Save & Return moves them onto the bench). */
  handleBlockLoaded(block, meta) {
    if (!block) return;
    this.model.fromBlock(block);
    this.owned = [];
    this.render();
    if (this.model.systems) this.loadScope();
  }

  /** Save & Return: the rows go onto the bench first, then the block — their ids — into the CAD.
      A draft row (no multicast group:port) is not a plan and so is not in the block: it is named. */
  async saveBlock() {
    if (!(await this.toBench())) return null;
    const drafts = this.model.streams.filter((s) => !s.benchId);
    if (drafts.length) {
      window.APKSoftapp.showProblem('bad_input', {
        subject: 'drafts not saved', detail: `${drafts.map((s) => s.name || '(unnamed)').join(', ')}: no multicast group and UDP port yet, so not on the bench and not in the block.`,
        fix: ['Give each a 239.x.x.x group and a port, then Save & Return again.'],
      });
    }
    const block = this.model.toBlock();
    this.host.save(block, { name: this.model.streamPoolName, filename: block.id });
    return block;
  }

  initControls() {
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveBlock());
    }

    const btnOpen = document.getElementById('btn-open');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const data = JSON.parse(evt.target.result);
              this.handleBlockLoaded(data);
              this.changed();
            } catch (err) {
              window.APKSoftapp.showProblem(err.name === 'SyntaxError' ? 'bad_json' : 'bad_input', {
                subject: file.name, detail: err.message,
                fix: ['Open a MoIP stream block (.json saved by this editor, blockType moip_streams: {streamPoolName, systems} or an old one with streams).'],
              });
            }
          };
          reader.onerror = () => window.APKSoftapp.showProblem('file_unreadable', { subject: file.name, detail: reader.error && reader.error.message });
          reader.readAsText(file);
        };
        input.click();
      });
    }

    document.getElementById('btn-from-bench')?.addEventListener('click', () => this.fromBench());
    document.getElementById('btn-to-bench')?.addEventListener('click', () => this.toBench());
    document.getElementById('btn-export-ifc')?.addEventListener('click', () => this.exportIfc());

    const btnClose = document.getElementById('btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.host.close());
    }

    const btnDiscovered = document.getElementById('btn-discovered');
    if (btnDiscovered) {
      btnDiscovered.addEventListener('click', () => document.body.classList.toggle('net-hidden'));
    }

    const btnAddStream = document.getElementById('btn-add-stream');
    if (btnAddStream) {
      btnAddStream.addEventListener('click', () => {
        this.model.addStream();
        this.render();
        this.changed();
      });
    }

    const propPool = document.getElementById('prop-streamPoolName');
    if (propPool) {
      propPool.addEventListener('input', (e) => {
        this.model.streamPoolName = e.target.value;
        this.changed();
      });
    }
  }

  render() {
    const propPool = document.getElementById('prop-streamPoolName');
    if (propPool) {
      propPool.value = this.model.streamPoolName;
    }

    this.renderTelemetry();
    this.renderTable();
    this.renderSvg();
  }

  renderTelemetry() {
    const collisions = this.model.checkCollisions();
    const totalBw = this.model.streams.reduce((sum, s) => sum + s.bandwidthMbps, 0);
    const badge = document.getElementById('telemetry-badge');

    if (badge) {
      if (collisions.length === 0) {
        badge.textContent = `${this.model.streams.length} Multicast Streams • Total Fabric Load: ${totalBw > 1000 ? (totalBw / 1000).toFixed(2) + ' Gbps' : totalBw.toFixed(1) + ' Mbps'}`;
        badge.style.color = '#4ADE80';
      } else {
        badge.textContent = `⚠️ ${collisions.length} Multicast IP:Port Collision Detected!`;
        badge.style.color = '#EF4444';
      }
    }
  }

  /* The stream plan is an APKTable (vendor/apk-table): APKTable.get('moip-streams'). */
  renderTable() {
    if (!this.tableHost || !window.APKTable) return;
    if (this.table) { this.table.setRows(this.model.streams); return; }
    this.table = window.APKTable.create(this.tableHost, {
      id: 'moip-streams',
      searchPlaceholder: 'Filter streams',
      empty: 'No streams. Add one, or add a stream seen on the network.',
      columns: [
        { key: 'id', label: 'ID', type: 'number', editable: false },
        { key: 'name', label: 'Stream Name' },
        { key: 'group', label: 'Multicast Group IP', mono: true,
          cellClass: (v, row) => (this.model.checkCollisions().some((c) => c.id === row.id) ? 'moip-collision' : '') },
        { key: 'port', label: 'UDP Port', type: 'number' },
        { key: 'channels', label: 'Chs', type: 'number' },
        { key: 'format', label: 'Encoding Format' },
        { key: 'bandwidthMbps', label: 'Bitrate (Mbps)', type: 'number' },
        { key: 'redundancy', label: 'Redundancy', type: 'select', options: REDUNDANCY },
        { key: 'status', label: 'Status', editable: false },
      ],
      rows: this.model.streams,
      onEdit: (i, key, value) => {
        this.model.updateStream(i, key, value);
        this.render();
        this.changed();
      },
      onDelete: (i) => {
        this.model.streams.splice(i, 1);
        this.render();
        this.seenTable?.setRows(this.seenStreams);
        this.changed();
      },
    });
  }

  renderSvg() {
    if (!this.svgContainer) return;

    const width = 640;
    const rowH = 34;
    const height = Math.max(160, this.model.streams.length * rowH + 40);

    let rowsSvg = '';
    this.model.streams.forEach((s, idx) => {
      const y = 35 + idx * rowH;
      const isRedundant = /2022-7|Redundant|Secondary/.test(String(s.redundancy || ''));

      rowsSvg += `
        <!-- Sender Node -->
        <rect x="25" y="${y}" width="140" height="24" rx="4" fill="#18181b" stroke="#2B3C5D" stroke-width="1"/>
        <text x="35" y="${y + 16}" fill="#F4902C" font-size="10" font-family="JetBrains Mono, monospace">${esc(s.name)}</text>

        <!-- Primary Flow (Blue) -->
        <line x1="165" y1="${y + 8}" x2="455" y2="${y + 8}" stroke="#4A9EFF" stroke-width="2"/>
        <circle cx="310" cy="${y + 8}" r="3" fill="#4A9EFF"/>

        <!-- Secondary Flow (Orange, if Redundant) -->
        ${isRedundant ? `
          <line x1="165" y1="${y + 18}" x2="455" y2="${y + 18}" stroke="#F4902C" stroke-width="2" stroke-dasharray="4 2"/>
          <circle cx="310" cy="${y + 18}" r="3" fill="#F4902C"/>
        ` : ''}

        <!-- Multicast IP & Port Badge -->
        <rect x="230" y="${y - 4}" width="160" height="16" rx="3" fill="#121212" stroke="#2c2c2c" stroke-width="1"/>
        <text x="310" y="${y + 8}" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">${esc(s.group)}:${esc(s.port)}</text>

        <!-- Receiver / Fabric Node -->
        <rect x="455" y="${y}" width="160" height="24" rx="4" fill="#18181b" stroke="#2B3C5D" stroke-width="1"/>
        <text x="465" y="${y + 16}" fill="#4ADE80" font-size="10" font-family="sans-serif">${esc(s.format)} (${esc(s.channels)} Ch)</text>
      `;
    });

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8"/>
        <text x="25" y="20" fill="#888888" font-size="10" font-family="sans-serif" text-transform="uppercase">Stream Senders</text>
        <text x="310" y="20" fill="#888888" font-size="10" font-family="sans-serif" text-anchor="middle" text-transform="uppercase">Multicast Fabric</text>
        <text x="455" y="20" fill="#888888" font-size="10" font-family="sans-serif" text-transform="uppercase">Subscribers</text>
        <line x1="20" y1="24" x2="620" y2="24" stroke="#2c2c2c" stroke-width="1"/>
        ${rowsSvg}
      </svg>
    `;

    this.svgContainer.innerHTML = svg;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new MoipApp();
  });
}
