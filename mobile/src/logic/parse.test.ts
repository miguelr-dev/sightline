import { describe, expect, it } from "vitest";
import { parseBarcode } from "./parse";

describe("parseBarcode (the barcode read from the photo, on an analyze answer)", () => {
  const server = {
    code: "196633831439",
    found: true,
    source: "openfoodfacts",
    title: "Energy Drink - Tropical",
    brand: "Kirkland",
    spokenText: "Energy Drink - Tropical by Kirkland, 12 oz.",
    sections: [{ title: "Nutrition (per serving)", body: "Calories: 10" }],
    itemKind: "food_drink",
    image: "https://images.openfoodfacts.org/kirkland.jpg",
  };

  it("keeps a found barcode with its code, title, sections and image", () => {
    expect(parseBarcode(server)).toMatchObject({
      code: "196633831439",
      found: true,
      title: "Energy Drink - Tropical",
      sections: [{ title: "Nutrition (per serving)", body: "Calories: 10" }],
      itemKind: "food_drink",
      image: "https://images.openfoodfacts.org/kirkland.jpg",
    });
  });

  it("drops a missing or malformed field", () => {
    expect(parseBarcode(undefined)).toBeUndefined();
    expect(parseBarcode("196633831439")).toBeUndefined();
    expect(parseBarcode({ ...server, code: "abc" })).toBeUndefined();
    expect(parseBarcode({ ...server, spokenText: "" })).toBeUndefined();
  });

  it("falls back to the scanned code when the server leaves it out (GET /api/barcode)", () => {
    const { code: _code, ...noCode } = server;
    void _code;
    expect(parseBarcode(noCode, "049000028911")?.code).toBe("049000028911");
  });
});
