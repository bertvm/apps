'use strict';

const Homey = require('homey');
const {
  buildNotifyPayload,
  buildCustomAppPayload,
  resolveSound,
  colorToAwtrix,
} = require('../../lib/Awtrix');
const MqttBrokerPool = require('../../lib/MqttBrokerPool');

class UlanziTc002Device extends Homey.Device {
  async onInit() {
    this.log(`Device init: ${this.getName()}`);
    this._mqttSettings = this._readMqttSettings();
    this._prefix = String(this._mqttSettings.mqtt_prefix || '').replace(/\/+$/, '');
    this._brokerKey = MqttBrokerPool.brokerKey(this._mqttSettings);
    this._messageHandler = this._onBrokerMessage.bind(this);

    this.registerCapabilityListener('onoff', this._onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dim', this._onCapabilityDim.bind(this));

    try {
      await this._connectMqtt();
      await this.setAvailable();
    } catch (err) {
      this.error('MQTT connect failed', err);
      await this.setUnavailable(err.message || 'MQTT unavailable');
    }
  }

  async onUninit() {
    this._detachBrokerListener();
    if (this._mqttSettings) {
      this.homey.app.mqttPool.release(this._mqttSettings);
    }
  }

  async onDeleted() {
    await this.onUninit();
  }

  async onSettings({ newSettings, changedKeys }) {
    const mqttKeys = [
      'mqtt_host', 'mqtt_port', 'mqtt_username', 'mqtt_password',
      'mqtt_tls', 'mqtt_prefix',
    ];
    const mqttChanged = changedKeys.some((k) => mqttKeys.includes(k));
    if (!mqttChanged) return;

    this._detachBrokerListener();
    if (this._mqttSettings) {
      this.homey.app.mqttPool.release(this._mqttSettings);
    }

    this._mqttSettings = {
      mqtt_host: newSettings.mqtt_host,
      mqtt_port: newSettings.mqtt_port,
      mqtt_username: newSettings.mqtt_username,
      mqtt_password: newSettings.mqtt_password,
      mqtt_tls: newSettings.mqtt_tls,
      mqtt_prefix: newSettings.mqtt_prefix,
    };
    this._prefix = String(this._mqttSettings.mqtt_prefix || '').replace(/\/+$/, '');
    this._brokerKey = MqttBrokerPool.brokerKey(this._mqttSettings);

    try {
      await this._connectMqtt();
      await this.setAvailable();
    } catch (err) {
      this.error('MQTT reconnect failed', err);
      await this.setUnavailable(err.message || 'MQTT unavailable');
      throw new Error(err.message || 'Failed to connect to MQTT broker');
    }
  }

  _readMqttSettings() {
    const settings = this.getSettings();
    return {
      mqtt_host: settings.mqtt_host,
      mqtt_port: settings.mqtt_port,
      mqtt_username: settings.mqtt_username,
      mqtt_password: settings.mqtt_password,
      mqtt_tls: settings.mqtt_tls,
      mqtt_prefix: settings.mqtt_prefix,
    };
  }

  async _connectMqtt() {
    if (!this._prefix) {
      throw new Error('MQTT prefix is required (e.g. awtrix_XXXXXX)');
    }
    this._client = await this.homey.app.mqttPool.acquire(this._mqttSettings);
    this.homey.app.mqttPool.on('message', this._messageHandler);

    const topics = [
      `${this._prefix}/stats`,
      `${this._prefix}/battery`,
      `${this._prefix}/button`,
      `${this._prefix}/app`,
    ];
    await new Promise((resolve, reject) => {
      this._client.subscribe(topics, (err) => (err ? reject(err) : resolve()));
    });
    this.log(`Subscribed to ${topics.join(', ')}`);
  }

  _detachBrokerListener() {
    if (this._messageHandler) {
      this.homey.app.mqttPool.removeListener('message', this._messageHandler);
    }
  }

  _onBrokerMessage(brokerKey, topic, payload) {
    if (brokerKey !== this._brokerKey) return;
    if (!topic.startsWith(`${this._prefix}/`)) return;

    const text = payload.toString();
    const suffix = topic.slice(this._prefix.length + 1);

    if (suffix === 'stats') {
      this._handleStats(text).catch((err) => this.error('stats handler', err));
      return;
    }
    if (suffix === 'button') {
      this._handleButton(text).catch((err) => this.error('button handler', err));
      return;
    }
    if (suffix === 'battery') {
      const bat = Number(text);
      if (!Number.isNaN(bat) && this.hasCapability('measure_battery')) {
        this.setCapabilityValue('measure_battery', bat).catch(this.error);
      }
    }
  }

  async _handleStats(text) {
    let stats;
    try {
      stats = JSON.parse(text);
    } catch (err) {
      return;
    }

    const map = [
      ['bat', 'measure_battery'],
      ['temp', 'measure_temperature'],
      ['hum', 'measure_humidity'],
      ['lux', 'measure_luminance'],
    ];
    for (const [key, cap] of map) {
      if (stats[key] != null && this.hasCapability(cap)) {
        const value = Number(stats[key]);
        if (!Number.isNaN(value)) {
          await this.setCapabilityValue(cap, value);
        }
      }
    }

    if (typeof stats.matrix === 'boolean' && this.hasCapability('onoff')) {
      await this.setCapabilityValue('onoff', stats.matrix);
    }
    if (stats.bri != null && this.hasCapability('dim')) {
      const bri = Number(stats.bri);
      if (!Number.isNaN(bri)) {
        await this.setCapabilityValue('dim', Math.max(0, Math.min(1, bri / 255)));
      }
    }

    const trigger = this.homey.flow.getDeviceTriggerCard('stats_updated');
    if (trigger) {
      await trigger.trigger(this, {
        battery: Number(stats.bat) || 0,
        temperature: Number(stats.temp) || 0,
        humidity: Number(stats.hum) || 0,
        luminance: Number(stats.lux) || 0,
      });
    }
  }

  async _handleButton(text) {
    // Awtrix publishes "0" (left), "1" (middle), "2" (right) — sometimes JSON
    let button = text.trim();
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.button != null) button = String(parsed.button);
    } catch (err) {
      // plain string
    }

