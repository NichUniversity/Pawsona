import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../context/AuthContext";
import { useTheme, withAlpha } from "../../context/ThemeContext";
import { TabBackground } from "./TabBackground";

type Mode = "signIn" | "signUp";

export function LoginScreen() {
  const { signInWithApple, signInWithEmail, signUpWithEmail, continueAsGuest } =
    useAuth();
  const { accentColor } = useTheme();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleAppleSignIn = async () => {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName]
            .filter(Boolean)
            .join(" ")
        : null;

      await signInWithApple({
        identifier: credential.user,
        name: fullName,
        email: credential.email,
      });
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        setError("Apple sign-in didn't go through. Please try again.");
      }
    }
  };

  const handleEmailSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "signUp"
          ? await signUpWithEmail(email, password, name)
          : await signInWithEmail(email, password);

      if (!result.success) {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TabBackground />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.logoBadge, { backgroundColor: withAlpha(accentColor, 0.15) }]}>
            <MaterialCommunityIcons name="paw" size={34} color={accentColor} />
          </View>

          <Text style={styles.title}>Pawsona</Text>
          <Text style={styles.subtitle}>Sign in to bring your pet to life</Text>

          {appleAvailable && (
            <>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={16}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with email</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          <View style={styles.modeRow}>
            <Pressable
              style={[
                styles.modeTab,
                mode === "signIn" && { backgroundColor: accentColor },
              ]}
              onPress={() => {
                setMode("signIn");
                setError(null);
              }}
            >
              <Text
                style={[
                  styles.modeTabText,
                  mode === "signIn" && styles.modeTabTextActive,
                ]}
              >
                Sign In
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.modeTab,
                mode === "signUp" && { backgroundColor: accentColor },
              ]}
              onPress={() => {
                setMode("signUp");
                setError(null);
              }}
            >
              <Text
                style={[
                  styles.modeTabText,
                  mode === "signUp" && styles.modeTabTextActive,
                ]}
              >
                Sign Up
              </Text>
            </Pressable>
          </View>

          {mode === "signUp" && (
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#8E8E93"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#8E8E93"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#8E8E93"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: accentColor },
              submitting && styles.primaryButtonDisabled,
            ]}
            onPress={handleEmailSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "signUp" ? "Create Account" : "Sign In"}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.guestButton} onPress={continueAsGuest}>
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 60,
  },

  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,140,66,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  title: {
    fontFamily: "Fredoka_700Bold",
    fontSize: 34,
    color: "#F5F5F5",
    letterSpacing: 0.5,
  },

  subtitle: {
    fontFamily: "Fredoka_400Regular",
    fontSize: 15,
    color: "#8E8E93",
    marginTop: 6,
    marginBottom: 32,
    textAlign: "center",
  },

  appleButton: {
    width: "100%",
    height: 50,
    marginBottom: 20,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
  },

  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.15)",
  },

  dividerText: {
    color: "#8E8E93",
    fontSize: 12,
    fontWeight: "600",
    marginHorizontal: 10,
  },

  modeRow: {
    flexDirection: "row",
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    padding: 4,
    width: "100%",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },

  modeTabActive: {
    backgroundColor: "#FF8C42",
  },

  modeTabText: {
    color: "#8E8E93",
    fontWeight: "700",
    fontSize: 14,
  },

  modeTabTextActive: {
    color: "#fff",
  },

  input: {
    width: "100%",
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: "#F5F5F5",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  errorText: {
    color: "#FF6B6B",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },

  primaryButton: {
    width: "100%",
    backgroundColor: "#FF8C42",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },

  primaryButtonDisabled: {
    opacity: 0.7,
  },

  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },

  guestButton: {
    marginTop: 18,
  },

  guestButtonText: {
    color: "#8E8E93",
    fontWeight: "600",
    fontSize: 14,
  },
});
