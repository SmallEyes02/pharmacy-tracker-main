import { MapPin, Clock, Phone, CheckCircle, AlertCircle } from 'lucide-react';
import { Pharmacy } from '@/types/pharmacy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PharmacyCardProps {
  pharmacy: Pharmacy;
  onClick?: () => void;
}

const PharmacyCard = ({ pharmacy, onClick }: PharmacyCardProps) => {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-card-foreground truncate">
              {pharmacy.name}
            </h3>
            {pharmacy.verified && (
              <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{pharmacy.address}</span>
          </p>
        </div>
        {pharmacy.distance !== undefined && (
          <Badge variant="secondary" className="shrink-0 font-medium">
            {pharmacy.distance} km
          </Badge>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {pharmacy.operatingHours}
        </span>
        {pharmacy.travelTime !== undefined && (
          <span className="flex items-center gap-1.5">
            🚗 ~{pharmacy.travelTime} min
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={(e) => {
            e.stopPropagation();
            window.open(`tel:${pharmacy.phone}`, '_self');
          }}
        >
          <Phone className="h-3 w-3 mr-1" /> Call
        </Button>
        {pharmacy.whatsapp && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`https://wa.me/${pharmacy.whatsapp?.replace(/[^0-9]/g, '')}`, '_blank');
            }}
          >
            💬 WhatsApp
          </Button>
        )}
        <Button size="sm" className="ml-auto text-xs">
          View Details
        </Button>
      </div>
    </div>
  );
};

export default PharmacyCard;
