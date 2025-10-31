import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";

const SuccessScreen = ({ route }) => {
  const { slot, vehicleType, hours, total } = route.params;
  const [timeLeft, setTimeLeft] = useState(parseInt(hours) * 60 * 60);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Booking Successful!</Text>
      <View style={styles.card}>
        <Text style={styles.detail}>Slot: {slot}</Text>
        <Text style={styles.detail}>Vehicle: {vehicleType}</Text>
        <Text style={styles.detail}>Duration: {hours} hour(s)</Text>
        <Text style={styles.detail}>Total Paid: ${total}</Text>
        <Text style={styles.countdown}>
          Time Remaining: {formatTime(timeLeft)}
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default SuccessScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  card: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: "#f1f1f1",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  detail: { fontSize: 16, marginBottom: 10 },
  countdown: { fontSize: 18, fontWeight: "bold", marginTop: 10 },
});
