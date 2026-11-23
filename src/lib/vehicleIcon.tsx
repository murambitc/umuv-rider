// umuv-rider/src/lib/vehicleIcon.tsx

import { Ionicons } from '@expo/vector-icons';

export type VehicleClass = 'sedan' | 'kombi' | 'bakkie' | 'luxury';

/**
 * Pick an Ionicons name that best represents the vehicle class.
 *
 * If you want more literal vehicle icons, swap this for FontAwesome5:
 *   sedan  → 'car-side'
 *   kombi  → 'shuttle-van'
 *   bakkie → 'truck-pickup'
 *   luxury → 'car-side'
 */
export function vehicleIcon(vehicleClass?: string | null): keyof typeof Ionicons.glyphMap {
  switch ((vehicleClass ?? 'sedan').toLowerCase()) {
    case 'kombi':   return 'bus';
    case 'bakkie':  return 'car';
    case 'luxury':  return 'diamond';
    case 'sedan':
    default:        return 'car-sport';
  }
}

export function vehicleClassLabel(vehicleClass?: string | null): string {
  switch ((vehicleClass ?? 'sedan').toLowerCase()) {
    case 'kombi':   return 'Kombi';
    case 'bakkie':  return 'Bakkie';
    case 'luxury':  return 'Luxury';
    case 'sedan':
    default:        return 'Sedan';
  }
}