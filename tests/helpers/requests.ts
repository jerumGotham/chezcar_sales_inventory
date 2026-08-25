export type RequestQueryEntry = readonly [name: string, value: string];

export type CreateRequestOptions = {
  baseUrl?: string;
  method?: string;
  query?: readonly RequestQueryEntry[];
  headers?: HeadersInit;
  body?: BodyInit | null;
};

export function createRequest(
  path: string,
  options: CreateRequestOptions = {},
): Request {
  const url = new URL(path, options.baseUrl ?? "http://localhost:3000");

  for (const [name, value] of options.query ?? []) {
    url.searchParams.append(name, value);
  }

  return new Request(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
  });
}
