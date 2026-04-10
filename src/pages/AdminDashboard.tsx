import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck, RefreshCw, Eye, CheckCircle, XCircle, Clock,
  Building2, Users, LayoutDashboard, LogOut, Trash2, Pencil,
  UserPlus, Search,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface PharmacyApplication {
  id: string;
  pharmacy_name: string;
  address: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry_date: string;
  issuing_authority: string;
  pharmacist_name: string;
  pharmacist_email: string;
  pharmacist_phone: string;
  opening_time: string;
  closing_time: string;
  accepts_medical_aid: boolean;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  pharmacy_id: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'patient' | 'pharmacist' | 'admin';
  created_at: string;
}

// ── Status config ─────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending:  { label: 'Pending',  icon: Clock,       className: 'bg-warning/15 text-warning border-warning/30 font-semibold'                   },
  approved: { label: 'Approved', icon: CheckCircle, className: 'bg-success/15 text-success border-success/30 font-semibold'                   },
  rejected: { label: 'Rejected', icon: XCircle,     className: 'bg-destructive/15 text-destructive border-destructive/30 font-semibold'       },
};

const roleColors: Record<string, string> = {
  admin:      'bg-primary/15 text-primary border-primary/30 font-semibold',
  pharmacist: 'bg-blue-500/15 text-blue-700 border-blue-500/30 font-semibold',
  patient:    'bg-secondary text-secondary-foreground border-border font-medium',
};

type Tab = 'overview' | 'applications' | 'users';

