import React, { useContext, useEffect, useState } from "react";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";
import { Platform } from "react-native";
import notificationService from "./services/notificationService";
import iotOvertimeService from "./services/iotOvertimeService";
import { authAPI } from "./services/api";

// Screens
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import BookingScreen from "./screens/BookingScreen"; // Your booking page
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SignupScreen from "./screens/SignupScreen";
import SuccessScreen from "./screens/SuccessScreen";
import ProfileScreen from "./screens/ProfileScreen";
import MyBookingScreen from "./screens/MyBookingScreen"; // My Bookings with overtime display
import ChatbotScreen from "./screens/ChatbotScreen";
import TopUpScreen from "./screens/TopUpScreen";
import ReceiptScreen from "./screens/ReceiptScreen";
import TermsAndConditionsScreen from "./screens/TermsAndConditionsScreen";
import LoadingScreen from "./screens/LoadingScreen";

// Theme
import { ThemeProvider, ThemeContext } from "./ThemeContext";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { isDark } = useContext(ThemeContext);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === "Home") iconName = "home-outline";
          else if (route.name === "Bookings") iconName = "calendar-outline";
          else if (route.name === "History") iconName = "time-outline";
          else if (route.name === "Calvin") iconName = "chatbubbles-outline";
          else if (route.name === "Settings") iconName = "settings-outline";

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#1E8449",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          backgroundColor: isDark ? "#111" : "#fff",
          borderTopColor: isDark ? "#333" : "#ccc",
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Bookings" component={MyBookingScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen
        name="Chat"
        component={ChatbotScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { isDark } = useContext(ThemeContext);
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const authStatus = await authAPI.getAuthStatus();
        setIsAuthenticated(authStatus.isAuthenticated);
        console.log("[App] Auth status checked:", authStatus.isAuthenticated);

        // Initialize IoT overtime service if authenticated
        if (authStatus.isAuthenticated) {
          console.log("[App] Initializing IoT overtime service...");
          iotOvertimeService.startMonitoring();
        }
      } catch (error) {
        console.error("[App] Error checking auth status:", error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();

    // Cleanup IoT overtime service on app unmount
    return () => {
      iotOvertimeService.stopMonitoring();
    };
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="BookingPage" component={BookingScreen} />
        <Stack.Screen name="TopUp" component={TopUpScreen} />
        <Stack.Screen name="Receipt" component={ReceiptScreen} />
        <Stack.Screen
          name="TermsAndConditions"
          component={TermsAndConditionsScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // Initialize notifications when app starts
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("App: Starting app initialization...");

        // Check device capabilities
        console.log("App: Device info:", {
          isDevice: Device.isDevice,
          platform: Platform.OS,
          version: Platform.Version,
        });

        // Initialize app
        console.log("App: Initializing app...");

        // Initialize notifications
        const result = await notificationService.initialize();
        console.log("App: Notifications initialization result:", result);

        if (result) {
          console.log("App: Notifications initialized successfully");
        } else {
          console.warn("App: Notifications initialization failed");
        }
      } catch (error) {
        console.error("App: Error initializing app:", error);
      }
    };

    initializeApp();
  }, []);

  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
