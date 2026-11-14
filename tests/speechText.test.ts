import { describe, expect, it } from "vitest";
import { speakableUnits } from "@/lib/speechText";

describe("speakableUnits: spell out units for the voice only", () => {
  it.each([
    ["Fat 0g", "Fat 0 grams"],
    ["Sugar 27 g", "Sugar 27 grams"],
    ["Protein 1g", "Protein 1 gram"],
    ["Caffeine 80mg", "Caffeine 80 milligrams"],
    ["Sodium 105 mg per serving", "Sodium 105 milligrams per serving"],
    ["Vitamin B12 2.4 mcg", "Vitamin B12 2.4 micrograms"],
    ["8.4 fl oz can", "8.4 fluid ounces can"],
    ["12 fl. oz", "12 fluid ounces"],
    ["16 oz (453 g)", "16 ounces (453 grams)"],
    ["1 oz", "1 ounce"],
    ["Calories 110 kcal", "Calories 110 calories"],
    ["250 mL bottle", "250 milliliters bottle"],
    ["2 L", "2 liters"],
    ["5 lb bag", "5 pounds bag"],
    ["250% DV", "250 percent daily value"],
    ["10%", "10 percent"],
    ["per 100g", "per 100 grams"],
    ["200 mg/serving", "200 milligrams per serving"],
    ["Total Fat 0g, Sodium 200mg, Sugars 0g", "Total Fat 0 grams, Sodium 200 milligrams, Sugars 0 grams"],
  ])("%s → %s", (input, expected) => {
    expect(speakableUnits(input, "en-US")).toBe(expected);
  });

  it("leaves words and other text alone", () => {
    expect(speakableUnits("Go to Gate 5 for the bus", "en-US")).toBe("Go to Gate 5 for the bus");
    expect(speakableUnits("Lemon sorbet, vegan and gluten free", "en-US")).toBe("Lemon sorbet, vegan and gluten free");
    expect(speakableUnits("Highway 5 is closed", "en-US")).toBe("Highway 5 is closed");
  });

  it("only rewrites English, so other languages keep their own unit reading", () => {
    expect(speakableUnits("Azúcar 27 g", "es-ES")).toBe("Azúcar 27 g");
  });
});
