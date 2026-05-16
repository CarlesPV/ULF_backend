describe("shared translate", () => {
  let translateMock;

  beforeEach(() => {
    jest.resetModules();
    translateMock = jest.fn();
    jest.doMock("@google-cloud/translate", () => ({
      v2: {
        Translate: jest.fn(() => ({
          translate: translateMock
        }))
      }
    }));
  });

  test("translateText returns empty input without calling Translate", async () => {
    const { translateText } = require("../../lib/shared/translate");

    await expect(translateText("   ", "es")).resolves.toBe("   ");
    expect(translateMock).not.toHaveBeenCalled();
  });

  test("translateText delegates non-empty text to the Translate client", async () => {
    translateMock.mockResolvedValue(["Texto traducido"]);
    const { translateText } = require("../../lib/shared/translate");

    await expect(translateText("Translated text", "es")).resolves.toBe("Texto traducido");
    expect(translateMock).toHaveBeenCalledWith("Translated text", "es");
  });

  test("translateLabels splits translated comma-separated labels", async () => {
    translateMock.mockResolvedValue(["Llaves, Mochila,  "]);
    const { translateLabels } = require("../../lib/shared/translate");

    await expect(translateLabels("keys, backpack", "es")).resolves.toEqual(["llaves", "mochila"]);
  });

  test("translateLabels falls back to raw labels when translation fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    translateMock.mockRejectedValue(new Error("translate failed"));
    const { translateLabels } = require("../../lib/shared/translate");

    await expect(translateLabels("Keys, Backpack", "es")).resolves.toEqual(["keys", "backpack"]);
  });
});
