/**
 * Shared types for receipt data structures
 */

export interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
  category: string;
  discount?: number;
}

export interface ParsedReceiptData {
  store_name: string;
  total_amount: number;
  receipt_date: string;
  items: ReceiptItem[];
}

export interface Receipt {
  id: string;
  store_name: string | null;
  total_amount: number | null;
  receipt_date: string | null;
  items: ReceiptItem[] | null;
  image_url: string | null;
  image_urls: string[] | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}
