import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { categoryOptions } from "@/lib/categoryConstants";

type ProductSearchFilterProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
};

export function ProductSearchFilter({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  typeFilter,
  onTypeFilterChange,
  sortBy,
  onSortChange,
}: ProductSearchFilterProps) {
  return (
    <div className="bg-card rounded-lg border p-4 mb-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök produkter..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Kategori</label>
          <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alla kategorier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              <SelectItem value="uncategorized">Ingen kategori</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Typ</label>
          <Select value={typeFilter} onValueChange={onTypeFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alla typer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla typer</SelectItem>
              <SelectItem value="user">Personliga</SelectItem>
              <SelectItem value="global">Globala</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Sortera efter</label>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger>
              <SelectValue placeholder="Välj sortering" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Namn (A-Z)</SelectItem>
              <SelectItem value="name-desc">Namn (Z-A)</SelectItem>
              <SelectItem value="category">Kategori</SelectItem>
              <SelectItem value="usage">Användning</SelectItem>
              <SelectItem value="updated">Senast uppdaterad</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
