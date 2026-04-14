import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Building2, FileText, UserCheck, Clock, Lock, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const applicationSchema = z.object({
  pharmacy_name:       z.string().trim().min(2, 'Pharmacy name is required').max(200),
  address:             z.string().trim().min(5, 'Address is required').max(500),
  phone:               z.string().trim().min(7, 'Valid phone is required').max(20),
  email:               z.string().trim().email('Valid email is required').max(255),
  license_number:      z.string().trim().min(3, 'License number is required').max(100),
  license_expiry_date: z.string().min(1, 'License expiry date is required'),
  issuing_authority:   z.string().trim().min(2, 'Issuing authority is required').max(200),
  pharmacist_name:     z.string().trim().min(2, 'Pharmacist name is required').max(200),
  pharmacist_email:    z.string().trim().email('Valid pharmacist email is required').max(255),
  pharmacist_phone:    z.string().trim().min(7, 'Valid pharmacist phone is required').max(20),
  pharmacist_password: z.string().min(8, 'Password must be at least 8 characters'),
  opening_time:        z.string().min(1, 'Opening time is required'),
  closing_time:        z.string().min(1, 'Closing time is required'),
  accepts_medical_aid: z.boolean(),
});

type FormData = z.infer<typeof applicationSchema>;

const initialForm: FormData = {
  pharmacy_name:       '',
  address:             '',
  phone:               '',
  email:               '',
  license_number:      '',
  license_expiry_date: '',
  issuing_authority:   '',
  pharmacist_name:     '',
  pharmacist_email:    '',
  pharmacist_phone:    '',
  pharmacist_password: '',
  opening_time:        '08:00',
  closing_time:        '18:00',
  accepts_medical_aid: false,
};

