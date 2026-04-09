/**
 * Shared department → icon mapping used by Overview and Spending tabs.
 * Every known department gets a deterministic icon; unknown departments
 * fall back to a generic Briefcase icon.
 */
import {
  GraduationCap, Shield, Wrench, TreePine, Building2, Heart, BookOpen,
  Flame, Droplets, Car, Scale, Landmark, BriefcaseMedical, Truck,
  HardHat, Lightbulb, Wifi, Home, PiggyBank, Receipt, Gavel,
  ClipboardList, Handshake, Briefcase,
} from "lucide-react";

const cls = "h-4 w-4";

const ICON_MAP: Record<string, React.ReactNode> = {
  // Original 7
  "Education":             <GraduationCap className={cls} />,
  "Public Safety":         <Shield className={cls} />,
  "Public Works":          <Wrench className={cls} />,
  "Parks & Recreation":    <TreePine className={cls} />,
  "Administration":        <Building2 className={cls} />,
  "Social Services":       <Heart className={cls} />,
  "Library":               <BookOpen className={cls} />,
  // Extended coverage
  "Fire":                  <Flame className={cls} />,
  "Fire Department":       <Flame className={cls} />,
  "Police":                <Shield className={cls} />,
  "Police Department":     <Shield className={cls} />,
  "Water":                 <Droplets className={cls} />,
  "Water Department":      <Droplets className={cls} />,
  "Sewer":                 <Droplets className={cls} />,
  "Transportation":        <Car className={cls} />,
  "Planning":              <ClipboardList className={cls} />,
  "Planning & Zoning":     <ClipboardList className={cls} />,
  "Legal":                 <Scale className={cls} />,
  "Finance":               <PiggyBank className={cls} />,
  "Treasury":              <PiggyBank className={cls} />,
  "Treasurer":             <PiggyBank className={cls} />,
  "Clerk":                 <Receipt className={cls} />,
  "Town Clerk":            <Receipt className={cls} />,
  "Health":                <BriefcaseMedical className={cls} />,
  "Health Department":     <BriefcaseMedical className={cls} />,
  "Human Resources":       <Handshake className={cls} />,
  "IT":                    <Wifi className={cls} />,
  "Information Technology": <Wifi className={cls} />,
  "Housing":               <Home className={cls} />,
  "Building":              <HardHat className={cls} />,
  "Building Department":   <HardHat className={cls} />,
  "Highways":              <Truck className={cls} />,
  "Highway Department":    <Truck className={cls} />,
  "Street Lighting":       <Lightbulb className={cls} />,
  "Government":            <Landmark className={cls} />,
  "General Government":    <Landmark className={cls} />,
  "Courts":                <Gavel className={cls} />,
};

/** Return the icon for a department name, or the Briefcase fallback. */
export function getDeptIcon(name: string): React.ReactNode {
  return ICON_MAP[name] ?? <Briefcase className={cls} />;
}
