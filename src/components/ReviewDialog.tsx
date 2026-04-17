import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  pharmacyId: string;
  pharmacyName: string;
  reservationId?: string;
  onSubmitted?: () => void;
}

const ReviewDialog = ({
  open, onClose, pharmacyId, pharmacyName, reservationId, onSubmitted,
}: ReviewDialogProps) => {
  const { user }                  = useAuth();
  const [rating, setRating]       = useState(0);
  const [hovered, setHovered]     = useState(0);
  const [comment, setComment]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting]   = useState<{ rating: number; comment: string | null } | null>(null);

  // Load existing review if patient already reviewed this pharmacy
  useEffect(() => {
    if (!open || !user) return;
    const load = async () => {
      const { data } = await (supabase as any)
        .from('reviews')
        .select('rating, comment')
        .eq('pharmacy_id', pharmacyId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setExisting(data);
        setRating(data.rating);
        setComment(data.comment ?? '');
      } else {
        setExisting(null);
        setRating(0);
        setComment('');
      }
    };
    load();
  }, [open, user, pharmacyId]);

  const handleSubmit = async () => {
    if (rating === 0) { toast.error('Please select a star rating'); return; }
    if (!user) { toast.error('Please sign in to leave a review'); return; }
    setSubmitting(true);

    const payload = {
      pharmacy_id:    pharmacyId,
      user_id:        user.id,
      reservation_id: reservationId ?? null,
      rating,
      comment:        comment.trim() || null,
    };

    const { error } = existing
      ? await (supabase as any)
          .from('reviews')
          .update({ rating, comment: comment.trim() || null })
          .eq('pharmacy_id', pharmacyId)
          .eq('user_id', user.id)
      : await (supabase as any)
          .from('reviews')
          .insert(payload);

    setSubmitting(false);

    if (error) {
      toast.error('Failed to submit review: ' + error.message);
    } else {
      toast.success(existing ? 'Review updated!' : 'Review submitted! Thank you.');
      onSubmitted?.();
      onClose();
    }
  };

  const starLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  const displayStar = hovered || rating;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {existing ? 'Update Your Review' : 'Rate Your Experience'}
          </DialogTitle>
          <DialogDescription>
            {existing ? 'Edit your review for' : 'How was your experience at'}{' '}
            <span className="font-semibold text-foreground">{pharmacyName}</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Star rating */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`h-9 w-9 transition-colors ${
                      star <= displayStar
                        ? 'fill-warning text-warning'
                        : 'text-muted-foreground/30'
                    }`}
                  />
                </button>
              ))}
            </div>
            {displayStar > 0 && (
              <p className="text-sm font-semibold text-foreground">
                {starLabels[displayStar]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Comment <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="Tell others about your experience — staff helpfulness, wait time, medicine availability…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Reviews are public and help other patients choose pharmacies.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || rating === 0}>
            {submitting ? 'Submitting…' : existing ? 'Update Review' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewDialog;
