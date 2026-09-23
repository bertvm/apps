'use strict';

const Homey = require('homey');
const MqttBrokerPool = require('./lib/MqttBrokerPool');

class UlanziTc002App extends Homey.App {
  async onInit() {
    this.log('Ulanzi TC002 MQTT app initializing…');
    this.mqttPool = new MqttBrokerPool({
      log: (...args) => this.log(...args),
      error: (...args) => this.error(...args),
    });
    this.log('Ulanzi TC002 MQTT app ready');
  }

  async onUninit() {
    this.log('Ulanzi TC002 MQTT app shutting down');
  }
}

module.exports = UlanziTc002App;
