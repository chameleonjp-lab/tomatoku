import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = fs.readFileSync(path.join(ROOT, "src/main.js"), "utf8");
const tutorialSource = fs.readFileSync(path.join(ROOT, "src/tutorial.js"), "utf8");

const values = new Map();
const oscillators = [];

class FakeAudioParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeOscillator {
  constructor() {
    this.frequency = new FakeAudioParam();
    this.type = "sine";
    this.started = false;
    oscillators.push(this);
  }
  connect() {}
  start() {
    this.started = true;
  }
  stop() {}
}

class FakeGain {
  constructor() {
    this.gain = new FakeAudioParam();
  }
  connect() {}
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.state = "running";
  }
  createOscillator() {
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

globalThis.localStorage = {
  getItem(key) {
    return values.get(key) ?? null;
  },
  setItem(key, value) {
    values.set(key, value);
  },
};
globalThis.AudioContext = FakeAudioContext;

const sound = await import(`../src/sound.js?test=${Date.now()}`);

assert.equal(sound.isSoundSupported(), true);
assert.equal(sound.isSoundEnabled(), false, "初回は効果音なし");
assert.equal(sound.playCorrectSound(), false, "無音設定では正解音を作らない");
assert.equal(oscillators.length, 0);

sound.setSoundEnabled(true);
assert.equal(values.get(sound.SOUND_STORAGE_KEY), "true");
assert.equal(sound.playCorrectSound(), true);
assert.equal(oscillators.length, 2, "正解音は短い2音");
assert.ok(oscillators.every((oscillator) => oscillator.started));
assert.ok(oscillators.every((oscillator) => oscillator.type === "sine"));

assert.equal(sound.playIncorrectSound(), true);
assert.equal(oscillators.length, 3, "不正解音は正解音と異なる短い1音");
assert.equal(oscillators[2].type, "triangle");

sound.setSoundEnabled(false);
assert.equal(values.get(sound.SOUND_STORAGE_KEY), "false");
assert.equal(sound.playIncorrectSound(), false, "無音へ戻すと不正解音を作らない");
assert.equal(oscillators.length, 3);

const stageClearSource = mainSource.match(
  /function onStageClear\([^)]*\)[\s\S]*?function updateHud/
)?.[0];
assert.ok(stageClearSource, "ステージクリア処理を取得");
assert.ok(
  stageClearSource.indexOf("session.finishStage") <
    stageClearSource.indexOf("playCorrectSound"),
  "最終タップはタイム確定後に正解音を鳴らす"
);
const paintBoundarySource = mainSource.match(
  /function startPlayingAfterBoardPaint\([^)]*\)[\s\S]*?function setGameStatus/
)?.[0];
assert.ok(paintBoundarySource, "盤面paint後の開始処理を取得");
assert.equal(
  (paintBoundarySource.match(/requestAnimationFrame/g) || []).length,
  2,
  "盤面を1フレーム描画してから次のrAFで計測する"
);
assert.ok(
  paintBoundarySource.indexOf("session.startStage") <
    paintBoundarySource.indexOf("setBoardInputEnabled(true)"),
  "計測開始より前に盤面入力を有効化しない"
);
assert.match(
  mainSource,
  /result\.type === "mistake"[\s\S]*?playIncorrectSound\(\)/,
  "ゲーム本編の不正解へ接続"
);
assert.match(
  mainSource,
  /else if \(result\.type === "place"\)[\s\S]*?playCorrectSound\(\)/,
  "ゲーム本編の正解へ接続"
);
assert.match(
  tutorialSource,
  /mark === "ok"[\s\S]*?playCorrectSound\(\)/,
  "チュートリアルの✓へ正解音を接続"
);
assert.match(
  tutorialSource,
  /function ghostBad[\s\S]*?playIncorrectSound\(\)/,
  "チュートリアルの✗へ不正解音を接続"
);
assert.match(
  mainSource,
  /#again-btn[\s\S]*?unlockSound\(\)[\s\S]*?startNamedGame/,
  "再挑戦の操作でiPhoneの音声を再開"
);
assert.match(
  mainSource,
  /#tutorial-replay[\s\S]*?unlockSound\(\)[\s\S]*?playTutorial/,
  "チュートリアル再生の操作でiPhoneの音声を再開"
);

delete globalThis.AudioContext;
delete globalThis.localStorage;

console.log("✓ 効果音は初回OFFで、利用者が有効にした場合だけ再生する");
