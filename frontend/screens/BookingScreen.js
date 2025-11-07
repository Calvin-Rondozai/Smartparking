import React, { useContext, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
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
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const authData = await storage.getAuthData();
      if (authData && authData.user) {
        setUserData(authData.user);

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

  const handleConfirm = async () => {
    setLoading(true);

    try {
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
        end_time: now.toISOString(),
        duration_minutes: 0,
        vehicle_name: form.carName,
      };

      const response = await bookingAPI.createBooking(bookingData);

      try {
        const spotName = slot.name;
        (async () => {
          try {
            await voiceFeedbackService.onSlotBooked(spotName, 0);
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

  const isFormComplete = !!(slot && slot.id);

  const getStreetName = (slotName) => {
    if (slotName && slotName.toLowerCase().includes("a")) {
      return "Jason Moyo Ave";
    } else if (slotName && slotName.toLowerCase().includes("b")) {
      return "Nelson Mandela Str";
    }
    return "Smart Parking Zone";
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "#000000" : "#F5F5F7",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: isDark ? "#000000" : "#F5F5F7",
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: isDark ? "#FFFFFF" : "#000000",
      letterSpacing: -0.8,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 120,
    },
    heroCard: {
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderRadius: 20,
      padding: 18,
      marginBottom: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 16,
      elevation: 6,
      overflow: "hidden",
    },
    heroGradient: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: "#10B981",
      opacity: 0.08,
    },
    slotBadge: {
      alignSelf: "flex-start",
      backgroundColor: "#10B981",
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      marginBottom: 16,
      shadowColor: "#10B981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    slotBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    streetTag: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    slotName: {
      fontSize: 36,
      fontWeight: "800",
      color: isDark ? "#FFFFFF" : "#000000",
      marginBottom: 20,
      letterSpacing: -1.2,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: isDark ? "#2C2C2E" : "#E5E5EA",
    },
    priceLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: isDark ? "#8E8E93" : "#8E8E93",
    },
    priceValue: {
      fontSize: 24,
      fontWeight: "800",
      color: "#10B981",
      letterSpacing: -0.5,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: isDark ? "#FFFFFF" : "#000000",
      marginBottom: 16,
      letterSpacing: -0.5,
    },
    detailsCard: {
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderRadius: 24,
      padding: 24,
      marginBottom: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.5 : 0.08,
      shadowRadius: 16,
      elevation: 6,
    },
    infoRow: {
      marginBottom: 20,
    },
    infoLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: isDark ? "#8E8E93" : "#8E8E93",
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    infoValueContainer: {
      backgroundColor: isDark ? "#2C2C2E" : "#F5F5F7",
      borderRadius: 16,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
    },
    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    infoValue: {
      fontSize: 17,
      fontWeight: "600",
      color: isDark ? "#FFFFFF" : "#000000",
      flex: 1,
    },
    infoPlaceholder: {
      color: isDark ? "#666666" : "#999999",
      fontStyle: "italic",
    },
    noteCard: {
      backgroundColor: isDark ? "#1C1C1E" : "#E8F5E9",
      borderRadius: 20,
      padding: 20,
      marginBottom: 24,
      flexDirection: "row",
      borderLeftWidth: 4,
      borderLeftColor: "#10B981",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowRadius: 12,
      elevation: 4,
    },
    noteIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#10B981",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    noteContent: {
      flex: 1,
    },
    noteTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: isDark ? "#FFFFFF" : "#000000",
      marginBottom: 6,
    },
    noteText: {
      fontSize: 14,
      fontWeight: "500",
      color: isDark ? "#8E8E93" : "#666666",
      lineHeight: 20,
    },
    confirmButton: {
      backgroundColor: isFormComplete
        ? "#10B981"
        : isDark
        ? "#2C2C2E"
        : "#D1D5DB",
      borderRadius: 20,
      paddingVertical: 20,
      alignItems: "center",
      shadowColor: isFormComplete ? "#10B981" : "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isFormComplete ? 0.35 : 0.1,
      shadowRadius: 16,
      elevation: isFormComplete ? 8 : 2,
    },
    confirmButtonText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    loadingContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    loadingText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
      marginLeft: 10,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={isDark ? "#000000" : "#F5F5F7"}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={22}
            color={isDark ? "#FFFFFF" : "#000000"}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Spot</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Hero Slot Card */}
          {slot && (
            <View style={styles.heroCard}>
              <View style={styles.heroGradient} />
              <View style={styles.slotBadge}>
                <Text style={styles.slotBadgeText}>Available</Text>
              </View>
              <Text style={styles.streetTag}>{getStreetName(slot.name)}</Text>
              <Text style={styles.slotName}>{slot.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Hourly Rate</Text>
                <Text style={styles.priceValue}>$1.00</Text>
              </View>
            </View>
          )}

          {/* Your Details Section */}
          <Text style={styles.sectionTitle}>Your Details</Text>
          <View style={styles.detailsCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <View style={styles.infoValueContainer}>
                <View style={styles.infoIcon}>
                  <Ionicons name="person" size={18} color="#10B981" />
                </View>
                <Text
                  style={[
                    styles.infoValue,
                    !form.name && styles.infoPlaceholder,
                  ]}
                >
                  {form.name || "Not provided"}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Number Plate</Text>
              <View style={styles.infoValueContainer}>
                <View style={styles.infoIcon}>
                  <Ionicons name="card" size={18} color="#10B981" />
                </View>
                <Text
                  style={[
                    styles.infoValue,
                    !form.numberPlate && styles.infoPlaceholder,
                  ]}
                >
                  {form.numberPlate || "Not provided"}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>License Number</Text>
              <View style={styles.infoValueContainer}>
                <View style={styles.infoIcon}>
                  <Ionicons name="document-text" size={18} color="#10B981" />
                </View>
                <Text
                  style={[
                    styles.infoValue,
                    !form.carName && styles.infoPlaceholder,
                  ]}
                >
                  {form.carName || "Not provided"}
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 0 }}>
              <Text style={styles.infoLabel}>Parking Slot</Text>
              <View style={styles.infoValueContainer}>
                <View style={styles.infoIcon}>
                  <Ionicons name="location" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  {slot?.name ? (
                    <>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: isDark ? "#8E8E93" : "#8E8E93",
                          marginBottom: 4,
                        }}
                      >
                        {getStreetName(slot.name)}
                      </Text>
                      <Text style={styles.infoValue}>{slot.name}</Text>
                    </>
                  ) : (
                    <Text style={[styles.infoValue, styles.infoPlaceholder]}>
                      Not selected
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Info Note */}
          <View style={styles.noteCard}>
            <View style={styles.noteIconContainer}>
              <Ionicons name="information" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.noteContent}>
              <Text style={styles.noteTitle}>Pay As You Park</Text>
              <Text style={styles.noteText}>
                Billing starts when your car is detected and stops when you
                leave. You only pay for actual parking time.
              </Text>
            </View>
          </View>

          {/* Confirm Button */}
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!isFormComplete || loading}
            style={styles.confirmButton}
            activeOpacity={0.8}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <Ionicons name="hourglass" size={20} color="#FFFFFF" />
                <Text style={styles.loadingText}>Processing...</Text>
              </View>
            ) : (
              <Text style={styles.confirmButtonText}>Confirm Booking</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default BookingScreen;
