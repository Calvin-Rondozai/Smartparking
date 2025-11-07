import React, { useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  SafeAreaView,
  Alert,
  RefreshControl,
  Switch,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ThemeContext } from "../ThemeContext";
import { parkingAPI, storage, walletAPI } from "../services/api";
import iotService from "../services/iotApi";
import { bookingAPI } from "../services/api";
import voiceFeedbackService from "../services/voiceFeedbackService";

const { width } = Dimensions.get("window");

const getThemedStyles = (isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? "#121212" : "#FFFFFF" },
    scrollContainer: { paddingBottom: 30 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#333" : "#F0F0F0",
    },
    headerLeft: { flexDirection: "row", alignItems: "center" },
    logoContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: isDark ? "#333" : "#F5F5F5",
      justifyContent: "center",
      alignItems: "center",
    },
    headerText: { marginLeft: 12 },
    appTitle: { color: "#10B981", fontSize: 18, fontWeight: "bold" },
    timeText: { color: isDark ? "#aaa" : "#666", fontSize: 14 },
    headerRight: { flexDirection: "row", alignItems: "center" },
    notificationIcon: { marginRight: 16, position: "relative", padding: 8 },
    notificationBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#FF4444",
    },
    profileIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? "#333" : "#F5F5F5",
      justifyContent: "center",
      alignItems: "center",
    },
    welcomeSection: {
      paddingHorizontal: 20,
      paddingVertical: 30,
      alignItems: "center",
    },
    welcomeText: {
      color: isDark ? "#fff" : "#333",
      fontSize: 28,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 4,
    },
    nameText: {
      color: "#10B981",
      fontSize: 28,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    subtitleText: {
      color: isDark ? "#ccc" : "#666",
      fontSize: 16,
      textAlign: "center",
    },
    searchContainer: { paddingHorizontal: 20, marginBottom: 30 },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "#222" : "#F5F5F5",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: isDark ? "#444" : "#E0E0E0",
    },
    searchIcon: { marginRight: 12 },
    searchInput: {
      flex: 1,
      color: isDark ? "#fff" : "#333",
      fontSize: 16,
    },
    statsContainer: {
      flexDirection: "row",
      paddingHorizontal: 20,
      marginBottom: 30,
    },
    statsCard: {
      flex: 1,
      backgroundColor: isDark ? "#222" : "#F9F9F9",
      borderRadius: 12,
      padding: 20,
      marginHorizontal: 4,
      alignItems: "center",
      borderWidth: 1,
      borderColor: isDark ? "#444" : "#E0E0E0",
    },
    statsNumber: {
      color: isDark ? "#fff" : "#333",
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 4,
    },
    statsLabel: {
      color: isDark ? "#ccc" : "#666",
      fontSize: 12,
      textAlign: "center",
    },
    iotStatusCard: {
      backgroundColor: isDark ? "#1c1c1c" : "#fff",
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? "#444" : "#E0E0E0",
      elevation: 3,
    },
    iotStatusHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    iotStatusTitle: {
      color: isDark ? "#fff" : "#333",
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    iotStatsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    iotStat: {
      alignItems: "center",
      flex: 1,
    },
    iotStatNumber: {
      color: isDark ? "#fff" : "#333",
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 2,
    },
    iotStatLabel: {
      color: isDark ? "#ccc" : "#666",
      fontSize: 11,
      textAlign: "center",
    },
    iotLastUpdate: {
      color: isDark ? "#888" : "#999",
      fontSize: 10,
      textAlign: "center",
      fontStyle: "italic",
    },
    nearbySection: {
      paddingHorizontal: 20,
      marginBottom: 30,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    sectionTitle: {
      color: isDark ? "#fff" : "#333",
      fontSize: 20,
      fontWeight: "bold",
      marginLeft: 8,
    },
    spotCard: {
      backgroundColor: isDark ? "#1c1c1c" : "#fff",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? "#444" : "#E0E0E0",
      elevation: 3,
    },
    spotHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    spotTitleContainer: {
      flex: 1,
    },
    streetName: {
      color: isDark ? "#AAA" : "#666",
      fontSize: 14,
      fontWeight: "500",
      marginBottom: 2,
    },
    spotName: {
      color: isDark ? "#fff" : "#333",
      fontSize: 18,
      fontWeight: "bold",
    },
    availabilityBadge: {
      backgroundColor: "#4CAF50",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    availabilityText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "500",
    },
    spotDetails: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    spotInfo: {
      flexDirection: "row",
      alignItems: "center",
    },
    spotPrice: {
      color: isDark ? "#fff" : "#333",
      fontSize: 14,
      fontWeight: "600",
      marginLeft: 4,
    },
    spotRating: {
      color: "#FFB800",
      fontSize: 14,
      fontWeight: "600",
      marginLeft: 4,
    },
    reserveButton: {
      backgroundColor: "#10B981",
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    reserveText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "bold",
    },
    featuresSection: {
      paddingHorizontal: 20,
      marginBottom: 30,
    },
    featuresGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 20,
    },
    featureCard: {
      flex: 1,
      backgroundColor: isDark ? "#222" : "#F9F9F9",
      borderRadius: 12,
      padding: 20,
      marginHorizontal: 4,
      alignItems: "center",
      borderWidth: 1,
      borderColor: isDark ? "#444" : "#E0E0E0",
    },
    featureTitle: {
      color: isDark ? "#fff" : "#333",
      fontSize: 14,
      fontWeight: "bold",
      marginTop: 8,
      marginBottom: 4,
    },
    featureDesc: {
      color: isDark ? "#ccc" : "#666",
      fontSize: 12,
      textAlign: "center",
    },
    bottomSpacing: {
      height: 30,
    },
    offlineMessage: {
      alignItems: "center",
      padding: 40,
      backgroundColor: isDark ? "#1c1c1c" : "#f8f9fa",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? "#444" : "#E0E0E0",
    },
    offlineText: {
      color: isDark ? "#fff" : "#333",
      fontSize: 18,
      fontWeight: "bold",
      marginTop: 16,
      marginBottom: 8,
    },
    offlineSubtext: {
      color: isDark ? "#ccc" : "#666",
      fontSize: 14,
      textAlign: "center",
    },
    activeBookingAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#E8F5E9",
      paddingVertical: 10,
      paddingHorizontal: 15,
      borderRadius: 8,
      marginHorizontal: 20,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: "#A5D6A7",
    },
    activeBookingText: {
      flex: 1,
      color: "#2E7D32",
      fontSize: 14,
      marginLeft: 10,
    },
    viewBookingButton: {
      backgroundColor: "#2196F3",
      paddingVertical: 8,
      paddingHorizontal: 15,
      borderRadius: 8,
    },
    viewBookingButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "bold",
    },
    title: {
      color: isDark ? "#fff" : "#333",
      fontSize: 28,
      fontWeight: "bold",
      marginBottom: 8,
    },
    subtitle: {
      color: isDark ? "#ccc" : "#666",
      fontSize: 16,
      textAlign: "center",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingBottom: 34,
      maxHeight: "85%",
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: -4,
      },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 20,
    },
    modalHandle: {
      width: 36,
      height: 5,
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.3)"
        : "rgba(0, 0, 0, 0.3)",
      borderRadius: 3,
      alignSelf: "center",
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "600",
      color: isDark ? "#FFFFFF" : "#000000",
      marginBottom: 8,
      paddingHorizontal: 20,
      textAlign: "center",
    },
    modalSubtitle: {
      fontSize: 15,
      color: isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)",
      paddingHorizontal: 20,
      marginBottom: 20,
      textAlign: "center",
    },
    searchInput: {
      backgroundColor: isDark ? "#2C2C2E" : "#FFFFFF",
      borderRadius: 12,
      padding: 16,
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 16,
      marginHorizontal: 20,
      marginBottom: 20,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    modalSlotsContainer: {
      maxHeight: 400,
      paddingHorizontal: 20,
    },
    modalSlotCard: {
      backgroundColor: isDark ? "#2C2C2E" : "#FFFFFF",
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    modalSlotLocation: {
      color: isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)",
      fontSize: 13,
      marginBottom: 6,
      fontWeight: "500",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    modalSlotName: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 17,
      fontWeight: "600",
      marginBottom: 8,
    },
    modalSlotStatus: {
      flexDirection: "row",
      alignItems: "center",
    },
    modalSlotStatusText: {
      fontSize: 14,
      fontWeight: "500",
      marginLeft: 6,
    },
    modalButtonsContainer: {
      flexDirection: "row",
      paddingHorizontal: 20,
      marginTop: 20,
      gap: 12,
    },
    modalSearchButton: {
      flex: 1,
      backgroundColor: "#10B981",
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      shadowColor: "#10B981",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    modalSearchButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
    modalCloseButton: {
      flex: 1,
      backgroundColor: "#EF4444",
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      shadowColor: "#EF4444",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    modalCloseButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
  });

const SmartParkingHome = ({ navigation }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [parkingLots, setParkingLots] = useState([]);
  const [stats, setStats] = useState({
    total_spots: 0,
    available_spots: 0,
    total_bookings: 0,
  });
  const [iotStats, setIotStats] = useState({
    totalSpots: 0,
    availableSpots: 0,
    occupiedSpots: 0,
    occupancyRate: 0,
    activeDevices: 0,
    lastUpdated: null,
  });
  const [iotSlots, setIotSlots] = useState([]);
  const [iotStatus, setIotStatus] = useState({
    online: false,
    devicesCount: 0,
    lastUpdate: null,
  });
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [userBookings, setUserBookings] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchLocation, setSearchLocation] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData();
    fetchIoTData();
    loadUserData();
    fetchUserBookings();
    fetchWallet();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchWallet();
      return () => {};
    }, [])
  );

  const fetchWallet = async () => {
    try {
      const data = await walletAPI.getWallet();
      const newBalance = data.balance || 0;
      const previousBalance = wallet.balance;

      setWallet({
        balance: newBalance,
        transactions: data.transactions || [],
      });

      try {
        if (newBalance < 1.5 && newBalance > 0) {
          (async () => {
            try {
              await voiceFeedbackService.onLowBalance(newBalance);
            } catch (error) {
              console.log("[HomeScreen] Voice feedback error:", error);
            }
          })();
        }
      } catch (error) {
        console.log("[HomeScreen] Voice feedback error:", error);
      }
    } catch (e) {
      console.log("[Home] wallet fetch error", e?.message || e);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchIoTData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadUserData = async () => {
    try {
      const authData = await storage.getAuthData();
      if (authData && authData.user) {
        setUserData(authData.user);
      } else if (authData) {
        setUserData(authData);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsData, lotsData] = await Promise.all([
        parkingAPI.getStats(),
        parkingAPI.getParkingLots(),
      ]);
      setStats(statsData);
      setParkingLots(lotsData);
    } catch (error) {
      console.error("Error fetching data:", error);
      Alert.alert("Error", "Failed to load parking data");
    } finally {
      setLoading(false);
    }
  };

  const fetchIoTData = async () => {
    try {
      console.log("Fetching IoT data...");

      const availabilityData = await iotService.getParkingAvailability();
      const [iotStatsData, iotStatusData] = await Promise.all([
        iotService.getParkingStats(),
        iotService.checkSystemStatus(),
      ]);

      if (availabilityData.offline) {
        console.log("ESP32 is offline - no real-time data available");
        setIotStatus({
          online: false,
          error: availabilityData.message || "ESP32 sensors offline",
          lastUpdate: new Date().toISOString(),
          devicesCount: 0,
        });
        setIotStats({
          totalSpots: 0,
          availableSpots: 0,
          occupiedSpots: 0,
          occupancyRate: 0,
          activeDevices: 0,
          lastUpdated: new Date().toISOString(),
        });
        setIotSlots([]);
        return;
      }

      const response = await bookingAPI.getBookings();
      const activeBookings = response.filter(
        (booking) => booking.status === "active"
      );

      const totalSpots = availabilityData.spots?.length || 0;
      const physicallyAvailableSpots =
        availabilityData.spots?.filter((slot) => slot.is_available).length || 0;
      const bookedSpots = activeBookings.length;
      const availableSpots = Math.max(
        0,
        physicallyAvailableSpots - bookedSpots
      );
      const occupiedSpots = totalSpots - availableSpots;
      const occupancyRate =
        totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0;

      console.log(
        `[HomeScreen] IoT Slot calculation: Total=${totalSpots}, PhysicallyAvailable=${physicallyAvailableSpots}, Booked=${bookedSpots}, Available=${availableSpots}, Occupied=${occupiedSpots}, OccupancyRate=${occupancyRate}%`
      );

      const updatedIotStats = {
        ...iotStatsData,
        totalSpots,
        availableSpots,
        occupiedSpots,
        occupancyRate,
        lastUpdated: new Date().toISOString(),
      };

      setIotStats(updatedIotStats);
      setIotStatus(iotStatusData);
      setIotSlots(availabilityData.spots || []);
      setUserBookings(activeBookings);

      console.log("IoT data updated:", updatedIotStats, iotStatusData);
      console.log("IoT slots:", availabilityData.spots);
    } catch (error) {
      console.error("Error fetching IoT data:", error);
      setIotStatus({
        online: false,
        error: error.message,
        lastUpdate: new Date().toISOString(),
        devicesCount: 0,
      });
      setIotStats({
        totalSpots: 0,
        availableSpots: 0,
        occupiedSpots: 0,
        occupancyRate: 0,
        activeDevices: 0,
        lastUpdated: new Date().toISOString(),
      });
      setIotSlots([]);
    }
  };

  const fetchUserBookings = async () => {
    try {
      const response = await bookingAPI.getBookings();
      const activeBookings = response.filter(
        (booking) => booking.status === "active"
      );
      setUserBookings(activeBookings);
      console.log("[HomeScreen] User active bookings:", activeBookings);

      if (iotSlots.length > 0) {
        const totalSpots = iotSlots.length;

        const physicallyAvailableSpots = iotSlots.filter(
          (slot) => slot.is_available
        ).length;

        const bookedSpots = activeBookings.length;

        const availableSpots = Math.max(
          0,
          physicallyAvailableSpots - bookedSpots
        );

        const occupiedSpots = totalSpots - availableSpots;

        const occupancyRate =
          totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0;

        console.log(
          `[HomeScreen] Slot calculation: Total=${totalSpots}, PhysicallyAvailable=${physicallyAvailableSpots}, Booked=${bookedSpots}, Available=${availableSpots}, Occupied=${occupiedSpots}, OccupancyRate=${occupancyRate}%`
        );

        setIotStats((prev) => ({
          ...prev,
          totalSpots,
          availableSpots,
          occupiedSpots,
          occupancyRate,
        }));
      }
    } catch (error) {
      console.error("Error fetching user bookings:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchData(), fetchIoTData(), fetchUserBookings()]);
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStreetName = (slotName) => {
    if (slotName && slotName.toLowerCase().includes("a")) {
      return "Jason Moyo Ave";
    } else if (slotName && slotName.toLowerCase().includes("b")) {
      return "Nelson Mandela Str";
    }
    return "";
  };

  const searchSlotsByLocation = () => {
    if (!searchLocation.trim()) {
      Alert.alert("Error", "Please enter a location to search");
      return;
    }
    setShowSearchModal(true);
  };

  const getFilteredSlots = () => {
    if (!searchLocation.trim()) return parkingSpots;

    const searchTerm = searchLocation.toLowerCase();
    return parkingSpots.filter((spot) => {
      const streetName = getStreetName(spot.name).toLowerCase();
      return streetName.includes(searchTerm);
    });
  };

  const parkingSpots =
    iotSlots.length > 0
      ? iotSlots.map((slot) => {
          const userBooking = userBookings.find(
            (booking) =>
              booking.parking_spot?.spot_number === slot.spot_number &&
              booking.status === "active"
          );

          const hasActiveBooking = userBookings.length > 0;

          return {
            id: slot.id,
            name: slot.spot_number,
            price: "$1/Hour",
            availability: userBooking
              ? "Booked by You"
              : slot.is_available
              ? "Available"
              : "Occupied",
            rating: 4.8,
            address: "IoT Smart Parking",
            isAvailable: !userBooking && slot.is_available && !hasActiveBooking,
            isBookedByUser: !!userBooking,
            bookingId: userBooking?.id,
            canBook: !hasActiveBooking && slot.is_available && !userBooking,
          };
        })
      : [];

  const themedStyles = getThemedStyles(isDark);

  const Header = () => (
    <View style={themedStyles.header}>
      <View style={themedStyles.headerLeft}>
        <View style={themedStyles.logoContainer}>
          <Ionicons name="car" size={24} color="#10B981" />
        </View>
        <View style={themedStyles.headerText}>
          <Text style={themedStyles.appTitle}>Smart Parking</Text>
          <Text style={themedStyles.timeText}>
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
      <View style={themedStyles.headerRight}>
        <TouchableOpacity style={themedStyles.notificationIcon}>
          <Ionicons name="notifications-outline" size={24} color="#10B981" />
          <View style={themedStyles.notificationBadge} />
        </TouchableOpacity>
        <TouchableOpacity
          style={themedStyles.profileIcon}
          onPress={() => navigation.navigate("Profile")}
        >
          <Ionicons name="person-outline" size={20} color="#10B981" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const WelcomeSection = () => (
    <View style={themedStyles.welcomeSection}>
      <Text style={themedStyles.welcomeText}>Welcome back,</Text>
      <Text style={themedStyles.nameText}>
        {userData?.full_name || userData?.first_name || "User"}!
      </Text>
      <Text style={themedStyles.subtitleText}>
        Find your perfect parking spot!
      </Text>
    </View>
  );

  const StatsCards = () => (
    <View style={themedStyles.statsContainer}>
      {[
        [iotStats.availableSpots.toString(), "Available Slots"],
        [`${iotStats.occupancyRate}%`, "Occupancy"],
        [iotStats.occupiedSpots.toString(), "Occupied Slots"],
      ].map(([num, label], i) => (
        <View key={i} style={themedStyles.statsCard}>
          <Text style={themedStyles.statsNumber}>{num}</Text>
          <Text style={themedStyles.statsLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
      fetchIoTData();
      fetchUserBookings();
    }, [])
  );

  const IoTStatusCard = () => (
    <View style={themedStyles.iotStatusCard}>
      <View style={themedStyles.iotStatusHeader}>
        <Ionicons
          name={iotStatus.online ? "wifi" : "wifi-outline"}
          size={20}
          color={iotStatus.online ? "#10B981" : "#EF4444"}
        />
        <Text style={themedStyles.iotStatusTitle}>
          IoT System {iotStatus.online ? "Online" : "Offline"}
        </Text>
      </View>
      <View style={themedStyles.iotStatsRow}>
        <View style={themedStyles.iotStat}>
          <Text style={themedStyles.iotStatNumber}>
            {iotStats.activeDevices}
          </Text>
          <Text style={themedStyles.iotStatLabel}>Active Sensors</Text>
        </View>
        <View style={themedStyles.iotStat}>
          <Text style={themedStyles.iotStatNumber}>
            {iotStats.occupancyRate}%
          </Text>
          <Text style={themedStyles.iotStatLabel}>Occupancy</Text>
        </View>
        <View style={themedStyles.iotStat}>
          <Text style={themedStyles.iotStatNumber}>
            {iotStats.availableSpots}
          </Text>
          <Text style={themedStyles.iotStatLabel}>Available</Text>
        </View>
      </View>
      {iotStats.lastUpdated && (
        <Text style={themedStyles.iotLastUpdate}>
          Last updated: {new Date(iotStats.lastUpdated).toLocaleTimeString()}
        </Text>
      )}
    </View>
  );

  const ParkingSpotCard = ({ spot }) => {
    const getStreetName = (slotName) => {
      if (slotName && slotName.toLowerCase().includes("a")) {
        return "Jason Moyo Ave";
      } else if (slotName && slotName.toLowerCase().includes("b")) {
        return "Nelson Mandela Str";
      }
      return "";
    };

    return (
      <View style={themedStyles.spotCard}>
        <View style={themedStyles.spotHeader}>
          <View style={themedStyles.spotTitleContainer}>
            <Text style={themedStyles.streetName}>
              {getStreetName(spot.name)}
            </Text>
            <Text style={themedStyles.spotName}>{spot.name}</Text>
          </View>
          <View
            style={[
              themedStyles.availabilityBadge,
              {
                backgroundColor: spot.isBookedByUser
                  ? "#2196F3"
                  : spot.isAvailable
                  ? "#4CAF50"
                  : "#F44336",
              },
            ]}
          >
            <Text style={themedStyles.availabilityText}>
              {spot.availability}
            </Text>
          </View>
        </View>
        <View style={themedStyles.spotDetails}>
          <View style={themedStyles.spotInfo}>
            <Ionicons name="pricetag-outline" size={16} color="#888" />
            <Text style={themedStyles.spotPrice}>{spot.price}</Text>
          </View>
          <View style={themedStyles.spotInfo}>
            <Ionicons name="star" size={16} color="#FFB800" />
            <Text style={themedStyles.spotRating}>{spot.rating}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            themedStyles.reserveButton,
            {
              backgroundColor: spot.isBookedByUser
                ? "#2196F3"
                : !spot.canBook && !spot.isBookedByUser
                ? "#9E9E9E"
                : "#10B981",
            },
          ]}
          onPress={() => {
            if (spot.isBookedByUser) {
              navigation.navigate("Main", { screen: "Bookings" });
            } else if (spot.canBook) {
              navigation.navigate("BookingPage", { slot: spot });
            } else if (userBookings.length > 0) {
              Alert.alert(
                "Multiple Bookings Not Allowed",
                "You already have an active booking. Please cancel your current booking before making a new one.",
                [
                  { text: "OK", style: "default" },
                  {
                    text: "View My Booking",
                    onPress: () =>
                      navigation.navigate("Main", { screen: "Bookings" }),
                  },
                ]
              );
            }
          }}
          disabled={!spot.canBook && !spot.isBookedByUser}
        >
          <Text style={themedStyles.reserveText}>
            {spot.isBookedByUser
              ? "View Booking"
              : !spot.canBook && !spot.isBookedByUser
              ? "Unavailable"
              : "Reserve"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const AvailableSpots = () => (
    <View style={themedStyles.nearbySection}>
      <View style={themedStyles.sectionHeader}>
        <Ionicons name="car-outline" size={24} color="#10B981" />
        <Text style={themedStyles.sectionTitle}>Available Slots</Text>
      </View>
      {parkingSpots.length > 0 ? (
        parkingSpots.map((spot) => (
          <ParkingSpotCard key={spot.id} spot={spot} />
        ))
      ) : (
        <View style={themedStyles.offlineMessage}>
          <Ionicons name="wifi-outline" size={48} color="#666" />
          <Text style={themedStyles.offlineText}>IoT System Offline</Text>
          <Text style={themedStyles.offlineSubtext}>
            Connect ESP32 to see real-time parking data
          </Text>
        </View>
      )}
    </View>
  );

  const FeaturesSection = () => (
    <View style={themedStyles.featuresSection}>
      <Text style={themedStyles.sectionTitle}>Why Choose Smart Parking?</Text>
      <View style={themedStyles.featuresGrid}>
        {[
          ["flash-outline", "Real-time", "Live spot updates"],
          ["shield-checkmark-outline", "Secure", "Safe & reliable"],
          ["phone-portrait-outline", "Easy", "One-tap booking"],
        ].map(([icon, title, desc], i) => (
          <View key={i} style={themedStyles.featureCard}>
            <Ionicons name={icon} size={32} color="#10B981" />
            <Text style={themedStyles.featureTitle}>{title}</Text>
            <Text style={themedStyles.featureDesc}>{desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={themedStyles.container}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={isDark ? "#121212" : "#fff"}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={themedStyles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#10B981"]}
            tintColor={isDark ? "#10B981" : "#10B981"}
          />
        }
      >
        <View style={themedStyles.header}>
          <Text style={themedStyles.title}>Smart Parking</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: isDark ? "#333" : "#F0F0F0",
                marginRight: 10,
              }}
              onPress={() => {
                setShowSearchModal(true);
              }}
            >
              <Ionicons name="search-outline" size={20} color="#10B981" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor:
                  Number(wallet.balance || 0) < 0 ? "#FF4444" : "#10B981",
              }}
              onPress={() => navigation.navigate("TopUp")}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "900",
                  fontSize: 16,
                  marginRight: 8,
                }}
              >
                ${Number(wallet.balance || 0).toFixed(2)}
              </Text>
              <Ionicons
                name={
                  Number(wallet.balance || 0) < 0
                    ? "warning-outline"
                    : "add-circle-outline"
                }
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
        <WelcomeSection />
        <StatsCards />
        <AvailableSpots />
        <FeaturesSection />
        <View style={themedStyles.bottomSpacing} />
      </ScrollView>

      <Modal
        visible={showSearchModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <TouchableOpacity
          style={themedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSearchModal(false)}
        >
          <View
            style={themedStyles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={themedStyles.modalHandle} />

            <Text style={themedStyles.modalTitle}>Search Location</Text>
            <Text style={themedStyles.modalSubtitle}>
              Find available parking slots by location
            </Text>

            <TextInput
              style={themedStyles.searchInput}
              placeholder="Search (e.g., Jason Moyo, Nelson Mandela)"
              placeholderTextColor={
                isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
              }
              value={searchLocation}
              onChangeText={setSearchLocation}
              autoFocus={false}
            />

            {searchLocation && (
              <ScrollView
                style={themedStyles.modalSlotsContainer}
                showsVerticalScrollIndicator={false}
              >
                {getFilteredSlots().length > 0 ? (
                  getFilteredSlots().map((spot) => (
                    <TouchableOpacity
                      key={spot.id}
                      style={themedStyles.modalSlotCard}
                      onPress={() => {
                        setShowSearchModal(false);
                        setSearchLocation("");
                      }}
                    >
                      <Text style={themedStyles.modalSlotLocation}>
                        {getStreetName(spot.name)}
                      </Text>
                      <Text style={themedStyles.modalSlotName}>
                        {spot.name}
                      </Text>
                      <View style={themedStyles.modalSlotStatus}>
                        <Ionicons
                          name={
                            spot.isAvailable
                              ? "checkmark-circle"
                              : "close-circle"
                          }
                          size={18}
                          color={spot.isAvailable ? "#34C759" : "#FF3B30"}
                        />
                        <Text
                          style={[
                            themedStyles.modalSlotStatusText,
                            {
                              color: spot.isAvailable ? "#34C759" : "#FF3B30",
                            },
                          ]}
                        >
                          {spot.availability}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View
                    style={{
                      padding: 40,
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="search-outline"
                      size={48}
                      color={
                        isDark
                          ? "rgba(255, 255, 255, 0.3)"
                          : "rgba(0, 0, 0, 0.3)"
                      }
                    />
                    <Text
                      style={{
                        color: isDark
                          ? "rgba(255, 255, 255, 0.6)"
                          : "rgba(0, 0, 0, 0.6)",
                        fontSize: 16,
                        marginTop: 12,
                        fontWeight: "500",
                      }}
                    >
                      No slots found
                    </Text>
                    <Text
                      style={{
                        color: isDark
                          ? "rgba(255, 255, 255, 0.5)"
                          : "rgba(0, 0, 0, 0.5)",
                        fontSize: 14,
                        marginTop: 4,
                      }}
                    >
                      Try another location
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={themedStyles.modalButtonsContainer}>
              <TouchableOpacity
                onPress={searchSlotsByLocation}
                style={themedStyles.modalSearchButton}
              >
                <Text style={themedStyles.modalSearchButtonText}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowSearchModal(false);
                  setSearchLocation("");
                }}
                style={themedStyles.modalCloseButton}
              >
                <Text style={themedStyles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default SmartParkingHome;
