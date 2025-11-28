export interface GeneratedVideo {
  id: string;
  url: string;
  prompt: string;
  createdAt: Date;
  model: string;
  videoObject?: any; // To store the internal video object for extension
  aspectRatio: string;
}

export enum AspectRatio {
  Landscape = '16:9',
  Portrait = '9:16',
}

export enum Resolution {
  Res720p = '720p',
  Res1080p = '1080p',
}

export enum VeoModel {
  Fast = 'veo-3.1-fast-generate-preview',
  Quality = 'veo-3.1-generate-preview',
}

export type GenerationStatus = 'idle' | 'generating' | 'downloading' | 'completed' | 'error';

export interface VideoConfig {
  prompt: string;
  model: VeoModel;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  imageStart?: string; // base64
  imageEnd?: string; // base64
  previousVideo?: any; // For extension
  referenceImages?: string[]; // base64 for character consistency
}