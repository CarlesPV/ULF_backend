import { v2 as translate } from "@google-cloud/translate";
import { SupportedLanguage } from "./types";

/**
 * Instancia del cliente de Google Cloud Translation API v2.
 */
export const translateClient = new translate.Translate();

/**
 * Lista de los 3 idiomas soportados oficialmente en la plataforma.
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["es", "en", "ca"];

/**
 * Idioma base del backend para realizar las búsquedas semánticas y emparejamientos comunes.
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = "es";

/**
 * Traduce una cadena de texto a un idioma de destino de manera asíncrona usando Google Cloud Translation API.
 * 
 * @param text - Cadena de texto que se desea traducir.
 * @param target - Código del idioma destino ("es", "en", "ca").
 * 
 * @returns Promesa con el texto traducido. Si la cadena de texto está vacía o nula, se devuelve tal cual.
 * @throws Lanzará una excepción si falla la conexión o el servicio de Google Cloud Translation.
 */
export async function translateText(text: string, target: SupportedLanguage): Promise<string> {
    if (!text || text.trim() === "") return text;
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        return text;
    }
    const [translation] = await translateClient.translate(text, target);
    return translation;
}

/**
 * Traduce una lista de etiquetas textuales (separadas por comas) al idioma objetivo y retorna un arreglo normalizado.
 * 
 * Este método se emplea típicamente para procesar las etiquetas de imágenes analizadas (`vision_labels`).
 * Si la traducción falla por red o cuotas de API, devuelve una copia normalizada de las etiquetas originales en minúsculas.
 * 
 * @param labelsText - Cadena de etiquetas separadas por comas.
 * @param target - Código del idioma destino.
 * 
 * @returns Promesa con el arreglo de etiquetas procesadas, limpias y en minúsculas.
 */
export async function translateLabels(labelsText: string, target: SupportedLanguage): Promise<string[]> {
    try {
        const translation = await translateText(labelsText, target);
        return translation
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l.length > 0);
    } catch (error) {
        console.error(`[Fallo de Traducción] No se pudieron traducir las etiquetas al idioma ${target}:`, error);
        return labelsText
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l.length > 0);
    }
}
