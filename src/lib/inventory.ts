import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Order, Item } from '../types';

export async function getOverlappingOrders(pickup: Date, returnDate: Date): Promise<Order[]> {
  const ordersRef = collection(db, 'orders');
  // We want orders that are NOT rejected or cancelled
  // And overlap with the requested range
  // NOTE: Firestore doesn't support complex range overlaps easily in one query
  // So we fetch active orders and filter in memory if needed, or do a coarse range query
  
  // Coarse fetch: all pending/approved/collected/returned orders
  // Returns are handled: items can be picked up the same day they are returned.
  // So we overlap strictly: existingOrder.pickup < newRequest.return && existingOrder.return > newRequest.pickup
  
  const q = query(
    ordersRef,
    where('status', 'in', ['approved', 'collected', 'pending']) // Pending also blocks stock to avoid double booking
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'orders');
  }
  
  const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

  return allOrders.filter(order => {
    const oPickup = order.pickupDate.toDate();
    const oReturn = order.returnDate.toDate();
    
    // Check overlap:
    // Items returned on Monday can be picked up on Monday.
    // So we don't count it as overlap if one starts exactly when other ends.
    // Overlap: (order.pickup < returnDate) AND (order.return > pickup)
    return oPickup < returnDate && oReturn > pickup;
  });
}

export async function calculateAvailableQuantity(item: Item, pickup: Date, returnDate: Date, orders: Order[]): Promise<number> {
  const used = orders.reduce((sum, order) => {
    const orderItem = order.items.find(i => i.itemId === item.id);
    return sum + (orderItem?.quantity || 0);
  }, 0);

  return Math.max(0, item.totalQuantity - used);
}
