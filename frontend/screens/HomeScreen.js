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
    container: {
      flex: 1,
      backgroundColor: isDark ? "#000000" : "#F5F5F7",
    },
    scrollContainer: {
      paddingBottom: 100,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 15,
      paddingBottom: 16,
      backgroundColor: isDark ? "#000000" : "#F5F5F7",
    },
    headerTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    timeContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    timeText: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 15,
      fontWeight: "600",
      marginLeft: 6,
    },
    headerActions: {
      flexDirection: "row",
      gap: 10,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    walletButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 22,
      shadowColor: "#10B981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    walletText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 17,
      marginRight: 6,
    },
    heroSection: {
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    logoRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    logoCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
      shadowColor: "#10B981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 4,
    },
    appTitle: {
      color: "#10B981",
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    welcomeText: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 16,
      fontWeight: "500",
      marginBottom: 4,
    },
    nameText: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 40,
      fontWeight: "800",
      letterSpacing: -1.2,
      marginBottom: 6,
    },
    subtitleText: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 18,
      fontWeight: "500",
    },
    statsCard: {
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderRadius: 24,
      padding: 24,
      marginHorizontal: 20,
      marginBottom: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.1,
      shadowRadius: 20,
      elevation: 8,
    },
    statsTitle: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 14,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 20,
    },
    statsGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    statItem: {
      alignItems: "center",
      flex: 1,
    },
    statNumber: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
      marginBottom: 6,
    },
    statLabel: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 13,
      fontWeight: "600",
    },
    statDivider: {
      width: 1,
      height: "100%",
      backgroundColor: isDark ? "#2C2C2E" : "#E5E5EA",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 24,
      marginBottom: 16,
      marginTop: 8,
    },
    sectionTitle: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 26,
      fontWeight: "800",
      marginLeft: 10,
      letterSpacing: -0.8,
    },
    spotsContainer: {
      paddingHorizontal: 20,
      gap: 16,
    },
    spotCard: {
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderRadius: 24,
      padding: 20,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.5 : 0.08,
      shadowRadius: 16,
      elevation: 6,
      overflow: "hidden",
    },
    spotBadge: {
      position: "absolute",
      top: 20,
      right: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    spotBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    streetTag: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    spotName: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 28,
      fontWeight: "800",
      marginBottom: 16,
      letterSpacing: -0.8,
    },
    spotInfoRow: {
      flexDirection: "row",
      marginBottom: 20,
      gap: 24,
    },
    infoItem: {
      flexDirection: "row",
      alignItems: "center",
    },
    infoText: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 16,
      fontWeight: "600",
      marginLeft: 8,
    },
    reserveButton: {
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: "center",
      shadowColor: "#10B981",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    reserveText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    featuresSection: {
      paddingHorizontal: 20,
      marginTop: 8,
      marginBottom: 32,
    },
    featuresGrid: {
      flexDirection: "row",
      gap: 12,
    },
    featureCard: {
      flex: 1,
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderRadius: 20,
      padding: 20,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowRadius: 12,
      elevation: 4,
    },
    featureIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? "#2C2C2E" : "#F5F5F7",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
    },
    featureTitle: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
      textAlign: "center",
    },
    featureDesc: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 12,
      textAlign: "center",
      fontWeight: "500",
    },
    offlineCard: {
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderRadius: 24,
      padding: 40,
      marginHorizontal: 20,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.5 : 0.08,
      shadowRadius: 16,
      elevation: 6,
    },
    offlineIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? "#2C2C2E" : "#F5F5F7",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    offlineTitle: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    offlineDesc: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 15,
      textAlign: "center",
      fontWeight: "500",
      lineHeight: 22,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      paddingTop: 16,
      paddingBottom: 40,
      maxHeight: "90%",
    },
    modalHandle: {
      width: 40,
      height: 5,
      backgroundColor: isDark ? "#48484A" : "#C6C6C8",
      borderRadius: 3,
      alignSelf: "center",
      marginBottom: 24,
    },
    modalHeader: {
      paddingHorizontal: 24,
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 32,
      fontWeight: "800",
      color: isDark ? "#FFFFFF" : "#000000",
      marginBottom: 8,
      letterSpacing: -1,
    },
    modalSubtitle: {
      fontSize: 16,
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontWeight: "500",
    },
    searchInputContainer: {
      paddingHorizontal: 20,
      marginBottom: 24,
    },
    searchInput: {
      backgroundColor: isDark ? "#2C2C2E" : "#F5F5F7",
      borderRadius: 16,
      padding: 18,
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 17,
      fontWeight: "500",
    },
    modalSlotsContainer: {
      maxHeight: 400,
      paddingHorizontal: 20,
    },
    modalSlotCard: {
      backgroundColor: isDark ? "#2C2C2E" : "#F5F5F7",
      borderRadius: 20,
      padding: 20,
      marginBottom: 12,
    },
    modalSlotStreet: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    modalSlotName: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 12,
      letterSpacing: -0.5,
    },
    modalSlotStatus: {
      flexDirection: "row",
      alignItems: "center",
    },
    modalSlotStatusText: {
      fontSize: 15,
      fontWeight: "600",
      marginLeft: 8,
    },
    modalButtons: {
      flexDirection: "row",
      paddingHorizontal: 20,
      marginTop: 24,
      gap: 12,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 18,
      borderRadius: 16,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    modalButtonText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    emptyState: {
      padding: 48,
      alignItems: "center",
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? "#2C2C2E" : "#F5F5F7",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 6,
    },
    emptyDesc: {
      color: isDark ? "#8E8E93" : "#8E8E93",
      fontSize: 15,
      fontWeight: "500",
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
      fetchData();
      fetchIoTData();
      fetchUserBookings();
      return () => {};
    }, [])
  );

  const fetchWallet = async () => {
    try {
      const data = await walletAPI.getWallet();
      const newBalance = data.balance || 0;

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
      <View style={themedStyles.headerTop}>
        <View style={themedStyles.timeContainer}>
          <Ionicons name="time-outline" size={18} color="#10B981" />
          <Text style={themedStyles.timeText}>
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <View style={themedStyles.headerActions}>
          <TouchableOpacity
            style={themedStyles.iconButton}
            onPress={() => setShowSearchModal(true)}
          >
            <Ionicons name="search" size={20} color="#10B981" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              themedStyles.walletButton,
              {
                backgroundColor:
                  Number(wallet.balance || 0) < 0 ? "#FF453A" : "#10B981",
              },
            ]}
            onPress={() => navigation.navigate("TopUp")}
          >
            <Text style={themedStyles.walletText}>
              ${Number(wallet.balance || 0).toFixed(2)}
            </Text>
            <Ionicons
              name={Number(wallet.balance || 0) < 0 ? "warning" : "add-circle"}
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={themedStyles.iconButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <Ionicons name="person" size={20} color="#10B981" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const HeroSection = () => (
    <View style={themedStyles.heroSection}>
      {/* <View style={themedStyles.logoRow}>
        <View style={themedStyles.logoCircle}>
          <Ionicons name="car-sport" size={28} color="#10B981" />
        </View>
        <Text style={themedStyles.appTitle}>Smart Parking</Text>
      </View> */}
      <Text style={themedStyles.welcomeText}>Welcome back,</Text>
      <Text style={themedStyles.nameText}>
        {userData?.full_name || userData?.first_name || "User"}
      </Text>
      <Text style={themedStyles.subtitleText}>
        Find your perfect parking spot
      </Text>
    </View>
  );

  const StatsCard = () => (
    <View style={themedStyles.statsCard}>
      <Text style={themedStyles.statsTitle}>Real-Time Overview</Text>
      <View style={themedStyles.statsGrid}>
        <View style={themedStyles.statItem}>
          <Text style={themedStyles.statNumber}>{iotStats.availableSpots}</Text>
          <Text style={themedStyles.statLabel}>Available</Text>
        </View>
        <View style={themedStyles.statDivider} />
        <View style={themedStyles.statItem}>
          <Text style={themedStyles.statNumber}>{iotStats.occupancyRate}%</Text>
          <Text style={themedStyles.statLabel}>Occupancy</Text>
        </View>
        <View style={themedStyles.statDivider} />
        <View style={themedStyles.statItem}>
          <Text style={themedStyles.statNumber}>{iotStats.occupiedSpots}</Text>
          <Text style={themedStyles.statLabel}>Occupied</Text>
        </View>
      </View>
    </View>
  );

  const ParkingSpotCard = ({ spot }) => (
    <View style={themedStyles.spotCard}>
      <View
        style={[
          themedStyles.spotBadge,
          {
            backgroundColor: spot.isBookedByUser
              ? "#007AFF"
              : spot.isAvailable
              ? "#34C759"
              : "#FF453A",
          },
        ]}
      >
        <Text style={themedStyles.spotBadgeText}>{spot.availability}</Text>
      </View>

      <Text style={themedStyles.streetTag}>{getStreetName(spot.name)}</Text>
      <Text style={themedStyles.spotName}>{spot.name}</Text>

      <View style={themedStyles.spotInfoRow}>
        <View style={themedStyles.infoItem}>
          <Ionicons
            name="pricetag"
            size={20}
            color={isDark ? "#8E8E93" : "#8E8E93"}
          />
          <Text style={themedStyles.infoText}>{spot.price}</Text>
        </View>
        <View style={themedStyles.infoItem}>
          <Ionicons name="star" size={20} color="#FF9F0A" />
          <Text style={themedStyles.infoText}>{spot.rating}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          themedStyles.reserveButton,
          {
            backgroundColor: spot.isBookedByUser
              ? "#007AFF"
              : !spot.canBook && !spot.isBookedByUser
              ? "#8E8E93"
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
            : "Reserve Now"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const AvailableSpots = () => (
    <>
      <View style={themedStyles.sectionHeader}>
        <Ionicons name="location-sharp" size={28} color="#10B981" />
        <Text style={themedStyles.sectionTitle}>Available Spots</Text>
      </View>
      <View style={themedStyles.spotsContainer}>
        {parkingSpots.length > 0 ? (
          parkingSpots.map((spot) => (
            <ParkingSpotCard key={spot.id} spot={spot} />
          ))
        ) : (
          <View style={themedStyles.offlineCard}>
            <View style={themedStyles.offlineIcon}>
              <Ionicons
                name="wifi-outline"
                size={36}
                color={isDark ? "#48484A" : "#C6C6C8"}
              />
            </View>
            <Text style={themedStyles.offlineTitle}>IoT System Offline</Text>
            <Text style={themedStyles.offlineDesc}>
              Connect your ESP32 sensors to see real-time parking availability
            </Text>
          </View>
        )}
      </View>
    </>
  );

  const FeaturesSection = () => (
    <View style={themedStyles.featuresSection}>
      <View style={themedStyles.sectionHeader}>
        <Ionicons name="sparkles" size={28} color="#10B981" />
        <Text style={themedStyles.sectionTitle}>Why Smart Parking?</Text>
      </View>
      <View style={themedStyles.featuresGrid}>
        {[
          { icon: "flash", title: "Real-time", desc: "Live updates" },
          {
            icon: "shield-checkmark",
            title: "Secure",
            desc: "Safe & reliable",
          },
          { icon: "phone-portrait", title: "Easy", desc: "One-tap booking" },
        ].map((feature, i) => (
          <View key={i} style={themedStyles.featureCard}>
            <View style={themedStyles.featureIcon}>
              <Ionicons name={feature.icon} size={24} color="#10B981" />
            </View>
            <Text style={themedStyles.featureTitle}>{feature.title}</Text>
            <Text style={themedStyles.featureDesc}>{feature.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={themedStyles.container}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={isDark ? "#000000" : "#F5F5F7"}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={themedStyles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#10B981"]}
            tintColor="#10B981"
            progressBackgroundColor={isDark ? "#1C1C1E" : "#FFFFFF"}
          />
        }
      >
        <Header />
        <HeroSection />
        <StatsCard />
        <AvailableSpots />
        <FeaturesSection />
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

            <View style={themedStyles.modalHeader}>
              <Text style={themedStyles.modalTitle}>Search Location</Text>
              <Text style={themedStyles.modalSubtitle}>
                Find available parking slots by location
              </Text>
            </View>

            <View style={themedStyles.searchInputContainer}>
              <TextInput
                style={themedStyles.searchInput}
                placeholder="e.g., Jason Moyo, Nelson Mandela"
                placeholderTextColor={isDark ? "#8E8E93" : "#8E8E93"}
                value={searchLocation}
                onChangeText={setSearchLocation}
                autoFocus={false}
              />
            </View>

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
                      <Text style={themedStyles.modalSlotStreet}>
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
                          size={22}
                          color={spot.isAvailable ? "#34C759" : "#FF453A"}
                        />
                        <Text
                          style={[
                            themedStyles.modalSlotStatusText,
                            {
                              color: spot.isAvailable ? "#34C759" : "#FF453A",
                            },
                          ]}
                        >
                          {spot.availability}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={themedStyles.emptyState}>
                    <View style={themedStyles.emptyIcon}>
                      <Ionicons
                        name="search-outline"
                        size={32}
                        color={isDark ? "#48484A" : "#C6C6C8"}
                      />
                    </View>
                    <Text style={themedStyles.emptyTitle}>No slots found</Text>
                    <Text style={themedStyles.emptyDesc}>
                      Try another location
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={themedStyles.modalButtons}>
              <TouchableOpacity
                onPress={searchSlotsByLocation}
                style={[
                  themedStyles.modalButton,
                  { backgroundColor: "#10B981" },
                ]}
              >
                <Text style={themedStyles.modalButtonText}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowSearchModal(false);
                  setSearchLocation("");
                }}
                style={[
                  themedStyles.modalButton,
                  { backgroundColor: "#FF453A" },
                ]}
              >
                <Text style={themedStyles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default SmartParkingHome;