const PharmacySignupPage = () => {
  const navigate = useNavigate();
  const [form, setForm]           = useState<FormData>(initialForm);
  const [errors, setErrors]       = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (field: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = applicationSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof FormData;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);

    // ── Step 1: Create auth account for the pharmacist ────────────────────
    // They sign up now with their email + password.
    // They can log in immediately but are restricted until approved.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email:    result.data.pharmacist_email.toLowerCase(),
      password: result.data.pharmacist_password,
      options: {
        data: {
          full_name: result.data.pharmacist_name,
          phone:     result.data.pharmacist_phone,
        },
      },
    });

    if (authError) {
      // If account already exists they can still submit — just sign them in
      if (!authError.message.toLowerCase().includes('already registered')) {
        toast.error('Account creation failed: ' + authError.message);
        setSubmitting(false);
        return;
      }
    }

    // ── Step 2: Submit pharmacy application ───────────────────────────────
    const { error: appError } = await (supabase
      .from('pharmacy_applications' as any)
      .insert({
        pharmacy_name:       result.data.pharmacy_name,
        address:             result.data.address,
        phone:               result.data.phone,
        email:               result.data.email,
        license_number:      result.data.license_number,
        license_expiry_date: result.data.license_expiry_date,
        issuing_authority:   result.data.issuing_authority,
        pharmacist_name:     result.data.pharmacist_name,
        pharmacist_email:    result.data.pharmacist_email.toLowerCase(),
        pharmacist_phone:    result.data.pharmacist_phone,
        opening_time:        result.data.opening_time,
        closing_time:        result.data.closing_time,
        accepts_medical_aid: result.data.accepts_medical_aid,
      }) as any);

    setSubmitting(false);

    if (appError) {
      toast.error('Failed to submit application. Please try again.');
      return;
    }

    setSubmitted(true);
    toast.success('Application submitted! You can log in but full access is granted after approval.');
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-lg py-16 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <UserCheck className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-foreground mb-3">
            Application Submitted!
          </h1>
          <p className="text-muted-foreground mb-2">
            Your pharmacy application is under review. An admin will approve it shortly.
          </p>
          <p className="text-muted-foreground mb-6 text-sm">
            You can already <strong>log in</strong> with your email and password —
            full dashboard access is unlocked once your application is approved.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>Back to Home</Button>
            <Button onClick={() => navigate('/auth')}>Log In Now</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-2xl py-8">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground">Register Your Pharmacy</h1>
          <p className="text-muted-foreground mt-2">
            Submit your details for review. Create your login credentials below — you can sign
            in immediately and will get full access once approved.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Pharmacy Info ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" /> Pharmacy Information
              </CardTitle>
              <CardDescription>Basic details about your pharmacy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Pharmacy Name" error={errors.pharmacy_name}>
                <Input value={form.pharmacy_name} onChange={(e) => update('pharmacy_name', e.target.value)} placeholder="e.g. MediCare Pharmacy" />
              </FormField>
              <FormField label="Address" error={errors.address}>
                <Input value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Full street address" />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Phone" error={errors.phone}>
                  <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+267 71 234 567" />
                </FormField>
                <FormField label="Pharmacy Email" error={errors.email}>
                  <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="pharmacy@example.com" />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/* ── License ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" /> License Details
              </CardTitle>
              <CardDescription>Your pharmacy's licensing information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="License Number" error={errors.license_number}>
                <Input value={form.license_number} onChange={(e) => update('license_number', e.target.value)} placeholder="e.g. PH-2024-001" />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="License Expiry Date" error={errors.license_expiry_date}>
                  <Input type="date" value={form.license_expiry_date} onChange={(e) => update('license_expiry_date', e.target.value)} />
                </FormField>
                <FormField label="Issuing Authority" error={errors.issuing_authority}>
                  <Input value={form.issuing_authority} onChange={(e) => update('issuing_authority', e.target.value)} placeholder="e.g. BOPA" />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/* ── Pharmacist in Charge + Login Credentials ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCheck className="h-5 w-5 text-primary" /> Pharmacist in Charge
              </CardTitle>
              <CardDescription>
                Your details and the login credentials you'll use to access the dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Full Name" error={errors.pharmacist_name}>
                <Input value={form.pharmacist_name} onChange={(e) => update('pharmacist_name', e.target.value)} placeholder="Dr. Jane Smith" />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Login Email" error={errors.pharmacist_email}>
                  <Input type="email" value={form.pharmacist_email} onChange={(e) => update('pharmacist_email', e.target.value)} placeholder="jane@example.com" />
                </FormField>
                <FormField label="Phone" error={errors.pharmacist_phone}>
                  <Input value={form.pharmacist_phone} onChange={(e) => update('pharmacist_phone', e.target.value)} placeholder="+267 72 123 456" />
                </FormField>
              </div>

              {/* Password field */}
              <FormField label="Login Password" error={errors.pharmacist_password}>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.pharmacist_password}
                    onChange={(e) => update('pharmacist_password', e.target.value)}
                    placeholder="Min. 8 characters"
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  You'll use this email and password to log into your pharmacist dashboard.
                </p>
              </FormField>
            </CardContent>
          </Card>

          {/* ── Operating Hours ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" /> Operating Details
              </CardTitle>
              <CardDescription>Hours of operation and medical aid acceptance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Opening Time" error={errors.opening_time}>
                  <Input type="time" value={form.opening_time} onChange={(e) => update('opening_time', e.target.value)} />
                </FormField>
                <FormField label="Closing Time" error={errors.closing_time}>
                  <Input type="time" value={form.closing_time} onChange={(e) => update('closing_time', e.target.value)} />
                </FormField>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <Label className="text-sm font-medium">Accepts Medical Aid</Label>
                  <p className="text-xs text-muted-foreground">Does this pharmacy accept medical aid schemes?</p>
                </div>
                <Switch
                  checked={form.accepts_medical_aid}
                  onCheckedChange={(checked) => update('accepts_medical_aid', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Application'}
          </Button>
        </form>
      </div>
    </div>
  );
};

const FormField = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium">{label}</Label>
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

export default PharmacySignupPage;