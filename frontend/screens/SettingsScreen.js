import React, { useState, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { ThemeContext } from "../ThemeContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { authAPI } from "../services/api";
import notificationService from "../services/notificationService";
import voiceFeedbackService from "../services/voiceFeedbackService";

const SettingsScreen = ({ navigation }) => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceFeedbackEnabled, setVoiceFeedbackEnabled] = useState(true);

  const backgroundColor = isDark ? "#121212" : "#FFFFFF";
  const textColor = isDark ? "#FFFFFF" : "#000000";
  const cardBackground = isDark ? "#1E1E1E" : "#F8F9FA";
  const borderColor = isDark ? "#333333" : "#E0E0E0";

  const handleVoiceFeedbackToggle = async (value) => {
    setVoiceFeedbackEnabled(value);
    voiceFeedbackService.setEnabled(value);
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "All fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      await authAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      Alert.alert("Success", "Password changed successfully", [
        {
          text: "OK",
          onPress: () => {
            setShowPasswordModal(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
          },
        },
      ]);
    } catch (error) {
      Alert.alert(
        "Error",
        error.response?.data?.error || "Failed to change password"
      );
    } finally {
      setLoading(false);
    }
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
  }) => (
    <TouchableOpacity
      style={[
        styles.settingItem,
        { backgroundColor: cardBackground, borderColor },
      ]}
      onPress={onPress}
    >
      <View style={styles.settingItemLeft}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? "#333" : "#E8F5E8" },
          ]}
        >
          <Ionicons name={icon} size={20} color="#1E8449" />
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: textColor }]}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[
                styles.settingSubtitle,
                { color: isDark ? "#AAA" : "#666" },
              ]}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {showArrow && (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isDark ? "#AAA" : "#666"}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: textColor }]}>Settings</Text>
            <Text
              style={[styles.subtitle, { color: isDark ? "#AAA" : "#666" }]}
            >
              Manage your account preferences
            </Text>
          </View>

          {/* Account Settings */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Account
            </Text>

            <SettingItem
              icon="person-outline"
              title="Profile"
              subtitle="View and edit your profile information"
              onPress={() => navigation.navigate("Profile")}
            />

            <SettingItem
              icon="lock-closed-outline"
              title="Change Password"
              subtitle="Update your account password"
              onPress={() => setShowPasswordModal(true)}
            />
          </View>

          {/* App Settings */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              App Settings
            </Text>

            <View
              style={[
                styles.settingItem,
                { backgroundColor: cardBackground, borderColor },
              ]}
            >
              <View style={styles.settingItemLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: isDark ? "#333" : "#E8F5E8" },
                  ]}
                >
                  <Ionicons name="moon-outline" size={20} color="#1E8449" />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: textColor }]}>
                    Dark Mode
                  </Text>
                  <Text
                    style={[
                      styles.settingSubtitle,
                      { color: isDark ? "#AAA" : "#666" },
                    ]}
                  >
                    Switch between light and dark themes
                  </Text>
                </View>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: "#767577", true: "#1E8449" }}
                thumbColor={isDark ? "#f4f3f4" : "#f4f3f4"}
              />
            </View>
          </View>

          {/* Voice Feedback Setting */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Accessibility
            </Text>

            <View
              style={[
                styles.settingItem,
                { backgroundColor: cardBackground, borderColor },
              ]}
            >
              <View style={styles.settingLeft}>
                <View
                  style={[
                    styles.settingIcon,
                    {
                      backgroundColor: voiceFeedbackEnabled
                        ? "#1E8449"
                        : "#666",
                    },
                  ]}
                ></View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: textColor }]}>
                    Voice Feedback
                  </Text>
                  <Text
                    style={[
                      styles.settingSubtitle,
                      { color: isDark ? "#AAA" : "#666" },
                    ]}
                  >
                    Audio feedback for parking events
                  </Text>
                </View>
              </View>
              <Switch
                value={voiceFeedbackEnabled}
                onValueChange={handleVoiceFeedbackToggle}
                trackColor={{ false: "#767577", true: "#1E8449" }}
                thumbColor={voiceFeedbackEnabled ? "#f4f3f4" : "#f4f3f4"}
              />
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              About
            </Text>

            <SettingItem
              icon="information-circle-outline"
              title="App Version"
              subtitle="Smart Parking v1.0.0"
              onPress={() => {}}
              showArrow={false}
            />

            <SettingItem
              icon="help-circle-outline"
              title="Help & Support"
              subtitle="Get help and contact support"
              onPress={() =>
                Alert.alert(
                  "Help",
                  "Contact support at rondozaicalvin@gmail.com"
                )
              }
            />
          </View>
        </ScrollView>

        {/* Password Change Modal */}
        <Modal
          visible={showPasswordModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowPasswordModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[styles.modalContent, { backgroundColor: cardBackground }]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  Change Password
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowPasswordModal(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  <Ionicons name="close" size={24} color={textColor} />
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: textColor }]}>
                  Current Password
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? "#333" : "#F0F0F0",
                      color: textColor,
                      borderColor,
                    },
                  ]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="Enter current password"
                  placeholderTextColor={isDark ? "#AAA" : "#666"}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: textColor }]}>
                  New Password
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? "#333" : "#F0F0F0",
                      color: textColor,
                      borderColor,
                    },
                  ]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="Enter new password"
                  placeholderTextColor={isDark ? "#AAA" : "#666"}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: textColor }]}>
                  Confirm New Password
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? "#333" : "#F0F0F0",
                      color: textColor,
                      borderColor,
                    },
                  ]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Confirm new password"
                  placeholderTextColor={isDark ? "#AAA" : "#666"}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.changePasswordButton,
                  { opacity: loading ? 0.6 : 1 },
                ]}
                onPress={handlePasswordChange}
                disabled={loading}
              >
                <Text style={styles.changePasswordButtonText}>
                  {loading ? "Changing..." : "Change Password"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  changePasswordButton: {
    backgroundColor: "#1E8449",
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  changePasswordButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default SettingsScreen;
