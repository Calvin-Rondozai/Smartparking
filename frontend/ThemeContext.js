// ThemeContext.js
import React, { createContext, useState, useEffect } from "react";
import { Appearance } from "react-native";

export const lightTheme = {
  background: ["#FFFFFF", "#F8FAFC"],
  card: "#FFFFFF",
  text: "#111827",
  subtitle: "#374151",
  email: "#2563EB",
  details: "#374151",
  error: "#DC2626",
  success: "#10B981",
  warning: "#F59E0B",
  loading: "#6B7280",
  button: "#10B981",
  buttonText: "#fff",
  avatarBorder: "#10B981",
  icon: "#10B981",
  accent: "#10B981",
  border: "#E0E0E0",
  inputBackground: "#F2F2F2",
  separator: "#E6E6E6",
};
export const darkTheme = {
  background: ["#18181B", "#232526"],
  card: "#232526",
  text: "#F3F4F6",
  subtitle: "#A1A1AA",
  email: "#60A5FA",
  details: "#A1A1AA",
  error: "#F87171",
  success: "#10B981",
  warning: "#F59E0B",
  loading: "#A1A1AA",
  button: "#10B981",
  buttonText: "#fff",
  avatarBorder: "#10B981",
  icon: "#10B981",
  accent: "#10B981",
  border: "#333333",
  inputBackground: "#1E1E1E",
  separator: "#2E3B47",
};

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const colorScheme = Appearance.getColorScheme(); // default
  const [isDark, setIsDark] = useState(colorScheme === "dark");

  useEffect(() => {
    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      setIsDark(colorScheme === "dark");
    });
    return () => listener.remove();
  }, []);

  const toggleTheme = () => setIsDark((prev) => !prev);

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};
