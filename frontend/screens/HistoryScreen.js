import React, { useContext, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import { bookingAPI, walletAPI, storage } from "../services/api";
import { useFocusEffect } from "@react-navigation/native";

const HistoryScreen = ({ navigation, route }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [bookings, setBookings] = useState([]);
  const [rawBookings, setRawBookings] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  const fetchBookings = async () => {
    try {
      setLoading(true);
      console.log("[HistoryScreen] Fetching all bookings...");
      const response = await bookingAPI.getBookings();
      const snapshots = await storage.getBookingSnapshots();
      console.log("[HistoryScreen] All bookings response:", response);

      setRawBookings(response);

      const merged = Array.isArray(response)
        ? response.map((b) => {
            const snap = snapshots?.[String(b.id)];
            if (!snap) return b;
            const out = { ...b };
            if (snap.total_cost !== null && snap.total_cost !== undefined) {
              out.total_cost = snap.total_cost;
            }
            if (
              snap.duration_seconds !== null &&
              snap.duration_seconds !== undefined
            ) {
              out.duration_seconds = snap.duration_seconds;
            }
            return out;
          })
        : response;

      applyFilterAndSort(merged, filterStatus, sortBy);
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletTransactions = async () => {
    try {
      console.log("[HistoryScreen] Fetching wallet transactions...");
      const response = await walletAPI.getWallet();
      console.log("[HistoryScreen] Wallet transactions response:", response);
      setWalletTransactions(response.transactions || []);
    } catch (error) {
      console.error("Error fetching wallet transactions:", error);
    }
  };

  useEffect(() => {
    fetchBookings();
    fetchWalletTransactions();
  }, []);

  useEffect(() => {
    if (rawBookings.length > 0) {
      applyFilterAndSort(rawBookings, filterStatus, sortBy);
    }
  }, [filterStatus, sortBy, rawBookings]);

  useFocusEffect(
    React.useCallback(() => {
      console.log("[HistoryScreen] Screen focused - refreshing bookings");
      fetchBookings();
      fetchWalletTransactions();
    }, [])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      console.log("[HistoryScreen] Navigation focus - refreshing data");
      fetchBookings();
      fetchWalletTransactions();
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const refreshParam = route?.params?.refresh;
    if (refreshParam) {
      console.log(
        "[HistoryScreen] Refresh parameter detected - refreshing data"
      );
      fetchBookings();
      fetchWalletTransactions();
      navigation.setParams({ refresh: false });
    }
  }, [route?.params?.refresh, navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings();
    await fetchWalletTransactions();
    setRefreshing(false);
  };

  const applyFilterAndSort = (source, filter, sort) => {
    try {
      let list = Array.isArray(source) ? [...source] : [];

      list = list.map((b) => {
        try {
          const startTs = b.timer_started
            ? new Date(b.timer_started).getTime()
            : null;
          const endTs = b.completed_at
            ? new Date(b.completed_at).getTime()
            : null;

          const elapsedSeconds =
            startTs && endTs
              ? Math.max(0, Math.floor((endTs - startTs) / 1000))
              : 0;

          let out = { ...b, duration_seconds: elapsedSeconds };

          const perSecond = 1 / 30;
          const computed = Math.round(elapsedSeconds * perSecond * 100) / 100;
          out.total_cost = computed;

          console.log(
            `[HistoryScreen] Booking ${b.id}: Recalculated total_cost = $${computed} (${elapsedSeconds}s from timer_started to completed_at)`
          );

          return out;
        } catch (e) {
          console.error(
            `[HistoryScreen] Error processing booking ${b?.id}:`,
            e
          );
          return b;
        }
      });

      if (filter === "wallet") {
        setBookings(walletTransactions);
        return;
      }

      list = list.filter(
        (b) => b && (b.status === "completed" || b.status === "cancelled")
      );

      if (filter !== "all") {
        list = list.filter((b) => b.status === filter);
      }

      try {
        const byUser = new Map();
        const allChrono = [...list]
          .filter((b) => b && b.start_time)
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

        allChrono.forEach((b) => {
          const uid = b.user?.id || b.user_id || "self";
          const arr = byUser.get(uid) || [];
          arr.push(b.id);
          byUser.set(uid, arr);
        });

        const idToSeq = new Map();
        byUser.forEach((ids) =>
          ids.forEach((bid, idx) => idToSeq.set(bid, idx + 1))
        );
        list = list.map((b) => ({ ...b, user_seq: idToSeq.get(b.id) || null }));
      } catch (e) {
        console.error("[HistoryScreen] Error building sequence numbers:", e);
      }

      list.sort((a, b) => {
        switch (sort) {
          case "recent":
            return new Date(b.start_time) - new Date(a.start_time);
          case "oldest":
            return new Date(a.start_time) - new Date(b.start_time);
          case "cost":
            return (
              parseFloat(b.total_cost || 0) - parseFloat(a.total_cost || 0)
            );
          default:
            return 0;
        }
      });

      setBookings(list);
      console.log(`[HistoryScreen] Filtered bookings: ${list.length} items`);
    } catch (e) {
      console.error("[HistoryScreen] applyFilterAndSort error:", e);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return "N/A";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "#34C759";
      case "cancelled":
        return "#FF3B30";
      default:
        return "#8E8E93";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return "checkmark-circle";
      case "cancelled":
        return "close-circle";
      default:
        return "help-circle";
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case "topup":
        return "add-circle";
      case "parking_charge":
        return "car";
      case "adjustment":
        return "swap-horizontal";
      default:
        return "card";
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case "topup":
        return "#34C759";
      case "parking_charge":
        return "#FF9500";
      case "adjustment":
        return "#007AFF";
      default:
        return "#8E8E93";
    }
  };

  const renderWalletTransactionCard = (transaction) => (
    <View
      key={`wallet_${transaction.id}`}
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={getTransactionIcon(transaction.type)}
            size={24}
            color={getTransactionColor(transaction.type)}
          />
        </View>
        <View style={styles.cardHeaderText}>
          <Text
            style={[
              styles.cardTitle,
              { color: isDark ? "#FFFFFF" : "#000000" },
            ]}
          >
            {transaction.type === "topup"
              ? "Wallet Top-up"
              : transaction.type === "parking_charge"
              ? "Parking Charge"
              : transaction.type === "adjustment"
              ? "Balance Adjustment"
              : "Transaction"}
          </Text>
          <Text
            style={[
              styles.cardSubtitle,
              { color: isDark ? "#8E8E93" : "#8E8E93" },
            ]}
          >
            {formatDateTime(transaction.created_at)}
          </Text>
        </View>
        <Text
          style={[
            styles.amountText,
            {
              color: transaction.type === "topup" ? "#34C759" : "#FF3B30",
            },
          ]}
        >
          {transaction.type === "topup" ? "+" : "-"}$
          {Math.abs(transaction.amount).toFixed(2)}
        </Text>
      </View>

      {(transaction.note || transaction.booking_id) && (
        <View
          style={[
            styles.cardDetails,
            { borderTopColor: isDark ? "#2C2C2E" : "#F2F2F7" },
          ]}
        >
          {transaction.note && (
            <View style={styles.detailRow}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: isDark ? "#8E8E93" : "#8E8E93" },
                ]}
              >
                Note
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: isDark ? "#FFFFFF" : "#000000" },
                ]}
              >
                {transaction.note}
              </Text>
            </View>
          )}
          {transaction.booking_id && (
            <View style={styles.detailRow}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: isDark ? "#8E8E93" : "#8E8E93" },
                ]}
              >
                Booking
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: isDark ? "#FFFFFF" : "#000000" },
                ]}
              >
                #{transaction.booking_id}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderBookingCard = (booking) => {
    const totalCost = Number(booking.total_cost || 0);
    const durationSeconds = Number(booking.duration_seconds || 0);

    return (
      <View
        key={booking.id}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Ionicons
              name="car"
              size={24}
              color={getStatusColor(booking.status)}
            />
          </View>
          <View style={styles.cardHeaderText}>
            <Text
              style={[
                styles.cardTitle,
                { color: isDark ? "#FFFFFF" : "#000000" },
              ]}
            >
              Booking #{booking.id}
            </Text>
            <Text
              style={[
                styles.cardSubtitle,
                { color: isDark ? "#8E8E93" : "#8E8E93" },
              ]}
            >
              {booking.parking_spot?.spot_number || "N/A"} •{" "}
              {booking.vehicle_name || "N/A"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(booking.status) },
            ]}
          >
            <Ionicons
              name={getStatusIcon(booking.status)}
              size={14}
              color="#FFFFFF"
            />
          </View>
        </View>

        <View
          style={[
            styles.cardDetails,
            { borderTopColor: isDark ? "#2C2C2E" : "#F2F2F7" },
          ]}
        >
          <View style={styles.detailRow}>
            <Text
              style={[
                styles.detailLabel,
                { color: isDark ? "#8E8E93" : "#8E8E93" },
              ]}
            >
              Start Time
            </Text>
            <Text
              style={[
                styles.detailValue,
                { color: isDark ? "#FFFFFF" : "#000000" },
              ]}
            >
              {formatDateTime(booking.timer_started)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text
              style={[
                styles.detailLabel,
                { color: isDark ? "#8E8E93" : "#8E8E93" },
              ]}
            >
              End Time
            </Text>
            <Text
              style={[
                styles.detailValue,
                { color: isDark ? "#FFFFFF" : "#000000" },
              ]}
            >
              {formatDateTime(booking.completed_at)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text
              style={[
                styles.detailLabel,
                { color: isDark ? "#8E8E93" : "#8E8E93" },
              ]}
            >
              Duration
            </Text>
            <Text
              style={[
                styles.detailValue,
                { color: isDark ? "#FFFFFF" : "#000000" },
              ]}
            >
              {formatDuration(durationSeconds)}
            </Text>
          </View>

          <View
            style={[
              styles.totalRow,
              { borderTopColor: isDark ? "#2C2C2E" : "#F2F2F7" },
            ]}
          >
            <Text
              style={[
                styles.totalLabel,
                { color: isDark ? "#FFFFFF" : "#000000" },
              ]}
            >
              Total Cost
            </Text>
            <Text style={[styles.totalValue, { color: "#10B981" }]}>
              ${totalCost.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? "#000000" : "#F2F2F7" },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? "#000000" : "#F2F2F7",
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color={isDark ? "#FFFFFF" : "#000000"}
          />
        </TouchableOpacity>

        <Text
          style={[
            styles.headerTitle,
            { color: isDark ? "#FFFFFF" : "#000000" },
          ]}
        >
          Booking History
        </Text>

        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={22} color="#10B981" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#10B981"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text
              style={[
                styles.loadingText,
                { color: isDark ? "#8E8E93" : "#8E8E93" },
              ]}
            >
              Loading...
            </Text>
          </View>
        ) : (
            filterStatus === "wallet"
              ? walletTransactions.length === 0
              : bookings.length === 0
          ) ? (
          <View style={styles.centerContainer}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
              ]}
            >
              <Ionicons
                name={
                  filterStatus === "wallet" ? "wallet-outline" : "time-outline"
                }
                size={48}
                color={isDark ? "#8E8E93" : "#8E8E93"}
              />
            </View>
            <Text
              style={[
                styles.emptyTitle,
                { color: isDark ? "#FFFFFF" : "#000000" },
              ]}
            >
              {filterStatus === "wallet" ? "No Transactions" : "No Bookings"}
            </Text>
            <Text
              style={[
                styles.emptySubtitle,
                { color: isDark ? "#8E8E93" : "#8E8E93" },
              ]}
            >
              {filterStatus === "wallet"
                ? "Your wallet transactions will appear here"
                : "Your booking history will appear here"}
            </Text>
          </View>
        ) : (
          <>
            {filterStatus !== "wallet" && (
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
                ]}
              >
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: isDark ? "#FFFFFF" : "#000000" },
                      ]}
                    >
                      {bookings.length}
                    </Text>
                    <Text
                      style={[
                        styles.summaryLabel,
                        { color: isDark ? "#8E8E93" : "#8E8E93" },
                      ]}
                    >
                      Total
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.summaryDivider,
                      { backgroundColor: isDark ? "#2C2C2E" : "#F2F2F7" },
                    ]}
                  />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: "#10B981" }]}>
                      $
                      {bookings
                        .reduce(
                          (sum, booking) =>
                            sum + parseFloat(booking.total_cost || 0),
                          0
                        )
                        .toFixed(2)}
                    </Text>
                    <Text
                      style={[
                        styles.summaryLabel,
                        { color: isDark ? "#8E8E93" : "#8E8E93" },
                      ]}
                    >
                      Spent
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.summaryDivider,
                      { backgroundColor: isDark ? "#2C2C2E" : "#F2F2F7" },
                    ]}
                  />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: "#34C759" }]}>
                      {bookings.filter((b) => b.status === "completed").length}
                    </Text>
                    <Text
                      style={[
                        styles.summaryLabel,
                        { color: isDark ? "#8E8E93" : "#8E8E93" },
                      ]}
                    >
                      Done
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.cardsList}>
              {filterStatus === "wallet"
                ? walletTransactions.map(renderWalletTransactionCard)
                : bookings.map(renderBookingCard)}
            </View>
          </>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 0.38,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 100,
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 17,
    marginTop: 16,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 20,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  summaryDivider: {
    width: 1,
    height: 40,
  },
  cardsList: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "400",
  },
  statusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  amountText: {
    fontSize: 20,
    fontWeight: "700",
  },
  cardDetails: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: "400",
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
    marginLeft: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "700",
  },
});

export default HistoryScreen;
