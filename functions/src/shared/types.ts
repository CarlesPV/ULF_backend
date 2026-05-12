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

