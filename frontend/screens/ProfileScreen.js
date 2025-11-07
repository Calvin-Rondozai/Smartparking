import React, { useState, useEffect, useContext, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { storage, authAPI } from "../services/api";
import { ThemeContext } from "../ThemeContext";

const AVATAR_SIZE = 100;

const ProfileScreen = ({ navigation }) => {
  const { theme, isDark } = useContext(ThemeContext);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const editButtonScale = useRef(new Animated.Value(1)).current;

  // Edit form state
  const [editForm, setEditForm] = useState({
    phone_number: "",
    license_plate: "",
    car_name: "",
  });

  // Handle phone number input - only 10 digits
  const handlePhoneChange = (text) => {
    const numericOnly = text.replace(/[^0-9]/g, "");
    if (numericOnly.length <= 10) {
      setEditForm({ ...editForm, phone_number: numericOnly });
    }
  };

  // Handle number plate input - 3 letters followed by 4 numbers (ABC1234)
  const handleNumberPlateChange = (text) => {
    const alphanumeric = text.replace(/[^A-Z0-9]/gi, "");
    let formatted = alphanumeric.toUpperCase();

    const lettersMatch = formatted.match(/[A-Z]+/g)?.[0] || "";
    const numbersMatch = formatted.match(/[0-9]+/g)?.[0] || "";

    const letters = lettersMatch.slice(0, 3);
    const numbers = numbersMatch.slice(0, 4);

    let finalValue = "";
    if (formatted.length <= 3) {
      finalValue = letters;
    } else {
      finalValue = letters + numbers;
    }

    setEditForm({ ...editForm, license_plate: finalValue });
  };

  useEffect(() => {
    loadUserData();
  }, []);

  // Refresh profile data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (userData) {
        loadUserData();
      }
    }, [])
  );

  const loadUserData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to fetch the latest profile from the backend
      const latest = await authAPI.getProfile();
      console.log("Profile data from backend:", latest);

      // Merge user and profile data properly
      const userData = {
        ...latest.user,
        ...latest.profile,
        // Ensure we have the expected field names
        phone_number: latest.profile?.phone_number || latest.profile?.phone,
        license_plate: latest.profile?.license_plate || latest.profile?.address,
        car_name: latest.profile?.car_name, // Vehicle model only, no fallback to address
      };
      setUserData(userData);

      // Get current auth data and save updated user data
      const currentAuthData = await storage.getAuthData();
      if (currentAuthData && currentAuthData.token) {
        await storage.saveAuthData(currentAuthData.token, userData);
      }
    } catch (error) {
      console.error(
        "Error fetching profile from backend, falling back to AsyncStorage:",
        error
      );

      // Check if it's an authentication error
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log("Authentication error detected, redirecting to login");
        setError("Session expired. Please log in again.");
        // Clear auth data and redirect to login
        await storage.clearAuthData();
        setTimeout(() => {
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        }, 2000);
        return;
      }

      // Fallback to AsyncStorage for other errors
      try {
        const authData = await storage.getAuthData();
        if (authData && authData.user) {
          setUserData(authData.user);
        } else if (authData) {
          setUserData(authData);
        } else {
          setUserData(null);
          setError("No user data found. Please log in again.");
        }
      } catch (storageError) {
        console.error(
          "Error loading user data from AsyncStorage:",
          storageError
        );
        setUserData(null);
        setError("Failed to load profile data. Please log in again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = () => {
    // Populate edit form with current user data
    setEditForm({
      phone_number: userData.phone_number || userData.phone || "",
      license_plate: userData.license_plate || userData.address || "",
      car_name: userData.car_name || "",
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditForm({
      phone_number: "",
      license_plate: "",
      car_name: "",
    });
  };

  const handleUpdateProfile = async () => {
    if (updating) return;

    // Validate phone number - must be exactly 10 digits
    if (editForm.phone_number && editForm.phone_number.length !== 10) {
      Alert.alert("Error", "Phone number must be exactly 10 digits");
      return;
    }

    // Validate number plate - must be exactly 3 letters followed by 4 numbers
    if (
      editForm.license_plate &&
      !/^[A-Z]{3}[0-9]{4}$/.test(editForm.license_plate)
    ) {
      Alert.alert(
        "Error",
        "Number plate must be in format ABC1234 (3 letters + 4 numbers)"
      );
      return;
    }

    setUpdating(true);
    try {
      const updateData = {
        phone: editForm.phone_number,
        address: editForm.license_plate,
        car_name: editForm.car_name,
      };

      console.log("Updating profile with data:", updateData);
      const response = await authAPI.updateProfile(updateData);
      console.log("Profile update response:", response);

      Alert.alert("Success", "Profile updated successfully!");

      // Reload user data
      await loadUserData();

      // Close modal
      closeEditModal();
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert(
        "Error",
        error.response?.data?.error ||
          "Failed to update profile. Please try again."
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await storage.clearAuthData();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          } catch (error) {
            console.error("Error during logout:", error);
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "#18181B" : "#F5F5F5",
    },
    gradient: {
      flex: 1,
      padding: 0,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: isDark ? "#18181B" : "#F5F5F5",
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 32,
      padding: 32,
      marginHorizontal: 16,
      marginTop: 60,
      shadowColor: theme.border,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 8,
      alignItems: "center",
      ...Platform.select({
        ios: {
          shadowColor: theme.border,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    avatarWrapper: {
      marginTop: -AVATAR_SIZE / 2,
      marginBottom: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 2,
      borderColor: theme.accent,
      backgroundColor: theme.card,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    avatarIcon: {
      alignSelf: "center",
      color: theme.icon,
    },
    nameContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      marginBottom: 2,
    },

    name: {
      fontWeight: "bold",
      fontSize: 28,
      color: theme.text,
    },
    subtitle: {
      textAlign: "center",
      fontSize: 16,
      color: theme.subtitle,
      marginBottom: 16,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 8,
      width: "100%",
    },
    infoIcon: {
      marginRight: 16,
      marginLeft: 8,
    },
    infoLabel: {
      fontWeight: "600",
      color: theme.text,
      fontSize: 16,
      minWidth: 80,
    },
    infoValue: {
      color: theme.details,
      fontSize: 16,
      flex: 1,
      fontWeight: "400",
    },
    email: {
      color: theme.email,
      fontStyle: "italic",
      fontSize: 16,
      flex: 1,
    },
    button: {
      marginTop: 32,
      backgroundColor: theme.accent,
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 32,
      alignSelf: "center",
      shadowColor: theme.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    buttonText: {
      color: theme.buttonText,
      fontWeight: "bold",
      fontSize: 18,
      textAlign: "center",
      letterSpacing: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      textAlign: "center",
      fontSize: 16,
      color: theme.loading || theme.text,
      marginTop: 16,
    },
    errorText: {
      textAlign: "center",
      fontSize: 16,
      color: theme.error || "#FF6B6B",
      marginTop: 20,
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalContent: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxHeight: "80%",
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: theme.text,
      marginBottom: 24,
      textAlign: "center",
    },
    inputContainer: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 8,
    },
    textInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: theme.text,
      backgroundColor: isDark ? "#2A2A2A" : "#FFF",
    },
    modalButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButton: {
      backgroundColor: theme.border,
    },
    saveButton: {
      backgroundColor: theme.accent,
    },
    modalButtonText: {
      color: theme.buttonText,
      fontSize: 16,
      fontWeight: "600",
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!userData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.card, { marginTop: 120 }]}>
          <Text style={styles.errorText}>{error || "No user data found"}</Text>
          <TouchableOpacity style={styles.button} onPress={loadUserData}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              { marginTop: 16, backgroundColor: theme.error },
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.buttonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.gradient}>
        <View style={styles.card}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Ionicons
                name="person-circle-outline"
                size={AVATAR_SIZE - 16}
                color={theme.icon}
                style={styles.avatarIcon}
              />
            </View>
          </View>

          <View style={styles.nameContainer}>
            <Text style={styles.name}>
              {userData.full_name ||
                userData.first_name ||
                userData.username ||
                "User"}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            Welcome to your smart parking profile!
          </Text>

          {/* Info Rows */}
          <View style={{ width: "100%", marginTop: 16 }}>
            <View style={styles.infoRow}>
              <Ionicons
                name="person-outline"
                size={22}
                color={theme.icon}
                style={styles.infoIcon}
              />
              <Text style={styles.infoLabel}>Username: </Text>
              <Text style={styles.infoValue}>
                {userData.username || "Not provided"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons
                name="mail-outline"
                size={22}
                color={theme.icon}
                style={styles.infoIcon}
              />
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.email}>
                {userData.email || "Not provided"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons
                name="call-outline"
                size={22}
                color={theme.icon}
                style={styles.infoIcon}
              />
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>
                {userData.phone_number || userData.phone || "Not provided"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons
                name="car-outline"
                size={22}
                color={theme.icon}
                style={styles.infoIcon}
              />
              <Text style={styles.infoLabel}>Number Plate: </Text>
              <Text style={styles.infoValue}>
                {userData.license_plate || userData.address || "Not provided"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons
                name="car-sport-outline"
                size={22}
                color={theme.icon}
                style={styles.infoIcon}
              />
              <Text style={styles.infoLabel}>License Number: </Text>
              <Text style={styles.infoValue}>
                {userData.car_name || "Not provided"}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              style={[styles.button, { flex: 1 }]}
              onPress={openEditModal}
            >
              <Text style={styles.buttonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { flex: 1, backgroundColor: theme.error }]}
              onPress={handleLogout}
            >
              <Text style={styles.buttonText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Edit Profile</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.phone_number}
                  onChangeText={handlePhoneChange}
                  placeholder="0123456789"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Number Plate</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.license_plate}
                  onChangeText={handleNumberPlateChange}
                  placeholder="ABC1234"
                  placeholderTextColor="#999"
                  autoCapitalize="characters"
                  maxLength={7}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>License Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.car_name}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, car_name: text })
                  }
                  placeholder="Enter license number"
                  placeholderTextColor="#999"
                  autoCapitalize="characters"
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={closeEditModal}
                  disabled={updating}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleUpdateProfile}
                  disabled={updating}
                >
                  {updating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileScreen;
