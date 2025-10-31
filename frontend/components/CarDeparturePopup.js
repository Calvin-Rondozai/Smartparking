import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";

const { width } = Dimensions.get("window");

const CarDeparturePopup = ({
  visible,
  onClose,
  onViewReceipt,
  onStayHere,
  parkingDuration,
  departureTime,
}) => {
  const { theme, isDark } = React.useContext(ThemeContext);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.popup,
            {
              backgroundColor: isDark ? "#1E1E1E" : "#fff",
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="car-outline" size={32} color={theme.accent} />
            <Text style={[styles.title, { color: theme.text }]}>
              Car Departure Detected
            </Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.message, { color: theme.text }]}>
              Your car has left the parking spot.
            </Text>

            <View style={styles.durationContainer}>
              <Text style={[styles.durationLabel, { color: theme.details }]}>
                Parking Duration:
              </Text>
              <Text style={[styles.durationValue, { color: theme.accent }]}>
                {formatDuration(parkingDuration)}
              </Text>
            </View>

            <Text style={[styles.freezeMessage, { color: theme.details }]}>
              Timer will freeze at current duration.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.secondaryButton,
                { borderColor: theme.border },
              ]}
              onPress={onStayHere}
            >
              <Text style={[styles.actionText, { color: theme.text }]}>
                STAY HERE
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.primaryButton,
                { backgroundColor: theme.accent },
              ]}
              onPress={onViewReceipt}
            >
              <Text style={[styles.actionText, styles.primaryText]}>
                VIEW RECEIPT
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  popup: {
    width: width * 0.9,
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  content: {
    marginBottom: 24,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 22,
  },
  durationContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  durationLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  durationValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  freezeMessage: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButton: {
    borderWidth: 1,
  },
  primaryButton: {
    // backgroundColor set dynamically
  },
  actionText: {
    fontSize: 16,
    fontWeight: "600",
  },
  primaryText: {
    color: "#fff",
  },
});

export default CarDeparturePopup;
