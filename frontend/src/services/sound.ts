let audioCtx: AudioContext | null = null;
let ringbackInterval: any = null;
let ringtoneInterval: any = null;
let activeNodes: { osc?: OscillatorNode; gain?: GainNode }[] = [];

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function stopActiveNodes() {
  activeNodes.forEach(({ osc, gain }) => {
    try {
      if (gain && audioCtx) {
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
      }
      if (osc) {
        osc.stop();
        osc.disconnect();
      }
    } catch {}
  });
  activeNodes = [];
}

/**
 * Play outgoing ringback tone (soft 425Hz pulsing tone)
 */
export function playRingback(): void {
  stopAllSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playBeep = () => {
    if (!audioCtx || audioCtx.state === 'closed') return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 1.2);
      gain.gain.linearRampToValueAtTime(0, now + 1.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 1.35);

      activeNodes.push({ osc, gain });
    } catch (e) {
      console.warn('[Sound] ringback error:', e);
    }
  };

  playBeep();
  ringbackInterval = setInterval(playBeep, 3500);
}

export function stopRingback(): void {
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
  stopActiveNodes();
}

/**
 * Play incoming ringtone (pleasant repeating chime)
 */
export function playRingtone(): void {
  stopAllSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playChimeSequence = () => {
    if (!audioCtx || audioCtx.state === 'closed') return;
    try {
      const notes = [
        { freq: 587.33, start: 0, dur: 0.2 },     // D5
        { freq: 659.25, start: 0.25, dur: 0.2 },  // E5
        { freq: 880.00, start: 0.5, dur: 0.35 },  // A5
        { freq: 783.99, start: 0.9, dur: 0.4 },   // G5
      ];

      notes.forEach(({ freq, start, dur }) => {
        if (!audioCtx) return;
        const now = audioCtx.currentTime + start;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + dur + 0.05);

        activeNodes.push({ osc, gain });
      });
    } catch (e) {
      console.warn('[Sound] ringtone error:', e);
    }
  };

  playChimeSequence();
  ringtoneInterval = setInterval(playChimeSequence, 2800);
}

export function stopRingtone(): void {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  stopActiveNodes();
}

/**
 * Play short busy beeps
 */
export function playBusyTone(): void {
  stopAllSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const start = now + i * 0.4;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.02);
      gain.gain.setValueAtTime(0.09, start + 0.2);
      gain.gain.linearRampToValueAtTime(0, start + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.25);
    }
  } catch (e) {
    console.warn('[Sound] busy tone error:', e);
  }
}

/**
 * Stop all active ringtones / ringbacks
 */
export function stopAllSounds(): void {
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  stopActiveNodes();
}