    const names = { 0: 'left', 1: 'middle', 2: 'right', left: 'left', middle: 'middle', select: 'middle', right: 'right' };
    const name = names[button] || button;
    const cardId = `button_${name}`;
    const trigger = this.homey.flow.getDeviceTriggerCard(cardId);
    if (trigger) {
      await trigger.trigger(this, { button: name });
    }
    const anyTrigger = this.homey.flow.getDeviceTriggerCard('button_pressed');
    if (anyTrigger) {
      await anyTrigger.trigger(this, { button: name });
    }
  }

  topic(suffix) {
    return `${this._prefix}/${suffix}`;
  }

  async publish(suffix, payload, { retain = false, qos = 0, raw = false } = {}) {
    const client = this.homey.app.mqttPool.getClient(this._mqttSettings) || this._client;
    if (!client || !client.connected) {
      throw new Error('MQTT client is not connected');
    }

    let message = payload;
    if (!raw) {
      if (payload == null) message = '';
      else if (typeof payload === 'object') message = JSON.stringify(payload);
      else message = String(payload);
    }

    const topic = this.topic(suffix);
    this.log(`MQTT publish ${topic}: ${message}`);
    await new Promise((resolve, reject) => {
      client.publish(topic, message, { qos, retain }, (err) => (err ? reject(err) : resolve()));
    });
  }

  async sendNotification(args = {}) {
    const payload = buildNotifyPayload(args);
    if (!payload.text && !payload.icon && !payload.draw) {
      throw new Error('Notification needs at least text or icon');
    }
    await this.publish('notify', payload);
    return payload;
  }

  async sendNotificationJson(json) {
    let payload = json;
    if (typeof json === 'string') {
      payload = JSON.parse(json);
    }
    await this.publish('notify', payload);
    return payload;
  }

  async dismissNotification() {
    await this.publish('notify/dismiss', '', { raw: true });
  }

  async setCustomApp(name, args = {}) {
    const appName = String(name || '').trim().replace(/\s+/g, '_');
    if (!appName || !/^[A-Za-z0-9_-]{1,26}$/.test(appName)) {
      throw new Error('App name must be 1–26 chars: A-Z a-z 0-9 _ -');
    }
    const payload = buildCustomAppPayload(args);
    await this.publish(`custom/${appName}`, payload);
    return payload;
  }

  async removeCustomApp(name) {
    const appName = String(name || '').trim().replace(/\s+/g, '_');
    if (!appName) throw new Error('App name is required');
    await this.publish(`custom/${appName}`, '', { raw: true });
  }

  async playSound(soundArg) {
    const resolved = resolveSound(soundArg);
    if (resolved.type === 'none') return;
    if (resolved.type === 'rtttl') {
      await this.publish('rtttl', resolved.value, { raw: true });
      return;
    }
    await this.publish('sound', { sound: resolved.value });
  }

  async playRtttl(rtttl) {
    const value = String(rtttl || '').trim();
    if (!value) throw new Error('RTTTL string is required');
    await this.publish('rtttl', value, { raw: true });
  }

  async setIndicator(index, { color, blink, fade } = {}) {
    const idx = Number(index);
    if (![1, 2, 3].includes(idx)) throw new Error('Indicator must be 1, 2 or 3');
    const payload = {};
    const c = colorToAwtrix(color);
    if (c) payload.color = c;
    else if (color === '0' || color === 0) payload.color = '0';
    if (blink) payload.blink = Number(blink);
    if (fade) payload.fade = Number(fade);
    await this.publish(`indicator${idx}`, payload);
  }

  async dismissIndicator(index) {
    const idx = Number(index);
    if (![1, 2, 3].includes(idx)) throw new Error('Indicator must be 1, 2 or 3');
    await this.publish(`indicator${idx}`, '', { raw: true });
  }

  async setMoodlight({ brightness, color, kelvin } = {}) {
    if (!brightness && !color && !kelvin) {
      await this.publish('moodlight', '', { raw: true });
      return;
    }
    const payload = {};
    if (brightness != null) payload.brightness = Number(brightness);
    if (kelvin != null && kelvin !== '') payload.kelvin = Number(kelvin);
    if (color) payload.color = colorToAwtrix(color) || color;
    await this.publish('moodlight', payload);
  }

  async setPower(on) {
    await this.publish('power', { power: !!on });
    if (this.hasCapability('onoff')) {
      await this.setCapabilityValue('onoff', !!on);
    }
  }

  async setBrightness(dim01) {
    const bri = Math.round(Math.max(0, Math.min(1, Number(dim01))) * 255);
    await this.publish('settings', { BRI: bri });
    if (this.hasCapability('dim')) {
      await this.setCapabilityValue('dim', bri / 255);
    }
  }

  async nextApp() {
    await this.publish('nextapp', '', { raw: true });
  }

  async previousApp() {
    await this.publish('previousapp', '', { raw: true });
  }

  async switchApp(name) {
    await this.publish('switch', { name: String(name) });
  }

  async reboot() {
    await this.publish('reboot', '', { raw: true });
  }

  async sleep(seconds) {
    await this.publish('sleep', { sleep: Number(seconds) || 60 });
  }

  async _onCapabilityOnoff(value) {
    await this.setPower(value);
  }

  async _onCapabilityDim(value) {
    await this.setBrightness(value);
  }
}

module.exports = UlanziTc002Device;
