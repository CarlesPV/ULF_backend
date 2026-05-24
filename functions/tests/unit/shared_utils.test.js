const { levenshteinDistance, stringSimilarity } = require("../../lib/shared/utils");

describe("shared utils - string similarity", () => {
  test("calculates correct Levenshtein distance", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("hello", "hell")).toBe(1);
    expect(levenshteinDistance("hello", "hella")).toBe(1);
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  test("calculates correct string similarity ratio", () => {
    expect(stringSimilarity("hello", "hello")).toBe(1.0);
    expect(stringSimilarity("", "")).toBe(1.0);
    expect(stringSimilarity("hello", "")).toBe(0.0);
    expect(stringSimilarity("", "hello")).toBe(0.0);

    // "pantalo" and "pantalon": distance=1, maxLen=8, similarity = 1 - 1/8 = 0.875
    expect(stringSimilarity("pantalo", "pantalon")).toBe(0.875);
    
    // "llaver" and "llavero": distance=1, maxLen=7, similarity = 1 - 1/7 = 0.857...
    expect(stringSimilarity("llaver", "llavero")).toBeCloseTo(0.857, 3);

    // "keys" and "key": distance=1, maxLen=4, similarity = 1 - 1/4 = 0.75
    expect(stringSimilarity("keys", "key")).toBe(0.75);
  });
});
