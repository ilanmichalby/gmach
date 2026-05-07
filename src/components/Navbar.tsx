import { User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LayoutDashboard, ShoppingBag, LogIn, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { ADMIN_EMAILS } from '../constants';

interface NavbarProps {
  currentView: 'user' | 'admin';
  onToggleView: () => void;
  user: User | null;
}

export function Navbar({ currentView, onToggleView, user }: NavbarProps) {
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const login = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const logout = () => signOut(auth);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
      <div className="container mx-auto px-6 h-20 flex items-center justify-between max-w-7xl">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => currentView === 'admin' && onToggleView()}>
          <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform duration-300">
            <ShoppingBag size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none">גמ"ח ציוד</h1>
            <p className="text-[10px] text-indigo-600 font-bold tracking-[0.2em] uppercase mt-1">שירות לקהילה</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {isAdmin && (
            <button
              id="view-toggle"
              onClick={onToggleView}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all duration-300 shadow-sm border",
                currentView === 'admin' 
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100"
                  : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
              )}
            >
              <LayoutDashboard size={18} />
              {currentView === 'admin' ? 'חזרה לחנות' : 'לוח בקרה'}
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end hidden md:block">
                <span className="text-sm font-bold text-slate-900 leading-none">{user.displayName}</span>
                <span className="text-[10px] text-slate-400 font-medium">{user.email}</span>
              </div>
              <button 
                id="logout-btn"
                onClick={logout}
                className="w-10 h-10 flex items-center justify-center rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-300 border border-transparent hover:border-red-100"
                title="התנתק"
              >
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button
              id="login-btn"
              onClick={login}
              className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 bg-slate-50 border border-slate-100 px-5 py-2.5 rounded-2xl transition-all"
            >
              <LogIn size={20} />
              <span>כניסת מנהל</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
