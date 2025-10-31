import React, { useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import { bookingAPI, authAPI, parkingAPI } from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import notificationService from "../services/notificationService";
import iotOvertimeService from "../services/iotOvertimeService";
import iotService from "../services/iotApi";

const { width } = Dimensions.get("window");

const MyBookingScreen = ({ navigation }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timeLeft, setTimeLeft] = useState({});
  const [autoActions, setAutoActions] = useState({}); // track one-shot auto-cancel per booking
  const [ledStatus, setLedStatus] = useState({});
  const [iotSlots, setIotSlots] = useState([]);
  const [iotStatus, setIotStatus] = useState({ online: false });

  console.log("📱 MyBookingScreen loaded");

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  // Fetch IoT data (same as home page)
  const fetchIoTData = async () => {
    try {
      console.log("[MyBookingScreen] Fetching IoT data...");
      const availabilityData = await iotService.getParkingAvailability();

      if (availabilityData.offline) {
        console.log("[MyBookingScreen] ESP32 is offline");
        setIotStatus({ online: false, error: availabilityData.message });
        setIotSlots([]);
        return;
      }

      setIotStatus({ online: true });
      setIotSlots(availabilityData.spots || []);
      console.log(
        "[MyBookingScreen] IoT slots updated:",
        availabilityData.spots
      );
    } catch (error) {
      console.error("[MyBookingScreen] Error fetching IoT data:", error);
      setIotStatus({ online: false, error: error.message });
      setIotSlots([]);
    }
  };

  // Check LED status for a specific spot (using IoT data)
  const checkLedStatus = async (spotNumber) => {
    try {
      // Use IoT data instead of API call
      const iotSlot = iotSlots.find((slot) => slot.spot_number === spotNumber);
      if (iotSlot) {
        const status = {
          spot_number: spotNumber,
          led_status: iotSlot.is_available ? "off" : "on",
          led_color: iotSlot.is_available ? "none" : "blue",
          led_message: iotSlot.is_available ? "Available" : "Occupied",
          is_occupied: !iotSlot.is_available,
          sensor_data: {
            is_occupied: !iotSlot.is_available,
            last_seen_seconds_ago: 0,
          },
        };
        setLedStatus((prev) => ({
          ...prev,
          [spotNumber]: status,
        }));
        return status;
      }
      return null;
    } catch (error) {
      console.error(`Error checking LED status for ${spotNumber}:`, error);
      return null;
    }
  };

  // Fetch bookings
  const fetchBookings = async (forceRefresh = false) => {
    try {
      setLoading(true);

      console.log("[MyBookingScreen] Fetching active bookings...");

      // Check authentication first
      const authStatus = await authAPI.getAuthStatus();
      if (!authStatus.isAuthenticated) {
        console.log(
          "[MyBookingScreen] User not authenticated, redirecting to login"
        );
        console.log("authStatus", authStatus);

        Alert.alert(
          "Authentication Required",
          "Please log in to view your current bookings",
          [{ text: "OK", onPress: () => navigation.navigate("Login") }]
        );
        return;
      }

      const response = await bookingAPI.getBookings();
      console.log("[MyBookingScreen] All bookings response:", response);

      // Filter to show only active bookings
      const activeBookings = response.filter(
        (booking) => booking && booking.id && booking.status === "active"
      );
      console.log("[MyBookingScreen] Active bookings:", activeBookings);
      console.log(
        "[MyBookingScreen] Booking cost details:",
        activeBookings.map((b) => ({
          id: b.id,
          total_cost: b.total_cost,
          overtime_cost: b.overtime_cost,
          base_cost:
            parseFloat(b.total_cost || 0) - parseFloat(b.overtime_cost || 0),
        }))
      );

      // PREVENT AUTO-REFRESH: Only update bookings if no finalized overtime exists or force refresh
      const hasFinalizedOvertime = Object.values(overtimeData).some(
        (overtime) => overtime?.finalized
      );
      if (hasFinalizedOvertime && !forceRefresh) {
        console.log(
          "[MyBookingScreen] 🚫 PREVENTING AUTO-REFRESH - Finalized overtime exists, keeping current bookings"
        );
        setLoading(false);
        return;
      }

      setBookings(activeBookings);

      // Check for overtime on existing bookings (async, don't wait)
      checkOvertimeForBookings(activeBookings).catch((error) =>
        console.error("Error checking overtime:", error)
      );

      // Fetch IoT data (same as home page) - async, don't wait
      fetchIoTData().catch((error) =>
        console.error("Error fetching IoT data:", error)
      );

      // LED status will be updated automatically when IoT data is fetched

      // Schedule notifications for existing active bookings (async, don't wait)
      try {
        await notificationService.initialize();
        await notificationService.scheduleNotificationsForBookings(
          activeBookings
        );
        console.log("✅ Notifications scheduled for existing bookings");
      } catch (error) {
        console.error("❌ Error scheduling notifications:", error);
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
      if (error.response?.status === 401) {
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please log in again.",
          [{ text: "OK", onPress: () => navigation.navigate("Login") }]
        );
      } else {
        Alert.alert("Error", "Failed to load active bookings");
      }
    } finally {
      setLoading(false);
    }
  };

  // Check overtime for all bookings
  const checkOvertimeForBookings = async (bookings) => {
    const newOvertimeData = {};

    for (const booking of bookings) {
      if (booking && booking.id && booking.status === "active") {
        try {
          const overtimeResponse = await bookingAPI.getBookingOvertime(
            booking.id
          );
          newOvertimeData[booking.id] = overtimeResponse;
          console.log(
            `[MyBookingScreen] Initial overtime check for booking ${booking.id}:`,
            overtimeResponse
          );
        } catch (error) {
          console.error(
            `Error checking overtime for booking ${booking.id}:`,
            error
          );
        }
      }
    }

    setOvertimeData(newOvertimeData);
  };

  // Countdown timer and overtime tracking effect
  useEffect(() => {
    const timer = setInterval(async () => {
      const now = new Date().getTime();
      const newTimeLeft = {};
      const newOvertimeData = { ...overtimeData };

      for (const booking of bookings) {
        if (
          booking &&
          booking.id &&
          booking.status === "active" &&
          booking.end_time
        ) {
          // If overtime is finalized for this booking, keep time at 00:00:00 and skip further overtime checks
          if (overtimeData[booking.id]?.finalized) {
            newTimeLeft[booking.id] = {
              hours: "00",
              minutes: "00",
              seconds: "00",
            };
            continue;
          }
          // Elapsed timer from when the timer actually started
          const timerStartTime = booking.timer_started
            ? new Date(booking.timer_started).getTime()
            : booking.start_time
            ? new Date(booking.start_time).getTime()
            : null;

          if (timerStartTime && now >= timerStartTime) {
            const elapsed = now - timerStartTime;
            const hours = Math.floor(elapsed / (1000 * 60 * 60));
            const minutes = Math.floor(
              (elapsed % (1000 * 60 * 60)) / (1000 * 60)
            );
            const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

            newTimeLeft[booking.id] = {
              hours: hours.toString().padStart(2, "0"),
              minutes: minutes.toString().padStart(2, "0"),
              seconds: seconds.toString().padStart(2, "0"),
            };
          } else {
            // Time has expired - show 00:00:00 and trigger notifications
            newTimeLeft[booking.id] = {
              hours: "00",
              minutes: "00",
              seconds: "00",
            };
            const endTime = new Date(booking.end_time).getTime();
            const secondsSinceExpiry = Math.floor((now - endTime) / 1000);

            if (secondsSinceExpiry > 5) {
              // Grace period ended - check if car is still parked
              console.log(
                `[MyBookingScreen] Grace period ended for booking ${booking.id} - checking for overtime`
              );

              // Get overtime status from IoT overtime service
              const overtimeStatus = iotOvertimeService.getOvertimeStatus(
                booking.id
              );

              if (overtimeStatus?.isActive) {
                // Car is still parked - calculate overtime
                const overtimeMinutes = Math.floor(
                  (secondsSinceExpiry - 5) / 60
                );
                const overtimeCost = overtimeMinutes * 0.5; // $0.50 per minute

                newOvertimeData[booking.id] = {
                  ...overtimeStatus,
                  isOvertime: true,
                  overtimeMinutes: overtimeMinutes,
                  overtimeCost: overtimeCost,
                  lastCheck: now,
                };

                // Send overtime notification if this is the first time detecting overtime
                if (!overtimeData[booking.id]?.isOvertime) {
                  try {
                    await notificationService.scheduleOvertimeAlert(
                      booking,
                      overtimeMinutes,
                      overtimeCost
                    );
                  } catch (error) {
                    console.error(
                      "Failed to send overtime notification:",
                      error
                    );
                  }
                }

                console.log(
                  `[MyBookingScreen] Overtime billing active for booking ${booking.id}:`,
                  { overtimeMinutes, overtimeCost }
                );

                // Persist overtime periodically (every ~15s) to backend
                const lastPersist = overtimeData[booking.id]?.lastPersist || 0;
                if (now - lastPersist > 15000) {
                  try {
                    const persisted = await bookingAPI.checkAndBillOvertime(
                      booking.id
                    );
                    newOvertimeData[booking.id] = {
                      ...newOvertimeData[booking.id],
                      ...persisted,
                      lastPersist: now,
                    };
                  } catch (e) {
                    console.log(
                      `Overtime persist failed for booking ${booking.id}:`,
                      e?.message || e
                    );
                  }
                }
              } else {
                // Check backend for overtime data
                const lastCheck = overtimeData[booking.id]?.lastCheck || 0;
                if (now - lastCheck > 5000) {
                  try {
                    const overtimeResponse =
                      await bookingAPI.checkAndBillOvertime(booking.id);
                    newOvertimeData[booking.id] = {
                      ...overtimeResponse,
                      lastCheck: now,
                    };
                    console.log(
                      `[MyBookingScreen] Backend overtime check for booking ${booking.id}:`,
                      overtimeResponse
                    );
                    console.log(`[MyBookingScreen] Overtime data updated:`, {
                      bookingId: booking.id,
                      overtimeMinutes: overtimeResponse.overtime_minutes,
                      overtimeCost: overtimeResponse.overtime_cost,
                      isOvertime: overtimeResponse.is_overtime,
                      lastCheck: now,
                    });
                  } catch (error) {
                    console.error(
                      `Error checking overtime for booking ${booking.id}:`,
                      error
                    );
                  }
                }
              }
            }
          }
        }
      }

      setTimeLeft(newTimeLeft);
      setOvertimeData(newOvertimeData);
    }, 1000); // Count down every second for real-time clock

    return () => clearInterval(timer);
  }, [bookings, overtimeData]);

  // Load bookings on mount
  useEffect(() => {
    fetchBookings();

    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Auto-refresh IoT data every 5 seconds (same as home page)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIoTData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update LED status when IoT data changes
  useEffect(() => {
    if (iotSlots.length > 0 && bookings.length > 0) {
      bookings.forEach((booking) => {
        if (booking.parking_spot?.spot_number) {
          checkLedStatus(booking.parking_spot.spot_number);
        }
      });
    }
  }, [iotSlots, bookings]);

  // Pause/stop overtime immediately when IoT shows slot became available (vehicle left)
  useEffect(() => {
    if (!iotSlots || iotSlots.length === 0) return;
    const now = Date.now();

    bookings.forEach((booking) => {
      if (!booking || !booking.id || booking.status !== "active") return;

      // Only consider after the countdown has ended (overtime window)
      const endTimeMs = booking.end_time
        ? new Date(booking.end_time).getTime()
        : null;
      if (!endTimeMs || now < endTimeMs + 5000) return; // still during or within 5s grace

      const spotNumber = booking.parking_spot?.spot_number;
      if (!spotNumber) return;

      const iotSlot = iotSlots.find((s) => s.spot_number === spotNumber);
      if (!iotSlot) return;

      const isAvailableNow = !!iotSlot.is_available;
      const alreadyFinalized = overtimeData[booking.id]?.finalized;

      if (isAvailableNow && !alreadyFinalized) {
        // Compute final values at this instant and freeze UI
        const secondsSinceExpiry = Math.floor((now - endTimeMs) / 1000);
        const overtimeSeconds = Math.max(0, secondsSinceExpiry - 5);
        const finalOvertimeMinutes = Math.floor(overtimeSeconds / 60);
        const finalOvertimeCost = (overtimeSeconds / 60) * 0.5; // $0.50/min
        const baseCost = parseFloat(booking.total_cost || 0);
        const finalTotalCost = baseCost + finalOvertimeCost;

        setOvertimeData((prev) => ({
          ...prev,
          [booking.id]: {
            ...prev[booking.id],
            overtime_minutes: finalOvertimeMinutes,
            overtime_cost: finalOvertimeCost,
            total_cost_with_overtime: finalTotalCost,
            is_overtime: true,
            finalized: true,
            lastCheck: Date.now(),
            preventRefresh: true,
            carLeft: true,
            overtimeStopped: true,
          },
        }));

        // Background sync to backend; UI remains frozen regardless of result
        bookingAPI
          .checkAndBillOvertime(booking.id)
          .then((r) => console.log("[IoT finalize] Backend sync ok", r))
          .catch((e) =>
            console.log("[IoT finalize] Backend sync error", e?.message || e)
          );
      }
    });
  }, [iotSlots, bookings, overtimeData]);

  // IoT Overtime monitoring effect
  useEffect(() => {
    // Start IoT overtime monitoring when component mounts
    iotOvertimeService.startMonitoring();

    // Cleanup when component unmounts
    return () => {
      iotOvertimeService.stopMonitoring();
    };
  }, []);

  // Effect to sync IoT overtime data with local state
  useEffect(() => {
    const iotSyncInterval = setInterval(() => {
      const iotOvertimeStatus = iotOvertimeService.getAllActiveOvertime();

      // Update local overtime data with IoT data
      setOvertimeData((prev) => {
        const updated = { ...prev };
        for (const [bookingId, overtimeInfo] of Object.entries(
          iotOvertimeStatus
        )) {
          // Do not overwrite finalized results
          if (overtimeInfo && !prev[bookingId]?.finalized) {
            updated[bookingId] = {
              ...overtimeInfo,
              isOvertime: true,
              lastCheck: Date.now(),
            };
          }
        }
        return updated;
      });
    }, 5000); // Sync every 5 seconds for better performance

    return () => clearInterval(iotSyncInterval);
  }, []);

  // Refresh bookings when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log("[MyBookingScreen] Screen focused - refreshing bookings");
      fetchBookings();
    }, [])
  );

  // Pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings(true); // Force refresh
    setRefreshing(false);
  };

  // Cancel booking
  const handleCancelBooking = async (bookingId) => {
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes",
          style: "destructive",
          onPress: async () => {
            try {
              await bookingAPI.cancelBooking(bookingId);
              Alert.alert("Success", "Booking cancelled successfully");
              fetchBookings();
            } catch (error) {
              console.error("Error cancelling booking:", error);
              Alert.alert("Error", "Failed to cancel booking");
            }
          },
        },
      ]
    );
  };

  // Extend booking time by preset minutes
  const handleExtendBooking = (bookingId) => {
    Alert.alert("Extend Time", "Add extra time to your booking", [
      {
        text: "+5 min",
        onPress: async () => {
          try {
            await bookingAPI.extendBooking(bookingId, 5);
            Alert.alert("Success", "Booking extended by 5 minutes");
            fetchBookings(true);
          } catch (e) {
            Alert.alert("Error", "Failed to extend booking");
          }
        },
      },
      {
        text: "+10 min",
        onPress: async () => {
          try {
            await bookingAPI.extendBooking(bookingId, 10);
            Alert.alert("Success", "Booking extended by 10 minutes");
            fetchBookings(true);
          } catch (e) {
            Alert.alert("Error", "Failed to extend booking");
          }
        },
      },
      {
        text: "+15 min",
        onPress: async () => {
          try {
            await bookingAPI.extendBooking(bookingId, 15);
            Alert.alert("Success", "Booking extended by 15 minutes");
            fetchBookings(true);
          } catch (e) {
            Alert.alert("Error", "Failed to extend booking");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Handle car detection for grace period
  const handleCarDetection = async (bookingId) => {
    try {
      console.log(`[MyBookingScreen] Detecting car for booking ${bookingId}`);

      const response = await bookingAPI.detectCarParked(bookingId);
      console.log(`[MyBookingScreen] Car detection response:`, response);

      if (response.status === "cancelled") {
        Alert.alert(
          "Booking Cancelled",
          "Grace period expired. Your booking has been cancelled and no charges will apply.",
          [{ text: "OK" }]
        );
        // Refresh bookings to remove cancelled booking
        await fetchBookings(true);
      } else {
        Alert.alert(
          "Timer Started!",
          "Car detected! Your parking timer has started.",
          [{ text: "OK" }]
        );
        // Refresh bookings to show updated timer status
        await fetchBookings(true);
      }
    } catch (error) {
      console.error(`[MyBookingScreen] Error detecting car:`, error);
      Alert.alert(
        "Detection Failed",
        error.message || "Failed to detect car. Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  // Format date
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return theme.accent;
      case "completed":
        return theme.button;
      case "cancelled":
        return theme.error;
      default:
        return theme.details;
    }
  };

  // Render countdown timer or overtime display
  const renderTimeDisplay = (bookingId) => {
    const time = timeLeft[bookingId];
    const overtime = overtimeData[bookingId];

    // Find the booking for this bookingId
    const booking = bookings.find((b) => b && b.id === bookingId);
    if (!booking) {
      console.log(
        `[MyBookingScreen] Booking ${bookingId} not found in bookings array`
      );
      return null;
    }

    // Get IoT overtime status
    const iotOvertime = iotOvertimeService.getOvertimeStatus(bookingId);

    // Check if booking is in grace period (timer not started yet)
    if (booking.grace_period_started && !booking.timer_started) {
      const now = new Date().getTime();
      const graceStart = new Date(booking.grace_period_started).getTime();
      const graceElapsed = Math.floor((now - graceStart) / 1000);
      const graceRemaining = Math.max(0, 20 - graceElapsed);

      if (graceRemaining > 0) {
        // Auto-start timer if IoT shows car parked during grace (one-shot)
        try {
          const spotNumber = booking?.parking_spot?.spot_number;
          if (
            iotSlots.length > 0 &&
            spotNumber &&
            !autoActions[`start_${bookingId}`]
          ) {
            const iotSlot = iotSlots.find(
              (slot) => slot.spot_number === spotNumber
            );
            const isOccupied = iotSlot ? !iotSlot.is_available : false;
            if (isOccupied) {
              setAutoActions((prev) => ({
                ...prev,
                [`start_${bookingId}`]: true,
              }));
              // Optimistic UI: start timer locally without refreshing list
              setBookings((prev) =>
                prev.map((b) =>
                  b.id === bookingId
                    ? { ...b, timer_started: new Date().toISOString() }
                    : b
                )
              );
              (async () => {
                try {
                  await bookingAPI.detectCarParked(bookingId);
                  // Do not immediately refresh to avoid flicker
                } catch (e) {
                  console.log(
                    "Auto-start on IoT during grace failed:",
                    e?.message || e
                  );
                }
              })();
            }
          }
        } catch (_) {}
        return (
          <View
            style={[
              styles.gracePeriodContainer,
              { backgroundColor: theme.card, borderColor: theme.warning },
            ]}
          >
            <View style={styles.gracePeriodHeader}>
              <Ionicons name="car" size={24} color={theme.warning} />
              <Text style={[styles.gracePeriodTitle, { color: theme.warning }]}>
                PARK YOUR CAR
              </Text>
            </View>
            <Text style={[styles.gracePeriodText, { color: theme.text }]}>
              Time remaining to park: {graceRemaining}s
            </Text>
            <Text style={[styles.gracePeriodSubtext, { color: theme.details }]}>
              Timer will start when car is detected
            </Text>
            <TouchableOpacity
              style={[
                styles.detectCarButton,
                { backgroundColor: theme.primary },
              ]}
              onPress={() => handleCarDetection(bookingId)}
            >
              <Text
                style={[
                  styles.detectCarButtonText,
                  { color: theme.background },
                ]}
              >
                I'M PARKED - START TIMER
              </Text>
            </TouchableOpacity>
          </View>
        );
      } else {
        // Grace expired: check if car is parked and start timer, otherwise cancel
        try {
          if (booking.timer_started || autoActions[`start_${bookingId}`]) {
            return null;
          }

          const spotNumber = booking?.parking_spot?.spot_number;
          let isOccupied = false;
          if (iotSlots.length > 0 && spotNumber) {
            const iotSlot = iotSlots.find(
              (slot) => slot.spot_number === spotNumber
            );
            isOccupied = iotSlot ? !iotSlot.is_available : false;
          }

          if (isOccupied && !autoActions[`start_${bookingId}`]) {
            // Car is parked - optimistically start timer in UI and background-call API
            setAutoActions((prev) => ({
              ...prev,
              [`start_${bookingId}`]: true,
            }));
            // Optimistic UI update: set timer_started locally
            setBookings((prev) =>
              prev.map((b) =>
                b.id === bookingId
                  ? { ...b, timer_started: new Date().toISOString() }
                  : b
              )
            );
            (async () => {
              try {
                await bookingAPI.detectCarParked(bookingId);
                // Avoid immediate refresh to prevent UI flicker
              } catch (e) {
                console.log(
                  "Auto-start on grace expiry failed:",
                  e?.message || e
                );
              }
            })();
            return null;
          } else if (!isOccupied && !autoActions[`cancel_${bookingId}`]) {
            // Car is not parked - auto-cancel like the cancel button and free slot
            setAutoActions((prev) => ({
              ...prev,
              [`cancel_${bookingId}`]: true,
            }));
            (async () => {
              try {
                await bookingAPI.cancelBooking(bookingId);
                await fetchBookings(true);
              } catch (e) {
                console.log(
                  "Auto-cancel on grace expiry failed:",
                  e?.message || e
                );
              }
            })();
            return null;
          }
        } catch (_) {}

        return null;
      }
    }

    // If time has expired, show overtime info or grace period message
    if (
      time &&
      time.hours === "00" &&
      time.minutes === "00" &&
      time.seconds === "00"
    ) {
      // Check if we're in grace period (first 5 seconds after expiry)
      const now = new Date().getTime();
      const endTime = new Date(booking.end_time).getTime();
      const secondsSinceExpiry = Math.floor((now - endTime) / 1000);

      // If overtime already finalized for this booking, immediately render frozen final block
      if (overtimeData[bookingId]?.finalized) {
        const finalOvertime = overtimeData[bookingId];
        const finalMinutes = finalOvertime?.overtime_minutes || 0;
        const finalCost = finalOvertime?.overtime_cost || 0;
        const finalTotal =
          finalOvertime?.total_cost_with_overtime ||
          parseFloat(booking.total_cost || 0);

        // Only show overtime bill if there's actual overtime (minutes > 0 or cost > 0)
        if (finalMinutes > 0 || finalCost > 0) {
          return (
            <View
              style={[
                styles.overtimeContainer,
                { backgroundColor: theme.card, borderColor: theme.success },
              ]}
            >
              <View style={styles.overtimeHeader}>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={theme.success}
                />
                <Text style={[styles.overtimeTitle, { color: theme.success }]}>
                  YOUR OVERTIME BILL
                </Text>
              </View>

              <View style={styles.overtimeGrid}>
                <View style={styles.overtimeItem}>
                  <Text
                    style={[styles.overtimeValue, { color: theme.success }]}
                  >
                    {finalMinutes.toString().padStart(2, "0")}:00
                  </Text>
                  <Text
                    style={[styles.overtimeLabel, { color: theme.details }]}
                  >
                    Final Overtime
                  </Text>
                </View>

                <View style={styles.overtimeItem}>
                  <Text
                    style={[styles.overtimeValue, { color: theme.success }]}
                  >
                    {`$${finalCost.toFixed(2)}`}
                  </Text>
                  <Text
                    style={[styles.overtimeLabel, { color: theme.details }]}
                  >
                    Final Cost
                  </Text>
                </View>

                <View style={styles.overtimeItem}>
                  <Text style={[styles.overtimeValue, { color: theme.accent }]}>
                    {`$${finalTotal.toFixed(2)}`}
                  </Text>
                  <Text
                    style={[styles.overtimeLabel, { color: theme.details }]}
                  >
                    Total Paid
                  </Text>
                </View>
              </View>

              <Text style={[styles.overtimeNote, { color: theme.details }]}>
                Overtime counting stopped • Final values captured
              </Text>
            </View>
          );
        }

        // No overtime - return null to show receipt only
        return null;
      }

      if (secondsSinceExpiry <= 5) {
        // Check if car is still parked - only show grace period if there's potential overtime
        const spotNumber = booking?.parking_spot?.spot_number;
        let isCarStillParked = false;

        if (iotSlots.length > 0 && spotNumber) {
          const iotSlot = iotSlots.find(
            (slot) => slot.spot_number === spotNumber
          );
          if (iotSlot) {
            isCarStillParked = !iotSlot.is_available;
          }
        }

        // Fallback to existing logic if IoT data not available
        if (!isCarStillParked) {
          const iotOvertime = iotOvertimeService.getOvertimeStatus(bookingId);
          isCarStillParked = iotOvertime?.isActive || overtime?.is_overtime;
        }

        // Only show grace period if car is still parked (potential overtime)
        if (isCarStillParked) {
          return (
            <View
              style={[
                styles.gracePeriodContainer,
                { backgroundColor: theme.card, borderColor: theme.warning },
              ]}
            >
              <View style={styles.gracePeriodHeader}>
                <Ionicons name="time" size={24} color={theme.warning} />
                <Text
                  style={[styles.gracePeriodTitle, { color: theme.warning }]}
                >
                  GRACE PERIOD
                </Text>
              </View>
              <Text style={[styles.gracePeriodText, { color: theme.text }]}>
                Time expired. Grace period: {5 - secondsSinceExpiry}s remaining
              </Text>
              <Text
                style={[styles.gracePeriodSubtext, { color: theme.details }]}
              >
                Move your vehicle now to avoid overtime charges
              </Text>
            </View>
          );
        } else {
          // Car is not parked - show completion message instead of grace period
          return (
            <View
              style={[
                styles.completionContainer,
                { backgroundColor: theme.card, borderColor: theme.success },
              ]}
            >
              <View style={styles.completionHeader}>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={theme.success}
                />
                <Text
                  style={[styles.completionTitle, { color: theme.success }]}
                >
                  BOOKING COMPLETED
                </Text>
              </View>
              <Text style={[styles.completionText, { color: theme.text }]}>
                Your parking session has ended successfully
              </Text>
            </View>
          );
        }
      }

      // After grace period, check if car is still parked using same logic as home page
      if (secondsSinceExpiry > 5) {
        // Get the parking spot from the booking we already found
        const spotNumber = booking?.parking_spot?.spot_number;

        // Check IoT data using same logic as home page
        let isCarStillParked = false;
        if (iotSlots.length > 0 && spotNumber) {
          const iotSlot = iotSlots.find(
            (slot) => slot.spot_number === spotNumber
          );
          if (iotSlot) {
            // Use the same logic as home page: slot is occupied if NOT available
            isCarStillParked = !iotSlot.is_available;
            console.log(
              `[MyBookingScreen] IoT slot ${spotNumber}: is_available=${iotSlot.is_available}, isCarStillParked=${isCarStillParked}`
            );
          }
        }

        // Fallback to existing logic if IoT data not available
        if (!isCarStillParked) {
          const iotOvertime = iotOvertimeService.getOvertimeStatus(bookingId);
          isCarStillParked = iotOvertime?.isActive || overtime?.is_overtime;
        }

        console.log(
          `[MyBookingScreen] Checking overtime for booking ${bookingId}:`,
          {
            secondsSinceExpiry,
            spotNumber,
            iotSlotsCount: iotSlots.length,
            isCarStillParked,
            iotOvertime: iotOvertimeService.getOvertimeStatus(bookingId),
            overtime,
          }
        );

        if (isCarStillParked && !overtimeData[bookingId]?.finalized) {
          // Car is still parked - show real-time overtime billing
          const overtimeSeconds = secondsSinceExpiry - 5; // Subtract grace period
          const overtimeMinutes = Math.floor(overtimeSeconds / 60);
          const overtimeSecondsRemainder = overtimeSeconds % 60;
          const overtimeCost = (overtimeSeconds / 60) * 0.5; // $0.50 per minute (prorated to seconds)
          const baseCost = parseFloat(booking?.total_cost || 0);
          const totalCost = baseCost + overtimeCost;

          return (
            <View
              style={[
                styles.overtimeContainer,
                { backgroundColor: theme.card, borderColor: theme.error },
              ]}
            >
              <View style={styles.overtimeHeader}>
                <Ionicons name="warning" size={24} color={theme.error} />
                <Text style={[styles.overtimeTitle, { color: theme.error }]}>
                  OVERTIME PARKING
                </Text>
                <View style={styles.iotIndicator}>
                  <Ionicons name="car" size={16} color={theme.error} />
                  <Text
                    style={[styles.iotIndicatorText, { color: theme.error }]}
                  >
                    Red Light ON
                  </Text>
                </View>
              </View>

              <View style={styles.overtimeGrid}>
                <View style={styles.overtimeItem}>
                  <Text style={[styles.overtimeValue, { color: theme.error }]}>
                    {overtimeMinutes.toString().padStart(2, "0")}:
                    {overtimeSecondsRemainder.toString().padStart(2, "0")}
                  </Text>
                  <Text
                    style={[styles.overtimeLabel, { color: theme.details }]}
                  >
                    Overtime Clock
                  </Text>
                </View>

                <View style={styles.overtimeItem}>
                  <Text style={[styles.overtimeValue, { color: theme.error }]}>
                    ${overtimeCost.toFixed(2)}
                  </Text>
                  <Text
                    style={[styles.overtimeLabel, { color: theme.details }]}
                  >
                    Overtime Cost
                  </Text>
                </View>

                <View style={styles.overtimeItem}>
                  <Text style={[styles.overtimeValue, { color: theme.error }]}>
                    ${totalCost.toFixed(2)}
                  </Text>
                  <Text
                    style={[styles.overtimeLabel, { color: theme.details }]}
                  >
                    Total Cost
                  </Text>
                </View>
              </View>

              <Text style={[styles.overtimeNote, { color: theme.details }]}>
                Red light detected - vehicle still parked • Charging
                $0.50/minute
              </Text>
            </View>
          );
        } else {
          // Car left - STOP OVERTIME COUNTING IMMEDIATELY and capture final values
          if (!overtimeData[bookingId]?.finalized) {
            console.log(
              `[MyBookingScreen] 🚗 Car left detected for booking ${bookingId} - STOPPING overtime counting`
            );

            // Calculate final overtime values from current time (STOP counting here)
            const currentTime = new Date();
            const endTime = new Date(booking.end_time);
            const secondsSinceExpiry = Math.floor(
              (currentTime - endTime) / 1000
            );
            const overtimeSeconds = Math.max(0, secondsSinceExpiry - 5); // Subtract grace period
            const finalOvertimeMinutes = Math.floor(overtimeSeconds / 60);
            const finalOvertimeCost = (overtimeSeconds / 60) * 0.5; // $0.50 per minute
            const baseCost = parseFloat(booking.total_cost || 0);
            const finalTotalCost = baseCost + finalOvertimeCost;

            console.log(
              `[MyBookingScreen] 🛑 OVERTIME COUNTING STOPPED - Final values:`,
              {
                bookingId,
                finalOvertimeMinutes,
                finalOvertimeCost: finalOvertimeCost.toFixed(2),
                finalTotalCost: finalTotalCost.toFixed(2),
                baseCost: baseCost.toFixed(2),
              }
            );

            // Store final values and mark as finalized (STOP counting)
            setOvertimeData((prev) => ({
              ...prev,
              [bookingId]: {
                ...prev[bookingId],
                overtime_minutes: finalOvertimeMinutes,
                overtime_cost: finalOvertimeCost,
                total_cost_with_overtime: finalTotalCost,
                is_overtime: true,
                finalized: true,
                lastCheck: Date.now(),
                preventRefresh: true, // Prevent auto-refresh
                carLeft: true, // Mark that car has left
                overtimeStopped: true, // Mark that overtime counting has stopped
              },
            }));

            // Sync with backend in background (don't wait for it)
            setTimeout(async () => {
              try {
                const finalOvertime = await bookingAPI.checkAndBillOvertime(
                  bookingId
                );
                console.log(
                  `[MyBookingScreen] Backend sync completed:`,
                  finalOvertime
                );
              } catch (e) {
                console.log(`Backend sync failed:`, e?.message || e);
              }
            }, 1000);
          }

          // Car left - show final overtime display with captured values (NO MORE COUNTING)
          const finalOvertime = overtimeData[bookingId];
          const finalMinutes = finalOvertime?.overtime_minutes || 0;
          const finalCost = finalOvertime?.overtime_cost || 0;
          const finalTotal = finalOvertime?.total_cost_with_overtime || 0;

          console.log(
            `[MyBookingScreen] 📊 DISPLAYING FINAL OVERTIME (COUNTING STOPPED):`,
            {
              bookingId,
              finalMinutes,
              finalCost,
              finalTotal,
              overtimeStopped: finalOvertime?.overtimeStopped,
            }
          );

          // Only show overtime bill if there's actual overtime (minutes > 0 or cost > 0)
          if (finalMinutes > 0 || finalCost > 0) {
            return (
              <View
                style={[
                  styles.overtimeContainer,
                  { backgroundColor: theme.card, borderColor: theme.success },
                ]}
              >
                <View style={styles.overtimeHeader}>
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={theme.success}
                  />
                  <Text
                    style={[styles.overtimeTitle, { color: theme.success }]}
                  >
                    YOUR OVERTIME BILL
                  </Text>
                </View>

                <View style={styles.overtimeGrid}>
                  <View style={styles.overtimeItem}>
                    <Text
                      style={[styles.overtimeValue, { color: theme.success }]}
                    >
                      {finalMinutes.toString().padStart(2, "0")}:00
                    </Text>
                    <Text
                      style={[styles.overtimeLabel, { color: theme.details }]}
                    >
                      Final Overtime
                    </Text>
                  </View>

                  <View style={styles.overtimeItem}>
                    <Text
                      style={[styles.overtimeValue, { color: theme.success }]}
                    >
                      {`$${finalCost.toFixed(2)}`}
                    </Text>
                    <Text
                      style={[styles.overtimeLabel, { color: theme.details }]}
                    >
                      Final Cost
                    </Text>
                  </View>

                  <View style={styles.overtimeItem}>
                    <Text
                      style={[styles.overtimeValue, { color: theme.accent }]}
                    >
                      {`$${finalTotal.toFixed(2)}`}
                    </Text>
                    <Text
                      style={[styles.overtimeLabel, { color: theme.details }]}
                    >
                      Total Paid
                    </Text>
                  </View>
                </View>

                <Text style={[styles.overtimeNote, { color: theme.details }]}>
                  Overtime counting stopped • Final values captured
                </Text>
              </View>
            );
          }

          // No overtime - return null to show receipt only
          return null;
        }
      }

      // Show overtime info if grace period has ended OR if a finalized overtime exists OR if vehicle left with overtime
      // But only if there's actual overtime (minutes > 0 or cost > 0)
      const hasActualOvertime =
        (overtime?.is_overtime &&
          (overtime?.overtime_minutes > 0 || overtime?.overtime_cost > 0)) ||
        (iotOvertime?.isActive &&
          (iotOvertime?.overtime_minutes > 0 ||
            iotOvertime?.overtime_cost > 0)) ||
        (overtimeData[bookingId]?.finalized &&
          (parseFloat(overtimeData[bookingId]?.overtime_minutes || 0) > 0 ||
            parseFloat(overtimeData[bookingId]?.overtime_cost || 0) > 0));

      if (hasActualOvertime) {
        return (
          <View
            style={[
              styles.overtimeContainer,
              { backgroundColor: theme.card, borderColor: theme.error },
            ]}
          >
            <View style={styles.overtimeHeader}>
              <Ionicons name="warning" size={24} color={theme.error} />
              <Text style={[styles.overtimeTitle, { color: theme.error }]}>
                OVERTIME PARKING
              </Text>
              {iotOvertime?.isActive && (
                <View style={styles.iotIndicator}>
                  <Ionicons name="wifi" size={16} color={theme.accent} />
                  <Text
                    style={[styles.iotIndicatorText, { color: theme.accent }]}
                  >
                    IoT Detected
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.overtimeGrid}>
              <View style={styles.overtimeItem}>
                <Text style={[styles.overtimeValue, { color: theme.error }]}>
                  {(() => {
                    // Always use final values from booking data
                    const currentBooking = bookings.find(
                      (b) => b && b.id === bookingId
                    );
                    const finalMinutes = parseInt(
                      (currentBooking?.overtime_minutes || 0).toString()
                    );

                    console.log(
                      `[Overtime Display] Booking ${bookingId}: Final minutes = ${finalMinutes}`
                    );

                    return finalMinutes;
                  })()}
                </Text>
                <Text style={[styles.overtimeLabel, { color: theme.details }]}>
                  Overtime Minutes
                </Text>
              </View>

              <View style={styles.overtimeItem}>
                <Text style={[styles.overtimeValue, { color: theme.error }]}>
                  $
                  {(() => {
                    // Always use final values from booking data
                    const currentBooking = bookings.find(
                      (b) => b && b.id === bookingId
                    );
                    const finalCost = parseFloat(
                      (currentBooking?.overtime_cost || 0).toString()
                    );

                    console.log(
                      `[Overtime Display] Booking ${bookingId}: Final cost = ${finalCost}`
                    );

                    return finalCost.toFixed(2);
                  })()}
                </Text>
                <Text style={[styles.overtimeLabel, { color: theme.details }]}>
                  Overtime Cost
                </Text>
              </View>

              <View style={styles.overtimeItem}>
                <Text style={[styles.overtimeValue, { color: theme.accent }]}>
                  $
                  {(() => {
                    // Always use final total cost from booking data
                    const currentBooking = bookings.find(
                      (b) => b && b.id === bookingId
                    );
                    const totalCost = parseFloat(
                      currentBooking?.total_cost || 0
                    );

                    console.log(
                      `[Overtime Display] Booking ${bookingId}: Final total = ${totalCost}`
                    );

                    return totalCost.toFixed(2);
                  })()}
                </Text>
                <Text style={[styles.overtimeLabel, { color: theme.details }]}>
                  Total Cost
                </Text>
              </View>
            </View>

            {/* Only show refresh button if overtime is not finalized */}
            {!overtimeData[bookingId]?.finalized &&
              !overtimeData[bookingId]?.preventRefresh && (
                <TouchableOpacity
                  style={[styles.refreshButton, { borderColor: theme.accent }]}
                  onPress={async () => {
                    try {
                      const overtimeResponse =
                        await bookingAPI.checkAndBillOvertime(bookingId);
                      setOvertimeData((prev) => ({
                        ...prev,
                        [bookingId]: overtimeResponse,
                      }));
                      Alert.alert("Updated", "Overtime billing refreshed!");
                    } catch (error) {
                      Alert.alert("Error", "Failed to update overtime");
                    }
                  }}
                >
                  <Ionicons name="refresh" size={16} color={theme.accent} />
                  <Text
                    style={[styles.refreshButtonText, { color: theme.accent }]}
                  >
                    Refresh Overtime
                  </Text>
                </TouchableOpacity>
              )}

            {/* Show final status when overtime is completed */}
            {overtimeData[bookingId]?.finalized && (
              <View style={styles.finalStatusContainer}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={theme.success}
                />
                <Text
                  style={[styles.finalStatusText, { color: theme.success }]}
                >
                  Overtime Finalized - Final values displayed
                </Text>
              </View>
            )}
          </View>
        );
      }
    }

    // Show normal countdown if time hasn't expired
    if (!time) return null;

    // Determine if we're in the last minute (red color)
    const totalSeconds =
      parseInt(time.hours) * 3600 +
      parseInt(time.minutes) * 60 +
      parseInt(time.seconds);
    const isLastMinute = totalSeconds <= 60;

    return (
      <View
        style={[
          styles.countdownContainer,
          {
            backgroundColor: theme.card,
            borderColor: isLastMinute ? theme.error : theme.border,
            borderWidth: isLastMinute ? 2 : 1,
          },
        ]}
      >
        <Text style={[styles.countdownLabel, { color: theme.details }]}>
          Time Remaining
        </Text>
        <View style={styles.countdownTimer}>
          <View style={styles.timeUnit}>
            <Text
              style={[
                styles.timeValue,
                {
                  color: isLastMinute ? theme.error : theme.text,
                  fontSize: isLastMinute ? 32 : 28,
                  fontWeight: isLastMinute ? "900" : "700",
                },
              ]}
            >
              {time.hours}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.details }]}>
              Hours
            </Text>
          </View>
          <Text
            style={[
              styles.timeSeparator,
              {
                color: isLastMinute ? theme.error : theme.text,
                fontSize: isLastMinute ? 32 : 28,
                fontWeight: isLastMinute ? "900" : "700",
              },
            ]}
          >
            :
          </Text>
          <View style={styles.timeUnit}>
            <Text
              style={[
                styles.timeValue,
                {
                  color: isLastMinute ? theme.error : theme.text,
                  fontSize: isLastMinute ? 32 : 28,
                  fontWeight: isLastMinute ? "900" : "700",
                },
              ]}
            >
              {time.minutes}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.details }]}>
              Minutes
            </Text>
          </View>
          <Text
            style={[
              styles.timeSeparator,
              {
                color: isLastMinute ? theme.error : theme.text,
                fontSize: isLastMinute ? 32 : 28,
                fontWeight: isLastMinute ? "900" : "700",
              },
            ]}
          >
            :
          </Text>
          <View style={styles.timeUnit}>
            <Text
              style={[
                styles.timeValue,
                {
                  color: isLastMinute ? theme.error : theme.text,
                  fontSize: isLastMinute ? 32 : 28,
                  fontWeight: isLastMinute ? "900" : "700",
                },
              ]}
            >
              {time.seconds}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.details }]}>
              Seconds
            </Text>
          </View>
        </View>
        {isLastMinute && (
          <Text style={[styles.warningText, { color: theme.error }]}>
            ⚠️ Less than 1 minute remaining!
          </Text>
        )}
      </View>
    );
  };

  // Render booking card
  const renderBookingCard = (booking, index) => {
    if (!booking || !booking.id) {
      return null;
    }

    return (
      <View
        key={booking.id}
        style={[
          styles.bookingCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {/* Card Header */}
        <View
          style={[styles.cardHeader, { borderBottomColor: theme.separator }]}
        >
          <View style={styles.bookingInfo}>
            <Text style={[styles.bookingId, { color: theme.text }]}>
              Booking #{index + 1}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(booking.status) },
              ]}
            >
              <Ionicons
                name={
                  booking.status === "active"
                    ? "time"
                    : booking.status === "completed"
                    ? "checkmark-circle"
                    : "close-circle"
                }
                size={16}
                color="#fff"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.statusText}>
                {booking.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.spotInfo}>
            <Ionicons name="location" size={20} color={theme.accent} />
            <Text style={[styles.spotNumber, { color: theme.accent }]}>
              {booking.parking_spot?.spot_number || "N/A"}
            </Text>
          </View>
        </View>

        {/* LED Status Display */}
        {booking.parking_spot?.spot_number &&
          ledStatus[booking.parking_spot.spot_number] && (
            <View
              style={[
                styles.ledStatusContainer,
                { backgroundColor: theme.card },
              ]}
            >
              <View style={styles.ledStatusHeader}>
                <Ionicons
                  name="bulb"
                  size={20}
                  color={
                    ledStatus[booking.parking_spot.spot_number].led_color ===
                    "red"
                      ? theme.error
                      : ledStatus[booking.parking_spot.spot_number]
                          .led_color === "blue"
                      ? theme.accent
                      : ledStatus[booking.parking_spot.spot_number]
                          .led_color === "green"
                      ? theme.success
                      : theme.details
                  }
                />
                <Text style={[styles.ledStatusTitle, { color: theme.text }]}>
                  Parking Status
                </Text>
              </View>
              <Text
                style={[
                  styles.ledStatusText,
                  {
                    color:
                      ledStatus[booking.parking_spot.spot_number].led_color ===
                      "red"
                        ? theme.error
                        : ledStatus[booking.parking_spot.spot_number]
                            .led_color === "blue"
                        ? theme.accent
                        : ledStatus[booking.parking_spot.spot_number]
                            .led_color === "green"
                        ? theme.success
                        : theme.details,
                  },
                ]}
              >
                {ledStatus[booking.parking_spot.spot_number].led_status === "on"
                  ? `${ledStatus[
                      booking.parking_spot.spot_number
                    ].led_color.toUpperCase()} - ${
                      ledStatus[booking.parking_spot.spot_number].led_message
                    }`
                  : "OFF - Unoccupied"}
              </Text>
              {/* Sensor subtext removed as requested */}
            </View>
          )}

        {/* Time Display (Countdown or Overtime) */}
        {booking &&
          booking.id &&
          booking.status === "active" &&
          renderTimeDisplay(booking.id)}

        {/* Booking Details */}
        {booking && booking.id && (
          <View style={styles.bookingDetails}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.details }]}>
                Vehicle:
              </Text>
              <Text style={[styles.detailValue, { color: theme.text }]}>
                {booking.vehicle_name || "N/A"}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.details }]}>
                Start Time:
              </Text>
              <Text style={[styles.detailValue, { color: theme.text }]}>
                {formatDateTime(booking.start_time)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.details }]}>
                End Time:
              </Text>
              <Text style={[styles.detailValue, { color: theme.text }]}>
                {formatDateTime(booking.end_time)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.details }]}>
                Duration:
              </Text>
              <Text style={[styles.detailValue, { color: theme.text }]}>
                {booking.duration_minutes} minutes
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.details }]}>
                Base Cost:
              </Text>
              <Text style={[styles.costValue, { color: theme.accent }]}>
                $
                {(
                  parseFloat(booking.total_cost || 0) -
                  parseFloat(booking.overtime_cost || 0)
                ).toFixed(2)}
              </Text>
            </View>

            {/* Overtime detail rows removed as requested */}

            {/* Total Cost */}
            <View
              style={[
                styles.detailRow,
                {
                  borderTopWidth: 1,
                  borderTopColor: theme.separator,
                  paddingTop: 10,
                  marginTop: 5,
                },
              ]}
            >
              <Text
                style={[
                  styles.detailLabel,
                  { color: theme.text, fontWeight: "bold" },
                ]}
              >
                Total Paid:
              </Text>
              <Text
                style={[
                  styles.costValue,
                  { color: theme.accent, fontWeight: "bold" },
                ]}
              >
                {(() => {
                  // Compute total as base cost + final overtime cost
                  const baseCost =
                    parseFloat(booking.total_cost || 0) -
                    parseFloat(booking.overtime_cost || 0);
                  const finalOvertimeCost = parseFloat(
                    (booking.overtime_cost || 0).toString()
                  );
                  const totalCost = baseCost + finalOvertimeCost;

                  console.log(
                    `[Total Cost] Booking ${booking.id}: base=${baseCost}, overtime=${finalOvertimeCost}, total=${totalCost}`
                  );

                  return `$${isNaN(totalCost) ? "0.00" : totalCost.toFixed(2)}`;
                })()}
              </Text>
            </View>

            {/* Real-time Overtime Information (show only Total Paid) */}
            {booking &&
              booking.id &&
              booking.status === "active" &&
              (() => {
                const time = timeLeft[booking.id];
                if (
                  time &&
                  time.hours === "00" &&
                  time.minutes === "00" &&
                  time.seconds === "00"
                ) {
                  const now = new Date().getTime();
                  const endTime = new Date(booking.end_time).getTime();
                  const secondsSinceExpiry = Math.floor((now - endTime) / 1000);

                  if (secondsSinceExpiry > 5) {
                    const currentBooking = bookings.find(
                      (b) => b && b.id === booking.id
                    );
                    const spotNumber =
                      currentBooking?.parking_spot?.spot_number;
                    let isCarStillParked = false;

                    if (iotSlots.length > 0 && spotNumber) {
                      const iotSlot = iotSlots.find(
                        (slot) => slot.spot_number === spotNumber
                      );
                      if (iotSlot) {
                        isCarStillParked = !iotSlot.is_available;
                      }
                    }

                    if (isCarStillParked) {
                      const overtimeSeconds = secondsSinceExpiry - 5;
                      const overtimeCost = (overtimeSeconds / 60) * 0.5;
                      const baseCost = parseFloat(
                        currentBooking?.total_cost || 0
                      );
                      const totalCost = baseCost + overtimeCost;

                      return (
                        <View style={styles.detailRow}>
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: theme.accent },
                            ]}
                          >
                            Total Paid:
                          </Text>
                          <Text
                            style={[
                              styles.overtimeDetailValue,
                              { color: theme.accent },
                            ]}
                          >
                            ${totalCost.toFixed(2)}
                          </Text>
                        </View>
                      );
                    }
                  }
                }
                return null;
              })()}
          </View>
        )}

        {/* Actions */}
        {booking && booking.id && booking.status === "active" && (
          <View
            style={[styles.cardActions, { borderTopColor: theme.separator }]}
          >
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.accent }]}
              onPress={() => handleExtendBooking(booking.id)}
            >
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={theme.accent}
              />
              <Text style={[styles.cancelButtonText, { color: theme.accent }]}>
                Extend Time
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.error }]}
              onPress={() => handleCancelBooking(booking.id)}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={theme.error}
              />
              <Text style={[styles.cancelButtonText, { color: theme.error }]}>
                Cancel Booking
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background[0] }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Current Bookings
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={() => fetchBookings(true)} // Force refresh
            style={styles.headerRefreshButton}
          >
            <Ionicons name="refresh" size={24} color={theme.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* No tabs needed - only active bookings */}

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: theme.text }]}>
              Loading bookings...
            </Text>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={theme.details} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No Bookings Found
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.details }]}>
              You haven't made any bookings yet.
            </Text>
            <TouchableOpacity
              style={[styles.bookNowButton, { backgroundColor: theme.accent }]}
              onPress={() => navigation.navigate("Home")}
            >
              <Text
                style={[styles.bookNowButtonText, { color: theme.buttonText }]}
              >
                Book a Parking Spot
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.bookingsList,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {bookings
              .filter((booking) => booking && booking.id)
              .map((booking, index) => renderBookingCard(booking, index))}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerRefreshButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 25,
    backgroundColor: "transparent",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerRefreshButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 25,
    backgroundColor: "transparent",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  summaryContainer: {
    padding: 20,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  overtimeSummary: {
    borderTopWidth: 1,
    paddingTop: 16,
  },
  overtimeSummaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  overtimeSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overtimeSummaryLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  overtimeSummaryValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  bookNowButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  bookNowButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  bookingsList: {
    gap: 16,
  },
  bookingCard: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingId: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  spotInfo: {
    alignItems: "center",
  },
  spotNumber: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  summaryContainer: {
    padding: 20,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  overtimeSummary: {
    borderTopWidth: 1,
    paddingTop: 16,
  },
  overtimeSummaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  overtimeSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overtimeSummaryLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  overtimeSummaryValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  countdownContainer: {
    borderRadius: 12,
    padding: 20,
    margin: 20,
    marginTop: 0,
    borderWidth: 1,
  },
  countdownLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  countdownTimer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  timeUnit: {
    alignItems: "center",
    minWidth: 60,
  },
  timeValue: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  timeLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  timeSeparator: {
    fontSize: 28,
    fontWeight: "700",
    marginHorizontal: 8,
  },
  warningText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  overtimeNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  overtimeContainer: {
    borderRadius: 12,
    padding: 20,
    margin: 20,
    marginTop: 0,
    borderWidth: 2,
  },
  overtimeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  overtimeTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  iotIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 12,
  },
  iotIndicatorText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  overtimeGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  overtimeItem: {
    alignItems: "center",
    flex: 1,
  },
  overtimeValue: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  overtimeLabel: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "center",
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  gracePeriodContainer: {
    borderRadius: 12,
    padding: 20,
    margin: 20,
    marginTop: 0,
    borderWidth: 2,
  },
  gracePeriodHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  gracePeriodTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  gracePeriodText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  gracePeriodSubtext: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
  completionContainer: {
    borderRadius: 12,
    padding: 20,
    margin: 20,
    marginTop: 0,
    borderWidth: 2,
  },
  completionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  completionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  completionText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  detectCarButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  detectCarButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  ledStatusContainer: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  ledStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  ledStatusTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  ledStatusText: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  ledStatusSubtext: {
    fontSize: 12,
    fontStyle: "italic",
  },
  bookingDetails: {
    gap: 16,
    padding: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
  },
  costValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  overtimeDivider: {
    height: 1,
    marginVertical: 8,
  },
  overtimeDetailValue: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  finalStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 20,
  },
  finalStatusText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
});

export default MyBookingScreen;
