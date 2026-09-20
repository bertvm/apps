#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "config.h"
#include "secrets.h"

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String lastMessage;
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;

bool passesFilter(const JsonDocument &doc) {
  const char *region = doc["regioid"] | doc["region_id"] | "";
  const char *service = doc["service"] | "";
  if (strlen(FILTER_REGION) > 0 && strcmp(region, FILTER_REGION) != 0) {
    return false;
  }
  if (strlen(FILTER_SERVICE) > 0 && strcmp(service, FILTER_SERVICE) != 0) {
    return false;
  }
  return true;
}

void showAlert(const char *priority, const char *dienst, const char *regio, const char *text) {
  lastMessage = String(priority) + " " + String(dienst) + " @ " + String(regio) + " | " + String(text);
  Serial.println(lastMessage);

#ifdef BOARD_HAS_TFT
  // Hook your TFT draw routine here (CYD / T-Display).
#endif
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("JSON error: %s\n", err.c_str());
    return;
  }
  if (!passesFilter(doc)) {
    return;
  }

  const char *priority = doc["priority"] | "";
  const char *dienst = doc["dienst"] | doc["service"] | "";
  const char *regio = doc["regio"] | doc["region"] | "";
  const char *text = doc["tekstmelding"] | doc["message"] | "";
  if (strlen(text) > MAX_ALERT_CHARS) {
    // Truncate for small panels
  }
  showAlert(priority, dienst, regio, text);
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  if (millis() - lastWifiAttempt < WIFI_RETRY_MS) {
    return;
  }
  lastWifiAttempt = millis();
  Serial.printf("WiFi connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  if (mqtt.connected()) {
    return;
  }
  if (millis() - lastMqttAttempt < MQTT_RETRY_MS) {
    return;
  }
  lastMqttAttempt = millis();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  Serial.printf("MQTT connecting to %s:%d...\n", MQTT_HOST, MQTT_PORT);
  bool ok;
  if (strlen(MQTT_USER) > 0) {
    ok = mqtt.connect("p2000-esp32", MQTT_USER, MQTT_PASSWORD);
  } else {
    ok = mqtt.connect("p2000-esp32");
  }
  if (ok) {
    mqtt.subscribe(MQTT_TOPIC);
    Serial.printf("Subscribed to %s\n", MQTT_TOPIC);
  } else {
    Serial.printf("MQTT failed rc=%d\n", mqtt.state());
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("P2000 ESP32 client");
  ensureWifi();
}

void loop() {
  ensureWifi();
  ensureMqtt();
  if (mqtt.connected()) {
    mqtt.loop();
  }
  delay(10);
}
