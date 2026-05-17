import { SupportedLanguage } from "./types";

export const I18N_STRINGS = {
    notifications: {
        new_message_title: {
            es: "Nuevo mensaje",
            en: "New message",
            ca: "Nou missatge"
        },
        potential_match_title: {
            es: "¡Posible coincidencia!",
            en: "Potential match!",
            ca: "Possible coincidència!"
        },
        potential_match_body: {
            es: "Alguien ha publicado un objeto que podría ser el tuyo.",
            en: "Someone posted an item that might be yours.",
            ca: "Algú ha publicat un objecte que podria ser el teu."
        },
        match_found_title: {
            es: "¡Coincidencia encontrada!",
            en: "Match found!",
            ca: "¡Coincidència trobada!"
        },
        match_found_body: {
            es: "Se encontró un objeto que podría coincidir con tu búsqueda.",
            en: "An item was found that might match your search.",
            ca: "Es va trobar un objecte que podria coincidir amb la teva recerca."
        }
    },
    // Error keys to be sent to frontend for translation
    errors: {
        unauthorized: "error_unauthorized",
        unverified_email: "error_unverified_email",
        invalid_argument: "error_invalid_argument",
        item_not_found: "error_item_not_found",
        internal_error: "error_internal_error",
        domain_not_authorized: "error_domain_not_authorized",
        center_inactive: "error_center_inactive",
        email_already_exists: "error_email_already_exists",
        incomplete_data: "error_incomplete_data",
        out_of_bounds_location: "error_out_of_bounds_location",
        invalid_profile_data: "error_invalid_profile_data",
        coords_required: "error_coords_required",
        coords_invalid: "error_coords_invalid",
        category_not_allowed: "error_category_not_allowed",
        center_not_found: "error_center_not_found",
        center_config_error: "error_center_config_error",
        db_write_error: "error_db_write_error"
    }
};

/**
 * Gets a localized string for notifications.
 */
export function getNotificationString(
    key: keyof typeof I18N_STRINGS.notifications,
    lang: SupportedLanguage = "en"
): string {
    const stringSet = I18N_STRINGS.notifications[key];
    return (stringSet as any)[lang] || (stringSet as any)["en"];
}
