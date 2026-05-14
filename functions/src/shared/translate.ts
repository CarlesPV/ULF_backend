import { v2 as translate } from "@google-cloud/translate";
import { SupportedLanguage } from "./types";

export const translateClient = new translate.Translate();

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["es", "en", "ca"];
export const DEFAULT_LANGUAGE: SupportedLanguage = "es";

/**
 * Utility to translate text to a target language.
 * Throws error if translation fails.
 * @param text The text to translate.
 * @param target The target language code.
 * @returns The translated text.
 */
export async function translateText(text: string, target: SupportedLanguage): Promise<string> {
    if (!text || text.trim() === "") return text;
    const [translation] = await translateClient.translate(text, target);
    return translation;
}

/**
 * Translates labels (comma separated) to a target language and returns an array.
 * Falls back to original labels if translation fails.
 * @param labelsText Comma separated labels.
 * @param target Target language.
 */
export async function translateLabels(labelsText: string, target: SupportedLanguage): Promise<string[]> {
    try {
        const translation = await translateText(labelsText, target);
        return translation
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l.length > 0);
    } catch (error) {
        console.error(`[Translation Error] Failed to translate labels to ${target}:`, error);
        return labelsText
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l.length > 0);
    }
}
