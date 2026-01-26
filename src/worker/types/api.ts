/**
 * Standard API response types and helpers.
 * Provides consistent response formats across all API endpoints.
 */

/**
 * Standard paginated response structure.
 */
export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly pagination: {
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
    readonly hasMore: boolean;
  };
}

/**
 * Standard single item response structure.
 */
export interface ItemResponse<T> {
  readonly data: T;
}

/**
 * Create a paginated response with metadata.
 */
export function paginated<T>(
  items: readonly T[],
  total: number,
  limit: number,
  offset: number
): PaginatedResponse<T> {
  return {
    data: items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  };
}

/**
 * Create a single item response.
 */
export function item<T>(data: T): ItemResponse<T> {
  return { data };
}
