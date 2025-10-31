import React, { useContext, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import { walletAPI } from "../services/api";
import notificationService from "../services/notificationService";
import voiceFeedbackService from "../services/voiceFeedbackService";

const PAYMENT_METHODS = ["EcoCash", "ZIPIT", "Bank Card", "Cash", "Voucher"];

export default function TopUpScreen({ navigation }) {
  const { theme, isDark } = useContext(ThemeContext);
  const [amount, setAmount] = useState(5);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [submitting, setSubmitting] = useState(false);

  const handleTopUp = async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Please enter a positive amount.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    // Optimistic: go back immediately; Home refreshes wallet on focus
    navigation.goBack();
    try {
      await walletAPI.topUp(parsed, method);

      // Voice feedback for successful wallet top-up
      try {
        // Get updated wallet balance for voice feedback
        const walletData = await walletAPI.getWallet();
        const newBalance = walletData.balance || 0;

        // Wrap in async function to handle await
        (async () => {
          try {
            await voiceFeedbackService.onWalletToppedUp(parsed, newBalance);
          } catch (error) {
            console.log("[TopUpScreen] Voice feedback error:", error);
          }
        })();
      } catch (error) {
        console.log("[TopUpScreen] Voice feedback error:", error);
      }

      // Send push notification for successful top-up
      try {
        await notificationService.initialize();
        const Notifications = require("expo-notifications");
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "💰 Top-up Successful!",
            body: `$${parsed.toFixed(
              2
            )} has been added to your wallet via ${method}.`,
            data: { type: "topup", amount: parsed, method: method },
            sound: "default",
          },
          trigger: null, // Send immediately
        });
      } catch (_) {}
    } catch (e) {
      Alert.alert(
        "Top-up",
        e?.response?.data?.error ||
          e?.message ||
          "Network issue. Balance will update once connected."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? "#121212" : "#f5f5f5" },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? "#1E1E1E" : "#fff",
            borderBottomColor: isDark ? "#333" : "#eee",
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Wallet Top-up
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? "#1E1E1E" : "#fff" },
          ]}
        >
          <Text style={[styles.label, { color: theme.details }]}>
            Amount (USD)
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.separator },
            ]}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.details}
            value={String(amount)}
            onChangeText={setAmount}
          />

          <Text style={[styles.label, { color: theme.details, marginTop: 16 }]}>
            Payment Method
          </Text>
          <View style={[styles.methodsRow]}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMethod(m)}
                style={[
                  styles.methodChip,
                  {
                    borderColor: theme.separator,
                    backgroundColor:
                      method === m ? theme.accent + "22" : "transparent",
                  },
                ]}
              >
                <Text
                  style={{
                    color: method === m ? theme.accent : theme.text,
                    fontWeight: "600",
                  }}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleTopUp}
            disabled={submitting}
            style={[
              styles.submitBtn,
              { backgroundColor: theme.accent, opacity: submitting ? 0.6 : 1 },
            ]}
          >
            <Ionicons
              name="card-outline"
              size={18}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.submitText}>
              {submitting ? "Processing..." : "Confirm Top-up"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16 },
  card: {
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  methodsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  methodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginTop: 8,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 24,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
