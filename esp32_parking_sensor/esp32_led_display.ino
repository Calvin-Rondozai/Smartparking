#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration
const char* serverUrl = "http://10.0.2.2:8000/api/iot/";  // Change to your Django server IP
const char* deviceId = "ESP32_DISPLAY_001";  // Unique device ID

// LCD Configuration
LiquidCrystal_I2C lcd(0x27, 16, 2);  // I2C address 0x27, 16 columns, 2 rows

// Display Configuration
const int DISPLAY_UPDATE_INTERVAL = 10000;  // Update display every 10 seconds
const int HEARTBEAT_INTERVAL = 30000;  // Send heartbeat every 30 seconds

// Variables
unsigned long lastDisplayUpdate = 0;
unsigned long lastHeartbeat = 0;
int totalSpots = 0;
int availableSpots = 0;
int occupiedSpots = 0;

void setup() {
  Serial.begin(115200);
  
  // Initialize LCD
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Parking");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  
  // Connect to WiFi
  connectToWiFi();
  
  // Register device with server
  registerDevice();
  
  Serial.println("ESP32 LED Display initialized!");
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }
  
  unsigned long currentTime = millis();
  
  // Update display periodically
  if (currentTime - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
    updateDisplay();
    lastDisplayUpdate = currentTime;
  }
  
  // Send heartbeat periodically
  if (currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = currentTime;
  }
  
  delay(1000);
}

void connectToWiFi() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  lcd.setCursor(0, 1);
  lcd.print("...");
  
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
    delay(2000);
  } else {
    Serial.println("\nWiFi connection failed!");
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed");
    lcd.setCursor(0, 1);
    lcd.print("Check Settings");
  }
}

void registerDevice() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/register/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = "display";
  doc["name"] = "LED Display " + String(deviceId);
  doc["location"] = "Parking Lot Entrance";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["mac_address"] = WiFi.macAddress();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Registering display device...");
  Serial.println(jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Display registration response: " + response);
  } else {
    Serial.println("Display registration failed: " + http.errorToString(httpResponseCode));
  }
  
  http.end();
}

void updateDisplay() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "parking/availability/";
  http.begin(url);
  
  Serial.println("Fetching parking availability...");
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Availability response: " + response);
    
    // Parse JSON response
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      totalSpots = doc["total_spots"];
      availableSpots = doc["available_spots"];
      occupiedSpots = doc["occupied_spots"];
      
      // Update LCD display
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Available: ");
      lcd.print(availableSpots);
      lcd.print("/");
      lcd.print(totalSpots);
      
      lcd.setCursor(0, 1);
      lcd.print("Occupied: ");
      lcd.print(occupiedSpots);
      
      Serial.print("Total: ");
      Serial.print(totalSpots);
      Serial.print(", Available: ");
      Serial.print(availableSpots);
      Serial.print(", Occupied: ");
      Serial.println(occupiedSpots);
    } else {
      Serial.println("JSON parsing failed");
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Data Error");
      lcd.setCursor(0, 1);
      lcd.print("Check Server");
    }
  } else {
    Serial.println("Availability request failed: " + http.errorToString(httpResponseCode));
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Network Error");
    lcd.setCursor(0, 1);
    lcd.print("Check Connection");
  }
  
  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "devices/heartbeat/";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<128> doc;
  doc["device_id"] = deviceId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending display heartbeat...");
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Heartbeat response: " + response);
  } else {
    Serial.println("Heartbeat failed: " + http.errorToString(httpResponseCode));
  }
  
  http.end();
} 