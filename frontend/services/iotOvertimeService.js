import iotService from "./iotApi";
import { bookingAPI } from "./api";
import notificationService from "./notificationService";

class IoTOvertimeService {
  constructor() {
    this.overtimeCheckInterval = null;
    this.fallbackInterval = null;
    this.redLightStatus = {}; // Track red light status for each spot
    this.overtimeStartTimes = {}; // Track when overtime started for each spot
    this.gracePeriodStartTimes = {}; // Track when grace period started for each booking
    this.isRunning = false;
    this.cachedBookings = []; // Cache for active bookings
    this.lastBookingFetch = 0; // Timestamp of last successful fetch
    this.consecutiveFailures = 0; // Track consecutive network failures
    this.maxConsecutiveFailures = 5; // Circuit breaker threshold
    this.circuitBreakerOpen = false; // Circuit breaker state
    this.circuitBreakerTimeout = 60000; // 1 minute timeout
    this.lastFailureTime = 0; // When circuit breaker was opened
  }

  // Start monitoring IoT devices for overtime detection
  startMonitoring() {
    if (this.isRunning) return;

    console.log("[IoTOvertimeService] Starting IoT overtime monitoring...");
    this.isRunning = true;

    // Check every 10 seconds for better stability
    this.overtimeCheckInterval = setInterval(async () => {
      await this.checkIoTOvertime();
    }, 10000);

    // Also start fallback monitoring for non-IoT overtime detection
    this.startFallbackMonitoring();
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.overtimeCheckInterval) {
      clearInterval(this.overtimeCheckInterval);
      this.overtimeCheckInterval = null;
    }
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    this.isRunning = false;
    console.log("[IoTOvertimeService] Stopped IoT overtime monitoring");
  }

  // Fallback monitoring for when IoT is not available
  startFallbackMonitoring() {
    if (this.fallbackInterval) return;

    console.log(
      "[IoTOvertimeService] Starting fallback overtime monitoring..."
    );

    // Check every 30 seconds for better stability and reduced network load
    this.fallbackInterval = setInterval(async () => {
      await this.checkFallbackOvertime();
    }, 30000);
  }

  // Fallback overtime detection without IoT
  async checkFallbackOvertime() {
    try {
      const activeBookings = await this.getActiveBookings();

      if (activeBookings.length === 0) {
        console.log(
          "[IoTOvertimeService] No active bookings found for fallback check"
        );
        return;
      }

      for (const booking of activeBookings) {
        const now = new Date();
        const endTime = new Date(booking.end_time);

        if (endTime < now) {
          // Booking has expired
          const timeSinceExpiry = now - endTime;
          const secondsSinceExpiry = Math.floor(timeSinceExpiry / 1000);

          // Check if we're in the 5-second grace period
          if (secondsSinceExpiry <= 5) {
            // Still in grace period
            if (!this.gracePeriodStartTimes[booking.id]) {
              this.gracePeriodStartTimes[booking.id] = endTime;
              console.log(
                `[IoTOvertimeService] Fallback Grace period started for booking ${booking.id} (${secondsSinceExpiry}s since expiry)`
              );
            }
          } else {
            // Grace period has ended - assume car is still parked if no IoT detection
            console.log(
              `[IoTOvertimeService] Fallback Grace period ended for booking ${booking.id}, assuming car still parked (no IoT detection)`
            );

            if (
              this.gracePeriodStartTimes[booking.id] &&
              !this.overtimeStartTimes[booking.id]
            ) {
              // Grace period ended, start overtime monitoring
              this.overtimeStartTimes[booking.id] = new Date(
                endTime.getTime() + 5000
              ); // 5 seconds after expiry
              console.log(
                `[IoTOvertimeService] Fallback overtime started for booking ${booking.id} - assuming car still parked`
              );

              // Send immediate overtime notification
              const overtimeMinutes = Math.floor(
                (now - this.overtimeStartTimes[booking.id]) / (1000 * 60)
              );
              const overtimeCost = (overtimeMinutes * 2) / 30; // $1 per 30 seconds

              console.log(
                `[IoTOvertimeService] Sending fallback overtime alert notification for booking ${booking.id}`
              );
              try {
                const notificationId =
                  await notificationService.scheduleOvertimeAlert(
                    booking,
                    overtimeMinutes,
                    overtimeCost
                  );
                console.log(
                  `[IoTOvertimeService] Fallback overtime alert notification sent with ID: ${notificationId}`
                );
              } catch (notificationError) {
                console.warn(
                  `[IoTOvertimeService] Failed to send overtime notification: ${notificationError.message}`
                );
              }

              // Update backend with overtime billing
              try {
                await this.updateOvertimeBilling(
                  booking.id,
                  overtimeMinutes,
                  overtimeCost
                );
              } catch (billingError) {
                console.warn(
                  `[IoTOvertimeService] Failed to update overtime billing: ${billingError.message}`
                );
              }
            } else if (this.overtimeStartTimes[booking.id]) {
              // Continue monitoring overtime
              const overtimeMinutes = Math.floor(
                (now - this.overtimeStartTimes[booking.id]) / (1000 * 60)
              );
              const overtimeCost = (overtimeMinutes / 60) * 2.5;

              console.log(
                `[IoTOvertimeService] Fallback overtime update for booking ${
                  booking.id
                }: ${overtimeMinutes} min, $${overtimeCost.toFixed(2)}`
              );

              // Update backend with current overtime
              try {
                await this.updateOvertimeBilling(
                  booking.id,
                  overtimeMinutes,
                  overtimeCost
                );
              } catch (billingError) {
                console.warn(
                  `[IoTOvertimeService] Failed to update overtime billing: ${billingError.message}`
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(
        "[IoTOvertimeService] Error in fallback overtime check:",
        error
      );

      // Increment failure count for fallback as well
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.circuitBreakerOpen = true;
        this.lastFailureTime = Date.now();
        console.warn(
          `[IoTOvertimeService] Circuit breaker opened after ${this.consecutiveFailures} consecutive failures in fallback`
        );
      }
    }
  }

  // Check for overtime based on IoT sensor data
  async checkIoTOvertime() {
    try {
      // Check circuit breaker
      if (this.circuitBreakerOpen) {
        const now = Date.now();
        if (now - this.lastFailureTime > this.circuitBreakerTimeout) {
          console.log(
            "[IoTOvertimeService] Circuit breaker timeout expired, resetting..."
          );
          this.circuitBreakerOpen = false;
          this.consecutiveFailures = 0;
        } else {
          console.log(
            "[IoTOvertimeService] Circuit breaker open, skipping IoT check"
          );
          return;
        }
      }

      console.log("[IoTOvertimeService] Checking IoT overtime...");

      // Check if iotService is available
      if (
        !iotService ||
        typeof iotService.getParkingAvailability !== "function"
      ) {
        console.warn(
          "[IoTOvertimeService] iotService not available, skipping check"
        );
        return;
      }

      // Get real-time parking availability from IoT sensors
      const availability = await iotService.getParkingAvailability();

      if (availability.offline) {
        console.log("[IoTOvertimeService] IoT system offline, skipping check");
        return;
      }

      // Reset failure count on successful operation
      this.consecutiveFailures = 0;

      // Get all active bookings
      const activeBookings = await this.getActiveBookings();

      if (activeBookings.length === 0) {
        console.log(
          "[IoTOvertimeService] No active bookings found for IoT check"
        );
        return;
      }

      for (const booking of activeBookings) {
        await this.checkBookingOvertime(booking, availability);
      }
    } catch (error) {
      console.error("[IoTOvertimeService] Error checking IoT overtime:", error);

      // Increment failure count and check circuit breaker
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.circuitBreakerOpen = true;
        this.lastFailureTime = Date.now();
        console.warn(
          `[IoTOvertimeService] Circuit breaker opened after ${this.consecutiveFailures} consecutive failures`
        );
      }
    }
  }

  // Check if a specific booking has overtime based on IoT status
  async checkBookingOvertime(booking, availability) {
    try {
      const spotNumber = booking.parking_spot?.spot_number;
      if (!spotNumber) return;

      // Find the spot in IoT data
      const iotSpot = availability.spots.find(
        (spot) => spot.spot_number === spotNumber
      );
      if (!iotSpot) {
        console.log(
          `[IoTOvertimeService] No IoT data found for spot ${spotNumber}`
        );
        return;
      }

      const isCurrentlyOccupied = !iotSpot.is_available;
      const now = new Date();
      const endTime = new Date(booking.end_time);
      const hasExpired = endTime < now;

      console.log(
        `[IoTOvertimeService] Spot ${spotNumber}: Occupied=${isCurrentlyOccupied}, Expired=${hasExpired}, IoT Available=${iotSpot.is_available}`
      );

      if (hasExpired) {
        const timeSinceExpiry = now - endTime;
        const secondsSinceExpiry = Math.floor(timeSinceExpiry / 1000);

        // Check if we're in the 5-second grace period
        if (secondsSinceExpiry <= 5) {
          // Still in grace period
          if (!this.gracePeriodStartTimes[booking.id]) {
            this.gracePeriodStartTimes[booking.id] = endTime;
            console.log(
              `[IoTOvertimeService] IoT Grace period started for booking ${booking.id} (${secondsSinceExpiry}s since expiry)`
            );
          }
        } else {
          // Grace period has ended - check if car is still parked
          console.log(
            `[IoTOvertimeService] Grace period ended for booking ${booking.id}. Car still parked: ${isCurrentlyOccupied}`
          );

          if (isCurrentlyOccupied) {
            // Car is still parked (red light is on) - start overtime
            if (
              this.gracePeriodStartTimes[booking.id] &&
              !this.overtimeStartTimes[booking.id]
            ) {
              console.log(
                `[IoTOvertimeService] Starting overtime detection for booking ${booking.id} - car still parked after grace period`
              );
              await this.handleOvertimeDetection(booking, spotNumber);
            } else if (this.overtimeStartTimes[booking.id]) {
              // Continue monitoring overtime
              console.log(
                `[IoTOvertimeService] Continuing overtime monitoring for booking ${booking.id}`
              );
              await this.handleOvertimeDetection(booking, spotNumber);
            }
          } else {
            // Car left (red light turned green) - complete overtime
            if (this.overtimeStartTimes[booking.id]) {
              console.log(
                `[IoTOvertimeService] Car left for booking ${booking.id} - completing overtime`
              );
              await this.handleOvertimeCompletion(booking, spotNumber);
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error checking overtime for booking ${booking.id}:`,
        error
      );
    }
  }

  // Handle overtime detection (red light stays on after expiry)
  async handleOvertimeDetection(booking, spotNumber) {
    try {
      const now = new Date();
      const endTime = new Date(booking.end_time);

      // Calculate overtime start time (5 seconds after expiry)
      const overtimeStartTime = new Date(endTime.getTime() + 5000);

      // Calculate overtime minutes from the grace period end
      const overtimeMinutes = Math.floor(
        (now - overtimeStartTime) / (1000 * 60)
      );

      // Check if this is the first time we're detecting overtime
      if (!this.overtimeStartTimes[booking.id]) {
        this.overtimeStartTimes[booking.id] = overtimeStartTime;
        console.log(
          `[IoTOvertimeService] Overtime started for booking ${booking.id} at ${overtimeStartTime} (5s after expiry)`
        );

        // Calculate overtime cost (assuming $1 per 30 seconds)
        const overtimeCost = (overtimeMinutes * 2) / 30;

        // Send immediate overtime notification
        console.log(
          `[IoTOvertimeService] Sending overtime alert notification for booking ${booking.id}`
        );
        const notificationId = await notificationService.scheduleOvertimeAlert(
          booking,
          overtimeMinutes,
          overtimeCost
        );
        console.log(
          `[IoTOvertimeService] Overtime alert notification sent with ID: ${notificationId}`
        );

        // Update the backend with overtime information
        await this.updateOvertimeBilling(
          booking.id,
          overtimeMinutes,
          overtimeCost
        );
      } else {
        // Continue monitoring existing overtime
        const overtimeCost = (overtimeMinutes * 2) / 30; // $1 per 30 seconds

        console.log(
          `[IoTOvertimeService] Booking ${
            booking.id
          } overtime: ${overtimeMinutes} min, $${overtimeCost.toFixed(2)}`
        );

        // Update the backend with current overtime information
        await this.updateOvertimeBilling(
          booking.id,
          overtimeMinutes,
          overtimeCost
        );
      }
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error handling overtime detection for booking ${booking.id}:`,
        error
      );
    }
  }

  // Handle overtime completion (red light turns green)
  async handleOvertimeCompletion(booking, spotNumber) {
    try {
      if (this.overtimeStartTimes[booking.id]) {
        const overtimeStartTime = this.overtimeStartTimes[booking.id];
        const now = new Date();

        // Calculate total overtime
        const totalOvertimeMinutes = Math.floor(
          (now - overtimeStartTime) / (1000 * 60)
        );
        const totalOvertimeCost = (totalOvertimeMinutes * 2) / 30; // $1 per 30 seconds

        console.log(
          `[IoTOvertimeService] Overtime completed for booking ${
            booking.id
          }: ${totalOvertimeMinutes} min, $${totalOvertimeCost.toFixed(2)}`
        );

        // Force database update with final overtime values
        await this.forceUpdateOvertimeBilling(
          booking.id,
          totalOvertimeMinutes,
          totalOvertimeCost
        );

        // Send completion notification
        await notificationService.scheduleBookingCompletion(
          booking,
          totalOvertimeCost
        );

        // Clear overtime tracking
        delete this.overtimeStartTimes[booking.id];
        delete this.redLightStatus[booking.id];
        delete this.gracePeriodStartTimes[booking.id];
      }
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error handling overtime completion for booking ${booking.id}:`,
        error
      );
    }
  }

  // Update overtime billing in backend
  async updateOvertimeBilling(bookingId, overtimeMinutes, overtimeCost) {
    try {
      const response = await bookingAPI.checkAndBillOvertime(bookingId);
      console.log(
        `[IoTOvertimeService] Updated overtime billing for booking ${bookingId}:`,
        response
      );
      return response;
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error updating overtime billing for booking ${bookingId}:`,
        error
      );
    }
  }

  // Force update overtime billing with final values
  async forceUpdateOvertimeBilling(bookingId, overtimeMinutes, overtimeCost) {
    try {
      console.log(
        `[IoTOvertimeService] Force updating overtime billing for booking ${bookingId}: ${overtimeMinutes} min, $${overtimeCost.toFixed(
          2
        )}`
      );

      // Make multiple attempts to ensure database update
      const maxAttempts = 3;
      let success = false;
      let finalResponse = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(
            `[IoTOvertimeService] Attempt ${attempt}/${maxAttempts} to update overtime billing`
          );

          const response = await bookingAPI.checkAndBillOvertime(bookingId);
          finalResponse = response;

          // Verify the response contains our values
          if (response && response.overtime_minutes >= overtimeMinutes) {
            console.log(
              `[IoTOvertimeService] ✅ SUCCESS: Overtime billing updated in database for booking ${bookingId}:`,
              {
                overtime_minutes: response.overtime_minutes,
                overtime_cost: response.overtime_cost,
                is_overtime: response.is_overtime,
                total_cost_with_overtime: response.total_cost_with_overtime,
                message: response.message,
              }
            );

            // Additional verification: Check if values are actually stored
            console.log(`[IoTOvertimeService] 📊 DATABASE VERIFICATION:`, {
              booking_id: bookingId,
              expected_minutes: overtimeMinutes,
              stored_minutes: response.overtime_minutes,
              expected_cost: overtimeCost.toFixed(2),
              stored_cost: response.overtime_cost,
              minutes_match: response.overtime_minutes >= overtimeMinutes,
              cost_match:
                Math.abs(parseFloat(response.overtime_cost) - overtimeCost) <
                0.01,
            });

            success = true;
            break;
          } else {
            console.warn(
              `[IoTOvertimeService] Attempt ${attempt} - Response doesn't match expected values:`,
              {
                expected_minutes: overtimeMinutes,
                received_minutes: response?.overtime_minutes,
                expected_cost: overtimeCost.toFixed(2),
                received_cost: response?.overtime_cost,
                full_response: response,
              }
            );
          }
        } catch (error) {
          console.error(
            `[IoTOvertimeService] Attempt ${attempt} failed:`,
            error.message || error
          );
        }

        // Wait before retry
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!success) {
        console.error(
          `[IoTOvertimeService] ❌ FAILED: Could not update overtime billing after ${maxAttempts} attempts`,
          {
            booking_id: bookingId,
            expected_minutes: overtimeMinutes,
            expected_cost: overtimeCost,
            final_response: finalResponse,
          }
        );
      }

      return success;
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error force updating overtime billing for booking ${bookingId}:`,
        error
      );
      return false;
    }
  }

  // Finalize overtime billing when car leaves
  async finalizeOvertimeBilling(bookingId, overtimeMinutes, overtimeCost) {
    try {
      const response = await bookingAPI.completeOvertimeBooking(bookingId);
      console.log(
        `[IoTOvertimeService] Finalized overtime billing for booking ${bookingId}:`,
        response
      );
      return response;
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error finalizing overtime billing for booking ${bookingId}:`,
        error
      );
    }
  }

  // Get all active bookings with retry mechanism and caching
  async getActiveBookings() {
    const maxRetries = 4;
    let retryCount = 0;

    const now = Date.now();

    // Circuit breaker: short-circuit network calls if repeatedly failing
    if (this.circuitBreakerOpen) {
      const sinceOpen = now - this.lastFailureTime;
      if (sinceOpen < this.circuitBreakerTimeout) {
        console.warn(
          `[IoTOvertimeService] Circuit breaker open (${Math.round(
            (this.circuitBreakerTimeout - sinceOpen) / 1000
          )}s left). Serving cached data.`
        );
        return this.cachedBookings.length > 0 ? this.cachedBookings : [];
      } else {
        console.log(
          "[IoTOvertimeService] Circuit breaker half-open: probing..."
        );
        this.circuitBreakerOpen = false; // allow a probe
      }
    }

    // Use recent cache to avoid noisy polling
    if (this.cachedBookings.length > 0 && now - this.lastBookingFetch < 30000) {
      console.log(
        `[IoTOvertimeService] Using cached bookings (${this.cachedBookings.length} active)`
      );
      return this.cachedBookings;
    }

    while (retryCount < maxRetries) {
      try {
        console.log(
          `[IoTOvertimeService] Fetching active bookings (attempt ${
            retryCount + 1
          }/${maxRetries})`
        );
        const response = await bookingAPI.getBookings();
        // Coerce response into an array (supports paginated or direct arrays)
        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.results)
          ? response.results
          : [];
        const activeBookings = list.filter(
          (booking) => booking.status === "active"
        );

        // Success resets failure counters
        this.consecutiveFailures = 0;
        this.circuitBreakerOpen = false;

        // Update cache
        this.cachedBookings = activeBookings;
        this.lastBookingFetch = Date.now();

        console.log(
          `[IoTOvertimeService] Found ${activeBookings.length} active bookings`
        );
        return activeBookings;
      } catch (error) {
        retryCount++;
        this.consecutiveFailures += 1;
        console.warn(
          `[IoTOvertimeService] Error fetching active bookings (attempt ${retryCount}/${maxRetries}):`,
          error?.message || error
        );

        // If unauthorized/forbidden, don't hammer the server; serve cache
        const statusCode = error?.response?.status;
        if (statusCode === 401 || statusCode === 403) {
          console.warn("[IoTOvertimeService] Auth issue; serving cached data");
          return this.cachedBookings.length > 0 ? this.cachedBookings : [];
        }

        if (retryCount < maxRetries) {
          // Exponential backoff with jitter
          const base = Math.pow(2, retryCount) * 1000; // 2s,4s,8s,16s
          const jitter = Math.floor(Math.random() * 500);
          const waitTime = base + jitter;
          console.log(`[IoTOvertimeService] Retrying in ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // Open circuit breaker if too many consecutive failures
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          this.circuitBreakerOpen = true;
          this.lastFailureTime = Date.now();
          console.error(
            `[IoTOvertimeService] Circuit breaker OPEN after ${this.consecutiveFailures} failures`
          );
        }

        console.error("[IoTOvertimeService] All retry attempts failed");

        // Try a lighter endpoint as a fallback if available
        try {
          const fallback = await bookingAPI.getActiveOvertimeBookings();
          if (Array.isArray(fallback) && fallback.length > 0) {
            console.log(
              `[IoTOvertimeService] Fallback succeeded: ${fallback.length} active overtime bookings`
            );
            // Do not cache as full bookings, but return cached full data if available
            return this.cachedBookings.length > 0 ? this.cachedBookings : [];
          }
        } catch (_) {
          // ignore fallback failures
        }

        // Use cached data if available, otherwise return empty array
        if (this.cachedBookings.length > 0) {
          console.log(
            `[IoTOvertimeService] Using stale cached data (${this.cachedBookings.length} active bookings)`
          );
          return this.cachedBookings;
        } else {
          console.log(
            "[IoTOvertimeService] No cached data available, returning empty array"
          );
          return [];
        }
      }
    }

    return this.cachedBookings.length > 0 ? this.cachedBookings : [];
  }

  // Get current overtime status for a booking
  getOvertimeStatus(bookingId) {
    const startTime = this.overtimeStartTimes[bookingId];
    if (!startTime) return null;

    const now = new Date();
    const overtimeMinutes = Math.floor((now - startTime) / (1000 * 60));
    const overtimeCost = (overtimeMinutes * 2) / 30; // $1 per 30 seconds

    return {
      overtimeMinutes,
      overtimeCost,
      startTime,
      isActive: true,
    };
  }

  // Get all active overtime bookings
  getAllActiveOvertime() {
    const activeOvertime = {};

    for (const [bookingId, startTime] of Object.entries(
      this.overtimeStartTimes
    )) {
      activeOvertime[bookingId] = this.getOvertimeStatus(bookingId);
    }

    return activeOvertime;
  }

  // Test method to manually trigger overtime detection
  async testOvertimeDetection(bookingId) {
    try {
      const activeBookings = await this.getActiveBookings();
      const booking = activeBookings.find((b) => b.id === bookingId);

      if (!booking) {
        console.log(
          `[IoTOvertimeService] No active booking found with ID: ${bookingId}`
        );
        return false;
      }

      console.log(
        `[IoTOvertimeService] Testing overtime detection for booking ${bookingId}`
      );

      // Simulate expired booking
      const now = new Date();
      const endTime = new Date(now.getTime() - 10000); // 10 seconds ago
      booking.end_time = endTime.toISOString();

      // Trigger fallback overtime check
      await this.checkFallbackOvertime();

      return true;
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error testing overtime detection:`,
        error
      );
      return false;
    }
  }

  // Test method to simulate slot occupancy for testing
  async testSlotOccupancy(slotName, isOccupied) {
    try {
      const response = await fetch(
        `${
          process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.94.110.47:8000/api"
        }/iot/test/occupancy/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slot_name: slotName,
            is_occupied: isOccupied,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log(
          `[IoTOvertimeService] Test occupancy set: ${result.message}`
        );
        return true;
      } else {
        console.error(
          `[IoTOvertimeService] Failed to set test occupancy: ${response.status}`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error setting test occupancy:`,
        error
      );
      return false;
    }
  }

  // Get current parking availability for testing
  async getParkingAvailability() {
    try {
      const response = await fetch(
        `${
          process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.94.110.47:8000/api"
        }/iot/parking/availability/`
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`[IoTOvertimeService] Parking availability:`, data);
        return data;
      } else {
        console.error(
          `[IoTOvertimeService] Failed to get parking availability: ${response.status}`
        );
        return null;
      }
    } catch (error) {
      console.error(
        `[IoTOvertimeService] Error getting parking availability:`,
        error
      );
      return null;
    }
  }

  // Force refresh of cached bookings
  async refreshBookingsCache() {
    console.log("[IoTOvertimeService] Force refreshing bookings cache...");
    this.lastBookingFetch = 0; // Force refresh
    return await this.getActiveBookings();
  }

  // Get cached bookings without API call
  getCachedBookings() {
    return this.cachedBookings;
  }

  // Test function to verify overtime data is stored in database
  async verifyOvertimeInDatabase(bookingId) {
    try {
      console.log(
        `[IoTOvertimeService] 🔍 VERIFYING overtime data in database for booking ${bookingId}`
      );

      const response = await bookingAPI.checkAndBillOvertime(bookingId);

      console.log(`[IoTOvertimeService] 📊 DATABASE VERIFICATION RESULT:`, {
        booking_id: bookingId,
        overtime_minutes: response?.overtime_minutes,
        overtime_cost: response?.overtime_cost,
        is_overtime: response?.is_overtime,
        total_cost_with_overtime: response?.total_cost_with_overtime,
        message: response?.message,
        timestamp: new Date().toISOString(),
      });

      // Check if overtime data exists
      const hasOvertimeData =
        response?.overtime_minutes > 0 || response?.overtime_cost > 0;

      if (hasOvertimeData) {
        console.log(
          `[IoTOvertimeService] ✅ CONFIRMED: Overtime data is stored in database for booking ${bookingId}`
        );
      } else {
        console.log(
          `[IoTOvertimeService] ⚠️ WARNING: No overtime data found in database for booking ${bookingId}`
        );
      }

      return {
        success: true,
        hasOvertimeData,
        data: response,
      };
    } catch (error) {
      console.error(
        `[IoTOvertimeService] ❌ ERROR verifying overtime in database for booking ${bookingId}:`,
        error
      );
      return {
        success: false,
        hasOvertimeData: false,
        error: error.message || error,
      };
    }
  }
}

export default new IoTOvertimeService();
