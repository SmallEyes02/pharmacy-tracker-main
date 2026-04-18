import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Clock, CheckCircle, Package, XCircle, RefreshCw, Building2, Store,
  LockKeyhole, AlertTriangle, LayoutDashboard, ClipboardList,
  FlaskConical, BarChart3, LogOut, Pencil, Trash2, Plus,
  TrendingUp, ShoppingBag, Upload, Search as SearchIcon,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Reservation {
  id: string;
  pharmacy_id: string;
  medicine_id: string;
  user_id: string;
  quantity: number;
  status: string;
  requested_at: string;
  expiry_at?: string | null;
  reference?: string | null;
  medicine_name?: string;
  pharmacy_name?: string;
  patient_name?: string;
}

interface InventoryItem {
  id: string;
  pharmacy_id: string;
  medicine_id: string;
  stock_level: number;
  price: number;
  last_updated: string;
  medicine_name?: string;
  medicine_category?: string;
  medicine_dosage_form?: string;
  medicine_strength?: string;
}

interface PharmacyApplication {
  status: string;
  pharmacy_name: string;
  created_at: string;
}

type Tab = 'overview' | 'pharmacies' | 'reservations' | 'inventory' | 'analytics';

// ── Status config ─────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending:   { label: 'Pending',   icon: Clock,        className: 'bg-warning/10 text-warning border-warning/20'             },
  confirmed: { label: 'Confirmed', icon: CheckCircle,  className: 'bg-success/10 text-success border-success/20'             },
  ready:     { label: 'Ready',     icon: Package,      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20'          },
  expired:   { label: 'Expired',   icon: XCircle,      className: 'bg-muted text-muted-foreground border-border'             },
  cancelled:  { label: 'Cancelled',  icon: XCircle,      className: 'bg-destructive/10 text-destructive border-destructive/20' },
  fulfilled:  { label: 'Fulfilled',  icon: CheckCircle,  className: 'bg-primary/10 text-primary border-primary/20'              },
};

// ── Component ─────────────────────────────────────────────────────────────────
const PharmacistDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [approvalStatus, setApprovalStatus] = useState<'loading' | 'pending' | 'approved' | 'rejected'>('loading');
  const [pharmacistName, setPharmacistName] = useState<string | null>(null);
  const [application, setApplication]       = useState<PharmacyApplication | null>(null);
  const [myPharmacies, setMyPharmacies]     = useState<{
    id: string; name: string; address: string; phone: string; email: string;
    opening_time: string | null; closing_time: string | null;
    accepts_medical_aid: boolean; is_active: boolean; owner_id: string;
  }[]>([]);
  const [activeTab, setActiveTab]           = useState<Tab>('overview');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | 'all'>('all');

  // Reservations
  const [reservations, setReservations]   = useState<Reservation[]>([]);
  const [resLoading, setResLoading]       = useState(false);
  const [resFilter, setResFilter]         = useState('all');

  // Inventory
  const [inventory, setInventory]         = useState<InventoryItem[]>([]);
  const [invLoading, setInvLoading]       = useState(false);
  const [invDialog, setInvDialog]         = useState<'add' | 'edit' | 'delete' | null>(null);
  const [selectedItem, setSelectedItem]   = useState<InventoryItem | null>(null);
  const [invForm, setInvForm]             = useState({ medicine_id: '', stock_level: '', price: '', pharmacy_id: '' });
  const [invProcessing, setInvProcessing] = useState(false);

  // Inventory filters
  const [invSearch, setInvSearch]           = useState('');
  const [invStockFilter, setInvStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [invTypeFilter, setInvTypeFilter]   = useState('all');

  // Medicines lookup for inventory add
  const [medicines, setMedicines]         = useState<{ id: string; name: string; strength?: string; dosage_form?: string }[]>([]);
  const [medSearch, setMedSearch]         = useState('');
  const [csvUploading, setCsvUploading]   = useState(false);

  // Pharmacy management
  const [pharDialog, setPharDialog]       = useState<'edit' | null>(null);
  const [selectedPhar, setSelectedPhar]   = useState<typeof myPharmacies[0] | null>(null);
  const [pharForm, setPharForm]           = useState({ name: '', address: '', phone: '', email: '', opening_time: '', closing_time: '', accepts_medical_aid: false });
  const [pharProcessing, setPharProcessing] = useState(false);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // ── Access + approval check ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const email = authUser?.email;
      if (!email) {
        setApprovalStatus('loading');
        return;
      }

      // Fetch pharmacist's display name
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      setPharmacistName(profile?.full_name ?? null);

      // Run both queries in parallel
      const [appsRes, roleRes] = await Promise.all([
        (supabase as any)
          .from('pharmacy_applications')
          .select('status, pharmacy_name, created_at')
          .eq('pharmacist_email', email)
          .order('created_at', { ascending: false })
          .limit(1),
        (supabase as any).rpc('has_role', { _user_id: user.id, _role: 'pharmacist' }),
      ]);

      if (appsRes.error) console.warn('Application query:', appsRes.error.message);

      const latestApp = appsRes.data?.[0] ?? null;
      const hasRole   = !!roleRes.data;

      // No application AND no role = regular patient, go home
      if (!latestApp && !hasRole) {
        navigate('/', { replace: true });
        return;
      }

      // Has role but no application = manually assigned pharmacist, full access
      if (!latestApp && hasRole) {
        setApprovalStatus('approved');
        const { data: pharmacies } = await (supabase as any)
          .from('pharmacies')
          .select('id, name, address, phone, email, opening_time, closing_time, accepts_medical_aid, is_active, owner_id')
          .eq('owner_id', user.id);
        const owned = (pharmacies ?? []).filter((p: any) => p.owner_id === user.id);
        setMyPharmacies(owned);
        if (owned.length === 1) setSelectedPharmacyId(owned[0].id);
        return;
      }

      setApplication(latestApp);
      const appStatus = latestApp!.status === 'approved' ? 'approved'
        : latestApp!.status === 'rejected' ? 'rejected' : 'pending';
      setApprovalStatus(appStatus);

      if (appStatus === 'approved') {
        const { data: pharmacies } = await (supabase as any)
          .from('pharmacies')
          .select('id, name, address, phone, email, opening_time, closing_time, accepts_medical_aid, is_active, owner_id')
          .eq('owner_id', user.id);
        // Hard client-side filter — only keep rows where owner_id exactly matches
        const owned = (pharmacies ?? []).filter((p: any) => p.owner_id === user.id);
        setMyPharmacies(owned);
        if (owned.length === 1) setSelectedPharmacyId(owned[0].id);
      }
    };
    check();
  }, [user, navigate]);

  // ── Update pharmacy details ──────────────────────────────────────────────
  const handleUpdatePharmacy = async () => {
    if (!selectedPhar) return;
    setPharProcessing(true);
    const { error } = await (supabase as any)
      .from('pharmacies')
      .update({
        name:               pharForm.name,
        address:            pharForm.address,
        phone:              pharForm.phone,
        email:              pharForm.email,
        opening_time:       pharForm.opening_time || null,
        closing_time:       pharForm.closing_time || null,
        accepts_medical_aid: pharForm.accepts_medical_aid,
      })
      .eq('id', selectedPhar.id)
      .eq('owner_id', user?.id); // safety: only update if owner matches

    if (error) {
      toast.error('Failed to update pharmacy: ' + error.message);
    } else {
      toast.success('Pharmacy updated successfully');
      // Refresh myPharmacies
      const { data: pharmacies } = await (supabase as any)
        .from('pharmacies')
        .select('id, name, address, phone, email, opening_time, closing_time, accepts_medical_aid, is_active, owner_id')
        .eq('owner_id', user?.id);
      const owned = (pharmacies ?? []).filter((p: any) => p.owner_id === user?.id);
      setMyPharmacies(owned);
      setPharDialog(null);
      setSelectedPhar(null);
    }
    setPharProcessing(false);
  };

  // ── Fetch medicines for inventory dropdown ───────────────────────────────
  const fetchMedicines = useCallback(async (search = '') => {
    let q = (supabase as any).from('medicines').select('id, name, strength, dosage_form');
    if (search.trim()) q = q.ilike('name', `%${search}%`);
    const { data } = await q.order('name').limit(50);
    setMedicines(data ?? []);
  }, []);

  // ── Handle CSV upload ─────────────────────────────────────────────────────
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !invForm.pharmacy_id) {
      toast.error('Select a pharmacy first, then upload CSV');
      return;
    }

    setCsvUploading(true);
    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Expected CSV columns: medicine_name, stock_level, price
    // Optional: medicine_id (if known)
    const nameIdx  = headers.indexOf('medicine_name');
    const stockIdx = headers.indexOf('stock_level');
    const priceIdx = headers.indexOf('price');
    const idIdx    = headers.indexOf('medicine_id');

    if (nameIdx === -1 || stockIdx === -1 || priceIdx === -1) {
      toast.error('CSV must have columns: medicine_name, stock_level, price');
      setCsvUploading(false);
      e.target.value = '';
      return;
    }

    let successCount = 0;
    let errorCount   = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 3) continue;

      const medicineName = cols[nameIdx];
      const stockLevel   = parseInt(cols[stockIdx]);
      const price        = parseFloat(cols[priceIdx]);
      let   medicineId   = idIdx !== -1 ? cols[idIdx] : null;

      if (!medicineName || isNaN(stockLevel) || isNaN(price)) continue;

      // Look up medicine by name if no ID provided
      if (!medicineId) {
        const { data: med } = await (supabase as any)
          .from('medicines')
          .select('id')
          .ilike('name', medicineName)
          .limit(1)
          .single();
        medicineId = med?.id ?? null;
      }

      if (!medicineId) { errorCount++; continue; }

      // Upsert — update if already exists for this pharmacy+medicine
      const { error } = await (supabase as any)
        .from('pharmacy_inventory')
        .upsert({
          pharmacy_id:  invForm.pharmacy_id,
          medicine_id:  medicineId,
          stock_level:  stockLevel,
          price:        price,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'pharmacy_id,medicine_id' });

      if (error) errorCount++;
      else successCount++;
    }

    await fetchInventory();
    setCsvUploading(false);
    e.target.value = '';
    toast.success(`Imported ${successCount} items${errorCount > 0 ? `, ${errorCount} failed (medicine not found)` : ''}`);
  };

 // ── Fetch reservations ────────────────────────────────────────────────────
