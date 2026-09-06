import confetti from 'canvas-confetti';

export function fireGrandConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  // Multi-tier fireworks explosion
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981'],
  });

  fire(0.2, {
    spread: 60,
    colors: ['#ffd700', '#f43f5e', '#38bdf8', '#ffffff'],
  });

  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#a855f7', '#6366f1', '#fbbf24'],
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}

export function fireContinuousSideCannons(durationMs: number = 2500) {
  const end = Date.now() + durationMs;
  const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#38bdf8'];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors: colors,
      zIndex: 9999,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.8 },
      colors: colors,
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}
