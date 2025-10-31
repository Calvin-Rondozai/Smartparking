import React, { useContext, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  StatusBar,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import { bookingAPI, storage, parkingAPI } from "../services/api";
import notificationService from "../services/notificationService";
import voiceFeedbackService from "../services/voiceFeedbackService";

const BookingScreen = ({ navigation, route }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const { slot } = route.params || {};

  const [form, setForm] = useState({
    name: "",
    numberPlate: "",
    carName: "",
  });
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Load user data and auto-fill form
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const authData = await storage.getAuthData();
      if (authData && authData.user) {
        setUserData(authData.user);

        // Auto-fill form with user data (editable)
        setForm({
          name:
            authData.user.full_name ||
            authData.user.first_name ||
            authData.user.username ||
            "",
          numberPlate:
            authData.user.license_plate || authData.user.address || "",
          carName: authData.user.car_name || authData.user.address || "",
        });
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const handleChange = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  const calculateTotalCost = () => {
    if (!form.duration || !slot) return 0;

    // Calculate cost based on $1 per 30 seconds
    const durationInSeconds = parseFloat(form.duration);
    const pricePerSecond = 1 / 30; // $1 per 30 seconds
    const totalCost = pricePerSecond * durationInSeconds;

    return Math.round(totalCost * 100) / 100;
  };

  const handleConfirm = async () => {
    setLoading(true);

    try {
      // Map IoT slot (by spot_number/name) to backend ParkingSpot.id
      let backendSpotId = slot?.id;
      try {
        const spots = await parkingAPI.getParkingSpots();
        const match = (spots || []).find((s) => {
          const num = s.spot_number || s.name || s.slot || s.spot;
          return (
            String(num) === String(slot?.name) ||
            String(num) === String(slot?.spot_number) ||
            String(s.id) === String(slot?.id)
          );
        });
        if (match) backendSpotId = match.id;
      } catch (e) {
        // proceed with provided id
      }

      if (!backendSpotId) {
        Alert.alert(
          "Booking Failed",
          "Could not find the selected parking slot. Please refresh and try again."
        );
        return;
      }

      const now = new Date();
      const bookingData = {
        parking_spot_id: backendSpotId,
        start_time: now.toISOString(),
        end_time: now.toISOString(), // backend ignores and sets window
        duration_minutes: 0,
        vehicle_name: form.carName,
      };

      const response = await bookingAPI.createBooking(bookingData);

      // Voice feedback for successful booking
      try {
        const spotName = slot.name;

        // Wrap in async function to handle await
        (async () => {
          try {
            await voiceFeedbackService.onSlotBooked(spotName, 0); // Duration will be set by backend
          } catch (error) {
            console.log("[BookingScreen] Voice feedback error:", error);
          }
        })();
      } catch (error) {
        console.log("[BookingScreen] Voice feedback error:", error);
      }

      Alert.alert(
        "Booking Confirmed!",
        `Your parking spot at ${slot.name} is confirmed. Billing will start when your car is detected.`
      );

      try {
        await notificationService.initialize();
        await notificationService.scheduleBookingConfirmation(response);
      } catch (_) {}

      try {
        navigation.navigate("Main", { screen: "Bookings" });
      } catch {
        navigation.navigate("Main");
      }
    } catch (error) {
      console.error("Booking error:", error);
      const msg =
        error?.response?.data?.non_field_errors ||
        error?.response?.data?.parking_spot_id ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to create booking. Please try again.";
      Alert.alert(
        "Booking Failed",
        Array.isArray(msg) ? msg.join("\n") : String(msg)
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Enable confirm as long as a slot is selected; user details are optional
  const isFormComplete = !!(slot && slot.id);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "#0A0A0A" : "#F7F9FC",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 15,
      backgroundColor: isDark ? "#0A0A0A" : "#FFFFFF",
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#333" : "#E5E7EB",
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? "#1F1F1F" : "#F5F7FA",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 15,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.text,
    },
    content: {
      flex: 1,
      padding: 20,
      paddingBottom: 100, // Add extra padding to ensure button is visible
    },
    slotInfo: {
      backgroundColor: isDark ? "#111111" : "#FFFFFF",
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? "#333" : "#E5E7EB",
    },
    slotName: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.text,
      marginBottom: 10,
    },
    slotDetails: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    slotPrice: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.accent,
    },
    slotStatus: {
      backgroundColor: "#10B981",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    slotStatusText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "600",
    },
    formSection: {
      backgroundColor: isDark ? "#111111" : "#FFFFFF",
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? "#333" : "#E5E7EB",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.text,
      marginBottom: 20,
    },
    inputGroup: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: isDark ? "#333" : "#D1D5DB",
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
      backgroundColor: isDark ? "#1A1A1A" : "#F9FAFB",
    },
    readOnlyInput: {
      backgroundColor: isDark ? "#2A2A2A" : "#F0F0F0",
      borderColor: isDark ? "#444" : "#E0E0E0",
      justifyContent: "center",
    },
    slotInfoContainer: {
      flexDirection: "column",
    },
    streetName: {
      fontSize: 14,
      color: isDark ? "#AAA" : "#666",
      fontWeight: "500",
      marginBottom: 2,
    },
    readOnlyText: {
      fontSize: 16,
      color: isDark ? "#AAA" : "#666",
      fontStyle: "italic",
    },
    infoNote: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "#1A1A1A" : "#F0F8FF",
      padding: 12,
      borderRadius: 8,
      marginBottom: 20,
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
    },
    infoNoteText: {
      fontSize: 14,
      color: isDark ? "#CCC" : "#666",
      marginLeft: 8,
      flex: 1,
    },
    profileLink: {
      fontSize: 14,
      color: theme.accent,
      fontWeight: "600",
      textDecorationLine: "underline",
    },
    costSummary: {
      backgroundColor: isDark ? "#111111" : "#FFFFFF",
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? "#333" : "#E5E7EB",
    },
    costRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    costLabel: {
      fontSize: 16,
      color: theme.details,
      fontWeight: "500",
    },
    costValue: {
      fontSize: 16,
      color: theme.text,
      fontWeight: "600",
    },
    totalRow: {
      borderTopWidth: 1,
      borderTopColor: isDark ? "#333" : "#E5E7EB",
      paddingTop: 12,
      marginTop: 8,
    },
    totalLabel: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.text,
    },
    totalAmount: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.accent,
    },
    confirmButton: {
      backgroundColor: isFormComplete
        ? theme.accent
        : isDark
        ? "#333"
        : "#D1D5DB",
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 10,
    },
    confirmButtonText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
    },
    loadingText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={isDark ? "#0A0A0A" : "#FFFFFF"}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Parking Spot</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Slot Information */}
            {slot && (
              <View style={styles.slotInfo}>
                <Text style={styles.slotName}>{slot.name}</Text>
                <View style={styles.slotDetails}>
                  <Text style={styles.slotPrice}>$1/hour</Text>
                  <View style={styles.slotStatus}>
                    <Text style={styles.slotStatusText}>Available</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Booking Details Form */}
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Your Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  value={form.name}
                  onChangeText={(t) => handleChange("name", t)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Number Plate</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ABC-1234"
                  value={form.numberPlate}
                  onChangeText={(t) => handleChange("numberPlate", t)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>License Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter license number"
                  value={form.carName}
                  onChangeText={(t) => handleChange("carName", t)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Slot</Text>
                <View style={[styles.input, styles.readOnlyInput]}>
                  <View style={styles.slotInfoContainer}>
                    <Text style={styles.streetName}>
                      {slot?.name && slot.name.toLowerCase().includes("a")
                        ? "Jason Moyo Ave"
                        : slot?.name && slot.name.toLowerCase().includes("b")
                        ? "Nelson Mandela Ave"
                        : ""}
                    </Text>
                    <Text style={styles.readOnlyText}>
                      {slot?.name || "(not set)"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoNote}>
                <Ionicons
                  name="information-circle"
                  size={18}
                  color={theme.accent}
                />
                <Text style={styles.infoNoteText}>
                  You pay only for the time you actually park. Billing starts
                  when your car is detected and stops when you leave.
                </Text>
              </View>
            </View>

            {/* Cost Summary */}
            {form.duration && slot && (
              <View style={styles.costSummary}>
                <Text style={styles.sectionTitle}>Cost Breakdown</Text>

                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Duration</Text>
                  <Text style={styles.costValue}>
                    {(parseFloat(form.duration) / 60).toFixed(2)} hours
                  </Text>
                </View>

                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Rate</Text>
                  <Text style={styles.costValue}>$1/30s</Text>
                </View>

                <View style={[styles.costRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total Amount</Text>
                  <Text style={styles.totalAmount}>
                    ${Number(calculateTotalCost() || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {/* Confirm Button */}
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!isFormComplete || loading}
              style={styles.confirmButton}
            >
              {loading ? (
                <Text style={styles.loadingText}>Processing...</Text>
              ) : (
                <Text style={styles.confirmButtonText}>Confirm Booking</Text>
              )}
            </TouchableOpacity>

            {/* Extra space to ensure button is not covered */}
            <View style={{ height: 50 }} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default BookingScreen;