const fetchReservations = useCallback(async () => {
  if (!myPharmacies.length) return;
  setResLoading(true);

  const pharmacyIds = myPharmacies.map(p => p.id);

  // Fetch reservations — filtered strictly to this pharmacist's pharmacy IDs
  const { data, error } = await (supabase as any)
    .from('reservations')
    .select('id, pharmacy_id, medicine_id, user_id, quantity, status, requested_at, expiry_at, reference')
    .in('pharmacy_id', pharmacyIds)
    .order('requested_at', { ascending: false });

  if (error) {
    console.warn('Reservations query:', error.message);
    setReservations([]);
    setResLoading(false);
    return;
  }

  const medicineIds     = [...new Set((data ?? []).map((r: any) => r.medicine_id).filter(Boolean))];
  const pharmacyIdsUniq = [...new Set((data ?? []).map((r: any) => r.pharmacy_id).filter(Boolean))];
  const userIds         = [...new Set((data ?? []).map((r: any) => r.user_id).filter((id: any) => typeof id === 'string' && id.length > 0))];


  const [medRes, pharRes, profileRes] = await Promise.all([
    medicineIds.length
      ? (supabase as any).from('medicines').select('id, name').in('id', medicineIds)
      : { data: [] },
    pharmacyIdsUniq.length
      ? (supabase as any).from('pharmacies').select('id, name').in('id', pharmacyIdsUniq)
      : { data: [] },
    userIds.length
      ? (supabase as any).from('profiles').select('user_id, full_name').in('user_id', userIds)
      : { data: [] },
  ]);


  const medMap:     Record<string, string> = {};
  const pharMap:    Record<string, string> = {};
  const profileMap: Record<string, string> = {};
  
  (medRes.data ?? []).forEach((m: any) => { medMap[m.id] = m.name; });
  (pharRes.data ?? []).forEach((p: any) => { pharMap[p.id] = p.name; });
  (profileRes.data ?? []).forEach((p: any) => {
    profileMap[p.user_id] = p.full_name?.trim() || `Patient #${(p.user_id as string).slice(-4)}`;
  });

  setReservations((data ?? []).map((r: any) => ({
    ...r,
    medicine_name: medMap[r.medicine_id] ?? '—',
    pharmacy_name: pharMap[r.pharmacy_id] ?? '—',
    patient_name:  profileMap[r.user_id] ?? `Patient #${(r.user_id as string).slice(-4)}`,
  })));
  setResLoading(false);
}, [myPharmacies]);

  // ── Fetch inventory ───────────────────────────────────────────────────────
  const fetchInventory = useCallback(async () => {
    if (!myPharmacies.length) return;
    setInvLoading(true);
    // myPharmacies is already scoped to owner_id = user.id
    const ownedPharmacyIds = myPharmacies.map(p => p.id);
    const { data, error } = await (supabase as any)
      .from('pharmacy_inventory')
      .select('id, pharmacy_id, medicine_id, stock_level, price, last_updated')
      .in('pharmacy_id', ownedPharmacyIds)
      .order('last_updated', { ascending: false });

    if (error) {
      console.warn('Inventory query:', error.message);
      setInventory([]);
      setInvLoading(false);
      return;
    }

    const medIds = [...new Set((data ?? []).map((i: any) => i.medicine_id).filter(Boolean))];
    const medRes = medIds.length
      ? await (supabase as any).from('medicines').select('id, name, category, dosage_form, strength').in('id', medIds)
      : { data: [] };

    const medMap: Record<string, any> = {};
    (medRes.data ?? []).forEach((m: any) => { medMap[m.id] = m; });

    setInventory((data ?? []).map((i: any) => {
      const med = medMap[i.medicine_id] ?? {};
      return {
        ...i,
        medicine_name:        med.name         ?? '—',
        medicine_category:    med.category      ?? '—',
        medicine_dosage_form: med.dosage_form   ?? '—',
        medicine_strength:    med.strength      ?? '—',
      };
    }));
    setInvLoading(false);
  }, [myPharmacies]);

  useEffect(() => {
    if (myPharmacies.length && approvalStatus === 'approved') {
      fetchReservations();
      fetchInventory();
    }
  }, [myPharmacies, approvalStatus, fetchReservations, fetchInventory]);

  // ── Reservation status update ─────────────────────────────────────────────
  const updateReservation = async (id: string, newStatus: string) => {
    const { error } = await (supabase as any)
      .from('reservations').update({ status: newStatus }).eq('id', id);
    if (error) toast.error('Failed to update reservation');
    else {
      toast.success(`Marked as ${newStatus}`);
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    }
  };

  // ── Inventory CRUD ────────────────────────────────────────────────────────
  const handleSaveInventory = async () => {
    if (!invForm.medicine_id || !invForm.stock_level || !invForm.price || !invForm.pharmacy_id) {
      toast.error('All fields are required'); return;
    }
    setInvProcessing(true);

    if (invDialog === 'add') {
      const { error } = await (supabase as any).from('pharmacy_inventory').insert({
        pharmacy_id:  invForm.pharmacy_id,
        medicine_id:  invForm.medicine_id,
        stock_level:  parseInt(invForm.stock_level),
        price:        parseFloat(invForm.price),
        last_updated: new Date().toISOString(),
      });
      if (error) toast.error('Failed to add item: ' + error.message);
      else { toast.success('Item added'); await fetchInventory(); }
    } else if (invDialog === 'edit' && selectedItem) {
      const { error } = await (supabase as any).from('pharmacy_inventory')
        .update({
          stock_level:  parseInt(invForm.stock_level),
          price:        parseFloat(invForm.price),
          last_updated: new Date().toISOString(),
        })
        .eq('id', selectedItem.id);
      if (error) toast.error('Failed to update: ' + error.message);
      else { toast.success('Item updated'); await fetchInventory(); }
    }

    setInvProcessing(false);
    setInvDialog(null);
    setSelectedItem(null);
  };

  const handleDeleteInventory = async () => {
    if (!selectedItem) return;
    setInvProcessing(true);
    const { error } = await (supabase as any)
      .from('pharmacy_inventory').delete().eq('id', selectedItem.id);
    if (error) toast.error('Failed to delete: ' + error.message);
    else { toast.success('Item removed'); await fetchInventory(); }
    setInvProcessing(false);
    setInvDialog(null);
    setSelectedItem(null);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const filteredRes = resFilter === 'all'
    ? reservations : reservations.filter(r => r.status === resFilter);

  const resCounts: Record<string, number> = {
    all:       reservations.length,
    pending:   reservations.filter(r => r.status === 'pending').length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    ready:     reservations.filter(r => r.status === 'ready').length,
    fulfilled: reservations.filter(r => r.status === 'fulfilled').length,
    cancelled: reservations.filter(r => r.status === 'cancelled').length,
  };

  const invCounts = {
    total:      inventory.filter(i => selectedPharmacyId === 'all' || i.pharmacy_id === selectedPharmacyId).length,
    inStock:    inventory.filter(i => (selectedPharmacyId === 'all' || i.pharmacy_id === selectedPharmacyId) && i.stock_level > 10).length,
    lowStock:   inventory.filter(i => (selectedPharmacyId === 'all' || i.pharmacy_id === selectedPharmacyId) && i.stock_level > 0 && i.stock_level <= 10).length,
    outOfStock: inventory.filter(i => (selectedPharmacyId === 'all' || i.pharmacy_id === selectedPharmacyId) && i.stock_level === 0).length,
  };

  // Analytics: most booked medicines
  const medicineBookings = reservations.reduce((acc: Record<string, { name: string; count: number }>, r) => {
    if (!acc[r.medicine_id]) acc[r.medicine_id] = { name: r.medicine_name ?? '—', count: 0 };
    acc[r.medicine_id].count += r.quantity;
    return acc;
  }, {});
  const topMedicines = Object.values(medicineBookings)
    .sort((a, b) => b.count - a.count).slice(0, 5);
  const maxBooking = topMedicines[0]?.count ?? 1;

  const isApproved = approvalStatus === 'approved';
  const isPending  = approvalStatus === 'pending';
  const isRejected = approvalStatus === 'rejected';

  // Inventory filter derived values
  const branchInventory = selectedPharmacyId === 'all'
    ? inventory
    : inventory.filter(i => i.pharmacy_id === selectedPharmacyId);

  const inventoryCategories = ['all', ...Array.from(new Set(branchInventory.map(i => i.medicine_category).filter(c => c && c !== '—')))];

  const filteredInventory = branchInventory.filter(item => {
    const stockLevel = item.stock_level;
    const stockMatch =
      invStockFilter === 'all'          ? true :
      invStockFilter === 'out_of_stock' ? stockLevel === 0 :
      invStockFilter === 'low_stock'    ? stockLevel > 0 && stockLevel <= 10 :
      /* in_stock */                      stockLevel > 10;

    const typeMatch = invTypeFilter === 'all' || item.medicine_category === invTypeFilter;

    const q = invSearch.trim().toLowerCase();
    const searchMatch = !q || [
      item.medicine_name,
      item.medicine_category,
      item.medicine_dosage_form,
      item.medicine_strength,
    ].some(v => (v ?? '').toLowerCase().includes(q));

    return stockMatch && typeMatch && searchMatch;
  });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading || (!user && approvalStatus === 'loading') || (user && approvalStatus === 'loading')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying access…</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ── Sidebar ── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-bold text-primary">
              {(pharmacistName ?? user?.email ?? 'P')[0].toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base text-foreground truncate">
              {pharmacistName ?? 'Pharmacist'}
            </p>
            <p className="text-xs text-success font-medium">Pharmacist</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {([
            { key: 'overview',     label: 'Overview',      icon: LayoutDashboard },
            { key: 'pharmacies',   label: 'My Pharmacies', icon: Store },
            { key: 'reservations', label: 'Reservations',  icon: ClipboardList, badge: resCounts.pending },
            { key: 'inventory',    label: 'Inventory',     icon: FlaskConical,  badge: invCounts.lowStock + invCounts.outOfStock },
            { key: 'analytics',    label: 'Analytics',     icon: BarChart3 },
          ] as { key: Tab; label: string; icon: React.ElementType; badge?: number }[]).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => isApproved ? setActiveTab(key) : undefined}
              disabled={!isApproved}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-base font-medium transition-colors
                ${!isApproved ? 'opacity-40 cursor-not-allowed' : ''}
                ${activeTab === key && isApproved
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              {badge != null && badge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
                  ${activeTab === key ? 'bg-white/20 text-white' : 'bg-warning/20 text-warning'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={() => { supabase.auth.signOut(); navigate('/auth'); }}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-3 text-base font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 min-w-0 pb-24 md:pb-8">

        {/* Status banners */}
        {isPending && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-semibold text-warning">Application Under Review</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Submitted {application?.created_at ? new Date(application.created_at).toLocaleDateString() : '—'}.
                Dashboard access is locked until your application is approved.
              </p>
            </div>
          </div>
        )}
        {isRejected && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-semibold text-destructive">Application Not Approved</p>
              <p className="text-sm text-muted-foreground mt-0.5">Contact support or submit a new application.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/pharmacy-signup')}>
              New Application
            </Button>
          </div>
        )}

        {/* Locked overlay for non-approved */}
        {!isApproved ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <LockKeyhole className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-base font-medium text-foreground">Dashboard locked</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {isPending
                ? 'Full access will be granted once an admin approves your application.'
                : 'Your application was not approved. Submit a new one to get access.'}
            </p>
          </div>
        ) : (
          <>
            {/* ══════════════ OVERVIEW ══════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-6 w-full">
                <div>
                  <h1 className="font-heading text-3xl font-bold text-foreground">Overview</h1>
                  <p className="text-base text-muted-foreground mt-1">
                    {myPharmacies.map(p => p.name).join(' · ')}
                  </p>
                </div>

                {/* Reservation stats */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reservations</h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total',     value: resCounts.all,       color: 'text-foreground'  },
                      { label: 'Pending',   value: resCounts.pending,   color: 'text-warning'     },
                      { label: 'Confirmed', value: resCounts.confirmed, color: 'text-success'     },
                      { label: 'Ready',     value: resCounts.ready,     color: 'text-blue-600'    },
                    ].map(s => (
                      <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => { setActiveTab('reservations'); setResFilter(s.label.toLowerCase()); }}>
                        <CardContent className="pt-5">
                          <p className="text-sm text-muted-foreground">{s.label}</p>
                          <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Inventory stats */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inventory</h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Items',  value: invCounts.total,      color: 'text-foreground'  },
                      { label: 'In Stock',     value: invCounts.inStock,    color: 'text-success'     },
                      { label: 'Low Stock',    value: invCounts.lowStock,   color: 'text-warning'     },
                      { label: 'Out of Stock', value: invCounts.outOfStock, color: 'text-destructive' },
                    ].map(s => (
                      <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setActiveTab('inventory')}>
                        <CardContent className="pt-5">
                          <p className="text-sm text-muted-foreground">{s.label}</p>
                          <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Top medicines preview */}
                {topMedicines.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Booked Medicines</h2>
                    <Card>
                      <CardContent className="pt-5 space-y-3">
                        {topMedicines.map((m, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                            <span className="text-sm text-foreground flex-1 truncate">{m.name}</span>
                            <div className="flex-1 max-w-[140px]">
                              <div className="h-2 rounded-full bg-border">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{ width: `${(m.count / maxBooking) * 100}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground w-8 text-right">{m.count}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ MY PHARMACIES ══════════════ */}
{activeTab === 'pharmacies' && (
  <div className="space-y-5 w-full">
    <div>
      <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">My Pharmacies</h1>
      <p className="text-sm sm:text-base text-muted-foreground mt-1">
        View and manage your approved pharmacies
      </p>
    </div>

    {myPharmacies.length === 0 ? (
      <p className="text-center py-12 text-muted-foreground">No pharmacies found.</p>
    ) : (
      <div className="grid gap-4 grid-cols-1">
        {myPharmacies.map((p) => (
          <Card key={p.id} className="hover:shadow-md transition-shadow overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              {/* Header with name and badges */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <p className="font-heading font-semibold text-base sm:text-lg text-foreground break-words">
                      {p.name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 items-end">
                  <Badge variant="outline" className={p.is_active
                    ? 'bg-success/10 text-success border-success/20 text-[10px] sm:text-xs'
                    : 'bg-muted text-muted-foreground text-[10px] sm:text-xs'}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {p.accepts_medical_aid && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] sm:text-xs whitespace-nowrap">
                      Med Aid
                    </Badge>
                  )}
                </div>
              </div>

              {/* Address and contact info */}
              <div className="space-y-1.5 mb-4">
                {p.address && (
                  <p className="text-xs sm:text-sm text-muted-foreground break-words leading-relaxed">
                    📍 {p.address}
                  </p>
                )}
                {p.phone && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    📞 {p.phone}
                  </p>
                )}
                {p.email && (
                  <p className="text-xs sm:text-sm text-muted-foreground break-words">
                    ✉️ {p.email}
                  </p>
                )}
                {p.opening_time && p.closing_time && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    🕐 {p.opening_time.slice(0,5)} – {p.closing_time.slice(0,5)}
                  </p>
                )}
              </div>

              {/* Mini stats - responsive grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="font-bold text-foreground text-lg sm:text-xl">
                    {reservations.filter(r => r.pharmacy_id === p.id && r.status === 'pending').length}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="font-bold text-foreground text-lg sm:text-xl">
                    {reservations.filter(r => r.pharmacy_id === p.id && r.status === 'confirmed').length}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Confirmed</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="font-bold text-foreground text-lg sm:text-xl">
                    {inventory.filter(i => i.pharmacy_id === p.id).length}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Stock Items</p>
                </div>
              </div>

              {/* Action buttons - stacked on mobile, row on tablet+ */}
              <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => {
                    setSelectedPhar(p);
                    setPharForm({
                      name:               p.name,
                      address:            p.address || '',
                      phone:              p.phone || '',
                      email:              p.email || '',
                      opening_time:       p.opening_time?.slice(0,5) || '',
                      closing_time:       p.closing_time?.slice(0,5) || '',
                      accepts_medical_aid: p.accepts_medical_aid,
                    });
                    setPharDialog('edit');
                  }}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => { setSelectedPharmacyId(p.id); setActiveTab('reservations'); }}>
                  <ClipboardList className="h-3.5 w-3.5 mr-1" /> Reservations
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => { setSelectedPharmacyId(p.id); setActiveTab('inventory'); }}>
                  <FlaskConical className="h-3.5 w-3.5 mr-1" /> Inventory
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )}
  </div>
)}

            {/* ══════════════ RESERVATIONS ══════════════ */}
            {activeTab === 'reservations' && (
              <div className="space-y-4 w-full">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">Reservations</h1>
                    <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage incoming reservations from patients</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchReservations} disabled={resLoading}>
                    <RefreshCw className={`h-4 w-4 ${resLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline ml-1">Refresh</span>
                  </Button>
                </div>

                {/* Workflow guide — hidden on smallest screens */}
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5 flex-wrap">
                  <span className="font-semibold text-foreground text-sm">Workflow:</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning inline-block"/>Pending</span>
                  <span className="opacity-40">→</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success inline-block"/>Confirmed</span>
                  <span className="opacity-40">→</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block"/>Ready</span>
                  <span className="opacity-40">→</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary inline-block"/>Fulfilled</span>
                </div>

                {/* Filter tabs — scrollable on mobile */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {(['all','pending','confirmed','ready','fulfilled','cancelled'] as const).map(f => (
                    <button key={f} onClick={() => setResFilter(f)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                        ${resFilter === f
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {(resCounts[f] ?? 0) > 0 && (
                        <span className={`ml-1.5 text-xs font-bold ${resFilter === f ? 'opacity-80' : 'text-primary'}`}>
                          {resCounts[f]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {resLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-muted-foreground">Loading…</span>
                  </div>
                ) : filteredRes.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="font-medium text-muted-foreground">No {resFilter !== 'all' ? resFilter : ''} reservations</p>
                  </div>
                ) : (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredRes.map(res => {
                      const cfg        = statusConfig[res.status] ?? statusConfig.pending;
                      const StatusIcon = cfg.icon;
                      const expiryText = (() => {
                        if (!res.expiry_at || !['pending','confirmed'].includes(res.status)) return null;
                        const diff = new Date(res.expiry_at as string).getTime() - Date.now();
                        if (diff <= 0) return { text: 'Expired', urgent: true };
                        const hrs = Math.floor(diff / 3_600_000);
                        const min = Math.floor((diff % 3_600_000) / 60_000);
                        return hrs < 1
                          ? { text: `${min}m left`, urgent: true }
                          : { text: `${hrs}h ${min}m left`, urgent: hrs < 1 };
                      })();
                      return (
                        <div key={res.id}
                          className={`rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-3 transition-all
                            ${res.status === 'pending'   ? 'border-warning/50' :
                              res.status === 'confirmed' ? 'border-success/50' :
                              res.status === 'ready'     ? 'border-blue-500/50' :
                              res.status === 'fulfilled' ? 'border-primary/30 opacity-70' :
                              'border-border opacity-60'}`}>

                          {/* Reference + Status */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-bold text-primary tracking-widest bg-primary/10 px-2.5 py-1 rounded-lg">
                              {res.reference ?? '—'}
                            </span>
                            <Badge variant="outline" className={cfg.className}>
                              <StatusIcon className="mr-1 h-3 w-3" />{cfg.label}
                            </Badge>
                          </div>

                          {/* Patient */}
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                              {(res.patient_name ?? 'P')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{res.patient_name ?? 'Patient'}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(res.requested_at).toLocaleString('en-BW', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>

                          {/* Medicine */}
                          <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                            <p className="font-semibold text-sm text-foreground">{res.medicine_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Qty: <span className="font-bold text-foreground">{res.quantity}</span>
                              {myPharmacies.length > 1 && <> · {res.pharmacy_name}</>}
                            </p>
                          </div>

                          {/* Expiry */}
                          {expiryText && (
                            <p className={`text-xs flex items-center gap-1 ${expiryText.urgent ? 'text-destructive' : 'text-warning'}`}>
                              <Clock className="h-3 w-3"/>{expiryText.text}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="flex flex-col gap-2 mt-auto pt-1">
                            {res.status === 'pending' && (<>
                              <Button size="sm" className="w-full gap-1.5"
                                onClick={() => updateReservation(res.id, 'confirmed')}>
                                <CheckCircle className="h-4 w-4"/>Confirm — Set Aside Medicine
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => updateReservation(res.id, 'cancelled')}>
                                <XCircle className="h-4 w-4 mr-1"/>Cancel Reservation
                              </Button>
                            </>)}
                            {res.status === 'confirmed' && (<>
                              <Button size="sm" variant="secondary" className="w-full gap-1.5"
                                onClick={() => updateReservation(res.id, 'ready')}>
                                <Package className="h-4 w-4"/>Mark Ready for Pickup
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => updateReservation(res.id, 'cancelled')}>
                                <XCircle className="h-4 w-4 mr-1"/>Cancel
                              </Button>
                            </>)}
                            {res.status === 'ready' && (
                              <Button size="sm" className="w-full gap-1.5 bg-primary hover:bg-primary/90"
                                onClick={() => updateReservation(res.id, 'fulfilled')}>
                                <CheckCircle className="h-4 w-4"/>Fulfilled — Patient Collected
                              </Button>
                            )}
                            {['fulfilled','cancelled','expired'].includes(res.status) && (
                              <p className="text-center text-xs text-muted-foreground py-1">
                                {res.status === 'fulfilled' ? '✓ Transaction closed' :
                                 res.status === 'cancelled' ? 'Reservation cancelled' : 'Reservation expired'}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ INVENTORY ══════════════ */}
{activeTab === 'inventory' && (
  <div className="space-y-5 w-full">
    {/* Header */}
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">Inventory</h1>
        <p className="text-xs sm:text-base text-muted-foreground mt-1">
          {selectedPharmacyId === 'all'
            ? 'Managing stock across all branches'
            : `Managing stock for ${myPharmacies.find(p => p.id === selectedPharmacyId)?.name ?? 'selected branch'}`}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={fetchInventory} disabled={invLoading}>
          <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 ${invLoading ? 'animate-spin' : ''}`} />
          <span className="text-xs sm:text-sm">Refresh</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          setInvForm({
            medicine_id: '',
            stock_level: '',
            price: '',
            pharmacy_id: selectedPharmacyId !== 'all' ? selectedPharmacyId : myPharmacies[0]?.id ?? '',
          });
          setMedSearch('');
          setMedicines([]);
          setInvDialog('add');
        }}>
          <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
          <span className="text-xs sm:text-sm hidden sm:inline">Upload CSV</span>
        </Button>
        <Button size="sm" onClick={() => {
          setInvForm({
            medicine_id: '',
            stock_level: '',
            price: '',
            pharmacy_id: selectedPharmacyId !== 'all' ? selectedPharmacyId : myPharmacies[0]?.id ?? '',
          });
          setMedSearch('');
          setMedicines([]);
          setInvDialog('add');
        }}>
          <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
          <span className="text-xs sm:text-sm">Add</span>
        </Button>
      </div>
    </div>

    {/* ── Branch selector - horizontal scroll on mobile ── */}
    {myPharmacies.length > 0 && (
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {myPharmacies.length > 1 && (
          <button
            onClick={() => { setSelectedPharmacyId('all'); setInvStockFilter('all'); setInvTypeFilter('all'); setInvSearch(''); }}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 whitespace-nowrap ${
              selectedPharmacyId === 'all'
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'border-border bg-card text-foreground/70 hover:text-foreground hover:border-primary/40'
            }`}
          >
            All Branches
            <span className="ml-1.5 font-bold opacity-80">{inventory.length}</span>
          </button>
        )}
        {myPharmacies.map(p => {
          const count = inventory.filter(i => i.pharmacy_id === p.id).length;
          const outOfStock = inventory.filter(i => i.pharmacy_id === p.id && i.stock_level === 0).length;
          return (
            <button
              key={p.id}
              onClick={() => { setSelectedPharmacyId(p.id); setInvStockFilter('all'); setInvTypeFilter('all'); setInvSearch(''); }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap ${
                selectedPharmacyId === p.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'border-border bg-card text-foreground/70 hover:text-foreground hover:border-primary/40'
              }`}
            >
              <Store className="h-3 w-3" />
              {p.name.length > 15 ? p.name.slice(0, 12) + '...' : p.name}
              <span className="font-bold opacity-80">{count}</span>
              {outOfStock > 0 && (
                <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${
                  selectedPharmacyId === p.id ? 'bg-white/25 text-white' : 'bg-destructive/15 text-destructive'
                }`}>
                  {outOfStock}
                </span>
              )}
            </button>
          );
        })}
      </div>
    )}

    {/* ── Search + Filter bar - wrap on mobile ── */}
    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
      {/* Search input - full width on mobile */}
      <div className="relative flex-1 min-w-[0] w-full sm:max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name, category, form…"
          value={invSearch}
          onChange={e => setInvSearch(e.target.value)}
          className="pl-9 font-medium placeholder:text-muted-foreground/60 w-full"
        />
      </div>

      {/* Filter row - horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {([
          { key: 'all',          label: 'All',    count: invCounts.total                                  },
          { key: 'in_stock',     label: 'In',     count: invCounts.inStock,    color: 'text-success'     },
          { key: 'low_stock',    label: 'Low',    count: invCounts.lowStock,   color: 'text-warning'     },
          { key: 'out_of_stock', label: 'Out',    count: invCounts.outOfStock, color: 'text-destructive' },
        ] as { key: typeof invStockFilter; label: string; count: number; color?: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setInvStockFilter(f.key)}
            className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
              invStockFilter === f.key
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'border-border bg-card text-foreground/70 hover:text-foreground hover:border-primary/40'
            }`}
          >
            {f.label}
            <span className={`ml-1 font-bold text-[11px] ${invStockFilter === f.key ? 'opacity-80' : (f.color ?? 'text-muted-foreground')}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Category dropdown */}
      <Select value={invTypeFilter} onValueChange={setInvTypeFilter}>
        <SelectTrigger className="w-full sm:w-[140px] text-sm font-medium">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {inventoryCategories.map(cat => (
            <SelectItem key={cat} value={cat} className="text-sm font-medium">
              {cat === 'all' ? 'All Categories' : cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {(invSearch || invStockFilter !== 'all' || invTypeFilter !== 'all') && (
        <button
          onClick={() => { setInvSearch(''); setInvStockFilter('all'); setInvTypeFilter('all'); }}
          className="text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2 shrink-0"
        >
          Clear
        </button>
      )}
    </div>

    {/* Results summary */}
    {(invSearch || invStockFilter !== 'all' || invTypeFilter !== 'all' || selectedPharmacyId !== 'all') && (
      <p className="text-xs sm:text-sm text-muted-foreground font-medium">
        Showing <span className="font-bold text-foreground">{filteredInventory.length}</span> of{' '}
        <span className="font-bold text-foreground">{inventory.length}</span> items
        {selectedPharmacyId !== 'all' && (
          <span className="ml-1">
            at <span className="font-bold text-foreground">{myPharmacies.find(p => p.id === selectedPharmacyId)?.name?.slice(0, 20)}</span>
          </span>
        )}
      </p>
    )}

    {invLoading ? (
      <p className="text-center py-12 text-muted-foreground">Loading…</p>
    ) : inventory.length === 0 ? (
      <p className="text-center py-12 text-muted-foreground">No inventory items found.</p>
    ) : filteredInventory.length === 0 ? (
      <div className="text-center py-16">
        <SearchIcon className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
        <p className="text-base font-semibold text-foreground">No items match your filters</p>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filter criteria.</p>
        <button
          onClick={() => { setInvSearch(''); setInvStockFilter('all'); setInvTypeFilter('all'); }}
          className="mt-3 text-sm font-semibold text-primary hover:underline"
        >
          Clear all filters
        </button>
      </div>
    ) : (
      /* ── Mobile-friendly card view instead of table ── */
      <div className="space-y-3">
        {/* Desktop table view - hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <Card className="overflow-hidden border-border shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Medicine</TableHead>
                  {selectedPharmacyId === 'all' && (
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Branch</TableHead>
                  )}
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Category</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Form / Strength</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Stock</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Price (P)</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Last Updated</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-primary-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map(item => {
                  const stockStatus = item.stock_level === 0
                    ? { label: 'Out of Stock', className: 'bg-destructive/15 text-destructive border-destructive/30' }
                    : item.stock_level <= 10
                    ? { label: 'Low Stock',    className: 'bg-warning/15 text-warning border-warning/30'             }
                    : { label: 'In Stock',     className: 'bg-success/15 text-success border-success/30'             };
                  const branchName = myPharmacies.find(p => p.id === item.pharmacy_id)?.name ?? '—';
                  return (
                    <TableRow key={item.id} className="hover:bg-secondary/30 transition-colors">
                      <TableCell className="font-bold text-sm text-foreground">{item.medicine_name}</TableCell>
                      {selectedPharmacyId === 'all' && (
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <Store className="h-3 w-3" />{branchName.length > 20 ? branchName.slice(0, 17) + '...' : branchName}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="text-sm font-medium text-foreground/75">{item.medicine_category}</TableCell>
                      <TableCell className="text-sm font-medium text-muted-foreground">
                        {item.medicine_dosage_form}{item.medicine_strength ? ` · ${item.medicine_strength}` : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{item.stock_level}</span>
                          <Badge variant="outline" className={`${stockStatus.className} text-[10px] px-1.5 py-0 font-semibold`}>
                            {stockStatus.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-sm text-foreground">P {Number(item.price).toFixed(2)}</TableCell>
                      <TableCell className="text-xs font-medium text-muted-foreground">
                        {new Date(item.last_updated).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost"
                          className="text-xs font-semibold hover:text-primary"
                          onClick={() => {
                            setSelectedItem(item);
                            setInvForm({
                              medicine_id: item.medicine_id,
                              stock_level: String(item.stock_level),
                              price:       String(item.price),
                              pharmacy_id: item.pharmacy_id,
                            });
                            setInvDialog('edit');
                          }}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="text-xs font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setSelectedItem(item); setInvDialog('delete'); }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Mobile card view - visible only on mobile */}
        <div className="md:hidden space-y-3">
          {filteredInventory.map(item => {
            const stockStatus = item.stock_level === 0
              ? { label: 'Out', className: 'bg-destructive/15 text-destructive' }
              : item.stock_level <= 10
              ? { label: 'Low', className: 'bg-warning/15 text-warning' }
              : { label: 'In', className: 'bg-success/15 text-success' };
            const branchName = myPharmacies.find(p => p.id === item.pharmacy_id)?.name ?? '—';
            
            return (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header row with medicine name and stock status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base text-foreground truncate">{item.medicine_name}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {selectedPharmacyId === 'all' && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            <Store className="h-2.5 w-2.5 mr-0.5" />
                            {branchName.length > 20 ? branchName.slice(0, 17) + '...' : branchName}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${stockStatus.className} border-current/20`}>
                          {stockStatus.label}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs font-semibold">
                      {item.stock_level} units
                    </Badge>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/30 p-2">
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-semibold text-foreground truncate">{item.medicine_category}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-2">
                      <p className="text-muted-foreground">Form</p>
                      <p className="font-semibold text-foreground truncate">{item.medicine_dosage_form}</p>
                    </div>
                    {item.medicine_strength && (
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-muted-foreground">Strength</p>
                        <p className="font-semibold text-foreground truncate">{item.medicine_strength}</p>
                      </div>
                    )}
                    <div className="rounded-lg bg-muted/30 p-2">
                      <p className="text-muted-foreground">Price</p>
                      <p className="font-semibold text-primary">P {Number(item.price).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Last updated and actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground">
                      Updated: {new Date(item.last_updated).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-8 px-3 text-xs font-semibold hover:text-primary"
                        onClick={() => {
                          setSelectedItem(item);
                          setInvForm({
                            medicine_id: item.medicine_id,
                            stock_level: String(item.stock_level),
                            price:       String(item.price),
                            pharmacy_id: item.pharmacy_id,
                          });
                          setInvDialog('edit');
                        }}
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-8 px-3 text-xs font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => { setSelectedItem(item); setInvDialog('delete'); }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    )}
  </div>
)}

            {/* ══════════════ ANALYTICS ══════════════ */}
            {activeTab === 'analytics' && (
              <div className="space-y-6 w-full">
                <div>
                  <h1 className="font-heading text-3xl font-bold text-foreground">Analytics</h1>
                  <p className="text-base text-muted-foreground mt-1">Insights on reservations and stock</p>
                </div>

                {/* Most booked medicines */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-primary" /> Most Booked Medicines
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topMedicines.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No reservation data yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {topMedicines.map((m, i) => (
                          <div key={i} className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium text-foreground">{i + 1}. {m.name}</span>
                              <span className="text-muted-foreground">{m.count} units reserved</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-border">
                              <div
                                className="h-2.5 rounded-full bg-primary transition-all"
                                style={{ width: `${(m.count / maxBooking) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Reservation status breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShoppingBag className="h-4 w-4 text-primary" /> Reservation Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Pending',   count: resCounts.pending,   className: 'text-warning'     },
                        { label: 'Confirmed', count: resCounts.confirmed, className: 'text-success'     },
                        { label: 'Ready',     count: resCounts.ready,     className: 'text-blue-600'    },
                        { label: 'Cancelled', count: resCounts.cancelled, className: 'text-destructive' },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg border border-border p-3 text-center">
                          <p className={`text-2xl font-bold ${s.className}`}>{s.count}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Stock health */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FlaskConical className="h-4 w-4 text-primary" /> Stock Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { label: 'In Stock',     count: invCounts.inStock,    total: invCounts.total, color: 'bg-success'     },
                        { label: 'Low Stock',    count: invCounts.lowStock,   total: invCounts.total, color: 'bg-warning'     },
                        { label: 'Out of Stock', count: invCounts.outOfStock, total: invCounts.total, color: 'bg-destructive' },
                      ].map(row => (
                        <div key={row.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className="font-medium">{row.count} / {row.total}</span>
                          </div>
                          <div className="h-2 rounded-full bg-border">
                            <div className={`h-2 rounded-full ${row.color}`}
                              style={{ width: row.total ? `${(row.count / row.total) * 100}%` : '0%' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Add / Edit Inventory Dialog ── */}
      <Dialog open={invDialog === 'add' || invDialog === 'edit'}
        onOpenChange={o => {
          if (!o) {
            setInvDialog(null);
            setSelectedItem(null);
            setMedSearch('');
            setMedicines([]);
          }
        }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {invDialog === 'add' ? 'Add Inventory Item' : 'Edit Inventory Item'}
            </DialogTitle>
            <DialogDescription>
              {invDialog === 'edit'
                ? `Update stock and price for ${selectedItem?.medicine_name}`
                : 'Search for a medicine and set stock level and price'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Pharmacy selector — add mode only */}
            {invDialog === 'add' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Pharmacy</Label>
                <select
                  value={invForm.pharmacy_id}
                  onChange={e => setInvForm(f => ({ ...f, pharmacy_id: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">Select pharmacy…</option>
                  {myPharmacies.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Medicine search — add mode only */}
            {invDialog === 'add' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Search Medicine</Label>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Type medicine name…"
                    value={medSearch}
                    onChange={e => {
                      setMedSearch(e.target.value);
                      fetchMedicines(e.target.value);
                    }}
                    onFocus={() => fetchMedicines(medSearch)}
                  />
                </div>
                {medicines.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background shadow-sm">
                    {medicines.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setInvForm(f => ({ ...f, medicine_id: m.id }));
                          setMedSearch(`${m.name}${m.strength ? ` ${m.strength}` : ''}${m.dosage_form ? ` (${m.dosage_form})` : ''}`);
                          setMedicines([]);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors
                          ${invForm.medicine_id === m.id ? 'bg-primary/10 text-primary' : ''}`}
                      >
                        <span className="font-medium">{m.name}</span>
                        {m.strength && <span className="ml-1 text-muted-foreground">{m.strength}</span>}
                        {m.dosage_form && <span className="ml-1 text-xs text-muted-foreground">({m.dosage_form})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {invForm.medicine_id && (
                  <p className="text-xs text-success flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Medicine selected
                  </p>
                )}
              </div>
            )}

            {/* Stock + Price */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Stock Level</Label>
                <Input
                  type="number" min="0"
                  value={invForm.stock_level}
                  onChange={e => setInvForm(f => ({ ...f, stock_level: e.target.value }))}
                  placeholder="e.g. 50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Price (P)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={invForm.price}
                  onChange={e => setInvForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="e.g. 25.00"
                />
              </div>
            </div>

            {/* CSV upload — add mode only */}
            {invDialog === 'add' && (
              <div className="rounded-lg border border-dashed border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Bulk Upload via CSV</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Required columns: <code className="bg-muted px-1 rounded">medicine_name</code>,{' '}
                  <code className="bg-muted px-1 rounded">stock_level</code>,{' '}
                  <code className="bg-muted px-1 rounded">price</code>
                  <br />Optional: <code className="bg-muted px-1 rounded">medicine_id</code> (UUID, faster lookup)
                </p>
                <div className="flex items-center gap-2">
                  <label className={`cursor-pointer inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors ${csvUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="h-3.5 w-3.5" />
                    {csvUploading ? 'Uploading…' : 'Choose CSV file'}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      disabled={csvUploading || !invForm.pharmacy_id}
                      onChange={handleCSVUpload}
                    />
                  </label>
                  {!invForm.pharmacy_id && (
                    <p className="text-xs text-warning">Select a pharmacy first</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => {
              setInvDialog(null);
              setSelectedItem(null);
              setMedSearch('');
              setMedicines([]);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveInventory}
              disabled={invProcessing || (invDialog === 'add' && (!invForm.medicine_id || !invForm.pharmacy_id))}
            >
              {invProcessing ? 'Saving…' : invDialog === 'add' ? 'Add Item' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

            {/* ── Edit Pharmacy Dialog ── */}
      <Dialog open={pharDialog === 'edit'}
        onOpenChange={o => { if (!o) { setPharDialog(null); setSelectedPhar(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Pharmacy</DialogTitle>
            <DialogDescription>{selectedPhar?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pharmacy Name</Label>
              <Input value={pharForm.name}
                onChange={e => setPharForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={pharForm.address}
                onChange={e => setPharForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={pharForm.phone}
                  onChange={e => setPharForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={pharForm.email}
                  onChange={e => setPharForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Opening Time</Label>
                <Input type="time" value={pharForm.opening_time}
                  onChange={e => setPharForm(f => ({ ...f, opening_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Closing Time</Label>
                <Input type="time" value={pharForm.closing_time}
                  onChange={e => setPharForm(f => ({ ...f, closing_time: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label className="text-sm">Accepts Medical Aid</Label>
              <input type="checkbox" checked={pharForm.accepts_medical_aid}
                onChange={e => setPharForm(f => ({ ...f, accepts_medical_aid: e.target.checked }))}
                className="h-4 w-4 accent-primary" />
            </div>
          </div>
          
          {/* Updated DialogFooter with better spacing for mobile */}
          <DialogFooter className="pt-6 gap-6 sm:gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setPharDialog(null); setSelectedPhar(null); }}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdatePharmacy} 
              disabled={pharProcessing}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
              {pharProcessing ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={invDialog === 'delete'}
        onOpenChange={o => { if (!o) { setInvDialog(null); setSelectedItem(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Item</DialogTitle>
            <DialogDescription>
              Remove <strong>{selectedItem?.medicine_name}</strong> from inventory? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => { setInvDialog(null); setSelectedItem(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteInventory} disabled={invProcessing}>
              <Trash2 className="h-4 w-4 mr-1" />
              {invProcessing ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

            {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around px-1 py-2 safe-area-pb">
        {([
          { key: 'overview',     label: 'Home',         icon: LayoutDashboard },
          { key: 'pharmacies',   label: 'Pharmacies',   icon: Store },
          { key: 'reservations', label: 'Reservations', icon: ClipboardList, badge: resCounts.pending },
          { key: 'inventory',    label: 'Inventory',    icon: FlaskConical },
          { key: 'analytics',    label: 'Analytics',    icon: BarChart3 },
        ] as { key: Tab; label: string; icon: React.ElementType; badge?: number }[]).map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => isApproved ? setActiveTab(key) : undefined}
            disabled={!isApproved}
            className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[52px]
              ${!isApproved ? 'opacity-30 cursor-not-allowed' : ''}
              ${activeTab === key && isApproved ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {badge != null && badge > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{label}</span>
            {activeTab === key && isApproved && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary" />
            )}
          </button>
        ))}
        {/* Sign out button on mobile */}
        <button
          onClick={() => { supabase.auth.signOut(); navigate('/auth'); }}
          className="relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[52px] text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">Sign Out</span>
        </button>
      </nav>
    </div>
  );
};

export default PharmacistDashboard;
