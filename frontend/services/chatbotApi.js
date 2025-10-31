import api from "./api";

// Chatbot service - thin wrapper around backend endpoints
const chatbotAPI = {
  getCurrentBooking: async () => {
    const res = await api.get("/chatbot/current-booking/");
    return res.data;
  },

  getBookingHistory: async ({ window = "days", value = 7 } = {}) => {
    const res = await api.get(
      `/chatbot/booking-history/?window=${window}&value=${value}`
    );
    return res.data;
  },

  getAvailableSlots: async () => {
    const res = await api.get("/chatbot/available-slots/");
    return res.data;
  },

  reserveSlot: async ({ slot_id, duration_minutes = 60 }) => {
    try {
      const res = await api.post("/chatbot/reserve/", {
        slot_id,
        duration_minutes,
      });
      return res.data;
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        "Reservation failed";
      throw new Error(msg);
    }
  },

  getHelp: async () => {
    const res = await api.get("/chatbot/help/");
    return res.data;
  },

  submitReport: async ({ message, type = "user_report", priority = "medium" }) => {
    try {
      const res = await api.post("/admin/reports/", {
        message,
        type,
        priority,
      });
      return res.data;
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        "Report submission failed";
      throw new Error(msg);
    }
  },
};

export default chatbotAPI;
