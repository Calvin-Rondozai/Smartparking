import React, { useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import { bookingAPI, walletAPI, storage } from "../services/api";

const { width, height } = Dimensions.get("window");

const ReceiptScreen = ({ navigation, route }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [booking, setBooking] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [deduction, setDeduction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  const { bookingId, duration, departureTime } = route.params || {};

  useEffect(() => {
    if (!bookingId) {
      Alert.alert("Error", "No booking information available", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
      return;
    }

    completeAndLoadReceipt();
    animateIn();
  }, [bookingId]);

  const animateIn = () => {
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
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const completeAndLoadReceipt = async () => {
    try {
      setLoading(true);

      // Step 1: Complete the booking on backend (handles deduction)
      console.log("[ReceiptScreen] Completing booking:", bookingId);
      const completionResponse = await bookingAPI.completeActiveBooking(
        bookingId
      );
      console.log("[ReceiptScreen] Completion response:", completionResponse);

      // Store deduction information
      if (completionResponse?.deduction) {
        setDeduction({
          total_cost:
            completionResponse.deduction.total_cost ||
            completionResponse.total_cost ||
            0,
          amount_deducted: completionResponse.deduction.amount_deducted || 0,
          success: completionResponse.deduction.success || false,
        });
        console.log(
          `💳 Deduction: ${completionResponse.deduction.amount_deducted}`
        );
      }

      // Step 2: Fetch fresh wallet data
      console.log("[ReceiptScreen] Fetching fresh wallet data...");
      const walletData = await walletAPI.getWallet();
      const newBalance =
        typeof walletData?.balance === "number" ? walletData.balance : 0;
      setWallet({ balance: newBalance });
      console.log(`💰 Wallet Balance: $${newBalance}`);

      // Step 3: Fetch booking details
      console.log("[ReceiptScreen] Fetching booking details...");
      const bookingsResponse = await bookingAPI.getBookings();
      const foundBooking = bookingsResponse.find((b) => b.id === bookingId);

      if (!foundBooking) {
        throw new Error("Booking not found");
      }

      // Use backend total_cost if available, otherwise use completion response
      if (completionResponse?.total_cost !== undefined) {
        foundBooking.total_cost = completionResponse.total_cost;
        console.log(
          `[ReceiptScreen] Total cost: $${completionResponse.total_cost}`
        );
      }

      setBooking(foundBooking);
      console.log("[ReceiptScreen] Receipt loaded successfully");

      // Step 4: Fallback deduction if backend didn't deduct
      try {
        let total =
          completionResponse?.deduction?.total_cost ??
          completionResponse?.total_cost;
        const amountDeducted = completionResponse?.deduction?.amount_deducted;

        // Compute locally if needed ($1 per 30 seconds)
        if (
          (typeof total !== "number" || total <= 0) &&
          (!amountDeducted || amountDeducted <= 0)
        ) {
          const pricePerSecond = 1 / 30;
          let elapsedSeconds = 0;
          if (typeof duration === "number" && duration > 0) {
            elapsedSeconds = duration;
          } else if (completionResponse?.elapsed_seconds) {
            elapsedSeconds = completionResponse.elapsed_seconds;
          } else if (foundBooking?.timer_started) {
            const startTime = new Date(foundBooking.timer_started).getTime();
            const endTime = foundBooking.completed_at
              ? new Date(foundBooking.completed_at).getTime()
              : new Date().getTime();
            elapsedSeconds = Math.max(0, (endTime - startTime) / 1000);
          }
          total = Math.round(pricePerSecond * elapsedSeconds * 100) / 100;
        }

        if (
          typeof total === "number" &&
          total > 0 &&
          (!amountDeducted || amountDeducted <= 0)
        ) {
          console.log(
            `[ReceiptScreen] Backend did not deduct. Charging wallet manually: $${total}`
          );
          const charge = await walletAPI.charge({
            amount: total,
            bookingId,
            note: "Receipt fallback charge",
          });
          if (typeof charge?.balance === "number") {
            setWallet({ balance: charge.balance });
            console.log(
              `💳 Fallback charge success. New balance: $${charge.balance}`
            );
          }
          // Reflect deduction in UI and booking for accurate total display
          setDeduction({
            total_cost: total,
            amount_deducted: total,
            success: !!charge?.success,
          });
          setBooking({ ...foundBooking, total_cost: total });
          // Save snapshot for History
          try {
            const startTime = foundBooking?.timer_started
              ? new Date(foundBooking.timer_started).getTime()
              : foundBooking?.start_time
              ? new Date(foundBooking.start_time).getTime()
              : null;
            const endTime =
              foundBooking?.completed_at || foundBooking?.end_time
                ? new Date(
                    foundBooking.completed_at || foundBooking.end_time
                  ).getTime()
                : Date.now();
            const elapsedSeconds = startTime
              ? Math.max(0, Math.floor((endTime - startTime) / 1000))
              : 0;
            await storage.saveBookingSnapshot(bookingId, {
              total_cost: total,
              duration_seconds: elapsedSeconds,
            });
          } catch (_) {}
        }
      } catch (e) {
        console.log(
          "[ReceiptScreen] Fallback wallet charge failed",
          e?.message || e
        );
      }

      // Save snapshot from completion response if we have enough info
      try {
        const startTime = foundBooking?.timer_started
          ? new Date(foundBooking.timer_started).getTime()
          : foundBooking?.start_time
          ? new Date(foundBooking.start_time).getTime()
          : null;
        const endTime =
          foundBooking?.completed_at || foundBooking?.end_time
            ? new Date(
                foundBooking.completed_at || foundBooking.end_time
              ).getTime()
            : Date.now();
        const elapsedSeconds = startTime
          ? Math.max(0, Math.floor((endTime - startTime) / 1000))
          : 0;
        const finalTotal =
          (typeof foundBooking.total_cost === "number"
            ? foundBooking.total_cost
            : undefined) ??
          completionResponse?.deduction?.total_cost ??
          completionResponse?.total_cost ??
          null;
        if (finalTotal !== null) {
          await storage.saveBookingSnapshot(bookingId, {
            total_cost: finalTotal,
            duration_seconds: elapsedSeconds,
          });
        }
      } catch (_) {}
    } catch (error) {
      console.error("[ReceiptScreen] Error loading receipt:", error);

      // Try to fetch wallet and booking data even if completion failed
      try {
        const walletData = await walletAPI.getWallet();
        setWallet({ balance: walletData?.balance || 0 });

        const bookingsResponse = await bookingAPI.getBookings();
        const foundBooking = bookingsResponse.find((b) => b.id === bookingId);
        if (foundBooking) {
          setBooking(foundBooking);
        }
      } catch (fallbackError) {
        console.error("[ReceiptScreen] Fallback fetch failed:", fallbackError);
        Alert.alert("Error", "Failed to load receipt details", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const calculateParkingDuration = () => {
    // Use captured duration from route params if available
    if (duration && duration > 0) {
      return formatDuration(duration);
    }

    // Fallback: calculate from booking data
    if (!booking?.timer_started) return "N/A";

    const startTime = new Date(booking.timer_started).getTime();
    const endTime = booking.completed_at
      ? new Date(booking.completed_at).getTime()
      : departureTime
      ? new Date(departureTime).getTime()
      : new Date().getTime();

    const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
    return formatDuration(elapsedSeconds);
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getDepartureTime = () => {
    // Use captured departure time from route params
    if (departureTime) {
      return formatDateTime(departureTime);
    }

    // Use booking's completed_at timestamp
    if (booking?.completed_at) {
      return formatDateTime(booking.completed_at);
    }

    // Fallback to current time if timer was started
    if (booking?.timer_started) {
      return formatDateTime(new Date());
    }

    return "N/A";
  };

  const calculateTotalCost = () => {
    // Priority 1: Use deduction total if available (most reliable after fallback)
    if (deduction?.total_cost !== undefined && deduction.total_cost !== null) {
      return Number(deduction.total_cost);
    }

    // Priority 2: Use backend-calculated total_cost
    if (booking?.total_cost !== undefined && booking.total_cost !== null) {
      return Number(booking.total_cost);
    }

    // Priority 3: Calculate locally ($1 per 30 seconds)
    const pricePerSecond = 1 / 30;
    let elapsedSeconds = 0;

    if (duration && duration > 0) {
      elapsedSeconds = duration;
    } else if (booking?.timer_started) {
      const startTime = new Date(booking.timer_started).getTime();
      const endTime = booking.completed_at
        ? new Date(booking.completed_at).getTime()
        : departureTime
        ? new Date(departureTime).getTime()
        : new Date().getTime();
      elapsedSeconds = Math.max(0, (endTime - startTime) / 1000);
    }

    const totalCost = pricePerSecond * elapsedSeconds;
    return Math.round(totalCost * 100) / 100;
  };

  const handleShare = async () => {
    try {
      const totalCost = calculateTotalCost();
      const receiptText = `
Smart Parking Receipt
====================
Booking #${booking.id}
Slot: ${booking.parking_spot?.spot_number || "N/A"}
Vehicle: ${booking.vehicle_name || "N/A"}
From: ${formatDateTime(booking.timer_started || booking.start_time)}
To: ${getDepartureTime()}
Duration: ${calculateParkingDuration()}
Total Cost: $${totalCost.toFixed(2)}
Balance: $${wallet.balance.toFixed(2)}
====================
Thank you for using Smart Parking!
      `;

      await Share.share({
        message: receiptText,
        title: "Parking Receipt",
      });
    } catch (error) {
      console.error("Error sharing receipt:", error);
      Alert.alert("Error", "Failed to share receipt");
    }
  };

  const handleGoHome = () => {
    navigation.navigate("Main", { screen: "Home" });
  };

  const handleViewHistory = () => {
    navigation.navigate("Main", {
      screen: "History",
      params: { refresh: true },
    });
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Loading receipt...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={theme.error} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>
            Receipt Not Available
          </Text>
          <Text style={[styles.errorSubtitle, { color: theme.details }]}>
            Unable to load booking details
          </Text>
          <TouchableOpacity
            style={[styles.homeButton, { backgroundColor: theme.accent }]}
            onPress={handleGoHome}
          >
            <Text style={[styles.homeButtonText, { color: theme.buttonText }]}>
              Go Home
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalCost = calculateTotalCost();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
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
          Parking Receipt
        </Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Ionicons name="share-outline" size={24} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.receiptContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >
          {/* Receipt Header */}
          <View
            style={[
              styles.receiptHeader,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.receiptLogo}>
              <Ionicons name="car" size={32} color={theme.accent} />
            </View>
            <Text style={[styles.receiptTitle, { color: theme.text }]}>
              Smart Parking
            </Text>
            <Text style={[styles.receiptSubtitle, { color: theme.details }]}>
              Parking Receipt
            </Text>
            <View
              style={[styles.receiptNumber, { backgroundColor: theme.accent }]}
            >
              <Text
                style={[styles.receiptNumberText, { color: theme.buttonText }]}
              >
                #{booking.id}
              </Text>
            </View>
          </View>

          {/* Receipt Content */}
          <View
            style={[
              styles.receiptContent,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {/* Transaction Details */}
            <View style={styles.receiptSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Transaction Details
              </Text>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  Booking ID:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {booking.id}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  Date & Time:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {formatDateTime(booking.completed_at || new Date())}
                </Text>
              </View>
            </View>

            {/* Parking Information */}
            <View style={styles.receiptSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Parking Information
              </Text>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  Parking Slot:
                </Text>
                <View
                  style={[styles.slotBadge, { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.slotText, { color: theme.buttonText }]}>
                    {booking.parking_spot?.spot_number || "N/A"}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  License Plate:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {booking.vehicle_name || "N/A"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  From:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {formatDateTime(booking.timer_started || booking.start_time)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  To:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {getDepartureTime()}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  Duration:
                </Text>
                <Text style={[styles.durationValue, { color: theme.accent }]}>
                  {calculateParkingDuration()}
                </Text>
              </View>
            </View>

            {/* Cost Breakdown */}
            <View
              style={[
                styles.costSection,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: theme.text }]}>
                  Total Cost:
                </Text>
                <Text style={[styles.costValue, { color: theme.accent }]}>
                  ${totalCost.toFixed(2)}
                </Text>
              </View>

              {/* Show deduction if it occurred */}
              {deduction?.amount_deducted > 0 && (
                <View style={[styles.costRow, { marginTop: 12 }]}>
                  <Text style={[styles.costLabel, { color: theme.text }]}>
                    Amount Deducted:
                  </Text>
                  <Text style={[styles.costValue, { color: theme.error }]}>
                    -${Number(deduction.amount_deducted).toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={[styles.costRow, { marginTop: 12 }]}>
                <Text style={[styles.costLabel, { color: theme.text }]}>
                  Remaining Balance:
                </Text>
                <Text style={[styles.costValue, { color: theme.text }]}>
                  ${wallet.balance.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Status */}
            <View style={styles.receiptSection}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.details }]}>
                  Status:
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: theme.success },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={[styles.statusText, { color: "#fff" }]}>
                    COMPLETED
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Thank You Message */}
          <View
            style={[
              styles.thankYouSection,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons name="heart" size={24} color={theme.accent} />
            <Text style={[styles.thankYouText, { color: theme.text }]}>
              Thank you for using Smart Parking!
            </Text>
            <Text style={[styles.thankYouSubtext, { color: theme.details }]}>
              We hope you had a great parking experience.
            </Text>
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
            onPress={handleViewHistory}
          >
            <Ionicons name="time-outline" size={20} color={theme.accent} />
            <Text style={[styles.actionButtonText, { color: theme.accent }]}>
              View History
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: theme.accent },
            ]}
            onPress={handleGoHome}
          >
            <Ionicons name="home-outline" size={20} color={theme.buttonText} />
            <Text
              style={[
                styles.actionButtonText,
                styles.primaryButtonText,
                { color: theme.buttonText },
              ]}
            >
              Book Again
            </Text>
          </TouchableOpacity>
        </View>
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
  shareButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  homeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  receiptContainer: {
    marginBottom: 20,
  },
  receiptHeader: {
    alignItems: "center",
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  receiptLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(52, 152, 219, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  receiptTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  receiptSubtitle: {
    fontSize: 16,
    marginBottom: 16,
  },
  receiptNumber: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  receiptNumberText: {
    fontSize: 14,
    fontWeight: "600",
  },
  receiptContent: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  receiptSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
  },
  slotBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  slotText: {
    fontSize: 14,
    fontWeight: "600",
  },
  durationValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  costSection: {
    padding: 20,
    borderWidth: 1,
    borderRadius: 12,
    margin: 20,
    marginTop: 0,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  costLabel: {
    fontSize: 18,
    fontWeight: "600",
  },
  costValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  thankYouSection: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  thankYouText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  thankYouSubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  primaryButton: {
    borderWidth: 0,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  primaryButtonText: {
    color: "#fff",
  },
});

export default ReceiptScreen;
