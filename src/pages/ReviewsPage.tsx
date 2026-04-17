import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, MessageSquare, Search, ChevronLeft, Loader2, Building2, X, Filter } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  pharmacy_id: string;
  pharmacy_name: string;
  patient_name: string;
  user_id: string;
}

interface PharmacyRating {
  pharmacy_id: string;
  pharmacy_name: string;
  avg_rating: number;
  review_count: number;
}

const StarRatingDisplay = ({ rating, size = 'sm' }: { rating: number; size?: 'xs' | 'sm' | 'md' | 'lg' }) => {
  const dims = size === 'xs' ? 'h-3 w-3' : size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`${dims} ${
            s <= Math.round(rating)
              ? 'fill-warning text-warning'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
};

const ReviewsPage = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pharmacyRatings, setPharmacyRatings] = useState<PharmacyRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'highest' | 'lowest'>('recent');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch all reviews with pharmacy names
      const { data: reviewsData, error: reviewsError } = await (supabase
        .from('reviews' as any)
        .select(`
          id,
          rating,
          comment,
          created_at,
          pharmacy_id,
          user_id
        `)
        .order('created_at', { ascending: false }) as any);

      if (reviewsError) {
        console.error('Error fetching reviews:', reviewsError);
        setLoading(false);
        return;
      }

      if (!reviewsData || reviewsData.length === 0) {
        setLoading(false);
        return;
      }

      // Get pharmacy names
      const pharmacyIds = [...new Set(reviewsData.map((r: any) => r.pharmacy_id))];
      const { data: pharmacies } = await (supabase
        .from('pharmacies' as any)
        .select('id, name')
        .in('id', pharmacyIds) as any);

      const pharmacyMap: Record<string, string> = {};
      (pharmacies ?? []).forEach((p: any) => { pharmacyMap[p.id] = p.name; });

      // Get patient names from profiles
      const userIds = [...new Set(reviewsData.map((r: any) => r.user_id))];
      const { data: profiles } = await (supabase
        .from('profiles' as any)
        .select('user_id, full_name')
        .in('user_id', userIds) as any);

      const profileMap: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p.full_name || 'Patient'; });

      const enrichedReviews: Review[] = reviewsData.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        pharmacy_id: r.pharmacy_id,
        pharmacy_name: pharmacyMap[r.pharmacy_id] || 'Unknown Pharmacy',
        patient_name: profileMap[r.user_id] || 'Patient',
        user_id: r.user_id,
      }));

      setReviews(enrichedReviews);

      // Build pharmacy ratings summary
      const ratingsMap: Record<string, { total: number; count: number; name: string }> = {};
      enrichedReviews.forEach(review => {
        if (!ratingsMap[review.pharmacy_id]) {
          ratingsMap[review.pharmacy_id] = {
            total: 0,
            count: 0,
            name: review.pharmacy_name,
          };
        }
        ratingsMap[review.pharmacy_id].total += review.rating;
        ratingsMap[review.pharmacy_id].count += 1;
      });

      const ratingsList: PharmacyRating[] = Object.entries(ratingsMap).map(([id, data]) => ({
        pharmacy_id: id,
        pharmacy_name: data.name,
        avg_rating: parseFloat((data.total / data.count).toFixed(1)),
        review_count: data.count,
      }));

      setPharmacyRatings(ratingsList.sort((a, b) => b.avg_rating - a.avg_rating));
      setLoading(false);
    };

    fetchData();
  }, []);

  // Filter reviews
  const filteredReviews = reviews.filter(review => {
    const matchesSearch = searchTerm === '' || 
      review.pharmacy_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (review.comment && review.comment.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPharmacy = !selectedPharmacyId || review.pharmacy_id === selectedPharmacyId;
    return matchesSearch && matchesPharmacy;
  });

  // Sort reviews
  const sortedReviews = [...filteredReviews].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else if (sortBy === 'highest') {
      return b.rating - a.rating;
    } else {
      return a.rating - b.rating;
    }
  });

  // Get selected pharmacy name
  const selectedPharmacy = pharmacyRatings.find(p => p.pharmacy_id === selectedPharmacyId);

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedPharmacyId(null);
  };

  // Active filter count
  const activeFilterCount = (searchTerm ? 1 : 0) + (selectedPharmacyId ? 1 : 0);

  // Filter sidebar content (used both for desktop and mobile)
  const FilterSidebar = () => (
    <div className="space-y-6">
      {/* Search - full width on mobile */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search reviews..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Active filters display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {selectedPharmacy && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {selectedPharmacy.pharmacy_name}
              <button onClick={() => setSelectedPharmacyId(null)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {searchTerm && (
            <Badge variant="secondary" className="gap-1 text-xs">
              "{searchTerm}"
              <button onClick={() => setSearchTerm('')} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-primary underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Pharmacy ratings list */}
      <div>
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Pharmacies by Rating
        </h3>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          <button
            onClick={() => setSelectedPharmacyId(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedPharmacyId
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>All Pharmacies</span>
              <span className="text-xs text-muted-foreground">({reviews.length} reviews)</span>
            </div>
          </button>
          {pharmacyRatings.map(pharmacy => (
            <button
              key={pharmacy.pharmacy_id}
              onClick={() => setSelectedPharmacyId(pharmacy.pharmacy_id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedPharmacyId === pharmacy.pharmacy_id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate flex-1">{pharmacy.pharmacy_name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="h-3 w-3 fill-warning text-warning" />
                  <span className="text-xs font-medium">{pharmacy.avg_rating}</span>
                  <span className="text-xs text-muted-foreground">({pharmacy.review_count})</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container px-4 sm:px-6 py-6 sm:py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
            Patient Reviews
          </h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-muted-foreground">
            See what people are saying about pharmacies
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <MessageSquare className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">No reviews yet</h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              Be the first to leave a review after picking up your medicine!
            </p>
            <Link to="/">
              <Button className="mt-6">Find Medicine</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Desktop Sidebar - hidden on mobile */}
            <div className="hidden lg:block lg:w-80 shrink-0">
              <div className="sticky top-24">
                <FilterSidebar />
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Mobile header with filter button and sort */}
              <div className="lg:hidden mb-4">
                <div className="flex items-center justify-between gap-3">
                  <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilterCount > 0 && (
                          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                            {activeFilterCount}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[300px] sm:w-[350px]">
                      <SheetHeader>
                        <SheetTitle>Filter Reviews</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6">
                        <FilterSidebar />
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Sort dropdown for mobile */}
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="recent">Most Recent</option>
                      <option value="highest">Highest Rated</option>
                      <option value="lowest">Lowest Rated</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Desktop sort controls */}
              <div className="hidden lg:flex items-center justify-between mb-6 flex-wrap gap-3">
                <p className="text-sm text-muted-foreground">
                  {sortedReviews.length} review{sortedReviews.length !== 1 ? 's' : ''}
                  {selectedPharmacy && ` for ${selectedPharmacy.pharmacy_name}`}
                  {searchTerm && ` matching "${searchTerm}"`}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={sortBy === 'recent' ? 'default' : 'outline'}
                    onClick={() => setSortBy('recent')}
                  >
                    Most Recent
                  </Button>
                  <Button
                    size="sm"
                    variant={sortBy === 'highest' ? 'default' : 'outline'}
                    onClick={() => setSortBy('highest')}
                  >
                    Highest Rated
                  </Button>
                  <Button
                    size="sm"
                    variant={sortBy === 'lowest' ? 'default' : 'outline'}
                    onClick={() => setSortBy('lowest')}
                  >
                    Lowest Rated
                  </Button>
                </div>
              </div>

              {/* Mobile results count */}
              <div className="lg:hidden mb-3">
                <p className="text-xs text-muted-foreground">
                  {sortedReviews.length} review{sortedReviews.length !== 1 ? 's' : ''}
                  {selectedPharmacy && ` · ${selectedPharmacy.pharmacy_name}`}
                </p>
              </div>

              {/* Reviews grid - responsive cards */}
              {sortedReviews.length === 0 ? (
                <div className="text-center py-12 sm:py-16">
                  <Search className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm sm:text-base text-muted-foreground">No reviews match your filters</p>
                  <Button
                    variant="ghost"
                    className="mt-3"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {sortedReviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm transition-all hover:shadow-md"
                    >
                      {/* Header row - pharmacy name and rating on mobile */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm sm:text-base text-foreground">
                              {review.pharmacy_name}
                            </h3>
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary shrink-0">
                              {review.rating} / 5
                            </Badge>
                          </div>
                          <div className="mt-1">
                            <StarRatingDisplay rating={review.rating} size="xs" />
                          </div>
                        </div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
                          {new Date(review.created_at).toLocaleDateString('en-BW', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>

                      {/* Comment */}
                      {review.comment && (
                        <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-card-foreground leading-relaxed">
                          &ldquo;{review.comment}&rdquo;
                        </p>
                      )}

                      {/* Footer - patient name */}
                      <div className="mt-2 sm:mt-3 pt-2 border-t border-border/50">
                        <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span className="font-medium text-foreground">{review.patient_name}</span>
                          <span>· Verified Patient</span>
                          {review.user_id === user?.id && (
                            <Badge variant="outline" className="text-[8px] sm:text-[9px] ml-0 sm:ml-2">Your Review</Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewsPage;