export interface ArtworkIndexEntry {
  id: string;
  artist: string;
  title: string;
  aspect: number;
}

export interface CorpusSource {
  id: string;
  title: string;
  url: string;
  license: string;
  attribution: string;
}

export interface ArtworkMeta {
  id: string;
  artist: string;
  artistDates: string;
  title: string;
  titleOriginal?: string;
  year: string;
  medium: string;
  dimensions: string;
  housedAt: {
    institution: string;
    city: string;
    room: string;
    accession: string;
    creditLine: string;
  };
  labelText: string;
  extendedNote: string;
  textProvenance: {
    type: 'museum_verbatim' | 'other_museum' | 'placard_original';
    attribution: string;
    url: string;
  };
  image: { file: string; source: string; license: string; photoCredit: string };
  corpus: {
    length: number;
    segments: Array<{ sourceId: string; offset: number; length: number }>;
    sources: CorpusSource[];
  };
  imageWidth: number;
  imageHeight: number;
}

export interface GalleryRoom {
  id: string;
  name: string;
  svgPath: string;
  centroid: [number, number];
  active: boolean;
  artworkIndex: number;
}

export interface GalleryData {
  id: string;
  name: string;
  city: string;
  wallTint: string;
  floors: Array<{ level: number; rooms: GalleryRoom[] }>;
}

export type Phase = 'boot' | 'landing' | 'corridor' | 'map' | 'warp' | 'gallery';

export interface DeviceTier {
  name: 'high' | 'mid' | 'low';
  glyphSuffix: '' | '-lo';
  rtSize: number;
  dprCap: number;
}
