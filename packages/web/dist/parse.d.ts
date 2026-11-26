import type { ParsedProfile, ProfileHeader, TokenType } from './types.js';
export declare const HEADER_RE: RegExp;
export declare function isValidValue(type: TokenType, value: string): boolean;
export declare function parseHeader(text: string): ProfileHeader | null;
export declare function parseProfile(id: string, css: string): ParsedProfile;
