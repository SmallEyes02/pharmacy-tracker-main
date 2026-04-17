import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Star, MessageSquare } from 'lucide-react';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  user_id: string;
  patient_name?: string;
}

interface PharmacyReviewsProps {
  pharmacyId: string;
  /** compact = just show star + count inline (for cards) */
  compact?: boolean;
}

// ── Reusable star row ─────────────────────────────────────────────────────────
export const StarRating = ({
  rating, size = 'sm',
}: { rating: number; size?: 'xs' | 'sm' | 'md' }) => {
  const dims = size === 'xs' ? 'h-3 w-3' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`${dims} ${
            s <= Math.round(rating)
              ? 'fill-warning text-warning'
              : 'text-muted-foreground/25'
          }`}
        />
      ))}
    </span>
  );
};

// ── Compact badge: ★ 4.2 (12) ─────────────────────────────────────────────────
export const RatingBadge = ({ pharmacyId }: { pharmacyId: string }) => {
  const [data, setData] = useState<{ avg_rating: number; review_count: number } | null>(null);

  useEffect(() => {
    (supabase as any)
      .from('pharmacy_ratings')
      .select('avg_rating, review_count')
      .eq('pharmacy_id', pharmacyId)
      .maybeSingle()
      .then(({ data }: any) => setData(data));
  }, [pharmacyId]);

  if (!data || data.review_count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" />
      <span className="font-semibold text-foreground">{data.avg_rating}</span>
      <span>({data.review_count})</span>
    </span>
  );
};

// ── Full reviews list ─────────────────────────────────────────────────────────
const PharmacyReviews = ({ pharmacyId }: PharmacyReviewsProps) => {
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [avgRating, setAvg]     = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [revRes, ratingRes] = await Promise.all([
        (supabase as any)
          .from('reviews')
          .select('id, rating, comment, created_at, user_id')
          .eq('pharmacy_id', pharmacyId)
          .order('created_at', { ascending: false })
          .limit(10),
        (supabase as any)
          .from('pharmacy_ratings')
          .select('avg_rating, review_count')
          .eq('pharmacy_id', pharmacyId)
          .maybeSingle(),
      ]);

      const revData = revRes.data ?? [];

      // Fetch patient names
      const userIds = [...new Set(revData.map((r: any) => r.user_id))];
      let nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: names } = await (supabase as any)
          .rpc('get_patient_names', { user_ids: userIds });
        (names ?? []).forEach((n: any) => { nameMap[n.user_id] = n.full_name ?? 'Patient'; });
      }

      setReviews(revData.map((r: any) => ({ ...r, patient_name: nameMap[r.user_id] ?? 'Patient' })));
      setAvg(ratingRes.data?.avg_rating ?? null);
      setLoading(false);
    };
    load();
  }, [pharmacyId]);

  if (loading) return (
    <div className="py-6 text-center text-sm text-muted-foreground">Loading reviews…</div>
  );

  if (reviews.length === 0) return (
    <div className="py-8 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No reviews yet. Be the first!</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      {avgRating !== null && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3">
          <span className="text-4xl font-bold text-foreground">{avgRating}</span>
          <div>
            <StarRating rating={avgRating} size="md" />
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Individual reviews */}
      <div className="space-y-3">
        {reviews.map(rev => (
          <div key={rev.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(rev.patient_name ?? 'P')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{rev.patient_name}</p>
                  <StarRating rating={rev.rating} size="xs" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground shrink-0">
                {new Date(rev.created_at).toLocaleDateString('en-BW', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
            {rev.comment && (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                &ldquo;{rev.comment}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PharmacyReviews;
