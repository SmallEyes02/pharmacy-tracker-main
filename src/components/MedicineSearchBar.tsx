import { Search, X, Pill } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

interface MedicineSearchBarProps {
  large?: boolean;
  className?: string;
}

interface Suggestion {
  id: string;
  name: string;
  strength: string | null;
  dosage_form: string | null;
  category: string | null;
}

// Debounce helper — avoids querying Supabase on every keystroke
const useDebounce = (value: string, delay: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const MedicineSearchBar = ({ large = false, className = '' }: MedicineSearchBarProps) => {
  const [searchParams]                = useSearchParams();
  const [query, setQuery]             = useState(searchParams.get('q') || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1); // keyboard nav
  const [fetching, setFetching]       = useState(false);
  const navigate                      = useNavigate();
  const containerRef                  = useRef<HTMLDivElement>(null);
  const inputRef                      = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 250); // 250ms delay

  // Keep input in sync with URL
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams]);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const fetchSuggestions = async () => {
      setFetching(true);
      try {
        const { data } = await (supabase as any)
          .from('medicines')
          .select('id, name, strength, dosage_form, category')
          .or(`name.ilike.%${trimmed}%,category.ilike.%${trimmed}%`)
          .order('name')
          .limit(8);

        setSuggestions(data ?? []);
        setShowDropdown((data ?? []).length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setFetching(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((suggestion: Suggestion) => {
    setQuery(suggestion.name);
    setShowDropdown(false);
    setSuggestions([]);
    // Preserve pharmacy_id / pharmacy_name params if present
    const params = new URLSearchParams(searchParams);
    params.set('q', suggestion.name);
    navigate(`/search?${params.toString()}`);
  }, [navigate, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setShowDropdown(false);
      // Preserve pharmacy_id / pharmacy_name params if present
      const params = new URLSearchParams(searchParams);
      params.set('q', trimmed);
      navigate(`/search?${params.toString()}`);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || !suggestions.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const clearQuery = () => {
    setQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative flex w-full gap-2 ${className}`}>
      <form
        onSubmit={handleSearch}
        className="flex w-full gap-2"
        autoComplete="off"
      >
        <div className="relative flex-1">
          {/* Search icon */}
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />

          <Input
            ref={inputRef}
            type="text"
            placeholder="Search for a medicine (e.g., Panado, Amoxicillin)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length >= 2) setShowDropdown(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            autoFocus={large}
            className={`pl-10 ${query ? 'pr-9' : ''} ${
              large ? 'h-14 text-base rounded-xl' : 'h-11 rounded-lg'
            } bg-card border-border shadow-card focus:shadow-glow transition-all ${
              showDropdown ? 'rounded-b-none border-b-transparent' : ''
            }`}
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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

      {/* ── Autocomplete dropdown ── */}
      {showDropdown && suggestions.length > 0 && (
        <div className={`
          absolute top-full left-0 z-50 w-[calc(100%-5rem)]
          rounded-b-xl border border-t-0 border-border bg-card shadow-elevated
          overflow-hidden
        `}>
          {/* Header */}
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Suggestions
            </p>
          </div>

          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent input blur before click fires
                  handleSelect(s);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`
                  flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                  ${i === activeIndex
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-accent'
                  }
                  ${i < suggestions.length - 1 ? 'border-b border-border/50' : ''}
                `}
              >
                {/* Icon */}
                <div className={`
                  shrink-0 flex h-8 w-8 items-center justify-center rounded-lg
                  ${i === activeIndex ? 'bg-primary/20' : 'bg-muted'}
                `}>
                  <Pill className={`h-4 w-4 ${i === activeIndex ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground leading-tight truncate">
                    {/* Highlight matching part */}
                    {s.name.split(new RegExp(`(${query.trim()})`, 'gi')).map((part, idx) =>
                      part.toLowerCase() === query.trim().toLowerCase()
                        ? <mark key={idx} className="bg-primary/20 text-primary rounded px-0.5 font-semibold not-italic">{part}</mark>
                        : part
                    )}
                    {s.strength ? ` ${s.strength}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.dosage_form ?? 'Medicine'}
                    {s.category ? ` · ${s.category}` : ''}
                  </p>
                </div>

                {/* Arrow hint */}
                <span className="shrink-0 text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                  ↵
                </span>
              </li>
            ))}
          </ul>

          {/* Footer hint */}
          <div className="px-3 py-1.5 bg-muted/30 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              ↑↓ navigate · Enter select · Esc close
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicineSearchBar;
