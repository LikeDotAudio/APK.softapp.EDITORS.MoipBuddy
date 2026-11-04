// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

export class MoipStreamModel {
  constructor(streamPoolName = 'CAMPUS-MOIP-FABRIC') {
    this.streamPoolName = streamPoolName;
    this.streams = [
      { id: 1, name: 'DANTE-CH1-8', group: '239.69.10.1', port: 5004, channels: 8, format: 'L24/48k', bandwidthMbps: 6.5, redundancy: 'Hitless ST 2022-7', status: 'Active' },
      { id: 2, name: 'ST2110-30-MAIN', group: '239.69.10.2', port: 5004, channels: 2, format: 'L24/48k', bandwidthMbps: 2.1, redundancy: 'Hitless ST 2022-7', status: 'Active' },
      { id: 3, name: 'ST2110-20-4K-PROG', group: '239.100.1.1', port: 20000, channels: 1, format: '4K60p 4:2:2 10-bit', bandwidthMbps: 12000.0, redundancy: 'Single Flow', status: 'Active' }
    ];
    this.nextId = 4;
  }

  addStream(stream = {}) {
    const s = {
      id: this.nextId++,
      name: stream.name || 'NEW-STREAM',
      group: stream.group || `239.69.10.${this.streams.length + 5}`,
      port: stream.port ? parseInt(stream.port, 10) : 5004,
      channels: stream.channels ? parseInt(stream.channels, 10) : 2,
      format: stream.format || 'L24/48k',
      bandwidthMbps: stream.bandwidthMbps !== undefined ? parseFloat(stream.bandwidthMbps) : 2.1,
      redundancy: stream.redundancy || 'Hitless ST 2022-7',
      status: stream.status || 'Active'
    };
    this.streams.push(s);
    return s;
  }

  removeStream(idOrIdx) {
    if (typeof idOrIdx === 'number' && idOrIdx < this.streams.length && !this.streams.some(s => s.id === idOrIdx)) {
      return this.streams.splice(idOrIdx, 1)[0];
    }
    const idx = this.streams.findIndex(s => s.id === idOrIdx);
    if (idx !== -1) {
      return this.streams.splice(idx, 1)[0];
    }
    return null;
  }

  updateStream(index, field, value) {
    if (this.streams[index]) {
      if (field === 'port' || field === 'channels') {
        this.streams[index][field] = parseInt(value, 10) || 0;
      } else if (field === 'bandwidthMbps') {
        this.streams[index][field] = parseFloat(value) || 0;
      } else {
        this.streams[index][field] = value;
      }
    }
  }

  checkCollisions() {
    const seen = new Map();
    const collisions = [];

    this.streams.forEach(s => {
      const key = `${s.group}:${s.port}`;
      if (seen.has(key)) {
        collisions.push(s);
      } else {
        seen.set(key, s.id);
      }
    });

    return collisions;
  }

  toBlock() {
    return {
      type: 'moip_streams',
      id: `moip_${this.streamPoolName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      streamPoolName: this.streamPoolName,
      streams: JSON.parse(JSON.stringify(this.streams))
    };
  }

  fromBlock(block = {}) {
    if (block.streamPoolName) this.streamPoolName = block.streamPoolName;
    if (Array.isArray(block.streams)) {
      this.streams = JSON.parse(JSON.stringify(block.streams));
    }
  }
}
