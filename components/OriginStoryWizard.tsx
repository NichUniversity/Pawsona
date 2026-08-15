import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { API_BASE_URL, GOLD, PARCHMENT, WOOD_DARK, WOOD_MID } from "../constants/pet-log-theme";
import { usePets } from "../context/PetInformation";
import { PET_CATEGORIES, PetCategory } from "../data/petcategories";

// Total questions in the interview, including the fixed opener below.
// Each answer feeds into generating the next question, and all four feed
// into the final backstory.
const TOTAL_QUESTIONS = 4;

// The first "Write it differently" is free per completed interview. Every
// regenerate after that costs coins — sized similarly to the cheapest
// Adventure area unlock, so it's earnable but not trivial.
const REDO_COST = 20;

// Used if the "next question" request fails, so a hiccup on one question
// doesn't stall the whole interview. Cycled through in order, skipping any
// that would repeat a question already asked.
const FALLBACK_QUESTIONS_TRUE = [
  "What's one word you'd use to describe their personality?",
  "Is there a funny habit or quirk that's just so 'them'?",
  "What's a small moment together that always makes you smile?",
  "What do they do that makes you feel most loved?",
  "If they could talk, what do you think they'd say most often?",
];

const FALLBACK_QUESTIONS_LEGEND = [
  "What title do you imagine they held back then — ruler, warrior, wizard, something else?",
  "Who might have been loyal to them, or stood by their side?",
  "What legendary feat are they remembered for?",
  "What finally led to their tale becoming... an ordinary pet?",
  "What's one trait they've clearly carried over from that past life?",
];

type OriginStoryMode = "true" | "legend";

type QAPair = { question: string; answer: string };

type WizardStep =
  | "intro"
  | "question"
  | "loading-question"
  | "finalizing"
  | "result"
  | "error";

type Props = {
  visible: boolean;
  petName: string;
  petCategory: PetCategory | null;
  onClose: () => void;
  onComplete: (backstory: string) => void;
};
 
function categoryLabel(category: PetCategory | null): string {
  return PET_CATEGORIES.find((c) => c.key === category)?.label ?? "pet";
}

function firstQuestion(mode: OriginStoryMode, name: string): string {
  if (mode === "legend") {
    return `If ${
      name || "your pet"
    } secretly lived an epic past life, what kind of world do you imagine — a royal kingdom, ancient wilderness, distant galaxy, something else?`;
  }
  return `In a few words, how did ${
    name || "your pet"
  } first come into your life?`;
}

