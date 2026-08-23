import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import React, { createContext, useContext, useEffect, useState } from "react";

export type AuthMethod = "apple" | "email" | "guest";

export type AuthUser = {
  method: AuthMethod;
  name: string | null;
  email: string | null;
};

// Device-only "accounts" — there's no backend yet, so email/password
// sign-up just stores a hashed password locally and checks against it on
// sign-in. This does NOT sync across devices or reinstalls. Swap this out
// for a real backend later without touching the LoginScreen UI, since it
// only talks to the functions this context exposes.
type StoredAccount = {
  email: string;
  passwordHash: string;
  name: string | null;
};

const SESSION_KEY = "pawsona_auth_session_v1";
const ACCOUNTS_KEY = "pawsona_auth_accounts_v1";

type EmailAuthResult = { success: boolean; error?: string };

type AuthContextType = {
  isReady: boolean;
  user: AuthUser | null;
  signInWithApple: (params: {
    identifier: string;
    name: string | null;
    email: string | null;
  }) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    name: string
  ) => Promise<EmailAuthResult>;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<EmailAuthResult>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) setUser(JSON.parse(raw));
      } catch {
        // Treat as logged out — worst case they see the login screen again.
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const persistSession = async (nextUser: AuthUser) => {
    setUser(nextUser);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextUser));
  };

  const getAccounts = async (): Promise<Record<string, StoredAccount>> => {
    try {
      const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const signInWithApple: AuthContextType["signInWithApple"] = async ({
    name,
    email,
  }) => {
    await persistSession({ method: "apple", name, email });
  };

  const signUpWithEmail: AuthContextType["signUpWithEmail"] = async (
    email,
    password,
    name
  ) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return { success: false, error: "Enter an email and password." };
    }
    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }

    const accounts = await getAccounts();
    if (accounts[normalizedEmail]) {
      return { success: false, error: "An account with that email already exists." };
    }

    const passwordHash = await hashPassword(password);
    accounts[normalizedEmail] = {
      email: normalizedEmail,
      passwordHash,
      name: name.trim() || null,
    };
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    await persistSession({
      method: "email",
      name: name.trim() || null,
      email: normalizedEmail,
    });
    return { success: true };
  };

  const signInWithEmail: AuthContextType["signInWithEmail"] = async (
    email,
    password
  ) => {
    const normalizedEmail = email.trim().toLowerCase();
    const accounts = await getAccounts();
    const account = accounts[normalizedEmail];

    if (!account) {
      return { success: false, error: "No account found for that email." };
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== account.passwordHash) {
      return { success: false, error: "Incorrect password." };
    }

    await persistSession({
      method: "email",
      name: account.name,
      email: account.email,
    });
    return { success: true };
  };

  const continueAsGuest = async () => {
    await persistSession({ method: "guest", name: null, email: null });
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        isReady,
        user,
        signInWithApple,
        signUpWithEmail,
        signInWithEmail,
        continueAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
