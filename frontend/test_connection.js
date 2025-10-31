/**
 * Simple connection test
 * Run this in the app to test the connection
 */

import simpleIPConfig from "./services/simpleIPConfig";

export const testConnection = async () => {
  console.log("=== Connection Test ===");

  // Get current configuration
  const currentIP = simpleIPConfig.getCurrentIP();
  const apiURL = simpleIPConfig.getAPIBaseURL();
  const iotURL = simpleIPConfig.getIoTBaseURL();

  console.log("Current IP:", currentIP);
  console.log("API URL:", apiURL);
  console.log("IoT URL:", iotURL);

  // Test connection
  console.log("Testing connection...");
  try {
    const isReachable = await simpleIPConfig.testConnection(currentIP);
    console.log("Connection result:", isReachable ? "✅ SUCCESS" : "❌ FAILED");

    if (!isReachable) {
      console.log("Testing all IPs...");
      const results = await simpleIPConfig.testAllIPs();
      results.forEach((result) => {
        console.log(`${result.ip}: ${result.reachable ? "✅" : "❌"}`);
      });
    }
  } catch (error) {
    console.error("Test failed:", error);
  }

  console.log("=== Test Complete ===");
};

export default testConnection;