export default function OriginStoryWizard({
  visible,
  petName,
  petCategory,
  onClose,
  onComplete,
}: Props) {
  const { coins, spendCoins } = usePets();

  const [step, setStep] = useState<WizardStep>("intro");
  const [mode, setMode] = useState<OriginStoryMode | null>(null);
  const [qaHistory, setQaHistory] = useState<QAPair[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [backstory, setBackstory] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Scoped to this one wizard session: completing a fresh interview grants
  // one free "Write it differently" redo, then further redos cost coins.
  const [hasUsedFreeRedo, setHasUsedFreeRedo] = useState(false);
  const [redoError, setRedoError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Reset back to a clean slate every time the wizard is (re)opened.
  useEffect(() => {
    if (visible) {
      setStep("intro");
      setMode(null);
      setQaHistory([]);
      setCurrentQuestion("");
      setAnswerText("");
      setBackstory(null);
      setErrorMessage(null);
      setHasUsedFreeRedo(false);
      setRedoError(null);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  const startInterview = (selectedMode: OriginStoryMode) => {
    setMode(selectedMode);
    setCurrentQuestion(firstQuestion(selectedMode, petName));
    setStep("question");
  };

  const fetchNextQuestion = async (history: QAPair[]) => {
    setStep("loading-question");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/origin-story-question`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            petName: petName || "your pet",
            category: categoryLabel(petCategory),
            mode,
            qaHistory: history,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const question =
        typeof data.question === "string" && data.question.trim()
          ? data.question.trim()
          : pickFallbackQuestion(history);

      setCurrentQuestion(question);
      setStep("question");
    } catch (err) {
      console.error("origin-story-question failed:", err);
      // Don't dead-end the interview over one flaky request — fall back to
      // a generic question so the flow keeps moving.
      setCurrentQuestion(pickFallbackQuestion(history));
      setStep("question");
    }
  };

  const pickFallbackQuestion = (history: QAPair[]) => {
    const pool =
      mode === "legend" ? FALLBACK_QUESTIONS_LEGEND : FALLBACK_QUESTIONS_TRUE;
    const askedAlready = new Set(history.map((qa) => qa.question));
    return (
      pool.find((q) => !askedAlready.has(q)) ??
      pool[history.length % pool.length]
    );
  };

  const finalizeBackstory = async (history: QAPair[]) => {
    setStep("finalizing");
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/origin-story-finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            petName: petName || "your pet",
            category: categoryLabel(petCategory),
            mode,
            qaHistory: history,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const story =
        typeof data.backstory === "string" && data.backstory.trim()
          ? data.backstory.trim()
          : null;

      if (!story) {
        throw new Error("Empty backstory returned");
      }

      setBackstory(story);
      setStep("result");
    } catch (err) {
      console.error("origin-story-finalize failed:", err);
      setErrorMessage(
        "Couldn't reach the storyteller just now. Want to try again?"
      );
      setStep("error");
    }
  };

  const handleNext = () => {
    const trimmed = answerText.trim();
    if (!trimmed) return;

    const updatedHistory = [
      ...qaHistory,
      { question: currentQuestion, answer: trimmed },
    ];
    setQaHistory(updatedHistory);
    setAnswerText("");

    if (updatedHistory.length >= TOTAL_QUESTIONS) {
      finalizeBackstory(updatedHistory);
    } else {
      fetchNextQuestion(updatedHistory);
    }
  };

  const handleRetryFinalize = () => {
    // A failed request isn't the user asking for a new draft — it's just
    // retrying the same one, so this never touches the free redo or coins.
    finalizeBackstory(qaHistory);
  };

  const handleRegenerate = () => {
    setRedoError(null);

    if (!hasUsedFreeRedo) {
      setHasUsedFreeRedo(true);
      finalizeBackstory(qaHistory);
      return;
    }

    // Check and spend coins BEFORE calling the API — otherwise we'd have
    // already paid for the request regardless of whether they could afford
    // it, which defeats the point of the gate.
    if (coins < REDO_COST) {
      setRedoError(
        `You need ${REDO_COST} 🪙 to rewrite again — you have ${coins}. Log a daily activity or play a minigame to earn more!`
      );
      return;
    }

    const success = spendCoins(REDO_COST);
    if (!success) {
      setRedoError("Something went wrong spending your coins. Try again.");
      return;
    }

    finalizeBackstory(qaHistory);
  };

  const handleSave = () => {
    if (backstory) {
      onComplete(backstory);
    }
    onClose();
  };

  const questionNumber = qaHistory.length + 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color={WOOD_DARK} />
          </Pressable>

          {step === "intro" && (
            <View style={styles.centeredContent}>
              <Text style={styles.introEmoji}>📖✨</Text>
              <Text style={styles.title}>
                {petName ? `${petName}'s Origin Story` : "Your Pet's Origin Story"}
              </Text>
              <Text style={styles.bodyText}>
                Answer a few quick questions and we'll weave them into a
                backstory for {petName || "your pet"}. Which kind of story do
                you want to tell?
              </Text>

              <Pressable
                style={styles.modeCard}
                onPress={() => startInterview("true")}
              >
                <Text style={styles.modeCardEmoji}>📸</Text>
                <Text style={styles.modeCardTitle}>True Story</Text>
                <Text style={styles.modeCardSubtitle}>
                  A heartfelt story about how you two actually found each
                  other.
                </Text>
              </Pressable>

              <Pressable
                style={styles.modeCard}
                onPress={() => startInterview("legend")}
              >
                <Text style={styles.modeCardEmoji}>👑</Text>
                <Text style={styles.modeCardTitle}>Secret Legend</Text>
                <Text style={styles.modeCardSubtitle}>
                  A whimsical myth about the epic past life {petName || "your pet"}{" "}
                  secretly lived before becoming your pet.
                </Text>
              </Pressable>
            </View>
          )}

          {step === "question" && (
            <View>
              <Text style={styles.progressLabel}>
                Question {questionNumber} of {TOTAL_QUESTIONS}
              </Text>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${((questionNumber - 1) / TOTAL_QUESTIONS) * 100}%`,
                    },
                  ]}
                />
              </View>

              <Text style={styles.questionText}>{currentQuestion}</Text>

              <TextInput
                style={styles.answerInput}
                placeholder="Type your answer..."
                placeholderTextColor="#A88A55"
                multiline
                autoFocus
                value={answerText}
                onChangeText={setAnswerText}
              />

              <Pressable
                style={[
                  styles.primaryButton,
                  !answerText.trim() && styles.primaryButtonDisabled,
                ]}
                onPress={handleNext}
                disabled={!answerText.trim()}
              >
                <Text style={styles.primaryButtonText}>
                  {questionNumber >= TOTAL_QUESTIONS
                    ? "Finish & write the story"
                    : "Next question"}
                </Text>
              </Pressable>
            </View>
          )}

          {step === "loading-question" && (
            <View style={styles.centeredContent}>
              <ActivityIndicator color={WOOD_DARK} size="large" />
              <Text style={styles.loadingText}>Thinking of a question...</Text>
            </View>
          )}

          {step === "finalizing" && (
            <View style={styles.centeredContent}>
              <ActivityIndicator color={WOOD_DARK} size="large" />
              <Text style={styles.loadingText}>
                Writing {petName || "your pet"}'s story...
              </Text>
            </View>
          )}

          {step === "error" && (
            <View style={styles.centeredContent}>
              <Text style={styles.introEmoji}>😿</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
              <Pressable
                style={styles.primaryButton}
                onPress={handleRetryFinalize}
              >
                <Text style={styles.primaryButtonText}>Try again</Text>
              </Pressable>
            </View>
          )}

          {step === "result" && backstory && (
            <View>
              <Text style={styles.title}>
                {mode === "legend"
                  ? petName
                    ? `${petName}'s Legend`
                    : "The Legend"
                  : petName
                  ? `${petName}'s Story`
                  : "The Story"}
              </Text>

              <ScrollView style={styles.resultScroll}>
                <Text style={styles.resultText}>{backstory}</Text>
              </ScrollView>

              <Pressable style={styles.primaryButton} onPress={handleSave}>
                <Text style={styles.primaryButtonText}>
                  Save to {petName ? `${petName}'s` : "the"} profile
                </Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={handleRegenerate}
              >
                <Text style={styles.secondaryButtonText}>
                  {hasUsedFreeRedo
                    ? `Write it differently (🪙 ${REDO_COST})`
                    : "Write it differently (free)"}
                </Text>
              </Pressable>

              {redoError && (
                <Text style={styles.redoErrorText}>{redoError}</Text>
              )}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: PARCHMENT,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: WOOD_MID,
    padding: 22,
  },

  closeButton: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  centeredContent: {
    alignItems: "center",
    paddingVertical: 12,
  },

  introEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },

  title: {
    color: WOOD_DARK,
    fontWeight: "800",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 10,
  },

  bodyText: {
    color: "#4A2F17",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 20,
  },

  progressLabel: {
    color: WOOD_MID,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(107,74,40,0.2)",
    marginBottom: 18,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: GOLD,
  },

  questionText: {
    color: WOOD_DARK,
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 16,
  },

  answerInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    minHeight: 90,
    fontSize: 15,
    color: "#333",
    textAlignVertical: "top",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E3CFA0",
  },

  modeCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E3CFA0",
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },

  modeCardEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },

  modeCardTitle: {
    color: WOOD_DARK,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 4,
  },

  modeCardSubtitle: {
    color: "#6B4A28",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },

  primaryButton: {
    backgroundColor: WOOD_DARK,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonDisabled: {
    opacity: 0.4,
  },

  primaryButtonText: {
    color: PARCHMENT,
    fontWeight: "700",
    fontSize: 15,
  },

  secondaryButton: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },

  secondaryButtonText: {
    color: WOOD_MID,
    fontWeight: "700",
    fontSize: 13,
    textDecorationLine: "underline",
  },

  redoErrorText: {
    marginTop: 8,
    color: "#8B3A2B",
    fontWeight: "600",
    fontSize: 13,
    textAlign: "center",
  },

  loadingText: {
    marginTop: 12,
    color: WOOD_DARK,
    fontWeight: "700",
    fontSize: 14,
  },

  resultScroll: {
    maxHeight: 340,
    marginBottom: 16,
  },

  resultText: {
    color: "#4A2F17",
    fontSize: 15,
    lineHeight: 22,
  },
});