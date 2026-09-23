'use strict';

const assert = require('assert');
const {
  buildNotifyPayload,
  buildCustomAppPayload,
  resolveIcon,
  resolveSound,
  iconAutocompleteResults,
  soundAutocompleteResults,
  BUILTIN_SOUNDS,
} = require('../lib/Awtrix');

function testNotifyBasics() {
  const payload = buildNotifyPayload({
    text: 'Hello',
    icon: 'message',
    sound: 'chime',
    color: '#00dcb4',
    duration: 8,
    rainbow: true,
    hold: true,
    wakeup: true,
  });

  assert.strictEqual(payload.text, 'Hello');
  assert.strictEqual(payload.duration, 8);
  assert.strictEqual(payload.rainbow, true);
  assert.strictEqual(payload.hold, true);
  assert.strictEqual(payload.wakeup, true);
  assert.strictEqual(payload.color, '#00DCB4');
  assert.ok(payload.icon && payload.icon.length > 64, 'bundled icon should be base64');
  assert.strictEqual(payload.rtttl, BUILTIN_SOUNDS.chime);
  assert.strictEqual(payload.sound, undefined);
}

function testDeviceIconAndSound() {
  const payload = buildNotifyPayload({
    text: 'Hi',
    icon: '16701',
    sound: 'alarm_clock',
  });
  assert.strictEqual(payload.icon, '16701');
  assert.strictEqual(payload.sound, 'alarm_clock');
  assert.strictEqual(payload.rtttl, undefined);
}

function testCustomAppStripsNotifyKeys() {
  const payload = buildCustomAppPayload({
    text: 'Temp',
    icon: 'info',
    sound: 'beep',
    hold: true,
    lifetime: 120,
  });
  assert.strictEqual(payload.text, 'Temp');
  assert.strictEqual(payload.lifetime, 120);
  assert.strictEqual(payload.sound, undefined);
  assert.strictEqual(payload.rtttl, undefined);
  assert.strictEqual(payload.hold, undefined);
}

function testResolveHelpers() {
  assert.strictEqual(resolveSound('none').type, 'none');
  assert.strictEqual(resolveSound('beep').type, 'rtttl');
  assert.ok(resolveIcon('homey').length > 64);
  assert.strictEqual(resolveIcon('weather'), 'weather');
}

function testAutocomplete() {
  assert.ok(iconAutocompleteResults('mes').some((i) => i.id === 'message'));
  assert.ok(soundAutocompleteResults('chi').some((i) => i.id === 'chime'));
}

function testExtraJson() {
  const payload = buildNotifyPayload({
    text: 'X',
    extraJson: '{"effect":"Fire","scrollSpeed":50}',
  });
  assert.strictEqual(payload.effect, 'Fire');
  assert.strictEqual(payload.scrollSpeed, 50);
}

testNotifyBasics();
testDeviceIconAndSound();
testCustomAppStripsNotifyKeys();
testResolveHelpers();
testAutocomplete();
testExtraJson();
console.log('All Awtrix helper tests passed');
