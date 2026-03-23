import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Pill, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
      toast.success('Password reset link sent! Check your email.');
    }

    setLoading(false);
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
              {sent ? 'Check Your Email' : 'Forgot Password'}
            </CardTitle>
            <CardDescription>
              {sent
                ? `We sent a reset link to ${email}`
                : 'Enter your email and we\'ll send you a reset link'}
            </CardDescription>
          </CardHeader>

          {!sent ? (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
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
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="inline h-3 w-3 mr-1" />
                  Back to Sign In
                </Link>
              </CardFooter>
            </form>
          ) : (
            <CardFooter className="flex flex-col gap-3">
              <Button variant="hero" className="w-full" onClick={() => { setSent(false); setEmail(''); }}>
                Send Again
              </Button>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="inline h-3 w-3 mr-1" />
                Back to Sign In
              </Link>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
