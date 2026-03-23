import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Pill, Mail, Lock, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

 const handleRoleBasedRedirect = async (userId: string) => {
  try {
    const { data: roleData, error } = await supabase
      .from('user_roles' as any)
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error("Database Error:", error.message);
      navigate('/');
      return;
    }

    const userRole = (roleData as any)?.role?.toLowerCase();

    if (userRole === 'admin') {
      toast.success('Admin access granted. Redirecting...');
      setTimeout(() => navigate('/admin', { replace: true }), 100);
    } else if (userRole === 'pharmacist') {
      navigate('/pharmacist', { replace: true });
    } else {
      // No role yet — check if they have a pending pharmacy application
      // If so, send them to the pharmacist dashboard which shows the pending screen
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const email = authUser?.email;
      if (email) {
        const { data: app } = await (supabase as any)
          .from('pharmacy_applications')
          .select('status')
          .eq('pharmacist_email', email)
          .limit(1)
          .maybeSingle();
        if (app) {
          // They have an application — send to pharmacist dashboard
          // which shows pending/rejected/approved screen appropriately
          navigate('/pharmacist', { replace: true });
          return;
        }
      }
      navigate('/', { replace: true });
    }
  } catch (err) {
    console.error("Redirect logic failed:", err);
    navigate('/');
  }
};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      // Use the auth result to get the user ID
      const result = await signIn(email, password);
      
      if (result && 'error' in result && result.error) {
        toast.error(result.error.message);
        setLoading(false);
      } else {
        // Fetch the user session to ensure we have the ID for the redirect
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await handleRoleBasedRedirect(user.id);
        } else {
          navigate('/');
        }
        setLoading(false);
      }
    } else {
      if (!fullName.trim()) {
        toast.error('Please enter your full name');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Account created! You can now sign in.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md border-border/50 shadow-elegant">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary">
              <Pill className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="font-heading text-2xl">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? 'Sign in to track medicines and manage reservations'
                : 'Join PharmacyTracker to find medicines near you'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      placeholder="Your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  isLogin ? 'Sign In' : 'Create Account'
                )}
              </Button>
              
              {isLogin && (
                <Button variant="link" size="sm" asChild className="text-muted-foreground hover:text-primary p-0 h-auto font-normal">
                  <Link to="/forgot-password">
                    Forgot your password?
                  </Link>
                </Button>
              )}
              
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
              
              <Button variant="link" size="sm" asChild className="text-muted-foreground hover:text-primary p-0 h-auto font-normal">
                <Link to="/pharmacy-signup">
                  Register your pharmacy →
                </Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;