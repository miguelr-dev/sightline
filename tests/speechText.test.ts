import { describe, expect, it } from "vitest";
import { speakable, speakableUnits, speakNumbers } from "@/lib/speechText";

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

  it.each([
    ["10", "ten"],
    ["Serves 2", "Serves two"],
    ["Total 21", "Total twenty-one"],
    ["135 calories", "one hundred thirty-five calories"],
    ["1,250 people", "one thousand two hundred fifty people"],
    ["8.4", "eight point four"],
    ["0.5", "zero point five"],
    ["7.50 dollars", "seven dollars and fifty cents"],
    ["24 dollars", "twenty-four dollars"],
    ["$12.76", "twelve dollars and seventy-six cents"],
    ["$5", "five dollars"],
    ["expires 08/2027", "expires August twenty twenty-seven"],
    ["In 2026", "In twenty twenty-six"],
    ["11:30", "eleven thirty"],
    ["9:05", "nine oh five"],
    ["UPC 196633831439", "UPC one nine six six three three eight three one four three nine"],
    ["Lot 24C117", "Lot 24C117"],
    ["1st and 2nd", "first and second"],
  ])("number %s → %s", (input, expected) => {
    expect(speakNumbers(input, "en-US")).toBe(expected);
  });

  it("does units and numbers together for the voice", () => {
    expect(speakable("Fat 0g, Sodium 105mg, 12 fl oz", "en-US")).toBe("Fat zero grams, Sodium one hundred five milligrams, twelve fluid ounces");
    expect(speakable("Protein 1g", "en-US")).toBe("Protein one gram");
  });

  it.each([
    ["Desserts, 6.50 to 24 dollars.", "Desserts, six dollars and fifty cents to twenty-four dollars."],
    ["$6.50 to $24", "six dollars and fifty cents to twenty-four dollars"],
    ["7 to 24 dollars", "seven to twenty-four dollars"],
    ["7 to 24.50 dollars", "seven dollars to twenty-four dollars and fifty cents"],
    ["6.50-24 dollars", "six dollars and fifty cents to twenty-four dollars"],
  ])("price range %s → %s", (input, expected) => {
    expect(speakable(input, "en-US")).toBe(expected);
  });

  it("only rewrites English, so other languages keep their own unit reading", () => {
    expect(speakableUnits("Azúcar 27 g", "es-ES")).toBe("Azúcar 27 g");
  });
});
