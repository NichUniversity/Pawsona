import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { AvatarDisplay } from "../../components/ui/AvatarDisplay";
import { CoinIcon } from "../../components/ui/CoinIcon";
import { TabBackground } from "../../components/ui/TabBackground";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme, withAlpha } from "../../context/ThemeContext";
import {
  CATEGORY_LABELS,
  COSMETICS,
  CosmeticCategory,
} from "../../data/cosmetics";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";

export default function StoreTab() {
  const { pets, setPets, coins, spendCoins } = usePets();
  const { accentColor } = useTheme();
  const tabBarClearance = useTabBarClearance();

  const [selectedPet, setSelectedPet] = useState<PetEntry | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<CosmeticCategory>("hat");

  const confirmedPets = pets.filter((pet) => pet.confirmed);

  const updatePet = (id: string, patch: Partial<PetEntry>) => {
    setPets((prev) =>
      prev.map((pet) => (pet.id === id ? { ...pet, ...patch } : pet))
    );
  };

  const handleBuy = (itemId: string, price: number) => {
    if (!selectedPet) return;
    if (selectedPet.ownedCosmetics.includes(itemId)) return;

    const success = spendCoins(price);
    if (!success) return;

    const nextOwned = [...selectedPet.ownedCosmetics, itemId];
    updatePet(selectedPet.id, { ownedCosmetics: nextOwned });
    setSelectedPet({ ...selectedPet, ownedCosmetics: nextOwned });
  };

  const handleEquip = (itemId: string, category: CosmeticCategory) => {
    if (!selectedPet) return;

    const isEquipped = selectedPet.equippedCosmetics[category] === itemId;

    const nextEquipped = {
      ...selectedPet.equippedCosmetics,
      [category]: isEquipped ? null : itemId,
    };

    updatePet(selectedPet.id, { equippedCosmetics: nextEquipped });
    setSelectedPet({ ...selectedPet, equippedCosmetics: nextEquipped });
  };

  const categories = Object.keys(CATEGORY_LABELS) as CosmeticCategory[];
  const itemsInCategory = COSMETICS.filter(
    (item) => item.category === activeCategory
  );

  return (
    <View style={{ flex: 1 }}>
      <TabBackground />

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: tabBarClearance },
        ]}
      >
      <Text style={styles.title}>🛍️ Pet Store</Text>

      <View style={styles.coinBadge}>
        <CoinIcon size={16} />
        <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
      </View>

      {confirmedPets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Confirm a pet on the Home tab before you go shopping!
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.header}>Shopping for</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.petRow}
          >
            {confirmedPets.map((pet) => (
              <Pressable
                key={pet.id}
                style={[
                  styles.petChip,
                  selectedPet?.id === pet.id && {
                    backgroundColor: accentColor,
                    borderColor: accentColor,
                  },
                ]}
                onPress={() => setSelectedPet(pet)}
              >
                <View style={{ marginBottom: 4 }}>
                  <AvatarDisplay
                    category={pet.category}
                    emoji={pet.selectedEmoji}
                    color={pet.color}
                    size={28}
                  />
                </View>
                <Text
                  style={[
                    styles.petChipName,
                    selectedPet?.id === pet.id && styles.petChipNameActive,
                  ]}
                >
                  {pet.name || "Unnamed Pet"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {selectedPet && (
            <>
              <View style={styles.categoryRow}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryPill,
                      activeCategory === cat && {
                        backgroundColor: accentColor,
                        borderColor: accentColor,
                      },
                    ]}
                    onPress={() => setActiveCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        activeCategory === cat &&
                          styles.categoryPillTextActive,
                      ]}
                    >
                      {CATEGORY_LABELS[cat].emoji}{" "}
                      {CATEGORY_LABELS[cat].label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.grid}>
                {itemsInCategory.map((item) => {
                  const owned = selectedPet.ownedCosmetics.includes(item.id);
                  const equipped =
                    selectedPet.equippedCosmetics[item.category] === item.id;
                  const canAfford = coins >= item.price;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.itemCard,
                        equipped && { borderWidth: 2, borderColor: accentColor },
                      ]}
                    >
                      <Text style={styles.itemEmoji}>{item.emoji}</Text>
                      <Text style={styles.itemName}>{item.name}</Text>

                      {!owned && (
                        <Text style={[styles.itemPrice, { color: accentColor }]}>
                          <CoinIcon size={13} /> {item.price}
                        </Text>
                      )}

                      {owned ? (
                        <Pressable
                          style={[
                            styles.actionButton,
                            equipped
                              ? { backgroundColor: withAlpha(accentColor, 0.15) }
                              : { backgroundColor: accentColor },
                          ]}
                          onPress={() => handleEquip(item.id, item.category)}
                        >
                          <Text
                            style={[
                              styles.actionButtonText,
                              equipped && { color: accentColor },
                            ]}
                          >
                            {equipped ? "Equipped ✓" : "Equip"}
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[
                            styles.actionButton,
                            { backgroundColor: accentColor },
                            !canAfford && styles.buyButtonDisabled,
                          ]}
                          disabled={!canAfford}
                          onPress={() => handleBuy(item.id, item.price)}
                        >
                          <Text style={styles.actionButtonText}>
                            {canAfford ? "Buy" : "Not enough"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },

  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 20,
    paddingTop: 80,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },

  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginBottom: 28,
  },

  coinText: {
    color: "#FF8C42",
    fontWeight: "800",
    fontSize: 16,
  },

  header: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 14,
  },

  emptyCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  emptyText: {
    color: "#F5F5F5",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },

  petRow: {
    gap: 12,
    paddingBottom: 24,
  },

  petChip: {
    backgroundColor: "#1C1C1E",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 84,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  petChipActive: {
    backgroundColor: "#FF8C42",
    borderColor: "#FF8C42",
  },

  petChipEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },

  petChipName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  petChipNameActive: {
    color: "#fff",
  },

  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },

  categoryPill: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  categoryPillActive: {
    backgroundColor: "#FF8C42",
    borderColor: "#FF8C42",
  },

  categoryPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  categoryPillTextActive: {
    color: "#fff",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 14,
  },

  itemCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    padding: 16,
    width: "47%",
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  itemCardEquipped: {
    borderWidth: 2,
    borderColor: "#FF8C42",
  },

  itemEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },

  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F5F5F5",
    textAlign: "center",
    marginBottom: 6,
  },

  itemPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FF8C42",
    marginBottom: 10,
  },

  actionButton: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },

  buyButton: {
    backgroundColor: "#FF8C42",
  },

  buyButtonDisabled: {
    backgroundColor: "#3A3A3C",
  },

  equipButton: {
    backgroundColor: "#FF8C42",
  },

  equippedButton: {
    backgroundColor: "rgba(255,140,66,0.15)",
  },

  actionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  equippedButtonText: {
    color: "#FF8C42",
  },
});