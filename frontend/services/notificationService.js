import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log(
        "🔔 [NotificationService] Initializing notification service..."
      );

      // Check if device supports notifications
      if (!Device.isDevice) {
        console.log(
          "⚠️ [NotificationService] Not running on a device, notifications may not work"
        );
      }

      // Request permissions
      if (Device.isDevice) {
        console.log(
          "📱 [NotificationService] Checking notification permissions..."
        );
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        console.log(
          "📱 [NotificationService] Current permission status:",
          existingStatus
        );

        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          console.log(
            "📱 [NotificationService] Requesting notification permissions..."
          );
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
          console.log(
            "📱 [NotificationService] Permission request result:",
            status
          );
        }

        if (finalStatus !== "granted") {
          console.log(
            "❌ [NotificationService] Notification permissions not granted"
          );
          return false;
        }

        console.log(
          "✅ [NotificationService] Notification permissions granted"
        );
      }

      // Configure notification channel for Android
      if (Platform.OS === "android") {
        console.log(
          "🤖 [NotificationService] Setting up Android notification channels..."
        );

        await Notifications.setNotificationChannelAsync("overtime-alerts", {
          name: "Overtime Alerts",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
          sound: "default",
        });
        console.log("🤖 [NotificationService] Created overtime-alerts channel");

        await Notifications.setNotificationChannelAsync(
          "booking-confirmations",
          {
            name: "Booking Confirmations",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#4CAF50",
            sound: "default",
          }
        );
        console.log(
          "🤖 [NotificationService] Created booking-confirmations channel"
        );

        await Notifications.setNotificationChannelAsync("booking-updates", {
          name: "Booking Updates",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#4CAF50",
          sound: "default",
        });
        console.log("🤖 [NotificationService] Created booking-updates channel");
      }

      this.isInitialized = true;

      // Set up notification response listener
      this.setupNotificationResponseListener();

      console.log("✅ Notification service initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize notification service:", error);
      return false;
    }
  }

  // 1. BOOKING CONFIRMATION NOTIFICATION (when booking is made)
  async scheduleBookingConfirmation(booking) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Calculate total cost if not provided
      let totalCost = parseFloat(booking.total_cost || 0);
      if (totalCost === 0 && booking.duration_minutes) {
        // Assume $1 per 30 seconds if no cost provided
        totalCost = (booking.duration_minutes * 2) / 30; // 2 minutes = 4 * 30-second blocks
      }

      // Ensure totalCost is a valid number
      totalCost = Number(totalCost) || 0;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "✅ Parking Booking Confirmed!",
          body: `Your booking is confirmed. `,
          data: {
            type: "booking_confirmation",
            bookingId: booking.id,
            spotNumber: booking.parking_spot?.spot_number,
            duration: booking.duration_minutes || 0,
            totalCost: totalCost,
            startTime: booking.start_time,
            endTime: booking.end_time,
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });

      console.log(`✅ Booking confirmation scheduled: ${notificationId}`);
      return notificationId;
    } catch (error) {
      console.error("❌ Failed to schedule booking confirmation:", error);
      return null;
    }
  }

  async scheduleTimeExpiredNotification(booking) {
    try {
      console.log(
        "🔔 [NotificationService] scheduleTimeExpiredNotification called for booking:",
        booking.id
      );

      if (!this.isInitialized) {
        console.log(
          "🔔 [NotificationService] Not initialized, initializing now..."
        );
        await this.initialize();
      }

      console.log(
        "🔔 [NotificationService] Scheduling time expired notification..."
      );

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "⏰ Parking Time Expired!",
          body: `Your parking time at spot ${
            booking.parking_spot?.spot_number || "N/A"
          } has expired. Grace period started - move your vehicle now!`,
          data: {
            type: "time_expired",
            bookingId: booking.id,
            spotNumber: booking.parking_spot?.spot_number,
            endTime: booking.end_time,
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });

      console.log(
        `✅ [NotificationService] Time expired notification scheduled: ${notificationId}`
      );
      return notificationId;
    } catch (error) {
      console.error(
        "❌ [NotificationService] Failed to schedule time expired notification:",
        error
      );
      return null;
    }
  }

  async scheduleOvertimeAlert(booking, overtimeMinutes, overtimeCost) {
    try {
      console.log(
        "🔔 [NotificationService] scheduleOvertimeAlert called with:",
        {
          bookingId: booking.id,
          overtimeMinutes,
          overtimeCost,
          isInitialized: this.isInitialized,
        }
      );

      if (!this.isInitialized) {
        console.log(
          "🔔 [NotificationService] Not initialized, initializing now..."
        );
        await this.initialize();
      }

      // Ensure parameters are valid numbers
      overtimeMinutes = Number(overtimeMinutes) || 0;
      overtimeCost = Number(overtimeCost) || 0;

      console.log(
        "🔔 [NotificationService] Scheduling overtime alert notification..."
      );

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "🚨 Overtime Charging Started!",
          body:
            `Your parking time at spot ${
              booking.parking_spot?.spot_number || "N/A"
            } has expired. ` +
            `You are being charged $${(Number(overtimeCost) || 0).toFixed(
              2
            )} for ${overtimeMinutes} minutes overtime.`,
          data: {
            type: "overtime_alert",
            bookingId: booking.id,
            spotNumber: booking.parking_spot?.spot_number,
            overtimeMinutes,
            overtimeCost,
            totalCost: parseFloat(booking.total_cost || 0),
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });

      console.log(
        `✅ [NotificationService] Overtime alert scheduled: ${notificationId}`
      );
      return notificationId;
    } catch (error) {
      console.error(
        "❌ [NotificationService] Failed to schedule overtime alert:",
        error
      );
      return null;
    }
  }

  // Schedule warning notification for future time (used when booking is created)
  async scheduleOvertimeWarning(booking, minutesBeforeExpiry = 5) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const warningTime = new Date(booking.end_time);
      warningTime.setMinutes(warningTime.getMinutes() - minutesBeforeExpiry);

      // Only schedule if warning time is in the future
      if (warningTime > new Date()) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: "⚠️ Parking Time Ending Soon",
            body:
              `Your parking time at spot ${
                booking.parking_spot?.spot_number || "N/A"
              } ` +
              `expires in ${minutesBeforeExpiry} minutes. Please move your vehicle.`,
            data: {
              type: "overtime_warning",
              bookingId: booking.id,
              spotNumber: booking.parking_spot?.spot_number,
              minutesRemaining: minutesBeforeExpiry,
              expiryTime: booking.end_time,
            },
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.DEFAULT,
          },
          trigger: {
            date: warningTime,
          },
        });

        console.log(
          `✅ Overtime warning scheduled for ${warningTime}: ${notificationId}`
        );
        return notificationId;
      }
    } catch (error) {
      console.error("❌ Failed to schedule overtime warning:", error);
      return null;
    }
  }

  // Send immediate warning notification (used in countdown timer)
  async sendImmediateWarning(booking, minutesRemaining) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "⚠️ Parking Time Ending Soon",
          body:
            `Your parking time at spot ${
              booking.parking_spot?.spot_number || "N/A"
            } ` +
            `expires in ${minutesRemaining} minutes. Please move your vehicle.`,
          data: {
            type: "overtime_warning",
            bookingId: booking.id,
            spotNumber: booking.parking_spot?.spot_number,
            minutesRemaining: minutesRemaining,
            expiryTime: booking.end_time,
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });

      console.log(
        `✅ Immediate warning sent for booking ${booking.id}: ${minutesRemaining} minutes remaining`
      );
      return notificationId;
    } catch (error) {
      console.error("❌ Failed to send immediate warning:", error);
      return null;
    }
  }

  async scheduleBookingCompletion(booking, totalCost) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Calculate total cost if not provided
      let finalTotalCost = totalCost;
      if (!finalTotalCost || isNaN(finalTotalCost)) {
        finalTotalCost = parseFloat(booking.total_cost || 0);
        if (finalTotalCost === 0 && booking.duration_minutes) {
          // Assume $1 per 30 seconds if no cost provided
          finalTotalCost = (booking.duration_minutes * 2) / 30; // 2 minutes = 4 * 30-second blocks
        }
      }

      // Ensure finalTotalCost is a valid number
      if (!finalTotalCost || isNaN(finalTotalCost) || finalTotalCost < 0) {
        finalTotalCost = 0;
      }

      // Convert to number and ensure it's valid
      finalTotalCost = Number(finalTotalCost) || 0;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "✅ Parking Session Complete",
          body: `Your parking session at spot ${
            booking.parking_spot?.spot_number || "N/A"
          } has ended. Total cost: $${finalTotalCost.toFixed(2)}`,
          data: {
            type: "booking_completion",
            bookingId: booking.id,
            spotNumber: booking.parking_spot?.spot_number,
            totalCost: finalTotalCost,
            overtimeCost: parseFloat(booking.overtime_cost || 0),
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: null, // Send immediately
      });

      console.log(
        `✅ Booking completion notification scheduled: ${notificationId}`
      );
      return notificationId;
    } catch (error) {
      console.error(
        "❌ Failed to schedule booking completion notification:",
        error
      );
      return null;
    }
  }

  // Notify when car departure is detected with duration captured on device
  async scheduleDepartureDetected(booking, durationSeconds) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const hours = Math.floor((durationSeconds || 0) / 3600);
      const minutes = Math.floor(((durationSeconds || 0) % 3600) / 60);
      const seconds = (durationSeconds || 0) % 60;
      const durationLabel =
        hours > 0
          ? `${hours}h ${minutes}m ${seconds}s`
          : minutes > 0
          ? `${minutes}m ${seconds}s`
          : `${seconds}s`;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Car Departure Detected",
          body: `You left spot ${
            booking?.parking_spot?.spot_number || "N/A"
          }. Duration: ${durationLabel}.`,
          data: {
            type: "departure_detected",
            bookingId: booking?.id,
            spotNumber: booking?.parking_spot?.spot_number,
            durationSeconds: durationSeconds || 0,
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: null,
      });

      console.log(
        `✅ Departure detected notification scheduled: ${notificationId}`
      );
      return notificationId;
    } catch (error) {
      console.error(
        "❌ Failed to schedule departure detected notification:",
        error
      );
      return null;
    }
  }

  // Notify user about wallet deduction after payment/charge
  async notifyWalletCharge({ amount, balance, bookingId, spotNumber }) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "💳 Parking Charge Successful",
          body: `Paid $${Number(amount || 0).toFixed(2)} for ${
            spotNumber ? `spot ${spotNumber}` : "parking"
          }. Remaining balance: $${Number(balance || 0).toFixed(2)}.`,
          data: {
            type: "wallet_charge",
            bookingId,
            spotNumber,
            amount: Number(amount || 0),
            balance: Number(balance || 0),
          },
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: null,
      });

      console.log(`✅ Wallet charge notification scheduled: ${notificationId}`);
      return notificationId;
    } catch (error) {
      console.error("❌ Failed to schedule wallet charge notification:", error);
      return null;
    }
  }

  async scheduleNotificationsForBookings(bookings) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const notificationIds = [];

      for (const booking of bookings) {
        if (booking.status === "active") {
          // Schedule warning 5 minutes before expiry
          const warningId = await this.scheduleOvertimeWarning(booking, 5);
          if (warningId) notificationIds.push(warningId);

          // Schedule warning 1 minute before expiry
          const lastWarningId = await this.scheduleOvertimeWarning(booking, 1);
          if (lastWarningId) notificationIds.push(lastWarningId);
        }
      }

      console.log(
        `✅ Scheduled ${notificationIds.length} notifications for ${bookings.length} bookings`
      );
      return notificationIds;
    } catch (error) {
      console.error("❌ Failed to schedule notifications for bookings:", error);
      return [];
    }
  }

  async cancelNotification(notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log(`✅ Cancelled notification: ${notificationId}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to cancel notification:", error);
      return false;
    }
  }

  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log("✅ Cancelled all scheduled notifications");
      return true;
    } catch (error) {
      console.error("❌ Failed to cancel all notifications:", error);
      return false;
    }
  }

  async getPendingNotifications() {
    try {
      const notifications =
        await Notifications.getAllScheduledNotificationsAsync();
      console.log(`📋 Found ${notifications.length} pending notifications`);
      return notifications;
    } catch (error) {
      console.error("❌ Failed to get pending notifications:", error);
      return [];
    }
  }

  // Handle notification responses
  handleNotificationResponse(response) {
    const { type, data } = response.notification.request.content;

    console.log(`📱 Notification response received: ${type}`, data);

    switch (type) {
      case "booking_confirmation":
        // Handle booking confirmation response
        console.log(
          `✅ User acknowledged booking confirmation for spot ${data.spotNumber}`
        );
        break;

      case "time_expired":
        // Handle time expired response
        console.log(
          `⏰ User acknowledged time expired for spot ${data.spotNumber}`
        );
        break;

      case "overtime_warning":
        // Handle overtime warning response
        console.log(
          `⚠️ User acknowledged overtime warning for spot ${data.spotNumber}`
        );
        break;

      case "overtime_alert":
        // Handle overtime alert response
        console.log(
          `🚨 User acknowledged overtime alert for spot ${data.spotNumber}`
        );
        break;

      case "booking_completion":
        // Handle booking completion response
        console.log(
          `✅ User acknowledged booking completion for spot ${data.spotNumber}`
        );
        break;

      default:
        console.log(`📱 Unknown notification type: ${type}`);
    }
  }

  // Set up notification response listener
  setupNotificationResponseListener() {
    Notifications.addNotificationResponseReceivedListener(
      this.handleNotificationResponse
    );
    console.log("✅ Notification response listener set up");
  }

  // Check notification permissions status
  async checkPermissions() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      console.log(
        "📱 [NotificationService] Current permission status:",
        status
      );
      return status;
    } catch (error) {
      console.error(
        "❌ [NotificationService] Error checking permissions:",
        error
      );
      return "unknown";
    }
  }

  // Check if notifications are working
  async isWorking() {
    try {
      const permissions = await this.checkPermissions();
      const isInitialized = this.isInitialized;

      console.log("📱 [NotificationService] Status check:", {
        permissions,
        isInitialized,
        isDevice: Device.isDevice,
        platform: Platform.OS,
      });

      return {
        working: permissions === "granted" && isInitialized,
        permissions,
        isInitialized,
        isDevice: Device.isDevice,
        platform: Platform.OS,
      };
    } catch (error) {
      console.error("❌ [NotificationService] Error checking status:", error);
      return {
        working: false,
        error: error.message,
      };
    }
  }

  // Handle notification response (when user taps notification)
  async handleNotificationResponse(response) {
    try {
      const { type, bookingId, spotNumber } =
        response.notification.request.content.data;

      console.log(`📱 Notification tapped: ${type} for booking ${bookingId}`);

      // Handle different notification types
      switch (type) {
        case "booking_confirmation":
          // Navigate to booking details
          return { type: "booking_confirmation", bookingId, spotNumber };

        case "time_expired":
          // Navigate to booking details to show grace period
          return { type: "time_expired", bookingId, spotNumber };

        case "overtime_alert":
          // Navigate to booking details or show overtime info
          return { type: "overtime_alert", bookingId, spotNumber };

        case "overtime_warning":
          // Navigate to booking details
          return { type: "overtime_warning", bookingId, spotNumber };

        case "booking_completion":
          // Navigate to receipt or history
          return { type: "booking_completion", bookingId, spotNumber };

        default:
          return { type: "unknown", bookingId, spotNumber };
      }
    } catch (error) {
      console.error("❌ Failed to handle notification response:", error);
      return null;
    }
  }

  // Schedule all notifications for a new booking
  async scheduleAllNotificationsForNewBooking(booking) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const notificationIds = [];

      // 1. Immediate booking confirmation
      const confirmationId = await this.scheduleBookingConfirmation(booking);
      if (confirmationId) notificationIds.push(confirmationId);

      // 2. Warning 5 minutes before expiry
      const warning5Id = await this.scheduleOvertimeWarning(booking, 5);
      if (warning5Id) notificationIds.push(warning5Id);

      // 3. Warning 1 minute before expiry
      const warning1Id = await this.scheduleOvertimeWarning(booking, 1);
      if (warning1Id) notificationIds.push(warning1Id);

      console.log(
        `✅ Scheduled ${notificationIds.length} notifications for new booking ${booking.id}`
      );
      return notificationIds;
    } catch (error) {
      console.error(
        "❌ Failed to schedule notifications for new booking:",
        error
      );
      return [];
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

// Initialize when imported
notificationService.initialize();

export default notificationService;
