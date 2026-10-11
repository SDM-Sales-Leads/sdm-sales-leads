
/**
 * Custom fetch wrapper with timeout support
 * @param url The URL to fetch
 * @param options Fetch options
 * @param timeout Timeout in milliseconds (default 10000)
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 60000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      cache: options.cache || 'no-store',
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  }
}
