import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { authAPI, storage } from "../services/api";

const { width, height } = Dimensions.get("window");

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [numberPlate, setNumberPlate] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Animation values
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;
  const floatAnim3 = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Floating animations for background circles
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim1, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim1, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim2, {
          toValue: 1,
          duration: 10000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim2, {
          toValue: 0,
          duration: 10000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim3, {
          toValue: 1,
          duration: 12000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim3, {
          toValue: 0,
          duration: 12000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Entry animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setUsername("");
      setPassword("");
      setErrorMessage("");
      setSuccessMessage("");
      setShowForgot(false);
      setForgotUsername("");
      setLicenseNumber("");
      setNumberPlate("");
      setNewPassword("");
    });
    return unsubscribe;
  }, [navigation]);

  const handleLogin = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!username || !password) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErrorMessage("Please enter a valid username");
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.signin({
        username: trimmedUsername,
        password: password,
      });
      console.log("[Login] signin response:", response);

      if (!response.token) {
        setErrorMessage("Login failed: No token received from server.");
        setLoading(false);
        return;
      }

      const userData = {
        ...response.user,
        ...response.profile,
      };

      try {
        await storage.saveAuthData(response.token, userData);
        console.log("[Login] Token saved:", response.token);
        console.log("[Login] User data saved:", userData);
      } catch (saveError) {
        console.error("[Login] Error saving auth data:", saveError);
        setErrorMessage("Login failed: Could not save auth data.");
        setLoading(false);
        return;
      }

      setSuccessMessage("Authentication successful!");
      setTimeout(() => {
        navigation.navigate("Main");
      }, 1000);
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage(
        error.response?.data?.error || "Invalid credentials. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!licenseNumber || !numberPlate || !newPassword) {
      setErrorMessage(
        "Please fill in license number, number plate, and new password"
      );
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.forgotPassword({
        license_number: licenseNumber,
        number_plate: numberPlate,
        new_password: newPassword,
      });

      setSuccessMessage(
        "Password reset successful! You can now login with your new password."
      );
      setShowForgot(false);
      setForgotUsername("");
      setLicenseNumber("");
      setNumberPlate("");
      setNewPassword("");
    } catch (error) {
      console.error("Forgot password error:", error);
      setErrorMessage(
        error.response?.data?.error ||
          "Failed to reset password. Please check your license number and number plate, or try the identity reset method below."
      );
    } finally {
      setLoading(false);
    }
  };

  const translateY1 = floatAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 40],
  });

  const translateX2 = floatAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 30],
  });

  const translateY3 = floatAnim3.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -35],
  });

  return (
    <View style={styles.background}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Animated Background Elements */}
      <View style={styles.backgroundDecorations}>
        <Animated.View
          style={[
            styles.floatingCircle,
            styles.circle1,
            {
              transform: [
                { translateY: translateY1 },
                {
                  translateX: floatAnim1.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 20],
                  }),
                },
              ],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.floatingCircle,
            styles.circle2,
            { transform: [{ translateX: translateX2 }] },
          ]}
        />

        <Animated.View
          style={[
            styles.floatingCircle,
            styles.circle3,
            { transform: [{ translateY: translateY3 }] },
          ]}
        />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoid}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              style={[
                styles.container,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.formContainer}>
                <View style={styles.card}>
                  <Text style={styles.signinTitle}>Sign In</Text>
                  <Text style={styles.welcomeText}>Welcome Back</Text>
                  <Text style={styles.welcomeSubtext}>
                    Sign in to your account
                  </Text>

                  <View style={styles.inputContainer}>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Username</Text>
                      <TextInput
                        style={styles.textInput}
                        value={username}
                        onChangeText={setUsername}
                        placeholder="Enter your username"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        returnKeyType="next"
                        editable={true}
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Password</Text>
                      <TextInput
                        style={styles.textInput}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter your password"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        returnKeyType="done"
                        editable={true}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.forgotPassword}
                    onPress={() => setShowForgot(!showForgot)}
                  >
                    <Text style={styles.forgotPasswordText}>
                      {showForgot ? "Hide Reset" : "Forgot Password?"}
                    </Text>
                  </TouchableOpacity>

                  {showForgot && (
                    <View style={styles.forgotCard}>
                      <Text style={styles.forgotTitle}>Reset Password</Text>
                      <Text style={styles.forgotSubtitle}>
                        Enter your license number and number plate to reset your
                        password
                      </Text>

                      <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>License Number</Text>
                        <TextInput
                          style={styles.textInput}
                          value={licenseNumber}
                          onChangeText={setLicenseNumber}
                          placeholder="Enter your license number"
                          placeholderTextColor="#9CA3AF"
                          autoCapitalize="characters"
                          autoCorrect={false}
                          spellCheck={false}
                          returnKeyType="next"
                        />
                      </View>

                      <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Number Plate</Text>
                        <TextInput
                          style={styles.textInput}
                          value={numberPlate}
                          onChangeText={setNumberPlate}
                          placeholder="Enter your number plate (e.g., ABC-1234)"
                          placeholderTextColor="#9CA3AF"
                          autoCapitalize="characters"
                          autoCorrect={false}
                          spellCheck={false}
                          returnKeyType="next"
                        />
                      </View>

                      <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>New Password</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="Enter new password (min 6 characters)"
                          placeholderTextColor="#9CA3AF"
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          returnKeyType="done"
                        />
                      </View>

                      <TouchableOpacity
                        style={styles.loginButton}
                        onPress={handleForgotPassword}
                        activeOpacity={0.8}
                        disabled={loading}
                      >
                        <LinearGradient
                          colors={["#10B981", "#059669"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.buttonGradient}
                        >
                          <Text style={styles.buttonText}>
                            {loading ? "Processing..." : "Reset Password"}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}

                  {errorMessage ? (
                    <View style={styles.messageContainer}>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}

                  {successMessage ? (
                    <View style={styles.messageContainer}>
                      <Text style={styles.successText}>{successMessage}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.loginButton}
                    onPress={handleLogin}
                    activeOpacity={0.8}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={["#10B981", "#059669"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>
                        {loading ? "Signing In..." : "Sign In"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate("Signup")}
                    style={styles.signupLink}
                  >
                    <Text style={styles.signupText}>
                      Don't have an account?{" "}
                      <Text style={styles.signupBold}>Sign Up</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#F0FDF4",
    width: width,
    height: height,
  },
  backgroundDecorations: {
    position: "absolute",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  floatingCircle: {
    position: "absolute",
    borderRadius: 9999,
    backgroundColor: "rgba(16, 185, 129, 0.06)",
  },
  circle1: {
    width: 400,
    height: 400,
    top: -150,
    right: -100,
  },
  circle2: {
    width: 300,
    height: 300,
    bottom: -100,
    left: -100,
  },
  circle3: {
    width: 200,
    height: 200,
    top: height * 0.4,
    right: -50,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    minHeight: height,
    paddingHorizontal: 24,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  formContainer: {
    alignItems: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 36,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 20,
    },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 15,
  },
  signinTitle: {
    fontSize: 42,
    fontWeight: "800",
    color: "#10B981",
    textAlign: "center",
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 4,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputWrapper: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    height: 54,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 18,
    fontSize: 16,
    color: "#1F2937",
    backgroundColor: "#FAFAFA",
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "600",
  },
  messageContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  forgotCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  forgotTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  forgotSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    textAlign: "center",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  successText: {
    color: "#059669",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  loginButton: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#10B981",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  signupLink: {
    marginTop: 8,
    alignItems: "center",
  },
  signupText: {
    color: "#6B7280",
    fontSize: 15,
  },
  signupBold: {
    fontWeight: "700",
    color: "#10B981",
  },
});

export default LoginScreen;
