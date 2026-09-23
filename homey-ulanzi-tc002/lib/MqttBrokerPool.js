'use strict';

const mqtt = require('mqtt');
const { EventEmitter } = require('events');

/**
 * Thin MQTT wrapper shared by Ulanzi TC002 devices.
 * One broker connection can be shared across devices with the same broker key.
 */
class MqttBrokerPool extends EventEmitter {
  constructor({ log = console.log, error = console.error } = {}) {
    super();
    this._log = log;
    this._error = error;
    this._brokers = new Map(); // key -> { client, refCount, ready }
  }

  static brokerKey(settings) {
    const host = String(settings.mqtt_host || '').trim();
    const port = Number(settings.mqtt_port || 1883);
    const user = String(settings.mqtt_username || '');
    const tls = settings.mqtt_tls === true || settings.mqtt_tls === 'true';
    return `${tls ? 'mqtts' : 'mqtt'}://${user}@${host}:${port}`;
  }

  async acquire(settings) {
    const key = MqttBrokerPool.brokerKey(settings);
    let entry = this._brokers.get(key);
    if (entry) {
      entry.refCount += 1;
      if (entry.ready) return entry.client;
      await entry.readyPromise;
      return entry.client;
    }

    const host = String(settings.mqtt_host || '').trim();
    const port = Number(settings.mqtt_port || 1883);
    if (!host) {
      throw new Error('MQTT host is required');
    }

    const protocol = (settings.mqtt_tls === true || settings.mqtt_tls === 'true') ? 'mqtts' : 'mqtt';
    const url = `${protocol}://${host}:${port}`;
    const options = {
      clientId: `homey-ulanzi-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 15000,
    };

    const username = String(settings.mqtt_username || '').trim();
    const password = String(settings.mqtt_password || '');
    if (username) {
      options.username = username;
      options.password = password;
    }

    this._log(`Connecting MQTT broker ${url}`);
    const client = mqtt.connect(url, options);

    entry = {
      client,
      refCount: 1,
      ready: false,
      readyPromise: null,
    };

    entry.readyPromise = new Promise((resolve, reject) => {
      const onConnect = () => {
        entry.ready = true;
        this._log(`MQTT connected: ${key}`);
        cleanup();
        resolve();
      };
      const onError = (err) => {
        this._error('MQTT connect error', err);
        // Keep trying via reconnect; only reject the first wait if not yet ready after timeout
      };
      const cleanup = () => {
        client.off('connect', onConnect);
        client.off('error', onError);
      };
      client.once('connect', onConnect);
      client.on('error', onError);

      setTimeout(() => {
        if (!entry.ready) {
          reject(new Error(`MQTT connection timeout to ${host}:${port}`));
        }
      }, 20000);
    });

    client.on('close', () => {
      entry.ready = false;
      this._log(`MQTT disconnected: ${key}`);
    });

    client.on('message', (topic, payload) => {
      this.emit('message', key, topic, payload);
    });

    this._brokers.set(key, entry);
    await entry.readyPromise;
    return client;
  }

  release(settings) {
    const key = MqttBrokerPool.brokerKey(settings);
    const entry = this._brokers.get(key);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      try {
        entry.client.end(true);
      } catch (err) {
        this._error('MQTT end error', err);
      }
      this._brokers.delete(key);
      this._log(`MQTT released: ${key}`);
    }
  }

  getClient(settings) {
    const entry = this._brokers.get(MqttBrokerPool.brokerKey(settings));
    return entry && entry.ready ? entry.client : null;
  }
}

module.exports = MqttBrokerPool;
