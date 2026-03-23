import { Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MedicineSearchBarProps {
  large?: boolean;
  className?: string;
}

const MedicineSearchBar = ({ large = false, className = '' }: MedicineSearchBarProps) => {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const navigate = useNavigate();

  // Keep the input in sync if the URL query changes (e.g., clicking a link)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault(); // Prevents page reload
    const trimmedQuery = query.trim();
    
    if (trimmedQuery) {
      // Standardizes the navigation
      navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
    }
  };

  return (
    <form 
      onSubmit={handleSearch} 
      className={`flex w-full gap-2 ${className}`}
      autoComplete="off"
    >
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search for a medicine (e.g., Panadol, Amoxil)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // autoFocus helps the user start typing immediately
          autoFocus={large}
          className={`pl-10 ${
            large ? 'h-14 text-base rounded-xl' : 'h-11 rounded-lg'
          } bg-card border-border shadow-card focus:shadow-glow transition-all`}
        />
      </div>
      <Button
        type="submit"
        variant={large ? 'hero' : 'default'}
        className={large ? 'h-14 px-8 rounded-xl text-base' : 'h-11 rounded-lg'}
      >
        <Search className="h-4 w-4 mr-2" />
        Search
      </Button>
    </form>
  );
};

export default MedicineSearchBar;