import React, { useContext, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import { bookingAPI, authAPI } from "../services/api";
import { useFocusEffect } from "@react-navigation/native";

const { width } = Dimensions.get("window");

const BookHisScreen = ({ navigation }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState("completed");
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  // Fetch bookings
  const fetchBookings = async () => {
    try {
      setLoading(true);
      console.log("[BookHisScreen] Fetching historical bookings...");

      // Check authentication first
      const authStatus = await authAPI.getAuthStatus();
      if (!authStatus.isAuthenticated) {
        console.log(
          "[BookHisScreen] User not authenticated, redirecting to login"
        );
        Alert.alert(
          "Authentication Required",
          "Please log in to view your booking history",
          [{ text: "OK", onPress: () => navigation.navigate("Login") }]
        );
        return;
      }

      const response = await bookingAPI.getBookings();
      console.log("[BookHisScreen] All bookings response:", response);

      // Filter to show only completed and cancelled bookings (history)
      const historicalBookings = response.filter((booking) => {
        return booking.status === "completed" || booking.status === "cancelled";
      });

      console.log("[BookHisScreen] Historical bookings:", historicalBookings);
      setBookings(historicalBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);

      if (error.response?.status === 401) {
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please log in again.",
          [{ text: "OK", onPress: () => navigation.navigate("Login") }]
        );
      } else {
        Alert.alert("Error", "Failed to load booking history");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load bookings on mount and when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      fetchBookings();
    }, [])
  );

  // Animate in
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Refresh function
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  };

  // Format date
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Render booking card
  const renderBookingCard = (booking, index) => (
    <Animated.View
      key={booking.id}
      style={[
        styles.bookingCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.bookingInfo}>
          <Text style={[styles.bookingId, { color: theme.text }]}>
            Booking #{index + 1}
          </Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  booking.status === "completed" ? theme.button : theme.error,
              },
            ]}
          >
            <Text style={styles.statusText}>
              {booking.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <Ionicons name="car-outline" size={24} color={theme.accent} />
      </View>

      {/* Details */}
      <View style={styles.bookingDetails}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.details }]}>
            Parking Slot:
          </Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>
            {booking.parking_spot?.spot_number || "N/A"}
          </Text>
        </View>

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
            Final Cost:
          </Text>
          <Text style={[styles.costValue, { color: theme.accent }]}>
            ${booking.total_cost || "0.00"}
          </Text>
      </View>

        {/* Show overtime if exists */}
        {booking.overtime_minutes > 0 && (
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.details }]}>
              Overtime:
            </Text>
            <Text style={[styles.detailValue, { color: theme.error }]}>
              {booking.overtime_minutes} min (${booking.overtime_cost || "0.00"}
              )
            </Text>
        </View>
      )}
    </View>
    </Animated.View>
  );

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
          Booking History
        </Text>
        <TouchableOpacity
          onPress={fetchBookings}
          style={styles.headerRefreshButton}
        >
          <Ionicons name="refresh" size={24} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View
        style={[
          styles.tabContainer,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "completed" && { backgroundColor: theme.button },
          ]}
          onPress={() => setSelectedTab("completed")}
        >
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={selectedTab === "completed" ? "#fff" : theme.details}
          />
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "completed" ? "#fff" : theme.details },
            ]}
          >
            Completed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "cancelled" && { backgroundColor: theme.error },
          ]}
          onPress={() => setSelectedTab("cancelled")}
        >
          <Ionicons
            name="close-circle"
            size={20}
            color={selectedTab === "cancelled" ? "#fff" : theme.details}
          />
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "cancelled" ? "#fff" : theme.details },
            ]}
          >
            Cancelled
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Section */}
      {!loading && bookings.length > 0 && (
        <View style={styles.summaryContainer}>
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: theme.details }]}>
                  Total
                </Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>
                  {bookings.length}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: theme.details }]}>
                  Completed
                </Text>
                <Text style={[styles.summaryValue, { color: theme.button }]}>
                  {bookings.filter((b) => b.status === "completed").length}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: theme.details }]}>
                  Cancelled
                </Text>
                <Text style={[styles.summaryValue, { color: theme.error }]}>
                  {bookings.filter((b) => b.status === "cancelled").length}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

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
              Loading booking history...
            </Text>
          </View>
        ) : bookings.filter((booking) => {
            if (selectedTab === "completed")
              return booking.status === "completed";
            if (selectedTab === "cancelled")
              return booking.status === "cancelled";
            return true;
          }).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={theme.details} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No {selectedTab === "completed" ? "Completed" : "Cancelled"}{" "}
              Bookings
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.details }]}>
              You don't have any{" "}
              {selectedTab === "completed" ? "completed" : "cancelled"} bookings
              yet.
            </Text>
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
              .filter((booking) => {
                if (selectedTab === "completed")
                  return booking.status === "completed";
                if (selectedTab === "cancelled")
                  return booking.status === "cancelled";
                return true;
              })
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
  summaryContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  summaryCard: {
    borderRadius: 15,
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
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    fontSize: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 20,
  },
  bookingsList: {
    // No specific styles for the list itself, cards handle their own layout
  },
  bookingCard: {
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  bookingInfo: {
    flex: 1,
    marginRight: 10,
  },
  bookingId: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignSelf: "flex-start",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  bookingDetails: {
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: "bold",
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  costValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default BookHisScreen;
