import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewBackjobClient } from "./new-backjob-client";

const query = vi.hoisted(() => ({
  data: { sales: [], locations: [], customers: [] },
  isLoading: false,
  isError: false,
  error: new Error("Unable to load options"),
  refetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query,
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  query.isLoading = false;
  query.isError = false;
});
afterEach(() => vi.unstubAllGlobals());

describe("New Backjob form", () => {
  it("renders Create draft as a submit button with the real shared Button", () => {
    const html = renderToStaticMarkup(React.createElement(NewBackjobClient, { isOwner: true }));
    const button = html.match(/<button\b[\s\S]*?<\/button>/g)?.find((markup) => markup.includes("Create draft"));
    expect(button).toBeDefined();
    expect(button).toContain('type="submit"');
  });

  it("renders a required searchable sale control and disables item selection until a sale is chosen", () => {
    const html = renderToStaticMarkup(React.createElement(NewBackjobClient, { isOwner: false }));
    expect(html).toContain('id="backjob-sale"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain("Search receipt or customer");
    expect(html).toMatch(/<fieldset id="backjob-items"[^>]*disabled=""/);
    expect(html).toContain("Select one or more purchased items from the same receipt.");
  });

  it("blocks submission while options are loading", () => {
    query.isLoading = true;
    const html = renderToStaticMarkup(React.createElement(NewBackjobClient, { isOwner: true }));
    expect(html.match(/<button\b[\s\S]*?<\/button>/g)?.find((markup) => markup.includes("Create draft"))).toContain('disabled=""');
  });

  it("shows an options failure with a non-submit retry and blocks creation", () => {
    query.isError = true;
    const html = renderToStaticMarkup(React.createElement(NewBackjobClient, { isOwner: true }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Unable to load options");
    expect(html.match(/<button\b[\s\S]*?<\/button>/g)?.find((markup) => markup.includes("Retry options"))).toContain('type="button"');
    expect(html.match(/<button\b[\s\S]*?<\/button>/g)?.find((markup) => markup.includes("Create draft"))).toContain('disabled=""');
  });
});
