export interface MonthlyStat {
    user_id: string;
    month_start: string;
    total_spend: number;
    receipt_count: number;
    avg_per_receipt: number;
}

export interface CategoryBreakdown {
    user_id: string;
    month_start: string;
    category: string;
    total_spend: number;
}

export interface StoreComparison {
    user_id: string;
    month_start: string;
    store_name: string;
    total_spend: number;
    visit_count: number;
}
