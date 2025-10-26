import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Fallback storage if AsyncStorage fails
const fallbackStorage = {
  authToken: null,
  userData: null,
};

// Base API URL
// Base API URL - Use your computer's IP address for React Native
export const API_BASE_URL = "http://169.254.156.223:8000/api"; // Local development
// const API_BASE_URL = "http://localhost:8000/api"; // For local testing
// const API_BASE_URL = "http://10.200.27.32:8000/api"; // For Android emulator (Wi-Fi)
// const API_BASE_URL = "http://192.168.137.1:8000/api"; // For Android emulator (Hotspot)
// const API_BASE_URL = "http://localhost:8000/api"; // For iOS simulator

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 second timeout
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      // Don't add token for authentication endpoints
      if (
        config.url.includes("/auth/signin/") ||
        config.url.includes("/auth/signup/") ||
        config.url.includes("/auth/forgot-password/") ||
        config.url.includes("/auth/reset-password/")
      ) {
        console.log(
          `[API] Auth endpoint - no token needed for ${config.method} ${config.url}`
        );
        return config;
      }

      const token = await AsyncStorage.getItem("authToken");
      console.log(`[API] Request to ${config.method} ${config.url}`);
      console.log(
        `[API] Token from AsyncStorage: ${token ? "Found" : "Not found"}`
      );

      if (token) {
        config.headers.Authorization = `Token ${token}`;
        console.log(
          "[API] Auth token attached:",
          token.substring(0, 10) + "...",
          "for",
          config.method,
          config.url
        );
      } else {
        // Only warn for protected endpoints, not for public ones
        if (
          config.url.includes("/bookings/") ||
          config.url.includes("/auth/profile/") ||
          config.url.includes("/wallet/")
        ) {
          console.warn(
            "[API] No auth token found for protected endpoint:",
            config.method,
            config.url
          );
        }
      }
    } catch (error) {
      console.error("Error getting auth token:", error);
      if (fallbackStorage.authToken) {
        config.headers.Authorization = `Token ${fallbackStorage.authToken}`;
        console.log(
          "[API] Fallback token attached:",
          fallbackStorage.authToken.substring(0, 10) + "...",
          "for",
          config.method,
          config.url
        );
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      const url = error.config?.url || "";
      // Only log auth errors for protected endpoints
      if (
        url.includes("/bookings/") ||
        url.includes("/auth/profile/") ||
        url.includes("/auth/verify/") ||
        url.includes("/wallet/")
      ) {
        console.warn(
          `[API] Auth error (${error.response?.status}) for protected endpoint: ${url}`
        );
      }
    }
    return Promise.reject(error);
  }
);

// Clear authentication data
export const clearAuthData = async () => {
  try {
    await AsyncStorage.removeItem("authToken");
    await AsyncStorage.removeItem("userData");
    fallbackStorage.authToken = null;
    fallbackStorage.userData = null;
    console.log("[API] Auth data cleared");
  } catch (error) {
    console.error("Error clearing auth data:", error);
  }
};

// Don't clear auth data on app start - let the user stay logged in
// clearAuthData();

