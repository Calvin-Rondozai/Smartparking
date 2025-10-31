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
import { bookingAPI, authAPI } from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import iotService from "../services/iotApi";
import CarDeparturePopup from "../components/CarDeparturePopup";
import notificationService from "../services/notificationService";
import voiceFeedbackService from "../services/voiceFeedbackService";

const { width } = Dimensions.get("window");

const MyBookingScreen = ({ navigation }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timeLeft, setTimeLeft] = useState({});
  const [pausedTimers, setPausedTimers] = useState({}); // bookingId => true when we should freeze the UI timer
  const [autoActions, setAutoActions] = useState({});
  const [ledStatus, setLedStatus] = useState({});
  const [iotSlots, setIotSlots] = useState([]);
  const [iotStatus, setIotStatus] = useState({ online: false });
  const [departurePopup, setDeparturePopup] = useState({
    visible: false,
    bookingId: null,
    duration: 0,
    departureTime: null,
  });

  console.log("📱 MyBookingScreen loaded");

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  // Fetch IoT data
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

      setBookings(activeBookings);

      // Fetch IoT data
      fetchIoTData().catch((error) =>
        console.error("Error fetching IoT data:", error)
      );
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

  // Simple timer effect - count up from timer_started, freeze when booking completed or paused locally
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const newTimeLeft = {};

      for (const booking of bookings) {
        if (booking && booking.id && booking.status === "active") {
          // If this booking's timer is paused (e.g., car left), keep last shown time
          if (pausedTimers[booking.id] && timeLeft[booking.id]) {
            newTimeLeft[booking.id] = timeLeft[booking.id];
            continue;
          }
          // Only show timer if booking has started (timer_started exists)
          if (booking.timer_started) {
            const timerStartTime = new Date(booking.timer_started).getTime();
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
            // Timer not started yet
            newTimeLeft[booking.id] = {
              hours: "00",
              minutes: "00",
              seconds: "00",
            };
          }
        } else if (booking && booking.id && booking.status === "completed") {
          // Booking completed - calculate final duration and freeze it
          if (booking.timer_started && booking.completed_at) {
            const startTime = new Date(booking.timer_started).getTime();
            const endTime = new Date(booking.completed_at).getTime();
            const finalDuration = endTime - startTime;

            const hours = Math.floor(finalDuration / (1000 * 60 * 60));
            const minutes = Math.floor(
              (finalDuration % (1000 * 60 * 60)) / (1000 * 60)
            );
            const seconds = Math.floor((finalDuration % (1000 * 60)) / 1000);

            newTimeLeft[booking.id] = {
              hours: hours.toString().padStart(2, "0"),
              minutes: minutes.toString().padStart(2, "0"),
              seconds: seconds.toString().padStart(2, "0"),
            };
          } else if (timeLeft[booking.id]) {
            // Keep the last known time if we have it
            newTimeLeft[booking.id] = timeLeft[booking.id];
          } else {
            newTimeLeft[booking.id] = {
              hours: "00",
              minutes: "00",
              seconds: "00",
            };
          }
        }
      }

      setTimeLeft(newTimeLeft);
    }, 1000);

    return () => clearInterval(timer);
  }, [bookings, pausedTimers]);

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

  // Auto-refresh IoT data every 5 seconds and monitor for car departure
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIoTData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Monitor IoT status to detect when car leaves and auto-complete booking
  useEffect(() => {
    if (!iotSlots || iotSlots.length === 0) return;

    bookings.forEach((booking) => {
      if (
        !booking ||
        !booking.id ||
        booking.status !== "active" ||
        !booking.timer_started
      )
        return;

      const spotNumber = booking.parking_spot?.spot_number;
      if (!spotNumber) return;

      const iotSlot = iotSlots.find((s) => s.spot_number === spotNumber);
      if (!iotSlot) return;

      // Check if slot became available (car left)
      const isCurrentlyAvailable = !!iotSlot.is_available;

      if (isCurrentlyAvailable && !autoActions[`departure_${booking.id}`]) {
        console.log(
          `[MyBookingScreen] 🚗 Car departure detected for booking ${booking.id} - slot ${spotNumber} is now available`
        );

        // Mark departure action to prevent duplicate calls
        setAutoActions((prev) => ({
          ...prev,
          [`departure_${booking.id}`]: true,
        }));

        // Calculate parking duration in seconds for popup
        let parkingDurationSeconds = 0;
        let frozenDisplay = null;
        if (booking.timer_started) {
          const startTime = new Date(booking.timer_started).getTime();
          const endTime = new Date().getTime();
          const elapsedMs = endTime - startTime;
          parkingDurationSeconds = Math.floor(elapsedMs / 1000);

          const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
          const minutes = Math.floor(
            (elapsedMs % (1000 * 60 * 60)) / (1000 * 60)
          );
          const seconds = Math.floor((elapsedMs % (1000 * 60)) / 1000);

          // Prepare frozen display object
          frozenDisplay = {
            hours: hours.toString().padStart(2, "0"),
            minutes: minutes.toString().padStart(2, "0"),
            seconds: seconds.toString().padStart(2, "0"),
          };
        }

        // Show departure popup with parking duration
        setDeparturePopup({
          visible: true,
          bookingId: booking.id,
          duration: parkingDurationSeconds,
          departureTime: new Date(),
        });

        // Voice feedback when car leaves the slot
        try {
          const spotName =
            booking?.parking_spot?.spot_number ||
            booking?.parking_spot?.name ||
            "your slot";
          const totalCost = booking?.total_cost || 0;
          const durationMinutes = Math.floor(parkingDurationSeconds / 60);

          // Wrap in async function to handle await
          (async () => {
            try {
              await voiceFeedbackService.onCarLeft(
                spotName,
                totalCost,
                durationMinutes
              );
            } catch (error) {
              console.log("[MyBookingScreen] Voice feedback error:", error);
            }
          })();
        } catch (error) {
          console.log("[MyBookingScreen] Voice feedback error:", error);
        }

        // Fire-and-forget local notification for departure with duration
        try {
          notificationService.scheduleDepartureDetected(
            booking,
            parkingDurationSeconds
          );
        } catch (_) {}

        // Don't auto-refresh to prevent booking from disappearing
        // The timer will freeze at current duration
        if (frozenDisplay) {
          setPausedTimers((prev) => ({ ...prev, [booking.id]: true }));
          setTimeLeft((prev) => ({ ...prev, [booking.id]: frozenDisplay }));
        }
      }
    });
  }, [iotSlots, bookings, autoActions]);

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
    await fetchBookings(true);
    setRefreshing(false);
  };

  // Handle departure popup actions
  const handleDeparturePopupClose = () => {
    setDeparturePopup({
      visible: false,
      bookingId: null,
      duration: 0,
      departureTime: null,
    });
  };

  const handleViewReceipt = () => {
    handleDeparturePopupClose();
    navigation.navigate("Receipt", {
      bookingId: departurePopup.bookingId,
      duration: departurePopup.duration,
      departureTime: departurePopup.departureTime,
    });
  };

  const handleStayHere = () => {
    handleDeparturePopupClose();
    // User chooses to stay - no action needed
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
              console.log(`[MyBookingScreen] Cancelling booking ${bookingId}`);
              const response = await bookingAPI.cancelBooking(bookingId);
              console.log(`[MyBookingScreen] Cancel response:`, response);
              Alert.alert("Success", "Booking cancelled successfully");
              await fetchBookings(true); // Force refresh
            } catch (error) {
              console.error("Error cancelling booking:", error);
              Alert.alert(
                "Error",
                `Failed to cancel booking: ${error.message || error}`
              );
            }
          },
        },
      ]
    );
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
        await fetchBookings(true);
      } else {
        Alert.alert(
          "Timer Started!",
          "Car detected! Your parking timer has started.",
          [{ text: "OK" }]
        );
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

  // Render time display
  const renderTimeDisplay = (bookingId) => {
    const time = timeLeft[bookingId];
    const booking = bookings.find((b) => b && b.id === bookingId);
    if (!booking) return null;

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

              // Voice feedback when car is detected as parked
              try {
                const spotName =
                  booking?.parking_spot?.spot_number ||
                  booking?.parking_spot?.name ||
                  "your slot";

                // Wrap in async function to handle await
                (async () => {
                  try {
                    await voiceFeedbackService.onCarParked(spotName);
                  } catch (error) {
                    console.log(
                      "[MyBookingScreen] Voice feedback error:",
                      error
                    );
                  }
                })();
              } catch (error) {
                console.log("[MyBookingScreen] Voice feedback error:", error);
              }

              (async () => {
                try {
                  await bookingAPI.detectCarParked(bookingId);
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
            setBookings((prev) =>
              prev.map((b) =>
                b.id === bookingId
                  ? { ...b, timer_started: new Date().toISOString() }
                  : b
              )
            );

            // Voice feedback when car is detected as parked
            try {
              const spotName =
                booking?.parking_spot?.spot_number ||
                booking?.parking_spot?.name ||
                "your slot";

              // Wrap in async function to handle await
              (async () => {
                try {
                  await voiceFeedbackService.onCarParked(spotName);
                } catch (error) {
                  console.log("[MyBookingScreen] Voice feedback error:", error);
                }
              })();
            } catch (error) {
              console.log("[MyBookingScreen] Voice feedback error:", error);
            }

            (async () => {
              try {
                await bookingAPI.detectCarParked(bookingId);
              } catch (e) {
                console.log(
                  "Auto-start on grace expiry failed:",
                  e?.message || e
                );
              }
            })();
            return null;
          } else if (!isOccupied && !autoActions[`cancel_${bookingId}`]) {
            // Car is not parked - auto-cancel
            setAutoActions((prev) => ({
              ...prev,
              [`cancel_${bookingId}`]: true,
            }));
            (async () => {
              try {
                await bookingAPI.cancelBooking(bookingId);

                // Voice feedback when booking is cancelled due to grace period failure
                try {
                  const spotName =
                    booking?.parking_spot?.spot_number ||
                    booking?.parking_spot?.name ||
                    "your slot";

                  // Wrap in async function to handle await
                  (async () => {
                    try {
                      await voiceFeedbackService.onBookingCancelled(spotName);
                    } catch (error) {
                      console.log(
                        "[MyBookingScreen] Voice feedback error:",
                        error
                      );
                    }
                  })();
                } catch (error) {
                  console.log("[MyBookingScreen] Voice feedback error:", error);
                }

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

    // Show normal count-up timer (active or completed)
    if (!time) return null;

    const isCompleted = booking.status === "completed";

    return (
      <View
        style={[
          styles.countdownContainer,
          {
            backgroundColor: theme.card,
            borderColor: isCompleted ? theme.success : theme.border,
            borderWidth: isCompleted ? 2 : 1,
          },
        ]}
      >
        <Text style={[styles.countdownLabel, { color: theme.details }]}>
          {isCompleted ? "Final Parking Duration" : "Parking Duration"}
        </Text>
        <View style={styles.countdownTimer}>
          <View style={styles.timeUnit}>
            <Text style={[styles.timeValue, { color: theme.text }]}>
              {time.hours}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.details }]}>
              Hours
            </Text>
          </View>
          <Text style={[styles.timeSeparator, { color: theme.text }]}>:</Text>
          <View style={styles.timeUnit}>
            <Text style={[styles.timeValue, { color: theme.text }]}>
              {time.minutes}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.details }]}>
              Minutes
            </Text>
          </View>
          <Text style={[styles.timeSeparator, { color: theme.text }]}>:</Text>
          <View style={styles.timeUnit}>
            <Text style={[styles.timeValue, { color: theme.text }]}>
              {time.seconds}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.details }]}>
              Seconds
            </Text>
          </View>
        </View>
        <Text style={[styles.timerNote, { color: theme.details }]}>
          {isCompleted
            ? "⏸️ Timer frozen - Session completed"
            : "Timer stops automatically when you leave"}
        </Text>
        {isCompleted && (
          <View
            style={[styles.frozenIndicator, { backgroundColor: theme.success }]}
          >
            <Ionicons name="pause-circle" size={16} color="#fff" />
            <Text style={[styles.frozenText, { color: "#fff" }]}>FROZEN</Text>
          </View>
        )}
      </View>
    );
  };

  // Render booking card
  const renderBookingCard = (booking, index) => {
    if (!booking || !booking.id) return null;

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
            <View style={styles.statusRow}>
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

              {/* Parking Status Tag */}
              {booking.status === "active" && (
                <View
                  style={[
                    styles.parkingStatusBadge,
                    {
                      backgroundColor: booking.timer_started
                        ? theme.success
                        : theme.warning,
                      borderColor: booking.timer_started
                        ? theme.success
                        : theme.warning,
                    },
                  ]}
                >
                  <Ionicons
                    name={booking.timer_started ? "car" : "car-outline"}
                    size={14}
                    color="#fff"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.parkingStatusText}>
                    {booking.timer_started ? "PARKED" : "PARKING..."}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.spotInfo}>
            <Ionicons name="location" size={20} color={theme.accent} />
            <Text style={[styles.spotNumber, { color: theme.accent }]}>
              {booking.parking_spot?.spot_number || "N/A"}
            </Text>
          </View>
        </View>

        {/* Time Display */}
        {booking &&
          booking.id &&
          booking.status === "active" &&
          renderTimeDisplay(booking.id)}

        {/* Completion Banner */}
        {booking && booking.id && booking.status === "completed" && (
          <View
            style={[
              styles.completionBanner,
              { backgroundColor: theme.success, borderColor: theme.success },
            ]}
          >
            <View style={styles.completionHeader}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={[styles.completionTitle, { color: "#fff" }]}>
                PARKING SESSION COMPLETED
              </Text>
            </View>
            <Text style={[styles.completionText, { color: "#fff" }]}>
              Final Bill: ${parseFloat(booking.total_cost || 0).toFixed(2)}
            </Text>
            <Text style={[styles.completionSubtext, { color: "#fff" }]}>
              Thank you for using Smart Parking!
            </Text>
          </View>
        )}

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

            {booking.timer_started && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  Timer Started:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {formatDateTime(booking.timer_started)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        {booking && booking.id && booking.status === "active" && (
          <View
            style={[styles.cardActions, { borderTopColor: theme.separator }]}
          >
            <TouchableOpacity
              style={[
                styles.cancelButton,
                {
                  borderColor: !!booking.timer_started
                    ? theme.disabled
                    : theme.error,
                  opacity: !!booking.timer_started ? 0.5 : 1,
                },
              ]}
              onPress={() => {
                if (!!booking.timer_started) {
                  Alert.alert(
                    "Cannot Cancel",
                    "You cannot cancel a booking while your car is parked."
                  );
                  return;
                }
                handleCancelBooking(booking.id);
              }}
              disabled={!!booking.timer_started}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={!!booking.timer_started ? theme.disabled : theme.error}
              />
              <Text
                style={[
                  styles.cancelButtonText,
                  {
                    color: !!booking.timer_started
                      ? theme.disabled
                      : theme.error,
                  },
                ]}
              >
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
            onPress={() => fetchBookings(true)}
            style={styles.headerRefreshButton}
          >
            <Ionicons name="refresh" size={24} color={theme.accent} />
          </TouchableOpacity>
        </View>
      </View>

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

      {/* Car Departure Popup */}
      <CarDeparturePopup
        visible={departurePopup.visible}
        onClose={handleDeparturePopupClose}
        onViewReceipt={handleViewReceipt}
        onStayHere={handleStayHere}
        parkingDuration={departurePopup.duration}
        departureTime={departurePopup.departureTime}
      />
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
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  parkingStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  parkingStatusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  completionBanner: {
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
    marginBottom: 12,
  },
  completionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  completionText: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  completionSubtext: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
  spotInfo: {
    alignItems: "center",
  },
  spotNumber: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
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
  timerNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  frozenIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  frozenText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
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
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    paddingHorizontal: 24,
    backgroundColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    maxWidth: 200,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 12,
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
});

export default MyBookingScreen;
