export type Category = "accessories" | "clothes" | "devices" | "wallets" | "keys" | "bags" | "study" | "others";

export interface PostReportPayload {
    center_id: string;
    type: "lost" | "found";
    title: string;
    description?: string;
    category: Category;
    lat: number;
    lng: number;
    photo_path?: string;
}

export interface Post {
    id: string;
    user_id: string;
    center_id: string;
    type: "lost" | "found";
    title: string;
    description: string;
    translated_description?: string;
    category: Category;
    status: "active" | "matched" | "returned";
    coords: {
        lat: number;
        lng: number;
        geohash: string;
    };
    photo_path: string;
    photo_url?: string;
    vision_labels?: string[];
    created_at: number;
    updated_at: number;
    is_deleted: boolean;
}

export type SupportedLanguage = "es" | "en" | "ca";

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    center_id: string;
    role: "student" | "admin";
    photoUrl?: string;
    photoUpdatedAt?: number;
    settings?: {
        language?: SupportedLanguage;
        push_notifications?: boolean;
        dark_mode?: boolean;
    };
    created_at: number;
    updated_at: number;
    is_deleted: boolean;
}

export interface FeedFilterPayload {
    center_id: string;
    type: "lost" | "found";
    category?: Category;
    search_term?: string;
    max_results?: number;
    user_lat?: number;
    user_lng?: number;
    sort_by?: "date" | "distance";
}


export interface Center {
    id: string;
    name: string;
    email_domains: { [key: string]: boolean };
    bounds: {
        latMin: number;
        latMax: number;
        lngMin: number;
        lngMax: number;
    };
    center_lat?: number;
    center_lng?: number;
    radius_meters?: number;
    is_active: boolean;
}