// Auth API
export const authAPI = {
  // Sign up
  signup: async (userData) => {
    const response = await api.post("/auth/signup/", userData);
    return response.data;
  },

  // Sign in
  signin: async (credentials) => {
    const response = await api.post("/auth/signin/", credentials);
    const data = response.data;

    if (data.token) {
      await AsyncStorage.setItem("authToken", data.token);
      await AsyncStorage.setItem("userData", JSON.stringify(data.user));
      fallbackStorage.authToken = data.token;
      fallbackStorage.userData = data.user;
      console.log("[API] Auth token saved successfully");
    }

    return data;
  },

  // Sign out
  signout: async () => {
    try {
      await api.post("/auth/signout/");
    } catch (error) {
      console.log("[API] Signout error (non-critical):", error.message);
    } finally {
      await AsyncStorage.removeItem("authToken");
      await AsyncStorage.removeItem("userData");
      fallbackStorage.authToken = null;
      fallbackStorage.userData = null;
      console.log("[API] Auth data cleared");
    }
  },

  // Verify authentication
  verifyAuth: async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        console.log("[API] No auth token found");
        return { isAuthenticated: false };
      }

      const response = await api.get("/auth/verify/");
      return response.data;
    } catch (error) {
      console.log("[API] Auth verification failed:", error.message);
      // Don't clear auth data here, let the user handle it
      return { isAuthenticated: false };
    }
  },

  // Refresh auth token
  refreshAuth: async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const userData = await AsyncStorage.getItem("userData");

      if (token && userData) {
        fallbackStorage.authToken = token;
        fallbackStorage.userData = JSON.parse(userData);
        console.log("[API] Auth token refreshed from storage");
        return { isAuthenticated: true, user: JSON.parse(userData) };
      }

      return { isAuthenticated: false };
    } catch (error) {
      console.error("[API] Error refreshing auth:", error);
      return { isAuthenticated: false };
    }
  },

  // Force re-authentication
  forceReAuth: async () => {
    try {
      await AsyncStorage.removeItem("authToken");
      await AsyncStorage.removeItem("userData");
      fallbackStorage.authToken = null;
      fallbackStorage.userData = null;
      console.log("[API] Forced re-authentication - auth data cleared");
      return true;
    } catch (error) {
      console.error("[API] Error forcing re-authentication:", error);
      return false;
    }
  },

  // Get current auth status
  getAuthStatus: async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const userData = await AsyncStorage.getItem("userData");

      if (token && userData) {
        return { isAuthenticated: true, user: JSON.parse(userData) };
      }

      return { isAuthenticated: false };
    } catch (error) {
      console.error("[API] Error getting auth status:", error);
      return { isAuthenticated: false };
    }
  },

  // Check if user is authenticated
  isAuthenticated: async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      return !!token;
    } catch (error) {
      console.error("[API] Error checking authentication:", error);
      return false;
    }
  },

  // Get user profile
  getProfile: async () => {
    const response = await api.get("/auth/profile/");
    return response.data;
  },

  // Update user profile
  updateProfile: async (profileData) => {
    try {
      const response = await api.put("/auth/profile/update/", profileData);
      console.log("[authAPI.updateProfile] PUT success", response.data);
      return response.data;
    } catch (error) {
      console.error(
        "[authAPI.updateProfile] PUT error:",
        error,
        error?.response?.data
      );
      throw error;
    }
  },

  // Change password
  changePassword: async (passwordData) => {
    const response = await api.post("/auth/change-password/", passwordData);
    return response.data;
  },

  // Forgot password - reset using license number and number plate
  forgotPassword: async ({ license_number, number_plate, new_password }) => {
    try {
      const response = await api.post("/auth/forgot-password/", {
        license_number,
        number_plate,
        new_password,
      });
      return response.data;
    } catch (error) {
      console.error("Forgot password API error:", error);
      throw error;
    }
  },
};

// Parking API
export const parkingAPI = {
  // Get parking statistics
  getStats: async () => {
    const response = await api.get("/stats/");
    return response.data;
  },

  // Get all parking lots
  getParkingLots: async () => {
    const response = await api.get("/parking-lots/");
    return response.data;
  },

  // Get parking lot details
  getParkingLot: async (id) => {
    const response = await api.get(`/parking-lots/${id}/`);
    return response.data;
  },

  // Get all parking spots
  getParkingSpots: async () => {
    const response = await api.get("/parking-spots/");
    return response.data;
  },

  // Get parking spot details
  getParkingSpot: async (id) => {
    const response = await api.get(`/parking-spots/${id}/`);
    return response.data;
  },
};

// Booking API
export const bookingAPI = {
  // Get user bookings
  getBookings: async () => {
    const response = await api.get("/bookings/");
    return response.data;
  },

  // Create new booking
  createBooking: async (bookingData) => {
    const response = await api.post("/bookings/", bookingData);
    const created = response.data;
    // Fire-and-forget: notify admin alerts if endpoint exists
    try {
      await alertsAPI.create({
        type: "info",
        title: "Booking Created",
        message: `New booking for ${
          created?.slot_name || created?.slot || created?.spot || "a slot"
        } by ${
          created?.user?.full_name ||
          created?.user?.email ||
          created?.user ||
          "User"
        }`,
        created_at: new Date().toISOString(),
        booking_id: created?.id,
      });
    } catch (e) {
      // Non-blocking
      console.log("[bookingAPI] Alert post skipped:", e?.message || e);
    }
    return created;
  },

  // Get booking details
  getBooking: async (id) => {
    const response = await api.get(`/bookings/${id}/`);
    return response.data;
  },

  // Get booking overtime information
  getBookingOvertime: async (id) => {
    const response = await api.get(`/bookings/${id}/overtime/`);
    return response.data;
  },

  // Check and bill overtime
  checkAndBillOvertime: async (id) => {
    try {
      const response = await api.post(`/bookings/${id}/overtime/check/`);
      return response.data;
    } catch (error) {
      // Handle network errors and other issues gracefully
      if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
        console.log(
          `Network error checking overtime for booking ${id}, returning default values`
        );
        return {
          overtime_minutes: 0,
          overtime_cost: 0.0,
          is_overtime: false,
          message: "Network error - using fallback values",
        };
      }

      // Handle 400 error gracefully (booking not active or not expired)
      if (error.response?.status === 400) {
        console.log(
          `Booking ${id} not eligible for overtime check:`,
          error.response.data
        );
        return {
          overtime_minutes: 0,
          overtime_cost: 0.0,
          is_overtime: false,
          message:
            error.response.data?.error || "Booking not eligible for overtime",
        };
      }
      console.error("Error checking overtime billing:", error);
      throw error;
    }
  },

  // Check all overtime bookings
  checkAllOvertimeBookings: async () => {
    try {
      const response = await api.post("/bookings/overtime/check-all/");
      return response.data;
    } catch (error) {
      console.error("Error checking all overtime bookings:", error);
      throw error;
    }
  },

  // Complete overtime booking
  completeOvertimeBooking: async (id) => {
    try {
      const response = await api.post(`/bookings/${id}/overtime/complete/`);
      return response.data;
    } catch (error) {
      console.error("Error completing overtime booking:", error);
      throw error;
    }
  },

  // Get active overtime bookings
  getActiveOvertimeBookings: async () => {
    try {
      const response = await api.get("/bookings/overtime/active/");
      return response.data;
    } catch (error) {
      console.error("Error getting active overtime bookings:", error);
      throw error;
    }
  },

  // Extend booking
  extendBooking: async (id, additionalMinutes) => {
    const response = await api.post(`/bookings/${id}/extend/`, {
      additional_minutes: additionalMinutes,
    });
    return response.data;
  },

  // Detect car parked (for grace period)
  detectCarParked: async (bookingId) => {
    const response = await api.post(`/bookings/${bookingId}/detect-car/`);
    return response.data;
  },

  // Cancel booking
  cancelBooking: async (id) => {
    const response = await api.post(`/bookings/${id}/cancel/`);
    return response.data;
  },

  // Complete active booking (finalize and deduct wallet)
  completeActiveBooking: async (id) => {
    const response = await api.post(`/bookings/${id}/complete/`);
    return response.data;
  },

  // Get LED/RGB light status for a parking spot
  getParkingSpotLedStatus: async (spotNumber) => {
    try {
      const response = await api.get(
        `/parking-spots/${spotNumber}/led-status/`
      );
      return response.data;
    } catch (error) {
      console.error(`Error getting LED status for spot ${spotNumber}:`, error);

      // Handle network errors gracefully
      if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
        return {
          spot_number: spotNumber,
          led_status: "off",
          led_color: "none",
          led_message: "Network error - cannot check LED status",
          is_occupied: false,
          has_active_booking: false,
          sensor_data: null,
        };
      }

      throw error;
    }
  },
};

