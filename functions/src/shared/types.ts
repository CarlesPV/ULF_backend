export interface PostReportPayload {
    center_id: string;
    type: "lost" | "found";
    title: string;
    description?: string;
    category: string;
    lat: number;
    lng: number;
    photo_path?: string;
}

export interface FeedFilterPayload {
    center_id: string;
    type: "lost" | "found";
    category?: string;
    search_term?: string;
    max_results?: number;
    user_lat?: number;
    user_lng?: number;
    sort_by?: "date" | "distance";
}
