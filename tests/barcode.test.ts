import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  fromOpenFda,
  fromOpenFoodFacts,
  looksLikeMedicine,
  ndcStrength,
  gtin14,
  isDrugUpc,
  validBarcode,
} from "@/lib/barcode";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const section = (r: { sections: { title: string; body: string }[] }, title: string) =>
  r.sections.find((s) => s.title === title)?.body ?? "";

describe("validBarcode (UPC-A, EAN-13, EAN-8, GTIN-14 with check digit)", () => {
  it.each([
    "049000028911", // Coca-Cola UPC-A
    "044000046316", // Nutter Butter
    "0044000046309",
    "300450406026", // Tylenol (drug UPC)
    "4006381333931", // EAN-13
    "96385074", // EAN-8
    "00012345678905", // GTIN-14
  ])("accepts %s", (code) => {
    expect(validBarcode(code)).toBe(code);
  });

  it("trims spaces around the digits", () => {
    expect(validBarcode(" 049000028911 ")).toBe("049000028911");
  });

  it.each([
    "049000028912", // wrong check digit
    "4006381333932",
    "1234567", // 7 digits
    "12345678901", // 11 digits
    "123456789012345", // 15 digits
    "04900002891a",
    "",
  ])("rejects %s", (code) => {
    expect(validBarcode(code)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(validBarcode(49000028911)).toBeNull();
    expect(validBarcode(undefined)).toBeNull();
  });

  it("pads to GTIN-14 so UPC-A and EAN-13 forms share a cache entry", () => {
    expect(gtin14("049000028911")).toBe("00049000028911");
    expect(gtin14("0049000028911")).toBe("00049000028911");
  });

  it("spots US drug UPCs (number system 3)", () => {
    expect(isDrugUpc("300450406026")).toBe(true);
    expect(isDrugUpc("0300450406026")).toBe(true);
    expect(isDrugUpc("049000028911")).toBe(false);
    expect(isDrugUpc("96385074")).toBe(false);
  });
});

describe("fromOpenFoodFacts", () => {
  it("returns null for a product Open Food Facts doesn't have", () => {
    expect(fromOpenFoodFacts(fixture("off-missing"))).toBeNull();
  });

  it("snack: name, size, allergens and sugar, spoken in about 25 words", () => {
    const r = fromOpenFoodFacts(fixture("off-snack"))!;
    expect(r).toMatchObject({ found: true, source: "openfoodfacts", itemKind: "food_drink" });
    expect(r.title).toBe("Nutter Butter");
    expect(r.spokenText).toContain("Nutter Butter, 16 oz (453 g).");
    expect(r.spokenText).toContain("Contains gluten, peanuts and soy.");
    expect(r.spokenText).toContain("8 grams of sugar per serving");
    expect(words(r.spokenText)).toBeLessThanOrEqual(25);
  });

  it("snack: deterministic sections", () => {
    const r = fromOpenFoodFacts(fixture("off-snack"))!;
    expect(r.sections.map((s) => s.title)).toEqual([
      "Nutrition (per serving)",
      "Ingredients",
      "Allergens",
      "Score",
    ]);
    const n = section(r, "Nutrition (per serving)");
    for (const line of [
      "Serving: 2 cookies (28 g)",
      "Calories: 130",
      "Fat: 5 g",
      "Saturated fat: 1.5 g",
      "Sugar: 8 g",
      "Sodium: 108 mg",
      "Protein: 2 g",
      "Fiber: 1 g",
    ]) {
      expect(n).toContain(line);
    }
    expect(section(r, "Ingredients")).toMatch(/^UNBLEACHED ENRICHED FLOUR/);
    expect(section(r, "Allergens")).toBe("Contains: gluten, peanuts, soy");
    expect(section(r, "Score")).toContain("Nutri-Score: E");
    expect(section(r, "Score")).toContain("NOVA group 4 (ultra-processed)");
    expect(r.image).toMatch(/^https:\/\/images\.openfoodfacts\.org\//);
  });

  it("soda: caffeine instead of sugar, and says when no allergens are listed", () => {
    const r = fromOpenFoodFacts(fixture("off-soda"))!;
    expect(r.title).toBe("Diet Coke Soft Drink");
    expect(r.spokenText).toContain("Diet Coke Soft Drink by Coca-Cola");
    expect(r.spokenText).toContain("No allergens listed.");
    expect(r.spokenText).toContain("46 milligrams of caffeine per serving");
    expect(words(r.spokenText)).toBeLessThanOrEqual(25);
    const n = section(r, "Nutrition (per serving)");
    expect(n).toContain("Calories: 0");
    expect(n).toContain("Sodium: 40 mg");
    expect(n).toContain("Caffeine: 46 mg");
    expect(section(r, "Score")).toContain("Nutri-Score: B");
  });

  it("sparse product: per-100 g nutrition and an honest allergen line", () => {
    const r = fromOpenFoodFacts(fixture("off-sparse"))!;
    expect(r.found).toBe(true);
    expect(r.spokenText).toContain("Nutter Butter.");
    expect(r.spokenText).toContain("No allergen information.");
    expect(r.sections.map((s) => s.title)).toContain("Nutrition (per 100 g)");
    expect(section(r, "Nutrition (per 100 g)")).toContain("Sugar: 28.6 g");
    expect(r.sections.map((s) => s.title)).not.toContain("Score");
  });
});

describe("fromOpenFda", () => {
  const label = fixture("fda-label-tylenol").results[0];
  const recalls = fixture("fda-enforcement-tylenol").results;

  it("puts recalls first, in the spoken answer and the sections", () => {
    const r = fromOpenFda(label, recalls);
    expect(r).toMatchObject({ found: true, source: "openfda", itemKind: "medicine" });
    expect(r.title).toBe("Tylenol Extra Strength");
    expect(r.spokenText).toMatch(/^Tylenol Extra Strength: recalled/);
    expect(r.spokenText.toLowerCase()).toContain("defective container");
    expect(r.spokenText.toLowerCase()).toContain("acetaminophen 500 mg");
    expect(words(r.spokenText)).toBeLessThanOrEqual(30);
    expect(r.sections[0].title).toBe("Recalls");
    expect(r.sections[0].body).toContain("Class II");
    expect(r.sections[0].body).toContain("Ongoing");
    expect(r.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining(["Uses", "Active ingredient", "Warnings", "Directions"]),
    );
  });

  it("without recalls, says what it is and what it's for", () => {
    const r = fromOpenFda(label, []);
    expect(r.spokenText).toMatch(/^Tylenol Extra Strength,/);
    expect(r.spokenText.toLowerCase()).toContain("pain reliever");
    expect(r.spokenText).toContain("No recalls found.");
    expect(r.sections[0].title).not.toBe("Recalls");
  });
});

describe("barcode data quality (QA #8, #9)", () => {
  const withProduct = (name: string, patch: Record<string, unknown>) => {
    const f = fixture(name);
    return { ...f, product: { ...f.product, ...patch } };
  };

  it("a multipack says the pack and the unit size, not the total", () => {
    const r = fromOpenFoodFacts(fixture("off-soda"))!;
    expect(r.spokenText).toContain("12-pack of 12 fl oz");
    expect(r.spokenText).not.toContain("144 fl oz");
  });

  it("a package of cookies isn't a multipack", () => {
    const r = fromOpenFoodFacts(fixture("off-snack"))!;
    expect(r.spokenText).toContain("16 oz (453 g)");
    expect(r.spokenText).not.toContain("-pack");
  });

  it("implausible per-serving data (Oreo: 3 g, 14 calories) falls back to per 100 g, and says so", () => {
    const r = fromOpenFoodFacts(fixture("off-oreo"))!;
    const titles = r.sections.map((x) => x.title);
    expect(titles).toContain("Nutrition (per 100 g)");
    expect(titles).not.toContain("Nutrition (per serving)");
    expect(section(r, "Nutrition (per 100 g)")).toMatch(/per-serving numbers .* looked wrong/i);
    expect(r.spokenText).toContain("per 100 grams");
    expect(r.spokenText).not.toMatch(/\b(14 calories|1\.2 grams)/); // 41.2 g per 100 g is right
  });

  it.each([["400 g ℮"], ["400 g e"]])("strips the estimated-sign from %s", (quantity) => {
    const r = fromOpenFoodFacts(withProduct("off-snack", { quantity }))!;
    expect(r.spokenText).toContain("Nutter Butter, 400 g.");
  });

  it('says "1 gram", not "1 grams"', () => {
    const f = fixture("off-snack");
    f.product.nutriments.sugars_serving = 1;
    const r = fromOpenFoodFacts(f)!;
    expect(r.spokenText).toContain("1 gram of sugar per serving");
  });

  it.each([
    [{ product_name: "Advil 50 tablets" }, true],
    [{ product_name: "Tylenol Extra Strength", brands: "Tylenol" }, true],
    [{ product_name: "Vitamin D3", categories_tags: ["en:dietary-supplements"] }, true],
    [{ product_name: "Ibuprofen 200 mg caplets" }, true],
    [{ product_name: "Nutter Butter", categories_tags: ["en:snacks"] }, false],
    [{ product_name: "Diet Coke Soft Drink", brands: "Coca-Cola" }, false],
  ])("looksLikeMedicine(%j) -> %s", (product, expected) => {
    expect(looksLikeMedicine(product)).toBe(expected);
  });
});

describe("ndcStrength (openFDA NDC directory strengths)", () => {
  it.each([
    ["200 mg/1", "200 mg"],
    ["500 mg/1", "500 mg"],
    ["160 mg/5mL", "160 mg/5mL"],
    ["", ""],
  ])("%s -> %s", (raw, expected) => {
    expect(ndcStrength(raw)).toBe(expected);
  });
});
