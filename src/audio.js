const MAX_ACTIVE_VOICES = 20;
const MAX_COLLISION_SOUNDS_PER_FRAME = 6;
const MAX_SPECIAL_SOUNDS_PER_FRAME = 2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function tonePlanForEvent(event) {
  switch (event?.type) {
    case 'brick-hit': {
      const scoreStep = Math.trunc((event.score ?? 0) / 10) % 7;
      return [
        {
          frequency: 540 + scoreStep * 34,
          endFrequency: 740 + scoreStep * 38,
          duration: 0.075,
          gain: 0.035,
          type: 'sine',
        },
      ];
    }
    case 'paddle-hit':
      return [
        {
          frequency: 250,
          endFrequency: 330,
          duration: 0.1,
          gain: 0.045,
          type: 'triangle',
        },
      ];
    case 'multiply':
      return [0, 1, 2].map((index) => ({
        frequency: [440, 660, 990][index],
        duration: 0.16,
        delay: index * 0.055,
        gain: 0.055,
        type: 'sine',
      }));
    case 'lost':
      return [
        {
          frequency: 240,
          endFrequency: 90,
          duration: 0.36,
          gain: 0.055,
          type: 'triangle',
        },
      ];
    case 'won':
      return [523.25, 659.25, 783.99].map((frequency, index) => ({
        frequency,
        duration: 0.4,
        delay: index * 0.035,
        gain: 0.04,
        type: 'sine',
      }));
    default:
      return null;
  }
}

export function createAudioController(options = {}) {
  let enabled = options.enabled ?? true;
  let context = null;
  let activeVoices = 0;
  let disposed = false;
  let disposePromise = null;

  function getAudioContextConstructor() {
    return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
  }

  function createContext() {
    if (typeof options.createContext === 'function') {
      return options.createContext();
    }
    const AudioContextConstructor = getAudioContextConstructor();
    return AudioContextConstructor ? new AudioContextConstructor() : null;
  }

  async function unlock() {
    if (!enabled || disposed) {
      return false;
    }

    if (!context) {
      try {
        context = createContext();
      } catch {
        return false;
      }
      if (!context) {
        return false;
      }
    }

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }
    return !disposed && context?.state === 'running';
  }

  function playTone(tone) {
    if (disposed || !enabled || !context || context.state !== 'running') {
      return;
    }
    if (activeVoices >= MAX_ACTIVE_VOICES) {
      return;
    }

    const startTime = context.currentTime + Math.max(0, tone.delay ?? 0);
    const duration = clamp(tone.duration ?? 0.1, 0.02, 0.45);
    const volume = clamp(tone.gain ?? 0.04, 0.001, 0.08);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, startTime);
    if (tone.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, tone.endFrequency),
        startTime + duration,
      );
    }

    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(volume, startTime + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);

    activeVoices += 1;
    const releaseVoice = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.addEventListener('ended', releaseVoice, { once: true });
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.015);
  }

  function playEvents(events) {
    if (disposed || !enabled || !context || context.state !== 'running') {
      return;
    }

    const collisionEvents = [];
    const specialEvents = [];
    for (const event of events) {
      if (
        (event.type === 'brick-hit' || event.type === 'paddle-hit') &&
        collisionEvents.length < MAX_COLLISION_SOUNDS_PER_FRAME
      ) {
        collisionEvents.push(event);
      } else if (
        (event.type === 'multiply' || event.type === 'lost' || event.type === 'won') &&
        specialEvents.length < MAX_SPECIAL_SOUNDS_PER_FRAME
      ) {
        specialEvents.push(event);
      }
    }

    for (const event of [...specialEvents, ...collisionEvents]) {
      const plan = tonePlanForEvent(event);
      if (plan) {
        for (const tone of plan) {
          playTone(tone);
        }
      }
    }
  }

  function setEnabled(nextEnabled) {
    if (disposed) {
      enabled = false;
      return false;
    }
    enabled = Boolean(nextEnabled);
    if (!enabled && context?.state === 'running') {
      void context.suspend().catch(() => {});
    } else if (enabled && context?.state === 'suspended') {
      void context.resume().catch(() => {});
    }
    return enabled;
  }

  function dispose() {
    if (disposePromise) {
      return disposePromise;
    }

    disposed = true;
    enabled = false;
    activeVoices = 0;
    const contextToClose = context;
    context = null;
    disposePromise =
      contextToClose && contextToClose.state !== 'closed'
        ? Promise.resolve()
            .then(() => contextToClose.close?.())
            .catch(() => {})
        : Promise.resolve();
    return disposePromise;
  }

  return {
    unlock,
    playEvents,
    setEnabled,
    dispose,
    toggle() {
      return setEnabled(!enabled);
    },
    get enabled() {
      return enabled;
    },
    get unlocked() {
      return context?.state === 'running';
    },
  };
}
