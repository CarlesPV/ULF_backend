import { SupportedLanguage, PostStatus } from "./types";

/**
 * Diccionario centralizado de cadenas y códigos para internacionalización (i18n) en el Backend.
 * 
 * Contiene dos secciones principales organizadas para dar soporte a los 3 idiomas (es, en, ca):
 * 1. `notifications`: Estructura con plantillas localizadas para títulos y cuerpos de notificaciones push.
 * 2. `errors`: Códigos de error unificados y estandarizados que se envían al Frontend para ser traducidos
 *    a nivel de interfaz de usuario. Esto permite separar las preocupaciones y mantener la flexibilidad del diseño sin romper
 *    los diccionarios del cliente.
 */
export const I18N_STRINGS = {
    notifications: {
        new_message_title: {
            es: "Nuevo mensaje",
            en: "New message",
            ca: "Nou missatge"
        },
        new_image_body: {
            es: "Te ha enviado una imagen",
            en: "Sent you an image",
            ca: "T'ha enviat una imatge"
        },
        image_message: {
            es: "📷 Imagen",
            en: "📷 Image",
            ca: "📷 Imatge"
        },
        match_found_title: {
            es: "¡Posible coincidencia!",
            en: "Possible match!",
            ca: "Possible coincidència!"
        },
        match_found_body: {
            es: "Hemos encontrado un objeto que coincide en un 80% o más con tu publicación.",
            en: "We found an item that matches your post by 80% or more.",
            ca: "Hem trobat un objecte que coincideix en un 80% o més amb la teva publicació."
        }
    },
    statuses: {
        active: {
            es: "Buscando",
            ca: "Buscant",
            en: "Searching"
        },
        matched: {
            es: "Posible coincidencia",
            ca: "Possible coincidència",
            en: "Potential match"
        },
        returned: {
            es: "Devuelto",
            ca: "Retornat",
            en: "Returned"
        },
        rejected: {
            es: "Rechazado",
            ca: "Rebutjat",
            en: "Rejected"
        }
    },
    // Códigos de error estandarizados que se transmiten al cliente para traducción dinámica en la interfaz de usuario
    errors: {
        unauthorized: "error_unauthorized",
        unverified_email: "error_unverified_email",
        invalid_argument: "error_invalid_argument",
        invalid_language: "error_invalid_language",
        item_not_found: "error_item_not_found",
        internal_error: "error_internal_error",
        domain_not_authorized: "error_domain_not_authorized",
        center_inactive: "error_center_inactive",
        email_already_exists: "error_email_already_exists",
        incomplete_data: "error_incomplete_data",
        legal_acceptance_required: "error_legal_acceptance_required",
        out_of_bounds_location: "error_out_of_bounds_location",
        invalid_profile_data: "error_invalid_profile_data",
        coords_required: "error_coords_required",
        coords_invalid: "error_coords_invalid",
        gps_required: "error_gps_required",
        category_not_allowed: "error_category_not_allowed",
        center_not_found: "error_center_not_found",
        center_config_error: "error_center_config_error",
        db_write_error: "error_db_write_error"
    },
    error_translations: {
        error_gps_required: {
            es: "Coordenadas GPS requeridas para esta acción",
            ca: "Coordenades GPS requerides per a aquesta acció",
            en: "GPS coordinates required for this action"
        }
    }
};

/**
 * Obtiene y resuelve la cadena localizada para una notificación push en base al idioma preferido del destinatario.
 * 
 * @param key - Clave que identifica la plantilla de notificación dentro del diccionario `I18N_STRINGS.notifications`.
 * @param lang - Código del idioma seleccionado por el usuario ("es", "en", "ca"). Por defecto se utiliza "en" (inglés).
 * 
 * @returns La cadena de texto traducida. Si el idioma no está disponible, realiza un fallback automático a inglés.
 */
export function getNotificationString(
    key: keyof typeof I18N_STRINGS.notifications,
    lang: SupportedLanguage = "en"
): string {
    const stringSet = I18N_STRINGS.notifications[key];
    return (stringSet as any)[lang] || (stringSet as any)["en"];
}

/**
 * Obtiene y resuelve la cadena localizada para un estado de publicación en base al idioma preferido.
 * 
 * @param key - Clave que identifica el estado de la publicación ("active", "matched", "returned").
 * @param lang - Código del idioma seleccionado por el usuario ("es", "en", "ca"). Por defecto se utiliza "en" (inglés).
 * 
 * @returns La cadena de texto traducida. Si el idioma no está disponible, realiza un fallback automático a inglés.
 */
export function getStatusString(
    key: PostStatus,
    lang: SupportedLanguage = "en"
): string {
    const stringSet = I18N_STRINGS.statuses[key];
    return (stringSet as any)[lang] || (stringSet as any)["en"];
}

/**
 * Obtiene y resuelve la cadena localizada para un error en base al idioma preferido del destinatario.
 * 
 * @param key - Clave del error en el diccionario de traducciones.
 * @param lang - Código del idioma seleccionado ("es", "en", "ca"). Por defecto se utiliza "en".
 * 
 * @returns La cadena de texto traducida o el fallback a inglés.
 */
export function getErrorString(
    key: keyof typeof I18N_STRINGS.error_translations,
    lang: SupportedLanguage = "en"
): string {
    const stringSet = I18N_STRINGS.error_translations[key];
    return (stringSet as any)[lang] || (stringSet as any)["en"];
}

