'use strict';

const fs = require('fs');
const path = require('path');

/** Bundled 8x8 icon names shipped with the app (base64 JPG). */
const BUNDLED_ICON_NAMES = [
  'homey',
  'message',
  'warning',
  'alert',
  'info',
  'check',
  'bell',
  'heart',
];

/** Built-in RTTTL melodies (no files needed on the clock). */
const BUILTIN_SOUNDS = {
  beep: 'beep:d=4,o=5,b=320:8c6',
  chime: 'chime:d=4,o=5,b=140:8e6,8g6,8c7',
  notify: 'notify:d=8,o=5,b=180:c6,e6,g6',
  alarm: 'alarm:d=4,o=5,b=160:8c6,8c6,8c6,p,8c6,8c6,8c6',
  success: 'success:d=8,o=5,b=140:c6,e6,g6,c7',
  error: 'error:d=8,o=4,b=120:c5,g4,c4',
  doorbell: 'doorbell:d=4,o=5,b=100:8e6,8c6,8e6,8c6',
};

const iconCache = new Map();

function getBundledIconBase64(name) {
  if (!name || !BUNDLED_ICON_NAMES.includes(name)) return null;
  if (iconCache.has(name)) return iconCache.get(name);
  const file = path.join(__dirname, '..', 'assets', 'icons', `${name}.jpg`);
  if (!fs.existsSync(file)) return null;
  const b64 = fs.readFileSync(file).toString('base64');
  iconCache.set(name, b64);
  return b64;
}

function resolveIcon(icon) {
  if (!icon) return undefined;
  const value = typeof icon === 'object' ? (icon.id || icon.name || '') : String(icon);
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Already a data/base64 payload
  if (trimmed.length > 64 && !trimmed.includes('/')) {
    return trimmed;
  }

  const bundled = getBundledIconBase64(trimmed);
  if (bundled) return bundled;

  // Device-local icon name / LaMetric-style ID / filename without extension
  return trimmed;
}

function resolveSound(sound) {
  if (!sound) return { type: 'none' };
  const value = typeof sound === 'object' ? (sound.id || sound.name || '') : String(sound);
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none') return { type: 'none' };

  if (BUILTIN_SOUNDS[trimmed]) {
    return { type: 'rtttl', value: BUILTIN_SOUNDS[trimmed] };
  }

  // Inline RTTTL (contains ':' and '=')
  if (trimmed.includes(':') && trimmed.includes('=')) {
    return { type: 'rtttl', value: trimmed };
  }

  // Melody filename on the device (MELODIES/) or DFPlayer track number
  return { type: 'sound', value: trimmed };
}

function colorToAwtrix(color) {
  if (!color) return undefined;
  if (Array.isArray(color)) return color;
  let hex = String(color).trim();
  if (!hex) return undefined;
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 6) return `#${hex.toUpperCase()}`;
  return undefined;
}

function buildNotifyPayload(args = {}) {
  const payload = {};

  if (args.text != null && args.text !== '') payload.text = args.text;
  if (args.duration != null && args.duration !== '') {
    const duration = Number(args.duration);
    if (!Number.isNaN(duration) && duration > 0) payload.duration = duration;
  }
  if (args.repeat != null && args.repeat !== '') {
    const repeat = Number(args.repeat);
    if (!Number.isNaN(repeat)) payload.repeat = repeat;
  }

  const icon = resolveIcon(args.icon);
  if (icon) payload.icon = icon;

  const color = colorToAwtrix(args.color);
  if (color) payload.color = color;

  if (args.rainbow === true || args.rainbow === 'true') payload.rainbow = true;
  if (args.hold === true || args.hold === 'true') payload.hold = true;
  if (args.wakeup === true || args.wakeup === 'true') payload.wakeup = true;
  if (args.stack === false || args.stack === 'false') payload.stack = false;
  if (args.loopSound === true || args.loopSound === 'true') payload.loopSound = true;
  if (args.noScroll === true || args.noScroll === 'true') payload.noScroll = true;
  if (args.pushIcon != null && args.pushIcon !== '') {
    payload.pushIcon = Number(args.pushIcon);
  }
  if (args.scrollSpeed != null && args.scrollSpeed !== '') {
    payload.scrollSpeed = Number(args.scrollSpeed);
  }
  if (args.effect) payload.effect = String(args.effect);
  if (args.background) payload.background = colorToAwtrix(args.background) || args.background;

  const sound = resolveSound(args.sound);
  if (sound.type === 'rtttl') payload.rtttl = sound.value;
  if (sound.type === 'sound') payload.sound = sound.value;

  // Extra raw JSON merge (advanced)
  if (args.extraJson) {
    try {
      const extra = typeof args.extraJson === 'string' ? JSON.parse(args.extraJson) : args.extraJson;
      Object.assign(payload, extra);
    } catch (err) {
      throw new Error(`Invalid extra JSON: ${err.message}`);
    }
  }

  return payload;
}

function buildCustomAppPayload(args = {}) {
  const payload = buildNotifyPayload(args);
  // Custom apps do not support sound/hold/stack the same way; strip notify-only keys
  delete payload.hold;
  delete payload.stack;
  delete payload.sound;
  delete payload.rtttl;
  delete payload.loopSound;
  delete payload.wakeup;
  if (args.lifetime != null && args.lifetime !== '') {
    payload.lifetime = Number(args.lifetime);
  }
  return payload;
}

function iconAutocompleteResults(query = '') {
  const q = String(query || '').toLowerCase();
  return BUNDLED_ICON_NAMES
    .filter((name) => !q || name.includes(q))
    .map((name) => ({
      id: name,
      name,
    }));
}

function soundAutocompleteResults(query = '') {
  const q = String(query || '').toLowerCase();
  const builtin = Object.keys(BUILTIN_SOUNDS).map((id) => ({
    id,
    name: `${id} (built-in)`,
  }));
  const none = [{ id: 'none', name: 'None' }];
  return [...none, ...builtin].filter((item) => !q || item.id.includes(q) || item.name.toLowerCase().includes(q));
}

module.exports = {
  BUNDLED_ICON_NAMES,
  BUILTIN_SOUNDS,
  getBundledIconBase64,
  resolveIcon,
  resolveSound,
  colorToAwtrix,
  buildNotifyPayload,
  buildCustomAppPayload,
  iconAutocompleteResults,
  soundAutocompleteResults,
};
