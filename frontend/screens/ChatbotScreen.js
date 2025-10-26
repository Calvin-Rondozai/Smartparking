import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useContext,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../ThemeContext";
import iotService from "../services/iotApi";
import { bookingAPI, walletAPI } from "../services/api";
import chatbotAPI from "../services/chatbotApi";
import notificationService from "../services/notificationService";
import iotOvertimeService from "../services/iotOvertimeService";

export default function ChatbotScreen() {
  const navigation = useNavigation();
  const { theme, isDark } = useContext(ThemeContext);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState({ mode: "idle", pendingSlot: null });
  const [menuMode, setMenuMode] = useState(false);
  const listRef = useRef(null);
  // Track grace countdown timers per booking to avoid duplicates
  const graceTimersRef = useRef({});

  // Session language (en = English, sn = Shona, nd = Ndebele)
  const [language, setLanguage] = useState("en");
  const translations = {
    en: {
      greet: "Hi👋! I'm Calvin, your Smart Parking assistant!",
      menu: "What would you like to do?\n\n1️⃣ Book a slot\n2️⃣ Check current booking\n3️⃣ View booking history\n4️⃣ Search bookings by date\n5️⃣ Report an issue\n6️⃣ Help & Support\n7️⃣ Check balance\n8️⃣ Language\n\nJust type the number (1-8) to select an option!\n\n💡 Tip: Type 'menu' anytime to return here!",
      booked: (slot) =>
        `✅ Successfully booked Slot ${slot}!\n\n📱 Navigate to the "Current Bookings" page to view your booking details.`,
      expiry_warn: "...",
      left_slot: (amount) =>
        `🚗 You left the slot. Amount charged: $${amount.toFixed(2)}.`,
      receipt: (data) =>
        `🧾 PARKING RECEIPT\n━━━━━━━━━━━━━━━━━━━━\n📍 Slot: ${
          data.slot
        }\n🕐 Parked: ${data.startTime}\n🕑 Left: ${
          data.endTime
        }\n⏱️ Duration: ${data.duration}\n💰 Amount: $${data.amount.toFixed(
          2
        )}\n💳 Balance: $${data.balance.toFixed(
          2
        )}\n━━━━━━━━━━━━━━━━━━━━\n✅ Payment successful!\n\nThank you for using Smart Parking! 🚗`,
      balance_is: (bal) => `💳 Your wallet balance is $${bal.toFixed(2)}.`,
      choose_lang: "🌐 Choose language:\n \n1. English \n2. Shona \n3. Ndebele",
      lang_set: (l) => `✅ Language set to ${l}.`,
      available_intro: "🅿️ Here's what I have right now",
      tap_to_reserve: "👆 Tap a slot below to reserve.",
      occupied_start: "✅ Car parked successfully! Timer started.",
      parking_confirmed: (slot) =>
        `🚗 You're now parked in ${slot}!\n⏰ Timer is running - you'll be charged $1 per 30 seconds.\n🔴 Red light indicates your slot is occupied.`,
      no_booking: "❌ You don't have an active booking.",
      booking_cancelled: "✅ Booking cancelled successfully!",
      booking_extended: (minutes) =>
        `✅ Booking extended by ${minutes} minutes!`,
      no_bookings: "📋 You have no bookings yet.",
      no_slots: "🚫 No slots available right now.",
      slot_not_available: (slot) =>
        `❌ Slot ${slot} is not available right now.`,
      reservation_failed: "❌ Reservation failed. Please try again.",
      system_offline: "⚠️ Cannot perform action while IoT system is offline.",
      grace_countdown: (seconds) =>
        `⏳ ${seconds}s remaining in grace period...`,
      invalid_date: "❌ Please enter a valid date in YYYY-MM-DD format.",
      report_too_short:
        "❌ Please provide more details (at least 10 characters).",
      report_sent:
        "✅ Thank you for your report! I've forwarded it to the admin team.",
      report_failed: "❌ Sorry, there was an issue sending your report.",
      goodbye:
        "👋 Goodbye! Drive safe 🚗✨\n\nIf you need anything else, just say 'hi' or 'menu'!",
      help_message:
        "ℹ️ Here to help! Try saying: show available slots, reserve A, or my bookings.",
      invalid_option: "❌ Invalid option. Please type a number between 1-8.",
      didnt_understand:
        "🤔 I didn't understand that. Type 'menu' to see available options, or try:\n• 'book slot' - Make a reservation\n• 'my booking' - Check current booking\n• 'balance' - Check wallet balance",
    },
    sn: {
      greet: "Mhoro! Ndini Calvin, mubatsiri weSmart Parking! 🤖",
      menu: "Ungadei kuita?\n\n1️⃣ Bhuka slot\n2️⃣ Tarisa booking yazvino\n3️⃣ Ongorora nhoroondo\n4️⃣ Tsvaga ma bookings nezuva\n5️⃣ Tumira dambudziko\n6️⃣ Rubatsiro & Support\n7️⃣ Tarisa balance\n8️⃣ Mutauro\n\nNyora nhamba (1-8) kusarudza!\n\n💡 Nyora 'menu' kudzokera pano!",
      booked: (slot) =>
        `✅ Wabhuka pa Slot ${slot}!\n\n📱 Enda ku "Current Bookings" page kuti uone booking yako.`,
      expiry_warn: "⏰ Nguva yapera usati wapinda mu slot.",
      left_slot: (amount) =>
        `🚗 Wabuda pa slot. Wakabhadharwa: $${amount.toFixed(2)}.`,
      receipt: (data) =>
        `🧾 RECEIPT YE PARKING\n━━━━━━━━━━━━━━━━━━━━\n📍 Slot: ${
          data.slot
        }\n🕐 Wakapinda: ${data.startTime}\n🕑 Wabuda: ${
          data.endTime
        }\n⏱️ Nguva: ${data.duration}\n💰 Mari: $${data.amount.toFixed(
          2
        )}\n💳 Balance: $${data.balance.toFixed(
          2
        )}\n━━━━━━━━━━━━━━━━━━━━\n✅ Kubhadhara kwabudirira!\n\nTinokutenda kushandisa Smart Parking! 🚗`,
      balance_is: (bal) => `💳 Balance yako ndeye $${bal.toFixed(2)}.`,
      choose_lang: "🌐 Sarudza mutauro: 1) Chirungu 2) Shona 3) Ndebele",
      lang_set: (l) => `✅ Mutauro wasarudzwa: ${l}.`,
      available_intro: "🅿️ Zviripo pari zvino",
      tap_to_reserve: "👆 Dzvanya slot pasi apa kuti ubhuke.",
      occupied_start: "✅ Mota yakamira! Timer yatanga.",
      parking_confirmed: (slot) =>
        `🚗 Zvino wamira pa ${slot}!\n⏰ Timer iri kushanda - uchabhadharwa $1 pa30 seconds.\n🔴 Chiedza chitsvuku chinoratidzira kuti slot yako ine mota.`,
      no_booking: "❌ Hauna booking yauri kushandisa.",
      booking_cancelled: "✅ Booking yakanzurwa!",
      booking_extended: (minutes) =>
        `✅ Booking yakawedzerwa neminutes ${minutes}!`,
      no_bookings: "📋 Hauna ma bookings.",
      no_slots: "🚫 Hapana ma slots aripo pari zvino.",
      slot_not_available: (slot) =>
        `❌ Slot ${slot} haina kuwanikwa pari zvino.`,
      reservation_failed: "❌ Kubhuka kwakundikana. Edza zvakare.",
      system_offline: "⚠️ Haigone kuita izvi IoT system isiri kushanda.",
      grace_countdown: (seconds) => `⏳ ${seconds}s yasara mu grace period...`,
      invalid_date: "❌ Isa zuva rakanaka mu YYYY-MM-DD format.",
      report_too_short: "❌ Ipa mamwe mashoko (anoda 10 characters).",
      report_sent: "✅ Tinokutenda! Ndatumira report yako ku admin team.",
      report_failed: "❌ Pane dambudziko rekutumira report yako.",
      goodbye:
        "👋 Chisarai! Tyaira wakachengeteka 🚗✨\n\nKana uchida chimwe chinhu, iti 'hi' kana 'menu'!",
      help_message:
        "ℹ️ Ndiri pano kubatsira! Edza kuti: ratidza ma slots, bhuka A, kana ma bookings angu.",
      invalid_option: "❌ Nhamba isina kukwana. Isa nhamba iri pakati pe1-8.",
      didnt_understand:
        "🤔 Handina kunzwisisa izvo. Nyora 'menu' kuona zvinoitwa, kana:\n• 'book slot' - Bhuka nzvimbo\n• 'my booking' - Tarisa booking yako\n• 'balance' - Tarisa mari yako",
    },
    nd: {
      greet: "Sawubona! Ngingu Calvin, umsizi weSmart Parking! 🤖",
      menu: "Ufuna ukwenzani?\n\n1️⃣ Bhuka i-slot\n2️⃣ Bheka i-booking yamanje\n3️⃣ Bukela umlando\n4️⃣ Sesha ama booking ngosuku\n5️⃣ Bika inkinga\n6️⃣ Usizo & Support\n7️⃣ Bheka ibhalansi\n8️⃣ Ulimi\n\nBhala inombolo (1-8) ukukhetha!\n\n💡 Bhala 'menu' ukubuyela lapha!",
      booked: (slot) =>
        `✅ Ubukhile i-Slot ${slot}!\n\n📱 Hamba ku "Current Bookings" page ukubona i-booking yakho.`,
      expiry_warn: "⏰ Isikhathi siphelile ungakangenisi imoto.",
      left_slot: (amount) =>
        `🚗 Usushiyile i-slot. Ukhokhisiwe: $${amount.toFixed(2)}.`,
      receipt: (data) =>
        `🧾 I-RECEIPT YE PARKING\n━━━━━━━━━━━━━━━━━━━━\n📍 I-Slot: ${
          data.slot
        }\n🕐 Wangena: ${data.startTime}\n🕑 Waphuma: ${
          data.endTime
        }\n⏱️ Isikhathi: ${data.duration}\n💰 Imali: $${data.amount.toFixed(
          2
        )}\n💳 Ibhalansi: $${data.balance.toFixed(
          2
        )}\n━━━━━━━━━━━━━━━━━━━━\n✅ Ukukhokhela kuphumelele!\n\nSiyabonga ukusebenzisa Smart Parking! 🚗`,
      balance_is: (bal) => `💳 Ibhalaansi yakho $${bal.toFixed(2)}.`,
      choose_lang: "🌐 Khetha ulimi: 1) English 2) Shona 3) Ndebele",
      lang_set: (l) => `✅ Ulimi lubekiwe: ${l}.`,
      available_intro: "🅿️ Okukhona manje",
      tap_to_reserve: "👆 Thepha i-slot ngezansi ukuze ubhuke.",
      occupied_start: "✅ Imoto imisiwe! Isikhathi siqalile.",
      parking_confirmed: (slot) =>
        `🚗 Manje umisile e ${slot}!\n⏰ Isikhathi siyasebenza - uzakhokhiswa $1 nge30 seconds.\n🔴 Ukukhanya okubomvu kuveza ukuthi i-slot yakho inemoto.`,
      no_booking: "❌ Awunayo i-booking esebenzayo.",
      booking_cancelled: "✅ I-booking icinyiwe ngempumelelo!",
      booking_extended: (minutes) =>
        `✅ I-booking yelulwe ngemizuzu engu${minutes}!`,
      no_bookings: "📋 Awunayo ama-booking okwamanje.",
      no_slots: "🚫 Azikho izindawo ezitholakalayo manje.",
      slot_not_available: (slot) => `❌ I-Slot ${slot} ayitholakali manje.`,
      reservation_failed: "❌ Ukubhuka kuhlulekile. Zama futhi.",
      system_offline: "⚠️ Ngeke kwenziwe lokhu ngoba i-IoT system ayisebenzi.",
      grace_countdown: (seconds) => `⏳ ${seconds}s esele ku-grace period...`,
      invalid_date: "❌ Faka usuku olulungile nge-YYYY-MM-DD format.",
      report_too_short:
        "❌ Nikeza imininingwane eyengeziwe (okungenani amagama ayi-10).",
      report_sent: "✅ Siyabonga! Ngithumele umbiko wakho ku-admin team.",
      report_failed: "❌ Uxolo, kukhona inkinga yokuthumela umbiko wakho.",
      goodbye:
        "👋 Hamba kahle! Shayela uphephile 🚗✨\n\nUma udinga okunye, yithi 'hi' noma 'menu'!",
      help_message:
        "ℹ️ Ngilapha ukusiza! Zama ukuthi: khombisa ama-slots atholakalayo, bhuka A, noma ama-booking ami.",
      invalid_option:
        "❌ Inombolo engalungile. Bhala inombolo ephakathi kuka-1-8.",
      didnt_understand:
        "🤔 Angikuqondile lokho. Bhala 'menu' ukubona ongakwenza, noma:\n• 'book slot' - Bhuka indawo\n• 'my booking' - Bheka i-booking yakho\n• 'balance' - Bheka imali yakho",
    },
  };
  const t = (key, ...args) => {
    const pack = translations[language] || translations.en;
    const val = pack[key];
    return typeof val === "function" ? val(...args) : val || key;
  };

  // Start a visible 20s grace countdown; cancels on occupancy or expiry
  const startGraceCountdown = (bookingId, seconds = 20) => {
    try {
      const key = String(bookingId || "unknown");
      if (!bookingId) return;
      // Clear any existing
      const existing = graceTimersRef.current[key];
      if (existing && existing.timeouts)
        existing.timeouts.forEach((id) => clearTimeout(id));
      const timeouts = [];
      // Initial grace message removed - booking confirmation already mentions 20s timer
      for (let s = seconds - 5; s > 0; s -= 5) {
        timeouts.push(
          setTimeout(async () => {
            const state = graceTimersRef.current[key];
            if (state?.occupied || state?.ended) return;

            // Check if car was detected before showing countdown
            try {
              const cur = await chatbotAPI.getCurrentBooking();
              if (cur?.timer_started) {
                // Car detected, stop countdown
                graceTimersRef.current[key] = {
                  ...(state || {}),
                  ended: true,
                  occupied: true,
                };
                return;
              }
            } catch (_) {}

            append("bot", t("grace_countdown", s));
          }, (seconds - s) * 1000)
        );
      }
      timeouts.push(
        setTimeout(async () => {
          const state = graceTimersRef.current[key];
          if (state?.occupied || state?.ended) return;

          // Double-check if car was detected by checking backend before showing expiry
          try {
            const cur = await chatbotAPI.getCurrentBooking();
            if (
              cur?.timer_started ||
              String(cur?.status || "").toLowerCase() === "completed"
            ) {
              // Car was detected by manual system, don't show expiry
              graceTimersRef.current[key] = {
                ...(state || {}),
                ended: true,
                occupied: true,
              };
              return;
            }
          } catch (_) {}

          // Only show expiry if car truly wasn't detected
          append("bot", t("expiry_warn"));
          graceTimersRef.current[key] = { ...(state || {}), ended: true };
        }, seconds * 1000)
      );
      graceTimersRef.current[key] = {
        timeouts,
        startedAt: Date.now(),
        occupied: false,
        ended: false,
      };
    } catch (_) {}
  };

  const showMainMenu = () => {
    setMenuMode(true);
    append("bot", `${t("greet")}\n\n${t("menu")}`);
  };

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true })
    );
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, scrollToEnd]);

  const append = (role, text) =>
    setMessages((prev) => [...prev, { id: `m${prev.length + 1}`, role, text }]);

  // Intent helpers for natural language
  const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const extractDate = (s) => {
    const m = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    return m ? m[1] : null;
  };
  const extractSlot = (s) => {
    if (/\bslot\s*a\b|\ba\b(?!\w)/i.test(s)) return "A";
    if (/\bslot\s*b\b|\bb\b(?!\w)/i.test(s)) return "B";
    const m = s.match(/(?:slot\s*|#)(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const extractDurationMinutes = (s) => {
    const hour = s.match(/(\d+(?:\.\d+)?)\s*(hour|hr|hrs)\b/i);
    if (hour) return Math.round(parseFloat(hour[1]) * 60);
    const min = s.match(/(\d+)\s*(m|min|mins|minutes)?\b/i);
    if (min) return parseInt(min[1], 10);
    return null;
  };
  const isReserveIntent = (s) =>
    /(reserve|book|hold|save)\b/i.test(s) && /(slot|\b[a|b]\b|#|\d)/i.test(s);
  const isCurrentIntent = (s) =>
    /(current|my booking|time left|remaining)/i.test(s);
  const isHelpIntent = (s) =>
    /(help|manual|how to|guide|instructions)/i.test(s);
  const isGoodbyeIntent = (s) =>
    /(\bbye\b|goodbye|see you|thanks,? bye)/i.test(s);
  const isTestNotificationIntent = (s) =>
    /(test notification|test notif|notification test)/i.test(s);
  const isCheckPermissionsIntent = (s) =>
    /(check permissions|permission status|notification status)/i.test(s);
  const isTestOvertimeIntent = (s) =>
    /(test overtime|overtime test|test expiry)/i.test(s);
  const isExtendIntent = (s) =>
    /(extend|add|increase)\b/.test(s) &&
    /(minute|min|hour|hr|hrs|\d+)/i.test(s);
  const isCancelIntent = (s) =>
    /(cancel|stop|end|terminate|delete)\b/i.test(s) &&
    /(booking|reservation|slot|my booking)/i.test(s);
  const isReportIntent = (s) =>
    /(report|issue|problem|complaint|bug|error|feedback)/i.test(s);
  const parseIntent = (raw) => {
    const s = normalize(raw);
    if (!s) return { type: "none" };
    if (/^(hi|hello|hey)\b/.test(s)) return { type: "greet" };
    if (isGoodbyeIntent(s)) return { type: "goodbye" };
    if (isTestNotificationIntent(s)) return { type: "test_notification" };
    if (isCheckPermissionsIntent(s)) return { type: "check_permissions" };
    if (isTestOvertimeIntent(s)) return { type: "test_overtime" };
    if (isHelpIntent(s)) return { type: "help" };
    const date = extractDate(s);
    if (date && /(booking|history|show)/.test(s))
      return { type: "bookings_by_date", date };
    if (isCurrentIntent(s)) return { type: "current" };
    if (isExtendIntent(s)) {
      const minutes = extractDurationMinutes(s);
      return { type: "extend", minutes };
    }
    if (isReportIntent(s)) return { type: "report" };
    if (isCancelIntent(s)) {
      return { type: "cancel" };
    }
    // Simple cancel intent - just "cancel"
    if (/^cancel$/i.test(s)) {
      return { type: "cancel" };
    }
    if (isReserveIntent(s)) {
      const slot = extractSlot(s);
      const minutes = extractDurationMinutes(s);
      return { type: "reserve", slot, minutes };
    }
    const slot = extractSlot(s);
    const minutes = extractDurationMinutes(s);
    if (slot && minutes) return { type: "reserve", slot, minutes };
    return { type: "unknown" };
  };

  const handleQuick = async (actionId, skipUserMessage = false) => {
    if (loading) return;
    if (actionId === "current") {
      if (!skipUserMessage) append("user", "Show my current booking");
      setLoading(true);
      try {
        const data = await chatbotAPI.getCurrentBooking();
        if (!data.hasBooking) {
          append("bot", data.message || t("no_booking"));
        } else {
          const over = Number(data.overtime_cost || 0);
          const base = Number(data.total_cost || 0);
          const finalTotal = Number(data.final_total_cost || base + over);
          append(
            "bot",
            `Slot: ${data.slot || "-"}\nRemaining: ${Math.ceil(
              (data.remaining_seconds || 0) / 60
            )} min\nOvertime: ${Number(
              data.overtime_minutes || 0
            )} min | Overtime Cost: $${over.toFixed(
              2
            )}\nTotal: $${finalTotal.toFixed(
              2
            )}\nYou can type: extend 15, cancel`
          );
        }
      } catch (e) {
        append("bot", "Couldn't fetch your current booking.");
      } finally {
        setLoading(false);
      }
    } else if (actionId === "bookings") {
      if (!skipUserMessage) append("user", "Show my bookings");
      setLoading(true);
      try {
        const bookings = await bookingAPI.getBookings();
        if (!bookings || bookings.length === 0) {
          append("bot", t("no_bookings"));
        } else {
          const active = bookings.filter((b) => b.status === "active");
          const completed = bookings.filter((b) => b.status === "completed");
          const cancelled = bookings.filter((b) => b.status === "cancelled");

          const top = bookings.slice(0, 3);
          const lines = top.map((b, i) => {
            const over = Number(b.overtime_cost || 0);
            const total = Number(b.total_cost || 0);
            const finalTotal = Number(b.final_total_cost || total + over);
            return (
              `#${i + 1} ${b.slot_name || b.spot || "Slot"} | ${b.status}\n` +
              `Start: ${
                b.start_time?.slice(0, 16)?.replace("T", " ") || "-"
              }\n` +
              `End: ${b.end_time?.slice(0, 16)?.replace("T", " ") || "-"}\n` +
              `Overtime: ${Number(
                b.overtime_minutes || 0
              )} min | Overtime Cost: $${over.toFixed(2)}\n` +
              `Total: $${finalTotal.toFixed(2)}`
            );
          });

          append(
            "bot",
            `You have ${active.length} active, ${completed.length} completed, ${cancelled.length} cancelled.\n\n` +
              lines.join("\n\n") +
              (bookings.length > 3 ? `\n\n(+${bookings.length - 3} more)` : "")
          );
        }
      } catch (e) {
        append(
          "bot",
          "Couldn't fetch your bookings. Make sure you're logged in."
        );
      } finally {
        setLoading(false);
      }
    } else if (actionId === "slots") {
      if (!skipUserMessage) append("user", "Show available slots");
      setLoading(true);
      try {
        const data = await chatbotAPI.getAvailableSlots();
        const items = data?.available_spots || [];
        if (items.length === 0) {
          append("bot", t("no_slots"));
        } else {
          const slotA = items.find(
            (s) =>
              /\bA\b/i.test(String(s.name)) || /slot\s*A/i.test(String(s.name))
          );
          const slotB = items.find(
            (s) =>
              /\bB\b/i.test(String(s.name)) || /slot\s*B/i.test(String(s.name))
          );

          const display = [];
          if (slotA) display.push(`• ${slotA.name} (#${slotA.id})`);
          if (slotB) display.push(`• ${slotB.name} (#${slotB.id})`);

          // If neither A nor B matched, show only the first two items as a fallback
          if (display.length === 0) {
            const firstTwo = items.slice(0, 2);
            for (const s of firstTwo) display.push(`• ${s.name} (#${s.id})`);
          }

          append(
            "bot",
            `${t("available_intro")} 🚗:\n${display.join("\n")}\n\n${t(
              "tap_to_reserve"
            )}`
          );
          setFlow({ mode: "booking_select_slot" });
        }
      } catch (e) {
        append("bot", "Couldn't fetch available slots.");
      } finally {
        setLoading(false);
      }
    } else if (actionId === "faqs") {
      append("user", "Help & FAQs");
      setLoading(true);
      try {
        const help = await chatbotAPI.getHelp();
        append("bot", help?.message || t("help_message"));
      } catch (_e) {
        append("bot", t("help_message"));
      } finally {
        setLoading(false);
      }
    } else if (actionId === "support") {
      append("user", "Contact support");
      append(
        "bot",
        "Support: Email rondozaicalvin@gmail.com or visit Settings > Report an issue."
      );
    } else if (actionId === "cancel") {
      append("user", "Cancel my booking");
      setLoading(true);
      try {
        const current = await chatbotAPI.getCurrentBooking();
        console.log("Current booking data:", current); // Debug log
        if (!current.hasBooking) {
          append("bot", t("no_booking"));
        } else {
          await bookingAPI.cancelBooking(current.booking_id);
          append(
            "bot",
            `${t("booking_cancelled")}\n\nSlot: ${
              current.slot || "Unknown"
            }\nRefund: $${Number(current.total_cost || 0).toFixed(
              2
            )}\n\nYou can now book a new slot if needed.\n\n💡 Type 'menu' to return to main menu`
          );
        }
      } catch (e) {
        append(
          "bot",
          `Failed to cancel booking: ${e?.message || "Please try again later."}`
        );
      } finally {
        setLoading(false);
      }
    } else if (actionId === "balance") {
      if (!skipUserMessage) append("user", "Check balance");
      setLoading(true);
      try {
        const w = await walletAPI.getWallet();
        const bal = Number(w.balance || w.wallet_balance || 0);
        append("bot", t("balance_is", bal));
      } catch (e) {
        append("bot", "Couldn't fetch your wallet balance.");
      } finally {
        setLoading(false);
      }
    }
  };

  // Monitor booking lifecycle and notify occupancy/expiry/completion
  const watchBookingLifecycle = async (bookingId, spotRefArg) => {
    let expiredNotified = false;
    let occupiedNotified = false;
    let lastOccupied = false;
    let lastLedState = null; // 'red' | 'blue' | 'off' | null
    const poll = async () => {
      try {
        const cur = await chatbotAPI.getCurrentBooking();
        if (!cur?.hasBooking) return; // booking no longer active
        const remaining = Number(cur.remaining_seconds || 0);
        // Determine spot reference from arg or backend payload
        const spotRef =
          spotRefArg ||
          cur.spot_number ||
          cur.slot_number ||
          cur.parking_spot?.spot_number ||
          cur.slot ||
          cur.slot_name;
        // Default occupied from backend
        let occupied = !!cur.is_occupied;
        // Enhance with LED status if possible
        let ledSpotRef = spotRef; // Declare outside try block for error logging
        try {
          if (spotRef != null) {
            // Convert spot reference to correct format for LED endpoint
            const spotStr = String(spotRef).toUpperCase();

            // Handle different spot reference formats
            if (
              spotStr.match(/^A\d+$/i) ||
              spotStr.includes("A") ||
              spotStr === "1" ||
              spotStr === "84"
            ) {
              ledSpotRef = "Slot A";
            } else if (
              spotStr.match(/^B\d+$/i) ||
              spotStr.includes("B") ||
              spotStr === "2" ||
              spotStr === "85"
            ) {
              ledSpotRef = "Slot B";
            } else if (Number(spotRef) >= 80 && Number(spotRef) <= 90) {
              // Handle numeric IDs in the 80s range - assume A=84, B=85, etc.
              ledSpotRef = Number(spotRef) % 2 === 0 ? "Slot A" : "Slot B";
            } else {
              // Default fallback - if we can't determine, try Slot A first
              ledSpotRef = "Slot A";
              console.log(
                `Unknown spot reference: ${spotRef}, defaulting to Slot A`
              );
            }

            const led = await bookingAPI.getParkingSpotLedStatus(ledSpotRef);
            const ledStatus = String(led?.led_status || "").toLowerCase();
            const ledColor = String(led?.led_color || "").toLowerCase();
            const isRed =
              ledColor === "red" || (ledStatus === "on" && ledColor !== "blue");
            const isBlue = ledColor === "blue";
            occupied =
              typeof cur.is_occupied === "boolean" ? cur.is_occupied : isRed;
            const currentLed = isRed
              ? "red"
              : isBlue
              ? "blue"
              : ledStatus === "off"
              ? "off"
              : null;
            if (lastLedState !== currentLed) {
              // blue->red means parked
              if (
                (lastLedState === "blue" || lastLedState === null) &&
                currentLed === "red" &&
                !occupiedNotified &&
                !cur.timer_started // Only trigger if manual system hasn't detected yet
              ) {
                append("bot", t("occupied_start"));
                const slotName =
                  cur.slot || cur.slot_name || spotRef || "your slot";
                append("bot", t("parking_confirmed", slotName));
                occupiedNotified = true;

                // Cancel grace countdown since car was detected
                try {
                  const timers = graceTimersRef.current[String(bookingId)];
                  if (timers && timers.timeouts) {
                    timers.timeouts.forEach((id) => clearTimeout(id));
                    graceTimersRef.current[String(bookingId)] = {
                      ...timers,
                      occupied: true,
                      ended: true,
                    };
                  }
                } catch (_) {}

                // Notify backend about car detection
                try {
                  await bookingAPI.detectCarParked(cur.booking_id);
                } catch (_) {}
              }
              // red->off/blue means left
              if (
                lastLedState === "red" &&
                (currentLed === "off" || currentLed === "blue") &&
                String(cur.status || "").toLowerCase() !== "completed"
              ) {
                try {
                  await bookingAPI.completeActiveBooking(cur.booking_id);
                } catch (_) {}
              }
              lastLedState = currentLed;
            }
          }
        } catch (ledError) {
          // Handle LED status errors - log details for debugging
          console.log(
            `LED status check failed for spot ${spotRef} (converted to ${ledSpotRef}):`,
            ledError.message
          );
          // Fall back to backend occupancy status
          occupied = !!cur.is_occupied;
        }
        // Check if car was detected by manual system (timer_started exists)
        const manualSystemDetectedCar = !!cur.timer_started;

        if ((occupied || manualSystemDetectedCar) && !occupiedNotified) {
          append("bot", t("occupied_start"));
          const slotName = cur.slot || cur.slot_name || spotRef || "your slot";
          append("bot", t("parking_confirmed", slotName));
          occupiedNotified = true;
          // Cancel grace countdown if running
          try {
            const timers = graceTimersRef.current[String(bookingId)];
            if (timers && timers.timeouts) {
              timers.timeouts.forEach((id) => clearTimeout(id));
              graceTimersRef.current[String(bookingId)] = {
                ...timers,
                occupied: true,
                ended: true, // Mark grace as ended since car was detected
              };
            }
          } catch (_) {}
        }
        // Detect leave event (occupied -> not occupied) and finalize if backend hasn't yet
        if (
          lastOccupied &&
          !occupied &&
          String(cur.status || "").toLowerCase() !== "completed"
        ) {
          try {
            await bookingAPI.completeActiveBooking(cur.booking_id);
          } catch (_) {}
        }
        lastOccupied = occupied;

        // Grace period expiry is now handled by the timer itself with backend verification
        // No need for duplicate expiry logic here
        if (String(cur.status || "").toLowerCase() === "completed") {
          const over = Number(cur.overtime_cost || 0);
          const base = Number(cur.total_cost || 0);
          const total = Number(cur.final_total_cost || base + over);

          // Format times for receipt
          const formatTime = (dateStr) => {
            if (!dateStr) return "N/A";
            try {
              return new Date(dateStr).toLocaleString();
            } catch {
              return dateStr.slice(0, 16).replace("T", " ");
            }
          };

          // Calculate duration
          const startTime = cur.timer_started || cur.start_time;
          const endTime = cur.completed_at || cur.end_time;
          let duration = "N/A";
          if (startTime && endTime) {
            const start = new Date(startTime);
            const end = new Date(endTime);
            const diffMs = end - start;
            const diffMin = Math.floor(diffMs / 60000);
            const diffSec = Math.floor((diffMs % 60000) / 1000);
            duration = `${diffMin}m ${diffSec}s`;
          }

          try {
            const w = await walletAPI.getWallet();
            const bal = Number(w.balance || w.wallet_balance || 0);

            // Show detailed receipt
            const receiptData = {
              slot: cur.slot || cur.slot_name || spotRef || "Unknown",
              startTime: formatTime(startTime),
              endTime: formatTime(endTime),
              duration: duration,
              amount: total,
              balance: bal,
            };

            append("bot", t("receipt", receiptData));
          } catch (_) {
            // Fallback if wallet fetch fails
            append("bot", t("left_slot", total));
          }
          return; // stop polling
        }
        setTimeout(poll, 8000);
      } catch (e) {
        setTimeout(poll, 10000);
      }
    };
    poll();
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    append("user", trimmed);
    setInput("");
    // Check for menu command
    if (/^menu$|^show menu$|^options$|^help$|^main menu$/i.test(trimmed)) {
      showMainMenu();
      return;
    }

    // Check for menu selection (when in menu mode)
    if (menuMode && /^[1-8]$/.test(trimmed)) {
      const choice = parseInt(trimmed, 10);
      setMenuMode(false);

      switch (choice) {
        case 1:
          setFlow({ mode: "booking_select_slot" });
          handleQuick("slots", true);
          break;
        case 2:
          handleQuick("current", true);
          break;
        case 3:
          handleQuick("bookings", true);
          break;
        case 4:
          append(
            "bot",
            "Please enter a date in YYYY-MM-DD format (e.g., 2025-01-15):"
          );
          setFlow({ mode: "search_date" });
          break;
        case 5:
          append(
            "bot",
            "Please describe the issue or problem you're experiencing. I'll forward your report to the admin team."
          );
          setFlow({ mode: "report_issue" });
          break;
        case 6:
          handleQuick("faqs", true);
          break;
        case 7:
          handleQuick("balance", true);
          break;
        case 8:
          append("bot", t("choose_lang"));
          setFlow({ mode: "choose_language" });
          break;
        default:
          append("bot", "Invalid option. Please type a number between 1-8.");
          setMenuMode(true);
      }
      return;
    }

    // Language selection flow
    if (flow.mode === "choose_language") {
      const sel = trimmed;
      if (sel === "1" || sel === "2" || sel === "3") {
        const newLang = sel === "1" ? "en" : sel === "2" ? "sn" : "nd";
        const name =
          sel === "1" ? "English" : sel === "2" ? "Shona" : "Ndebele";

        // Update language
        setLanguage(newLang);

        // Get translations for the new language
        const newTranslations = translations[newLang] || translations.en;

        // Show confirmation in new language
        append(
          "bot",
          typeof newTranslations.lang_set === "function"
            ? newTranslations.lang_set(name)
            : `✅ Language set to ${name}.`
        );

        // Set flow to idle
        setFlow({ mode: "idle" });
        setMenuMode(false);

        // Show menu in the selected language after state update
        setTimeout(() => {
          const greet =
            typeof newTranslations.greet === "function"
              ? newTranslations.greet()
              : newTranslations.greet;
          const menu =
            typeof newTranslations.menu === "function"
              ? newTranslations.menu()
              : newTranslations.menu;
          append("bot", `${greet}\n\n${menu}`);
          setMenuMode(true);
        }, 300);
      } else {
        append("bot", t("choose_lang"));
      }
      return;
    }

    // Handle date search input
    if (flow.mode === "search_date") {
      const dateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
      if (dateMatch) {
        const dateStr = dateMatch[0];
        (async () => {
          setLoading(true);
          try {
            const bookings = await bookingAPI.getBookings();
            const onDate = bookings.filter(
              (b) =>
                (b.start_time || "").startsWith(dateStr) ||
                (b.end_time || "").startsWith(dateStr)
            );
            if (onDate.length === 0) {
              append("bot", `No bookings found on ${dateStr}.`);
            } else {
              const lines = onDate
                .slice(0, 5)
                .map(
                  (b, i) =>
                    `#${i + 1} ${b.slot_name || b.spot || "Slot"} | ${
                      b.status
                    }\n` +
                    `Start: ${(b.start_time || "")
                      .slice(0, 16)
                      .replace("T", " ")}\nEnd: ${(b.end_time || "")
                      .slice(0, 16)
                      .replace("T", " ")}`
                );
              append("bot", `Bookings on ${dateStr}:\n\n${lines.join("\n\n")}`);
            }
          } catch (e) {
            append("bot", "Couldn't fetch bookings for that date.");
          } finally {
            setLoading(false);
            setFlow({ mode: "idle" });
          }
        })();
        return;
      } else {
        append(
          "bot",
          "Please enter a valid date in YYYY-MM-DD format (e.g., 2025-01-15):"
        );
        return;
      }
    }

    // Handle report issue input
    if (flow.mode === "report_issue") {
      if (trimmed.length < 10) {
        append(
          "bot",
          "Please provide more details about the issue (at least 10 characters)."
        );
        return;
      }

      (async () => {
        setLoading(true);
        try {
          // Send report to admin dashboard using API service
          await chatbotAPI.submitReport({
            message: trimmed,
            type: "user_report",
            priority: "medium",
          });

          append(
            "bot",
            "✅ Thank you for your report! I've forwarded it to the admin team. They will review it and take appropriate action.\n\n💡 Type 'menu' to return to main menu"
          );
        } catch (error) {
          console.error("Report submission error:", error);
          append(
            "bot",
            "❌ Sorry, there was an issue sending your report. Please try again later or contact support directly."
          );
        } finally {
          setLoading(false);
          setFlow({ mode: "idle" });
        }
      })();
      return;
    }

    // Handle extend duration input
    if (flow.mode === "extend_duration") {
      const minutes = parseInt(trimmed, 10);
      if (isNaN(minutes) || minutes <= 0) {
        append(
          "bot",
          "Please enter a valid number of minutes (e.g., 30, 60, 120):"
        );
        return;
      }
      (async () => {
        setLoading(true);
        try {
          const system = await iotService.checkSystemStatus();
          if (!system?.online) {
            append(
              "bot",
              "Cannot extend booking while IoT system is offline. Please try again later."
            );
            setFlow({ mode: "idle" });
            return;
          }

          const current = await chatbotAPI.getCurrentBooking();
          if (!current.hasBooking) {
            append("bot", t("no_booking"));
            setFlow({ mode: "idle" });
            return;
          }

          await bookingAPI.extendBooking(current.booking_id, minutes);
          append(
            "bot",
            `${t(
              "booking_extended",
              minutes
            )}\n\n💡 Type 'menu' to return to main menu`
          );
        } catch (e) {
          append(
            "bot",
            `Failed to extend booking: ${
              e?.message || "Please try again later."
            }`
          );
        } finally {
          setLoading(false);
          setFlow({ mode: "idle" });
        }
      })();
      return;
    }

    // Human-intent parsing
    const intent = parseIntent(trimmed);
    if (intent.type === "greet") {
      // On greeting, show greeting + menu in one message and enable numeric selection
      setMenuMode(true);
      append("bot", `${t("greet")}\n\n${t("menu")}`);
      return;
    }
    if (intent.type === "help") {
      append("bot", t("help_message"));
      return;
    }
    if (intent.type === "goodbye") {
      append("bot", t("goodbye"));
      return;
    }
    if (intent.type === "check_permissions") {
      (async () => {
        setLoading(true);
        try {
          const status = await notificationService.checkPermissions();
          append("bot", `📱 Notification permissions status: ${status}`);
          if (status === "granted") {
            append(
              "bot",
              "✅ Notifications are enabled! The system should work properly."
            );
          } else if (status === "denied") {
            append(
              "bot",
              "❌ Notifications are disabled. Please enable them in your device settings."
            );
          } else {
            append(
              "bot",
              "⚠️ Notification permissions are not set. The app will request them when needed."
            );
          }
        } catch (e) {
          append(
            "bot",
            `❌ Error checking permissions: ${e?.message || "Unknown error"}`
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }
    if (intent.type === "test_overtime") {
      (async () => {
        setLoading(true);
        try {
          const current = await chatbotAPI.getCurrentBooking();
          if (!current.hasBooking) {
            append(
              "bot",
              "❌ No active booking found. Please make a booking first to test overtime detection."
            );
            setLoading(false);
            return;
          }

          append(
            "bot",
            `🧪 Testing overtime detection for booking ${current.booking_id}...`
          );
          const result = await iotOvertimeService.testOvertimeDetection(
            current.booking_id
          );

          if (result) {
            append(
              "bot",
              "✅ Overtime test triggered! Check console logs and notifications."
            );
            append(
              "bot",
              "⏰ The system will wait 5 seconds after expiry, then start charging if the red light is still on."
            );
          } else {
            append(
              "bot",
              "❌ Failed to trigger overtime test. Check console logs for details."
            );
          }
        } catch (e) {
          append(
            "bot",
            `❌ Error testing overtime: ${e?.message || "Unknown error"}`
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }
    if (intent.type === "cancel") {
      (async () => {
        setLoading(true);
        try {
          const current = await chatbotAPI.getCurrentBooking();
          console.log("Current booking data (intent):", current); // Debug log
          if (!current.hasBooking) {
            append("bot", t("no_booking"));
          } else {
            console.log("Attempting to cancel booking ID:", current.booking_id); // Debug log
            await bookingAPI.cancelBooking(current.booking_id);
            append(
              "bot",
              `${t("booking_cancelled")}\n\nSlot: ${
                current.slot || "Unknown"
              }\nRefund: $${Number(current.total_cost || 0).toFixed(
                2
              )}\n\nYou can now book a new slot if needed.\n\n💡 Type 'menu' to return to main menu`
            );
          }
        } catch (e) {
          console.error("Cancel booking error:", e); // Debug log
          append(
            "bot",
            `Failed to cancel booking: ${
              e?.message || "Please try again later."
            }`
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }
    if (intent.type === "extend") {
      const minutes = intent.minutes;
      if (!minutes) {
        append(
          "bot",
          "Please specify how many minutes to extend. Example: 'extend 30' or 'add 1 hour'"
        );
        return;
      }
      (async () => {
        setLoading(true);
        try {
          const system = await iotService.checkSystemStatus();
          if (!system?.online) {
            append(
              "bot",
              "Cannot extend booking while IoT system is offline. Please try again later."
            );
            return;
          }

          const current = await chatbotAPI.getCurrentBooking();
          if (!current.hasBooking) {
            append("bot", t("no_booking"));
            return;
          }

          await bookingAPI.extendBooking(current.booking_id, minutes);
          append(
            "bot",
            `${t("booking_extended", minutes)}\n\nNew end time: ${
              current.end_time
                ? new Date(current.end_time).getTime() + minutes * 60 * 1000
                : "Updated"
            }\nYou can check your current booking for updated details.`
          );
        } catch (e) {
          append(
            "bot",
            `Failed to extend booking: ${
              e?.message || "Please try again later."
            }`
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // Start guided booking flow
    if (/\bbook(\s+a\s*slot)?\b/i.test(trimmed)) {
      setFlow({ mode: "booking_select_slot" });
      handleQuick("slots");
      return;
    }

    // Search bookings by date (YYYY-MM-DD)
    const dateMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      (async () => {
        setLoading(true);
        try {
          const bookings = await bookingAPI.getBookings();
          const onDate = bookings.filter(
            (b) =>
              (b.start_time || "").startsWith(dateStr) ||
              (b.end_time || "").startsWith(dateStr)
          );
          if (onDate.length === 0) {
            append("bot", `No bookings found on ${dateStr}.`);
          } else {
            const lines = onDate
              .slice(0, 5)
              .map(
                (b, i) =>
                  `#${i + 1} ${b.slot_name || b.spot || "Slot"} | ${
                    b.status
                  }\n` +
                  `Start: ${(b.start_time || "")
                    .slice(0, 16)
                    .replace("T", " ")}\nEnd: ${(b.end_time || "")
                    .slice(0, 16)
                    .replace("T", " ")}`
              );
            append("bot", `Bookings on ${dateStr}:\n\n${lines.join("\n\n")}`);
          }
        } catch (e) {
          append("bot", "Couldn’t fetch bookings for that date.");
        } finally {
          setLoading(false);
        }
      })();
      return;
    }
    // Fuzzy reserve: try to understand human phrasing
    const fuzzy = parseIntent(trimmed);
    if (fuzzy.type === "reserve") {
      const slotRaw = fuzzy.slot;
      const minutes = fuzzy.minutes;
      if (!slotRaw || !minutes) {
        append(
          "bot",
          "To reserve, say: ‘book slot A for 45 minutes’ or ‘reserve B 60’."
        );
        return;
      }
      (async () => {
        setLoading(true);
        try {
          // Check if IoT system is online
          const system = await iotService.checkSystemStatus();
          if (!system?.online) {
            append(
              "bot",
              "Cannot reserve a slot while IoT system is offline. Please try again later."
            );
            return;
          }

          // Check if user already has an active booking
          const current = await chatbotAPI.getCurrentBooking();
          if (current?.hasBooking) {
            append(
              "bot",
              "You already have an active booking. You can extend it, not create a new one."
            );
            return;
          }

          let slotId;
          if (/^[ab]$/i.test(String(slotRaw))) {
            const letter = String(slotRaw).toUpperCase();
            const data = await chatbotAPI.getAvailableSlots();
            const items = data?.available_spots || [];
            const found = items.find(
              (s) =>
                new RegExp(`\\b${letter}\\b`, "i").test(String(s.name)) ||
                new RegExp(`slot\\s*${letter}`, "i").test(String(s.name))
            );
            if (!found) throw new Error(`Slot ${letter} is not available`);
            slotId = found.id;
          } else {
            slotId = parseInt(String(slotRaw), 10);
          }

          const res = await chatbotAPI.reserveSlot({
            slot_id: slotId,
          });
          const slotName = res.slot_name || res.spot || "slot";
          append("bot", t("booked", slotName));
          const bookingId = res?.booking_id || res?.id;

          // Send push notification for successful booking
          try {
            await notificationService.scheduleBookingConfirmation({
              id: bookingId,
              slot_name: slotName,
              parking_spot: { spot_number: slotName },
            });
          } catch (_) {}

          if (bookingId) {
            startGraceCountdown(bookingId, 20);
            watchBookingLifecycle(bookingId);
          }
          setFlow({ mode: "idle", pendingSlot: null });
        } catch (e) {
          append(
            "bot",
            `Reservation failed: ${e?.message || "Check slot and try again."}`
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }
    if (/^reserve\s+([ab]|\d+)\s+(\d+)/i.test(trimmed)) {
      // reserve <A|B|slotId> <minutes>
      const match = trimmed.match(/^reserve\s+([ab]|\d+)\s+(\d+)/i);
      if (match) {
        const slotRaw = match[1];
        const minutes = parseInt(match[2], 10);
        (async () => {
          setLoading(true);
          try {
            // Check if IoT system is online
            const system = await iotService.checkSystemStatus();
            if (!system?.online) {
              append(
                "bot",
                "Cannot reserve a slot while IoT system is offline. Please try again later."
              );
              return;
            }

            // Check if user already has an active booking
            const current = await chatbotAPI.getCurrentBooking();
            if (current?.hasBooking) {
              append(
                "bot",
                "You already have an active booking. You can extend it, not create a new one."
              );
              return;
            }

            let slotId;
            if (/^[ab]$/i.test(slotRaw)) {
              const letter = slotRaw.toUpperCase();
              const data = await chatbotAPI.getAvailableSlots();
              const items = data?.available_spots || [];
              const found = items.find(
                (s) =>
                  new RegExp(`\\b${letter}\\b`, "i").test(String(s.name)) ||
                  new RegExp(`slot\\s*${letter}`, "i").test(String(s.name))
              );
              if (!found) throw new Error(`Slot ${letter} is not available`);
              slotId = found.id;
            } else {
              slotId = parseInt(slotRaw, 10);
            }

            const res = await chatbotAPI.reserveSlot({
              slot_id: slotId,
            });
            const slotName = res.slot_name || res.spot || "slot";
            append("bot", t("booked", slotName));
            const bookingId = res?.booking_id || res?.id;

            // Send push notification for successful booking
            try {
              await notificationService.scheduleBookingConfirmation({
                id: bookingId,
                slot_name: slotName,
                parking_spot: { spot_number: slotName },
              });
            } catch (_) {}

            if (bookingId) {
              startGraceCountdown(bookingId, 20);
              watchBookingLifecycle(bookingId);
            }
            setFlow({ mode: "idle" });
          } catch (e) {
            append(
              "bot",
              `Reservation failed: ${e?.message || "Check slot and try again."}`
            );
          } finally {
            setLoading(false);
          }
        })();
        return;
      }
    } else if (/booking|my booking|reserv/i.test(trimmed)) {
      // Disambiguate: if mentions 'current', show current; else show history summary
      if (/current/i.test(trimmed)) handleQuick("current");
      else handleQuick("bookings");
    } else if (/help|faq|how|overtime/i.test(trimmed)) {
      append("bot", t("help_message"));
    } else if (/support|contact|issue|problem/i.test(trimmed)) {
      append(
        "bot",
        "Support: Email rondozaicalvin@gmail.com or visit Settings > Report an issue."
      );
    } else {
      append("bot", t("didnt_understand"));
    }
  };

  const renderItem = ({ item }) => (
    <View
      style={[
        styles.msg,
        item.role === "bot"
          ? [
              styles.bot,
              {
                backgroundColor: isDark
                  ? "rgba(76, 175, 80, 0.1)"
                  : "rgba(76, 175, 80, 0.05)",
                borderColor: isDark
                  ? "rgba(76, 175, 80, 0.3)"
                  : "rgba(76, 175, 80, 0.2)",
              },
            ]
          : [styles.user, { backgroundColor: theme.accent }],
      ]}
    >
      <Text
        style={[
          styles.msgText,
          { color: item.role === "bot" ? theme.text : theme.buttonText },
        ]}
      >
        {item.text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background[0] }]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]}>Chatbot</Text>

        <TouchableOpacity onPress={showMainMenu} style={styles.headerButton}>
          <Ionicons name="menu" size={24} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.keyboardAvoid}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { backgroundColor: theme.background[0] },
          ]}
          keyboardShouldPersistTaps="handled"
        />

        {flow.mode === "booking_select_slot" && (
          <View style={styles.chipsRow}>
            <TouchableOpacity
              style={[
                styles.chip,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={async () => {
                // Directly reserve Slot A without asking duration
                setFlow({ mode: "idle", pendingSlot: null });
                setLoading(true);
                try {
                  const data = await chatbotAPI.getAvailableSlots();
                  const items = data?.available_spots || [];
                  const found = items.find(
                    (s) =>
                      /\bA\b/i.test(String(s.name)) ||
                      /slot\s*A/i.test(String(s.name))
                  );
                  if (!found) {
                    append("bot", t("slot_not_available", "A"));
                  } else {
                    const res = await chatbotAPI.reserveSlot({
                      slot_id: found.id,
                    });
                    const bookingId = res?.booking_id || res?.id;
                    const slotName =
                      res.slot_name || res.spot || found.name || "A";
                    append("bot", t("booked", slotName));

                    // Send push notification for successful booking
                    try {
                      await notificationService.scheduleBookingConfirmation({
                        id: bookingId,
                        slot_name: slotName,
                        parking_spot: { spot_number: slotName },
                      });
                    } catch (_) {}

                    // Show 20s grace countdown immediately
                    startGraceCountdown(bookingId, 20);
                    const spotRef = found.id || found.name || "A";
                    if (bookingId) watchBookingLifecycle(bookingId, spotRef);
                  }
                } catch (e) {
                  append("bot", e?.message || t("reservation_failed"));
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>
                Choose Slot A
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.chip,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={async () => {
                // Directly reserve Slot B without asking duration
                setFlow({ mode: "idle", pendingSlot: null });
                setLoading(true);
                try {
                  const data = await chatbotAPI.getAvailableSlots();
                  const items = data?.available_spots || [];
                  const found = items.find(
                    (s) =>
                      /\bB\b/i.test(String(s.name)) ||
                      /slot\s*B/i.test(String(s.name))
                  );
                  if (!found) {
                    append("bot", t("slot_not_available", "B"));
                  } else {
                    const res = await chatbotAPI.reserveSlot({
                      slot_id: found.id,
                    });
                    const bookingId = res?.booking_id || res?.id;
                    const slotName =
                      res.slot_name || res.spot || found.name || "B";
                    append("bot", t("booked", slotName));

                    // Send push notification for successful booking
                    try {
                      await notificationService.scheduleBookingConfirmation({
                        id: bookingId,
                        slot_name: slotName,
                        parking_spot: { spot_number: slotName },
                      });
                    } catch (_) {}

                    // Show 20s grace countdown immediately
                    startGraceCountdown(bookingId, 20);
                    const spotRef = found.id || found.name || "B";
                    if (bookingId) watchBookingLifecycle(bookingId, spotRef);
                  }
                } catch (e) {
                  append("bot", e?.message || t("reservation_failed"));
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>
                Choose Slot B
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        <View
          style={[
            styles.inputRow,
            { backgroundColor: theme.card, borderTopColor: theme.border },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.inputBackground, color: theme.text },
            ]}
            placeholder="Type a message..."
            placeholderTextColor={theme.details}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: theme.accent }]}
            onPress={handleSend}
          >
            <Ionicons name="send" size={18} color={theme.buttonText} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 16 : 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    padding: 8,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  keyboardAvoid: { flex: 1 },
  list: { padding: 12, flexGrow: 1 },
  msg: { maxWidth: "80%", padding: 10, borderRadius: 12, marginVertical: 6 },
  bot: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
  },
  user: { alignSelf: "flex-end" },
  msgText: { fontSize: 16, lineHeight: 20 },
  loading: { paddingHorizontal: 16, paddingVertical: 8 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendBtn: {
    marginLeft: 8,
    borderRadius: 20,
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
});
