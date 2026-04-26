// offscreen.js - Reproduz som de notificação via Web Audio API

function playAlert() {
  try {
    const ctx = new AudioContext();

    // Sequência de notas (acorde de alerta estilo "ding ding")
    const notes = [
      { freq: 880, start: 0,    dur: 0.15, gain: 0.4 },
      { freq: 1100, start: 0.12, dur: 0.18, gain: 0.35 },
      { freq: 1320, start: 0.25, dur: 0.3,  gain: 0.3 },
    ];

    notes.forEach(({ freq, start, dur, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

      gainNode.gain.setValueAtTime(0, ctx.currentTime + start);
      gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });

    // Fechar contexto após reprodução
    setTimeout(() => ctx.close(), 1500);
  } catch (e) {
    console.warn('[Offscreen] Erro ao reproduzir som:', e);
  }
}

// Ouvir mensagem do service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'play-sound') {
    playAlert();
  }
});
