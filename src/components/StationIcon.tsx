import {
  Brain,
  Calendar,
  Car,
  CloudRain,
  Coffee,
  Dumbbell,
  Flame,
  Headphones,
  Heart,
  Leaf,
  MoonStar,
  Mountain,
  Music,
  Package,
  PartyPopper,
  RadioTower,
  Sparkle,
  Sunrise,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Stations and crates keep the SF Symbol names Kultr for iOS gives them, so
 * they look the same after travelling between the apps in a settings file;
 * the web draws the nearest icon it has for each.
 */
export const STATION_ICONS: { symbol: string; icon: LucideIcon; label: string }[] = [
  { symbol: 'dot.radiowaves.left.and.right', icon: RadioTower, label: 'Station' },
  { symbol: 'sunrise.fill', icon: Sunrise, label: 'Sunrise' },
  { symbol: 'car.fill', icon: Car, label: 'Drive' },
  { symbol: 'flame.fill', icon: Flame, label: 'Fire' },
  { symbol: 'brain.head.profile', icon: Brain, label: 'Focus' },
  { symbol: 'moon.stars.fill', icon: MoonStar, label: 'Night' },
  { symbol: 'sparkle', icon: Sparkle, label: 'Sparkle' },
  { symbol: 'heart.fill', icon: Heart, label: 'Heart' },
  { symbol: 'calendar', icon: Calendar, label: 'Calendar' },
  { symbol: 'figure.run', icon: Dumbbell, label: 'Workout' },
  { symbol: 'cup.and.saucer.fill', icon: Coffee, label: 'Coffee' },
  { symbol: 'headphones', icon: Headphones, label: 'Headphones' },
  { symbol: 'bolt.fill', icon: Zap, label: 'Energy' },
  { symbol: 'water.waves', icon: Waves, label: 'Waves' },
  { symbol: 'leaf.fill', icon: Leaf, label: 'Calm' },
  { symbol: 'party.popper.fill', icon: PartyPopper, label: 'Party' },
  { symbol: 'mountain.2.fill', icon: Mountain, label: 'Outdoors' },
  { symbol: 'cloud.rain.fill', icon: CloudRain, label: 'Rain' },
  { symbol: 'music.note', icon: Music, label: 'Music' },
  { symbol: 'shippingbox.fill', icon: Package, label: 'Crate' },
]

const BY_SYMBOL = new Map(STATION_ICONS.map((entry) => [entry.symbol, entry.icon]))

export function StationIcon({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const Icon = BY_SYMBOL.get(symbol) ?? RadioTower
  return <Icon size={size} aria-hidden="true" />
}
