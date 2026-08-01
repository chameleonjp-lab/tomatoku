/**
 * トマトオク 効果音
 *
 * 初回は無音。利用者が有効にした場合だけ、Web Audio APIで短い音を作る。
 * 音源ファイルを持たないため、追加通信や外部素材は発生しない。
 */

export const SOUND_STORAGE_KEY = "tomatoku.soundEnabled";

let soundEnabled = loadSoundSetting();
let audioContext = null;
const lastPlayedAt = new Map();

function audioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function loadSoundSetting() {
  try {
    return globalThis.localStorage?.getItem(SOUND_STORAGE_KEY) === "true";
  } catch (_) {
    return false;
  }
}

function saveSoundSetting(enabled) {
  try {
    globalThis.localStorage?.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch (_) {
    // 保存不可でも、現在のページでは選んだ設定を使う。
  }
}

export function isSoundSupported() {
  return Boolean(audioContextConstructor());
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  saveSoundSetting(soundEnabled);
  if (soundEnabled) unlockSound();
  return soundEnabled;
}

export function unlockSound() {
  if (!soundEnabled) return null;

  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) return null;

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {});
    }
    return audioContext;
  } catch (_) {
    return null;
  }
}

function canPlay(kind) {
  const now = Date.now();
  const previous = lastPlayedAt.get(kind) || 0;
  if (now - previous < 90) return false;
  lastPlayedAt.set(kind, now);
  return true;
}

function scheduleTone({
  frequency,
  endFrequency = frequency,
  delay = 0,
  duration,
  type,
  volume,
}) {
  const context = unlockSound();
  if (!context) return false;

  try {
    const startAt = context.currentTime + delay;
    const stopAt = startAt + duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, stopAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.01);
    return true;
  } catch (_) {
    return false;
  }
}

export function playCorrectSound() {
  if (!soundEnabled || !canPlay("correct")) return false;

  const first = scheduleTone({
    frequency: 620,
    endFrequency: 720,
    duration: 0.08,
    type: "sine",
    volume: 0.028,
  });
  scheduleTone({
    frequency: 820,
    endFrequency: 920,
    delay: 0.065,
    duration: 0.11,
    type: "sine",
    volume: 0.032,
  });
  return first;
}

export function playIncorrectSound() {
  if (!soundEnabled || !canPlay("incorrect")) return false;

  return scheduleTone({
    frequency: 210,
    endFrequency: 125,
    duration: 0.18,
    type: "triangle",
    volume: 0.034,
  });
}
