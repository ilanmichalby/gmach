import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Item, CartItem, OrderItem, Order } from '../types';
import { getOverlappingOrders, calculateAvailableQuantity } from '../lib/inventory';
import { format, addDays, isSameDay, isAfter, startOfDay, getDay } from 'date-fns';
import { Calendar as CalendarIcon, Check, ShoppingCart, ArrowLeft, ArrowRight, Package, Info, CheckCircle2, Loader2, ChevronLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { CATEGORIES, OPERATION_DAYS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';

type Step = 'dates' | 'items' | 'checkout' | 'success';

export function BookingFlow() {
  const [step, setStep] = useState<Step>('dates');
  const [pickupDate, setPickupDate] = useState<Date | null>(null);
  const [returnDate, setReturnDate] = useState<Date | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [userInfo, setUserInfo] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const [orderId, setOrderId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('הכל');

  const filteredItems = items.filter(item => 
    activeCategory === 'הכל' || item.category === activeCategory
  );

  // Load items and availability when dates change
  useEffect(() => {
    if (pickupDate && returnDate && step === 'items') {
      loadAvailability();
    }
  }, [pickupDate, returnDate, step]);

  const loadAvailability = async () => {
    if (!pickupDate || !returnDate) return;
    setLoading(true);
    const path = 'orders';
    try {
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const allItems = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));
      const overlappingOrders = await getOverlappingOrders(pickupDate, returnDate);
      
      const itemsWithAvailability = await Promise.all(allItems.map(async item => {
        const available = await calculateAvailableQuantity(item, pickupDate, returnDate, overlappingOrders);
        return { ...item, totalQuantity: available, orderQuantity: 0 } as CartItem;
      }));
      
      setItems(itemsWithAvailability);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item: CartItem, qty: number) => {
    if (qty <= 0) {
      setCart(cart.filter(i => i.id !== item.id));
      return;
    }
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      setCart(cart.map(i => i.id === item.id ? { ...i, orderQuantity: qty } : i));
    } else {
      setCart([...cart, { ...item, orderQuantity: qty }]);
    }
  };

  const handleCheckout = async () => {
    if (!pickupDate || !returnDate) return;
    setLoading(true);
    const orderPath = 'orders';
    try {
      const orderData = {
        pickupDate: Timestamp.fromDate(pickupDate),
        returnDate: Timestamp.fromDate(returnDate),
        items: cart.map(i => ({ itemId: i.id, itemName: i.name, quantity: i.orderQuantity })),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const orderDoc = await addDoc(collection(db, orderPath), orderData);
      
      // Save contact info in private subcollection
      await addDoc(collection(db, orderPath, orderDoc.id, 'private'), {
        userName: userInfo.name,
        userEmail: userInfo.email,
        userPhone: userInfo.phone
      });

      setOrderId(orderDoc.id);
      setStep('success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, orderPath);
    } finally {
      setLoading(false);
    }
  };

  const isOperationDay = (date: Date) => OPERATION_DAYS.includes(getDay(date));

  const selectPickup = (date: Date) => {
    setPickupDate(date);
    if (returnDate && !isAfter(returnDate, date)) {
      setReturnDate(null);
    }
  };

  const totalItems = cart.reduce((sum, i) => sum + i.orderQuantity, 0);

  return (
    <div className="space-y-8">
      {/* Stepper */}
      <div className="flex items-center justify-center gap-4 max-w-md mx-auto mb-12">
        {(['dates', 'items', 'checkout'] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-500",
              step === s ? "bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-110 rotate-3" : 
              (idx < ['dates', 'items', 'checkout'].indexOf(step) ? "bg-emerald-500 text-white" : "bg-white border border-slate-200 text-slate-400 font-normal")
            )}>
              {idx < ['dates', 'items', 'checkout'].indexOf(step) ? <Check size={18} /> : idx + 1}
            </div>
            {idx < 2 && <div className={cn("w-12 h-1 rounded-full transition-colors duration-500", idx < ['dates', 'items', 'checkout'].indexOf(step) ? "bg-emerald-200" : "bg-slate-100")} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 'dates' && (
          <motion.div
            key="step-dates"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center"
          >
            <CalendarIcon className="mx-auto text-indigo-500 mb-4" size={48} />
            <h2 className="text-2xl font-bold mb-2">מתי האירוע?</h2>
            <p className="text-slate-500 mb-8">אנא בחר תאריכי איסוף והחזרה. הגמ"ח פתוח בימי שני ורביעי בלבד.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-right">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">תאריך איסוף (רביעי בדרך כלל)</label>
                <input 
                  type="date"
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  onChange={(e) => selectPickup(new Date(e.target.value))}
                />
                {pickupDate && !isOperationDay(pickupDate) && (
                  <p className="text-red-500 text-xs mt-1">שים לב: הגמ"ח אינו פעיל ביום זה.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">תאריך החזרה (שני בדרך כלל)</label>
                <input 
                  type="date"
                  min={pickupDate ? format(pickupDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                  disabled={!pickupDate}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                  onChange={(e) => setReturnDate(new Date(e.target.value))}
                />
                {returnDate && !isOperationDay(returnDate) && (
                  <p className="text-red-500 text-xs mt-1">שים לב: הגמ"ח אינו פעיל ביום זה.</p>
                )}
              </div>
            </div>

            <button
              onClick={() => setStep('items')}
              disabled={!pickupDate || !returnDate}
              className="mt-12 w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
            >
              <span>המשך לבחירת ציוד</span>
              <ArrowLeft size={20} />
            </button>
          </motion.div>
        )}

        {step === 'items' && (
          <motion.div
            key="step-items"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="space-y-10"
          >
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-600 p-3 rounded-2xl text-white">
                  <CalendarIcon size={24} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">תקופת השאלה</p>
                  <p className="font-bold text-slate-900 border-b-2 border-indigo-100 pb-1">
                    {format(pickupDate!, 'dd/MM/yyyy')} — {format(returnDate!, 'dd/MM/yyyy')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setStep('dates')}
                className="px-6 py-2.5 text-sm font-bold text-indigo-600 border border-indigo-100 bg-indigo-50/50 rounded-2xl hover:bg-indigo-50 transition-all"
              >
                עדכון תאריכים
              </button>
            </div>

            {/* Categories */}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setActiveCategory('הכל')}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-bold transition-all",
                  activeCategory === 'הכל' ? "bg-slate-900 text-white shadow-lg" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-400"
                )}
              >
                הכל
              </button>
              {['כלי הגשה מפלסטיק', 'מפות משובצות', 'כלים בשריים', 'מעמדי צלחות', 'קישוטים'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-bold transition-all",
                    activeCategory === cat ? "bg-slate-900 text-white shadow-lg" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-400"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-32">
                <Loader2 className="animate-spin w-12 h-12 text-indigo-600 mx-auto mb-6" />
                <p className="text-slate-400 font-bold tracking-widest uppercase text-xs">מעדכן מלאי עבורך...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {filteredItems.length === 0 ? (
                  <div className="col-span-full text-center py-24 text-slate-400 font-medium">לא נמצא ציוד בקטגוריה זו.</div>
                ) : (
                  filteredItems.map(item => (
                    <div key={item.id} className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 group flex flex-col">
                      <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                        {item.imageUrl ? (
                          <img 
                            src={item.imageUrl} 
                            alt={item.name} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-200">
                            <Package size={64} className="mb-2" strokeWidth={1} />
                            <span className="text-[10px] font-black tracking-widest uppercase opacity-50">Image Pending</span>
                          </div>
                        )}
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest shadow-sm">
                          {item.category}
                        </div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          <h3 className="font-bold text-xl text-slate-900 mb-1 leading-tight">{item.name}</h3>
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{item.description}</p>
                        </div>
                        
                        <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                          <div>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">זמינות</p>
                            <span className={cn(
                              "text-sm font-black font-mono",
                              item.totalQuantity === 0 ? "text-red-500" : "text-emerald-500"
                            )}>
                              {item.totalQuantity} <span className="text-[10px] font-bold text-slate-400 font-sans">יח'</span>
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 bg-slate-50 rounded-2xl p-1.5 shadow-inner">
                            <button 
                              onClick={() => addToCart(item, (cart.find(i => i.id === item.id)?.orderQuantity || 0) - 1)}
                              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white shadow-sm hover:bg-red-50 hover:text-red-600 transition-all font-bold"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-black text-indigo-600 font-mono">
                              {cart.find(i => i.id === item.id)?.orderQuantity || 0}
                            </span>
                            <button 
                              onClick={() => {
                                const current = cart.find(i => i.id === item.id)?.orderQuantity || 0;
                                if (current < item.totalQuantity) {
                                  addToCart(item, current + 1);
                                }
                              }}
                              className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-20 disabled:grayscale"
                              disabled={(cart.find(i => i.id === item.id)?.orderQuantity || 0) >= item.totalQuantity}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Sticky Cart Button */}
            <div className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 z-40 transition-transform duration-300",
              totalItems > 0 ? "translate-y-0" : "translate-y-32"
            )}>
              <button
                onClick={() => setStep('checkout')}
                className="bg-indigo-600 text-white px-8 py-4 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-4 group"
              >
                <div className="bg-indigo-500 p-2 rounded-lg">
                  <ShoppingCart size={20} />
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-80">בחרת {totalItems} פריטים</p>
                  <p className="font-bold">המשך להזמנה</p>
                </div>
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'checkout' && (
          <motion.div
            key="step-checkout"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <h2 className="text-2xl font-bold">פרטי התקשרות</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">שם מלא</label>
                  <input 
                    type="text" 
                    required
                    className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="ישראל ישראלי"
                    value={userInfo.name}
                    onChange={e => setUserInfo({ ...userInfo, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">אימייל</label>
                  <input 
                    type="email" 
                    required
                    className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="israel@gmail.com"
                    value={userInfo.email}
                    onChange={e => setUserInfo({ ...userInfo, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">טלפון ליצירת קשר</label>
                  <input 
                    type="tel" 
                    required
                    className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-left"
                    placeholder="050-1234567"
                    value={userInfo.phone}
                    onChange={e => setUserInfo({ ...userInfo, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  onClick={() => setStep('items')}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRight size={20} />
                  <span>חזרה</span>
                </button>
                <button 
                  onClick={handleCheckout}
                  disabled={loading || !userInfo.name || !userInfo.email || !userInfo.phone}
                  className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {loading ? 'שולח הזמנה...' : 'אישור ושליחת הזמנה'}
                </button>
              </div>
            </div>

            <div className="bg-slate-100 p-8 rounded-2xl border border-slate-200 space-y-6">
              <h2 className="text-xl font-bold">סיכום הזמנה</h2>
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-sm">
                  <p className="text-slate-500">תאריכי השאלה:</p>
                  <p className="font-bold">{format(pickupDate!, 'dd/MM/yyyy')} עד {format(returnDate!, 'dd/MM/yyyy')}</p>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-50 rounded flex items-center justify-center">
                          <Package size={14} />
                        </div>
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <span className="font-bold">x{item.orderQuantity}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t border-slate-200 flex justify-between items-center font-bold">
                  <span>סה"כ פריטים:</span>
                  <span>{totalItems}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="step-success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xl mx-auto text-center bg-white p-12 rounded-3xl shadow-xl border border-slate-200"
          >
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-bold mb-4">הזמנתך התקבלה!</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              תודה רבה {userInfo.name}, הזמנתך (מס׳ {orderId?.slice(-6)}) נשלחה לאישור המנהל.
              <br />
              תקבל הודעת דוא"ל ברגע שההזמנה תאושר.
            </p>
            <div className="space-y-4">
              <button 
                onClick={() => {
                  setStep('dates');
                  setCart([]);
                  setPickupDate(null);
                  setReturnDate(null);
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                הזמנה חדשה
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
