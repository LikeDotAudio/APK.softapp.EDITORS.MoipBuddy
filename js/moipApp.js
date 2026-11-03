// Part of the APK.audio project — Anthony Kuzub
// MIT Licence.

export class MoipStreamModel {
  constructor() {
    this.streams = [
      { id: 1, name: 'DANTE-CH1-8', group: '239.69.10.1', port: 5004, channels: 8, format: 'L24/48k', status: 'Active' },
      { id: 2, name: 'ST2110-30-MAIN', group: '239.69.10.2', port: 5004, channels: 2, format: 'L24/48k', status: 'Active' },
      { id: 3, name: 'ST2110-20-4K-PROG', group: '239.100.1.1', port: 20000, channels: 1, format: '4K60p 4:2:2 10-bit', status: 'Active' }
    ];
  }

  addStream(stream) {
    this.streams.push({ id: this.streams.length + 1, ...stream });
  }

  removeStream(id) {
    this.streams = this.streams.filter(s => s.id !== id);
  }
}
