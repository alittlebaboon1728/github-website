import type { RawRepository } from "../src/api";
import type { GeneratedCard } from "../src/generatedCards";

export type PreparedProject = {
  repo: RawRepository;
  card: GeneratedCard;
  fetchedAt?: string;
  topics?: string[];
};
export function parseDiscoveryFilter(
  query: string,
): { topic: string; language: string } | null;
export function selectPreparedProjects(
  entries: PreparedProject[],
  query: string,
  sort?: string,
  page?: number,
): { total: number; items: PreparedProject[] } | null;
export function createPreparedProjectIndex(): {
  ingest(
    query: string,
    result: import("../src/api").ApiEnvelope<import("../src/api").SearchData>,
  ): void;
  search(
    query: string,
    sort?: string,
    page?: number,
  ): { total: number; items: PreparedProject[] } | null;
};
