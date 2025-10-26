import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";

const TermsAndConditionsScreen = ({ navigation }) => {
  const { theme, isDark } = React.useContext(ThemeContext);

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
          Terms & Conditions
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.contentCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Smart Parking Terms & Conditions
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            1. Service Usage
          </Text>
          <Text style={[styles.text, { color: theme.details }]}>
            By using Smart Parking services, you agree to park responsibly and
            follow all parking regulations. You are responsible for any damage
            to your vehicle or the parking facility.
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            2. Payment Terms
          </Text>
          <Text style={[styles.text, { color: theme.details }]}>
            Parking fees are calculated at $1.00 per 30 seconds. Payment is
            deducted from your wallet balance. Insufficient funds may result in
            service suspension.
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            3. Booking Policy
          </Text>
          <Text style={[styles.text, { color: theme.details }]}>
            Bookings are non-refundable once the timer starts. Cancellation is
            only allowed during the grace period (20 seconds after booking).
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            4. Liability
          </Text>
          <Text style={[styles.text, { color: theme.details }]}>
            Smart Parking is not liable for theft, damage, or loss of personal
            property. Users park at their own risk.
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            5. Account Termination
          </Text>
          <Text style={[styles.text, { color: theme.details }]}>
            We reserve the right to suspend or terminate accounts for violations
            of these terms or misuse of the service.
          </Text>

          <Text style={[styles.lastUpdated, { color: theme.details }]}>
            Last updated: {new Date().toLocaleDateString()}
          </Text>
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  contentCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 20,
    textAlign: "center",
  },
});

export default TermsAndConditionsScreen;
