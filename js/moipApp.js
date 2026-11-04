// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { MoipStreamModel } from './moipModel.js';
import { BlockBridge } from './blockBridge.js';

export { MoipStreamModel };

export class MoipApp {
  constructor() {
    this.model = new MoipStreamModel();
    this.bridge = new BlockBridge({
      name: 'MoIP Stream Buddy',
      type: 'moip_streams',
      onBlockLoaded: (b, m) => this.handleBlockLoaded(b, m),
      onBlockChanged: () => this.render()
    });

    this.tableBody = document.getElementById('streams-table-body');
    this.svgContainer = document.getElementById('pipeline-svg');
    this.initControls();
    this.render();
    this.autoConnect();
  }

  async autoConnect() {
    const discovered = await this.bridge.fetchDiscoveredProject();
    if (discovered && discovered.moip && discovered.moip.length > 0) {
      this.model.fromBlock(discovered.moip[0]);
      this.render();
    }
  }

  handleBlockLoaded(block, meta) {
    if (block) {
      this.model.fromBlock(block);
      this.render();
    }
  }

  initControls() {
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.bridge.saveBlock(this.model.toBlock(), { name: this.model.streamPoolName });
      });
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
              this.model.fromBlock(data);
              this.render();
            } catch (err) {
              alert('Invalid block file: ' + err.message);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }

    const btnClose = document.getElementById('btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.bridge.close());
    }

    const btnDiscovered = document.getElementById('btn-discovered');
    if (btnDiscovered) {
      btnDiscovered.addEventListener('click', async () => {
        const disc = await this.bridge.fetchDiscoveredProject();
        if (disc && disc.moip && disc.moip.length > 0) {
          this.model.fromBlock(disc.moip[0]);
          this.render();
        } else {
          alert('No MoIP stream blocks found in current discovered project.');
        }
      });
    }

    const btnAddStream = document.getElementById('btn-add-stream');
    if (btnAddStream) {
      btnAddStream.addEventListener('click', () => {
        this.model.addStream();
        this.render();
        this.bridge.notifyChanged();
      });
    }

    const propPool = document.getElementById('prop-streamPoolName');
    if (propPool) {
      propPool.addEventListener('input', (e) => {
        this.model.streamPoolName = e.target.value;
        this.bridge.notifyChanged();
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

  renderTable() {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = '';

    const collisions = this.model.checkCollisions();

    this.model.streams.forEach((s, idx) => {
      const tr = document.createElement('tr');
      const isCollision = collisions.some(c => c.id === s.id);

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size: 11px;">#${s.id}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="name">${s.name}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="group" style="${isCollision ? 'color: #EF4444; font-weight: bold;' : ''}">${s.group}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="port">${s.port}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="channels">${s.channels}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="format">${s.format}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="bandwidthMbps">${s.bandwidthMbps}</td>
        <td>
          <select class="control-select" data-idx="${idx}" data-field="redundancy">
            <option value="Hitless ST 2022-7" ${s.redundancy === 'Hitless ST 2022-7' ? 'selected' : ''}>Hitless ST 2022-7 (Red + Blue)</option>
            <option value="Single Flow" ${s.redundancy === 'Single Flow' ? 'selected' : ''}>Single Flow</option>
            <option value="Dante Secondary" ${s.redundancy === 'Dante Secondary' ? 'selected' : ''}>Dante Redundant</option>
          </select>
        </td>
        <td>
          <span style="font-weight: bold; font-size: 11px; color: ${s.status === 'Active' ? '#4ADE80' : '#888888'};">
            ${s.status}
          </span>
        </td>
        <td style="text-align: center;">
          <button class="btn-delete" data-idx="${idx}" title="Delete Stream">✕</button>
        </td>
      `;

      this.tableBody.appendChild(tr);
    });

    this.tableBody.querySelectorAll('[contenteditable=true]').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const field = e.target.dataset.field;
        this.model.updateStream(idx, field, e.target.innerText.trim());
        this.render();
        this.bridge.notifyChanged();
      });
    });

    this.tableBody.querySelectorAll('select.control-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const field = e.target.dataset.field;
        this.model.updateStream(idx, field, e.target.value);
        this.renderSvg();
        this.bridge.notifyChanged();
      });
    });

    this.tableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        this.model.removeStream(idx);
        this.render();
        this.bridge.notifyChanged();
      });
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
      const isRedundant = s.redundancy.includes('2022-7') || s.redundancy.includes('Redundant');

      rowsSvg += `
        <!-- Sender Node -->
        <rect x="25" y="${y}" width="140" height="24" rx="4" fill="#18181b" stroke="#2B3C5D" stroke-width="1"/>
        <text x="35" y="${y + 16}" fill="#F4902C" font-size="10" font-family="JetBrains Mono, monospace">${s.name}</text>

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
        <text x="310" y="${y + 8}" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">${s.group}:${s.port}</text>

        <!-- Receiver / Fabric Node -->
        <rect x="455" y="${y}" width="160" height="24" rx="4" fill="#18181b" stroke="#2B3C5D" stroke-width="1"/>
        <text x="465" y="${y + 16}" fill="#4ADE80" font-size="10" font-family="sans-serif">${s.format} (${s.channels} Ch)</text>
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
