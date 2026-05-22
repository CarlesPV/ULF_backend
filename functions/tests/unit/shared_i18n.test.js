describe("shared i18n", () => {
  test("returns notification strings for the requested language", () => {
    const { getNotificationString } = require("../../lib/shared/i18n");

    expect(getNotificationString("new_message_title", "es")).toBe("Nuevo mensaje");
    expect(getNotificationString("new_message_title", "ca")).toBe("Nou missatge");
  });

  test("falls back to English for unsupported languages", () => {
    const { getNotificationString } = require("../../lib/shared/i18n");

    expect(getNotificationString("match_found_title", "fr")).toBe("Possible match!");
  });
});