// Wallet API
export const walletAPI = {
  // Get wallet balance and recent transactions
  getWallet: async () => {
    const response = await api.get(`/wallet/`);
    return response.data;
  },

  // Top-up wallet (simulated)
  topUp: async (amount, method) => {
    const response = await api.post(`/wallet/top-up/`, { amount, method });
    return response.data;
  },

  // Charge wallet by explicit amount (fallback path using receipt total)
  charge: async ({ amount, bookingId, note }) => {
    const response = await api.post(`/wallet/charge/`, {
      amount,
      booking_id: bookingId,
      note,
    });
    return response.data;
  },
};

// Alerts API (best-effort)
export const alertsAPI = {
  create: async (alert) => {
    const candidates = [
      "/admin/alerts/", // preferred admin route
      "/alerts/", // generic alerts route
      "/iot/alerts/", // iot namespace
    ];
    let lastError;
    for (const path of candidates) {
      try {
        const res = await api.post(path, alert);
        return res.data;
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    throw lastError || new Error("No alerts endpoint available");
  },
};

// Storage helpers
export const storage = {
  // Save auth data
  saveAuthData: async (token, userData) => {
    try {
      await AsyncStorage.setItem("authToken", token);
      await AsyncStorage.setItem("userData", JSON.stringify(userData));
    } catch (error) {
      console.error("Error saving auth data:", error);
      // Use fallback storage
      fallbackStorage.authToken = token;
      fallbackStorage.userData = userData;
    }
  },

  // Get auth data
  getAuthData: async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const userData = await AsyncStorage.getItem("userData");
      const parsedUserData = userData ? JSON.parse(userData) : null;

      // Return user data directly for easier access
      return {
        token,
        user: parsedUserData,
        ...parsedUserData, // Spread user data for direct access
      };
    } catch (error) {
      console.error("Error getting auth data:", error);
      return { token: null, user: null };
    }
  },

  // Clear auth data
  clearAuthData: async () => {
    try {
      await AsyncStorage.removeItem("authToken");
      await AsyncStorage.removeItem("userData");
    } catch (error) {
      console.error("Error clearing auth data:", error);
    }
  },

  // Booking snapshots (client-only, used by mobile History)
  saveBookingSnapshot: async (bookingId, snapshot) => {
    try {
      if (!bookingId) return;
      const key = "bookingSnapshots";
      const raw = await AsyncStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      map[String(bookingId)] = {
        ...(map[String(bookingId)] || {}),
        ...snapshot,
        saved_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(map));
    } catch (error) {
      console.error("Error saving booking snapshot:", error);
    }
  },

  getBookingSnapshots: async () => {
    try {
      const raw = await AsyncStorage.getItem("bookingSnapshots");
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.error("Error loading booking snapshots:", error);
      return {};
    }
  },
};

export default api;
