import type { TrackAnalysis } from '@/audio/analysis'
export const ANALYSES = new Map<string, TrackAnalysis>()
export async function getAnalysis(id: string) { return ANALYSES.get(id) }
export async function allSongs() { return [] }
export async function songsByArtist() { return [] }
export async function putAnalysis(a: TrackAnalysis) { ANALYSES.set(a.songId, a) }
