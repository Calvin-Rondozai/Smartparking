import { Platform } from "react-native";
import * as Speech from "expo-speech";

class VoiceFeedbackService {
  constructor() {
    this.isEnabled = true;
    this.isSpeaking = false;
    this.voiceSettings = {
      rate: 0.8,
      pitch: 1.0,
      volume: 0.8,
    };
  }

  /**
   * Enable or disable voice feedback
   * @param {boolean} enabled - Whether voice feedback should be enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(
      `[VoiceFeedback] Voice feedback ${enabled ? "enabled" : "disabled"}`
    );
  }

  /**
   * Check if voice feedback is enabled
   * @returns {boolean} Whether voice feedback is enabled
   */
  isVoiceEnabled() {
    return this.isEnabled;
  }

  /**
   * Speak a message using TTS
   * @param {string} message - The message to speak
   * @param {object} options - Optional voice settings
   */
  async speak(message, options = {}) {
    if (!this.isEnabled) {
      console.log("[VoiceFeedback] Voice feedback is disabled");
      return;
    }

    // Prevent multiple simultaneous speech
    if (this.isSpeaking) {
      console.log("[VoiceFeedback] Already speaking, skipping");
      return;
    }

    try {
      console.log(`[VoiceFeedback] Speaking: "${message}"`);
      this.isSpeaking = true;

      // Stop any current speech
      Speech.stop();

      // Prepare speech options
      const speechOptions = {
        rate: options.rate || this.voiceSettings.rate,
        pitch: options.pitch || this.voiceSettings.pitch,
        volume: options.volume || this.voiceSettings.volume,
        language: "en-US",
        onDone: () => {
          this.isSpeaking = false;
          console.log("[VoiceFeedback] Speech completed");
        },
        onError: () => {
          this.isSpeaking = false;
          console.log("[VoiceFeedback] Speech error");
        },
        onStopped: () => {
          this.isSpeaking = false;
          console.log("[VoiceFeedback] Speech stopped");
        },
      };

      // Speak the message
      Speech.speak(message, speechOptions);
    } catch (error) {
      console.error("[VoiceFeedback] Error speaking message:", error);
      this.isSpeaking = false;
    }
  }

  /**
   * Stop current speech
   */
  stop() {
    try {
      Speech.stop();
      this.isSpeaking = false;
      console.log("[VoiceFeedback] Speech stopped");
    } catch (error) {
      console.error("[VoiceFeedback] Error stopping speech:", error);
      this.isSpeaking = false;
    }
  }

  /**
   * Test voice feedback with a sample message
   */
  async testVoice() {
    const message =
      "Voice feedback is enabled! You will hear announcements for parking events.";
    await this.speak(message, { rate: 0.9 });
  }

  /**
   * Voice feedback for successful slot booking
   * @param {string} slotName - Name of the booked slot (e.g., "Slot A")
   * @param {number} duration - Duration in minutes
   */
  async onSlotBooked(slotName, duration) {
    const message = `You have successfully booked ${slotName}. Please proceed to your parking spot.`;
    await this.speak(message, { rate: 0.9 });
  }

  /**
   * Voice feedback when car is detected as parked
   * @param {string} slotName - Name of the slot where car is parked
   */
  async onCarParked(slotName) {
    const message = `Perfect! Your car has been detected in ${slotName}. Your parking session has started.`;
    await this.speak(message, { rate: 0.9 });
  }

  /**
   * Voice feedback when booking is cancelled due to grace period failure
   * @param {string} slotName - Name of the slot that was cancelled
   */
  async onBookingCancelled(slotName) {
    const message = `Sorry, your booking for ${slotName} has been cancelled because you didn't park within the grace period. Please book another slot if needed.`;
    await this.speak(message, { rate: 0.8, pitch: 0.9 });
  }

  /**
   * Voice feedback when car leaves the slot
   * @param {string} slotName - Name of the slot that was vacated
   * @param {number} totalCost - Total cost of parking
   * @param {number} durationMinutes - Duration parked in minutes
   */
  async onCarLeft(slotName, totalCost, durationMinutes) {
    const message = `Thank you for using SmartPark!. Check your receipt. Have a great day!`;
    await this.speak(message, { rate: 0.8 });
  }

  /**
   * Voice feedback for wallet top-up
   * @param {number} amount - Amount topped up
   * @param {number} newBalance - New wallet balance
   */
  async onWalletToppedUp(amount, newBalance) {
    const message = `Wallet topped up successfully! Added $${amount.toFixed(
      2
    )}. Your new balance is $${newBalance.toFixed(2)}.`;
    await this.speak(message, { rate: 0.9 });
  }

  /**
   * Voice feedback for IoT status changes
   * @param {boolean} isOnline - Whether IoT is online
   */
  async onIoTStatusChange(isOnline) {
    // IoT status voice feedback disabled per user request
    return;
  }

  /**
   * Voice feedback for low wallet balance
   * @param {number} balance - Current wallet balance
   */
  async onLowBalance(balance) {
    const message = `Warning! Your wallet balance is low at $${balance.toFixed(
      2
    )}. Please top up to continue using SmartPark.`;
    await this.speak(message, { rate: 0.8, pitch: 0.9 });
  }
}

// Create and export a singleton instance
const voiceFeedbackService = new VoiceFeedbackService();
export default voiceFeedbackService;
