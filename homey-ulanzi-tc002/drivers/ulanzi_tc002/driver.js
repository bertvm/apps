'use strict';

const Homey = require('homey');
const crypto = require('crypto');
const {
  iconAutocompleteResults,
  soundAutocompleteResults,
} = require('../../lib/Awtrix');

class UlanziTc002Driver extends Homey.Driver {
  async onInit() {
    this.log('Ulanzi TC002 driver init');
    this._registerFlowCards();
  }

  _registerFlowCards() {
    const actions = {
      send_notification: async (args) => {
        await args.device.sendNotification({
          text: args.text,
          icon: args.icon,
          sound: args.sound,
          color: args.color,
          duration: args.duration,
          rainbow: args.rainbow === 'true' || args.rainbow === true,
          hold: args.hold === 'true' || args.hold === true,
          wakeup: args.wakeup === 'true' || args.wakeup === true,
        });
      },
      send_notification_json: async (args) => {
        await args.device.sendNotificationJson(args.json);
      },
      dismiss_notification: async (args) => {
        await args.device.dismissNotification();
      },
      set_custom_app: async (args) => {
        await args.device.setCustomApp(args.name, {
          text: args.text,
          icon: args.icon,
          color: args.color,
          duration: args.duration,
          rainbow: args.rainbow === 'true' || args.rainbow === true,
          lifetime: args.lifetime,
        });
      },
      remove_custom_app: async (args) => {
        await args.device.removeCustomApp(args.name);
      },
      play_sound: async (args) => {
        await args.device.playSound(args.sound);
      },
      play_rtttl: async (args) => {
        await args.device.playRtttl(args.rtttl);
      },
      set_indicator: async (args) => {
        await args.device.setIndicator(args.indicator, {
          color: args.color,
          blink: args.blink,
          fade: args.fade,
        });
      },
      dismiss_indicator: async (args) => {
        await args.device.dismissIndicator(args.indicator);
      },
      set_moodlight: async (args) => {
        await args.device.setMoodlight({
          brightness: args.brightness,
          color: args.color,
          kelvin: args.kelvin,
        });
      },
      clear_moodlight: async (args) => {
        await args.device.setMoodlight({});
      },
      set_power: async (args) => {
        await args.device.setPower(args.state === 'on' || args.state === true);
      },
      next_app: async (args) => args.device.nextApp(),
      previous_app: async (args) => args.device.previousApp(),
      switch_app: async (args) => args.device.switchApp(args.name),
      reboot: async (args) => args.device.reboot(),
      sleep: async (args) => args.device.sleep(args.seconds),
    };

    for (const [id, listener] of Object.entries(actions)) {
      const card = this.homey.flow.getActionCard(id);
      card.registerRunListener(listener);

      if (id === 'send_notification' || id === 'set_custom_app') {
        card.registerArgumentAutocompleteListener('icon', async (query) => iconAutocompleteResults(query));
      }
      if (id === 'send_notification' || id === 'play_sound') {
        card.registerArgumentAutocompleteListener('sound', async (query) => soundAutocompleteResults(query));
      }
    }
  }

  async onPair(session) {
    let pending = {
      name: 'Ulanzi TC002',
      mqtt_host: '',
      mqtt_port: 1883,
      mqtt_username: '',
      mqtt_password: '',
      mqtt_tls: false,
      mqtt_prefix: '',
    };

    session.setHandler('showView', async (viewId) => {
      this.log('Pair view:', viewId);
    });

    session.setHandler('mqtt_save', async (data) => {
      pending = {
        ...pending,
        ...data,
        mqtt_port: Number(data.mqtt_port) || 1883,
        mqtt_tls: !!data.mqtt_tls,
      };

      if (!pending.mqtt_host) throw new Error('MQTT host is required');
      if (!pending.mqtt_prefix) throw new Error('MQTT prefix is required (from Awtrix MQTT settings)');
      return true;
    });

    session.setHandler('list_devices', async () => {
      const id = crypto.randomUUID();
      return [
        {
          name: pending.name || `Ulanzi ${pending.mqtt_prefix}`,
          data: { id },
          settings: {
            mqtt_host: pending.mqtt_host,
            mqtt_port: pending.mqtt_port,
            mqtt_username: pending.mqtt_username || '',
            mqtt_password: pending.mqtt_password || '',
            mqtt_tls: !!pending.mqtt_tls,
            mqtt_prefix: String(pending.mqtt_prefix).replace(/\/+$/, ''),
          },
        },
      ];
    });
  }
}

module.exports = UlanziTc002Driver;
