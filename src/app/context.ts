import { createContext, useContext } from 'react';
import type { TerritoryData, Mesh } from '../engine/territory/TerritoryData';
import type { AtlasMap } from '../engine/AtlasMap';
import type { Region } from '../data/load';

export type AtlasData = { territory: TerritoryData; regions: Region[]; land: Mesh };
export const DataContext = createContext<AtlasData | null>(null);
export const useData = () => useContext(DataContext)!;
export const MapContext = createContext<AtlasMap | null>(null);
export const useMap = () => useContext(MapContext);
export const regionById = (rs: Region[], id: string | null | undefined) => (id ? rs.find(r => r.id === id) : undefined);
