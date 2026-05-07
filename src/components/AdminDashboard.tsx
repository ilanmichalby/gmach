import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order, Item, OrderStatus } from '../types';
import { getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { 
  RefreshCw, 
  Database, 
  Search, 
  ExternalLink, 
  Loader2, 
  DatabaseZap,
  ClipboardList, 
  Package, 
  Settings, 
  Check, 
  X, 
  Trash2, 
  Plus, 
  Image as ImageIcon,
  Clock,
  User as UserIcon,
  Phone,
  Mail,
  Calendar
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CATEGORIES, ADMIN_EMAILS } from '../constants';

interface AdminDashboardProps {
  user: User | null;
}

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);

  const syncFromAirtable = async () => {
    if (!confirm('האם לסנכרן נתונים מאיירטייבל? זה עשוי לעדכן פריטים קיימים ולהעלות תמונות ל-Storage.')) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/sync-airtable', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
      } else {
        const errorMsg = data.error || 'שגיאה לא ידועה';
        alert(`שגיאת סנכרון: ${errorMsg}\n(סטטוס: ${res.status})`);
      }
    } catch (error) {
      console.error('Sync request failed:', error);
      alert('שגיאת תקשורת עם השרת. ייתכן שהפעולה לקחה זמן רב מדי (Timeout) או שחסרים משתני סביבה ב-Vercel.');
    } finally {
      setSyncing(false);
    }
  };

  // Orders and Inventory listeners
  useEffect(() => {
    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return;

    const ordersUnsubscribe = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      async (snapshot) => {
        // For each order, we need to fetch the private contact info
        const ordersWithContact = await Promise.all(snapshot.docs.map(async d => {
          const orderData = d.data() as Order;
          try {
            const contactSnap = await getDocs(collection(db, 'orders', d.id, 'private'));
            const contactData = contactSnap.docs[0]?.data();
            return { 
              id: d.id, 
              ...orderData, 
              userName: contactData?.userName || 'ללא שם',
              userEmail: contactData?.userEmail || '',
              userPhone: contactData?.userPhone || ''
            } as Order;
          } catch (e) {
            return { id: d.id, ...orderData, userName: 'נחסם - אין הרשאה' } as Order;
          }
        }));
        setOrders(ordersWithContact);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    const itemsUnsubscribe = onSnapshot(
      query(collection(db, 'items'), orderBy('name', 'asc')),
      (snapshot) => {
        setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
      }
    );

    return () => {
      ordersUnsubscribe();
      itemsUnsubscribe();
    };
  }, [user]);

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        status, 
        updatedAt: Timestamp.now() 
      });
    } catch (error) {
      console.error('Update status failed', error);
    }
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'approved': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'collected': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'returned': return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      case 'cancelled': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return 'ממתין לאישור';
      case 'approved': return 'מאושר';
      case 'collected': return 'נאסף';
      case 'returned': return 'הוחזר';
      case 'rejected': return 'נדחה';
      case 'cancelled': return 'בוטל';
      default: return status;
    }
  };

  const openWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">גישה מוגבלת</h2>
        <p className="text-slate-500">רק מנהל מערכת מורשה לגשת לדף זה.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex-1">
          <button
            onClick={() => setActiveTab('orders')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all",
              activeTab === 'orders' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <ClipboardList size={20} />
            <span>הזמנות</span>
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">
                {orders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all",
              activeTab === 'inventory' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Package size={20} />
            <span>ניהול מלאי</span>
          </button>
        </div>

        <button
          onClick={syncFromAirtable}
          disabled={syncing}
          className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 font-bold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
        >
          {syncing ? <Loader2 size={20} className="animate-spin text-indigo-600" /> : <DatabaseZap size={20} className="text-indigo-600" />}
          <span>סנכרון מאיירטייבל</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
          <p className="text-slate-500">טוען נתונים...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeTab === 'orders' ? (
            <div className="space-y-4">
              <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <Search size={20} className="text-slate-400" />
                <input 
                  type="text" 
                  placeholder="חפש לפי שם, אימייל או טלפון..."
                  className="w-full outline-none text-sm"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-6">
                {orders
                  .filter(o => 
                    o.userName.includes(searchTerm) || 
                    o.userEmail.includes(searchTerm) || 
                    o.userPhone.includes(searchTerm)
                  )
                  .map(order => (
                    <OrderCard 
                      key={order.id} 
                      order={order} 
                      onUpdateStatus={updateOrderStatus} 
                      onWhatsApp={openWhatsApp}
                      getStatusColor={getStatusColor}
                      getStatusLabel={getStatusLabel}
                    />
                  ))}
              </div>
            </div>
          ) : (
            <InventoryManager items={items} />
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onUpdateStatus, onWhatsApp, getStatusColor, getStatusLabel }: any) {
  const [expanded, setExpanded] = useState(false);
  const pickup = order.pickupDate.toDate();
  const returnDate = order.returnDate.toDate();

  return (
    <div className={cn(
      "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300",
      expanded ? "ring-2 ring-indigo-500 ring-offset-4" : "hover:shadow-md hover:border-slate-300"
    )}>
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="space-y-1">
            <h3 className="text-xl font-bold tracking-tight flex items-center gap-2 text-slate-900">
              <UserIcon size={18} className="text-indigo-500" />
              {order.userName}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 font-medium">
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded"><Mail size={14} className="text-slate-400" /> {order.userEmail}</span>
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded"><Phone size={14} className="text-slate-400" /> {order.userPhone}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className={cn("px-4 py-1 rounded-full text-xs font-bold border shadow-sm", getStatusColor(order.status))}>
              {getStatusLabel(order.status)}
            </div>
            <div className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">
              ID: {order.id.slice(-6)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center px-6 py-5 bg-gradient-to-r from-slate-50 to-white border border-slate-100 rounded-2xl mb-6 shadow-inner">
          <div className="flex items-center gap-4">
            <div className="bg-white p-3 rounded-xl shadow-sm text-indigo-600 border border-slate-100">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-0.5">איסוף</p>
              <p className="font-bold text-slate-800">{format(pickup, 'dd/MM/yyyy')} <span className="text-slate-400 font-normal">| יום {['א','ב','ג','ד','ה','ו','ש'][pickup.getDay()]}</span></p>
            </div>
          </div>
          <div className="hidden md:flex justify-center">
            <div className="w-full h-px bg-slate-200 relative">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-slate-300 text-[10px] font-bold">LENDING</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white p-3 rounded-xl shadow-sm text-indigo-600 border border-slate-100">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-0.5">החזרה</p>
              <p className="font-bold text-slate-800">{format(returnDate, 'dd/MM/yyyy')} <span className="text-slate-400 font-normal">| יום {['א','ב','ג','ד','ה','ו','ש'][returnDate.getDay()]}</span></p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors"
            >
              {expanded ? 'הסתר פריטים' : `הצג ${order.items.length} פריטים`}
            </button>
            <button 
              onClick={() => onWhatsApp(order.userPhone, `שלום ${order.userName},\nבקשר להזמנה שלך (${order.id.slice(-6)}) בגמ"ח הציוד:`)}
              className="flex items-center gap-2 text-sm font-bold text-green-600 hover:bg-green-50 px-4 py-2 rounded-lg transition-colors"
            >
              <ExternalLink size={16} />
              ווטסאפ
            </button>
          </div>

          <div className="flex items-center gap-2">
            {order.status === 'pending' && (
              <>
                <button 
                  onClick={() => onUpdateStatus(order.id, 'approved')}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm"
                >
                  <Check size={16} />
                  אשר הזמנה
                </button>
                <button 
                  onClick={() => onUpdateStatus(order.id, 'rejected')}
                  className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600 shadow-sm"
                >
                  <X size={16} />
                  דחה
                </button>
              </>
            )}
            {order.status === 'approved' && (
              <button 
                onClick={() => onUpdateStatus(order.id, 'collected')}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm"
              >
                סמן כנאסף
              </button>
            )}
            {order.status === 'collected' && (
              <button 
                onClick={() => onUpdateStatus(order.id, 'returned')}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm"
              >
                סמן כהוחזר
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-8 border-t border-slate-100 pt-6 animate-in slide-in-from-top duration-300">
            <h4 className="font-bold mb-4 flex items-center gap-2">
              <Package size={18} className="text-slate-400" />
              רשימת ציוד
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {order.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100 italic transition-all hover:bg-slate-100">
                  <span className="font-medium text-slate-700">{item.itemName}</span>
                  <span className="font-black text-indigo-600">x{item.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InventoryManager({ items }: { items: Item[] }) {
  const [editingItem, setEditingItem] = useState<Partial<Item> | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const saveItem = async (e: any) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem?.category) return;

    setFormLoading(true);
    try {
      const data = {
        name: editingItem.name,
        description: editingItem.description || '',
        category: editingItem.category,
        imageUrl: editingItem.imageUrl || '',
        totalQuantity: editingItem.totalQuantity || 0
      };

      if (editingItem.id) {
        await updateDoc(doc(db, 'items', editingItem.id), data);
      } else {
        await addDoc(collection(db, 'items'), data);
      }
      setEditingItem(null);
    } catch (error) {
      console.error('Save failed', error);
    } finally {
      setFormLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק מוצר זה?')) return;
    try {
      await deleteDoc(doc(db, 'items', id));
    } catch (error) {
      console.error('Delete failed', error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">ניהול מלאי ({items.length})</h2>
        <button 
          onClick={() => setEditingItem({ name: '', category: CATEGORIES[0], totalQuantity: 0 })}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100"
        >
          <Plus size={20} />
          הוסף מוצר חדש
        </button>
      </div>

      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={saveItem} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-2xl font-bold">{editingItem.id ? 'עריכת מוצר' : 'מוצר חדש'}</h3>
              <button 
                type="button" 
                onClick={() => setEditingItem(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">שם המוצר</label>
                <input 
                  autoFocus
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingItem.name}
                  onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">קטגוריה</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingItem.category}
                  onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">כמות כוללת תמיד</label>
                <input 
                  type="number"
                  required
                  min="0"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingItem.totalQuantity}
                  onChange={e => setEditingItem({ ...editingItem, totalQuantity: parseInt(e.target.value) })}
                />
              </div>
               <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">כתובת תמונה (URL)</label>
                <input 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-left"
                  dir="ltr"
                  placeholder="https://..."
                  value={editingItem.imageUrl}
                  onChange={e => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                />
              </div>
              <div className="col-span-full space-y-2">
                <label className="text-sm font-bold text-slate-700">תיאור</label>
                <textarea 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                  value={editingItem.description}
                  onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                type="button" 
                onClick={() => setEditingItem(null)}
                className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
              >
                ביטול
              </button>
              <button 
                type="submit" 
                disabled={formLoading}
                className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 disabled:opacity-50"
              >
                {formLoading ? 'שומר...' : 'שמור מוצר'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
            <div className="h-40 bg-slate-100 relative">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <ImageIcon size={40} />
                </div>
              )}
              <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-bold text-slate-600 uppercase">
                {item.category}
              </div>
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button 
                  onClick={() => setEditingItem(item)}
                  className="bg-white text-indigo-600 p-2 rounded-lg hover:bg-indigo-50 transition-colors shadow-lg"
                >
                  <Settings size={20} />
                </button>
                <button 
                  onClick={() => deleteItem(item.id)}
                  className="bg-white text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors shadow-lg"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-bold">{item.name}</h3>
                <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">
                  {item.totalQuantity} יח'
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">{item.description || 'אין תיאור'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
