/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Navbar } from './components/Navbar';
import { BookingFlow } from './components/BookingFlow';
import { AdminDashboard } from './components/AdminDashboard';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [view, setView] = useState<'user' | 'admin'>('user');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900" dir="rtl">
      <Navbar 
        currentView={view} 
        onToggleView={() => setView(v => v === 'user' ? 'admin' : 'user')} 
        user={user}
      />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <AnimatePresence mode="wait">
          {view === 'user' ? (
            <motion.div
              key="user-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <BookingFlow />
            </motion.div>
          ) : (
            <motion.div
              key="admin-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <AdminDashboard user={user} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto py-8 text-center text-slate-500 border-t border-slate-200">
        <p>© {new Date().getFullYear()} גמ"ח ציוד לאירועים - שירות לקהילה</p>
      </footer>
    </div>
  );
}
