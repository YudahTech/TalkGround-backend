import { BrandCategory } from '@prisma/client';

/** Static filter metadata for the explore sidebar (Yelp/Trustpilot-style facets). */
export const BRAND_FILTER_OPTIONS = {
  categories: [
    { id: 'all', label: 'All Brands', value: null },
    {
      id: 'restaurants',
      label: 'Dining',
      value: BrandCategory.RESTAURANTS,
      apiValue: 'restaurants',
    },
    {
      id: 'hotels',
      label: 'Hotels & Stay',
      value: BrandCategory.HOTELS,
      apiValue: 'hotels',
    },
  ],
  cities: [
    { id: 'lagos', label: 'Lagos', apiValue: 'lagos' },
    { id: 'abuja', label: 'Abuja', apiValue: 'abuja' },
  ],
  ratingFilters: [
    { id: 'all', label: 'All ratings', minRating: null },
    { id: '4plus', label: '4.0 & up', minRating: 4 },
    { id: '3plus', label: '3.0 & up', minRating: 3 },
  ],
  sortOptions: [
    { id: 'most_reviewed', label: 'Most Reviewed', value: 'most_reviewed' },
    { id: 'rating', label: 'Highest Rated', value: 'rating' },
    { id: 'newest', label: 'Newest', value: 'newest' },
  ],
};
