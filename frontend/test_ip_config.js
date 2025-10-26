/**
 * Test script for IP configuration
 * Run this to test the IP configuration system
 */

import simpleIPConfig from "./services/simpleIPConfig";

const testIPConfig = async () => {
  console.log("=== Testing IP Configuration ===");

  // Test 1: Get current IP
  console.log("1. Current IP:", simpleIPConfig.getCurrentIP());

  // Test 2: Get API URLs
  console.log("2. API Base URL:", simpleIPConfig.getAPIBaseURL());
  console.log("3. IoT Base URL:", simpleIPConfig.getIoTBaseURL());

  // Test 3: Test connection to current IP
  const currentIP = simpleIPConfig.getCurrentIP();
  console.log("4. Testing connection to current IP:", currentIP);
  const isReachable = await simpleIPConfig.testConnection(currentIP);
  console.log("   Result:", isReachable ? "✅ Reachable" : "❌ Not reachable");

  // Test 4: Test all available IPs
  console.log("5. Testing all available IPs...");
  const results = await simpleIPConfig.testAllIPs();
  results.forEach((result) => {
    console.log(
      `   ${result.ip}: ${result.reachable ? "✅" : "❌"} (${result.url})`
    );
  });

  // Test 5: Set custom IP
  console.log("6. Setting custom IP to 10.187.189.47...");
  const setResult = await simpleIPConfig.setCustomIP("10.187.189.47");
  console.log("   Result:", setResult ? "✅ Success" : "❌ Failed");

  console.log("=== Test Complete ===");
};

export default testIPConfig;
