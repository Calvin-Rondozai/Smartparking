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
  ScrollView,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { authAPI, storage } from "../services/api";

const { width, height } = Dimensions.get("window");

const SignupScreen = ({ navigation }) => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [numberPlate, setNumberPlate] = useState("");
  const [carName, setCarName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

  // Handle phone number input - only 10 digits
  const handlePhoneChange = (text) => {
    const numericOnly = text.replace(/[^0-9]/g, "");
    if (numericOnly.length <= 10) {
      setPhoneNumber(numericOnly);
    }
  };

  // Handle email input - enforce proper email format
  const handleEmailChange = (text) => {
    const cleaned = text.toLowerCase().trim();
    const emailPattern = /^[a-z0-9._\-+]+$/i;

    if (cleaned === "" || emailPattern.test(cleaned) || cleaned.includes("@")) {
      setEmail(text);
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

    setNumberPlate(finalValue);
  };

  // Clear form when screen comes into focus
  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirm("");
      setFullName("");
      setPhoneNumber("");
      setNumberPlate("");
      setCarName("");
      setErrorMessage("");
      setSuccessMessage("");
    });

    return unsubscribe;
  }, [navigation]);

  const handleSignup = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (
      !username ||
      !email ||
      !password ||
      !confirm ||
      !fullName ||
      !phoneNumber ||
      !numberPlate ||
      !carName
    ) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    if (password !== confirm) {
      setErrorMessage("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long");
      return;
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      setErrorMessage("Phone number must be exactly 10 digits");
      return;
    }

    const plateRegex = /^[A-Z]{3}[0-9]{4}$/;
    if (!plateRegex.test(numberPlate)) {
      setErrorMessage(
        "Number plate must be in format ABC1234 (3 letters + 4 numbers)"
      );
      return;
    }

    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    if (!emailRegex.test(email)) {
      setErrorMessage(
        "Please enter a valid email address (e.g., user@example.com)"
      );
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.signup({
        username: username,
        email: email,
        password: password,
        fullName: fullName,
        phoneNumber: phoneNumber,
        numberPlate: numberPlate,
        carName: carName,
      });

      setSuccessMessage("Account created successfully! Please sign in.");
      setTimeout(() => {
        navigation.navigate("Login");
      }, 1500);
    } catch (error) {
      console.error("Signup error:", error);
      setErrorMessage(
        error.response?.data?.error ||
          "Failed to create account. Please try again."
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
                  <Text style={styles.createAccountTitle}>Create Account</Text>
                  <Text style={styles.welcomeSubtext}>
                    Sign up to get started
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
                      <Text style={styles.inputLabel}>Full Name</Text>
                      <TextInput
                        style={styles.textInput}
                        value={fullName}
                        onChangeText={setFullName}
                        placeholder="Enter your full name"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="words"
                        autoCorrect={false}
                        spellCheck={false}
                        returnKeyType="next"
                        editable={true}
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Email Address</Text>
                      <TextInput
                        style={styles.textInput}
                        value={email}
                        onChangeText={handleEmailChange}
                        placeholder="Enter your email"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        returnKeyType="next"
                        editable={true}
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Phone Number</Text>
                      <TextInput
                        style={styles.textInput}
                        value={phoneNumber}
                        onChangeText={handlePhoneChange}
                        placeholder="0123456789"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="phone-pad"
                        maxLength={10}
                        autoCorrect={false}
                        spellCheck={false}
                        returnKeyType="next"
                        editable={true}
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Number Plate</Text>
                      <TextInput
                        style={styles.textInput}
                        value={numberPlate}
                        onChangeText={handleNumberPlateChange}
                        placeholder="ABC1234"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="characters"
                        maxLength={7}
                        autoCorrect={false}
                        spellCheck={false}
                        returnKeyType="next"
                        editable={true}
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>License Number</Text>
                      <TextInput
                        style={styles.textInput}
                        value={carName}
                        onChangeText={setCarName}
                        placeholder="Enter your license number"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="characters"
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
                        returnKeyType="next"
                        editable={true}
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Confirm Password</Text>
                      <TextInput
                        style={styles.textInput}
                        value={confirm}
                        onChangeText={setConfirm}
                        placeholder="Confirm your password"
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
                    style={styles.signupButton}
                    onPress={handleSignup}
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
                        {loading ? "Creating Account..." : "Create Account"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate("Login")}
                    style={styles.loginLink}
                  >
                    <Text style={styles.loginText}>
                      Already have an account?{" "}
                      <Text style={styles.loginBold}>Sign In</Text>
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.termsContainer}>
                  <Text style={styles.termsText}>
                    By creating an account, you agree to our{" "}
                    <Text
                      style={styles.termsLink}
                      onPress={() => navigation.navigate("TermsAndConditions")}
                    >
                      Terms & Conditions
                    </Text>
                  </Text>
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
    top: height * 0.5,
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
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  container: {
    flex: 1,
    justifyContent: "center",
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
  createAccountTitle: {
    fontSize: 42,
    fontWeight: "800",
    color: "#10B981",
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
    marginBottom: 20,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
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
  messageContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
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
  signupButton: {
    borderRadius: 14,
    overflow: "hidden",
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
  loginLink: {
    marginTop: 8,
    alignItems: "center",
  },
  loginText: {
    color: "#6B7280",
    fontSize: 15,
  },
  loginBold: {
    fontWeight: "700",
    color: "#10B981",
  },
  termsContainer: {
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  termsText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  termsLink: {
    color: "#10B981",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});

export default SignupScreen;
