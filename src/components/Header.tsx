import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Pill, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const baseNavLinks = [
  { to: '/', label: 'Home' },
  { to: '/search', label: 'Search' },
  { to: '/map', label: 'Map' },
  { to: '/reservations', label: 'Reservations' },
];

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isPharmacist, setIsPharmacist] = useState(false);
  const [displayName, setDisplayName]   = useState<string | null>(null);
  const { user, signOut } = useAuth();

  useEffect(() => {
    const check = async () => {
      if (!user) { setIsPharmacist(false); setDisplayName(null); return; }
      const [roleRes, profileRes] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'pharmacist' }),
        (supabase as any).from('profiles').select('full_name').eq('user_id', user.id).single(),
      ]);
      setIsPharmacist(!!roleRes.data);
      setDisplayName(profileRes.data?.full_name ?? null);
    };
    check();
  }, [user]);

  const navLinks = isPharmacist
    ? [...baseNavLinks, { to: '/pharmacist', label: 'Dashboard' }]
    : baseNavLinks;

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary">
            <Pill className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-heading text-xl font-bold text-foreground">
            Pharmacy<span className="text-primary">Tracker</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              <Button
                variant={location.pathname === link.to ? 'secondary' : 'ghost'}
                size="sm"
                className="font-medium text-base"
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(displayName ?? user.email ?? 'U')[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                  {displayName ?? user.email}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-1" /> Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-card p-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}>
                <Button
                  variant={location.pathname === link.to ? 'secondary' : 'ghost'}
                  className="w-full justify-start font-medium"
                >
                  {link.label}
                </Button>
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {user ? (
                <>
                  <div className="px-2 py-1 text-sm font-medium text-foreground">
                    👤 {displayName ?? user.email}
                  </div>
                  <Button variant="ghost" onClick={handleSignOut} className="w-full justify-start">
                    <LogOut className="h-4 w-4 mr-1" /> Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/auth" onClick={() => setMobileOpen(false)}>
                    <Button variant="ghost" className="w-full">Sign In</Button>
                  </Link>
                  <Link to="/auth" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full">Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