// ── Component ─────────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin]     = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Applications state
  const [applications, setApplications] = useState<PharmacyApplication[]>([]);
  const [appLoading, setAppLoading]     = useState(false);
  const [appFilter, setAppFilter]       = useState('all');
  const [selectedApp, setSelectedApp]   = useState<PharmacyApplication | null>(null);
  const [adminNotes, setAdminNotes]     = useState('');
  const [processing, setProcessing]     = useState(false);

  // Users state
  const [users, setUsers]                   = useState<UserRow[]>([]);
  const [userLoading, setUserLoading]       = useState(false);
  const [userSearch, setUserSearch]         = useState('');
  const [selectedUser, setSelectedUser]     = useState<UserRow | null>(null);
  const [userDialog, setUserDialog]         = useState<'edit' | 'delete' | 'create' | null>(null);
  const [userForm, setUserForm]             = useState({ full_name: '', phone: '', role: 'patient' as UserRow['role'] });
  const [newUserForm, setNewUserForm]       = useState({ email: '', full_name: '', phone: '', role: 'patient' as UserRow['role'] });
  const [userProcessing, setUserProcessing] = useState(false);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // ── Role check + fetch admin name ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data, error } = await (supabase as any).rpc('has_admin_role', {
        _user_id: user.id,
        _role_name: 'admin',
      });
      if (error || data !== true) {
        toast.error('Access denied. Admin role required.');
        navigate('/');
        return;
      }
      setIsAdmin(true);

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      setAdminName(profile?.full_name ?? null);
    };
    check();
  }, [user, navigate]);

  // ── Fetch applications ────────────────────────────────────────────────────────
  const fetchApplications = async () => {
    setAppLoading(true);
    const { data, error } = await supabase
      .from('pharmacy_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load applications: ' + error.message);
    else setApplications((data ?? []) as PharmacyApplication[]);
    setAppLoading(false);
  };

  // ── Fetch users ───────────────────────────────────────────────────────────────
  const fetchUsers = async () => {
    setUserLoading(true);

    const [profilesRes, rolesRes] = await Promise.all([
      (supabase as any).from('profiles').select('user_id, full_name, phone, created_at'),
      (supabase as any).from('user_roles').select('user_id, role'),
    ]);

    if (profilesRes.error) {
      toast.error('Failed to load users: ' + profilesRes.error.message);
      setUserLoading(false);
      return;
    }

    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('admin-list-users');

    const roleMap: Record<string, string> = {};
    (rolesRes.data ?? []).forEach((r: any) => { roleMap[r.user_id] = r.role; });

    const emailMap: Record<string, string> = {};
    if (!edgeError && edgeData?.users) {
      edgeData.users.forEach((u: any) => { emailMap[u.id] = u.email; });
    }

    const fromProfiles: UserRow[] = (profilesRes.data ?? []).map((p: any) => ({
      id:         p.user_id,
      email:      emailMap[p.user_id] ?? '—',
      full_name:  p.full_name,
      phone:      p.phone,
      role:       (roleMap[p.user_id] ?? 'patient') as UserRow['role'],
      created_at: p.created_at,
    }));

    if (!edgeError && edgeData?.users) {
      const profileIds = new Set(fromProfiles.map((u) => u.id));
      const pending: UserRow[] = edgeData.users
        .filter((u: any) => !profileIds.has(u.id) && roleMap[u.id])
        .map((u: any) => ({
          id:         u.id,
          email:      u.email ?? '—',
          full_name:  u.user_metadata?.full_name ?? null,
          phone:      u.user_metadata?.phone ?? null,
          role:       (roleMap[u.id] ?? 'patient') as UserRow['role'],
          created_at: u.created_at,
        }));
      setUsers([...fromProfiles, ...pending]);
    } else {
      setUsers(fromProfiles);
    }

    setUserLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchApplications();
    fetchUsers();
  }, [isAdmin]);

  // ── Application actions ───────────────────────────────────────────────────────
  const handleAppAction = async (id: string, action: 'approved' | 'rejected') => {
    setProcessing(true);

    if (action === 'approved') {
      const { data, error } = await supabase.functions.invoke('approve-pharmacy', {
        body: { application_id: id, admin_notes: adminNotes },
      });
      if (error) {
        toast.error('Approval failed: ' + ((data as any)?.error ?? error.message));
        setProcessing(false);
        return;
      }
      await (supabase.from('pharmacy_applications').update({ reviewed_by: user?.id } as any).eq('id', id) as any);
      toast.success('Pharmacy approved! Pharmacist invite sent.');
    } else {
      const { error } = await (supabase
        .from('pharmacy_applications')
        .update({
          status:      'rejected',
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        } as any)
        .eq('id', id) as any);
      if (error) {
        toast.error('Rejection failed: ' + error.message);
        setProcessing(false);
        return;
      }
      toast.success('Application rejected.');
    }

    await fetchApplications();
    setSelectedApp(null);
    setAdminNotes('');
    setProcessing(false);
  };

  // ── Update user ───────────────────────────────────────────────────────────────
  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setUserProcessing(true);

    const { error: pErr } = await (supabase as any)
      .from('profiles')
      .update({ full_name: userForm.full_name, phone: userForm.phone })
      .eq('user_id', selectedUser.id);

    const { error: dErr } = await (supabase as any)
      .from('user_roles')
      .delete()
      .eq('user_id', selectedUser.id);

    const { error: rErr } = await (supabase as any)
      .from('user_roles')
      .insert({ user_id: selectedUser.id, role: userForm.role });

    if (pErr || dErr || rErr) {
      toast.error('Update failed: ' + (pErr?.message ?? dErr?.message ?? rErr?.message));
    } else {
      toast.success('User updated successfully.');
    }

    setUserProcessing(false);
    setUserDialog(null);
    setSelectedUser(null);
    await fetchUsers();
  };

  // ── Delete user ───────────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setUserProcessing(true);

    const deletedId = selectedUser.id;

    const { error: rErr } = await (supabase as any)
      .from('user_roles')
      .delete()
      .eq('user_id', deletedId);

    const { error: pErr } = await (supabase as any)
      .from('profiles')
      .delete()
      .eq('user_id', deletedId);

    const { error: authErr } = await (supabase as any).rpc('delete_user_by_admin', {
      target_user_id: deletedId,
    });

    if (rErr || pErr || authErr) {
      toast.error('Delete failed: ' + (rErr?.message ?? pErr?.message ?? authErr?.message));
      setUserProcessing(false);
      return;
    }

    toast.success('User removed from the system.');
    setUsers((prev) => prev.filter((u) => u.id !== deletedId));
    setUserDialog(null);
    setSelectedUser(null);
    setUserProcessing(false);
    await fetchUsers();
  };

  // ── Create / invite user ──────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    setUserProcessing(true);

    const { data, error } = await supabase.functions.invoke('admin-invite-user', {
      body: {
        email:     newUserForm.email,
        full_name: newUserForm.full_name,
        phone:     newUserForm.phone,
        role:      newUserForm.role,
      },
    });

    if (error || (data as any)?.error) {
      toast.error('Failed to create user: ' + (error?.message ?? (data as any)?.error));
    } else {
      toast.success(`Invite sent to ${newUserForm.email}`);
      setNewUserForm({ email: '', full_name: '', phone: '', role: 'patient' });
      setUserDialog(null);
      await fetchUsers();
    }
    setUserProcessing(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────────
  const filteredApps  = appFilter === 'all' ? applications : applications.filter((a) => a.status === appFilter);
  const filteredUsers = users.filter((u) =>
    [u.email, u.full_name ?? '', u.role].some((v) =>
      v.toLowerCase().includes(userSearch.toLowerCase())
    )
  );

  const appCounts = {
    all:      applications.length,
    pending:  applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  const userCounts = {
    total:       users.length,
    admins:      users.filter((u) => u.role === 'admin').length,
    pharmacists: users.filter((u) => u.role === 'pharmacist').length,
    patients:    users.filter((u) => u.role === 'patient').length,
  };

  // ── Loading screen ─────────────────────────────────────────────────────────────
  if (authLoading || (user && !isAdmin)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="h-10 w-10 text-primary mx-auto mb-3 animate-pulse" />
          <p className="text-base font-medium text-foreground">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex">

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base text-foreground leading-tight">Admin Panel</p>
            <p className="text-xs text-muted-foreground truncate max-w-[148px] mt-0.5">
              {adminName ?? user?.email}
            </p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1">
          {(
            [
              { key: 'overview',     label: 'Overview',     icon: LayoutDashboard, badge: undefined         },
              { key: 'applications', label: 'Applications', icon: Building2,       badge: appCounts.pending },
              { key: 'users',        label: 'Manage Users', icon: Users,           badge: undefined         },
            ] as { key: Tab; label: string; icon: React.ElementType; badge: number | undefined }[]
          ).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                w-full flex items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-150
                ${activeTab === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/70 hover:bg-secondary hover:text-foreground'}
              `}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </span>
              {badge != null && badge > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold leading-none ${
                  activeTab === key
                    ? 'bg-white/25 text-white'
                    : 'bg-warning/20 text-warning'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => { supabase.auth.signOut(); navigate('/auth'); }}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-all duration-150"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ══════════════════ MOBILE TOP BAR ══════════════════ */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 h-14 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-heading font-bold text-sm text-foreground">Admin Panel</span>
        </div>
        <div className="flex gap-1">
          {(
            [
              { key: 'overview',     label: '⊞' },
              { key: 'applications', label: '🏥' },
              { key: 'users',        label: '👥' },
            ] as { key: Tab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════ MAIN CONTENT ══════════════════ */}
      <main className="flex-1 overflow-auto md:p-8 p-4 pt-20 md:pt-8 bg-secondary/20">

        {/* ════════════════ OVERVIEW ════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 w-full">
            <div>
              <h1 className="font-heading text-3xl font-extrabold text-foreground tracking-tight">Overview</h1>
              <p className="text-sm font-medium text-muted-foreground mt-1">System-wide summary</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
              {[
                { label: 'Total Users',      value: userCounts.total,       icon: Users,       color: 'text-blue-600',    bg: 'bg-blue-500/12',    bar: 'bg-blue-500'    },
                { label: 'Pharmacists',      value: userCounts.pharmacists, icon: Building2,   color: 'text-emerald-600', bg: 'bg-emerald-500/12', bar: 'bg-emerald-500' },
                { label: 'Pending Apps',     value: appCounts.pending,      icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-500/12',   bar: 'bg-amber-500'   },
                { label: 'Active Pharmacies',value: appCounts.approved,     icon: CheckCircle, color: 'text-primary',     bg: 'bg-primary/12',     bar: 'bg-primary'     },
              ].map((s) => (
                <Card key={s.label} className="border-border shadow-card overflow-hidden">
                  <div className={`h-1 w-full ${s.bar}`} />
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                        <p className="text-5xl font-extrabold text-foreground mt-2 leading-none tabular-nums">{s.value}</p>
                      </div>
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.bg} shrink-0`}>
                        <s.icon className={`h-6 w-6 ${s.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* User breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-foreground">User Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Patients',    count: userCounts.patients,    pct: userCounts.total ? Math.round(userCounts.patients    / userCounts.total * 100) : 0, color: 'bg-muted-foreground' },
                    { label: 'Pharmacists', count: userCounts.pharmacists, pct: userCounts.total ? Math.round(userCounts.pharmacists / userCounts.total * 100) : 0, color: 'bg-blue-500'         },
                    { label: 'Admins',      count: userCounts.admins,      pct: userCounts.total ? Math.round(userCounts.admins      / userCounts.total * 100) : 0, color: 'bg-primary'          },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-semibold text-foreground">{row.label}</span>
                        <span className="font-bold text-foreground">{row.count} <span className="text-muted-foreground font-normal">({row.pct}%)</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-border">
                        <div className={`h-2 rounded-full ${row.color} transition-all duration-500`} style={{ width: `${row.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Application status */}
            <Card className="border-border shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-foreground">Application Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center h-full">
                  {[
                    { label: 'Pending',  count: appCounts.pending,  className: 'text-warning',     bg: 'bg-warning/10 border-warning/25',         bar: 'bg-warning'     },
                    { label: 'Approved', count: appCounts.approved, className: 'text-success',     bg: 'bg-success/10 border-success/25',         bar: 'bg-success'     },
                    { label: 'Rejected', count: appCounts.rejected, className: 'text-destructive', bg: 'bg-destructive/10 border-destructive/25', bar: 'bg-destructive' },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-xl border overflow-hidden ${s.bg}`}>
                      <div className={`h-1 w-full ${s.bar}`} />
                      <div className="p-4">
                        <p className={`text-5xl font-extrabold leading-none tabular-nums ${s.className}`}>{s.count}</p>
                        <p className={`text-sm font-bold mt-2 ${s.className} opacity-75`}>{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </div>{/* end two-col grid */}
          </div>
        )}

        {/* ════════════════ APPLICATIONS ════════════════ */}
        {activeTab === 'applications' && (
          <div className="space-y-5 w-full">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-heading text-3xl font-extrabold text-foreground tracking-tight">Pharmacy Applications</h1>
                <p className="text-sm font-medium text-muted-foreground mt-1">Review and approve incoming pharmacy registrations</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchApplications} disabled={appLoading} className="font-semibold">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${appLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setAppFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                    appFilter === f
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'border-border text-foreground/70 bg-card hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  <span className={`ml-2 text-xs font-bold ${appFilter === f ? 'opacity-80' : 'text-muted-foreground'}`}>
                    {f === 'all' ? appCounts.all : appCounts[f]}
                  </span>
                </button>
              ))}
            </div>

            {appLoading ? (
              <p className="text-center py-12 text-base font-medium text-muted-foreground">Loading applications…</p>
            ) : filteredApps.length === 0 ? (
              <p className="text-center py-12 text-base font-medium text-muted-foreground">No applications found.</p>
            ) : (
              <Card className="border-border shadow-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Pharmacy</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Pharmacist</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">License No.</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Med. Aid</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Status</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Submitted</TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-primary-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApps.map((app) => {
                      const cfg = statusConfig[app.status] ?? statusConfig.pending;
                      const StatusIcon = cfg.icon;
                      return (
                        <TableRow key={app.id} className="hover:bg-secondary/30 transition-colors">
                          <TableCell className="font-bold text-sm text-foreground">{app.pharmacy_name}</TableCell>
                          <TableCell className="text-sm font-medium text-foreground/80">{app.pharmacist_name}</TableCell>
                          <TableCell className="text-sm font-medium text-muted-foreground font-mono">{app.license_number}</TableCell>
                          <TableCell>
                            <Badge
                              variant={app.accepts_medical_aid ? 'default' : 'outline'}
                              className={`text-xs font-semibold ${app.accepts_medical_aid ? '' : 'text-muted-foreground'}`}
                            >
                              {app.accepts_medical_aid ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${cfg.className}`}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-muted-foreground">
                            {new Date(app.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm" variant="ghost"
                              className="text-sm font-semibold hover:text-primary"
                              onClick={() => { setSelectedApp(app); setAdminNotes(app.admin_notes ?? ''); }}
                            >
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}

        {/* ════════════════ USERS ════════════════ */}
        {activeTab === 'users' && (
          <div className="space-y-5 w-full">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-heading text-3xl font-extrabold text-foreground tracking-tight">Manage Users</h1>
                <p className="text-sm font-medium text-muted-foreground mt-1">View, edit roles, and remove users</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={userLoading} className="font-semibold">
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${userLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setUserDialog('create')} className="font-semibold">
                  <UserPlus className="h-4 w-4 mr-1.5" /> Invite User
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or role…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9 font-medium placeholder:text-muted-foreground/60"
              />
            </div>

            {userLoading ? (
              <p className="text-center py-12 text-base font-medium text-muted-foreground">Loading users…</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center py-12 text-base font-medium text-muted-foreground">No users found.</p>
            ) : (
              <Card className="border-border shadow-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Name</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Email</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Phone</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Role</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Joined</TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-primary-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className="hover:bg-secondary/30 transition-colors">
                        <TableCell className="font-bold text-sm text-foreground">{u.full_name ?? '—'}</TableCell>
                        <TableCell className="text-sm font-medium text-foreground/75">{u.email}</TableCell>
                        <TableCell className="text-sm font-medium text-muted-foreground">{u.phone ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${roleColors[u.role]}`}>
                            {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm" variant="ghost"
                              className="text-xs font-semibold hover:text-primary"
                              onClick={() => {
                                setSelectedUser(u);
                                setUserForm({ full_name: u.full_name ?? '', phone: u.phone ?? '', role: u.role });
                                setUserDialog('edit');
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            {u.id !== user?.id && (
                              <Button
                                size="sm" variant="ghost"
                                className="text-xs font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => { setSelectedUser(u); setUserDialog('delete'); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════ APPLICATION DETAIL DIALOG ══════════════════ */}
      <Dialog open={!!selectedApp} onOpenChange={(o) => { if (!o) { setSelectedApp(null); setAdminNotes(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedApp && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                  {selectedApp.pharmacy_name}
                </DialogTitle>
                <DialogDescription className="text-sm font-medium text-muted-foreground">Application details</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <Section title="Pharmacy Info">
                  <Detail label="Address" value={selectedApp.address} />
                  <Detail label="Phone"   value={selectedApp.phone}   />
                  <Detail label="Email"   value={selectedApp.email}   />
                </Section>
                <Section title="License">
                  <Detail label="Number"    value={selectedApp.license_number}      />
                  <Detail label="Expiry"    value={selectedApp.license_expiry_date} />
                  <Detail label="Authority" value={selectedApp.issuing_authority}   />
                </Section>
                <Section title="Pharmacist in Charge">
                  <Detail label="Name"  value={selectedApp.pharmacist_name}  />
                  <Detail label="Email" value={selectedApp.pharmacist_email} />
                  <Detail label="Phone" value={selectedApp.pharmacist_phone} />
                </Section>
                <Section title="Operating Hours">
                  <Detail label="Opens"       value={selectedApp.opening_time}                       />
                  <Detail label="Closes"      value={selectedApp.closing_time}                       />
                  <Detail label="Medical Aid" value={selectedApp.accepts_medical_aid ? 'Yes' : 'No'} />
                </Section>

                {selectedApp.status === 'pending' ? (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-foreground">Admin Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Notes about this decision…"
                      rows={3}
                      className="text-sm font-medium placeholder:text-muted-foreground/60"
                    />
                  </div>
                ) : selectedApp.admin_notes ? (
                  <Section title="Admin Notes">
                    <p className="text-sm font-medium text-foreground/80">{selectedApp.admin_notes}</p>
                  </Section>
                ) : null}

                {selectedApp.reviewed_at && (
                  <p className="text-xs font-medium text-muted-foreground">
                    Reviewed {new Date(selectedApp.reviewed_at).toLocaleString()}
                  </p>
                )}
              </div>

              {selectedApp.status === 'pending' && (
                <DialogFooter className="gap-2 pt-2">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 font-semibold"
                    disabled={processing}
                    onClick={() => handleAppAction(selectedApp.id, 'rejected')}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {processing ? 'Processing…' : 'Reject'}
                  </Button>
                  <Button
                    className="font-semibold"
                    disabled={processing}
                    onClick={() => handleAppAction(selectedApp.id, 'approved')}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {processing ? 'Approving…' : 'Approve'}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════ EDIT USER DIALOG ══════════════════ */}
      <Dialog open={userDialog === 'edit'} onOpenChange={(o) => { if (!o) { setUserDialog(null); setSelectedUser(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Edit User</DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Full Name</Label>
              <Input
                value={userForm.full_name}
                onChange={(e) => setUserForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Full name"
                className="font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Phone</Label>
              <Input
                value={userForm.phone}
                onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+267 71 234 567"
                className="font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Role</Label>
              <Select
                value={userForm.role}
                onValueChange={(v) => setUserForm((f) => ({ ...f, role: v as UserRow['role'] }))}
              >
                <SelectTrigger className="font-medium"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient" className="font-medium">Patient</SelectItem>
                  <SelectItem value="pharmacist" className="font-medium">Pharmacist</SelectItem>
                  <SelectItem value="admin" className="font-medium">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="font-semibold" onClick={() => { setUserDialog(null); setSelectedUser(null); }}>
              Cancel
            </Button>
            <Button className="font-semibold" onClick={handleUpdateUser} disabled={userProcessing}>
              {userProcessing ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════ DELETE USER DIALOG ══════════════════ */}
      <Dialog open={userDialog === 'delete'} onOpenChange={(o) => { if (!o) { setUserDialog(null); setSelectedUser(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Remove User</DialogTitle>
            <DialogDescription className="text-sm font-medium text-foreground/70">
              This permanently removes{' '}
              <strong className="text-foreground">{selectedUser?.full_name ?? selectedUser?.email}</strong> from the system,
              including their profile, role, and auth account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" className="font-semibold" onClick={() => { setUserDialog(null); setSelectedUser(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" className="font-semibold" onClick={handleDeleteUser} disabled={userProcessing}>
              <Trash2 className="h-4 w-4 mr-1" />
              {userProcessing ? 'Removing…' : 'Remove User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════ INVITE USER DIALOG ══════════════════ */}
      <Dialog open={userDialog === 'create'} onOpenChange={(o) => { if (!o) setUserDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Invite New User</DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">
              An invite email will be sent. They set their own password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
                className="font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Full Name</Label>
              <Input
                value={newUserForm.full_name}
                onChange={(e) => setNewUserForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Jane Smith"
                className="font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Phone</Label>
              <Input
                value={newUserForm.phone}
                onChange={(e) => setNewUserForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+267 71 234 567"
                className="font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Role</Label>
              <Select
                value={newUserForm.role}
                onValueChange={(v) => setNewUserForm((f) => ({ ...f, role: v as UserRow['role'] }))}
              >
                <SelectTrigger className="font-medium"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient" className="font-medium">Patient</SelectItem>
                  <SelectItem value="pharmacist" className="font-medium">Pharmacist</SelectItem>
                  <SelectItem value="admin" className="font-medium">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="font-semibold" onClick={() => setUserDialog(null)}>Cancel</Button>
            <Button className="font-semibold" onClick={handleCreateUser} disabled={userProcessing || !newUserForm.email}>
              <UserPlus className="h-4 w-4 mr-1" />
              {userProcessing ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="pt-2">
    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-2 border-b border-border pb-1.5">{title}</h4>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground font-medium shrink-0">{label}</span>
    <span className="text-foreground font-semibold text-right">{value}</span>
  </div>
);

export default AdminDashboard;
