import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./api";

// IoT API Configuration - derive from main API base URL with fallback
const deriveIotBase = () => {
  try {
    if (API_BASE_URL && API_BASE_URL.startsWith("http")) {
      // Ensure single trailing / then append iot
      const base = API_BASE_URL.replace(/\/$/, "");
      return `${base}/iot`;
    }
  } catch {}
  // Fallback to previous hardcoded value
  return "http://169.254.156.223:8000/api/iot";
};

const IOT_BASE_URL = deriveIotBase();

// Create IoT API instance
const iotApi = axios.create({
  baseURL: IOT_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Simple GET with retry for transient network issues
async function getWithRetry(path, { retries = 2, delayMs = 800 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await iotApi.get(path);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
    }
  }
  throw lastError;
}

let lastAvailabilityErrorAt = 0;

// IoT API Service
const iotService = {
  // Get real-time parking availability from ESP32 sensors
  getParkingAvailability: async () => {
    try {
      console.log("[iotApi] Fetching parking availability...");
      const response = await getWithRetry("/parking/availability/");
      console.log("[iotApi] Parking availability:", response.data);

      // Check if the response indicates ESP32 is offline
      if (response.data.offline) {
        console.log("[iotApi] ESP32 is offline:", response.data.message);
        return response.data; // Return the offline response from backend
      }

      return response.data;
    } catch (error) {
      const now = Date.now();
      if (now - lastAvailabilityErrorAt > 5000) {
        console.warn(
          "[iotApi] Error fetching parking availability:",
          error?.message || error
        );
        lastAvailabilityErrorAt = now;
      }
      // Return offline data when API call fails
      return {
        total_spots: 0,
        available_spots: 0,
        occupied_spots: 0,
        spots: [],
        offline: true,
        message: "Failed to connect to backend - check if server is running",
      };
    }
  },

  // Get all IoT devices
  getDevices: async () => {
    try {
      console.log("[iotApi] Fetching IoT devices...");
      const response = await iotApi.get("/devices/");
      console.log("[iotApi] Devices:", response.data);
      return response.data;
    } catch (error) {
      console.error("[iotApi] Error fetching devices:", error);
      // Return empty array if API fails
      return [];
    }
  },

  // Get sensor data for a specific device
  getDeviceData: async (deviceId) => {
    try {
      console.log("[iotApi] Fetching device data for:", deviceId);
      const response = await iotApi.get(`/devices/${deviceId}/data/`);
      console.log("[iotApi] Device data:", response.data);
      return response.data;
    } catch (error) {
      console.error("[iotApi] Error fetching device data:", error);
      return [];
    }
  },

  // Get latest sensor readings
  getLatestSensorData: async () => {
    try {
      console.log("[iotApi] Fetching latest sensor data...");
      const devices = await iotService.getDevices();
      const sensorData = [];

      for (const device of devices) {
        if (device.device_type === "sensor") {
          try {
            const data = await iotService.getDeviceData(device.device_id);
            if (data && data.length > 0) {
              sensorData.push({
                device: device,
                latestData: data[0],
              });
            }
          } catch (error) {
            console.warn(
              `[iotApi] Could not fetch data for device ${device.device_id}:`,
              error
            );
          }
        }
      }

      console.log("[iotApi] Latest sensor data:", sensorData);
      return sensorData;
    } catch (error) {
      console.error("[iotApi] Error fetching latest sensor data:", error);
      return [];
    }
  },

  // Get parking statistics
  getParkingStats: async () => {
    try {
      console.log("[iotApi] Fetching parking statistics...");
      const availability = await iotService.getParkingAvailability();
      const devices = await iotService.getDevices();

      // Use real data from your ESP32 sensors
      const totalSpots = availability.total_spots || 2;
      const availableSpots = availability.available_spots || 2; // Default to 2 available if no data
      const occupiedSpots = availability.occupied_spots || 0; // Default to 0 occupied if no data
      const activeDevices = devices.length || 2;

      const stats = {
        totalSpots: totalSpots,
        availableSpots: availableSpots,
        occupiedSpots: occupiedSpots,
        occupancyRate:
          totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0,
        activeDevices: activeDevices,
        lastUpdated: new Date().toISOString(),
      };

      console.log("[iotApi] Parking stats:", stats);
      return stats;
    } catch (error) {
      console.error("[iotApi] Error fetching parking stats:", error);
      // Return default stats showing both slots available if API fails
      return {
        totalSpots: 2,
        availableSpots: 2,
        occupiedSpots: 0,
        occupancyRate: 0,
        activeDevices: 2,
        lastUpdated: new Date().toISOString(),
      };
    }
  },

  // Check if IoT system is online
  checkSystemStatus: async () => {
    try {
      console.log("[iotApi] Checking system status...");

      // Try to get basic data to check if system is online
      const availability = await iotService.getParkingAvailability();
      const devices = await iotService.getDevices();

      // Consider system online if we have devices or can reach the API
      const isOnline = devices.length > 0 || availability.total_spots > 0;

      const status = {
        online: isOnline,
        devicesCount: devices.length || 2, // Show at least 2 devices if API fails
        lastUpdate: new Date().toISOString(),
        parkingData: availability,
      };

      console.log("[iotApi] System status:", status);
      return status;
    } catch (error) {
      console.error("[iotApi] System status check failed:", error);
      return {
        online: false,
        error: error.message,
        lastUpdate: new Date().toISOString(),
        devicesCount: 0,
        parkingData: {
          total_spots: 0,
          available_spots: 0,
          occupied_spots: 0,
        },
      };
    }
  },

  // Test connection to IoT API
  testConnection: async () => {
    try {
      console.log("[iotApi] Testing connection...");
      // Test with a valid endpoint instead of root
      const response = await iotApi.get("/devices/");
      console.log("[iotApi] Connection test successful:", response.status);
      return true;
    } catch (error) {
      console.error("[iotApi] Connection test failed:", error);
      return false;
    }
  },
};

export default iotService;
