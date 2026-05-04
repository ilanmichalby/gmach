import { Timestamp } from "firebase/firestore";

export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'collected' | 'returned';

export interface Item {
  id: string;
  name: string;
  description?: string;
  category: string;
  imageUrl?: string;
  totalQuantity: number;
}

export interface OrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface Order {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  pickupDate: Timestamp;
  returnDate: Timestamp;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CartItem extends Item {
  orderQuantity: number;
}
