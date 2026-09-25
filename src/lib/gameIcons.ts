import type { BoardEventKind, MapTheme, PowerupType, TileNodeType } from './types';
import type { RoomVibeId } from './roomVibes';

/**
 * Where the generated artwork lives.
 *
 * Every file is named after the id the code already uses, so the path is the
 * id and nothing here needs updating when a new icon lands — drop
 * `public/powerups/<PowerupType>.png` in and it renders.
 *
 * Nothing calls these directly. They feed <GameIcon>, which falls back to the
 * emoji when a file is missing, so a half-finished set degrades to what the
 * game showed before rather than to a blank hole. scripts/check-icons.py
 * reports which ids still have no art.
 */
const art = (group: string) => (id: string) => `/${group}/${id}.png`;

export const powerupArt = art('powerups') as (id: PowerupType) => string;
export const tileArt = art('tiles') as (id: TileNodeType) => string;
export const journeyArt = art('tiles/journey');
export const eventArt = art('events') as (id: BoardEventKind) => string;
export const themeArt = art('themes/icons') as (id: MapTheme) => string;
export const vibeArt = art('vibes') as (id: RoomVibeId) => string;
export const dareArt = art('dares');
export const modeArt = art('modes');
export const badgeArt = art('badges');
export const socialArt = art('social');
